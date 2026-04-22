# Sai lầm thường gặp khi dùng Redis

## 1. Cache Invalidation -- Data cũ (Stale Data)

### Vấn đề

```typescript
// Lưu cache 1 giờ
await pubclient.set('user:123', JSON.stringify(userData), 'EX', 3600)

// Admin thay đổi user role
await mongo.users.updateOne({ _id: '123' }, { $set: { role: 'admin' } })

// Cache vẫn trả role cũ trong 1 giờ!
const cached = await pubclient.get('user:123')
// -> { role: 'member' } (data cũ!)
```

### Giải pháp

```typescript
// Cách 1: Xoá cache khi data thay đổi
await mongo.users.updateOne({ _id: '123' }, { $set: { role: 'admin' } })
await pubclient.del('user:123')  // Xoá cache

// Cách 2: Cập nhật cache ngay (write-through)
await mongo.users.updateOne({ _id: '123' }, { $set: { role: 'admin' } })
const updatedUser = await mongo.users.findOne({ _id: '123' })
await pubclient.set('user:123', JSON.stringify(updatedUser), 'EX', 3600)

// Cách 3: Dùng useCache với revalidation
await cacheService.useCache(
  () => mongo.users.findOne({ _id: '123' }),
  ['user', '123'],
  { maxAge: 300, revalidate: 60, engine: 'memory' },
  // -> Tự revalidate 60 giây trước khi hết hạn
)
```

## 2. Cache Stampede -- Nhiều request cùng lúc

### Vấn đề

```
Giây 0:   Cache hết hạn
Giây 0.001: Request 1 → cache miss → query DB
Giây 0.002: Request 2 → cache miss → query DB
Giây 0.003: Request 3 → cache miss → query DB
...
Giây 0.010: 100 requests → 100 queries DB → DB quá tải!
```

### Giải pháp

```typescript
// SAI -- cache đơn giản, không chống stampede
async function getData(key: string) {
  const cached = await pubclient.get(key)
  if (cached) return JSON.parse(cached)

  const data = await heavyQuery()  // 100 requests gọi cùng lúc!
  await pubclient.set(key, JSON.stringify(data), 'EX', 60)
  return data
}

// ĐÚNG -- dùng useCache có stampede protection
const data = await cacheService.useCache(
  () => heavyQuery(),
  [key],
  { maxAge: 60, revalidate: 10, engine: 'memory' },
  // -> Chỉ 1 request query DB, còn lại đợi kết quả
)
```

## 3. Quên set TTL -- Memory overflow

### Vấn đề

```typescript
// SAI -- không có TTL, key tồn tại mãi mãi
await pubclient.set(`search:${userId}:${query}`, JSON.stringify(results))
// Mỗi user search tạo 1 key mới → triệu keys → hết RAM Redis!
```

### Giải pháp

```typescript
// ĐÚNG -- luôn set TTL
await pubclient.set(`search:${userId}:${query}`, JSON.stringify(results), 'EX', 300)

// Kiểm tra keys không có TTL
// redis-cli: TTL key → nếu trả -1 là không có TTL
```

### Trong logics

```typescript
// redis/otp.ts -- Luôn có EX
setOtp: (id, opt) => {
  return pubclient.set(`otp:${id}`, JSON.stringify(opt), 'EX', 60 * 60)
  //                                                      ^^^^^^^^^^^^^^^^
  //                                                      Luôn có TTL
}
```

## 4. Dùng KEYS trong production

### Vấn đề

```typescript
// SAI -- KEYS scan toàn bộ database, block Redis
const allKeys = await pubclient.keys('user:*')
// Nếu có 1 triệu keys → Redis bị block vài giây → tất cả requests bị chậm
```

### Giải pháp

```typescript
// ĐÚNG -- dùng SCAN (non-blocking, scan từng batch)
async function scanKeys(pattern: string): Promise<string[]> {
  let cursor = '0'
  const keys: string[] = []

  do {
    const [nextCursor, batch] = await pubclient.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = nextCursor
    keys.push(...batch)
  } while (cursor !== '0')

  return keys
}

// Hoặc dùng HSCAN như logics
// redis/hscanall.ts đã dùng HSCAN đúng cách
```

## 5. Lưu object quá lớn

### Vấn đề

```typescript
// SAI -- lưu mảng 10,000 items vào 1 key
const allStocks = await mongo.stocks.find({}).toArray() // 10,000 documents
await pubclient.set('all_stocks', JSON.stringify(allStocks), 'EX', 60)
// JSON.stringify/parse chậm, tốn bandwidth, tốn RAM
```

### Giải pháp

```typescript
// ĐÚNG -- lưu từng item riêng hoặc dùng Hash
for (const stock of stocks) {
  await pubclient.hset('stocks', stock.symbol, JSON.stringify(stock))
}

// Đọc 1 stock
const vnm = JSON.parse(await pubclient.hget('stocks', 'VNM'))

// Hoặc chỉ cache data cần thiết
const summary = allStocks.map(s => ({ symbol: s.symbol, price: s.price }))
await pubclient.set('stocks_summary', JSON.stringify(summary), 'EX', 60)
```

## 6. Không handle Redis down

### Vấn đề

```typescript
// SAI -- Redis down → crash toàn bộ app
const data = await pubclient.get('key')  // Error: ECONNREFUSED
return JSON.parse(data)  // App crash!
```

### Giải pháp

```typescript
// ĐÚNG -- fallback khi Redis down
async function getCachedOrQuery(key: string, queryFn: () => Promise<any>) {
  try {
    const cached = await pubclient.get(key)
    if (cached) return JSON.parse(cached)
  } catch (error) {
    // Redis down → bỏ qua cache, query trực tiếp
    console.error('Redis error, falling back to DB', error)
  }

  return await queryFn()
}
```

Trong logics, `useCache` đã handle:

```typescript
// useCache.ts
try {
  await setCache(key, data, options.engine, options.maxAge + options.revalidate)
} catch (cacheError) {
  log.error({ cacheError, key }, 'Failed to set cache, returning data anyway')
  // Vẫn trả data, không crash
}
```

## 7. Cache key không nhất quán

### Vấn đề

```typescript
// Module A lưu
await pubclient.set('user_123', data)

// Module B đọc (key khác!)
await pubclient.get('user:123')
// -> null (key format khác nhau)
```

### Giải pháp

```typescript
// ĐÚNG -- dùng helper function để tạo key
const getRedisKey = (_id: string): string => `user:${_id}`

// Hoặc dùng useCache với dependencies (tự tạo key)
await cacheService.useCache(handle, ['user', userId], opts)
```

Trong logics, mỗi redis model có `getKeyRedis()`:

```typescript
// redis/models/socialConfig.ts
const getKeyRedis = () => 'social_config'

// redis/models/user.ts
const getRedisKey = (_id: string): string => `user:${_id}`
```

## 8. JSON.parse null/undefined

### Vấn đề

```typescript
const data = await pubclient.get('nonexistent')
// data = null

JSON.parse(data)  // TypeError: Cannot parse null
```

### Giải pháp

```typescript
// ĐÚNG -- kiểm tra trước khi parse
const raw = await pubclient.get('nonexistent')
if (!raw) return null
return JSON.parse(raw)
```

Trong logics:

```typescript
// redis/models/appConfig.ts
const get = async (): Promise<AppConfig> => {
  const raw = await pubclient.get(getKeyRedis())
  if (!raw) return {}  // Trả default nếu null
  return JSON.parse(raw)
}
```

## Checklist khi dùng Redis

- [ ] Mọi key đều có TTL (trừ config vĩnh viễn)
- [ ] Không dùng `KEYS` trong production (dùng `SCAN`)
- [ ] Handle trường hợp Redis down (try/catch + fallback)
- [ ] Kiểm tra null trước `JSON.parse`
- [ ] Dùng helper function tạo key (nhất quán)
- [ ] Không lưu object quá lớn vào 1 key
- [ ] Dùng stampede protection cho heavy queries
- [ ] Xoá cache khi data thay đổi (invalidation)

## Bài tập

Tìm lỗi trong đoạn code sau và sửa:

```typescript
async function getUserProfile(userId: string) {
  const data = await pubclient.get(`user_${userId}`)
  const profile = JSON.parse(data)

  if (!profile) {
    const dbProfile = await mongo.users.findOne({ _id: userId })
    await pubclient.set(`user:${userId}`, JSON.stringify(dbProfile))
    return dbProfile
  }

  return profile
}
```

<details>
<summary>Đáp án -- 4 lỗi</summary>

1. `JSON.parse(data)` khi data có thể null -> kiểm tra `if (!data)` trước
2. Key không nhất quán: đọc `user_${userId}`, ghi `user:${userId}`
3. SET không có TTL -> thêm `'EX', 3600`
4. Không handle Redis error -> wrap trong try/catch

```typescript
async function getUserProfile(userId: string) {
  const key = `user:${userId}` // Nhất quán

  try {
    const raw = await pubclient.get(key)
    if (raw) return JSON.parse(raw) // Kiểm tra null
  } catch (error) {
    console.error('Redis error', error)
  }

  const dbProfile = await mongo.users.findOne({ _id: userId })
  if (dbProfile) {
    try {
      await pubclient.set(key, JSON.stringify(dbProfile), 'EX', 3600) // Có TTL
    } catch (error) {
      console.error('Redis set error', error)
    }
  }
  return dbProfile
}
```

</details>
