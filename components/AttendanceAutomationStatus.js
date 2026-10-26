'use client';

import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

function formatWhen(value) {
  if (!value) return 'Not run yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('lv-LV', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Riga',
  }).format(date);
}

export default function AttendanceAutomationStatus() {
  const [monitor, setMonitor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/attendance-automation', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Status check failed');
      setMonitor(data.monitor || null);
    } catch (cause) {
      setError(cause.message || 'Could not load automation status');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const tone = !monitor
    ? 'amber'
    : monitor.ok
      ? 'green'
      : 'red';
  const statusLabel = !monitor
    ? 'No recent run'
    : monitor.ok
      ? 'Healthy'
      : 'Needs attention';

  return (
    <section className="panel">
      <div className="setting-row">
        <span>
          <Clock3 size={15} /> Attendance automation
        </span>
        <span className={`badge ${tone}`}>{statusLabel}</span>
      </div>
      <div className="database-status-detail">
        <p className={error ? 'database-status-error' : ''}>
          {error ||
            (monitor
              ? `Last run: ${formatWhen(monitor.ranAt)} · ${monitor.durationMs} ms`
              : 'No attendance automation run has been recorded yet.')}
        </p>
        {monitor && (
          <div className="monitor-stats" style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <div className="setting-row">
              <span>Result</span>
              <b>{monitor.ok ? 'Successful' : 'Failed'}</b>
            </div>
            <div className="setting-row">
              <span>Opened</span>
              <b>{monitor.openedCount}</b>
            </div>
            <div className="setting-row">
              <span>Closed</span>
              <b>{monitor.closedCount}</b>
            </div>
            <div className="setting-row">
              <span>Skipped</span>
              <b>{monitor.skippedCount}</b>
            </div>
          </div>
        )}
        {monitor?.errors?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="setting-row" style={{ marginBottom: 8 }}>
              <span><AlertTriangle size={14} /> Errors</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              {monitor.errors.slice(0, 5).map((item, index) => (
                <li key={`${item.message}-${index}`}>{item.message}</li>
              ))}
            </ul>
          </div>
        )}
        {monitor?.skipReasons?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="setting-row" style={{ marginBottom: 8 }}>
              <span><CheckCircle2 size={14} /> Skip reasons</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              {monitor.skipReasons.slice(0, 5).map((item, index) => (
                <li key={`${item.reason}-${index}`}>{item.reason}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="database-status-actions" style={{ marginTop: 14 }}>
          <button className="btn secondary compact" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>
    </section>
  );
}
