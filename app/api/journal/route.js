import { z } from "zod";
import { fail, ok, requireApiUser } from "@/lib/http";
import {
  getJournalCourses,
  JournalAccessError,
  JournalNotFoundError,
  replaceLessonPlan,
  saveJournalEntry,
  saveJournalCourse,
} from "@/services/journal";

const id = z.string().uuid();
const courseSchema = z.object({
  action: z.literal("saveCourse"),
  groupId: z.string().min(1).max(160),
  subject: z.string().trim().min(2).max(180),
  academicYear: z.string().trim().max(20).default(""),
});
const planItem = z.object({
  topic: z.string().trim().min(1).max(300),
  outcome: z.string().trim().max(2000).default(""),
  type: z
    .enum(["lesson", "practical", "formative", "summative", "final"])
    .default("lesson"),
  plannedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  timetablePeriod: z.number().int().min(1).max(20).nullable().optional(),
  notes: z.string().trim().max(2000).default(""),
});
const planSchema = z.object({
  action: z.literal("savePlan"),
  courseId: id,
  items: z.array(planItem).max(500),
});
const entrySchema = z.object({
  action: z.literal("saveEntry"),
  id: z.string().uuid().optional(),
  courseId: id,
  type: z.enum(["lesson", "assessment"]).default("lesson"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  timetablePeriod: z.number().int().min(1).max(20).nullable().optional(),
  topic: z.string().trim().max(300).default(""),
  outcome: z.string().trim().max(2000).default(""),
  attendanceOverrides: z
    .record(z.string(), z.enum(["present", "absent"]))
    .optional(),
});
const schema = z.discriminatedUnion("action", [
  courseSchema,
  planSchema,
  entrySchema,
]);

export async function GET() {
  const auth = await requireApiUser([], { module: "attendance" });
  if (auth.error) return auth.error;
  try {
    return ok({ courses: await getJournalCourses(auth.user) });
  } catch (error) {
    return journalError(error);
  }
}

export async function POST(request) {
  const auth = await requireApiUser(["teacher", "admin"], {
    module: "attendance",
  });
  if (auth.error) return auth.error;
  try {
    const input = schema.parse(await request.json());
    if (input.action === "saveCourse")
      return ok(
        { course: await saveJournalCourse(auth.user, input) },
        { status: 201 },
      );
    if (input.action === "saveEntry")
      return ok({ entry: await saveJournalEntry(auth.user, input) });
    return ok({
      items: await replaceLessonPlan(auth.user, input.courseId, input.items),
    });
  } catch (error) {
    return journalError(error);
  }
}

function journalError(error) {
  if (error instanceof z.ZodError)
    return fail("Please check the journal data.", 400, error.issues);
  if (error instanceof JournalNotFoundError) return fail(error.message, 404);
  if (error instanceof JournalAccessError) return fail(error.message, 403);
  const code = error?.code || error?.cause?.code;
  if (code === "42P01")
    return fail("Journal database migration has not been applied yet.", 503, {
      migrationRequired: true,
    });
  console.error("Journal operation failed", {
    message: error?.message || "Unknown error",
  });
  return fail(error?.message || "Journal operation failed.", 500);
}
