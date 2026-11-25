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
 * Plays a warm, clear, ~3.2s double multi-tone notification chime for incoming orders.
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

    // Two rising D-major chimes (D5 -> F#5 -> A5 -> D6), ~3.2s total duration
    for (const phraseOffset of [0, 1.35]) {
      scheduleTone(ctx, 587.33, phraseOffset + 0.0, 0.35, 0.3);
      scheduleTone(ctx, 739.99, phraseOffset + 0.16, 0.4, 0.32);
      scheduleTone(ctx, 880.0, phraseOffset + 0.34, 0.55, 0.36);
      scheduleTone(ctx, 1174.66, phraseOffset + 0.54, phraseOffset === 0 ? 0.65 : 1.3, 0.34);
    }

    return true;
  } catch (err) {
    // Autoplay policy or unsupported audio
    console.debug("Audio chime couldn't play:", err);
    return false;
  }
}

