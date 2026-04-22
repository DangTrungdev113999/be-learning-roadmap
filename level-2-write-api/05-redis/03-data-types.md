# Redis Data Types -- String, Hash, List, Set, Sorted Set

## Tổng quan

Redis không chỉ lưu string. Nó có 5 kiểu dữ liệu chính:

| Kiểu | Mô tả | Tương đương JS | Dùng khi |
|------|-------|----------------|---------|
| String | Giá trị đơn | `string / number` | Cache object, counter |
| Hash | Object key-value | `Record<string, string>` | Lưu object không cần stringify |
| List | Danh sách có thứ tự | `Array` | Queue, recent items |
| Set | Tập hợp không trùng | `Set` | Tags, unique users |
| Sorted Set | Tập hợp có score | `Map<string, number>` | Leaderboard, ranking |

## 1. String (đã học)

```bash
SET user:123 '{"name":"Trung","age":25}'
GET user:123
```

Trong logics, hầu hết dùng String + JSON:

```typescript
// redis/models/appConfig.ts
const set = async (data: AppConfig) => {
  await pubclient.set('metadata_app_config', JSON.stringify(data))
}

const get = async (): Promise<AppConfig> => {
  const raw = await pubclient.get('metadata_app_config')
  if (!raw) return {}
  return JSON.parse(raw)
}
```

## 2. Hash -- HSET / HGET / HGETALL

Hash lưu object trực tiếp, không cần `JSON.stringify`.

### redis-cli

```bash
# Lưu từng field
HSET user:123 name "Trung"
HSET user:123 age "25"
HSET user:123 role "admin"

# Đọc 1 field
HGET user:123 name
# -> "Trung"

# Đọc tất cả fields
HGETALL user:123
# -> 1) "name"
# -> 2) "Trung"
# -> 3) "age"
# -> 4) "25"
# -> 5) "role"
# -> 6) "admin"

# Xoá 1 field
HDEL user:123 role

# Kiểm tra field tồn tại
HEXISTS user:123 name
# -> 1
```

### Trong TypeScript

```typescript
// Lưu
await pubclient.hset('user:123', 'name', 'Trung')
await pubclient.hset('user:123', 'age', '25')

// Hoặc lưu nhiều fields cùng lúc
await pubclient.hset('user:123', { name: 'Trung', age: '25', role: 'admin' })

// Đọc 1 field
const name = await pubclient.hget('user:123', 'name')

// Đọc tất cả
const user = await pubclient.hgetall('user:123')
// -> { name: 'Trung', age: '25', role: 'admin' }
```

### Trong logics -- HSCAN để đọc hash lớn

```typescript
// redis/hscanall.ts
export async function scanAllRedisHash(RedisClient: Redis, hashKey: string, count?: number) {
  let cursor = '0'
  let hashData: Record<string, string> = {}

  do {
    const result = count
      ? await RedisClient.hscan(hashKey, cursor, 'COUNT', +count)
      : await RedisClient.hscan(hashKey, cursor)
    cursor = result[0]

    const keyValuePairs = result[1]
    for (let i = 0; i < keyValuePairs.length; i += 2) {
      hashData[keyValuePairs[i]] = keyValuePairs[i + 1]
    }
  } while (cursor !== '0')

  return hashData
}
```

### Khi nào dùng Hash vs String?

```typescript
// String: lưu toàn bộ object, đọc/ghi toàn bộ
await pubclient.set('user:123', JSON.stringify({ name: 'Trung', age: 25, role: 'admin' }))
// -> Phải parse toàn bộ object khi chỉ cần 1 field

// Hash: lưu từng field, đọc/ghi từng field
await pubclient.hget('user:123', 'name')
// -> Chỉ đọc field cần thiết, nhanh hơn
```

## 3. List -- LPUSH / RPUSH / LPOP / RPOP / LRANGE

List là mảng có thứ tự, thêm/bớt ở 2 đầu.

### redis-cli

```bash
# Thêm vào đầu danh sách (Left Push)
LPUSH notifications:user1 "Bạn có tin nhắn mới"
LPUSH notifications:user1 "Đơn hàng đã xử lý"

# Thêm vào cuối danh sách (Right Push)
RPUSH queue:emails "email1@test.com"
RPUSH queue:emails "email2@test.com"

# Đọc danh sách (từ index 0 đến -1 = tất cả)
LRANGE notifications:user1 0 -1
# -> 1) "Đơn hàng đã xử lý"
# -> 2) "Bạn có tin nhắn mới"

# Đọc 5 items đầu tiên
LRANGE notifications:user1 0 4

# Lấy và xoá phần tử đầu (Left Pop)
LPOP queue:emails
# -> "email1@test.com"

# Lấy và xoá phần tử cuối (Right Pop)
RPOP queue:emails
# -> "email2@test.com"

# Đếm số phần tử
LLEN notifications:user1
# -> 2
```

### Trong logics -- rpushAnalysisReport

```typescript
// redis/rpushAnalysisReport.ts
import { pubclient } from './client'

export default async function rpushAnalysisReport(data: any) {
  await pubclient.rpush('queue:analysis_report', JSON.stringify(data))
  // -> Thêm vào cuối queue, worker sẽ LPOP để xử lý
}
```

### Use case: Message Queue

```typescript
// Producer: thêm job vào queue
await pubclient.rpush('queue:emails', JSON.stringify({
  to: 'user@email.com',
  subject: 'Welcome',
}))

// Consumer: lấy job ra xử lý
const job = await pubclient.lpop('queue:emails')
if (job) {
  const email = JSON.parse(job)
  await sendEmail(email)
}
```

## 4. Set -- SADD / SMEMBERS / SISMEMBER

Set lưu tập hợp giá trị **không trùng lặp**.

### redis-cli

```bash
# Thêm phần tử
SADD tags:post1 "trading" "stocks" "analysis"
SADD tags:post1 "trading"  # Không thêm vì đã tồn tại

# Xem tất cả phần tử
SMEMBERS tags:post1
# -> 1) "trading"
# -> 2) "stocks"
# -> 3) "analysis"

# Kiểm tra phần tử có trong set không
SISMEMBER tags:post1 "trading"
# -> 1 (có)

SISMEMBER tags:post1 "crypto"
# -> 0 (không có)

# Đếm số phần tử
SCARD tags:post1
# -> 3

# Xoá phần tử
SREM tags:post1 "analysis"
```

### Use case: Online users

```typescript
// User online
await pubclient.sadd('online_users', 'user123')
await pubclient.sadd('online_users', 'user456')

// Kiểm tra user có online không
const isOnline = await pubclient.sismember('online_users', 'user123')

// Đếm user online
const count = await pubclient.scard('online_users')

// User offline
await pubclient.srem('online_users', 'user123')
```

## 5. Sorted Set -- ZADD / ZRANGE / ZRANGEBYSCORE

Sorted Set = Set + mỗi phần tử có **score** để xếp hạng.

### redis-cli

```bash
# Thêm với score
ZADD leaderboard 1500 "player1"
ZADD leaderboard 2000 "player2"
ZADD leaderboard 1800 "player3"

# Xếp hạng từ thấp đến cao
ZRANGE leaderboard 0 -1 WITHSCORES
# -> 1) "player1" 2) "1500"
# -> 3) "player3" 4) "1800"
# -> 5) "player2" 6) "2000"

# Top 2 cao nhất (từ cao xuống thấp)
ZREVRANGE leaderboard 0 1 WITHSCORES
# -> 1) "player2" 2) "2000"
# -> 3) "player3" 4) "1800"

# Xoá phần tử
ZREM leaderboard "player1"
```

### Trong logics -- Sorted Set cho Alert

```typescript
// redis/models/sortSetAlert.ts
async function addToSortSet(type, symbol, symbolType, alertId, payload) {
  return await pubclient
    .multi()
    .zadd(
      getSortedKeyRedis(type, symbol, symbolType),
      ...[type === 'volume' ? payload.volume : payload.price, alertId],
    )
    .exec()
}

// Ví dụ: alert khi giá VNM đạt 80,000
// ZADD price_VNM_stock_Sorted_AlertsV2 80000 "alert123"
// Khi giá thay đổi, dùng ZRANGEBYSCORE để tìm alerts cần trigger
```

## Bảng tổng hợp

| Kiểu | Commands chính | Use case trong logics |
|------|---------------|----------------------|
| String | SET, GET, DEL | Cache config, user data, OTP |
| Hash | HSET, HGET, HGETALL | Organization data |
| List | LPUSH, RPUSH, LPOP, RPOP | Analysis report queue |
| Set | SADD, SMEMBERS, SISMEMBER | (Available cho online tracking) |
| Sorted Set | ZADD, ZRANGE, ZREM | Price/volume alerts |

## Bài tập

1. Dùng `redis-cli` tạo Hash cho 1 stock: `HSET stock:VNM name "Vinamilk" price "80000" volume "1000000"`
2. Dùng List tạo queue notifications, thêm 3 items, lấy ra 1 item
3. Dùng Set lưu danh sách online users, thêm 5 users, xoá 2, đếm lại
4. Dùng Sorted Set tạo leaderboard top traders, thêm 5 traders với score khác nhau, lấy top 3
