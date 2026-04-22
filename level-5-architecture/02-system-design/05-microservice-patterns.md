# Microservice Patterns -- Service Discovery, Circuit Breaker, API Gateway, Saga

## Mục tiêu

Hiểu 4 patterns quan trọng khi hệ thống có nhiều services: Service Discovery, Circuit Breaker, API Gateway, Saga. Phân tích Finpath đang dùng patterns nào.

---

## 1. Monolith vs Microservices -- Recap nhanh

### Monolith (1 cục)

```
┌──────────────────────────────────┐
│           logics (:3333)         │
│                                  │
│  Auth  │ Portfolio │ Payment     │
│  Room  │ Stock     │ Analytics   │
│  Chat  │ Notify    │ Cache       │
│                                  │
│  Tất cả code trong 1 app        │
│  1 database                      │
└──────────────────────────────────┘
```

### Microservices (nhiều services)

```
┌──────────┐  ┌──────────────┐  ┌──────────────┐
│ logics   │  │ source_      │  │ data_feed    │
│ :3333    │  │ service:3334 │  │ :9320        │
└──────────┘  └──────────────┘  └──────────────┘
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ data_        │  │ message_     │  │ finpath-data │
│ aggregation  │  │ stream:9000  │  │ -stream:9006 │
│ :3335        │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Finpath ở đâu?

**Hybrid.** logics là service lớn nhất (gần monolith), nhưng tách ra 7 services cho các concern đặc biệt:
- `logics`: Business logic chính
- `source_service`: Data sources (crawl, feed)
- `data_feed`: Realtime market data
- `data_aggregation`: Tổng hợp dữ liệu
- `message_stream`: WebSocket realtime
- `finpath-data-stream`: Data streaming
- `Kafka`: Message broker

### So sánh FE: Micro-frontends

```typescript
// FE Monolith: 1 React app chứa tất cả
src/
  pages/Portfolio/
  pages/Stock/
  pages/Chat/
  pages/Payment/

// FE Micro-frontends: Nhiều apps nhỏ
@finpath/portfolio-app
@finpath/stock-app
@finpath/chat-app
// Mỗi app deploy độc lập

// BE Microservices: Cùng concept nhưng ở server
// Mỗi service deploy, scale, update độc lập
```

---

## 2. Service Discovery -- Tìm nhau trong hệ thống

### Vấn đề

logics cần gọi source_service. Nhưng source_service ở đâu?

```
// ❌ Hardcode
const SOURCE_SERVICE_URL = 'http://10.0.0.5:3334'
// IP thay đổi khi deploy → app lỗi
// Scale thêm instance → phải update code
```

### Giải pháp 1: DNS-based (đơn giản)

```
// Docker Compose: service name = DNS name
services:
  logics:
    ports: ['3333:3333']
  source_service:
    ports: ['3334:3334']

// Trong code:
const SOURCE_SERVICE_URL = 'http://source_service:3334'
// Docker DNS tự resolve service name → IP
```

### Giải pháp 2: Service Registry (phức tạp)

```
                  ┌──────────────┐
                  │   Registry   │
                  │ (Consul/etcd)│
                  └──────┬───────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ logics   │   │ source   │   │ data     │
    │ register │   │ register │   │ register │
    │ + lookup │   │          │   │          │
    └──────────┘   └──────────┘   └──────────┘

    1. Mỗi service khởi động → đăng ký vào Registry
    2. Service cần gọi service khác → hỏi Registry
    3. Service tắt → Registry xóa đăng ký
```

### Finpath dùng gì?

**DNS-based** qua Docker Compose + environment variables:

```ts
// .env
SOURCE_SERVICE_HOST=source_service
SOURCE_SERVICE_PORT=3334

// Sử dụng trong code
const client = new gRPC.Client(`${SOURCE_SERVICE_HOST}:${SOURCE_SERVICE_PORT}`)
```

Đơn giản, đủ dùng cho 7 services. Service Registry (Consul, etcd) cần khi có 50+ services.

---

## 3. Circuit Breaker -- Ngắt mạch khi service lỗi

### Vấn đề

source_service bị chậm (5 giây/request thay vì 100ms). logics gọi source_service → đợi 5 giây → timeout.

```
1000 requests/giây → logics đợi source_service
→ logics thread pool cạn → logics cũng chậm theo
→ Client đợi logics → timeout → User thấy app chết
→ CASCADE FAILURE! 💥
```

### Giải pháp: Circuit Breaker

Giống cầu dao điện: khi dòng điện quá tải → ngắt mạch → bảo vệ thiết bị.

```
                CLOSED          OPEN            HALF-OPEN
              (bình thường)   (ngắt mạch)     (thử lại)
                   │               │               │
  Request ─────> Gọi service    Fail ngay       Thử 1 request
                   │           (không gọi)         │
                 Thành công?       │          Thành công?
                ┌────┴────┐        │         ┌────┴────┐
               Có        Không     │        Có        Không
                │         │        │         │         │
               Giữ     Đếm lỗi    │      CLOSED      OPEN
              CLOSED   >= 5?       │
                      ┌──┴──┐      │
                     Có    Không   │
                      │     │      │
                   OPEN   CLOSED   │
                      │            │
                      └── 30s ─────┘  (thử lại sau 30 giây)
```

### Implementation đơn giản

```ts
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  private failCount = 0
  private lastFailTime = 0

  private readonly THRESHOLD = 5      // Mở circuit sau 5 lỗi
  private readonly TIMEOUT = 30000    // Thử lại sau 30 giây

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailTime > this.TIMEOUT) {
        this.state = 'HALF_OPEN'
      } else {
        throw new Error('Circuit is OPEN -- service unavailable')
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess() {
    this.failCount = 0
    this.state = 'CLOSED'
  }

  private onFailure() {
    this.failCount++
    this.lastFailTime = Date.now()

    if (this.failCount >= this.THRESHOLD) {
      this.state = 'OPEN'
    }
  }
}

// Sử dụng
const sourceServiceBreaker = new CircuitBreaker()

async function getStockData(symbol: string) {
  return sourceServiceBreaker.call(() =>
    grpcClient.getStockData({ symbol }),
  )
}
```

### So sánh FE: Error boundaries + Retry

```typescript
// FE: Error Boundary bắt lỗi, hiển thị fallback UI
<ErrorBoundary fallback={<ErrorScreen />}>
  <StockChart />
</ErrorBoundary>

// FE: Retry with backoff
const { data, error } = useQuery('stocks', fetchStocks, {
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
})
// Retry 3 lần, delay tăng dần: 1s, 2s, 4s

// BE: Circuit Breaker = Error Boundary + Retry cho service calls
```

### Finpath có dùng Circuit Breaker không?

**Không explicitly**, nhưng có patterns tương tự:
- gRPC có timeout (nếu source_service không trả trong 5s → timeout)
- Kafka retry: consumer retry message nếu lỗi
- cacheService fallback: nếu Redis chết, dùng memory cache

---

## 4. API Gateway -- Cổng vào duy nhất

### Khái niệm

Tất cả client requests đi qua **1 điểm** (API Gateway) trước khi đến services.

```
              Mobile App ──┐
              Web App ─────┤
              Admin ───────┤
                           ▼
                    ┌──────────────┐
                    │ API Gateway  │
                    │              │
                    │ - Auth       │
                    │ - Rate limit │
                    │ - Routing    │
                    │ - Transform  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌──────────┐  ┌──────────┐
         │logics  │  │source    │  │message   │
         │        │  │_service  │  │_stream   │
         └────────┘  └──────────┘  └──────────┘
```

### Chức năng của API Gateway

| Chức năng | Giải thích | Ví dụ |
|---|---|---|
| Authentication | Verify token trước khi đến service | JWT verify |
| Rate Limiting | Giới hạn requests per user/IP | 100 req/s per user |
| Routing | Route đến service phù hợp | /api/stocks → logics |
| Load Balancing | Phân tải giữa instances | Round robin |
| SSL Termination | Xử lý HTTPS | Client ↔ Gateway: HTTPS, Gateway ↔ Services: HTTP |
| Response Transform | Gộp/chuyển đổi responses | Aggregate từ nhiều services |

### Finpath: Nginx làm API Gateway đơn giản

```nginx
# Nginx vừa là Load Balancer vừa là API Gateway

location /api/ {
    # Auth check (có thể dùng auth_request)
    # Rate limiting
    limit_req zone=api burst=20;
    # Route đến logics
    proxy_pass http://logics;
}

location /ws/ {
    # WebSocket → message_stream
    proxy_pass http://message_stream;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### So sánh FE: API layer

```typescript
// FE: API layer (giống API Gateway cho client)
// src/api/client.ts
const apiClient = axios.create({
  baseURL: process.env.API_URL,
  timeout: 10000,
})

// Interceptor = Gateway features
apiClient.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${getToken()}`  // Auth
  return config
})

apiClient.interceptors.response.use(null, (error) => {
  if (error.response?.status === 429) {
    // Rate limited → retry later
  }
  if (error.response?.status === 401) {
    // Unauthorized → redirect login
  }
})
```

---

## 5. Saga Pattern -- Transaction phân tán

### Vấn đề

Trong monolith, 1 database transaction đảm bảo all-or-nothing:

```ts
// Monolith: 1 DB transaction
const session = await mongoose.startSession()
session.startTransaction()
try {
  await deductBalance(userId, amount, session)
  await createOrder(orderData, session)
  await updatePortfolio(portfolioData, session)
  await session.commitTransaction()     // Tất cả thành công
} catch {
  await session.abortTransaction()       // Tất cả rollback
}
```

Trong microservices, mỗi service có **DB riêng**. Không thể dùng 1 transaction!

```
logics DB:      deductBalance ✅
payment DB:     processPayment ❌ (lỗi!)
notification:   sendNotify ???

→ Balance đã trừ nhưng payment fail → INCONSISTENT!
```

### Giải pháp: Saga Pattern

Saga chia transaction lớn thành nhiều **bước nhỏ**. Mỗi bước có **compensating action** (hành động bù) khi cần rollback.

```
Step 1: Trừ tiền
  Compensate: Hoàn tiền

Step 2: Tạo order
  Compensate: Hủy order

Step 3: Gửi notification
  Compensate: (không cần -- notification không critical)
```

### Choreography Saga (event-driven)

```
┌──────┐  OrderCreated  ┌─────────┐  PaymentDone  ┌──────────┐
│Orders│ ──────────────> │Payment  │ ────────────> │Portfolio │
│      │                 │         │               │          │
│      │  PaymentFailed  │         │               │          │
│      │ <────────────── │         │               │          │
│Cancel│                 │Refund   │               │          │
└──────┘                 └─────────┘               └──────────┘
```

Mỗi service lắng nghe events và quyết định hành động tiếp theo. Không có "người điều phối" trung tâm.

### Orchestration Saga (có coordinator)

```
                    ┌─────────────┐
                    │   Saga      │
                    │ Orchestrator│
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌─────────┐  ┌──────────┐
         │ Step 1 │  │ Step 2  │  │ Step 3   │
         │ Orders │  │ Payment │  │Portfolio │
         └────────┘  └─────────┘  └──────────┘

    Orchestrator điều phối: "Step 1 xong → Step 2. Step 2 fail → Compensate Step 1"
```

### Finpath có dùng Saga không?

**Implicitly** trong payment flow:

```ts
// Simplified payment flow:
// 1. User tạo payment request
// 2. Payment gateway xử lý
// 3. Webhook callback:
//    - Success → activate plan + gửi notification
//    - Failed → onPaymentRequestFailed (compensating action)

// app/Services/paymentService/libs/onPaymentRequestFailed.ts
async function onPaymentRequestFailed(paymentRequestId) {
  const acquired = await lockService.acquire(
    ['payment', 'failed', paymentRequestId],
    5000,
  )
  // ... rollback logic
}
```

### So sánh FE: Multi-step forms

```typescript
// FE: Multi-step form với undo
const [steps, setSteps] = useState([])

// Step 1: Fill info
// Step 2: Choose plan
// Step 3: Payment

// User nhấn "Back" → undo step → compensating action ở FE
// BE Saga: Tương tự nhưng mỗi step = 1 service call, undo = compensating action
```

---

## 6. Finpath Patterns Summary

```
┌─────────────────────────────────────────────────┐
│                 Finpath Patterns                 │
│                                                  │
│  Service Discovery:  Docker DNS + env vars       │
│    → Đơn giản, đủ cho 7 services                │
│                                                  │
│  Circuit Breaker:    gRPC timeout + retry        │
│    → Implicit, không explicit library            │
│                                                  │
│  API Gateway:        Nginx                       │
│    → Route, SSL, rate limit, load balance        │
│                                                  │
│  Saga:               Event-driven (Kafka)        │
│    → Payment flow với compensating actions       │
│                                                  │
│  Communication:                                  │
│    Sync:  gRPC (logics ↔ source_service)        │
│    Async: Kafka (fire-and-forget tasks)          │
│    Realtime: WebSocket (market data → FE)        │
│    Cache sync: Redis Pub/Sub                     │
└─────────────────────────────────────────────────┘
```

---

## Tóm tắt

| Pattern | Bài toán | Giải pháp | Finpath |
|---|---|---|---|
| Service Discovery | Tìm service ở đâu | DNS / Registry | Docker DNS + env |
| Circuit Breaker | Service lỗi gây cascade | Ngắt mạch, fail fast | gRPC timeout |
| API Gateway | Điểm vào duy nhất | Auth + route + rate limit | Nginx |
| Saga | Transaction phân tán | Compensating actions | Payment flow |

## Bài tập

1. Finpath thêm service mới `notification-service` (tách từ logics). Thiết kế: service discovery thế nào? Communication pattern nào (gRPC hay Kafka)? Tại sao?
2. source_service thường xuyên chậm vào giờ mở cửa (9h-9h30). Thiết kế circuit breaker: threshold bao nhiêu? Timeout bao lâu? Fallback response là gì?
3. User nâng cấp plan PRO: (1) trừ tiền, (2) activate plan, (3) gửi email, (4) tạo welcome bonus. Thiết kế Saga: compensating action cho mỗi bước? Nếu bước 3 fail, cần rollback gì?
