"use client";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

function scheduleTone(
  ctx: AudioContext,
  frequency: number,
  startOffsetSeconds: number,
  durationSeconds: number,
  peakGain: number,
) {
  const startTime = ctx.currentTime + startOffsetSeconds;
  const endTime = startTime + durationSeconds;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, endTime);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(endTime);
}

/**
 * Plays a warm, clear, ~1.85s multi-tone notification chime for incoming orders.
 * Synthesized using Web Audio API — 100% self-contained, no external mp3 files required.
 */
export function playOrderChime(): boolean {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    if (ctx.state === "suspended") {
      void ctx.resume().catch((err: unknown) => {
        // Explicitly catch autoplay policy or user-gesture requirement rejections
        // to prevent unhandled promise rejections without disrupting visual UI.
        console.debug("AudioContext resume rejected:", err);
      });
    }

    // Rising D-major chime (D5 -> F#5 -> A5 -> D6), ~1.85s total duration
    scheduleTone(ctx, 587.33, 0.0, 0.38, 0.28);
    scheduleTone(ctx, 739.99, 0.16, 0.42, 0.3);
    scheduleTone(ctx, 880.0, 0.34, 0.61, 0.35);
    scheduleTone(ctx, 1174.66, 0.78, 1.07, 0.32);

    return true;
  } catch (err) {
    // Autoplay policy or unsupported audio
    console.debug("Audio chime couldn't play:", err);
    return false;
  }
}

