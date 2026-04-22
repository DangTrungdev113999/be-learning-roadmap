# Rate Limiting: Giới hạn tần suất request

## Mục tiêu

Hiểu tại sao cần rate limiting, cách Logics triển khai RateLimitMiddleware với Redis, và các chiến lược rate limit khác nhau.

---

## Tại sao cần Rate Limiting?

### Các mối đe dọa

```
1. DDoS Attack (Distributed Denial of Service):
   Hàng triệu request/giây -> Server quá tải -> Sập

2. Brute Force:
   Thử hàng nghìn password cho 1 account
   POST /login { email: "admin@logics.vn", password: "123456" }
   POST /login { email: "admin@logics.vn", password: "password" }
   POST /login { email: "admin@logics.vn", password: "admin123" }
   ... lặp 10,000 lần

3. Scraping:
   Bot tự động crawl tất cả data từ API
   GET /api/stocks/overview?page=1
   GET /api/stocks/overview?page=2
   ... lặp 10,000 lần

4. Abuse:
   1 user gọi API liên tục, ảnh hưởng performance cho user khác
```

### So sánh FE

```
FE rate limiting (client-side):
  - Debounce search input (đợi 300ms sau khi gõ)
  - Disable button sau khi click (chống double-submit)
  - Throttle scroll event handler
  -> Chỉ để UX tốt hơn, KHÔNG bảo mật (user bypass được)

BE rate limiting (server-side):
  - Đếm request từ mỗi IP/user
  - Từ chối nếu vượt giới hạn
  - Trả HTTP 429 Too Many Requests
  -> Bảo mật thật sự, user KHÔNG bypass được
```

---

## RateLimitMiddleware trong Logics

### Code thật

```ts
// app/Middleware/RateLimit.ts
import { RateLimiterRedis } from 'rate-limiter-flexible'
import { pubclient } from 'Redis/index'

const log = Logger.child({ tags: ['middleware.rateLimit'] })

export default {
  build: function (keyPrefix: string, uniqueKey: string, points: number, duration: number) {
    //              |               |              |             |
    //              endpoint path   theo gì       số request    trong bao nhiêu giây
    //                              (ip/userId)   cho phép

    const rateLimiterRedis = new RateLimiterRedis({
      storeClient: pubclient,     // Redis client
      points,                      // Số "điểm" (requests) cho phép
      duration,                    // Trong bao nhiêu giây
      execEvenly: false,           // Không delay, từ chối ngay
      blockDuration: 0,            // Không block thêm sau khi hết điểm
      keyPrefix,                   // Phân biệt giữa các limiter
    })

    return async (ctx, next) => {
      // ... kiểm tra và consume points
    }
  },
}
```

### Cách dùng trong routes

```ts
// routes/alerts.ts
import RateLimitMiddleware from '../app/Middleware/RateLimit'

Route.group(() => {
  Route.post('/code', 'AlertsController.code').middleware([
    RateLimitMiddleware.build('/api/alerts/code', 'userId', 10, 1),
    //                        endpoint           theo     10 req / 1 giây
  ])

  Route.post('/create', 'AlertsController.create').middleware([
    RateLimitMiddleware.build('/api/alerts/create', 'userId', 10, 1),
  ])
})

// routes/stocks.ts
Route.group(() => {
  Route.get('/overview', 'StocksController.overview').middleware([
    RateLimitMiddleware.build('/api/stocks/overview', 'ip', 10, 1),
    //                                                 theo IP (vì không cần login)
  ])
})
```

### Ba chiến lược rate limit

#### 1. Per IP (`uniqueKey: 'ip'`)

```ts
RateLimitMiddleware.build('/api/stocks/overview', 'ip', 10, 1)
// Mỗi IP: tối đa 10 requests/giây

// Dùng cho: API public không cần đăng nhập
// Ưu điểm: Chặn bot, DDoS từ 1 IP
// Nhược điểm: Nhiều user cùng IP (NAT, công ty) bị ảnh hưởng chung
```

#### 2. Per User (`uniqueKey: 'userId'`)

```ts
RateLimitMiddleware.build('/api/alerts/create', 'userId', 10, 1)
// Mỗi user: tối đa 10 requests/giây

// Dùng cho: API cần đăng nhập
// Ưu điểm: Chính xác, không ảnh hưởng user khác
// Nhược điểm: Attacker tạo nhiều account để bypass
```

#### 3. Global (`uniqueKey: ''`)

```ts
RateLimitMiddleware.build('/api/heavy-report', '', 100, 60)
// Tổng tất cả requests: tối đa 100/60 giây

// Dùng cho: API tốn tài nguyên, muốn giới hạn tổng tải
// Ưu điểm: Bảo vệ server khỏi quá tải
// Nhược điểm: User hợp lệ có thể bị ảnh hưởng khi traffic cao
```

---

## Rate Limiting hoạt động thế nào?

### Thuật toán: Token Bucket (rate-limiter-flexible dùng)

```
Hình dung: Xô chứa token

1. Xô có 10 token (points = 10)
2. Mỗi request tiêu 1 token
3. Mỗi giây (duration = 1), xô được đổ đầy lại 10 token

Timeline:
  t=0.0s: Xô có 10 token
  t=0.1s: Request 1  -> 9 token còn lại -> OK
  t=0.2s: Request 2  -> 8 token -> OK
  ...
  t=0.9s: Request 10 -> 0 token -> OK
  t=0.95s: Request 11 -> 0 token -> REJECTED (429)
  t=1.0s: Xô refill -> 10 token lại
  t=1.1s: Request 12 -> 9 token -> OK
```

### Redis lưu trữ rate limit state

```
Redis Key: /api/stocks/overview_192.168.1.1
Redis Value: { points: 7, expire: 1742300001 }
              (đã dùng 7/10 points, reset lúc timestamp này)

Tại sao Redis?
- Nhanh (in-memory)
- Chia sẻ giữa nhiều server instances
- Tự động expire (TTL)
- Atomic operations (không race condition)
```

### Flow xử lý request

```
Request đến
    ↓
RateLimitMiddleware
    ↓
Redis: INCR key, check points
    ↓
Points còn?  ──YES──> next() -> Controller -> Response 200
    ↓
    NO
    ↓
log.error({ keyPrefix, uniqueKey, ip }, 'ERROR rate limit')
    ↓
Response: { error: { code: REQUEST_LIMIT_EXCEEDED } }
```

---

## Cấu hình Rate Limit phổ biến

### Theo loại API

```ts
// Public APIs (không cần login) - Strict
RateLimitMiddleware.build('/api/stocks/overview', 'ip', 10, 1)     // 10 req/s per IP
RateLimitMiddleware.build('/api/stocks/correlation', 'ip', 10, 1)  // 10 req/s per IP

// User APIs (cần login) - Moderate
RateLimitMiddleware.build('/api/alerts/create', 'userId', 10, 1)   // 10 req/s per user
RateLimitMiddleware.build('/api/alerts/delete', 'userId', 10, 1)   // 10 req/s per user

// Auth APIs (login/register) - Very strict
// Nên dùng: 5 requests / 60 giây per IP (chống brute force)
RateLimitMiddleware.build('/api/auth/login', 'ip', 5, 60)
RateLimitMiddleware.build('/api/auth/register', 'ip', 3, 60)

// Heavy APIs (report, export) - Very strict
RateLimitMiddleware.build('/api/reports/generate', 'userId', 2, 60) // 2 req/phút
```

### Rate limit headers (best practice)

```
Khi trả response, nên include headers để client biết:

X-RateLimit-Limit: 10          // Giới hạn tối đa
X-RateLimit-Remaining: 7       // Còn lại bao nhiêu
X-RateLimit-Reset: 1742300060  // Khi nào reset (Unix timestamp)
Retry-After: 30                // Chờ bao lâu nếu bị limit (giây)

FE có thể dùng headers này để:
- Hiển thị "Bạn đã gửi quá nhiều request, vui lòng đợi 30 giây"
- Tự throttle requests khi Remaining gần 0
```

---

## Chiến lược nâng cao

### 1. Sliding Window

```
Fixed Window (Logics đang dùng):
  Window 1: 00:00 - 00:01 -> 10 requests OK
  Window 2: 00:01 - 00:02 -> 10 requests OK
  Vấn đề: 10 req lúc 00:00:59 + 10 req lúc 00:01:01 = 20 req trong 2 giây!

Sliding Window (chính xác hơn):
  Tính dựa trên 1 giây gần nhất (sliding)
  -> Luôn đúng 10 req/giây, không có burst ở biên window
```

### 2. Exponential Backoff

```ts
// Nếu bị rate limit, block lâu hơn mỗi lần tiếp theo
// Lần 1: block 1 phút
// Lần 2: block 5 phút
// Lần 3: block 30 phút
// Lần 4: block 24 giờ

// Hữu ích cho brute force prevention
const rateLimiter = new RateLimiterRedis({
  storeClient: pubclient,
  points: 5,
  duration: 60,
  blockDuration: 60 * 5,  // Block 5 phút sau khi hết points
})
```

### 3. Differentiated Rate Limits

```ts
// Free users: 100 req/phút
// Premium users: 1000 req/phút
// Admin: unlimited

async function dynamicRateLimit(ctx, next) {
  const user = ctx.auth?.user
  let points = 100  // default

  if (user?.plan === 'premium') points = 1000
  if (user?.role === 'admin') {
    return next()  // No limit
  }

  // Apply rate limit với points tương ứng
}
```

### 4. IP Blacklist/Whitelist

```ts
// Whitelist: Internal services, monitoring
const WHITELIST_IPS = ['10.0.0.0/8', '172.16.0.0/12']

// Blacklist: Known attackers
const BLACKLIST_IPS = new Set()  // Populate từ Redis hoặc config

async function ipFilter(ctx, next) {
  const ip = ctx.request.ip()

  if (BLACKLIST_IPS.has(ip)) {
    return ctx.response.status(403).send('Blocked')
  }

  if (isWhitelisted(ip)) {
    return next()  // Skip rate limit
  }

  // Normal rate limit flow
}
```

---

## Disable Rate Limit trong Development

```ts
// Logics đã có pattern này
build: function (keyPrefix, uniqueKey, points, duration) {
  if (Env.get('DISABLE_RATE_LIMIT')) {
    return async (_, next) => {
      await next()  // Bỏ qua rate limit
    }
  }
  // ... rate limit logic
}

// .env
DISABLE_RATE_LIMIT=true  // Development
DISABLE_RATE_LIMIT=       // Production (không set = false)
```

---

## Monitoring Rate Limits

```ts
// Logics log khi rate limit bị trigger
log.error({ error, keyPrefix, uniqueKey, ip }, 'ERROR rate limit ip')
log.error({ error, keyPrefix, uniqueKey, userId }, 'ERROR rate limit userId')

// Nên thêm metrics (Phase 2 của Observability Roadmap):
const rateLimitExceeded = new Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Number of rate-limited requests',
  labelNames: ['key_prefix', 'unique_key'],
})

// Alert nếu rate limit bị trigger quá nhiều:
// -> Có thể đang bị tấn công
// -> Hoặc rate limit config quá chặt (false positive)
```

---

## Điểm chính cần nhớ

1. Rate limiting bảo vệ khỏi **DDoS, brute force, scraping, abuse**.
2. Logics dùng **rate-limiter-flexible** với **Redis backend** -- nhanh, chia sẻ giữa nhiều server.
3. Ba chiến lược: per **IP** (public APIs), per **userId** (authenticated APIs), **global** (heavy APIs).
4. `RateLimitMiddleware.build(keyPrefix, uniqueKey, points, duration)` -- 10 points / 1 giây = 10 req/s.
5. **Auth APIs** cần rate limit chặt nhất (chống brute force): 5 req/phút per IP.
6. Nên trả **rate limit headers** (X-RateLimit-Remaining) để FE xử lý gracefully.
7. Monitor rate limit events -- nhiều events = đang bị tấn công hoặc config quá chặt.
