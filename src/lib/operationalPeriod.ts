export type OperationalPeriod = {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  late_scan_start_date?: string | null;
  late_scan_end_date?: string | null;
};

export function todayJakartaDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

export function isOperationalPeriod(
  period: OperationalPeriod,
  today = todayJakartaDate(),
): boolean {
  const name = period.name.toLowerCase();
  return (
    period.status === "ACTIVE" &&
    !name.includes("testing") &&
    !name.includes("uji coba") &&
    period.start_date <= today
  );
}

export function resolveOperationalPeriod<T extends OperationalPeriod>(
  periods: T[],
  today = todayJakartaDate(),
): T | null {
  const operational = periods.filter((period) => isOperationalPeriod(period, today));
  if (operational.length === 0) return null;

  // 1. Prefer period currently encompassing today
  const currentWindow = operational.find((period) => period.end_date >= today);
  if (currentWindow) return currentWindow;

  // 2. If calendar passed end_date but period remains ACTIVE (not yet closed by admin),
  // fallback to the latest active operational period that started
  return (
    operational.slice().sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null
  );
}
