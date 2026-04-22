# Distributed Lock -- Chỉ 1 instance chạy

## Mục tiêu

Hiểu tại sao cần distributed lock cho cronjob, cách `lockService.acquire` hoạt động, và logic TTL.

---

## 1. Vấn đề: 3 instances = 3 lần chạy

Trong production, backend thường chạy **nhiều instances** (để chịu tải, high availability):

```
                  ┌─────────────────┐
                  │   Load Balancer  │
                  └────────┬────────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Instance │    │ Instance │    │ Instance │
    │    1     │    │    2     │    │    3     │
    └──────────┘    └──────────┘    └──────────┘
```

Mỗi instance đều chạy `start/cronjob.ts`, nên mỗi instance đều đăng ký cùng các cronjobs.

**Không có lock:**

```
11:30:04 → Instance 1: dailyReleaseBuyVolume() ← Chạy ✅
11:30:04 → Instance 2: dailyReleaseBuyVolume() ← Chạy ❌ THỪA
11:30:04 → Instance 3: dailyReleaseBuyVolume() ← Chạy ❌ THỪA

→ Cùng 1 job chạy 3 lần = release buy volume 3 lần = LỖI NGHIÊM TRỌNG
```

**Có lock:**

```
11:30:04 → Instance 1: acquire lock → OK → dailyReleaseBuyVolume() ✅
11:30:04 → Instance 2: acquire lock → FAIL → bỏ qua ✅
11:30:04 → Instance 3: acquire lock → FAIL → bỏ qua ✅

→ Chỉ 1 instance chạy ✅
```

### So sánh FE

```typescript
// FE: Debounce ngăn button click nhiều lần
const handleClick = debounce(() => {
  submitForm()
}, 300)

// BE: Lock ngăn nhiều instances chạy cùng lúc
if (!(await lockService.acquire(['logics', 'cronjob', key], 10000))) {
  return   // Instance khác đã chạy rồi
}
```

Cùng ý tưởng: **đảm bảo 1 action chỉ chạy 1 lần**, dù bị trigger nhiều lần.

---

## 2. lockService.acquire() -- Code thật

```typescript
// app/Services/lockService/libs/acquire.ts
import { pubclient } from 'Redis/index'

export async function acquire(keys: LockKeys, ttl: number, raise = false): Promise<boolean> {
  const key = createHashedKey(keys)
  const rkey = `${ACQUIRE_KEY_PREFIX}:${key}`

  const result = await pubclient.set(rkey, 1, 'PX', ttl, 'NX')

  if (raise && !result) {
    throw new Error('Lock not acquired')
  }

  return !!result
}
```

Bản chất là **1 lệnh Redis**:

```
SET lock:logics:cronjob:dailyReleaseBuyVolume 1 PX 10000 NX
```

| Flag | Ý nghĩa |
|---|---|
| `PX 10000` | Key tự hết hạn sau 10000ms (10 giây) |
| `NX` | Chỉ set nếu key **chưa tồn tại** |

**NX là chìa khóa:** Redis đảm bảo `SET ... NX` là **atomic** -- nếu 2 instances gọi đồng thời, chỉ 1 cái thành công.

### Luồng chi tiết

```
Thời điểm 11:30:04.000

Instance 1: SET lock:...:dailyReleaseBuyVolume 1 PX 10000 NX
  → Redis: key chưa tồn tại → SET thành công → return "OK"
  → acquire() return true ✅
  → Chạy handler

Instance 2: SET lock:...:dailyReleaseBuyVolume 1 PX 10000 NX  (0.5ms sau)
  → Redis: key ĐÃ tồn tại (Instance 1 vừa set) → return null
  → acquire() return false ❌
  → Bỏ qua

Instance 3: SET lock:...:dailyReleaseBuyVolume 1 PX 10000 NX  (1ms sau)
  → Redis: key ĐÃ tồn tại → return null
  → acquire() return false ❌
  → Bỏ qua

Thời điểm 11:30:14.000 (sau 10 giây)
  → Redis: key hết hạn (TTL = 10000ms) → key bị xóa tự động
  → Lần chạy tiếp có thể acquire được
```

---

## 3. TTL -- Thời gian lock

### Tại sao cần TTL?

Nếu lock không có TTL, khi instance acquire lock rồi **crash** (không kịp release), lock sẽ tồn tại mãi mãi. Không ai chạy được cronjob nữa.

```
Không có TTL:
  Instance 1: acquire ✅ → crash trước khi release
  Instance 2: acquire ❌ (lock vẫn tồn tại)
  Instance 3: acquire ❌
  → Cronjob không bao giờ chạy nữa 💀

Có TTL:
  Instance 1: acquire ✅ → crash
  Sau 10 giây: lock tự hết hạn
  Lần chạy tiếp: Instance 2 acquire ✅ → chạy bình thường
```

### Logic tính TTL trong cronjobAdd

```typescript
const seconds = expression.split(' ').slice(-6, -5).pop() || ''

/[\*\,\-\/]/.test(seconds) ? 900 : 10000
```

| Loại giây | Pattern test | TTL | Lý do |
|---|---|---|---|
| `*/10` (mỗi 10 giây) | `true` (có `*`, `/`) | 900ms | Lock phải hết trước lần chạy tiếp (10s) |
| `0,30` (giây 0 và 30) | `true` (có `,`) | 900ms | Lock phải hết trước lần chạy tiếp (30s) |
| `4` (giây thứ 4) | `false` | 10000ms | Chạy 1 lần/phút hoặc ít hơn, 10s đủ |
| `46` (giây thứ 46) | `false` | 10000ms | Chạy 1 lần/ngày, 10s đủ |

**Nguyên tắc:** TTL phải **ngắn hơn** khoảng cách giữa 2 lần chạy, nhưng **đủ dài** để ngăn instances khác.

---

## 4. Tại sao dùng Redis mà không dùng cách khác?

### Phương án 1: File lock (không khả thi)

```
Instance 1 (Server A): kiểm tra file /tmp/lock → không có → tạo file
Instance 2 (Server B): kiểm tra file /tmp/lock → không có → tạo file
→ Cả 2 đều chạy! (Server A và B có filesystem riêng)
```

File lock chỉ hoạt động trên **cùng 1 server**. Nhiều instances trên nhiều servers thì vô ích.

### Phương án 2: Database lock (chậm)

```sql
INSERT INTO locks (key, created_at) VALUES ('cronjob:daily', NOW())
-- Nếu key đã tồn tại → lỗi unique constraint → không chạy
```

Hoạt động nhưng **chậm** (query DB mỗi lần cronjob trigger) và cần cleanup manual (DELETE sau khi xong).

### Phương án 3: Redis SET NX (tốt nhất)

```
SET lock:key 1 PX 10000 NX
```

- **Nhanh:** Redis xử lý trong microseconds
- **Atomic:** Đảm bảo chỉ 1 client thành công
- **Auto-cleanup:** TTL tự xóa, không cần release thủ công
- **Tất cả instances dùng chung 1 Redis:** Hoạt động cross-server

---

## 5. Trường hợp đặc biệt

### Handler chạy lâu hơn TTL

```
TTL = 10 giây
Handler chạy mất 30 giây

00:00.000 → Instance 1: acquire ✅ → bắt đầu chạy handler
00:10.000 → Lock hết hạn (TTL = 10s)
00:10.001 → Nếu lúc này có trigger mới → Instance 2: acquire ✅ → CHẠY TRÙNG ❌
00:30.000 → Instance 1: handler xong
```

**Giải pháp:** Đảm bảo TTL > thời gian handler dự kiến. Trong logics, TTL 10 giây đủ cho hầu hết cronjobs (chạy nhanh dưới 1 giây). Nếu handler chạy lâu, tăng TTL qua `options`.

### Redis bị disconnect

```
Instance 1: lockService.acquire() → Redis timeout → throw error
→ wrapper catch error → log.error → bỏ qua lần này
→ Lần trigger tiếp: thử lại
```

Cronjob bỏ qua 1 lần chạy thay vì crash. An toàn hơn chạy không có lock.

### Key format

```typescript
lockService.acquire([APP_NAME, 'cronjob', key], ttl)
// → lockService tạo key: "lock:logics:cronjob:dailyReleaseBuyVolume"

// Cấu trúc key:
// lock:{appName}:{context}:{specificKey}
```

Key có prefix rõ ràng, tránh conflict với lock dùng cho mục đích khác (API rate limiting, duplicate request, v.v.).

---

## 6. Ví dụ đầy đủ từ code thật

```typescript
// start/cronjob.ts

// Cronjob chạy mỗi ngày lúc 11:30:04
cronjobAdd('dailyReleaseBuyVolume', '4 30 11 * * *', async () => {
  await portfolioService.dailyReleaseBuyVolume()
})
```

**Luồng trên production (3 instances):**

```
11:30:04.000 — CronJob trigger trên cả 3 instances

Instance 1:
  1. seconds = '4' → /[\*\,\-\/]/.test('4') = false → TTL = 10000ms
  2. SET lock:logics:cronjob:dailyReleaseBuyVolume 1 PX 10000 NX → "OK" ✅
  3. await portfolioService.dailyReleaseBuyVolume() → xong trong 200ms

Instance 2:
  1. seconds = '4' → TTL = 10000ms
  2. SET lock:... NX → null ❌ (Instance 1 đã set)
  3. return (bỏ qua)

Instance 3:
  1. seconds = '4' → TTL = 10000ms
  2. SET lock:... NX → null ❌
  3. return (bỏ qua)

11:30:14.000 — Lock tự hết hạn (sau 10 giây)
```

---

## Tóm tắt

| Khái niệm | Giải thích |
|---|---|
| Distributed lock | Khóa dùng chung giữa nhiều instances |
| Redis SET NX | Atomic operation: chỉ 1 client set thành công |
| TTL | Thời gian lock tự hết hạn, tránh deadlock |
| 900ms TTL | Cho cronjob chạy thường xuyên (giây là pattern) |
| 10000ms TTL | Cho cronjob chạy ít (giây là số cố định) |
| Tại sao Redis? | Nhanh, atomic, auto-cleanup, cross-server |
