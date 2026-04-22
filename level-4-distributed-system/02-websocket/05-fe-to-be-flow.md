# Full Flow: FE → BE → FE

## Tổng quan

Đây là bài quan trọng nhất. Ta sẽ trace **toàn bộ luồng data** từ lúc FE mở WebSocket cho đến khi nhận data real-time, đi qua 5 services.

## ASCII Diagram: Full Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌───────────┐                                                ┌───────────┐ │
│  │  Sàn HOSE │                                                │ FE Browser│ │
│  │  Sàn HNX  │                                                │ (React)   │ │
│  └─────┬─────┘                                                └─────▲─────┘ │
│        │ Market data                                                │       │
│        ▼                                                       WebSocket    │
│  ┌─────────────┐   gRPC     ┌──────────────┐   gRPC    ┌───────────┴──┐    │
│  │   source     │ ────────→ │  message      │ ────────→ │ data-stream  │    │
│  │   service    │  Producer  │  stream       │           │ (WS server)  │    │
│  │   (:3334)    │           │  (:9000)      │           │ (:9006)      │    │
│  └─────────────┘           └──────┬────────┘           └──────────────┘    │
│                                    │ Kafka                                   │
│                                    ▼                                         │
│                             ┌─────────────┐                                  │
│                             │   logics     │                                  │
│                             │  (:3333)     │                                  │
│                             │             │                                  │
│                             │ Consumer ←──┤ (nhận từ Kafka)                  │
│                             │ Publisher ──→│ (gửi tới data-stream)           │
│                             └──────┬──────┘                                  │
│                                    │                                         │
│                              ┌─────┴─────┐                                  │
│                              │   Redis    │                                  │
│                              │  (cache)   │                                  │
│                              └───────────┘                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Bước 1: FE mở WebSocket connection

```typescript
// FE code (React)
const ws = new WebSocket('wss://data-stream.finpath.vn/ws')

ws.onopen = () => {
  console.log('Connected to data stream')

  // Subscribe channels
  ws.send(JSON.stringify({
    event: 'subscribe',
    payload: {
      channels: ['on_model_overviewStock', 'on_model_overviewIndex']
    }
  }))
}
```

**Chuyện gì xảy ra ở server:**

```go
// finpath-data-stream/internal/handlers/ws/main.go
func WsEndpoint(w http.ResponseWriter, r *http.Request) {
    // 1. Upgrade HTTP → WebSocket
    conn, _ := upgrader.Upgrade(w, r, nil)

    // 2. Thêm client vào danh sách
    client := clientmanager.AddClient(conn, r)

    // 3. Bắt đầu đọc messages
    go readPump(client)
}
```

## Bước 2: Server nhận subscribe request

```go
// readPump nhận message: { event: "subscribe", payload: { channels: [...] } }
func readPump(client *Client) {
    for {
        _, message, _ := client.Conn.ReadMessage()
        msg := parseMessage(message)

        if msg.Event == "subscribe" {
            channelmanager.Subscribe(client, msg.Payload.Channels)
            // Client này giờ nằm trong:
            //   channels["on_model_overviewStock"] = [..., client]
            //   channels["on_model_overviewIndex"] = [..., client]
        }
    }
}
```

## Bước 3: source_service nhận data từ sàn chứng khoán

source_service kết nối trực tiếp với sàn HOSE/HNX, nhận dữ liệu real-time (giá, khối lượng, lệnh...). Khi có data mới:

```
source_service gửi qua gRPC Producer:
  call.write({
    requestId: "uuid-123",
    message: JSON.stringify({
      event: "publish",
      payload: {
        key: "VNM",
        topics: ["stock.price.update"],
        message: JSON.stringify({ code: "VNM", price: 75100, volume: 1000 })
      }
    })
  })
```

## Bước 4: message_stream nhận và đẩy vào Kafka

message_stream nhận gRPC message từ source_service, đẩy vào Kafka topic `stock.price.update`.

```
source_service ──gRPC──→ message_stream ──→ Kafka topic "stock.price.update"
```

## Bước 5: logics nhận từ Kafka qua gRPC Consumer

```typescript
// services/message_stream/consumer.ts (logics)
const call = getConsumer()

call.on('data', (data) => {
  const { ack, payload } = JSON.parse(data.message)
  const callback = requests.get(ack)
  requests.delete(ack)
  callback && callback({ ...payload })
})
```

logics nhận data từ Kafka thông qua gRPC Consumer stream với message_stream.

## Bước 6: logics xử lý data và cập nhật Redis

```typescript
// redis/models/overviewStock.ts
async function set(data) {
  // Cập nhật Redis cache
  await redisClient.hset('overviewStock_V2', data.code, JSON.stringify(data))

  // Publish Redis event (để các phần khác trong logics biết)
  pubclient.publish('on_model_overviewStock', JSON.stringify(data))
}
```

```typescript
// handledata/index.ts -- Lắng nghe Redis event
subscribeRedis((channel, message) => {
  switch (channel) {
    case 'on_model_overviewStock':
      handleOverviewStock(message)
      break
    case 'on_model_overviewIndex':
      handleOverviewIndex(message)
      break
    // ... các channels khác
  }
})
```

## Bước 7: logics publish qua gRPC Publisher

```typescript
// services/message_stream/publisher.ts
function publish(channel, message) {
  const requestId = uuidv4()

  call.write({
    requestId,
    message: JSON.stringify({
      event: 'publish',
      payload: {
        channels: [channel],              // 'on_model_overviewStock'
        message: message,                 // JSON string chứa data cổ phiếu
      },
    }),
  })
}

// Gọi từ handleOverviewStock:
publisher.publish('on_model_overviewStock', JSON.stringify({
  code: 'VNM',
  price: 75100,
  volume: 1000,
  dayChange: 0.13,
  // ...
}))
```

## Bước 8: message_stream chuyển tới data-stream

message_stream nhận gRPC message từ logics, chuyển tiếp tới finpath-data-stream qua gRPC.

```
logics ──gRPC Publisher──→ message_stream ──gRPC──→ finpath-data-stream
```

## Bước 9: data-stream broadcast qua WebSocket

```go
// finpath-data-stream nhận data từ message_stream
// Broadcast tới tất cả clients đã subscribe channel "on_model_overviewStock"
channelmanager.Broadcast("on_model_overviewStock", data)

// Nội bộ:
for _, client := range channels["on_model_overviewStock"] {
    client.Conn.WriteMessage(websocket.TextMessage, data)
}
```

## Bước 10: FE nhận data

```typescript
// FE code
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)

  // data = { code: "VNM", price: 75100, volume: 1000, dayChange: 0.13 }
  updateStockPrice(data)    // Cập nhật UI
}
```

## Tổng hợp: 10 bước trong 1 diagram

```
 Bước │ Service          │ Hành động                         │ Protocol
──────┼──────────────────┼───────────────────────────────────┼──────────
  1   │ FE Browser       │ new WebSocket('wss://...')        │ WebSocket
  2   │ data-stream      │ Upgrade + Subscribe client        │ WebSocket
  3   │ source_service   │ Nhận giá từ sàn, gửi gRPC        │ gRPC
  4   │ message_stream   │ Nhận gRPC, đẩy vào Kafka         │ gRPC→Kafka
  5   │ logics           │ Nhận từ Kafka qua gRPC Consumer   │ gRPC
  6   │ logics           │ Xử lý data, cập nhật Redis       │ Redis
  7   │ logics           │ Publish qua gRPC Publisher        │ gRPC
  8   │ message_stream   │ Chuyển tiếp tới data-stream      │ gRPC
  9   │ data-stream      │ Broadcast qua WebSocket           │ WebSocket
 10   │ FE Browser       │ onmessage → cập nhật UI          │ WebSocket
```

## Độ trễ (Latency)

```
Sàn HOSE → source_service:     ~50ms  (network + parse)
source_service → message_stream: ~1ms   (gRPC, cùng network)
message_stream → Kafka:          ~2ms   (write to disk)
Kafka → logics (via gRPC):      ~5ms   (read + gRPC)
logics xử lý + Redis:           ~2ms   (transform + cache)
logics → message_stream (gRPC):  ~1ms   (gRPC)
message_stream → data-stream:    ~1ms   (gRPC)
data-stream → FE (WebSocket):   ~20ms  (internet, CDN)
─────────────────────────────────────────
Tổng:                          ~80-100ms từ sàn → FE
```

## Ví dụ thực tế: User mở app Finpath

### Khi mở trang "Bảng giá"

```
1. FE connect WebSocket: wss://data-stream.finpath.vn/ws
2. FE subscribe: ['on_model_overviewStock', 'on_model_overviewIndex']
3. Nhận data liên tục: giá 1600+ cổ phiếu, VN-Index, HNX-Index
```

### Khi click vào cổ phiếu VNM (trang chi tiết)

```
1. FE subscribe thêm: ['on_model_orderbook', 'on_model_historyTrade']
2. Nhận thêm: sổ lệnh VNM, lịch sử giao dịch VNM
```

### Khi chuyển sang tab "Crypto"

```
1. FE unsubscribe: ['on_model_overviewStock', 'on_model_overviewIndex']
2. FE subscribe: ['on_model_overviewCrypto']
3. Ngừng nhận data chứng khoán, bắt đầu nhận data crypto
```

### Khi tắt app

```
1. WebSocket connection đóng
2. data-stream cleanup: xóa client khỏi tất cả channels
3. Không còn gửi data cho client này
```

## So sánh: Nếu dùng HTTP polling thay vì WebSocket

```
WebSocket:
  1 connection duy nhất
  Server push khi có data mới
  ~80ms latency
  Bandwidth: chỉ gửi data thay đổi (~100 bytes/update)
  10,000 users = 10,000 connections + data khi có thay đổi

HTTP Polling (mỗi 1 giây):
  10,000 users × 1 request/giây = 10,000 requests/giây
  Mỗi request + response = ~500 bytes headers + data
  Bandwidth: 10,000 × 500 = 5 MB/giây chỉ riêng headers
  Latency: 0-1000ms (phụ thuộc timing)
  Server load: gấp 100x
```

## Tóm tắt

```
Full flow (10 bước):
  Sàn → source_service → message_stream → Kafka → logics → Redis
  logics → message_stream → data-stream → FE Browser

3 protocols:
  gRPC: giữa các services (nhanh, binary, internal)
  Kafka: message queue (reliable, persistent)
  WebSocket: server → FE browser (real-time, persistent connection)

Tại sao phức tạp vậy?
  - Tách riêng thu thập data (source_service) vs xử lý (logics) vs broadcast (data-stream)
  - Mỗi service scale độc lập
  - Kafka đảm bảo không mất data
  - Nếu 1 service chết, các service khác vẫn hoạt động
```
