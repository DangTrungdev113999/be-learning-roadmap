# gRPC là gì?

## Vấn đề: Services cần nói chuyện với nhau

Trong hệ thống Finpath, **logics** (Node.js) không làm mọi thứ một mình. Nó cần:
- Gọi **wallet service** (Go) để trừ tiền, kiểm tra số dư
- Gọi **notification service** (Go) để gửi SMS, push notification
- Gọi **social service** (Go) để tạo bài viết, lấy feed
- Gửi data real-time qua **message_stream** (Go) để đẩy xuống FE

Câu hỏi: các service này giao tiếp với nhau bằng cách nào?

## Hai cách phổ biến: REST vs gRPC

### REST API -- Gửi thư

Bạn đã biết REST: client gọi `GET /api/stocks`, server trả JSON. Giữa các service cũng có thể gọi REST với nhau. Nhưng nó giống **gửi thư qua bưu điện**:

```
logics muốn trừ tiền user:
1. Viết "thư" JSON: { userId: "abc", amount: 50000 }
2. Gửi qua HTTP: POST http://wallet-service:3000/api/changeBalance
3. Đợi "thư" JSON phản hồi: { success: true, balance: 150000 }
```

**Nhược điểm:**
- Chậm: HTTP/1.1 mỗi request phải mở connection mới (hoặc dùng keep-alive nhưng vẫn tuần tự)
- Nặng: JSON là text, phải parse string → object mỗi lần
- Không có "hợp đồng": Không ai ép kiểu dữ liệu, FE gửi sai field cũng chẳng biết cho đến khi runtime error

### gRPC -- Gọi điện thoại

gRPC giống **gọi điện thoại trực tiếp**:

```
logics muốn trừ tiền user:
1. Gọi trực tiếp: walletClient.changeBalance({ userId: "abc", amount: 50000 })
2. Nhận kết quả ngay: { success: true, balance: 150000 }
```

Nhìn từ code, gRPC giống như gọi một function bình thường. Nhưng function đó thực ra đang chạy ở **một server khác**.

## So sánh nhanh

| Tiêu chí | REST API | gRPC |
|---|---|---|
| Protocol | HTTP/1.1 (text) | HTTP/2 (binary) |
| Format dữ liệu | JSON (text, dễ đọc) | Protobuf (binary, nhỏ gọn) |
| Tốc độ | Chậm hơn | Nhanh hơn ~2-10x |
| Streaming | Không native | Có (bidirectional) |
| Type safety | Không (trừ khi thêm tool) | Có (proto file là contract) |
| Browser support | Có | Hạn chế (cần proxy) |
| Dùng khi | Client ↔ Server (FE ↔ BE) | Server ↔ Server (BE ↔ BE) |

## Tại sao Finpath dùng gRPC giữa các services?

### 1. Nhanh hơn nhiều

HTTP/2 (nền tảng của gRPC) cho phép **multiplexing** -- nhiều request chạy song song trên cùng 1 connection. Không cần mở connection mới cho mỗi request.

```
REST (HTTP/1.1):
Connection 1: ──request──response──────────────────────
Connection 2: ────────────────────request──response────
Connection 3: ──────────────────────────────────request─response──

gRPC (HTTP/2):
Connection 1: ──req1──req2──req3──resp1──resp2──resp3──
              (tất cả trên 1 connection duy nhất)
```

### 2. Protobuf nhỏ hơn JSON

Protobuf encode dữ liệu thành **binary**, nhỏ hơn JSON ~3-10 lần:

```
JSON (72 bytes):
{"userId":"abc123","assetId":"VNM","walletType":"main","volume":"50000"}

Protobuf (~25 bytes):
0A 06 61 62 63 31 32 33 12 03 56 4E 4D 1A 04 6D 61 69 6E 22 05 35 30 30 30 30
```

Khi services gọi nhau hàng triệu lần/ngày, giảm 3-10x kích thước = tiết kiệm bandwidth đáng kể.

### 3. Proto file = hợp đồng giữa 2 bên

Proto file định nghĩa rõ ràng: service nào có method gì, nhận gì, trả gì. Cả 2 bên (client & server) phải tuân theo.

```protobuf
// "Hợp đồng" giữa logics và wallet service
service Wallet {
  rpc changeBalance (changeBalanceRequest) returns (changeBalanceReply);
  //  ^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^          ^^^^^^^^^^^^^^^^^^
  //  tên method     kiểu dữ liệu gửi đi         kiểu dữ liệu nhận về
}
```

Nếu client gửi sai field → lỗi ngay lập tức, không đợi đến runtime.

### 4. Streaming -- Giữ đường dây mở

REST: mỗi lần cần data mới phải gọi lại API.
gRPC: mở 1 stream, data chảy liên tục 2 chiều.

Đây là lý do Finpath dùng gRPC streaming cho real-time data (giá cổ phiếu, orderbook, ...).

## So sánh với FE

Bạn đã dùng **WebSocket** ở FE để nhận data real-time. gRPC streaming tương tự nhưng ở phía server:

```
FE đã biết:
  const ws = new WebSocket('wss://data-stream.finpath.vn')
  ws.onmessage = (event) => { /* nhận data real-time */ }

BE dùng gRPC tương tự:
  const consumer = client.Consumer()
  consumer.on('data', (response) => { /* nhận data real-time */ })
```

Khác biệt:
- WebSocket: FE ↔ Server (browser ↔ data-stream)
- gRPC streaming: Server ↔ Server (logics ↔ message_stream)

## Tóm tắt

```
REST API = Gửi thư (chậm, đơn giản, dùng cho FE ↔ BE)
gRPC     = Gọi điện (nhanh, typed, dùng cho BE ↔ BE)

Finpath dùng gRPC vì:
1. Nhanh (HTTP/2 multiplexing)
2. Nhỏ (Protobuf binary)
3. An toàn (proto file = contract)
4. Streaming (real-time data giữa services)
```

> **Ghi nhớ:** gRPC không thay thế REST. REST vẫn dùng cho FE ↔ BE vì browser hỗ trợ tốt. gRPC dùng cho BE ↔ BE vì nhanh hơn và có type safety.
