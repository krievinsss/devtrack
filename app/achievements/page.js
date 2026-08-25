import AppShell from '@/components/AppShell';
import AchievementsGrid from '@/components/AchievementsGrid';
import { requirePageUser } from '@/lib/page';
import { ACHIEVEMENTS,getGamification } from '@/services/gamification';
export default async function AchievementsPage(){const user=await requirePageUser(['student']);const profile=await getGamification(user.id);const achievements=Object.entries(ACHIEVEMENTS).map(([id,a])=>({id,...a}));return <AppShell user={user}><AchievementsGrid achievements={achievements} unlocked={profile.achievements||[]}/></AppShell>}
