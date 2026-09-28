/**
 * Web Audio API based Scanner Sound Synthesizer.
 * Emulates retail/cashier barcode scanner beeps without external MP3/WAV dependencies.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Call on any user interaction (e.g. clicking 'Kamera' or switching sessions)
 * to unlock audio autoplay according to browser security policies.
 */
export function unlockAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  } catch {
    // Ignore audio initialization errors gracefully
  }
}

/**
 * Plays a single tone with gain envelope.
 */
function playTone({
  freq,
  type = "sine",
  duration = 0.06,
  gainVal = 0.18,
  delay = 0,
}: {
  freq: number;
  type?: OscillatorType;
  duration?: number;
  gainVal?: number;
  delay?: number;
}): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainVal, startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  } catch {
    // Fail silently without blocking UI
  }
}

/**
 * A. QR TERBACA / SCAN DETECTED
 * Single crisp, high-pitched short "BIP" when camera registers a QR code.
 */
export function playScanDetectedSound(): void {
  playTone({ freq: 1100, type: "sine", duration: 0.045, gainVal: 0.2 });
}

/**
 * B. SCAN BERHASIL (SUCCESS)
 * Ascending cashier success chime (cheerful two-tone: G5 -> C6).
 */
export function playSuccessSound(): void {
  playTone({ freq: 784, type: "sine", duration: 0.05, gainVal: 0.2, delay: 0 });
  playTone({ freq: 1046, type: "sine", duration: 0.08, gainVal: 0.22, delay: 0.06 });
}

/**
 * C. DUPLICATE (SCAN DITOLAK KARENA SESI DUPLIKAT)
 * Distinct double-beep "BIP-BIP" with medium warning pitch.
 */
export function playDuplicateSound(): void {
  playTone({ freq: 520, type: "sine", duration: 0.055, gainVal: 0.25, delay: 0 });
  playTone({ freq: 520, type: "sine", duration: 0.055, gainVal: 0.25, delay: 0.085 });
}

/**
 * D. ERROR / SISWA TIDAK DITEMUKAN / QR INVALID
 * Lower pitch negative buzzer.
 */
export function playErrorSound(): void {
  playTone({ freq: 220, type: "sawtooth", duration: 0.16, gainVal: 0.22, delay: 0 });
}
