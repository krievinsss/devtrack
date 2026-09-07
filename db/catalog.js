export const MODULE_CATALOG=[
  {key:'timetable',name:'Timetable',description:'Personal and group lesson schedules.',navigationPath:'/timetable',defaultForTeacher:true,defaultForStudent:true,sortOrder:10},
  {key:'attendance',name:'Attendance',description:'Lesson attendance, check-in and history.',navigationPath:'/attendance',defaultForTeacher:true,defaultForStudent:true,sortOrder:20},
  {key:'classrooms',name:'Classrooms & desks',description:'Classroom layouts, desks and QR codes.',navigationPath:'/classrooms',defaultForTeacher:true,defaultForStudent:false,sortOrder:30},
  {key:'groups',name:'Students & groups',description:'Assigned student groups and membership.',navigationPath:'/groups',defaultForTeacher:true,defaultForStudent:false,sortOrder:40},
  {key:'grades',name:'Grades',description:'Assessment criteria and student grades.',navigationPath:'/assessments',defaultForTeacher:false,defaultForStudent:false,sortOrder:50},
  {key:'projects',name:'Projects',description:'Teaching projects and student workspaces.',navigationPath:'/projects',defaultForTeacher:false,defaultForStudent:false,sortOrder:60},
  {key:'github',name:'GitHub',description:'Repository connections and code review.',navigationPath:'/projects',defaultForTeacher:false,defaultForStudent:false,sortOrder:70},
  {key:'stackdev',name:'StackDev',description:'Student developer questions and answers.',navigationPath:'/stackdev',defaultForTeacher:false,defaultForStudent:false,sortOrder:80},
  {key:'music',name:'Classroom Music',description:'Shared classroom Spotify requests.',navigationPath:'/music',defaultForTeacher:false,defaultForStudent:false,sortOrder:90},
  {key:'achievements',name:'Achievements',description:'XP, DevCredits and student achievements.',navigationPath:'/achievements',defaultForTeacher:false,defaultForStudent:false,sortOrder:100},
  {key:'administration',name:'Administration',description:'School members, access and configuration.',navigationPath:'/settings',defaultForTeacher:false,defaultForStudent:false,sortOrder:900}
];

export const PERMISSION_CATALOG=[
  ['timetable.view','timetable','View timetable'],['timetable.sync','timetable','Synchronize timetable'],
  ['attendance.view_self','attendance','View own attendance'],['attendance.view_assigned','attendance','View assigned groups attendance'],['attendance.manage_sessions','attendance','Start and close lesson sessions'],['attendance.override','attendance','Correct attendance records'],
  ['classrooms.view','classrooms','View classroom layouts'],['classrooms.manage','classrooms','Manage classrooms, desks and QR codes'],
  ['groups.view_own','groups','View own group'],['groups.view_assigned','groups','View assigned groups'],['groups.manage','groups','Manage groups and membership'],
  ['grades.view_self','grades','View own grades'],['grades.view_assigned','grades','View assigned student grades'],['grades.manage','grades','Create and edit grades'],
  ['projects.view_self','projects','View own projects'],['projects.view_assigned','projects','View assigned student projects'],['projects.manage','projects','Create and manage projects'],
  ['github.connect_own','github','Connect own repositories'],['github.view_assigned','github','View assigned repositories'],['github.review','github','Run private repository reviews'],
  ['stackdev.participate','stackdev','Ask and answer StackDev questions'],['stackdev.moderate','stackdev','Moderate StackDev'],
  ['music.request','music','Request classroom music'],['music.manage','music','Manage classroom music'],
  ['achievements.view_self','achievements','View own achievements'],['achievements.manage','achievements','Manage achievements and rewards'],
  ['administration.manage_members','administration','Manage school members'],['administration.manage_access','administration','Manage roles and module access'],['administration.manage_school','administration','Manage school settings']
].map(([key,moduleKey,name])=>({key,moduleKey,name,description:''}));

const teacherPermissions=PERMISSION_CATALOG.map(item=>item.key).filter(key=>
  !key.endsWith('.view_self')&&!key.endsWith('.view_own')&&!key.endsWith('.connect_own')&&!key.endsWith('.request')&&!key.endsWith('.participate')&&!key.startsWith('administration.')&&!key.endsWith('.manage')
).concat(['attendance.manage_sessions','attendance.override','grades.manage','projects.manage','stackdev.moderate','music.manage']);

export const ROLE_PERMISSION_CATALOG={
  school_admin:PERMISSION_CATALOG.map(item=>item.key).filter(key=>!key.endsWith('.view_self')&&!key.endsWith('.view_own')&&!key.endsWith('.connect_own')&&!key.endsWith('.request')&&!key.endsWith('.participate')),
  teacher:[...new Set(teacherPermissions)],
  student:['timetable.view','attendance.view_self','groups.view_own','grades.view_self','projects.view_self','github.connect_own','stackdev.participate','music.request','achievements.view_self']
};

export const TEACHER_MODULE_PRESETS={
  general:['timetable','attendance','classrooms','groups'],
  programming:['timetable','attendance','classrooms','groups','grades','projects','github','stackdev','music','achievements']
};

export const STUDENT_MODULE_PRESETS={
  programming:['timetable','attendance','groups','grades','projects','github','stackdev','music','achievements']
};
