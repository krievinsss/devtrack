import { NextResponse } from "next/server";
import { getGroups } from "@/services/groups";
import { syncJournalFromTimetable } from "@/services/journal";
import { dateInRiga } from "@/services/timetable";
import { getUsers } from "@/services/users";

export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const [groups, users] = await Promise.all([getGroups(), getUsers()]);
  const teachers = users.filter((user) => ["teacher", "admin"].includes(user.role));
  const date = dateInRiga(), results = [];
  for (const teacher of teachers) {
    try {
      results.push({ teacherId: teacher.id, ...(await syncJournalFromTimetable(teacher, groups, { start: date, end: date })) });
    } catch (error) {
      results.push({ teacherId: teacher.id, error: error?.message || "Sync failed" });
    }
  }
  return NextResponse.json({ ok: true, date, results });
}
