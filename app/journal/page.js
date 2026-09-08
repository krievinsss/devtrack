import AppShell from "@/components/AppShell";
import TeacherJournal from "@/components/TeacherJournal";
import { PageHeader } from "@/components/UI";
import { requirePageUser } from "@/lib/page";
import { readJson } from "@/lib/storage";
import { getJournalLessonColumns } from "@/services/attendance";
import { getGroups } from "@/services/groups";
import { getJournalCourses } from "@/services/journal";
import { getProjects } from "@/services/projects";
import { getUsers } from "@/services/users";

export default async function JournalPage() {
  const user = await requirePageUser(["teacher", "admin"], "attendance");
  let [
    courses,
    groups,
    users,
    lessons,
    assignments,
    projects,
    formative,
    summative,
    finals,
  ] = await Promise.all([
    getJournalCourses(user),
    getGroups(),
    getUsers(),
    getJournalLessonColumns(user),
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
  courses = courses.filter((course) => groupIds.has(course.groupId));
  const students = users.filter(
    (student) =>
      student.role === "student" &&
      groups.some((group) => (group.studentIds || []).includes(student.id)),
  );
  const assignmentGroup = new Map(
    assignments.map((assignment) => [assignment.id, assignment.groupId]),
  );
  const assignmentById = new Map(
    assignments.map((assignment) => [assignment.id, assignment]),
  );
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const assessments = [
    ...formative.map((event) => ({
      id: event.id,
      groupId: assignmentGroup.get(event.assignmentId),
      assignmentTitle: assignmentById.get(event.assignmentId)?.title || "",
      kind: "formative",
      title: event.title,
      date: event.date,
      results: event.results || [],
    })),
    ...summative.map((event) => ({
      id: event.id,
      groupId: assignmentGroup.get(event.assignmentId),
      assignmentTitle: assignmentById.get(event.assignmentId)?.title || "",
      kind: "summative",
      title: event.title,
      date: event.date,
      results: event.results || [],
    })),
    ...finals.map((result) => {
      const project = projectById.get(result.projectId);
      return {
        id: result.id,
        groupId: assignmentGroup.get(project?.assignmentId),
        assignmentTitle:
          assignmentById.get(project?.assignmentId)?.title ||
          project?.name ||
          "",
        kind: "final",
        title: project?.name || "Final grade",
        date: result.updatedAt,
        results: [result],
      };
    }),
  ].filter((item) => groupIds.has(item.groupId));
  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow="Digital journal"
        title="Journal"
        description="Attendance, lesson topics and assessments in one automatically maintained gradebook."
      />
      <TeacherJournal
        courses={courses}
        groups={groups}
        students={students}
        lessons={lessons}
        assessments={assessments}
      />
    </AppShell>
  );
}
