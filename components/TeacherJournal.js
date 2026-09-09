"use client";

import Link from "next/link";
import { BookOpen, CalendarDays, Plus, Save, Settings2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { gradeFromPercent } from "@/lib/grading";
import {
  firstLessonOfOvertime,
  overtimeBlockNumber,
  overtimeLabel,
  SCHOOL_OVERTIME_BLOCKS,
} from "@/lib/schoolPeriods";
import { ProjectEvidence } from "@/components/TeacherGradebook";

const JOURNAL_ENTRY_TYPES = [
  { id: "lesson", label: "Mācību stunda", color: "#ffffff", group: "basic" },
  {
    id: "assessment",
    label: "Pārbaudes darbs",
    color: "#a9deeb",
    group: "basic",
  },
  {
    id: "semester_1_mid",
    label: "I semestra starpvērtējums",
    color: "#fff400",
    group: "semester",
  },
  {
    id: "semester_2_mid",
    label: "II semestra starpvērtējums",
    color: "#fff400",
    group: "semester",
  },
  {
    id: "semester_1",
    label: "I semestra vērtējums",
    color: "#bebebe",
    group: "semester",
  },
  {
    id: "semester_2",
    label: "II semestra vērtējums",
    color: "#bebebe",
    group: "semester",
  },
  {
    id: "predicted",
    label: "Prognozētais vērtējums / Kombinētais darbs",
    color: "#f2e1fb",
    group: "semester",
  },
  { id: "year", label: "Gada vērtējums", color: "#12e827", group: "semester" },
  {
    id: "retake",
    label: "Pēcpārbaudījums",
    color: "#df6be3",
    group: "semester",
  },
  {
    id: "subject_final",
    label: "Galīgais vērtējums priekšmetā",
    color: "#f4e68b",
    group: "semester",
  },
  {
    id: "state_diagnostic",
    label: "Valsts diagnosticējošais darbs",
    color: "#19dce5",
    group: "state",
  },
  {
    id: "state_exam",
    label: "Valsts eksāmens",
    color: "#ffa000",
    group: "state",
  },
  {
    id: "state_monitoring",
    label: "Valsts monitoringa darbs",
    color: "#effff0",
    group: "state",
  },
  {
    id: "session_exam",
    label: "Sesijas eksāmens",
    color: "#ffcc80",
    group: "state",
  },
];

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
    [entries, setEntries] = useState(initialEntries),
    [assessments, setAssessments] = useState(initialAssessments),
    [editor, setEditor] = useState(null),
    [adding, setAdding] = useState(null),
    [choosingType, setChoosingType] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const course = courses.find((item) => item.id === courseId) || courses[0];
  const model = useMemo(
    () =>
      buildJournal({
        course,
        groups,
        students,
        lessons,
        entries,
        assessments,
        semester,
      }),
    [course, groups, students, lessons, entries, assessments, semester],
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

  async function toggleAttendance(column, student, current) {
    if (busy || !column.entryId) return;
    const status = current?.status === "absent" ? "present" : "absent";
    const previousEntries = entries;
    const attendanceOverrides = {
      ...(column.attendanceOverrides || {}),
      [student.id]: status,
    };
    setEntries((items) =>
      items.map((entry) =>
        entry.id === column.entryId ? { ...entry, attendanceOverrides } : entry,
      ),
    );
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "saveEntry",
          id: column.entryId,
          courseId: course.id,
          date: isoDate(column.date),
          type: "lesson",
          timetablePeriod: column.period || null,
          topic: column.manualTopic || "",
          outcome: column.manualOutcome || "",
          attendanceOverrides,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not update attendance");
      setEntries((items) =>
        items.map((entry) => (entry.id === body.entry.id ? body.entry : entry)),
      );
    } catch (cause) {
      setEntries(previousEntries);
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
        <div className="journal-view-title">
          <BookOpen size={18} />
          <b>Journal</b>
        </div>
        <label className="journal-course-select">
          <span>Class and subject</span>
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
          <button className="btn primary" onClick={() => setChoosingType(true)}>
            <Plus size={14} /> Jauns ieraksts
          </button>
          <Link href="/lesson-planning" className="btn secondary">
            <Settings2 size={14} /> Lesson plan
          </Link>
        </div>
      </section>
      <section className="panel journal-sheet-card">
        <header>
          <div>
            <h2>
              {groups.find((group) => group.id === course.groupId)?.name} ·{" "}
              {course.subject}
            </h2>
            <p>
              {model.rows.length} students · {model.lessonCount} lessons ·{" "}
              {model.assessmentCount} assessments
            </p>
          </div>
        </header>
        <div className="journal-scroll">
          <table style={{ width: `${20 + 96 + model.columns.length * 32}px` }}>
            <colgroup>
              <col className="journal-number-width" />
              <col className="journal-student-width" />
              {model.columns.map((column) => (
                <col key={column.id} className="journal-entry-width" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="journal-number">Nr.</th>
                <th className="journal-student-col">Student</th>
                {model.columns.map((column) => (
                  <th
                    key={column.id}
                    className={`journal-column-head ${column.kind}`}
                    style={
                      column.entryColor
                        ? { "--entry-color": column.entryColor }
                        : undefined
                    }
                    title={column.title}
                    onClick={() =>
                      column.entryId && setEditor({ mode: "entry", column })
                    }
                  >
                    <span>{compactDate(column.date)}</span>
                    <b>
                      {column.kind === "lesson"
                        ? overtimeBlockNumber(column.period) || ""
                        : column.mark || typeMark(column.kind)}
                    </b>
                    <small>
                      {column.kind === "lesson"
                        ? "PĀR"
                        : column.kind === "manual-assessment"
                          ? "VĒRT"
                          : column.kind.slice(0, 3).toUpperCase()}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row, index) => (
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
                        onClick={() => {
                          if (column.kind === "lesson")
                            return toggleAttendance(column, row, cell);
                          setEditor(
                            column.entryId
                              ? { mode: "entry", column }
                              : {
                                  mode: "grade",
                                  column,
                                  student: row,
                                  current: cell,
                                },
                          );
                        }}
                      >
                        {column.kind === "lesson" ? (
                          cell?.status === "absent" ? (
                            <strong className="journal-absence">n</strong>
                          ) : null
                        ) : cell ? (
                          <strong className="journal-grade">
                            {column.kind === "formative"
                              ? `${assessmentPercent(cell)}%`
                              : cell.grade}
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
      <LessonRecordsTable records={model.lessonOptions} />
      {choosingType && (
        <EntryTypeModal
          close={() => setChoosingType(false)}
          choose={(type) => {
            setChoosingType(false);
            setAdding(type);
          }}
        />
      )}
      {adding && (
        <EntryModal
          title={adding.label}
          initial={{
            type: adding.id === "lesson" ? "lesson" : "assessment",
            date: localDate(),
            timetablePeriod: null,
            topic: "",
            outcome: "",
            metadata:
              adding.id === "lesson"
                ? {}
                : {
                    assessmentType: adding.id,
                    label: adding.label,
                    color: adding.color,
                  },
          }}
          lessonOptions={model.lessonOptions}
          busy={busy}
          close={() => setAdding(null)}
          save={saveEntry}
        />
      )}
      {editor?.mode === "entry" && (
        <EntryModal
          title="Lesson entry"
          initial={editor.column}
          lessonOptions={model.lessonOptions}
          busy={busy}
          close={() => setEditor(null)}
          save={saveEntry}
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

function EntryTypeModal({ close, choose }) {
  const groups = [
    ["basic", "Ieraksta veids"],
    ["semester", "Semestra / gada vērtējumi"],
    ["state", "Valsts pārbaudījumi"],
  ];
  return (
    <Modal title="Jauns ieraksts" close={close} wide>
      <div className="journal-entry-types">
        {groups.map(([group, label]) => (
          <section key={group}>
            <h3>{label}</h3>
            <div>
              {JOURNAL_ENTRY_TYPES.filter((item) => item.group === group).map(
                (item) => (
                  <button key={item.id} onClick={() => choose(item)}>
                    <i style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </button>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function LessonRecordsTable({ records = [] }) {
  return (
    <section className="panel journal-records-card">
      <header>
        <div>
          <h3>Stundu ieraksti</h3>
          <p>Visas mācību stundas, tēmas un sasniedzamie rezultāti.</p>
        </div>
        <span>{records.length} ieraksti</span>
      </header>
      <div className="journal-records-scroll">
        <table>
          <thead>
            <tr>
              <th>Datums</th>
              <th>Pārstunda</th>
              <th>Tēma</th>
              <th>Sasniedzamais rezultāts</th>
              <th>Avots</th>
            </tr>
          </thead>
          <tbody>
            {[...records].reverse().map((record) => (
              <tr key={record.id}>
                <td>{displayDate(record.date)}</td>
                <td>{record.period ? overtimeLabel(record.period) : "—"}</td>
                <td>
                  {record.topic || (
                    <span className="journal-muted">Nav aizpildīts</span>
                  )}
                </td>
                <td>
                  {record.outcome || (
                    <span className="journal-muted">Nav aizpildīts</span>
                  )}
                </td>
                <td>
                  {record.source === "timetable"
                    ? "Stundu saraksts"
                    : "Manuāli"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EntryModal({ title, initial, lessonOptions = [], busy, close, save }) {
  const [form, setForm] = useState({
    id: initial.entryId || initial.id,
    type: initial.type === "assessment" ? "assessment" : "lesson",
    date: isoDate(initial.date),
    timetablePeriod: initial.period ?? initial.timetablePeriod ?? "",
    topic: initial.manualTopic ?? initial.topic ?? "",
    outcome: initial.manualOutcome ?? initial.outcome ?? "",
    source: initial.source || "manual",
    metadata: initial.metadata || {},
  });
  const isLesson = form.type === "lesson";
  const selectLesson = (option) =>
    setForm({
      ...form,
      id: option.entryId,
      source: option.source,
      date: isoDate(option.date),
      timetablePeriod: option.period || "",
      topic: option.manualTopic ?? option.topic ?? "",
      outcome: option.manualOutcome ?? option.outcome ?? "",
      metadata: option.metadata || {},
    });
  return (
    <Modal title={title} close={close} wide>
      <div className="journal-lesson-editor">
        <aside>
          <div className="journal-editor-side-title">
            <span>Datums un pārstunda</span>
            <input
              type="date"
              disabled={form.source === "timetable"}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          {isLesson && lessonOptions.length > 0 ? (
            <div className="journal-lesson-options">
              {lessonOptions.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={form.id === option.entryId ? "active" : ""}
                  onClick={() => selectLesson(option)}
                >
                  <i />
                  <span>
                    <b>{weekday(option.date)}</b>
                    <small>{displayDate(option.date)}</small>
                  </span>
                  <strong>
                    {option.period ? overtimeLabel(option.period) : "Pārstunda"}
                  </strong>
                </button>
              ))}
            </div>
          ) : (
            <label className="journal-period-select">
              <span>Pārstunda</span>
              <select
                value={form.timetablePeriod}
                onChange={(e) =>
                  setForm({
                    ...form,
                    timetablePeriod: e.target.value
                      ? Number(e.target.value)
                      : "",
                  })
                }
              >
                <option value="">Nav norādīta</option>
                {SCHOOL_OVERTIME_BLOCKS.map(
                  (block) => (
                    <option key={block} value={firstLessonOfOvertime(block)}>
                      {block}. pārstunda
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
        </aside>
        <section className="journal-editor-content">
          <div className="journal-section-title">
            <b>
              {isLesson
                ? "Sasniedzamais rezultāts / Tēma"
                : "Ieraksta informācija"}
            </b>
            {form.metadata?.label && <span>{form.metadata.label}</span>}
          </div>
          <label>
            <span>{isLesson ? "Stundas tēma" : "Nosaukums"}</span>
            <input
              autoFocus
              value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder={
                isLesson ? "Ievadi stundas tēmu…" : "Ievadi ieraksta nosaukumu…"
              }
            />
          </label>
          <label>
            <span>{isLesson ? "Sasniedzamais rezultāts" : "Piezīmes"}</span>
            <textarea
              value={form.outcome}
              onChange={(e) => setForm({ ...form, outcome: e.target.value })}
              placeholder={
                isLesson
                  ? "Ko skolēns pēc stundas pratīs un sapratīs?"
                  : "Papildu informācija…"
              }
            />
          </label>
        </section>
      </div>
      <footer className="journal-editor-footer">
        <button className="btn secondary" onClick={close}>
          Atcelt
        </button>
        <button
          className="btn primary"
          disabled={busy || !form.date}
          onClick={() => save(form)}
        >
          <Save size={14} /> {busy ? "Saglabā…" : "Saglabāt"}
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
      <section className="journal-modal-section">
        <div className="journal-section-title">
          <b>Criteria</b>
          <span>{scores.length} criteria</span>
        </div>
        <div className="journal-criteria-list">
          {scores.map((criterion, index) => (
            <label
              className="journal-criterion"
              key={`${criterion.name}-${index}`}
            >
              <span>
                {criterion.name}
                <small>Maximum {criterion.max} points</small>
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
        </div>
      </section>
      <section className="journal-modal-section journal-feedback-grid">
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
        <label className="journal-feedback-full">
          <span>Feedback</span>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </label>
      </section>
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

function compactDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function assessmentPercent(result) {
  if (Number.isFinite(Number(result?.percent)))
    return Math.round(Number(result.percent));
  const scores = result?.scores || result?.criteria || [];
  const total = scores.reduce(
    (sum, item) => sum + Number(item.score ?? item.points ?? 0),
    0,
  );
  const max = scores.reduce(
    (sum, item) => sum + Number(item.max ?? item.maxPoints ?? 0),
    0,
  );
  return max ? Math.round((total / max) * 100) : 0;
}

function displayDate(value) {
  return new Date(value).toLocaleDateString("lv-LV");
}

function weekday(value) {
  const text = new Date(value).toLocaleDateString("lv-LV", {
    weekday: "long",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildJournal({
  course,
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
      attendance =
        entry.type === "lesson"
          ? lessons.find(
              (item) =>
                item.groupId === course.groupId &&
                isoDate(item.startsAt) === entry.date &&
                Number(item.period || 0) ===
                  Number(entry.timetablePeriod || 0) &&
                relatedSubject(item.subject, course.subject),
            )
          : null,
      results = rows
        .map((student) => {
          if (entry.type !== "lesson") return null;
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
      kind: entry.type === "assessment" ? "manual-assessment" : "lesson",
      mark: entry.type === "assessment" ? "V" : "",
      entryColor: entry.metadata?.color || "#a9deeb",
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
  const assessmentColumns = assessments
      .filter((item) => item.groupId === course.groupId)
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
    lessonOptions: lessonColumns.filter((column) => column.kind === "lesson"),
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
