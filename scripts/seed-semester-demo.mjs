import crypto from "node:crypto";
import dotenv from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { get, put } from "@vercel/blob";
import ws from "ws";
import { MODULE_CATALOG, STUDENT_MODULE_PRESETS, TEACHER_MODULE_PRESETS } from "../db/catalog.js";
import { generateSemesterSeed, mergeSeedDataset, mergeSeedMonitor } from "../lib/semesterSeed.js";
import { assertDemoEnvironmentIsolated } from "./demoEnvironment.mjs";

dotenv.config({ path: ".env.demo.local", override: true, quiet: true });
process.env.DEVTRACK_DEMO_MODE = "true";

const PREFIX = "seed_6m_";
const BLOB_ROOT = "devtrack/investor-demo";
const schoolId = process.env.DEVTRACK_DEMO_SCHOOL_ID || "school_investor_demo";
const poolUrl = process.env.DEVTRACK_DEMO_DATABASE_URL_UNPOOLED ||
  process.env.DEVTRACK_DEMO_DATABASE_URL;
const blobToken = process.env.DEVTRACK_DEMO_BLOB_READ_WRITE_TOKEN;
const password = process.env.DEVTRACK_DEMO_PASSWORD;

function assertConfiguration() {
  if (!poolUrl) throw new Error("Missing DEVTRACK_DEMO_DATABASE_URL in .env.demo.local.");
  if (!blobToken) throw new Error("Missing DEVTRACK_DEMO_BLOB_READ_WRITE_TOKEN in .env.demo.local.");
  if (!password || password.length < 12) throw new Error("Set DEVTRACK_DEMO_PASSWORD to at least 12 characters.");
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    throw new Error("Set AUTH_SECRET to at least 32 characters in .env.demo.local.");
  }
  if (process.env.VERCEL) throw new Error("Run this seeder locally, not from a deployed Vercel runtime.");
}

function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt:${salt}:${crypto.scryptSync(value, salt, 64).toString("hex")}`;
}

function blobOptions(options = {}) {
  return { ...options, token: blobToken };
}

async function readBlobJson(name, fallback) {
  const result = await get(`${BLOB_ROOT}/${name}.json`, blobOptions({
    access: "private",
    useCache: false,
  }));
  if (!result) return fallback;
  if (result.statusCode !== 200) throw new Error(`Could not read Blob data: ${name}.json`);
  try {
    return JSON.parse(await new Response(result.stream).text());
  } catch (error) {
    throw new Error(`Invalid JSON in Blob data ${name}.json: ${error.message}`);
  }
}

function mergeDataset(name, existing, seeded) {
  if (name === "attendanceAutomationMonitor") return mergeSeedMonitor(existing, seeded);
  if (name === "repositoryDemo") {
    const preserved = Object.fromEntries(
      Object.entries(existing).filter(([id]) => !id.startsWith(PREFIX)),
    );
    return { ...preserved, ...seeded };
  }
  if (Array.isArray(seeded)) return mergeSeedDataset(existing, seeded);
  throw new Error(`Unsupported dataset format: ${name}`);
}

async function prepareBlobWrites(seed) {
  const writes = [];
  for (const [name, seeded] of Object.entries(seed.datasets)) {
    const fallback = Array.isArray(seeded) ? [] : {};
    const existing = await readBlobJson(name, fallback);
    writes.push([`${BLOB_ROOT}/${name}.json`, mergeDataset(name, existing, seeded)]);
  }
  const eventWrites = [];
  for (const [namespace, events] of Object.entries(seed.versionedEvents)) {
    const key = namespace === "music" ? "classroom" : "board";
    const prefix = `${BLOB_ROOT}/versioned/events-${namespace}/${key}/`;
    eventWrites.push(...events.map((event, index) => [
      `${prefix}${PREFIX}${String(index + 1).padStart(6, "0")}.json`,
      event,
    ]));
  }
  return [...writes, ...eventWrites];
}

async function verifyRemoteState(client, users, groups, timetable) {
  const schema = await client.query("select to_regclass('public.schools') as schools");
  if (!schema.rows[0]?.schools) {
    throw new Error("The demo Neon database has no DevTrack schema. Run `npm run db:migrate:demo` first.");
  }

  const school = await client.query(
    "select settings from schools where id = $1",
    [schoolId],
  );
  if (school.rowCount && school.rows[0].settings?.demoNamespace !== "investor-demo") {
    throw new Error(`School ID ${schoolId} already exists and is not marked as the isolated investor demo.`);
  }
  const schoolSlug = "devtrack-investor-demo";
  const slugConflict = await client.query(
    "select id from schools where lower(slug) = lower($1) and id <> $2",
    [schoolSlug, schoolId],
  );
  if (slugConflict.rowCount) throw new Error("The investor demo school slug is already in use.");

  const ids = users.map((user) => user.id);
  const emails = users.map((user) => user.email.toLowerCase());
  const foundUsers = await client.query(
    "select id, lower(email) as email, profile from users where id = any($1::text[]) or lower(email) = any($2::text[])",
    [ids, emails],
  );
  for (const row of foundUsers.rows) {
    if (row.profile?.demoNamespace !== "investor-demo") {
      throw new Error(`A demo user identifier or email is already in use (${row.id}). No data was changed.`);
    }
  }

  const groupIds = groups.map((group) => group.id);
  const groupNames = groups.map((group) => group.name.toLowerCase());
  const foundGroups = await client.query(
    "select id, school_id, lower(name) as name, external_refs from groups where id = any($1::text[]) or (school_id = $2 and lower(name) = any($3::text[]))",
    [groupIds, schoolId, groupNames],
  );
  for (const row of foundGroups.rows) {
    if (row.school_id !== schoolId || row.external_refs?.demoNamespace !== "investor-demo") {
      throw new Error(`A demo group identifier or name is already in use (${row.id}). No data was changed.`);
    }
  }

  const classroomIds = ["C110", "C120", "C210", "C220"].map(demoUuid);
  const classroomSlugs = ["c110", "c120", "c210", "c220"].map((room) => `investor-demo-${room}`);
  const foundClassrooms = await client.query(
    "select id, school_id, slug from classrooms where id = any($1::uuid[]) or (school_id = $2 and lower(slug) = any($3::text[]))",
    [classroomIds, schoolId, classroomSlugs],
  );
  for (const row of foundClassrooms.rows) {
    if (row.school_id !== schoolId || !classroomSlugs.includes(row.slug.toLowerCase())) {
      throw new Error(`An investor demo classroom identifier is already in use (${row.id}). No data was changed.`);
    }
  }

  const demoDates = [...new Set(timetable.map((lesson) => lesson.date))].slice(-5);
  const lessonIds = timetable
    .filter((lesson) => demoDates.includes(lesson.date))
    .map((lesson) => demoUuid(`${lesson.id}:session`));
  const foundSessions = await client.query(
    "select id, timetable_lessons from attendance_sessions where id = any($1::uuid[])",
    [lessonIds],
  );
  for (const row of foundSessions.rows) {
    if (!row.timetable_lessons?.some((lesson) => lesson.demoNamespace === "investor-demo")) {
      throw new Error(`An investor demo attendance session identifier is already in use (${row.id}). No data was changed.`);
    }
  }

  const courseIds = groups.map((group) => demoUuid(`${group.id}:journal-course`));
  const foundCourses = await client.query(
    "select id, group_id, subject from journal_courses where id = any($1::uuid[]) or (group_id = any($2::text[]) and lower(subject) = lower($3))",
    [courseIds, groupIds, "Investor demo programming"],
  );
  for (const row of foundCourses.rows) {
    if (!groups.some((group) => group.id === row.group_id) ||
        row.subject.toLowerCase() !== "investor demo programming") {
      throw new Error(`An investor demo journal course is already in use (${row.id}). No data was changed.`);
    }
  }

  const modules = await client.query(
    "select key from platform_modules where key = any($1::text[])",
    [MODULE_CATALOG.map((module) => module.key)],
  );
  if (modules.rowCount !== MODULE_CATALOG.length) {
    throw new Error("The Neon database access catalog is incomplete. Run `npm run db:migrate:demo`.");
  }
}

async function writeDemoCore(client, seed, users, groups) {
  const now = new Date();
  await client.query("begin");
  try {
    await client.query(
      `insert into schools (id, name, slug, timezone, active, settings)
       values ($1, $2, $3, 'Europe/Riga', true, $4::jsonb)
       on conflict (id) do update set name = excluded.name, slug = excluded.slug,
         timezone = excluded.timezone, active = true, settings = excluded.settings, updated_at = now()
       where schools.settings->>'demoNamespace' = 'investor-demo'`,
      [schoolId, "DevTrack Investor Demo", "devtrack-investor-demo", JSON.stringify({
        demoNamespace: "investor-demo",
        syntheticOnly: true,
        dateWindow: seed.window,
      })],
    );

    for (const user of users) {
      const profile = {
        githubUsername: user.githubUsername || null,
        deskplanUserId: null,
        role: user.role,
        demoNamespace: "investor-demo",
      };
      await client.query(
        `insert into users (id, email, first_name, last_name, password_hash, platform_role, active, must_change_password, profile)
         values ($1, $2, $3, $4, $5, 'user', true, false, $6::jsonb)
         on conflict (id) do update set email = excluded.email, first_name = excluded.first_name,
           last_name = excluded.last_name, password_hash = excluded.password_hash,
           active = true, must_change_password = false, profile = excluded.profile, updated_at = now()
         where users.profile->>'demoNamespace' = 'investor-demo'`,
        [user.id, user.email, user.firstName, user.lastName, hashPassword(password), JSON.stringify(profile)],
      );
    }

    const userIds = users.map((user) => user.id);
    const membershipResult = await client.query(
      `insert into school_memberships (school_id, user_id, role, status, is_primary, joined_at)
       select $1, user_row.id,
         case when user_row.id = $2 or user_row.profile->>'role' = 'admin' then 'school_admin'::school_role
              when user_row.profile->>'role' = 'teacher' then 'teacher'::school_role
              else 'student'::school_role end,
         'active', true, $3
       from users user_row where user_row.id = any($4::text[])
       on conflict (school_id, user_id) do update set role = excluded.role,
         status = 'active', is_primary = true, updated_at = now()
       returning id, user_id, role`,
      [schoolId, `${PREFIX}teacher_1`, now, userIds],
    );
    const memberships = new Map(membershipResult.rows.map((row) => [row.user_id, row]));

    for (const group of groups) {
      await client.query(
        `insert into groups (id, school_id, name, academic_year, active, external_refs)
         values ($1, $2, $3, $4, true, $5::jsonb)
         on conflict (id) do update set school_id = excluded.school_id, name = excluded.name,
           academic_year = excluded.academic_year, active = true, external_refs = excluded.external_refs, updated_at = now()
         where groups.external_refs->>'demoNamespace' = 'investor-demo'`,
        [group.id, schoolId, group.name, seed.academicYear, JSON.stringify({ demoNamespace: "investor-demo" })],
      );
      for (const userId of [...group.studentIds, ...group.teacherIds]) {
        const membership = memberships.get(userId);
        if (!membership) throw new Error(`Missing demo membership for ${userId}`);
        const relation = group.studentIds.includes(userId)
          ? "student"
          : userId === `${PREFIX}teacher_1` ? "lead_teacher" : "teacher";
        await client.query(
          `insert into group_memberships (group_id, membership_id, relation)
           values ($1, $2, $3::group_relation)
           on conflict (group_id, membership_id) do update set relation = excluded.relation`,
          [group.id, membership.id, relation],
        );
      }
    }

    const roomNames = ["C110", "C120", "C210", "C220"];
    const roomIds = roomNames.map(demoUuid);
    const deskIdsByRoom = new Map();
    for (let roomIndex = 0; roomIndex < roomNames.length; roomIndex += 1) {
      const roomName = roomNames[roomIndex];
      const roomId = roomIds[roomIndex];
      const classroom = await client.query(
        `insert into classrooms (id, school_id, name, slug, canvas_width, canvas_height, active)
         values ($1::uuid, $2, $3, $4, 1000, 600, true)
         on conflict (id) do update set name = excluded.name, active = true, updated_at = now()
         where classrooms.school_id = $2 and classrooms.slug = $4
         returning id`,
        [roomId, schoolId, roomName, `investor-demo-${roomName.toLowerCase()}`],
      );
      if (!classroom.rowCount) throw new Error(`Could not safely prepare demo classroom ${roomName}.`);

      const group = groups[roomIndex];
      const teacherMembership = memberships.get(group.teacherIds[0]);
      if (teacherMembership?.role === "teacher") {
        await client.query(
          `insert into classroom_staff (classroom_id, membership_id, role)
           values ($1::uuid, $2, 'manager')
           on conflict (classroom_id, membership_id) do update set role = 'manager', updated_at = now()`,
          [roomId, teacherMembership.id],
        );
      }

      const deskIds = [];
      for (let deskIndex = 0; deskIndex < 8; deskIndex += 1) {
        const deskId = demoUuid(`${roomName}:desk:${deskIndex + 1}`);
        const desk = await client.query(
          `insert into desks (id, classroom_id, code, label, x, y, width, height)
           values ($1::uuid, $2::uuid, $3, $4, $5, $6, 140, 80)
           on conflict (id) do update set label = excluded.label, x = excluded.x,
             y = excluded.y, width = excluded.width, height = excluded.height, updated_at = now()
           where desks.classroom_id = $2::uuid`,
          [
            deskId,
            roomId,
            `D${String(deskIndex + 1).padStart(2, "0")}`,
            `Demo desk ${deskIndex + 1}`,
            60 + (deskIndex % 4) * 220,
            60 + Math.floor(deskIndex / 4) * 160,
          ],
        );
        if (desk.rowCount !== 1) throw new Error(`Could not safely prepare ${roomName} demo desk ${deskIndex + 1}.`);
        deskIds.push(deskId);
      }
      deskIdsByRoom.set(roomName, deskIds);
    }

    await seedAttendanceHistory(client, seed.datasets.timetable, groups, memberships, roomIds, deskIdsByRoom);
    await seedJournal(client, seed, groups, memberships);

    await client.query(
      `insert into school_module_access (school_id, module_key, enabled)
       select $1, key, true from platform_modules
       on conflict (school_id, module_key) do update set enabled = true, updated_at = now()`,
      [schoolId],
    );
    for (const membership of memberships.values()) {
      const isStudent = membership.role === "student";
      const moduleKeys = isStudent
        ? STUDENT_MODULE_PRESETS.programming
        : membership.role === "school_admin"
          ? MODULE_CATALOG.map((module) => module.key)
          : TEACHER_MODULE_PRESETS.programming;
      for (const moduleKey of moduleKeys) {
        await client.query(
          `insert into membership_module_access (membership_id, module_key, enabled)
           values ($1, $2, true)
           on conflict (membership_id, module_key) do update set enabled = true, updated_at = now()`,
          [membership.id, moduleKey],
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function seedJournal(client, seed, groups, memberships) {
  for (const group of groups) {
    const courseId = demoUuid(`${group.id}:journal-course`);
    const teacherId = group.teacherIds[0];
    const teacherMembership = memberships.get(teacherId);
    const course = await client.query(
      `insert into journal_courses (id, school_id, group_id, teacher_membership_id, subject, academic_year, active)
       values ($1::uuid, $2, $3, $4, 'Investor demo programming', $5, true)
       on conflict (id) do update set teacher_membership_id = excluded.teacher_membership_id,
         subject = excluded.subject, academic_year = excluded.academic_year, active = true, updated_at = now()
       where journal_courses.school_id = $2 and journal_courses.group_id = $3
         and journal_courses.subject = 'Investor demo programming'
       returning id`,
      [courseId, schoolId, group.id, teacherMembership.id, seed.academicYear],
    );
    if (!course.rowCount) throw new Error(`Could not safely prepare the demo journal course for ${group.name}.`);

    const assignments = seed.datasets.assignments.filter((assignment) => assignment.groupId === group.id);
    for (let index = 0; index < assignments.length; index += 1) {
      const assignment = assignments[index];
      await client.query(
        `insert into lesson_plan_items (course_id, sequence, topic, outcome, type, planned_date, timetable_period, notes)
         values ($1::uuid, $2, $3, $4, 'lesson', $5, $6, $7)
         on conflict (course_id, sequence) do update set topic = excluded.topic, outcome = excluded.outcome,
           type = excluded.type, planned_date = excluded.planned_date,
           timetable_period = excluded.timetable_period, notes = excluded.notes, updated_at = now()`,
        [
          courseId,
          index + 1,
          assignment.title,
          assignment.description,
          assignment.startDate,
          index + 1,
          "Pusgada demo stundu plāns.",
        ],
      );

      const startsAt = rigaTimestamp(assignment.startDate, "10:10");
      const endsAt = rigaTimestamp(assignment.startDate, "11:30");
      const entry = await client.query(
        `insert into journal_entries
           (id, course_id, source, source_key, type, date, starts_at, ends_at, timetable_period,
            topic, outcome, metadata, created_by)
         values ($1::uuid, $2::uuid, 'manual', $3, 'lesson', $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
         on conflict (course_id, source_key) do update set date = excluded.date,
           starts_at = excluded.starts_at, ends_at = excluded.ends_at,
           timetable_period = excluded.timetable_period, topic = excluded.topic,
           outcome = excluded.outcome, metadata = excluded.metadata, updated_at = now()
         where journal_entries.metadata->>'demoNamespace' = 'investor-demo'
         returning id`,
        [
          demoUuid(`${group.id}:journal-entry:${index + 1}`),
          courseId,
          `${PREFIX}journal_${group.id}_${index + 1}`,
          assignment.startDate,
          startsAt,
          endsAt,
          index + 1,
          assignment.title,
          assignment.description,
          JSON.stringify({ demoNamespace: "investor-demo" }),
          teacherId,
        ],
      );
      if (!entry.rowCount) throw new Error(`Could not safely prepare demo journal entry for ${assignment.id}.`);
    }
  }
}

async function seedAttendanceHistory(client, timetable, groups, memberships, roomIds, deskIdsByRoom) {
  const dates = [...new Set(timetable.map((lesson) => lesson.date))].slice(-5);
  const recentLessons = timetable.filter((lesson) => dates.includes(lesson.date));
  const rooms = new Map(["C110", "C120", "C210", "C220"].map((name, index) => [name, roomIds[index]]));
  const students = [...memberships.values()].filter((membership) => membership.role === "student");
  const userById = new Map(students.map((membership) => [membership.user_id, membership]));
  for (const lesson of recentLessons) {
    const group = groups.find((item) => item.name === lesson.group);
    if (!group) throw new Error(`Missing demo group for lesson ${lesson.id}.`);
    const groupStudents = group.studentIds.map((id) => userById.get(id));
    if (groupStudents.some((item) => !item)) throw new Error(`Missing demo student membership for lesson ${lesson.id}.`);
    const sessionId = demoUuid(`${lesson.id}:session`);
    const roomId = rooms.get(lesson.room);
    const startsAt = rigaTimestamp(lesson.date, lesson.start);
    const endsAt = rigaTimestamp(lesson.date, lesson.end);
    const teacherMembership = memberships.get(group.teacherIds[0]);
    const sessionLesson = {
      ...lesson,
      demoNamespace: "investor-demo",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };
    const session = await client.query(
      `insert into attendance_sessions
         (id, school_id, classroom_id, group_id, teacher_membership_id, title, timetable_lessons,
          lesson_count, starts_at, ends_at, late_after_minutes, status, opened_at, closed_at)
       values ($1::uuid, $2, $3::uuid, $4, $5, $6, $7::jsonb, 1, $8, $9, 10, 'closed', $8, $9)
       on conflict (id) do update set classroom_id = excluded.classroom_id, group_id = excluded.group_id,
         teacher_membership_id = excluded.teacher_membership_id, timetable_lessons = excluded.timetable_lessons,
         starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = 'closed',
         opened_at = excluded.opened_at, closed_at = excluded.closed_at, updated_at = now()
       where attendance_sessions.timetable_lessons @> '[{"demoNamespace":"investor-demo"}]'::jsonb
       returning id`,
      [
        sessionId,
        process.env.DEVTRACK_DEMO_SCHOOL_ID || "school_investor_demo",
        roomId,
        group.id,
        teacherMembership.id,
        lesson.subject,
        JSON.stringify([sessionLesson]),
        startsAt,
        endsAt,
      ],
    );
    if (session.rowCount !== 1) throw new Error(`Could not safely prepare demo attendance session ${sessionId}.`);

    for (let index = 0; index < groupStudents.length; index += 1) {
      const studentMembership = groupStudents[index];
      const attendanceStatus = (index + dates.indexOf(lesson.date)) % 11 === 0
        ? "absent"
        : (index + dates.indexOf(lesson.date)) % 4 === 0 ? "late" : "present";
      const checkedInAt = attendanceStatus === "absent"
        ? null
        : new Date(startsAt.getTime() + (attendanceStatus === "late" ? 12 : 2) * 60000);
      const deskId = attendanceStatus === "absent"
        ? null
        : deskIdsByRoom.get(lesson.room)[index];
      const result = await client.query(
        `insert into attendance_records
           (id, session_id, student_membership_id, desk_id, status, lesson_statuses, checked_in_at, marked_by_user_id)
         values ($1::uuid, $2::uuid, $3, $4::uuid, $5::attendance_record_status, $6::jsonb, $7, $8)
         on conflict (session_id, student_membership_id) do update set desk_id = excluded.desk_id,
           status = excluded.status, lesson_statuses = excluded.lesson_statuses,
           checked_in_at = excluded.checked_in_at, marked_by_user_id = excluded.marked_by_user_id,
           updated_at = now()`,
        [
          demoUuid(`${lesson.id}:attendance:${studentMembership.user_id}`),
          sessionId,
          studentMembership.id,
          deskId,
          attendanceStatus,
          JSON.stringify([{
            period: lesson.period,
            startsAt: startsAt.toISOString(),
            status: attendanceStatus,
            minutesLate: attendanceStatus === "late" ? 12 : 0,
          }]),
          checkedInAt,
          group.teacherIds[0],
        ],
      );
      if (result.rowCount !== 1) throw new Error(`Could not safely prepare attendance for ${studentMembership.user_id}.`);
    }
  }
}

function rigaTimestamp(date, time) {
  const desired = Date.parse(`${date}T${time}:00Z`);
  let guess = desired;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Riga",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const shown = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    guess += desired - shown;
  }
  return new Date(guess);
}

function demoUuid(value) {
  const bytes = crypto.createHash("sha256").update(`devtrack-investor-demo:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  assertConfiguration();
  await assertDemoEnvironmentIsolated();
  const seed = generateSemesterSeed();
  const users = seed.datasets.users.map((user) =>
    user.id === `${PREFIX}teacher_1` ? { ...user, role: "admin" } : user,
  );
  const groups = seed.datasets.groups;

  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: poolUrl, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await verifyRemoteState(client, users, groups, seed.datasets.timetable);
    const blobWrites = await prepareBlobWrites(seed);
    for (const [pathname, value] of blobWrites) {
      await put(pathname, JSON.stringify(value, null, 2), blobOptions({
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      }));
    }
    await writeDemoCore(client, seed, users, groups);
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`Investor demo seeded to its isolated Neon school and Blob namespace (${Object.keys(seed.datasets).length} data sets).`);
  console.log(`Demo administrator login: ${users[0].email}`);
  console.log("Use DEVTRACK_DEMO_PASSWORD from .env.demo.local to sign in.");
  console.log(`Date range: ${seed.window.from} — ${seed.window.to}`);
}

main().catch((error) => {
  console.error(`Demo seed failed: ${error.message}`);
  process.exitCode = 1;
});
