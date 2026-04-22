# Level 3: Viết tính năng hoàn chỉnh

**Mục tiêu**: Tự thiết kế và implement 1 tính năng end-to-end với cronjob, Kafka, Slack alert.

**Thời gian**: 1-2 tháng

## Cấu trúc

```
01-kafka/                ← Message Queue (tuần 1)
├── 01-what-is-message-queue.md
├── 02-producer-consumer.md
├── 03-kafka-in-logics.md
├── 04-tasks-directory.md
├── 05-safety-features.md
├── 06-error-handling.md
└── exercises/practice-8.md

02-cronjob/              ← Lập lịch tự động (tuần 2)
├── 01-cron-expression.md
├── 02-cronjob-add.md
├── 03-distributed-lock.md
├── 04-trading-hours.md
├── 05-real-cronjobs.md
└── exercises/practice-5.md

03-http-client/          ← Gọi API bên ngoài (tuần 2)
├── 01-axios-basics.md
├── 02-error-handling.md
├── 03-retry-patterns.md
├── 04-proxy-and-auth.md
└── exercises/practice-5.md

04-slack-webhook/        ← Gửi thông báo Slack (tuần 3)
├── 01-what-is-webhook.md
├── 02-setup-and-config.md
├── 03-message-formats.md
└── 04-monitoring-alerts.md

05-logging/              ← Logging có cấu trúc (tuần 3)
├── 01-why-structured-logs.md
├── 02-logger-api.md
├── 03-structured-data.md
└── 04-anti-patterns.md

06-project-monitoring/   ← Project thực hành: Data Monitoring (tuần 4-8)
├── 01-overview.md
├── 02-service-structure.md
├── 03-check-stock-api.md
├── 04-check-stock-data.md
├── 05-send-alert.md
└── 06-register-cronjob.md

exercises/mini-project.md
checklist.md
```
