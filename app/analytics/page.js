import AppShell from "@/components/AppShell";
import DisciplineAnalytics from "@/components/DisciplineAnalytics";
import { PageHeader } from "@/components/UI";
import { requirePageUser } from "@/lib/page";
import { readJson } from "@/lib/storage";
import { getDisciplineAttendance } from "@/services/attendance";
import { getGroups } from "@/services/groups";
import { getProjects } from "@/services/projects";
import { getUsers } from "@/services/users";

export default async function AnalyticsPage() {
  const user = await requirePageUser(["teacher", "admin"], "attendance");
  let [
    groups,
    users,
    attendance,
    assignments,
    projects,
    formative,
    summative,
    finals,
  ] = await Promise.all([
    getGroups(),
    getUsers(),
    getDisciplineAttendance(user),
    readJson("assignments", []),
    getProjects(),
    readJson("formativeAssessments", []),
    readJson("summativeAssessments", []),
    readJson("assessments", []),
  ]);

  const schoolWide =
    user.role === "admin" || user.platformRole === "super_admin";
  if (!schoolWide)
    groups = groups.filter((group) => (user.groupIds || []).includes(group.id));
  const groupIds = new Set(groups.map((group) => group.id));
  const studentIds = new Set(groups.flatMap((group) => group.studentIds || []));
  users = users.filter(
    (student) => student.role === "student" && studentIds.has(student.id),
  );
  assignments = assignments.filter((assignment) =>
    groupIds.has(assignment.groupId),
  );
  const assignmentGroup = new Map(
    assignments.map((assignment) => [assignment.id, assignment.groupId]),
  );
  const projectById = new Map(projects.map((project) => [project.id, project]));

  const grades = [
    ...formative.flatMap((event) =>
      (event.results || []).map((result) => ({
        id: `${event.id}:${result.studentId}`,
        studentId: result.studentId,
        groupId: assignmentGroup.get(event.assignmentId),
        kind: "formative",
        title: event.title,
        grade: Number(result.grade),
        percent: Number(result.percent),
        date: result.publishedAt || event.date,
      })),
    ),
    ...summative.flatMap((event) =>
      (event.results || []).map((result) => ({
        id: `${event.id}:${result.studentId}`,
        studentId: result.studentId,
        groupId: assignmentGroup.get(event.assignmentId),
        kind: "summative",
        title: event.title,
        grade: Number(result.grade),
        percent: Number(result.percent),
        date: result.publishedAt || event.date,
      })),
    ),
    ...finals.map((result) => {
      const project = projectById.get(result.projectId);
      return {
        id: result.id,
        studentId: result.studentId,
        groupId: assignmentGroup.get(project?.assignmentId),
        kind: "final",
        title: project?.name || "Final grade",
        grade: Number(result.grade),
        percent: Number(result.percent),
        date: result.updatedAt,
      };
    }),
  ].filter((grade) => grade.groupId && Number.isFinite(grade.grade));

  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow="School intelligence"
        title="Discipline & Progress"
        description="Compare attendance, punctuality and academic results across students and groups."
      />
      <DisciplineAnalytics
        groups={groups}
        students={users}
        attendance={attendance}
        grades={grades}
        schoolWide={schoolWide}
      />
    </AppShell>
  );
}
