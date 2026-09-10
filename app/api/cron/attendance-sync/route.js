import { NextResponse } from "next/server";
import { closeExpiredAutomaticAttendance, syncAutomaticAttendanceForTeacher } from "@/services/attendanceAutomation";
import { getClassrooms } from "@/services/classrooms";
import { getGroups } from "@/services/groups";
import { getUsers } from "@/services/users";
import { getCoreUserWithAccess } from "@/services/coreDirectory";
import { cronAuthorized, runAttendanceCron } from "@/lib/attendanceCron";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!process.env.CRON_SECRET) {
    console.error("attendance-cron: CRON_SECRET is not configured");
    return NextResponse.json({ ok: false, error: "Cron is not configured" }, { status: 503 });
  }
  if (!cronAuthorized(process.env.CRON_SECRET, request.headers.get("authorization")))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  try {
    const result = await runAttendanceCron({ getGroups, getUsers, getCoreUserWithAccess,
      getClassrooms, closeExpiredAutomaticAttendance, syncAutomaticAttendanceForTeacher });
    console[result.ok ? "info" : "error"]("attendance-cron", JSON.stringify({ ...result, durationMs: Date.now() - startedAt }));
    return NextResponse.json(result, { status: result.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("attendance-cron failed", error);
    return NextResponse.json({ ok: false, error: "Attendance sync failed" }, { status: 500 });
  }
}
