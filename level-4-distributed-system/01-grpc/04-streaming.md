# gRPC Streaming -- 4 kiểu giao tiếp

## Tổng quan

gRPC có 4 kiểu RPC, từ đơn giản đến phức tạp:

```
1. Unary           = 1 request  → 1 response    (giống REST)
2. Server streaming = 1 request  → N responses   (server gửi liên tục)
3. Client streaming = N requests → 1 response    (client gửi liên tục)
4. Bidirectional    = N requests ↔ N responses   (cả 2 bên gửi liên tục)
```

## 1. Unary RPC -- Giống REST (Wallet service)

```protobuf
// wallet.proto -- KHÔNG có keyword "stream"
service Wallet {
  rpc changeBalance (changeBalanceRequest) returns (changeBalanceReply);
  rpc getWallet (getWalletRequest) returns (getWalletReply);
}
```

**Flow:**
```
logics                              wallet-service
  |                                      |
  |── changeBalance(request) ──────────→ |
  |                                      | xử lý...
  |← ──────────────── (response) ───────|
  |                                      |
  (connection đóng)
```

**Code thật** (`services/wallet/grpc.ts`):
```typescript
function changeBalance(message) {
  return new Promise((resolve, reject) => {
    // Gọi 1 lần, nhận 1 response qua callback
    client.changeBalance(
      { message: JSON.stringify(message) },
      (err, result) => {
        if (err) reject(err)
        else resolve(result)
      }
    )
  })
}

// Sử dụng:
await changeBalance({
  root: null,
  requests: [{ userId: 'abc', assetId: 'VND', walletType: 'main', volume: '-50000', reason: 'buy_plan' }]
})
```

**So sánh FE:** Giống `fetch()` hoặc `axios.post()` -- gửi request, đợi response.

## 2. Server Streaming -- Server gửi liên tục

```protobuf
// Ví dụ (không có trong Finpath, nhưng để hiểu concept)
service StockPrice {
  rpc WatchPrice (WatchRequest) returns (stream PriceUpdate);
  //                                     ^^^^^^
  //                                     chỉ response có stream
}
```

**Flow:**
```
Client                                Server
  |                                      |
  |── WatchPrice({ code: "VNM" }) ─────→|
  |                                      |
  |← ── PriceUpdate { price: 75000 } ──|
  |← ── PriceUpdate { price: 75100 } ──|
  |← ── PriceUpdate { price: 74900 } ──|
  |← ── ... (server gửi liên tục) ─────|
```

**So sánh FE:** Giống `EventSource` (Server-Sent Events) -- client chỉ nhận, không gửi.

## 3. Client Streaming -- Client gửi liên tục

```protobuf
// Ví dụ (không có trong Finpath, nhưng để hiểu concept)
service Analytics {
  rpc BatchUpload (stream AnalyticsEvent) returns (UploadResult);
  //               ^^^^^^
  //               chỉ request có stream
}
```

**Flow:**
```
Client                                Server
  |                                      |
  |── event { type: "click" } ─────────→|
  |── event { type: "scroll" } ────────→|
  |── event { type: "view" } ──────────→|
  |── (đóng stream) ──────────────────→ |
  |                                      | xử lý batch...
  |← ── UploadResult { count: 3 } ─────|
```

**So sánh FE:** Giống upload file theo chunks.

## 4. Bidirectional Streaming -- Cả 2 bên gửi liên tục (Message Stream)

```protobuf
// stream.proto -- CẢ HAI bên đều có keyword "stream"
service Stream {
  rpc Producer(stream ClientProducer) returns (stream ServerProducer);
  rpc Consumer(stream ClientConsumer) returns (stream ServerConsumer);
  //           ^^^^^^                         ^^^^^^
  //           client stream                  server stream
}
```

**Flow:**
```
logics (client)                     message_stream (server)
  |                                      |
  |── publish("on_model_stock", data) ──→|
  |← ── ack { requestId: "uuid1" } ────|
  |── publish("on_model_index", data) ──→|
  |── publish("on_model_stock", data) ──→|
  |← ── ack { requestId: "uuid2" } ────|
  |← ── ack { requestId: "uuid3" } ────|
  |── ... (tiếp tục vô hạn) ───────────→|
  |← ── ... ───────────────────────────|
```

Cả 2 bên gửi **bất kỳ lúc nào**, không cần đợi nhau. Giống 2 người nói chuyện điện thoại -- cả 2 đều có thể nói bất kỳ lúc nào.

## Code thật: Bidirectional Streaming trong Finpath

### Producer -- Gửi data vào Kafka qua message_stream

```typescript
// services/message_stream/consumer.ts (tên file hơi confusing, nhưng đây là Producer cho Kafka)
import { getConsumer } from './grpc'

const call = getConsumer()    // Tạo bidirectional stream, sống suốt vòng đời app

// Nhận ACK từ server
call.on('data', (data) => {
  const { ack, payload } = JSON.parse(data.message)
  const callback = requests.get(ack)
  requests.delete(ack)
  callback && callback({ ...payload })
})

// Gửi data vào Kafka
function publish(key, topics, message) {
  const requestId = uuidv4()

  return new Promise((resolve) => {
    requests.set(requestId, (data) => resolve(data))    // Lưu callback để match với ACK

    call.write({                                        // Gửi qua stream
      requestId,
      message: JSON.stringify({
        event: 'publish',
        payload: { key, topics, message },
      }),
    })
  })
}
```

### Publisher -- Broadcast data qua WebSocket

```typescript
// services/message_stream/publisher.ts
import { getPublisher } from './grpc'

const call = getPublisher()    // Bidirectional stream

// Nhận ACK
call.on('data', (data) => {
  const { ack, payload } = JSON.parse(data.message)
  const callback = requests.get(ack)
  requests.delete(ack)
  callback && callback({ ...payload })
})

call.on('error', (error) => {
  log.error({ error }, 'publisher error')    // Log lỗi khi stream bị đứt
})

// Publish data → message_stream → data-stream → FE WebSocket
function publish(channel, message) {
  const requestId = uuidv4()

  return new Promise((resolve) => {
    call.write({
      requestId,
      message: JSON.stringify({
        event: 'publish',
        payload: {
          channels: [channel],       // VD: 'on_model_overviewStock'
          message: message,
        },
      }),
    })

    resolve({ ok: 'ok' })    // Không đợi ACK, fire-and-forget
  })
}
```

### Subscriber -- Nhận data từ channels

```typescript
// services/message_stream/subscriber.ts
import { getSubscriber } from './grpc'

const call = getSubscriber()
const subscribes = []    // Danh sách callback handlers

// Nhận 2 loại message:
call.on('data', (data) => {
  const { event, ack, payload } = JSON.parse(data.message)

  if (event === 'response') {
    // ACK cho subscribe request
    const callback = requests.get(ack)
    requests.delete(ack)
    callback && callback({ ...payload })
    return
  }

  if (event === 'message') {
    // Data thật từ channel → chuyển cho tất cả handlers
    const { channel, message } = payload
    subscribes.forEach((handler) => handler(channel, message))
    return
  }
})

// Subscribe vào channels
function subscribe(channels) {
  call.write({
    requestId: uuidv4(),
    message: JSON.stringify({
      event: 'subscribe',
      payload: { channels },         // VD: ['on_model_overviewStock', 'on_model_overviewIndex']
    }),
  })
}

// Đăng ký handler nhận message
function subscribeMessage(handler) {
  subscribes.push(handler)
}
```

## Request-Response matching pattern

Trong bidirectional streaming, server trả response **không theo thứ tự**. Client cần match response với request bằng `requestId`:

```
Client gửi:                          Server trả:
  request(id=uuid1)  ──→               ← response(ack=uuid3)    ← ra trước!
  request(id=uuid2)  ──→               ← response(ack=uuid1)
  request(id=uuid3)  ──→               ← response(ack=uuid2)
```

Code giải quyết bằng **Map**:

```typescript
const requests = new Map<string, Callback>()

// Khi gửi: lưu callback theo requestId
const requestId = uuidv4()
requests.set(requestId, (data) => resolve(data))
call.write({ requestId, message: '...' })

// Khi nhận: tìm callback theo ack (= requestId cũ)
call.on('data', (data) => {
  const { ack, payload } = JSON.parse(data.message)
  const callback = requests.get(ack)     // Tìm callback đúng
  requests.delete(ack)                   // Xóa để tránh memory leak
  callback && callback(payload)          // Gọi resolve() của Promise
})
```

**So sánh FE:** Tương tự pattern trong WebSocket khi bạn gửi message với `id` rồi match response theo `id` đó.

## So sánh 4 kiểu

| Kiểu | Proto syntax | Finpath dùng cho | So sánh FE |
|---|---|---|---|
| Unary | `rpc Fn(Req) returns (Res)` | wallet, notification, social | `fetch()` |
| Server streaming | `rpc Fn(Req) returns (stream Res)` | (không dùng) | `EventSource` |
| Client streaming | `rpc Fn(stream Req) returns (Res)` | (không dùng) | Upload chunks |
| Bidirectional | `rpc Fn(stream Req) returns (stream Res)` | message_stream (Producer, Consumer, Publisher, Subscriber) | `WebSocket` |

## Tóm tắt

```
Finpath dùng 2 kiểu gRPC:

1. Unary (giống REST):
   logics ──request──→ wallet/notification/social ──response──→ logics
   Dùng cho: operations cần kết quả ngay (trừ tiền, gửi SMS, lấy bài viết)

2. Bidirectional Streaming (giống WebSocket):
   logics ←──stream──→ message_stream
   Dùng cho: real-time data flow (publish giá cổ phiếu, subscribe channels)

Pattern quan trọng:
├── call.write()     → Gửi message qua stream
├── call.on('data')  → Nhận message từ stream
├── requestId + ack  → Match request ↔ response trong stream
└── Map<id, callback> → Lưu callback để resolve đúng Promise
```
