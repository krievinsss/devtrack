import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import ClassroomEditor from '@/components/ClassroomEditor';
import { requirePageUser } from '@/lib/page';
import { ClassroomAccessError,ClassroomNotFoundError,getClassroom,getClassroomStaffOptions } from '@/services/classrooms';

export default async function ClassroomEditorPage({params}){
  const user=await requirePageUser(['teacher','admin'],'classrooms','classrooms.view'),{id}=await params;
  let classroom,staff=[];
  try{[classroom,staff]=await Promise.all([getClassroom(user,id),getClassroomStaffOptions(user)])}catch(error){if(error instanceof ClassroomNotFoundError||error instanceof ClassroomAccessError)notFound();throw error}
  return <AppShell user={user}><ClassroomEditor initialClassroom={classroom} staffOptions={staff} canAssign={user.role==='admin'||user.platformRole==='super_admin'}/></AppShell>;
}
