/**
 * Script: Buat user awal (admin, siswa, petugas)
 * Jalankan: node seed-users.mjs
 */

const SUPABASE_URL = "https://grwzhnffkacfmlcmybtn.supabase.co";
const ANON_KEY = "sb_publishable_jfhZzvHjV6Xgqo-2Q2hbFw_pY4POpJT";

const USERS = [
  { email: "admin@smpn99.sch.id",   password: "Adm!n@Smpn99jkt",   role: "admin"   },
  { email: "siswa@smpn99.sch.id",   password: "S!swa@Smpn99jkt",   role: "student" },
  { email: "petugas@smpn99.sch.id", password: "P3tugas@Smpn99",    role: "officer" },
];

async function signUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

async function insertRole(userId, role) {
  // Gunakan service key atau pastikan RLS mengizinkan insert
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ user_id: userId, role }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

console.log("=== Membuat user untuk School Ecosystem ===\n");

for (const user of USERS) {
  process.stdout.write(`Mendaftar ${user.email}... `);
  const { ok, data } = await signUp(user.email, user.password);
  
  if (!ok) {
    const msg = data.msg || data.message || data.error || JSON.stringify(data);
    if (msg.includes("already registered") || msg.includes("already been registered")) {
      console.log("⚠️  Sudah terdaftar (skip)");
    } else {
      console.log(`❌ Gagal: ${msg}`);
    }
    continue;
  }

  const userId = data.user?.id;
  if (!userId) {
    console.log(`❌ Tidak dapat user ID. Mungkin perlu konfirmasi email dulu.`);
    console.log(`   → Buka: ${SUPABASE_URL.replace('.supabase.co', '')}/dashboard/project/grwzhnffkacfmlcmybtn/auth/providers`);
    console.log(`   → Matikan "Confirm email" lalu jalankan script ini lagi.`);
    continue;
  }

  console.log(`✅ User dibuat (ID: ${userId})`);
  
  process.stdout.write(`   Menambah role '${user.role}'... `);
  const roleResult = await insertRole(userId, user.role);
  if (roleResult.ok || roleResult.status === 201) {
    console.log(`✅ Role '${user.role}' ditambahkan`);
  } else {
    console.log(`⚠️  Role gagal (${roleResult.status}): tambahkan manual via SQL Editor`);
    console.log(`   SQL: INSERT INTO user_roles (user_id, role) VALUES ('${userId}', '${user.role}');`);
  }
}

console.log("\n=== Selesai ===");
console.log("Login di: http://localhost:8080/auth");
console.log("  Admin   → admin@smpn99.sch.id   / Adm!n@Smpn99jkt");
console.log("  Siswa   → siswa@smpn99.sch.id   / S!swa@Smpn99jkt");
console.log("  Petugas → petugas@smpn99.sch.id / P3tugas@Smpn99");
