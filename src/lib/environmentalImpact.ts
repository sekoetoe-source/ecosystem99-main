/**
 * Environmental Impact Reporting Library — Ecosystem99
 * Standardized single-use waste avoided estimation.
 */

export const ENVIRONMENTAL_IMPACT_CONFIG = {
  /** Berat satu botol air mineral sekali pakai dalam gram */
  single_use_bottle_weight_grams: 15.5,
  /** Berat satu alas makan kantin sekali pakai dalam gram */
  single_use_canteen_food_liner_weight_grams: 3.9,
} as const;

export interface EnvironmentalImpactMetrics {
  /** Jumlah pencatatan validasi disetujui (tidak duplikat) */
  validatedActivities: number;
  /** Jumlah penggunaan tumbler tervalidasi (tumbler + break_combo) */
  validatedTumblerUses: number;
  /** Jumlah penggunaan kotak makan tervalidasi (lunchbox + break_combo) */
  validatedLunchboxUses: number;
  /** Estimasi botol sekali pakai yang dihindari dalam gram */
  bottleWasteAvoidedG: number;
  /** Estimasi alas makan sekali pakai yang dihindari dalam gram */
  foodLinerWasteAvoidedG: number;
  /** Estimasi total sampah sekali pakai yang dicegah dalam gram */
  totalWasteAvoidedG: number;
  /** Estimasi total sampah sekali pakai yang dicegah dalam kilogram */
  totalWasteAvoidedKg: number;
  /** Keterangan metodologi formal */
  methodology: string;
}

export interface ValidationItemRecord {
  item_code: string;
  validation_id?: string;
  points?: number;
  student_id?: string;
}

export interface ValidationRecord {
  id: string;
  status: string;
  validation_items?: ValidationItemRecord[];
}

/**
 * Hitung metrik dampak lingkungan dari daftar item tervalidasi.
 * Menghitung penggunaan barang secara cermat tanpa menduplikasi aktivitas.
 */
export function calculateEnvironmentalImpact(
  approvedValidationsCount: number,
  approvedItems: Array<{ item_code: string; validation_id?: string }>,
): EnvironmentalImpactMetrics {
  let tumblerCount = 0;
  let lunchboxCount = 0;

  for (const item of approvedItems) {
    const code = item.item_code?.toLowerCase().trim();
    if (code === "tumbler") {
      tumblerCount += 1;
    } else if (code === "lunchbox") {
      lunchboxCount += 1;
    } else if (code === "break_combo") {
      // Combo di Sesi 2 merepresentasikan 1 penggunaan tumbler + 1 penggunaan kotak makan
      tumblerCount += 1;
      lunchboxCount += 1;
    }
  }

  const bottleWasteAvoidedG = Math.round(
    tumblerCount * ENVIRONMENTAL_IMPACT_CONFIG.single_use_bottle_weight_grams * 10,
  ) / 10;

  const foodLinerWasteAvoidedG = Math.round(
    lunchboxCount * ENVIRONMENTAL_IMPACT_CONFIG.single_use_canteen_food_liner_weight_grams * 10,
  ) / 10;

  const totalWasteAvoidedG = Math.round((bottleWasteAvoidedG + foodLinerWasteAvoidedG) * 10) / 10;
  const totalWasteAvoidedKg = Math.round((totalWasteAvoidedG / 1000) * 100) / 100;

  return {
    validatedActivities: approvedValidationsCount,
    validatedTumblerUses: tumblerCount,
    validatedLunchboxUses: lunchboxCount,
    bottleWasteAvoidedG,
    foodLinerWasteAvoidedG,
    totalWasteAvoidedG,
    totalWasteAvoidedKg,
    methodology:
      "Estimasi dihitung berdasarkan 1 penggunaan tumbler = 15,5 gram botol sekali pakai dan 1 penggunaan kotak makan = 3,9 gram alas makan kantin sekali pakai.",
  };
}

/**
 * Format berat dalam satuan kilogram (atau gram jika < 1 kg) untuk UI Indonesia
 */
export function formatWasteWeight(weightGrams: number): string {
  if (weightGrams >= 1000) {
    const kg = weightGrams / 1000;
    return `${kg.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg`;
  }
  return `${Math.round(weightGrams).toLocaleString("id-ID")} g`;
}

