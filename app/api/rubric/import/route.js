import OpenAI from 'openai';
import { z } from 'zod';
import { requireApiUser,fail,ok } from '@/lib/http';

const bodySchema=z.object({name:z.string().min(1).max(180),type:z.string().min(1).max(100),data:z.string().min(1)});
const rubricSchema={type:'object',additionalProperties:false,properties:{criteria:{type:'array',minItems:1,maxItems:40,items:{type:'object',additionalProperties:false,properties:{name:{type:'string'},max:{type:'number'},description:{type:'string'}},required:['name','max','description']}}},required:['criteria']};

export async function POST(req){
  const auth=await requireApiUser(['teacher','admin']);if(auth.error)return auth.error;
  try{
    const body=bodySchema.parse(await req.json());
    const isText=body.type==='text/plain'||body.name.toLowerCase().endsWith('.txt');
    const isImage=body.type.startsWith('image/');
    if(!isText&&!isImage)return fail('Only TXT and image rubric files are supported.',400);
    if(isText&&body.data.length>250000)return fail('TXT file is too large.',400);
    if(isImage&&body.data.length>8_000_000)return fail('Image is too large. Use an image under about 5 MB.',400);

    if(!process.env.OPENAI_API_KEY){
      if(isText)return ok({criteria:parseTextRubric(decodeText(body.data)),source:'text-fallback'});
      return fail('OPENAI_API_KEY is required for image rubric import.',503);
    }

    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const instruction='Extract the grading rubric into criteria. Preserve the original criterion wording as closely as possible. Each criterion must have a positive maximum point value. Ignore grade conversion scales, student names, totals, formulas, spreadsheet coordinates and decorative headings unless they are actual assessment criteria. If a criterion has subcriteria with explicit points, prefer those individual scorable rows. Return only the structured rubric.';
    const content=isImage
      ?[{type:'input_text',text:instruction},{type:'input_image',image_url:body.data}]
      :[{type:'input_text',text:`${instruction}\n\nRUBRIC TEXT:\n${decodeText(body.data)}`}];
    const response=await client.responses.create({model:process.env.OPENAI_MODEL||'gpt-5.6-mini',input:[{role:'user',content}],text:{format:{type:'json_schema',name:'rubric_import',strict:true,schema:rubricSchema}}});
    const parsed=JSON.parse(response.output_text);
    const criteria=clean(parsed.criteria);
    if(!criteria.length)return fail('No scorable rubric criteria were found.',422);
    return ok({criteria,source:isImage?'image-ai':'text-ai'});
  }catch(e){return fail(e.message||'Could not import rubric.',400,e?.issues)}
}

function decodeText(data){const raw=data.includes(',')?data.split(',').slice(1).join(','):data;return Buffer.from(raw,'base64').toString('utf8').slice(0,120000)}
function clean(items=[]){return items.map(x=>({name:String(x.name||'').trim(),max:Number(x.max),description:String(x.description||'').trim(),imageUrl:'',levels:[]})).filter(x=>x.name&&Number.isFinite(x.max)&&x.max>0).slice(0,40)}
function parseTextRubric(text){const rows=[];for(const line of text.split(/\r?\n/)){const s=line.trim();if(!s)continue;let m=s.match(/^(.+?)(?:\s*[-–—:|]\s*|\s+)(\d+(?:[.,]\d+)?)\s*(?:p(?:\.|unkti?)?|points?)?\s*$/i);if(!m)m=s.match(/^(.+?)\s*\((\d+(?:[.,]\d+)?)\s*(?:p|points?)?\)\s*$/i);if(m)rows.push({name:m[1].trim(),max:Number(m[2].replace(',','.')),description:'',imageUrl:'',levels:[]})}return clean(rows)}
