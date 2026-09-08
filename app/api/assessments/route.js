import { z } from "zod";
import { after } from "next/server";
import { requireApiUser, fail, ok } from "@/lib/http";
import {
  processAssessmentSideEffects,
  saveAssessment,
} from "@/services/assessments";
import { getProject } from "@/services/projects";
import { canAccessStudent } from "@/lib/auth";

const criterion = z.object({
  name: z.string(),
  score: z.coerce.number().min(0),
  max: z.coerce.number().positive(),
});
const schema = z
  .object({
    id: z.string().optional(),
    projectId: z.string(),
    studentId: z.string(),
    criteria: z.array(criterion).optional(),
    manualGrade: z.coerce.number().int().min(1).max(10).optional(),
    correctionType: z
      .enum(["ordinary", "substantive", "input_error"])
      .optional(),
  })
  .refine((x) => (x.criteria && x.criteria.length) || x.manualGrade, {
    message: "Assessment criteria or final grade is required",
  });

export async function POST(req) {
  const auth = await requireApiUser(["teacher", "admin"], {
    permission: "grades.manage",
  });
  if (auth.error) return auth.error;
  try {
    const input = schema.parse(await req.json()),
      project = await getProject(input.projectId);
    if (
      !project ||
      project.studentId !== input.studentId ||
      !(await canAccessStudent(auth.user, input.studentId))
    )
      return fail("Forbidden", 403);
    const item = await saveAssessment(input, auth.user);
    after(() => processAssessmentSideEffects(item));
    return ok({ item });
  } catch (e) {
    return fail(e.message, 400, e?.issues);
  }
}
