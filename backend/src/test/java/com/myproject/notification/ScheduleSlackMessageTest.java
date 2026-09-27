package com.myproject.notification;

import com.myproject.schedule.ScheduleChangedEvent;
import com.myproject.schedule.ScheduleChangedEvent.Snapshot;
import com.myproject.schedule.SchedulePriority;
import com.myproject.schedule.ScheduleStatus;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class ScheduleSlackMessageTest {

    private static final LocalDateTime START = LocalDateTime.of(2026, 9, 28, 10, 0);

    private static Snapshot snapshot(String title, ScheduleStatus status, String assignee) {
        return new Snapshot(7, title, START, START.plusHours(1), status, SchedulePriority.HIGH, assignee, "회의실 A", false);
    }

    @Test
    void newScheduleMessage() {
        String text = ScheduleSlackMessage.text(new ScheduleChangedEvent(ScheduleChangedEvent.Type.CREATED,
                snapshot("주간 회의", ScheduleStatus.PLANNED, "bob"), null, "alice"), "https://app.example.com/");

        assertThat(text).isEqualTo("""
                :new: *새 일정 등록* · alice
                *<https://app.example.com/schedule/7|주간 회의>*
                • 일시: 2026-09-28 10:00 ~ 11:00
                • 상태: 예정 · 우선순위: 높음
                • 담당자: bob
                • 장소: 회의실 A""");
    }

    @Test
    void updateListsChangesAndAsksForRewardOnCompletion() {
        Snapshot before = snapshot("주간 회의", ScheduleStatus.IN_PROGRESS, "bob");
        Snapshot after = new Snapshot(7, "주간 회의(확정)", START, START.plusDays(1), ScheduleStatus.COMPLETED,
                SchedulePriority.HIGH, null, "회의실 A", false);

        String text = ScheduleSlackMessage.text(new ScheduleChangedEvent(ScheduleChangedEvent.Type.UPDATED, after, before, "alice"), "");

        assertThat(text)
                .startsWith(":pencil2: *일정 수정* · alice\n*주간 회의(확정)*")
                .contains("• 변경: 제목, 일시, 상태 진행중 → 완료, 담당자")
                .contains("• 일시: 2026-09-28 10:00 ~ 2026-09-29 10:00")
                .contains("• 담당자: -")
                .endsWith(":trophy: 완료된 일정입니다. 보상을 검토해 주세요.");
        // Already completed before: no repeated reward prompt.
        assertThat(ScheduleSlackMessage.text(new ScheduleChangedEvent(ScheduleChangedEvent.Type.UPDATED, after,
                new Snapshot(7, "x", START, START, ScheduleStatus.COMPLETED, SchedulePriority.LOW, null, null, false), "alice"), ""))
                .doesNotContain(":trophy:");
    }

    @Test
    void userInputCannotMentionOrLink() {
        String evil = "<!channel> & <https://evil.example|click> <@U123>";
        String text = ScheduleSlackMessage.text(new ScheduleChangedEvent(ScheduleChangedEvent.Type.CREATED,
                new Snapshot(7, evil, START, START, ScheduleStatus.PLANNED, SchedulePriority.LOW, "<!here>", "<b>", false), null,
                "a&b"), "https://app.example.com");

        assertThat(text)
                .contains("|&lt;!channel&gt; &amp; &lt;https://evil.example|click&gt; &lt;@U123&gt;>")
                .contains("• 담당자: &lt;!here&gt;")
                .contains("• 장소: &lt;b&gt;")
                .contains("· a&amp;b")
                .doesNotContain("<!channel>", "<!here>", "<@U123>", "<https://evil");
    }
}
