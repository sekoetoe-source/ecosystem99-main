/**
 * Student Streak Calculation Engine — Ecosystem99
 * Weekends (Saturday and Sunday) are non-mandatory days and do NOT break streaks.
 * Timezone: Asia/Jakarta
 */

export interface ValidationDateEntry {
  day: string; // YYYY-MM-DD
  status: "approved" | "rejected" | "pending";
}

/**
 * Returns ISO day of week for a YYYY-MM-DD string:
 * 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday, 7 = Sunday
 */
export function getIsoDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

export function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Calculate student streak based on valid approved scans.
 * @param validations List of student's validations with day and status
 * @param referenceDate Jakarta date as YYYY-MM-DD (defaults to today in Asia/Jakarta)
 */
export function calculateStudentStreak(
  validations: ValidationDateEntry[],
  referenceDate: string,
): number {
  // Only approved validations count; duplicate scans on the same day are deduplicated
  const approvedDays = new Set(
    validations
      .filter((v) => v.status === "approved" && v.day <= referenceDate)
      .map((v) => v.day),
  );

  const hasScanToday = approvedDays.has(referenceDate);
  let cursorDay: string | null = null;
  const dow = getIsoDayOfWeek(referenceDate);

  if (hasScanToday) {
    cursorDay = referenceDate;
  } else {
    // Today has no scan. Find the last required school day.
    let lastRequiredDay: string;
    if (dow === 1) {
      lastRequiredDay = subtractDays(referenceDate, 3); // Previous Friday
    } else if (dow === 7) {
      lastRequiredDay = subtractDays(referenceDate, 2); // Friday
    } else if (dow === 6) {
      lastRequiredDay = subtractDays(referenceDate, 1); // Friday
    } else {
      lastRequiredDay = subtractDays(referenceDate, 1); // Yesterday
    }

    if ((dow === 6 || dow === 7) && hasScanToday) {
      cursorDay = referenceDate;
    } else {
      if (approvedDays.has(lastRequiredDay)) {
        cursorDay = lastRequiredDay;
      } else if (dow === 7 && approvedDays.has(subtractDays(referenceDate, 1))) {
        // Scanned on Saturday over the weekend
        cursorDay = subtractDays(referenceDate, 1);
      } else {
        return 0;
      }
    }
  }

  let streak = 0;
  while (cursorDay !== null) {
    const dayDow = getIsoDayOfWeek(cursorDay);
    if (approvedDays.has(cursorDay)) {
      streak += 1;
      cursorDay = subtractDays(cursorDay, 1);
    } else {
      // If cursorDay is a weekend (Sat or Sun), skip without breaking streak
      if (dayDow === 6 || dayDow === 7) {
        cursorDay = subtractDays(cursorDay, 1);
      } else {
        // Missing school day breaks the streak
        break;
      }
    }
  }

  return streak;
}

