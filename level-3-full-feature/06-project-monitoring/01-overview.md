# Tổng quan -- Stock Data Monitoring Service

## Mục tiêu

Xây dựng 1 service hoàn chỉnh từ đầu đến cuối, tích hợp tất cả kiến thức đã học:
- **HTTP Client** -- gọi API lấy dữ liệu
- **Slack Webhook** -- gửi alert khi phát hiện vấn đề
- **Logging** -- structured log cho mỗi bước
- **Cronjob** -- chạy tự động theo lịch
- **TDD** -- viết test trước, implement sau
- **Service pattern** -- cấu trúc docs.md, index.ts, libs/

## Bài toán

Hệ thống lấy dữ liệu chứng khoán từ API bên ngoài. Đôi khi API bị lỗi mà không ai biết:
- API trả 500 nhưng cronjob vẫn chạy tiếp
- API trả dữ liệu rỗng, hệ thống lưu dữ liệu rỗng
- Giá cổ phiếu không thay đổi 30 phút (data freeze)

**Giải pháp:** Monitoring service kiểm tra dữ liệu định kỳ, gửi alert vào Slack khi bất thường.

## Scope Phase 1 -- 4 functions

```
monitoringService/
├── docs.md
├── index.ts
├── constants.ts
├── type.ts
└── libs/
    ├── checkStockAPI.ts        ← Gọi API, kiểm tra response
    ├── checkStockAPI.spec.ts
    ├── checkStockData.ts       ← So sánh data, phát hiện freeze
    ├── checkStockData.spec.ts
    ├── sendAlert.ts            ← Format message, gửi Slack
    ├── sendAlert.spec.ts
    └── runStockMonitor.ts      ← Orchestrator, gọi check → alert
```

### Luồng hoạt động

```
Cronjob (mỗi 5 phút, giờ giao dịch)
  → runStockMonitor()
    → checkStockAPI()     : Gọi API, kiểm tra status, response time
    → checkStockData()    : So sánh price hiện tại vs 5 phút trước
    → sendAlert()         : Nếu có vấn đề, gửi Slack
```

### Flowchart

```
flowchart TD
    A[Cronjob trigger] --> B[checkStockAPI]
    B -->|API OK| C[checkStockData]
    B -->|API Error| D[sendAlert: API Down]
    C -->|Data OK| E[Log info: All good]
    C -->|Data Freeze| F[sendAlert: Data Freeze]
    C -->|Price = 0| G[sendAlert: Invalid Data]
```

## Kiến thức áp dụng

| Bước | Kiến thức | Bài học tham khảo |
|------|-----------|-------------------|
| Gọi API + retry | HTTP Client | 03-http-client/01, 02, 03 |
| Format alert message | Slack Block Kit | 04-slack-webhook/03, 04 |
| Log mỗi bước | Structured logging | 05-logging/01, 02, 03 |
| Constants, config | Service pattern | Level 1: 03-service-pattern |
| Viết test | TDD | Level 2: 03-tdd |
| Đăng ký cronjob | Cronjob | 02-cronjob |

## Quy trình làm việc

Mỗi function theo quy trình TDD:

```
1. Đọc yêu cầu → Hiểu input/output
2. Viết test cases (spec.ts)
3. Chạy test → Tất cả FAIL (Red)
4. Implement function
5. Chạy test → Tất cả PASS (Green)
6. Refactor nếu cần
7. Type check: yarn tsc --noEmit
```

## Tiếp theo

- **02-service-structure.md** -- Thiết kế docs.md, constants, types
- **03-check-stock-api.md** -- Implement checkStockAPI
- **04-check-stock-data.md** -- Implement checkStockData
- **05-send-alert.md** -- Implement sendAlert
- **06-register-cronjob.md** -- Đăng ký cronjob, integration test
