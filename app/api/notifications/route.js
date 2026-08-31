import { z } from 'zod';
import { requireApiUser,fail,ok } from '@/lib/http';
import { getNotifications,markNotificationRead,markAllNotificationsRead } from '@/services/notifications';

const actionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('read'),notificationId:z.string().min(1)}),
  z.object({action:z.literal('read-all')})
]);

export async function GET(){
  const auth=await requireApiUser(['student']);if(auth.error)return auth.error;
  try{const notifications=await getNotifications(auth.user.id);return ok({notifications,unread:notifications.filter(n=>!n.read).length});}
  catch(e){return fail(e.message,500)}
}

export async function POST(req){
  const auth=await requireApiUser(['student']);if(auth.error)return auth.error;
  try{const body=actionSchema.parse(await req.json());if(body.action==='read')await markNotificationRead(auth.user.id,body.notificationId);else await markAllNotificationsRead(auth.user.id);return ok({success:true});}
  catch(e){return fail(e.message,400,e?.issues)}
}
