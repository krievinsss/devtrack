import { getCoreGroups } from '@/services/coreDirectory';

export async function getGroups(){return getCoreGroups()}
export async function getGroup(id){return (await getGroups()).find(group=>group.id===id)||null}
