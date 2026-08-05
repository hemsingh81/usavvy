/**
 * Pure year/month/day-aware age calculation — deliberately not
 * `now.getFullYear() - birthdate.getFullYear()`, which is off by one for anyone whose
 * birthday hasn't occurred yet this calendar year. Both dates are plain "YYYY-MM-DD"
 * strings (matching the schema's string-mode date column) so this never depends on
 * `Date` parsing/timezone behavior.
 */
interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseIsoDate(iso: string): DateParts {
  const [year, month, day] = iso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`invalid ISO date string: ${iso}`);
  }
  return { year, month, day };
}

export function calculateAge(birthdateIso: string, nowIso: string): number {
  const birth = parseIsoDate(birthdateIso);
  const now = parseIsoDate(nowIso);

  let age = now.year - birth.year;
  const hasHadBirthdayThisYear = now.month > birth.month || (now.month === birth.month && now.day >= birth.day);
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  return age;
}
