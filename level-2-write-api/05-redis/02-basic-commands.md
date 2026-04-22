# Redis Basic Commands -- GET, SET, DEL, TTL, EXPIRE, INCR

## Thử trước bằng redis-cli

Mở terminal, gõ `redis-cli` để vào interactive mode:

```bash
redis-cli
127.0.0.1:6379>
```

## SET và GET -- Lưu và đọc

### redis-cli

```bash
SET greeting "Xin chào"
# → OK

GET greeting
# → "Xin chào"
```

### Trong logics (TypeScript)

```typescript
import { pubclient } from 'Redis/client'

// SET
await pubclient.set('greeting', 'Xin chào')

// GET
const value = await pubclient.get('greeting')
console.log(value) // → 'Xin chào'
```

### Ví dụ thực tế -- redis/models/socialConfig.ts

```typescript
import { pubclient } from '../client'

// Lưu config
const set = async (data: SocialConfig) => {
  await pubclient.set('social_config', JSON.stringify(data))
}

// Đọc config
const get = async (): Promise<SocialConfig> => {
  const raw = await pubclient.get('social_config')
  if (!raw) return {}
  return JSON.parse(raw)
}
```

**Chú ý:** Redis chỉ lưu **string**. Muốn lưu object phải `JSON.stringify`, đọc ra phải `JSON.parse`.

## DEL -- Xoá key

### redis-cli

```bash
SET temp "data"
DEL temp
GET temp
# → (nil)
```

### Trong logics -- redis/otp.ts

```typescript
// Xoá OTP sau khi verify
delOtp: (id: string): Promise<number> => {
  return pubclient.del(`otp:${id}`)
  // Trả về 1 nếu xoá thành công, 0 nếu key không tồn tại
}
```

## SET với EX -- Tự hết hạn (TTL)

Đây là tính năng quan trọng nhất mà localStorage không có.

### redis-cli

```bash
# Lưu OTP, tự xoá sau 300 giây (5 phút)
SET otp:user123 "482951" EX 300

# Kiểm tra còn bao nhiêu giây
TTL otp:user123
# → 298

# Đợi hết hạn...
TTL otp:user123
# → -2 (key đã bị xoá)

GET otp:user123
# → (nil)
```

### Trong logics -- redis/otp.ts

```typescript
setOtp: (id: string, opt: Record<string, any>): Promise<string> => {
  return pubclient.set(`otp:${id}`, JSON.stringify(opt), 'EX', 60 * 60)
  //                                                      'EX'  3600 giây
  //                                                      = hết hạn sau 1 giờ
}
```

## TTL -- Kiểm tra thời gian sống

### redis-cli

```bash
SET session "data" EX 600

TTL session
# → 597 (còn 597 giây)

# Key không có TTL
SET permanent "forever"
TTL permanent
# → -1 (không hết hạn)

# Key không tồn tại
TTL nonexistent
# → -2 (key không tồn tại)
```

### Trong TypeScript

```typescript
const ttl = await pubclient.ttl('otp:user123')
if (ttl > 0) {
  console.log(`OTP còn ${ttl} giây`)
} else if (ttl === -1) {
  console.log('Key tồn tại vĩnh viễn')
} else {
  console.log('Key đã hết hạn hoặc không tồn tại')
}
```

## EXPIRE -- Đặt TTL cho key đã tồn tại

### redis-cli

```bash
SET user:123 "data"
# Key tồn tại vĩnh viễn

EXPIRE user:123 3600
# → 1 (thành công)
# Bây giờ key sẽ bị xoá sau 1 giờ

TTL user:123
# → 3598
```

### Trong TypeScript

```typescript
await pubclient.set('user:123', JSON.stringify(userData))
await pubclient.expire('user:123', 3600) // 1 giờ
```

## INCR / DECR -- Tăng giảm số

### redis-cli

```bash
SET counter 0
INCR counter
# → 1
INCR counter
# → 2
INCR counter
# → 3
DECR counter
# → 2
```

### Use case: Đếm page views

```typescript
// Mỗi lần user xem trang
await pubclient.incr(`pageview:${postId}`)

// Đọc số lượt xem
const views = await pubclient.get(`pageview:${postId}`)
console.log(`${views} lượt xem`)
```

### Use case: Rate limiting đơn giản

```typescript
async function simpleRateLimit(ip: string): Promise<boolean> {
  const key = `ratelimit:${ip}`
  const count = await pubclient.incr(key)

  if (count === 1) {
    // Lần đầu: set TTL 60 giây
    await pubclient.expire(key, 60)
  }

  return count <= 60 // Cho phép 60 requests/phút
}
```

## EXISTS -- Kiểm tra key tồn tại

```bash
SET greeting "hello"
EXISTS greeting
# → 1 (tồn tại)

EXISTS nonexistent
# → 0 (không tồn tại)
```

```typescript
const exists = await pubclient.exists('otp:user123')
if (exists) {
  // OTP vẫn còn hiệu lực
}
```

## KEYS -- Tìm keys (CẢNH BÁO: chỉ dùng khi debug)

```bash
# Tìm tất cả key bắt đầu bằng "user:"
KEYS user:*
# → 1) "user:123"
# → 2) "user:456"
```

**CẢNH BÁO:** KHÔNG dùng `KEYS` trong production code -- nó scan toàn bộ database, gây chậm server. Dùng `SCAN` thay thế.

## Bảng tổng hợp commands

| Command | Mô tả | Ví dụ |
|---------|-------|-------|
| `SET key value` | Lưu giá trị | `SET name "Trung"` |
| `SET key value EX seconds` | Lưu có TTL | `SET otp "123" EX 300` |
| `GET key` | Đọc giá trị | `GET name` |
| `DEL key` | Xoá key | `DEL name` |
| `TTL key` | Xem TTL còn lại | `TTL otp` |
| `EXPIRE key seconds` | Đặt TTL | `EXPIRE name 3600` |
| `INCR key` | Tăng 1 | `INCR counter` |
| `DECR key` | Giảm 1 | `DECR counter` |
| `EXISTS key` | Kiểm tra tồn tại | `EXISTS name` |
| `KEYS pattern` | Tìm keys (debug only) | `KEYS user:*` |

## Bài tập

Mở `redis-cli` và thực hiện:

1. SET một key `myname` với tên bạn, GET lại xem đúng không
2. SET key `otp:test` giá trị `"999999"` với TTL 30 giây, theo dõi TTL giảm dần
3. Dùng INCR để tạo counter, tăng lên 5, rồi DECR 2 lần
4. Viết function TypeScript `setWithExpiry(key, value, seconds)` dùng `pubclient.set(key, value, 'EX', seconds)`
