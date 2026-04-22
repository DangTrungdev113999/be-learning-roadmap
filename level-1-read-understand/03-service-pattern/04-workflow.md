# Workflow làm việc với Service

## 6 bước bắt buộc

Mỗi khi làm việc với service (thêm function mới, sửa function cũ), bạn phải theo 6 bước này:

```
Bước 1: Đọc docs.md
    |
Bước 2: Tóm tắt cho người review -> CHỜ XÁC NHẬN
    |
Bước 3: Viết test trước (TDD)
    |
Bước 4: Implement function
    |
Bước 5: Chạy test + type check
    |
Bước 6: Cập nhật docs.md
```

---

### Bước 1: Đọc docs.md

```bash
# Đọc toàn bộ docs.md
cat app/Services/dateService/docs.md

# Hoặc chỉ đọc 1 function cụ thể
grep '### isTradingTime()' -A 15 app/Services/dateService/docs.md
```

Mục đích: hiểu function hiện tại làm gì, input/output là gì, có logic đặc biệt gì không.

### Bước 2: Tóm tắt và chờ xác nhận

Trước khi viết code, tóm tắt những gì bạn hiểu và những gì bạn định làm. Gửi cho người review (hoặc lead) để xác nhận.

Ví dụ: "Em đọc docs.md của dateService rồi. Function isTradingTime check giờ giao dịch theo 4 sàn (HOSE, HNX, UPCOM, VNF). Em cần thêm function isWeekend để check ngày cuối tuần. Function này đơn giản, chỉ cần check dayOfWeek = 0 hoặc 6. Anh confirm giúp."

**Tại sao phải chờ?** Vì hiểu sai requirements sẽ tốn nhiều thời gian hơn viết lại code.

### Bước 3: Viết test trước (TDD)

```typescript
// app/Services/dateService/libs/isWeekend.spec.ts
import { test } from '@japa/runner'
import { isWeekend } from './isWeekend'

test.group('isWeekend', () => {
  test('should return true on Saturday', async ({ assert }) => {
    const saturday = new Date('2024-12-14T10:00:00+07:00')
    assert.isTrue(isWeekend(saturday))
  })

  test('should return true on Sunday', async ({ assert }) => {
    const sunday = new Date('2024-12-15T10:00:00+07:00')
    assert.isTrue(isWeekend(sunday))
  })

  test('should return false on Monday', async ({ assert }) => {
    const monday = new Date('2024-12-16T10:00:00+07:00')
    assert.isFalse(isWeekend(monday))
  })

  test('should return false on Friday', async ({ assert }) => {
    const friday = new Date('2024-12-20T10:00:00+07:00')
    assert.isFalse(isWeekend(friday))
  })
})
```

Viết test trước giúp bạn:
- Làm rõ requirement trước khi code
- Có "lưới an toàn" khi implement
- Biết khi nào function "xong" (tất cả test pass)

### Bước 4: Implement function

```typescript
// app/Services/dateService/libs/isWeekend.ts
import moment from 'moment-timezone'
import { TIMEZONE } from '../constants'

/**
 * Check if the given date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = moment(date).tz(TIMEZONE).day()
  return day === 0 || day === 6
}
```

### Bước 5: Chạy test + type check

```bash
# Chạy test cho 1 function cụ thể
rm -f tests/run-failed-tests.json && node ace test unit \
  --files app/Services/dateService/libs/isWeekend.spec.ts

# Chạy test cho toàn bộ service
rm -f tests/run-failed-tests.json && find app/Services/dateService/libs \
  -name "*.spec.ts" -exec node ace test unit --files {} \;

# Type check toàn bộ dự án
yarn tsc --noEmit
```

> Ghi chú: Luôn xóa `tests/run-failed-tests.json` trước khi chạy test để tránh chạy lại test cũ đã fail.

### Bước 6: Cập nhật docs.md

Thêm section mới vào docs.md:

```markdown
### isWeekend()

- **Input**: `date: Date` - The date to check
- **Output**: `boolean`
- **Logic**:
  1. Convert date to Asia/Ho_Chi_Minh timezone
  2. Get day of week (0 = Sunday, 6 = Saturday)
  3. Return true if Saturday or Sunday
```

---

## Khi nào tạo service mới vs thêm vào service có sẵn?

### Thêm vào service có sẵn khi:

- Function liên quan đến cùng domain (ví dụ: thêm `isWeekend` vào `dateService`)
- Function cần dùng chung constants/types của service đó
- Function được gọi cùng với các function khác của service

### Tạo service mới khi:

- Domain hoàn toàn mới (ví dụ: tạo `emailService` khi chưa có)
- Không liên quan đến bất kỳ service nào hiện tại
- Service hiện tại đã quá lớn (> 10 functions)

---

## Danh sách 47 services trong dự án

Dưới đây là tất cả services hiện có. Dùng danh sách này để biết "function mình cần có thể đã tồn tại ở đâu":

| Service | Mô tả ngắn |
|---------|-----------|
| `aiTeamService` | Quản lý AI team và các model AI |
| `analysisService` | Phân tích cổ phiếu (chỉ số kỹ thuật, phân tích cơ bản) |
| `analyticsService` | Dashboard analytics và thống kê người dùng |
| `anthropicService` | Tích hợp API Anthropic (Claude) |
| `atxService` | Tích hợp sàn ATX |
| `banService` | Quản lý ban IP/user (in-memory cache + MongoDB) |
| `cacheService` | Quản lý cache (Redis/Memcached) |
| `cdnService` | Upload và quản lý file trên CDN (S3) |
| `contentService` | Quản lý nội dung (bài viết, tin tức) |
| `countService` | Atomic counter và sinh mã (MongoDB) |
| `dateService` | Utility ngày/giờ giao dịch |
| `deferService` | Xử lý tác vụ bị hoãn (deferred tasks) |
| `dupontService` | Phân tích DuPont (chỉ số tài chính) |
| `eventService` | Hệ thống event nội bộ (pub/sub) |
| `feedService` | Feed/bảng tin người dùng |
| `fscoreService` | Tính điểm F-Score (Piotroski) |
| `geminiService` | Tích hợp API Google Gemini |
| `grokService` | Tích hợp API Grok (xAI) |
| `kafkaService` | Message queue với Kafka |
| `kycService` | Xác thực danh tính người dùng (KYC) |
| `llmService` | Gateway chung cho các LLM (Anthropic, OpenAI, Gemini, Grok) |
| `lockService` | Distributed lock (tránh race condition) |
| `logCodeService` | Quản lý mã log và error codes |
| `loyaltyService` | Chương trình loyalty/điểm thưởng |
| `memcachedService` | Tích hợp Memcached |
| `metadataService` | Metadata và cấu hình hệ thống |
| `openaiService` | Tích hợp API OpenAI |
| `paymentNotificationService` | Thông báo thanh toán |
| `paymentService` | Xử lý thanh toán (VNPay, Momo, etc.) |
| `planService` | Quản lý gói dịch vụ (free, premium) |
| `portfolioService` | Quản lý danh mục đầu tư |
| `postService` | Quản lý bài đăng (tạo, sửa, xóa) |
| `qnaService` | Hỏi đáp (Q&A) |
| `referralService` | Hệ thống giới thiệu (referral code) |
| `reminderUpgradeService` | Nhắc nhở nâng cấp gói |
| `reviewService` | Đánh giá và review |
| `roomService` | Quản lý room chat |
| `s3Service` | Tương tác trực tiếp với AWS S3 |
| `scanWatchlistService` | Quét và theo dõi danh mục watchlist |
| `sectorService` | Phân tích ngành (sector analysis) |
| `socialService` | Tính năng xã hội (follow, like) |
| `stringService` | Xử lý chuỗi (format, sanitize) |
| `subscriptionService` | Quản lý subscription (đăng ký gói) |
| `syncService` | Đồng bộ dữ liệu giữa các hệ thống |
| `userService` | Quản lý người dùng (profile, settings) |
| `websocketService` | WebSocket real-time |
| `zscoreService` | Tính Z-Score (đo rủi ro phá sản) |

### Cách dùng danh sách này

Trước khi tạo function mới, tự hỏi: "Function này có nên nằm trong service nào đã có không?"

Ví dụ:
- Cần tính chỉ số tài chính? -> Xem `analysisService`, `dupontService`, `fscoreService`, `zscoreService`
- Cần gọi AI? -> Xem `llmService` (gateway chung) hoặc `anthropicService`, `openaiService`, `geminiService` (trực tiếp)
- Cần cache? -> Xem `cacheService`, `memcachedService`
- Cần xử lý thanh toán? -> Xem `paymentService`, `subscriptionService`, `planService`

---

## Tổng kết

```
Workflow = 6 bước có thứ tự

1. Đọc docs.md        -- hiểu trước khi làm
2. Tóm tắt + xác nhận -- tránh hiểu sai
3. Viết test trước    -- làm rõ requirement
4. Implement          -- viết code
5. Chạy test          -- đảm bảo đúng
6. Cập nhật docs.md   -- giữ tài liệu sống

Quy tắc vàng: đọc docs.md TRƯỚC, viết test TRƯỚC code.
```
