import { createHash } from "node:crypto";

const PREFIX = "seed_6m_";
const MONTHS = [
  {
    title: "Personīgā budžeta plānotājs",
    subject: "JavaScript",
    requirements: ["Izdevumu pievienošana", "Mēneša kopsavilkums", "Datu validācija"],
  },
  {
    title: "Laikapstākļu informācijas panelis",
    subject: "API",
    requirements: ["API datu ielāde", "Ielādes un kļūdu stāvokļi", "Responsīvs izkārtojums"],
  },
  {
    title: "Mācību uzdevumu pārvaldnieks",
    subject: "React",
    requirements: ["Uzdevumu CRUD", "Filtri", "Pieejamības pamati"],
  },
  {
    title: "Grāmatu kataloga API",
    subject: "Node.js",
    requirements: ["REST maršruti", "Datu shēma", "Automātiskie testi"],
  },
  {
    title: "Pasākumu rezervēšanas lietotne",
    subject: "Next.js",
    requirements: ["Pasākumu saraksts", "Rezervācijas plūsma", "Servera validācija"],
  },
  {
    title: "Noliktavas uzskaites sistēma",
    subject: "PHP",
    requirements: ["Produktu uzskaite", "Meklēšana", "Darbību žurnāls"],
  },
];
const FIRST_NAMES = [
  "Elza", "Rihards", "Marta", "Edgars", "Līga",
  "Kārlis", "Ieva", "Roberts", "Laura", "Niks",
  "Emīls", "Paula", "Dāvis", "Sofija", "Reinis",
  "Anete", "Markuss", "Zane", "Toms", "Kate",
];
const LAST_NAMES = [
  "Liepa", "Kalniņš", "Ozoliņa", "Bērziņš", "Krūmiņa",
  "Vītols", "Eglīte", "Zariņš", "Lapiņa", "Priedītis",
  "Vilciņš", "Balode", "Silakalns", "Ābele", "Strautiņš",
  "Rudzīte", "Mednis", "Dzenīte", "Auziņš", "Roze",
];
const TEACHERS = [
  { firstName: "Aija", lastName: "Skolotāja" },
  { firstName: "Mārtiņš", lastName: "Pasniedzējs" },
  { firstName: "Elīna", lastName: "Mentore" },
];
const FEEDBACK_TEXT = [
  ["Labi izveidots risinājuma pamats un skaidri nosauktas funkcijas.", "Pievieno testus robežgadījumiem un apraksti palaišanas soļus."],
  ["Lietotāja plūsma ir saprotama, un izmaiņas ir sadalītas nelielos soļos.", "Pārbaudi kļūdu stāvokļus un pievieno ievades validāciju."],
  ["Datu modelis atbilst uzdevuma prasībām un labi atbalsta turpmākus uzlabojumus.", "Uzlabo pieejamību un dokumentē API atbildes."],
];

export function generateSemesterSeed({ from, to } = {}) {
  const endDate = parseDate(to || new Date().toISOString().slice(0, 10));
  const startDate = parseDate(from || shiftMonths(endDate, -6));
  if (startDate > endDate) throw new Error("Sākuma datumam jābūt pirms beigu datuma.");

  const window = {
    from: formatDate(startDate),
    to: formatDate(endDate),
  };
  const academicYearStart = endDate.getUTCMonth() >= 8
    ? endDate.getUTCFullYear()
    : endDate.getUTCFullYear() - 1;
  const academicYear = `${academicYearStart}/${academicYearStart + 1}`;
  const users = [];
  const groups = [];
  for (let groupIndex = 0; groupIndex < 4; groupIndex += 1) {
    const groupId = `${PREFIX}group_${groupIndex + 1}`;
    const teacher = TEACHERS[groupIndex % TEACHERS.length];
    const teacherId = `${PREFIX}teacher_${groupIndex + 1}`;
    const groupStudents = [];
    users.push({
      id: teacherId,
      role: "teacher",
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: `teacher${groupIndex + 1}@semester-demo.test`,
      groupIds: [groupId],
      githubUsername: null,
      deskplanUserId: null,
      mustChangePassword: false,
      updatedAt: new Date(endDate).toISOString(),
    });
    for (let studentIndex = 0; studentIndex < 5; studentIndex += 1) {
      const personIndex = groupIndex * 5 + studentIndex;
      const studentId = `${PREFIX}student_${personIndex + 1}`;
      const student = {
        id: studentId,
        role: "student",
        firstName: FIRST_NAMES[personIndex],
        lastName: LAST_NAMES[personIndex],
        email: `student${personIndex + 1}@semester-demo.test`,
        groupIds: [groupId],
        githubUsername: `demo-student-${personIndex + 1}`,
        deskplanUserId: null,
      };
      users.push(student);
      groupStudents.push(studentId);
    }
    groups.push({
      id: groupId,
      name: `DEMO-${["IPa", "IPb", "IT", "PM"][groupIndex]}${String(academicYearStart + 1).slice(-2)}`,
      teacherIds: [teacherId],
      studentIds: groupStudents,
      academicYear,
    });
  }

  const assignments = [];
  const projects = [];
  const commits = [];
  const assessments = [];
  const feedback = [];
  const formativeAssessments = [];
  const aiReviews = [];
  const auditLogs = [];
  const gamificationProfiles = [];
  const gamificationTransactions = [];
  const attendance = [];
  const summativeAssessments = [];
  const musicAccess = [];
  const musicQueue = [];
  const musicEvents = [];
  const stackDevEvents = [];
  const repositoryDemo = {};
  const timetable = [];
  const students = users.filter((user) => user.role === "student");
  const teacherByGroup = new Map(groups.map((group) => [group.id, group.teacherIds[0]]));
  const assignmentByGroupAndMonth = new Map();
  const projectById = new Map();
  let auditSequence = 0;

  groups.forEach((group, groupIndex) => {
    MONTHS.forEach((work, monthIndex) => {
      const assignmentStart = monthDate(startDate, endDate, monthIndex, MONTHS.length);
      const assignmentDeadline = minDate(addDays(assignmentStart, 20), endDate);
      const assignmentId = `${PREFIX}assignment_g${groupIndex + 1}_m${monthIndex + 1}`;
      assignmentByGroupAndMonth.set(`${group.id}:${monthIndex}`, assignmentId);
      const teacherId = teacherByGroup.get(group.id);
      assignments.push({
        id: assignmentId,
        title: work.title,
        slug: `${slug(work.title)}-${groupIndex + 1}`,
        groupId: group.id,
        teacherId,
        description: `Pusgada demonstrācijas uzdevums: ${work.title.toLocaleLowerCase("lv-LV")}.`,
        requirements: [...work.requirements],
        technologies: [work.subject, "Git", "Testēšana"],
        rubric: [
          { name: "Funkcionalitāte", max: 5 },
          { name: "Koda kvalitāte", max: 3 },
          { name: "Git un dokumentācija", max: 2 },
        ],
        startDate: formatDate(assignmentStart),
        deadline: formatDate(assignmentDeadline),
        status: "published",
        createdAt: atTime(assignmentStart, 9 + groupIndex, 0),
      });
      auditLogs.push(makeAudit(
        `${PREFIX}audit_${++auditSequence}`,
        teacherId,
        "assignment.created",
        assignmentId,
        atTime(assignmentStart, 9 + groupIndex, 0),
      ));

      const formativeId = `${PREFIX}formative_g${groupIndex + 1}_m${monthIndex + 1}`;
      const studentsForGroup = students.filter((student) => student.groupIds.includes(group.id));
      const formativeDate = minDate(addDays(assignmentStart, 10), endDate);
      formativeAssessments.push({
        id: formativeId,
        assignmentId,
        title: `Progresa pārbaude — ${work.subject}`,
        date: formatDate(formativeDate),
        description: "Īsa progresa pārbaude ar individuālu atgriezenisko saiti.",
        criteria: [
          { name: "Funkcionalitāte", max: 5 },
          { name: "Darba process", max: 3 },
          { name: "Pašrefleksija", max: 2 },
        ],
        createdBy: teacherId,
        createdAt: atTime(assignmentStart, 9 + groupIndex, 15),
        results: studentsForGroup.map((student, studentIndex) => ({
          studentId: student.id,
          scores: [4 + (studentIndex % 2), 2 + (studentIndex % 2), 1 + (studentIndex % 2)],
          positive: "Regulārs progress un pārskatāma darba struktūra.",
          improvement: "Nākamajā posmā pārbaudi kļūdu apstrādi un robežgadījumus.",
          feedback: "Turpini attīstīt risinājumu un fiksē būtiskās izmaiņas Git vēsturē.",
          publishedAt: atTime(formativeDate, 13 + studentIndex, 0),
        })),
      });
      summativeAssessments.push({
        id: `${PREFIX}summative_${assignmentId}`,
        assignmentId,
        title: `Noslēguma vērtējums — ${work.subject}`,
        date: formatDate(assignmentDeadline),
        description: "Pusgada demonstrācijas noslēguma vērtējums.",
        criteria: [
          { name: "Funkcionalitāte", max: 5 },
          { name: "Koda kvalitāte", max: 3 },
          { name: "Git un dokumentācija", max: 2 },
        ],
        createdBy: teacherId,
        createdAt: atTime(assignmentStart, 9 + groupIndex, 30),
        results: studentsForGroup.map((student, studentIndex) => {
          const scores = [
            { name: "Funkcionalitāte", max: 5, score: 4 + (studentIndex % 2) },
            { name: "Koda kvalitāte", max: 3, score: 2 + (studentIndex % 2) },
            { name: "Git un dokumentācija", max: 2, score: 1 + (studentIndex % 2) },
          ];
          const total = scores.reduce((sum, item) => sum + item.score, 0);
          const maxTotal = scores.reduce((sum, item) => sum + item.max, 0);
          const percent = Math.round((total / maxTotal) * 100);
          return {
            studentId: student.id,
            scores,
            total,
            maxTotal,
            percent,
            grade: gradeFromPercent(percent),
            feedback: "Labs progress pusgada laikā; turpini pilnveidot testus.",
            gradedBy: teacherId,
            publishedAt: atTime(assignmentDeadline, 14 + studentIndex, 30),
            eventTitle: `Noslēguma vērtējums — ${work.subject}`,
            assignmentId,
            revisionHistory: [],
          };
        }),
      });

      createStackDevDemo({
        group,
        groupIndex,
        monthIndex,
        students: studentsForGroup,
        assignmentStart,
        endDate,
        events: stackDevEvents,
        transactions: gamificationTransactions,
      });

      studentsForGroup.forEach((student, studentIndex) => {
        const projectId = `${PREFIX}project_g${groupIndex + 1}_m${monthIndex + 1}_s${studentIndex + 1}`;
        const project = {
          id: projectId,
          assignmentId,
          studentId: student.id,
          name: work.title,
          slug: `${slug(work.title)}-${studentIndex + 1}`,
          type: "assigned_project",
          status: monthIndex < 2 ? "Completed" : monthIndex < 4 ? "Testing" : "Development",
          progress: Math.min(100, 25 + monthIndex * 12 + studentIndex * 5),
          technologies: [work.subject, "Git", "Testēšana"],
          githubOwner: student.githubUsername,
          githubRepo: `${slug(work.title)}-demo`,
          defaultBranch: "main",
          githubInstallationId: null,
          startDate: formatDate(assignmentStart),
          deadline: formatDate(assignmentDeadline),
          teacherScore: null,
          lastSyncedAt: atTime(
            minDate(endDate, addDays(assignmentStart, 18)),
            15,
            studentIndex * 3,
          ),
        };
        projects.push(project);
        projectById.set(projectId, { project, student, teacherId, assignmentStart, assignmentDeadline, monthIndex, groupIndex, studentIndex });
        repositoryDemo[projectId] = {
          tree: [
            { path: "README.md", type: "blob", sha: "demo", size: 238 },
            { path: "src", type: "tree", sha: "demo" },
            { path: "src/main.js", type: "blob", sha: "demo", size: 412 },
            { path: "tests", type: "tree", sha: "demo" },
            { path: "tests/main.test.js", type: "blob", sha: "demo", size: 306 },
          ],
          files: {
            "README.md": `# ${work.title}\n\nSintētisks pusgada demonstrācijas projekts.\n`,
            "src/main.js": `export function summarize(items) {\n  return items.filter(Boolean).length;\n}\n`,
            "tests/main.test.js": `import { strict as assert } from "node:assert";\nimport { summarize } from "../src/main.js";\nassert.equal(summarize([1, null, 2]), 2);\n`,
          },
        };
        auditLogs.push(makeAudit(
          `${PREFIX}audit_${++auditSequence}`,
          teacherId,
          "project.created",
          projectId,
          atTime(assignmentStart, 10, studentIndex * 5),
        ));

        const maxTotal = 20;
        const criteria = [
          { name: "Funkcionalitāte", score: Math.min(5, 4 + studentIndex % 2), max: 5 },
          { name: "Koda kvalitāte", score: 2 + studentIndex % 2, max: 3 },
          { name: "Testēšana", score: 2 + studentIndex % 2, max: 3 },
          { name: "Git un dokumentācija", score: 2 + studentIndex % 2, max: 3 },
          { name: "Prezentācija", score: 2 + studentIndex % 2, max: 3 },
          { name: "Pašrefleksija", score: 2 + studentIndex % 2, max: 3 },
        ];
        const total = criteria.reduce((sum, item) => sum + item.score, 0);
        const percent = Math.round((total / maxTotal) * 100);
        const grade = Math.max(4, Math.min(10, Math.round(total / maxTotal * 10)));
        assessments.push({
          id: `${PREFIX}assessment_${projectId}`,
          projectId,
          studentId: student.id,
          teacherId,
          criteria,
          total,
          maxTotal,
          percent,
          grade,
          updatedAt: atTime(assignmentDeadline, 14 + studentIndex, 0),
        });
        auditLogs.push(makeAudit(
          `${PREFIX}audit_${++auditSequence}`,
          teacherId,
          "assessment.updated",
          projectId,
          atTime(assignmentDeadline, 14 + studentIndex, 0),
        ));

        const feedbackPair = FEEDBACK_TEXT[(groupIndex + monthIndex + studentIndex) % FEEDBACK_TEXT.length];
        feedbackPair.forEach((text, feedbackIndex) => {
          feedback.push({
            id: `${PREFIX}feedback_${projectId}_${feedbackIndex + 1}`,
            studentId: student.id,
            projectId,
            teacherId,
            type: feedbackIndex === 0 ? "positive" : "improvement",
            text,
            createdAt: atTime(
              minDate(endDate, addDays(assignmentStart, feedbackIndex ? 16 : 8)),
              12,
              studentIndex * 4,
            ),
          });
        });

        const reviewDate = minDate(endDate, addDays(assignmentStart, 15));
        aiReviews.push({
          id: `${PREFIX}review_${projectId}`,
          projectId,
          createdBy: teacherId,
          createdAt: atTime(reviewDate, 11, studentIndex * 3),
          architecture: 6 + studentIndex % 4,
          codeQuality: 6 + (studentIndex + 1) % 4,
          security: 7 + studentIndex % 3,
          database: 6 + (groupIndex % 4),
          gitWorkflow: 7 + (studentIndex % 3),
          documentation: 6 + ((monthIndex + studentIndex) % 4),
          suggestedPoints: 15 + studentIndex % 6,
          maxPoints: 20,
          positives: ["Skaidri sadalīti moduļi", "Pārdomāti nosaukumi"],
          issues: [{
            title: "Pievienot ievades robežgadījumu testu",
            file: "src/validation.test.js",
            line: 12 + studentIndex,
          }],
          recommendations: ["Papildināt automatizētos testus", "Atjaunināt projekta README"],
        });

        for (let commitIndex = 0; commitIndex < 4; commitIndex += 1) {
          const commitDate = minDate(
            endDate,
            addDays(assignmentStart, Math.min(2 + commitIndex * 4, 17)),
          );
          const sha = hash(`${projectId}:${commitIndex}`).slice(0, 12);
          commits.push({
            sha,
            repositoryId: projectId,
            author: `${student.firstName} ${student.lastName}`,
            message: [
              `Initialize ${slug(work.title)} project`,
              "Implement core feature",
              "Add validation and error states",
              "Add tests and update documentation",
            ][commitIndex],
            timestamp: atTime(commitDate, 10 + commitIndex, studentIndex * 4),
            additions: 20 + ((studentIndex * 7 + commitIndex * 13) % 100),
            deletions: (studentIndex * 3 + commitIndex * 5) % 28,
            filesChanged: 2 + ((studentIndex + commitIndex) % 6),
            branch: commitIndex === 0 ? "main" : "feature/demo-progress",
          });
        }
      });
    });
  });

  const demoTimes = ["10:10", "12:30", "14:00", "15:30"];
  for (let day = new Date(startDate); day <= endDate; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    groups.forEach((group, groupIndex) => {
      const start = demoTimes[groupIndex];
      const end = addMinutesToTime(start, 80);
      const teacher = users.find((user) => user.id === group.teacherIds[0]);
      timetable.push({
        id: `${PREFIX}lesson_${formatDate(day)}_g${groupIndex + 1}`,
        date: formatDate(day),
        dayName: ["Svētdiena", "Pirmdiena", "Otrdiena", "Trešdiena", "Ceturtdiena", "Piektdiena", "Sestdiena"][weekday],
        period: groupIndex + 1,
        start,
        end,
        durationMinutes: 80,
        subject: "Programmēšana",
        subjectShort: "PR",
        teacher: `${teacher.firstName} ${teacher.lastName}`,
        room: ["C110", "C120", "C210", "C220"][groupIndex],
        group: group.name,
        division: "",
        weekName: "Investor demo",
      });
    });
  }

  const schoolDays = countWeekdays(startDate, endDate);
  students.forEach((student, studentIndex) => {
    const absent = Math.floor(schoolDays * (0.03 + (studentIndex % 5) * 0.015));
    const late = Math.floor(schoolDays * (0.02 + (studentIndex % 3) * 0.01));
    const present = Math.max(0, schoolDays - absent - late);
    attendance.push({
      studentId: student.id,
      percentage: Math.round((present / Math.max(1, schoolDays)) * 100),
      present,
      late,
      absent,
      consultations: studentIndex % 4,
      source: "semester-seeder",
      syncedAt: new Date(endDate).toISOString(),
    });
    gamificationProfiles.push({
      studentId: student.id,
      credits: 40 + studentIndex * 7,
      xp: 180 + studentIndex * 31,
      level: 2 + Math.floor(studentIndex / 5),
      inventory: [],
      equipped: { avatar: null, avatar_frame: null, title: null, slug: null, ui_theme: null },
      rewards: {},
      claimedLevels: [1, 2],
      achievements: ["first_commit", "steady_progress"],
      stats: {
        commits: 24,
        fixCommits: 5 + studentIndex % 4,
        refactorCommits: 3 + studentIndex % 3,
        projectsCompleted: 2,
        attendancePresent: present,
        musicRequests: 0,
        musicPlayed: 0,
        xpCanonicalV1: true,
        xpCanonicalV2: true,
      },
      updatedAt: new Date(endDate).toISOString(),
    });
    musicAccess.push({
      studentId: student.id,
      acceptedRulesVersion: 1,
      acceptedAt: atTime(startDate, 9, 0),
      banUntil: null,
      banReason: "",
      severity: null,
      fineDue: 0,
      finePaidAt: null,
      updatedAt: new Date(endDate).toISOString(),
    });
    for (let monthIndex = 0; monthIndex < MONTHS.length; monthIndex += 1) {
      const requestDate = monthDate(startDate, endDate, monthIndex, MONTHS.length);
      const requestId = `${PREFIX}music_${studentIndex + 1}_m${monthIndex + 1}`;
      const createdAt = atTime(requestDate, 10 + (studentIndex % 6), studentIndex * 2);
      const played = monthIndex < MONTHS.length - 1;
      const request = {
        id: requestId,
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        title: `Focus coding demo ${monthIndex + 1}`,
        artist: "DevTrack Demo",
        spotifyUrl: "",
        spotifyId: "",
        spotifyUri: "",
        image: "",
        durationMs: 180000,
        explicit: false,
        status: played ? "played" : "requested",
        requestCost: 0,
        dailyRequestNumber: 1,
        votes: [],
        createdAt,
        updatedAt: played ? atTime(requestDate, 11 + (studentIndex % 6), studentIndex * 2) : createdAt,
        ...(played ? { playedAt: atTime(requestDate, 11 + (studentIndex % 6), studentIndex * 2) } : {}),
      };
      musicQueue.push(request);
      musicEvents.push({
        eventAt: createdAt,
        type: "add",
        request: { ...request, status: "requested", updatedAt: createdAt, playedAt: undefined },
      });
      if (played) {
        musicEvents.push({
          eventAt: request.playedAt,
          type: "patch",
          requestId,
          patch: { status: "played", updatedAt: request.playedAt, playedAt: request.playedAt },
        });
      }
    }
  });
  for (const profile of gamificationProfiles) {
    const rewards = gamificationTransactions.filter((item) => item.studentId === profile.studentId);
    profile.credits += rewards.reduce((sum, item) => sum + Number(item.credits || 0), 0);
    profile.xp += rewards.reduce((sum, item) => sum + Number(item.xp || 0), 0);
    profile.stats.stackDevSolutions = rewards.filter((item) => item.type === "stackdev_solution").length;
    profile.stats.musicRequests = musicQueue.filter((item) => item.studentId === profile.studentId).length;
    profile.stats.musicPlayed = musicQueue.filter((item) =>
      item.studentId === profile.studentId && item.status === "played",
    ).length;
  }

  const monitor = createMonitorHistory({
    startDate,
    endDate,
    timetable,
    groups,
  });
  const datasets = {
    users,
    groups,
    assignments,
    projects,
    attendance,
    assessments,
    formativeAssessments,
    feedback,
    commits,
    aiReviews,
    gamificationProfiles,
    gamificationTransactions,
    auditLogs,
    summativeAssessments,
    musicAccess,
    musicQueue,
    timetable,
    repositoryDemo,
    attendanceAutomationMonitor: monitor,
  };
  return {
    version: 1,
    window,
    academicYear,
    generatedAt: new Date().toISOString(),
    versionedEvents: {
      music: musicEvents.sort((left, right) => left.eventAt.localeCompare(right.eventAt)),
      stackdev: stackDevEvents.sort((left, right) => left.eventAt.localeCompare(right.eventAt)),
    },
    counts: {
      ...Object.fromEntries(
        Object.entries(datasets).map(([name, value]) => [
          name,
          Array.isArray(value) ? value.length : (value.records?.length ?? Object.keys(value).length),
        ]),
      ),
      "versionedEvents.music": musicEvents.length,
      "versionedEvents.stackdev": stackDevEvents.length,
    },
    datasets,
  };
}

export function mergeSeedDataset(existing, seeded) {
  return [
    ...existing.filter((item) => {
      const id = item.id || item.studentId;
      return !id?.startsWith(PREFIX);
    }),
    ...seeded,
  ];
}

export function mergeSeedMonitor(existing, seeded) {
  const records = [
    ...(existing?.records || []).filter((item) => !item.id?.startsWith(PREFIX)),
    ...(seeded?.records || []),
  ].sort((left, right) => new Date(right.ranAt) - new Date(left.ranAt)).slice(0, 100);
  return { latest: records[0] || null, records };
}

function createStackDevDemo({ group, groupIndex, monthIndex, students, assignmentStart, endDate, events, transactions }) {
  const author = students[monthIndex % students.length];
  const answer = students[(monthIndex + 1) % students.length];
  const questionId = `${PREFIX}stack_question_g${groupIndex + 1}_m${monthIndex + 1}`;
  const createdAt = atTime(minDate(endDate, addDays(assignmentStart, 3)), 10, groupIndex * 5);
  const replyId = `${PREFIX}stack_reply_g${groupIndex + 1}_m${monthIndex + 1}`;
  const replyAt = atTime(minDate(endDate, addDays(assignmentStart, 4)), 11, groupIndex * 5);
  const question = {
    id: questionId,
    authorId: author.id,
    authorName: `${author.firstName} ${author.lastName}`,
    title: "Kā sadalīt funkciju un pārbaudīt robežgadījumus?",
    body: "Mēģinu atdalīt datu apstrādi no lietotāja saskarnes. Kādu nelielu pirmo soli ieteiktu?",
    code: "function summarize(items) { return items.filter(Boolean).length; }",
    language: "javascript",
    tags: ["javascript", "testing"],
    status: "solved",
    acceptedReplyId: replyId,
    replies: [],
    createdAt,
    updatedAt: replyAt,
  };
  const reply = {
    id: replyId,
    authorId: answer.id,
    authorName: `${answer.firstName} ${answer.lastName}`,
    authorRole: "student",
    body: "Sāc ar tīru funkciju, kas saņem datus un atgriež rezultātu; pēc tam pārbaudi tukšu ievadi un nederīgus ierakstus.",
    code: "export function summarize(items = []) { return items.filter(Boolean).length; }",
    language: "javascript",
    accepted: true,
    createdAt: replyAt,
    updatedAt: replyAt,
    acceptedAt: replyAt,
  };
  events.push(
    { eventAt: createdAt, type: "question_created", question: { ...question, status: "open", acceptedReplyId: null, updatedAt: createdAt }, actorId: author.id },
    { eventAt: replyAt, type: "reply_created", questionId, reply, actorId: answer.id },
    { eventAt: replyAt, type: "reply_accepted", questionId, replyId, actorId: author.id },
  );
  transactions.push({
    id: `${PREFIX}stack_reward_${questionId}`,
    studentId: answer.id,
    type: "stackdev_solution",
    sourceKey: `stackdev:${questionId}`,
    questionId,
    replyId,
    credits: 10,
    xp: 25,
    label: "StackDev accepted solution",
    createdAt: replyAt,
  });
}

function createMonitorHistory({ startDate, endDate, timetable, groups }) {
  const eligible = [];
  const workdays = [];
  for (let day = new Date(startDate); day <= endDate; day.setUTCDate(day.getUTCDate() + 1)) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) workdays.push(new Date(day));
  }
  const stride = Math.max(1, Math.ceil(workdays.length / 100));
  for (let index = 0; index < workdays.length; index += stride) eligible.push(workdays[index]);
  const records = eligible.slice(-100).map((day, index) => {
    const localDate = formatDate(day);
    const lesson = timetable.find((item) => item.date === localDate);
    const group = lesson && groups.find((item) => item.name === lesson.group);
    const teacherId = group?.teacherIds[0] || null;
    const noOp = index % 5 === 0;
    const closed = !noOp && index % 7 === 0;
    const details = noOp
      ? [{
          action: "no-op",
          teacherId,
          message: "Šajā izpildē nebija atveramu stundu.",
        }]
      : [{
          action: "opened",
          teacherId,
          blockId: lesson?.id || `${PREFIX}lesson_${localDate}`,
          sessionId: `${PREFIX}session_${index + 1}`,
        }, ...(closed ? [{
          action: "closed",
          teacherId,
          blockId: lesson?.id || `${PREFIX}lesson_${localDate}`,
          sessionId: `${PREFIX}session_${index + 1}`,
        }] : [])]
    return {
      id: `${PREFIX}run_${localDate}_${index + 1}`,
      ranAt: atTime(day, 8, 0),
      trigger: "cron",
      status: noOp ? "no-op" : "successful",
      ok: true,
      durationMs: 1200 + (index * 137) % 2100,
      openedCount: noOp ? 0 : 1,
      closedCount: closed ? 1 : 0,
      skippedCount: 0,
      errors: [],
      skipReasons: [],
      details,
      teacherIds: teacherId ? [teacherId] : [],
      summary: `Atvērtas ${noOp ? 0 : 1}, aizvērtas ${closed ? 1 : 0}, izlaistas 0.`,
    };
  });
  return { latest: records.at(-1) || null, records: records.reverse() };
}

function gradeFromPercent(value) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  if (percent >= 97) return 10;
  if (percent >= 92) return 9;
  if (percent >= 84) return 8;
  if (percent >= 76) return 7;
  if (percent >= 68) return 6;
  if (percent >= 60) return 5;
  if (percent >= 45) return 4;
  if (percent >= 30) return 3;
  if (percent >= 15) return 2;
  return 1;
}

function addMinutesToTime(value, amount) {
  const [hours, minutes] = value.split(":").map(Number);
  const total = hours * 60 + minutes + amount;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function makeAudit(id, actorId, action, targetId, createdAt) {
  return { id, actorId, action, targetId, createdAt };
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Nederīgs datums: ${value}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || formatDate(parsed) !== value)
    throw new Error(`Nederīgs datums: ${value}`);
  return parsed;
}

function shiftMonths(date, amount) {
  const original = new Date(date);
  const shifted = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + amount, 1));
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(original.getUTCDate(), lastDay));
  return formatDate(shifted);
}

function monthDate(start, end, index, count) {
  const span = end.getTime() - start.getTime();
  return new Date(start.getTime() + Math.floor(span * index / count));
}

function addDays(date, amount) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return value;
}

function minDate(left, right) {
  return left.getTime() <= right.getTime() ? left : right;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function atTime(date, hour, minute) {
  const value = new Date(date);
  value.setUTCHours(hour, minute, 0, 0);
  return value.toISOString();
}

function countWeekdays(start, end) {
  let total = 0;
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) total += 1;
  }
  return total;
}

function slug(value) {
  return value
    .toLocaleLowerCase("lv-LV")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
