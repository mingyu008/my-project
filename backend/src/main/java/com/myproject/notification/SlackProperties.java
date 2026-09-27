package com.myproject.notification;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Slack Incoming Webhook for the confirmers' channel (env SLACK_WEBHOOK_URL). Empty: notifications are off.
 * The webhook URL is a secret (anyone holding it can post to the channel): keep it in the hosting dashboard only.
 *
 * @param publicUrl base URL for links in messages (e.g. https://my-project.onrender.com); empty: no links
 */
@ConfigurationProperties("app.notify.slack")
public record SlackProperties(String webhookUrl, String publicUrl) {

    public boolean enabled() {
        return webhookUrl != null && !webhookUrl.isBlank();
    }

    /** Never prints the webhook URL. */
    @Override
    public String toString() {
        return "SlackProperties{enabled=" + enabled() + ", publicUrl=" + publicUrl + '}';
    }
}
