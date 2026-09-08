"use client";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Filter,
  Search,
  Settings2,
  UserX,
} from "lucide-react";
import { useMemo, useState } from "react";

export default function TeacherJournal({
  courses = [],
  groups = [],
  students = [],
  lessons = [],
  assessments = [],
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id || ""),
    [semester, setSemester] = useState("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(null);
  const course =
    courses.find((item) => item.id === courseId) || courses[0] || null;
  const model = useMemo(
    () =>
      buildJournal({
        course,
        courses,
        groups,
        students,
        lessons,
        assessments,
        semester,
      }),
    [course, courses, groups, students, lessons, assessments, semester],
  );
  if (!course)
    return (
      <section className="panel journal-empty">
        <BookOpen size={32} />
        <h2>Create a subject journal first</h2>
        <p>
          Open Lesson Planning, choose a group and subject, and add the planned
          lesson topics.
        </p>
        <Link href="/lesson-planning" className="btn primary">
          Create lesson plan
        </Link>
      </section>
    );
  return (
    <div className="teacher-journal">
      <section className="panel journal-toolbar">
        <label className="journal-course-select">
          <span>Journal</span>
          <select
            value={course.id}
            onChange={(event) => {
              setCourseId(event.target.value);
              setSelected(null);
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
          <Link href="/lesson-planning" className="btn secondary">
            <Settings2 size={14} /> Lesson plan
          </Link>
        </div>
      </section>
      <section className="journal-summary">
        <div>
          <CalendarDays size={17} />
          <span>
            <b>
              {model.columns.filter((item) => item.kind === "lesson").length}
            </b>{" "}
            lessons
          </span>
        </div>
        <div>
          <ClipboardCheck size={17} />
          <span>
            <b>
              {model.columns.filter((item) => item.kind !== "lesson").length}
            </b>{" "}
            assessments
          </span>
        </div>
        <div>
          <BookOpen size={17} />
          <span>
            <b>{course.items.length}</b> planned topics
          </span>
        </div>
        <div>
          <Clock3 size={17} />
          <span>
            <b>{model.averageAttendance}%</b> attendance
          </span>
        </div>
      </section>
      <section className="panel journal-sheet-card">
        <header>
          <div>
            <span className="eyebrow">
              {groups.find((group) => group.id === course.groupId)?.name}
            </span>
            <h2>{course.subject}</h2>
            <p>
              {course.academicYear || "Current academic year"} · topics and
              results synchronize automatically
            </p>
          </div>
          <label>
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search student…"
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
                    onClick={() => setSelected(column)}
                  >
                    <span>{shortDate(column.date)}</span>
                    <b>{column.period || typeMark(column.kind)}</b>
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
                      <button
                        onClick={() => setSelected({ kind: "student", ...row })}
                      >
                        <span>{initials(row.name)}</span>
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
                          className={`journal-cell ${column.kind} ${cell?.status || ""}`}
                          onClick={() =>
                            setSelected({ ...column, focusStudent: row })
                          }
                        >
                          {cell ? (
                            <CellValue cell={cell} kind={column.kind} />
                          ) : column.future ? (
                            <span className="journal-future-dot">·</span>
                          ) : (
                            <span />
                          )}
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
              <h3>No journal entries yet</h3>
              <p>
                Open an attendance lesson or schedule an assessment to create
                the first column automatically.
              </p>
            </div>
          )}
        </div>
      </section>
      {selected && (
        <JournalInspector
          item={selected}
          course={course}
          close={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function CellValue({ cell, kind }) {
  if (kind !== "lesson")
    return <strong className="journal-grade">{cell.grade ?? "—"}</strong>;
  if (cell.status === "absent")
    return <strong className="journal-absence">n</strong>;
  if (cell.status === "excused")
    return <strong className="journal-excused">nᶜ</strong>;
  if (cell.status === "late")
    return (
      <strong className="journal-late">
        k<small>{cell.minutesLate || ""}</small>
      </strong>
    );
  return <i className="journal-present" />;
}
function JournalInspector({ item, course, close }) {
  return (
    <aside className="journal-inspector">
      <header>
        <button onClick={close}>
          <ChevronRight size={18} />
        </button>
        <div>
          <span className="eyebrow">
            {item.kind === "student" ? "STUDENT" : item.kind.toUpperCase()}
          </span>
          <h2>{item.kind === "student" ? item.name : item.title}</h2>
          <p>
            {item.date
              ? new Date(item.date).toLocaleString("lv-LV", {
                  dateStyle: "long",
                  timeStyle: item.kind === "lesson" ? "short" : undefined,
                })
              : course.subject}
          </p>
        </div>
      </header>
      {item.kind === "student" ? (
        <div className="journal-student-inspector">
          <div>
            <b>{item.attendance}%</b>
            <span>Attendance</span>
          </div>
          <div>
            <b>{item.averageGrade || "—"}</b>
            <span>Average grade</span>
          </div>
          <div>
            <b>{item.late}</b>
            <span>Late lessons</span>
          </div>
        </div>
      ) : (
        <>
          <section>
            <span className="eyebrow">LESSON CONTENT</span>
            <h3>
              {item.topic ||
                (item.kind === "lesson" ? "Topic not planned yet" : item.title)}
            </h3>
            <p>
              {item.outcome || "Add the learning outcome in Lesson Planning."}
            </p>
            {item.planType && <em>{item.planType}</em>}
          </section>
          {item.focusStudent && (
            <section>
              <span className="eyebrow">SELECTED STUDENT</span>
              <h3>{item.focusStudent.name}</h3>
              <p>
                {cellDescription(
                  item.results.find(
                    (result) => result.studentId === item.focusStudent.id,
                  ),
                  item.kind,
                )}
              </p>
            </section>
          )}
          <section>
            <span className="eyebrow">COLUMN SUMMARY</span>
            <div className="journal-inspector-results">
              <b>{item.results.length}</b>
              <span>
                {item.kind === "lesson"
                  ? "attendance records"
                  : "published grades"}
              </span>
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
function cellDescription(cell, kind) {
  if (!cell) return "No result has been recorded yet.";
  if (kind !== "lesson") return `Grade ${cell.grade} · ${cell.percent ?? 0}%`;
  if (cell.status === "late")
    return `Late by ${cell.minutesLate || 0} minutes.`;
  return `Attendance status: ${cell.status}.`;
}

function buildJournal({
  course,
  courses,
  groups,
  students,
  lessons,
  assessments,
  semester,
}) {
  if (!course) return { columns: [], rows: [], averageAttendance: 0 };
  const group = groups.find((item) => item.id === course.groupId),
    members = new Set(group?.studentIds || []),
    rows = students
      .filter((student) => members.has(student.id))
      .map((student) => ({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        email: student.email,
      }));
  const groupCourses = courses.filter(
      (item) => item.groupId === course.groupId,
    ),
    subject = normalize(course.subject);
  let lessonColumns = lessons
    .filter(
      (item) =>
        item.groupId === course.groupId &&
        (normalize(item.subject) === subject || groupCourses.length === 1),
    )
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    .map((lesson, index) => {
      const date = isoDate(lesson.startsAt),
        plan =
          course.items.find(
            (item) =>
              item.plannedDate === date &&
              (!item.timetablePeriod ||
                Number(item.timetablePeriod) === Number(lesson.period)),
          ) || course.items[index];
      return {
        ...lesson,
        kind: "lesson",
        date: lesson.startsAt,
        title: plan?.topic || lesson.subject,
        topic: plan?.topic || "",
        outcome: plan?.outcome || "",
        planType: plan?.type || "lesson",
        future: new Date(lesson.startsAt) > new Date(),
      };
    });
  let assessmentColumns = assessments
    .filter(
      (item) =>
        item.groupId === course.groupId &&
        (groupCourses.length === 1 || relatedAssessment(course, item)),
    )
    .map((item) => ({
      ...item,
      date: item.date,
      topic: item.title,
      outcome: "",
      future: new Date(item.date) > new Date(),
      results: (item.results || []).map((result) => ({
        studentId: result.studentId,
        grade: result.grade,
        percent: result.percent,
      })),
    }));
  let columns = [...lessonColumns, ...assessmentColumns]
    .filter((item) => semesterMatch(item.date, semester))
    .sort(
      (a, b) =>
        new Date(a.date) - new Date(b.date) ||
        kindOrder(a.kind) - kindOrder(b.kind),
    );
  for (const row of rows) {
    const attendance = lessonColumns.flatMap((column) =>
        column.results.filter((result) => result.studentId === row.id),
      ),
      grades = assessmentColumns
        .flatMap((column) =>
          column.results
            .filter((result) => result.studentId === row.id)
            .map((result) => Number(result.grade)),
        )
        .filter(Number.isFinite),
      attended = attendance.filter((item) =>
        ["present", "late"].includes(item.status),
      ).length,
      counted = attendance.filter((item) => item.status !== "excused").length;
    row.attendance = counted ? Math.round((attended / counted) * 100) : 0;
    row.averageGrade = grades.length
      ? Number(
          (
            grades.reduce((sum, value) => sum + value, 0) / grades.length
          ).toFixed(1),
        )
      : 0;
    row.late = attendance.filter((item) => item.status === "late").length;
  }
  const allAttendance = lessonColumns.flatMap((column) => column.results),
    attended = allAttendance.filter((item) =>
      ["present", "late"].includes(item.status),
    ).length,
    counted = allAttendance.filter((item) => item.status !== "excused").length;
  return {
    columns,
    rows,
    averageAttendance: counted ? Math.round((attended / counted) * 100) : 0,
  };
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
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function relatedAssessment(course, assessment) {
  const subject = normalize(course.subject),
    assignment = normalize(assessment.assignmentTitle),
    title = normalize(assessment.title);
  if (
    (assignment &&
      (assignment.includes(subject) || subject.includes(assignment))) ||
    (title && (title.includes(subject) || subject.includes(title)))
  )
    return true;
  return course.items.some(
    (item) =>
      item.type === assessment.kind &&
      (!item.plannedDate ||
        item.plannedDate === isoDate(assessment.date) ||
        normalize(item.topic) === title),
  );
}
function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}
function shortDate(value) {
  return new Date(value)
    .toLocaleDateString("lv-LV", { day: "2-digit", month: "2-digit" })
    .replaceAll(".", "/");
}
function typeMark(kind) {
  return { formative: "F", summative: "S", final: "G" }[kind] || "";
}
function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
