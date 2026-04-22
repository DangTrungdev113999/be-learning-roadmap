# Cache Patterns -- Khi nào cache, khi nào không

## Cache là gì?

Cache là lưu kết quả tính toán/query để dùng lại, tránh tính toán lặp lại.

```
Không cache:  Client → Server → MongoDB (mỗi lần đều query)
Có cache:     Client → Server → Redis (nhanh) → MongoDB (chỉ khi cache miss)
```

## Pattern 1: Cache-Aside (Lazy Loading)

Pattern phổ biến nhất trong logics. Logic:

```
1. Kiểm tra Redis có data không?
2. CÓ  → trả data từ Redis (cache hit)
3. KHÔNG → query MongoDB → lưu vào Redis → trả data (cache miss)
```

### Code minh hoạ

```typescript
async function getStockOverview(symbol: string) {
  const cacheKey = `overview:${symbol}`

  // 1. Kiểm tra cache
  const cached = await pubclient.get(cacheKey)
  if (cached) {
    return JSON.parse(cached) // Cache hit
  }

  // 2. Cache miss → query database
  const data = await mongo.stocks.findOne({ symbol })

  // 3. Lưu vào cache (TTL 60 giây)
  await pubclient.set(cacheKey, JSON.stringify(data), 'EX', 60)

  return data
}
```

### Ví dụ thực tế -- redis/models/socialConfig.ts

```typescript
// Đọc: kiểm tra cache trước
const get = async (): Promise<SocialConfig> => {
  const raw = await pubclient.get('social_config')
  if (!raw) return {}
  return JSON.parse(raw)
}

// Ghi: cập nhật cache khi data thay đổi
const set = async (data: SocialConfig) => {
  await pubclient.set('social_config', JSON.stringify(data))
}
```

### Ưu điểm

- Đơn giản, dễ hiểu
- Chỉ cache data thực sự được truy cập
- Cache miss không gây lỗi (chỉ chậm hơn)

### Nhược điểm

- Request đầu tiên luôn chậm (cache miss)
- Data có thể stale (cũ) trong thời gian TTL

## Pattern 2: Write-Through

Khi ghi data, ghi vào **cả database VÀ cache** cùng lúc.

```
Ghi: Client → Server → MongoDB + Redis (cùng lúc)
Đọc: Client → Server → Redis (luôn có data mới nhất)
```

### Code minh hoạ

```typescript
async function updateUser(userId: string, updates: Partial<User>) {
  // 1. Ghi vào database
  await mongo.users.updateOne({ _id: userId }, { $set: updates })

  // 2. Cập nhật cache ngay lập tức
  const updatedUser = await mongo.users.findOne({ _id: userId })
  await pubclient.set(`user:${userId}`, JSON.stringify(updatedUser), 'EX', 3600)

  return updatedUser
}
```

### Ví dụ thực tế -- redis/models/user.ts

```typescript
// Khi user data thay đổi (login, update profile, upgrade plan)
// → ghi vào cả MongoDB VÀ Redis
const set = async (user: User) => {
  const data = {
    _id: user._id.toString(),
    roles: user.roles,
    bans: user.bans,
    plan: {
      expiredDate: user.plan.expiredDate,
      level: user.plan.level,
    },
  }
  return pubclient.set(`user:${user._id}`, JSON.stringify(data))
}
```

### Ưu điểm

- Cache luôn cập nhật, không bị stale
- Đọc luôn nhanh (cache hit)

### Nhược điểm

- Ghi chậm hơn (phải ghi 2 nơi)
- Nếu Redis down, ghi sẽ fail

## Khi nào cache, khi nào không?

### NÊN cache

| Dữ liệu | Lý do | TTL gợi ý |
|---------|-------|-----------|
| Config (appConfig, socialConfig) | Ít thay đổi, đọc nhiều | 5-30 phút |
| Thông tin user (roles, plan) | Đọc mỗi request (auth) | 1-24 giờ |
| Giá cổ phiếu tổng quan | Cập nhật mỗi vài giây | 5-15 giây |
| Tin tức (danh sách) | Không thay đổi liên tục | 1-5 phút |
| OTP | Cần hết hạn tự động | 5-60 phút |
| Rate limit counter | Đếm requests | 1-60 giây |

### KHÔNG nên cache

| Dữ liệu | Lý do |
|---------|-------|
| Dữ liệu thay đổi mỗi request | Cache vô nghĩa |
| Dữ liệu cá nhân nhạy cảm | Rủi ro bảo mật |
| Dữ liệu ít truy cập | Tốn RAM, ít lợi ích |
| Kết quả tìm kiếm (query phức tạp) | Key space quá lớn |
| Dữ liệu cần chính xác tuyệt đối | Cache có thể stale |

## Chọn TTL phù hợp

```
Dữ liệu realtime (giá cổ phiếu):     5-15 giây
Dữ liệu thường xuyên (news list):     1-5 phút
Dữ liệu ít thay đổi (user info):      1-24 giờ
Dữ liệu gần như không đổi (config):    30 phút - 1 ngày
```

Công thức đơn giản:

```
TTL = Thời gian bạn chấp nhận data cũ
```

Nếu user thấy tin tức cũ 1 phút là OK → TTL = 60 giây.
Nếu giá cổ phiếu cũ 5 giây là OK → TTL = 5 giây.

## Cache Invalidation -- Xoá cache khi data thay đổi

Đây là bài toán khó nhất trong caching:

> "There are only two hard things in Computer Science: cache invalidation and naming things."

### Cách 1: TTL tự hết hạn

```typescript
// Sau 60 giây, Redis tự xoá → request tiếp theo query DB lại
await pubclient.set('news:latest', data, 'EX', 60)
```

### Cách 2: Xoá manual khi data thay đổi

```typescript
// Khi admin tạo bài viết mới
await mongo.news.insertOne(newPost)
// Xoá cache để lần đọc tiếp query data mới
await pubclient.del('news:latest')
```

### Cách 3: Event-based (logics dùng pattern này)

```typescript
// cacheService/index.ts
eventService.on('cache:clear_prefix', (prefix: string) => {
  removeCacheByPrefix(prefix, false)
})

// Khi data thay đổi
eventService.emit('cache:clear_prefix', 'news')
```

## Bài tập

1. Thiết kế cache cho API "lấy danh sách top 10 cổ phiếu theo volume": chọn pattern (cache-aside hay write-through), chọn TTL, giải thích lý do
2. Liệt kê 3 loại dữ liệu trong app bạn đang làm nên cache và 3 loại không nên
3. Viết function `cachedQuery(cacheKey, ttl, queryFn)` theo pattern cache-aside
