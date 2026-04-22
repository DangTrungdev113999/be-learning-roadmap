# Operators - Toán tử query trong MongoDB

## Mục tiêu

Nắm vững tất cả operators phổ biến: so sánh, logical, element, array, regex.

---

## 1. Comparison Operators (So sánh)

### $gt, $gte, $lt, $lte (Lớn hơn, nhỏ hơn)

```ts
// Tìm events trong khoảng thời gian - code thật từ analyticsService
await mongo.analysisEvents.countDocuments({
  createdAt: { $gte: from, $lte: to },    // from <= createdAt <= to
  key: 'page_view',
})
```

```ts
// $gt = greater than (>), $gte = greater than or equal (>=)
// $lt = less than (<), $lte = less than or equal (<=)

// Users có trialCount > 3
await mongo.users.find({ trialCount: { $gt: 3 } })

// Orders có price từ 100.000 đến 500.000
await mongo.orders.find({
  'plan.price': { $gte: 100000, $lte: 500000 },
})
```

### $ne (Not Equal - Khác)

```ts
// Code thật - WatchListsController.ts
await mongo.watchLists.find({
  userId: new ObjectId(userId),
  isDeleted: { $ne: true },          // isDeleted khác true (gồm false và undefined)
})
```

> **Lưu ý**: `isDeleted: { $ne: true }` khác với `isDeleted: false`. `$ne: true` match cả documents **không có** field `isDeleted`.

### $in (Thuộc danh sách)

```ts
// Code thật - WatchListsController.ts
await mongo.watchLists.find({
  _id: {
    $in: watchListIds.map((item) => new ObjectId(item)),
  },
})

// Code thật - analyticsService getEventCounts
await mongo.analysisEvents.aggregate([
  { $match: { key: { $in: keys } } },    // key thuộc danh sách keys
])
```

```ts
// Tìm users có plan level là 'pro' hoặc 'vip'
await mongo.users.find({
  'plan.level': { $in: ['pro', 'vip'] },
})
```

### $nin (Không thuộc danh sách)

```ts
// Tìm orders KHÔNG có status pending hoặc failed
await mongo.orders.find({
  status: { $nin: ['pending', 'failed'] },
})
```

## 2. Element Operators (Kiểm tra field)

### $exists (Field có tồn tại không)

```ts
// Code thật - analyticsService getTopContent
{ $match: {
  [valField]: { $exists: true, $ne: null },  // Field tồn tại VÀ không null
} }

// Code thật - getRetention
{ $match: {
  uid: { $exists: true, $ne: null },
} }
```

```ts
// Tìm users CÓ field expertId
await mongo.users.find({ expertId: { $exists: true } })

// Tìm users KHÔNG CÓ field avatar
await mongo.users.find({ avatar: { $exists: false } })
```

## 3. Logical Operators (Logic)

### $or

```ts
// Code thật - analyticsService getActiveUsers
const match = {
  $or: [
    { mob: { $gte: from, $lte: to } },    // Active trên mobile
    { web: { $gte: from, $lte: to } },    // HOẶC active trên web
  ],
}
await mongo.userLastAccesses.aggregate([{ $match: match }])
```

```ts
// Tìm users có email HOẶC phoneNumber
await mongo.users.find({
  $or: [
    { email: { $exists: true } },
    { phoneNumber: { $exists: true } },
  ],
})
```

### $and

```ts
// $and thường implicit (viết nhiều điều kiện trong cùng object)
// 2 cách viết này GIỐNG nhau:

// Implicit AND
await mongo.watchLists.find({
  userId: new ObjectId(userId),
  isDeleted: { $ne: true },
})

// Explicit AND
await mongo.watchLists.find({
  $and: [
    { userId: new ObjectId(userId) },
    { isDeleted: { $ne: true } },
  ],
})
```

> Dùng explicit `$and` khi cần AND trên **cùng 1 field**:

```ts
// Tìm users tạo từ tháng 1 đến tháng 3 VÀ có trialCount > 0
await mongo.users.find({
  $and: [
    { createdAt: { $gte: new Date('2024-01-01') } },
    { createdAt: { $lte: new Date('2024-03-31') } },
    { trialCount: { $gt: 0 } },
  ],
})
```

## 4. Regex Operator (Pattern matching)

```ts
// Tìm users có tên chứa "Trung" (case insensitive)
await mongo.users.find({
  fullName: { $regex: /trung/i },
})

// Tìm stocks bắt đầu bằng "VC"
await mongo.stocks.find({
  code: { $regex: /^VC/ },
})
```

## 5. Kết hợp nhiều operators

```ts
// Query phức tạp kết hợp nhiều operators
const query = {
  userId: new ObjectId(userId),                    // exact match
  isDeleted: { $ne: true },                         // not equal
  createdAt: { $gte: startDate, $lte: endDate },    // range
  'plan.level': { $in: ['pro', 'vip'] },            // in list
  symbols: { $exists: true },                        // field exists
}

const results = await mongo.watchLists.find(query)
```

## 6. Bảng tổng hợp

| Operator | Ý nghĩa | SQL tương đương | Ví dụ |
|---|---|---|---|
| `$gt` | Lớn hơn | `>` | `{ age: { $gt: 18 } }` |
| `$gte` | Lớn hơn hoặc bằng | `>=` | `{ createdAt: { $gte: from } }` |
| `$lt` | Nhỏ hơn | `<` | `{ price: { $lt: 1000 } }` |
| `$lte` | Nhỏ hơn hoặc bằng | `<=` | `{ createdAt: { $lte: to } }` |
| `$ne` | Khác | `!=` | `{ isDeleted: { $ne: true } }` |
| `$in` | Thuộc danh sách | `IN (...)` | `{ status: { $in: ['a', 'b'] } }` |
| `$nin` | Không thuộc | `NOT IN` | `{ status: { $nin: ['x'] } }` |
| `$exists` | Field tồn tại | `IS NOT NULL` | `{ email: { $exists: true } }` |
| `$regex` | Pattern match | `LIKE` | `{ name: { $regex: /abc/i } }` |
| `$or` | Hoặc | `OR` | `{ $or: [{a: 1}, {b: 2}] }` |
| `$and` | Và | `AND` | `{ $and: [{a: 1}, {b: 2}] }` |

---

## Bài tập

1. Viết query tìm orders có `status` là 'completed', `plan.price >= 200000`, tạo trong tháng này
2. Viết query tìm users có `email` HOẶC `phoneNumber`, đã active trong 7 ngày gần nhất (`lastLoggedIn`)
3. Viết query tìm rooms có `numberOfMember > 100` VÀ `isDeleted != true` VÀ `isPrivate != true`
4. Tại sao `isDeleted: { $ne: true }` khác với `isDeleted: false`? Cho ví dụ document match cái này nhưng không match cái kia
