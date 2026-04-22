# Level 4: Hiểu hệ thống phân tán

**Mục tiêu**: Debug được lỗi cross-service, hiểu data flow toàn hệ thống, tối ưu MongoDB.

**Thời gian**: 2-3 tháng

## Cấu trúc

```
01-grpc/                  ← Giao tiếp giữa services (tuần 1-2)
├── 01-what-is-grpc.md
├── 02-proto-files.md
├── 03-client-setup.md
├── 04-streaming.md
├── 05-finpath-architecture.md
├── 06-error-and-reconnect.md
└── exercises/practice-5.md

02-websocket/             ← Realtime cho FE (tuần 3-4)
├── 01-http-vs-websocket.md
├── 02-server-side.md
├── 03-subscribe-broadcast.md
├── 04-connection-management.md
├── 05-fe-to-be-flow.md
└── exercises/practice-5.md

03-debugging/             ← Debug cross-service (tuần 5-7)
├── 01-system-overview.md
├── 02-trace-data-flow.md
├── 03-read-multiple-logs.md
├── 04-common-patterns.md
├── 05-debug-checklist.md
└── exercises/practice-10.md

04-mongodb-advanced/      ← MongoDB nâng cao (tuần 8-12)
├── 01-aggregation-deep.md
├── 02-group-operators.md
├── 03-multi-stage-pipelines.md
├── 04-index-deep.md
├── 05-explain-analyze.md
├── 06-performance-case-study.md
└── exercises/practice-10.md

exercises/mini-project.md
checklist.md
```
