import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Coffee,
  Info,
  Loader2,
  ScanLine,
  Sparkles,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CameraScanner } from "@/components/eco/CameraScanner";
import { StatusBadge } from "@/routes/siswa.index";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  ScanSession,
  SCAN_SESSIONS,
  calculateSessionPoints,
  formatJakartaTime,
  formatValidationItemsLabel,
} from "@/lib/scanSession";
import {
  unlockAudio,
  playScanDetectedSound,
  playSuccessSound,
  playDuplicateSound,
  playErrorSound,
} from "@/lib/scannerAudio";

export const Route = createFileRoute("/petugas/")({
  head: () => ({
    meta: [
      { title: "Scanner Petugas — School Ecosystem" },
      {
        name: "description",
        content: "Pindai QR siswa untuk memvalidasi tumbler dan kotak makan per sesi pemeriksaan.",
      },
      { property: "og:title", content: "Scanner Petugas — School Ecosystem" },
      { property: "og:description", content: "Validasi Eco-Points siswa lewat pemindaian QR multi-sesi." },
    ],
  }),
  component: ScannerPage,
});

type ScanFeedback =
  | {
      status: "success";
      title: string;
      studentName: string;
      sessionLabel: string;
      itemSummary: string;
      points: number;
      timestamp: Date;
    }
  | {
      status: "duplicate";
      title: string;
      studentName: string;
      sessionLabel: string;
      timeStr: string;
      message: string;
      timestamp: Date;
    }
  | {
      status: "error";
      title: string;
      message: string;
      timestamp: Date;
    };

export function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function ScannerPage() {
  const { me } = useMe();
  const queryClient = useQueryClient();
  const [nis, setNis] = useState("");
  const [camera, setCamera] = useState(false);

  // Active session domain state (Default: entry)
  const [session, setSession] = useState<ScanSession>("entry");

  // ENTRY SESSION: independent checkboxes (can pick either or both)
  const [entryTumbler, setEntryTumbler] = useState(true);
  const [entryLunchbox, setEntryLunchbox] = useState(false);

  // BREAK SESSION: mutually exclusive radio selection (tumbler | lunchbox | break_combo)
  type BreakItemChoice = "tumbler" | "lunchbox" | "break_combo";
  const [breakOption, setBreakOption] = useState<BreakItemChoice>("break_combo");

  // Helper to resolve selected items for active session
  const getItemsForSession = (activeSess: ScanSession): string[] => {
    if (activeSess === "break") {
      return [breakOption]; // Strictly one item: "tumbler", "lunchbox", or "break_combo"
    }
    const items: string[] = [];
    if (entryTumbler) items.push("tumbler");
    if (entryLunchbox) items.push("lunchbox");
    return items;
  };

  // Recent scan feedback banner state
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);

  // Lock guard to prevent multi-frame camera hammering
  const [isProcessing, setIsProcessing] = useState(false);
  const processLockRef = useRef(false);

  const recent = useQuery({
    queryKey: ["officer-recent", me?.officer?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("validations")
        .select(
          "id, status, created_at, session, station, students(full_name, nis), validation_items(item_code, points)"
        )
        .order("created_at", { ascending: false })
        .limit(10);
      return (data as any[]) ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async ({
      code,
      source,
      session: sessionParam,
    }: {
      code: string;
      source: "scan" | "manual";
      session?: ScanSession;
    }) => {
      const activeSession = sessionParam ?? session;
      const cleanCode = code.trim();
      if (!cleanCode) throw new Error("NIS siswa tidak boleh kosong");

      const itemsToValidate = getItemsForSession(activeSession);
      if (itemsToValidate.length === 0) {
        throw new Error("Pilih minimal satu item yang dibawa siswa");
      }

      const { allocations, totalPoints, summaryLabel } = calculateSessionPoints(
        activeSession,
        itemsToValidate
      );
      if (allocations.length === 0) {
        throw new Error("Pilih minimal satu item yang dibawa siswa");
      }

      // 1. Resolve student by NIS
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id, full_name, nis")
        .eq("nis", cleanCode)
        .maybeSingle();

      if (studentError) throw studentError;
      if (!student) {
        throw new Error(`Siswa dengan NIS ${cleanCode} tidak ditemukan`);
      }

      const today = todayJakarta();

      // 2. Validate Duplicate: student + date + session
      const { data: existingValidation } = await supabase
        .from("validations")
        .select("id, created_at, session, station")
        .eq("student_id", student.id)
        .eq("session", activeSession)
        .eq("day", today)
        .neq("status", "rejected")
        .maybeSingle();

      if (existingValidation) {
        const timeStr = formatJakartaTime(existingValidation.created_at);
        const sessionName = SCAN_SESSIONS[activeSession].shortLabel;
        const msg = timeStr
          ? `${student.full_name} sudah tercatat pada sesi ${sessionName} hari ini pukul ${timeStr}.`
          : `${student.full_name} sudah tercatat pada sesi ${sessionName} hari ini.`;

        return {
          kind: "duplicate" as const,
          student,
          session: activeSession,
          timeStr,
          message: msg,
        };
      }

      // 3. Resolve the single operational period before inserting validation
      const { data: activePeriod, error: periodError } = await supabase
        .from("periods")
        .select("id, start_date, end_date")
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (periodError) throw periodError;
      if (!activePeriod) throw new Error("Tidak ada periode operasional aktif");
      if (today < activePeriod.start_date || today > activePeriod.end_date) {
        throw new Error("Tanggal hari ini berada di luar periode operasional aktif");
      }

      // 4. Insert validation row
      const stationName = me?.officer?.station || SCAN_SESSIONS[activeSession].defaultStation;
      const { data: validation, error: vError } = await supabase
        .from("validations")
        .insert({
          student_id: student.id,
          officer_id: me?.officer?.id ?? null,
          period_id: activePeriod.id,
          status: "approved",
          source,
          session: activeSession,
          day: today,
          station: stationName,
          reviewed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (vError) {
        // Catch DB unique index duplicate if race condition occurred
        if (vError.code === "23505") {
          const sessionName = SCAN_SESSIONS[activeSession].shortLabel;
          return {
            kind: "duplicate" as const,
            student,
            session: activeSession,
            timeStr: "",
            message: `${student.full_name} sudah tercatat pada sesi ${sessionName} hari ini.`,
          };
        }
        throw vError;
      }

      // 4. Insert validation items with calculated points
      const rows = allocations.map((a) => ({
        validation_id: validation.id,
        item_code: a.itemCode,
        student_id: student.id,
        points: a.points,
        day: today,
      }));

      const { error: iError } = await supabase.from("validation_items").insert(rows);
      if (iError) {
        // Rollback validation if item insertion fails
        await supabase.from("validations").delete().eq("id", validation.id);
        if (iError.code === "23505") {
          const sessionName = SCAN_SESSIONS[activeSession].shortLabel;
          return {
            kind: "duplicate" as const,
            student,
            session: activeSession,
            timeStr: "",
            message: `${student.full_name} sudah tercatat pada sesi ${sessionName} hari ini.`,
          };
        }
        throw iError;
      }

      return {
        kind: "success" as const,
        student,
        session: activeSession,
        summaryLabel,
        totalPointsAdded: totalPoints,
      };
    },
    onSuccess: (res) => {
      if (res.kind === "duplicate") {
        // B. DUPLICATE: Play distinct BIP-BIP audio and show warning feedback
        playDuplicateSound();
        setFeedback({
          status: "duplicate",
          title: "Scan Ditolak",
          studentName: res.student.full_name,
          sessionLabel: SCAN_SESSIONS[res.session].label,
          timeStr: res.timeStr,
          message: res.message,
          timestamp: new Date(),
        });
        toast.warning(res.message);
      } else {
        // A. SUCCESS: Play cheerful success confirmation sound and show green feedback
        playSuccessSound();
        setFeedback({
          status: "success",
          title: "Scan Berhasil",
          studentName: res.student.full_name,
          sessionLabel: SCAN_SESSIONS[res.session].label,
          itemSummary: res.summaryLabel,
          points: res.totalPointsAdded,
          timestamp: new Date(),
        });
        toast.success(
          `${res.student.full_name} — ${res.summaryLabel} — +${res.totalPointsAdded} poin`
        );
        setNis("");
        queryClient.invalidateQueries({ queryKey: ["officer-recent"] });
        queryClient.invalidateQueries({ queryKey: ["student-summary"] });
        queryClient.invalidateQueries({ queryKey: ["admin-students"] });
        queryClient.invalidateQueries({ queryKey: ["school-stats"] });
        queryClient.invalidateQueries({ queryKey: ["formal-report"] });
      }
    },
    onError: (e) => {
      // D. ERROR: Play low error buzz sound and show error feedback
      playErrorSound();
      const msg = e instanceof Error ? e.message : "Gagal memvalidasi scan";
      setFeedback({
        status: "error",
        title: "Scan Gagal",
        message: msg,
        timestamp: new Date(),
      });
      toast.error(msg);
    },
    onSettled: () => {
      // Unlock camera processing after cooldown so scanner is immediately ready for next student
      setTimeout(() => {
        setIsProcessing(false);
        processLockRef.current = false;
      }, 1000);
    },
  });

  const handleTriggerScan = (codeText: string, source: "scan" | "manual") => {
    if (processLockRef.current || submit.isPending) return;
    processLockRef.current = true;
    setIsProcessing(true);

    // Audio cue: scan detected (short supermarket barcode beep)
    unlockAudio();
    playScanDetectedSound();

    submit.mutate({ code: codeText, source, session });
  };

  const currentSessionMeta = SCAN_SESSIONS[session];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="surface-card p-5 sm:p-6 space-y-4">
          {/* 1. POS HEADER */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold">Pos {me?.officer?.station ?? "Scanner"}</h1>
                <Badge variant="outline" className="text-xs font-semibold text-primary border-primary/30">
                  {currentSessionMeta.badge}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Validasi Eco-Points multi-sesi dengan audio feedback kasir.
              </p>
            </div>
            <Button
              variant={camera ? "secondary" : "default"}
              onClick={() => {
                unlockAudio();
                setCamera(!camera);
              }}
              className="gap-2 shrink-0"
            >
              {camera ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
              {camera ? "Tutup" : "Kamera"}
            </Button>
          </div>

          {/* 2. KAMERA SCANNER (LANGSUNG DI BAWAH HEADER SAAT AKTIF) */}
          {camera && (
            <div className="rounded-2xl overflow-hidden border border-border">
              <CameraScanner
                active={camera}
                isLocked={isProcessing || submit.isPending}
                onResult={(text) => handleTriggerScan(text, "scan")}
              />
            </div>
          )}

          {/* 3. VISUAL STATUS BANNER (FEEDBACK SCAN) */}
          {feedback && (
            <div
              className={cn(
                "p-3.5 rounded-xl border transition-all animate-in fade-in duration-200",
                feedback.status === "success" &&
                  "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300",
                feedback.status === "duplicate" &&
                  "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300",
                feedback.status === "error" &&
                  "bg-destructive/10 border-destructive/30 text-destructive dark:text-destructive"
              )}
            >
              <div className="flex items-start gap-3">
                {feedback.status === "success" && (
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-500 mt-0.5" />
                )}
                {feedback.status === "duplicate" && (
                  <AlertTriangle className="size-5 shrink-0 text-amber-500 mt-0.5" />
                )}
                {feedback.status === "error" && (
                  <XCircle className="size-5 shrink-0 text-destructive mt-0.5" />
                )}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-extrabold text-sm">{feedback.title}</p>
                    <span className="text-[11px] opacity-75">
                      {feedback.timestamp.toLocaleTimeString("id-ID")}
                    </span>
                  </div>
                  {feedback.status === "success" && (
                    <p className="text-sm font-medium">
                      <span className="font-bold">{feedback.studentName}</span> —{" "}
                      {feedback.itemSummary} —{" "}
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                        +{feedback.points} poin
                      </span>
                    </p>
                  )}
                  {feedback.status === "duplicate" && (
                    <p className="text-sm font-medium leading-relaxed">
                      {feedback.message}
                    </p>
                  )}
                  {feedback.status === "error" && (
                    <p className="text-sm font-medium leading-relaxed">
                      {feedback.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 4. PILIH SESI (SESSION SWITCHER RESPONSIVE & WAJIB TERLIHAT) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                Pilih Sesi
              </Label>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-bold px-2 py-0.5",
                  session === "entry"
                    ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                    : "border-amber-500/40 text-amber-600 bg-amber-500/10"
                )}
              >
                Aktif: {session === "entry" ? "Sesi 1 — Masuk" : "Sesi 2 — Istirahat"}
              </Badge>
            </div>

            {/* Dua pilihan berdampingan yang pasti terlihat di mobile & desktop */}
            <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Pilih Sesi Pemeriksaan">
              <button
                type="button"
                role="tab"
                aria-selected={session === "entry"}
                onClick={() => {
                  unlockAudio();
                  setSession("entry");
                }}
                className={cn(
                  "flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 p-3 rounded-xl border-2 text-center transition-all cursor-pointer",
                  session === "entry"
                    ? "border-primary bg-primary text-primary-foreground font-black shadow-md ring-2 ring-primary/20"
                    : "border-border bg-card text-foreground font-bold hover:border-primary/40 hover:bg-muted/40"
                )}
              >
                <span className="text-lg leading-none shrink-0">🌅</span>
                <div className="leading-tight text-center sm:text-left">
                  <span className="block font-black text-xs sm:text-sm">Sesi 1</span>
                  <span className="block text-[10px] sm:text-xs font-semibold opacity-90">Masuk Sekolah</span>
                </div>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={session === "break"}
                onClick={() => {
                  unlockAudio();
                  setSession("break");
                }}
                className={cn(
                  "flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 p-3 rounded-xl border-2 text-center transition-all cursor-pointer",
                  session === "break"
                    ? "border-primary bg-primary text-primary-foreground font-black shadow-md ring-2 ring-primary/20"
                    : "border-border bg-card text-foreground font-bold hover:border-primary/40 hover:bg-muted/40"
                )}
              >
                <span className="text-lg leading-none shrink-0">🍱</span>
                <div className="leading-tight text-center sm:text-left">
                  <span className="block font-black text-xs sm:text-sm">Sesi 2</span>
                  <span className="block text-[10px] sm:text-xs font-semibold opacity-90">Istirahat / Kantin</span>
                </div>
              </button>
            </div>
          </div>

          {/* 5. ITEM YANG DIBAWA SESUAI SESI */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                Item yang dibawa
              </Label>
              <span
                className={cn(
                  "text-xs font-extrabold px-2 py-0.5 rounded-full border",
                  session === "entry"
                    ? entryTumbler && entryLunchbox
                      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                      : entryTumbler || entryLunchbox
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-destructive/10 text-destructive border-destructive/20"
                    : breakOption === "break_combo"
                    ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                    : "bg-primary/10 text-primary border-primary/20"
                )}
              >
                {session === "entry"
                  ? entryTumbler && entryLunchbox
                    ? "Total: +150 poin (Keduanya)"
                    : entryTumbler
                    ? "Total: +100 poin (Tumbler)"
                    : entryLunchbox
                    ? "Total: +50 poin (Kotak Makan)"
                    : "Pilih minimal 1 item"
                  : breakOption === "break_combo"
                  ? "Total: +250 poin (Combo)"
                  : breakOption === "tumbler"
                  ? "Total: +100 poin (Tumbler saja)"
                  : "Total: +50 poin (Kotak Makan saja)"}
              </span>
            </div>

            {session === "entry" ? (
              // SESI 1: Checkbox Independen (Tumbler +100, Kotak Makan +50, Keduanya +150)
              <div className="space-y-2">
                <div className="grid gap-2 grid-cols-2">
                  <label
                    onClick={() => unlockAudio()}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border-2 p-3 transition-all cursor-pointer",
                      entryTumbler
                        ? "border-emerald-600 bg-emerald-500/10 shadow-xs ring-2 ring-emerald-500/20"
                        : "border-border bg-card hover:bg-muted/40"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={entryTumbler}
                      onChange={(e) => setEntryTumbler(e.target.checked)}
                      className="size-4.5 text-emerald-600 accent-emerald-600 rounded cursor-pointer shrink-0"
                    />
                    <Coffee
                      className={cn(
                        "size-4 sm:size-5 shrink-0",
                        entryTumbler ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block font-bold text-xs sm:text-sm truncate">Tumbler</span>
                      <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                        +100 poin
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => unlockAudio()}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border-2 p-3 transition-all cursor-pointer",
                      entryLunchbox
                        ? "border-emerald-600 bg-emerald-500/10 shadow-xs ring-2 ring-emerald-500/20"
                        : "border-border bg-card hover:bg-muted/40"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={entryLunchbox}
                      onChange={(e) => setEntryLunchbox(e.target.checked)}
                      className="size-4.5 text-emerald-600 accent-emerald-600 rounded cursor-pointer shrink-0"
                    />
                    <UtensilsCrossed
                      className={cn(
                        "size-4 sm:size-5 shrink-0",
                        entryLunchbox ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block font-bold text-xs sm:text-sm truncate">Kotak Makan</span>
                      <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                        +50 poin
                      </span>
                    </div>
                  </label>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  * Checkbox independen: Tumbler (+100), Kotak Makan (+50). Boleh dipilih salah satu atau keduanya (total +150 poin).
                </p>
              </div>
            ) : (
              // SESI 2: Radio Eksklusif (1. Tumbler saja, 2. Kotak Makan saja, 3. Combo)
              <div className="space-y-2">
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-3" role="radiogroup">
                  {[
                    {
                      value: "tumbler" as const,
                      label: "Tumbler saja",
                      points: 100,
                      icon: Coffee,
                      isCombo: false,
                    },
                    {
                      value: "lunchbox" as const,
                      label: "Kotak Makan saja",
                      points: 50,
                      icon: UtensilsCrossed,
                      isCombo: false,
                    },
                    {
                      value: "break_combo" as const,
                      label: "Combo Tumbler + Lunchbox",
                      points: 250,
                      icon: Sparkles,
                      isCombo: true,
                    },
                  ].map((opt) => {
                    const isSelected = breakOption === opt.value;
                    return (
                      <label
                        key={opt.value}
                        onClick={() => unlockAudio()}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border-2 p-3 transition-all cursor-pointer",
                          isSelected
                            ? opt.isCombo
                              ? "border-amber-500 bg-amber-500/10 shadow-xs ring-2 ring-amber-500/30"
                              : "border-primary bg-primary/10 shadow-xs ring-2 ring-primary/20"
                            : "border-border bg-card hover:bg-muted/40"
                        )}
                      >
                        <input
                          type="radio"
                          name="break-exclusive-choice"
                          value={opt.value}
                          checked={isSelected}
                          onChange={() => setBreakOption(opt.value)}
                          className="size-4.5 text-primary accent-primary cursor-pointer shrink-0"
                        />
                        <opt.icon
                          className={cn(
                            "size-4 sm:size-5 shrink-0",
                            isSelected
                              ? opt.isCombo
                                ? "text-amber-500"
                                : "text-primary"
                              : "text-muted-foreground"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="block font-bold text-xs sm:text-sm truncate">
                              {opt.label}
                            </span>
                            {opt.isCombo && (
                              <span className="text-[9px] font-black uppercase px-1 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                                COMBO
                              </span>
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-[11px] font-extrabold",
                              opt.isCombo
                                ? "text-amber-600 dark:text-amber-400"
                                : isSelected
                                ? "text-primary"
                                : "text-muted-foreground"
                            )}
                          >
                            +{opt.points} poin
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <p className="text-[11px] text-muted-foreground">
                  * Pilihan saling eksklusif (radio): hanya satu opsi yang aktif. Combo bernilai utuh +250 poin.
                </p>
              </div>
            )}
          </div>

          {/* 6. INPUT NIS MANUAL + VALIDASI */}
          <form
            className="pt-1 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              unlockAudio();
              handleTriggerScan(nis, "manual");
            }}
          >
            <Input
              value={nis}
              onChange={(e) => setNis(e.target.value)}
              placeholder="Input NIS manual siswa"
              required
              disabled={submit.isPending}
            />
            <Button type="submit" disabled={submit.isPending || isProcessing} className="gap-2">
              {submit.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanLine className="size-4" />
              )}
              Validasi
            </Button>
          </form>
        </div>
      </div>

      {/* 6. AKTIVITAS TERAKHIR PETUGAS */}
      <div className="surface-card divide-y divide-border">
        <div className="px-5 py-4 flex items-center justify-between">
          <p className="font-bold">Aktivitas Terakhir Pos</p>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="size-3.5" /> Hari ini
          </span>
        </div>
        {(recent.data ?? []).map((r: any) => {
          const sessMeta = SCAN_SESSIONS[(r.session as ScanSession) || "entry"] || SCAN_SESSIONS.entry;
          const totalPts = (r.validation_items ?? []).reduce(
            (acc: number, item: any) => acc + Number(item.points || 0),
            0
          );
          const itemNames = formatValidationItemsLabel(r.session, r.validation_items);

          return (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">
                    {r.students?.full_name ?? "Siswa"}
                  </p>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    NIS {r.students?.nis ?? "-"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium text-foreground/80">
                    {sessMeta.shortLabel}
                  </span>
                  <span>·</span>
                  <span>{itemNames || "-"}</span>
                  <span>·</span>
                  <span>{new Date(r.created_at).toLocaleTimeString("id-ID")}</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                  +{totalPts}
                </span>
                <StatusBadge status={r.status} />
              </div>
            </div>
          );
        })}
        {(recent.data ?? []).length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Belum ada aktivitas scan pada pos ini hari ini.
          </p>
        )}
      </div>
    </div>
  );
}