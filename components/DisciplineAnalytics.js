"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarCheck,
  Clock3,
  GraduationCap,
  Search,
  TrendingUp,
  UserCheck,
  X,
} from "lucide-react";

const PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "School year" },
  { value: "all", label: "All time" },
];

export default function DisciplineAnalytics({
  groups = [],
  students = [],
  attendance = [],
  grades = [],
  schoolWide = false,
}) {
  const [groupId, setGroupId] = useState(
    schoolWide ? "all" : groups[0]?.id || "all",
  );
  const [period, setPeriod] = useState("90");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("risk");
  const [selected, setSelected] = useState(null);
  const model = useMemo(
    () => buildModel({ groups, students, attendance, grades, groupId, period }),
    [groups, students, attendance, grades, groupId, period],
  );
  const rows = model.students
    .filter((row) =>
      `${row.name} ${row.email}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(sorters[sort]);

  return (
    <div className="discipline-dashboard">
      <section className="panel discipline-filters">
        <label>
          <span>Group</span>
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          >
            {schoolWide && <option value="all">All groups</option>}
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Period</span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            {PERIODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="discipline-scope">
          <BarChart3 size={15} />
          <div>
            <b>
              {groupId === "all"
                ? "School overview"
                : groups.find((group) => group.id === groupId)?.name}
            </b>
            <small>
              {model.students.length} students · {model.attendance.length}{" "}
              tracked lessons
            </small>
          </div>
        </div>
      </section>

      <section className="discipline-kpis">
        <Kpi
          icon={CalendarCheck}
          label="Attendance"
          value={`${model.kpis.attendance}%`}
          detail={`${model.kpis.attended}/${model.kpis.lessons} lessons`}
          tone="green"
        />
        <Kpi
          icon={Clock3}
          label="Late arrivals"
          value={`${model.kpis.lateRate}%`}
          detail={`${model.kpis.late} late lessons`}
          tone="amber"
        />
        <Kpi
          icon={GraduationCap}
          label="Average grade"
          value={model.kpis.averageGrade || "—"}
          detail={`${model.kpis.grades} results`}
          tone="violet"
        />
        <Kpi
          icon={AlertTriangle}
          label="Need attention"
          value={model.kpis.atRisk}
          detail="students with warning signs"
          tone="red"
        />
      </section>

      <section className="discipline-chart-grid">
        <div className="panel discipline-chart-card">
          <ChartTitle
            title="Attendance momentum"
            subtitle="Weekly attendance and punctuality"
          />
          <WeeklyChart weeks={model.weeks} />
        </div>
        <div className="panel discipline-chart-card">
          <ChartTitle
            title="Grades vs attendance"
            subtitle="Each dot represents one student"
          />
          <CorrelationChart rows={model.students} />
        </div>
        <div className="panel discipline-chart-card discipline-status-card">
          <ChartTitle
            title="Lesson outcomes"
            subtitle={`${model.kpis.lessons} concrete lessons`}
          />
          <Donut kpis={model.kpis} />
        </div>
      </section>

      {groupId === "all" && (
        <section className="panel discipline-groups">
          <ChartTitle
            title="Group comparison"
            subtitle="Attendance and average academic result"
          />
          <div>
            {model.groupRows.map((group) => (
              <button key={group.id} onClick={() => setGroupId(group.id)}>
                <span>
                  <b>{group.name}</b>
                  <small>{group.students} students</small>
                </span>
                <div className="group-bars">
                  <i style={{ width: `${group.attendance}%` }} />
                  <em style={{ width: `${group.grade * 10}%` }} />
                </div>
                <strong>
                  {group.attendance}%<small>{group.grade || "—"}</small>
                </strong>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel discipline-table-card">
        <header>
          <div>
            <span className="eyebrow">STUDENT OVERVIEW</span>
            <h2>Discipline radar</h2>
            <p>
              Open a student to see their complete attendance and grade
              timeline.
            </p>
          </div>
          <div className="discipline-table-tools">
            <label>
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search student…"
              />
            </label>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="risk">Highest risk</option>
              <option value="attendance">Lowest attendance</option>
              <option value="late">Most late</option>
              <option value="grade">Lowest grade</option>
              <option value="name">Name</option>
            </select>
          </div>
        </header>
        <div className="discipline-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Attendance</th>
                <th>Late</th>
                <th>Average grade</th>
                <th>Trend</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} onClick={() => setSelected(row)}>
                  <td>
                    <div className="discipline-student">
                      <span>{initials(row.name)}</span>
                      <div>
                        <b>{row.name}</b>
                        <small>{row.groupNames.join(" · ")}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <MetricBar
                      value={row.attendanceRate}
                      tone={
                        row.attendanceRate < 70
                          ? "red"
                          : row.attendanceRate < 85
                            ? "amber"
                            : "green"
                      }
                    />
                  </td>
                  <td>
                    <b className={row.lateRate > 25 ? "metric-danger" : ""}>
                      {row.lateRate}%
                    </b>
                    <small>
                      {row.late} times · avg {row.avgLate} min
                    </small>
                  </td>
                  <td>
                    <b>{row.averageGrade || "—"}</b>
                    <small>{row.gradeCount} results</small>
                  </td>
                  <td>
                    <Trend value={row.gradeTrend} />
                  </td>
                  <td>
                    <RiskBadge row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="discipline-empty">
              No student data matches this view.
            </div>
          )}
        </div>
      </section>
      {selected && (
        <StudentDrawer row={selected} close={() => setSelected(null)} />
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, detail, tone }) {
  return (
    <article className={`discipline-kpi ${tone}`}>
      <span>
        <Icon size={19} />
      </span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        <em>{detail}</em>
      </div>
    </article>
  );
}
function ChartTitle({ title, subtitle }) {
  return (
    <header className="discipline-chart-title">
      <div>
        <h3>{title}</h3>
        <small>{subtitle}</small>
      </div>
    </header>
  );
}
function MetricBar({ value, tone }) {
  return (
    <div className="discipline-m-bar">
      <div>
        <i className={tone} style={{ width: `${value}%` }} />
      </div>
      <b>{value}%</b>
    </div>
  );
}
function Trend({ value }) {
  if (!value) return <span className="trend flat">—</span>;
  return (
    <span className={`trend ${value > 0 ? "up" : "down"}`}>
      {value > 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
      {Math.abs(value).toFixed(1)}
    </span>
  );
}
function RiskBadge({ row }) {
  const labels = {
    high: "High risk",
    medium: "Watch",
    low: "On track",
    unknown: "No data",
  };
  return <span className={`risk-badge ${row.risk}`}>{labels[row.risk]}</span>;
}

function WeeklyChart({ weeks }) {
  const points = weeks
    .map(
      (week, index) =>
        `${8 + index * (284 / Math.max(1, weeks.length - 1))},${112 - week.attendance}`,
    )
    .join(" ");
  return (
    <div className="weekly-chart">
      <div className="chart-y">
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>
      <svg viewBox="0 0 300 122" preserveAspectRatio="none">
        <defs>
          <linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="12" x2="300" y2="12" />
        <line x1="0" y1="62" x2="300" y2="62" />
        <line x1="0" y1="112" x2="300" y2="112" />
        <polygon
          points={`${points} 292,112 8,112`}
          fill="url(#attendanceFill)"
        />
        <polyline points={points} />
        {weeks.map((week, index) => (
          <circle
            key={week.key}
            cx={8 + index * (284 / Math.max(1, weeks.length - 1))}
            cy={112 - week.attendance}
            r="3"
          >
            <title>
              {week.label}: {week.attendance}%
            </title>
          </circle>
        ))}
      </svg>
      <div className="chart-x">
        {weeks.map((week) => (
          <span key={week.key}>{week.label}</span>
        ))}
      </div>
    </div>
  );
}
function CorrelationChart({ rows }) {
  const plotted = rows.filter((row) => row.lessons && row.averageGrade);
  return (
    <div className="correlation-chart">
      <div className="correlation-y">
        <span>10</span>
        <span>5</span>
        <span>1</span>
      </div>
      <div className="correlation-plot">
        {[25, 50, 75].map((x) => (
          <i key={x} style={{ left: `${x}%` }} />
        ))}
        {plotted.map((row) => (
          <button
            key={row.id}
            style={{
              left: `${Math.max(2, Math.min(98, row.attendanceRate))}%`,
              bottom: `${Math.max(2, Math.min(98, ((row.averageGrade - 1) / 9) * 100))}%`,
            }}
            className={row.risk}
          >
            <span>{initials(row.name)}</span>
            <b>{row.name}</b>
            <small>
              {row.attendanceRate}% · {row.averageGrade}
            </small>
          </button>
        ))}
      </div>
      <div className="correlation-x">
        <span>0% attendance</span>
        <span>100% attendance</span>
      </div>
      {!plotted.length && (
        <div className="chart-no-data">
          Grades and attendance will appear here.
        </div>
      )}
    </div>
  );
}
function Donut({ kpis }) {
  const total = Math.max(1, kpis.lessons),
    present = (kpis.present / total) * 100,
    late = (kpis.late / total) * 100,
    absent = (kpis.absent / total) * 100;
  return (
    <div className="discipline-donut-wrap">
      <div
        className="discipline-donut"
        style={{
          background: `conic-gradient(var(--green) 0 ${present}%,var(--amber) ${present}% ${present + late}%,var(--danger) ${present + late}% ${present + late + absent}%,var(--blue) ${present + late + absent}% 100%)`,
        }}
      >
        <div>
          <b>{kpis.attendance}%</b>
          <small>attended</small>
        </div>
      </div>
      <div className="donut-legend">
        {[
          ["Present", kpis.present, "green"],
          ["Late", kpis.late, "amber"],
          ["Absent", kpis.absent, "red"],
          ["Excused", kpis.excused, "blue"],
        ].map(([label, value, tone]) => (
          <span key={label}>
            <i className={tone} />
            <b>{value}</b>
            <small>{label}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

function StudentDrawer({ row, close }) {
  return (
    <div className="discipline-drawer-backdrop" onMouseDown={close}>
      <aside
        className="discipline-drawer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="discipline-profile-avatar">{initials(row.name)}</div>
          <div>
            <span className="eyebrow">STUDENT PROFILE</span>
            <h2>{row.name}</h2>
            <p>
              {row.groupNames.join(" · ")} · {row.email}
            </p>
          </div>
          <button onClick={close}>
            <X size={19} />
          </button>
        </header>
        <div className="discipline-profile-kpis">
          <div>
            <b>{row.attendanceRate}%</b>
            <span>Attendance</span>
          </div>
          <div>
            <b>{row.lateRate}%</b>
            <span>Late rate</span>
          </div>
          <div>
            <b>{row.averageGrade || "—"}</b>
            <span>Average grade</span>
          </div>
          <div>
            <b>{row.riskScore}</b>
            <span>Risk score</span>
          </div>
        </div>
        <section>
          <h3>Why this status?</h3>
          <div className="risk-reasons">
            {row.reasons.length ? (
              row.reasons.map((reason) => (
                <span key={reason}>
                  <AlertTriangle size={13} />
                  {reason}
                </span>
              ))
            ) : (
              <span className="good">
                <UserCheck size={13} />
                No warning signs in this period
              </span>
            )}
          </div>
        </section>
        <section>
          <h3>Recent timeline</h3>
          <div className="student-discipline-timeline">
            {row.timeline.slice(0, 30).map((item) => (
              <article key={item.id} className={item.type}>
                <span>
                  {item.type === "grade" ? (
                    <GraduationCap size={15} />
                  ) : item.status === "late" ? (
                    <Clock3 size={15} />
                  ) : (
                    <CalendarCheck size={15} />
                  )}
                </span>
                <div>
                  <b>{item.title}</b>
                  <small>
                    {new Date(item.date).toLocaleDateString("lv-LV", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </small>
                </div>
                <strong>
                  {item.type === "grade" ? item.grade : item.status}
                </strong>
              </article>
            ))}
            {!row.timeline.length && (
              <p className="discipline-empty">No records in this period.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function buildModel({ groups, students, attendance, grades, groupId, period }) {
  const from = period === "all" ? 0 : Date.now() - Number(period) * 86400000;
  const selectedGroups =
    groupId === "all" ? groups : groups.filter((group) => group.id === groupId);
  const groupSet = new Set(selectedGroups.map((group) => group.id));
  const studentSet = new Set(
    selectedGroups.flatMap((group) => group.studentIds || []),
  );
  const filteredAttendance = attendance.filter(
    (item) =>
      groupSet.has(item.groupId) &&
      studentSet.has(item.studentId) &&
      new Date(item.startsAt).getTime() >= from,
  );
  const filteredGrades = grades.filter(
    (item) =>
      groupSet.has(item.groupId) &&
      studentSet.has(item.studentId) &&
      new Date(item.date).getTime() >= from,
  );
  const rows = students
    .filter((student) => studentSet.has(student.id))
    .map((student) =>
      studentRow(student, selectedGroups, filteredAttendance, filteredGrades),
    );
  const counts = countAttendance(filteredAttendance),
    gradeValues = filteredGrades
      .map((item) => item.grade)
      .filter(Number.isFinite);
  const kpis = {
    ...counts,
    attendance:
      counts.lessons - counts.excused
        ? Math.round(
            (counts.attended / (counts.lessons - counts.excused)) * 100,
          )
        : 0,
    lateRate: counts.attended
      ? Math.round((counts.late / counts.attended) * 100)
      : 0,
    averageGrade: gradeValues.length
      ? (
          gradeValues.reduce((sum, value) => sum + value, 0) /
          gradeValues.length
        ).toFixed(1)
      : null,
    grades: gradeValues.length,
    atRisk: rows.filter((row) => row.risk === "high").length,
  };
  return {
    students: rows,
    attendance: filteredAttendance,
    grades: filteredGrades,
    kpis,
    weeks: weeklyRows(filteredAttendance),
    groupRows: selectedGroups.map((group) => {
      const members = new Set(group.studentIds || []),
        a = filteredAttendance.filter((item) => item.groupId === group.id),
        g = filteredGrades
          .filter((item) => item.groupId === group.id)
          .map((item) => item.grade);
      const c = countAttendance(a);
      return {
        id: group.id,
        name: group.name,
        students: [...members].length,
        attendance:
          c.lessons - c.excused
            ? Math.round((c.attended / (c.lessons - c.excused)) * 100)
            : 0,
        grade: g.length
          ? Number((g.reduce((s, v) => s + v, 0) / g.length).toFixed(1))
          : 0,
      };
    }),
  };
}

function studentRow(student, groups, attendance, grades) {
  const a = attendance.filter((item) => item.studentId === student.id),
    g = grades
      .filter((item) => item.studentId === student.id)
      .sort((x, y) => new Date(x.date) - new Date(y.date)),
    counts = countAttendance(a),
    attendanceRate =
      counts.lessons - counts.excused
        ? Math.round(
            (counts.attended / (counts.lessons - counts.excused)) * 100,
          )
        : 0,
    lateRate = counts.attended
      ? Math.round((counts.late / counts.attended) * 100)
      : 0,
    gradeValues = g.map((item) => item.grade),
    averageGrade = gradeValues.length
      ? Number(
          (gradeValues.reduce((s, v) => s + v, 0) / gradeValues.length).toFixed(
            1,
          ),
        )
      : 0,
    recent = gradeValues.slice(-3),
    previous = gradeValues.slice(-6, -3),
    gradeTrend =
      recent.length && previous.length
        ? recent.reduce((s, v) => s + v, 0) / recent.length -
          previous.reduce((s, v) => s + v, 0) / previous.length
        : 0,
    reasons = [];
  let riskScore = 0;
  if (counts.lessons && attendanceRate < 70) {
    riskScore += 45;
    reasons.push(`Attendance is only ${attendanceRate}%`);
  } else if (counts.lessons && attendanceRate < 85) {
    riskScore += 22;
    reasons.push(`Attendance is below 85%`);
  }
  if (lateRate >= 30) {
    riskScore += 30;
    reasons.push(`Late to ${lateRate}% of attended lessons`);
  } else if (lateRate >= 15) {
    riskScore += 15;
    reasons.push(`Frequent late arrivals (${lateRate}%)`);
  }
  if (averageGrade && averageGrade < 4) {
    riskScore += 35;
    reasons.push(`Average grade is ${averageGrade}`);
  } else if (averageGrade && averageGrade < 6) {
    riskScore += 15;
    reasons.push(`Average grade is below 6`);
  }
  if (gradeTrend <= -1) {
    riskScore += 15;
    reasons.push(`Grades dropped by ${Math.abs(gradeTrend).toFixed(1)}`);
  }
  const risk =
    !counts.lessons && !gradeValues.length
      ? "unknown"
      : riskScore >= 45
        ? "high"
        : riskScore >= 20
          ? "medium"
          : "low";
  return {
    id: student.id,
    name: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
    email: student.email,
    groupNames: groups
      .filter((group) => (group.studentIds || []).includes(student.id))
      .map((group) => group.name),
    ...counts,
    attendanceRate,
    lateRate,
    avgLate: counts.late
      ? Math.round(
          a
            .filter((item) => item.status === "late")
            .reduce((s, item) => s + item.minutesLate, 0) / counts.late,
        )
      : 0,
    averageGrade,
    gradeCount: gradeValues.length,
    gradeTrend,
    risk,
    riskScore: Math.min(100, riskScore),
    reasons,
    timeline: [
      ...a.map((item) => ({
        ...item,
        type: "attendance",
        date: item.startsAt,
      })),
      ...g.map((item) => ({ ...item, type: "grade" })),
    ].sort((x, y) => new Date(y.date) - new Date(x.date)),
  };
}
function countAttendance(items) {
  const counts = {
    lessons: items.length,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    attended: 0,
  };
  for (const item of items)
    if (counts[item.status] !== undefined) counts[item.status]++;
  counts.attended = counts.present + counts.late;
  return counts;
}
function weeklyRows(attendance) {
  const now = new Date(),
    rows = [];
  for (let offset = 7; offset >= 0; offset--) {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() - offset * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const items = attendance.filter((item) => {
        const time = new Date(item.startsAt);
        return time >= start && time <= end;
      }),
      c = countAttendance(items);
    rows.push({
      key: start.toISOString(),
      label: start.toLocaleDateString("lv-LV", {
        day: "2-digit",
        month: "short",
      }),
      attendance:
        c.lessons - c.excused
          ? Math.round((c.attended / (c.lessons - c.excused)) * 100)
          : 0,
    });
  }
  return rows;
}
const sorters = {
  risk: (a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name),
  attendance: (a, b) => a.attendanceRate - b.attendanceRate,
  late: (a, b) => b.lateRate - a.lateRate,
  grade: (a, b) => (a.averageGrade || 99) - (b.averageGrade || 99),
  name: (a, b) => a.name.localeCompare(b.name),
};
function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
