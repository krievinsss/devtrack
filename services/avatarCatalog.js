import crypto from 'node:crypto';
import { readJson, updateJson, readLatestVersionedJson, writeVersionedJson } from '@/lib/storage';

export const EXTRA_AVATAR_ITEMS=[
  {id:'avatar_crashout',type:'avatar',name:'Crashout',description:'When it works, it works.',price:700,rarity:'epic',preview:'avatar-crashout',minLevel:4,value:'CR'},
  {id:'avatar_goated',type:'avatar',name:'GOATed',description:'Certified classroom carry.',price:1250,rarity:'legendary',preview:'avatar-goated',minLevel:7,value:'GOAT'},
  {id:'avatar_unc',type:'avatar',name:'Unc',description:'Ancient framework knowledge.',price:800,rarity:'epic',preview:'avatar-unc',minLevel:5,value:'UNC'},
  {id:'avatar_aura',type:'avatar',name:'Aura Farmer',description:'Every passing test adds aura.',price:1050,rarity:'legendary',preview:'avatar-aura',minLevel:6,value:'AURA'},
  {id:'avatar_matrix',type:'avatar',name:'Matrix Dev',description:'See the code behind the code.',price:1450,rarity:'legendary',preview:'avatar-matrix',minLevel:8,value:'MX'},
  {id:'avatar_void',type:'avatar',name:'Void King',description:'Beyond the repository.',price:2200,rarity:'mythic',preview:'avatar-void',minLevel:12,value:'VOID'}
];

function emptyProfile(studentId){return {studentId,credits:0,xp:0,level:1,inventory:[],equipped:{avatar:null,avatar_frame:null,title:null,slug:null,ui_theme:null},rewards:{},claimedLevels:[1],achievements:[],updatedAt:new Date().toISOString()}}
export function isExtraAvatar(id){return EXTRA_AVATAR_ITEMS.some(i=>i.id===id)}
export function extraAvatar(id){return EXTRA_AVATAR_ITEMS.find(i=>i.id===id)||null}

export async function buyExtraAvatar(studentId,itemId){
  const item=extraAvatar(itemId);if(!item)throw new Error('Avatar not found');let purchased=null;
  await updateJson('gamificationProfiles',[],profiles=>{const current=profiles.find(x=>x.studentId===studentId)||emptyProfile(studentId);if((current.inventory||[]).includes(itemId))throw new Error('Item already owned');if(Number(current.level||1)<item.minLevel)throw new Error(`Unlocks at level ${item.minLevel}`);if(Number(current.credits||0)<item.price)throw new Error('Not enough DevCredits');purchased={...current,credits:Number(current.credits||0)-item.price,inventory:[...(current.inventory||[]),itemId],stats:{...(current.stats||{}),spent:Number(current.stats?.spent||0)+item.price},updatedAt:new Date().toISOString()};return [purchased,...profiles.filter(x=>x.studentId!==studentId)]});
  await updateJson('gamificationTransactions',[],items=>[{id:`tx_${crypto.randomUUID()}`,studentId,type:'purchase',itemId,credits:-item.price,xp:0,label:`Purchased ${item.name}`,createdAt:new Date().toISOString()},...items]);return purchased;
}

export async function equipExtraAvatar(studentId,itemId,clientEquipped={}){
  const item=extraAvatar(itemId);if(!item)throw new Error('Avatar not found');const profiles=await readJson('gamificationProfiles',[]);const base=profiles.find(x=>x.studentId===studentId)||emptyProfile(studentId);if(!(base.inventory||[]).includes(itemId))throw new Error('You do not own this item');const saved=await readLatestVersionedJson('equipped',studentId,null);const equipped={avatar:null,avatar_frame:null,title:null,slug:null,ui_theme:null,...(base.equipped||{}),...(saved?.equipped||{}),...(clientEquipped||{}),avatar:itemId};const snapshot={studentId,equipped,updatedAt:new Date().toISOString()};await writeVersionedJson('equipped',studentId,snapshot);return {...base,equipped,updatedAt:snapshot.updatedAt};
}
