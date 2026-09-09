"use client";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  Clock3,
  Play,
  TimerReset,
  UsersRound,
  X,
} from "lucide-react";
import { overtimeLabel } from "@/lib/schoolPeriods";

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

export default function TimeSessionModal({
  classrooms,
  timetableBlocks,
  onClose,
  onCreated,
}) {
  const [now] = useState(() => Date.now()),
    ranked = useMemo(
      () =>
        [...timetableBlocks].sort(
          (a, b) => distance(a, now) - distance(b, now),
        ),
      [timetableBlocks, now],
    );
  const [blockId, setBlockId] = useState(ranked[0]?.id || ""),
    [classroomId, setClassroomId] = useState(
      () => matchingRoom(classrooms, ranked[0])?.id || classrooms[0]?.id || "",
    ),
    [lateAfterMinutes, setLateAfterMinutes] = useState(10),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const selected = ranked.find((block) => block.id === blockId) || ranked[0];
  function selectBlock(id) {
    setBlockId(id);
    const block = ranked.find((item) => item.id === id),
      room = matchingRoom(classrooms, block);
    if (room) setClassroomId(room.id);
  }
  async function submit(event) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const data = await request({
        action: "open",
        classroomId,
        groupId: selected.groupId,
        title: selected.subject,
        startsAt: selected.startsAt,
        endsAt: selected.endsAt,
        lateAfterMinutes: Number(lateAfterMinutes),
        timetableLessons: selected.lessons,
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
        className="attendance-modal timetable-attendance-modal"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">Timetable attendance</span>
            <h2>Open scheduled lessons</h2>
            <p>
              Izvēlies pārstundu. Tās abas mācību stundas tiks sasaistītas ar
              vienu galda pierakstīšanos.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {error && <div className="attendance-form-error">{error}</div>}
        <div className="tt-attendance-body">
          <div className="tt-attendance-blocks">
            {ranked.map((block) => (
              <button
                type="button"
                key={block.id}
                className={selected?.id === block.id ? "selected" : ""}
                onClick={() => selectBlock(block.id)}
              >
                <span className="tt-attendance-date">
                  <CalendarClock size={16} />
                  {formatDate(block.date)}
                </span>
                <div>
                  <b>{block.subject}</b>
                  <small>
                    <UsersRound size={12} />
                    {block.group}
                    <Clock3 size={12} />
                    {block.start}–{block.end}
                  </small>
                </div>
                <strong>
                  {block.lessonCount}{" "}
                  {block.lessonCount === 1 ? "lesson" : "lessons"}
                </strong>
              </button>
            ))}
          </div>
          {selected && (
            <section className="tt-attendance-summary">
              <span>Selected block</span>
              <h3>{selected.subject}</h3>
              <p>
                {selected.group} · {selected.room || "Room from DevTrack"} ·{" "}
                {selected.start}–{selected.end}
              </p>
              <div>
                {selected.lessons.map((lesson) => (
                  <span key={lesson.id}>
                    {overtimeLabel(lesson.period)}
                    <small>
                      {lesson.start}–{lesson.end}
                    </small>
                  </span>
                ))}
              </div>
            </section>
          )}
          <div className="attendance-modal-grid timetable-fields">
            <label>
              <span>DevTrack classroom</span>
              <select
                required
                value={classroomId}
                onChange={(event) => setClassroomId(event.target.value)}
              >
                {classrooms.map((room) => (
                  <option value={room.id} key={room.id}>
                    {room.name} · {room.desks.length} desks
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Late threshold</span>
              <div className="attendance-late-input">
                <TimerReset size={16} />
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={lateAfterMinutes}
                  onChange={(event) => setLateAfterMinutes(event.target.value)}
                />
                <small>minutes</small>
              </div>
            </label>
          </div>
        </div>
        {(!classrooms.length || !ranked.length) && (
          <div className="attendance-form-error">
            No matching timetable lessons or classrooms are available.
          </div>
        )}
        <footer>
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving || !classrooms.length || !selected}
          >
            <Play size={14} />
            {saving
              ? "Opening…"
              : `Open ${selected?.lessonCount || 0} lesson${selected?.lessonCount === 1 ? "" : "s"}`}
          </button>
        </footer>
      </form>
    </div>
  );
}
function matchingRoom(classrooms, block) {
  const target = normalize(block?.room);
  return target
    ? classrooms.find(
        (room) =>
          normalize(room.name) === target ||
          normalize(room.name).includes(target) ||
          target.includes(normalize(room.name)),
      )
    : null;
}
function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("lv-LV")
    .replace(/[^a-z0-9āčēģīķļņšūž]+/gi, "");
}
function distance(block, now) {
  const start = new Date(block.startsAt).getTime(),
    end = new Date(block.endsAt).getTime();
  return now >= start && now <= end ? -1 : Math.abs(start - now);
}
function formatDate(value) {
  return new Intl.DateTimeFormat("lv-LV", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
