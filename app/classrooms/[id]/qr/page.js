import { notFound } from 'next/navigation';
import QrPrintSheet from '@/components/QrPrintSheet';
import { requirePageUser } from '@/lib/page';
import { ClassroomAccessError,ClassroomNotFoundError,getClassroom } from '@/services/classrooms';

export default async function ClassroomQrPage({params}){
  const user=await requirePageUser(['teacher','admin'],'classrooms','classrooms.manage'),{id}=await params;
  let classroom;
  try{classroom=await getClassroom(user,id)}catch(error){if(error instanceof ClassroomNotFoundError||error instanceof ClassroomAccessError)notFound();throw error}
  if(!classroom.canManage)notFound();
  return <QrPrintSheet classroom={classroom}/>;
}
