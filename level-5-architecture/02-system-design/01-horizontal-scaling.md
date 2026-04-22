# Horizontal Scaling -- Từ 1 server lên nhiều servers

## Mục tiêu

Hiểu sự khác biệt Scale Up vs Scale Out, tại sao cần stateless, và tại sao Finpath cần lockService khi chạy nhiều instances.

---

## 1. Scale Up vs Scale Out

### Scale Up (Vertical) -- Nâng cấp máy

```
TRƯỚC:          SAU:
┌─────────┐     ┌─────────────┐
│ 4 CPU   │     │ 32 CPU      │
│ 8GB RAM │ ──> │ 64GB RAM    │
│ 100GB   │     │ 1TB SSD     │
└─────────┘     └─────────────┘
  $50/tháng       $500/tháng
```

**Ưu:** Đơn giản, không cần thay đổi code.
**Nhược:** Có giới hạn (máy mạnh nhất vẫn có ceiling), đắt, single point of failure.

### Scale Out (Horizontal) -- Thêm máy

```
TRƯỚC:               SAU:
┌─────────┐           ┌─────────┐
│ Server  │           │Server 1 │
│ 4 CPU   │     ┌─────│ 4 CPU   │
│ 8GB RAM │     │     └─────────┘
└─────────┘     │     ┌─────────┐
  $50/tháng     ├─────│Server 2 │
                │     │ 4 CPU   │
                │     └─────────┘
                │     ┌─────────┐
                └─────│Server 3 │
                      │ 4 CPU   │
                      └─────────┘
                  $150/tháng (nhưng 3x capacity)
```

**Ưu:** Không có giới hạn (cứ thêm máy), tự động failover (1 máy chết, 2 máy còn lại vẫn chạy).
**Nhược:** Code phải thiết kế đặc biệt (stateless), phức tạp hơn.

### So sánh FE

```
FE Scale Up:    Mua laptop mạnh hơn → app render nhanh hơn
FE Scale Out:   CDN (nhiều server) → static assets phục vụ từ server gần nhất

BE Scale Up:    Nâng cấp server → xử lý nhiều requests hơn
BE Scale Out:   Nhiều instances → phân tải requests
```

---

## 2. Stateless -- Yêu cầu bắt buộc khi Scale Out

### Stateful (có lưu trạng thái trong app)

```ts
// ❌ STATEFUL: Lưu user session trong memory
const sessions = new Map()

app.post('/login', (req, res) => {
  const sessionId = generateId()
  sessions.set(sessionId, { userId: req.body.userId }) // Lưu trong RAM
  res.cookie('sessionId', sessionId)
})

app.get('/profile', (req, res) => {
  const session = sessions.get(req.cookies.sessionId) // Đọc từ RAM
  // ...
})
```

**Vấn đề khi có 2 instances:**

```
User login → Instance 1 (lưu session trong RAM)
User GET /profile → Instance 2 (KHÔNG CÓ session!) → 401 Unauthorized ❌

┌───────────┐     ┌──────────────┐
│   User    │────>│ Instance 1   │  sessions = { abc: { userId: 'u1' } }
│           │     └──────────────┘
│           │     ┌──────────────┐
│           │────>│ Instance 2   │  sessions = {} ← TRỐNG!
└───────────┘     └──────────────┘
```

### Stateless (không lưu trạng thái)

```ts
// ✅ STATELESS: Session lưu trong Redis (shared storage)
app.post('/login', async (req, res) => {
  const token = jwt.sign({ userId: req.body.userId }, SECRET)
  res.json({ token })  // Token chứa thông tin, không cần server lưu
})

app.get('/profile', async (req, res) => {
  const payload = jwt.verify(req.headers.authorization, SECRET)
  // payload.userId -- decode từ token, không cần lookup session
})
```

**Khi có 2 instances:**

```
User login → Instance 1 (trả JWT token)
User GET /profile + token → Instance 2 (verify token thành công!) ✅

Cả 2 instances đều có thể xử lý request vì KHÔNG phụ thuộc local state.
```

### So sánh FE: State management

```typescript
// FE Stateful: Component local state
const [data, setData] = useState(null)
// Nếu component unmount → mất state

// FE Stateless: Data từ server/store
const data = useSelector((state) => state.posts.list)
// Component nào cũng access được, không phụ thuộc lifecycle

// BE Stateless: Data từ DB/Redis
// Instance nào cũng access được, không phụ thuộc instance nào
```

### Quy tắc Stateless cho BE

| Loại data | Lưu ở đâu | Ví dụ |
|---|---|---|
| User session | JWT token hoặc Redis | Finpath dùng JWT |
| Cache | Redis hoặc Memcached (shared) | cacheService với Redis engine |
| Temporary data | Redis với TTL | OTP codes, rate limiting |
| File uploads | Object Storage (S3) | Không lưu trên local disk |
| Config | Environment variables | Không hardcode |

---

## 3. Vấn đề Race Condition khi nhiều instances

### Tình huống: 2 users join room cùng lúc

```
Instance 1: User A join room
  1. Đọc numberOfMember = 100
  2. numberOfMember + 1 = 101
  3. Save numberOfMember = 101

Instance 2: User B join room (ĐỒNG THỜI)
  1. Đọc numberOfMember = 100     ← Đọc TRƯỚC khi Instance 1 save
  2. numberOfMember + 1 = 101     ← Tính sai!
  3. Save numberOfMember = 101    ← Ghi đè kết quả Instance 1

Kết quả: 2 users join nhưng numberOfMember chỉ tăng 1 ❌
```

### Giải pháp 1: Atomic operations

```ts
// ✅ Dùng $inc -- MongoDB đảm bảo atomic
await mongo.rooms.updateOne(
  { _id: roomId },
  { $inc: { numberOfMember: 1 } },  // Atomic increment
)
// 2 requests đồng thời → kết quả đúng: 102
```

### Giải pháp 2: Distributed Lock (lockService)

Khi logic phức tạp hơn `$inc` (cần đọc-kiểm tra-ghi):

```ts
// ❌ Race condition
async function startTrial(userId) {
  const user = await mongo.users.findOne({ _id: userId })

  if (user.trialCount >= 1) {
    throw new Error('Đã dùng trial')
  }

  await mongo.users.updateOne(
    { _id: userId },
    { $inc: { trialCount: 1 }, $set: { 'plan.level': 'PRO', 'plan.trial': true } },
  )
}
// 2 requests đồng thời → cả 2 đều thấy trialCount = 0 → cả 2 đều qua!
```

```ts
// ✅ Distributed lock
async function startTrial(userId) {
  // Chỉ 1 instance có thể acquire lock cho cùng userId
  const acquired = await lockService.acquire(['start_trial', userId], 3000)
  if (!acquired) throw new Error('Đang xử lý')

  const user = await mongo.users.findOne({ _id: userId })

  if (user.trialCount >= 1) {
    throw new Error('Đã dùng trial')
  }

  await mongo.users.updateOne(
    { _id: userId },
    { $inc: { trialCount: 1 }, $set: { 'plan.level': 'PRO', 'plan.trial': true } },
  )
}
```

### lockService trong Finpath

```ts
// Cách dùng
const acquired = await lockService.acquire(['resource', 'key'], ttlMs)
// ['resource', 'key'] → tạo unique lock key
// ttlMs → lock tự hết hạn sau N ms (tránh deadlock)

// Thực tế:
await lockService.acquire(['handle_apple_transaction', transactionId], 1000)
await lockService.acquire(['cancelLimitOrder', logPortfolioId], 60000)
await lockService.acquire(['bonusPlan', orderId], 1000)
await lockService.acquire(['payment', 'failed', paymentRequestId], 5000)
```

**Cách hoạt động bên trong:** Dùng Redis `SET key value NX EX ttl`:
- `NX` -- chỉ set nếu key CHƯA tồn tại (atomic)
- `EX ttl` -- tự hết hạn (tránh deadlock nếu app crash)

```
Instance 1: SET lock:start_trial:u1 "inst1" NX EX 3 → OK (acquired)
Instance 2: SET lock:start_trial:u1 "inst2" NX EX 3 → nil (NOT acquired, key đã tồn tại)
Instance 2: → throw 'Đang xử lý'
```

---

## 4. Session Management khi Scale Out

### Strategy 1: JWT (Stateless token)

```ts
// Finpath dùng JWT
const token = jwt.sign({ _id: user._id, identity: user.identity }, SECRET)

// Mọi instance đều verify được (chỉ cần SECRET)
const payload = jwt.verify(token, SECRET)
```

**Ưu:** Hoàn toàn stateless, không cần shared storage.
**Nhược:** Không thể revoke token (phải đợi hết hạn), token size lớn hơn session ID.

### Strategy 2: Redis Session

```ts
// Lưu session trong Redis (shared)
const sessionId = generateId()
await redis.set(`session:${sessionId}`, JSON.stringify(userData), 'EX', 3600)

// Mọi instance đều đọc được từ Redis
const session = JSON.parse(await redis.get(`session:${sessionId}`))
```

**Ưu:** Có thể revoke (xóa key), lưu nhiều data.
**Nhược:** Phụ thuộc Redis, thêm latency mỗi request.

### Strategy 3: Sticky Sessions (KHÔNG khuyến khích)

```
Load balancer luôn route user X đến instance Y

User A → luôn Instance 1
User B → luôn Instance 2

Vấn đề: Instance 1 chết → User A mất session
```

---

## 5. Cache Synchronization giữa instances

### Vấn đề

```
Instance 1: Cache room data (memory)
Instance 2: Cache room data (memory)

Admin update room trên Instance 1:
  → Instance 1 clear cache ✅
  → Instance 2 vẫn có cache CŨ ❌
```

### Giải pháp: Redis Pub/Sub

```ts
// Finpath: cacheService broadcast clear events
// Khi clear cache trên 1 instance → publish event qua Redis
// Tất cả instances subscribe → clear local cache

// cacheService/docs.md:
// "If broadcast is true:
//   - Emit 'cache:clear_prefix' event
//   - Clear Redis cache by scanning for keys"

// Instance 1: Clear cache
cacheService.removeCacheByPrefix('room', true)  // broadcast = true
// → Publish event qua Redis pub/sub
// → Tất cả instances nhận event → clear local 'room' cache
```

---

## 6. Checklist: App đã sẵn sàng Scale Out chưa?

- [ ] **Stateless:** Không lưu state trong memory app (sessions, carts, temp data)
- [ ] **Shared storage:** Cache, sessions lưu trong Redis/Memcached
- [ ] **Distributed locks:** Race conditions xử lý bằng lockService
- [ ] **Cache sync:** Local cache có broadcast mechanism
- [ ] **File storage:** Files lưu trên S3/Cloud Storage, không local disk
- [ ] **Config:** Environment variables, không hardcode
- [ ] **Health check:** Endpoint `/health` cho load balancer
- [ ] **Graceful shutdown:** Xử lý xong requests đang chạy trước khi tắt

---

## Tóm tắt

| Khái niệm | Giải thích |
|---|---|
| Scale Up | Nâng cấp máy (CPU, RAM) -- đơn giản nhưng có giới hạn |
| Scale Out | Thêm máy -- không giới hạn nhưng cần stateless |
| Stateless | App không lưu trạng thái trong memory -- shared storage thay thế |
| Race Condition | 2 instances đọc-ghi cùng data đồng thời -- kết quả sai |
| Distributed Lock | lockService.acquire() -- chỉ 1 instance xử lý tại 1 thời điểm |
| Cache Sync | Redis pub/sub broadcast cache clear giữa instances |

## Bài tập

1. App Finpath hiện chạy 3 instances. Liệt kê tất cả state mà app KHÔNG được lưu trong memory. State nào lưu ở đâu?
2. Function `handlePayment(orderId)` cần: đọc order → kiểm tra status → update status → gửi notification. Viết lại với lockService để tránh race condition. TTL bao nhiêu là hợp lý?
3. Nếu Redis chết, lockService không hoạt động. Ảnh hưởng gì đến hệ thống? Cần fallback strategy nào?
