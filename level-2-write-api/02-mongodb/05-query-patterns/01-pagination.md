# Pagination - Phân trang

## Mục tiêu

Học pattern phân trang phổ biến: skip/limit và cách tính page/pageSize.

---

## 1. Tại sao cần phân trang?

- Collection `analysisEvents` có **100M+ documents**
- Không thể trả về tất cả trong 1 API call
- Client hiển thị 20 items/trang, cần biết tổng để hiện số trang

## 2. Pattern cơ bản: skip + limit

```ts
// skip(N) = bỏ qua N documents đầu tiên
// limit(N) = chỉ lấy N documents

// Trang 1: skip(0).limit(20) → lấy doc 1-20
// Trang 2: skip(20).limit(20) → lấy doc 21-40
// Trang 3: skip(40).limit(20) → lấy doc 41-60
```

### Công thức

```ts
const skip = (page - 1) * pageSize
```

## 3. Code thật từ RoomsController

```ts
// RoomsController.ts - Lấy payment requests có phân trang
const page = util.gp('page', 1, 'number')
const pageSize = util.gp('pageSize', 20, 'number')

const [data, total] = await Promise.all([
  mongo.paymentRequests
    .find(query)
    .sort({ _id: -1 })                    // Mới nhất trước
    .skip((page - 1) * pageSize)           // Bỏ qua
    .limit(pageSize)                        // Giới hạn
    .select(select)
    .lean(),
  mongo.paymentRequests.countDocuments(query),  // Đếm tổng
])
```

### Phân trang room members

```ts
// RoomsController.ts
const [data, total] = await Promise.all([
  mongo.roomMembers
    .find(query)
    .sort(sort)
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .select(select)
    .lean(),
  mongo.roomMembers.countDocuments(query),
])
```

## 4. Pattern: Promise.all cho data + count

```ts
// Chạy song song 2 queries (nhanh hơn chạy tuần tự)
const [data, total] = await Promise.all([
  mongo.paymentRequests
    .find(query)
    .sort({ _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean(),

  mongo.paymentRequests.countDocuments(query),
])

// Trả về cho client
return {
  data,
  pagination: {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  },
}
```

## 5. Response format

```json
{
  "data": [
    { "_id": "...", "name": "Room 1" },
    { "_id": "...", "name": "Room 2" }
  ],
  "pagination": {
    "page": 2,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

FE dùng `totalPages` để hiển thị pagination component.

## 6. Vấn đề với skip ở trang sâu

```ts
// Trang 1: skip(0) → nhanh
// Trang 100: skip(1980) → chậm (MongoDB phải đọc 1980 docs rồi bỏ)
// Trang 10000: skip(199980) → rất chậm
```

> **skip lớn = chậm** vì MongoDB vẫn phải quét qua tất cả documents bị skip.

### Giải pháp: Cursor-based pagination

```ts
// Thay vì skip, dùng _id làm cursor
const lastId = '65a1b2c3d4e5f6a7b8c9d0e1'  // _id cuối cùng trang trước

const data = await mongo.notifications
  .find({
    userId,
    _id: { $lt: new ObjectId(lastId) },     // Lấy docs có _id < lastId
  })
  .sort({ _id: -1 })
  .limit(pageSize)
```

> Cursor-based pagination nhanh hơn skip ở mọi trang, nhưng không tính được `totalPages`.

## 7. Validate input

```ts
// Luôn validate page và pageSize
const page = Math.max(1, util.gp('page', 1, 'number'))
const pageSize = Math.min(100, Math.max(1, util.gp('pageSize', 20, 'number')))

// pageSize quá lớn = nguy hiểm (client request 1 triệu items)
```

---

## Tóm tắt

| Pattern | Ưu điểm | Nhược điểm | Dùng khi |
|---|---|---|---|
| skip/limit | Đơn giản, có totalPages | Chậm ở trang sâu | Admin panel, ít data |
| Cursor-based | Nhanh mọi trang | Không có totalPages | Feed, timeline, nhiều data |

## Bài tập

1. Viết pagination cho `watchLists`: page 1, pageSize 10, sort theo point giảm dần
2. Tính: collection có 237 documents, pageSize = 20 → bao nhiêu trang?
3. Viết cursor-based pagination cho `notifications` (sort _id giảm dần)
