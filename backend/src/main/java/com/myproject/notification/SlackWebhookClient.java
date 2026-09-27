package com.myproject.notification;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * Posts to the Slack Incoming Webhook. Best effort: failures are logged (never the URL or the text) and swallowed,
 * because a notification must never break or slow down saving a schedule.
 */
@Component
public class SlackWebhookClient {

    private static final Logger log = LoggerFactory.getLogger(SlackWebhookClient.class);

    private final SlackProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public SlackWebhookClient(SlackProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public void send(String text) {
        if (!properties.enabled()) {
            return;
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(properties.webhookUrl()))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json; charset=utf-8")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(Map.of("text", text))))
                    .build();
            HttpResponse<Void> response = http.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() / 100 != 2) {
                log.warn("Slack notification rejected: status={}", response.statusCode());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Slack notification interrupted");
        } catch (JsonProcessingException | IllegalArgumentException e) {
            log.warn("Slack notification not sent: {}", e.getClass().getSimpleName());
        } catch (IOException e) {
            log.warn("Slack notification failed: {}", e.getClass().getSimpleName());
        }
    }
}
