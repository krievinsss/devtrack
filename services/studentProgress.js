import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { database } from "@/db/client";
import { defaultSchoolId } from "@/db/directory";
import {
  groupMemberships,
  groups,
  schoolMemberships,
  users,
} from "@/db/schema";
import {
  accessibleProgressGroups,
  progressStudentNavigation,
} from "@/lib/studentProgress";

export class StudentProgressNotFoundError extends Error {
  constructor() {
    super("Student or group not found");
    this.name = "StudentProgressNotFoundError";
  }
}

export async function getStudentProgressSelection(
  user,
  { groupId = null, studentId = null } = {},
) {
  if (
    !user ||
    (!['teacher', 'admin'].includes(user.role) &&
      user.platformRole !== "super_admin")
  )
    throw new StudentProgressNotFoundError();

  const db = database(),
    schoolId = user.schoolId || defaultSchoolId(),
    groupRows = await db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(and(eq(groups.schoolId, schoolId), eq(groups.active, true)))
      .orderBy(asc(groups.name)),
    availableGroups = accessibleProgressGroups(user, groupRows);

  if (!availableGroups.length)
    return {
      groups: [],
      group: null,
      students: [],
      student: null,
      previousStudentId: null,
      nextStudentId: null,
    };

  let selectedGroupId = groupId;
  if (selectedGroupId) {
    if (!availableGroups.some((group) => group.id === selectedGroupId))
      throw new StudentProgressNotFoundError();
  } else if (studentId) {
    const allowedGroupIds = availableGroups.map((group) => group.id),
      memberships = await db
        .select({ groupId: groupMemberships.groupId })
        .from(groupMemberships)
        .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
        .innerJoin(
          schoolMemberships,
          eq(schoolMemberships.id, groupMemberships.membershipId),
        )
        .innerJoin(users, eq(users.id, schoolMemberships.userId))
        .where(
          and(
            inArray(groupMemberships.groupId, allowedGroupIds),
            eq(groupMemberships.relation, "student"),
            eq(schoolMemberships.schoolId, schoolId),
            eq(schoolMemberships.status, "active"),
            eq(users.id, studentId),
            eq(users.active, true),
          ),
        )
        .limit(1);
    selectedGroupId = memberships[0]?.groupId;
    if (!selectedGroupId) throw new StudentProgressNotFoundError();
  } else {
    selectedGroupId = availableGroups[0].id;
  }

  const group = availableGroups.find((item) => item.id === selectedGroupId);
  const students = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(groupMemberships)
    .innerJoin(
      schoolMemberships,
      eq(schoolMemberships.id, groupMemberships.membershipId),
    )
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(
      and(
        eq(groupMemberships.groupId, selectedGroupId),
        eq(groupMemberships.relation, "student"),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.status, "active"),
        eq(users.active, true),
      ),
    )
    .orderBy(asc(users.lastName), asc(users.firstName));

  if (studentId && !students.some((student) => student.id === studentId))
    throw new StudentProgressNotFoundError();

  const selectedStudent =
      students.find((student) => student.id === studentId) || students[0] || null,
    navigation = progressStudentNavigation(
      students.map((student) => student.id),
      selectedStudent?.id,
    );

  return {
    groups: availableGroups,
    group,
    students,
    student: selectedStudent,
    ...navigation,
  };
}