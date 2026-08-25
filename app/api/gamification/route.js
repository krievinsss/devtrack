import { z } from 'zod';
import { requireApiUser,fail,ok } from '@/lib/http';
import { buyItem,equipItem,getGamification,getTransactions,SHOP_ITEMS,ACHIEVEMENTS } from '@/services/gamification';

const equippedSchema=z.object({avatar:z.string().nullable().optional(),avatar_frame:z.string().nullable().optional(),title:z.string().nullable().optional(),slug:z.string().nullable().optional(),ui_theme:z.string().nullable().optional()}).partial();
const actionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('buy'),itemId:z.string().min(1)}),
  z.object({action:z.literal('equip'),itemId:z.string().min(1),equipped:equippedSchema.optional().default({})})
]);

export async function GET(){const auth=await requireApiUser(['student']);if(auth.error)return auth.error;try{const [profile,transactions]=await Promise.all([getGamification(auth.user.id),getTransactions(auth.user.id)]);return ok({profile,transactions,shop:SHOP_ITEMS,achievements:ACHIEVEMENTS});}catch(e){return fail(e.message||'Could not load gamification',500)}}
export async function POST(req){const auth=await requireApiUser(['student']);if(auth.error)return auth.error;try{const body=actionSchema.parse(await req.json());const profile=body.action==='buy'?await buyItem(auth.user.id,body.itemId):await equipItem(auth.user.id,body.itemId,body.equipped);return ok({profile});}catch(e){return fail(e.message||'Could not update gamification',400,e?.issues)}}
