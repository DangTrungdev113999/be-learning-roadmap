# Aggregation Pipeline - Khái niệm

## Mục tiêu

Hiểu aggregation pipeline là gì, so sánh với array methods quen thuộc từ FE.

---

## 1. Aggregation Pipeline là gì?

Pipeline = chuỗi các bước xử lý dữ liệu, output của bước trước là input của bước sau.

```
Documents → [$match] → [$group] → [$sort] → [$project] → Kết quả
              (filter)   (nhóm)    (sắp xếp)  (chọn fields)
```

## 2. So sánh với JavaScript Array Methods

Là FE dev, bạn đã quen:

```ts
// JavaScript - xử lý mảng
const result = events
  .filter(e => e.key === 'page_view')           // $match
  .reduce((groups, e) => { ... }, {})            // $group
  .sort((a, b) => b.count - a.count)             // $sort
  .map(e => ({ key: e.key, count: e.count }))    // $project
```

MongoDB Aggregation tương tự, nhưng **chạy trên server** (không load toàn bộ data về client):

```ts
// MongoDB Aggregation - xử lý trên DB server
const result = await mongo.analysisEvents.aggregate([
  { $match: { key: 'page_view' } },                    // filter
  { $group: { _id: '$key', count: { $sum: 1 } } },     // reduce/groupBy
  { $sort: { count: -1 } },                             // sort
  { $project: { _id: 0, key: '$_id', count: 1 } },     // map
])
```

## 3. Tại sao không dùng JS Array Methods?

```ts
// BAD: Load 100 triệu documents về Node.js rồi xử lý
const allEvents = await mongo.analysisEvents.find({})  // 100M docs → Out of Memory!
const result = allEvents.filter(...).reduce(...)

// GOOD: MongoDB xử lý trên server, trả về kết quả nhỏ
const result = await mongo.analysisEvents.aggregate([
  { $match: { key: { $in: keys } } },     // Filter trên server
  { $group: { _id: '$key', count: { $sum: 1 } } },  // Group trên server
])
// result = [{key: 'page_view', count: 5000000}] → chỉ vài objects
```

## 4. Các stages phổ biến

| Stage | Chức năng | JS tương đương | SQL tương đương |
|---|---|---|---|
| `$match` | Lọc documents | `.filter()` | `WHERE` |
| `$group` | Nhóm và tính toán | `.reduce()` | `GROUP BY` |
| `$sort` | Sắp xếp | `.sort()` | `ORDER BY` |
| `$project` | Chọn/tính fields | `.map()` | `SELECT` |
| `$limit` | Giới hạn số lượng | `.slice(0, n)` | `LIMIT` |
| `$skip` | Bỏ qua N đầu | `.slice(n)` | `OFFSET` |
| `$unwind` | Tách array thành docs | `.flatMap()` | - |
| `$lookup` | JOIN collections | - | `JOIN` |
| `$addFields` | Thêm fields mới | `.map(e => ({...e, x}))` | Computed column |
| `$count` | Đếm documents | `.length` | `COUNT(*)` |

## 5. Code thật từ analyticsService

```ts
// app/Services/analyticsService/libs/getEventCounts.ts
const result = await mongo.analysisEvents
  .aggregate([
    // Stage 1: Lọc events theo key và thời gian
    {
      $match: {
        key: { $in: keys },
        createdAt: { $gte: from, $lte: to },
      },
    },
    // Stage 2: Nhóm theo key + date, đếm số events
    {
      $group: {
        _id: {
          key: '$key',
          date: { $dateToString: { format: GROUP_BY_FORMAT[groupBy], date: '$createdAt' } },
        },
        count: { $sum: 1 },
      },
    },
    // Stage 3: Sắp xếp theo ngày
    { $sort: { '_id.date': 1, '_id.key': 1 } },
    // Stage 4: Đổi tên fields cho đẹp
    {
      $project: {
        _id: 0,
        key: '$_id.key',
        date: '$_id.date',
        count: 1,
      },
    },
  ])
  .allowDiskUse(true)     // Cho phép dùng disk nếu memory không đủ
```

## 6. Visualize pipeline

```
100M+ analysisEvents
         │
    [$match] ── key IN ['page_view', 'click_stock'] AND createdAt >= from
         │
      50K events (filtered)
         │
    [$group] ── Nhóm theo (key + date), đếm mỗi nhóm
         │
      200 groups
         │
    [$sort] ── Sắp xếp theo date tăng dần
         │
    [$project] ── Chọn key, date, count
         │
   200 kết quả cuối cùng
```

> **$match PHẢI đặt đầu tiên** để tận dụng index và giảm số documents cho các stages sau.

## 7. Cú pháp cơ bản

```ts
const result = await mongo.collectionName.aggregate([
  { $stage1: { ... } },
  { $stage2: { ... } },
  { $stage3: { ... } },
])

// result là array of plain objects (không phải Mongoose Documents)
```

---

## Tóm tắt

- Pipeline = chuỗi stages, mỗi stage xử lý data rồi truyền cho stage sau
- Giống array methods nhưng chạy trên DB server (không load data về)
- $match đầu tiên để dùng index
- `.allowDiskUse(true)` cho data lớn

## Bài tập

1. Viết pipeline tương đương: `events.filter(e => e.key === 'click').length`
2. Collection `orders` - viết pipeline đếm số orders theo từng `status`
3. Giải thích tại sao `$match` phải đặt đầu tiên trong pipeline
