import { z } from 'zod';
import { requireApiUser,fail,ok } from '@/lib/http';
import { buyItem,equipItem,getGamification,getTransactions,SHOP_ITEMS,ACHIEVEMENTS } from '@/services/gamification';
import { evaluateGamificationProgress } from '@/services/gamificationProgress';
import { EXTRA_AVATARS,buyExtraAvatar,equipExtraAvatar,extraAvatar } from '@/services/avatarExtras';

const equippedSchema=z.object({avatar:z.string().nullable().optional(),avatar_frame:z.string().nullable().optional(),title:z.string().nullable().optional(),slug:z.string().nullable().optional(),ui_theme:z.string().nullable().optional()}).partial();
const actionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('buy'),itemId:z.string().min(1)}),
  z.object({action:z.literal('equip'),itemId:z.string().min(1),equipped:equippedSchema.optional().default({})})
]);
const catalog=[...SHOP_ITEMS,...EXTRA_AVATARS];
export async function GET(){const auth=await requireApiUser(['student']);if(auth.error)return auth.error;try{let profile=await getGamification(auth.user.id);if(!profile.stats?.xpCanonicalV1){const repaired=await evaluateGamificationProgress(auth.user.id);profile=repaired.profile||await getGamification(auth.user.id)}const transactions=await getTransactions(auth.user.id);return ok({profile,transactions,shop:catalog,achievements:ACHIEVEMENTS});}catch(e){return fail(e.message||'Could not load gamification',500)}}
export async function POST(req){const auth=await requireApiUser(['student']);if(auth.error)return auth.error;try{const body=actionSchema.parse(await req.json());const extra=extraAvatar(body.itemId);const profile=body.action==='buy'?(extra?await buyExtraAvatar(auth.user.id,body.itemId):await buyItem(auth.user.id,body.itemId)):(extra?await equipExtraAvatar(auth.user.id,body.itemId,body.equipped):await equipItem(auth.user.id,body.itemId,body.equipped));return ok({profile});}catch(e){return fail(e.message||'Could not update gamification',400,e?.issues)}}
