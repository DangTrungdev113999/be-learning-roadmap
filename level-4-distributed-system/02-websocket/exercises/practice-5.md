# Bài tập thực hành: WebSocket

## Bài 1: Trace WebSocket Flow

Khi user mở trang "Bảng giá" trên app Finpath, FE gửi:

```typescript
ws.send(JSON.stringify({
  event: 'subscribe',
  payload: { channels: ['on_model_overviewStock', 'on_model_overviewIndex'] }
}))
```

Trả lời:

1. Message này đến server nào? (logics hay data-stream?)
2. Server xử lý message này bằng hàm nào?
3. Sau khi subscribe, khi nào FE nhận data đầu tiên?
4. Data đi qua bao nhiêu services trước khi tới FE?

<details>
<summary>Đáp án</summary>

1. Đến **finpath-data-stream** (WebSocket server, port 9006). Không phải logics.
2. Hàm `readPump()` đọc message, parse JSON, kiểm tra `msg.Event == "subscribe"`, gọi `channelmanager.Subscribe(client, channels)`.
3. FE nhận data khi có **thay đổi giá** tiếp theo. data-stream không gửi data cũ khi subscribe, chỉ gửi data mới từ thời điểm subscribe. (Data cũ/ban đầu thường được load qua REST API riêng.)
4. 5 services: source_service → message_stream → Kafka → logics → message_stream → data-stream → FE. (Nếu tính cả Kafka và Redis thì nhiều hơn.)

</details>

---

## Bài 2: Nhận diện Channel Names

Cho danh sách channels sau, giải thích mỗi channel dùng cho loại data gì:

1. `on_model_overviewStock`
2. `on_model_orderbook`
3. `on_model_overviewCrypto`
4. `on_model_Indexbar`
5. `on_model_reset_historyTrade`
6. `on_model_overviewDomesticGold`

Hãy trả lời thêm:
- Pattern đặt tên channel là gì?
- Channel nào bắt đầu bằng `on_model_reset_` khác gì với channel thường?

<details>
<summary>Đáp án</summary>

1. `on_model_overviewStock` → Giá cổ phiếu tổng quan (1600+ mã VN)
2. `on_model_orderbook` → Sổ lệnh (bid/ask) của cổ phiếu
3. `on_model_overviewCrypto` → Giá cryptocurrency (BTC, ETH, ...)
4. `on_model_Indexbar` → Dữ liệu nến (candlestick) của chỉ số index
5. `on_model_reset_historyTrade` → Reset lịch sử giao dịch (thường chạy đầu phiên giao dịch mới)
6. `on_model_overviewDomesticGold` → Giá vàng trong nước (SJC, PNJ, ...)

Pattern: `on_model_` + tên Redis model (camelCase).

Channel `on_model_reset_*` dùng để thông báo **reset/xóa** data cũ, không phải cập nhật data mới. Ví dụ: đầu phiên giao dịch sáng, lịch sử giao dịch ngày hôm qua cần được xóa.

</details>

---

## Bài 3: Debug Connection Issues

User phản hồi: "Giá cổ phiếu trên app không cập nhật, phải reload trang mới thấy giá mới."

Liệt kê các nguyên nhân có thể xảy ra, từ FE đến BE, theo thứ tự kiểm tra:

1. Kiểm tra gì ở phía FE trước?
2. Kiểm tra gì ở data-stream?
3. Kiểm tra gì ở message_stream / logics?

<details>
<summary>Đáp án</summary>

**1. Kiểm tra FE:**
- WebSocket connection còn mở không? (`ws.readyState === WebSocket.OPEN`?)
- Có subscribe đúng channel không? (Kiểm tra message `subscribe` đã gửi chưa)
- Browser DevTools → Network → WS tab: có thấy messages đến không?
- JavaScript error nào chặn `onmessage` handler không?
- Reconnect logic có hoạt động không? (sau khi mất mạng rồi có lại)

**2. Kiểm tra data-stream:**
- Client có trong danh sách clients không? (clientmanager)
- Client có subscribe channel `on_model_overviewStock` không? (channelmanager)
- Server có nhận data từ message_stream không? (gRPC connection còn sống?)
- Ping-Pong có hoạt động không? (zombie connection?)
- Broadcast có chạy không? (log/metrics)

**3. Kiểm tra message_stream / logics:**
- gRPC connection logics ↔ message_stream còn sống không?
- Publisher trong logics có đang gửi data không? (check logs)
- Consumer có nhận data từ Kafka không?
- source_service có đang gửi data không? (check gRPC stream)
- Kafka có hoạt động không? (check broker health)
- Redis Pub/Sub có hoạt động không?

</details>

---

## Bài 4: So sánh HTTP và WebSocket

Finpath app có 2 loại API cho cổ phiếu:

- REST API: `GET /api/stocks/v3/overview` → Trả về giá tất cả cổ phiếu tại thời điểm hiện tại
- WebSocket channel: `on_model_overviewStock` → Push giá khi có thay đổi

Trả lời:

1. Khi user mở trang "Bảng giá" lần đầu, FE nên gọi REST API hay đợi WebSocket?
2. Nếu 10,000 users cùng xem trang "Bảng giá", dùng HTTP polling mỗi 1 giây thì server nhận bao nhiêu requests/phút?
3. Với WebSocket, 10,000 users tốn bao nhiêu connections?
4. Trong giờ nghỉ trưa (11:30-13:00), sàn đóng cửa, không có data mới. WebSocket có lợi thế gì so với polling lúc này?

<details>
<summary>Đáp án</summary>

1. Gọi **REST API trước** để lấy snapshot giá hiện tại, hiển thị ngay lập tức. Song song đó mở WebSocket subscribe để nhận cập nhật real-time. Nếu chỉ đợi WebSocket, user sẽ thấy trang trống cho đến khi có thay đổi giá đầu tiên.

2. 10,000 users x 1 request/s x 60s = **600,000 requests/phút**. Rất lãng phí vì phần lớn response giống nhau (giá chưa thay đổi).

3. **10,000 connections** (mỗi user 1 connection duy nhất). Tốn ít bandwidth hơn vì chỉ gửi data khi có thay đổi.

4. Lúc nghỉ trưa, không có data mới:
   - **Polling:** Vẫn gửi 600,000 requests/phút, server xử lý 600,000 lần, tất cả response đều giống nhau → lãng phí hoàn toàn.
   - **WebSocket:** Không gửi gì cả (chỉ Ping-Pong mỗi 30s để giữ connection). Server gần như không tốn CPU. Tiết kiệm 99%+ bandwidth.

</details>

---

## Bài 5: Thiết kế Channel cho tính năng mới

Giả sử Finpath muốn thêm tính năng **Live Chat trong Room** (user chat với nhau trong phòng đầu tư). Mỗi room có ID riêng (VD: `room_abc123`).

Thiết kế:

1. Channel name nên đặt như thế nào? (Gợi ý: mỗi room cần channel riêng)
2. Khi user vào room, FE gửi message gì?
3. Khi user gửi chat message, flow là gì? (FE → ... → các FE khác trong room)
4. Khi user rời room, FE gửi message gì?
5. Có vấn đề gì nếu 1 room có 10,000 users cùng chat?

<details>
<summary>Đáp án</summary>

1. Channel name: `on_room_chat_{roomId}`. Ví dụ: `on_room_chat_abc123`. Mỗi room 1 channel riêng để broadcast chỉ tới members trong room.

2. FE gửi:
```json
{ "event": "subscribe", "payload": { "channels": ["on_room_chat_abc123"] } }
```

3. Flow chat message:
```
FE (user A) ──HTTP POST /api/rooms/chat──→ logics
logics xử lý (lưu DB, validate) → publisher.publish("on_room_chat_abc123", message)
logics ──gRPC──→ message_stream ──gRPC──→ data-stream
data-stream broadcast WebSocket tới tất cả clients subscribe "on_room_chat_abc123"
→ FE (user B, C, D, ...) nhận message
```
Lưu ý: Chat message gửi qua HTTP (cần auth, validate), không gửi qua WebSocket (khó validate).

4. FE gửi:
```json
{ "event": "unsubscribe", "payload": { "channels": ["on_room_chat_abc123"] } }
```

5. Vấn đề với 10,000 users/room:
- Mỗi chat message phải broadcast tới 10,000 clients = 10,000 lần ghi WebSocket
- Nếu 100 messages/giây: 100 x 10,000 = 1,000,000 writes/giây → quá tải
- Giải pháp: rate limit chat (VD: max 1 message/giây/user), batch messages, hoặc chỉ gửi cho users đang active (có tab focus)

</details>
