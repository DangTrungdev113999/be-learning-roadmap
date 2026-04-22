# WebSocket Server Side

## Từ FE sang BE: Góc nhìn khác

Ở FE, bạn viết 5 dòng code là xong WebSocket:

```typescript
const ws = new WebSocket('wss://...')
ws.onopen = () => { ... }
ws.onmessage = (event) => { ... }
ws.onerror = (error) => { ... }
ws.onclose = () => { ... }
```

Ở BE, server phải lo **rất nhiều thứ**:
- Accept connections từ hàng nghìn clients
- Track ai đang kết nối, ai đã ngắt
- Parse messages, xử lý events
- Broadcast data tới đúng clients
- Xử lý lỗi, timeout, memory

## Code thật: `finpath-data-stream` (Go)

### 1. Upgrade HTTP → WebSocket

```go
// finpath-data-stream/internal/handlers/ws/main.go
var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin: func(r *http.Request) bool {
        return true    // Cho phép tất cả origins (production nên kiểm tra)
    },
}

func WsEndpoint(w http.ResponseWriter, r *http.Request) {
    // Bước 1: Upgrade HTTP connection thành WebSocket
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Println("upgrade error:", err)
        return
    }

    // Bước 2: Đăng ký client mới
    client := clientmanager.AddClient(conn, r)

    // Bước 3: Bắt đầu đọc messages từ client (goroutine riêng)
    go readPump(client)
}
```

**Giải thích:**

- `upgrader.Upgrade(w, r, nil)` -- Nhận HTTP request, trả lại WebSocket connection. Đây là bước **handshake** (101 Switching Protocols).
- `clientmanager.AddClient(conn, r)` -- Lưu connection vào danh sách để track.
- `go readPump(client)` -- Tạo **goroutine** (Go's concurrent function) để đọc messages. Mỗi client có 1 goroutine riêng.

**So sánh FE:**
```
FE: new WebSocket('wss://...')              → browser tự handshake
BE: upgrader.Upgrade(w, r, nil)             → server xử lý handshake

FE: ws.onmessage = (event) => { ... }       → nhận message
BE: go readPump(client)                     → goroutine đọc message liên tục
```

### 2. Đọc messages từ client

```go
func readPump(client *Client) {
    // Khi hàm này kết thúc = client disconnect → cleanup
    defer func() {
        clientmanager.RemoveClient(client)
        client.Conn.Close()
    }()

    // Đọc messages liên tục (vòng lặp vô hạn)
    for {
        _, message, err := client.Conn.ReadMessage()
        if err != nil {
            // Client ngắt kết nối hoặc lỗi network
            log.Println("read error:", err)
            break    // Thoát vòng lặp → defer cleanup
        }

        // Parse message JSON
        msg := parseMessage(message)    // { event: "subscribe", payload: { channels: [...] } }

        // Xử lý theo event type
        if msg.Event == "subscribe" {
            channelmanager.Subscribe(client, msg.Payload.Channels)
        }
        if msg.Event == "unsubscribe" {
            channelmanager.Unsubscribe(client, msg.Payload.Channels)
        }
    }
}
```

**Giải thích từng phần:**

#### `defer` -- Cleanup khi disconnect

```go
defer func() {
    clientmanager.RemoveClient(client)    // Xóa client khỏi danh sách
    client.Conn.Close()                   // Đóng WebSocket connection
}()
```

`defer` trong Go giống `finally` trong JavaScript. Khi `readPump` kết thúc (vì lỗi hoặc client ngắt), code trong `defer` chạy tự động.

```typescript
// Tương đương JavaScript
try {
  while (true) {
    const message = await readMessage()
    handleMessage(message)
  }
} finally {
  clientManager.removeClient(client)     // Luôn chạy dù có lỗi hay không
  client.conn.close()
}
```

#### `for { ... }` -- Vòng lặp đọc message

```go
for {
    _, message, err := client.Conn.ReadMessage()
    // ...
}
```

Vòng lặp vô hạn, đọc 1 message, xử lý, đọc tiếp. `ReadMessage()` là **blocking** -- nó đợi cho đến khi có message mới hoặc connection đóng.

#### Event handling

```go
if msg.Event == "subscribe" {
    channelmanager.Subscribe(client, msg.Payload.Channels)
}
if msg.Event == "unsubscribe" {
    channelmanager.Unsubscribe(client, msg.Payload.Channels)
}
```

Server nhận JSON message từ FE và xử lý theo `event` field. Đây là **protocol tự định nghĩa** -- không phải chuẩn WebSocket (WebSocket chỉ truyền bytes, cách encode là tùy ứng dụng).

### 3. Message format

FE gửi lên:
```json
{
  "event": "subscribe",
  "payload": {
    "channels": ["on_model_overviewStock", "on_model_overviewIndex"]
  }
}
```

Server gửi xuống:
```json
{
  "channel": "on_model_overviewStock",
  "data": {
    "code": "VNM",
    "price": 75000,
    "dayChange": 1.5
  }
}
```

## Kiến trúc bên trong WebSocket server

```
                    ┌──────────────────────────────────────┐
                    │        finpath-data-stream            │
                    │                                      │
  FE Browser 1 ════╪═══ conn ─→ ┌──────────────┐         │
                    │            │ ClientManager │         │
  FE Browser 2 ════╪═══ conn ─→ │              │         │
                    │            │ - clients[]   │         │
  FE Browser 3 ════╪═══ conn ─→ │ - addClient() │         │
                    │            │ - removeClient│         │
                    │            └──────┬───────┘         │
                    │                   │                   │
                    │                   ▼                   │
                    │            ┌──────────────┐         │
                    │            │ChannelManager│         │
                    │            │              │         │
                    │            │ channels:    │         │
                    │            │  overviewStock│→[1,2]  │
                    │            │  overviewIndex│→[1,3]  │
                    │            │  orderbook   │→[2]    │
                    │            └──────────────┘         │
                    │                                      │
                    │  ← gRPC từ message_stream            │
                    │     nhận data → broadcast            │
                    │     tới clients đã subscribe         │
                    └──────────────────────────────────────┘
```

**ClientManager** quản lý danh sách tất cả clients đang kết nối:
- `AddClient(conn)` -- Khi FE mới kết nối, thêm vào danh sách
- `RemoveClient(client)` -- Khi FE ngắt kết nối, xóa khỏi danh sách

**ChannelManager** quản lý ai subscribe channel nào:
- `Subscribe(client, channels)` -- Thêm client vào channel
- `Unsubscribe(client, channels)` -- Xóa client khỏi channel
- `Broadcast(channel, data)` -- Gửi data tới tất cả clients trong channel

## Goroutine -- Xử lý đồng thời

Mỗi client có **1 goroutine riêng** chạy `readPump`. Go có thể chạy hàng triệu goroutines đồng thời (lightweight hơn thread).

```
Client 1 kết nối → goroutine 1: readPump(client1)
Client 2 kết nối → goroutine 2: readPump(client2)
Client 3 kết nối → goroutine 3: readPump(client3)
...
Client 10000 kết nối → goroutine 10000: readPump(client10000)
```

**So sánh:**
- **Node.js** xử lý WebSocket bằng event loop (1 thread, async/await)
- **Go** xử lý bằng goroutines (nhìn như multi-thread nhưng nhẹ hơn)
- Kết quả tương đương: cả 2 đều handle hàng nghìn connections

## Tại sao data-stream viết bằng Go, không phải Node.js?

1. **Goroutines** quản lý nhiều connections dễ hơn (mỗi client = 1 goroutine, code đơn giản)
2. **Performance** tốt hơn cho I/O-heavy tasks (WebSocket server chủ yếu là đọc/ghi data)
3. **Memory** hiệu quả hơn (goroutine ~2KB stack vs Node.js connection object lớn hơn)
4. **Consistent** với message_stream (cũng viết bằng Go)

## Tóm tắt

```
WebSocket server phải xử lý:

1. Upgrade: HTTP request → WebSocket connection
   upgrader.Upgrade(w, r, nil)

2. Track clients: Ai đang kết nối, ai đã ngắt
   clientmanager.AddClient(conn)
   clientmanager.RemoveClient(client)

3. Read messages: Đọc liên tục trong vòng lặp
   for { client.Conn.ReadMessage() }

4. Handle events: Parse JSON, xử lý theo event type
   if msg.Event == "subscribe" → Subscribe(client, channels)

5. Cleanup: Khi client ngắt, xóa khỏi tất cả channels
   defer { RemoveClient() + Close() }

So sánh:
  FE viết 5 dòng: new WebSocket → onmessage → done
  BE viết toàn bộ: upgrade + client tracking + read loop + broadcast + cleanup
```
