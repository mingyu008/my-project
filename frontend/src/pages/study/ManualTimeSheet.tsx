import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_DAY_SEC, MIN_MANUAL_SEC, studyApi, type StudySession, type Subject } from "../../api/studyApi";
import { STUDY_MESSAGES, studyErrorMessage } from "./studyMessages";
import { periodSec, seoulInstant } from "./studyTime";

interface Props {
  subjects: Subject[];
  subjectId: number | null;
  /** The summary's day (yyyy-MM-dd, Asia/Seoul) that start/end times belong to. */
  date: string;
  onClose: () => void;
  onSaved: (session: StudySession) => void;
}

type Method = "duration" | "period";

/**
 * "직접 입력" bottom sheet: total time (hours + minutes) or start/end times on the current day.
 */
export function ManualTimeSheet({ subjects, subjectId, date, onClose, onSaved }: Props) {
  const [subject, setSubject] = useState<number | "">(subjectId ?? subjects[0]?.id ?? "");
  const [method, setMethod] = useState<Method>("duration");
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("0");
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("20:30");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const firstField = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const durationSec = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60;
  const periodTotal = periodSec(start, end);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || subject === "") {
      if (subject === "") setError(STUDY_MESSAGES.selectSubject);
      return;
    }
    let input: Parameters<typeof studyApi.manual>[0];
    if (method === "duration") {
      const valid = Number.isInteger(Number(hours)) && Number.isInteger(Number(minutes)) && Number(minutes) < 60;
      if (!valid || durationSec < MIN_MANUAL_SEC || durationSec > MAX_DAY_SEC) {
        setError(STUDY_MESSAGES.durationInvalid);
        return;
      }
      input = { subjectId: subject, durationSec, recordDate: date };
    } else {
      if (periodTotal === null) {
        setError(STUDY_MESSAGES.periodInvalid);
        return;
      }
      const endTime = seoulInstant(date, end);
      if (Date.parse(endTime) > Date.now() + 60_000) {
        setError(STUDY_MESSAGES.periodFuture);
        return;
      }
      input = { subjectId: subject, startTime: seoulInstant(date, start), endTime };
    }

    setError(null);
    setSubmitting(true);
    try {
      onSaved(await studyApi.manual(input));
    } catch (e) {
      setError(studyErrorMessage(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="manual-sheet-title">
        <h2 id="manual-sheet-title">공부시간 추가</h2>
        <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
          <div className="field">
            <label htmlFor="manual-subject">과목</label>
            <select
              id="manual-subject"
              ref={firstField}
              value={subject}
              onChange={(e) => setSubject(e.target.value === "" ? "" : Number(e.target.value))}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="segmented" role="group" aria-label="입력 방식">
            <button type="button" aria-pressed={method === "duration"} onClick={() => setMethod("duration")}>
              공부시간
            </button>
            <button type="button" aria-pressed={method === "period"} onClick={() => setMethod("period")}>
              시작 · 종료
            </button>
          </div>

          {method === "duration" ? (
            <div className="time-inputs">
              <label>
                <input type="number" inputMode="numeric" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} aria-label="시간" />
                <span>시간</span>
              </label>
              <label>
                <input type="number" inputMode="numeric" min={0} max={59} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="분" />
                <span>분</span>
              </label>
            </div>
          ) : (
            <div className="time-inputs">
              <label>
                <span>시작</span>
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="시작 시각" />
              </label>
              <label>
                <span>종료</span>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="종료 시각" />
              </label>
              <p className="muted time-total">{periodTotal === null ? "-" : `총 ${Math.floor(periodTotal / 3600)}시간 ${(periodTotal % 3600) / 60}분`}</p>
            </div>
          )}

          {error && <p role="alert">{error}</p>}

          <div className="sheet-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
              취소
            </button>
            <button type="submit" disabled={submitting}>
              {submitting ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
