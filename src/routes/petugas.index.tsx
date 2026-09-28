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

  // Selected items state:
  // For ENTRY: string[] contains 'tumbler', 'lunchbox', or both
  // For BREAK: string[] contains 'tumbler', 'lunchbox', or both (combo)
  const [selectedItems, setSelectedItems] = useState<string[]>(["tumbler"]);

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
    mutationFn: async ({ code, source }: { code: string; source: "scan" | "manual" }) => {
      const cleanCode = code.trim();
      if (!cleanCode) throw new Error("NIS siswa tidak boleh kosong");

      const { allocations, totalPoints, summaryLabel } = calculateSessionPoints(
        session,
        selectedItems
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
        .eq("session", session)
        .eq("day", today)
        .neq("status", "rejected")
        .maybeSingle();

      if (existingValidation) {
        const timeStr = formatJakartaTime(existingValidation.created_at);
        const sessionName = SCAN_SESSIONS[session].shortLabel;
        const msg = timeStr
          ? `${student.full_name} sudah tercatat pada sesi ${sessionName} hari ini pukul ${timeStr}.`
          : `${student.full_name} sudah tercatat pada sesi ${sessionName} hari ini.`;

        return {
          kind: "duplicate" as const,
          student,
          session,
          timeStr,
          message: msg,
        };
      }

      // 3. Insert validation row
      const stationName = me?.officer?.station || SCAN_SESSIONS[session].defaultStation;
      const { data: validation, error: vError } = await supabase
        .from("validations")
        .insert({
          student_id: student.id,
          officer_id: me?.officer?.id ?? null,
          status: "approved",
          source,
          session,
          day: today,
          station: stationName,
          reviewed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (vError) {
        // Catch DB unique index duplicate if race condition occurred
        if (vError.code === "23505") {
          const sessionName = SCAN_SESSIONS[session].shortLabel;
          return {
            kind: "duplicate" as const,
            student,
            session,
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
          const sessionName = SCAN_SESSIONS[session].shortLabel;
          return {
            kind: "duplicate" as const,
            student,
            session,
            timeStr: "",
            message: `${student.full_name} sudah tercatat pada sesi ${sessionName} hari ini.`,
          };
        }
        throw iError;
      }

      return {
        kind: "success" as const,
        student,
        session,
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

    submit.mutate({ code: codeText, source });
  };

  const currentSessionMeta = SCAN_SESSIONS[session];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold">Pos {me?.officer?.station ?? "Scanner"}</h1>
                <Badge variant="outline" className="text-xs font-semibold text-primary border-primary/30">
                  {currentSessionMeta.badge}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Validasi Eco-Points multi-sesi dengan audio feedback kasir.
              </p>
            </div>
            <Button
              variant={camera ? "secondary" : "default"}
              onClick={() => {
                unlockAudio();
                setCamera(!camera);
              }}
              className="gap-2"
            >
              {camera ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
              {camera ? "Tutup" : "Kamera"}
            </Button>
          </div>

          {/* 1. SESSION SELECTOR / INDIKATOR SESI AKTIF */}
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                SESSION AKTIF
              </Label>
              <span className="text-xs text-primary font-medium">
                {currentSessionMeta.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["entry", "break"] as ScanSession[]).map((sessKey) => {
                const meta = SCAN_SESSIONS[sessKey];
                const active = session === sessKey;
                return (
                  <button
                    key={sessKey}
                    type="button"
                    onClick={() => {
                      unlockAudio();
                      setSession(sessKey);
                      // Default items per session
                      if (sessKey === "entry") {
                        setSelectedItems(["tumbler"]);
                      } else {
                        setSelectedItems(["break_combo"]); // default combo for break
                      }
                    }}
                    className={cn(
                      "flex flex-col text-left p-3.5 rounded-2xl border transition-all cursor-pointer",
                      active
                        ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                        : "border-border hover:bg-muted/50 text-muted-foreground"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-base font-extrabold flex items-center gap-1.5 text-foreground">
                        <span>{meta.icon}</span> {meta.shortLabel}
                      </span>
                      {active && (
                        <span className="inline-block size-2 rounded-full bg-primary animate-pulse" />
                      )}
                    </div>
                    <span className="text-[11px] mt-1 text-muted-foreground line-clamp-1">
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. ITEM SELECTION ACCORDING TO SESSION */}
          <div className="mt-5 space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
              Item yang dibawa ({currentSessionMeta.shortLabel})
            </Label>

            {session === "entry" ? (
              // ENTRY SESSION: Tumbler, Lunchbox, or Both
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { code: "tumbler", label: "Tumbler", points: 100, icon: Coffee },
                  { code: "lunchbox", label: "Kotak Makan", points: 50, icon: UtensilsCrossed },
                ].map((item) => {
                  const checked = selectedItems.includes(item.code);
                  return (
                    <label
                      key={item.code}
                      onClick={() => unlockAudio()}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-all",
                        checked
                          ? "border-emerald-600 bg-emerald-500/10 shadow-sm"
                          : "border-border hover:bg-muted/40"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary rounded"
                        checked={checked}
                        onChange={(e) => {
                          const isCheck = e.target.checked;
                          setSelectedItems((prev) =>
                            isCheck ? [...prev, item.code] : prev.filter((c) => c !== item.code)
                          );
                        }}
                      />
                      <item.icon className={cn("size-5", checked ? "text-emerald-500" : "text-muted-foreground")} />
                      <div className="flex-1">
                        <span className="block font-semibold text-sm">{item.label}</span>
                        <span className="text-xs text-muted-foreground">+{item.points} poin</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              // BREAK SESSION: 3 Explicit Choices: Tumbler only (100), Lunchbox only (50), Combo (250)
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    id: "tumbler-only",
                    label: "Tumbler Saja",
                    points: 100,
                    icon: Coffee,
                    items: ["tumbler"],
                  },
                  {
                    id: "lunchbox-only",
                    label: "Lunchbox Saja",
                    points: 50,
                    icon: UtensilsCrossed,
                    items: ["lunchbox"],
                  },
                  {
                    id: "combo",
                    label: "Combo Tumbler + Lunchbox",
                    points: 250,
                    icon: Sparkles,
                    items: ["break_combo"],
                    isCombo: true,
                  },
                ].map((opt) => {
                  const isSelected =
                    opt.items.length === selectedItems.length &&
                    opt.items.every((it) => selectedItems.includes(it));
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        unlockAudio();
                        setSelectedItems(opt.items);
                      }}
                      className={cn(
                        "flex flex-col text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative",
                        isSelected
                          ? opt.isCombo
                            ? "border-amber-500 bg-amber-500/10 shadow-sm ring-1 ring-amber-500"
                            : "border-emerald-600 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-600"
                          : "border-border hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <opt.icon
                          className={cn(
                            "size-4",
                            isSelected
                              ? opt.isCombo
                                ? "text-amber-500"
                                : "text-emerald-500"
                              : "text-muted-foreground"
                          )}
                        />
                        <span className="text-xs font-bold">{opt.label}</span>
                      </div>
                      <span
                        className={cn(
                          "mt-2 text-sm font-extrabold",
                          opt.isCombo ? "text-amber-500" : "text-primary"
                        )}
                      >
                        +{opt.points} poin
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. VISUAL STATUS BANNER (SUCCESS / DUPLICATE / ERROR FEEDBACK) */}
          {feedback && (
            <div
              className={cn(
                "mt-5 p-4 rounded-2xl border transition-all animate-in fade-in duration-200",
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

          {/* 4. CAMERA SCANNER WITH DEBOUNCE PROTECTION */}
          {camera && (
            <div className="mt-5">
              <CameraScanner
                active={camera}
                isLocked={isProcessing || submit.isPending}
                onResult={(text) => handleTriggerScan(text, "scan")}
              />
            </div>
          )}

          {/* 5. MANUAL NIS INPUT FORM */}
          <form
            className="mt-5 flex gap-2"
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