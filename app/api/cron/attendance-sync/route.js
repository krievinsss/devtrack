import { NextResponse } from "next/server";
import {
  closeExpiredAutomaticAttendance,
  syncAutomaticAttendanceForTeacher,
} from "@/services/attendanceAutomation";
import { getClassrooms } from "@/services/classrooms";
import { getGroups } from "@/services/groups";
import { getUsers } from "@/services/users";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );

  const now = new Date();
  const [groups, users] = await Promise.all([getGroups(), getUsers()]);
  const teachers = users.filter(
    (user) => user.active !== false && ["teacher", "admin"].includes(user.role),
  );
  const closer =
    teachers.find(
      (user) => user.role === "admin" || user.platformRole === "super_admin",
    ) || teachers[0];
  const closed = closer
    ? await closeExpiredAutomaticAttendance(closer, now)
    : [];
  const results = [];
  for (const teacher of teachers) {
    try {
      const classrooms = await getClassrooms(teacher, {
        includeInactive: false,
      });
      results.push(
        await syncAutomaticAttendanceForTeacher(
          teacher,
          groups,
          classrooms,
          now,
        ),
      );
    } catch (error) {
      results.push({
        teacherId: teacher.id,
        error: error?.message || "Attendance sync failed",
      });
    }
  }
  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    closed,
    results,
  });
}
