# Lộ trình Observability cho Logics

## Mục tiêu

Xây dựng lộ trình từng bước để nâng cấp hệ thống giám sát, từ trạng thái hiện tại (chỉ có logs) lên hệ thống observability hoàn chỉnh.

---

## Hiện trạng

```
┌──────────────────────────────────────────────────┐
│              Observability hiện tại              │
├──────────────┬──────────────┬────────────────────┤
│    Logs      │   Metrics    │     Traces         │
│    ✅ Có     │    ❌ Không   │     ❌ Không       │
│              │              │                    │
│ - Structured │ - Không có   │ - Không có         │
│   logging    │   Prometheus │   distributed      │
│ - Logger     │ - Không có   │   tracing          │
│   .child()   │   Grafana    │ - Debug bằng       │
│   với tags   │ - Đo thủ     │   grep logs        │
│ - info/warn/ │   công qua   │                    │
│   error      │   logs       │                    │
│ - Webhook    │              │                    │
│   alerts     │              │                    │
└──────────────┴──────────────┴────────────────────┘
```

### Điểm mạnh hiện tại
- Structured logging pattern nhất quán: `Logger.child({ tags: ['service.function'] })`
- Log levels được dùng đúng: `info` cho thành công, `warn` cho bất thường, `error` cho lỗi
- Data context trong logs: `log.info({ userId, planLevel, days }, 'message')`
- Webhook integration sẵn có (có thể mở rộng cho alerting)

### Điểm yếu
- Không có metrics: không biết RPS, latency distribution, error rate realtime
- Không có traces: khó debug request chậm, không biết bottleneck ở đâu
- Không có centralized log aggregation (ELK/Loki)
- Alert chủ yếu qua logs, chưa có rule-based alerting tự động

---

## Phase 1: Cải thiện Logging (1-2 tuần)

### Mục tiêu
Tối ưu hệ thống logs đã có, chuẩn bị nền tảng cho metrics và traces.

### 1.1 Chuẩn hóa log format

```ts
// TRƯỚC: Tags không nhất quán
Logger.child({ tags: ['MONGO'] })           // UPPER_CASE
Logger.child({ tags: ['FB_LOGIN'] })        // UPPER + underscore
Logger.child({ tags: ['cronjob'] })         // lowercase
Logger.child({ tags: ['planService.upgradePlan'] }) // service.function

// SAU: Chuẩn hóa tất cả theo pattern service.function
Logger.child({ tags: ['mongo.connect'] })
Logger.child({ tags: ['auth.facebookLogin'] })
Logger.child({ tags: ['cron.dailyReport'] })
Logger.child({ tags: ['planService.upgradePlan'] })  // giữ nguyên
```

### 1.2 Thêm request context

```ts
// Middleware thêm requestId vào mỗi request
app.use((ctx, next) => {
  ctx.requestId = crypto.randomUUID()
  ctx.logger = Logger.child({
    requestId: ctx.requestId,
    userId: ctx.auth?.userId,
    ip: ctx.request.ip(),
  })
  return next()
})

// Trong controller/service, dùng ctx.logger thay vì Logger.child()
// Tất cả logs từ cùng 1 request sẽ có cùng requestId
// -> Dễ trace toàn bộ hành trình của 1 request
```

### 1.3 Centralized log storage

```
App Servers ──> Loki (log aggregation) ──> Grafana (search & visualize)

Hoặc:
App Servers ──> Filebeat ──> Elasticsearch ──> Kibana

Loki nhẹ hơn, phù hợp với team nhỏ.
ELK mạnh hơn, phù hợp khi cần full-text search phức tạp.
```

### Kết quả Phase 1
- Logs nhất quán, dễ search
- Có thể trace 1 request qua requestId
- Logs tập trung 1 chỗ, không cần SSH vào từng server

---

## Phase 2: Metrics + Grafana (2-4 tuần)

### Mục tiêu
Thêm Prometheus metrics để có dashboard realtime và alerting tự động.

### 2.1 Setup Prometheus

```
┌──────────┐     pull      ┌────────────┐    query    ┌─────────┐
│ App      │ <──────────── │ Prometheus │ ──────────> │ Grafana │
│ /metrics │   mỗi 15s     │            │             │         │
│ endpoint │               │ Store      │             │Dashboard│
└──────────┘               │ time-series│             │ Alerts  │
                           └────────────┘             └─────────┘
```

### 2.2 Thêm metrics vào Logics

```ts
// middleware/metrics.ts
import { Counter, Histogram, Gauge, register } from 'prom-client'

// Tổng số requests
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
})

// Response time
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
})

// Active connections
const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
})

// Middleware đo metrics mỗi request
export function metricsMiddleware(ctx, next) {
  const start = Date.now()
  activeConnections.inc()

  return next().finally(() => {
    const duration = (Date.now() - start) / 1000
    const route = ctx.route?.pattern || 'unknown'

    httpRequestsTotal.inc({
      method: ctx.request.method(),
      route,
      status_code: ctx.response.getStatus(),
    })

    httpRequestDuration.observe(
      { method: ctx.request.method(), route },
      duration,
    )

    activeConnections.dec()
  })
}

// Expose /metrics endpoint cho Prometheus scrape
Route.get('/metrics', async ({ response }) => {
  response.header('content-type', register.contentType)
  response.send(await register.metrics())
})
```

### 2.3 Business metrics

```ts
// Metrics riêng cho business logic
const paymentAttempts = new Counter({
  name: 'payment_attempts_total',
  help: 'Payment attempts',
  labelNames: ['provider', 'result'],  // google/apple, success/fail
})

const rateLimitExceeded = new Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Rate limit exceeded events',
  labelNames: ['key_prefix', 'unique_key'],
})

// Trong RateLimit middleware, thêm:
rateLimitExceeded.inc({ key_prefix: keyPrefix, unique_key: uniqueKey })

// Trong planService, thêm:
paymentAttempts.inc({ provider: 'google', result: 'success' })
```

### 2.4 Grafana Dashboards

```
Dashboard 1: API Overview
┌──────────────────────┬──────────────────────┐
│ Requests/sec (line)  │ Error Rate % (line)  │
├──────────────────────┼──────────────────────┤
│ P50/P95/P99 Latency │ Active Connections   │
├──────────────────────┼──────────────────────┤
│ Top 5 Slowest Routes│ Top 5 Error Routes   │
└──────────────────────┴──────────────────────┘

Dashboard 2: Business Metrics
┌──────────────────────┬──────────────────────┐
│ Payment Success Rate │ New Registrations/hr │
├──────────────────────┼──────────────────────┤
│ Active Users (gauge) │ Rate Limits Hit/min  │
└──────────────────────┴──────────────────────┘

Dashboard 3: Infrastructure
┌──────────────────────┬──────────────────────┐
│ CPU Usage            │ Memory Usage         │
├──────────────────────┼──────────────────────┤
│ MongoDB Connections  │ Redis Memory         │
├──────────────────────┼──────────────────────┤
│ Disk Usage           │ Network I/O          │
└──────────────────────┴──────────────────────┘
```

### 2.5 Alert rules trong Grafana

```yaml
# Grafana alert rules
groups:
  - name: api-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate > 1% trong 5 phút"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency > 2 giây"

      - alert: PaymentFailures
        expr: rate(payment_attempts_total{result="fail"}[5m]) > 5
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "Thanh toán thất bại > 5/phút"
```

### Kết quả Phase 2
- Dashboard realtime cho API, business, infrastructure
- Alert tự động qua Grafana -> Slack
- Biết ngay: bao nhiêu RPS, latency bao nhiêu, error rate bao nhiêu

---

## Phase 3: Distributed Tracing (4-6 tuần)

### Mục tiêu
Thêm tracing để debug request chậm và hiểu luồng xử lý xuyên suốt các service.

### 3.1 Chọn công nghệ

```
OpenTelemetry (OTel) -> Chuẩn mở, vendor-neutral
  ├── Jaeger    -> Tracing backend (self-hosted)
  ├── Zipkin    -> Tracing backend (lightweight)
  └── Tempo     -> Grafana's tracing backend (tích hợp tốt với Grafana)

Khuyến nghị: OpenTelemetry + Grafana Tempo
  -> Tích hợp với Grafana dashboard đã có từ Phase 2
  -> Correlate traces với logs và metrics
```

### 3.2 Instrument code

```ts
// tracing.ts - setup OpenTelemetry
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://tempo:4318/v1/traces',
  }),
  instrumentations: [
    new HttpInstrumentation(),       // Tự động trace HTTP requests
    new MongoDBInstrumentation(),    // Tự động trace MongoDB queries
    new IORedisInstrumentation(),    // Tự động trace Redis commands
  ],
})

sdk.start()
```

### 3.3 Custom spans cho business logic

```ts
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('planService')

async function verifyGooglePurchase(requestData) {
  return tracer.startActiveSpan('verifyGooglePurchase', async (span) => {
    try {
      span.setAttribute('provider', 'google')
      span.setAttribute('userId', requestData.userId)

      // Google API call - tự động traced bởi HTTP instrumentation
      const response = await callGoogleAPI(requestData)

      span.setAttribute('purchaseState', response.purchaseState)

      // MongoDB operations - tự động traced bởi MongoDB instrumentation
      await processTransaction(response)

      span.setStatus({ code: SpanStatusCode.OK })
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      throw error
    } finally {
      span.end()
    }
  })
}
```

### 3.4 Trace visualization

```
Trace: POST /api/plans/verify-google (350ms total)
│
├── [HTTP] POST /api/plans/verify-google ──────────── 350ms
│   ├── [Middleware] Auth ──────────────────────────── 5ms
│   ├── [Middleware] RateLimit ─────────────────────── 3ms
│   ├── [Controller] PlansController.verifyGoogle ──── 340ms
│   │   ├── [Custom] verifyGooglePurchase ──────────── 330ms
│   │   │   ├── [HTTP] POST googleapis.com ─────────── 150ms
│   │   │   ├── [MongoDB] findOne orders ───────────── 20ms
│   │   │   ├── [MongoDB] findOne users ────────────── 15ms
│   │   │   ├── [MongoDB] findOne plans ────────────── 12ms
│   │   │   ├── [Custom] upgradePlan ───────────────── 120ms
│   │   │   │   ├── [MongoDB] updateOne users ──────── 80ms
│   │   │   │   └── [Redis] SET user:plan:cache ────── 8ms
│   │   │   └── [MongoDB] updateOne orders ─────────── 25ms
│   │   └── [HTTP] Response serialize ──────────────── 2ms
```

### 3.5 Correlate Logs - Metrics - Traces

```
Grafana cho phép jump giữa 3 trụ cột:

1. Dashboard (Metrics): Thấy P95 latency tăng
   -> Click vào data point

2. Traces: Thấy trace chậm nhất
   -> Thấy MongoDB query mất 2 giây
   -> Click "View Logs"

3. Logs: Thấy log error từ cùng request
   -> log.error({ error }, 'MongoDB timeout on aggregation')
   -> Biết chính xác query nào gây vấn đề
```

### Kết quả Phase 3
- Debug request chậm chỉ trong vài phút thay vì hàng giờ
- Biết chính xác bottleneck ở đâu: API bên ngoài? Database? Redis?
- Correlate logs + metrics + traces trong 1 dashboard

---

## Tổng kết lộ trình

```
Timeline:

Tuần 1-2: Phase 1 - Cải thiện Logging
├── Chuẩn hóa tags format
├── Thêm requestId vào mỗi request
└── Setup Loki/ELK cho centralized logs

Tuần 3-6: Phase 2 - Metrics + Grafana
├── Setup Prometheus + Grafana
├── Thêm metrics middleware
├── Tạo dashboards (API, Business, Infra)
└── Cấu hình alert rules

Tuần 7-12: Phase 3 - Distributed Tracing
├── Setup OpenTelemetry + Tempo
├── Auto-instrument HTTP, MongoDB, Redis
├── Custom spans cho business logic
└── Correlate logs + metrics + traces
```

### Chi phí ước tính

```
Self-hosted (tiết kiệm, cần DevOps):
├── Prometheus + Grafana + Loki + Tempo
├── 1 server ~$50-100/tháng
└── Cần 1 DevOps maintain

Managed service (dễ, tốn tiền):
├── Grafana Cloud Free Tier: 0$  (10K metrics, 50GB logs, 50GB traces)
├── Grafana Cloud Pro: ~$50/tháng
├── Datadog: ~$200-500/tháng
└── New Relic: Free tier khá rộng rãi
```

---

## Điểm chính cần nhớ

1. **Phase 1** (Logs): Chuẩn hóa cái đã có, thêm requestId, centralize logs.
2. **Phase 2** (Metrics): Prometheus + Grafana cho dashboard và alerting tự động.
3. **Phase 3** (Traces): OpenTelemetry cho distributed tracing, debug chính xác.
4. Mỗi phase xây trên nền phase trước -- không skip.
5. Bắt đầu với **Grafana Cloud Free Tier** để thử nghiệm nhanh, không cần setup server.
6. Mục tiêu cuối cùng: từ "grep logs mất 30 phút" thành "click Grafana mất 30 giây".
