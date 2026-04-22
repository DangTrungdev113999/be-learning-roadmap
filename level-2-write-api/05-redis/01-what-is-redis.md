# Redis là gì? So sánh localStorage (FE) vs Redis (BE)

## Tình huống

FE gọi API lấy danh sách 50 cổ phiếu. Backend query MongoDB, mất 200ms. Nhưng 10.000 user cùng gọi API này mỗi giây. Query MongoDB 10.000 lần/giây cho cùng dữ liệu?

**Giải pháp:** Lưu kết quả vào Redis, trả ngay trong 1ms. Chỉ query MongoDB 1 lần, cache cho tất cả user.

## Redis là gì?

Redis là **in-memory database** -- dữ liệu lưu trong RAM, không phải ổ cứng. Nhanh hơn MongoDB 10-100 lần.

```
MongoDB: Dữ liệu trên ổ cứng → đọc chậm (1-100ms)
Redis:   Dữ liệu trong RAM    → đọc siêu nhanh (<1ms)
```

## So sánh localStorage (FE) vs Redis (BE)

| Khía cạnh | localStorage | Redis |
|-----------|-------------|-------|
| Chạy ở | Trình duyệt (client) | Server |
| Dung lượng | 5-10 MB | Nhiều GB |
| Chia sẻ | Chỉ 1 user, 1 trình duyệt | Tất cả users, tất cả servers |
| Hết hạn | Không (manual delete) | Tự động (TTL - Time To Live) |
| Kiểu dữ liệu | Chỉ string | String, Hash, List, Set, Sorted Set |
| Mất khi | User xoá browser data | Server restart (có persistence) |
| Tốc độ | Nhanh (cùng máy) | Rất nhanh (RAM, ~1ms qua network) |

### Ví dụ quen thuộc (FE)

```javascript
// FE: localStorage
localStorage.setItem('user_token', 'abc123')
const token = localStorage.getItem('user_token')
localStorage.removeItem('user_token')
```

### Tương đương (BE - Redis)

```typescript
// BE: Redis trong logics
import { pubclient } from 'Redis/client'

await pubclient.set('user:123', JSON.stringify({ name: 'Trung' }))
const data = await pubclient.get('user:123')
await pubclient.del('user:123')
```

## Redis trong logics -- 3 clients

```typescript
// redis/client.ts
import { Redis } from 'ioredis'

const pubclient = new Redis(redisConfig)    // Đọc/ghi chính
const subclient = new Redis(redisConfig)    // Subscribe events
const slaveclient = new Redis(redisSlaveConfig)  // Đọc từ replica
```

### pubclient -- Client chính

Dùng cho hầu hết operations: GET, SET, DEL, rate limiting, caching.

```typescript
// redis/models/user.ts
const set = async (user: User) => {
  const data = { _id: user._id.toString(), roles: user.roles, plan: user.plan }
  return pubclient.set(`user:${user._id}`, JSON.stringify(data))
}

const get = async (_id: string): Promise<UserPayload> => {
  return JSON.parse(await pubclient.get(`user:${_id}`))
}
```

### subclient -- Subscribe events

Dùng cho Pub/Sub pattern (nhận realtime updates).

```typescript
// redis/index.ts
subclient.on('message', (channel, message) => {
  subscribes.forEach((item) => {
    item(channel, message)
  })
})
```

### slaveclient -- Đọc từ replica

Dùng để giảm tải cho server Redis chính. Chỉ đọc, không ghi.

## Redis dùng ở đâu trong logics?

### 1. Cache dữ liệu (56 models!)

```
redis/models/
├── overviewStock.ts      ← Cache giá cổ phiếu
├── overviewIndex.ts      ← Cache chỉ số
├── user.ts               ← Cache thông tin user
├── appConfig.ts          ← Cache cấu hình app
├── socialConfig.ts       ← Cache cấu hình social
├── news.ts               ← Cache tin tức
├── orderbook.ts          ← Cache sổ lệnh
└── ... (56 models tổng cộng)
```

### 2. Rate Limiting

```typescript
// app/Middleware/RateLimit.ts
const rateLimiterRedis = new RateLimiterRedis({
  storeClient: pubclient,  // Dùng Redis để đếm requests
  points: 60,
  duration: 1,
})
```

### 3. OTP (One-Time Password)

```typescript
// redis/otp.ts
setOtp: (id, opt) => {
  return pubclient.set(`otp:${id}`, JSON.stringify(opt), 'EX', 60 * 60)
  //                                                      ^^^^^^^^^^^^^^^^
  //                                                      Tự xoá sau 1 giờ
}
```

### 4. Realtime data (Pub/Sub)

Khi giá cổ phiếu thay đổi, publish event để tất cả subscribers nhận data mới.

## Tại sao không dùng biến JavaScript thay Redis?

```typescript
// Cách 1: Biến JavaScript
const cache = new Map() // Chỉ tồn tại trong 1 process

// Cách 2: Redis
await pubclient.set('key', 'value') // Chia sẻ giữa tất cả processes
```

| Vấn đề | Biến JS | Redis |
|--------|---------|-------|
| Nhiều server instances | Mỗi instance có cache riêng | Chia sẻ 1 cache |
| Server restart | Mất hết data | Data vẫn còn |
| Memory management | Dễ memory leak | Tự quản lý, có TTL |
| Monitoring | Khó | Redis CLI, RedisInsight |

Trong production, logics chạy nhiều instances. Chỉ Redis mới đảm bảo tất cả instances dùng cùng cache.

## Cài đặt Redis để thử

```bash
# macOS
brew install redis
brew services start redis

# Kiểm tra
redis-cli ping
# → PONG
```

## Tổng kết

- Redis = database trong RAM, siêu nhanh
- Trong logics: 3 clients (pubclient, subclient, slaveclient)
- Dùng cho: cache, rate limiting, OTP, realtime pub/sub
- 56 redis models cho các loại dữ liệu khác nhau
- Giống localStorage nhưng mạnh hơn rất nhiều: chia sẻ giữa users/servers, tự hết hạn, nhiều kiểu dữ liệu
