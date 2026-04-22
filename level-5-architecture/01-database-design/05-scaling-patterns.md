# Database Scaling Patterns -- Khi 1 server không đủ

## Mục tiêu

Hiểu 3 chiến lược scale database: Sharding, Read Replicas, Connection Pooling. Cách Finpath áp dụng với MongoDB và Redis.

---

## 1. Tại sao cần scale database?

### Giới hạn của 1 server

```
                     1 MongoDB Server
                          │
              ┌───────────┼───────────┐
              │           │           │
         100M+ writes   100M+ reads  500GB+ data
         /ngày          /ngày
              │           │           │
              ▼           ▼           ▼
         CPU 100%     Disk I/O max  RAM không đủ
                                    cho indexes
```

Finpath có collection `analysisEvents` với **100 triệu+ documents**. Khi traffic tăng:
- Reads (query analytics) cạnh tranh resources với writes (log events)
- Index không fit trong RAM → query chậm
- 1 server = single point of failure

### 3 chiến lược

| Chiến lược | Giải quyết | Cách làm |
|---|---|---|
| Read Replicas | Read quá nhiều | Copy data sang server khác, đọc từ copy |
| Sharding | Data quá lớn | Chia data ra nhiều server |
| Connection Pooling | Connection quá nhiều | Tái sử dụng connections |

---

## 2. Read Replicas -- Đọc từ bản sao

### Khái niệm

Primary server xử lý writes. Dữ liệu tự động **replicate** sang Secondary servers. Reads có thể đọc từ Secondary.

```
                     Writes
                       │
                       ▼
                  ┌─────────┐
                  │ Primary │
                  │ (ghi)   │
                  └────┬────┘
                       │ replication
              ┌────────┼────────┐
              ▼                 ▼
        ┌──────────┐     ┌──────────┐
        │Secondary │     │Secondary │
        │ (đọc)    │     │ (đọc)    │
        └──────────┘     └──────────┘
```

### Ví dụ thực tế: Redis Sentinel trong Finpath

```ts
// redis/client.ts
const pubclient = new Redis(redisConfig)         // Primary: read + write
const slaveclient = new Redis(redisSlaveConfig)   // Slave: read only

// Redis Sentinel: tự động chuyển slave thành primary khi primary chết
// Config: sentinels: [{ host, port }]
```

```ts
// redis/models/overviewStock.ts
import { slaveclient as pubclient } from '../client'

// Dữ liệu giá cổ phiếu đọc từ SLAVE
// Vì: đọc rất nhiều (mỗi user load app = query), ghi ít (chỉ khi giá thay đổi)
```

### Tại sao đọc từ slave?

```
Primary xử lý: Writes + Critical reads
Slave xử lý:   High-frequency reads (giá cổ phiếu, overview data)

Kết quả: Primary bớt tải → writes nhanh hơn
         Slaves chuyên đọc → reads nhanh hơn
```

### Trade-off: Eventual Consistency

```
Thời điểm T1: Primary write { VNM: 85000 }
Thời điểm T2: Slave vẫn có { VNM: 84900 }  ← Replication lag
Thời điểm T3: Slave cập nhật { VNM: 85000 } ← Consistent
```

Khoảng T2-T3 gọi là **replication lag** (thường 1-100ms). Trong thời gian này, slave trả data cũ.

**Chấp nhận được không?**
- Giá cổ phiếu: lag 100ms chấp nhận được (giá thay đổi liên tục)
- Số dư tài khoản: KHÔNG chấp nhận → phải đọc từ Primary

### So sánh FE: Optimistic updates

```typescript
// FE: Optimistic update -- hiển thị ngay, sync sau
const [liked, setLiked] = useState(false)
const handleLike = () => {
  setLiked(true)          // Hiển thị ngay (optimistic)
  api.likePost(postId)    // Sync lên server (async)
}
// Nếu API fail → revert state

// BE: Read from slave -- có thể data cũ, nhưng eventually consistent
```

---

## 3. Sharding -- Chia data ra nhiều server

### Khái niệm

Khi **1 server không chứa đủ data**, chia collection ra nhiều servers (shards). Mỗi shard chứa **1 phần** data.

```
                    MongoDB Router (mongos)
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │Shard 1 │  │Shard 2 │  │Shard 3 │
         │A-F     │  │G-N     │  │O-Z     │
         └────────┘  └────────┘  └────────┘
```

### Shard Key -- Quyết định quan trọng nhất

Shard key quyết định document nào nằm trên shard nào. Chọn sai = performance tệ.

```ts
// Ví dụ: Shard analysisEvents theo userId
// Shard key: { uid: 'hashed' }

// Shard 1: uid hash 0-33%
// Shard 2: uid hash 34-66%
// Shard 3: uid hash 67-100%

// Query có uid → chỉ đọc 1 shard (targeted query) ✅
db.analysisEvents.find({ uid: 'user123', key: 'page_view' })

// Query KHÔNG có uid → đọc TẤT CẢ shards (scatter-gather) ❌
db.analysisEvents.find({ key: 'page_view', createdAt: { $gte: from } })
```

### Chọn Shard Key

| Tiêu chí | Tốt | Xấu |
|---|---|---|
| Cardinality (số giá trị) | userId (triệu giá trị) | status (3 giá trị) |
| Distribution | Phân bổ đều | 80% data có cùng giá trị |
| Query pattern | Query luôn có shard key | Query thường không có shard key |
| Write distribution | Writes phân bổ đều | Tất cả writes vào 1 shard (hotspot) |

### Ví dụ chọn shard key cho analysisEvents

```ts
// analysisEvents schema
{
  uid: String,       // userId
  key: String,       // event name: 'page_view', 'click', ...
  val: Object,       // event data
  createdAt: Date,
}

// Option 1: { uid: 'hashed' }
// ✅ Phân bổ đều (triệu users)
// ✅ Query thường có uid
// ❌ Scatter-gather khi query tất cả users

// Option 2: { key: 1, createdAt: 1 }
// ❌ key chỉ có ~50 giá trị → unbalanced
// ✅ Range queries trên createdAt targeted

// Option 3: { uid: 'hashed', key: 1 }
// ✅ Compound: phân bổ đều + targeted query
// ✅ Query thường có cả uid và key
```

### Khi nào cần sharding?

- Collection > **100GB** trên 1 server
- **Write throughput** vượt capacity của 1 server
- **Index size** > RAM available

> **Finpath hiện tại:** Chưa cần sharding cho hầu hết collections. `analysisEvents` có thể cần trong tương lai khi vượt vài trăm triệu documents.

---

## 4. Connection Pooling -- Tái sử dụng connections

### Vấn đề

Mỗi request tạo 1 connection mới → overhead lớn (TCP handshake, auth, SSL).

```
❌ Không có pool:
Request 1 → Open connection → Query → Close connection    (100ms overhead)
Request 2 → Open connection → Query → Close connection    (100ms overhead)
Request 3 → Open connection → Query → Close connection    (100ms overhead)

✅ Có pool:
App startup → Open 10 connections (pool)
Request 1 → Borrow connection → Query → Return to pool    (0ms overhead)
Request 2 → Borrow connection → Query → Return to pool    (0ms overhead)
Request 3 → Borrow connection → Query → Return to pool    (0ms overhead)
```

### Mongoose connection pool

```ts
// Mongoose mặc định tạo pool 100 connections
mongoose.connect('mongodb://localhost/finpath', {
  maxPoolSize: 100,     // Tối đa 100 connections
  minPoolSize: 10,      // Giữ tối thiểu 10 connections
  maxIdleTimeMS: 30000, // Đóng connection idle > 30s
})
```

### Tính toán pool size

```
Công thức đơn giản:
Pool size = Số concurrent requests × Thời gian query trung bình / 1000

Ví dụ:
- 200 concurrent requests
- Query trung bình 50ms
- Pool size = 200 × 50 / 1000 = 10 connections

Nhưng thực tế: để dư (x2-x3) cho spike traffic
→ Pool size = 30
```

### So sánh FE: HTTP connection reuse

```typescript
// FE: axios giữ HTTP connections (HTTP/2 multiplexing)
const api = axios.create({
  baseURL: 'https://api.finpath.vn',
  // Browser tự quản lý connection pool (6 connections per host)
})

// BE: Mongoose giữ MongoDB connections
// App quản lý pool size
```

---

## 5. Chiến lược Scale của Finpath

### Hiện tại

```
                    Load Balancer (Nginx)
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │logics  │  │logics  │  │logics  │
         │inst.1  │  │inst.2  │  │inst.3  │
         └───┬────┘  └───┬────┘  └───┬────┘
              │           │           │
              └─────┬─────┘     ┌─────┘
                    ▼           ▼
              ┌──────────┐ ┌──────────┐
              │ MongoDB  │ │  Redis   │
              │ Primary  │ │ Primary  │
              │ + Replica│ │ + Slave  │
              └──────────┘ └──────────┘
```

**Nhiều instances logics** → cần:
- `lockService.acquire()` -- distributed lock để tránh race conditions
- Redis pub/sub -- đồng bộ cache giữa instances
- Stateless design -- không lưu state trong memory app

### Scale path

```
Bước 1 (hiện tại): Multiple app instances + Single DB
         → Bottleneck: DB

Bước 2: Read replicas
         → Đọc từ slave, ghi vào primary
         → Giảm tải primary

Bước 3: Sharding cho collections lớn
         → analysisEvents, deviceLogs
         → Khi single server không chứa đủ

Bước 4: Dedicated databases
         → Tách DB riêng cho từng service
         → logics DB, analytics DB, feed DB
```

---

## 6. Redis Scaling trong Finpath

### Hiện tại: Sentinel (High Availability)

```ts
// config/redis.ts -- Primary
{ sentinels: [{ host: 'sentinel1', port: 26379 }], name: 'mymaster' }

// config/redisSlave.ts -- Slave
{ sentinels: [{ host: 'sentinel1', port: 26379 }], name: 'mymaster', role: 'slave' }
```

**Redis Sentinel** không phải scaling, mà là **High Availability** (HA):
- Sentinel monitor primary
- Primary chết → Sentinel promote slave thành primary
- App tự reconnect đến primary mới

### Khi cần scale Redis

```
Option 1: Redis Cluster (sharding)
- Data chia thành 16384 slots
- Mỗi node giữ một phần slots
- Key hash → slot → node

Option 2: Nhiều Redis instances (manual)
- Redis 1: stock data (high-frequency reads)
- Redis 2: cache data
- Redis 3: pub/sub
```

### Phân tách theo use case (Finpath)

```
Redis Primary:    pub/sub, writes, critical reads
Redis Slave:      High-frequency reads (giá cổ phiếu)
                  Dùng cho: overviewStock, overviewIndex, stockBar...
                  Đọc hàng nghìn lần/giây
```

---

## Tóm tắt

| Pattern | Khi nào | Cách làm | Finpath |
|---|---|---|---|
| Read Replicas | Reads nhiều hơn writes | Replicate + đọc từ slave | Redis slaveclient |
| Sharding | Data quá lớn cho 1 server | Chia data theo shard key | Chưa cần (tương lai) |
| Connection Pool | Nhiều concurrent requests | Tái sử dụng connections | Mongoose pool |
| Sentinel/HA | Tránh downtime | Auto-failover | Redis Sentinel |

## Bài tập

1. Collection `analysisEvents` có 200 triệu documents. Đề xuất shard key, giải thích tại sao. Có query patterns nào bị ảnh hưởng (scatter-gather)?
2. Redis overviewStock được đọc 5000 lần/giây. Nếu slave lag 200ms, tác động đến user experience thế nào? Chấp nhận được không?
3. App có 3 instances, mỗi instance có Mongoose pool size 50. Tổng connections tối đa đến MongoDB là bao nhiêu? MongoDB default max connections là 65536. Có cần lo không?
4. Vẽ sơ đồ scaling architecture cho Finpath nếu traffic tăng gấp 10 lần. Cần thay đổi gì ở DB layer?
