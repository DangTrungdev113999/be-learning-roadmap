# Proto Files -- Hợp đồng giữa các services

## Proto file là gì?

Proto file (`.proto`) là file định nghĩa **cấu trúc dữ liệu** và **API methods** cho gRPC. Nó giống TypeScript interface nhưng dùng cho giao tiếp giữa các services viết bằng ngôn ngữ khác nhau.

```
TypeScript interface   →   dùng trong 1 project
Proto file             →   dùng giữa nhiều projects, nhiều ngôn ngữ
```

## So sánh với TypeScript

```typescript
// TypeScript -- Bạn đã quen
interface TransactionRequest {
  userId: string
  amount: number
  type: string
}

interface TransactionResponse {
  success: boolean
  balance: number
}

// Không có cách native để định nghĩa "service có method gì"
```

```protobuf
// Protobuf -- Tương đương nhưng mạnh hơn
message TransactionRequest {
  string userId = 1;
  double amount = 2;
  string type = 3;
}

message TransactionResponse {
  bool success = 1;
  double balance = 2;
}

// Định nghĩa luôn service và methods
service Wallet {
  rpc createTransaction(TransactionRequest) returns (TransactionResponse);
}
```

## Cú pháp Proto file

### 1. `syntax` -- Phiên bản

```protobuf
syntax = "proto3";    // Luôn dùng proto3 (phiên bản mới nhất)
```

### 2. `package` và `option` -- Metadata

```protobuf
package message.stream;                    // Namespace, tránh trùng tên
option go_package = "message.stream";      // Package name khi generate Go code
```

### 3. `message` -- Kiểu dữ liệu (giống interface)

```protobuf
message ClientProducer {
  string requestId = 1;    // field 1: kiểu string
  string message = 3;      // field 3: kiểu string (số = field number, KHÔNG phải giá trị)
}
```

**Field numbers** (`= 1`, `= 2`, `= 3`): Đây là **thứ tự byte** trong binary, KHÔNG phải giá trị mặc định. Protobuf dùng số này để encode/decode. Một khi đã deploy, **không được thay đổi** field number.

```
Giải thích field number:

TypeScript:   { requestId: "abc", message: "hello" }
                 ↓ chuyển thành JSON string (text)
JSON:         '{"requestId":"abc","message":"hello"}'     → 43 bytes

Protobuf:     field_1="abc" field_3="hello"
                 ↓ chuyển thành binary (dùng field number)
Binary:       0A 03 61 62 63 1A 05 68 65 6C 6C 6F        → 12 bytes
```

### 4. Kiểu dữ liệu

| Proto type | TypeScript tương đương | Ghi chú |
|---|---|---|
| `string` | `string` | UTF-8 |
| `int32` | `number` | Số nguyên 32-bit |
| `int64` | `bigint` | Số nguyên 64-bit |
| `double` | `number` | Số thực 64-bit |
| `bool` | `boolean` | true/false |
| `bytes` | `Buffer` | Binary data |
| `repeated string` | `string[]` | Mảng |

### 5. `service` và `rpc` -- Định nghĩa API

```protobuf
service Wallet {
  rpc changeBalance (changeBalanceRequest) returns (changeBalanceReply);
  //  ^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^         ^^^^^^^^^^^^^^^^^^^
  //  tên method     kiểu dữ liệu input           kiểu dữ liệu output
}
```

Tương đương TypeScript:
```typescript
interface WalletService {
  changeBalance(request: changeBalanceRequest): Promise<changeBalanceReply>
}
```

### 6. `stream` -- Streaming (data chảy liên tục)

```protobuf
service Stream {
  // Cả client và server đều gửi/nhận liên tục
  rpc Producer(stream ClientProducer) returns (stream ServerProducer);
  //           ^^^^^^                         ^^^^^^
  //           client gửi nhiều messages       server trả nhiều messages
}
```

## Proto files thật trong Finpath

### `stream.proto` -- Gửi data vào message queue (Kafka)

```protobuf
syntax= "proto3";

option go_package = "message.stream";

service Stream {
    rpc Producer(stream ClientProducer) returns (stream ServerProducer);
    rpc Consumer(stream ClientConsumer) returns (stream ServerConsumer);
}

message ClientProducer {
    string requestId = 1;
    string message = 3;
}

message ServerProducer {
    string requestId = 1;
    string message = 2;
}

message ClientConsumer{
    string requestId = 1;
    string message = 2;
}

message ServerConsumer {
    string requestId = 1;
    string message = 2;
}
```

**Giải thích:**
- `Producer`: logics gửi data → message_stream → Kafka. Bidirectional stream vì server gửi ack.
- `Consumer`: logics nhận data từ Kafka qua message_stream. Bidirectional stream vì client gửi subscribe request.
- Tất cả message đều có `requestId` (để match request ↔ response) và `message` (JSON string chứa payload thật).

### `pubsub.proto` -- Pub/Sub cho WebSocket broadcast

```protobuf
syntax= "proto3";

package message.stream;
option go_package = "message.stream";

service PubSub {
    rpc Subscriber(stream ClientSubscriber) returns (stream ServerSubscriber);
    rpc Publisher(stream ClientPublisher) returns (stream ServerPublisher);
}

message ClientSubscriber {
    string requestId = 1;
    string message = 2;
}

message ServerSubscriber {
    string requestId = 1;
    string message = 2;
}

message ClientPublisher {
    string requestId = 1;
    string message = 2;
}

message ServerPublisher {
    string requestId = 1;
    string message = 2;
}
```

**Giải thích:**
- `Publisher`: logics publish data → message_stream → data-stream → FE qua WebSocket
- `Subscriber`: logics subscribe channels để nhận data từ message_stream
- Khác với `Stream` ở trên: PubSub dùng cho **broadcast** (1 message → nhiều clients), Stream dùng cho **queue** (1 message → 1 consumer)

### `wallet.proto` -- Gọi wallet service (Unary, không streaming)

```protobuf
syntax= "proto3";

service Wallet {
  rpc changeBalance (changeBalanceRequest) returns (changeBalanceReply) {}
  rpc getWallet (getWalletRequest) returns (getWalletReply) {}
  rpc changeBalanceFromLocking (changeBalanceFromLockingRequest) returns (changeBalanceFromLockingReply) {}
  rpc lockBalance (lockBalanceRequest) returns (lockBalanceReply) {}
}

message changeBalanceRequest {
  string message = 1;
}
message changeBalanceReply {
  string message = 1;
}

message getWalletRequest {
  string message = 1;
}
message getWalletReply {
  string message = 1;
}
```

**Giải thích:**
- Không có `stream` → đây là **Unary RPC** (gọi 1 lần, nhận 1 response -- giống REST)
- Tất cả methods đều dùng pattern `string message = 1` rồi JSON.stringify/parse bên trong. Đây là cách đơn giản hóa: thay vì định nghĩa chi tiết từng field trong proto, dùng 1 field `message` chứa JSON string.

## Pattern đặc biệt: JSON-in-Protobuf

Bạn sẽ thấy một pattern lặp lại trong Finpath:

```protobuf
// Proto file chỉ định nghĩa 1 field "message" kiểu string
message changeBalanceRequest {
  string message = 1;
}
```

```typescript
// Code TypeScript JSON.stringify toàn bộ data vào field "message"
client.changeBalance({
  message: JSON.stringify({ userId, assetId, walletType, volume, reason, metaData })
}, callback)
```

**Tại sao?** Vì khi proto file đã deploy, thay đổi fields rất phiền (phải update cả client lẫn server). Dùng `string message` chứa JSON cho phép thay đổi cấu trúc data mà không cần update proto file.

**Trade-off:** Mất type safety của Protobuf (vì bên trong vẫn là JSON string), nhưng được linh hoạt.

## Tóm tắt

```
Proto file = "hợp đồng" giữa client và server
├── message    = Kiểu dữ liệu (giống TypeScript interface)
├── service    = Nhóm các methods (giống class)
├── rpc        = Method definition (giống function signature)
└── stream     = Data chảy liên tục (không có = gọi 1 lần như REST)

Finpath có 3 nhóm proto files:
├── stream.proto    → Kafka queue (Producer/Consumer)
├── pubsub.proto    → WebSocket broadcast (Publisher/Subscriber)
└── wallet.proto    → Wallet operations (Unary, giống REST)
    notification.proto, social_service/*.proto, lock.proto, ...
```
