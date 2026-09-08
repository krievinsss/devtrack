import AppShell from "@/components/AppShell";
import TeacherJournal from "@/components/TeacherJournal";
import { requirePageUser } from "@/lib/page";
import { readJson } from "@/lib/storage";
import { getJournalLessonColumns } from "@/services/attendance";
import { getGroups } from "@/services/groups";
import {
  getJournalCourses,
  getJournalEntries,
  syncJournalFromTimetable,
} from "@/services/journal";
import { getProjects } from "@/services/projects";
import { dateInRiga } from "@/services/timetable";
import { getUsers } from "@/services/users";

export default async function JournalPage() {
  const user = await requirePageUser(["teacher", "admin"], "attendance");
  let groups = await getGroups();
  const schoolWide =
    user.role === "admin" || user.platformRole === "super_admin";
  if (!schoolWide)
    groups = groups.filter((group) => (user.groupIds || []).includes(group.id));
  const today = dateInRiga();
  let syncWarning = "";
  try {
    await syncJournalFromTimetable(user, groups, { start: today, end: today });
  } catch (error) {
    syncWarning =
      error?.message || "Timetable sync is temporarily unavailable.";
  }
  let [
    courses,
    users,
    lessons,
    assignments,
    projects,
    formative,
    summative,
    finals,
    commits,
    aiReviews,
  ] = await Promise.all([
    getJournalCourses(user),
    getUsers(),
    getJournalLessonColumns(user),
    readJson("assignments", []),
    getProjects(),
    readJson("formativeAssessments", []),
    readJson("summativeAssessments", []),
    readJson("assessments", []),
    readJson("commits", []),
    readJson("aiReviews", []),
  ]);
  const groupIds = new Set(groups.map((group) => group.id));
  courses = courses.filter((course) => groupIds.has(course.groupId));
  const entries = await getJournalEntries(
    user,
    courses.map((course) => course.id),
  );
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
  const evidenceByProject = Object.fromEntries(
    projects.map((project) => [
      project.id,
      {
        commits: commits
          .filter((item) => item.repositoryId === project.id)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 100),
        aiReviews: aiReviews
          .filter((item) => item.projectId === project.id)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 10),
      },
    ]),
  );
  const assessments = [
    ...formative.map((event) => ({
      id: event.id,
      groupId: assignmentGroup.get(event.assignmentId),
      assignmentTitle: assignmentById.get(event.assignmentId)?.title || "",
      kind: "formative",
      title: event.title,
      date: event.date,
      results: event.results || [],
      criteria: event.criteria || [],
      assignmentId: event.assignmentId,
    })),
    ...summative.map((event) => ({
      id: event.id,
      groupId: assignmentGroup.get(event.assignmentId),
      assignmentTitle: assignmentById.get(event.assignmentId)?.title || "",
      kind: "summative",
      title: event.title,
      date: event.date,
      results: event.results || [],
      criteria: event.criteria || [],
      assignmentId: event.assignmentId,
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
        criteria: result.criteria || [],
        assignmentId: project?.assignmentId,
        projectId: project?.id,
      };
    }),
  ].filter((item) => groupIds.has(item.groupId));
  return (
    <AppShell user={user}>
      <TeacherJournal
        courses={courses}
        groups={groups}
        students={students}
        lessons={lessons}
        entries={entries}
        assessments={assessments}
        assignments={assignments}
        projects={projects}
        evidenceByProject={evidenceByProject}
        syncWarning={syncWarning}
      />
    </AppShell>
  );
}
