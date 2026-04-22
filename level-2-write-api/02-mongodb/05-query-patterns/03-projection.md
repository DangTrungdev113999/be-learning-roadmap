# Projection - Chọn fields trả về

## Mục tiêu

Học cách chọn fields trả về (giống SELECT trong SQL) để giảm bandwidth và tăng tốc query.

---

## 1. Tại sao cần projection?

Document `users` có **40+ fields** (password, metaData, banks, ...).
API chỉ cần `fullName` và `avatar`. Không nên trả về tất cả.

```ts
// Không có projection → trả về TẤT CẢ fields (kể cả password!)
const user = await mongo.users.findById(userId)

// Có projection → chỉ trả về fields cần thiết
const user = await mongo.users.findById(userId, { _id: 1, fullName: 1 })
```

## 2. Cú pháp: Include (1) hoặc Exclude (0)

### Include - Chỉ lấy fields liệt kê

```ts
// Code thật - WatchListsController.ts
const documents = await mongo.watchLists.find(
  { userId: new ObjectId(userId), isDeleted: { $ne: true } },
  {
    userId: 1,        // Lấy
    name: 1,          // Lấy
    symbols: 1,       // Lấy
    symbolsV2: 1,     // Lấy
    point: 1,         // Lấy
    // _id luôn trả về trừ khi _id: 0
  },
)
```

### Exclude - Bỏ fields liệt kê

```ts
// Lấy tất cả NGOẠI TRỪ password và metaData
const user = await mongo.users.findById(userId, {
  password: 0,
  metaData: 0,
})
```

### Kết hợp include và exclude

```ts
// KHÔNG THỂ mix include và exclude (trừ _id)
{ name: 1, password: 0 }  // ERROR!

// ĐƯỢC: exclude _id khi include
{ _id: 0, name: 1, symbols: 1 }  // OK - _id là ngoại lệ
```

## 3. Projection trong findOneAndUpdate

```ts
// Code thật - WatchListsController.ts
const newOne = await mongo.watchLists.findOneAndUpdate(
  { _id: new ObjectId(watchListId), userId: new ObjectId(userId) },
  { name: name },
  {
    new: true,
    projection: {         // Projection trong options
      userId: 1,
      name: 1,
      symbols: 1,
      symbolsV2: 1,
      point: 1,
    },
  },
)
```

## 4. .select() - Cú pháp thay thế

```ts
// Code thật - RoomsController.ts
const data = await mongo.paymentRequests
  .find(query)
  .sort({ _id: -1 })
  .skip((page - 1) * pageSize)
  .limit(pageSize)
  .select(select)          // Dùng .select() thay vì projection trong find()
  .lean()
```

### Cú pháp .select()

```ts
// Object syntax
.select({ name: 1, symbols: 1 })

// String syntax
.select('name symbols point')         // Include
.select('-password -metaData')        // Exclude (dấu -)
```

## 5. Projection cho kiểm tra tồn tại

```ts
// Code thật - WatchListsController.ts
// Chỉ cần biết user có tồn tại → chỉ lấy _id
const exists = await mongo.users.findById(userId, { _id: 1 })
if (!exists) {
  return { error: { code: responseCodes.PERMISSION_DENIED } }
}
```

> **Performance tip**: Khi chỉ kiểm tra tồn tại, `findById(id, { _id: 1 })` nhanh hơn `findById(id)` vì không cần đọc toàn bộ document.

## 6. Projection trong Aggregation ($project)

```ts
// Code thật - analyticsService getEventCounts
await mongo.analysisEvents.aggregate([
  { $match: { ... } },
  { $group: { ... } },
  {
    $project: {
      _id: 0,                    // Bỏ _id
      key: '$_id.key',           // Đổi tên + lấy giá trị từ _id.key
      date: '$_id.date',         // Đổi tên + lấy giá trị từ _id.date
      count: 1,                  // Giữ nguyên
    },
  },
])
```

`$project` trong aggregation mạnh hơn - có thể tính toán, đổi tên fields.

## 7. So sánh với FE

```ts
// FE: Destructuring để lấy fields cần thiết
const { name, avatar } = user

// BE: Projection để DB chỉ gửi fields cần thiết
await mongo.users.findById(userId, { name: 1, avatar: 1 })
```

Khác biệt: FE destructuring vẫn nhận **toàn bộ data** qua network rồi mới chọn. Projection giảm data **ngay từ DB**.

---

## Tóm tắt

| Cú pháp | Ý nghĩa | Ví dụ |
|---|---|---|
| `{ name: 1, point: 1 }` | Chỉ lấy name, point, _id | Include mode |
| `{ password: 0 }` | Lấy tất cả trừ password | Exclude mode |
| `{ _id: 0, name: 1 }` | Lấy name, bỏ _id | Mix (chỉ _id được) |
| `.select('name point')` | Giống `{ name: 1, point: 1 }` | String syntax |
| `.select('-password')` | Giống `{ password: 0 }` | Exclude syntax |

## Bài tập

1. Viết query lấy `users` chỉ trả về `fullName`, `email`, `plan.level` (bỏ `_id`)
2. Viết query lấy `watchLists` trả về tất cả NGOẠI TRỪ `createdAt`, `updatedAt`
3. Tại sao kiểm tra user tồn tại nên dùng `findById(id, { _id: 1 })` thay vì `findById(id)`?
