export function accessibleProgressGroups(user, groups) {
  if (!user || !["teacher", "admin"].includes(user.role) && user.platformRole !== "super_admin")
    return [];
  if (user.role === "admin" || user.platformRole === "super_admin")
    return groups;
  const allowedGroupIds = new Set(user.groupIds || []);
  return groups.filter((group) => allowedGroupIds.has(group.id));
}

export function progressStudentNavigation(studentIds, studentId) {
  const index = studentIds.indexOf(studentId);
  if (index < 0) return { previousStudentId: null, nextStudentId: null };
  return {
    previousStudentId: studentIds[index - 1] || null,
    nextStudentId: studentIds[index + 1] || null,
  };
}