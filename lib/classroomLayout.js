export const CLASSROOM_LIMITS={
  canvas:{minWidth:400,maxWidth:3000,minHeight:300,maxHeight:2000},
  desk:{minWidth:60,maxWidth:360,minHeight:40,maxHeight:260},
  maxDesks:200,
  grid:20
};

export function classroomSlug(value){
  const normalized=String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return normalized.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)||'classroom';
}

export function nextDeskCode(desks=[]){
  const used=new Set(desks.map(desk=>String(desk.code||'').trim().toLowerCase()));
  let number=1;
  while(used.has(`d${number}`))number+=1;
  return `D${number}`;
}

export function naturalDeskCompare(a,b){
  return String(a?.code||'').localeCompare(String(b?.code||''),undefined,{numeric:true,sensitivity:'base'});
}

export function snapToGrid(value,grid=CLASSROOM_LIMITS.grid){return Math.round(Number(value||0)/grid)*grid}

export function clampDeskToCanvas(desk,canvas){
  const width=clampInteger(desk.width,CLASSROOM_LIMITS.desk.minWidth,Math.min(CLASSROOM_LIMITS.desk.maxWidth,canvas.width));
  const height=clampInteger(desk.height,CLASSROOM_LIMITS.desk.minHeight,Math.min(CLASSROOM_LIMITS.desk.maxHeight,canvas.height));
  return {...desk,width,height,x:clampInteger(desk.x,0,Math.max(0,canvas.width-width)),y:clampInteger(desk.y,0,Math.max(0,canvas.height-height))};
}

export function findOpenDeskPosition(desks,canvas,{width=120,height=80}={}){
  const gap=CLASSROOM_LIMITS.grid,startY=60;
  for(let y=startY;y<=canvas.height-height;y+=gap){
    for(let x=gap;x<=canvas.width-width;x+=gap){
      const candidate={x,y,width,height};
      if(!desks.some(desk=>overlaps(candidate,desk,gap/2)))return{x,y};
    }
  }
  return{x:gap,y:Math.max(0,canvas.height-height-gap)};
}

export function validateClassroomLayout({canvasWidth,canvasHeight,desks}){
  const errors=[],limits=CLASSROOM_LIMITS,canvas={width:Number(canvasWidth),height:Number(canvasHeight)};
  if(!Number.isInteger(canvas.width)||canvas.width<limits.canvas.minWidth||canvas.width>limits.canvas.maxWidth)errors.push(`Canvas width must be between ${limits.canvas.minWidth} and ${limits.canvas.maxWidth}.`);
  if(!Number.isInteger(canvas.height)||canvas.height<limits.canvas.minHeight||canvas.height>limits.canvas.maxHeight)errors.push(`Canvas height must be between ${limits.canvas.minHeight} and ${limits.canvas.maxHeight}.`);
  if(!Array.isArray(desks))return{ok:false,errors:[...errors,'Desks must be an array.']};
  if(desks.length>limits.maxDesks)errors.push(`A classroom can contain at most ${limits.maxDesks} desks.`);
  const ids=new Set(),codes=new Set();
  desks.forEach((desk,index)=>{
    const prefix=`Desk ${index+1}`;
    if(!desk?.id||ids.has(desk.id))errors.push(`${prefix} has an invalid or duplicate id.`);else ids.add(desk.id);
    const code=String(desk?.code||'').trim(),codeKey=code.toLowerCase();
    if(!code||code.length>32)errors.push(`${prefix} code is required and may contain up to 32 characters.`);
    else if(codes.has(codeKey))errors.push(`${prefix} code is duplicated.`);else codes.add(codeKey);
    if(String(desk?.label||'').trim().length>80)errors.push(`${prefix} label may contain up to 80 characters.`);
    for(const key of ['x','y','width','height'])if(!Number.isInteger(Number(desk?.[key])))errors.push(`${prefix} ${key} must be a whole number.`);
    const x=Number(desk?.x),y=Number(desk?.y),width=Number(desk?.width),height=Number(desk?.height);
    if(width<limits.desk.minWidth||width>limits.desk.maxWidth||height<limits.desk.minHeight||height>limits.desk.maxHeight)errors.push(`${prefix} has an unsupported size.`);
    if(x<0||y<0||x+width>canvas.width||y+height>canvas.height)errors.push(`${prefix} is outside the classroom canvas.`);
  });
  return{ok:errors.length===0,errors};
}

function overlaps(a,b,padding=0){return a.x<b.x+b.width+padding&&a.x+a.width+padding>b.x&&a.y<b.y+b.height+padding&&a.y+a.height+padding>b.y}
function clampInteger(value,min,max){return Math.max(min,Math.min(max,Math.round(Number(value)||0)))}
