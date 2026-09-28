import { describe, expect, it } from "vitest";
import {
  breakSec,
  clockOffset,
  elapsedSec,
  formatClock,
  formatCountdown,
  formatHoursMinutes,
  formatSpoken,
  goalPercent,
  periodSec,
  POMODORO_PRESETS,
  seoulInstant,
} from "./studyTime";

const START = "2026-09-28T10:00:00Z";
const at = (iso: string) => Date.parse(iso);

describe("studyTime", () => {
  it("computes elapsed time from timestamps, excluding pauses", () => {
    expect(elapsedSec({ startTime: START, pausedAt: null, pausedSec: 0 }, at("2026-09-28T10:30:00Z"))).toBe(1800);
    expect(elapsedSec({ startTime: START, pausedAt: null, pausedSec: 600 }, at("2026-09-28T10:30:00Z"))).toBe(1200);
    // Paused at 10:15: time after the pause does not count, however long the tab slept.
    expect(elapsedSec({ startTime: START, pausedAt: "2026-09-28T10:15:00Z", pausedSec: 0 }, at("2026-09-28T13:00:00Z"))).toBe(900);
    expect(elapsedSec({ startTime: START, pausedAt: null, pausedSec: 0 }, at("2026-09-28T09:59:00Z"))).toBe(0);
  });

  it("measures the server clock offset", () => {
    expect(clockOffset({ serverTime: START }, at(START) - 5000)).toBe(5000);
  });

  it("formats times", () => {
    expect(formatClock(5565)).toBe("01:32:45");
    expect(formatCountdown(1425)).toBe("23:45");
    expect(formatCountdown(-3)).toBe("00:00");
    expect(formatHoursMinutes(9000)).toBe("02시간 30분");
    expect(formatSpoken(1800)).toBe("30분");
    expect(formatSpoken(3600)).toBe("1시간");
    expect(formatSpoken(4800)).toBe("1시간 20분");
    expect(goalPercent(9000, 28800)).toBe(31);
    expect(goalPercent(40000, 28800)).toBe(100);
  });

  it("computes same-day periods in Asia/Seoul", () => {
    expect(periodSec("19:00", "20:30")).toBe(5400);
    expect(periodSec("20:30", "19:00")).toBeNull();
    expect(periodSec("19:00", "19:00")).toBeNull();
    expect(seoulInstant("2026-09-28", "19:00")).toBe("2026-09-28T10:00:00.000Z");
  });

  it("gives a long break after every fourth standard pomodoro", () => {
    const standard = POMODORO_PRESETS[0];
    expect(breakSec(standard, 1)).toBe(5 * 60);
    expect(breakSec(standard, 4)).toBe(15 * 60);
    expect(breakSec(POMODORO_PRESETS[1], 4)).toBe(10 * 60);
  });
});
