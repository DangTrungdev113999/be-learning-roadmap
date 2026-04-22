# Populate và $lookup - JOIN giữa Collections

## Mục tiêu

Hiểu cách kết nối dữ liệu giữa các collections, tương tự JOIN trong SQL.

---

## 1. Vấn đề: Dữ liệu ở nhiều collections

```
watchLists collection              users collection
┌──────────────────────┐          ┌─────────────────────┐
│ userId: "user_001"   │──────?──►│ _id: "user_001"     │
│ name: "Ngân hàng"    │          │ fullName: "Trung"   │
└──────────────────────┘          │ avatar: "https://..." │
                                  └─────────────────────┘

Cần lấy watchlist + thông tin user. Làm sao?
```

## 2. Cách 1: Query thủ công (logics dùng nhiều nhất)

```ts
// WatchListsController.ts - query 2 lần
// Bước 1: Kiểm tra user
const exists = await mongo.users.findById(userId, { _id: 1 })

// Bước 2: Lấy watchlists
const watchlists = await mongo.watchLists.find({
  userId: new ObjectId(userId),
})
```

Đây là cách phổ biến nhất trong logics vì đơn giản, dễ kiểm soát.

## 3. Cách 2: Mongoose populate

### Cần ref trong schema

```ts
// Schema cần khai báo ref
const schema = new mongoose.Schema({
  userId: {
    type: ObjectId,
    ref: 'users',        // Tham chiếu tới model 'users'
    required: true,
  },
})
```

### Dùng populate

```ts
// populate tự động query collection users và gắn kết quả
const watchlists = await mongo.watchLists
  .find({ userId: new ObjectId(userId) })
  .populate('userId', 'fullName avatar')  // Thay userId (ObjectId) bằng user document

// Kết quả:
// {
//   userId: {
//     _id: "user_001",
//     fullName: "Trung",
//     avatar: "https://..."
//   },
//   name: "Ngân hàng",
//   symbols: ["VCB"]
// }
```

### populate options

```ts
.populate({
  path: 'userId',                 // Field cần populate
  select: 'fullName avatar',      // Chỉ lấy fields này từ users
  model: 'users',                 // Model nào (thường tự detect từ ref)
})
```

## 4. Cách 3: $lookup trong Aggregation

$lookup mạnh hơn populate - thực hiện JOIN ở cấp database:

```ts
// Ví dụ: Lấy watchlists kèm thông tin user
await mongo.watchLists.aggregate([
  { $match: { isDeleted: { $ne: true } } },
  {
    $lookup: {
      from: 'users',              // Collection nguồn (tên trong MongoDB, không phải model name)
      localField: 'userId',       // Field ở watchLists
      foreignField: '_id',        // Field ở users
      as: 'user',                 // Tên field chứa kết quả (array)
    },
  },
  { $unwind: '$user' },           // Biến array thành object (vì 1 userId → 1 user)
  {
    $project: {
      name: 1,
      symbols: 1,
      'user.fullName': 1,
      'user.avatar': 1,
    },
  },
])
```

## 5. Tại sao logics ít dùng populate?

Logics chọn **embed** hoặc **query thủ công** thay vì populate:

```ts
// EMBED - rooms.owner: Không cần populate vì data đã nhúng
const room = await mongo.rooms.findById(roomId)
// room.owner.fullName → có sẵn, không cần query thêm

// QUERY THỦ CÔNG - WatchListsController: 2 queries riêng
const user = await mongo.users.findById(userId, { _id: 1 })
const watchlists = await mongo.watchLists.find({ userId })
```

Lý do:

| Populate | Query thủ công |
|---|---|
| Tự động, ngắn gọn | Kiểm soát rõ ràng |
| Khó optimize | Dễ thêm cache, projection |
| N+1 problem tiềm ẩn | Biết chính xác bao nhiêu queries |

## 6. $lookup trong analyticsService

```ts
// Ví dụ thực tế: Lấy retention data kết hợp 2 collections
// Bước 1: Lấy new users từ analysisEvents
const cohorts = await mongo.analysisEvents.aggregate([
  { $match: { key: 'user_created', createdAt: { $gte: from, $lte: to } } },
  { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, uids: { $addToSet: '$uid' } } },
])

// Bước 2: Check activity từ logs collection (query riêng)
const activeRecords = await mongo.logs.aggregate([
  { $match: { userId: { $in: allOids }, createdAt: { $gte: minDate, $lte: maxDate } } },
  { $group: { _id: { userId: '$userId', date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } } },
])
```

> Logics dùng **2 aggregation riêng** thay vì 1 aggregation với $lookup. Lý do: kiểm soát performance tốt hơn trên collections lớn (100M+ documents).

## 7. So sánh

| Cách | Performance | Độ phức tạp | Dùng khi |
|---|---|---|---|
| Query thủ công | Tốt (kiểm soát) | Nhiều code | Cần optimize, cache |
| Embed | Tốt nhất (1 query) | Schema phức tạp | Data ít thay đổi |
| Populate | Trung bình | Ngắn gọn | Prototyping, CRUD đơn giản |
| $lookup | Tốt (DB level) | Pipeline phức tạp | Aggregation, báo cáo |

---

## Bài tập

1. Viết schema `comments` với `userId` ref tới `users`. Dùng `.populate()` lấy `fullName` của user
2. Viết $lookup: lấy tất cả `watchLists` kèm `user.fullName` và `user.email`
3. Giải thích tại sao `rooms.owner` dùng embed thay vì ref + populate
