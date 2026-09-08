"use client";

import {
  Armchair,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export default function StudentCheckInGate({ enabled }) {
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch(`/api/attendance?t=${Date.now()}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (response.ok && body.ok) {
        setRequirement(body.attendance?.checkInRequired || null);
        if (!body.attendance?.checkInRequired) setError("");
      }
    } catch {
      // A temporary network error must not lock a student out of DevTrack.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      if (!alive || document.visibilityState !== "visible") return;
      await refresh();
    };
    load();
    const timer = setInterval(load, 8_000);
    const visible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", load);
    };
  }, [enabled, refresh]);

  async function chooseDesk(desk) {
    if (loading || desk.occupied) return;
    setLoading(desk.id);
    setError("");
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkInDesk", deskId: desk.id }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok)
        throw new Error(body.error || "Neizdevās reģistrēt galdu.");
      setRequirement(null);
      window.dispatchEvent(new Event("devtrack-attendance-refresh"));
    } catch (cause) {
      setError(cause.message || "Neizdevās reģistrēt galdu.");
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!enabled || !requirement) return null;
  const { classroom, session, desks } = requirement;
  const width = Math.max(1, Number(classroom.canvasWidth));
  const height = Math.max(1, Number(classroom.canvasHeight));

  return (
    <div className="student-checkin-gate" role="dialog" aria-modal="true">
      <section className="student-checkin-modal">
        <header>
          <div className="student-checkin-icon">
            <Armchair size={25} />
          </div>
          <div>
            <span className="eyebrow">STUNDA IR ATVĒRTA</span>
            <h2>Atzīmējies pie sava galda</h2>
            <p>
              Izvēlies galdu, pie kura šobrīd sēdi. Pēc reģistrācijas varēsi
              turpināt izmantot DevTrack.
            </p>
          </div>
        </header>
        <div className="student-checkin-meta">
          <span>
            <MapPin size={14} /> {classroom.name}
          </span>
          <span>
            <Clock3 size={14} /> {session.title}
          </span>
          <strong>
            {desks.filter((desk) => !desk.occupied).length} brīvi galdi
          </strong>
        </div>
        {error && <div className="student-checkin-error">{error}</div>}
        <div className="student-checkin-map-shell">
          <div className="student-checkin-board">KLASES PRIEKŠA</div>
          <div
            className="student-checkin-map"
            style={{ aspectRatio: `${width} / ${height}` }}
          >
            {desks.map((desk) => (
              <button
                key={desk.id}
                type="button"
                disabled={desk.occupied || Boolean(loading)}
                className={desk.occupied ? "occupied" : "available"}
                style={{
                  left: `${(Number(desk.x) / width) * 100}%`,
                  top: `${(Number(desk.y) / height) * 100}%`,
                  width: `${(Number(desk.width) / width) * 100}%`,
                  height: `${(Number(desk.height) / height) * 100}%`,
                }}
                onClick={() => chooseDesk(desk)}
                title={
                  desk.occupied ? "Galds aizņemts" : "Atzīmēties pie šī galda"
                }
              >
                {loading === desk.id ? (
                  <LoaderCircle className="spin" size={17} />
                ) : desk.occupied ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <Armchair size={15} />
                )}
                <b>{desk.label || desk.code}</b>
                <small>{desk.occupied ? "Aizņemts" : "Izvēlēties"}</small>
              </button>
            ))}
          </div>
        </div>
        <footer>
          <span>
            <i /> Brīvs galds
          </span>
          <span>
            <i className="occupied" /> Aizņemts galds
          </span>
          <small>Izvēlies tikai to galdu, pie kura patiešām sēdi.</small>
        </footer>
      </section>
    </div>
  );
}
