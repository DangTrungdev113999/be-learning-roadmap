# Find - Đọc Documents

## Mục tiêu

Học các methods đọc dữ liệu: `find`, `findOne`, `findById`, `countDocuments`.

---

## 1. find() - Tìm nhiều documents

### Code thật từ WatchListsController

```ts
// Tìm tất cả watchlists của 1 user (chưa bị xoá)
const documents = await mongo.watchLists
  .find(
    {
      userId: new ObjectId(userId),
      isDeleted: { $ne: true },        // isDeleted khác true
    },
    {
      userId: 1,
      name: 1,
      symbols: 1,
      symbolsV2: 1,
      point: 1,
    },
  )
  .sort({ point: -1 })
```

### Phân tích

```ts
mongo.watchLists.find(
  filter,       // Điều kiện lọc (WHERE trong SQL)
  projection,   // Chọn fields trả về (SELECT trong SQL)
)
```

- **filter** `{ userId, isDeleted: { $ne: true } }` → WHERE userId = ? AND isDeleted != true
- **projection** `{ userId: 1, name: 1 }` → SELECT userId, name (1 = lấy, 0 = bỏ)
- `.sort({ point: -1 })` → ORDER BY point DESC

### Tìm bằng $in (nhiều IDs)

```ts
// WatchListsController.ts - tìm nhiều watchlists bằng IDs
const watchLists = await mongo.watchLists.find({
  userId,
  _id: {
    $in: watchListIds.map((item) => new ObjectId(item)),
  },
}, {
  userId: 1,
  name: 1,
  symbols: 1,
  symbolsV2: 1,
  point: 1,
})
```

### find() luôn trả về array

```ts
const results = await mongo.watchLists.find({ userId })
// results = [] nếu không tìm thấy (KHÔNG phải null)
// results = [doc1, doc2, ...] nếu tìm thấy
```

## 2. findOne() - Tìm 1 document

### Code thật

```ts
// Tìm watchlist có point cao nhất của user
const last = await mongo.watchLists
  .findOne({ userId: new ObjectId(userId) })
  .sort({ point: -1 })
```

```ts
// Tìm expert theo userId
const expert = await mongo.experts
  .findOne({ userId: maker._id })
  .lean()
```

### findOne() trả về 1 document hoặc null

```ts
const doc = await mongo.watchLists.findOne({ userId })
if (!doc) {
  // Không tìm thấy → null
  return { error: { code: 'NOT_FOUND' } }
}
// doc.name, doc.symbols, ...
```

## 3. findById() - Tìm bằng _id

### Code thật

```ts
// WatchListsController.ts - kiểm tra user tồn tại
const exists = await mongo.users.findById(userId, { _id: 1 })
if (!exists) {
  return { error: { code: responseCodes.PERMISSION_DENIED } }
}
```

### Tương đương findOne

```ts
// 2 dòng này giống nhau
await mongo.users.findById(userId)
await mongo.users.findOne({ _id: userId })

// findById với projection
await mongo.users.findById(userId, { _id: 1, fullName: 1 })
```

## 4. countDocuments() - Đếm documents

### Code thật từ RoomsController

```ts
// Đếm tổng số payment requests
const total = await mongo.paymentRequests.countDocuments(query)

// Đếm room members
const totalMember = await mongo.roomMembers.countDocuments({
  'room._id': room._id,
})
```

### Code thật từ analyticsService

```ts
// getOverview.ts - đếm events theo từng key
const keyCounts = await Promise.all(
  KNOWN_EVENT_KEYS.map(async (key) => {
    const count = await mongo.analysisEvents.countDocuments({
      createdAt: { $gte: from, $lte: to },
      key,
    })
    return { key, count }
  })
)
```

### So sánh

```ts
// countDocuments - chính xác, dùng filter
await mongo.watchLists.countDocuments({ userId })  // 5

// estimatedDocumentCount - nhanh hơn, đếm toàn collection
await mongo.watchLists.estimatedDocumentCount()  // 1000000
```

## 5. Pattern: Pagination với find + countDocuments

```ts
// RoomsController.ts - phân trang
const page = 1
const pageSize = 20

const [data, total] = await Promise.all([
  mongo.paymentRequests
    .find(query)
    .sort({ _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean(),
  mongo.paymentRequests.countDocuments(query),
])

return {
  data,
  pagination: { page, pageSize, total },
}
```

## 6. Chaining methods

```ts
// Có thể chain nhiều methods
const results = await mongo.watchLists
  .find(filter)              // Điều kiện lọc
  .select({ name: 1 })      // Chọn fields (thay cho projection)
  .sort({ point: -1 })      // Sắp xếp
  .skip(0)                   // Bỏ qua N docs (pagination)
  .limit(10)                 // Giới hạn số docs
  .lean()                    // Trả plain object (nhanh hơn)
```

---

## Tóm tắt

| Method | Trả về | Dùng khi |
|---|---|---|
| `find(filter)` | `Document[]` (có thể rỗng) | Tìm nhiều documents |
| `findOne(filter)` | `Document \| null` | Tìm 1 document |
| `findById(id)` | `Document \| null` | Tìm bằng _id |
| `countDocuments(filter)` | `number` | Đếm (thường cho pagination) |

## Bài tập

1. Viết query tìm tất cả users có `plan.level = 'pro'` và `isDeleted != true`
2. Viết query tìm watchlist mới nhất (sort createdAt giảm dần, limit 1)
3. Viết pagination: page 2, pageSize 10, tổng bao nhiêu documents
