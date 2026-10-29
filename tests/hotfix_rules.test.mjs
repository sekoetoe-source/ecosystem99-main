import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calculateStudentStreak } from "../src/lib/studentStreak.ts";
import {
  calculateEnvironmentalImpact,
  ENVIRONMENTAL_IMPACT_CONFIG,
  formatWasteWeight,
} from "../src/lib/environmentalImpact.ts";

describe("Ecosystem99 Hotfix Test Suite", () => {
  describe("F. Student Streak — Weekends Are Non-Breaking Days", () => {
    test("Jumat ke Senin tanpa scan akhir pekan tetap melanjutkan streak", () => {
      // Student scanned Thu 2026-10-15 and Fri 2026-10-16
      // Weekend Sat 2026-10-17 and Sun 2026-10-18: no scans
      // Student scans on Mon 2026-10-19
      const validations = [
        { day: "2026-10-15", status: "approved" },
        { day: "2026-10-16", status: "approved" },
        { day: "2026-10-19", status: "approved" },
      ];

      const streakMon = calculateStudentStreak(validations, "2026-10-19");
      assert.strictEqual(streakMon, 3, "Streak harus berlanjut menjadi 3 hari aktif");
    });

    test("Pada hari Sabtu dan Minggu, streak Jumat tidak ter-reset ke 0", () => {
      const validations = [
        { day: "2026-10-15", status: "approved" },
        { day: "2026-10-16", status: "approved" },
      ];

      const streakSat = calculateStudentStreak(validations, "2026-10-17"); // Saturday
      assert.strictEqual(streakSat, 2, "Streak pada hari Sabtu harus tetap 2");

      const streakSun = calculateStudentStreak(validations, "2026-10-18"); // Sunday
      assert.strictEqual(streakSun, 2, "Streak pada hari Minggu harus tetap 2");
    });

    test("Pada hari Senin sebelum siswa scan, streak Jumat tetap terjaga", () => {
      const validations = [
        { day: "2026-10-15", status: "approved" },
        { day: "2026-10-16", status: "approved" },
      ];

      // Monday in-progress before scanning
      const streakMonBeforeScan = calculateStudentStreak(validations, "2026-10-19");
      assert.strictEqual(streakMonBeforeScan, 2, "Streak sebelum scan di hari Senin harus tetap 2");
    });

    test("Hari sekolah (weekday) yang terlewat memutus streak", () => {
      // Scanned Mon 12, Tue 13, MISSED Wed 14, scanned Thu 15, Fri 16
      const validations = [
        { day: "2026-10-12", status: "approved" },
        { day: "2026-10-13", status: "approved" },
        { day: "2026-10-15", status: "approved" },
        { day: "2026-10-16", status: "approved" },
      ];

      const streak = calculateStudentStreak(validations, "2026-10-16");
      assert.strictEqual(streak, 2, "Streak hanya dihitung dari Kamis dan Jumat (2 hari)");
    });

    test("Scan duplikat atau multiple sesi di hari yang sama tidak menambah hitungan streak", () => {
      const validations = [
        { day: "2026-10-16", status: "approved" },
        { day: "2026-10-16", status: "approved" }, // same day Sesi 2
        { day: "2026-10-16", status: "approved" }, // duplicate
      ];

      const streak = calculateStudentStreak(validations, "2026-10-16");
      assert.strictEqual(streak, 1, "Satu hari kalender hanya dihitung 1 streak");
    });

    test("Scan ditolak atau pending tidak memperpanjang streak", () => {
      const validations = [
        { day: "2026-10-15", status: "approved" }, // Thu
        { day: "2026-10-16", status: "rejected" }, // Fri rejected scan
      ];

      // Pada hari Jumat, scan ditolak tidak memperpanjang streak menjadi 2 (tetap 1 dari Kamis)
      const streakFri = calculateStudentStreak(validations, "2026-10-16");
      assert.strictEqual(streakFri, 1, "Scan yang ditolak tidak boleh memperpanjang streak menjadi 2");

      // Pada hari Sabtu, karena Jumat tidak memiliki scan approved, streak terputus menjadi 0
      const streakSat = calculateStudentStreak(validations, "2026-10-17");
      assert.strictEqual(streakSat, 0, "Hari sekolah berikutnya setelah Jumat ditolak harus menghasilkan streak 0");
    });

    test("Streak berlanjut melewati pergantian bulan (contoh 31 Okt ke 2 Nov)", () => {
      // 2026-10-30 = Friday, 2026-10-31 = Saturday, 2026-11-01 = Sunday, 2026-11-02 = Monday
      const validations = [
        { day: "2026-10-29", status: "approved" }, // Thu
        { day: "2026-10-30", status: "approved" }, // Fri
        { day: "2026-11-02", status: "approved" }, // Mon (Bulan baru)
      ];

      const streak = calculateStudentStreak(validations, "2026-11-02");
      assert.strictEqual(streak, 3, "Streak harus berlanjut menyeberang bulan dari 30 Okt ke 2 Nov");
    });
  });

  describe("D. Environmental Impact Metrics — Avoided Single-Use Waste", () => {
    test("Konfigurasi berat acuan per item sesuai spesifikasi", () => {
      assert.strictEqual(ENVIRONMENTAL_IMPACT_CONFIG.single_use_bottle_weight_grams, 15.5);
      assert.strictEqual(ENVIRONMENTAL_IMPACT_CONFIG.single_use_canteen_food_liner_weight_grams, 3.9);
    });

    test("Perhitungan dampak lingkungan menghitung item secara valid tanpa menduplikasi aktivitas", () => {
      // 3 validasi disetujui:
      // Validasi 1: Tumbler (1 tumbler)
      // Validasi 2: Tumbler + Kotak Makan (1 tumbler, 1 lunchbox)
      // Validasi 3: Break Combo (1 tumbler, 1 lunchbox)
      const approvedItems = [
        { item_code: "tumbler", validation_id: "v1" },
        { item_code: "tumbler", validation_id: "v2" },
        { item_code: "lunchbox", validation_id: "v2" },
        { item_code: "break_combo", validation_id: "v3" },
      ];
      const approvedCount = 3;

      const impact = calculateEnvironmentalImpact(approvedCount, approvedItems);

      assert.strictEqual(impact.validatedActivities, 3, "Total aktivitas tervalidasi harus 3");
      assert.strictEqual(impact.validatedTumblerUses, 3, "Total penggunaan tumbler (2 normal + 1 combo) harus 3");
      assert.strictEqual(impact.validatedLunchboxUses, 2, "Total penggunaan kotak makan (1 normal + 1 combo) harus 2");

      // bottle: 3 * 15.5 = 46.5 g
      assert.strictEqual(impact.bottleWasteAvoidedG, 46.5);
      // liner: 2 * 3.9 = 7.8 g
      assert.strictEqual(impact.foodLinerWasteAvoidedG, 7.8);
      // total: 46.5 + 7.8 = 54.3 g
      assert.strictEqual(impact.totalWasteAvoidedG, 54.3);
      // total kg: 54.3 / 1000 = 0.05 kg
      assert.strictEqual(impact.totalWasteAvoidedKg, 0.05);
    });

    test("Format berat sampah menghasilkan teks yang mudah dibaca", () => {
      assert.strictEqual(formatWasteWeight(500), "500 g");
      assert.strictEqual(formatWasteWeight(15500), "15,5 kg");
    });
  });
});
