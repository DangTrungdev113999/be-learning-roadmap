# Bài tập cơ bản - CRUD (10 bài)

## Hướng dẫn

- Dùng MongoDB local hoặc MongoDB Atlas
- Tạo database `learning`, dùng các collections: `users`, `watchLists`, `rooms`
- Viết code bằng TypeScript + Mongoose

---

## Bài 1: Tạo Schema

Viết schema cho `watchLists` với các fields:
- `userId` (ObjectId, required, index)
- `name` (String, required)
- `symbols` ([String])
- `isDeleted` (Boolean, index)
- `point` (Number, required)
- timestamps tự động

```ts
// File: mongo/watchLists.ts
// Viết schema ở đây
```

## Bài 2: Create Document

Tạo 1 watchlist mới:

```ts
// Input: userId = '64f1a2b3c4d5e6f7a8b9c0d1', name = 'Cổ phiếu ngân hàng'
// Expected: document với symbols rỗng, point = 0, có _id và timestamps
```

## Bài 3: Create với kiểm tra

Tạo watchlist mới, nhưng:
1. Kiểm tra user tồn tại (`users.findById`)
2. Tìm watchlist có point cao nhất (`findOne + sort`)
3. Point mới = point cao nhất + 1

```ts
// Giống logic trong WatchListsController.create()
```

## Bài 4: Find với Filter

Lấy tất cả watchlists của 1 user, loại bỏ đã xoá:

```ts
// Filter: userId = ?, isDeleted != true
// Projection: userId, name, symbols, point
// Sort: point giảm dần
```

## Bài 5: Find với $in

Tìm nhiều watchlists bằng danh sách IDs:

```ts
// Input: watchListIds = ['id1', 'id2', 'id3']
// Nhớ convert string → ObjectId
```

## Bài 6: findOneAndUpdate

Đổi tên watchlist, trả về document mới:

```ts
// Filter: _id = watchListId VÀ userId = userId (đảm bảo đúng chủ)
// Update: name = 'Tên mới'
// Options: new: true, projection chọn fields
```

## Bài 7: updateOne

Cập nhật point (thứ tự) cho watchlist:

```ts
// Filter: { _id: watchListId }
// Update: { point: 5 }
// Check: result.matchedCount, result.modifiedCount
```

## Bài 8: $addToSet - Thêm symbols

Thêm symbols vào watchlist (không trùng):

```ts
// Input: watchListId, symbols = ['VCB', 'TCB', 'MBB']
// Dùng $addToSet + $each
// Nếu 'VCB' đã có → không thêm lại
```

## Bài 9: $pull - Xoá symbols

Xoá symbols khỏi watchlist:

```ts
// Input: watchListId, symbols = ['TCB', 'MBB']
// Dùng $pull + $in
```

## Bài 10: Delete

Xoá watchlist (hard delete):

```ts
// Filter: userId VÀ _id (đảm bảo user chỉ xoá watchlist của mình)
// Check: result.deletedCount
```

---

## Đáp án mẫu (Bài 4)

```ts
import mongoose from 'mongoose'
import mongo from './mongo'

const ObjectId = mongoose.Types.ObjectId

async function getWatchLists(userId: string) {
  const documents = await mongo.watchLists
    .find(
      {
        userId: new ObjectId(userId),
        isDeleted: { $ne: true },
      },
      {
        userId: 1,
        name: 1,
        symbols: 1,
        point: 1,
      },
    )
    .sort({ point: -1 })

  return documents
}
```

## Tiêu chí đánh giá

- [ ] Schema đúng kiểu dữ liệu
- [ ] Có index trên fields cần thiết
- [ ] ObjectId conversion đúng
- [ ] Filter đủ điều kiện (userId + isDeleted)
- [ ] Có projection (không trả về thừa fields)
