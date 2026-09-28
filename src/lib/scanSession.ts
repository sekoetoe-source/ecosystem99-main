/**
 * Domain concepts and business rules for Multi-Session Eco Scan.
 */

export type ScanSession = "entry" | "break";

export interface SessionConfig {
  key: ScanSession;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
  defaultStation: string;
  icon: string;
}

export const SCAN_SESSIONS: Record<ScanSession, SessionConfig> = {
  entry: {
    key: "entry",
    label: "Masuk Sekolah",
    shortLabel: "Masuk",
    badge: "SESI 1",
    description: "Pagi hari di gerbang utama / pos kedatangan sekolah",
    defaultStation: "Gerbang Utama",
    icon: "🌅",
  },
  break: {
    key: "break",
    label: "Istirahat / Jajan Kantin",
    shortLabel: "Istirahat",
    badge: "SESI 2",
    description: "Jam istirahat dan jajan ramah lingkungan di kantin",
    defaultStation: "Kantin",
    icon: "🍱",
  },
};

export interface PointAllocation {
  itemCode: string;
  points: number;
}

export interface SessionCalculationResult {
  allocations: PointAllocation[];
  totalPoints: number;
  summaryLabel: string;
}

/**
 * Calculates point allocations based on the active session and selected items.
 *
 * Rules:
 * - ENTRY (Masuk):
 *   Tumbler: 100 pts
 *   Lunchbox: 50 pts
 *   Tumbler + Lunchbox: 150 pts
 *
 * - BREAK (Istirahat):
 *   Tumbler saja: 100 pts
 *   Lunchbox saja: 50 pts
 *   break_combo: 250 pts (disimpan sebagai item tunggal code: "break_combo")
 */
export function calculateSessionPoints(
  session: ScanSession,
  selectedItems: string[],
): SessionCalculationResult {
  if (session === "break") {
    const isCombo = selectedItems.includes("break_combo") || (selectedItems.includes("tumbler") && selectedItems.includes("lunchbox"));
    const hasTumbler = selectedItems.includes("tumbler");
    const hasLunchbox = selectedItems.includes("lunchbox");

    if (isCombo) {
      return {
        allocations: [{ itemCode: "break_combo", points: 250 }],
        totalPoints: 250,
        summaryLabel: "Combo Tumbler + Lunchbox",
      };
    }
    if (hasTumbler) {
      return {
        allocations: [{ itemCode: "tumbler", points: 100 }],
        totalPoints: 100,
        summaryLabel: "Tumbler",
      };
    }
    if (hasLunchbox) {
      return {
        allocations: [{ itemCode: "lunchbox", points: 50 }],
        totalPoints: 50,
        summaryLabel: "Kotak Makan",
      };
    }
    return {
      allocations: [],
      totalPoints: 0,
      summaryLabel: "Tidak ada item",
    };
  }

  // Session: ENTRY
  const hasTumbler = selectedItems.includes("tumbler");
  const hasLunchbox = selectedItems.includes("lunchbox");
  const allocations: PointAllocation[] = [];
  if (hasTumbler) allocations.push({ itemCode: "tumbler", points: 100 });
  if (hasLunchbox) allocations.push({ itemCode: "lunchbox", points: 50 });

  const totalPoints = allocations.reduce((acc, a) => acc + a.points, 0);
  const summaryLabel =
    hasTumbler && hasLunchbox
      ? "Tumbler + Kotak Makan"
      : hasTumbler
        ? "Tumbler"
        : hasLunchbox
          ? "Kotak Makan"
          : "Tidak ada item";

  return {
    allocations,
    totalPoints,
    summaryLabel,
  };
}

/**
 * Returns formatted label for items list in validations history / recent.
 */
export function formatValidationItemsLabel(
  session: string | null | undefined,
  items: { item_code: string; points?: number }[] = []
): string {
  if (items.some((i) => i.item_code === "break_combo")) {
    return "Combo Tumbler + Lunchbox";
  }
  const hasTumbler = items.some((i) => i.item_code === "tumbler");
  const hasLunchbox = items.some((i) => i.item_code === "lunchbox");

  if (session === "break" && hasTumbler && hasLunchbox) {
    return "Combo Tumbler + Lunchbox";
  }
  if (hasTumbler && hasLunchbox) {
    return "Tumbler + Kotak Makan";
  }
  if (hasTumbler) return "Tumbler";
  if (hasLunchbox) return "Kotak Makan";

  return items.map((i) => (i.item_code === "break_combo" ? "Combo Tumbler + Lunchbox" : i.item_code)).join(" + ") || "-";
}

/**
 * Returns formatted time in Asia/Jakarta timezone.
 */
export function formatJakartaTime(isoString: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return "";
  }
}

/**
 * Returns formatted date in Asia/Jakarta timezone.
 */
export function formatJakartaDate(isoString: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(isoString));
  } catch {
    return "";
  }
}
