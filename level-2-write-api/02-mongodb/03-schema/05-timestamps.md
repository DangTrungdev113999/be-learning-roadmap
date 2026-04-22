# Timestamps - Tự động theo dõi thời gian

## Mục tiêu

Hiểu cách Mongoose tự động tạo và cập nhật `createdAt`, `updatedAt`.

---

## 1. Bật timestamps

### Cách đơn giản nhất

```ts
// mongo/rooms.ts
const schema = new mongoose.Schema(
  {
    name: String,
    // ... các fields khác
  },
  {
    timestamps: true,    // Tự động thêm createdAt + updatedAt
  },
)
```

Mongoose tự động:

- **Khi create**: Gán `createdAt` = `updatedAt` = thời gian hiện tại
- **Khi update**: Cập nhật `updatedAt` = thời gian hiện tại, `createdAt` không đổi

### Tuỳ chỉnh tên field

```ts
// mongo/watchLists.ts - Đặt tên rõ ràng
const schema = new mongoose.Schema(
  {
    userId: { type: ObjectId, required: true },
    name: { type: String, required: true },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
)
```

Bạn có thể đổi tên:

```ts
// Ví dụ: dùng tên khác
{
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
}
```

### Chỉ dùng 1 trong 2

```ts
// mongo/analysisEvents.ts - Chỉ dùng updatedAt, createdAt tự quản lý
const schema = new mongoose.Schema(
  {
    createdAt: {
      type: Date,
      default: Date.now,    // Tự quản lý createdAt
    },
  },
  {
    timestamps: {
      createdAt: false,     // Không tự động tạo createdAt
      updatedAt: true,      // Vẫn tự động cập nhật updatedAt
    },
  },
)
```

## 2. Hoạt động thế nào?

```ts
// 1. Create - cả 2 đều được gán
const watchlist = await mongo.watchLists.create({
  userId: new ObjectId(userId),
  name: 'Cổ phiếu ngân hàng',
  symbols: [],
  point: 0,
})
console.log(watchlist.createdAt)  // 2024-01-12T10:30:00.000Z
console.log(watchlist.updatedAt)  // 2024-01-12T10:30:00.000Z

// 2. Update - chỉ updatedAt thay đổi
await mongo.watchLists.findOneAndUpdate(
  { _id: watchlist._id },
  { name: 'Ngân hàng Top' },
)
// createdAt vẫn = 2024-01-12T10:30:00.000Z
// updatedAt = 2024-01-12T15:45:00.000Z (thời gian update)
```

## 3. Quan trọng: Khi nào updatedAt KHÔNG cập nhật?

`updatedAt` **chỉ cập nhật** khi dùng các methods của Mongoose:

```ts
// CÓ cập nhật updatedAt
await mongo.watchLists.findOneAndUpdate(filter, update)
await mongo.watchLists.updateOne(filter, update)
await mongo.watchLists.updateMany(filter, update)
doc.name = 'new name'; await doc.save()

// KHÔNG cập nhật updatedAt (native MongoDB operations)
await mongo.watchLists.collection.updateOne(filter, update)  // Bypass Mongoose
```

## 4. Index trên timestamps

Timestamps thường được đánh index vì hay query theo thời gian:

```ts
// mongo/watchLists.ts
schema.index({ createdAt: 1 })
schema.index({ updatedAt: 1, isDeleted: 1 })

// mongo/analysisEvents.ts
schema.index({ createdAt: 1, key: 1 })
```

Dùng trong query:

```ts
// Tìm watchlists tạo trong 30 ngày gần nhất
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
await mongo.watchLists.find({
  createdAt: { $gte: thirtyDaysAgo },
})

// Tìm events theo khoảng thời gian
await mongo.analysisEvents.countDocuments({
  createdAt: { $gte: from, $lte: to },
  key: 'page_view',
})
```

## 5. versionKey (__v)

Ngoài timestamps, Mongoose còn tự thêm `__v` (version key):

```ts
// Document mới tạo
{ _id: ..., name: "VCB", __v: 0, createdAt: ..., updatedAt: ... }
```

Để tắt:

```ts
// mongo/analysisEvents.ts
const schema = new mongoose.Schema(
  { /* fields */ },
  {
    timestamps: { createdAt: false, updatedAt: true },
    versionKey: false,    // Không thêm __v
  },
)

// mongo/followerships.ts
const schema = new mongoose.Schema(
  { /* fields */ },
  {
    timestamps: true,
    versionKey: false,
  },
)
```

## 6. So sánh với FE

| FE (React state) | BE (Mongoose timestamps) |
|---|---|
| Không tự tracking | Tự động tracking |
| Cần `useState(new Date())` | `timestamps: true` là xong |
| Quên update = bug | Mongoose lo hết |

---

## Tóm tắt

| Option | Kết quả |
|---|---|
| `timestamps: true` | Tự thêm `createdAt` + `updatedAt` |
| `timestamps: { createdAt: 'created_at' }` | Đổi tên field |
| `timestamps: { createdAt: false }` | Chỉ dùng `updatedAt` |
| `versionKey: false` | Bỏ field `__v` |

## Bài tập

1. Tạo schema `comments` với timestamps. Create 1 document, update nó, so sánh `createdAt` vs `updatedAt`
2. Tạo schema `logs` chỉ cần `createdAt`, không cần `updatedAt` (log chỉ ghi, không sửa)
3. Query tất cả documents tạo trong hôm nay (dùng `createdAt` + `$gte`)
