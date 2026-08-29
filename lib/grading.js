export const SCHOOL_GRADE_SCALE=[
  {grade:10,min:97,max:100},
  {grade:9,min:92,max:96},
  {grade:8,min:84,max:91},
  {grade:7,min:76,max:83},
  {grade:6,min:68,max:75},
  {grade:5,min:60,max:67},
  {grade:4,min:45,max:59},
  {grade:3,min:30,max:44},
  {grade:2,min:15,max:29},
  {grade:1,min:0,max:14}
];

export function gradeFromPercent(value){
  const percent=Math.max(0,Math.min(100,Math.round(Number(value)||0)));
  return SCHOOL_GRADE_SCALE.find(x=>percent>=x.min&&percent<=x.max)?.grade||1;
}

export function gradeRange(grade){
  return SCHOOL_GRADE_SCALE.find(x=>x.grade===Number(grade))||null;
}
