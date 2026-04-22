# Ba trụ cột của Observability: Logs, Metrics, Traces

## Mục tiêu

Hiểu ba nguồn dữ liệu cốt lõi để giám sát hệ thống backend, và nhận ra cái nào project Logics đã có, cái nào chưa.

---

## So sánh với Frontend

Nếu bạn đã từng debug ở FE, bạn đã dùng cả ba trụ cột mà không biết:

| Trụ cột | FE tương đương | BE tương đương |
|---------|----------------|----------------|
| **Logs** | `console.log()`, `console.error()` | `log.info()`, `log.error()` |
| **Metrics** | React DevTools Profiler (render count, duration) | Prometheus counters, gauges |
| **Traces** | Network tab (waterfall của requests) | Distributed tracing (Jaeger, Zipkin) |

Ở FE, bạn debug 1 tab trình duyệt. Ở BE, bạn debug hàng triệu request từ hàng nghìn user đồng thời -- nên cần hệ thống giám sát chuyên nghiệp hơn.

---

## 1. Logs -- Nhật ký sự kiện

### Logs là gì?

Log là bản ghi text mô tả một sự kiện đã xảy ra, kèm theo timestamp và context.

### Hai loại log

```
// Unstructured log (khó parse, khó search)
[2026-03-18 10:30:15] ERROR: Payment failed for user 123

// Structured log (dễ query, dễ filter)
{
  "timestamp": "2026-03-18T10:30:15Z",
  "level": "error",
  "message": "Payment failed",
  "userId": "123",
  "tags": ["planService.verifyGooglePurchase"],
  "error": "INVALID_TOKEN"
}
```

### Logics hiện đang dùng structured logs

```ts
import Logger from '@ioc:Adonis/Core/Logger'

const log = Logger.child({ tags: ['planService.upgradePlan'] })

// Structured data + message
log.info({ userId, planLevel, days, newExpiredDate }, 'User plan upgraded')
log.error({ error: error.message }, 'Google purchase verification failed')
log.warn({ status: response.status }, 'getGooglePurchase failed')
```

**Pattern quan trọng:**
- `Logger.child({ tags: [...] })` -- tạo logger con với tag để biết log từ đâu
- `log.info({ data }, 'message')` -- data object đi trước, message string đi sau
- Ba mức log chính: `info` (thông tin), `warn` (cảnh báo), `error` (lỗi)

### Log levels

```
FATAL   -> Hệ thống sắp crash, cần can thiệp ngay
ERROR   -> Có lỗi xảy ra nhưng hệ thống vẫn chạy
WARN    -> Có gì đó bất thường, nên để ý
INFO    -> Hoạt động bình thường, ghi nhận sự kiện
DEBUG   -> Chi tiết để debug, chỉ bật ở development
TRACE   -> Cực kỳ chi tiết, hiếm khi dùng
```

### Khi nào log gì?

| Sự kiện | Level | Ví dụ |
|---------|-------|-------|
| User đăng ký thành công | INFO | `log.info({ userId }, 'User registered')` |
| API response chậm > 3s | WARN | `log.warn({ duration, endpoint }, 'Slow response')` |
| Thanh toán thất bại | ERROR | `log.error({ error, userId }, 'Payment failed')` |
| Database disconnect | FATAL | `log.fatal({ error }, 'Database connection lost')` |

---

## 2. Metrics -- Số liệu đo lường

### Metrics là gì?

Metrics là các con số đo lường theo thời gian. Khác với logs (ghi từng sự kiện), metrics tổng hợp dữ liệu thành số thống kê.

### So sánh với FE

```
FE Metrics (React DevTools):
- Render count: component A render 47 lần
- Render duration: trung bình 12ms
- Bundle size: 450KB

BE Metrics:
- Request count: API /users được gọi 10,000 lần/phút
- Response time: P95 = 200ms
- Error rate: 0.5% request trả lỗi
- Active connections: 350 connections đang mở
```

### Tại sao không dùng logs thay metrics?

| Tiêu chí | Logs | Metrics |
|-----------|------|---------|
| Dung lượng | Lớn (mỗi event = 1 dòng) | Nhỏ (chỉ lưu số) |
| Query speed | Chậm (phải search text) | Nhanh (query số) |
| Realtime dashboard | Khó | Dễ (Grafana) |
| Alert | Phức tạp | Đơn giản (> ngưỡng = alert) |
| Chi tiết | Cao (biết chính xác chuyện gì) | Thấp (chỉ biết "bao nhiêu") |

=> Dùng **cả hai**: metrics để phát hiện vấn đề, logs để tìm nguyên nhân.

### Logics hiện chưa có metrics

Project chưa tích hợp Prometheus hay bất kỳ metrics system nào. Chỉ có logs. Đây là gap lớn nhất trong observability.

---

## 3. Traces -- Theo dõi luồng request

### Traces là gì?

Trace theo dõi một request từ đầu đến cuối qua tất cả các service/function mà nó đi qua.

### So sánh với FE

```
FE (Network tab):
Browser -> GET /api/users -> 200 OK (150ms)
  Gồm: DNS (5ms) + TCP (10ms) + Server (120ms) + Download (15ms)

BE (Distributed trace):
Client -> API Gateway -> Auth Middleware -> Controller -> Service -> MongoDB -> Redis
  [-------------- 200ms total ----------------]
  Auth: 5ms | Controller: 10ms | DB Query: 150ms | Redis: 3ms
```

Trace giúp trả lời: **"Tại sao request này chậm?"** bằng cách chỉ ra chính xác bước nào tốn thời gian.

### Các thành phần của một trace

```
Trace (toàn bộ hành trình của 1 request)
├── Span: API Gateway (5ms)
├── Span: Auth Middleware (3ms)
├── Span: Controller (2ms)
├── Span: planService.upgradePlan (180ms)
│   ├── Span: MongoDB findOne (50ms)
│   ├── Span: MongoDB updateOne (80ms)
│   └── Span: Redis set (10ms)
└── Span: Response serialize (2ms)
```

- **Trace**: toàn bộ hành trình, có `traceId` duy nhất
- **Span**: một bước trong hành trình, có `spanId` và `parentSpanId`

### Logics hiện chưa có tracing

Không có distributed tracing. Khi debug, phải dựa vào logs và grep theo `tags` để ghép lại câu chuyện.

---

## Tổng kết: Logics đang ở đâu?

```
┌─────────────────────────────────────────┐
│         Observability Maturity          │
├───────────┬──────────┬──────────────────┤
│   Logs    │ Metrics  │     Traces       │
│   ✅ Có   │  ❌ Chưa  │    ❌ Chưa       │
│           │          │                  │
│ Structured│ Không có │ Không có         │
│ Logger    │ Prometheus│ Jaeger/Zipkin   │
│ .child()  │ Grafana  │ OpenTelemetry    │
│ tags-based│          │                  │
└───────────┴──────────┴──────────────────┘
```

### Hệ quả thực tế

| Câu hỏi | Có logs | Cần metrics | Cần traces |
|----------|---------|-------------|------------|
| "API nào đang lỗi?" | Grep logs | Error rate dashboard | -- |
| "Bao nhiêu user active?" | Đếm logs (chậm) | Gauge (realtime) | -- |
| "Tại sao request này chậm 5s?" | Khó biết | Biết latency cao | Biết chính xác bước nào chậm |
| "Service nào gây bottleneck?" | Rất khó | CPU/memory metrics | Trace waterfall |

---

## Điểm chính cần nhớ

1. **Logs** = "Chuyện gì đã xảy ra?" -- Logics đã có, dùng structured logging với `Logger.child({ tags })`.
2. **Metrics** = "Bao nhiêu? Nhanh chậm thế nào?" -- Logics chưa có, cần Prometheus + Grafana.
3. **Traces** = "Request đi qua đâu, bước nào chậm?" -- Logics chưa có, cần Jaeger/OpenTelemetry.
4. Logs giống `console.log`, metrics giống React DevTools Profiler, traces giống Network tab waterfall.
5. Ba trụ cột bổ sung cho nhau -- metrics phát hiện, logs giải thích, traces định vị.
