export const CREDIT_BY_GRADE={10:500,9:350,8:250,7:175,6:120,5:80,4:50,3:25,2:10,1:0};
export const XP_BY_GRADE={10:700,9:550,8:430,7:340,6:270,5:210,4:160,3:110,2:70,1:30};

const XP_MULTIPLIER={formative:0.25,summative:0.5,final:1,assessment:1};

export function normalizeGrade(grade){return Math.max(1,Math.min(10,Number(grade)||1))}
export function creditsForGrade(grade){return CREDIT_BY_GRADE[normalizeGrade(grade)]||0}
export function xpForGrade(grade,sourceType='final'){
  const base=XP_BY_GRADE[normalizeGrade(grade)]||0;
  return Math.round(base*(XP_MULTIPLIER[sourceType]??XP_MULTIPLIER.final));
}
