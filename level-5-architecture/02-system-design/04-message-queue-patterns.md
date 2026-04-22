# Message Queue Patterns -- Pub/Sub, Fan-out, và hơn thế

## Mục tiêu

Hiểu sâu các patterns message queue: Pub/Sub, Fan-out, Request-Reply, Event Sourcing. Phân tích Kafka trong Finpath đang dùng patterns nào.

> Level 3 đã học Kafka basics (producer/consumer). Level này đi sâu vào **patterns** và **khi nào dùng pattern nào**.

---

## 1. Pub/Sub Pattern -- Publish & Subscribe

### Khái niệm

Publisher gửi message đến **topic**. Tất cả subscribers của topic nhận message.

```
                    ┌──────────┐
  Publisher ──────> │  Topic   │ ──────> Subscriber A
                    │          │ ──────> Subscriber B
                    └──────────┘ ──────> Subscriber C
```

**Đặc điểm:**
- Publisher không biết subscriber là ai
- Tất cả subscribers nhận **cùng** message
- Subscriber mới có thể join bất kỳ lúc nào

### Ví dụ: Redis Pub/Sub trong Finpath

```ts
// redis/client.ts
const pubclient = new Redis(redisConfig)    // Publish
const subclient = new Redis(redisConfig)    // Subscribe

// Instance 1: Publish cache clear event
pubclient.publish('cache:clear_prefix', JSON.stringify({ prefix: 'room' }))

// Instance 2, 3: Subscribe và xử lý
subclient.subscribe('cache:clear_prefix')
subclient.on('message', (channel, data) => {
  const { prefix } = JSON.parse(data)
  cacheService.removeCacheByPrefix(prefix, false)  // broadcast=false (đã nhận broadcast)
})
```

### Khi nào dùng

- **Broadcasting:** Thông báo cho tất cả instances (cache clear, config update)
- **Realtime updates:** WebSocket push giá cổ phiếu đến tất cả connected clients
- **Notifications:** Một event, nhiều handlers

### Hạn chế Redis Pub/Sub

- **Fire and forget:** Nếu subscriber offline lúc publish → MẤT message
- **Không persist:** Message không lưu, không replay
- **Không consumer groups:** Không thể chia tải giữa subscribers

> Đây là lý do Finpath dùng **Kafka** cho use cases quan trọng, không chỉ Redis Pub/Sub.

---

## 2. Fan-out Pattern -- 1 event, nhiều hành động

### Khái niệm

1 event trigger **nhiều consumers khác nhau**, mỗi consumer làm việc khác nhau.

```
                              ┌────────────────┐
                         ────>│ Update Portfolio│
                         │    └────────────────┘
  ┌──────────────┐       │    ┌────────────────┐
  │ Order Placed │───────┼───>│ Send Notify    │
  └──────────────┘       │    └────────────────┘
                         │    ┌────────────────┐
                         ────>│ Log Analytics  │
                         │    └────────────────┘
                         │    ┌────────────────┐
                         ────>│ Sync Partner   │
                              └────────────────┘
```

### So sánh FE: Event system

```typescript
// FE: 1 event, nhiều handlers
document.addEventListener('click', trackAnalytics)
document.addEventListener('click', updateUI)
document.addEventListener('click', sendToServer)

// BE Fan-out: 1 Kafka message, nhiều consumers
// Producer (1 chỗ)
await kafkaService.emit('order.placed', { orderId })

// Consumer 1: Update portfolio
kafkaService.on('order.placed', portfolioService.updatePortfolio)
// Consumer 2: Send notification
kafkaService.on('order.placed', notificationService.sendOrderNotify)
// Consumer 3: Log event
kafkaService.on('order.placed', analyticsService.logOrderEvent)
```

### Fan-out trong Finpath

```
User đặt lệnh thành công
         │
         ▼
  Kafka: 'order.placed'
         │
    ┌────┼─────────────┬───────────────┬──────────────┐
    ▼                  ▼               ▼              ▼
 Update            Gửi push       Log analytics    Sync dữ liệu
 portfolio         notification    event           bên thứ 3
```

**Lợi ích:**
- Thêm handler mới (ví dụ: gửi Slack) → chỉ thêm 1 consumer, KHÔNG sửa producer
- Mỗi consumer xử lý độc lập → 1 consumer lỗi không ảnh hưởng các consumer khác

---

## 3. Consumer Groups -- Chia tải trong cùng nhóm

### Vấn đề

Fan-out: tất cả consumers nhận cùng message. Nhưng nếu 1 tác vụ **nặng** (ví dụ: tính profit), cần nhiều instances chia tải?

### Giải pháp: Consumer Groups trong Kafka

```
                         Consumer Group "profit-calc"
                         ┌──────────────────────────┐
                    ────>│ Instance 1: partition 0-1 │
  ┌─────────────┐  │    └──────────────────────────┘
  │   Topic:    │──┤
  │ calc.profit │  │    ┌──────────────────────────┐
  └─────────────┘  ────>│ Instance 2: partition 2-3 │
                         └──────────────────────────┘

                         Consumer Group "notification"
                         ┌──────────────────────────┐
                    ────>│ Instance 1: all partitions│
  ┌─────────────┐       └──────────────────────────┘
  │   Topic:    │
  │ calc.profit │
  └─────────────┘
```

**Trong cùng 1 consumer group:** Mỗi message chỉ được **1 instance** xử lý (chia tải).
**Giữa các consumer groups:** Mỗi group nhận **tất cả** messages (fan-out).

### Ví dụ

```
Kafka topic: 'portfolio.stopLoss'
Message: { orderId: 'o1', symbol: 'VNM', stopPrice: 80000 }

Consumer Group "logics" (3 instances):
  Instance 1 xử lý message này ← CHỈ 1 instance trong group
  Instance 2 KHÔNG nhận
  Instance 3 KHÔNG nhận

Consumer Group "analytics" (2 instances):
  Instance 1 xử lý message này ← CHỈ 1 instance trong group khác
```

### So sánh FE

```typescript
// FE không có khái niệm tương đương trực tiếp
// Tương tự nhất: Web Workers
// Main thread gửi task → 1 trong N workers xử lý

const worker1 = new Worker('calc.js')
const worker2 = new Worker('calc.js')
// Gửi task → 1 worker xử lý (không cả 2)
```

---

## 4. Request-Reply Pattern -- Gửi và đợi phản hồi

### Khái niệm

Producer gửi message và **đợi** consumer trả lời. Giống HTTP request nhưng qua message queue.

```
Service A                    Queue                    Service B
   │                           │                         │
   │── Send request ──────────>│                         │
   │                           │── Deliver request ─────>│
   │                           │                         │── Process
   │                           │<── Send reply ──────────│
   │<── Deliver reply ────────│                         │
   │                           │                         │
```

### Ví dụ: gRPC trong Finpath

```
logics ──── gRPC request ────> source_service
logics <─── gRPC response ──── source_service
```

gRPC trong Finpath thực chất là Request-Reply pattern:
- logics cần dữ liệu từ source_service
- Gửi request qua gRPC → đợi response
- Synchronous: caller đợi kết quả

### Khi nào dùng

- Cần **kết quả** trước khi tiếp tục (kiểm tra số dư, validate data)
- Giao tiếp giữa 2 services **cụ thể** (không broadcast)
- Thời gian xử lý **ngắn** (< 5 giây)

### So sánh: Request-Reply vs Fire-and-Forget

| Đặc điểm | Request-Reply | Fire-and-Forget |
|---|---|---|
| Đợi kết quả | Có | Không |
| Coupling | Cao hơn | Thấp |
| Latency | Tăng (đợi) | Thấp (gửi xong) |
| Error handling | Trực tiếp | Consumer tự xử lý |
| Ví dụ Finpath | gRPC → source_service | Kafka emit → consumers |

---

## 5. Event Sourcing -- Lưu events thay vì state

### Khái niệm truyền thống (State-based)

```ts
// Lưu STATE hiện tại
{ balance: 100000 }

// User mua VNM: update state
await updateOne({ $set: { balance: 50000 } })  // Mất thông tin giao dịch!
```

### Event Sourcing

```ts
// Lưu EVENTS (tất cả thay đổi)
{ type: 'DEPOSIT', amount: 200000, createdAt: '2026-01-01' }
{ type: 'BUY', symbol: 'VNM', amount: 100000, createdAt: '2026-01-15' }
{ type: 'SELL', symbol: 'VNM', amount: 150000, createdAt: '2026-02-01' }
{ type: 'BUY', symbol: 'FPT', amount: 50000, createdAt: '2026-03-01' }

// State = replay tất cả events
// balance = 200000 - 100000 + 150000 - 50000 = 200000
```

### Finpath có dùng Event Sourcing không?

**Một phần.** `analysisEvents` collection là event store:

```ts
// mongo/analysisEvents.ts
{
  uid: 'user1',
  key: 'page_view',           // Event type
  val: { page: '/stocks/VNM' }, // Event data
  createdAt: Date,
}
```

Mỗi hành động user → 1 event document. Analytics dashboard **replay events** để tính metrics:

```ts
// Đếm page views trong 30 ngày
await mongo.analysisEvents.countDocuments({
  key: 'page_view',
  createdAt: { $gte: thirtyDaysAgo },
})

// Đây là "query the event store" -- pattern của Event Sourcing
```

### So sánh FE: Redux

```typescript
// Redux = Event Sourcing cho FE state!
// Actions = Events
dispatch({ type: 'ADD_TO_CART', payload: { productId: '1', qty: 2 } })
dispatch({ type: 'REMOVE_FROM_CART', payload: { productId: '1' } })
dispatch({ type: 'ADD_TO_CART', payload: { productId: '2', qty: 1 } })

// Reducer = Event replay
// State = áp dụng tất cả actions lên initial state

// Redux DevTools: "time travel" = replay events
```

**FE devs đã quen Event Sourcing qua Redux!** BE Event Sourcing là cùng concept nhưng ở database level.

### Khi nào dùng

- Cần **audit trail** (lịch sử tất cả thay đổi)
- Cần **replay/rebuild** state (analytics, debugging)
- Cần **undo** (quay lại trạng thái trước)

### Khi nào KHÔNG dùng

- CRUD đơn giản (thêm/sửa/xóa là đủ)
- Không cần lịch sử
- Storage concern (events tích lũy rất nhiều)

---

## 6. Kafka trong Finpath -- Đang dùng pattern nào?

### Tổng hợp

```
┌─────────────────────────────────────────────────────┐
│                    Finpath                           │
│                                                     │
│  Redis Pub/Sub: Cache sync giữa instances           │
│    Pattern: Pub/Sub (broadcast)                     │
│                                                     │
│  Kafka: Async processing giữa services              │
│    Pattern: Fan-out + Consumer Groups               │
│    - portfolio.stopLoss → tính stop loss             │
│    - portfolio.takeProfit → tính take profit         │
│    - sync.external → đồng bộ dữ liệu               │
│                                                     │
│  gRPC: Sync communication giữa services             │
│    Pattern: Request-Reply                            │
│    - logics → source_service: lấy dữ liệu          │
│                                                     │
│  analysisEvents: User behavior tracking              │
│    Pattern: Event Sourcing (partial)                 │
│    - Lưu tất cả events, replay cho analytics        │
│                                                     │
│  WebSocket: Realtime data đến client                │
│    Pattern: Pub/Sub (server → client)               │
│    - Giá cổ phiếu realtime                          │
│    - Notifications                                  │
└─────────────────────────────────────────────────────┘
```

### Tại sao dùng cả Kafka và Redis Pub/Sub?

| Tiêu chí | Kafka | Redis Pub/Sub |
|---|---|---|
| Persist messages | Có (trên disk) | Không (fire & forget) |
| Replay | Có (offset) | Không |
| Consumer groups | Có | Không |
| Throughput | Rất cao (100K+ msg/s) | Cao (nhưng không persist) |
| Complexity | Cao (cluster, partitions) | Thấp |
| Use case Finpath | Business logic async | Cache sync, realtime |

---

## 7. Message Ordering & Exactly-Once

### Ordering trong Kafka

```
Partition 0: [msg1, msg3, msg5]  → Consumer 1 (theo thứ tự)
Partition 1: [msg2, msg4, msg6]  → Consumer 2 (theo thứ tự)

Trong cùng partition: ĐẢM BẢO thứ tự
Giữa partitions: KHÔNG đảm bảo thứ tự
```

**Ví dụ:** User đặt lệnh mua → sau đó hủy lệnh. Nếu "hủy" xử lý trước "mua" → lỗi!

```ts
// Giải pháp: Dùng orderId làm partition key
// Tất cả messages về cùng order → cùng partition → đúng thứ tự
await kafkaService.emit('order.action', { orderId, action: 'buy' }, { key: orderId })
await kafkaService.emit('order.action', { orderId, action: 'cancel' }, { key: orderId })
```

### At-least-once vs Exactly-once

```
At-most-once:  Message có thể mất (không retry)
At-least-once: Message không mất nhưng có thể duplicate (có retry)
Exactly-once:  Message xử lý đúng 1 lần (khó đạt được)
```

**Finpath dùng at-least-once** → code consumer phải **idempotent** (xử lý 2 lần cùng message cho kết quả giống nhau).

```ts
// Idempotent consumer
async function handleStopLoss(message) {
  const { orderId } = message

  // Kiểm tra đã xử lý chưa (idempotent check)
  const order = await mongo.orders.findOne({ _id: orderId })
  if (order.status === 'stopped') {
    return  // Đã xử lý → bỏ qua
  }

  await mongo.orders.updateOne(
    { _id: orderId, status: 'active' },  // Condition: chỉ update nếu active
    { $set: { status: 'stopped' } },
  )
}
```

---

## Tóm tắt

| Pattern | Một câu giải thích | Ví dụ Finpath |
|---|---|---|
| Pub/Sub | 1 message, tất cả subscribers nhận | Redis cache sync |
| Fan-out | 1 event, nhiều handlers khác nhau | Order placed → portfolio + notify + log |
| Consumer Groups | Chia tải trong cùng nhóm | 3 logics instances chia nhau xử lý |
| Request-Reply | Gửi và đợi phản hồi | gRPC logics → source_service |
| Event Sourcing | Lưu events thay vì state | analysisEvents, Redux |

## Bài tập

1. Tính năng mới: Khi user follow expert, cần: (a) update followership count, (b) gửi notification cho expert, (c) log analytics event, (d) gửi welcome message trong chat. Thiết kế message flow dùng patterns nào?
2. Consumer xử lý payment nhận cùng message 2 lần (at-least-once). Viết idempotent handler để tránh charge user 2 lần.
3. Finpath cần gửi daily digest email cho 100K users. Nên dùng Kafka hay Redis Pub/Sub? Design solution với consumer groups.
