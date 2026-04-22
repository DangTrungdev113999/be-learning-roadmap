# Alerting: Cảnh báo thông minh

## Mục tiêu

Hiểu cách thiết kế hệ thống cảnh báo hiệu quả -- đủ nhạy để phát hiện sự cố, không quá nhiều để gây alert fatigue.

---

## Tại sao cần alerting?

```
Không có alerting:
  Lỗi xảy ra lúc 2h sáng -> Không ai biết -> User phát hiện sáng hôm sau
  -> Phàn nàn trên app store -> Team mới biết -> Sửa lúc 10h sáng
  -> 8 tiếng downtime, mất uy tín

Có alerting:
  Lỗi xảy ra lúc 2h sáng -> Alert gửi qua Slack/PagerDuty
  -> On-call engineer nhận -> Sửa trong 30 phút
  -> 30 phút downtime, user hầu như không biết
```

---

## Alert Levels -- Mức độ nghiêm trọng

### Phân loại 4 mức

| Level | Ý nghĩa | Hành động | Kênh thông báo | Thời gian phản hồi |
|-------|---------|-----------|----------------|---------------------|
| **INFO** | Đáng biết, không cần hành động | Xem khi rảnh | Log, dashboard | -- |
| **WARNING** | Bất thường, có thể thành sự cố | Kiểm tra trong giờ làm | Slack channel | < 4 giờ |
| **CRITICAL** | Ảnh hưởng đến user, cần xử lý | Dừng việc hiện tại | Slack + mention | < 30 phút |
| **FATAL** | Hệ thống ngừng hoạt động | Gọi điện/escalate | PagerDuty + call | < 5 phút |

### Ví dụ cho Logics

```yaml
# INFO: Ghi nhận, không cần hành động
- alert: HighTrafficPeriod
  condition: request_rate > 1000/s
  message: "Lưu lượng cao bất thường, có thể do sự kiện thị trường"
  level: info

# WARNING: Cần để ý trong ngày
- alert: HighMemoryUsage
  condition: memory_usage > 80%
  for: 10m
  message: "RAM đang dùng > 80% trong 10 phút"
  level: warning

# CRITICAL: Cần xử lý ngay
- alert: PaymentFailureRateHigh
  condition: payment_error_rate > 5%
  for: 5m
  message: "Tỷ lệ thanh toán lỗi > 5% trong 5 phút"
  level: critical

# FATAL: Khẩn cấp
- alert: DatabaseDown
  condition: mongodb_up == 0
  for: 1m
  message: "MongoDB không thể kết nối trong 1 phút"
  level: fatal
```

---

## Alert Routing -- Gửi alert đi đâu?

### Kênh thông báo

```
┌──────────────────────────────────────────────────────────┐
│                    Alert Router                          │
│                                                          │
│  INFO ──────────> #monitoring-info (Slack)                │
│                   Chỉ log, đọc khi cần                   │
│                                                          │
│  WARNING ──────> #monitoring-warnings (Slack)             │
│                   Team review trong standup               │
│                                                          │
│  CRITICAL ─────> #incidents (Slack) + @oncall             │
│                   Mention người trực, cần response        │
│                                                          │
│  FATAL ────────> PagerDuty -> Phone call                  │
│                   Gọi điện cho on-call engineer            │
│                   Nếu không trả lời -> escalate lên lead  │
└──────────────────────────────────────────────────────────┘
```

### Routing rules thực tế

```yaml
routes:
  # Lỗi thanh toán -> team payment
  - match:
      service: planService
      level: critical
    receivers: [slack-payments, oncall-backend]

  # Lỗi infrastructure -> team devops
  - match:
      category: infrastructure
      level: [critical, fatal]
    receivers: [slack-infra, pagerduty-devops]

  # Lỗi API chung -> team backend
  - match:
      category: api
      level: warning
    receivers: [slack-backend]
```

### Slack webhook trong thực tế

Logics đã sử dụng webhook để gửi thông báo. Pattern tương tự có thể áp dụng cho alerting:

```ts
// Gửi alert qua Slack webhook
async function sendAlert(level: string, message: string, data: object) {
  const color = {
    info: '#36a64f',      // xanh lá
    warning: '#ffcc00',   // vàng
    critical: '#ff6600',  // cam
    fatal: '#ff0000',     // đỏ
  }

  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify({
      attachments: [{
        color: color[level],
        title: `[${level.toUpperCase()}] ${message}`,
        fields: Object.entries(data).map(([k, v]) => ({
          title: k,
          value: String(v),
          short: true,
        })),
        ts: Math.floor(Date.now() / 1000),
      }],
    }),
  })
}
```

---

## Alert Fatigue -- Khi alert quá nhiều

### Vấn đề

```
Ngày 1:   50 alerts  -> Team đọc hết, xử lý nghiêm túc
Ngày 7:   50 alerts  -> "Lại cái này à, chắc false alarm"
Ngày 30:  50 alerts  -> Team bắt đầu ignore alerts
Ngày 60:  50 alerts  -> Alert thật bị bỏ qua -> Incident lớn
```

Đây gọi là **alert fatigue** -- "chó sói kêu quá nhiều lần". Là nguyên nhân số 1 khiến hệ thống monitoring thất bại.

### Nguyên tắc chống alert fatigue

#### 1. Mỗi alert phải có hành động cụ thể (actionable)

```yaml
# XẤU: Alert không có hành động
- alert: HighCPU
  message: "CPU cao"
  # Rồi sao? Làm gì?

# TỐT: Alert có hướng dẫn
- alert: HighCPU
  message: "CPU > 90% trong 10 phút"
  runbook: |
    1. Kiểm tra top processes: `top -o cpu`
    2. Nếu do MongoDB: kiểm tra slow queries
    3. Nếu do Node.js: kiểm tra memory leak
    4. Nếu traffic tăng: scale thêm instance
```

#### 2. Có threshold hợp lý và `for` duration

```yaml
# XẤU: Alert quá nhạy
- alert: HighLatency
  condition: latency > 100ms     # Quá thấp, spike 1 giây cũng alert
  # Kết quả: 50 alerts/ngày, toàn false alarm

# TỐT: Có buffer
- alert: HighLatency
  condition: p95_latency > 500ms
  for: 5m                        # Phải kéo dài 5 phút mới alert
  # Kết quả: Chỉ alert khi thực sự có vấn đề
```

#### 3. Grouping và deduplication

```yaml
# XẤU: Mỗi request lỗi = 1 alert
# -> 500 lỗi = 500 notifications

# TỐT: Group alerts
group_by: [service, endpoint]
group_wait: 30s          # Đợi 30s gom alerts cùng nhóm
group_interval: 5m       # Gửi tóm tắt mỗi 5 phút
repeat_interval: 4h      # Không nhắc lại trong 4 giờ nếu chưa resolved
```

#### 4. Tắt alert đã biết (silence/inhibit)

```yaml
# Đang deploy, biết sẽ có downtime ngắn
silences:
  - match: { service: "api" }
    startsAt: "2026-03-18T14:00:00"
    endsAt: "2026-03-18T14:30:00"
    comment: "Scheduled deployment"

# Nếu DB down thì không cần alert API error (vì chắc chắn lỗi)
inhibit_rules:
  - source_match: { alert: "DatabaseDown" }
    target_match: { alert: "APIErrorRateHigh" }
```

---

## Thiết kế alert cho Logics

### Các alert nên có

```yaml
# === Business metrics ===
- alert: PaymentFailureSpike
  condition: rate(payment_errors_total[5m]) > 5
  for: 3m
  level: critical
  message: "Thanh toán lỗi tăng đột biến"

- alert: NoNewRegistrations
  condition: rate(user_registrations_total[1h]) == 0
  for: 2h
  level: warning
  message: "Không có user mới đăng ký trong 2 giờ (giờ làm việc)"

# === Infrastructure ===
- alert: MongoDBSlowQueries
  condition: rate(mongo_slow_queries_total[5m]) > 10
  for: 5m
  level: warning
  message: "MongoDB có nhiều slow query"

- alert: RedisHighMemory
  condition: redis_memory_used_percent > 85
  for: 10m
  level: warning
  message: "Redis memory > 85%"

- alert: HighErrorRate
  condition: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
  for: 5m
  level: critical
  message: "Error rate > 1%"

# === Rate limiting ===
- alert: RateLimitTriggeredHigh
  condition: rate(rate_limit_exceeded_total[5m]) > 100
  for: 5m
  level: warning
  message: "Rate limit bị trigger nhiều - có thể đang bị tấn công"
```

---

## Quy tắc vàng khi thiết kế alert

```
1. Mỗi alert phải đánh thức ai đó lúc 3 giờ sáng?
   -> Nếu KHÔNG -> Hạ xuống warning hoặc info
   -> Nếu CÓ -> Giữ critical/fatal

2. Ai nhận alert phải làm gì?
   -> Nếu KHÔNG BIẾT -> Viết runbook trước khi tạo alert
   -> Nếu BIẾT -> Ghi hành động vào alert description

3. Alert có thường xuyên false alarm?
   -> Nếu CÓ -> Tăng threshold, tăng `for` duration
   -> Nếu KHÔNG -> Giữ nguyên

4. Alert có bị ignore?
   -> Nếu CÓ -> Xóa hoặc sửa lại
   -> Alert bị ignore nguy hiểm hơn không có alert
```

---

## Điểm chính cần nhớ

1. **4 mức alert**: INFO (biết), WARNING (để ý), CRITICAL (xử lý ngay), FATAL (khẩn cấp).
2. **Route** đúng kênh: Slack cho warning, PagerDuty + call cho fatal.
3. **Alert fatigue** là kẻ thù lớn nhất -- mỗi alert phải actionable, có runbook.
4. Dùng `for` duration để tránh false alarm từ spike ngắn.
5. **Grouping** và **deduplication** giảm noise đáng kể.
6. Quy tắc: "Nếu alert không đáng đánh thức ai lúc 3h sáng, nó không phải critical."
