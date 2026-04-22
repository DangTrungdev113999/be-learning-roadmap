# Delete - Xoá Documents

## Mục tiêu

Học cách xoá documents: `deleteOne`, `deleteMany`, và pattern soft delete trong dự án thật.

---

## 1. deleteOne() - Xoá 1 document

### Code thật từ WatchListsController

```ts
// WatchListsController.ts - xoá watchlist
public async delete({ auth, request }: HttpContextContract) {
  const { userId, rule } = auth || {}
  const { watchListId = '' } = request.body()

  // Xoá document vĩnh viễn
  await mongo.watchLists.deleteOne({
    userId: new ObjectId(userId),      // Chỉ xoá watchlist CỦA user này
    _id: new ObjectId(watchListId),    // Đúng watchlist cần xoá
  })

  return { data: { ok: 'ok' } }
}
```

### Phân tích

```ts
const result = await mongo.watchLists.deleteOne({
  userId: new ObjectId(userId),
  _id: new ObjectId(watchListId),
})

result.deletedCount  // 1 = đã xoá, 0 = không tìm thấy
result.acknowledged  // true = DB đã nhận lệnh
```

> **Quan trọng**: Luôn filter bằng `userId` khi xoá. Nếu chỉ filter bằng `_id`, user A có thể xoá watchlist của user B!

## 2. deleteMany() - Xoá nhiều documents

```ts
// Xoá tất cả notifications cũ hơn 30 ngày
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
await mongo.notifications.deleteMany({
  createdAt: { $lt: thirtyDaysAgo },
})

// Xoá tất cả documents thoả điều kiện
const result = await mongo.watchLists.deleteMany({
  userId: new ObjectId(userId),
  isDeleted: true,
})
console.log(result.deletedCount)  // Số documents đã xoá
```

## 3. Soft Delete - Xoá mềm

### Tại sao cần soft delete?

Hard delete (deleteOne/deleteMany) xoá vĩnh viễn, không thể khôi phục.
Soft delete đánh dấu `isDeleted: true`, dữ liệu vẫn còn trong DB.

### Schema hỗ trợ soft delete

```ts
// mongo/watchLists.ts
const schema = new mongoose.Schema({
  userId: { type: ObjectId, required: true, index: true },
  name: { type: String, required: true },
  isDeleted: {
    type: Boolean,
    index: true,         // Index vì mọi query đều filter theo field này
  },
})

// Compound index cho query phổ biến
schema.index({ userId: 1, isDeleted: 1 })
```

### Thực hiện soft delete

```ts
// Thay vì deleteOne → updateOne với isDeleted = true
await mongo.watchLists.updateOne(
  { _id: new ObjectId(watchListId), userId: new ObjectId(userId) },
  { $set: { isDeleted: true } },
)
```

### Query phải lọc isDeleted

```ts
// WatchListsController.ts - get() luôn lọc isDeleted
const documents = await mongo.watchLists.find(
  {
    userId: new ObjectId(userId),
    isDeleted: { $ne: true },          // Chỉ lấy chưa bị xoá
  },
  { userId: 1, name: 1, symbols: 1, point: 1 },
)
```

### Index cho soft delete

```ts
// mongo/watchLists.ts
schema.index({ userId: 1, isDeleted: 1 })     // Query phổ biến nhất
schema.index({ _id: 1, isDeleted: 1 })
schema.index({ updatedAt: 1, isDeleted: 1 })
```

## 4. So sánh Hard Delete vs Soft Delete

| Tiêu chí | Hard Delete | Soft Delete |
|---|---|---|
| Method | `deleteOne()`, `deleteMany()` | `updateOne({ isDeleted: true })` |
| Khôi phục | Không thể | Đặt `isDeleted: false` |
| Performance | Giải phóng disk | Tốn disk, nhưng query có index |
| Mọi query | Không cần filter | Phải filter `isDeleted: { $ne: true }` |
| Dùng khi | Data tạm (logs, sessions) | Data quan trọng (users, orders) |

## 5. Pattern trong logics

| Collection | Delete strategy | Lý do |
|---|---|---|
| `watchLists` | Cả hai | Hard delete cho xoá thật, soft delete tùy case |
| `rooms` | Soft delete | Room có members, history, cần giữ lại |
| `notifications` | TTL auto-delete | Tự xoá sau 7 ngày (TTL index) |
| `analysisEvents` | Không xoá | Data phân tích, giữ vĩnh viễn |

### TTL Delete - Tự động xoá

```ts
// mongo/notifications.ts - MongoDB tự xoá sau 7 ngày
schema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 7 },  // 604800 giây
)
```

## 6. Cẩn thận khi xoá

```ts
// NGUY HIỂM - xoá tất cả documents trong collection!
await mongo.watchLists.deleteMany({})

// AN TOÀN - luôn có điều kiện cụ thể
await mongo.watchLists.deleteMany({
  userId: new ObjectId(userId),
  isDeleted: true,
})
```

> **Quy tắc**: KHÔNG BAO GIỜ gọi `deleteMany({})` trong production. Luôn có filter cụ thể.

---

## Tóm tắt

| Method | Chức năng | Kết quả |
|---|---|---|
| `deleteOne(filter)` | Xoá 1 document | `{ deletedCount: 0/1 }` |
| `deleteMany(filter)` | Xoá nhiều documents | `{ deletedCount: N }` |
| `updateOne({ isDeleted: true })` | Soft delete | Document vẫn còn |
| TTL Index | Auto delete | MongoDB tự xoá theo thời gian |

## Bài tập

1. Viết code xoá 1 watchlist (kiểm tra userId trước khi xoá)
2. Viết soft delete cho collection `posts`: thêm `isDeleted` field, viết code soft delete và query chỉ lấy posts chưa xoá
3. Tạo collection `sessions` với TTL index tự xoá sau 24 giờ
4. Giải thích tại sao `notifications` dùng TTL delete thay vì soft delete
