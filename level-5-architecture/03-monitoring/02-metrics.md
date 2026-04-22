# Metrics: Đo lường sức khỏe hệ thống

## Mục tiêu

Hiểu 4 Golden Signals của Google SRE, các loại metric trong Prometheus, và cách áp dụng để đo lường API backend.

---

## 4 Golden Signals

Google SRE (Site Reliability Engineering) định nghĩa 4 tín hiệu vàng -- nếu chỉ đo được 4 thứ, hãy đo 4 thứ này.

### So sánh với FE

| Signal | FE tương đương | BE |
|--------|---------------|-----|
| **Latency** | Time to Interactive, First Contentful Paint | API response time |
| **Traffic** | Page views, button clicks | Requests per second |
| **Errors** | JS errors (Sentry), failed API calls | 5xx responses, exceptions |
| **Saturation** | Memory usage (tab crash), CPU throttling | CPU, RAM, disk, DB connections |

---

### 1. Latency -- Độ trễ

Thời gian xử lý một request, từ lúc nhận đến lúc trả response.

```
Phân biệt hai loại latency:

Successful requests:   P50 = 50ms,  P95 = 200ms,  P99 = 500ms
Failed requests:       P50 = 5ms,   P95 = 10ms,   P99 = 15ms
                       ↑ Lỗi thường trả về nhanh (return sớm)
```

**Tại sao dùng percentile (P50, P95, P99) thay vì average?**

```
Ví dụ 10 requests (ms): 50, 55, 48, 52, 51, 49, 53, 50, 52, 5000

Average = 546ms   -> Trông có vẻ ổn? KHÔNG!
P50     = 51ms    -> 50% requests xong trong 51ms (median)
P95     = 5000ms  -> 5% requests mất 5 giây! Đây là vấn đề.
P99     = 5000ms  -> 1% tệ nhất
```

Average bị 1 outlier kéo lệch. Percentile cho thấy bức tranh thật.

**Ví dụ cho Logics:**
```
# Đo latency của API thanh toán
http_request_duration_seconds{
  method="POST",
  endpoint="/api/plans/verify-google",
  status="200"
}

# Alert nếu P95 > 2 giây
ALERT: P95 latency /api/plans/verify-google > 2s trong 5 phút
```

---

### 2. Traffic -- Lưu lượng

Đo "hệ thống đang bận cỡ nào".

```
# Requests per second (RPS) theo endpoint
http_requests_total{method="POST", endpoint="/api/alerts/create"}  -> 150 req/s
http_requests_total{method="GET",  endpoint="/api/stocks/overview"} -> 2000 req/s

# Traffic theo loại user
http_requests_total{user_type="free"}    -> 8000 req/s
http_requests_total{user_type="premium"} -> 2000 req/s
```

**Tại sao quan trọng?**
- Biết peak hours (giờ giao dịch chứng khoán 9h-11h30, 13h-15h)
- Capacity planning: cần bao nhiêu server cho traffic hiện tại?
- Phát hiện bất thường: traffic đột ngột tăng 10x = có thể bị DDoS

---

### 3. Errors -- Tỷ lệ lỗi

Phần trăm request thất bại.

```
# Error rate = errors / total requests
error_rate = http_requests_total{status=~"5.."} / http_requests_total

# Phân loại lỗi
http_errors_total{status="500", endpoint="/api/plans/verify-google"} -> Server error
http_errors_total{status="429", endpoint="/api/stocks/overview"}     -> Rate limited
http_errors_total{status="401", endpoint="/api/users/profile"}       -> Unauthorized
```

**Ngưỡng thường dùng:**
- < 0.1%: Tốt
- 0.1% - 1%: Cần theo dõi
- 1% - 5%: Cần xử lý
- \> 5%: Khẩn cấp

**Lưu ý:** 4xx (client error) và 5xx (server error) cần track riêng. 4xx cao có thể do bug ở FE hoặc do ai đó đang tấn công API.

---

### 4. Saturation -- Mức độ bão hòa

Hệ thống đang dùng bao nhiêu % tài nguyên.

```
# CPU usage
node_cpu_usage_percent -> 75%    # Cảnh báo ở 80%

# Memory usage
node_memory_usage_bytes -> 3.2GB / 4GB (80%)

# MongoDB connections
mongodb_connections_current -> 450 / 500 (90%)  # Sắp hết!

# Redis memory
redis_memory_used_bytes -> 2.1GB / 4GB (52.5%)

# Disk space
node_disk_usage_percent -> 85%   # Cần dọn logs cũ
```

**So sánh FE:** Giống như khi bạn mở Task Manager thấy Chrome dùng 90% RAM -- bạn biết sắp crash. BE cũng vậy nhưng với nhiều tài nguyên hơn.

---

## Prometheus Metric Types

Prometheus là hệ thống metrics phổ biến nhất. Nó định nghĩa 4 kiểu metric.

### 1. Counter -- Bộ đếm (chỉ tăng)

Giá trị chỉ tăng, không bao giờ giảm. Reset khi restart service.

```
# Đếm tổng số requests
http_requests_total                        -> 1,234,567

# Đếm số lỗi thanh toán
payment_errors_total{provider="google"}    -> 42
payment_errors_total{provider="apple"}     -> 15

# Đếm số user đăng ký
user_registrations_total                   -> 50,230
```

**Dùng khi nào:** Đếm sự kiện tích lũy. Để tính rate (tốc độ), dùng hàm `rate()`:
```
# Requests per second trong 5 phút gần nhất
rate(http_requests_total[5m])  -> 150 req/s
```

**So sánh FE:** Giống `let clickCount = 0; onClick(() => clickCount++)` -- chỉ tăng, không giảm.

---

### 2. Gauge -- Đồng hồ đo (tăng/giảm)

Giá trị có thể tăng hoặc giảm bất kỳ lúc nào. Đo trạng thái hiện tại.

```
# Số user đang online
active_users_current                -> 1,523

# Số jobs đang chờ trong queue
queue_pending_jobs                  -> 47

# Nhiệt độ CPU
cpu_temperature_celsius             -> 72.5

# Dung lượng trống
disk_free_bytes                     -> 50_000_000_000
```

**Dùng khi nào:** Đo snapshot trạng thái hiện tại -- cái gì lên xuống liên tục.

**So sánh FE:** Giống `useState(0)` -- giá trị thay đổi liên tục theo thời gian.

---

### 3. Histogram -- Phân bổ giá trị

Đo phân phối của các giá trị (thường là latency). Tự động tính percentile.

```
# Đo response time, chia vào các bucket
http_request_duration_seconds_bucket{le="0.05"}  -> 8000   (≤ 50ms)
http_request_duration_seconds_bucket{le="0.1"}   -> 9500   (≤ 100ms)
http_request_duration_seconds_bucket{le="0.5"}   -> 9800   (≤ 500ms)
http_request_duration_seconds_bucket{le="1.0"}   -> 9900   (≤ 1s)
http_request_duration_seconds_bucket{le="+Inf"}  -> 10000  (tất cả)

# Tính P95 từ histogram
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
-> 0.18  (P95 = 180ms)
```

**Dùng khi nào:** Đo latency, request size, hoặc bất kỳ giá trị nào cần biết phân bổ.

**So sánh FE:** Giống Lighthouse score distribution -- không chỉ biết trung bình mà còn biết bao nhiêu % nhanh, bao nhiêu % chậm.

---

### 4. Summary -- Tóm tắt (giống Histogram)

Tương tự Histogram nhưng tính percentile ở client thay vì server.

```
# Tính sẵn P50, P90, P99
http_request_duration_seconds{quantile="0.5"}   -> 0.05   (50ms)
http_request_duration_seconds{quantile="0.9"}   -> 0.15   (150ms)
http_request_duration_seconds{quantile="0.99"}  -> 0.45   (450ms)
```

**Histogram vs Summary:**
| Tiêu chí | Histogram | Summary |
|-----------|-----------|---------|
| Tính percentile | Ở server (khi query) | Ở client (khi push) |
| Có thể aggregate | Có (cộng buckets) | Không |
| Chính xác | Xấp xỉ (phụ thuộc buckets) | Chính xác |
| Phổ biến hơn | Phổ biến hơn | Ít dùng |

**Khuyến nghị:** Dùng Histogram trong hầu hết trường hợp.

---

## Ví dụ thực tế: Metrics cho Logics

Nếu thêm Prometheus vào Logics, đây là các metrics nên có:

```ts
// === Counter ===
// Đếm requests theo endpoint và status
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'endpoint', 'status'],
})

// Đếm thanh toán thành công/thất bại
const paymentTotal = new Counter({
  name: 'payment_total',
  help: 'Total payment attempts',
  labelNames: ['provider', 'result'],  // provider: google/apple, result: success/fail
})

// === Gauge ===
// Số WebSocket connections hiện tại
const wsConnectionsCurrent = new Gauge({
  name: 'ws_connections_current',
  help: 'Current WebSocket connections',
})

// Số user active trong 5 phút
const activeUsers = new Gauge({
  name: 'active_users_5m',
  help: 'Active users in last 5 minutes',
})

// === Histogram ===
// Response time theo endpoint
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
})

// Query time của MongoDB
const mongoQueryDuration = new Histogram({
  name: 'mongo_query_duration_seconds',
  help: 'MongoDB query duration',
  labelNames: ['collection', 'operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
})
```

### Dashboard layout cho Grafana

```
┌─────────────────────────┬─────────────────────────┐
│   Request Rate (RPS)    │   Error Rate (%)        │
│   [line chart]          │   [line chart]          │
├─────────────────────────┼─────────────────────────┤
│   P95 Latency (ms)     │   Active Users          │
│   [line chart]          │   [gauge]               │
├─────────────────────────┼─────────────────────────┤
│   CPU / Memory Usage    │   MongoDB Connections   │
│   [area chart]          │   [gauge]               │
├─────────────────────────┼─────────────────────────┤
│   Top 10 Slowest APIs   │   Payment Success Rate  │
│   [table]               │   [pie chart]           │
└─────────────────────────┴─────────────────────────┘
```

---

## Naming conventions cho metrics

```
# Format: <namespace>_<name>_<unit>
# Unit luôn ở cuối, dùng base unit (seconds, bytes, không phải ms, KB)

# Tốt
http_request_duration_seconds
http_response_size_bytes
payment_processing_total

# Không tốt
http_request_duration_ms          # Dùng seconds, không phải ms
httpRequestDuration               # Dùng snake_case, không phải camelCase
request_count                     # Thiếu namespace, quá chung chung
```

---

## Điểm chính cần nhớ

1. **4 Golden Signals**: Latency (nhanh chậm), Traffic (bận rỗi), Errors (lỗi), Saturation (tài nguyên).
2. **Counter** chỉ tăng (đếm events), **Gauge** tăng giảm (đo trạng thái hiện tại).
3. **Histogram** đo phân bổ latency, cho phép tính percentile (P50, P95, P99).
4. Dùng **percentile** thay vì average -- average ẩn đi những trường hợp tệ nhất.
5. Logics hiện chưa có metrics -- bước đầu tiên nên thêm Counter cho requests và Histogram cho latency.
6. Metrics giống "đồng hồ taplo ô tô" -- nhìn nhanh biết ngay xe (hệ thống) có ổn không.
