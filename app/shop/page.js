import AppShell from '@/components/AppShell';
import GamificationShop from '@/components/GamificationShop';
import { requirePageUser } from '@/lib/page';
import { ACHIEVEMENTS,getGamification,getTransactions,SHOP_ITEMS } from '@/services/gamification';

export default async function ShopPage(){const user=await requirePageUser(['student']);const [profile,transactions]=await Promise.all([getGamification(user.id),getTransactions(user.id)]);return <AppShell user={user}><GamificationShop user={user} initialProfile={profile} initialTransactions={transactions} shop={SHOP_ITEMS} achievements={ACHIEVEMENTS}/></AppShell>}
