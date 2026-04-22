# gRPC Error Handling & Reconnection

## gRPC Error Codes

gRPC có bộ **status codes** chuẩn (giống HTTP status codes nhưng cho gRPC):

| Code | Tên | Ý nghĩa | Tương đương HTTP |
|---|---|---|---|
| 0 | OK | Thành công | 200 |
| 1 | CANCELLED | Client hủy request | 499 |
| 2 | UNKNOWN | Lỗi không xác định | 500 |
| 3 | INVALID_ARGUMENT | Tham số sai | 400 |
| 4 | DEADLINE_EXCEEDED | Timeout | 504 |
| 5 | NOT_FOUND | Không tìm thấy | 404 |
| 7 | PERMISSION_DENIED | Không có quyền | 403 |
| 8 | RESOURCE_EXHAUSTED | Rate limit / hết tài nguyên | 429 |
| 13 | INTERNAL | Lỗi server nội bộ | 500 |
| 14 | UNAVAILABLE | Server không sẵn sàng | 503 |
| 16 | UNAUTHENTICATED | Chưa xác thực | 401 |

**Hay gặp nhất trong Finpath:**
- **14 UNAVAILABLE**: Server đang restart, network bị ngắt
- **4 DEADLINE_EXCEEDED**: Server xử lý quá lâu
- **13 INTERNAL**: Bug ở server

## Xử lý lỗi trong Unary RPC (Wallet, Notification)

Unary RPC dùng callback pattern, lỗi đến qua tham số `err`:

```typescript
// services/wallet/grpc.ts
function changeBalance(message) {
  return new Promise((resolve, reject) => {
    client.changeBalance(
      { message: JSON.stringify(message) },
      (err, result) => {
        if (err) {
          // err.code = gRPC status code (VD: 14 = UNAVAILABLE)
          // err.message = mô tả lỗi
          // err.details = chi tiết thêm
          reject(err)        // Reject Promise → caller phải catch
          return
        }
        resolve(result)
      }
    )
  })
}
```

Caller xử lý:
```typescript
try {
  await wallet.changeBalance({ ... })
} catch (error) {
  // error.code === 14 → wallet service đang down
  // error.code === 4 → request timeout
  log.error({ error }, 'wallet changeBalance failed')
  throw 'Lỗi hệ thống, vui lòng thử lại code:wallet_error'
}
```

## Xử lý lỗi trong Streaming RPC (Message Stream)

Streaming phức tạp hơn vì connection sống lâu. Lỗi có thể xảy ra **bất kỳ lúc nào**:

```typescript
// services/message_stream/publisher.ts
const call = getPublisher()

// Stream events (giống EventEmitter)
call.on('data', (data) => {
  // Nhận data bình thường
})

call.on('error', (error) => {
  // Stream bị lỗi!
  // error.code = 14 (UNAVAILABLE) → server restart
  // error.code = 13 (INTERNAL) → bug ở server
  log.error({ error }, 'publisher error')
})

call.on('end', () => {
  // Server đóng stream (graceful shutdown)
})
```

## Keepalive -- Phát hiện connection chết

Không có keepalive, client có thể không biết server đã chết cho đến khi gửi request tiếp theo:

```
Không có keepalive:
  Client ────── (server chết lúc 10:00) ────── gửi data lúc 10:05 → TIMEOUT → mất 5 phút data!

Có keepalive (15s):
  Client ──PING(10:00:00)──PONG──PING(10:00:15)── (server chết 10:00:20)
  ──PING(10:00:30)── ??? (5s timeout) → phát hiện lỗi lúc 10:00:35 → mất tối đa 20s data
```

### Cấu hình keepalive trong Finpath

```typescript
// services/message_stream/grpc.ts
const clientStream = new stream(messageStreamConfig.grpc_host, grpc.credentials.createInsecure(), {
  'grpc.keepalive_time_ms': 15000,        // Gửi PING mỗi 15 giây
  'grpc.keepalive_timeout_ms': 5000,      // Đợi PONG tối đa 5 giây
})
```

**Giải thích:**
- Mỗi 15 giây, client gửi 1 HTTP/2 PING frame
- Server phải trả PONG trong 5 giây
- Nếu không nhận PONG → connection coi như chết → trigger event `error`

### Các tham số keepalive khác (không dùng trong Finpath nhưng nên biết)

```typescript
{
  'grpc.keepalive_time_ms': 15000,              // Interval gửi PING
  'grpc.keepalive_timeout_ms': 5000,            // Timeout đợi PONG
  'grpc.keepalive_permit_without_calls': 1,     // Gửi PING ngay cả khi không có request
  'grpc.http2.min_time_between_pings_ms': 10000, // Thời gian tối thiểu giữa 2 PING
  'grpc.max_reconnect_backoff_ms': 30000,       // Max delay khi reconnect
}
```

## Reconnection Pattern

Khi gRPC stream bị đứt (server restart, network issue), client cần **tự động kết nối lại**:

### Pattern cơ bản: Exponential Backoff

```typescript
// Pattern tổng quát (minh họa)
function connectWithRetry(maxRetries = 10) {
  let retryCount = 0

  function connect() {
    const call = client.Producer()

    call.on('data', (data) => {
      retryCount = 0    // Reset counter khi nhận data thành công
      handleData(data)
    })

    call.on('error', (error) => {
      log.error({ error }, 'Stream error, reconnecting...')

      retryCount++
      if (retryCount > maxRetries) {
        log.error('Max retries exceeded, giving up')
        return
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, ... (tối đa 30s)
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
      setTimeout(connect, delay)
    })

    call.on('end', () => {
      log.warn('Stream ended, reconnecting...')
      setTimeout(connect, 1000)
    })
  }

  connect()
}
```

### Tại sao dùng Exponential Backoff?

```
Nếu retry ngay lập tức:
  Server chết → 100 clients retry cùng lúc → server vừa lên lại bị overwhelm → chết lại
  → vòng lặp vô hạn (thundering herd)

Exponential backoff:
  Client 1: retry sau 1s
  Client 2: retry sau 2s
  Client 3: retry sau 4s
  → server có thời gian phục hồi
```

## Xử lý lỗi trong thực tế: Publisher

```typescript
// services/message_stream/publisher.ts (code thật)
const call = getPublisher()

call.on('data', (data) => {
  try {
    const { ack, payload } = JSON.parse(data.message)
    const callback = requests.get(ack)
    requests.delete(ack)
    callback && callback({ ...payload })
  } catch (error) {
    log.error({ error }, 'publisher data error')    // Parse lỗi → log, không crash
  }
})

call.on('error', (error) => {
  log.error({ error }, 'publisher error')    // Log lỗi
  // Hiện tại Finpath chỉ log, không auto-reconnect
  // (vì khi deploy bằng Docker/K8s, container sẽ tự restart)
})
```

**Tại sao không có reconnect logic?** Vì trong môi trường Docker/Kubernetes:
- Khi process crash → container tự restart
- Health check phát hiện service unhealthy → restart container
- Không cần tự reconnect trong code, infrastructure lo

## So sánh với FE WebSocket error handling

```typescript
// FE WebSocket (bạn đã biết)
const ws = new WebSocket('wss://data-stream.finpath.vn')

ws.onclose = () => {
  // Reconnect sau 3 giây
  setTimeout(() => {
    ws = new WebSocket('wss://data-stream.finpath.vn')
  }, 3000)
}

ws.onerror = (error) => {
  console.error('WebSocket error:', error)
}
```

```typescript
// BE gRPC streaming (tương tự!)
const call = client.Producer()

call.on('error', (error) => {
  log.error({ error }, 'gRPC error')
  // Reconnect...
})

call.on('end', () => {
  // Server đóng connection, reconnect...
})
```

Pattern gần như giống hệt. Khác biệt chính:
- FE: phải tự reconnect vì browser không tự restart
- BE: có thể dựa vào Docker/K8s restart container

## Monitoring và Alerting

Khi gRPC bị lỗi, ngoài log còn cần **alert** để team biết:

```typescript
// Pattern trong Finpath (gửi alert qua Slack)
call.on('error', (error) => {
  log.error({ error }, 'publisher error')

  // Gửi alert nếu lỗi nghiêm trọng
  if (error.code === 14) {  // UNAVAILABLE
    // slack.sendAlert('gRPC message_stream unavailable!')
  }
})
```

## Tóm tắt

```
Error handling trong gRPC:

1. Unary (wallet, notification):
   └── Lỗi đến qua callback err → reject Promise → caller catch

2. Streaming (message_stream):
   └── Lỗi đến qua call.on('error') → log + reconnect (hoặc container restart)

3. Keepalive:
   └── Gửi PING mỗi 15s, timeout 5s → phát hiện connection chết sớm

4. Reconnection:
   └── Exponential backoff: 1s, 2s, 4s, 8s... (tránh thundering herd)
   └── Trong Docker/K8s: container tự restart, không cần reconnect trong code

Error codes hay gặp:
   ├── 14 UNAVAILABLE → Server down, network lỗi
   ├── 4 DEADLINE_EXCEEDED → Timeout
   └── 13 INTERNAL → Bug ở server
```
