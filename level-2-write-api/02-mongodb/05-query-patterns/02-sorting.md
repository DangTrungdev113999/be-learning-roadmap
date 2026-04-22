# Sorting - Sắp xếp

## Mục tiêu

Học cách sắp xếp kết quả query và kết hợp sort với index.

---

## 1. Cú pháp cơ bản

```ts
.sort({ field: 1 })    // 1 = tăng dần (ascending)
.sort({ field: -1 })   // -1 = giảm dần (descending)
```

## 2. Code thật từ WatchListsController

### Sort đơn giản

```ts
// Sắp xếp watchlists theo point giảm dần (ưu tiên cao nhất trước)
const documents = await mongo.watchLists
  .find({
    userId: new ObjectId(userId),
    isDeleted: { $ne: true },
  })
  .sort({ point: -1 })
```

### Tìm document có giá trị cao nhất

```ts
// Tìm watchlist có point cao nhất → lấy 1 document
const last = await mongo.watchLists
  .findOne({ userId: new ObjectId(userId) })
  .sort({ point: -1 })

// point mới = point cao nhất + 1
const newPoint = last ? last.point + 1 : 0
```

### Sort bằng _id

```ts
// RoomsController.ts - mới nhất trước
const data = await mongo.paymentRequests
  .find(query)
  .sort({ _id: -1 })    // _id chứa timestamp → sort = sort theo thời gian
  .skip((page - 1) * pageSize)
  .limit(pageSize)
```

> **Mẹo**: ObjectId chứa timestamp trong 4 bytes đầu. Sort theo `_id: -1` = sort theo thời gian tạo giảm dần, không cần index thêm.

## 3. Sort nhiều fields

```ts
// Sort theo date tăng dần, rồi theo key tăng dần
// Code thật từ analyticsService getEventCounts
{ $sort: { '_id.date': 1, '_id.key': 1 } }

// Mongoose equivalent
.sort({ date: 1, key: 1 })
```

```ts
// Sort theo point giảm dần, nếu point bằng nhau thì theo name tăng dần
.sort({ point: -1, name: 1 })
```

## 4. Sort và Index

Sort **sử dụng index** nếu sort field trùng với index:

```ts
// mongo/watchLists.ts
schema.index({ userId: 1, isDeleted: 1 })
schema.index({ createdAt: 1 })

// Query NÀY tận dụng index { createdAt: 1 }
await mongo.watchLists.find({}).sort({ createdAt: 1 })     // Nhanh

// Query NÀY KHÔNG có index phù hợp
await mongo.watchLists.find({}).sort({ name: 1 })           // Chậm (in-memory sort)
```

> **In-memory sort**: Nếu không có index, MongoDB load tất cả documents vào memory để sort. Giới hạn **32MB** cho in-memory sort. Vượt quá → lỗi!

## 5. Sort trong Aggregation

```ts
// Code thật - analyticsService getEventCounts
await mongo.analysisEvents.aggregate([
  { $match: { key: { $in: keys } } },
  { $group: { _id: { key: '$key', date: '...' }, count: { $sum: 1 } } },
  { $sort: { '_id.date': 1, '_id.key': 1 } },     // Sort trong pipeline
])

// Code thật - getTopContent: sort theo count giảm dần
await mongo.analysisEvents.aggregate([
  { $group: { _id: `$${valField}`, count: { $sum: 1 } } },
  { $sort: { count: -1 } },      // Phổ biến nhất trước
  { $limit: limit },               // Top N
])
```

## 6. Default sort

```ts
// Nếu không có .sort(), MongoDB trả về theo thứ tự tự nhiên (natural order)
// Thứ tự này KHÔNG đảm bảo nhất quán

// Luôn nên có .sort() khi cần thứ tự cụ thể
await mongo.watchLists.find({ userId }).sort({ point: -1 })
await mongo.notifications.find({ userId }).sort({ _id: -1 })
```

---

## Tóm tắt

| Cú pháp | Kết quả |
|---|---|
| `.sort({ point: -1 })` | Giảm dần theo point |
| `.sort({ _id: -1 })` | Mới nhất trước |
| `.sort({ date: 1, key: 1 })` | Tăng dần theo date, rồi key |
| `{ $sort: { count: -1 } }` | Trong aggregation pipeline |

## Bài tập

1. Sort `users` theo `lastLoggedIn` giảm dần (active gần nhất trước)
2. Sort `orders` theo `plan.price` giảm dần, nếu bằng nhau thì `createdAt` tăng dần
3. Tại sao sort `{ _id: -1 }` tương đương sort theo thời gian tạo?
4. Collection có 50M documents, sort theo field không có index. Điều gì xảy ra?
