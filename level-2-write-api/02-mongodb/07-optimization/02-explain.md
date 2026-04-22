# .explain() - Debug Query Chậm

## Mục tiêu

Học cách dùng `.explain()` để phân tích và tối ưu query.

---

## 1. explain() là gì?

`.explain()` cho biết MongoDB **thực sự** xử lý query như thế nào:

- Dùng index nào?
- Scan bao nhiêu documents?
- Mất bao lâu?

```ts
// Thay vì chạy query thật
await mongo.watchLists.find({ userId: new ObjectId(userId) })

// Chạy explain để xem execution plan
const plan = await mongo.watchLists
  .find({ userId: new ObjectId(userId) })
  .explain('executionStats')
```

## 2. Đọc kết quả explain

### Query tốt (có index)

```json
{
  "queryPlanner": {
    "winningPlan": {
      "stage": "FETCH",
      "inputStage": {
        "stage": "IXSCAN",           // Index Scan - TỐT
        "indexName": "userId_1",
        "direction": "forward"
      }
    }
  },
  "executionStats": {
    "nReturned": 5,                   // Trả về 5 documents
    "totalKeysExamined": 5,           // Scan 5 index entries
    "totalDocsExamined": 5,           // Đọc 5 documents
    "executionTimeMillis": 1          // 1ms - rất nhanh
  }
}
```

### Query xấu (không có index)

```json
{
  "queryPlanner": {
    "winningPlan": {
      "stage": "COLLSCAN"             // Collection Scan - XẤU
    }
  },
  "executionStats": {
    "nReturned": 5,
    "totalKeysExamined": 0,           // Không dùng index
    "totalDocsExamined": 1000000,     // Đọc 1 TRIỆU documents
    "executionTimeMillis": 3500       // 3.5 giây - rất chậm
  }
}
```

## 3. Các chỉ số quan trọng

| Chỉ số | Ý nghĩa | Giá trị tốt |
|---|---|---|
| `stage` | Loại scan | `IXSCAN` (tốt), `COLLSCAN` (xấu) |
| `nReturned` | Số docs trả về | Càng ít càng tốt |
| `totalKeysExamined` | Index entries đã scan | Gần bằng nReturned |
| `totalDocsExamined` | Documents đã đọc | Gần bằng nReturned |
| `executionTimeMillis` | Thời gian thực thi | < 100ms |

### Tỷ lệ lý tưởng

```
totalDocsExamined / nReturned ≈ 1
```

- Tỷ lệ = 1: Mỗi doc đọc đều trả về → hoàn hảo
- Tỷ lệ = 100: Đọc 100 docs mới tìm được 1 → cần optimize

## 4. Ví dụ phân tích

### Case 1: Quên index

```ts
// Query
await mongo.analysisEvents.find({ src: 'mobile' })

// explain → COLLSCAN (100M+ docs)
// Giải pháp: schema.index({ src: 1 })
```

### Case 2: Compound index sai thứ tự

```ts
// Index: { createdAt: 1, key: 1 }
// Query: { key: 'page_view', createdAt: { $gte: from } }

// explain → IXSCAN nhưng totalKeysExamined rất lớn
// Giải pháp: Đổi thành { key: 1, createdAt: 1 } (ESR rule)
```

### Case 3: Sort không dùng index

```ts
// Query
await mongo.watchLists.find({ userId }).sort({ name: 1 })

// explain → SORT_KEY_GENERATOR (in-memory sort)
// Nếu > 32MB data → crash
// Giải pháp: schema.index({ userId: 1, name: 1 })
```

## 5. explain modes

```ts
// queryPlanner - Chỉ xem plan, không chạy query
.explain('queryPlanner')

// executionStats - Chạy query, đo thời gian thật
.explain('executionStats')

// allPlansExecution - So sánh tất cả plans
.explain('allPlansExecution')
```

## 6. explain cho Aggregation

```ts
// Aggregation cũng hỗ trợ explain
const plan = await mongo.analysisEvents
  .aggregate([
    { $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: '$key', count: { $sum: 1 } } },
  ])
  .explain('executionStats')
```

## 7. MongoDB Compass

Nếu không muốn đọc JSON, dùng **MongoDB Compass**:

1. Mở Compass → kết nối
2. Chọn collection
3. Tab "Explain Plan"
4. Paste query → Visual explain plan

Compass hiển thị dạng biểu đồ, dễ đọc hơn.

## 8. Checklist khi query chậm

```
1. Chạy .explain('executionStats')
2. Check stage → COLLSCAN? → Cần index
3. Check totalDocsExamined vs nReturned → Tỷ lệ > 10? → Index không hiệu quả
4. Check executionTimeMillis → > 100ms? → Cần optimize
5. Thêm/sửa index phù hợp
6. Chạy explain lại để verify
```

---

## Tóm tắt

| Vấn đề | explain cho thấy | Giải pháp |
|---|---|---|
| Không có index | `COLLSCAN` | Thêm index |
| Index sai | Tỷ lệ examined/returned cao | Sửa compound index (ESR) |
| Sort chậm | `SORT_KEY_GENERATOR` | Index chứa sort field |

## Bài tập

1. Chạy `.explain()` cho query `watchLists.find({ userId })`. Kiểm tra có dùng index không
2. Chạy `.explain()` cho query không có index. So sánh `totalDocsExamined`
3. Thêm index rồi chạy `.explain()` lại. Thay đổi gì?
