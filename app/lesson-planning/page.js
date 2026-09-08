import AppShell from "@/components/AppShell";
import LessonPlanManager from "@/components/LessonPlanManager";
import { PageHeader } from "@/components/UI";
import { requirePageUser } from "@/lib/page";
import { getGroups } from "@/services/groups";
import { getJournalCourses } from "@/services/journal";

export default async function LessonPlanningPage() {
  const user = await requirePageUser(["teacher", "admin"], "attendance");
  let [courses, groups] = await Promise.all([
    getJournalCourses(user),
    getGroups(),
  ]);
  const schoolWide =
    user.role === "admin" || user.platformRole === "super_admin";
  if (!schoolWide)
    groups = groups.filter((group) => (user.groupIds || []).includes(group.id));
  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow="Curriculum"
        title="Lesson Planning"
        description="Plan topics and learning outcomes once; DevTrack attaches them to journal lessons automatically."
      />
      <LessonPlanManager initialCourses={courses} groups={groups} />
    </AppShell>
  );
}
