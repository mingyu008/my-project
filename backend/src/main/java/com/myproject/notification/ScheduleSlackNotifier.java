package com.myproject.notification;

import com.myproject.schedule.ScheduleChangedEvent;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Tells the confirmers' Slack channel about new and changed schedules (DECISIONS D-045).
 * Runs only after the change is committed, on a separate thread, so Slack can neither roll back nor delay a save.
 * The channel is expected to contain confirmers only: they may see every schedule (D-035), including private ones.
 */
@Component
public class ScheduleSlackNotifier {

    private final SlackProperties properties;
    private final SlackWebhookClient client;

    public ScheduleSlackNotifier(SlackProperties properties, SlackWebhookClient client) {
        this.properties = properties;
        this.client = client;
    }

    @Async(NotificationConfig.EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onScheduleChanged(ScheduleChangedEvent event) {
        if (properties.enabled()) {
            client.send(ScheduleSlackMessage.text(event, properties.publicUrl()));
        }
    }
}
