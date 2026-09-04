import 'server-only';
import crypto from 'node:crypto';
import { appendVersionedEvent,readVersionedEvents,updateJson } from '@/lib/storage';
import { getGamification,levelCreditReward,levelForXp } from '@/services/gamification';

const STACKDEV_EVENT_KEY='board';
export const STACKDEV_SOLUTION_XP=25;
export const STACKDEV_SOLUTION_CREDITS=10;

function cleanText(value,max){return String(value||'').trim().slice(0,max)}
function cleanTags(tags=[]){return [...new Set(tags.map(tag=>cleanText(tag,24).toLowerCase()).filter(Boolean))].slice(0,5)}

function reduceStackDev(events){
  const questions=new Map();
  for(const event of events){
    if(event.type==='question_created'&&event.question)questions.set(event.question.id,{...event.question,replies:[...(event.question.replies||[])]});
    if(event.type==='reply_created'&&event.reply&&questions.has(event.questionId)){
      const question=questions.get(event.questionId),replies=[...(question.replies||[])];
      if(!replies.some(reply=>reply.id===event.reply.id))replies.push(event.reply);
      questions.set(event.questionId,{...question,replies,updatedAt:event.eventAt||event.reply.createdAt});
    }
    if(event.type==='reply_accepted'&&questions.has(event.questionId)){
      const question=questions.get(event.questionId);
      questions.set(event.questionId,{...question,status:'solved',acceptedReplyId:event.replyId,acceptedAt:event.eventAt,acceptedBy:event.actorId,replies:(question.replies||[]).map(reply=>reply.id===event.replyId?{...reply,accepted:true,acceptedAt:event.eventAt}:reply),updatedAt:event.eventAt});
    }
    if(event.type==='status_changed'&&questions.has(event.questionId)){
      const question=questions.get(event.questionId),reopening=event.status==='open';
      questions.set(event.questionId,{...question,status:event.status,...(reopening?{acceptedReplyId:null,acceptedAt:null,acceptedBy:null,replies:(question.replies||[]).map(reply=>({...reply,accepted:false,acceptedAt:null}))}:{}),updatedAt:event.eventAt});
    }
  }
  return [...questions.values()].sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
}

export async function getStackDevQuestions(){return reduceStackDev(await readVersionedEvents('stackdev',STACKDEV_EVENT_KEY))}

export async function createStackDevQuestion(actor,input){
  if(actor.role!=='student')throw new Error('Only students can create StackDev questions');
  const title=cleanText(input.title,140),body=cleanText(input.body,6000),code=cleanText(input.code,12000);
  if(title.length<8)throw new Error('Question title must be at least 8 characters');
  if(body.length<20)throw new Error('Describe the problem in at least 20 characters');
  const createdAt=new Date().toISOString(),question={id:`stack_${crypto.randomUUID()}`,authorId:actor.id,authorName:`${actor.firstName} ${actor.lastName}`,title,body,code,language:cleanText(input.language,30)||'text',tags:cleanTags(input.tags),status:'open',acceptedReplyId:null,replies:[],createdAt,updatedAt:createdAt};
  await appendVersionedEvent('stackdev',STACKDEV_EVENT_KEY,{type:'question_created',question,actorId:actor.id});
  return question;
}

export async function addStackDevReply(actor,questionId,input){
  const question=(await getStackDevQuestions()).find(item=>item.id===questionId);
  if(!question)throw new Error('StackDev question not found');
  if(question.status!=='open')throw new Error('This question is no longer open for replies');
  const body=cleanText(input.body,6000),code=cleanText(input.code,12000);
  if(body.length<2&&!code)throw new Error('Write a reply or add a code example');
  const createdAt=new Date().toISOString(),reply={id:`reply_${crypto.randomUUID()}`,authorId:actor.id,authorName:`${actor.firstName} ${actor.lastName}`,authorRole:actor.role,body,code,language:cleanText(input.language,30)||'text',accepted:false,createdAt,updatedAt:createdAt};
  await appendVersionedEvent('stackdev',STACKDEV_EVENT_KEY,{type:'reply_created',questionId,reply,actorId:actor.id});
  return {...question,replies:[...(question.replies||[]),reply],updatedAt:createdAt};
}

async function rewardAcceptedSolution(question,reply){
  if(reply.authorRole!=='student'||reply.authorId===question.authorId)return null;
  const sourceKey=`stackdev:${question.id}`,base=await getGamification(reply.authorId);let rewarded=false,newLevels=[],levelBonus=0;
  await updateJson('gamificationProfiles',[],profiles=>{
    const current=profiles.find(item=>item.studentId===reply.authorId)||base;
    if(current.rewards?.[sourceKey])return profiles;
    const nextXp=Number(current.xp||0)+STACKDEV_SOLUTION_XP,nextLevel=levelForXp(nextXp),claimed=new Set(current.claimedLevels||[1]);
    for(let level=2;level<=nextLevel;level++)if(!claimed.has(level)){claimed.add(level);newLevels.push(level)}
    levelBonus=newLevels.reduce((sum,level)=>sum+levelCreditReward(level),0);rewarded=true;
    const saved={...current,credits:Number(current.credits||0)+STACKDEV_SOLUTION_CREDITS+levelBonus,xp:nextXp,level:nextLevel,claimedLevels:[...claimed].sort((a,b)=>a-b),rewards:{...(current.rewards||{}),[sourceKey]:{credits:STACKDEV_SOLUTION_CREDITS,xp:STACKDEV_SOLUTION_XP,questionId:question.id,replyId:reply.id,awardedAt:new Date().toISOString()}},stats:{...(current.stats||{}),stackDevSolutions:Number(current.stats?.stackDevSolutions||0)+1},updatedAt:new Date().toISOString()};
    return[saved,...profiles.filter(item=>item.studentId!==reply.authorId)];
  });
  if(rewarded){
    const transactions=[{id:`stackdev_reward_${question.id}`,studentId:reply.authorId,type:'stackdev_solution',sourceKey,questionId:question.id,replyId:reply.id,credits:STACKDEV_SOLUTION_CREDITS,xp:STACKDEV_SOLUTION_XP,label:'StackDev accepted solution',createdAt:new Date().toISOString()}];
    if(newLevels.length)transactions.push({id:`stackdev_levels_${question.id}`,studentId:reply.authorId,type:'level_reward',sourceKey,levels:newLevels,credits:levelBonus,xp:0,label:newLevels.length===1?`Level ${newLevels[0]} unlock reward`:`Level ${newLevels[0]}–${newLevels[newLevels.length-1]} unlock rewards`,createdAt:new Date().toISOString()});
    await updateJson('gamificationTransactions',[],items=>[...transactions,...items.filter(item=>!transactions.some(tx=>tx.id===item.id))]);
  }
  return rewarded?{studentId:reply.authorId,credits:STACKDEV_SOLUTION_CREDITS,xp:STACKDEV_SOLUTION_XP,levelBonus}:null;
}

export async function acceptStackDevReply(actor,questionId,replyId){
  const question=(await getStackDevQuestions()).find(item=>item.id===questionId);
  if(!question)throw new Error('StackDev question not found');
  if(question.status!=='open')throw new Error('This question is no longer open');
  if(actor.id!==question.authorId&&!['teacher','admin'].includes(actor.role))throw new Error('Only the question author or a teacher can accept a solution');
  const reply=(question.replies||[]).find(item=>item.id===replyId);if(!reply)throw new Error('Reply not found');
  await appendVersionedEvent('stackdev',STACKDEV_EVENT_KEY,{type:'reply_accepted',questionId,replyId,actorId:actor.id});
  const reward=await rewardAcceptedSolution(question,reply);
  return {question:{...question,status:'solved',acceptedReplyId:replyId,acceptedAt:new Date().toISOString(),acceptedBy:actor.id,replies:(question.replies||[]).map(item=>item.id===replyId?{...item,accepted:true}:item)},reward};
}

export async function setStackDevQuestionStatus(actor,questionId,status){
  const question=(await getStackDevQuestions()).find(item=>item.id===questionId);
  if(!question)throw new Error('StackDev question not found');
  if(actor.id!==question.authorId&&!['teacher','admin'].includes(actor.role))throw new Error('Only the question author or a teacher can change its status');
  if(!['open','closed'].includes(status))throw new Error('Invalid StackDev status');
  if(question.status==='solved')throw new Error('An accepted solution cannot be reopened');
  await appendVersionedEvent('stackdev',STACKDEV_EVENT_KEY,{type:'status_changed',questionId,status,actorId:actor.id});
  return {...question,status,...(status==='open'?{acceptedReplyId:null,acceptedAt:null,acceptedBy:null,replies:(question.replies||[]).map(reply=>({...reply,accepted:false,acceptedAt:null}))}:{})};
}
