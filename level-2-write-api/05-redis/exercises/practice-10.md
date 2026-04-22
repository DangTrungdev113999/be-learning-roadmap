# 10 bài thực hành Redis (dễ đến khó)

## Hướng dẫn chung

- Bài 1-4: Dùng `redis-cli` trực tiếp
- Bài 5-10: Viết TypeScript (tạo file `.ts` và `.spec.ts`)
- Chạy test: `rm -f tests/run-failed-tests.json && node ace test unit --files <path>`

---

## Bài 1: CRUD cơ bản (Dễ)

Mở `redis-cli` và thực hiện:

1. SET key `app:version` giá trị `"2.5.0"`
2. GET lại để xác nhận
3. SET key `app:version` giá trị `"2.6.0"` (ghi đè)
4. GET lại, xác nhận giá trị mới
5. DEL key `app:version`
6. GET lại, xác nhận trả `nil`

---

## Bài 2: TTL và EXPIRE (Dễ)

1. SET key `session:abc` giá trị `"active"` với TTL 30 giây: `SET session:abc "active" EX 30`
2. Chạy `TTL session:abc` vài lần, quan sát giá trị giảm dần
3. SET key `permanent:data` giá trị `"forever"` (không TTL)
4. Dùng `EXPIRE permanent:data 60` để thêm TTL 60 giây
5. Chạy `TTL permanent:data` để xác nhận

---

## Bài 3: Hash (Dễ)

Lưu thông tin cổ phiếu VNM dưới dạng Hash:

1. `HSET stock:VNM name "Vinamilk" price "80000" volume "1500000" exchange "HOSE"`
2. `HGET stock:VNM price` -- lấy giá
3. `HGETALL stock:VNM` -- lấy tất cả
4. `HSET stock:VNM price "81000"` -- cập nhật giá
5. `HDEL stock:VNM exchange` -- xoá field
6. `HEXISTS stock:VNM name` -- kiểm tra field tồn tại

---

## Bài 4: List, Set, và Sorted Set (Dễ)

### List -- Queue thông báo

```bash
RPUSH notifications "Bạn có tin nhắn mới"
RPUSH notifications "Đơn hàng #123 đã xử lý"
RPUSH notifications "Cổ phiếu VNM đạt giá mục tiêu"
LRANGE notifications 0 -1
LPOP notifications
LLEN notifications
```

### Set -- Online users

```bash
SADD online user1 user2 user3 user4 user5
SCARD online
SISMEMBER online user3
SREM online user2 user4
SMEMBERS online
```

### Sorted Set -- Leaderboard

```bash
ZADD top_traders 95.5 "trader_A"
ZADD top_traders 88.2 "trader_B"
ZADD top_traders 92.1 "trader_C"
ZADD top_traders 78.9 "trader_D"
ZADD top_traders 99.0 "trader_E"
ZREVRANGE top_traders 0 2 WITHSCORES
```

---

## Bài 5: Cache-aside pattern (Trung bình)

Viết function `cachedFindOne<T>(collection, filter, cacheKey, ttlSeconds)`:

```typescript
// Sử dụng
const user = await cachedFindOne(mongo.users, { _id: '123' }, 'user:123', 3600)
```

**Yêu cầu:**
- Kiểm tra Redis trước, nếu có trả cache
- Nếu không, query MongoDB, lưu Redis, trả data
- Handle null (document không tồn tại)
- Handle JSON.parse error

**Test cases:**
- Cache miss -> query DB -> lưu cache -> trả data
- Cache hit -> trả cache, không query DB (dùng callCount)
- Document không tồn tại -> trả null, không lưu cache

---

## Bài 6: Rate limiter bằng Redis (Trung bình)

Viết function `checkRateLimit(key, maxRequests, windowSeconds)`:

```typescript
const allowed = await checkRateLimit('ip:192.168.1.1', 60, 60)
// -> true nếu chưa vượt 60 requests/60 giây
// -> false nếu đã vượt
```

**Gợi ý:** Dùng `INCR` + `EXPIRE`

```typescript
async function checkRateLimit(key: string, max: number, window: number): Promise<boolean> {
  const count = await pubclient.incr(`ratelimit:${key}`)
  if (count === 1) {
    await pubclient.expire(`ratelimit:${key}`, window)
  }
  return count <= max
}
```

**Test cases:**
- Gọi 60 lần -> tất cả trả true
- Gọi lần 61 -> trả false
- Key khác nhau -> counter riêng biệt
- Sau khi window hết -> cho phép lại (cần await setTimeout)

---

## Bài 7: Pub/Sub đơn giản (Trung bình)

Viết 2 functions: `publishEvent(channel, data)` và `subscribeToChannel(channel, handler)`.

```typescript
// Subscribe
subscribeToChannel('stock_update', (data) => {
  console.log(`${data.symbol} -> ${data.price}`)
})

// Publish
await publishEvent('stock_update', { symbol: 'VNM', price: 80000 })
```

**Test cases:**
- Publish -> subscriber nhận đúng data
- Nhiều subscribers -> tất cả nhận
- Channel khác -> không nhận

---

## Bài 8: Session Store (Khó)

Viết class `RedisSessionStore` với methods:

```typescript
class RedisSessionStore {
  async create(userId: string): Promise<string>  // Tạo session, trả sessionId
  async get(sessionId: string): Promise<SessionData | null>  // Lấy session
  async update(sessionId: string, data: Partial<SessionData>): Promise<void>  // Cập nhật
  async destroy(sessionId: string): Promise<void>  // Xoá session
  async getUserSessions(userId: string): Promise<string[]>  // Lấy tất cả sessions của user
}
```

**Gợi ý:**
- Session data lưu dạng Hash: `HSET session:{id} userId "123" createdAt "2026-01-01"`
- User sessions lưu dạng Set: `SADD user_sessions:123 sessionId1 sessionId2`
- TTL cho mỗi session: 24 giờ

**Test cases:**
- Tạo session -> get lại đúng data
- Destroy session -> get trả null
- 1 user có nhiều sessions -> getUserSessions trả tất cả
- Session hết hạn -> tự động null

---

## Bài 9: Leaderboard realtime (Khó)

Viết class `Leaderboard` dùng Sorted Set:

```typescript
class Leaderboard {
  async addScore(playerId: string, score: number): Promise<void>
  async getTopN(n: number): Promise<Array<{ playerId: string, score: number }>>
  async getRank(playerId: string): Promise<number | null>  // 1-based
  async removePlayer(playerId: string): Promise<void>
  async getPlayerScore(playerId: string): Promise<number | null>
  async getTotal(): Promise<number>
}
```

**Test cases:**
- Thêm 10 players -> getTopN(3) trả đúng top 3
- addScore 2 lần cho cùng player -> score được cập nhật (không duplicate)
- getRank trả rank chính xác (1 = cao nhất)
- removePlayer -> không còn trong leaderboard
- Player không tồn tại -> getRank trả null

---

## Bài 10: Cache với Stampede Protection (Rất khó)

Viết function `smartCache(key, handle, options)` mô phỏng lại useCache:

```typescript
type Options = {
  maxAge: number      // giây
  engine: 'memory' | 'redis'
}

async function smartCache<T>(
  key: string,
  handle: () => Promise<T>,
  options: Options,
): Promise<T>
```

**Yêu cầu:**
1. Cache miss -> gọi handle, lưu kết quả
2. Cache hit -> trả cache, không gọi handle
3. Stampede protection: 10 request đồng thời -> handle chỉ chạy 1 lần
4. TTL hết -> gọi handle lại
5. handle throw error -> tất cả pending requests nhận error

**Gợi ý:** Dùng `Map<string, Promise<T>>` làm deferred map:

```typescript
const pendingMap = new Map<string, Promise<any>>()

async function smartCache(key, handle, options) {
  // Kiểm tra cache...

  // Kiểm tra có pending request không
  if (pendingMap.has(key)) {
    return pendingMap.get(key)
  }

  // Tạo promise và lưu vào map
  const promise = handle().then(async (data) => {
    await setCache(key, data, options)
    pendingMap.delete(key)
    return data
  }).catch((error) => {
    pendingMap.delete(key)
    throw error
  })

  pendingMap.set(key, promise)
  return promise
}
```

**Test pattern từ useCache.spec.ts:**

```typescript
test('stampede protection', async ({ assert }) => {
  let callCount = 0
  const handle = async () => {
    callCount++
    await new Promise(r => setTimeout(r, 100))
    return { data: 'test' }
  }

  const promises = Array(10).fill(null).map(() =>
    smartCache('key', handle, { maxAge: 60, engine: 'memory' })
  )

  const results = await Promise.all(promises)
  assert.equal(callCount, 1)
  results.forEach(r => assert.deepEqual(r, { data: 'test' }))
})
```

---

## Gợi ý chung

- Bài 1-4: Thực hành trên redis-cli, quen commands
- Bài 5-6: Áp dụng patterns đã học, viết TypeScript + test
- Bài 7: Hiểu Pub/Sub qua code
- Bài 8-9: Kết hợp nhiều data types
- Bài 10: Hiểu sâu caching logic, tham khảo `useCache.spec.ts`
