# Bài tập trung bình - Query phức tạp (15 bài)

## Hướng dẫn

- Dùng operators, pagination, projection, soft delete
- Tham khảo code thật từ logics project

---

## Bài 1: Soft Delete

Viết function soft delete watchlist:
- `updateOne({ isDeleted: true })` thay vì `deleteOne`
- Viết query lấy watchlists chưa bị soft delete

## Bài 2: Pagination

Viết function phân trang cho rooms:

```ts
// Input: page, pageSize
// Output: { data: Room[], pagination: { page, pageSize, total, totalPages } }
// Dùng Promise.all cho find + countDocuments
```

## Bài 3: Tìm kiếm với $regex

Tìm users có `fullName` chứa keyword (case insensitive):

```ts
// Input: keyword = 'trung'
// Match: "Trung Đào", "Nguyễn Trung", "TRUNG"
```

## Bài 4: $or Query

Tìm users active trên mobile HOẶC web trong 7 ngày gần nhất:

```ts
// Gợi ý: $or + $gte trên lastLoggedIn
```

## Bài 5: Nested Field Query

Tìm users có `plan.level` là 'pro' hoặc 'vip' VÀ plan chưa hết hạn:

```ts
// Filter: plan.level IN ['pro', 'vip'] AND plan.expiredDate >= now
```

## Bài 6: $exists Query

Tìm users CÓ field `expertId` (là expert):

```ts
// Filter: expertId exists AND expertId != null
```

## Bài 7: updateMany

Reset trialCount về 0 cho tất cả users có trialCount > 5:

```ts
// Filter: { trialCount: { $gt: 5 } }
// Update: { $set: { trialCount: 0 } }
```

## Bài 8: insertMany

Tạo 10 notifications cho 1 user:

```ts
// Dùng insertMany
// Mỗi notification có: userId, title, content, category
```

## Bài 9: Sorting phức tạp

Lấy rooms sắp xếp theo:
1. `numberOfMember` giảm dần (phổ biến nhất trước)
2. Nếu bằng nhau, `createdAt` giảm dần (mới nhất trước)

```ts
// .sort({ numberOfMember: -1, createdAt: -1 })
```

## Bài 10: Compound Query

Tìm orders thoả tất cả điều kiện:
- `status` = 'completed'
- `payment.method` = 'transfer'
- `plan.price` >= 200000
- Tạo trong 30 ngày gần nhất

## Bài 11: Cursor-based Pagination

Viết function pagination dùng cursor (lastId) thay vì skip:

```ts
// Input: lastId (optional), pageSize
// Nếu có lastId: find({ _id: { $lt: lastId } }).sort({ _id: -1 }).limit(pageSize)
// Nếu không: find({}).sort({ _id: -1 }).limit(pageSize)
```

## Bài 12: Select/Exclude

Viết query lấy user profile LOẠI TRỪ:
- `password`
- `key`
- `metaData`
- `tradingOtp`

```ts
// Dùng .select('-password -key -metaData -tradingOtp')
```

## Bài 13: Array Field Query

Tìm users có role 'admin' trong array `roles`:

```ts
// MongoDB tự động tìm trong array
// Filter: { roles: 'admin' }
```

## Bài 14: countDocuments với filter

Đếm số rooms thoả:
- `isDeleted` != true
- `isPrivate` != true
- `numberOfMember` > 0

## Bài 15: findOneAndUpdate với $set nested

Cập nhật `plan.level` và `plan.expiredDate` cho user:

```ts
// Dùng $set với dot notation
// { $set: { 'plan.level': 'pro', 'plan.expiredDate': new Date(...) } }
// Options: { new: true }
```

---

## Đáp án mẫu (Bài 2)

```ts
async function getRooms(page: number, pageSize: number) {
  const query = { isDeleted: { $ne: true } }

  const [data, total] = await Promise.all([
    mongo.rooms
      .find(query)
      .sort({ numberOfMember: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select({ name: 1, owner: 1, numberOfMember: 1 })
      .lean(),
    mongo.rooms.countDocuments(query),
  ])

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}
```

## Tiêu chí đánh giá

- [ ] Query sử dụng operators đúng
- [ ] Pagination có cả data + total
- [ ] Projection hợp lý
- [ ] Dùng .lean() cho read-only
- [ ] ObjectId conversion khi cần
