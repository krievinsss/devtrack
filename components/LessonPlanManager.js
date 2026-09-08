"use client";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  GripVertical,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

const blank = () => ({
  topic: "",
  outcome: "",
  type: "lesson",
  plannedDate: "",
  timetablePeriod: null,
  notes: "",
});
export default function LessonPlanManager({
  initialCourses = [],
  groups = [],
}) {
  const [courses, setCourses] = useState(initialCourses),
    [courseId, setCourseId] = useState(initialCourses[0]?.id || ""),
    [items, setItems] = useState(initialCourses[0]?.items || []),
    [creator, setCreator] = useState(false),
    [bulk, setBulk] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const course = courses.find((item) => item.id === courseId);
  const completed = useMemo(
    () => items.filter((item) => item.topic.trim()).length,
    [items],
  );
  function choose(id) {
    setCourseId(id);
    setItems(courses.find((item) => item.id === id)?.items || []);
    setNotice("");
  }
  function patch(index, key, value) {
    setItems((current) =>
      current.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );
  }
  async function save() {
    if (!course || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "savePlan",
          courseId: course.id,
          items: items
            .filter((item) => item.topic.trim())
            .map((item) => ({
              ...item,
              timetablePeriod: item.timetablePeriod
                ? Number(item.timetablePeriod)
                : null,
              plannedDate: item.plannedDate || null,
            })),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save lesson plan");
      setItems(body.items);
      setCourses((current) =>
        current.map((item) =>
          item.id === course.id ? { ...item, items: body.items } : item,
        ),
      );
      setNotice("Lesson plan saved. Journal topics will update automatically.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function createCourse(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "saveCourse",
          groupId: form.get("groupId"),
          subject: form.get("subject"),
          academicYear: form.get("academicYear"),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not create journal");
      const next = { ...body.course, items: [] };
      setCourses((current) => [
        next,
        ...current.filter((item) => item.id !== next.id),
      ]);
      setCourseId(next.id);
      setItems([]);
      setCreator(false);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  function importBulk(rows) {
    setItems((current) => [...current, ...rows]);
    setBulk(false);
  }
  return (
    <div className="lesson-planner">
      <aside className="panel lesson-plan-sidebar">
        <header>
          <div>
            <span className="eyebrow">JOURNALS</span>
            <h3>Subjects</h3>
          </div>
          <button onClick={() => setCreator(true)}>
            <Plus size={15} />
          </button>
        </header>
        <div>
          {courses.map((item) => (
            <button
              key={item.id}
              className={item.id === courseId ? "active" : ""}
              onClick={() => choose(item.id)}
            >
              <BookOpen size={15} />
              <span>
                <b>{item.subject}</b>
                <small>
                  {groups.find((group) => group.id === item.groupId)?.name} ·{" "}
                  {item.items.length} lessons
                </small>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <main className="panel lesson-plan-main">
        {course ? (
          <>
            <header>
              <div>
                <span className="eyebrow">LESSON SEQUENCE</span>
                <h2>{course.subject}</h2>
                <p>
                  {groups.find((group) => group.id === course.groupId)?.name} ·{" "}
                  {completed} planned topics
                </p>
              </div>
              <div>
                <button className="btn secondary" onClick={() => setBulk(true)}>
                  <ClipboardPaste size={14} /> Paste list
                </button>
                <button className="btn primary" onClick={save} disabled={busy}>
                  <Save size={14} /> {busy ? "Saving…" : "Save plan"}
                </button>
              </div>
            </header>
            {notice && <div className="lesson-plan-notice">{notice}</div>}
            <div className="lesson-plan-table">
              <div className="lesson-plan-head">
                <span>#</span>
                <span>Topic and outcome</span>
                <span>Type</span>
                <span>Date</span>
                <span>Period</span>
                <span />
              </div>
              {items.map((item, index) => (
                <div className="lesson-plan-row" key={item.id || index}>
                  <span>
                    <GripVertical size={13} />
                    {index + 1}
                  </span>
                  <div>
                    <input
                      value={item.topic}
                      onChange={(event) =>
                        patch(index, "topic", event.target.value)
                      }
                      placeholder="Lesson topic"
                    />
                    <textarea
                      value={item.outcome || ""}
                      onChange={(event) =>
                        patch(index, "outcome", event.target.value)
                      }
                      placeholder="Learning outcome"
                    />
                  </div>
                  <select
                    value={item.type}
                    onChange={(event) =>
                      patch(index, "type", event.target.value)
                    }
                  >
                    <option value="lesson">Lesson</option>
                    <option value="practical">Practical</option>
                    <option value="formative">Formative</option>
                    <option value="summative">Summative</option>
                    <option value="final">Final</option>
                  </select>
                  <input
                    type="date"
                    value={item.plannedDate || ""}
                    onChange={(event) =>
                      patch(index, "plannedDate", event.target.value)
                    }
                  />
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={item.timetablePeriod || ""}
                    onChange={(event) =>
                      patch(index, "timetablePeriod", event.target.value)
                    }
                  />
                  <button
                    onClick={() =>
                      setItems((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="lesson-add-row"
              onClick={() => setItems((current) => [...current, blank()])}
            >
              <Plus size={14} /> Add lesson topic
            </button>
          </>
        ) : (
          <div className="lesson-plan-empty">
            <BookOpen size={30} />
            <h2>Create the first subject journal</h2>
            <p>
              Choose a group and subject, then add the complete lesson sequence.
            </p>
            <button className="btn primary" onClick={() => setCreator(true)}>
              <Plus size={14} /> New journal
            </button>
          </div>
        )}
      </main>
      {creator && (
        <div className="modal-backdrop" onMouseDown={() => setCreator(false)}>
          <form
            className="journal-create-modal"
            onSubmit={createCourse}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">NEW JOURNAL</span>
                <h2>Group and subject</h2>
              </div>
              <button type="button" onClick={() => setCreator(false)}>
                <X size={17} />
              </button>
            </header>
            <label>
              <span>Group</span>
              <select name="groupId" required>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Subject</span>
              <input
                name="subject"
                required
                placeholder="e.g. EIKT produktu izstrāde"
              />
            </label>
            <label>
              <span>Academic year</span>
              <input name="academicYear" placeholder="2026/2027" />
            </label>
            <footer>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setCreator(false)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                Create journal
              </button>
            </footer>
          </form>
        </div>
      )}
      {bulk && <BulkPaste close={() => setBulk(false)} apply={importBulk} />}
    </div>
  );
}
function BulkPaste({ close, apply }) {
  const [text, setText] = useState(""),
    [rows, setRows] = useState([]);
  function analyze() {
    setRows(parseLessonPlan(text));
  }
  function patch(index, key, value) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }
  function move(index, amount) {
    const target = index + amount;
    if (target < 0 || target >= rows.length) return;
    setRows((current) => {
      const next = [...current],
        [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div
        className="journal-bulk-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">BULK IMPORT</span>
            <h2>Paste lesson topics</h2>
            <p>
              One topic per line, or paste three tab-separated columns: topic,
              outcome and type.
            </p>
          </div>
          <button onClick={close}>
            <X size={17} />
          </button>
        </header>
        {!rows.length ? (
          <textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              "Introduction to databases\tExplains database concepts\tlesson\nRelational models\tCreates table relationships\tpractical"
            }
          />
        ) : (
          <div className="smart-paste-preview">
            <div className="smart-paste-head">
              <span>#</span>
              <span>Lesson topic</span>
              <span>Learning outcome</span>
              <span />
            </div>
            {rows.map((row, index) => (
              <div className="smart-paste-row" key={index}>
                <b>{index + 1}</b>
                <input
                  value={row.topic}
                  onChange={(event) =>
                    patch(index, "topic", event.target.value)
                  }
                />
                <textarea
                  value={row.outcome}
                  onChange={(event) =>
                    patch(index, "outcome", event.target.value)
                  }
                />
                <div>
                  <button onClick={() => move(index, -1)}>
                    <ChevronUp size={13} />
                  </button>
                  <button onClick={() => move(index, 1)}>
                    <ChevronDown size={13} />
                  </button>
                  <button
                    onClick={() =>
                      setRows((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <footer>
          {rows.length > 0 && (
            <button className="btn secondary" onClick={() => setRows([])}>
              Back
            </button>
          )}
          <button className="btn secondary" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={
              rows.length ? rows.some((row) => !row.topic.trim()) : !text.trim()
            }
            onClick={() => (rows.length ? apply(rows) : analyze())}
          >
            <ClipboardPaste size={14} />{" "}
            {rows.length ? `Add ${rows.length} lessons` : "Create preview"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function parseLessonPlan(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cleaned = line.replace(/^\s*\d+[.)]\s*/, "");
      let parts = cleaned.includes("\t")
        ? cleaned.split("\t")
        : cleaned.includes("|")
          ? cleaned.split("|")
          : cleaned.split(/\s+[–—-]\s+/, 2);
      parts = parts.map((value) => value.trim()).filter(Boolean);
      return {
        ...blank(),
        topic: parts[0] || "",
        outcome: parts[1] || "",
        type: [
          "lesson",
          "practical",
          "formative",
          "summative",
          "final",
        ].includes(parts[2])
          ? parts[2]
          : "lesson",
      };
    });
}
