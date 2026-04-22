# Caching Strategy -- 3 câu hỏi: ở đâu, bao lâu, invalidate khi nào?

## Mục tiêu

Hiểu chiến lược caching toàn diện: chọn engine phù hợp, thiết kế TTL, và xử lý cache invalidation. Dựa trên real patterns từ cacheService trong Finpath.

---

## 1. Tại sao cần Caching?

### Không có cache

```
User A load giá VNM → Query Redis → 2ms
User B load giá VNM → Query Redis → 2ms    (cùng data!)
User C load giá VNM → Query Redis → 2ms    (cùng data!)
... 1000 users/giây → 1000 queries/giây cho cùng 1 data
```

### Có cache

```
User A load giá VNM → Query Redis → Cache result → 2ms
User B load giá VNM → Đọc từ cache → 0.01ms ✅
User C load giá VNM → Đọc từ cache → 0.01ms ✅
... 1000 users/giây → 1 query + 999 cache hits
```

### So sánh FE

```typescript
// FE: React Query cache
const { data } = useQuery('stocks', fetchStocks, {
  staleTime: 5000,     // Data "tươi" trong 5 giây
  cacheTime: 300000,   // Giữ cache 5 phút
})

// BE: cacheService.useCache
const data = await cacheService.useCache(
  () => fetchStocks(),
  ['stocks', 'VNM'],
  { maxAge: 60, revalidate: 10 },
)
```

**Giống nhau:** Cả FE và BE đều cache data, có TTL, có revalidation. Logic tương tự!

---

## 2. Câu hỏi 1: Cache ở đâu? (Engine)

### 3 engines trong Finpath

```
┌─────────────────────────────────────────────────────────┐
│                    cacheService                          │
│                                                         │
│  ┌─────────┐     ┌─────────┐     ┌──────────────┐      │
│  │ Memory  │     │  Redis  │     │  Memcached   │      │
│  │ (local) │     │(shared) │     │  (shared)    │      │
│  └─────────┘     └─────────┘     └──────────────┘      │
│   Nhanh nhất      Shared          Shared                │
│   Mất khi restart  Persist        Không persist         │
│   Per-instance     All instances  All instances         │
└─────────────────────────────────────────────────────────┘
```

| Engine | Tốc độ | Shared | Persist | Khi nào dùng |
|---|---|---|---|---|
| Memory | 0.001ms | Không | Không | Data đọc rất nhiều, chấp nhận inconsistent giữa instances |
| Redis | 0.5ms | Có | Có | Data cần consistent giữa instances |
| Memcached | 0.3ms | Có | Không | Cache lớn, không cần persist |

### Ví dụ thực tế

```ts
// Memory cache: Giá cổ phiếu (đọc hàng nghìn lần/giây)
// redis/models/overviewStock.ts
const overviewStockCache = new Map<string, OverviewStock>()
// Lưu trong Map local → nhanh nhất
// Trade-off: mỗi instance có bản sao riêng, có thể khác nhau tạm thời

// Memcached: Portfolio profit (đọc nhiều, tính toán đắt)
cacheService.useCache(
  () => calculatePortfolioProfit(userId),
  ['portfolioProfit', portfolioId, userId],
  { maxAge: 10, engine: 'memcached' },
)

// Redis: Ban check (cần consistent -- user bị ban phải bị ban trên TẤT CẢ instances)
cacheService.useCache(
  () => checkBanConfig(),
  ['ban', 'config'],
  { maxAge: 60, revalidate: 10 },  // Default engine = memory + Redis broadcast
)
```

### Decision tree chọn engine

```
            Cần consistent giữa instances?
                    │
              ┌─────┴─────┐
             Có           Không
              │             │
              ▼             ▼
         Data lớn?     Memory cache
              │         (Map, NodeCache)
        ┌─────┴─────┐
       Có           Không
        │             │
        ▼             ▼
    Memcached      Redis
```

---

## 3. Câu hỏi 2: Cache bao lâu? (TTL)

### maxAge -- Thời gian sống

```ts
// maxAge = 60 → cache sống 60 giây
cacheService.useCache(
  () => fetchData(),
  ['key'],
  { maxAge: 60 },
)

// Timeline:
// T0:  Cache MISS → fetch data → lưu cache
// T30: Cache HIT → trả data từ cache (data 30 giây tuổi)
// T60: Cache EXPIRED → cache MISS → fetch lại
```

### Chọn maxAge phù hợp

| Data | maxAge | Lý do |
|---|---|---|
| Giá cổ phiếu | 0 (realtime) | Thay đổi mỗi giây, dùng Redis trực tiếp |
| Config hệ thống | 3600s (1 giờ) | Hiếm thay đổi |
| User ban status | 60s | Cần update nhanh khi admin ban |
| Portfolio profit | 10s | Tính toán đắt, data OK nếu cũ 10 giây |
| Z-score tài chính | 3600s | Data tài chính ít thay đổi |

### Quy tắc chọn maxAge

```
maxAge ngắn (1-10s):    Data thay đổi thường xuyên, cần gần realtime
maxAge trung bình (60s): Data thay đổi mỗi phút
maxAge dài (3600s+):     Data ít thay đổi (config, tài chính quarterly)
maxAge = 0:              Không cache (dùng Redis trực tiếp)
```

---

## 4. Stale-While-Revalidate -- Pattern quan trọng nhất

### Vấn đề với cache đơn giản

```
T59: Cache HIT → trả data nhanh (0.01ms)
T60: Cache EXPIRED → Cache MISS → fetch data (500ms) ← User đợi 500ms!
T61: Cache HIT → trả data nhanh (0.01ms)
```

Cứ mỗi 60 giây, 1 user bị "unlucky" phải đợi fetch mới.

### Stale-While-Revalidate (SWR)

```ts
cacheService.useCache(
  () => fetchData(),
  ['key'],
  { maxAge: 60, revalidate: 10 },
)
```

```
maxAge = 60s:     Cache sống tối đa 60 giây
revalidate = 10s: Bắt đầu revalidate từ giây thứ 50

Timeline:
T0:  FRESH → Trả cache
T30: FRESH → Trả cache
T50: STALE → Trả cache CŨ (vẫn nhanh) + fetch data MỚI ở background
T51: FRESH → Cache đã update (background fetch xong)
T60: Nếu revalidate thành công: cache sống tiếp
     Nếu revalidate fail: cache hết hạn

┌─── maxAge = 60s ──────────────────────────────┐
│ FRESH (0-50s)              │ STALE (50-60s)   │
│ Trả cache, không fetch     │ Trả cache CŨ +   │
│                             │ fetch mới (bg)   │
└─────────────────────────────┴─────────────────┘
```

**User KHÔNG BAO GIỜ phải đợi fetch!** Luôn nhận cache (có thể stale), background tự update.

### So sánh FE: SWR / React Query

```typescript
// FE: SWR library (tên lấy từ HTTP header stale-while-revalidate)
import useSWR from 'swr'
const { data } = useSWR('/api/stocks', fetcher, {
  refreshInterval: 10000,  // Revalidate mỗi 10 giây
})
// Hiển thị data cũ ngay → fetch mới ở background → update UI

// BE: cacheService.useCache
// Trả cache cũ ngay → fetch mới ở background → update cache
```

**Pattern giống hệt!** FE devs đã quen với SWR -- BE cacheService dùng cùng concept.

---

## 5. Câu hỏi 3: Invalidate khi nào?

### Cache Invalidation -- Bài toán khó nhất

> "There are only two hard things in Computer Science: cache invalidation and naming things." -- Phil Karlton

### Strategy 1: TTL-based (tự hết hạn)

```ts
// Cache tự hết hạn sau maxAge
// Đơn giản nhất, chấp nhận data cũ trong maxAge
cacheService.useCache(() => fetchData(), ['key'], { maxAge: 60 })
// Data cũ tối đa 60 giây → chấp nhận được cho hầu hết cases
```

### Strategy 2: Event-based (xóa khi data thay đổi)

```ts
// Khi admin update room → clear cache room
async function updateRoom(roomId, data) {
  await mongo.rooms.updateOne({ _id: roomId }, { $set: data })
  cacheService.removeCacheByPrefix('room')  // Clear tất cả cache có prefix 'room'
}
```

### Strategy 3: Write-through (update cache khi ghi)

```ts
// Khi update DB → update cache luôn (không đợi expire)
async function updateStock(code, data) {
  // Update Redis (source of truth cho realtime data)
  await overviewStock.updateData(data)
  // Update local cache
  overviewStock.setCache(code, data)
}
```

### Khi nào dùng strategy nào?

| Strategy | Complexity | Consistency | Dùng khi |
|---|---|---|---|
| TTL | Thấp | Eventual (max TTL) | Data chấp nhận cũ |
| Event-based | Trung bình | Near-realtime | Data quan trọng khi thay đổi |
| Write-through | Cao | Realtime | Data phải luôn đúng |

---

## 6. Cache Stampede Protection

### Vấn đề

Cache hết hạn → 1000 requests đồng thời đều miss cache → 1000 queries DB cùng lúc!

```
Cache expired!
Request 1 → Cache MISS → Query DB
Request 2 → Cache MISS → Query DB    (cùng query!)
Request 3 → Cache MISS → Query DB    (cùng query!)
...
Request 1000 → Cache MISS → Query DB (cùng query!)
→ DB overload! 💥
```

### Giải pháp: Deferred Promises (Finpath)

```ts
// cacheService sử dụng deferredMap
// Request 1 → Cache MISS → Tạo deferred promise → Query DB
// Request 2 → Cache MISS → Thấy deferred promise → ĐỢI kết quả Request 1
// Request 3 → Cache MISS → Thấy deferred promise → ĐỢI kết quả Request 1

// Kết quả: chỉ 1 query DB, tất cả requests nhận cùng kết quả
```

```
KHÔNG có stampede protection:
1000 cache miss → 1000 DB queries 💥

CÓ stampede protection:
1000 cache miss → 1 DB query → 999 đợi kết quả ✅
```

### So sánh FE: Deduplication

```typescript
// FE: React Query tự deduplicate
// 10 components cùng call useQuery('stocks')
// → Chỉ 1 fetch request, 9 components dùng chung kết quả

// BE: cacheService deferredMap
// 1000 requests cùng cache key
// → Chỉ 1 DB query, 999 dùng chung kết quả
```

---

## 7. Caching Architecture trong Finpath

### Multi-layer cache

```
Layer 1: Memory (0.001ms)
   overviewStockCache (Map)
   NodeCache (cacheService memory engine)
        │ miss
        ▼
Layer 2: Redis/Memcached (0.3-0.5ms)
   Redis: shared cache giữa instances
   Memcached: large cache (portfolioProfit)
        │ miss
        ▼
Layer 3: Database (5-500ms)
   MongoDB: source of truth
   Kết quả được cache lại vào Layer 1 + 2
```

### Ví dụ full flow: Load thông tin Room

```
1. User mở app → GET /room/:id
2. Controller gọi cacheService.useCache(
     () => mongo.rooms.findOne({ _id: roomId }),
     ['room', roomId],
     { maxAge: 300, revalidate: 60 },
   )
3. Check memory cache → HIT? → return (0.001ms)
4. Check Redis cache → HIT? → return (0.5ms) + save to memory
5. Query MongoDB → return (5ms) + save to Redis + memory
6. Lần sau: trả từ memory (0.001ms)
7. Sau 240 giây: STALE → trả cache cũ + revalidate background
```

---

## 8. Cache Warming -- Khởi tạo cache khi app start

### Vấn đề: Cold start

App restart → tất cả cache trống → mọi request đều cache miss → DB overload.

### Giải pháp: Preload data quan trọng

```ts
// redis/models/overviewStock.ts
async function reloadData(): Promise<OverviewStock[]> {
  console.log('reloadData overviewStock')
  const results = await pubclient.hgetall(getRedisKey())
  overviewStockCache.clear()

  const codes = Object.keys(results)
  return codes.map((code) => {
    const data = JSON.parse(results[code])
    overviewStockCache.set(code, data)        // Fill memory cache
    return data
  })
}

// Gọi khi app start → cache sẵn data giá cổ phiếu
// User đầu tiên không phải đợi
```

---

## Tóm tắt

| Câu hỏi | Trả lời | Ví dụ Finpath |
|---|---|---|
| Cache ở đâu? | Memory / Redis / Memcached | overviewStock: Memory, ban: Redis, profit: Memcached |
| Cache bao lâu? | maxAge tùy tần suất thay đổi | Config: 3600s, profit: 10s, ban: 60s |
| Invalidate khi nào? | TTL / Event / Write-through | TTL + removeCacheByPrefix |
| Stampede? | Deferred promises | cacheService deferredMap |
| Cold start? | Cache warming on startup | overviewStock.reloadData() |
| Consistency? | SWR pattern | maxAge + revalidate |

## Bài tập

1. Tính năng mới: hiển thị "Trending stocks" (10 mã được xem nhiều nhất). Thiết kế caching strategy: engine nào, maxAge bao nhiêu, invalidate khi nào?
2. cacheService đang dùng maxAge=10 cho portfolioProfit. Nếu tăng lên 60, lợi ích gì? Rủi ro gì? User experience thay đổi thế nào?
3. App restart lúc 9h sáng (giờ giao dịch, 10K users online). Mô tả chuyện gì xảy ra nếu không có cache warming. Đề xuất dữ liệu nào cần warm.
