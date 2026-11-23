-- Make the public EcoChallenge descriptions match the currently implemented rules.
-- Progress is an administrator-maintained indicator; there is no challenge participant
-- tracking table, automatic percentage calculation, or challenge bonus-points routine.

UPDATE public.challenges
SET body = 'Minimal 5 kali validasi membawa tumbler pribadi ke sekolah dalam 1 minggu. Progres diperbarui manual oleh admin; bonus Eco-Points otomatis belum tersedia.'
WHERE name = '5 Hari Tumbler';

UPDATE public.challenges
SET body = 'Target 100% siswa dalam satu kelas membawa tumbler dan lunchbox tanpa sampah plastik sekali pakai selama jam istirahat. Persentase pada kartu diisi manual oleh admin, bukan hasil hitung otomatis dari scan peserta.'
WHERE name = '100% Reusable Class';
