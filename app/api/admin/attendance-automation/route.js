import { getCoreUserWithAccess } from '@/services/coreDirectory';
import { getClassrooms } from '@/services/classrooms';
import { getGroups } from '@/services/groups';
import { getUsers } from '@/services/users';
import { closeExpiredAutomaticAttendance, summarizeAttendanceAutomationRun, syncAutomaticAttendanceForTeacher } from '@/services/attendanceAutomation';
import { readJson, writeJson } from '@/lib/storage';
import { fail, ok, requireApiUser } from '@/lib/http';
import { runAttendanceCron } from '@/lib/attendanceCron';

export async function GET() {
  const auth = await requireApiUser(['teacher', 'admin'], {
    permission: 'attendance.manage_sessions',
  });
  if (auth.error) return auth.error;

  try {
    let monitor = await readJson('attendanceAutomationMonitor', null);
    const shouldRefresh = !monitor || !monitor.ranAt || Date.now() - new Date(monitor.ranAt).getTime() > 10 * 60 * 1000;
    if (shouldRefresh) {
      const startedAt = Date.now();
      const result = await runAttendanceCron({
        getGroups,
        getUsers,
        getCoreUserWithAccess,
        getClassrooms,
        closeExpiredAutomaticAttendance,
        syncAutomaticAttendanceForTeacher,
      });
      monitor = summarizeAttendanceAutomationRun({
        ...result,
        durationMs: Date.now() - startedAt,
      });
      await writeJson('attendanceAutomationMonitor', monitor);
    }
    return ok({ monitor });
  } catch (error) {
    return fail(error?.message || 'Automation status is unavailable', 500);
  }
}
