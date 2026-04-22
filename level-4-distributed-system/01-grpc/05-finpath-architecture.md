# Kiến trúc gRPC trong hệ thống Finpath

## Bức tranh toàn cảnh

Finpath không phải 1 server duy nhất. Nó là hệ thống **nhiều services** giao tiếp với nhau qua gRPC:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           HỆ THỐNG FINPATH                                      │
│                                                                                  │
│  ┌─────────────────┐     gRPC :9000      ┌───────────────────┐                  │
│  │  source_service  │ ──────────────────→ │                   │                  │
│  │   (Go, :3334)    │   Producer/Consumer │                   │                  │
│  │                  │                     │   message_stream  │                  │
│  │  Nguồn dữ liệu  │                     │    (Go, :9000)    │                  │
│  │  chứng khoán     │                     │                   │                  │
│  └─────────────────┘                     │   Trung tâm       │                  │
│                                           │   message routing │                  │
│  ┌─────────────────┐     gRPC :9000      │                   │                  │
│  │     logics       │ ←────────────────→ │                   │                  │
│  │  (Node.js, :3333)│   Publisher/        │                   │     gRPC :9006   │
│  │                  │   Subscriber/       │                   │ ──────────────→  │
│  │  Business logic  │   Consumer          └───────────────────┘                  │
│  │  chính           │                                                │           │
│  └────────┬─────────┘                                                │           │
│           │                                                          ▼           │
│           │ gRPC                                        ┌───────────────────┐    │
│           │                                             │ finpath-data-stream│    │
│     ┌─────┼──────────────┐                              │    (Go, :9006)    │    │
│     │     │              │                              │                   │    │
│     ▼     ▼              ▼                              │  WebSocket server │    │
│  ┌──────┐ ┌────────────┐ ┌───────────────┐              │  cho FE           │    │
│  │wallet│ │notification│ │social_service │              └─────────┬─────────┘    │
│  │(:*)  │ │(:*)        │ │(:*)           │                        │              │
│  │      │ │            │ │               │                        │ WebSocket    │
│  │Quản  │ │Gửi SMS,    │ │Post, Expert,  │                        │              │
│  │lý ví │ │push, email │ │HotNews, Feed  │                        ▼              │
│  └──────┘ └────────────┘ └───────────────┘              ┌───────────────────┐    │
│                                                          │   FE Browser      │    │
│                                                          │   (React/Next.js) │    │
│                                                          └───────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Chi tiết từng gRPC connection

### 1. source_service → message_stream (gRPC Streaming)

```
source_service (:3334) ──── gRPC :9000 ────→ message_stream

Proto: stream.proto
RPC:   Producer (bidirectional stream)
Mục đích: Đẩy dữ liệu chứng khoán real-time vào Kafka
```

source_service là nơi **thu thập dữ liệu** từ sàn chứng khoán (giá cổ phiếu, orderbook, lịch sử giao dịch...). Nó gửi data liên tục vào message_stream qua gRPC streaming.

### 2. logics ↔ message_stream (gRPC Streaming, 2 chiều)

```
logics (:3333) ←──── gRPC :9000 ────→ message_stream

Proto: stream.proto + pubsub.proto
RPC:   Consumer (nhận từ Kafka), Publisher (gửi tới WebSocket), Subscriber (nhận từ channels)
```

logics vừa **nhận** data từ Kafka (Consumer), vừa **gửi** data để broadcast tới FE (Publisher).

Cụ thể:

```
logics dùng Consumer để:
  - Nhận data từ Kafka topics (đã được source_service đẩy vào)
  - Xử lý, transform data
  - Cập nhật Redis cache

logics dùng Publisher để:
  - Gửi data đã xử lý → message_stream → data-stream → FE
  - Channels: on_model_overviewStock, on_model_overviewIndex, on_model_orderbook, ...

logics dùng Subscriber để:
  - Subscribe vào channels để nhận data từ các sources khác
```

### 3. message_stream → finpath-data-stream (gRPC)

```
message_stream (:9000) ──── gRPC :9006 ────→ finpath-data-stream

Mục đích: Chuyển data từ message queue tới WebSocket server
```

message_stream nhận data từ nhiều sources (source_service, logics) rồi chuyển tiếp tới data-stream để broadcast qua WebSocket.

### 4. logics → wallet service (gRPC Unary)

```
logics (:3333) ──── gRPC ────→ wallet (:*)

Proto: wallet.proto
RPC:   changeBalance, getWallet, changeBalanceFromLocking, lockBalance
Config: GRPC_WALLET_SERVICE_HOST
```

```typescript
// Code thật:
await wallet.changeBalance({
  root: null,
  requests: [{
    userId: 'user123',
    assetId: 'VND',
    walletType: 'main',
    volume: '-50000',
    reason: 'buy_plan',
    metaData: { planId: 'plan_abc' }
  }]
})
```

### 5. logics → notification service (gRPC Unary)

```
logics (:3333) ──── gRPC ────→ notification (:*)

Proto: notification.proto
RPC:   sendCodeToPhone, pushNotification, sendEmail, updateUserTags
Config: GRPC_NOTIFICATION_HOST
```

```typescript
// Code thật:
await notification.pushNotification({
  title: 'Cổ phiếu VNM đạt mục tiêu',
  message: 'Giá VNM đã chạm 75,000 VND',
  userId: 'user123',
  category: 'stock_alert',
  options: JSON.stringify({ stockCode: 'VNM' })
})

await notification.sendSms({
  phone: '0901234567',
  code: '123456',
  method: 'sms',
  category: 'otp',
  carrierData: ''
})
```

### 6. logics → social_service (gRPC Unary, nhiều services)

```
logics (:3333) ──── gRPC ────→ social_service (:*)

Proto: post.proto, expert.proto, hotNews.proto, recommendation.proto,
       room.proto, channel.proto, feed.proto
RPC:   createPost, getExpert, getHotNews, getFeed, ...
Config: GRPC_SOCIAL_SERVICE_HOST
```

Social service phức tạp nhất vì có **7 proto files** → 7 gRPC clients:

```
social_service/
├── proto/
│   ├── post.proto              → PostService client
│   ├── expert.proto            → ExpertService client
│   ├── hotNews.proto           → HotNewsService client
│   ├── recommendation.proto    → RecommendationService client
│   ├── room.proto              → RoomService client
│   ├── channel.proto           → ChannelService client
│   └── feed.proto              → FeedService client
└── grpc.ts                     → Load tất cả 7 clients
```

## Luồng dữ liệu real-time: Từ sàn chứng khoán → FE browser

```
Sàn HOSE/HNX                                         FE Browser
     |                                                     ▲
     ▼                                                     |
┌─────────────┐   gRPC    ┌─────────────┐              WebSocket
│source_service│ ────────→ │message_stream│                 |
│  (Go:3334)  │  Producer  │  (Go:9000)  │                 |
└─────────────┘           └──────┬──────┘                 |
                                  │                        |
                                  │ Kafka                  |
                                  │                        |
                                  ▼                        |
                          ┌──────────────┐                |
                          │    logics     │                |
                          │ (Node:3333)  │                |
                          └──────┬───────┘                |
                                 │                         |
                     ┌───────────┤                         |
                     │           │                         |
                     ▼           ▼                         |
               ┌─────────┐  gRPC Publisher                |
               │  Redis   │     │                         |
               │ (cache)  │     ▼                         |
               └─────────┘  ┌──────────────┐   gRPC     |
                             │message_stream│ ─────────→  |
                             │  (Go:9000)  │            |
                             └──────────────┘            |
                                                ┌────────┴───────┐
                                                │finpath-data-   │
                                                │stream (Go:9006)│
                                                └────────────────┘
```

**Bước chi tiết:**

1. **source_service** nhận data từ sàn chứng khoán (HOSE, HNX)
2. Gửi vào **message_stream** qua gRPC Producer
3. message_stream đẩy vào **Kafka**
4. **logics** nhận từ Kafka (qua gRPC Consumer)
5. logics xử lý, transform data → cập nhật **Redis** cache
6. logics publish data đã xử lý qua gRPC **Publisher** → message_stream
7. message_stream chuyển tiếp tới **finpath-data-stream** qua gRPC
8. data-stream broadcast tới **FE browser** qua WebSocket

## Luồng Redis Pub/Sub song song

Ngoài gRPC, logics còn dùng **Redis Pub/Sub** để xử lý data nội bộ:

```typescript
// Khi cập nhật Redis cache, đồng thời publish event
// redis/models/overviewStock.ts
pubclient.publish('on_model_overviewStock', JSON.stringify(data))

// handledata/index.ts lắng nghe event và xử lý tiếp
subscribeRedis((channel, message) => {
  switch (channel) {
    case 'on_model_overviewIndex':   handleOverviewIndex(message);   break
    case 'on_model_overviewStock':   handleOverviewStock(message);   break
    case 'on_model_roomStock':       handleRoomStock(message);       break
    case 'on_model_orderbook':       handleOrderbook(message);       break
    case 'on_model_overviewSector':  handleOverviewSector(message);  break
    case 'on_model_historyTrade':    handleHistoryTrade(message);    break
  }
})
```

## Tổng hợp tất cả gRPC connections

| Từ | Đến | Proto file(s) | Kiểu | Mục đích |
|---|---|---|---|---|
| source_service | message_stream | stream.proto | Bidirectional | Đẩy data chứng khoán |
| logics | message_stream | stream.proto | Bidirectional | Nhận data từ Kafka (Consumer) |
| logics | message_stream | pubsub.proto | Bidirectional | Publish/Subscribe channels |
| message_stream | data-stream | - | gRPC | Chuyển data tới WebSocket server |
| logics | wallet | wallet.proto | Unary | Quản lý ví, số dư |
| logics | notification | notification.proto | Unary | SMS, push, email |
| logics | social_service | 7 proto files | Unary | Post, expert, feed, ... |

## Config & Environment Variables

```bash
# Các biến môi trường cho gRPC connections
GRPC_MESSAGE_STREAM_HOST=message-stream:9000
GRPC_WALLET_SERVICE_HOST=wallet-service:50051
GRPC_NOTIFICATION_HOST=notification-service:50051
GRPC_SOCIAL_SERVICE_HOST=social-service:50051
```

```typescript
// config/message-stream.ts
{ grpc_host: Env.get('GRPC_MESSAGE_STREAM_HOST'), stream: 'Stream', pubsub: 'PubSub' }

// config/walletservice.ts
{ grpc_host: Env.get('GRPC_WALLET_SERVICE_HOST'), name: 'Wallet' }

// config/notification.ts
{ grpc_notification_host: Env.get('GRPC_NOTIFICATION_HOST'), name: 'Notification' }

// config/socialservice.ts
{ grpc_host: Env.get('GRPC_SOCIAL_SERVICE_HOST'), Post: 'Post', Expert: 'Expert', ... }
```

## Tóm tắt

```
Hệ thống Finpath có 7+ gRPC connections:

Real-time data flow:
  source_service ──gRPC──→ message_stream ←──gRPC──→ logics
  message_stream ──gRPC──→ data-stream ──WebSocket──→ FE

Business operations:
  logics ──gRPC──→ wallet (trừ/cộng tiền)
  logics ──gRPC──→ notification (SMS, push, email)
  logics ──gRPC──→ social_service (bài viết, feed, expert)

Quy tắc:
  - Streaming: dùng cho real-time data (message_stream)
  - Unary: dùng cho business operations (wallet, notification, social)
  - Config host đọc từ env variable (thay đổi theo môi trường)
```
