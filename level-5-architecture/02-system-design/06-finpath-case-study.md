# Finpath Case Study -- Thiết kế hệ thống từ đầu

## Mục tiêu

Hiểu tại sao Finpath được thiết kế như hiện tại: 7 services, gRPC + Kafka + Redis, MongoDB 101 models. Phân tích trade-offs và quyết định kiến trúc.

---

## 1. Bài toán: Finpath cần gì?

### Yêu cầu chức năng

```
1. Hiển thị giá cổ phiếu realtime (~1700 mã, cập nhật mỗi giây)
2. Portfolio management (danh mục đầu tư, lệnh mua/bán)
3. Social features (bài viết, follow, room, chat)
4. Analytics (theo dõi hành vi user, dashboard)
5. Payment (nâng cấp plan PRO, thanh toán)
6. Notifications (push, in-app)
7. Expert features (phòng chuyên gia, tín hiệu)
```

### Yêu cầu phi chức năng

```
- Latency:    Giá cổ phiếu < 100ms (realtime)
- Throughput: 10K+ concurrent users giờ giao dịch
- Uptime:     99.9% (giờ giao dịch không được downtime)
- Data:       100M+ events, 200K+ users
- Scale:      Tăng users 3-5x/năm
```

### Nếu bạn là FE dev, bạn sẽ nghĩ gì?

```
"1 server Node.js, 1 database, vài API endpoints là xong chứ?"
```

Đúng -- cho MVP. Nhưng khi scale lên, bạn sẽ gặp vấn đề mà chỉ 1 server không giải quyết được.

---

## 2. Tại sao tách thành 7 services?

### Kiến trúc hiện tại

```
┌──────────────────────────────────────────────────────┐
│                    Internet / CDN                     │
└──────────────────────┬───────────────────────────────┘
                       │
                  ┌────▼────┐
                  │  Nginx  │  (API Gateway + LB)
                  └────┬────┘
                       │
          ┌────────────┼──────────────────┐
          │            │                  │
     ┌────▼────┐  ┌────▼──────────┐  ┌───▼───────────┐
     │ logics  │  │ source_      │  │ message_      │
     │ :3333   │  │ service:3334 │  │ stream:9000   │
     │         │  │              │  │ (WebSocket)   │
     │ API     │  │ Data crawl   │  │ Realtime      │
     │ chính   │  │ Data feed    │  │ push          │
     └────┬────┘  └──────────────┘  └───────────────┘
          │
     ┌────┼────────────────────┐
     │    │                    │
┌────▼──┐ ┌──▼───────────┐ ┌──▼──────────────┐
│data_  │ │data_         │ │finpath-data     │
│feed   │ │aggregation   │ │-stream:9006     │
│:9320  │ │:3335         │ │                 │
│       │ │              │ │Data pipeline    │
│Market │ │Tổng hợp      │ │                 │
│data   │ │phân tích     │ │                 │
└───────┘ └──────────────┘ └─────────────────┘
                       │
              ┌────────┼────────┐
              │        │        │
         ┌────▼──┐ ┌───▼──┐ ┌──▼───┐
         │MongoDB│ │Redis │ │Kafka │
         │:27017 │ │:6379 │ │:9093 │
         └───────┘ └──────┘ └──────┘
```

### Lý do tách từng service

#### logics (:3333) -- Service chính

```
Chứa: Business logic, API endpoints, Auth, CRUD
101 MongoDB models, 50+ services

Tại sao là service lớn nhất?
→ Hầu hết business logic liên quan chặt với nhau
→ Tách quá nhỏ = overhead giao tiếp giữa services
→ "Monolith first, microservice later" principle
```

#### source_service (:3334) -- Data source

```
Chứa: Crawl dữ liệu từ bên thứ 3, provide data cho logics

Tại sao tách?
→ Crawl data là I/O intensive (chờ external APIs)
→ Nếu external API chậm, KHÔNG ảnh hưởng logics
→ Deploy/restart source_service KHÔNG ảnh hưởng user API
```

#### data_feed (:9320) -- Market data

```
Chứa: Nhận dữ liệu thị trường realtime

Tại sao tách?
→ Market data stream chạy liên tục (9h-15h)
→ Cần xử lý throughput rất cao (1700 mã x mỗi giây)
→ Nếu chung logics, sẽ chiếm CPU/memory ảnh hưởng API
```

#### message_stream (:9000) -- WebSocket

```
Chứa: WebSocket server push data realtime đến FE

Tại sao tách?
→ WebSocket = long-lived connections (không phải request/response)
→ 10K users online = 10K connections
→ Scale WebSocket khác với scale HTTP API
→ Restart logics KHÔNG disconnect WebSocket
```

#### data_aggregation (:3335)

```
Chứa: Tổng hợp, phân tích dữ liệu

Tại sao tách?
→ Aggregation queries nặng (chạy trên 100M+ rows)
→ Nếu chung logics, query nặng ảnh hưởng API performance
→ Có thể scale riêng khi cần tính toán nhiều
```

#### Kafka (:9093) -- Message broker

```
Tại sao cần?
→ Async communication giữa services
→ Decouple: service gửi message, không cần biết ai xử lý
→ Reliability: message không mất khi service restart
→ Buffer: peak traffic gửi vào queue, consumer xử lý dần
```

### Quyết định KHÔNG tách

```
KHÔNG tách thêm:
- Auth service? → Không. Auth logic nhỏ, gắn chặt với logics
- Notification service? → Không. Chỉ gửi push, logic đơn giản
- Payment service? → Không. Payment flow liên quan plan, order, user

Lý do: Tách quá nhiều service = overhead giao tiếp, deploy, debug
Finpath chọn: Tách khi CÓ LÝ DO RÕ RÀNG (I/O khác biệt, scale khác nhau)
```

---

## 3. Tại sao dùng gRPC + Kafka + Redis?

### 3 loại giao tiếp, 3 công cụ

```
┌─────────────────────────────────────────────────┐
│                                                  │
│   gRPC:    "Tôi cần data NGAY, đợi kết quả"    │
│            logics ←→ source_service              │
│            Sync, low latency, strongly typed     │
│                                                  │
│   Kafka:   "Hãy xử lý việc này KHI NÀO RẢNH"  │
│            logics → [queue] → consumers          │
│            Async, reliable, scalable             │
│                                                  │
│   Redis:   "Mọi người ƠI, cache thay đổi rồi"  │
│   Pub/Sub  instance1 → [channel] → all instances │
│            Broadcast, fire-and-forget            │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Decision matrix

| Cần gì? | Chọn gì? | Ví dụ |
|---|---|---|
| Kết quả ngay + low latency | gRPC | Lấy giá cổ phiếu từ source_service |
| Async, reliable, scalable | Kafka | Stop loss, take profit, analytics |
| Broadcast tất cả instances | Redis Pub/Sub | Cache invalidation |
| Realtime đến client | WebSocket | Giá cổ phiếu, notifications |

### Tại sao gRPC thay vì HTTP?

```
HTTP REST:
  POST /api/stocks/price
  Content-Type: application/json
  { "symbol": "VNM" }
  → Parse JSON (chậm) → Respond JSON (chậm)

gRPC:
  client.getStockPrice({ symbol: 'VNM' })
  → Binary protocol (nhanh hơn JSON 5-10x)
  → Strongly typed (proto file)
  → Streaming support
```

gRPC phù hợp cho inter-service communication (internal). HTTP REST phù hợp cho client-facing API (external).

---

## 4. Tại sao MongoDB + Redis?

### MongoDB cho persistent data

```
Tại sao MongoDB thay vì PostgreSQL?

1. Schema flexibility
   - 101 models, mỗi model khác nhau
   - Schema thay đổi thường xuyên (startup move fast)
   - Embedded documents (rooms.owner, posts.creator)

2. Horizontal scalability
   - Sharding native
   - Replica sets dễ setup

3. Developer experience
   - JSON-like documents = FE devs quen thuộc
   - Mongoose = typed schemas

Trade-offs:
- Không có JOINs mạnh → phải embed hoặc application-level join
- Transactions yếu hơn SQL → cần design around it
- No enforced schema → bugs khó phát hiện hơn
```

### Redis cho realtime data

```
Tại sao Redis?

1. Giá cổ phiếu (đọc hàng nghìn lần/giây)
   → Redis Hash: O(1) lookup, sub-millisecond
   → 1700 mã × 80+ fields mỗi mã = vẫn nhanh

2. Cache
   → Memory-based = nhanh nhất
   → TTL tự động

3. Pub/Sub
   → Cache invalidation giữa instances
   → Realtime events

4. Distributed Lock
   → lockService.acquire() dùng Redis SET NX EX
   → Atomic, có TTL
```

```ts
// Redis models trong Finpath -- data realtime
redis/models/
  overviewStock.ts      // Giá + thông tin 1700 mã CK
  overviewIndex.ts      // VN-Index, HNX-Index
  stockBar.ts           // OHLCV bar data
  orderbook.ts          // Sổ lệnh
  // ... 50+ models
```

---

## 5. Data Flow: Từ thị trường đến màn hình user

### Flow giá cổ phiếu

```
Sở giao dịch (HOSE/HNX)
        │
        ▼
┌──────────────┐
│ data_feed    │  Nhận market data (TCP/WebSocket)
│ :9320        │
└──────┬───────┘
       │ Publish to Redis
       ▼
┌──────────────┐
│    Redis     │  Lưu overview, bars, orderbook
│              │  Hash: overviewStock.VNM = { price: 85000, ... }
└──────┬───────┘
       │ Read
       │
  ┌────┴────────────────┐
  │                     │
  ▼                     ▼
┌──────────┐    ┌──────────────┐
│ logics   │    │ message_     │
│ :3333    │    │ stream:9000  │
│          │    │              │
│ API:     │    │ WebSocket:   │
│ GET /api │    │ push to      │
│ /stocks  │    │ connected    │
└──────────┘    │ clients      │
                └──────────────┘
                       │
                       ▼
                  ┌─────────┐
                  │   FE    │
                  │  React  │
                  └─────────┘
```

### Tại sao thiết kế như vậy?

```
1. data_feed chuyên nhận data → không bị API requests ảnh hưởng
2. Redis làm shared store → cả logics và message_stream đều đọc được
3. message_stream chuyên push WebSocket → scale WebSocket connections riêng
4. logics serve API → user query giá qua REST cũng được (polling fallback)
```

### Latency breakdown

```
Sở CK → data_feed:     10-50ms (network)
data_feed → Redis:      < 1ms (local network)
Redis → message_stream: < 1ms (local network)
message_stream → FE:    10-50ms (internet)
────────────────────────────────────
Tổng:                   21-102ms ← Gần realtime!
```

---

## 6. Data Flow: User đặt lệnh

```
FE: User nhấn "Mua VNM x100"
        │
        ▼
┌──────────────┐
│    Nginx     │  Auth, rate limit
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   logics     │  1. Validate: user có đủ tiền?
│              │  2. Create order in MongoDB
│              │  3. Emit Kafka: 'order.placed'
│              │  4. Return response to FE
└──────┬───────┘
       │ Kafka
       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Consumer 1   │  │ Consumer 2   │  │ Consumer 3   │
│              │  │              │  │              │
│ Update       │  │ Send push    │  │ Log          │
│ portfolio    │  │ notification │  │ analytics    │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Tại sao Kafka cho order processing?

```
1. Decoupling: Controller chỉ emit, không biết ai xử lý
2. Reliability: Order không mất nếu consumer chết
3. Async: User nhận response nhanh (không đợi notification, analytics)
4. Scalable: Thêm consumer khi cần
```

---

## 7. Các Trade-offs đã chấp nhận

### Trade-off 1: Eventual Consistency

```
Chọn:    Embed owner info trong rooms (fast reads)
Đánh đổi: Khi user đổi avatar, rooms hiển thị avatar cũ
          cho đến khi background job update

Chấp nhận vì: User đổi avatar hiếm, read rooms rất nhiều
```

### Trade-off 2: Complexity vs Performance

```
Chọn:    7 services thay vì 1 monolith
Đánh đổi: Deploy phức tạp, debug khó hơn, network latency
          Docker Compose, multiple logs, distributed tracing

Chấp nhận vì: Scale từng service riêng, fault isolation
```

### Trade-off 3: MongoDB vs SQL

```
Chọn:    MongoDB (schema flexible, easy embedding)
Đánh đổi: Weak transactions, no JOINs, data duplication

Chấp nhận vì: Startup cần move fast, schema thay đổi liên tục
```

### Trade-off 4: Redis as Source of Truth (cho realtime data)

```
Chọn:    Giá cổ phiếu lưu trong Redis (không MongoDB)
Đánh đổi: Redis restart → mất data giá hiện tại
          (nhưng data_feed sẽ refill trong vài giây)

Chấp nhận vì: Sub-millisecond reads, giá thay đổi mỗi giây nên
              data cũ vô nghĩa anyway
```

---

## 8. Nếu thiết kế lại từ đầu?

### Bước 1: MVP (1 server)

```
┌──────────────────┐
│ Node.js (logics) │
│ + MongoDB        │
│ + Redis          │
└──────────────────┘

Chỉ cần 1 server cho:
- API endpoints
- Giá cổ phiếu (polling)
- Basic CRUD
```

### Bước 2: Scale (khi user tăng)

```
- Tách WebSocket → message_stream (long-lived connections)
- Tách data crawl → source_service (I/O isolation)
- Thêm Kafka (async processing)
- Multiple logics instances + Redis lock
```

### Bước 3: Optimize (khi data tăng)

```
- Tách data pipeline → data_feed, data_aggregation
- Redis Sentinel (HA)
- MongoDB replica set
- Caching strategy (multi-layer)
```

### Bước 4: Scale further (khi cần)

```
- MongoDB sharding cho collections lớn
- Redis Cluster
- Dedicated databases per service
- Kubernetes thay Docker Compose
```

---

## 9. Lessons Learned

### 1. Start simple, split when needed

```
Đừng tạo 20 microservices từ ngày 1.
Bắt đầu với monolith, tách khi CÓ LÝ DO:
- Service A cần scale khác service B
- Service A hay crash, không muốn ảnh hưởng B
- Team A và Team B làm việc độc lập
```

### 2. Choose boring technology

```
MongoDB, Redis, Kafka = battle-tested
Không chọn công nghệ mới, cool nhưng chưa proven
"Boring" = nhiều docs, nhiều người biết, ít bugs
```

### 3. Design for failure

```
- Redis chết? → fallback memory cache
- Kafka chết? → messages queue up, retry khi phục hồi
- 1 logics instance chết? → load balancer route sang instance khác
- MongoDB primary chết? → replica set auto-promote secondary
```

### 4. Measure before optimize

```
Không optimize vì "nghĩ" nó chậm.
Measure → tìm bottleneck → optimize bottleneck.

Ví dụ: analysisEvents query chậm
→ Measure: explain() → full collection scan
→ Optimize: thêm compound index
→ Measure: query 100x nhanh hơn ✅
```

---

## Tóm tắt

| Quyết định | Lý do | Trade-off |
|---|---|---|
| 7 services | I/O isolation, independent scaling | Complexity, debug khó |
| gRPC | Fast inter-service, typed | Learning curve |
| Kafka | Reliable async, scalable | Operational complexity |
| Redis | Sub-ms reads, pub/sub, lock | Data loss on restart |
| MongoDB | Flexible schema, embedding | Weak transactions |
| Nginx | API gateway, LB, simple | Không có advanced features |

## Bài tập

1. Bạn cần thiết kế hệ thống tương tự Finpath cho thị trường crypto (thay vì chứng khoán). Khác biệt gì? (24/7 trading, higher volatility, different data sources). Kiến trúc thay đổi thế nào?
2. Finpath hiện dùng Docker Compose cho deployment. Nếu scale lên 50+ instances, cần chuyển sang gì? Kubernetes giải quyết vấn đề gì mà Docker Compose không?
3. Một startup mới hỏi bạn: "Nên bắt đầu với microservices hay monolith?" Dựa trên kinh nghiệm Finpath, bạn trả lời thế nào? Cho ví dụ cụ thể.
