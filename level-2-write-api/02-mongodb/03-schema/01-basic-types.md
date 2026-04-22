# Kiểu dữ liệu cơ bản trong Schema

## Mục tiêu

Hiểu các kiểu dữ liệu cơ bản của Mongoose: String, Number, Boolean, Date, ObjectId.

---

## 1. String

Kiểu phổ biến nhất, giống `string` trong TypeScript:

```ts
// mongo/rooms.ts - Dự án logics
const schema = new mongoose.Schema({
  name: String,                        // Cách ngắn
  avatar: String,
  description: String,
})
```

Hoặc khai báo đầy đủ với validation:

```ts
// mongo/watchLists.ts
const schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,  // Bắt buộc phải có
  },
})
```

## 2. Number

Lưu trữ số nguyên hoặc số thực:

```ts
// mongo/rooms.ts
const schema = new mongoose.Schema({
  numberOfMember: {
    type: Number,
    default: 0,      // Giá trị mặc định
  },
})

// mongo/watchLists.ts
const schema = new mongoose.Schema({
  point: {
    type: Number,
    required: true,
  },
})
```

## 3. Boolean

Đúng hoặc sai, thường dùng cho cờ (flags):

```ts
// mongo/watchLists.ts
const schema = new mongoose.Schema({
  isDeleted: {
    type: Boolean,
    index: true,      // Đánh index vì hay query theo field này
  },
})

// mongo/rooms.ts
const schema = new mongoose.Schema({
  isDeleted: Boolean,
  isPrivate: Boolean,
})
```

> **Soft delete**: Thay vì xoá document thật, đặt `isDeleted: true`. Dữ liệu vẫn còn trong DB.

## 4. Date

Lưu trữ thời gian (kiểu ISODate trong MongoDB):

```ts
// mongo/analysisEvents.ts
const schema = new mongoose.Schema({
  createdAt: {
    type: Date,
    default: Date.now,    // Tự động gán thời gian hiện tại
  },
})
```

Khi query:

```ts
// Tìm events trong 7 ngày gần nhất
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
await mongo.analysisEvents.find({
  createdAt: { $gte: sevenDaysAgo }
})
```

## 5. ObjectId

Kiểu ID đặc biệt của MongoDB - 12 bytes, unique, tự sinh:

```ts
// mongo/watchLists.ts
import mongoose from 'mongoose'
const ObjectId = mongoose.Schema.Types.ObjectId

const schema = new mongoose.Schema({
  userId: {
    type: ObjectId,       // Tham chiếu tới document trong collection khác
    required: true,
    index: true,
  },
})
```

Khi sử dụng trong code:

```ts
// Trong WatchListsController.ts
import mongoose from 'mongoose'
const ObjectId = mongoose.Types.ObjectId  // Chú ý: Types, không phải Schema.Types

// Tạo ObjectId từ string
const uid = new ObjectId('64f1a2b3c4d5e6f7a8b9c0d1')

// Dùng trong query
await mongo.watchLists.find({ userId: new ObjectId(userId) })
```

> **Lưu ý quan trọng**: `mongoose.Schema.Types.ObjectId` dùng khi **định nghĩa schema**. `mongoose.Types.ObjectId` dùng khi **tạo giá trị** trong code.

## 6. Object (Mixed)

Lưu trữ object bất kỳ, không cần định nghĩa cấu trúc:

```ts
// mongo/analysisEvents.ts
const schema = new mongoose.Schema({
  val: Object,    // Chấp nhận bất kỳ object nào
})

// mongo/users.ts
const schema = new mongoose.Schema({
  metaData: { type: Object },
})
```

## Bảng tổng hợp

| Mongoose Type | TypeScript | MongoDB | Ví dụ trong logics |
|---|---|---|---|
| `String` | `string` | String | `rooms.name`, `users.fullName` |
| `Number` | `number` | Int/Double | `watchLists.point`, `rooms.numberOfMember` |
| `Boolean` | `boolean` | Boolean | `watchLists.isDeleted`, `rooms.isPrivate` |
| `Date` | `Date` | ISODate | `analysisEvents.createdAt` |
| `ObjectId` | `mongoose.Types.ObjectId` | ObjectId | `watchLists.userId`, `notifications.userId` |
| `Object` | `any` | Object | `analysisEvents.val`, `users.metaData` |

---

## Bài tập

1. Viết schema cho collection `products` với: `name` (String, required), `price` (Number, required), `inStock` (Boolean, default true), `createdAt` (Date, default now)
2. Tạo 1 document product, sau đó query bằng `_id` (ObjectId)
3. So sánh: `mongoose.Schema.Types.ObjectId` và `mongoose.Types.ObjectId` khác nhau ở đâu?
