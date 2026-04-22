# $match - Lọc documents

## Mục tiêu

Học cách dùng $match trong aggregation pipeline, tương đương WHERE trong SQL.

---

## 1. $match cơ bản

`$match` giống `find()` nhưng dùng trong pipeline:

```ts
// find() - standalone query
await mongo.analysisEvents.find({ key: 'page_view' })

// $match - trong pipeline
await mongo.analysisEvents.aggregate([
  { $match: { key: 'page_view' } },
])
```

## 2. Code thật từ analyticsService

### getEventCounts - match nhiều điều kiện

```ts
// app/Services/analyticsService/libs/getEventCounts.ts
{ $match: {
  key: { $in: keys },                      // key thuộc danh sách
  createdAt: { $gte: from, $lte: to },     // Trong khoảng thời gian
} }
```

### getTopContent - match với $exists

```ts
// app/Services/analyticsService/libs/getTopContent.ts
{ $match: {
  createdAt: { $gte: from, $lte: to },
  key: { $in: eventKeys },
  [valField]: { $exists: true, $ne: null },    // Field tồn tại và không null
} }
```

### getRetention - match chính xác 1 key

```ts
// app/Services/analyticsService/libs/getRetention.ts
{ $match: {
  key: 'user_created',
  createdAt: { $gte: from, $lte: to },
  uid: { $exists: true, $ne: null },
} }
```

### getActiveUsers - match với $or

```ts
// app/Services/analyticsService/libs/getActiveUsers.ts
const match: Record<string, any> = {}

if (platform === 'mobile') {
  match.mob = { $gte: from, $lte: to }
} else if (platform === 'web') {
  match.web = { $gte: from, $lte: to }
} else {
  match.$or = [
    { mob: { $gte: from, $lte: to } },
    { web: { $gte: from, $lte: to } },
  ]
}

await mongo.userLastAccesses.aggregate([
  { $match: match },
  // ... stages tiếp theo
])
```

## 3. Dynamic match - Build điều kiện linh hoạt

```ts
// Pattern từ getActiveUsers - xây dựng match object tuỳ theo input
const match: Record<string, any> = {}

if (platform === 'mobile') {
  match.mob = { $gte: from, $lte: to }
} else if (platform === 'web') {
  match.web = { $gte: from, $lte: to }
} else {
  match.$or = [
    { mob: { $gte: from, $lte: to } },
    { web: { $gte: from, $lte: to } },
  ]
}
```

> **Pattern hay**: Build match object dựa trên input, thay vì viết nhiều pipeline riêng.

## 4. $match và Index

**$match ĐẦU pipeline** có thể sử dụng index:

```ts
// SỬ DỤNG index { createdAt: 1, key: 1 }
await mongo.analysisEvents.aggregate([
  { $match: { createdAt: { $gte: from }, key: 'page_view' } },  // Đầu pipeline
  { $group: { ... } },
])

// KHÔNG sử dụng index
await mongo.analysisEvents.aggregate([
  { $group: { ... } },      // Group trước
  { $match: { count: { $gt: 100 } } },  // Match sau → không dùng index
])
```

> **Quy tắc**: Luôn đặt `$match` **đầu tiên** trong pipeline. Nếu cần match sau group, vẫn nên có $match đầu để filter trước.

## 5. Tất cả operators trong $match

$match hỗ trợ tất cả operators của `find()`:

```ts
{ $match: {
  // Comparison
  key: { $in: ['a', 'b'] },
  count: { $gt: 100 },
  status: { $ne: 'deleted' },

  // Element
  email: { $exists: true },

  // Logical
  $or: [{ a: 1 }, { b: 2 }],

  // Regex
  name: { $regex: /^test/i },
} }
```

## 6. Multiple $match stages

Có thể dùng nhiều $match trong 1 pipeline:

```ts
await mongo.analysisEvents.aggregate([
  // $match 1: Filter trước group (dùng index)
  { $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } },

  // $group
  { $group: { _id: '$key', count: { $sum: 1 } } },

  // $match 2: Filter kết quả sau group (không dùng index)
  { $match: { count: { $gt: 100 } } },  // Chỉ lấy groups có count > 100
])
```

---

## Tóm tắt

- `$match` = `WHERE` trong SQL = `.filter()` trong JS
- Đặt **đầu pipeline** để sử dụng index
- Hỗ trợ tất cả operators: `$in`, `$gte`, `$lte`, `$ne`, `$exists`, `$or`, ...
- Có thể dynamic build match object dựa trên input

## Bài tập

1. Viết $match cho `analysisEvents`: key là 'page_view' hoặc 'click_stock', trong 7 ngày gần nhất
2. Viết dynamic match: nếu có `status` param thì filter, không thì lấy tất cả
3. Pipeline có 2 stages: `$group` rồi `$match`. Tại sao $match này không dùng index?
