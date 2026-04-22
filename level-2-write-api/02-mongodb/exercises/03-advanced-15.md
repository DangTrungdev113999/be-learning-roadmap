# Bài tập nâng cao - Aggregation & Index (15 bài)

## Hướng dẫn

- Tập trung aggregation pipeline và index strategy
- Tham khảo code thật từ analyticsService

---

## Aggregation Pipeline

### Bài 1: Đếm events theo key

Viết pipeline đếm số `analysisEvents` theo từng `key`:

```ts
// Input: from, to (khoảng thời gian)
// Output: [{ key: 'page_view', count: 5234 }, { key: 'click_stock', count: 1876 }]
// Stages: $match → $group → $sort
```

### Bài 2: Đếm theo ngày

Mở rộng Bài 1: đếm events theo key VÀ theo ngày:

```ts
// Output: [{ key: 'page_view', date: '2024-01-15', count: 5234 }]
// Dùng $dateToString trong $group._id
```

### Bài 3: Top N Content

Viết pipeline lấy top 10 cổ phiếu được xem nhiều nhất:

```ts
// $match: key = 'view_stock', createdAt trong range
// $group: _id = '$val.symbol', count = $sum: 1
// $sort: count -1
// $limit: 10
```

### Bài 4: $addFields + $cond

Viết pipeline thêm field `isPremium` cho users:

```ts
// isPremium = true nếu plan.level IN ['pro', 'vip'], false nếu không
// Dùng $addFields + $cond + $in
```

### Bài 5: $unwind

Đếm mỗi symbol xuất hiện trong bao nhiêu watchlists:

```ts
// $match: isDeleted != true
// $unwind: '$symbols'
// $group: _id = '$symbols', watchlistCount = $sum: 1
// $sort: watchlistCount -1
// $limit: 20
```

### Bài 6: $lookup

Lấy rooms kèm danh sách members (tối đa 5):

```ts
// $lookup: from roomMembers, localField _id, foreignField room._id
// Dùng pipeline trong $lookup để limit 5
```

### Bài 7: $facet

Viết 1 pipeline trả về cùng lúc:
- `data`: 20 rooms phân trang
- `total`: tổng số rooms
- `stats`: average numberOfMember

```ts
// $facet cho 3 nhánh xử lý song song
```

### Bài 8: Đếm có điều kiện

Viết pipeline đếm active users, phân biệt mobile vs web:

```ts
// Tham khảo getActiveUsers.ts
// $addFields: _mobInRange, _webInRange
// $group: { $sum: { $cond: ['$_mobInRange', 1, 0] } }
```

### Bài 9: Overview Dashboard

Viết function trả về tổng quan:
- Tổng events
- Tổng active users
- Tổng new users
- Top 10 event keys

```ts
// Kết hợp countDocuments (song song) + 1 aggregation
// Tham khảo getOverview.ts
```

### Bài 10: Dynamic Pipeline

Viết function tạo aggregation pipeline động dựa trên input:

```ts
// Input: { platform?: 'mobile' | 'web', from, to, groupBy }
// Nếu platform = 'mobile' → match mob
// Nếu platform = 'web' → match web
// Nếu không có → match $or
// Tham khảo getActiveUsers.ts
```

## Index Strategy

### Bài 11: Thiết kế Compound Index

Cho query:

```ts
mongo.orders.find({
  status: 'completed',
  'user._id': userId,
  createdAt: { $gte: from },
}).sort({ createdAt: -1 })
```

Viết compound index tối ưu theo quy tắc ESR.

### Bài 12: Phân tích .explain()

Chạy `.explain('executionStats')` cho query:

```ts
mongo.watchLists.find({ userId: new ObjectId(userId) }).sort({ point: -1 })
```

Trả lời:
- Stage nào? (IXSCAN hay COLLSCAN?)
- Bao nhiêu documents examined?
- Thời gian bao lâu?
- Cần cải thiện gì?

### Bài 13: TTL Index

Thiết kế schema `sessions` tự xoá sau 24 giờ:

```ts
// Schema: userId, token, deviceInfo, createdAt
// TTL index trên createdAt
// Compound index cho query: { userId: 1, token: 1 }
```

### Bài 14: Unique Compound Index

Thiết kế schema `likes` đảm bảo 1 user chỉ like 1 post 1 lần:

```ts
// Fields: userId, postId, createdAt
// Unique compound index: { userId: 1, postId: 1 }
// Xử lý duplicate key error
```

### Bài 15: Performance Audit

Collection `analysisEvents` có 100M+ documents. Audit indexes hiện tại:

```ts
schema.index({ key: 1, uid: 1, createdAt: 1 })
schema.index({ createdAt: 1, key: 1 })
```

Trả lời:
- Mỗi index phục vụ query nào?
- Query nào KHÔNG có index phù hợp?
- Đề xuất cải thiện

---

## Đáp án mẫu (Bài 2)

```ts
async function getEventCountsByDay(from: Date, to: Date, keys: string[]) {
  return mongo.analysisEvents
    .aggregate([
      {
        $match: {
          key: { $in: keys },
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            key: '$key',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1, '_id.key': 1 } },
      {
        $project: {
          _id: 0,
          key: '$_id.key',
          date: '$_id.date',
          count: 1,
        },
      },
    ])
    .allowDiskUse(true)
}
```

## Tiêu chí đánh giá

- [ ] Pipeline stages đúng thứ tự ($match đầu tiên)
- [ ] $group _id đúng
- [ ] allowDiskUse cho data lớn
- [ ] Index theo quy tắc ESR
- [ ] Explain phân tích đúng
