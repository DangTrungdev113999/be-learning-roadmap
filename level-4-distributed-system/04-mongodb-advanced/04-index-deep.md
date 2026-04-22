# Index sâu -- Compound, ESR Rule, Partial, TTL

## Mục tiêu

Hiểu cách index hoạt động, tại sao compound index quan trọng, và cách đọc indexes thật từ logics. Đây là kiến thức then chốt để query 100M+ rows mà vẫn nhanh.

---

## 1. Index là gì? -- So sánh dễ hiểu

### Không có index

Giống như **tìm 1 từ trong cuốn sách 1000 trang mà không có mục lục**. Phải đọc từ trang 1 đến trang 1000.

```
Tìm "VNM" trong 100M events → scan TẤT CẢ 100M documents → 30 giây
```

### Có index

Giống như **tra mục lục cuối sách**. Mục lục đã sắp xếp theo ABC, tìm "VNM" → trang 847.

```
Tìm "VNM" trong 100M events → tra index → nhảy thẳng tới docs phù hợp → 50ms
```

### So sánh FE

```typescript
// FE: tìm trong array nhỏ → OK
const found = users.find(u => u.name === 'Trung')  // scan 100 items, nhanh

// BE: tìm trong 100M rows → PHẢI có index
db.analysisEvents.find({ key: 'VNM' })  // không index = 30s, có index = 50ms
```

---

## 2. Single field index

```typescript
// Tạo index trên 1 field
schema.index({ createdAt: 1 })   // 1 = tăng dần
schema.index({ createdAt: -1 })  // -1 = giảm dần

// Index này giúp query nhanh:
db.collection.find({ createdAt: { $gte: from } })
db.collection.find().sort({ createdAt: -1 })
```

**Ví dụ thật từ watchLists:**

```typescript
schema.index({ createdAt: 1 })
// Query nhanh: "Tìm watchlists tạo sau ngày X"
// Sort nhanh: "Sắp xếp theo ngày tạo"
```

---

## 3. Compound index -- Index nhiều fields

Compound index = index trên **nhiều fields cùng lúc**. Thứ tự fields rất quan trọng.

### Ví dụ thật từ analysisEvents

```typescript
schema.index({ key: 1, createdAt: -1 })
```

Đây là index trên 2 fields: `key` (tăng dần) rồi `createdAt` (giảm dần).

**Tưởng tượng như danh bạ điện thoại:** sắp xếp theo **họ** trước, rồi theo **tên** trong cùng họ.

```
Index { key, createdAt }:
├── key: 'click'
│   ├── createdAt: 2026-03-18
│   ├── createdAt: 2026-03-17
│   └── createdAt: 2026-03-16
├── key: 'purchase'
│   ├── createdAt: 2026-03-18
│   └── createdAt: 2026-03-15
└── key: 'view'
    ├── createdAt: 2026-03-18
    ├── createdAt: 2026-03-17
    └── createdAt: 2026-03-16
```

### Query nào được index hỗ trợ?

```typescript
// Index: { key: 1, createdAt: -1 }

// ✅ Dùng được -- match key, rồi range trên createdAt
db.find({ key: 'view', createdAt: { $gte: from, $lte: to } })

// ✅ Dùng được -- match key (prefix match)
db.find({ key: 'view' })

// ❌ KHÔNG dùng được -- chỉ match createdAt, không có key
db.find({ createdAt: { $gte: from } })
// Vì index sắp theo key trước, không thể nhảy thẳng tới createdAt
```

**Quy tắc prefix:** Compound index `{ A, B, C }` hỗ trợ query trên:
- `{ A }` -- prefix 1 field
- `{ A, B }` -- prefix 2 fields
- `{ A, B, C }` -- cả 3 fields
- **KHÔNG** hỗ trợ `{ B }`, `{ C }`, `{ B, C }` -- không phải prefix

---

## 4. ESR Rule -- Thứ tự fields trong compound index

**E-S-R** = **Equality - Sort - Range**

Khi thiết kế compound index, đặt fields theo thứ tự:

| Thứ tự | Loại | Ví dụ | Giải thích |
|--------|------|-------|------------|
| 1. Equality | `key: 'view'` | `{ $eq: 'view' }`, `{ $in: [...] }` | Match chính xác, thu hẹp nhanh nhất |
| 2. Sort | `createdAt: -1` | `$sort: { createdAt: -1 }` | Sắp xếp trên phần đã lọc |
| 3. Range | `price: { $gte: 50 }` | `{ $gte: 50, $lte: 100 }` | Lọc khoảng, thu hẹp thêm |

### Ví dụ ESR

Query: "Tìm events có key = 'view', trong 30 ngày gần nhất, sắp xếp theo createdAt giảm dần"

```typescript
// Query
db.analysisEvents.find({
  key: 'view',                                    // Equality
  createdAt: { $gte: thirtyDaysAgo, $lte: now },  // Range
}).sort({ createdAt: -1 })                         // Sort

// Index tối ưu theo ESR:
// E: key (equality)
// S: createdAt (sort + range -- khi sort và range cùng field, đặt ở S)
schema.index({ key: 1, createdAt: -1 })  // ← Index thật trong logics!
```

**Tại sao index `{ key: 1, createdAt: -1 }` trong logics đúng ESR:**
- `key` = Equality (key: { $in: keys })
- `createdAt` = Sort + Range (sort giảm dần + range gte/lte)

### Ví dụ sai thứ tự

```typescript
// ❌ Index sai: range trước equality
schema.index({ createdAt: -1, key: 1 })
// Query { key: 'view', createdAt: { $gte: ... } }
// MongoDB phải scan tất cả dates, rồi mới filter key → chậm

// ✅ Index đúng: equality trước range
schema.index({ key: 1, createdAt: -1 })
// MongoDB nhảy thẳng tới key='view', rồi scan range → nhanh
```

---

## 5. Real indexes từ logics

### watchLists

```typescript
schema.index({ createdAt: 1 })
// Query: sắp xếp theo ngày tạo

schema.index({ updatedAt: 1, isDeleted: 1 })
// Query: tìm watchlists chưa xoá, sắp theo ngày update
// ESR: isDeleted (equality) nên đặt trước updatedAt,
// nhưng index hiện tại vẫn OK vì updatedAt dùng cho range + sort

schema.index({ userId: 1, isDeleted: 1 })
// Query: tìm watchlists của 1 user, chưa xoá
// ESR đúng: userId (equality) → isDeleted (equality)
```

### analysisEvents (100M+ rows)

```typescript
schema.index({ key: 1, createdAt: -1 })
// Query chính: getEventCounts, getTopContent
// $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } }
// ESR: key (equality) → createdAt (sort/range)
// Tại sao createdAt giảm dần (-1)? Query thường lấy data gần nhất

schema.index({ key: 1, uid: 1, createdAt: -1 })
// Query: getActiveUsers
// $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } }
// $group: { _id: { uid: '$uid', date: ... } }
// Index cover cả uid trong $group → nhanh hơn
// ESR: key (equality) → uid (equality trong group) → createdAt (range)
```

### portfolios

```typescript
schema.index({ userId: 1, roomId: 1, isDeleted: 1 })
// Query: tìm portfolio của 1 user trong 1 room, chưa xoá
// ESR: userId (equality) → roomId (equality) → isDeleted (equality)
// Tất cả equality → thứ tự dựa vào selectivity (userId unique nhất → đặt đầu)
```

---

## 6. Partial index -- Index có điều kiện

Chỉ index documents thoả mãn điều kiện. Tiết kiệm dung lượng.

```typescript
// Chỉ index documents chưa bị xoá
schema.index(
  { userId: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
)

// Index này CHỈ chứa documents có isDeleted: false
// Kích thước nhỏ hơn nhiều so với index toàn bộ
// Query PHẢI có { isDeleted: false } trong filter để dùng partial index
```

**Khi nào dùng:**
- Phần lớn data là "soft deleted" (`isDeleted: true`), chỉ query data chưa xoá
- Chỉ query documents có 1 field cụ thể tồn tại

---

## 7. TTL index -- Tự động xoá data cũ

TTL = Time To Live. MongoDB tự động xoá documents sau thời gian quy định.

```typescript
// Tự động xoá documents sau 90 ngày
schema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }  // 90 ngày tính bằng giây
)

// MongoDB chạy background thread, mỗi 60 giây kiểm tra và xoá docs hết hạn
```

**Khi nào dùng:**
- Session tokens (hết hạn sau 24h)
- Log entries (giữ 30 ngày)
- Temporary data (OTP codes, verification links)

**Lưu ý:** TTL index chỉ hoạt động trên field kiểu Date, và chỉ trên single field index.

---

## 8. Tại sao query 100M rows mà vẫn nhanh?

Quay lại pipeline getEventCounts:

```typescript
{ $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } }
```

Với index `{ key: 1, createdAt: -1 }`:

```
100M documents
    │
    │ Index lookup: key = 'view'
    │ → Nhảy thẳng tới phần 'view' trong index
    ▼
5M documents (chỉ key = 'view')
    │
    │ Index scan: createdAt trong 60 ngày
    │ → Scan trong phạm vi đã sorted
    ▼
200K documents (view + 60 ngày)
    │
    │ $group, $sort, $project
    ▼
60 documents (1 per day × 60 days)
```

**Từ 100M → 200K nhờ index, rồi aggregate 200K → 60 kết quả.** Toàn bộ mất ~200ms.

Nếu KHÔNG có index:

```
100M documents
    │
    │ COLLSCAN: đọc TẤT CẢ 100M documents
    │ Kiểm tra từng doc: key = 'view'? createdAt trong range?
    ▼
200K documents
    │ ... (phần sau giống nhau)
    ▼
```

**Scan 100M documents mất 30-60 giây.** Đó là lý do index quan trọng.

---

## 9. Nguyên tắc thiết kế index

| Nguyên tắc | Giải thích |
|-------------|------------|
| Equality fields đầu tiên | Thu hẹp nhanh nhất |
| Sort field giữa | MongoDB dùng index để sort, không cần sort trong memory |
| Range field cuối | Scan range trong phần đã thu hẹp |
| Đừng tạo quá nhiều index | Mỗi index tốn disk + chậm write |
| Xem explain trước khi tạo | Đảm bảo query thực sự dùng index mới |
| Index trên field selectivity cao | userId (unique) hiệu quả hơn status (chỉ 3 giá trị) |

---

## Tóm tắt

- Index = "mục lục" giúp MongoDB tìm data **không cần scan toàn bộ**
- **Compound index** = index nhiều fields, thứ tự quan trọng
- **ESR rule** (Equality → Sort → Range) = cách đặt thứ tự tối ưu
- Index thật trong logics: `{ key: 1, createdAt: -1 }` cho analysisEvents 100M+ rows
- **Partial index** tiết kiệm dung lượng, **TTL index** tự xoá data cũ
- Bài tiếp theo sẽ học cách dùng **explain** để kiểm tra query có dùng index không
