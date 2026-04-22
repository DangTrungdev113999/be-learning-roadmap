# Aggregation Pipeline -- Tất cả stages quan trọng

## Mục tiêu

Hiểu sâu aggregation pipeline trong MongoDB. So sánh với SQL (nếu biết) và JavaScript array methods (FE dev quen). Đây là nền tảng để đọc và viết các pipeline thực tế trong logics.

---

## 1. Aggregation Pipeline là gì?

Pipeline = một **chuỗi các bước xử lý** data. Data đi qua từng stage, mỗi stage biến đổi data rồi truyền cho stage tiếp theo.

```
Collection ──> Stage 1 ──> Stage 2 ──> Stage 3 ──> Kết quả
               ($match)    ($group)    ($sort)
```

**So sánh với FE:**

```typescript
// JavaScript array methods -- FE dev quen thuộc
const result = users
  .filter(u => u.age > 18)        // $match
  .reduce(groupByCity, {})         // $group
  .sort((a, b) => b.count - a.count)  // $sort

// MongoDB aggregation -- cùng logic, chạy trên server
const result = await db.users.aggregate([
  { $match: { age: { $gt: 18 } } },
  { $group: { _id: '$city', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
])
```

**Tại sao dùng aggregation thay vì fetch rồi xử lý bằng JS?**
- Collection có 100M+ rows -- không thể fetch hết về memory
- MongoDB chạy trên server, tận dụng index, nhanh hơn rất nhiều
- Network: chỉ trả kết quả cuối cùng, không transfer toàn bộ data

---

## 2. $match -- Lọc documents

**Giống:** `Array.filter()`, SQL `WHERE`

Luôn đặt `$match` đầu tiên để giảm số documents cho các stage sau.

```typescript
// Lọc events trong 30 ngày gần nhất
{ $match: { createdAt: { $gte: new Date('2026-02-16'), $lte: new Date('2026-03-18') } } }

// Lọc theo nhiều điều kiện
{ $match: { key: { $in: ['view', 'click'] }, uid: { $exists: true } } }

// Lọc field khác null
{ $match: { value: { $exists: true, $ne: null } } }
```

**So sánh:**

```typescript
// JS
events.filter(e => e.createdAt >= from && e.createdAt <= to)

// SQL
SELECT * FROM events WHERE created_at BETWEEN '2026-02-16' AND '2026-03-18'

// MongoDB
{ $match: { createdAt: { $gte: from, $lte: to } } }
```

---

## 3. $group -- Nhóm và tính toán

**Giống:** `Array.reduce()` kết hợp groupBy, SQL `GROUP BY`

Đây là stage mạnh nhất và phức tạp nhất.

```typescript
// Đếm số events theo key
{ $group: { _id: '$key', count: { $sum: 1 } } }
// Input:  [{ key: 'view' }, { key: 'click' }, { key: 'view' }]
// Output: [{ _id: 'view', count: 2 }, { _id: 'click', count: 1 }]

// Group theo nhiều field
{ $group: {
  _id: { key: '$key', date: '$date' },
  count: { $sum: 1 }
} }

// Group tất cả (không chia nhóm)
{ $group: { _id: null, total: { $sum: 1 }, avgAge: { $avg: '$age' } } }
```

**So sánh:**

```typescript
// JS
const grouped = events.reduce((acc, e) => {
  acc[e.key] = (acc[e.key] || 0) + 1
  return acc
}, {})

// SQL
SELECT key, COUNT(*) AS count FROM events GROUP BY key

// MongoDB
{ $group: { _id: '$key', count: { $sum: 1 } } }
```

---

## 4. $sort -- Sắp xếp

**Giống:** `Array.sort()`, SQL `ORDER BY`

```typescript
// Sắp xếp tăng dần (1) hoặc giảm dần (-1)
{ $sort: { count: -1 } }           // Nhiều nhất lên đầu
{ $sort: { '_id.date': 1 } }       // Theo ngày tăng dần
{ $sort: { count: -1, name: 1 } }  // Giảm theo count, cùng count thì tăng theo name
```

**So sánh:**

```typescript
// JS
items.sort((a, b) => b.count - a.count)

// SQL
SELECT * FROM items ORDER BY count DESC

// MongoDB
{ $sort: { count: -1 } }
```

---

## 5. $limit và $skip -- Phân trang

**Giống:** `Array.slice()`, SQL `LIMIT` + `OFFSET`

```typescript
// Lấy 20 kết quả đầu tiên
{ $limit: 20 }

// Bỏ qua 40 kết quả đầu, lấy 20 tiếp theo (trang 3)
{ $skip: 40 }
{ $limit: 20 }
```

**So sánh:**

```typescript
// JS
items.slice(40, 60)  // skip 40, lấy 20

// SQL
SELECT * FROM items LIMIT 20 OFFSET 40

// MongoDB
[{ $skip: 40 }, { $limit: 20 }]
```

**Lưu ý:** `$skip` + `$limit` chậm với data lớn (phải scan qua phần skip). Với 100M+ rows, dùng cursor-based pagination thay thế.

---

## 6. $project -- Chọn/đổi tên fields

**Giống:** `Array.map()` chỉ lấy một số fields, SQL `SELECT col1, col2`

```typescript
// Chỉ lấy key và count, bỏ _id
{ $project: { _id: 0, key: '$_id.key', date: '$_id.date', count: 1 } }
// Input:  { _id: { key: 'view', date: '2026-03' }, count: 150 }
// Output: { key: 'view', date: '2026-03', count: 150 }

// Tính field mới
{ $project: { name: 1, fullName: { $concat: ['$firstName', ' ', '$lastName'] } } }

// Ẩn field
{ $project: { password: 0, __v: 0 } }
```

**So sánh:**

```typescript
// JS
items.map(item => ({ key: item._id.key, count: item.count }))

// SQL
SELECT key, count FROM items  -- không lấy các cột khác

// MongoDB
{ $project: { _id: 0, key: '$_id.key', count: 1 } }
```

---

## 7. $addFields -- Thêm field mới (giữ nguyên fields cũ)

**Giống:** `{ ...item, newField: value }` trong JS

Khác `$project` ở chỗ `$addFields` **giữ nguyên** tất cả fields hiện có.

```typescript
// Thêm field "year" từ createdAt
{ $addFields: { year: { $year: '$createdAt' } } }

// Thêm field tính toán
{ $addFields: {
  totalPrice: { $multiply: ['$price', '$quantity'] },
  isExpensive: { $gt: ['$price', 1000000] }
} }
```

**So sánh:**

```typescript
// JS
items.map(item => ({ ...item, year: item.createdAt.getFullYear() }))
// Giữ tất cả field cũ + thêm year

// $project: { year: { $year: '$createdAt' } }
// CHỈ giữ year, MẤT tất cả field khác!

// $addFields: { year: { $year: '$createdAt' } }
// Giữ tất cả + thêm year ✅
```

---

## 8. $lookup -- Join collections

**Giống:** SQL `LEFT JOIN`

MongoDB không có JOIN mặc định, `$lookup` cho phép "nối" 2 collections.

```typescript
// Lấy thông tin user cho mỗi event
{ $lookup: {
  from: 'users',           // Collection cần join
  localField: 'uid',       // Field trong document hiện tại
  foreignField: '_id',     // Field trong collection users
  as: 'userInfo'           // Tên field kết quả (array)
} }

// Input:  { uid: 'user123', key: 'view' }
// Output: { uid: 'user123', key: 'view', userInfo: [{ _id: 'user123', name: 'Trung', ... }] }
// userInfo là ARRAY (có thể rỗng nếu không match)
```

**So sánh:**

```typescript
// JS (2 API calls)
const events = await fetchEvents()
const users = await fetchUsers()
const result = events.map(e => ({
  ...e,
  userInfo: users.find(u => u._id === e.uid)
}))

// SQL
SELECT * FROM events LEFT JOIN users ON events.uid = users.id

// MongoDB
{ $lookup: { from: 'users', localField: 'uid', foreignField: '_id', as: 'userInfo' } }
```

**Lưu ý:** `$lookup` tốn performance. Tránh dùng với collection lớn nếu không có index trên `foreignField`.

---

## 9. $unwind -- Tách array thành nhiều documents

**Giống:** `Array.flatMap()`, SQL unnest

Thường dùng sau `$lookup` để "mở" array kết quả.

```typescript
// Trước $unwind
// { name: 'Trung', tags: ['js', 'ts', 'react'] }

{ $unwind: '$tags' }

// Sau $unwind -- 3 documents
// { name: 'Trung', tags: 'js' }
// { name: 'Trung', tags: 'ts' }
// { name: 'Trung', tags: 'react' }
```

**Kết hợp $lookup + $unwind:**

```typescript
[
  { $lookup: { from: 'users', localField: 'uid', foreignField: '_id', as: 'user' } },
  { $unwind: '$user' },  // Từ array 1 phần tử → object
  // Trước: { user: [{ name: 'Trung' }] }
  // Sau:   { user: { name: 'Trung' } }
]
```

---

## 10. $facet -- Chạy nhiều pipeline song song

**Giống:** Chạy nhiều query cùng lúc, trả về 1 response

```typescript
{ $facet: {
  // Pipeline 1: Tổng số
  totalCount: [
    { $count: 'count' }
  ],
  // Pipeline 2: Data phân trang
  data: [
    { $sort: { createdAt: -1 } },
    { $skip: 0 },
    { $limit: 20 }
  ],
  // Pipeline 3: Thống kê theo loại
  byType: [
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]
} }

// Output:
// {
//   totalCount: [{ count: 1500 }],
//   data: [... 20 items ...],
//   byType: [{ _id: 'view', count: 800 }, { _id: 'click', count: 700 }]
// }
```

**Khi nào dùng:** Cần nhiều aggregation khác nhau trên cùng data (ví dụ: tổng số + data + thống kê cho 1 trang dashboard).

---

## 11. Bảng tổng hợp -- Stage nào giống gì?

| MongoDB Stage | JS Array Method | SQL | Mô tả |
|---------------|----------------|-----|--------|
| `$match` | `filter()` | `WHERE` | Lọc documents |
| `$group` | `reduce()` | `GROUP BY` | Nhóm và tính toán |
| `$sort` | `sort()` | `ORDER BY` | Sắp xếp |
| `$limit` | `slice(0, n)` | `LIMIT` | Giới hạn số kết quả |
| `$skip` | `slice(n)` | `OFFSET` | Bỏ qua n kết quả đầu |
| `$project` | `map()` (chọn fields) | `SELECT col1, col2` | Chọn/đổi tên fields |
| `$addFields` | `map(x => ({...x, new}))` | `SELECT *, expr AS col` | Thêm field, giữ cũ |
| `$lookup` | fetch + map + find | `LEFT JOIN` | Join collections |
| `$unwind` | `flatMap()` | `UNNEST` | Tách array |
| `$facet` | Chạy nhiều pipeline | Nhiều query | Nhiều kết quả cùng lúc |

---

## 12. Thứ tự stages quan trọng

```
Tốt (nhanh):
$match → $group → $sort → $limit → $project

Tệ (chậm):
$sort → $group → $match → $project → $limit
```

**Quy tắc:**
1. `$match` **luôn đầu tiên** -- giảm data sớm nhất có thể
2. `$group` sau `$match` -- chỉ group data đã được lọc
3. `$sort` sau `$group` -- sắp xếp kết quả đã group
4. `$limit` càng sớm càng tốt -- giảm data cho stages sau
5. `$project` cuối cùng -- format output

---

## Tóm tắt

- Aggregation pipeline = **chuỗi stages biến đổi data**, giống chain `.filter().reduce().sort()` trong JS
- `$match` (filter) luôn đặt **đầu tiên** để tận dụng index
- `$group` (reduce) là stage **mạnh nhất** -- nhóm và tính toán
- `$project` (map select) dùng để **format output** cuối cùng
- `$lookup` = JOIN -- **tốn performance**, dùng cẩn thận
- Thứ tự stages ảnh hưởng **rất lớn** đến tốc độ
- Bài tiếp theo sẽ đi sâu vào các **operators trong $group**
