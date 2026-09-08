import { z } from 'zod';
import { fail,ok,requireApiUser } from '@/lib/http';
import { CLASSROOM_LIMITS } from '@/lib/classroomLayout';
import { ClassroomAccessError,ClassroomConflictError,ClassroomNotFoundError,createClassroom,getClassroom,getClassrooms,getClassroomStaffOptions,saveClassroomLayout,setClassroomActive,updateClassroomDetails } from '@/services/classrooms';

const classroomId=z.string().uuid();
const staffIds=z.array(z.string().uuid()).max(100).default([]);
const createSchema=z.object({
  action:z.literal('create'),name:z.string().trim().min(2).max(120),
  canvasWidth:z.number().int().min(CLASSROOM_LIMITS.canvas.minWidth).max(CLASSROOM_LIMITS.canvas.maxWidth).default(1000),
  canvasHeight:z.number().int().min(CLASSROOM_LIMITS.canvas.minHeight).max(CLASSROOM_LIMITS.canvas.maxHeight).default(600),
  staffMembershipIds:staffIds
});
const detailsSchema=z.object({action:z.literal('updateDetails'),classroomId,name:z.string().trim().min(2).max(120),staffMembershipIds:staffIds.optional()});
const deskSchema=z.object({
  id:z.string().trim().min(1).max(80),code:z.string().trim().min(1).max(32),label:z.string().trim().max(80).default(''),
  x:z.number().int(),y:z.number().int(),width:z.number().int(),height:z.number().int()
});
const layoutSchema=z.object({
  action:z.literal('saveLayout'),classroomId,version:z.number().int().positive(),
  canvasWidth:z.number().int().min(CLASSROOM_LIMITS.canvas.minWidth).max(CLASSROOM_LIMITS.canvas.maxWidth),
  canvasHeight:z.number().int().min(CLASSROOM_LIMITS.canvas.minHeight).max(CLASSROOM_LIMITS.canvas.maxHeight),
  desks:z.array(deskSchema).max(CLASSROOM_LIMITS.maxDesks)
});
const activeSchema=z.object({action:z.literal('setActive'),classroomId,active:z.boolean()});
const actionSchema=z.discriminatedUnion('action',[createSchema,detailsSchema,layoutSchema,activeSchema]);

export async function GET(request){
  const auth=await requireApiUser(['teacher','admin'],{module:'classrooms',permission:'classrooms.view'});if(auth.error)return auth.error;
  try{
    const id=new URL(request.url).searchParams.get('id');
    if(id){const value=classroomId.parse(id),classroom=await getClassroom(auth.user,value);return ok({classroom})}
    const [classrooms,staff]=await Promise.all([getClassrooms(auth.user),getClassroomStaffOptions(auth.user)]);
    return ok({classrooms,staff});
  }catch(error){return classroomError(error)}
}

export async function POST(request){
  const auth=await requireApiUser(['teacher','admin'],{module:'classrooms',permission:'classrooms.manage'});if(auth.error)return auth.error;
  try{
    const input=actionSchema.parse(await request.json());
    if(input.action==='create')return ok({classroom:await createClassroom(auth.user,input)},{status:201});
    if(input.action==='updateDetails')return ok({classroom:await updateClassroomDetails(auth.user,input)});
    if(input.action==='saveLayout')return ok({classroom:await saveClassroomLayout(auth.user,input)});
    return ok({classroom:await setClassroomActive(auth.user,input)});
  }catch(error){return classroomError(error)}
}

function classroomError(error){
  console.error('Classroom operation failed',{name:error?.name,message:error?.message||'Unknown error'});
  if(error instanceof z.ZodError)return fail('Please check the classroom data.',400,error.issues);
  if(error instanceof ClassroomNotFoundError)return fail(error.message,404);
  if(error instanceof ClassroomAccessError)return fail(error.message,403);
  if(error instanceof ClassroomConflictError)return fail(error.message,409,{conflict:true});
  const code=errorCode(error);
  if(code==='23505')return fail('A classroom or desk with this name already exists.',409);
  if(code==='42P01'||String(error?.message||'').includes('does not exist'))return fail('Classrooms database migration has not been applied yet.',503,{migrationRequired:true});
  return fail(error?.message||'Classroom operation failed.',500);
}

function errorCode(error){return error?.code||error?.cause?.code||error?.cause?.cause?.code}
