import AppShell from '@/components/AppShell';
import ClassmatesGrid from '@/components/ClassmatesGrid';
import { requirePageUser } from '@/lib/page';
import { getUsers } from '@/services/users';
import { getProjects } from '@/services/projects';
import { getGamificationProfiles,SHOP_ITEMS,ACHIEVEMENTS,levelForXp } from '@/services/gamification';
import { EXTRA_AVATARS } from '@/services/avatarExtras';
import { readJson } from '@/lib/storage';

const CATALOG=[...SHOP_ITEMS,...EXTRA_AVATARS];
function cosmetic(id){return CATALOG.find(x=>x.id===id)||null}
export default async function ClassmatesPage(){
  const user=await requirePageUser(['student']);
  const [users,groups,profiles,projects]=await Promise.all([getUsers(),readJson('groups',[]),getGamificationProfiles(),getProjects()]);
  const groupIds=new Set(user.groupIds||[]);
  const students=users.filter(u=>u.role==='student'&&(u.groupIds||[]).some(id=>groupIds.has(id)));
  const groupNames=groups.filter(g=>groupIds.has(g.id)).map(g=>g.name);
  const classmates=students.map(s=>{
    const p=profiles.find(x=>x.studentId===s.id)||{studentId:s.id,xp:0,level:1,equipped:{},inventory:[],achievements:[]};
    const level=p.level||levelForXp(p.xp||0);const next=Math.pow(level,2)*180;const start=Math.pow(Math.max(0,level-1),2)*180;const pct=Math.max(0,Math.min(100,Math.round(((p.xp||0)-start)/Math.max(1,next-start)*100)));
    const avatar=cosmetic(p.equipped?.avatar),frame=cosmetic(p.equipped?.avatar_frame),title=cosmetic(p.equipped?.title),slug=cosmetic(p.equipped?.slug),theme=cosmetic(p.equipped?.ui_theme);
    const inventory=(p.inventory||[]).map(cosmetic).filter(Boolean).map(i=>({id:i.id,name:i.name,type:i.type,rarity:i.rarity}));
    const achievements=(p.achievements||[]).map(id=>({id,name:ACHIEVEMENTS[id]?.name||id,description:ACHIEVEMENTS[id]?.description||'',rarity:ACHIEVEMENTS[id]?.rarity||'common'}));
    const studentProjects=projects.filter(pr=>pr.studentId===s.id).map(pr=>({id:pr.id,name:pr.name,status:pr.status,progress:pr.progress||0,repo:pr.githubRepo?`${pr.githubOwner}/${pr.githubRepo}`:null}));
    return {studentId:s.id,name:`${s.firstName} ${s.lastName}`,initials:`${s.firstName?.[0]||''}${s.lastName?.[0]||''}`,avatarId:avatar?.id||null,xp:p.xp||0,level,levelPct:pct,nextXp:Math.max(0,next-(p.xp||0)),title:title?.value||null,slug:slug?.value||null,themeName:theme?.name||null,frameClass:frame?`cosmetic-${frame.id.replaceAll('_','-')}`:'',achievementCount:achievements.length,achievements,inventory,projects:studentProjects};
  }).sort((a,b)=>b.level-a.level||b.xp-a.xp||a.name.localeCompare(b.name,'lv'));
  return <AppShell user={user}><ClassmatesGrid groupName={groupNames.join(' · ')} classmates={classmates} currentUserId={user.id}/></AppShell>;
}
