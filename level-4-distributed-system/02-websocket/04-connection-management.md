# Connection Management

## Vấn đề: Quản lý hàng nghìn connections đồng thời

Mỗi WebSocket connection là 1 **persistent TCP connection**. Server phải giữ tất cả connections mở đồng thời. Với 10,000 users online cùng lúc = 10,000 connections cùng lúc.

Điều này khác hoàn toàn với HTTP:

```
HTTP:
  10,000 users gọi API → mỗi request xử lý 50ms → server chỉ giữ ~500 connections cùng lúc
  (vì connection đóng ngay sau khi response)

WebSocket:
  10,000 users online → server giữ 10,000 connections CẢ NGÀY
  (connection chỉ đóng khi user tắt app/tab)
```

## Client Tracking

### Thêm client khi kết nối

```go
// Khi FE mở WebSocket connection
func WsEndpoint(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    client := clientmanager.AddClient(conn, r)
    //        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //        Thêm vào danh sách, gán ID
    go readPump(client)
}
```

Client object thường chứa:

```go
type Client struct {
    ID        string              // ID duy nhất (UUID)
    Conn      *websocket.Conn     // WebSocket connection
    Channels  []string            // Channels đã subscribe
    CreatedAt time.Time           // Thời gian kết nối
    UserAgent string              // Browser info (Chrome, Safari, ...)
    IP        string              // IP address
}
```

**So sánh FE:** Giống quản lý danh sách users trong Redux store, nhưng ở BE quản lý danh sách connections.

### Xóa client khi ngắt kết nối

```go
func readPump(client *Client) {
    defer func() {
        // 1. Xóa client khỏi tất cả channels đã subscribe
        channelmanager.UnsubscribeAll(client)

        // 2. Xóa client khỏi danh sách
        clientmanager.RemoveClient(client)

        // 3. Đóng connection
        client.Conn.Close()

        log.Printf("Client %s disconnected", client.ID)
    }()

    for {
        _, message, err := client.Conn.ReadMessage()
        if err != nil {
            break    // Lỗi đọc = client ngắt → thoát loop → defer cleanup
        }
        // ...
    }
}
```

**Cleanup quan trọng:** Khi client ngắt, PHẢI xóa khỏi tất cả channels. Nếu không, server sẽ cố gửi data tới connection đã đóng → lỗi + memory leak.

## Heartbeat / Ping-Pong

### Vấn đề: "Zombie connections"

Đôi khi client ngắt kết nối mà server không biết:
- User mất mạng (WiFi chết, ra khỏi vùng phủ sóng)
- Browser tab bị OS kill (mobile, ít RAM)
- Firewall/proxy timeout connection

Server vẫn giữ connection → tốn memory → cố broadcast data → lỗi → tốn CPU.

### Giải pháp: Ping-Pong

WebSocket protocol có built-in **Ping/Pong frames**:

```
Server ──PING──→ Client
Server ←──PONG── Client    (trong vòng N giây → OK, connection sống)

Server ──PING──→ Client
Server ←── ... ── (không có PONG) → connection chết → đóng + cleanup
```

```go
// Server gửi ping (minh họa)
func writePump(client *Client) {
    ticker := time.NewTicker(30 * time.Second)    // Mỗi 30 giây
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            // Gửi Ping
            client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
            err := client.Conn.WriteMessage(websocket.PingMessage, nil)
            if err != nil {
                // Client không phản hồi → đóng connection
                return
            }
        }
    }
}

// Setup Pong handler
client.Conn.SetPongHandler(func(string) error {
    // Nhận Pong → reset deadline (connection vẫn sống)
    client.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
    return nil
})
```

### Timeline ví dụ

```
00:00  Client kết nối
00:30  Server PING → Client PONG ✓ (OK)
01:00  Server PING → Client PONG ✓ (OK)
01:15  Client mất mạng (không thông báo)
01:30  Server PING → ... (không có PONG)
01:40  Server timeout (10s) → đóng connection → cleanup
```

Không có Ping-Pong, server có thể giữ zombie connection hàng giờ cho đến khi TCP timeout (mặc định có thể 30 phút - 2 giờ).

### FE cũng cần heartbeat

```typescript
// FE code (thường tự implement)
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: 'ping' }))
  }
}, 30000)

// Hoặc browser tự xử lý WebSocket Ping/Pong frames
// (bạn không cần code, browser auto reply Pong khi nhận Ping)
```

## Cleanup khi disconnect

Khi client ngắt kết nối, server phải dọn dẹp **tất cả tài nguyên**:

```
Client ngắt
    │
    ├── 1. Xóa khỏi channels (channelmanager)
    │       on_model_overviewStock.remove(client)
    │       on_model_overviewIndex.remove(client)
    │
    ├── 2. Xóa khỏi client list (clientmanager)
    │       clients.delete(client.ID)
    │
    ├── 3. Đóng connection
    │       client.Conn.Close()
    │
    └── 4. Free memory
            client = nil (Go garbage collector sẽ thu hồi)
```

**Memory leak phổ biến:** Quên xóa client khỏi channel list. Client đã ngắt nhưng vẫn nằm trong `channels["on_model_overviewStock"]` → mỗi lần broadcast cố gửi cho client chết → error → log spam.

## CCU (Concurrent Connected Users) Limits

### Tại sao cần giới hạn?

Mỗi connection tiêu tốn tài nguyên server:

```
1 connection tiêu tốn khoảng:
├── ~10 KB RAM (connection buffer + metadata)
├── 1 goroutine (~2-8 KB stack)
├── 1 file descriptor (OS limit)
└── CPU cho đọc/ghi messages

10,000 connections:
├── ~100-180 MB RAM
├── 10,000 file descriptors
└── CPU xử lý broadcast cho 10,000 clients

100,000 connections:
├── ~1-1.8 GB RAM
├── 100,000 file descriptors (cần tăng OS limit)
└── Broadcast 1 message = ghi 100,000 lần
```

### Cách giới hạn

```go
// Pattern giới hạn CCU (minh họa)
const MAX_CONNECTIONS = 50000

func WsEndpoint(w http.ResponseWriter, r *http.Request) {
    if clientmanager.Count() >= MAX_CONNECTIONS {
        http.Error(w, "Server full", http.StatusServiceUnavailable)
        return
    }

    conn, _ := upgrader.Upgrade(w, r, nil)
    // ...
}
```

### Scale khi cần nhiều connections hơn

```
1 server: tối đa 50,000 connections
Cần 200,000 connections?

                    ┌───────────────┐
                    │ Load Balancer │
                    └───────┬───────┘
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ WS Server│  │ WS Server│  │ WS Server│
        │   #1     │  │   #2     │  │   #3     │
        │ 50K conn │  │ 50K conn │  │ 50K conn │
        └──────────┘  └──────────┘  └──────────┘
                         ▲
                    Cần message bus (Redis Pub/Sub)
                    để broadcast giữa các servers
```

**Lưu ý:** Khi có nhiều WebSocket servers, broadcast phức tạp hơn vì client A ở server 1 và client B ở server 2. Cần message bus (Redis Pub/Sub hoặc Kafka) để đồng bộ giữa các servers.

## OS-level tuning

Để server chịu được nhiều connections, cần tăng giới hạn OS:

```bash
# Kiểm tra giới hạn file descriptors hiện tại
ulimit -n
# Mặc định: 1024 (chỉ được 1024 connections!)

# Tăng lên 100,000
ulimit -n 100000

# Hoặc cấu hình vĩnh viễn trong /etc/security/limits.conf
*  soft  nofile  100000
*  hard  nofile  100000
```

## Tóm tắt

```
Connection management gồm 4 phần:

1. Client tracking:
   ├── AddClient() khi connect
   ├── RemoveClient() khi disconnect
   └── Lưu metadata: ID, IP, channels, thời gian

2. Heartbeat (Ping-Pong):
   ├── Server gửi PING mỗi 30s
   ├── Client trả PONG trong 10s
   └── Không có PONG → zombie connection → đóng + cleanup

3. Cleanup khi disconnect:
   ├── Xóa khỏi tất cả channels
   ├── Xóa khỏi client list
   ├── Đóng connection
   └── Free memory

4. CCU limits:
   ├── Mỗi connection ~10-20 KB RAM + 1 goroutine + 1 file descriptor
   ├── 1 server: ~50,000 connections
   └── Scale: nhiều servers + message bus
```
