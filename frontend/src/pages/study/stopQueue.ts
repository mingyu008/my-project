import { useEffect, useState } from "react";
import { studyApi, type StudySession } from "../../api/studyApi";
import { isNetworkError } from "./studyMessages";

/**
 * Stop requests that failed for network reasons, retried when the connection comes back (`online` event) and
 * every 15 seconds. One entry per session (the first press time wins); the server's stop is idempotent, so a
 * retry that did reach the server before never records twice.
 *
 * Memory only: browser storage is not used in this app (DECISIONS D-013, sourcePolicy.test.ts). If the page is
 * closed before a retry succeeds, the session is still open on the server and the recovery prompt offers to end it.
 */

const RETRY_MS = 15_000;

const pending = new Map<number, string>();
const listeners = new Set<() => void>();
const savedListeners = new Set<(session: StudySession) => void>();
let flushing: Promise<void> | null = null;
let timer: number | undefined;

function notify() {
  listeners.forEach((l) => l());
  if (pending.size > 0 && timer === undefined) {
    timer = window.setInterval(() => void flushStopQueue(), RETRY_MS);
  } else if (pending.size === 0 && timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushStopQueue());
}

export function enqueueStop(sessionId: number, endTime: string): void {
  if (!pending.has(sessionId)) pending.set(sessionId, endTime);
  notify();
}

export function pendingStopCount(): number {
  return pending.size;
}

/** Sends every queued stop; stops at the first network failure (still offline). */
export function flushStopQueue(): Promise<void> {
  flushing ??= (async () => {
    try {
      for (const [id, endTime] of [...pending]) {
        try {
          const saved = await studyApi.stop(id, endTime);
          pending.delete(id);
          savedListeners.forEach((l) => l(saved));
        } catch (error) {
          if (isNetworkError(error)) break;
          // Discarded or unknown session (404) etc.: retrying cannot help.
          pending.delete(id);
        }
      }
    } finally {
      flushing = null;
      notify();
    }
  })();
  return flushing;
}

/** For tests. */
export function clearStopQueue(): void {
  pending.clear();
  notify();
}

/** Number of queued stops; {@code onSaved} runs for each stop the queue manages to deliver. */
export function useStopQueue(onSaved: (session: StudySession) => void): number {
  const [size, setSize] = useState(pending.size);
  useEffect(() => {
    const update = () => setSize(pending.size);
    listeners.add(update);
    savedListeners.add(onSaved);
    update();
    return () => {
      listeners.delete(update);
      savedListeners.delete(onSaved);
    };
  }, [onSaved]);
  return size;
}
