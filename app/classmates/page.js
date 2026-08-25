import AppShell from '@/components/AppShell';
import ClassmatesGrid from '@/components/ClassmatesGrid';
import { requirePageUser } from '@/lib/page';
import { getUsers } from '@/services/users';
import { getGamificationProfiles,SHOP_ITEMS,levelForXp } from '@/services/gamification';
import { readJson } from '@/lib/storage';

function cosmetic(id){return SHOP_ITEMS.find(x=>x.id===id)||null}
export default async function ClassmatesPage(){
  const user=await requirePageUser(['student']);
  const [users,groups,profiles]=await Promise.all([getUsers(),readJson('groups',[]),getGamificationProfiles()]);
  const groupIds=new Set(user.groupIds||[]);
  const students=users.filter(u=>u.role==='student'&&(u.groupIds||[]).some(id=>groupIds.has(id)));
  const groupNames=groups.filter(g=>groupIds.has(g.id)).map(g=>g.name);
  const classmates=students.map(s=>{
    const p=profiles.find(x=>x.studentId===s.id)||{studentId:s.id,xp:0,level:1,equipped:{},achievements:[]};
    const level=p.level||levelForXp(p.xp||0);const next=Math.pow(level,2)*180;const start=Math.pow(Math.max(0,level-1),2)*180;const pct=Math.max(0,Math.min(100,Math.round(((p.xp||0)-start)/Math.max(1,next-start)*100)));
    const frame=cosmetic(p.equipped?.avatar_frame),title=cosmetic(p.equipped?.title),slug=cosmetic(p.equipped?.slug),theme=cosmetic(p.equipped?.ui_theme);
    return {studentId:s.id,name:`${s.firstName} ${s.lastName}`,initials:`${s.firstName?.[0]||''}${s.lastName?.[0]||''}`,xp:p.xp||0,level,levelPct:pct,nextXp:Math.max(0,next-(p.xp||0)),title:title?.value||null,slug:slug?.value||null,themeName:theme?.name||null,frameClass:frame?`cosmetic-${frame.id.replaceAll('_','-')}`:'',achievementCount:(p.achievements||[]).length};
  }).sort((a,b)=>b.level-a.level||b.xp-a.xp||a.name.localeCompare(b.name,'lv'));
  return <AppShell user={user}><ClassmatesGrid groupName={groupNames.join(' · ')} classmates={classmates} currentUserId={user.id}/></AppShell>;
}
