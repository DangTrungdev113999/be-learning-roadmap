# Index trong MongoDB

## Mục tiêu

Hiểu index là gì, tại sao cần, và cách tạo index trong Mongoose.

---

## 1. Index là gì?

Index giống như **mục lục** của một cuốn sách:

- **Không có index**: Đọc từng trang để tìm từ khoá (Full Collection Scan)
- **Có index**: Tra mục lục, nhảy thẳng tới trang cần tìm

```
Không có index trên userId:
  → MongoDB quét 1.000.000 documents để tìm watchLists của 1 user
  → Chậm, tốn tài nguyên

Có index trên userId:
  → MongoDB tra cứu B-tree, tìm ngay 5 documents của user đó
  → Nhanh, tiết kiệm tài nguyên
```

## 2. Tạo index trong schema

### Cách 1: Inline trong field definition

```ts
// mongo/watchLists.ts
const schema = new mongoose.Schema({
  userId: {
    type: ObjectId,
    required: true,
    index: true,           // Single field index
  },
  isDeleted: {
    type: Boolean,
    index: true,
  },
})
```

### Cách 2: Compound index (nhiều fields)

```ts
// mongo/watchLists.ts - Sau khi định nghĩa schema
schema.index({ createdAt: 1 })                    // Sắp xếp tăng dần
schema.index({ updatedAt: 1, isDeleted: 1 })       // Compound: 2 fields
schema.index({ userId: 1, isDeleted: 1 })           // Compound: userId + isDeleted
schema.index({ _id: 1, isDeleted: 1 })
```

### Cách 3: Unique index

```ts
// mongo/users.ts
const schema = new mongoose.Schema({
  identity: {
    type: String,
    index: {
      sparse: true,    // Cho phép null (không bắt buộc phải có)
      unique: true,    // Không cho phép trùng
    },
  },
  email: {
    type: String,
    index: { sparse: true, unique: true },
  },
})
```

### Cách 4: Compound unique index

```ts
// mongo/followerships.ts - Đảm bảo 1 user chỉ follow 1 user khác 1 lần
schema.index(
  { followedUserId: 1, followerUserId: 1 },
  { unique: true }
)
```

## 3. Index direction: 1 và -1

```ts
schema.index({ createdAt: 1 })    // 1 = ascending (tăng dần)
schema.index({ point: -1 })       // -1 = descending (giảm dần)
```

Direction quan trọng khi **sort**:

```ts
// Query sort giảm dần → index cần -1 hoặc 1 (MongoDB tự đảo)
await mongo.watchLists.find({ userId }).sort({ point: -1 })
```

> Với single field index, direction không quan trọng vì MongoDB có thể đọc ngược. Nhưng với compound index, direction quan trọng.

## 4. TTL Index - Tự xoá dữ liệu cũ

```ts
// mongo/notifications.ts - Tự xoá sau 7 ngày
schema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 7 }  // 604800 giây = 7 ngày
)
```

MongoDB tự động xoá documents khi `createdAt` + 7 ngày < thời gian hiện tại. Rất hữu ích cho logs, notifications, sessions.

## 5. Sparse Index

```ts
// mongo/users.ts - Sparse index
email: {
  type: String,
  index: { sparse: true, unique: true },
}
```

**Sparse index** chỉ đánh index cho documents **có field đó**. Nếu document không có field `email`, nó sẽ bị bỏ qua (không chiếm chỗ trong index).

## 6. Tại sao cần index? - Ví dụ thực tế

Collection `analysisEvents` có **100 triệu+ documents**:

```ts
// mongo/analysisEvents.ts
schema.index({ key: 1, uid: 1, createdAt: 1 })   // Compound index
schema.index({ createdAt: 1, key: 1 })             // Compound index

// Query trong getEventCounts - SỬ DỤNG index { createdAt: 1, key: 1 }
await mongo.analysisEvents.countDocuments({
  key: 'page_view',
  createdAt: { $gte: from, $lte: to },
})
```

Không có index: quét 100M+ documents → timeout
Có index: tra cứu B-tree → vài milliseconds

## 7. Chi phí của index

Index không phải miễn phí:

| Ưu điểm | Nhược điểm |
|---|---|
| Query nhanh hơn rất nhiều | Tốn RAM (index phải fit trong memory) |
| Sort hiệu quả | Write chậm hơn (phải update index) |
| | Tốn disk space |

> **Quy tắc**: Chỉ tạo index cho fields bạn **thường xuyên query/sort**. Không tạo index bừa bãi.

---

## Tóm tắt

| Loại index | Cú pháp | Ví dụ trong logics |
|---|---|---|
| Single field | `index: true` | `watchLists.userId` |
| Compound | `schema.index({ a: 1, b: 1 })` | `{ userId: 1, isDeleted: 1 }` |
| Unique | `index: { unique: true }` | `users.email` |
| Sparse | `index: { sparse: true }` | `users.identity` |
| TTL | `{ expireAfterSeconds: N }` | `notifications.createdAt` |

## Bài tập

1. Collection `orders` thường query theo `userId` và `status`. Viết compound index phù hợp
2. Collection `sessions` cần tự xoá sau 24 giờ. Viết TTL index
3. Tại sao `followerships` cần compound unique index `{ followedUserId, followerUserId }`?
