import { z } from 'zod';
import { requireApiUser,fail,ok } from '@/lib/http';
import { buyItem,equipItem,getGamification,getTransactions,SHOP_ITEMS } from '@/services/gamification';

const actionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('buy'),itemId:z.string().min(1)}),
  z.object({action:z.literal('equip'),itemId:z.string().min(1)})
]);

export async function GET(){const auth=await requireApiUser(['student']);if(auth.error)return auth.error;try{const [profile,transactions]=await Promise.all([getGamification(auth.user.id),getTransactions(auth.user.id)]);return ok({profile,transactions,shop:SHOP_ITEMS});}catch(e){return fail(e.message||'Could not load gamification',500)}}
export async function POST(req){const auth=await requireApiUser(['student']);if(auth.error)return auth.error;try{const body=actionSchema.parse(await req.json());const profile=body.action==='buy'?await buyItem(auth.user.id,body.itemId):await equipItem(auth.user.id,body.itemId);return ok({profile});}catch(e){return fail(e.message||'Could not update gamification',400,e?.issues)}}
