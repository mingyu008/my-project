package com.myproject.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
@EnableAsync
@EnableConfigurationProperties(SlackProperties.class)
public class NotificationConfig {

    public static final String EXECUTOR = "notificationExecutor";

    private static final Logger log = LoggerFactory.getLogger(NotificationConfig.class);

    /**
     * One thread keeps messages in order and within Slack's webhook rate limit (about one per second);
     * a small queue bounds memory, and overflow is dropped (logged) rather than blocking requests.
     */
    @Bean(EXECUTOR)
    public Executor notificationExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("notify-");
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(100);
        executor.setRejectedExecutionHandler((task, pool) -> log.warn("Notification queue full: message dropped"));
        executor.initialize();
        return executor;
    }
}
