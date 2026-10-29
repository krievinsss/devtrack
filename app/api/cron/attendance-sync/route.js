import { NextResponse } from "next/server";
import {
  closeExpiredAutomaticAttendance,
  summarizeAttendanceAutomationRun,
  syncAutomaticAttendanceForTeacher,
} from "@/services/attendanceAutomation";
import { getClassroomsForAttendanceAutomation } from "@/services/classrooms";
import { getGroups } from "@/services/groups";
import { getUsers } from "@/services/users";
import { getCoreUserWithAccess } from "@/services/coreDirectory";
import { cronAuthorized, runAttendanceCron } from "@/lib/attendanceCron";
import { recordAttendanceAutomationRun } from "@/services/attendanceAutomationMonitor";

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
      getClassrooms: getClassroomsForAttendanceAutomation,
      closeExpiredAutomaticAttendance, syncAutomaticAttendanceForTeacher });
    const summary = summarizeAttendanceAutomationRun({ ...result, durationMs: Date.now() - startedAt });
    try {
      await recordAttendanceAutomationRun({ ...result, durationMs: Date.now() - startedAt }, { trigger: "cron" });
    } catch (error) {
      console.error("attendance-cron monitor write failed", { name: error?.name || "Error" });
    }
    console[result.ok ? "info" : "error"]("attendance-cron", JSON.stringify({
      ok: summary.ok,
      ranAt: summary.ranAt,
      durationMs: summary.durationMs,
      openedCount: summary.openedCount,
      closedCount: summary.closedCount,
      skippedCount: summary.skippedCount,
    }));
    return NextResponse.json({ ok: summary.ok, monitor: summary }, { status: summary.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("attendance-cron failed", { name: error?.name || "Error" });
    try {
      await recordAttendanceAutomationRun({
        ok: false,
        ranAt: new Date().toISOString(),
        results: [{ error: "Automation run failed before completion" }],
        durationMs: Date.now() - startedAt,
      }, { trigger: "cron" });
    } catch (storageError) {
      console.error("attendance-cron failure record write failed", {
        name: storageError?.name || "Error",
      });
    }
    return NextResponse.json({ ok: false, error: "Attendance sync failed" }, { status: 500 });
  }
}
