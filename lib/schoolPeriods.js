export const SCHOOL_OVERTIME_BLOCKS = [1, 2, 3, 4];

export function overtimeBlockNumber(period) {
  const lesson = Number(period);
  if (!Number.isInteger(lesson) || lesson < 1) return null;
  return Math.ceil(lesson / 2);
}

export function overtimeLabel(period, { short = false } = {}) {
  const block = overtimeBlockNumber(period);
  if (!block) return short ? "PĀR" : "Pārstunda";
  return short ? `${block}. PĀR` : `${block}. pārstunda`;
}

export function firstLessonOfOvertime(block) {
  return (Number(block) - 1) * 2 + 1;
}
