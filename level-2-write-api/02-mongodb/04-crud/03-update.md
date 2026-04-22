# Update - Cập nhật Documents

## Mục tiêu

Học các methods và operators cập nhật: `updateOne`, `updateMany`, `findOneAndUpdate`, `$set`, `$push`, `$addToSet`, `$pull`.

---

## 1. updateOne() - Cập nhật 1 document

### Code thật từ WatchListsController

```ts
// Cập nhật point (thứ tự) của watchlist
await mongo.watchLists.updateOne(
  { _id: new ObjectId(item) },      // filter: tìm document
  { point: index },                   // update: giá trị mới
)
```

### Sắp xếp lại vị trí nhiều watchlists

```ts
// WatchListsController.ts - applyPositions
await Promise.all(
  [...filterWatchlistIds].reverse().map((item, index) => {
    return mongo.watchLists.updateOne(
      { _id: new ObjectId(item) },
      { point: index },
    )
  }),
)
```

### Kết quả trả về

```ts
const result = await mongo.watchLists.updateOne(
  { _id: new ObjectId(id) },
  { name: 'Tên mới' },
)

result.matchedCount   // 1 = tìm thấy, 0 = không tìm thấy
result.modifiedCount  // 1 = đã sửa, 0 = giá trị không thay đổi
result.acknowledged   // true = DB đã nhận lệnh
```

## 2. findOneAndUpdate() - Tìm, cập nhật, trả về document

### Code thật

```ts
// WatchListsController.ts - update tên watchlist
const newOne = await mongo.watchLists.findOneAndUpdate(
  {
    _id: new ObjectId(watchListId),
    userId: new ObjectId(userId),      // Đảm bảo đúng chủ sở hữu
  },
  {
    name: name,
  },
  {
    new: true,          // Trả về document SAU khi update
    projection: {       // Chọn fields trả về
      userId: 1,
      name: 1,
      symbols: 1,
      symbolsV2: 1,
      point: 1,
    },
  },
)

if (!newOne) {
  return { error: { code: responseCodes.INVALID_PARAM } }
}
return { data: newOne }
```

### Option `new: true` vs `new: false`

```ts
// new: false (mặc định) → trả về document TRƯỚC khi update
const old = await mongo.watchLists.findOneAndUpdate(filter, { name: 'B' })
// old.name = 'A' (giá trị cũ)

// new: true → trả về document SAU khi update
const updated = await mongo.watchLists.findOneAndUpdate(filter, { name: 'B' }, { new: true })
// updated.name = 'B' (giá trị mới)
```

## 3. $set - Gán giá trị cụ thể

```ts
// Cách ngắn (Mongoose tự thêm $set)
await mongo.watchLists.updateOne(
  { _id },
  { name: 'Tên mới', point: 5 },
)

// Cách tường minh với $set
await mongo.watchLists.updateOne(
  { _id },
  { $set: { name: 'Tên mới', point: 5 } },
)

// Update nested field
await mongo.rooms.updateOne(
  { _id: roomId },
  { $set: { 'owner.fullName': 'Tên mới' } },
)
```

## 4. $addToSet + $each - Thêm vào array (không trùng)

### Code thật - Thêm symbols vào watchlist

```ts
// WatchListsController.ts - addSymbols
await mongo.watchLists.updateOne(
  {
    _id: new ObjectId(item),
    userId: new ObjectId(userId),
  },
  {
    $addToSet: {
      symbols: {
        $each: symbols,           // Thêm nhiều phần tử
      },
      symbolsV2: {
        $each: symbolsV2,
      },
    },
  },
)
```

### Giải thích

```ts
// Document hiện tại: symbols = ["VCB", "TCB"]
// Thêm: symbols = ["TCB", "MBB", "HPG"]

$addToSet: {
  symbols: { $each: ["TCB", "MBB", "HPG"] }
}

// Kết quả: symbols = ["VCB", "TCB", "MBB", "HPG"]
// "TCB" đã có → không thêm trùng
```

So sánh `$addToSet` vs `$push`:

```ts
// $push: Luôn thêm, cho phép trùng
{ $push: { symbols: "VCB" } }  // ["VCB", "TCB", "VCB"] ← trùng!

// $addToSet: Chỉ thêm nếu chưa có
{ $addToSet: { symbols: "VCB" } }  // ["VCB", "TCB"] ← không trùng
```

## 5. $pull + $in - Xoá phần tử khỏi array

### Code thật - Xoá symbols khỏi watchlist

```ts
// WatchListsController.ts - removeSymbols
await mongo.watchLists.updateOne(
  {
    _id: new ObjectId(item),
    userId: new ObjectId(userId),
  },
  {
    $pull: {
      symbols: {
        $in: symbols,               // Xoá nhiều phần tử
      },
      symbolsV2: {
        $in: symbolsV2,
      },
    },
  },
)
```

### Giải thích

```ts
// Document hiện tại: symbols = ["VCB", "TCB", "MBB", "HPG"]
// Xoá: ["TCB", "HPG"]

$pull: {
  symbols: { $in: ["TCB", "HPG"] }
}

// Kết quả: symbols = ["VCB", "MBB"]
```

## 6. updateMany() - Cập nhật nhiều documents

```ts
// Soft delete tất cả watchlists của 1 user
await mongo.watchLists.updateMany(
  { userId: new ObjectId(userId) },
  { $set: { isDeleted: true } },
)

// Reset point cho tất cả
await mongo.watchLists.updateMany(
  { userId: new ObjectId(userId) },
  { $set: { point: 0 } },
)
```

## 7. findByIdAndUpdate()

```ts
// WatchListsController.ts - cập nhật symbols
await mongo.watchLists.findByIdAndUpdate(
  {
    userId: new ObjectId(userId),
    _id: new ObjectId(watchListId),
  },
  {
    symbols,
    symbolsV2,
  },
)
```

---

## Tóm tắt

| Method | Trả về | Dùng khi |
|---|---|---|
| `updateOne(filter, update)` | `{ matchedCount, modifiedCount }` | Cập nhật, không cần kết quả |
| `findOneAndUpdate(filter, update, opts)` | Document (hoặc null) | Cần document sau update |
| `updateMany(filter, update)` | `{ matchedCount, modifiedCount }` | Cập nhật nhiều docs |

| Operator | Chức năng | Ví dụ |
|---|---|---|
| `$set` | Gán giá trị | `{ $set: { name: 'A' } }` |
| `$addToSet` + `$each` | Thêm vào array (không trùng) | Thêm symbols |
| `$pull` + `$in` | Xoá khỏi array | Xoá symbols |
| `$push` | Thêm vào array (cho trùng) | Thêm comment |

## Bài tập

1. Viết code đổi tên watchlist (findOneAndUpdate, trả về document mới)
2. Viết code thêm 3 symbols vào watchlist bằng `$addToSet`
3. Viết code xoá 2 symbols khỏi watchlist bằng `$pull`
4. Viết code soft delete tất cả watchlists của 1 user (updateMany)
