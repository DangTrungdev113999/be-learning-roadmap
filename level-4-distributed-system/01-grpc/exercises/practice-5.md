# Bài tập thực hành: gRPC

## Bài 1: Đọc Proto file

Mở file `services/message_stream/proto/stream.proto` và trả lời:

1. Service `Stream` có bao nhiêu RPC methods?
2. Mỗi method thuộc kiểu gì? (Unary, Server streaming, Client streaming, Bidirectional)
3. `ClientProducer` có bao nhiêu fields? Field numbers là gì?
4. Tại sao `ClientProducer` có field number 1 và **3** (bỏ qua 2)? Điều này có hợp lệ không?

**Gợi ý:** Mở file tại `services/message_stream/proto/stream.proto`

<details>
<summary>Đáp án</summary>

1. 2 methods: `Producer` và `Consumer`
2. Cả 2 đều là **Bidirectional streaming** (cả request và response đều có keyword `stream`)
3. `ClientProducer` có 2 fields: `requestId` (field 1) và `message` (field 3)
4. Hoàn toàn hợp lệ. Field numbers không cần liên tục. Có thể field 2 đã bị xóa trong quá trình phát triển, nhưng không được tái sử dụng field number cũ để tránh xung đột với data đã encode.

</details>

---

## Bài 2: So sánh Unary vs Streaming

Mở 2 file và so sánh cách gọi gRPC:
- `services/wallet/grpc.ts` (Unary)
- `services/message_stream/publisher.ts` (Streaming)

Trả lời:

1. Wallet gọi `client.changeBalance(...)` với bao nhiêu tham số? Tham số cuối cùng là gì?
2. Publisher gọi `call.write(...)`. `call` được tạo từ đâu?
3. Wallet có cần keepalive không? Tại sao?
4. Publisher có `call.on('error', ...)`. Wallet xử lý lỗi bằng cách nào?

<details>
<summary>Đáp án</summary>

1. 2 tham số: `{ message: JSON.stringify(message) }` (request) và callback `(err, result) => { ... }`. Tham số cuối là callback function.
2. `call = getPublisher()` → gọi `clientPubSub.Publisher()` trong `grpc.ts` → tạo bidirectional stream.
3. Không cần. Vì Unary mỗi lần gọi xong connection đóng, không có long-lived connection cần monitor.
4. Wallet xử lý lỗi qua callback: `if (err) { reject(err) }`. Caller dùng `try/catch` hoặc `.catch()` trên Promise.

</details>

---

## Bài 3: Trace luồng gRPC

Khi logics muốn **gửi giá cổ phiếu VNM đã cập nhật** tới FE browser, hãy trace qua từng bước:

1. logics gọi function nào? (file nào, method nào)
2. Data được gửi đi dưới dạng gì? (format message)
3. Data đi qua những services nào trước khi tới FE?
4. Channel name có dạng gì?

**Gợi ý:** Bắt đầu từ `redis/models/overviewStock.ts`, sau đó xem `services/message_stream/publisher.ts`

<details>
<summary>Đáp án</summary>

1. `publisher.publish(channel, message)` trong `services/message_stream/publisher.ts`
2. Data được JSON.stringify rồi gửi qua gRPC: `call.write({ requestId: uuid, message: JSON.stringify({ event: 'publish', payload: { channels: ['on_model_overviewStock'], message: data } }) })`
3. logics → message_stream (gRPC :9000) → finpath-data-stream (gRPC :9006) → FE browser (WebSocket)
4. `on_model_overviewStock` -- pattern: `on_model_` + tên Redis model

</details>

---

## Bài 4: Tìm tất cả gRPC connections

Mở các file config và service, liệt kê tất cả gRPC connections mà logics tạo:

Gợi ý: Kiểm tra các file sau:
- `config/message-stream.ts`
- `config/walletservice.ts`
- `config/notification.ts`
- `config/socialservice.ts`
- `services/*/grpc.ts`

Với mỗi connection, ghi rõ:
- Env variable cho host
- Proto file(s) được load
- Các RPC methods có sẵn
- Unary hay Streaming

<details>
<summary>Đáp án</summary>

| Service | Env Variable | Proto file(s) | Methods | Kiểu |
|---|---|---|---|---|
| message_stream | GRPC_MESSAGE_STREAM_HOST | stream.proto, pubsub.proto | Producer, Consumer, Publisher, Subscriber | Bidirectional streaming |
| wallet | GRPC_WALLET_SERVICE_HOST | wallet.proto | changeBalance, getWallet, changeBalanceFromLocking, lockBalance | Unary |
| notification | GRPC_NOTIFICATION_HOST | notification.proto | sendCodeToPhone, pushNotification, sendEmail, updateUserTags | Unary |
| social_service | GRPC_SOCIAL_SERVICE_HOST | post.proto, expert.proto, hotNews.proto, recommendation.proto, room.proto, channel.proto, feed.proto | (nhiều methods cho mỗi service) | Unary |

</details>

---

## Bài 5: JSON-in-Protobuf pattern

Mở `services/wallet/proto/wallet.proto` và `services/wallet/grpc.ts`.

1. Trong proto file, message `changeBalanceRequest` có bao nhiêu fields? Fields đó là gì?
2. Nhưng trong code TypeScript, function `changeBalance` nhận object có những fields nào? (userId, assetId, ...)
3. Làm sao data có nhiều fields vẫn gửi được qua proto file chỉ có 1 field `string message`?
4. Ưu điểm và nhược điểm của pattern này so với định nghĩa chi tiết từng field trong proto?

<details>
<summary>Đáp án</summary>

1. Chỉ 1 field: `string message = 1;` (các fields cũ như userId, assetId đã bị comment out)
2. Function nhận: `{ root: Request | null, requests: Request[] }` trong đó Request có: userId, assetId, walletType, volume, reason, metaData
3. Toàn bộ object được `JSON.stringify()` thành string, gửi qua field `message`. Server nhận rồi `JSON.parse()` ra lại.
4. **Ưu điểm:** Linh hoạt, thay đổi fields không cần update proto file, deploy đơn giản hơn.
   **Nhược điểm:** Mất type safety của Protobuf (server không validate schema), kích thước lớn hơn binary Protobuf thuần, phải tự xử lý serialize/deserialize.

</details>
