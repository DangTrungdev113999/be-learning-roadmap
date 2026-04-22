# explain() -- Phân tích query performance

## Mục tiêu

Học cách dùng `.explain('executionStats')` để biết query có dùng index không, scan bao nhiêu documents, mất bao lâu. Đây là công cụ chẩn đoán quan trọng nhất khi query chậm.

---

## 1. explain() là gì?

**So sánh FE:** Giống như mở DevTools → Network tab → xem request mất bao lâu, payload bao nhiêu bytes.

**MongoDB explain:** cho biết query thực sự làm gì bên trong -- dùng index hay scan toàn bộ, đọc bao nhiêu documents, mất bao lâu.

```typescript
// Thêm .explain() vào cuối query
db.analysisEvents.find({ key: 'view' }).explain('executionStats')

// Aggregation pipeline
db.analysisEvents.aggregate([
  { $match: { key: 'view', createdAt: { $gte: from, $lte: to } } },
  { $group: { _id: '$key', count: { $sum: 1 } } },
]).explain('executionStats')
```

### 3 modes

| Mode | Output | Khi nào dùng |
|------|--------|-------------|
| `'queryPlanner'` | Plan MongoDB sẽ dùng | Xem query dùng index nào |
| `'executionStats'` | Plan + thống kê thực thi | **Dùng mode này** -- đầy đủ nhất |
| `'allPlansExecution'` | Tất cả plans đã thử | Debug tại sao MongoDB chọn plan sai |

---

## 2. Đọc output explain -- Các field quan trọng

Output explain rất dài, nhưng chỉ cần focus vào vài field:

### executionStats (quan trọng nhất)

```json
{
  "executionStats": {
    "executionSuccess": true,
    "nReturned": 200000,
    "executionTimeMillis": 180,
    "totalKeysExamined": 200000,
    "totalDocsExamined": 200000
  }
}
```

| Field | Ý nghĩa | Giá trị tốt |
|-------|---------|-------------|
| `nReturned` | Số documents trả về | Càng nhỏ càng tốt |
| `executionTimeMillis` | Thời gian thực thi (ms) | < 1000ms |
| `totalKeysExamined` | Số index entries đã scan | Gần bằng nReturned |
| `totalDocsExamined` | Số documents đã đọc | Gần bằng nReturned |

### Tỉ lệ quan trọng

```
Tốt:  totalDocsExamined ≈ nReturned
      (Đọc bao nhiêu, trả về bấy nhiêu -- không lãng phí)

Tệ:   totalDocsExamined >> nReturned
      (Đọc 1M documents nhưng chỉ trả 100 -- scan quá nhiều)

Ví dụ:
✅ nReturned: 200, totalDocsExamined: 200     → Tỉ lệ 1:1, hoàn hảo
⚠️ nReturned: 200, totalDocsExamined: 50000   → Tỉ lệ 1:250, cần tối ưu
❌ nReturned: 200, totalDocsExamined: 100000000 → Tỉ lệ 1:500000, FULL SCAN!
```

---

## 3. IXSCAN vs COLLSCAN -- Sự khác biệt then chốt

### IXSCAN (Index Scan) -- Tốt

```json
{
  "winningPlan": {
    "stage": "FETCH",
    "inputStage": {
      "stage": "IXSCAN",
      "keyPattern": { "key": 1, "createdAt": -1 },
      "indexName": "key_1_createdAt_-1",
      "indexBounds": {
        "key": ["[\"view\", \"view\"]"],
        "createdAt": ["[2026-03-18, 2026-02-16]"]
      }
    }
  }
}
```

- `stage: "IXSCAN"` → MongoDB dùng index
- `keyPattern` → index nào đang dùng
- `indexBounds` → phạm vi scan trên index (đã thu hẹp)

### COLLSCAN (Collection Scan) -- Tệ

```json
{
  "winningPlan": {
    "stage": "COLLSCAN",
    "filter": {
      "key": { "$eq": "view" }
    },
    "direction": "forward"
  }
}
```

- `stage: "COLLSCAN"` → MongoDB scan **TOÀN BỘ** collection
- Không có index nào được dùng
- Với 100M rows → 30-60 giây

### So sánh trực quan

```
IXSCAN (có index):
┌─────────────────────────────────────────────────┐
│ Index: { key: 1, createdAt: -1 }                │
│                                                 │
│ click ── 03/18, 03/17, 03/16 ...                │
│ view  ── 03/18, 03/17, 03/16 ...  ← nhảy tới   │
│ purchase ── 03/18, 03/15 ...                    │
│                                                 │
│ Scan: chỉ phần view + 60 ngày = 200K docs      │
└─────────────────────────────────────────────────┘

COLLSCAN (không index):
┌─────────────────────────────────────────────────┐
│ Documents (không sắp xếp):                      │
│                                                 │
│ doc1 (click, 03/18) → check: key=view? NO       │
│ doc2 (view, 03/17) → check: key=view? YES ✓     │
│ doc3 (purchase, 03/15) → check: key=view? NO    │
│ ... lặp lại 100M lần ...                        │
│                                                 │
│ Scan: TẤT CẢ 100M docs                          │
└─────────────────────────────────────────────────┘
```

---

## 4. Ví dụ thực tế -- Before/After optimization

### Before: Query chậm (không index phù hợp)

```typescript
// Query: tìm active users theo uid
db.analysisEvents.find({
  uid: 'user123',
  createdAt: { $gte: thirtyDaysAgo }
}).explain('executionStats')
```

```json
{
  "executionStats": {
    "nReturned": 150,
    "executionTimeMillis": 45000,
    "totalKeysExamined": 0,
    "totalDocsExamined": 100000000
  },
  "winningPlan": { "stage": "COLLSCAN" }
}
```

**Phân tích:**
- `COLLSCAN` → không dùng index
- `totalDocsExamined: 100M` → scan toàn bộ collection
- `executionTimeMillis: 45000` → 45 giây!
- `nReturned: 150` → chỉ cần 150 docs nhưng phải scan 100M

### After: Thêm index

```typescript
// Tạo compound index
schema.index({ uid: 1, createdAt: -1 })
```

```json
{
  "executionStats": {
    "nReturned": 150,
    "executionTimeMillis": 12,
    "totalKeysExamined": 150,
    "totalDocsExamined": 150
  },
  "winningPlan": {
    "inputStage": {
      "stage": "IXSCAN",
      "keyPattern": { "uid": 1, "createdAt": -1 }
    }
  }
}
```

**Kết quả:**
- `IXSCAN` → dùng index
- `totalDocsExamined: 150` → chỉ đọc đúng 150 docs cần thiết
- `executionTimeMillis: 12` → 12ms! (nhanh hơn 3750 lần)

| Metric | Before | After | Cải thiện |
|--------|--------|-------|-----------|
| Scan type | COLLSCAN | IXSCAN | Index |
| Docs examined | 100,000,000 | 150 | 666,667x |
| Time | 45,000ms | 12ms | 3,750x |

---

## 5. explain cho Aggregation

```typescript
db.analysisEvents.aggregate([
  { $match: { key: { $in: ['view', 'click'] }, createdAt: { $gte: from, $lte: to } } },
  { $group: { _id: '$key', count: { $sum: 1 } } },
]).explain('executionStats')
```

Output sẽ có `stages` array, mỗi stage có stats riêng:

```json
{
  "stages": [
    {
      "$cursor": {
        "executionStats": {
          "nReturned": 200000,
          "totalDocsExamined": 200000,
          "executionTimeMillis": 180
        },
        "winningPlan": {
          "inputStage": {
            "stage": "IXSCAN",
            "keyPattern": { "key": 1, "createdAt": -1 }
          }
        }
      }
    }
  ]
}
```

**Focus vào $cursor stage** -- đây là nơi $match chạy và dùng index. Các stage sau ($group, $sort) chạy trong aggregation engine.

---

## 6. Chạy explain trên MongoDB shell

```bash
# Kết nối MongoDB
mongosh "mongodb://localhost:27017/logics"

# Explain query
db.analysisEvents.find({ key: 'view' }).explain('executionStats')

# Explain aggregation
db.analysisEvents.explain('executionStats').aggregate([
  { $match: { key: 'view', createdAt: { $gte: ISODate('2026-02-16') } } },
  { $group: { _id: '$key', count: { $sum: 1 } } }
])

# Xem tất cả indexes của collection
db.analysisEvents.getIndexes()

# Xem kích thước collection
db.analysisEvents.stats()
```

---

## 7. Checklist phân tích explain

```
[ ] 1. stage là IXSCAN hay COLLSCAN?
      IXSCAN → tốt. COLLSCAN → cần thêm index.

[ ] 2. totalDocsExamined vs nReturned?
      Tỉ lệ > 10:1 → query đang scan quá nhiều, cần tối ưu.

[ ] 3. executionTimeMillis?
      > 1000ms → query chậm, cần kiểm tra index.

[ ] 4. keyPattern đúng index mong muốn?
      MongoDB có thể chọn index khác nếu thấy tốt hơn.

[ ] 5. indexBounds có hợp lý?
      Bounds quá rộng → filter chưa đủ hẹp.
```

---

## 8. Lỗi thường gặp

### Index tồn tại nhưng không được dùng

```typescript
// Index: { key: 1, createdAt: -1 }

// ❌ Query chỉ filter createdAt → không dùng index (thiếu prefix)
db.find({ createdAt: { $gte: from } })  // COLLSCAN

// ✅ Query filter key trước → dùng index
db.find({ key: 'view', createdAt: { $gte: from } })  // IXSCAN
```

### Sort không dùng index

```typescript
// Index: { key: 1, createdAt: -1 }

// ✅ Sort theo createdAt giảm dần → khớp index direction
db.find({ key: 'view' }).sort({ createdAt: -1 })  // IXSCAN

// ⚠️ Sort theo createdAt tăng dần → index ngược chiều
// MongoDB vẫn dùng index nhưng scan ngược (chấp nhận được)
db.find({ key: 'view' }).sort({ createdAt: 1 })

// ❌ Sort theo field không trong index → sort trong memory
db.find({ key: 'view' }).sort({ count: -1 })
```

---

## Tóm tắt

- `.explain('executionStats')` = **công cụ chẩn đoán** query performance
- Focus 4 metrics: **stage** (IXSCAN/COLLSCAN), **totalDocsExamined**, **nReturned**, **executionTimeMillis**
- `IXSCAN` = tốt (dùng index), `COLLSCAN` = tệ (scan toàn bộ)
- Tỉ lệ `totalDocsExamined / nReturned` gần 1:1 là lý tưởng
- Before/After thêm index: từ **45 giây → 12ms** (3750x nhanh hơn)
- Bài tiếp theo sẽ áp dụng tất cả vào **case study thật** với analyticsService 100M+ rows
