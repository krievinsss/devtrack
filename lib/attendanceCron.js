// The scheduler resolves access without relying on a browser session.
export async function runAttendanceCron(deps, now = new Date()) {
  const [groups, users] = await Promise.all([deps.getGroups(), deps.getUsers()]);
  const teachers = [], results = [], closed = [];
  for (const candidate of users) {
    if (candidate.active === false || !["teacher", "admin"].includes(candidate.role)) continue;
    try {
      const teacher = await deps.getCoreUserWithAccess(candidate.id);
      if (!teacher || teacher.active === false || !teacher.permissionKeys?.includes("attendance.manage_sessions")) continue;
      teachers.push(teacher);
    } catch (error) {
      results.push({ teacherId: candidate.id, error: error.message });
    }
  }
  // Close all authorized scopes before opening the next lessons.
  for (const teacher of teachers) {
    try {
      closed.push(...await deps.closeExpiredAutomaticAttendance(teacher, now));
    } catch (error) {
      results.push({ teacherId: teacher.id, error: error.message });
    }
  }
  for (const teacher of teachers) {
    try {
      const classrooms = await deps.getClassrooms(teacher, { includeInactive: false });
      results.push(await deps.syncAutomaticAttendanceForTeacher(teacher, groups, classrooms, now));
    } catch (error) {
      results.push({ teacherId: teacher.id, error: error.message });
    }
  }
  const ok = !closed.some(item => item.status === "error") && !results.some(item =>
    item.error || item.skipped?.some(skip => skip.reason !== "already-created"));
  return { ok, ranAt: now.toISOString(), closed, results };
}
export function cronAuthorized(secret, authorization) {
  return Boolean(secret && authorization === `Bearer ${secret}`);
}
