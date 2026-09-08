"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Armchair,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DoorOpen,
  History,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  TimerReset,
  UserCheck,
  UserX,
  UsersRound,
  X,
} from "lucide-react";
import TimetableLessonModal from "./TimetableLessonModal";

async function request(body) {
  const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    }),
    data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Attendance operation failed.");
  return data;
}
const fmt = (value) =>
  value
    ? new Intl.DateTimeFormat("lv-LV", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Riga",
      }).format(new Date(value))
    : "—";

export default function AttendanceBoard({
  initialAttendance,
  classrooms,
  groups,
  timetableBlocks = [],
  userRole,
  canManage,
  canOverride,
}) {
  if (userRole === "student")
    return <StudentAttendance attendance={initialAttendance} />;
  return (
    <TeacherAttendance
      initialAttendance={initialAttendance}
      classrooms={classrooms}
      groups={groups}
      timetableBlocks={timetableBlocks}
      canManage={canManage}
      canOverride={canOverride}
    />
  );
}

function TeacherAttendance({
  initialAttendance,
  classrooms,
  groups,
  timetableBlocks,
  canManage,
  canOverride,
}) {
  const [data, setData] = useState(initialAttendance),
    [creator, setCreator] = useState(false),
    [selectedId, setSelectedId] = useState(
      initialAttendance?.selected?.id || null,
    ),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const selected = data?.selected,
    hasOpen = (data?.active || []).length > 0;
  const reload = useCallback(
    async (id = selectedId) => {
      try {
        const response = await fetch(
            `/api/attendance${id ? `?sessionId=${id}` : ""}`,
            { cache: "no-store" },
          ),
          next = await response.json();
        if (response.ok) setData(next.attendance);
      } catch {}
    },
    [selectedId],
  );
  useEffect(() => {
    if (!hasOpen) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [hasOpen, reload]);
  async function choose(id) {
    setSelectedId(id);
    setBusy("load");
    try {
      const response = await fetch(`/api/attendance?sessionId=${id}`, {
          cache: "no-store",
        }),
        next = await response.json();
      if (!response.ok) throw new Error(next.error);
      setData(next.attendance);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy("");
    }
  }
  async function action(kind) {
    if (!selected || busy) return;
    if (
      kind === "close" &&
      !confirm(
        "Close this lesson? Students who have not checked in will be marked absent.",
      )
    )
      return;
    if (
      kind === "cancel" &&
      !confirm("Cancel this lesson without counting attendance?")
    )
      return;
    setBusy(kind);
    setError("");
    try {
      await request({ action: kind, sessionId: selected.id });
      await reload(selected.id);
      setNotice(
        kind === "close"
          ? "Lesson closed and absences recorded."
          : "Lesson cancelled.",
      );
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy("");
    }
  }
  async function mark(student, status) {
    if (busy) return;
    setBusy(student.membershipId);
    setError("");
    const previous = data;
    setData((current) => patchStudent(current, student.membershipId, status));
    try {
      await request({
        action: "mark",
        sessionId: selected.id,
        studentMembershipId: student.membershipId,
        status,
        note: "",
      });
      await reload(selected.id);
    } catch (cause) {
      setData(previous);
      setError(cause.message);
    } finally {
      setBusy("");
    }
  }
  const sessions = [...(data?.active || []), ...(data?.history || [])].filter(
    (item, index, all) =>
      all.findIndex((other) => other.id === item.id) === index,
  );
  return (
    <div className="attendance-layout">
      {(error || notice) && (
        <div className={`attendance-notice ${error ? "danger" : "success"}`}>
          {error || notice}
          <button
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <section className="attendance-metrics">
        <AttendanceMetric
          icon={DoorOpen}
          label="Open lessons"
          value={data?.active?.length || 0}
          tone="violet"
        />
        <AttendanceMetric
          icon={UsersRound}
          label="Checked in"
          value={selected?.summary?.studentsAttended || 0}
          tone="green"
        />
        <AttendanceMetric
          icon={Clock3}
          label="Late"
          value={selected?.summary?.late || 0}
          tone="amber"
        />
        <AttendanceMetric
          icon={UserX}
          label="Not here"
          value={
            selected
              ? Math.max(
                  0,
                  (selected.students?.length || 0) -
                    (selected.summary?.studentsAttended || 0) -
                    (selected.students?.filter(
                      (student) => student.record?.status === "excused",
                    ).length || 0),
                )
              : 0
          }
          tone="red"
        />
      </section>
      <div className="attendance-workspace">
        <aside className="attendance-session-list">
          <header>
            <div>
              <span className="eyebrow">Lessons</span>
              <h2>Sessions</h2>
            </div>
            {canManage && (
              <button onClick={() => setCreator(true)} title="Open lesson">
                <Plus size={17} />
              </button>
            )}
          </header>
          <div className="attendance-session-scroll">
            {sessions.map((session) => (
              <button
                key={session.id}
                className={selected?.id === session.id ? "active" : ""}
                onClick={() => choose(session.id)}
              >
                <span className={`attendance-session-dot ${session.status}`} />
                <div>
                  <b>{session.title}</b>
                  <small>
                    {session.groupName} · {session.classroomName}
                  </small>
                  <em>{fmt(session.startsAt)}</em>
                </div>
                <ChevronRight size={15} />
              </button>
            ))}
            {!sessions.length && (
              <div className="attendance-session-empty">
                <CalendarDays size={24} />
                <b>No lessons yet</b>
                <small>Open the first attendance session.</small>
              </div>
            )}
          </div>
        </aside>
        <main className="attendance-main">
          {selected ? (
            <>
              <header className="attendance-session-head">
                <div>
                  <div className="attendance-title-row">
                    <span className={`attendance-status ${selected.status}`}>
                      <i />
                      {selected.status}
                    </span>
                    <span>{selected.groupName}</span>
                    <span>{selected.classroomName}</span>
                  </div>
                  <h2>{selected.title}</h2>
                  <p>
                    <Clock3 size={14} />
                    {fmt(selected.startsAt)} –{" "}
                    {new Intl.DateTimeFormat("lv-LV", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Riga",
                    }).format(new Date(selected.endsAt))}
                    <span>Late after {selected.lateAfterMinutes} min</span>
                  </p>
                </div>
                <div className="attendance-head-actions">
                  <button
                    className="btn secondary"
                    onClick={() => reload()}
                    disabled={busy === "load"}
                  >
                    <RefreshCw
                      size={15}
                      className={busy === "load" ? "spin" : ""}
                    />{" "}
                    Refresh
                  </button>
                  {selected.status === "open" && canManage && (
                    <>
                      <button
                        className="btn secondary danger-text"
                        onClick={() => action("cancel")}
                        disabled={!!busy}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn primary"
                        onClick={() => action("close")}
                        disabled={!!busy}
                      >
                        <Square size={13} /> Close lesson
                      </button>
                    </>
                  )}
                </div>
              </header>
              <AttendanceProgress session={selected} />
              <StudentGrid
                session={selected}
                canOverride={canOverride}
                busy={busy}
                mark={mark}
              />
            </>
          ) : (
            <EmptyAttendance
              canManage={canManage}
              open={() => setCreator(true)}
            />
          )}
        </main>
      </div>
      {creator &&
        (timetableBlocks.length ? (
          <TimetableLessonModal
            classrooms={classrooms}
            timetableBlocks={timetableBlocks}
            onClose={() => setCreator(false)}
            onCreated={afterCreate}
          />
        ) : (
          <OpenLessonModal
            classrooms={classrooms}
            groups={groups}
            onClose={() => setCreator(false)}
            onCreated={afterCreate}
          />
        ))}
    </div>
  );

  async function afterCreate(session) {
    setCreator(false);
    setSelectedId(session.id);
    await reload(session.id);
    setNotice("Lesson is open. Students can scan their desk QR now.");
  }
}

function AttendanceProgress({ session }) {
  const total = session.students?.length || 0,
    attended = session.summary?.studentsAttended || 0,
    pct = total ? Math.round((attended / total) * 100) : 0;
  return (
    <section className="attendance-progress">
      <div
        className="attendance-ring"
        style={{ "--progress": `${pct * 3.6}deg` }}
      >
        <div>
          <b>{attended}</b>
          <span>of {total}</span>
        </div>
      </div>
      <div className="attendance-progress-copy">
        <span className="eyebrow">Room pulse</span>
        <h3>
          {session.status === "open"
            ? "Check-in is live"
            : session.status === "closed"
              ? "Lesson completed"
              : "Session cancelled"}
        </h3>
        <p>
          {session.status === "open"
            ? `${Math.max(0, total - attended - (session.summary?.excused || 0))} students have not checked in yet.`
            : `${pct}% of the group attended this lesson.`}
        </p>
        <div className="attendance-progress-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="attendance-breakdown">
        <span>
          <i className="present" />
          <b>{session.summary?.present || 0}</b>
          <small>Present</small>
        </span>
        <span>
          <i className="late" />
          <b>{session.summary?.late || 0}</b>
          <small>Late</small>
        </span>
        <span>
          <i className="absent" />
          <b>{session.summary?.absent || 0}</b>
          <small>Absent</small>
        </span>
        <span>
          <i className="excused" />
          <b>{session.summary?.excused || 0}</b>
          <small>Excused</small>
        </span>
      </div>
    </section>
  );
}
function StudentGrid({ session, canOverride, busy, mark }) {
  return (
    <section className="attendance-students">
      <div className="attendance-section-title">
        <div>
          <span className="eyebrow">Live register</span>
          <h3>Students</h3>
        </div>
        <span>{session.students?.length || 0} enrolled</span>
      </div>
      <div className="attendance-student-grid">
        {session.students?.map((student) => {
          const status = student.record?.status || "waiting";
          return (
            <article
              key={student.membershipId}
              className={`attendance-student ${status}`}
            >
              <div className="attendance-avatar">
                {student.firstName?.[0]}
                {student.lastName?.[0]}
                <span>
                  {status === "present" ? (
                    <Check size={11} />
                  ) : status === "late" ? (
                    <Clock3 size={11} />
                  ) : status === "absent" ? (
                    <X size={11} />
                  ) : status === "excused" ? (
                    <ShieldCheck size={11} />
                  ) : null}
                </span>
              </div>
              <div className="attendance-student-copy">
                <b>
                  {student.firstName} {student.lastName}
                </b>
                <small>
                  {student.record?.deskLabel ||
                    student.record?.deskCode ||
                    (status === "waiting" ? "Waiting for QR scan" : status)}
                </small>
                {student.record?.checkedInAt && (
                  <em>
                    {new Intl.DateTimeFormat("lv-LV", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      timeZone: "Europe/Riga",
                    }).format(new Date(student.record.checkedInAt))}
                    {student.record.minutesLate > 0
                      ? ` · ${student.record.minutesLate} min late`
                      : ""}
                  </em>
                )}
                {(student.attendanceStats?.total || 0) > 0 && (
                  <em className="attendance-cumulative">
                    {student.attendanceStats.attended}/
                    {student.attendanceStats.total} lessons · late{" "}
                    {Math.round(
                      (student.attendanceStats.late /
                        student.attendanceStats.total) *
                        100,
                    )}
                    %
                  </em>
                )}
              </div>
              {canOverride && session.status !== "cancelled" && (
                <div className="attendance-quick">
                  <button
                    disabled={busy === student.membershipId}
                    className={status === "present" ? "active present" : ""}
                    onClick={() => mark(student, "present")}
                    title="Present"
                  >
                    <UserCheck size={13} />
                  </button>
                  <button
                    disabled={busy === student.membershipId}
                    className={status === "late" ? "active late" : ""}
                    onClick={() => mark(student, "late")}
                    title="Late"
                  >
                    <Clock3 size={13} />
                  </button>
                  <button
                    disabled={busy === student.membershipId}
                    className={status === "absent" ? "active absent" : ""}
                    onClick={() => mark(student, "absent")}
                    title="Absent"
                  >
                    <UserX size={13} />
                  </button>
                  <button
                    disabled={busy === student.membershipId}
                    className={status === "excused" ? "active excused" : ""}
                    onClick={() => mark(student, "excused")}
                    title="Excused"
                  >
                    <ShieldCheck size={13} />
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function OpenLessonModal({ classrooms, groups, onClose, onCreated }) {
  const now = new Date(),
    toLocal = (date) => {
      const shifted = new Date(
        date.getTime() - date.getTimezoneOffset() * 60000,
      );
      return shifted.toISOString().slice(0, 16);
    },
    [form, setForm] = useState({
      classroomId: classrooms[0]?.id || "",
      groupId: groups[0]?.id || "",
      title: "Programming lesson",
      startsAt: toLocal(now),
      endsAt: toLocal(new Date(now.getTime() + 80 * 60000)),
      lateAfterMinutes: 10,
    }),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await request({
        ...form,
        action: "open",
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        lateAfterMinutes: Number(form.lateAfterMinutes),
      });
      onCreated(data.session);
    } catch (cause) {
      setError(cause.message);
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop attendance-modal-backdrop"
      onMouseDown={onClose}
    >
      <form
        className="attendance-modal"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">Start attendance</span>
            <h2>Open a lesson</h2>
            <p>
              As soon as you open it, the permanent desk QR codes become active
              for this group.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {error && <div className="attendance-form-error">{error}</div>}
        <div className="attendance-modal-grid">
          <label>
            <span>Classroom</span>
            <select
              required
              value={form.classroomId}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  classroomId: event.target.value,
                }))
              }
            >
              {classrooms.map((room) => (
                <option value={room.id} key={room.id}>
                  {room.name} · {room.desks.length} desks
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Group</span>
            <select
              required
              value={form.groupId}
              onChange={(event) =>
                setForm((value) => ({ ...value, groupId: event.target.value }))
              }
            >
              {groups.map((group) => (
                <option value={group.id} key={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            <span>Lesson title</span>
            <input
              required
              maxLength={160}
              value={form.title}
              onChange={(event) =>
                setForm((value) => ({ ...value, title: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Starts</span>
            <input
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) =>
                setForm((value) => ({ ...value, startsAt: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Ends</span>
            <input
              required
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) =>
                setForm((value) => ({ ...value, endsAt: event.target.value }))
              }
            />
          </label>
          <label className="wide">
            <span>Mark late after</span>
            <div className="attendance-late-input">
              <TimerReset size={16} />
              <input
                type="number"
                min="0"
                max="120"
                value={form.lateAfterMinutes}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    lateAfterMinutes: event.target.value,
                  }))
                }
              />
              <small>minutes</small>
            </div>
          </label>
        </div>
        {(!classrooms.length || !groups.length) && (
          <div className="attendance-form-error">
            Create a classroom and assign at least one group before opening a
            lesson.
          </div>
        )}
        <footer>
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving || !classrooms.length || !groups.length}
          >
            <Play size={14} />
            {saving ? "Opening…" : "Open check-in"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function StudentAttendance({ attendance }) {
  const { records = [] } = attendance || {};
  const [period, setPeriod] = useState("90");
  const [referenceNow] = useState(() => Date.now());
  const lessons = useMemo(() => {
    const from =
      period === "all" ? 0 : referenceNow - Number(period) * 86400000;
    return records
      .flatMap((record) => {
        const statuses = record.lessonStatuses?.length
          ? record.lessonStatuses
          : [
              {
                status: record.status,
                startsAt: record.startsAt,
                minutesLate: record.minutesLate,
              },
            ];
        return statuses.map((lesson, index) => ({
          ...lesson,
          id: `${record.id}:${lesson.lessonId || lesson.period || index}`,
          title: record.title || "Lesson",
          groupName: record.groupName,
          classroomName: record.classroomName,
          deskCode: record.deskCode,
          deskLabel: record.deskLabel,
          startsAt: lesson.startsAt || record.startsAt,
        }));
      })
      .filter((lesson) => new Date(lesson.startsAt).getTime() >= from)
      .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  }, [period, records, referenceNow]);
  const summary = useMemo(() => studentLessonSummary(lessons), [lessons]);
  const weeks = useMemo(
    () => studentAttendanceWeeks(lessons, referenceNow),
    [lessons, referenceNow],
  );
  return (
    <div className="student-attendance">
      <section className="panel student-attendance-hero">
        <div>
          <span className="eyebrow">MY DISCIPLINE</span>
          <h2>Your attendance overview</h2>
          <p>
            Follow your attendance and punctuality across every concrete
            timetable lesson.
          </p>
        </div>
        <label>
          <span>Period</span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">School year</option>
            <option value="all">All time</option>
          </select>
        </label>
      </section>
      <section className="attendance-metrics">
        <AttendanceMetric
          icon={CalendarDays}
          label="Recorded lessons"
          value={summary.total || 0}
          tone="violet"
        />
        <AttendanceMetric
          icon={CheckCircle2}
          label="Present"
          value={summary.present || 0}
          tone="green"
        />
        <AttendanceMetric
          icon={Clock3}
          label={`Late · ${summary.lateRate}%`}
          value={summary.late || 0}
          tone="amber"
        />
        <AttendanceMetric
          icon={UserX}
          label="Absent"
          value={summary.absent || 0}
          tone="red"
        />
      </section>
      <section className="student-attendance-insights">
        <div className="panel student-attendance-chart">
          <div className="attendance-section-title">
            <div>
              <span className="eyebrow">8 WEEK TREND</span>
              <h3>Attendance momentum</h3>
            </div>
            <strong>{summary.percentage}%</strong>
          </div>
          <div className="student-week-bars">
            {weeks.map((week) => (
              <div key={week.key}>
                <span>
                  <i style={{ height: `${week.percentage}%` }} />
                </span>
                <b>{week.percentage}%</b>
                <small>{week.label}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="panel student-attendance-breakdown-card">
          <div className="attendance-section-title">
            <div>
              <span className="eyebrow">BREAKDOWN</span>
              <h3>Lesson outcomes</h3>
            </div>
          </div>
          <div
            className="student-attendance-donut"
            style={{ background: studentDonut(summary) }}
          >
            <div>
              <b>{summary.attended}</b>
              <small>attended</small>
            </div>
          </div>
          <div className="student-breakdown-legend">
            <span className="present">
              <i />
              Present <b>{summary.present}</b>
            </span>
            <span className="late">
              <i />
              Late <b>{summary.late}</b>
            </span>
            <span className="absent">
              <i />
              Absent <b>{summary.absent}</b>
            </span>
            <span className="excused">
              <i />
              Excused <b>{summary.excused}</b>
            </span>
          </div>
        </div>
        <div className={`panel student-attendance-health ${summary.health}`}>
          <span>
            <UserCheck size={24} />
          </span>
          <small>Current status</small>
          <h3>
            {summary.health === "good"
              ? "On track"
              : summary.health === "watch"
                ? "Keep an eye on it"
                : "Needs attention"}
          </h3>
          <p>
            {summary.health === "good"
              ? "Your attendance and punctuality look healthy."
              : summary.health === "watch"
                ? "A few more missed or late lessons could affect your progress."
                : "Focus on attending the next lessons and arriving on time."}
          </p>
          <div>
            <b>{summary.lateMinutes}</b>
            <small>total minutes late</small>
          </div>
        </div>
      </section>
      <section className="panel student-attendance-history">
        <div className="attendance-section-title">
          <div>
            <span className="eyebrow">Your record</span>
            <h3>Lesson history</h3>
          </div>
          <strong>{summary.percentage || 0}% attendance</strong>
        </div>
        {lessons.map((record) => (
          <article key={record.id}>
            <span className={`student-history-icon ${record.status}`}>
              {record.status === "present" ? (
                <Check size={16} />
              ) : record.status === "late" ? (
                <Clock3 size={16} />
              ) : record.status === "excused" ? (
                <ShieldCheck size={16} />
              ) : (
                <UserX size={16} />
              )}
            </span>
            <div>
              <b>{record.title}</b>
              <small>
                {record.groupName} · {record.classroomName}
                {record.deskCode
                  ? ` · ${record.deskLabel || record.deskCode}`
                  : ""}
              </small>
              {record.minutesLate > 0 && (
                <span className="student-late-detail">
                  Late by {record.minutesLate} minutes
                </span>
              )}
            </div>
            <time>{fmt(record.startsAt)}</time>
            <span className={`attendance-status ${record.status}`}>
              {record.status}
            </span>
          </article>
        ))}
        {!lessons.length && (
          <div className="attendance-history-empty">
            <History size={27} />
            <h3>No attendance yet</h3>
            <p>
              Your lessons will appear here after your first desk QR check-in.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function studentLessonSummary(lessons) {
  const summary = {
    total: lessons.length,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
  };
  for (const lesson of lessons)
    if (summary[lesson.status] !== undefined) summary[lesson.status] += 1;
  summary.attended = summary.present + summary.late;
  const counted = summary.total - summary.excused;
  summary.percentage = counted
    ? Math.round((summary.attended / counted) * 100)
    : 0;
  summary.lateRate = summary.attended
    ? Math.round((summary.late / summary.attended) * 100)
    : 0;
  summary.lateMinutes = lessons.reduce(
    (sum, lesson) => sum + Number(lesson.minutesLate || 0),
    0,
  );
  summary.health =
    !summary.total || (summary.percentage >= 85 && summary.lateRate < 20)
      ? "good"
      : summary.percentage >= 70 && summary.lateRate < 35
        ? "watch"
        : "risk";
  return summary;
}

function studentAttendanceWeeks(lessons, referenceNow) {
  const now = new Date(referenceNow);
  return Array.from({ length: 8 }, (_, index) => {
    const offset = 7 - index,
      end = new Date(now),
      start = new Date(now);
    end.setDate(end.getDate() - offset * 7);
    end.setHours(23, 59, 59, 999);
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const items = lessons.filter((lesson) => {
      const date = new Date(lesson.startsAt);
      return date >= start && date <= end;
    });
    const summary = studentLessonSummary(items);
    return {
      key: start.toISOString(),
      label: start.toLocaleDateString("lv-LV", {
        day: "2-digit",
        month: "short",
      }),
      percentage: summary.total ? summary.percentage : 0,
    };
  });
}

function studentDonut(summary) {
  const total = Math.max(1, summary.total),
    present = (summary.present / total) * 100,
    late = (summary.late / total) * 100,
    absent = (summary.absent / total) * 100;
  return `conic-gradient(var(--green) 0 ${present}%,var(--amber) ${present}% ${present + late}%,var(--danger) ${present + late}% ${present + late + absent}%,var(--blue) ${present + late + absent}% 100%)`;
}
function EmptyAttendance({ canManage, open }) {
  return (
    <div className="attendance-empty">
      <span>
        <Armchair size={30} />
      </span>
      <h2>The room is quiet</h2>
      <p>
        Open a lesson session and students can immediately check in by scanning
        the QR code on their desk.
      </p>
      {canManage && (
        <button className="btn primary" onClick={open}>
          <Play size={14} /> Open first lesson
        </button>
      )}
    </div>
  );
}
function AttendanceMetric({ icon: Icon, label, value, tone }) {
  return (
    <div className={`attendance-metric ${tone}`}>
      <span>
        <Icon size={18} />
      </span>
      <div>
        <b>{value}</b>
        <small>{label}</small>
      </div>
    </div>
  );
}
function patchStudent(data, membershipId, status) {
  if (!data?.selected) return data;
  const students = data.selected.students.map((student) =>
      student.membershipId === membershipId
        ? {
            ...student,
            record: {
              ...(student.record || {}),
              studentMembershipId: membershipId,
              status,
              lessonStatuses: Array.from(
                { length: data.selected.lessonCount || 1 },
                (_, index) => ({
                  period:
                    data.selected.timetableLessons?.[index]?.period ||
                    index + 1,
                  status,
                }),
              ),
              checkedInAt: ["present", "late"].includes(status)
                ? new Date().toISOString()
                : null,
            },
          }
        : student,
    ),
    records = students.map((student) => student.record).filter(Boolean),
    summary = {
      total: records.reduce(
        (sum, r) => sum + (r.lessonStatuses?.length || 1),
        0,
      ),
      present: records.reduce(
        (sum, r) =>
          sum +
          (r.lessonStatuses || [{ status: r.status }]).filter(
            (item) => item.status === "present",
          ).length,
        0,
      ),
      late: records.reduce(
        (sum, r) =>
          sum +
          (r.lessonStatuses || [{ status: r.status }]).filter(
            (item) => item.status === "late",
          ).length,
        0,
      ),
      absent: records.reduce(
        (sum, r) =>
          sum +
          (r.lessonStatuses || [{ status: r.status }]).filter(
            (item) => item.status === "absent",
          ).length,
        0,
      ),
      excused: records.reduce(
        (sum, r) =>
          sum +
          (r.lessonStatuses || [{ status: r.status }]).filter(
            (item) => item.status === "excused",
          ).length,
        0,
      ),
      students: records.length,
      studentsAttended: records.filter((r) =>
        ["present", "late"].includes(r.status),
      ).length,
    };
  summary.attended = summary.present + summary.late;
  summary.percentage = summary.total
    ? Math.round((summary.attended / summary.total) * 100)
    : 0;
  return {
    ...data,
    selected: { ...data.selected, students, records, summary },
  };
}
