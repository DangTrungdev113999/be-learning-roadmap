# ObjectId References - Liên kết giữa Collections

## Mục tiêu

Hiểu cách dùng ObjectId để liên kết documents giữa các collections (tương tự foreign key trong SQL).

---

## 1. ObjectId Reference là gì?

Thay vì nhúng toàn bộ user vào watchlist, chỉ lưu `userId` (ObjectId) và tra cứu khi cần:

```ts
// mongo/watchLists.ts
const schema = new mongoose.Schema({
  userId: {
    type: ObjectId,        // Tham chiếu tới users collection
    required: true,
    index: true,
  },
  name: { type: String, required: true },
})
```

```
watchLists collection           users collection
┌────────────────────┐         ┌─────────────────────┐
│ _id: "wl_001"      │         │ _id: "user_001"     │
│ userId: "user_001" │───────► │ fullName: "Trung"   │
│ name: "Ngân hàng"  │         │ email: "t@mail.com" │
└────────────────────┘         └─────────────────────┘
```

## 2. Ví dụ thực tế trong logics

### watchLists → users

```ts
// mongo/watchLists.ts
userId: { type: ObjectId, required: true, index: true }

// Trong WatchListsController.ts - query watchlists của 1 user
const documents = await mongo.watchLists.find({
  userId: new ObjectId(userId),
  isDeleted: { $ne: true },
})
```

### notifications → users

```ts
// mongo/notifications.ts
const schema = new mongoose.Schema({
  userId: { type: ObjectId, index: true },
  title: String,
  content: String,
})

schema.index({ userId: 1, createdAt: 1 })
```

### followerships - 2 references cùng collection

```ts
// mongo/followerships.ts
const schema = new mongoose.Schema({
  followedUserId: {
    type: ObjectId,
    index: true,
    required: true,
  },
  followerUserId: {
    type: ObjectId,
    index: true,
    required: true,
  },
})

// Unique compound index - 1 user chỉ follow 1 user khác 1 lần
schema.index({ followedUserId: 1, followerUserId: 1 }, { unique: true })
```

### users.parentId → users (self-reference)

```ts
// mongo/users.ts - Tham chiếu tới chính collection users
const schema = new mongoose.Schema({
  parentId: {
    type: ObjectId,
    index: true,       // User giới thiệu
  },
})
```

## 3. Tạo ObjectId trong code

```ts
import mongoose from 'mongoose'
const ObjectId = mongoose.Types.ObjectId

// Từ string (nhận từ client)
const userId = new ObjectId('64f1a2b3c4d5e6f7a8b9c0d1')

// Kiểm tra hợp lệ
ObjectId.isValid('64f1a2b3c4d5e6f7a8b9c0d1')  // true
ObjectId.isValid('invalid')                      // false

// Tạo mới (random)
const newId = new ObjectId()  // Tạo ObjectId mới, unique
```

## 4. So sánh ObjectId reference vs Embed

Trong logics, cả 2 pattern đều được dùng:

```ts
// REFERENCE: watchLists.userId → chỉ lưu ID
const watchlist = {
  userId: new ObjectId('user_001'),  // Chỉ lưu ID
  name: 'Ngân hàng',
}

// EMBED: rooms.owner → nhúng thông tin luôn
const room = {
  owner: {
    _id: 'user_001',
    fullName: 'Trung Đào',     // Nhúng luôn tên
    avatar: 'https://...',      // Nhúng luôn avatar
    expertId: 'expert_001',
  },
}
```

Khi nào dùng gì:

| Pattern | Dùng khi | Ví dụ |
|---|---|---|
| Reference | Dữ liệu thay đổi thường xuyên | `watchLists.userId` |
| Reference | Cần query riêng | `notifications.userId` |
| Embed | Luôn hiển thị cùng lúc | `rooms.owner` |
| Embed | Dữ liệu ít thay đổi | `orders.user` |

## 5. Query qua reference

```ts
// Bước 1: Tìm user
const user = await mongo.users.findById(userId, { _id: 1, fullName: 1 })

// Bước 2: Tìm watchlists của user
const watchlists = await mongo.watchLists.find({
  userId: new ObjectId(userId),
})

// Trong WatchListsController.ts - kiểm tra user tồn tại trước
const exists = await mongo.users.findById(userId, { _id: 1 })
if (!exists) {
  return { error: { code: responseCodes.PERMISSION_DENIED } }
}
```

## 6. Cẩn thận với kiểu dữ liệu

```ts
// String và ObjectId KHÔNG match khi query!
await mongo.watchLists.find({ userId: '64f1a2b3c4d5e6f7a8b9c0d1' })     // Có thể không tìm thấy
await mongo.watchLists.find({ userId: new ObjectId('64f1a2b3c4d5e6f7a8b9c0d1') })  // Đúng

// So sánh ObjectId
const id1 = new ObjectId('64f1a2b3c4d5e6f7a8b9c0d1')
const id2 = new ObjectId('64f1a2b3c4d5e6f7a8b9c0d1')
id1 === id2          // false (khác reference)
id1.equals(id2)      // true (so sánh giá trị)
id1.toString()       // '64f1a2b3c4d5e6f7a8b9c0d1'
```

---

## Tóm tắt

- ObjectId reference = foreign key trong SQL
- Luôn `new ObjectId(stringId)` khi query
- Dùng `.equals()` để so sánh 2 ObjectId, không dùng `===`
- Index trên field reference là bắt buộc (nếu không = full scan)

## Bài tập

1. Tạo 2 schemas: `authors` (name, email) và `books` (title, authorId: ObjectId). Tạo 1 author, 2 books, query books của author đó
2. Tại sao `followerships` cần unique compound index trên cả `followedUserId` và `followerUserId`?
3. Viết code kiểm tra ObjectId hợp lệ trước khi query
