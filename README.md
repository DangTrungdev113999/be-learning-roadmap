# Backend Learning Roadmap — Dành cho FE Dev

> Người học: Đăng Thế Trung (FE dev)
> Hệ thống: Finpath (AdonisJS, MongoDB, Redis, Kafka, gRPC, WebSocket)
> Project chính để học: `logics` (~/Desktop/logics)
> Ngày tạo: 2026-03-18

## Cấu trúc

```
be-learning-roadmap/
├── level-1-read-understand/      ← Đọc hiểu code BE (1-2 tuần)
│   ├── 01-project-structure.md
│   ├── 02-trace-api-request.md
│   ├── 03-service-pattern.md
│   ├── 04-run-tests.md
│   └── checklist.md
│
├── level-2-write-api/            ← Viết API đơn giản (2-4 tuần)
│   ├── 01-controller-input-output.md
│   ├── 02-mongodb-basics.md
│   ├── 03-tdd-first-function.md
│   ├── 04-first-api-endpoint.md
│   ├── 05-redis-basics.md
│   └── checklist.md
│
├── level-3-full-feature/         ← Viết tính năng hoàn chỉnh (1-2 tháng)
│   ├── 01-kafka-message-queue.md
│   ├── 02-cronjob.md
│   ├── 03-http-client.md
│   ├── 04-slack-webhook.md
│   ├── 05-structured-logging.md
│   ├── 06-project-data-monitoring.md
│   └── checklist.md
│
├── level-4-distributed-system/   ← Hệ thống phân tán (2-3 tháng)
│   ├── 01-grpc.md
│   ├── 02-websocket-server.md
│   ├── 03-debug-cross-service.md
│   ├── 04-mongodb-advanced.md
│   └── checklist.md
│
├── level-5-architecture/         ← Thiết kế & kiến trúc (6+ tháng)
│   ├── 01-database-design.md
│   ├── 02-system-design.md
│   ├── 03-monitoring-observability.md
│   ├── 04-security.md
│   └── checklist.md
│
└── README.md                     ← File này
```

## Lộ trình tổng quan

| Level | Mục tiêu | Thời gian | Task mẫu |
|---|---|---|---|
| 1 | Đọc hiểu code BE | 1-2 tuần | Trace 1 API, đọc 3 service docs |
| 2 | Viết API đơn giản | 2-4 tuần | Thêm field, viết function + test |
| 3 | Viết tính năng hoàn chỉnh | 1-2 tháng | Data Monitoring (cronjob + Kafka + Slack) |
| 4 | Hiểu hệ thống phân tán | 2-3 tháng | Debug cross-service, tối ưu MongoDB |
| 5 | Thiết kế & kiến trúc | 6+ tháng | Design doc, code review |

## Cách học

1. Đọc file theo thứ tự trong mỗi level
2. Làm bài tập trong mỗi file
3. Check off items trong checklist.md
4. Khi checklist hoàn thành → lên level tiếp
