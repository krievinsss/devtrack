'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  SearchCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 20;

const statusNames = {
  planned: 'Plānota',
  opened: 'Atvērta',
  closed: 'Aizvērta',
  skipped: 'Izlaista',
  error: 'Kļūda',
  successful: 'Veiksmīga',
  failed: 'Neizdevās',
  'no-op': 'Nebija izmaiņu',
};

function formatWhen(value, withDate = true) {
  if (!value) return 'Nav izpildīts';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Nezināms laiks';
  return new Intl.DateTimeFormat('lv-LV', {
    ...(withDate ? { day: '2-digit', month: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Riga',
  }).format(date);
}

function statusTone(status) {
  if (['opened', 'closed', 'successful'].includes(status)) return 'green';
  if (['error', 'failed'].includes(status)) return 'red';
  if (['skipped', 'no-op'].includes(status)) return 'amber';
  return 'blue';
}

export default function AttendanceAutomationStatus({ allowRecheck = false }) {
  const [monitor, setMonitor] = useState(null);
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState({ records: [], total: 0 });
  const [filters, setFilters] = useState({ date: '', teacherId: '', result: '' });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rechecking, setRechecking] = useState('');
  const [error, setError] = useState('');
  const [selectedRun, setSelectedRun] = useState(null);
  const [message, setMessage] = useState('');

  const fetchMonitor = useCallback(async (nextOffset = 0) => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
    });
    if (filters.date) params.set('date', filters.date);
    if (filters.teacherId) params.set('teacherId', filters.teacherId);
    if (filters.result) params.set('result', filters.result);
    const response = await fetch(`/api/admin/attendance-automation?${params}`, {
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Neizdevās ielādēt uzraudzības datus.');
    return data;
  }, [filters]);

  const applyMonitorData = useCallback((data, nextOffset) => {
    setMonitor(data.monitor || null);
    setToday(data.today || null);
    setHistory(data.history || { records: [], total: 0 });
    setOffset(nextOffset);
  }, []);

  const load = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError('');
    try {
      applyMonitorData(await fetchMonitor(nextOffset), nextOffset);
    } catch (cause) {
      setError(cause.message || 'Neizdevās ielādēt uzraudzības datus.');
    } finally {
      setLoading(false);
    }
  }, [applyMonitorData, fetchMonitor]);

  useEffect(() => {
    let active = true;
    fetchMonitor(0)
      .then((data) => {
        if (active) applyMonitorData(data, 0);
      })
      .catch((cause) => {
        if (active) setError(cause.message || 'Neizdevās ielādēt uzraudzības datus.');
      });
    return () => {
      active = false;
    };
  }, [applyMonitorData, fetchMonitor]);

  async function recheck(lesson) {
    setRechecking(lesson.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/attendance-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recheck',
          teacherId: lesson.teacherId,
          blockId: lesson.id,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Stundas pārbaude neizdevās.');
      setMessage(`Pārbaude pabeigta: ${statusNames[data.record.status] || data.record.status}.`);
      await load(0);
    } catch (cause) {
      setError(cause.message || 'Stundas pārbaude neizdevās.');
    } finally {
      setRechecking('');
    }
  }

  const teacherOptions = useMemo(() => {
    const map = new Map();
    for (const source of today?.sources || [])
      map.set(source.teacherId, source.teacherName);
    for (const lesson of today?.lessons || [])
      map.set(lesson.teacherId, lesson.teacherName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'lv'));
  }, [today]);

  const activeExpected = today?.lessons?.some((lesson) => lesson.status === 'error');

  return (
    <section className="panel attendance-automation-panel">
      <div className="attendance-monitor-head">
        <div>
          <span className="eyebrow">AUTOMĀTIKAS UZRAUDZĪBA</span>
          <h2>Stundu atvēršana un aizvēršana</h2>
          <p>Uzraudzība izmanto esošo stundu automātiku; pārbaude neveido atsevišķu sesiju mehānismu.</p>
        </div>
        <button className="btn secondary compact" type="button" onClick={() => void load(0)} disabled={loading}>
          {loading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
          Atjaunot
        </button>
      </div>

      {error && <div className="attendance-monitor-notice is-error"><AlertTriangle size={16} />{error}</div>}
      {message && <div className="attendance-monitor-notice"><CheckCircle2 size={16} />{message}</div>}
      {today?.alert && <div className="attendance-monitor-notice is-error"><AlertTriangle size={16} />{today.alert}</div>}

      <div className="attendance-monitor-summary">
        <div>
          <span>Pēdējā izpilde</span>
          <b>{formatWhen(monitor?.ranAt)}</b>
        </div>
        <div>
          <span>Rezultāts</span>
          <b><i className={`badge ${statusTone(monitor?.status || 'no-op')}`}>{statusNames[monitor?.status] || 'Nav izpildes'}</i></b>
        </div>
        <div>
          <span>Ilgums</span>
          <b>{monitor ? `${monitor.durationMs} ms` : '—'}</b>
        </div>
        <div>
          <span>Atvērtas / aizvērtas / izlaistas</span>
          <b>{monitor ? `${monitor.openedCount} / ${monitor.closedCount} / ${monitor.skippedCount}` : '—'}</b>
        </div>
      </div>
      {(monitor?.errors?.length > 0 || monitor?.skipReasons?.length > 0) && (
        <div className="attendance-monitor-run-notes">
          {monitor.errors?.length > 0 && (
            <div className="attendance-monitor-source-errors">
              <b>Izpildes kļūdas</b>
              {monitor.errors.slice(0, 5).map((item, index) => (
                <p key={`${item.teacherId}-${index}`}>{item.message}</p>
              ))}
            </div>
          )}
          {monitor.skipReasons?.length > 0 && (
            <div className="attendance-monitor-run-skips">
              <b>Izlaistās stundas</b>
              {monitor.skipReasons.slice(0, 5).map((item, index) => (
                <p key={`${item.blockId}-${index}`}>{item.reason}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="attendance-monitor-section-head">
        <div>
          <h3>Šodienas stundas</h3>
          <span>{today?.date || '—'} · Latvijas laiks</span>
        </div>
      </div>
      {today?.sources?.some((source) => source.status === 'error') && (
        <div className="attendance-monitor-source-errors">
          {today.sources.filter((source) => source.status === 'error').map((source) => (
            <p key={source.teacherId}><b>{source.teacherName}:</b> {source.message}</p>
          ))}
        </div>
      )}
      {today?.sources?.some((source) => source.status === 'warning') && (
        <div className="attendance-monitor-notice">
          <AlertTriangle size={16} />
          {today.sources.filter((source) => source.status === 'warning').map((source) => (
            <span key={source.teacherId}>{source.teacherName}: {source.message}</span>
          ))}
        </div>
      )}
      {!today?.lessons?.length ? (
        <p className="attendance-monitor-empty">
          {today?.sources?.some((source) => source.status === 'error')
            ? 'Stundu saraksts nav pieejams, tāpēc stundas nevar pārbaudīt.'
            : 'Šodienas stundu sarakstā nav stundu.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="attendance-automation-table">
            <thead>
              <tr><th>Grupa</th><th>Skolotājs</th><th>Telpa</th><th>Sākums</th><th>Beigas</th><th>Statuss / iemesls</th><th /></tr>
            </thead>
            <tbody>
              {today.lessons.map((lesson) => (
                <tr key={`${lesson.teacherId}-${lesson.id}`}>
                  <td><b>{lesson.group}</b><small>{lesson.subject}</small></td>
                  <td>{lesson.teacherName}</td>
                  <td>{lesson.room}</td>
                  <td>{formatWhen(lesson.startsAt, false)}</td>
                  <td>{formatWhen(lesson.endsAt, false)}</td>
                  <td>
                    <span className={`badge ${statusTone(lesson.status)}`}>{statusNames[lesson.status] || lesson.status}</span>
                    {lesson.reason && <small className="attendance-lesson-reason">{lesson.reason}</small>}
                  </td>
                  <td>
                    {allowRecheck && lesson.recheckable && (
                      <button className="btn secondary compact" type="button" onClick={() => void recheck(lesson)} disabled={Boolean(rechecking)}>
                        {rechecking === lesson.id ? <Loader2 className="spin" size={13} /> : <SearchCheck size={13} />}
                        Pārbaudīt
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeExpected && today?.lastCronAt && (
        <p className="attendance-monitor-footnote">
          Pēdējā cron izpilde: {formatWhen(today.lastCronAt)}. Aktīvai stundai nav atrasta sesija.
        </p>
      )}

      <div className="attendance-monitor-section-head history-heading">
        <div>
          <h3>Izpilžu vēsture</h3>
          <span>{history.total} izpildes atbilst filtriem; tiek glabātas ne vairāk kā 100 jaunākās.</span>
        </div>
      </div>
      <div className="attendance-history-filters">
        <label>Datums<input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} /></label>
        <label>Skolotājs
          <select value={filters.teacherId} onChange={(event) => setFilters({ ...filters, teacherId: event.target.value })}>
            <option value="">Visi</option>
            {teacherOptions.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
          </select>
        </label>
        <label>Rezultāts
          <select value={filters.result} onChange={(event) => setFilters({ ...filters, result: event.target.value })}>
            <option value="">Visi</option>
            <option value="successful">Veiksmīga</option>
            <option value="failed">Neizdevās</option>
            <option value="no-op">Nebija izmaiņu</option>
          </select>
        </label>
      </div>
      {!history.records.length ? (
        <p className="attendance-monitor-empty">Izpilžu vēsture atbilstoši filtriem nav atrasta.</p>
      ) : (
        <div className="attendance-history-list">
          {history.records.map((record) => (
            <div className="attendance-history-row" key={record.id}>
              <div><b>{formatWhen(record.ranAt)}</b><small>{record.trigger === 'cron' ? 'Cron' : 'Manuāla pārbaude'} · {record.durationMs} ms</small></div>
              <span className={`badge ${statusTone(record.status)}`}>{statusNames[record.status] || record.status}</span>
              <span>Atv. {record.openedCount} · Aizv. {record.closedCount} · Izl. {record.skippedCount}</span>
              <button className="btn secondary compact" type="button" onClick={() => setSelectedRun(record)}>Detaļas</button>
            </div>
          ))}
        </div>
      )}
      <div className="attendance-history-pagination">
        <button className="btn secondary compact" type="button" onClick={() => void load(Math.max(0, offset - PAGE_SIZE))} disabled={loading || offset === 0}>
          <ChevronLeft size={14} /> Iepriekšējās
        </button>
        <span>{history.total ? `${offset + 1}–${Math.min(offset + history.records.length, history.total)} no ${history.total}` : '0 izpildes'}</span>
        <button className="btn secondary compact" type="button" onClick={() => void load(offset + PAGE_SIZE)} disabled={loading || offset + PAGE_SIZE >= history.total}>
          Nākamās <ChevronRight size={14} />
        </button>
      </div>

      {selectedRun && (
        <div className="attendance-run-backdrop" role="presentation" onClick={() => setSelectedRun(null)}>
          <section className="attendance-run-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-run-title" onClick={(event) => event.stopPropagation()}>
            <div className="attendance-run-dialog-head">
              <div><span className="eyebrow">IZPILDES DETAĻAS</span><h3 id="attendance-run-title">{formatWhen(selectedRun.ranAt)} · {statusNames[selectedRun.status]}</h3></div>
              <button className="icon-btn" type="button" onClick={() => setSelectedRun(null)} aria-label="Aizvērt"><X size={17} /></button>
            </div>
            <p>{selectedRun.summary}</p>
            {selectedRun.details?.length ? (
              <ul className="attendance-run-details">
                {selectedRun.details.map((detail, index) => (
                  <li key={`${detail.action}-${detail.blockId || detail.sessionId || index}`}>
                    <b>{statusNames[detail.action] || detail.action}</b>
                    {detail.message && <span>{detail.message}</span>}
                    {detail.blockId && <small>Stundas ID: {detail.blockId}</small>}
                    {detail.sessionId && <small>Sesijas ID: {detail.sessionId}</small>}
                  </li>
                ))}
              </ul>
            ) : <p className="attendance-monitor-empty">Šai izpildei nav papildu darbību detaļu.</p>}
          </section>
        </div>
      )}
    </section>
  );
}
