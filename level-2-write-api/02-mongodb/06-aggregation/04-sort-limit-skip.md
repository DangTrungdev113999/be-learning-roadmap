# $sort, $limit, $skip - Sắp xếp và phân trang trong Aggregation

## Mục tiêu

Học cách sắp xếp, giới hạn, và phân trang kết quả trong aggregation pipeline.

---

## 1. $sort trong Pipeline

```ts
// Cú pháp
{ $sort: { field: 1 } }     // 1 = tăng dần
{ $sort: { field: -1 } }    // -1 = giảm dần
```

### Code thật từ analyticsService

```ts
// getEventCounts - sort sau group
await mongo.analysisEvents.aggregate([
  { $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } },
  { $group: { _id: { key: '$key', date: '...' }, count: { $sum: 1 } } },
  { $sort: { '_id.date': 1, '_id.key': 1 } },    // Sort theo date tăng dần, rồi key
])

// getRetention - sort sau group
await mongo.analysisEvents.aggregate([
  { $match: { key: 'user_created' } },
  { $group: { _id: { $dateToString: { ... } }, newUsers: { $sum: 1 } } },
  { $sort: { _id: 1 } },    // Sort theo date tăng dần
])

// getActiveUsers - sort kết quả cuối
{ $sort: { _id: 1 } }       // Sort theo date bucket tăng dần
```

## 2. $limit - Giới hạn kết quả

```ts
// Chỉ lấy N documents đầu tiên
{ $limit: 10 }    // Lấy 10 documents
```

### Code thật - Top content

```ts
// getTopContent - lấy top N content phổ biến nhất
await mongo.analysisEvents.aggregate([
  { $match: { ... } },
  { $group: { _id: `$${valField}`, count: { $sum: 1 } } },
  { $sort: { count: -1 } },     // Nhiều nhất trước
  { $limit: limit },              // Chỉ lấy top N
])
```

### Pattern: Sort + Limit = Top N

```ts
// Top 10 cổ phiếu được xem nhiều nhất
await mongo.analysisEvents.aggregate([
  { $match: { key: 'view_stock', createdAt: { $gte: from } } },
  { $group: { _id: '$val.symbol', views: { $sum: 1 } } },
  { $sort: { views: -1 } },    // Nhiều views nhất trước
  { $limit: 10 },               // Top 10
])
```

## 3. $skip - Bỏ qua N documents

```ts
// Bỏ qua N documents đầu tiên
{ $skip: 20 }    // Bỏ qua 20 documents
```

## 4. Pagination trong Aggregation

```ts
// RoomsController.ts - pagination pattern
const page = 2
const pageSize = 20

await mongo.rooms.aggregate([
  { $match: { isDeleted: { $ne: true } } },
  { $sort: { createdAt: -1 } },
  { $skip: (page - 1) * pageSize },     // Bỏ qua trang trước
  { $limit: pageSize },                   // Lấy 1 trang
])
```

### Đếm tổng + lấy data trong 1 pipeline

```ts
// Pattern: $facet cho pagination
await mongo.rooms.aggregate([
  { $match: { isDeleted: { $ne: true } } },
  {
    $facet: {
      data: [
        { $sort: { createdAt: -1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
      ],
      total: [
        { $count: 'count' },
      ],
    },
  },
])
// Kết quả: { data: [...], total: [{ count: 150 }] }
```

## 5. Thứ tự $sort, $skip, $limit quan trọng

```ts
// ĐÚNG: sort → skip → limit
[
  { $sort: { createdAt: -1 } },    // Sort trước
  { $skip: 20 },                    // Bỏ qua 20
  { $limit: 10 },                   // Lấy 10
]
// → Documents 21-30 (đã sort)

// SAI: limit → sort
[
  { $limit: 10 },                   // Lấy 10 bất kỳ
  { $sort: { createdAt: -1 } },    // Sort 10 đó
]
// → Sort chỉ trong 10 documents đầu tiên!
```

## 6. $count - Đếm documents

```ts
// Đếm kết quả sau filter
await mongo.rooms.aggregate([
  { $match: { isDeleted: { $ne: true } } },
  { $count: 'total' },
])
// Kết quả: [{ total: 150 }]

// Code thật - RoomsController.ts
const countPipeline = [...userPipeline, { $count: 'total' }]
```

---

## Tóm tắt

| Stage | Chức năng | SQL tương đương |
|---|---|---|
| `{ $sort: { field: -1 } }` | Sắp xếp | `ORDER BY field DESC` |
| `{ $limit: N }` | Giới hạn | `LIMIT N` |
| `{ $skip: N }` | Bỏ qua | `OFFSET N` |
| `{ $count: 'name' }` | Đếm | `COUNT(*)` |

Thứ tự: `$sort` → `$skip` → `$limit`

## Bài tập

1. Viết pipeline lấy top 5 rooms có `numberOfMember` cao nhất
2. Viết pagination: aggregation cho `orders`, trang 3, mỗi trang 15 items, sort theo `createdAt` giảm dần
3. Dùng `$facet` kết hợp data + tổng count trong 1 pipeline
