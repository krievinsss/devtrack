import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import AppShell from "@/components/AppShell";
import { PageHeader } from "@/components/UI";
import { requirePageUser } from "@/lib/page";
import {
  getStudentProgressSelection,
  StudentProgressNotFoundError,
} from "@/services/studentProgress";

export default async function Students({ searchParams }) {
  const user = await requirePageUser(["teacher", "admin"], "groups"),
    params = (await searchParams) || {},
    groupId = typeof params.groupId === "string" ? params.groupId : null,
    studentId = typeof params.studentId === "string" ? params.studentId : null;
  let selection;
  try {
    selection = await getStudentProgressSelection(user, { groupId, studentId });
  } catch (error) {
    if (error instanceof StudentProgressNotFoundError) notFound();
    throw error;
  }

  const groupQuery = selection.group
      ? `groupId=${encodeURIComponent(selection.group.id)}`
      : "",
    studentHref = (id) => `/students?${groupQuery}&studentId=${encodeURIComponent(id)}`;

  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow="Student support"
        title="Student progress profile"
        description="Review one student’s progress across their work, assessments and attendance."
      />
      <section className="panel student-progress-selection">
        <div
          style={{
            display: "flex",
            alignItems: "end",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {selection.groups.length ? (
            <>
              <form
                action="/students"
                method="get"
                style={{ display: "flex", alignItems: "end", gap: 8 }}
              >
                <label>
                  <span>Grupa</span>
                  <select name="groupId" defaultValue={selection.group?.id}>
                    {selection.groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn secondary" type="submit">
                  Atvērt grupu
                </button>
              </form>
              {selection.group && selection.students.length > 0 && (
                <form
                  action="/students"
                  method="get"
                  style={{ display: "flex", alignItems: "end", gap: 8 }}
                >
                  <input
                    type="hidden"
                    name="groupId"
                    value={selection.group.id}
                  />
                  <label>
                    <span>Skolēns</span>
                    <select
                      name="studentId"
                      defaultValue={selection.student?.id}
                    >
                      {selection.students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.lastName}, {student.firstName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn secondary" type="submit">
                    Atvērt profilu
                  </button>
                </form>
              )}
            </>
          ) : (
            <p>Nav pieejamu grupu.</p>
          )}
        </div>
      </section>

      {selection.group && !selection.students.length && (
        <section className="panel student-progress-empty">
          <UserRound size={22} />
          <h2>Grupā nav aktīvu skolēnu</h2>
        </section>
      )}

      {selection.student && (
        <section className="panel student-progress-heading">
          <div>
            <span className="eyebrow">{selection.group.name}</span>
            <h2>
              {selection.student.firstName} {selection.student.lastName}
            </h2>
          </div>
          <nav
            aria-label="Skolēnu profili"
            style={{ display: "flex", gap: 8 }}
          >
            {selection.previousStudentId ? (
              <Link
                className="btn secondary"
                href={studentHref(selection.previousStudentId)}
                aria-label="Iepriekšējais skolēns"
              >
                <ChevronLeft size={16} /> Iepriekšējais
              </Link>
            ) : (
              <button className="btn secondary" disabled>
                <ChevronLeft size={16} /> Iepriekšējais
              </button>
            )}
            {selection.nextStudentId ? (
              <Link
                className="btn secondary"
                href={studentHref(selection.nextStudentId)}
                aria-label="Nākamais skolēns"
              >
                Nākamais <ChevronRight size={16} />
              </Link>
            ) : (
              <button className="btn secondary" disabled>
                Nākamais <ChevronRight size={16} />
              </button>
            )}
          </nav>
        </section>
      )}
    </AppShell>
  );
}