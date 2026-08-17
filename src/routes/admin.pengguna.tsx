import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Download, Upload, QrCode, Printer, Search, Plus, UserCheck, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { QrImage } from "@/components/eco/QrImage";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/pengguna")({
  head: () => ({
    meta: [
      { title: "Data Pengguna — School Ecosystem" },
      {
        name: "description",
        content: "Daftar siswa, kelas, petugas pos, dan wali kelas yang terdaftar dalam ekosistem hijau sekolah.",
      },
      { property: "og:title", content: "Data Pengguna — School Ecosystem" },
      { property: "og:description", content: "Kelola data siswa dan petugas pos sekolah." },
    ],
  }),
  component: PenggunaPage,
});

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function PenggunaPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [printClass, setPrintClass] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"siswa" | "petugas" | "semua" | "persetujuan">("siswa");

  // Modal form states
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentNis, setStudentNis] = useState("");
  const [studentClassId, setStudentClassId] = useState("");

  const [addOfficerOpen, setAddOfficerOpen] = useState(false);
  const [officerName, setOfficerName] = useState("");
  const [officerStation, setOfficerStation] = useState("Gerbang Utama");

  // Edit Officer state
  const [editingOfficer, setEditingOfficer] = useState<any | null>(null);
  const [editOfficerName, setEditOfficerName] = useState("");
  const [editOfficerStation, setEditOfficerStation] = useState("Gerbang Utama");
  const [editOfficerActive, setEditOfficerActive] = useState(true);

  // Create User Account state
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addFullName, setAddFullName] = useState("");
  const [addRole, setAddRole] = useState("student");
  const [addClassId, setAddClassId] = useState("");
  const [addStation, setAddStation] = useState("Gerbang Utama");

  const [changeRoleUser, setChangeRoleUser] = useState<any | null>(null);
  const [newRole, setNewRole] = useState("");
  const [newClassId, setNewClassId] = useState("");
  const [newStation, setNewStation] = useState("Gerbang Utama");

  async function downloadQrCode(student: any) {
    try {
      const url = await QRCode.toDataURL(student.nis, { width: 720, margin: 2 });
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-${student.nis}-${student.full_name.replace(/\s+/g, "_")}.png`;
      a.click();
      toast.success("QR Code berhasil diunduh");
    } catch (e) {
      toast.error("Gagal mengunduh QR Code");
    }
  }

  const students = useQuery({
    queryKey: ["admin-students"],
    queryFn: async () => {
      const [scoresRes, studentsRes] = await Promise.all([
        supabase
          .from("student_scores")
          .select("student_id, full_name, nis, class_name, earned_points, total_items"),
        supabase
          .from("students")
          .select("id, full_name, nis, class_id, classes(name)")
          .order("full_name"),
      ]);

      const scoresMap = new Map(
        (scoresRes.data ?? []).map((s) => [s.student_id, s])
      );

      if (studentsRes.data && studentsRes.data.length > 0) {
        return studentsRes.data.map((s) => {
          const sc = scoresMap.get(s.id);
          return {
            student_id: s.id,
            full_name: s.full_name,
            nis: s.nis,
            class_name: sc?.class_name ?? (s.classes as any)?.name ?? null,
            earned_points: sc?.earned_points ?? 0,
            total_items: sc?.total_items ?? 0,
          };
        });
      }

      return scoresRes.data ?? [];
    },
  });

  const filteredStudents = (students.data ?? []).filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.full_name ?? "").toLowerCase().includes(q) ||
      (s.nis ?? "").toLowerCase().includes(q) ||
      (s.class_name ?? "").toLowerCase().includes(q)
    );
  });

  const officers = useQuery({
    queryKey: ["admin-officers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("officers")
        .select("id, station, active, full_name")
        .order("station");
      return data ?? [];
    },
  });

  const classes = useQuery({
    queryKey: ["admin-classes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name")
        .order("name");
      return data ?? [];
    },
  });

  // State untuk persetujuan akun Google
  const [approveUser, setApproveUser] = useState<any | null>(null);
  const [approveRole, setApproveRole] = useState("student");
  const [approveClassId, setApproveClassId] = useState("");
  const [approveNis, setApproveNis] = useState("");
  const [approveStation, setApproveStation] = useState("Gerbang Utama");

  const approveUserMutation = useMutation({
    mutationFn: async () => {
      if (!approveUser) return;
      const { error } = await supabase.rpc("admin_approve_user", {
        _user_id: approveUser.id,
        _role: approveRole,
        _class_id: approveRole === "student" && approveClassId ? approveClassId : null,
        _nis: approveRole === "student" && approveNis ? approveNis : null,
        _station: approveRole === "officer" ? approveStation : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pengguna berhasil disetujui!");
      setApproveUser(null);
      setApproveRole("student");
      setApproveClassId("");
      setApproveNis("");
      setApproveStation("Gerbang Utama");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      queryClient.invalidateQueries({ queryKey: ["admin-officers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyetujui akun"),
  });

  const allUsers = useQuery({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      let profilesData: any[] | null = null;
      const primaryRes = await supabase
        .from("profiles")
        .select("id, full_name, is_approved, requested_role, requested_class_id, requested_nis, user_roles(role)");

      if (primaryRes.error) {
        // Fallback jika kolom approval belum dibuat di database Supabase Cloud
        const fallbackRes = await supabase
          .from("profiles")
          .select("id, full_name, user_roles(role)");
        profilesData = (fallbackRes.data ?? []).map(p => ({ ...p, is_approved: true }));
      } else {
        profilesData = primaryRes.data;
      }

      const [studentsRes, officersRes, classesRes] = await Promise.all([
        supabase.from("students").select("profile_id, nis, class_id"),
        supabase.from("officers").select("profile_id, station"),
        supabase.from("classes").select("id, name, homeroom_teacher_id"),
      ]);

      const studentsMap = new Map((studentsRes.data ?? []).map(s => [s.profile_id, s]));
      const officersMap = new Map((officersRes.data ?? []).map(o => [o.profile_id, o]));
      const classesMap = new Map((classesRes.data ?? []).map(c => [c.id, c]));
      const teacherClassMap = new Map((classesRes.data ?? []).filter(c => c.homeroom_teacher_id).map(c => [c.homeroom_teacher_id, c]));

      return (profilesData ?? []).map((p) => {
        const roles = (p.user_roles as any[] | null ?? []).map(r => r.role);
        const role = roles.includes("admin") 
          ? "admin" 
          : roles.includes("officer") 
            ? "officer" 
            : roles.includes("teacher") 
              ? "teacher" 
              : "student";
        
        let details = "";
        if (p.is_approved) {
          if (role === "student") {
            const s = studentsMap.get(p.id);
            if (s) {
              const cls = s.class_id ? classesMap.get(s.class_id) : null;
              details = `Siswa (NIS: ${s.nis}${cls ? `, Kelas: ${cls.name}` : ""})`;
            } else {
              details = "Siswa";
            }
          } else if (role === "officer") {
            const o = officersMap.get(p.id);
            details = `Petugas (Pos: ${o?.station ?? "-"})`;
          } else if (role === "teacher") {
            const cls = teacherClassMap.get(p.id);
            details = `Wali Kelas${cls ? ` (${cls.name})` : ""}`;
          } else if (role === "admin") {
            details = "Administrator";
          }
        } else {
          const reqClass = p.requested_class_id ? classesMap.get(p.requested_class_id) : null;
          details = `MENUNGGU PERSETUJUAN - Ingin Jadi: ${
            p.requested_role === "student" 
              ? `Siswa (NIS: ${p.requested_nis ?? "-"}, Kelas: ${reqClass?.name ?? "-"})` 
              : p.requested_role === "officer" 
                ? "Petugas Pos" 
                : p.requested_role === "teacher"
                  ? "Wali Kelas"
                  : "Belum Mengisi"
          }`;
        }

        return {
          id: p.id,
          full_name: p.full_name,
          role,
          is_approved: p.is_approved,
          requested_role: p.requested_role,
          requested_class_id: p.requested_class_id,
          requested_nis: p.requested_nis,
          details
        };
      });
    }
  });

  const filteredAllUsers = (allUsers.data ?? []).filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.role ?? "").toLowerCase().includes(q) ||
      (u.details ?? "").toLowerCase().includes(q)
    );
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      if (!addEmail || !addPassword || !addFullName) throw new Error("Email, password, dan nama wajib diisi");
      
      let finalEmail = addEmail.trim();
      if (!finalEmail.includes("@")) {
        finalEmail = `${finalEmail}@smpn99.sch.id`;
      }

      // 1. Coba panggil RPC database admin_create_user jika sudah ada di Supabase
      const rpcRes = await supabase.rpc("admin_create_user", {
        _email: finalEmail,
        _password: addPassword,
        _full_name: addFullName,
        _role: addRole,
        _class_id: addClassId || null,
        _station: addStation,
      });

      if (!rpcRes.error) {
        return rpcRes.data;
      }

      // 2. Fallback: Buat akun via Client Auth terisolasi (tanpa mempengaruhi sesi Admin)
      const SUPABASE_URL = (import.meta as any).env['VITE_SUPABASE_URL'] || (process as any).env['SUPABASE_URL'];
      const SUPABASE_PUBLISHABLE_KEY = (import.meta as any).env['VITE_SUPABASE_PUBLISHABLE_KEY'] || (process as any).env['SUPABASE_PUBLISHABLE_KEY'];
      
      const tempSupabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: signUpData, error: signUpErr } = await tempSupabase.auth.signUp({
        email: finalEmail,
        password: addPassword,
        options: {
          data: { full_name: addFullName },
        },
      });

      if (signUpErr) {
        throw new Error(signUpErr.message);
      }

      const newUserId = signUpData.user?.id;
      if (!newUserId) throw new Error("Gagal mendaftarkan pengguna baru");

      // Set profil diapprove & update nama
      await supabase.from("profiles").update({ is_approved: true, full_name: addFullName }).eq("id", newUserId);

      // Set user role
      await supabase.from("user_roles").delete().eq("user_id", newUserId);
      await supabase.from("user_roles").insert({ user_id: newUserId, role: addRole as any });

      // Set entifikasi khusus role
      if (addRole === "student") {
        const generatedNis = 'S' + Date.now().toString().slice(-6);
        await supabase.from("students").insert({
          profile_id: newUserId,
          full_name: addFullName,
          nis: generatedNis,
          class_id: addClassId || null,
        });
      } else if (addRole === "officer") {
        await supabase.from("officers").insert({
          profile_id: newUserId,
          full_name: addFullName,
          station: addStation || "Gerbang Utama",
        });
      }

      return newUserId;
    },
    onSuccess: () => {
      toast.success("Akun pengguna berhasil dibuat!");
      setAddUserOpen(false);
      setAddEmail("");
      setAddPassword("");
      setAddFullName("");
      setAddRole("student");
      setAddClassId("");
      setAddStation("Gerbang Utama");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      queryClient.invalidateQueries({ queryKey: ["admin-officers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat akun"),
  });

  const createStudent = useMutation({
    mutationFn: async () => {
      if (!studentName || !studentNis) throw new Error("Nama dan NIS wajib diisi");
      const { error } = await supabase.from("students").insert({
        full_name: studentName,
        nis: studentNis,
        class_id: studentClassId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Siswa berhasil ditambahkan");
      setAddStudentOpen(false);
      setStudentName("");
      setStudentNis("");
      setStudentClassId("");
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menambahkan siswa"),
  });

  const createOfficer = useMutation({
    mutationFn: async () => {
      if (!officerName) throw new Error("Nama petugas wajib diisi");
      const { error } = await supabase.from("officers").insert({
        full_name: officerName,
        station: officerStation,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Petugas berhasil ditambahkan");
      setAddOfficerOpen(false);
      setOfficerName("");
      setOfficerStation("Gerbang Utama");
      queryClient.invalidateQueries({ queryKey: ["admin-officers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menambahkan petugas"),
  });

  const updateOfficerMutation = useMutation({
    mutationFn: async () => {
      if (!editingOfficer) return;
      if (!editOfficerName.trim()) throw new Error("Nama petugas wajib diisi");

      const { error } = await supabase
        .from("officers")
        .update({
          full_name: editOfficerName.trim(),
          station: editOfficerStation,
          active: editOfficerActive,
        })
        .eq("id", editingOfficer.id);

      if (error) throw error;

      // Update profil auth jika petugas terhubung ke akun
      if (editingOfficer.profile_id) {
        await supabase
          .from("profiles")
          .update({ full_name: editOfficerName.trim() })
          .eq("id", editingOfficer.profile_id);
      }
    },
    onSuccess: () => {
      toast.success("Data petugas berhasil diperbarui");
      setEditingOfficer(null);
      queryClient.invalidateQueries({ queryKey: ["admin-officers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui data petugas"),
  });

  const deleteOfficerMutation = useMutation({
    mutationFn: async (officerId: string) => {
      const { error } = await supabase.from("officers").delete().eq("id", officerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Petugas berhasil dihapus");
      queryClient.invalidateQueries({ queryKey: ["admin-officers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus petugas"),
  });

  const changeRoleMutation = useMutation({
    mutationFn: async () => {
      if (!changeRoleUser || !newRole) return;
      const userId = changeRoleUser.id;

      // 1. Delete existing roles
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;

      // 2. Insert new role
      const { error: insErr } = await supabase.from("user_roles").insert({
        user_id: userId,
        role: newRole as any,
      });
      if (insErr) throw insErr;

      // 3. Handle specifics
      if (newRole === "officer") {
        await supabase.from("officers").upsert({
          profile_id: userId,
          full_name: changeRoleUser.full_name,
          station: newStation,
        }, { onConflict: "profile_id" });
      } else if (newRole === "teacher" && newClassId) {
        // remove previous homeroom teacher from this teacher
        await supabase.from("classes").update({ homeroom_teacher_id: null }).eq("homeroom_teacher_id", userId);
        // assign teacher to new class
        const { error: classErr } = await supabase.from("classes").update({
          homeroom_teacher_id: userId
        }).eq("id", newClassId);
        if (classErr) throw classErr;
      }
    },
    onSuccess: () => {
      toast.success("Role pengguna berhasil diubah");
      setChangeRoleUser(null);
      setNewRole("");
      setNewClassId("");
      setNewStation("Gerbang Utama");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      queryClient.invalidateQueries({ queryKey: ["admin-officers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal mengubah role"),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // 1. Coba panggil RPC admin_delete_user terlebih dahulu
      const { error: rpcErr } = await supabase.rpc("admin_delete_user", {
        _user_id: userId,
      });
      if (!rpcErr) return;

      // 2. Fallback: Hapus data relasi di tabel public (user_roles, officers, profiles, unlink students)
      await supabase.from("user_roles").delete().eq("user_id", userId);
      await supabase.from("officers").delete().eq("profile_id", userId);
      await supabase.from("students").update({ profile_id: null }).eq("profile_id", userId);
      const { error: profileErr } = await supabase.from("profiles").delete().eq("id", userId);

      if (profileErr) {
        throw new Error(rpcErr.message || profileErr.message || "Gagal menghapus akun");
      }
    },
    onSuccess: () => {
      toast.success("Akun pengguna berhasil dihapus");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      queryClient.invalidateQueries({ queryKey: ["admin-officers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus akun"),
  });

  function exportCsv() {
    const csv = [
      ["nama", "nis", "kelas", "item", "poin"].join(","),
      ...(students.data ?? []).map((s) =>
        [
          `"${(s.full_name ?? "").replace(/"/g, '""')}"`,
          `"${s.nis}"`,
          `"${(s.class_name ?? "").replace(/"/g, '""')}"`,
          s.total_items ?? 0,
          s.earned_points ?? 0,
        ].join(","),
      ),
    ].join("\n");

    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = "data-siswa.csv";
    a.click();
  }

  async function importFile(file: File) {
    setImporting(true);
    try {
      let rows: string[][] = [];
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'xlsx' || extension === 'xls') {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("File Excel kosong.");
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) throw new Error("Sheet Excel tidak valid.");
        rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
      } else {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        rows = lines.map(line => splitCsvLine(line));
      }

      if (rows.length < 2) throw new Error("File kosong.");
      const header = rows[0]!.map((h) => String(h ?? "").trim().toLowerCase());
      const idxName = header.findIndex((h) => h.includes("nama"));
      const idxNis = header.findIndex((h) => h === "nis" || h.includes("nis"));
      const idxClass = header.findIndex((h) => h.includes("kelas"));
      if (idxName < 0 || idxNis < 0) throw new Error("Header wajib: nama, nis, kelas (opsional).");

      const { data: classRows } = await supabase.from("classes").select("id, name");
      const classMap = new Map((classRows ?? []).map((c) => [c.name.toLowerCase(), c.id]));

      const payload: { nis: string; full_name: string; class_id: string | null }[] = [];
      for (const cols of rows.slice(1)) {
        if (!cols || cols.length === 0) continue;
        const nis = String(cols[idxNis] ?? "").trim();
        const full_name = String(cols[idxName] ?? "").trim();
        if (!nis || !full_name) continue;
        const className = idxClass >= 0 ? String(cols[idxClass] ?? "").trim() : "";
        let class_id: string | null = null;
        if (className) {
          const key = className.toLowerCase();
          if (!classMap.has(key)) {
            const { data: created, error } = await supabase
              .from("classes")
              .insert({ name: className })
              .select("id")
              .single();
            if (error) throw error;
            classMap.set(key, created.id);
          }
          class_id = classMap.get(key) ?? null;
        }
        payload.push({ nis, full_name, class_id });
      }
      if (payload.length === 0) throw new Error("Tidak ada baris valid.");

      const { error } = await supabase.from("students").upsert(payload, { onConflict: "nis" });
      if (error) throw error;
      toast.success(`${payload.length} siswa berhasil diimpor.`);
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengimpor data.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex border-b border-border">
        {[
          { id: "siswa", label: "Daftar Siswa" },
          { id: "petugas", label: "Petugas Pos" },
          { id: "semua", label: "Semua Akun & Role" },
          { id: "persetujuan", label: "Persetujuan Akun Google" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setSearch("");
            }}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-[2px] ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "siswa" && (
        <section>
          <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
            <div>
              <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">Siswa</h1>
              <p className="text-xs text-muted-foreground">
                Format impor: kolom <span className="font-semibold">nama, nis, kelas</span>. Data dengan NIS sama akan diperbarui.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                }}
              />
              <Button size="sm" onClick={() => setAddStudentOpen(true)} className="rounded-full gap-1">
                <Plus className="size-4" /> Tambah Siswa
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" /> {importing ? "Mengimpor..." : "Impor Excel/CSV"}
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="size-4" /> Ekspor CSV
              </Button>
              <select
                value={printClass || ""}
                onChange={(e) => setPrintClass(e.target.value || null)}
                className="h-9 rounded-xl border border-input bg-background px-3 text-sm font-semibold"
                aria-label="Cetak Massal QR Kelas"
              >
                <option value="">-- Cetak Massal QR Kelas --</option>
                <option value="SEMUA">Cetak Massal (SEMUA KELAS)</option>
                {(classes.data ?? []).map((c) => (
                  <option key={c.id} value={c.name}>
                    Cetak QR Kelas {c.name}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <div className="mt-4 flex max-w-sm items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari nama, NIS, atau kelas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="surface-card mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nama</th>
                  <th className="px-4 py-3 font-semibold">NIS</th>
                  <th className="px-4 py-3 font-semibold">Kelas</th>
                  <th className="px-4 py-3 text-right font-semibold">Item</th>
                  <th className="px-4 py-3 text-right font-semibold">Poin</th>
                  <th className="px-4 py-3 text-center font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStudents.map((s) => (
                  <tr key={s.student_id}>
                    <td className="px-4 py-3 font-medium">{s.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.nis}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.class_name ?? "-"}</td>
                    <td className="px-4 py-3 text-right">{Number(s.total_items ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-bold text-primary">
                      {Number(s.earned_points ?? 0).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 rounded-full"
                        onClick={() => setSelectedStudent(s)}
                      >
                        <QrCode className="size-3.5" />
                        QR Code
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredStudents.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Belum ada siswa.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === "petugas" && (
        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Petugas Pos</h2>
              <p className="text-xs text-muted-foreground">Kelola petugas pencatatan ramah lingkungan sekolah.</p>
            </div>
            <Button size="sm" onClick={() => setAddOfficerOpen(true)} className="rounded-full gap-1">
              <Plus className="size-4" /> Tambah Petugas
            </Button>
          </header>

          <div className="mt-4 flex max-w-sm items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari nama petugas atau pos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(officers.data ?? [])
              .filter((o) => {
                const q = search.trim().toLowerCase();
                if (!q) return true;
                return (
                  (o.full_name ?? "").toLowerCase().includes(q) ||
                  (o.station ?? "").toLowerCase().includes(q)
                );
              })
              .map((o) => (
                <div key={o.id} className="surface-card p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-base">{o.full_name ?? "Tanpa nama"}</p>
                      <span className={`label-xs px-2.5 py-0.5 rounded-full font-bold ${
                        o.active ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"
                      }`}>
                        {o.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1.5">
                      Pos Penugasan: <span className="font-semibold text-foreground">{o.station}</span>
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-border flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-full text-xs"
                      onClick={() => {
                        setEditingOfficer(o);
                        setEditOfficerName(o.full_name ?? "");
                        setEditOfficerStation(o.station ?? "Gerbang Utama");
                        setEditOfficerActive(o.active ?? true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                      Edit Petugas
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 gap-1.5 rounded-full text-xs"
                      onClick={() => {
                        if (confirm(`Apakah Anda yakin ingin menghapus petugas "${o.full_name}"?`)) {
                          deleteOfficerMutation.mutate(o.id);
                        }
                      }}
                      disabled={deleteOfficerMutation.isPending}
                    >
                      <Trash2 className="size-3.5" />
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}
            {(officers.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full py-8 text-center">Belum ada petugas terdaftar.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === "semua" && (
        <section>
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Semua Akun & Role</h2>
              <p className="text-xs text-muted-foreground">
                Kelola role pengguna (Admin, Petugas, Wali Kelas, Siswa) untuk akun yang telah terdaftar.
              </p>
            </div>
            <Button size="sm" onClick={() => setAddUserOpen(true)} className="rounded-full gap-1">
              <Plus className="size-4" /> Buat Akun Baru
            </Button>
          </header>

          <div className="mt-4 flex max-w-sm items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari akun berdasarkan nama atau role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="surface-card mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nama Pengguna</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Keterangan Tambahan</th>
                  <th className="px-4 py-3 text-center font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAllUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium">{u.full_name}</td>
                    <td className="px-4 py-3">
                      <span className={`label-xs rounded-full px-2.5 py-1 font-bold ${
                        u.role === "admin" 
                          ? "bg-red-100 text-red-700" 
                          : u.role === "officer" 
                            ? "bg-blue-100 text-blue-700" 
                            : u.role === "teacher" 
                              ? "bg-purple-100 text-purple-700" 
                              : "bg-green-100 text-green-700"
                      }`}>
                        {u.role === "admin" 
                          ? "ADMIN" 
                          : u.role === "officer" 
                            ? "PETUGAS" 
                            : u.role === "teacher" 
                              ? "WALI KELAS" 
                              : "SISWA"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.details}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 rounded-full"
                          onClick={() => {
                            setChangeRoleUser(u);
                            setNewRole(u.role);
                          }}
                        >
                          <UserCheck className="size-3.5" />
                          Ubah Role
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 gap-1.5 rounded-full"
                          onClick={() => {
                            if (confirm(`Apakah Anda yakin ingin menghapus akun "${u.full_name}"? Tindakan ini tidak dapat dibatalkan.`)) {
                              deleteUserMutation.mutate(u.id);
                            }
                          }}
                          disabled={deleteUserMutation.isPending}
                        >
                          <Trash2 className="size-3.5" />
                          Hapus
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredAllUsers.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Akun tidak ditemukan.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === "persetujuan" && (
        <section>
          <header>
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Persetujuan Akun Google</h2>
            <p className="text-xs text-muted-foreground">
              Daftar pengguna baru yang masuk lewat Google (OAuth) dan menunggu persetujuan Admin untuk mendapatkan hak akses.
            </p>
          </header>

          <div className="surface-card mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nama Pengguna</th>
                  <th className="px-4 py-3 font-semibold">Role yang Diminta</th>
                  <th className="px-4 py-3 font-semibold">NIS / Keterangan</th>
                  <th className="px-4 py-3 text-center font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(allUsers.data ?? [])
                  .filter((u) => !u.is_approved)
                  .map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-medium">{u.full_name}</td>
                      <td className="px-4 py-3">
                        <span className="label-xs rounded-full px-2.5 py-1 font-bold bg-amber-100 text-amber-700">
                          {u.requested_role === "student"
                            ? "SISWA"
                            : u.requested_role === "officer"
                              ? "PETUGAS POS"
                              : u.requested_role === "teacher"
                                ? "WALI KELAS"
                                : "BELUM PILIH (GOOGLE)"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.details}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-8 gap-1.5 rounded-full"
                            onClick={() => {
                              setApproveUser(u);
                              setApproveRole(u.requested_role || "officer");
                              setApproveClassId(u.requested_class_id || "");
                              setApproveNis(u.requested_nis || "");
                            }}
                          >
                            <UserCheck className="size-3.5" />
                            Tinjau & Setujui
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 gap-1.5 rounded-full"
                            onClick={() => {
                              if (confirm(`Tolak dan hapus permintaan dari "${u.full_name}"?`)) {
                                deleteUserMutation.mutate(u.id);
                              }
                            }}
                            disabled={deleteUserMutation.isPending}
                          >
                            <Trash2 className="size-3.5" />
                            Tolak
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {(allUsers.data ?? []).filter((u) => !u.is_approved).length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Tidak ada permintaan persetujuan baru.</p>
            )}
          </div>
        </section>
      )}

      {/* DIALOG TINJAU & SETUJUI PENGGUNA GOOGLE */}
      <Dialog open={!!approveUser} onOpenChange={(open) => !open && setApproveUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tinjau Permintaan Akses</DialogTitle>
            <DialogDescription>
              Tentukan/sesuaikan data profil akun <b>{approveUser?.full_name}</b> sebelum disetujui.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Role Akun</label>
              <select
                value={approveRole}
                onChange={(e) => setApproveRole(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              >
                <option value="student">Siswa</option>
                <option value="officer">Petugas Pos</option>
                <option value="teacher">Wali Kelas</option>
              </select>
            </div>

            {approveRole === "student" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">NIS (Nomor Induk Siswa)</label>
                  <input
                    type="text"
                    required
                    value={approveNis}
                    onChange={(e) => setApproveNis(e.target.value)}
                    placeholder="Contoh: 21455"
                    className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">Kelas</label>
                  <select
                    value={approveClassId}
                    onChange={(e) => setApproveClassId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {(classes.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        Kelas {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {approveRole === "officer" && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Lokasi Pos Bertugas</label>
                <select
                  value={approveStation}
                  onChange={(e) => setApproveStation(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                >
                  <option value="Gerbang Utama">Gerbang Utama</option>
                  <option value="Kantin">Kantin</option>
                  <option value="Koperasi">Koperasi</option>
                  <option value="Greenhouse">Greenhouse</option>
                </select>
              </div>
            )}

            <Button
              className="w-full rounded-full mt-2"
              onClick={() => approveUserMutation.mutate()}
              disabled={approveUserMutation.isPending}
            >
              Setujui & Aktifkan Akun
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG BUAT AKUN PENGGUNA BARU */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buat Akun Pengguna Baru</DialogTitle>
            <DialogDescription>Daftarkan akun login guru/petugas/admin secara langsung tanpa verifikasi email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Nama Lengkap</label>
              <input
                type="text"
                placeholder="Contoh: Indah Novita Sari"
                value={addFullName}
                onChange={(e) => setAddFullName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Email</label>
              <input
                type="email"
                placeholder="Contoh: indah@guru.smp.belajar.id"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Kata Sandi (Password)</label>
              <input
                type="password"
                placeholder="Minimal 6 karakter"
                value={addPassword}
                onChange={(e) => setAddPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Role Pengguna</label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              >
                <option value="student">Siswa</option>
                <option value="officer">Petugas Pos</option>
                <option value="teacher">Wali Kelas</option>
                <option value="admin">Administrator (Admin)</option>
              </select>
            </div>

            {addRole === "teacher" && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Kelas yang Diampu</label>
                <select
                  value={addClassId}
                  onChange={(e) => setAddClassId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {(classes.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      Kelas {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {addRole === "officer" && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Lokasi Pos Bertugas</label>
                <select
                  value={addStation}
                  onChange={(e) => setAddStation(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                >
                  <option value="Gerbang Utama">Gerbang Utama</option>
                  <option value="Kantin">Kantin</option>
                  <option value="Koperasi">Koperasi</option>
                  <option value="Greenhouse">Greenhouse</option>
                </select>
              </div>
            )}

            <Button
              className="w-full rounded-full mt-2"
              onClick={() => createUserMutation.mutate()}
              disabled={createUserMutation.isPending}
            >
              Buat Akun Sekarang
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG TAMBAH SISWA */}
      <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Siswa Baru</DialogTitle>
            <DialogDescription>Tambahkan data siswa secara manual ke database.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Nama Siswa</label>
              <input
                type="text"
                placeholder="Contoh: Bilal Lilza"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">NIS (Nomor Induk Siswa)</label>
              <input
                type="text"
                placeholder="Contoh: 21333"
                value={studentNis}
                onChange={(e) => setStudentNis(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Kelas</label>
              <select
                value={studentClassId}
                onChange={(e) => setStudentClassId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              >
                <option value="">-- Pilih Kelas --</option>
                {(classes.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    Kelas {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="w-full rounded-full mt-2"
              onClick={() => createStudent.mutate()}
              disabled={createStudent.isPending}
            >
              Simpan Data Siswa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG TAMBAH PETUGAS */}
      <Dialog open={addOfficerOpen} onOpenChange={setAddOfficerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Petugas Pos Baru</DialogTitle>
            <DialogDescription>Tambahkan petugas pencatat secara manual.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Nama Petugas</label>
              <input
                type="text"
                placeholder="Contoh: Budi Santoso"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Lokasi Pos Bertugas</label>
              <select
                value={officerStation}
                onChange={(e) => setOfficerStation(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              >
                <option value="Gerbang Utama">Gerbang Utama</option>
                <option value="Kantin">Kantin</option>
                <option value="Koperasi">Koperasi</option>
                <option value="Greenhouse">Greenhouse</option>
              </select>
            </div>
            <Button
              className="w-full rounded-full mt-2"
              onClick={() => createOfficer.mutate()}
              disabled={createOfficer.isPending}
            >
              Simpan Data Petugas
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG UBAH ROLE */}
      <Dialog open={!!changeRoleUser} onOpenChange={(open) => !open && setChangeRoleUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah Role Pengguna</DialogTitle>
            <DialogDescription>
              Ubah hak akses aplikasi untuk <b>{changeRoleUser?.full_name}</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Pilih Role Baru</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              >
                <option value="student">Siswa</option>
                <option value="officer">Petugas Pos</option>
                <option value="teacher">Wali Kelas</option>
                <option value="admin">Administrator (Admin)</option>
              </select>
            </div>

            {newRole === "teacher" && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Kelas yang Diampu</label>
                <select
                  value={newClassId}
                  onChange={(e) => setNewClassId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {(classes.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      Kelas {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {newRole === "officer" && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Lokasi Pos Bertugas</label>
                <select
                  value={newStation}
                  onChange={(e) => setNewStation(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                >
                  <option value="Gerbang Utama">Gerbang Utama</option>
                  <option value="Kantin">Kantin</option>
                  <option value="Koperasi">Koperasi</option>
                  <option value="Greenhouse">Greenhouse</option>
                </select>
              </div>
            )}

            <Button
              className="w-full rounded-full mt-2"
              onClick={() => changeRoleMutation.mutate()}
              disabled={changeRoleMutation.isPending}
            >
              Simpan Perubahan Role
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOfficer} onOpenChange={(open) => !open && setEditingOfficer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Data Petugas Pos</DialogTitle>
            <DialogDescription>
              Perbarui nama petugas, lokasi pos bertugas, atau status keaktifan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Nama Petugas</label>
              <input
                type="text"
                value={editOfficerName}
                onChange={(e) => setEditOfficerName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                placeholder="Contoh: Petugas Utama"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Pos Penugasan</label>
              <select
                value={editOfficerStation}
                onChange={(e) => setEditOfficerStation(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              >
                <option value="Gerbang Utama">Gerbang Utama</option>
                <option value="Kantin">Kantin</option>
                <option value="Koperasi">Koperasi</option>
                <option value="Greenhouse">Greenhouse</option>
                <option value="Bank Sampah">Bank Sampah</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Status Petugas</label>
              <select
                value={editOfficerActive ? "true" : "false"}
                onChange={(e) => setEditOfficerActive(e.target.value === "true")}
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
              >
                <option value="true">Aktif</option>
                <option value="false">Nonaktif</option>
              </select>
            </div>
            <Button
              className="w-full rounded-full mt-2"
              onClick={() => updateOfficerMutation.mutate()}
              disabled={updateOfficerMutation.isPending}
            >
              {updateOfficerMutation.isPending ? "Menyimpan..." : "Simpan Perubahan Petugas"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Kartu Identitas QR</DialogTitle>
            <DialogDescription className="text-center">
              Pindai kode QR di bawah untuk validasi botol tumbler dan lunchbox.
            </DialogDescription>
          </DialogHeader>
          {selectedStudent && (
            <div className="flex flex-col items-center space-y-6 py-4">
              <div className="gradient-hero w-full rounded-2xl p-6 text-primary-foreground shadow-lift">
                <span className="label-xs text-primary-foreground/75">KARTU IDENTITAS ECO</span>
                <h3 className="mt-1 text-xl font-extrabold">{selectedStudent.full_name}</h3>
                <p className="text-sm opacity-90">
                  Kelas {selectedStudent.class_name || "-"} · NIS {selectedStudent.nis}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-primary-foreground/20 pt-4">
                  <span className="text-xs opacity-75">Eco Score</span>
                  <span className="text-base font-bold">{selectedStudent.earned_points} poin</span>
                </div>
              </div>

              <div className="rounded-2xl bg-card p-4 shadow-md">
                <QrImage value={selectedStudent.nis} size={200} />
              </div>

              <Button
                className="w-full gap-2 rounded-full"
                onClick={() => downloadQrCode(selectedStudent)}
              >
                <Download className="size-4" /> Unduh QR Code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {printClass && (() => {
        const printableStudents = (students.data ?? []).filter((s) => {
          if (!printClass) return false;
          if (printClass === "SEMUA") return true;
          return (s.class_name ?? "").trim().toLowerCase() === printClass.trim().toLowerCase();
        });

        // Group into A4 pages (12 cards per page: 3 columns x 4 rows)
        const pages: typeof printableStudents[] = [];
        const pageSize = 12;
        for (let i = 0; i < printableStudents.length; i += pageSize) {
          pages.push(printableStudents.slice(i, i + pageSize));
        }

        return (
          <div className="print-area fixed inset-0 z-50 overflow-y-auto bg-background p-6 sm:p-8">
            <div className="no-print mb-6 flex flex-wrap justify-between items-center border-b pb-4 gap-4 bg-card p-4 rounded-2xl shadow-sm">
              <div>
                <h2 className="text-xl font-extrabold">
                  Cetak Massal QR {printClass === "SEMUA" ? "Semua Kelas" : `Kelas ${printClass}`} ({printableStudents.length} Siswa — {pages.length} Halaman A4)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Format Tag Tumbler/Lunchbox A4 (12 kartu per lembar: 3x4). Gunakan tombol cetak atau menu Ctrl + P.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => window.print()} className="rounded-full gap-1.5">
                  <Printer className="size-4" /> Cetak Sekarang
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPrintClass(null)} className="rounded-full">
                  Tutup / Kembali
                </Button>
              </div>
            </div>

            {printableStudents.length === 0 ? (
              <div className="text-center py-12 surface-card max-w-md mx-auto p-6">
                <p className="font-bold text-foreground">Tidak Ada Data Siswa untuk Dicetak</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tidak ditemukan siswa untuk {printClass === "SEMUA" ? "semua kelas" : `kelas "${printClass}"`}. Pastikan data siswa telah diisi dengan kelas yang sesuai.
                </p>
                <Button size="sm" variant="outline" onClick={() => setPrintClass(null)} className="mt-4 rounded-full">
                  Kembali
                </Button>
              </div>
            ) : (
              <div className="space-y-8 print:space-y-0">
                {pages.map((pageStudents, pageIdx) => (
                  <div
                    key={pageIdx}
                    className="print-page grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 border border-dashed border-border rounded-3xl bg-card/50 print:border-none print:bg-transparent print:p-0"
                    style={{ breakAfter: "page", pageBreakAfter: "always" }}
                  >
                    {pageStudents.map((s) => (
                      <div
                        key={s.student_id}
                        className="print-card flex flex-col items-center justify-between border border-border rounded-2xl p-2.5 bg-card shadow-sm w-full max-w-[210px] mx-auto text-foreground text-center"
                        style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
                      >
                        <div className="gradient-hero w-full rounded-xl p-2 text-primary-foreground shadow-sm">
                          <span className="label-xs text-primary-foreground/80 text-[8px]">ECO TAG • SMPN 99</span>
                          <h3 className="mt-0.5 text-xs font-extrabold truncate">{s.full_name}</h3>
                          <p className="text-[10px] opacity-90">
                            Kelas {s.class_name || "-"} · NIS {s.nis}
                          </p>
                        </div>
                        <div className="my-1.5 rounded-lg bg-card p-1.5 shadow-sm border border-border flex justify-center">
                          <QrImage value={s.nis ?? ""} size={95} />
                        </div>
                        <div className="w-full text-[9px] text-muted-foreground border-t border-border/60 pt-1 flex justify-between px-1">
                          <span>User: {s.nis}</span>
                          <span>Pass: S!swa@Smpn99jkt</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}