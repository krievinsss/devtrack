"use client";

import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Plus,
  Save,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { gradeFromPercent } from "@/lib/grading";
import { ProjectEvidence } from "@/components/TeacherGradebook";

export default function TeacherJournal({
  courses = [],
  groups = [],
  students = [],
  lessons = [],
  entries: initialEntries = [],
  assessments: initialAssessments = [],
  projects = [],
  evidenceByProject = {},
  syncWarning = "",
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id || ""),
    [semester, setSemester] = useState("all"),
    [query, setQuery] = useState(""),
    [entries, setEntries] = useState(initialEntries),
    [assessments, setAssessments] = useState(initialAssessments),
    [editor, setEditor] = useState(null),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const course = courses.find((item) => item.id === courseId) || courses[0];
  const model = useMemo(
    () =>
      buildJournal({
        course,
        courses,
        groups,
        students,
        lessons,
        entries,
        assessments,
        semester,
      }),
    [
      course,
      courses,
      groups,
      students,
      lessons,
      entries,
      assessments,
      semester,
    ],
  );

  async function saveEntry(input) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/journal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "saveEntry",
            courseId: course.id,
            ...input,
          }),
        }),
        body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save journal entry");
      setEntries((current) => [
        body.entry,
        ...current.filter((item) => item.id !== body.entry.id),
      ]);
      setEditor(null);
      setAdding(false);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveGrade(value) {
    setBusy(true);
    setError("");
    try {
      const column = value.column,
        project = projects.find(
          (item) =>
            item.studentId === value.student.id &&
            item.assignmentId === column.assignmentId,
        );
      if (!project)
        throw new Error("This student does not have a linked project.");
      const url =
        column.kind === "final"
          ? "/api/assessments"
          : column.kind === "formative"
            ? "/api/formative"
            : "/api/summative";
      const payload =
        column.kind === "final"
          ? {
              id: value.current?.id,
              projectId: project.id,
              studentId: value.student.id,
              criteria: value.scores,
              correctionType: value.correctionType,
            }
          : {
              action: "grade",
              eventId: column.id,
              studentId: value.student.id,
              scores: value.scores,
              feedback: value.feedback,
              positive: value.positive,
              improvement: value.improvement,
              correctionType: value.correctionType,
            };
      const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
        body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save grade");
      const result = column.kind === "final" ? body.item : body.result;
      setAssessments((current) =>
        current.map((item) =>
          item.id === column.id
            ? {
                ...item,
                results: [
                  result,
                  ...(item.results || []).filter(
                    (row) => row.studentId !== value.student.id,
                  ),
                ],
              }
            : item,
        ),
      );
      setEditor(null);
      window.dispatchEvent(new Event("devtrack-data-refresh"));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (!course)
    return (
      <section className="panel journal-empty">
        <BookOpen size={32} />
        <h2>No journal yet</h2>
        <p>
          Today’s timetable lessons create journals automatically. You can also
          create one in Lesson Planning.
        </p>
        <Link href="/lesson-planning" className="btn primary">
          Open Lesson Planning
        </Link>
      </section>
    );
  return (
    <div className="teacher-journal">
      {syncWarning && (
        <div className="notice danger">Timetable sync: {syncWarning}</div>
      )}
      {error && <div className="notice danger">{error}</div>}
      <section className="panel journal-toolbar">
        <label className="journal-course-select">
          <span>Journal</span>
          <select
            value={course.id}
            onChange={(event) => {
              setCourseId(event.target.value);
              setEditor(null);
            }}
          >
            {courses.map((item) => (
              <option key={item.id} value={item.id}>
                {groups.find((group) => group.id === item.groupId)?.name} ·{" "}
                {item.subject}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Period</span>
          <select
            value={semester}
            onChange={(event) => setSemester(event.target.value)}
          >
            <option value="all">All records</option>
            <option value="1">I semester</option>
            <option value="2">II semester</option>
          </select>
        </label>
        <div className="journal-toolbar-actions">
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add
          </button>
          <Link href="/lesson-planning" className="btn secondary">
            <Settings2 size={14} /> Lesson plan
          </Link>
        </div>
      </section>
      <section className="journal-summary">
        <Summary
          icon={CalendarDays}
          value={model.lessonCount}
          label="lessons"
        />
        <Summary
          icon={ClipboardCheck}
          value={model.assessmentCount}
          label="assessments"
        />
        <Summary
          icon={BookOpen}
          value={course.items.length}
          label="planned topics"
        />
        <Summary
          icon={BarChart3}
          value={`${model.averageAttendance}%`}
          label="attendance"
        />
      </section>
      <section className="panel journal-sheet-card">
        <header>
          <div>
            <span className="eyebrow">
              {groups.find((group) => group.id === course.groupId)?.name}
            </span>
            <h2>{course.subject}</h2>
            <p>
              Timetable creates the lesson; Lesson Planning and Attendance fill
              it automatically.
            </p>
          </div>
          <label>
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
            />
          </label>
        </header>
        <div className="journal-scroll">
          <table>
            <thead>
              <tr>
                <th className="journal-number">Nr.</th>
                <th className="journal-student-col">Student</th>
                {model.columns.map((column) => (
                  <th
                    key={column.id}
                    className={`journal-column-head ${column.kind}`}
                    onClick={() =>
                      column.entryId && setEditor({ mode: "entry", column })
                    }
                  >
                    <span>{shortDate(column.date)}</span>
                    <b>
                      {column.kind === "lesson"
                        ? column.period || ""
                        : typeMark(column.kind)}
                    </b>
                    <small>
                      {column.kind === "lesson"
                        ? "ST"
                        : column.kind.slice(0, 3).toUpperCase()}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows
                .filter((row) =>
                  row.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((row, index) => (
                  <tr key={row.id}>
                    <td className="journal-number">{index + 1}</td>
                    <td className="journal-student-col">
                      <button>
                        <b>{row.name}</b>
                      </button>
                    </td>
                    {model.columns.map((column) => {
                      const cell = column.results.find(
                        (result) => result.studentId === row.id,
                      );
                      return (
                        <td
                          key={column.id}
                          className={`journal-cell ${column.kind}`}
                          onClick={() =>
                            setEditor(
                              column.kind === "lesson"
                                ? { mode: "attendance", column, student: row }
                                : column.entryId
                                  ? { mode: "entry", column }
                                  : {
                                      mode: "grade",
                                      column,
                                      student: row,
                                      current: cell,
                                    },
                            )
                          }
                        >
                          {column.kind === "lesson" ? (
                            cell?.status === "absent" ? (
                              <strong className="journal-absence">n</strong>
                            ) : null
                          ) : cell ? (
                            <strong className="journal-grade">
                              {cell.grade}
                            </strong>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
          {!model.columns.length && (
            <div className="journal-no-columns">
              <CalendarDays size={26} />
              <h3>No entries for this period</h3>
              <p>
                Today’s timetable sync creates regular lessons, or use “Add” for
                an exception.
              </p>
            </div>
          )}
        </div>
      </section>
      {adding && (
        <EntryModal
          title="Add journal entry"
          initial={{
            type: "lesson",
            date: localDate(),
            topic: "",
            outcome: "",
          }}
          busy={busy}
          close={() => setAdding(false)}
          save={saveEntry}
        />
      )}
      {editor?.mode === "entry" && (
        <EntryModal
          title="Lesson entry"
          initial={editor.column}
          busy={busy}
          close={() => setEditor(null)}
          save={saveEntry}
        />
      )}
      {editor?.mode === "attendance" && (
        <AttendanceModal
          value={editor}
          busy={busy}
          close={() => setEditor(null)}
          save={(status) =>
            saveEntry({
              id: editor.column.entryId,
              date: isoDate(editor.column.date),
              type: "lesson",
              topic: editor.column.manualTopic || "",
              outcome: editor.column.manualOutcome || "",
              attendanceOverrides: {
                ...(editor.column.attendanceOverrides || {}),
                [editor.student.id]: status,
              },
            })
          }
        />
      )}
      {editor?.mode === "grade" && (
        <GradeModal
          value={editor}
          projects={projects}
          evidenceByProject={evidenceByProject}
          busy={busy}
          close={() => setEditor(null)}
          save={saveGrade}
        />
      )}
    </div>
  );
}

function Summary({ icon: Icon, value, label }) {
  return (
    <div>
      <Icon size={17} />
      <span>
        <b>{value}</b>
        {label}
      </span>
    </div>
  );
}
function EntryModal({ title, initial, busy, close, save }) {
  const [form, setForm] = useState({
    id: initial.entryId || initial.id,
    type: initial.type === "assessment" ? "assessment" : "lesson",
    date: isoDate(initial.date),
    topic: initial.manualTopic ?? initial.topic ?? "",
    outcome: initial.manualOutcome ?? initial.outcome ?? "",
    source: initial.source || "manual",
  });
  return (
    <Modal title={title} close={close}>
      <label>
        <span>Entry type</span>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          <option value="lesson">Lesson</option>
          <option value="assessment">Assessment</option>
        </select>
      </label>
      <label>
        <span>Date</span>
        <input
          type="date"
          disabled={form.source === "timetable"}
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
      </label>
      <label>
        <span>Lesson topic</span>
        <input
          value={form.topic}
          onChange={(e) => setForm({ ...form, topic: e.target.value })}
        />
      </label>
      <label>
        <span>Learning outcome</span>
        <textarea
          value={form.outcome}
          onChange={(e) => setForm({ ...form, outcome: e.target.value })}
        />
      </label>
      <footer>
        <button className="btn secondary" onClick={close}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={busy || !form.date}
          onClick={() => save(form)}
        >
          <Save size={14} /> {busy ? "Saving…" : "Save"}
        </button>
      </footer>
    </Modal>
  );
}
function AttendanceModal({ value, busy, close, save }) {
  const [status, setStatus] = useState(
    value.column.results.find((item) => item.studentId === value.student.id)
      ?.status || "present",
  );
  return (
    <Modal title={value.student.name} close={close}>
      <div className="journal-detail-copy">
        <span className="eyebrow">ATTENDANCE</span>
        <h3>{value.column.title}</h3>
        <p>{longDate(value.column.date)}</p>
      </div>
      <label>
        <span>Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="present">Present (empty cell)</option>
          <option value="absent">Absent (n)</option>
        </select>
      </label>
      <footer>
        <button className="btn secondary" onClick={close}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => save(status)}
        >
          Save
        </button>
      </footer>
    </Modal>
  );
}
function GradeModal({ value, projects, evidenceByProject, busy, close, save }) {
  const criteria = value.column.criteria || [],
    current = value.current,
    [scores, setScores] = useState(
      criteria.map((criterion) => ({
        name: criterion.name,
        max: Number(criterion.max || 0),
        score: Number(
          current?.scores?.find((item) => item.name === criterion.name)
            ?.score ??
            criterion.score ??
            0,
        ),
      })),
    ),
    [feedback, setFeedback] = useState(current?.feedback || ""),
    [positive, setPositive] = useState(current?.positive || ""),
    [improvement, setImprovement] = useState(current?.improvement || ""),
    [correctionType, setCorrectionType] = useState("ordinary");
  const total = scores.reduce((sum, item) => sum + Number(item.score || 0), 0),
    max = scores.reduce((sum, item) => sum + Number(item.max || 0), 0),
    percent = max ? Math.round((total / max) * 100) : 0,
    project = projects.find(
      (item) =>
        item.studentId === value.student.id &&
        item.assignmentId === value.column.assignmentId,
    ),
    evidence = evidenceByProject[project?.id] || {},
    repoUrl = project?.githubRepo
      ? `https://github.com/${project.githubOwner}/${project.githubRepo}`
      : "";
  return (
    <Modal
      wide
      title={`${value.student.name} · ${value.column.title}`}
      close={close}
    >
      <div className="journal-grade-summary">
        <div>
          <span>Points</span>
          <b>
            {total}/{max}
          </b>
        </div>
        <div>
          <span>Percent</span>
          <b>{percent}%</b>
        </div>
        <div>
          <span>Grade</span>
          <b>{gradeFromPercent(percent)}</b>
        </div>
      </div>
      {scores.map((criterion, index) => (
        <label className="journal-criterion" key={`${criterion.name}-${index}`}>
          <span>
            {criterion.name} · max {criterion.max}
          </span>
          <input
            type="number"
            min="0"
            max={criterion.max}
            value={criterion.score}
            onChange={(e) =>
              setScores((items) =>
                items.map((item, i) =>
                  i === index
                    ? {
                        ...item,
                        score: Math.max(
                          0,
                          Math.min(item.max, Number(e.target.value) || 0),
                        ),
                      }
                    : item,
                ),
              )
            }
          />
        </label>
      ))}
      {value.column.kind === "formative" && (
        <>
          <label>
            <span>What went well</span>
            <textarea
              value={positive}
              onChange={(e) => setPositive(e.target.value)}
            />
          </label>
          <label>
            <span>Needs improvement</span>
            <textarea
              value={improvement}
              onChange={(e) => setImprovement(e.target.value)}
            />
          </label>
        </>
      )}
      <label>
        <span>Feedback</span>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </label>
      {(current?.revisionHistory || []).length > 0 && (
        <label>
          <span>Correction type</span>
          <select
            value={correctionType}
            onChange={(e) => setCorrectionType(e.target.value)}
          >
            <option value="ordinary">Ordinary change</option>
            <option value="substantive">Substantive correction</option>
            <option value="input_error">Input error</option>
          </select>
        </label>
      )}
      {(current?.revisionHistory || []).length > 0 && (
        <section className="journal-revision-history">
          <b>Change history</b>
          {current.revisionHistory.map((item, index) => (
            <p key={index}>
              {item.oldGrade} → {item.newGrade} ·{" "}
              {correctionLabel(item.correctionType)} ·{" "}
              {new Date(item.changedAt).toLocaleString("lv-LV")}
            </p>
          ))}
        </section>
      )}
      <footer>
        <button className="btn secondary" onClick={close}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={busy || !scores.length}
          onClick={() =>
            save({
              ...value,
              scores,
              feedback,
              positive,
              improvement,
              correctionType,
            })
          }
        >
          <Save size={14} /> {busy ? "Saving…" : "Save grade"}
        </button>
      </footer>
      {project && (
        <ProjectEvidence
          editor={{
            project,
            commits: evidence.commits || [],
            aiReviews: evidence.aiReviews || [],
          }}
          repoUrl={repoUrl}
        />
      )}
    </Modal>
  );
}
function Modal({ title, close, wide = false, children }) {
  return (
    <div className="journal-modal-backdrop" onMouseDown={close}>
      <div
        className={`journal-modal ${wide ? "wide" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button onClick={close}>
            <X size={17} />
          </button>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function buildJournal({
  course,
  courses,
  groups,
  students,
  lessons,
  entries,
  assessments,
  semester,
}) {
  if (!course)
    return {
      columns: [],
      rows: [],
      averageAttendance: 0,
      lessonCount: 0,
      assessmentCount: 0,
    };
  const group = groups.find((item) => item.id === course.groupId),
    members = new Set(group?.studentIds || []),
    rows = students
      .filter((student) => members.has(student.id))
      .map((student) => ({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
      }));
  const courseEntries = entries
    .filter((entry) => entry.courseId === course.id)
    .sort(
      (a, b) => new Date(a.startsAt || a.date) - new Date(b.startsAt || b.date),
    );
  const lessonColumns = courseEntries.map((entry) => {
    const sequenceIndex = courseEntries
      .filter((item) => item.type === "lesson")
      .findIndex((item) => item.id === entry.id);
    const plan =
        course.items.find(
          (item) =>
            item.plannedDate === entry.date &&
            (!item.timetablePeriod ||
              Number(item.timetablePeriod) === Number(entry.timetablePeriod)),
        ) || (sequenceIndex >= 0 ? course.items[sequenceIndex] : null),
      attendance = lessons.find(
        (item) =>
          item.groupId === course.groupId &&
          isoDate(item.startsAt) === entry.date &&
          Number(item.period || 0) === Number(entry.timetablePeriod || 0) &&
          relatedSubject(item.subject, course.subject),
      ),
      results = rows
        .map((student) => {
          const override = entry.attendanceOverrides?.[student.id];
          if (override) return { studentId: student.id, status: override };
          const recorded = attendance?.results?.find(
            (item) => item.studentId === student.id,
          );
          if (recorded) return recorded;
          return attendance
            ? { studentId: student.id, status: "absent" }
            : null;
        })
        .filter(Boolean);
    return {
      ...entry,
      entryId: entry.id,
      kind: entry.type === "assessment" ? "summative" : "lesson",
      date: entry.startsAt || `${entry.date}T12:00:00Z`,
      period: entry.timetablePeriod,
      manualTopic: entry.topic,
      manualOutcome: entry.outcome,
      topic: entry.topic || plan?.topic || "",
      outcome: entry.outcome || plan?.outcome || "",
      title: entry.topic || plan?.topic || course.subject,
      results,
    };
  });
  const groupCourses = courses.filter(
      (item) => item.groupId === course.groupId,
    ),
    assessmentColumns = assessments
      .filter(
        (item) =>
          item.groupId === course.groupId &&
          (groupCourses.length === 1 || relatedAssessment(course, item)),
      )
      .map((item) => ({
        ...item,
        date: item.date,
        results: item.results || [],
      })),
    columns = [...lessonColumns, ...assessmentColumns]
      .filter((item) => semesterMatch(item.date, semester))
      .sort(
        (a, b) =>
          new Date(a.date) - new Date(b.date) ||
          kindOrder(a.kind) - kindOrder(b.kind),
      ),
    attendanceColumns = lessonColumns.filter(
      (column) => column.kind === "lesson",
    ),
    recorded = attendanceColumns.flatMap((column) => column.results),
    attended = recorded.filter(
      (item) => item.status === "present" || item.status === "late",
    ).length;
  return {
    columns,
    rows,
    lessonCount: attendanceColumns.length,
    assessmentCount:
      assessmentColumns.length +
      lessonColumns.filter((column) => column.kind !== "lesson").length,
    averageAttendance: recorded.length
      ? Math.round((attended / recorded.length) * 100)
      : 0,
  };
}
function relatedAssessment(course, assessment) {
  const subject = normalize(course.subject),
    assignment = normalize(assessment.assignmentTitle),
    title = normalize(assessment.title);
  return (
    (assignment &&
      (assignment.includes(subject) || subject.includes(assignment))) ||
    (title && (title.includes(subject) || subject.includes(title))) ||
    course.items.some(
      (item) =>
        item.type === assessment.kind &&
        (!item.plannedDate || item.plannedDate === isoDate(assessment.date)),
    )
  );
}
function relatedSubject(a, b) {
  const left = normalize(a),
    right = normalize(b);
  return left === right || left.includes(right) || right.includes(left);
}
function semesterMatch(date, semester) {
  if (semester === "all") return true;
  const month = new Date(date).getMonth() + 1;
  return semester === "1" ? month >= 8 || month <= 1 : month >= 2 && month <= 7;
}
function kindOrder(kind) {
  return { lesson: 0, formative: 1, summative: 2, final: 3 }[kind] ?? 4;
}
function normalize(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("lv-LV")
    .replace(/\s+/g, " ");
}
function isoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value || "").slice(0, 10)
    : date.toISOString().slice(0, 10);
}
function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(
    new Date(),
  );
}
function shortDate(value) {
  return new Date(value)
    .toLocaleDateString("lv-LV", { day: "2-digit", month: "2-digit" })
    .replaceAll(".", "/");
}
function longDate(value) {
  return new Date(value).toLocaleString("lv-LV", {
    dateStyle: "long",
    timeStyle: "short",
  });
}
function typeMark(kind) {
  return { formative: "F", summative: "S", final: "G" }[kind] || "";
}
function correctionLabel(value) {
  return (
    {
      ordinary: "ordinary",
      substantive: "substantive",
      input_error: "input error",
    }[value] || value
  );
}
