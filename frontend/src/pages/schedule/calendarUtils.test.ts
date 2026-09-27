import { describe, expect, it } from "vitest";
import { addDays, addMonths, isIsoDate, monthGrid, schedulesOn, startOfWeek, timeRange, todayIso, weekDays, weekTitle } from "./calendarUtils";

describe("calendarUtils", () => {
  it("builds a 6-week month grid starting on the Sunday on or before the 1st", () => {
    // 2026-09-01 is a Tuesday.
    const grid = monthGrid("2026-09-17");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-08-30");
    expect(grid[2]).toBe("2026-09-01");
    expect(grid[41]).toBe("2026-10-10");
    // A month starting on Sunday starts the grid on the 1st.
    expect(monthGrid("2026-11-20")[0]).toBe("2026-11-01");
  });

  it("builds weeks from Sunday", () => {
    expect(startOfWeek("2026-09-27")).toBe("2026-09-27");
    expect(startOfWeek("2026-10-03")).toBe("2026-09-27");
    expect(weekDays("2026-09-30")).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(weekTitle("2026-09-30")).toBe("2026.09.27 – 10.03");
  });

  it("moves across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
  });

  it("validates date parameters", () => {
    expect(isIsoDate("2026-09-27")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-9-1")).toBe(false);
    expect(isIsoDate("<script>")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("uses the local calendar day for today", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("places schedules on every day they touch, except an end at midnight", () => {
    const items = [
      { id: 1, startAt: "2026-09-28T10:00:00", endAt: "2026-09-28T11:00:00" },
      { id: 2, startAt: "2026-09-27T22:00:00", endAt: "2026-09-29T09:00:00" },
      { id: 3, startAt: "2026-09-28T23:00:00", endAt: "2026-09-29T00:00:00" },
    ];
    expect(schedulesOn(items, "2026-09-27").map((s) => s.id)).toEqual([2]);
    expect(schedulesOn(items, "2026-09-28").map((s) => s.id)).toEqual([1, 2, 3]);
    expect(schedulesOn(items, "2026-09-29").map((s) => s.id)).toEqual([2]);
  });

  it("labels time ranges across days", () => {
    const oneDay = { startAt: "2026-09-28T10:00:00", endAt: "2026-09-28T11:00:00" };
    const threeDays = { startAt: "2026-09-28T13:00:00", endAt: "2026-09-30T12:00:00" };
    expect(timeRange(oneDay, "2026-09-28")).toBe("10:00–11:00");
    expect(timeRange(threeDays, "2026-09-28")).toBe("13:00–9/30 12:00");
    expect(timeRange(threeDays, "2026-09-29")).toBe("(계속)–9/30 12:00");
    expect(timeRange(threeDays, "2026-09-30")).toBe("(계속)–12:00");
  });
});
