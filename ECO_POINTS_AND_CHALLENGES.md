# Eco-Points & EcoChallenge Rules

Dokumen ini menjelaskan aturan poin yang diterapkan pada database dan aplikasi Ecosystem99. Sumber nilai operasional adalah tabel Supabase `public.eco_items`; sumber bonus EcoChallenge adalah konfigurasi `public.challenges` dan ledger `public.challenge_point_awards`.

## 1. Poin dari pemindaian barang

Nilai berikut adalah konfigurasi aktif saat fitur bonus 5 Hari Tumbler diaktifkan. Scanner menyimpan poin per item pada `validation_items.points`, sehingga perubahan nilai master di kemudian hari tidak mengubah catatan transaksi lama.

| Sesi | Barang | Eco-Points |
|---|---|---:|
| Sesi 1 — Masuk sekolah | Tumbler | 100 |
| Sesi 1 — Masuk sekolah | Kotak makan | 50 |
| Sesi 1 — Masuk sekolah | Tumbler + kotak makan | 150 (100 + 50) |
| Sesi 2 — Istirahat/kantin | Tumbler saja | 100 |
| Sesi 2 — Istirahat/kantin | Kotak makan saja | 50 |
| Sesi 2 — Istirahat/kantin | Combo tumbler + kotak makan | 250 |

Ketentuan:
- Poin scan hanya dihitung ketika `validations.status = 'approved'`.
- Sesi 1 hanya menerima kode item `tumbler` dan `lunchbox`; tidak menggunakan kode combo.
- Pada Sesi 2, dua barang yang dipindai bersamaan dinormalisasi menjadi `break_combo`. Nilai 250 menggantikan 100 + 50, bukan ditambahkan di atas keduanya.
- Sistem mencegah item yang sama menambah poin dua kali pada validasi/hari/sesi yang sudah lengkap.
- Poin transaksi disalin ke `validation_items.points` saat pencatatan. Jangan mengubah catatan lama untuk mengubah nilai master baru.

## 2. EcoChallenge otomatis: 5 Hari Tumbler

Challenge aktif dikonfigurasi di `public.challenges` dengan aturan:

| Pengaturan | Nilai |
|---|---|
| Nama challenge | 5 Hari Tumbler |
| Status | ACTIVE |
| Pemberian bonus otomatis | Aktif |
| Barang yang wajib divalidasi | Tumbler (`tumbler`) |
| Sesi | Sesi 1 / Masuk sekolah (`entry`) |
| Target | 5 hari sekolah berbeda |
| Jendela mingguan | Senin–Jumat pada satu minggu kalender |
| Bonus | +150 Eco-Points |
| Mulai berlaku | 23 November 2026 (WIB) |

### Kapan bonus diberikan?

Seorang siswa mendapat +150 poin ketika terdapat scan Tumbler yang:
1. Berstatus approved.
2. Berada di Sesi 1 (`entry`).
3. Terjadi pada lima tanggal sekolah yang berbeda, Senin sampai Jumat, dalam minggu ISO yang sama.
4. Tanggal scan berada pada atau setelah `effective_from` challenge dan tidak berada di masa depan.

Lima tanggal tidak harus dipindai pada saat yang sama. Bonus diberikan ketika hari kelima yang memenuhi syarat sudah disetujui. Scan berulang pada tanggal yang sama hanya dihitung sebagai satu hari. Scan Sesi 2, scan kotak makan tanpa tumbler, scan pending, dan scan rejected tidak memenuhi syarat.

Bonus diberikan **satu kali per siswa per challenge per minggu kalender**. Minggu baru dimulai pada hari Senin. Siswa dapat memperoleh bonus lagi pada minggu berikutnya bila memenuhi lima hari yang disyaratkan lagi.

Tidak ada bonus retroaktif sebelum 23 November 2026. Riwayat scan lama tidak otomatis diberi bonus saat fitur diaktifkan.

## 3. Audit, duplikasi, dan pembatalan

Semua bonus disimpan di `public.challenge_point_awards` sebagai ledger terpisah dari scan barang. Constraint/index unik mencegah lebih dari satu bonus aktif untuk kombinasi challenge, siswa, dan minggu yang sama.

Ledger menyimpan:
- challenge dan siswa penerima;
- periode dan minggu pemberian;
- lima tanggal scan yang memenuhi syarat;
- nilai bonus;
- validasi pemicu serta waktu pemberian.

Jika salah satu scan yang menjadi syarat kemudian ditolak, atau item scan yang memenuhi syarat diubah/dihapus sehingga jumlah hari yang memenuhi syarat kurang dari lima, bonus aktif dibatalkan melalui `reversed_at` dan `reversal_reason`. Catatan ledger tidak dihapus. Penghapusan permanen atas validasi pemicu bonus dibatasi oleh foreign key agar jejak audit tidak hilang; gunakan status rejected/koreksi, bukan hard-delete. Bila validasi diperbaiki dan syarat kembali terpenuhi, sistem dapat membuat award aktif kembali; hanya satu award aktif yang dapat dihitung pada satu minggu.

Akun siswa hanya dapat membaca ledger miliknya. Admin dapat mengaudit ledger. Penulisan bonus dilakukan oleh trigger database, bukan oleh browser atau permintaan langsung siswa.

## 4. Di mana bonus ikut dihitung?

Bonus aktif ditambahkan pada poin yang diperoleh dan saldo melalui view:
- `public.student_scores`: total diperoleh dan saldo Eco-Points siswa.
- `public.period_student_scores`: poin siswa per periode operasional.
- `public.challenge_point_awards_public`: proyeksi ringkas bonus aktif untuk landing page, laporan, dan leaderboard.

Tampilan yang mengikutsertakan bonus:
- Dashboard siswa dan kartu profil/QR.
- Dashboard guru melalui `student_scores`.
- Dashboard admin, termasuk KPI poin hari ini.
- Leaderboard publik dan leaderboard admin/Jawara.
- Total poin dan peringkat kelas pada laporan bulanan.
- Total poin landing page.

Bonus **bukan scan barang**. Karena itu, bonus tidak menambah `total_items`, jumlah item tervalidasi, persentase penggunaan tumbler/kotak makan, atau estimasi pengurangan CO2. Hanya total poin dan saldo yang bertambah.

Penukaran reward tetap mengurangi saldo melalui tabel `redemptions`; bonus akan tersedia untuk ditukar seperti poin yang diperoleh dari scan.

## 5. Pengaturan dari Admin

Buka **Admin → Eco Challenge**. Pada form tambah/edit challenge tersedia:
- Aktif/nonaktifkan bonus otomatis;
- pilih kode barang;
- pilih sesi scan;
- tentukan jumlah hari (1–5);
- tentukan bonus poin;
- tentukan tanggal mulai berlaku.

Untuk aturan standar 5 Hari Tumbler gunakan:
- Barang: Tumbler;
- Sesi: Sesi 1 — Masuk;
- Target: 5 hari;
- Bonus: 150;
- Mulai berlaku: 23 November 2026 atau tanggal kebijakan baru yang disetujui.

Halaman Admin EcoChallenge juga menampilkan 100 riwayat bonus terbaru, status aktif/dibatalkan, siswa penerima, minggu, dan tanggal pencapaian. Riwayat ini hanya untuk audit; bonus tidak dapat diedit manual.

Persentase `pct` pada kartu challenge tetap merupakan indikator manual admin. Angka tersebut bukan persentase siswa yang lulus tantangan. Pemberian bonus otomatis dihitung terpisah oleh database dari data validasi approved.

## 6. Komponen database dan migrasi

Fitur ini ditambahkan melalui migrasi:
- `20261123093000_automatic_five_day_tumbler_bonus.sql`
- `20261123094500_reverse_challenge_bonus_when_qualifying_scans_are_invalidated.sql`
- `20261123101500_harden_automatic_challenge_award_evaluation.sql`
- `20261123103000_validate_automatic_challenge_item_session.sql`

Objek utama:
- `challenges`: konfigurasi target dan bonus otomatis.
- `challenge_point_awards`: ledger bonus, termasuk riwayat reversal.
- `challenge_point_awards_public`: view bonus aktif untuk total publik.
- `evaluate_automatic_challenge_awards(uuid)`: evaluator internal.
- Trigger pada `validation_items` dan `validations`: evaluasi saat item masuk atau validasi disetujui/dikoreksi.

Jangan memberi hak INSERT/UPDATE/DELETE langsung pada tabel ledger kepada role `anon` atau `authenticated`. Perubahan konfigurasi challenge harus dilakukan melalui alur Admin dengan hak yang sesuai; bonus harus tetap diproses oleh trigger database.

## 7. Pengujian

Migrasi diuji dengan transaksi yang di-rollback:
- lima hari scan Tumbler approved menghasilkan tepat satu award +150;
- pemicu ulang tidak membuat award ganda;
- scan pending tidak memberikan bonus sebelum disetujui;
- penolakan salah satu scan yang memenuhi syarat membatalkan award aktif;
- persetujuan kembali dapat membuat satu award aktif baru;
- data pengujian di-rollback sehingga tidak meninggalkan bonus atau scan pengujian pada data siswa.

Tes ini memvalidasi aturan database. Setelah deployment aplikasi, tetap lakukan satu uji penerimaan dengan akun siswa uji yang memang disiapkan untuk operasional, bukan dengan mengubah riwayat siswa nyata.
