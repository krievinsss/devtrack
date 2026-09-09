import { z } from "zod";
import { fail, ok, requireApiUser } from "@/lib/http";
import {
  AttendanceAccessError,
  AttendanceConflictError,
  AttendanceNotFoundError,
  cancelAttendanceSession,
  checkInWithDesk,
  checkInWithDeskId,
  closeAttendanceSession,
  getAttendanceDashboard,
  getStudentAttendance,
  markAttendance,
  openAttendanceSession,
} from "@/services/attendance";
import { reconcileAutomaticAttendance } from "@/services/attendanceAutomation";

const id = z.string().uuid();
const timetableLessonSchema = z.object({
  id: z.string().max(200),
  period: z.number().int().nullable().optional(),
  date: z.string().max(10),
  start: z.string().max(8),
  end: z.string().max(8),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  subject: z.string().max(160),
});
const openSchema = z.object({
  action: z.literal("open"),
  classroomId: id,
  groupId: z.string().min(1).max(160),
  title: z.string().trim().min(1).max(160),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  lateAfterMinutes: z.number().int().min(0).max(120),
  timetableLessons: z.array(timetableLessonSchema).max(12).default([]),
});
const closeSchema = z.object({ action: z.literal("close"), sessionId: id });
const cancelSchema = z.object({ action: z.literal("cancel"), sessionId: id });
const markSchema = z.object({
  action: z.literal("mark"),
  sessionId: id,
  studentMembershipId: id,
  status: z.enum(["present", "late", "absent", "excused"]),
  note: z.string().trim().max(300).default(""),
});
const checkInSchema = z.object({ action: z.literal("checkIn"), token: id });
const deskCheckInSchema = z.object({
  action: z.literal("checkInDesk"),
  deskId: id,
});
const schema = z.discriminatedUnion("action", [
  openSchema,
  closeSchema,
  cancelSchema,
  markSchema,
  checkInSchema,
  deskCheckInSchema,
]);

export async function GET(request) {
  const auth = await requireApiUser([], { module: "attendance" });
  if (auth.error) return auth.error;
  try {
    if (auth.user.role === "student")
      return ok({ attendance: await getStudentAttendance(auth.user) });
    const params = new URL(request.url).searchParams;
    if (params.get("sync") === "1") {
      const automation = await reconcileAutomaticAttendance(auth.user);
      if (params.get("syncOnly") === "1") return ok({ automation });
    }
    const sessionId = params.get("sessionId");
    return ok({
      attendance: await getAttendanceDashboard(auth.user, { sessionId }),
    });
  } catch (error) {
    return attendanceError(error);
  }
}

export async function POST(request) {
  const auth = await requireApiUser([], { module: "attendance" });
  if (auth.error) return auth.error;
  try {
    const input = schema.parse(await request.json());
    if (input.action === "checkIn")
      return ok({ checkIn: await checkInWithDesk(auth.user, input.token) });
    if (input.action === "checkInDesk")
      return ok({ checkIn: await checkInWithDeskId(auth.user, input.deskId) });
    if (!["teacher", "admin"].includes(auth.user.role))
      throw new AttendanceAccessError();
    if (input.action === "open")
      return ok(
        { session: await openAttendanceSession(auth.user, input) },
        { status: 201 },
      );
    if (input.action === "close")
      return ok({
        session: await closeAttendanceSession(auth.user, input.sessionId),
      });
    if (input.action === "cancel")
      return ok({
        session: await cancelAttendanceSession(auth.user, input.sessionId),
      });
    return ok({ record: await markAttendance(auth.user, input) });
  } catch (error) {
    return attendanceError(error);
  }
}

function attendanceError(error) {
  console.error("Attendance operation failed", {
    name: error?.name,
    message: error?.message || "Unknown error",
  });
  if (error instanceof z.ZodError)
    return fail("Please check the lesson data.", 400, error.issues);
  if (error instanceof AttendanceNotFoundError) return fail(error.message, 404);
  if (error instanceof AttendanceAccessError) return fail(error.message, 403);
  if (error instanceof AttendanceConflictError) return fail(error.message, 409);
  const code = error?.code || error?.cause?.code || error?.cause?.cause?.code;
  if (code === "23505")
    return fail("Another active lesson or desk check-in already exists.", 409);
  if (
    code === "42P01" ||
    String(error?.message || "").includes("does not exist")
  )
    return fail(
      "Attendance database migration has not been applied yet.",
      503,
      { migrationRequired: true },
    );
  return fail(error?.message || "Attendance operation failed.", 500);
}
