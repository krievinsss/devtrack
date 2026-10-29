import { z } from 'zod';
import { fail, ok, requireApiUser } from '@/lib/http';
import {
  AttendanceAutomationTargetError,
  getAttendanceAutomationMonitor,
  getTodayAttendanceAutomationStatus,
  recheckAttendanceAutomationLesson,
} from '@/services/attendanceAutomationMonitor';
import { attendanceAutomationMonitorQuerySchema } from '@/lib/attendanceAutomationMonitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const recheckSchema = z.object({
  action: z.literal('recheck'),
  teacherId: z.string().trim().min(1).max(200),
  blockId: z.string().trim().min(1).max(200),
});

export async function GET(request) {
  const auth = await requireApiUser(['teacher', 'admin'], {
    permission: 'attendance.manage_sessions',
  });
  if (auth.error) return auth.error;

  try {
    const params = attendanceAutomationMonitorQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const schoolWide = auth.user.role === 'admin' || auth.user.platformRole === 'super_admin';
    const teacherId = schoolWide ? params.teacherId : auth.user.id;
    const [monitor, today] = await Promise.all([
      getAttendanceAutomationMonitor({ ...params, result: params.result || '', teacherId }),
      getTodayAttendanceAutomationStatus({ teacherId }),
    ]);
    return ok({ monitor: monitor.latest, history: monitor.history, today });
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid monitor filters', 400);
    console.error('Attendance automation monitor read failed', {
      name: error?.name || 'Error',
    });
    return fail('Automation status is unavailable', 500);
  }
}

export async function POST(request) {
  const auth = await requireApiUser(['admin'], {
    permission: 'administration.manage_school',
  });
  if (auth.error) return auth.error;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return fail('Invalid recheck request', 400);
    }
    const input = recheckSchema.parse(body);
    const result = await recheckAttendanceAutomationLesson({
      ...input,
      requester: auth.user,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid recheck request', 400);
    if (error instanceof AttendanceAutomationTargetError) return fail(error.message, 403);
    console.error('Attendance automation recheck failed', {
      name: error?.name || 'Error',
    });
    return fail('Could not recheck this scheduled lesson', 500);
  }
}
