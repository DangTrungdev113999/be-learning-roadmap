# Redis Pub/Sub -- Giao tiếp realtime giữa các services

## Pub/Sub là gì?

**Publish/Subscribe** là pattern giao tiếp: một bên gửi message (publish), nhiều bên nhận (subscribe). Không cần biết ai nhận, chỉ cần gửi vào channel.

So sánh FE:

```
FE:  window.addEventListener('message', handler)     // Subscribe
     window.postMessage(data, '*')                    // Publish

BE:  subclient.subscribe('channel_name')              // Subscribe
     pubclient.publish('channel_name', data)          // Publish
```

## Tại sao cần Pub/Sub?

### Vấn đề: Nhiều server instances

Trong production, logics chạy nhiều instances (2-4 servers). Khi giá cổ phiếu thay đổi, tất cả instances cần biết ngay.

```
        ┌─ Server 1 (nhận data mới)
Data ──►│
Source  └─ Pub/Sub ──► Server 2 (cũng nhận)
                  └──► Server 3 (cũng nhận)
                  └──► Server 4 (cũng nhận)
```

### Nếu không có Pub/Sub

```
Server 1: Cache giá VNM = 80,000
Server 2: Cache giá VNM = 79,500 (data cũ!)
Server 3: Cache giá VNM = 79,500 (data cũ!)
→ User nhìn thấy giá khác nhau tuỳ vào server nào xử lý request
```

## 2 Redis clients cho Pub/Sub

```typescript
// redis/client.ts
const pubclient = new Redis(redisConfig)    // Dùng để PUBLISH
const subclient = new Redis(redisConfig)    // Dùng để SUBSCRIBE
```

**Tại sao 2 client riêng?** Redis client ở chế độ subscribe không thể thực hiện command khác (GET, SET, ...). Nên cần 1 client riêng chỉ để subscribe.

## Cách hoạt động trong logics

### Subscribe (nhận messages)

```typescript
// redis/index.ts
const subscribes: Array<(channel: string, message: any) => void> = []

export function startService() {
  // Lắng nghe tất cả messages từ Redis
  subclient.on('message', (channel, message) => {
    subscribes.forEach((item) => {
      try {
        item(channel, message)
      } catch (e) {
        console.error('ERROR subclient on message', e)
      }
    })
  })

  subclient.on('error', (err) => console.error('REDIS err=', err))
  subclient.on('close', (err) => console.error('REDIS close=', err))
  subclient.on('reconnecting', (err) => console.error('REDIS reconnecting=', err))
}

// Đăng ký callback để nhận message
export function subscribe(param: (channel: string, message: string) => void) {
  subscribes.push(param)
}
```

### Publish (gửi messages)

```typescript
import { pubclient } from 'Redis/client'

// Gửi message đến channel
await pubclient.publish('on_model_overviewStock', JSON.stringify({
  symbol: 'VNM',
  price: 80000,
  volume: 1500000,
}))
```

### Đăng ký subscribe một channel

```typescript
import { subclient, subscribe } from 'Redis/index'

// Subscribe channel
subclient.subscribe('on_model_overviewStock')

// Xử lý khi nhận message
subscribe((channel, message) => {
  if (channel === 'on_model_overviewStock') {
    const data = JSON.parse(message)
    // Cập nhật cache local, emit event, etc.
    console.log(`Stock ${data.symbol} price updated to ${data.price}`)
  }
})
```

## Use case: Cache Invalidation qua Pub/Sub

```typescript
// cacheService/index.ts
eventService.on('cache:clear_prefix', (prefix: string, { sender }: { sender: string }) => {
  if (sender === eventService.uuid) {
    return // Bỏ qua nếu mình tự gửi
  }

  removeCacheByPrefix(prefix, false)
})
```

Flow:

```
Server 1: Admin cập nhật config
  → Xoá cache local
  → Publish event 'cache:clear_prefix' lên Redis

Server 2: Nhận event từ Redis
  → Xoá cache local
  → Lần request tiếp sẽ query DB mới

Server 3: Nhận event từ Redis
  → Xoá cache local (tương tự)
```

## Ví dụ minh hoạ đầy đủ

### Publisher: Cập nhật giá cổ phiếu

```typescript
// Khi nhận được giá mới từ data source
async function onNewStockPrice(symbol: string, price: number) {
  // 1. Cập nhật vào database
  await mongo.stocks.updateOne(
    { symbol },
    { $set: { price, updatedAt: new Date() } },
  )

  // 2. Cập nhật Redis cache
  await pubclient.set(
    `stock:${symbol}`,
    JSON.stringify({ symbol, price }),
    'EX', 30,
  )

  // 3. Publish cho tất cả instances biết
  await pubclient.publish('stock_price_updated', JSON.stringify({
    symbol,
    price,
    timestamp: Date.now(),
  }))
}
```

### Subscriber: Nhận và xử lý

```typescript
// Ở mỗi server instance
subclient.subscribe('stock_price_updated')

subscribe((channel, message) => {
  if (channel === 'stock_price_updated') {
    const { symbol, price } = JSON.parse(message)

    // Cập nhật memory cache
    memoryCache.set(`stock:${symbol}`, { symbol, price })

    // Hoặc gửi realtime cho client qua WebSocket
    io.to(`stock:${symbol}`).emit('price_update', { symbol, price })
  }
})
```

## So sánh Pub/Sub vs Message Queue

| Khía cạnh | Pub/Sub | Message Queue (List) |
|-----------|---------|---------------------|
| Ai nhận | Tất cả subscribers | Chỉ 1 consumer |
| Lưu message | Không (fire and forget) | Có (trong List) |
| Khi nào dùng | Broadcast events | Job processing |
| Ví dụ | "Giá thay đổi" → tất cả biết | "Gửi email" → 1 worker xử lý |

## Error handling

```typescript
// Luôn bắt error khi subscribe
subclient.on('error', (err) => console.error('REDIS err=', err))
subclient.on('close', (err) => console.error('REDIS close=', err))
subclient.on('reconnecting', (err) => console.error('REDIS reconnecting=', err))
subclient.on('end', (err) => console.error('REDIS end=', err))

// Bắt error trong handler
subscribe((channel, message) => {
  try {
    // Xử lý message
  } catch (e) {
    console.error('ERROR processing message', e)
  }
})
```

## Tổng kết

```
Publisher (pubclient)                   Subscriber (subclient)
       │                                       │
       │  publish('channel', data)              │  subscribe('channel')
       │                                       │
       └──────────► Redis Server ──────────────►│
                                               │
                                     on('message', handler)
```

- `pubclient.publish(channel, message)` -- gửi
- `subclient.subscribe(channel)` -- đăng ký nhận
- `subclient.on('message', callback)` -- xử lý khi nhận
- Fire and forget: message không được lưu, nếu subscriber offline thì mất
