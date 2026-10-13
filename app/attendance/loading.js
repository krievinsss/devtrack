import { LoaderCircle } from "lucide-react";

export default function AttendanceLoading() {
  return (
    <main className="student-attendance" aria-busy="true">
      <section className="panel attendance-history-empty" role="status">
        <LoaderCircle size={25} className="spin" />
        <p>Ielādē apmeklējuma datus…</p>
      </section>
    </main>
  );
}