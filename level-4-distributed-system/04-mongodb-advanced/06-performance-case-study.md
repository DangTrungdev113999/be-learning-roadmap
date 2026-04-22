# Case Study: analyticsService query 100M+ rows

## Mục tiêu

Phân tích case study thực tế: tại sao analyticsService có thể query collection analysisEvents (100M+ rows) mà vẫn trả kết quả trong vài trăm ms. Tất cả quyết định thiết kế đều có lý do.

---

## 1. Bối cảnh

### Collection analysisEvents

- **100M+ documents** (hơn 100 triệu dòng)
- Mỗi document = 1 event analytics: user xem trang, click nút, mua gói...
- Tăng liên tục: ~500K-1M documents mới mỗi ngày
- Được query bởi dashboard analytics (FE gọi API → logics → MongoDB)

### Yêu cầu

- Dashboard cần hiển thị biểu đồ events, active users, top content
- API response phải < 1 giây (FE không chấp nhận loading > 2 giây)
- Data range: tối đa 60 ngày (MAX_DATE_RANGE_DAYS = 60)

---

## 2. Quyết định 1: Giới hạn date range (MAX_DATE_RANGE_DAYS = 60)

```typescript
export const MAX_DATE_RANGE_DAYS = 60
```

### Tại sao không cho query 365 ngày?

**Tính toán:**
- 1 ngày ≈ 800K events
- 60 ngày ≈ 48M events cần scan (sau filter by key: ~5M)
- 365 ngày ≈ 292M events → vượt kích thước collection, scan quá lâu

```
60 ngày:  $match scan ~5M docs → $group → response 200ms   ✅
365 ngày: $match scan ~30M docs → $group → response 8-15s  ❌
```

### Lịch sử thay đổi

Commit `04960959`: `fix(analytics): reduce max date range from 365 to 60 days`

Ban đầu cho phép 365 ngày, nhưng khi collection vượt 100M rows, query quá chậm. Giảm xuống 60 ngày là trade-off: vẫn đủ data cho dashboard (2 tháng), nhưng đảm bảo performance.

### Validate ở đâu?

```typescript
// Controller validate trước khi gọi service
const diffDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24))
util.check(diffDays <= MAX_DATE_RANGE_DAYS, `Khoảng thời gian tối đa ${MAX_DATE_RANGE_DAYS} ngày code:date_range_exceeded`)
```

---

## 3. Quyết định 2: Index design cho 100M+ rows

### Index 1: `{ key: 1, createdAt: -1 }`

```typescript
schema.index({ key: 1, createdAt: -1 })
```

**Dùng cho:** getEventCounts, getTopContent

```typescript
// getEventCounts
{ $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } }
//          ↑ equality (E)       ↑ range (R)
// Index: key (E) → createdAt (R) → đúng ESR
```

**Tại sao `createdAt: -1` (giảm dần)?**
- Query thường lấy data gần nhất (`$lte: now`)
- Với `-1`, data mới nhất ở đầu index → scan ít hơn
- Nếu `1` (tăng dần), phải scan từ đầu index → lâu hơn cho data gần đây

### Index 2: `{ key: 1, uid: 1, createdAt: -1 }`

```typescript
schema.index({ key: 1, uid: 1, createdAt: -1 })
```

**Dùng cho:** getActiveUsers

```typescript
// getActiveUsers -- pipeline
{ $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } }
{ $group: { _id: { uid: '$uid', date: ... } } }
//                   ↑ group cần uid
```

**Tại sao thêm `uid`?**
- Pipeline group theo `uid` -- nếu uid nằm trong index, MongoDB có thể dùng index để tối ưu $group
- Đây gọi là **covered query**: dữ liệu lấy từ index, không cần đọc document gốc (FETCH)
- Index này là **superset** của index 1: hỗ trợ cả query chỉ cần `{ key, createdAt }`

### Tại sao không tạo thêm nhiều index?

```
Mỗi index = chi phí:
- Disk: index 100M docs ≈ 2-5GB mỗi index
- Write: mỗi document mới phải update TẤT CẢ indexes
- 500K docs/ngày × N indexes = N × 500K index updates/ngày
```

Chỉ tạo index cần thiết. 2 indexes cho collection 100M rows là hợp lý.

---

## 4. Quyết định 3: $match filter key trước

### Tại sao `key: { $in: keys }` luôn đi kèm `createdAt`?

```typescript
// ✅ Luôn filter key + createdAt
{ $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } }

// ❌ Chỉ filter createdAt -- KHÔNG làm thế
{ $match: { createdAt: { $gte: from, $lte: to } } }
```

**Lý do:** Index `{ key: 1, createdAt: -1 }` cần key là prefix. Nếu chỉ filter createdAt, MongoDB không thể dùng index → COLLSCAN 100M docs.

### Phân tích hiệu quả

```
100M total documents
    │
    │ Filter: key IN ['view', 'click'] (equality, dùng index)
    ▼
30M documents (chỉ view + click, ~30% total)
    │
    │ Filter: createdAt 60 ngày (range, tiếp tục dùng index)
    ▼
5M documents (view + click + 60 ngày, ~5% total)
    │
    │ $group, $sort, $project
    ▼
120 documents (60 ngày × 2 keys)
```

**Từ 100M → 5M nhờ index, → 120 kết quả nhờ aggregation.**

---

## 5. Quyết định 4: allowDiskUse(true)

```typescript
.allowDiskUse(true)
```

### Tại sao bắt buộc?

MongoDB giới hạn **100MB RAM** cho mỗi aggregation stage. Tính toán:

```
$match trả về: ~5M documents
Mỗi document khoảng: 200 bytes
Tổng: 5M × 200 bytes = ~1GB

$group cần giữ tất cả nhóm trong memory:
- getEventCounts: 60 ngày × 5 keys = 300 nhóm (nhỏ, OK)
- getActiveUsers group 1: uid × date = có thể 500K+ nhóm

$sort sau $group:
- Nếu > 100MB → MongoDB báo lỗi nếu không có allowDiskUse
```

**allowDiskUse(true)** cho phép spill data ra disk khi vượt 100MB RAM. Chậm hơn RAM nhưng không bị lỗi.

### Khi nào KHÔNG cần?

- Collection < 1M documents
- $group chỉ tạo vài trăm nhóm
- Data sau $match đã rất nhỏ

---

## 6. Quyết định 5: Giới hạn limit

```typescript
export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 100
```

### Dùng ở đâu?

```typescript
// getTopContent
{ $limit: limit }  // limit = min(requestedLimit, MAX_LIMIT)
```

### Tại sao MAX_LIMIT = 100?

- FE hiển thị top content → 20 items là đủ cho 1 trang
- Cho phép tối đa 100 → pagination hoặc export
- Không giới hạn → FE có thể request 10,000 items → query chậm + bandwidth lớn

```typescript
// Validate trong controller/service
const limit = Math.min(util.gp('limit', DEFAULT_LIMIT, 'number'), MAX_LIMIT)
```

---

## 7. Quyết định 6: Double group thay vì $addToSet

### getActiveUsers dùng double group

```typescript
// Group 1: distinct (uid, date) pairs
{ $group: { _id: { uid: '$uid', date: ... } } }
// Group 2: đếm unique users mỗi ngày
{ $group: { _id: '$_id.date', count: { $sum: 1 } } }
```

### Tại sao không dùng $addToSet?

```typescript
// ❌ Cách dùng $addToSet
{ $group: {
  _id: date,
  users: { $addToSet: '$uid' }  // Thu thập tất cả uid vào array
} }
{ $addFields: { count: { $size: '$users' } } }
```

**Vấn đề với $addToSet trên data lớn:**

```
1 ngày có 50,000 unique users:
- $addToSet tạo array 50,000 phần tử trong memory
- 60 ngày → 60 arrays × 50,000 = 3M strings trong memory
- Mỗi uid ~24 bytes → 3M × 24 bytes = ~72MB chỉ cho arrays

Double group:
- Group 1: tạo 3M documents nhỏ (mỗi doc chỉ có _id)
- Group 2: đếm → kết quả 60 documents
- Không tạo array lớn → ít memory hơn
```

Commit `838dce81`: `fix(analytics): optimize queries for 100M+ row analysisEvents collection` -- chuyển từ $addToSet sang double group.

---

## 8. Tổng hợp: Tất cả tối ưu cùng nhau

```
                     ┌──────────────────────────────────┐
                     │     FE request analytics API     │
                     └──────────────┬───────────────────┘
                                    │
                     ┌──────────────▼───────────────────┐
                     │  Controller: validate inputs     │
                     │  - date range ≤ 60 ngày          │  ← Quyết định 1
                     │  - limit ≤ 100                   │  ← Quyết định 5
                     └──────────────┬───────────────────┘
                                    │
                     ┌──────────────▼───────────────────┐
                     │  $match: key + createdAt         │
                     │  - Dùng index { key, createdAt } │  ← Quyết định 2, 3
                     │  - 100M → 5M documents           │
                     └──────────────┬───────────────────┘
                                    │
                     ┌──────────────▼───────────────────┐
                     │  $group: double group pattern    │  ← Quyết định 6
                     │  - allowDiskUse(true)            │  ← Quyết định 4
                     │  - 5M → 120 documents            │
                     └──────────────┬───────────────────┘
                                    │
                     ┌──────────────▼───────────────────┐
                     │  Response: 120 data points       │
                     │  - executionTime: ~200ms          │
                     │  - Payload: ~5KB                  │
                     └──────────────────────────────────┘
```

---

## 9. Performance timeline

| Giai đoạn | Collection size | Query time | Thay đổi |
|-----------|----------------|------------|----------|
| Ban đầu | 1M rows | 50ms | Không cần tối ưu |
| 6 tháng | 10M rows | 200ms | Thêm compound index |
| 1 năm | 50M rows | 500ms | Vẫn OK nhờ index |
| 1.5 năm | 100M rows | 8-15 giây | Query 365 ngày quá chậm |
| Sau tối ưu | 100M rows | 200ms | Giảm range 60 ngày, double group, allowDiskUse |

---

## 10. Bài học rút ra

| Bài học | Chi tiết |
|---------|----------|
| Giới hạn input | MAX_DATE_RANGE_DAYS, MAX_LIMIT ngăn query quá lớn |
| Index theo query pattern | Thiết kế index dựa trên queries thực tế, không phải đoán |
| ESR rule | Equality (key) → Range (createdAt) cho compound index |
| Tránh tạo array lớn | Double group thay $addToSet khi data lớn |
| allowDiskUse | Bắt buộc khi aggregation trên collection lớn |
| Monitor và iterate | Bắt đầu đơn giản, tối ưu khi data tăng lên |

### Nguyên tắc chung

```
Khi collection < 1M:   Viết query đơn giản, index cơ bản, chạy nhanh rồi.
Khi collection 1-10M:  Thêm compound index theo ESR rule.
Khi collection 10-100M: Giới hạn query range, optimize pipeline, allowDiskUse.
Khi collection > 100M:  Cân nhắc sharding, archiving data cũ, hoặc pre-aggregation.
```

---

## Tóm tắt

- analyticsService query **100M+ rows trong ~200ms** nhờ kết hợp 6 quyết định tối ưu
- **Giới hạn date range** (60 ngày) là trade-off quan trọng nhất -- giảm data scan 5-6 lần
- **Compound index** `{ key: 1, createdAt: -1 }` theo ESR rule -- giảm scan từ 100M xuống 5M
- **Double group** thay $addToSet -- tránh tạo array lớn trong memory
- **allowDiskUse(true)** -- bắt buộc khi aggregation trên data lớn
- Performance không phải tối ưu 1 lần -- cần **monitor và iterate** khi data tăng
