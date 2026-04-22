# Cách logics tạo gRPC Client

## Tổng quan

Để gọi gRPC, logics cần tạo **client** -- object có các methods tương ứng với proto file. Quá trình tạo client gồm 4 bước:

```
Proto file (.proto)  →  Load & Parse  →  Tạo client  →  Gọi methods
```

## Code thật: `services/message_stream/grpc.ts`

```typescript
import path from 'path'
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
import messageStreamConfig from 'Config/message-stream'

// Bước 1: Tìm proto file
const STREAM_PROTO_PATH = path.join(__dirname, './proto/stream.proto')
const PUBSUB_PROTO_PATH = path.join(__dirname, './proto/pubsub.proto')

// Bước 2: Load proto file thành package definition
const packageDefinitionStream = protoLoader.loadSync(STREAM_PROTO_PATH)
const protoDescriptorStream = grpc.loadPackageDefinition(packageDefinitionStream)

const packageDefinitionPubSub = protoLoader.loadSync(PUBSUB_PROTO_PATH)
const protoDescriptorPubSub = grpc.loadPackageDefinition(packageDefinitionPubSub)

// Bước 3: Lấy service class từ descriptor
const stream = protoDescriptorStream[messageStreamConfig.stream] as any           // 'Stream'
const pubsub = protoDescriptorPubSub['message']['stream'][messageStreamConfig.pubsub]  // 'PubSub'

// Bước 4: Tạo client với host + credentials + options
const clientStream = new stream(messageStreamConfig.grpc_host, grpc.credentials.createInsecure(), {
  'grpc.keepalive_time_ms': 15000,
  'grpc.keepalive_timeout_ms': 5000,
})

const clientPubSub = new pubsub(messageStreamConfig.grpc_host, grpc.credentials.createInsecure(), {
  'grpc.keepalive_time_ms': 15000,
  'grpc.keepalive_timeout_ms': 5000,
})

// Export factory functions
export function getConsumer() {
  return clientStream.Consumer()    // Tạo bidirectional stream
}

export function getPublisher() {
  return clientPubSub.Publisher()   // Tạo bidirectional stream
}

export function getSubscriber() {
  return clientPubSub.Subscriber()  // Tạo bidirectional stream
}
```

## Giải thích từng bước

### Bước 1: Tìm proto file

```typescript
const STREAM_PROTO_PATH = path.join(__dirname, './proto/stream.proto')
```

Proto file nằm cùng folder với code. `__dirname` là folder hiện tại (`services/message_stream/`).

```
services/message_stream/
├── grpc.ts              ← file này
├── publisher.ts
├── subscriber.ts
├── consumer.ts
└── proto/
    ├── stream.proto     ← proto file
    └── pubsub.proto     ← proto file
```

### Bước 2: Load proto file

```typescript
const packageDefinition = protoLoader.loadSync(STREAM_PROTO_PATH)
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition)
```

`loadSync` đọc file `.proto` và parse thành JavaScript object. `loadPackageDefinition` chuyển nó thành object có các **service constructors**.

So sánh với FE:
```typescript
// FE: import module từ file
import { UserService } from './api/userService'

// BE gRPC: "import" service từ proto file
const protoDescriptor = grpc.loadPackageDefinition(protoLoader.loadSync('./proto/wallet.proto'))
const WalletService = protoDescriptor['Wallet']
```

### Bước 3: Lấy service class

```typescript
// stream.proto không có package → service nằm ở root
const stream = protoDescriptorStream['Stream']

// pubsub.proto có "package message.stream" → phải truy cập qua namespace
const pubsub = protoDescriptorPubSub['message']['stream']['PubSub']
```

Khi proto file có `package message.stream;`, service class nằm trong nested object `['message']['stream']`. Không có package thì nằm ở root.

### Bước 4: Tạo client

```typescript
const client = new stream(
  messageStreamConfig.grpc_host,        // 'localhost:9000' hoặc 'message-stream:9000'
  grpc.credentials.createInsecure(),    // Không mã hóa (dùng nội bộ)
  {
    'grpc.keepalive_time_ms': 15000,    // Gửi ping mỗi 15 giây
    'grpc.keepalive_timeout_ms': 5000,  // Timeout nếu không nhận pong trong 5 giây
  }
)
```

**3 tham số quan trọng:**

#### a) Host (`grpc_host`)

```typescript
// config/message-stream.ts
const config = {
  grpc_host: Env.get('GRPC_MESSAGE_STREAM_HOST'),  // VD: 'message-stream:9000'
  stream: 'Stream',
  pubsub: 'PubSub',
}
```

Host đọc từ environment variable. Trong Docker/Kubernetes, các service tìm nhau bằng **service name** (VD: `message-stream:9000`).

#### b) Credentials (`createInsecure()`)

```typescript
grpc.credentials.createInsecure()   // Không TLS, plaintext
grpc.credentials.createSsl()        // Có TLS, encrypted (dùng cho production qua internet)
```

`createInsecure()` vì các services chạy trong cùng **private network** (Docker network hoặc Kubernetes cluster). Traffic không ra internet nên không cần mã hóa.

#### c) Keepalive options

```typescript
{
  'grpc.keepalive_time_ms': 15000,      // Mỗi 15 giây, gửi 1 PING frame
  'grpc.keepalive_timeout_ms': 5000,    // Nếu 5 giây không nhận PONG, coi là mất kết nối
}
```

**Tại sao cần keepalive?** Vì gRPC dùng persistent connection (HTTP/2). Nếu server restart hoặc network bị ngắt, client không biết cho đến khi gửi request tiếp. Keepalive giúp phát hiện connection chết sớm.

```
Không có keepalive:
Client ──────────────── (server chết) ────── gửi request → TIMEOUT (30s+ mới biết)

Có keepalive (15s):
Client ──PING── PONG ──PING── (server chết) ──PING── ??? → biết ngay trong 20s
```

## So sánh các gRPC clients trong Finpath

### Wallet service -- Unary (giống REST)

```typescript
// services/wallet/grpc.ts
const client = new walletservice(
  walletserviceConfig.grpc_host,           // GRPC_WALLET_SERVICE_HOST
  grpc.credentials.createInsecure()
  // Không có keepalive vì Unary (gọi xong đóng, không giữ stream)
)

// Gọi method giống REST call
function changeBalance(message) {
  return new Promise((resolve, reject) => {
    client.changeBalance(
      { message: JSON.stringify(message) },
      (err, result) => {             // Callback pattern (cũ)
        if (err) reject(err)
        else resolve(result)
      }
    )
  })
}
```

### Notification service -- Unary

```typescript
// services/notification/grpc.ts
const client = new notification(
  notificationConfig.grpc_notification_host,   // GRPC_NOTIFICATION_HOST
  grpc.credentials.createInsecure()
)

function pushNotification(data) {
  return new Promise((resolve, reject) => {
    client.pushNotification(data, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}
```

### Social service -- Unary, nhiều proto files

```typescript
// services/social_service/grpc.ts
// Load 7 proto files khác nhau cho 7 services
const PostServiceProtoPath = path.join(__dirname, './proto/post.proto')
const ExpertServiceProtoPath = path.join(__dirname, './proto/expert.proto')
const HotNewsServiceProtoPath = path.join(__dirname, './proto/hotNews.proto')
// ... feed.proto, room.proto, channel.proto, recommendation.proto

// Tạo 7 clients
const postClient = new PostService(config.grpc_host, grpc.credentials.createInsecure())
const expertClient = new ExpertService(config.grpc_host, grpc.credentials.createInsecure())
// ...
```

### Message stream -- Bidirectional streaming

```typescript
// services/message_stream/grpc.ts
const clientStream = new stream(
  messageStreamConfig.grpc_host,
  grpc.credentials.createInsecure(),
  {
    'grpc.keepalive_time_ms': 15000,     // CÓ keepalive vì stream sống lâu
    'grpc.keepalive_timeout_ms': 5000,
  }
)

// Tạo stream (connection sống suốt vòng đời app)
export function getConsumer() {
  return clientStream.Consumer()         // Trả về stream object, không phải Promise
}
```

## Pattern nhất quán

Tất cả gRPC clients trong Finpath đều theo cùng pattern:

```
1. Load proto file      → protoLoader.loadSync(path)
2. Parse definition     → grpc.loadPackageDefinition(packageDefinition)
3. Lấy service class    → protoDescriptor['ServiceName']
4. Tạo client instance  → new ServiceClass(host, credentials, options?)
5. Gọi methods          → client.methodName(request, callback) hoặc client.methodName()
```

## Tóm tắt

```
Tạo gRPC client trong Node.js cần 2 packages:
├── @grpc/proto-loader   → Đọc .proto file
└── @grpc/grpc-js        → Tạo client, kết nối, gọi methods

Config quan trọng:
├── grpc_host            → Địa chỉ server (từ env variable)
├── credentials          → createInsecure() cho internal network
└── keepalive            → 15s ping / 5s timeout (cho streaming)

Finpath có 4+ gRPC clients:
├── message_stream  → Streaming (keepalive, bidirectional)
├── wallet          → Unary (gọi 1 lần)
├── notification    → Unary (gửi SMS, push)
└── social_service  → Unary (7 proto files, 7 clients)
```
