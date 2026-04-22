# Multi-stage Pipelines -- Code thật từ analyticsService

## Mục tiêu

Đọc và hiểu 3 pipeline thực tế từ analyticsService trong logics. Mỗi pipeline giải quyết một bài toán khác nhau: đếm events theo ngày, đếm active users, tìm top content.

---

## 1. Pipeline 1: getEventCounts -- Đếm events theo ngày

### Bài toán

Dashboard analytics cần hiển thị biểu đồ: **số lượng events (view, click, purchase) theo từng ngày/tuần/tháng**.

Ví dụ output trên FE:

```
Ngày 01/03: view=1200, click=340
Ngày 02/03: view=1150, click=380
Ngày 03/03: view=1300, click=290
```

### Code thật

```typescript
const result = await mongo.analysisEvents.aggregate([
  { $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } },
  { $group: { _id: { key: '$key', date: { $dateToString: { format: GROUP_BY_FORMAT[groupBy], date: '$createdAt' } } }, count: { $sum: 1 } } },
  { $sort: { '_id.date': 1, '_id.key': 1 } },
  { $project: { _id: 0, key: '$_id.key', date: '$_id.date', count: 1 } },
]).allowDiskUse(true)
```

### Giải thích từng dòng

**Stage 1 -- $match: Lọc data**

```typescript
{ $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } }
```

- `key: { $in: keys }` -- chỉ lấy events có key nằm trong danh sách (ví dụ: `['view', 'click', 'purchase']`)
- `createdAt: { $gte: from, $lte: to }` -- chỉ lấy events trong khoảng thời gian
- **Tại sao đặt đầu tiên?** Collection analysisEvents có 100M+ rows. `$match` dùng index `{ key: 1, createdAt: -1 }` để lọc nhanh, chỉ giữ lại vài trăm nghìn rows thay vì scan toàn bộ

**Stage 2 -- $group: Nhóm theo key + ngày**

```typescript
{ $group: {
  _id: {
    key: '$key',
    date: { $dateToString: { format: GROUP_BY_FORMAT[groupBy], date: '$createdAt' } }
  },
  count: { $sum: 1 }
} }
```

- `_id: { key, date }` -- group theo 2 field: loại event + ngày
- `$dateToString` -- chuyển timestamp thành string theo format:
  - `groupBy = 'day'` → format `'%Y-%m-%d'` → `'2026-03-18'`
  - `groupBy = 'week'` → format `'%Y-W%V'` → `'2026-W12'`
  - `groupBy = 'month'` → format `'%Y-%m'` → `'2026-03'`
- `count: { $sum: 1 }` -- đếm số documents trong mỗi nhóm

```
Trước $group (nhiều documents):
{ key: 'view', createdAt: '2026-03-18T10:00:00' }
{ key: 'view', createdAt: '2026-03-18T10:05:00' }
{ key: 'click', createdAt: '2026-03-18T10:01:00' }
{ key: 'view', createdAt: '2026-03-19T09:00:00' }

Sau $group (ít documents):
{ _id: { key: 'view', date: '2026-03-18' }, count: 2 }
{ _id: { key: 'click', date: '2026-03-18' }, count: 1 }
{ _id: { key: 'view', date: '2026-03-19' }, count: 1 }
```

**Stage 3 -- $sort: Sắp xếp theo ngày rồi key**

```typescript
{ $sort: { '_id.date': 1, '_id.key': 1 } }
```

- Sắp xếp theo ngày tăng dần (1), cùng ngày thì theo key alphabetical
- FE cần data theo thứ tự thời gian để vẽ biểu đồ

**Stage 4 -- $project: Format output**

```typescript
{ $project: { _id: 0, key: '$_id.key', date: '$_id.date', count: 1 } }
```

- `_id: 0` -- ẩn field `_id` (không cần trả về FE)
- `key: '$_id.key'` -- đưa key từ `_id.key` lên thành field `key`
- `date: '$_id.date'` -- tương tự cho date
- `count: 1` -- giữ nguyên count

```
Trước $project:
{ _id: { key: 'view', date: '2026-03-18' }, count: 2 }

Sau $project:
{ key: 'view', date: '2026-03-18', count: 2 }
```

---

## 2. Pipeline 2: getActiveUsers -- Đếm active users (double group)

### Bài toán

Dashboard cần hiển thị: **số lượng users unique hoạt động mỗi ngày**. Nếu user A tạo 50 events trong ngày, chỉ tính là 1 active user.

### Code thật

```typescript
const result = await mongo.analysisEvents.aggregate([
  { $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } },
  { $group: { _id: { uid: '$uid', date: { $dateToString: { format: GROUP_BY_FORMAT[groupBy], date: '$createdAt' } } } } },
  { $group: { _id: '$_id.date', count: { $sum: 1 } } },
  { $sort: { _id: 1 } },
  { $project: { _id: 0, date: '$_id', count: 1 } },
]).allowDiskUse(true)
```

### Giải thích -- Tại sao cần 2 lần $group?

**Stage 1 -- $match:** Giống pipeline trước, lọc theo key và thời gian.

**Stage 2 -- $group lần 1: Loại bỏ duplicate user theo ngày**

```typescript
{ $group: { _id: { uid: '$uid', date: { $dateToString: { ... } } } } }
```

- Group theo `{ uid, date }` -- mỗi cặp (user, ngày) chỉ còn 1 document
- Không có `$sum` hay operator nào -- chỉ cần distinct

```
Trước (100 events):
{ uid: 'u1', createdAt: '2026-03-18T10:00' }  ← u1 ngày 18
{ uid: 'u1', createdAt: '2026-03-18T10:05' }  ← u1 ngày 18 (duplicate)
{ uid: 'u1', createdAt: '2026-03-18T10:10' }  ← u1 ngày 18 (duplicate)
{ uid: 'u2', createdAt: '2026-03-18T09:00' }  ← u2 ngày 18
{ uid: 'u1', createdAt: '2026-03-19T08:00' }  ← u1 ngày 19

Sau group 1 (3 documents):
{ _id: { uid: 'u1', date: '2026-03-18' } }  ← u1 ngày 18 (gộp 3 events)
{ _id: { uid: 'u2', date: '2026-03-18' } }  ← u2 ngày 18
{ _id: { uid: 'u1', date: '2026-03-19' } }  ← u1 ngày 19
```

**Stage 3 -- $group lần 2: Đếm unique users mỗi ngày**

```typescript
{ $group: { _id: '$_id.date', count: { $sum: 1 } } }
```

- Group theo date, đếm số documents (mỗi document = 1 unique user)
- Kết quả: số active users mỗi ngày

```
Sau group 2:
{ _id: '2026-03-18', count: 2 }  ← 2 users (u1, u2) ngày 18
{ _id: '2026-03-19', count: 1 }  ← 1 user (u1) ngày 19
```

**Stage 4-5 -- $sort + $project:** Sắp xếp theo ngày, format output.

### Tại sao không dùng $addToSet?

Cách khác có thể viết:

```typescript
// Cách 2: dùng $addToSet (KHÔNG NÊN với data lớn)
[
  { $match: { ... } },
  { $group: {
    _id: { $dateToString: { ... } },
    users: { $addToSet: '$uid' }  // Thu thập tất cả unique users vào array
  } },
  { $addFields: { count: { $size: '$users' } } },  // Đếm size array
]
```

**Vấn đề:** Nếu 1 ngày có 50,000 unique users, array `users` sẽ chứa 50,000 phần tử. Tốn memory, có thể vượt 16MB document limit.

**Double group** không tạo array lớn, chỉ đếm -- hiệu quả hơn nhiều với data lớn.

---

## 3. Pipeline 3: getTopContent -- Dynamic field + Top N

### Bài toán

Dashboard cần hiển thị: **top 20 nội dung được xem/tương tác nhiều nhất**. "Nội dung" có thể là `stockId`, `roomId`, hoặc `postId` -- tuỳ loại event.

### Code thật

```typescript
const result = await mongo.analysisEvents.aggregate([
  { $match: { createdAt: { $gte: from, $lte: to }, key: { $in: eventKeys }, [valField]: { $exists: true, $ne: null } } },
  { $group: { _id: `$${valField}`, count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: limit },
  { $project: { _id: 0, id: '$_id', count: 1 } },
]).allowDiskUse(true)
```

### Giải thích

**Dynamic field -- `[valField]`**

```typescript
// Nếu valField = 'stockId':
{ $match: { stockId: { $exists: true, $ne: null } } }
{ $group: { _id: '$stockId', count: { $sum: 1 } } }

// Nếu valField = 'roomId':
{ $match: { roomId: { $exists: true, $ne: null } } }
{ $group: { _id: '$roomId', count: { $sum: 1 } } }
```

Dùng computed property `[valField]` (JS syntax) để tạo query linh hoạt. 1 function xử lý được nhiều loại content.

**Stage 1 -- $match: Lọc events + đảm bảo field tồn tại**

```typescript
{ $match: {
  createdAt: { $gte: from, $lte: to },
  key: { $in: eventKeys },
  [valField]: { $exists: true, $ne: null }  // Field phải tồn tại và không null
} }
```

- `$exists: true, $ne: null` -- loại bỏ documents không có field này. Nếu không filter, `$group` sẽ tạo nhóm `_id: null` cho tất cả documents thiếu field

**Stage 2 -- $group: Đếm theo content ID**

```typescript
{ $group: { _id: `$${valField}`, count: { $sum: 1 } } }
```

- Mỗi content ID (ví dụ mỗi stockId) = 1 nhóm
- Đếm số lần xuất hiện = số lần được xem/tương tác

**Stage 3 -- $sort: Nhiều nhất lên đầu**

```typescript
{ $sort: { count: -1 } }
```

**Stage 4 -- $limit: Chỉ lấy top N**

```typescript
{ $limit: limit }  // limit = DEFAULT_LIMIT (20) hoặc tối đa MAX_LIMIT (100)
```

- `$sort` + `$limit` kết hợp = **Top N pattern**
- MongoDB optimize: không cần sort toàn bộ, chỉ giữ top N trong memory

**Stage 5 -- $project: Đổi tên _id thành id**

```typescript
{ $project: { _id: 0, id: '$_id', count: 1 } }
```

Output cuối cùng:

```json
[
  { "id": "VNM", "count": 15000 },
  { "id": "FPT", "count": 12000 },
  { "id": "VIC", "count": 8500 }
]
```

---

## 4. So sánh 3 pipelines

| | getEventCounts | getActiveUsers | getTopContent |
|---|---|---|---|
| **Bài toán** | Đếm events theo ngày | Đếm unique users | Top N content |
| **Stages** | 4 | 5 | 5 |
| **$group** | 1 lần (key + date) | 2 lần (distinct → count) | 1 lần (content ID) |
| **Đặc biệt** | dateToString format | Double group pattern | Dynamic field |
| **Output** | `{ key, date, count }` | `{ date, count }` | `{ id, count }` |

---

## 5. Pattern chung

Cả 3 pipeline đều theo cùng 1 cấu trúc:

```
$match (lọc) → $group (tính toán) → $sort (sắp xếp) → $project (format)
```

### Quy tắc từ code thật

1. **$match luôn đầu tiên** -- tận dụng index, giảm data sớm
2. **allowDiskUse(true)** -- cho phép MongoDB dùng disk khi data quá lớn cho memory (100M+ rows)
3. **$project cuối cùng** -- chỉ trả về fields FE cần, không trả _id
4. **$dateToString** trong $group -- group theo đơn vị thời gian linh hoạt (ngày/tuần/tháng)
5. **Double group** khi cần distinct + count -- hiệu quả hơn $addToSet với data lớn

---

## 6. allowDiskUse -- Tại sao cần?

```typescript
.allowDiskUse(true)
```

MongoDB mặc định chỉ dùng **100MB RAM** cho mỗi aggregation stage. Với 100M+ rows:
- `$group` có thể cần giữ hàng triệu nhóm trong memory
- `$sort` cần sort hàng triệu documents

Nếu vượt 100MB → MongoDB sẽ báo lỗi. `allowDiskUse(true)` cho phép spill ra disk, chậm hơn RAM nhưng không bị lỗi.

**Khi nào cần:**
- Collection > 1M rows
- $group tạo nhiều nhóm (> 100K nhóm)
- $sort trên data chưa được index

---

## Tóm tắt

- 3 pipeline thật từ analyticsService: **getEventCounts** (group by date), **getActiveUsers** (double group), **getTopContent** (dynamic field + Top N)
- **Double group** là pattern quan trọng: loại bỏ duplicate ở group 1, đếm ở group 2
- **$dateToString** + GROUP_BY_FORMAT cho phép group theo ngày/tuần/tháng linh hoạt
- **allowDiskUse(true)** bắt buộc với collection lớn (100M+ rows)
- Bài tiếp theo sẽ học về **indexes** -- tại sao $match nhanh trên 100M rows
