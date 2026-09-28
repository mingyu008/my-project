/**
 * Short beep + vibration for pomodoro phase changes. Mobile browsers only allow audio after a user gesture,
 * so {@link unlockAlarm} is called from the start button.
 */

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;

function audioContextCtor(): AudioContextCtor | undefined {
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return typeof window.AudioContext === "function" ? window.AudioContext : w.webkitAudioContext;
}

export function unlockAlarm(): void {
  try {
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume().catch(() => undefined);
  } catch {
    // No audio: the on-screen message still tells the user.
  }
}

export function playAlarm(): void {
  try {
    if (context) {
      const now = context.currentTime;
      for (const [i, freq] of [880, 660, 880].entries()) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, now + i * 0.25);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.25 + 0.2);
        osc.connect(gain).connect(context.destination);
        osc.start(now + i * 0.25);
        osc.stop(now + i * 0.25 + 0.22);
      }
    }
    if (typeof navigator.vibrate === "function") navigator.vibrate([200, 100, 200]);
  } catch {
    // Ignore: best effort only.
  }
}
