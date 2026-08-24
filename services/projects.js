import { readJson, updateJson } from '@/lib/storage';
export async function getProjects(){ return readJson('projects',[]); }
export async function getProject(id){ return (await getProjects()).find(p=>p.id===id)||null; }
export async function projectsForStudent(id){ return (await getProjects()).filter(p=>p.studentId===id); }
export async function patchProject(id, patch){
  let result=null; await updateJson('projects',[],items=>items.map(p=>{ if(p.id!==id)return p; result={...p,...patch}; return result; })); return result;
}
