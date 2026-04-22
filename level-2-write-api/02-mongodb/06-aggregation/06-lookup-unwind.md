# $lookup và $unwind - JOIN trong Aggregation

## Mục tiêu

Học cách kết hợp dữ liệu từ nhiều collections trong aggregation pipeline.

---

## 1. $lookup - LEFT JOIN

$lookup kết hợp documents từ 2 collections:

```ts
{
  $lookup: {
    from: 'users',              // Collection nguồn (tên trong MongoDB)
    localField: 'userId',       // Field ở collection hiện tại
    foreignField: '_id',        // Field ở collection nguồn
    as: 'userInfo',             // Tên field chứa kết quả (luôn là ARRAY)
  },
}
```

### Ví dụ: watchLists + users

```ts
await mongo.watchLists.aggregate([
  { $match: { isDeleted: { $ne: true } } },
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'user',
    },
  },
])
```

Kết quả:

```json
{
  "_id": "wl_001",
  "userId": "user_001",
  "name": "Ngân hàng",
  "symbols": ["VCB", "TCB"],
  "user": [                          // Luôn là ARRAY
    {
      "_id": "user_001",
      "fullName": "Trung Đào",
      "email": "trung@example.com"
    }
  ]
}
```

> **Chú ý**: `as` luôn tạo **ARRAY**, kể cả khi chỉ match 1 document.

## 2. $unwind - Tách array thành documents

`$unwind` biến mỗi phần tử trong array thành 1 document riêng:

```ts
// Trước $unwind
{ name: "Ngân hàng", user: [{ fullName: "Trung" }] }

// Sau $unwind
{ name: "Ngân hàng", user: { fullName: "Trung" } }   // Array → Object
```

### Pattern: $lookup + $unwind

```ts
await mongo.watchLists.aggregate([
  { $match: { isDeleted: { $ne: true } } },
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'user',
    },
  },
  { $unwind: '$user' },    // Biến user array thành object
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

Kết quả:

```json
{
  "name": "Ngân hàng",
  "symbols": ["VCB", "TCB"],
  "user": {
    "fullName": "Trung Đào",
    "avatar": "https://..."
  }
}
```

## 3. $unwind với array field

$unwind cũng dùng để tách array field thành nhiều documents:

```ts
// Document: { name: "Ngân hàng", symbols: ["VCB", "TCB", "MBB"] }

await mongo.watchLists.aggregate([
  { $unwind: '$symbols' },
])

// Kết quả: 3 documents
// { name: "Ngân hàng", symbols: "VCB" }
// { name: "Ngân hàng", symbols: "TCB" }
// { name: "Ngân hàng", symbols: "MBB" }
```

### Ứng dụng: Đếm symbol xuất hiện trong bao nhiêu watchlists

```ts
await mongo.watchLists.aggregate([
  { $match: { isDeleted: { $ne: true } } },
  { $unwind: '$symbols' },
  { $group: { _id: '$symbols', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 },
])
// Kết quả: [{ _id: "VCB", count: 1500 }, { _id: "TCB", count: 1200 }, ...]
```

## 4. $unwind options

```ts
// Mặc định: bỏ qua documents có array rỗng
{ $unwind: '$symbols' }
// Document có symbols: [] → biến mất

// Giữ documents có array rỗng
{ $unwind: { path: '$symbols', preserveNullAndEmptyArrays: true } }
// Document có symbols: [] → giữ lại với symbols: null
```

## 5. $lookup với pipeline (nâng cao)

```ts
// Lookup với điều kiện phức tạp
{
  $lookup: {
    from: 'orders',
    let: { uid: '$_id' },                    // Biến local
    pipeline: [                               // Pipeline con
      { $match: {
        $expr: { $eq: ['$user._id', '$$uid'] },  // $$uid = biến từ let
        status: 'completed',                        // Chỉ lấy orders completed
      }},
      { $sort: { createdAt: -1 } },
      { $limit: 5 },                                 // Chỉ 5 orders gần nhất
    ],
    as: 'recentOrders',
  },
}
```

## 6. Performance $lookup

```ts
// CHẬM: $lookup trên collection lớn không có index
{
  $lookup: {
    from: 'analysisEvents',      // 100M+ documents
    localField: '_id',
    foreignField: 'uid',          // Nếu uid không có index → full scan
    as: 'events',
  },
}

// NHANH: foreignField có index
// analysisEvents đã có index { key: 1, uid: 1, createdAt: 1 }
```

> **Luôn đảm bảo `foreignField` có index** khi dùng $lookup.

## 7. Tại sao logics ít dùng $lookup?

Logics thường dùng:

- **Embed** thay vì reference (rooms.owner)
- **2 queries riêng** thay vì $lookup (WatchListsController)
- **Parallel queries** với Promise.all (getRetention)

Lý do:

1. $lookup trên collections lớn có thể chậm
2. 2 queries riêng dễ cache, dễ optimize
3. Embed không cần JOIN

---

## Tóm tắt

| Stage | Chức năng |
|---|---|
| `$lookup` | JOIN 2 collections, kết quả là ARRAY |
| `$unwind` | Tách array thành documents riêng |
| `$lookup` + `$unwind` | JOIN và biến array thành object |

## Bài tập

1. Viết $lookup: lấy `rooms` kèm danh sách `roomMembers`
2. Viết pipeline: $unwind `watchLists.symbols` → $group đếm mỗi symbol xuất hiện bao nhiêu lần
3. Viết $lookup với pipeline: lấy users kèm 3 orders gần nhất có `status = 'completed'`
