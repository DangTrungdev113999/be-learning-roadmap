# HTTP vs WebSocket

## Bạn đã biết WebSocket ở FE

Là FE dev, bạn chắc chắn đã dùng WebSocket để nhận data real-time:

```typescript
// Code FE quen thuộc
const ws = new WebSocket('wss://data-stream.finpath.vn/ws')

ws.onopen = () => {
  ws.send(JSON.stringify({ event: 'subscribe', payload: { channels: ['on_model_overviewStock'] } }))
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  // Cập nhật UI với giá cổ phiếu mới
  updateStockPrice(data)
}
```

Bạn biết cách **dùng** WebSocket. Bây giờ ta sẽ hiểu cách nó hoạt động **ở phía server**.

## HTTP -- Hỏi mới trả lời

HTTP hoạt động theo mô hình **request-response**: client hỏi, server trả lời, xong.

```
Client                                Server
  |                                      |
  |── GET /api/stocks/overview ────────→ |
  |← ── { data: [...] } ──────────────|  (xong, connection đóng)
  |                                      |
  |── GET /api/stocks/overview ────────→ |  (muốn data mới? hỏi lại!)
  |← ── { data: [...] } ──────────────|  (xong, connection đóng)
  |                                      |
  (cứ thế lặp lại...)
```

**Vấn đề với real-time data:**

Giá cổ phiếu thay đổi liên tục. Nếu dùng HTTP:

```
Cách 1: Polling -- FE gọi API liên tục
  setInterval(() => fetch('/api/stocks/overview'), 1000)  // Mỗi 1 giây

  Nhược điểm:
  - 1000 users × 1 req/s = 1000 requests/s (server quá tải)
  - Phần lớn response giống nhau (data chưa thay đổi) → lãng phí bandwidth
  - Delay 0-1 giây (không thật sự real-time)
```

```
Cách 2: Long polling -- FE gọi API, server giữ connection đến khi có data mới
  async function longPoll() {
    const data = await fetch('/api/stocks/stream?timeout=30000')
    updateUI(data)
    longPoll()  // Gọi lại ngay
  }

  Nhược điểm:
  - Vẫn phải gửi HTTP headers mỗi lần (overhead)
  - Server phải giữ nhiều pending connections
  - Phức tạp hơn polling nhưng vẫn chưa optimal
```

## WebSocket -- Giữ đường dây mở

WebSocket mở 1 connection duy nhất, giữ mở, cả 2 bên gửi data bất kỳ lúc nào:

```
Client                                Server
  |                                      |
  |── HTTP Upgrade Request ────────────→ |  (bắt tay: "tôi muốn nâng cấp lên WebSocket")
  |← ── 101 Switching Protocols ───────|  (server đồng ý)
  |                                      |
  |══════ WebSocket Connection ═════════|  (connection MỞ, không đóng)
  |                                      |
  |← ── { stock: "VNM", price: 75000 } |  (server gửi bất kỳ lúc nào)
  |← ── { stock: "FPT", price: 120000 }|
  |── { event: "subscribe", ... } ─────→|  (client cũng gửi bất kỳ lúc nào)
  |← ── { stock: "VNM", price: 75100 } |
  |← ── ... (tiếp tục cho đến khi đóng)|
```

## So sánh chi tiết

| Tiêu chí | HTTP | WebSocket |
|---|---|---|
| Mô hình | Request → Response (1 chiều) | Bidirectional (2 chiều) |
| Connection | Mở rồi đóng mỗi request | Mở 1 lần, giữ suốt |
| Ai khởi tạo | Luôn là client | Cả 2 bên gửi bất kỳ lúc nào |
| Overhead | Headers mỗi request (~200-500 bytes) | Headers chỉ lúc handshake, sau đó ~2-6 bytes/frame |
| Latency | Cao (phải gửi request mới có response) | Thấp (server push ngay khi có data) |
| Dùng cho | CRUD operations (đọc/ghi data) | Real-time data (giá cổ phiếu, chat, game) |

## Quá trình WebSocket Handshake

WebSocket bắt đầu bằng 1 HTTP request thông thường, sau đó "nâng cấp" (upgrade) lên WebSocket:

```
Bước 1: Client gửi HTTP upgrade request
──────────────────────────────────────
GET /ws HTTP/1.1
Host: data-stream.finpath.vn
Upgrade: websocket                    ← "Tôi muốn nâng cấp lên WebSocket"
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZQ==  ← Key ngẫu nhiên để verify
Sec-WebSocket-Version: 13

Bước 2: Server đồng ý upgrade
──────────────────────────────
HTTP/1.1 101 Switching Protocols      ← 101 = đồng ý nâng cấp
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMB...      ← Key được hash lại để confirm

Bước 3: Connection chuyển sang WebSocket protocol
──────────────────────────────────────────────────
(Không còn HTTP headers, chỉ có WebSocket frames)
```

**So sánh FE:** Khi bạn viết `new WebSocket('wss://...')`, browser tự động thực hiện handshake ở trên. Bạn không cần lo. Nhưng ở **server side**, developer phải viết code xử lý upgrade request.

## WebSocket trong hệ thống Finpath

Finpath dùng WebSocket cho 1 mục đích chính: **đẩy data real-time từ server tới FE browser**.

```
Luồng data:

                                 gRPC                    WebSocket
  source_service ──→ message_stream ──→ data-stream ═══════════════ FE Browser
  (giá cổ phiếu)    (message routing)   (WS server)                (React app)
```

FE kết nối WebSocket tới `finpath-data-stream`, subscribe channels, và nhận data liên tục.

**Tại sao không cho FE kết nối gRPC trực tiếp?**
- Browser không hỗ trợ gRPC native (cần gRPC-Web proxy)
- WebSocket được browser hỗ trợ tốt (`new WebSocket(...)` là built-in API)
- WebSocket đơn giản hơn cho FE dev (JSON text, không cần Protobuf)

## Khi nào dùng HTTP, khi nào dùng WebSocket?

```
HTTP cho:
├── CRUD operations (tạo/đọc/sửa/xóa)
├── Authentication (login, register)
├── Upload/download files
├── Bất kỳ gì "gọi 1 lần, nhận 1 response"
└── VD: POST /api/rooms, GET /api/users/profile

WebSocket cho:
├── Real-time data (giá cổ phiếu, crypto, forex)
├── Chat (tin nhắn tức thời)
├── Live notifications (không polling)
├── Collaborative editing (Google Docs)
└── VD: Giá VNM thay đổi → push ngay tới tất cả users đang xem
```

**Quy tắc đơn giản:** Nếu data thay đổi liên tục và FE cần biết ngay → WebSocket. Nếu FE chỉ cần data khi user thao tác → HTTP.

## Tóm tắt

```
HTTP:
  Client ── request ──→ Server ── response ──→ Client (xong, đóng)
  Dùng cho: API thông thường (CRUD, auth, upload)

WebSocket:
  Client ══ persistent connection ══ Server (mở, giữ suốt)
  Cả 2 bên gửi data bất kỳ lúc nào
  Dùng cho: real-time data (giá cổ phiếu, chat)

Finpath:
  FE ←── WebSocket ──── data-stream ←── gRPC ──── message_stream ←── source_service
  FE ←── HTTP (REST) ── logics (CRUD operations)
```

> **Ghi nhớ:** Bạn đã biết dùng WebSocket ở FE. Phần tiếp theo sẽ cho bạn thấy phía server xử lý WebSocket connection như thế nào.
