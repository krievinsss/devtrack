import { z } from 'zod';
import { after } from 'next/server';
import { fail,ok,requireApiUser } from '@/lib/http';
import { acceptStackDevReply,addStackDevReply,createStackDevQuestion,getStackDevQuestions,setStackDevQuestionStatus } from '@/services/stackdev';
import { evaluateGamificationProgress } from '@/services/gamificationProgress';

const codeFields={body:z.string().max(6000).optional().default(''),code:z.string().max(12000).optional().default(''),language:z.string().max(30).optional().default('text')};
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create_question'),title:z.string().min(8).max(140),body:z.string().min(20).max(6000),code:z.string().max(12000).optional().default(''),language:z.string().max(30).optional().default('text'),tags:z.array(z.string().max(24)).max(5).optional().default([])}),
  z.object({action:z.literal('add_reply'),questionId:z.string().min(1),...codeFields}),
  z.object({action:z.literal('accept_reply'),questionId:z.string().min(1),replyId:z.string().min(1)}),
  z.object({action:z.literal('set_status'),questionId:z.string().min(1),status:z.enum(['open','closed'])})
]);

export async function GET(){
  const auth=await requireApiUser(['student','teacher','admin']);if(auth.error)return auth.error;
  try{return ok({questions:await getStackDevQuestions()})}catch(error){return fail(error.message||'Could not load StackDev',500)}
}

export async function POST(request){
  const auth=await requireApiUser(['student','teacher','admin']);if(auth.error)return auth.error;
  try{
    const body=schema.parse(await request.json());let result;
    if(body.action==='create_question')result=await createStackDevQuestion(auth.user,body);
    if(body.action==='add_reply')result=await addStackDevReply(auth.user,body.questionId,body);
    if(body.action==='accept_reply'){result=await acceptStackDevReply(auth.user,body.questionId,body.replyId);if(result.reward?.studentId)after(()=>evaluateGamificationProgress(result.reward.studentId))}
    if(body.action==='set_status')result=await setStackDevQuestionStatus(auth.user,body.questionId,body.status);
    return ok({result});
  }catch(error){return fail(error.message||'StackDev action failed',400,error?.issues)}
}
