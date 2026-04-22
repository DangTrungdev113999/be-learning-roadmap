# Bài tập: Monitoring & Observability

## Bài 1: Thiết kế Metrics cho API

### Đề bài

Logics có các API endpoint sau:
- `POST /api/plans/verify-google` -- Xác thực thanh toán Google
- `POST /api/plans/verify-apple` -- Xác thực thanh toán Apple
- `GET /api/stocks/overview` -- Lấy tổng quan cổ phiếu
- `POST /api/alerts/create` -- Tạo cảnh báo giá
- `POST /api/users/login` -- Đăng nhập

**Yêu cầu:**
1. Liệt kê tất cả Prometheus metrics cần thiết (Counter, Gauge, Histogram). Mỗi metric ghi rõ:
   - Tên metric (theo naming convention)
   - Loại (Counter/Gauge/Histogram)
   - Labels
   - Mục đích
2. Với endpoint thanh toán (`verify-google`, `verify-apple`), cần thêm business metrics gì ngoài HTTP metrics chuẩn?
3. Chọn histogram buckets phù hợp cho `http_request_duration_seconds`. Giải thích tại sao chọn các giá trị đó.

### Gợi ý
- 4 Golden Signals: Latency, Traffic, Errors, Saturation
- Nghĩ về cả technical metrics (latency, error rate) và business metrics (payment success rate)
- Xem lại `RateLimitMiddleware.build('/api/stocks/overview', 'ip', 10, 1)` -- rate limit cũng nên có metric

---

## Bài 2: Viết Alert Rules

### Đề bài

Viết Prometheus alert rules (YAML format) cho các tình huống sau:

1. **Error rate cao**: Tỷ lệ HTTP 5xx > 2% trong 5 phút liên tục
2. **Thanh toán lỗi**: Hơn 3 thanh toán thất bại trong 5 phút
3. **Slow queries**: P95 latency của MongoDB queries > 1 giây trong 10 phút
4. **Rate limit storm**: Hơn 50 rate limit exceeded events trong 1 phút (có thể đang bị tấn công)
5. **Memory leak**: Memory usage tăng liên tục > 5% mỗi giờ trong 3 giờ

Với mỗi alert, ghi rõ:
- Alert name
- PromQL expression
- `for` duration
- Severity level (info/warning/critical/fatal)
- Gửi qua kênh nào (Slack channel/PagerDuty/email)
- Runbook: 2-3 bước hành động cụ thể

### Gợi ý
- Dùng `rate()` cho counter, so sánh trực tiếp cho gauge
- `for` duration tránh false alarm nhưng không quá lâu
- Severity quyết định kênh gửi

---

## Bài 3: Viết Postmortem

### Đề bài

Viết postmortem cho tình huống giả định sau:

**Tình huống:** Lúc 9h sáng thứ Hai (giờ mở cửa thị trường chứng khoán), API `/api/stocks/overview` bắt đầu trả response chậm (P95 từ 100ms tăng lên 8 giây). Sau 20 phút, MongoDB connections cạn (500/500), tất cả API bắt đầu trả 503. Team phát hiện qua Slack group khi user phàn nàn (không có alert tự động). Sau 45 phút, team tìm ra nguyên nhân: một cronjob chạy aggregation trên collection `analysisEvents` (100M+ documents) thiếu index, trùng đúng giờ peak traffic.

**Yêu cầu:** Viết postmortem theo template đã học, gồm đủ:
1. Tóm tắt (severity, thời gian ảnh hưởng, số user ảnh hưởng)
2. Timeline chi tiết (mốc thời gian cụ thể)
3. Root cause analysis (tại sao cronjob lại gây vấn đề?)
4. Lessons learned (đã làm tốt, cần cải thiện)
5. Action items (ít nhất 5 hành động cụ thể với deadline)

### Gợi ý
- Tham khảo commit thật: `fix(analytics): reduce max date range from 365 to 60 days`
- Postmortem blameless -- không đổ lỗi cá nhân
- Action items phải SMART: cụ thể, đo được, có deadline

---

## Bài 4: Xác định Monitoring Gaps

### Đề bài

Dưới đây là các đoạn code thật từ Logics. Phân tích và chỉ ra monitoring gaps (thiếu sót trong giám sát).

**Đoạn 1: RateLimit Middleware**
```ts
export default {
  build: function (keyPrefix: string, uniqueKey: string, points: number, duration: number) {
    const rateLimiterRedis = new RateLimiterRedis({
      storeClient: pubclient,
      points,
      duration,
      keyPrefix,
    })

    return async (ctx: HttpContextContract, next: () => void) => {
      if (uniqueKey === 'ip') {
        const ip = ctx?.request.ip()
        try {
          await rateLimiterRedis.consume(ip)
        } catch (error) {
          log.error({ error, keyPrefix, uniqueKey, ip }, 'ERROR rate limit ip')
          ctx?.response.json({ error: { code: responseCodes.REQUEST_LIMIT_EXCEEDED } })
          return
        }
        await next()
        return
      }
      // ...
    }
  },
}
```

**Đoạn 2: Payment verification**
```ts
const log = Logger.child({ tags: ['planService.verifyGooglePurchase'] })

// ... trong hàm verifyGooglePurchase:
log.info({ requestData }, 'Start')
const response = await callGoogleAPI(requestData)
log.info({ data, paymentState }, 'Google purchase data')
// ... xử lý
log.info({ res }, 'Transaction completed')
```

**Đoạn 3: MongoDB connection**
```ts
const log = Logger.child({ tags: ['MONGO'] })
// Connection setup, không có health check periodic
```

**Yêu cầu:** Với mỗi đoạn code, liệt kê:
1. Monitoring hiện có (đã track gì?)
2. Monitoring thiếu (nên track thêm gì?)
3. Đề xuất cụ thể: metric nào, log gì thêm, alert nào?

### Gợi ý
- RateLimit: có log error nhưng có đếm bao nhiêu lần bị rate limit không?
- Payment: có log nhưng có đo thời gian gọi Google API không?
- MongoDB: có log connect nhưng có monitor connection pool không?

---

## Bài 5: Thiết kế Observability cho tính năng mới

### Đề bài

Team sắp xây tính năng "Analytics Dashboard" cho admin. Tính năng này:
- Nhận event từ mobile app qua API
- Lưu vào MongoDB collection `analysisEvents` (dự kiến 100M+ rows)
- Admin xem dashboard với aggregation queries phức tạp
- Có thể filter theo date range, event type, user segment

**Yêu cầu:** Thiết kế observability plan gồm:

1. **Logs**: Liệt kê 5 log statements cần có (level, tags, data, message)
2. **Metrics**: Liệt kê 5 Prometheus metrics (tên, loại, labels)
3. **Alerts**: Viết 3 alert rules quan trọng nhất
4. **Dashboard**: Vẽ layout dashboard giám sát (dạng ASCII art)
5. **Capacity planning**: Ước tính storage cần thiết cho logs và metrics sau 1 năm

### Gợi ý
- Collection 100M+ rows = cần monitor query performance rất kỹ
- Date range filter = cần giới hạn (tham khảo: `reduce max date range from 365 to 60 days`)
- Mobile app gửi event = cần track ingestion rate, event processing lag
- Admin queries = ít request nhưng nặng -> cần track riêng
