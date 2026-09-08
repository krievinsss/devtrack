import { z } from "zod";
import { after } from "next/server";
import { requireApiUser, fail, ok } from "@/lib/http";
import { canAccessGroup, canAccessStudent } from "@/lib/auth";
import { getAssignment } from "@/services/assignments";
import {
  createSummative,
  getSummativeEvent,
  processSummativeSideEffects,
  saveSummativeResult,
} from "@/services/summative";
import { notifyAssignmentStudents } from "@/services/notifications";
const criterion = z.object({
  name: z.string().min(1),
  max: z.coerce.number().positive(),
});
const createSchema = z.object({
  action: z.literal("create"),
  assignmentId: z.string(),
  title: z.string().min(2),
  date: z.string(),
  description: z.string().optional(),
  criteria: z.array(criterion).min(1),
});
const gradeSchema = z.object({
  action: z.literal("grade"),
  eventId: z.string(),
  studentId: z.string(),
  scores: z.array(
    z.object({ name: z.string(), score: z.coerce.number().min(0) }),
  ),
  feedback: z.string().optional(),
  correctionType: z.enum(["ordinary", "substantive", "input_error"]).optional(),
});
export async function POST(req) {
  const auth = await requireApiUser(["teacher", "admin"], {
    permission: "grades.manage",
  });
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    if (body.action === "create") {
      const input = createSchema.parse(body),
        assignment = await getAssignment(input.assignmentId);
      if (!assignment || !canAccessGroup(auth.user, assignment.groupId))
        return fail("Forbidden", 403);
      const event = await createSummative(input, auth.user);
      after(() =>
        notifyAssignmentStudents(input.assignmentId, {
          type: "assessment",
          title: "Jauns summatīvais vērtējums",
          message: event.title,
          href: "/projects",
        }),
      );
      return ok({ event });
    }
    if (body.action === "grade") {
      const input = gradeSchema.parse(body),
        event = await getSummativeEvent(input.eventId),
        assignment = event ? await getAssignment(event.assignmentId) : null;
      if (
        !event ||
        !assignment ||
        !canAccessGroup(auth.user, assignment.groupId) ||
        !(await canAccessStudent(auth.user, input.studentId))
      )
        return fail("Forbidden", 403);
      const result = await saveSummativeResult(input, auth.user);
      after(() => processSummativeSideEffects(input, result));
      return ok({ result });
    }
    return fail("Unknown action");
  } catch (e) {
    return fail(e.message, 400, e?.issues);
  }
}
