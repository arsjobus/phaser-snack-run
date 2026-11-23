/** UTC calendar day as `YYYY-MM-DD`: the date stamped on high scores and unlocked achievements. */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
