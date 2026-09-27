package com.myproject.notification;

import com.myproject.schedule.ScheduleChangedEvent;
import com.myproject.schedule.ScheduleChangedEvent.Snapshot;
import com.myproject.schedule.SchedulePriority;
import com.myproject.schedule.ScheduleStatus;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Builds the Slack mrkdwn text for a schedule change. All user input is escaped, so a title can never
 * mention @channel/@here, a user, or create a disguised link.
 */
public final class ScheduleSlackMessage {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    private static final Map<ScheduleStatus, String> STATUS = Map.of(
            ScheduleStatus.PLANNED, "예정",
            ScheduleStatus.IN_PROGRESS, "진행중",
            ScheduleStatus.COMPLETED, "완료",
            ScheduleStatus.CANCELLED, "취소");
    private static final Map<SchedulePriority, String> PRIORITY = Map.of(
            SchedulePriority.LOW, "낮음",
            SchedulePriority.NORMAL, "보통",
            SchedulePriority.HIGH, "높음",
            SchedulePriority.URGENT, "긴급");

    private ScheduleSlackMessage() {
    }

    public static String text(ScheduleChangedEvent event, String publicUrl) {
        Snapshot s = event.schedule();
        List<String> lines = new ArrayList<>();
        lines.add(event.type() == ScheduleChangedEvent.Type.CREATED
                ? ":new: *새 일정 등록* · " + escape(event.actor())
                : ":pencil2: *일정 수정* · " + escape(event.actor()));
        lines.add("*" + titleLink(s, publicUrl) + "*");
        if (event.previous() != null) {
            lines.add("• 변경: " + String.join(", ", changes(event.previous(), s)));
        }
        lines.add("• 일시: " + period(s.startAt(), s.endAt()));
        lines.add("• 상태: " + STATUS.get(s.status()) + " · 우선순위: " + PRIORITY.get(s.priority()));
        lines.add("• 담당자: " + (s.assignee() == null ? "-" : escape(s.assignee())));
        if (s.location() != null) {
            lines.add("• 장소: " + escape(s.location()));
        }
        boolean becameCompleted = s.status() == ScheduleStatus.COMPLETED
                && (event.previous() == null || event.previous().status() != ScheduleStatus.COMPLETED);
        if (becameCompleted) {
            lines.add(":trophy: 완료된 일정입니다. 보상을 검토해 주세요.");
        }
        return String.join("\n", lines);
    }

    static List<String> changes(Snapshot before, Snapshot after) {
        List<String> changes = new ArrayList<>();
        if (!Objects.equals(before.title(), after.title())) {
            changes.add("제목");
        }
        if (!Objects.equals(before.startAt(), after.startAt()) || !Objects.equals(before.endAt(), after.endAt())) {
            changes.add("일시");
        }
        if (before.status() != after.status()) {
            changes.add("상태 " + STATUS.get(before.status()) + " → " + STATUS.get(after.status()));
        }
        if (before.priority() != after.priority()) {
            changes.add("우선순위 " + PRIORITY.get(before.priority()) + " → " + PRIORITY.get(after.priority()));
        }
        if (!Objects.equals(before.assignee(), after.assignee())) {
            changes.add("담당자");
        }
        if (!Objects.equals(before.location(), after.location())) {
            changes.add("장소");
        }
        if (before.publicSchedule() != after.publicSchedule()) {
            changes.add("공개 여부");
        }
        return changes;
    }

    private static String titleLink(Snapshot s, String publicUrl) {
        String title = escape(s.title());
        if (publicUrl == null || publicUrl.isBlank()) {
            return title;
        }
        return "<" + publicUrl.replaceAll("/+$", "") + "/schedule/" + s.id() + "|" + title + ">";
    }

    private static String period(LocalDateTime start, LocalDateTime end) {
        String endText = start.toLocalDate().equals(end.toLocalDate()) ? end.format(TIME) : end.format(DATE_TIME);
        return start.format(DATE_TIME) + " ~ " + endText;
    }

    /** Slack control characters (https://api.slack.com/reference/surfaces/formatting#escaping). */
    static String escape(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
