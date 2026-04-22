# Common Mistakes - Lỗi thường gặp

## Mục tiêu

Nhận biết và tránh các lỗi phổ biến khi làm việc với MongoDB.

---

## 1. Quên đánh index

### Lỗi

```ts
// Schema không có index trên field thường query
const schema = new mongoose.Schema({
  userId: { type: ObjectId },     // Không có index!
  name: String,
})

// Query scan toàn bộ collection
await mongo.watchLists.find({ userId: new ObjectId(userId) })
// 1M documents → 3 giây thay vì 1ms
```

### Sửa

```ts
userId: { type: ObjectId, required: true, index: true }
// Hoặc
schema.index({ userId: 1 })
```

> **Quy tắc**: Mọi field xuất hiện trong `find()`, `$match`, hoặc `sort()` thường xuyên → cần index.

## 2. Không convert string thành ObjectId

### Lỗi

```ts
// userId từ client là string
const userId = '64f1a2b3c4d5e6f7a8b9c0d1'

// Query KHÔNG tìm thấy (string != ObjectId)
await mongo.watchLists.find({ userId: userId })
```

### Sửa

```ts
// Code thật từ WatchListsController
await mongo.watchLists.find({ userId: new ObjectId(userId) })
```

## 3. Quên filter isDeleted trong soft delete

### Lỗi

```ts
// Lấy watchlists nhưng quên filter isDeleted
const docs = await mongo.watchLists.find({ userId: new ObjectId(userId) })
// → Trả về cả watchlists đã "xoá"
```

### Sửa

```ts
// Code thật - luôn filter isDeleted
const docs = await mongo.watchLists.find({
  userId: new ObjectId(userId),
  isDeleted: { $ne: true },        // Luôn luôn có dòng này
})
```

## 4. N+1 Query Problem

### Lỗi

```ts
// Lấy 100 rooms, mỗi room query owner riêng → 101 queries!
const rooms = await mongo.rooms.find({}).limit(100)
for (const room of rooms) {
  const owner = await mongo.users.findById(room.owner._id)  // 100 queries
}
```

### Sửa

```ts
// Cách 1: Embed (logics đã dùng)
// rooms.owner đã chứa sẵn owner info → không cần query thêm

// Cách 2: Batch query
const rooms = await mongo.rooms.find({}).limit(100)
const ownerIds = rooms.map(r => r.owner._id)
const owners = await mongo.users.find({ _id: { $in: ownerIds } })
// 2 queries thay vì 101 queries
```

## 5. Không dùng projection

### Lỗi

```ts
// Users có 40+ fields, chỉ cần kiểm tra tồn tại
const user = await mongo.users.findById(userId)  // Lấy TẤT CẢ fields
if (!user) return
```

### Sửa

```ts
// Code thật - chỉ lấy _id
const exists = await mongo.users.findById(userId, { _id: 1 })
if (!exists) return
```

## 6. Quên .lean() cho read-only queries

### Lỗi

```ts
// Pagination nhưng không dùng .lean()
const data = await mongo.paymentRequests
  .find(query)
  .skip((page - 1) * pageSize)
  .limit(pageSize)
// data là Mongoose Documents (nặng, tốn memory)
```

### Sửa

```ts
// Code thật - luôn .lean() cho API response
const data = await mongo.paymentRequests
  .find(query)
  .skip((page - 1) * pageSize)
  .limit(pageSize)
  .lean()              // Plain objects, nhẹ hơn 2-5x
```

## 7. deleteMany({}) - Xoá toàn bộ collection

### Lỗi

```ts
// NGUY HIỂM - xoá TẤT CẢ documents!
await mongo.watchLists.deleteMany({})    // Đừng bao giờ làm điều này
```

### Phòng tránh

```ts
// Luôn kiểm tra filter không rỗng
const filter = { userId: new ObjectId(userId), isDeleted: true }
if (Object.keys(filter).length === 0) {
  throw new Error('Cannot delete with empty filter')
}
await mongo.watchLists.deleteMany(filter)
```

## 8. Aggregation không $match đầu tiên

### Lỗi

```ts
// $group trước $match → quét toàn bộ 100M documents
await mongo.analysisEvents.aggregate([
  { $group: { _id: '$key', count: { $sum: 1 } } },    // 100M docs
  { $match: { count: { $gt: 100 } } },
])
```

### Sửa

```ts
// $match đầu tiên → dùng index, giảm documents
await mongo.analysisEvents.aggregate([
  { $match: { key: { $in: keys }, createdAt: { $gte: from } } },  // Filter xuống 50K
  { $group: { _id: '$key', count: { $sum: 1 } } },
])
```

## 9. So sánh ObjectId bằng ===

### Lỗi

```ts
const id1 = new ObjectId('64f1a2b3c4d5e6f7a8b9c0d1')
const id2 = new ObjectId('64f1a2b3c4d5e6f7a8b9c0d1')
id1 === id2   // false! (khác reference)
```

### Sửa

```ts
id1.equals(id2)         // true (so sánh giá trị)
id1.toString() === id2.toString()  // true (so sánh string)
```

## 10. pageSize không giới hạn

### Lỗi

```ts
// Client gửi pageSize = 1000000 → server crash
const pageSize = util.gp('pageSize', 20, 'number')
```

### Sửa

```ts
const pageSize = Math.min(100, Math.max(1, util.gp('pageSize', 20, 'number')))
```

---

## Checklist trước khi deploy

- [ ] Tất cả fields trong query/sort có index
- [ ] Không có N+1 query
- [ ] Soft delete queries luôn filter `isDeleted`
- [ ] API responses dùng projection + lean()
- [ ] pageSize có giới hạn max
- [ ] ObjectId conversion đúng chỗ
- [ ] Aggregation có $match đầu tiên

## Bài tập

1. Code review: tìm 3 lỗi trong đoạn code sau và sửa
2. Viết middleware tự động thêm `isDeleted: { $ne: true }` cho mọi query
3. Viết helper function validate và convert ObjectId an toàn
