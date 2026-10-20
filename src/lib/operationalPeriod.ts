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
    period.start_date <= today &&
    period.end_date >= today
  );
}

export function resolveOperationalPeriod<T extends OperationalPeriod>(
  periods: T[],
  today = todayJakartaDate(),
): T | null {
  return periods.find((period) => isOperationalPeriod(period, today)) ?? null;
}
