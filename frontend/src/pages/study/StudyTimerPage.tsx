import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import {
  MIN_GOAL_SEC,
  MAX_DAY_SEC,
  studyApi,
  SUBJECT_NAME_MAX_LENGTH,
  type StudySession,
  type StudySummary,
  type Subject,
} from "../../api/studyApi";
import { playAlarm, unlockAlarm } from "./alarm";
import { ManualTimeSheet } from "./ManualTimeSheet";
import { enqueueStop, useStopQueue } from "./stopQueue";
import { isNetworkError, STUDY_MESSAGES, studyErrorMessage } from "./studyMessages";
import {
  breakSec,
  clockOffset,
  elapsedSec,
  formatClock,
  formatCountdown,
  formatHoursMinutes,
  formatSpoken,
  goalPercent,
  POMODORO_PRESETS,
  type PomodoroPreset,
} from "./studyTime";
import { useNow } from "./useNow";
import { useWakeLock } from "./useWakeLock";

type TimerKind = "STOPWATCH" | "POMODORO";
type Toast = { text: string; tone: "ok" | "error" };

const QUICK_ADD = [
  { label: "+10분", sec: 10 * 60 },
  { label: "+30분", sec: 30 * 60 },
  { label: "+1시간", sec: 60 * 60 },
];

/**
 * Student study timer (TASK-TIMER-01): today's total, subject chips, stopwatch/pomodoro, quick add.
 * Cards and buttons only (no AG Grid). The open session lives on the server, so a refresh or another device
 * shows the recovery prompt instead of losing time.
 */
export function StudyTimerPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [summary, setSummary] = useState<StudySummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [session, setSession] = useState<StudySession | null>(null);
  const [recovery, setRecovery] = useState<StudySession | null>(null);
  /** Server clock minus client clock. */
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<TimerKind>("STOPWATCH");
  const [presetId, setPresetId] = useState<PomodoroPreset["id"]>("standard");
  const [customFocus, setCustomFocus] = useState("40");
  const [customBreak, setCustomBreak] = useState("10");
  const [focusCount, setFocusCount] = useState(0);
  /** Client-clock ms when the current pomodoro break ends; null outside a break. */
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newSubject, setNewSubject] = useState<string | null>(null);
  const autoStopping = useRef(false);

  const now = useNow(Boolean(session) || Boolean(recovery) || breakEndsAt !== null);
  const serverNow = now + offset;
  const running = (session !== null && !session.pausedAt) || breakEndsAt !== null;
  const wakeLockSupported = useWakeLock(running);

  const preset: PomodoroPreset = (() => {
    const base = POMODORO_PRESETS.find((p) => p.id === presetId) ?? POMODORO_PRESETS[0];
    if (base.id !== "custom") return base;
    return { ...base, focusMin: clampInt(customFocus, 1, 240, 40), breakMin: clampInt(customBreak, 1, 60, 10) };
  })();

  const showToast = useCallback((text: string, tone: Toast["tone"] = "ok") => setToast({ text, tone }), []);

  const refreshSummary = useCallback(() => {
    studyApi
      .summary()
      .then(setSummary)
      .catch(() => undefined);
  }, []);

  const onQueuedSaved = useCallback(() => {
    refreshSummary();
    showToast(STUDY_MESSAGES.flushed);
  }, [refreshSummary, showToast]);
  const pendingStops = useStopQueue(onQueuedSaved);

  // Initial load: subjects, today's summary and any open session (recovery after refresh / on another device).
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([studyApi.subjects(controller.signal), studyApi.summary(undefined, controller.signal), studyApi.active(controller.signal)])
      .then(([loadedSubjects, loadedSummary, active]) => {
        setSubjects(loadedSubjects);
        setSummary(loadedSummary);
        if (active) {
          setRecovery(active);
          setOffset(clockOffset(active));
          setSelectedId(active.subjectId);
        } else {
          setSelectedId(loadedSubjects[0]?.id ?? null);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(studyErrorMessage(error));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function adopt(next: StudySession) {
    setSession(next);
    setOffset(clockOffset(next));
  }

  const subjectName = (id: number | null) => subjects?.find((s) => s.id === id)?.name ?? "";

  // ---------- Timer actions ----------

  async function start() {
    if (selectedId === null) {
      showToast(STUDY_MESSAGES.selectSubject, "error");
      return;
    }
    unlockAlarm();
    setBusy(true);
    try {
      const started = await studyApi.start(
        kind === "POMODORO"
          ? { subjectId: selectedId, mode: "POMODORO_FOCUS", plannedSec: preset.focusMin * 60 }
          : { subjectId: selectedId, mode: "STOPWATCH" },
      );
      autoStopping.current = false;
      setBreakEndsAt(null);
      adopt(started);
    } catch (error) {
      if (error instanceof ApiError && error.code === "ACTIVE_SESSION_EXISTS") {
        const active = await studyApi.active().catch(() => undefined);
        if (active) {
          setRecovery(active);
          setOffset(clockOffset(active));
        }
      }
      const message = studyErrorMessage(error);
      if (message) showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    if (!session) return;
    setBusy(true);
    try {
      adopt(session.pausedAt ? await studyApi.resume(session.id) : await studyApi.pause(session.id));
    } catch (error) {
      const message = studyErrorMessage(error);
      if (message) showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ends {@code target}. Saving uses the press time, so a stop queued offline still records the right amount.
   * Returns true when the time was recorded (or queued).
   */
  async function finish(target: StudySession, save: boolean): Promise<boolean> {
    const endTime = new Date(Date.now() + offset).toISOString();
    setSession(null);
    setConfirmStop(false);
    setBusy(true);
    try {
      if (!save) {
        await studyApi.discard(target.id);
        showToast("기록하지 않고 종료했어요.");
        return false;
      }
      const saved = await studyApi.stop(target.id, endTime);
      showToast(`✓ ${saved.subjectName} ${formatSpoken(saved.durationSec)} 기록했어요.`);
      refreshSummary();
      return true;
    } catch (error) {
      if (save && isNetworkError(error)) {
        enqueueStop(target.id, endTime);
        showToast(STUDY_MESSAGES.savedOffline, "error");
        return true;
      }
      if (isNetworkError(error)) setSession(target); // discard failed offline: keep the session
      const message = studyErrorMessage(error);
      if (message) showToast(message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Pomodoro: record the focus session and start the break. */
  async function completeFocus(target: StudySession, byTimer: boolean) {
    const count = focusCount + 1;
    setFocusCount(count);
    await finish(target, true);
    setBreakEndsAt(Date.now() + breakSec(preset, count) * 1000);
    if (byTimer) {
      playAlarm();
      showToast(STUDY_MESSAGES.focusDone);
    }
  }

  // Pomodoro phase changes, checked on every tick and on return from the background.
  useEffect(() => {
    if (session?.mode === "POMODORO_FOCUS" && session.plannedSec && !session.pausedAt && !autoStopping.current) {
      if (session.plannedSec - elapsedSec(session, serverNow) <= 0) {
        autoStopping.current = true;
        void completeFocus(session, true);
      }
    }
    if (breakEndsAt !== null && now >= breakEndsAt) {
      setBreakEndsAt(null);
      playAlarm();
      showToast(STUDY_MESSAGES.breakDone);
    }
    // Runs every tick, so it always sees this render's completeFocus/preset; listing those would add nothing.
  }, [now, session, breakEndsAt]);

  function resumeRecovered() {
    if (!recovery) return;
    setKind(recovery.mode === "POMODORO_FOCUS" ? "POMODORO" : "STOPWATCH");
    setSelectedId(recovery.subjectId);
    autoStopping.current = false;
    adopt(recovery);
    setRecovery(null);
  }

  async function finishRecovered() {
    if (!recovery) return;
    const target = recovery;
    setRecovery(null);
    await finish(target, true);
  }

  // ---------- Quick add / subjects / goal ----------

  async function quickAdd(sec: number) {
    if (selectedId === null) {
      showToast(STUDY_MESSAGES.selectSubject, "error");
      return;
    }
    setBusy(true);
    try {
      await studyApi.manual({ subjectId: selectedId, durationSec: sec });
      showToast(`✓ ${subjectName(selectedId)} 공부시간 ${formatSpoken(sec)}이 추가되었습니다.`);
      refreshSummary();
    } catch (error) {
      const message = studyErrorMessage(error);
      if (message) showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function addSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = (newSubject ?? "").trim();
    if (!name || name.length > SUBJECT_NAME_MAX_LENGTH) {
      showToast(STUDY_MESSAGES.subjectInvalid, "error");
      return;
    }
    try {
      const created = await studyApi.addSubject(name);
      setSubjects((list) => [...(list ?? []), created]);
      setSelectedId(created.id);
      setNewSubject(null);
      refreshSummary();
    } catch (error) {
      const message = studyErrorMessage(error);
      if (message) showToast(message, "error");
    }
  }

  async function changeGoal() {
    const answer = window.prompt(STUDY_MESSAGES.goalPrompt, summary ? String(summary.goalSec / 3600) : "8");
    if (answer === null) return;
    const sec = Math.round(Number(answer.trim()) * 3600);
    if (!Number.isFinite(sec) || sec < MIN_GOAL_SEC || sec > MAX_DAY_SEC) {
      showToast(STUDY_MESSAGES.goalInvalid, "error");
      return;
    }
    try {
      await studyApi.setGoal(sec);
      refreshSummary();
    } catch (error) {
      const message = studyErrorMessage(error);
      if (message) showToast(message, "error");
    }
  }

  // ---------- Render ----------

  if (loadError) {
    return (
      <main className="study">
        <h1>오늘의 공부</h1>
        <p role="alert">{loadError}</p>
      </main>
    );
  }
  if (!subjects || !summary) {
    return (
      <main className="study">
        <h1>오늘의 공부</h1>
        <p role="status">{STUDY_MESSAGES.loading}</p>
      </main>
    );
  }

  const sessionElapsed = session ? elapsedSec(session, serverNow) : 0;
  const liveExtra = session && session.recordDate === summary.date ? sessionElapsed : 0;
  const todayTotal = summary.totalSec + liveExtra;
  const percent = goalPercent(todayTotal, summary.goalSec);
  const studied = summary.subjects
    .map((s) => ({ ...s, durationSec: s.durationSec + (session?.subjectId === s.subjectId ? liveExtra : 0) }))
    .filter((s) => s.durationSec > 0);

  const inBreak = breakEndsAt !== null;
  const locked = session !== null || inBreak || recovery !== null;

  let display: string;
  let caption: string;
  if (session?.mode === "POMODORO_FOCUS" && session.plannedSec) {
    display = formatCountdown(session.plannedSec - sessionElapsed);
    caption = session.pausedAt ? "일시정지" : `${session.subjectName} 집중 중`;
  } else if (session) {
    display = formatClock(sessionElapsed);
    caption = session.pausedAt ? `${session.subjectName} · 일시정지` : `${session.subjectName} 공부 중`;
  } else if (inBreak) {
    display = formatCountdown(((breakEndsAt ?? now) - now) / 1000);
    caption = "휴식 중 ☕ (순공 시간에 포함되지 않아요)";
  } else if (kind === "POMODORO") {
    display = formatCountdown(preset.focusMin * 60);
    caption = selectedId === null ? STUDY_MESSAGES.selectSubject : `${subjectName(selectedId)} 집중 준비`;
  } else {
    display = formatClock(0);
    caption = selectedId === null ? STUDY_MESSAGES.selectSubject : `${subjectName(selectedId)} 공부 준비`;
  }

  return (
    <main className="study">
      <h1>📚 오늘의 공부</h1>

      <section className="study-card study-summary" aria-labelledby="today-title">
        <p id="today-title" className="study-label">오늘 공부시간</p>
        <p className="study-total">{formatHoursMinutes(todayTotal)}</p>
        <div
          className="study-progress"
          role="progressbar"
          aria-label="목표 달성률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <p className="study-goal">
          목표 {formatHoursMinutes(summary.goalSec)} · {percent}%
          <button type="button" className="link-button" onClick={changeGoal}>
            목표 변경
          </button>
        </p>
        {studied.length > 0 && (
          <ul className="study-subject-totals" aria-label="오늘의 과목별 공부시간">
            {studied.map((s) => (
              <li key={s.subjectId}>
                <span>{s.name}</span>
                <span className="study-mono">{formatClock(s.durationSec)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingStops > 0 && (
        <p className="study-pending" role="status">
          {STUDY_MESSAGES.pendingSaves(pendingStops)}
        </p>
      )}

      <section className="study-card" aria-labelledby="subject-title">
        <h2 id="subject-title">과목</h2>
        <div className="subject-chips" role="group" aria-label="과목 선택">
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              aria-pressed={selectedId === s.id}
              disabled={locked && selectedId !== s.id}
              onClick={() => setSelectedId(s.id)}
            >
              {s.name}
            </button>
          ))}
          {newSubject === null ? (
            <button type="button" className="chip chip-add" onClick={() => setNewSubject("")}>
              + 추가
            </button>
          ) : (
            <form className="subject-add" onSubmit={addSubject}>
              <input
                aria-label="새 과목 이름"
                placeholder="과목 이름"
                maxLength={SUBJECT_NAME_MAX_LENGTH}
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                autoFocus
              />
              <button type="submit" className="small">
                추가
              </button>
              <button type="button" className="small secondary" onClick={() => setNewSubject(null)}>
                취소
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="study-card study-timer" aria-labelledby="timer-title">
        <h2 id="timer-title" className="visually-hidden">
          타이머
        </h2>
        <div className="segmented" role="group" aria-label="타이머 종류">
          <button type="button" aria-pressed={kind === "STOPWATCH"} disabled={locked} onClick={() => setKind("STOPWATCH")}>
            ⏱ 스톱워치
          </button>
          <button type="button" aria-pressed={kind === "POMODORO"} disabled={locked} onClick={() => setKind("POMODORO")}>
            🍅 뽀모도로
          </button>
        </div>

        {kind === "POMODORO" && (
          <div className="pomodoro-settings">
            <div className="subject-chips" role="group" aria-label="뽀모도로 프리셋">
              {POMODORO_PRESETS.map((p) => (
                <button key={p.id} type="button" className="chip" aria-pressed={presetId === p.id} disabled={locked} onClick={() => setPresetId(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            {presetId === "custom" && (
              <div className="time-inputs">
                <label>
                  <span>집중</span>
                  <input type="number" inputMode="numeric" min={1} max={240} value={customFocus} disabled={locked} onChange={(e) => setCustomFocus(e.target.value)} aria-label="집중 시간(분)" />
                  <span>분</span>
                </label>
                <label>
                  <span>휴식</span>
                  <input type="number" inputMode="numeric" min={1} max={60} value={customBreak} disabled={locked} onChange={(e) => setCustomBreak(e.target.value)} aria-label="휴식 시간(분)" />
                  <span>분</span>
                </label>
              </div>
            )}
            <p className="muted">
              목표: {preset.focusMin}분 집중 / {preset.breakMin}분 휴식
              {preset.longBreakEvery ? ` · ${preset.longBreakEvery}회마다 ${preset.longBreakMin}분 휴식` : ""}
              {" · "}집중 세션 {Math.min(focusCount + (session ? 1 : 0), 99)}
              {preset.longBreakEvery ? `/${preset.longBreakEvery}` : ""}
            </p>
          </div>
        )}

        <p className="timer-display" aria-live="off">
          {display}
        </p>
        <p className="timer-caption">{caption}</p>

        {recovery ? (
          <div className="study-recovery" role="alertdialog" aria-labelledby="recovery-title">
            <p id="recovery-title">
              <strong>{STUDY_MESSAGES.recoveryTitle}</strong>
            </p>
            <p>
              {recovery.subjectName} · <span className="study-mono">{formatClock(elapsedSec(recovery, serverNow))}</span>
            </p>
            <div className="timer-controls">
              <button type="button" onClick={resumeRecovered} disabled={busy}>
                이어서 진행
              </button>
              <button type="button" className="secondary" onClick={finishRecovered} disabled={busy}>
                종료하고 저장
              </button>
            </div>
          </div>
        ) : confirmStop && session ? (
          <div className="study-confirm" role="alertdialog" aria-labelledby="stop-title">
            <p id="stop-title">
              <strong>{STUDY_MESSAGES.stopConfirm}</strong> {session.subjectName} {formatClock(sessionElapsed)}
            </p>
            <div className="timer-controls">
              <button type="button" onClick={() => void finish(session, true)} disabled={busy}>
                저장하고 종료
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => window.confirm(STUDY_MESSAGES.discardConfirm) && void finish(session, false)}
                disabled={busy}
              >
                저장 안 함
              </button>
              <button type="button" className="secondary" onClick={() => setConfirmStop(false)} disabled={busy}>
                계속 공부
              </button>
            </div>
          </div>
        ) : (
          <div className="timer-controls">
            {!session && !inBreak && (
              <button type="button" className="timer-main" onClick={start} disabled={busy || selectedId === null}>
                ▶ {kind === "POMODORO" ? "집중 시작" : "공부 시작"}
              </button>
            )}
            {session && (
              <>
                <button type="button" className="timer-main" onClick={togglePause} disabled={busy}>
                  {session.pausedAt ? "▶ 계속하기" : "⏸ 일시정지"}
                </button>
                {session.mode === "POMODORO_FOCUS" && (
                  <button type="button" className="secondary" onClick={() => void completeFocus(session, false)} disabled={busy}>
                    건너뛰기
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => (session.mode === "POMODORO_FOCUS" ? void finish(session, true).then(() => setFocusCount(0)) : setConfirmStop(true))}
                  disabled={busy}
                >
                  ■ {session.mode === "POMODORO_FOCUS" ? "저장/종료" : "공부 종료"}
                </button>
              </>
            )}
            {inBreak && (
              <>
                <button type="button" className="timer-main" onClick={() => setBreakEndsAt(null)}>
                  건너뛰기
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setBreakEndsAt(null);
                    setFocusCount(0);
                  }}
                >
                  ■ 종료
                </button>
              </>
            )}
          </div>
        )}

        {running && !wakeLockSupported && <p className="muted study-note">{STUDY_MESSAGES.wakeLockUnsupported}</p>}
      </section>

      <section className="study-card" aria-labelledby="quick-title">
        <h2 id="quick-title">빠른 기록</h2>
        <div className="quick-add">
          {QUICK_ADD.map((q) => (
            <button key={q.sec} type="button" className="secondary" onClick={() => quickAdd(q.sec)} disabled={busy || selectedId === null}>
              {q.label}
            </button>
          ))}
        </div>
        <button type="button" className="block secondary" onClick={() => setSheetOpen(true)}>
          직접 입력
        </button>
      </section>

      {sheetOpen && (
        <ManualTimeSheet
          subjects={subjects}
          subjectId={selectedId}
          date={summary.date}
          onClose={() => setSheetOpen(false)}
          onSaved={(saved) => {
            setSheetOpen(false);
            showToast(`✓ ${saved.subjectName} 공부시간 ${formatSpoken(saved.durationSec)}이 추가되었습니다.`);
            refreshSummary();
          }}
        />
      )}

      {toast && (
        <p className={`toast ${toast.tone}`} role="status">
          {toast.text}
        </p>
      )}
    </main>
  );
}

function clampInt(value: string, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}
