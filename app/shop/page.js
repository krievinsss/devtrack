import AppShell from '@/components/AppShell';
import GamificationShop from '@/components/GamificationShop';
import { requirePageUser } from '@/lib/page';
import { ACHIEVEMENTS,getGamification,getTransactions,SHOP_ITEMS,levelCreditReward } from '@/services/gamification';

export default async function ShopPage(){const user=await requirePageUser(['student']);const [profile,transactions]=await Promise.all([getGamification(user.id),getTransactions(user.id)]);const start=Math.max(2,profile.level-2),end=Math.max(12,profile.level+8);const levelRewards=Array.from({length:end-start+1},(_,i)=>{const level=start+i;return {level,credits:levelCreditReward(level)}});return <AppShell user={user}><GamificationShop user={user} initialProfile={profile} initialTransactions={transactions} shop={SHOP_ITEMS} achievements={ACHIEVEMENTS} levelRewards={levelRewards}/></AppShell>}
