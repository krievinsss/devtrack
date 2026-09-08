export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"];

export function attendanceStatus({
  startsAt,
  lateAfterMinutes = 10,
  checkedInAt = new Date(),
}) {
  const start = new Date(startsAt).getTime(),
    checked = new Date(checkedInAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(checked))
    throw new Error("Invalid attendance time");
  return checked > start + Math.max(0, Number(lateAfterMinutes) || 0) * 60_000
    ? "late"
    : "present";
}

export function attendanceMinutesLate({ startsAt, checkedInAt }) {
  if (!checkedInAt) return 0;
  return Math.max(
    0,
    Math.floor(
      (new Date(checkedInAt).getTime() - new Date(startsAt).getTime()) / 60_000,
    ),
  );
}

export function attendanceSummary(records = []) {
  const summary = {
    total: 0,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    attended: 0,
    percentage: 0,
    students: records.length,
    studentsAttended: 0,
  };
  for (const record of records) {
    if (["present", "late"].includes(record.status))
      summary.studentsAttended += 1;
    const lessons =
      Array.isArray(record.lessonStatuses) && record.lessonStatuses.length
        ? record.lessonStatuses
        : [{ status: record.status }];
    for (const lesson of lessons) {
      if (summary[lesson.status] !== undefined) {
        summary[lesson.status] += 1;
        summary.total += 1;
      }
    }
  }
  summary.attended = summary.present + summary.late;
  summary.percentage = summary.total
    ? Math.round((summary.attended / summary.total) * 100)
    : 0;
  return summary;
}

export function lessonStatusesForCheckIn(
  lessons,
  checkedInAt,
  lateAfterMinutes = 10,
) {
  const items =
    Array.isArray(lessons) && lessons.length
      ? lessons
      : [{ id: null, period: null, startsAt: null }];
  return items.map((lesson) => ({
    lessonId: lesson.id || null,
    period: Number(lesson.period) || null,
    status: lesson.startsAt
      ? attendanceStatus({
          startsAt: lesson.startsAt,
          lateAfterMinutes,
          checkedInAt,
        })
      : "present",
  }));
}

export function overallAttendanceStatus(lessonStatuses) {
  const values = (lessonStatuses || []).map((item) => item.status);
  if (values.includes("absent")) return "absent";
  if (values.includes("late")) return "late";
  if (values.includes("present")) return "present";
  return values.includes("excused") ? "excused" : "absent";
}

export function sessionWindow({ startsAt, endsAt, now = new Date() }) {
  const current = new Date(now).getTime(),
    start = new Date(startsAt).getTime(),
    end = new Date(endsAt).getTime();
  if (![current, start, end].every(Number.isFinite) || end <= start)
    return "invalid";
  if (current < start) return "upcoming";
  if (current > end) return "ended";
  return "active";
}
