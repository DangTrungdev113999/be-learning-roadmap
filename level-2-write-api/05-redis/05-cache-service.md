# useCache() trong logics -- Hệ thống cache thông minh

## Tổng quan

`cacheService.useCache()` là function caching chính trong logics. Nó không chỉ cache đơn giản mà còn có:
- **3 engine**: memory, redis, memcached
- **Revalidation**: tự động làm mới cache khi sắp hết hạn
- **Stampede protection**: chống nhiều request đồng thời query database

## Cách dùng cơ bản

```typescript
import { cacheService } from 'App/Services/cacheService'

// Cache kết quả query, lưu 60 giây
const data = await cacheService.useCache(
  () => mongo.stocks.find({}).toArray(),    // handle: function cần cache
  ['stocks', 'all'],                        // dependencies: tạo cache key
  { maxAge: 60, revalidate: 10, engine: 'memory' },  // options
)
```

### Tham số

| Tham số | Kiểu | Mô tả |
|--------|------|-------|
| `handle` | `() => Promise<any>` | Function thực sự query data |
| `dependencies` | `any[]` | Mảng giá trị tạo cache key (hash MD5) |
| `options` | `UseCacheOptions` | Cấu hình cache |

### Options

```typescript
type UseCacheOptions = {
  maxAge?: number      // Thời gian cache hợp lệ (giây)
  revalidate?: number  // Thời gian revalidation window (giây)
  prefix?: string      // Prefix cho cache key
  engine?: 'memory' | 'redis' | 'memcached'  // Nơi lưu cache
}
```

## 3 Engine

### memory -- Lưu trong RAM của process

```typescript
await cacheService.useCache(handle, deps, {
  maxAge: 60, revalidate: 10, engine: 'memory',
})
```

- Nhanh nhất (không qua network)
- Chỉ có trong 1 process (không chia sẻ giữa các instances)
- Mất khi server restart

### redis -- Lưu trong Redis server

```typescript
await cacheService.useCache(handle, deps, {
  maxAge: 60, revalidate: 10, engine: 'redis',
})
```

- Chia sẻ giữa tất cả server instances
- Tồn tại khi server restart
- Chậm hơn memory vì qua network (~1ms)

### memcached -- Lưu trong Memcached server

```typescript
await cacheService.useCache(handle, deps, {
  maxAge: 60, revalidate: 10, engine: 'memcached',
})
```

- Tương tự redis nhưng đơn giản hơn
- Tối ưu cho cache thuần (không có data structures)

## Revalidation -- Tự động làm mới

Đây là điểm thông minh của useCache. Thay vì để cache hết hạn rồi mới query lại (người dùng phải đợi), nó **revalidate ngầm** trước khi hết hạn.

```
Timeline:
0s ─────── maxAge (60s) ─────── maxAge + revalidate (70s) ───→
    FRESH (trả cache)   STALE (trả cache, revalidate ngầm)   EXPIRED (query lại)
```

### Ví dụ: maxAge=60, revalidate=10

```
Giây 0:   Request → cache miss → query DB → lưu cache → trả data
Giây 30:  Request → cache hit (FRESH) → trả cache ngay
Giây 62:  Request → cache hit (STALE) → trả cache cũ ngay
                                        + chạy ngầm: query DB → cập nhật cache
Giây 63:  Request → cache hit (FRESH lại) → trả data mới
Giây 71:  Cache hết hạn hoàn toàn → request tiếp query DB lại
```

**Lợi ích:** User không bao giờ phải đợi cache miss (trừ request đầu tiên).

### Code thực tế trong useCache.ts

```typescript
if (data) {
  // Có cache → trả ngay, revalidate ngầm nếu cần
  revalidate(key, iat, options, handle).catch((error) => {
    log.error({ error, key }, 'Revalidate failed silently')
  })
  return data  // Trả cache cũ ngay lập tức
}
```

## Stampede Protection -- Chống request ồ ạt

### Vấn đề: Cache Stampede

```
Cache hết hạn → 1000 requests đồng thời → 1000 queries đến DB → DB quá tải
```

### Giải pháp trong useCache

```typescript
// Kiểm tra có request nào đang xử lý key này chưa
const existingDeferred = deferredMap.get(key)

if (existingDeferred) {
  // Đã có request đang query → đợi kết quả từ request đó
  return await existingDeferred
}

// Không có → mình là request đầu tiên, tạo deferred
const deferred = deferredMap.getOrSet(key)
```

```
1000 requests đồng thời:
  Request 1: Cache miss → query DB → lưu cache → trả data
  Request 2-1000: Thấy Request 1 đang query → đợi → nhận cùng data

Kết quả: Chỉ 1 query đến DB thay vì 1000
```

### Test thực tế chứng minh

```typescript
// Từ useCache.spec.ts
test('should handle cache stampede', async ({ assert }) => {
  let callCount = 0
  const handle = async () => {
    callCount++
    await new Promise((resolve) => setTimeout(resolve, 100))
    return { data: 'test' }
  }

  cache.flushAll()

  // 3 request đồng thời
  const promises = [
    useCache(handle, ['stampede'], { maxAge: 10, revalidate: 5, engine: 'memory' }),
    useCache(handle, ['stampede'], { maxAge: 10, revalidate: 5, engine: 'memory' }),
    useCache(handle, ['stampede'], { maxAge: 10, revalidate: 5, engine: 'memory' }),
  ]

  const results = await Promise.all(promises)

  results.forEach((result) => {
    assert.deepEqual(result, { data: 'test' })
  })

  // handle chỉ chạy 1 lần!
  assert.equal(callCount, 1)
})
```

## Dependencies -- Tạo cache key

```typescript
// Cùng dependencies → cùng cache key → dùng chung cache
await useCache(handle, ['stocks', 'VNM'], opts)
await useCache(handle, ['stocks', 'VNM'], opts)  // Cache hit!

// Khác dependencies → khác cache key → cache riêng
await useCache(handle, ['stocks', 'VNM'], opts)
await useCache(handle, ['stocks', 'FPT'], opts)  // Cache miss, key khác
```

Cache key được tạo bằng MD5 hash:

```typescript
const hash = crypto.createHash('md5').update(JSON.stringify(dependencies)).digest('hex')
const key = `${VERSION}.${options.prefix}:${hash}`
```

## Timeout Protection

Nếu handle chạy quá lâu, tự động timeout:

```typescript
timerMap.set(
  key,
  setTimeout(() => {
    clearDeferred(key, null, new Error('Hệ thống quá tải, vui lòng thử lại sau code:request_timeout'))
  }, CACHE_TIMEOUT_SECONDS * 1000),
)
```

## Validation -- Kiểm tra options

```typescript
if (!options.engine || !options.maxAge || !options.revalidate) {
  throw new Error('Missing required options')
}
```

Test:

```typescript
test('should throw error if maxAge is 0', async ({ assert }) => {
  await assert.rejects(
    () => useCache(handle, ['invalid'], { maxAge: 0, revalidate: 5, engine: 'memory' }),
    'Missing required options',
  )
})
```

## Xoá cache theo prefix

```typescript
import { cacheService } from 'App/Services/cacheService'

// Xoá tất cả cache có prefix 'news'
cacheService.removeCacheByPrefix('news')
```

Dùng khi admin thay đổi data và cần cache cập nhật ngay.

## Tổng kết flow

```
useCache(handle, deps, opts)
  │
  ├── Tạo cache key từ dependencies (MD5 hash)
  │
  ├── getCache(key, engine)
  │   ├── Có data → trả ngay + revalidate ngầm nếu stale
  │   └── Không có data ↓
  │
  ├── Kiểm tra stampede (deferredMap)
  │   ├── Đã có request đang query → đợi
  │   └── Chưa có → tiếp tục ↓
  │
  ├── Đặt timeout protection
  │
  ├── Gọi handle() → lấy data
  │
  ├── setCache(key, data, engine, maxAge + revalidate)
  │
  └── Trả data + cleanup
```
