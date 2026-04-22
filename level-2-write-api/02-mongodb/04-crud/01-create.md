# Create - Tạo Document

## Mục tiêu

Học cách tạo documents trong MongoDB: `create`, `insertMany`, và xử lý lỗi.

---

## 1. create() - Tạo 1 document

### Code thật từ WatchListsController

```ts
// app/Controllers/Http/WatchListsController.ts
const document = await mongo.watchLists.create({
  userId: new ObjectId(userId),
  name: name,
  symbols: [],
  symbolsV2: [],
  point: last ? last.point + 1 : 0,
})

// document trả về có đầy đủ fields + _id + timestamps
return {
  data: {
    _id: document._id,
    userId: document.userId,
    name: document.name,
    symbols: document.symbols,
    symbolsV2: document.symbolsV2,
    point: document.point,
  },
}
```

### Phân tích

```ts
// create() nhận 1 object chứa data
const doc = await mongo.watchLists.create({
  userId: new ObjectId(userId),    // ObjectId reference
  name: 'Cổ phiếu ngân hàng',     // String, required
  symbols: [],                      // Array rỗng
  symbolsV2: [],                    // Array rỗng
  point: 0,                         // Number, required
  // createdAt, updatedAt → tự động (timestamps: true)
  // _id → tự động (MongoDB tự sinh)
})

console.log(doc._id)        // ObjectId mới
console.log(doc.createdAt)  // Date hiện tại
```

### Validation khi create

```ts
// Thiếu field required → ValidationError
await mongo.watchLists.create({
  userId: new ObjectId(userId),
  // thiếu name (required) → ERROR
  // thiếu point (required) → ERROR
})
// MongooseError: watchLists validation failed: name: Path `name` is required
```

## 2. insertMany() - Tạo nhiều documents cùng lúc

### Code thật từ analysisService

```ts
// app/Services/analysisService/libs/insertEvent.ts
const buffers = insertPools.concat()
insertPools.length = 0

await mongo.analysisEvents.insertMany(buffers, { ordered: false })
```

### Giải thích

```ts
// insertMany nhận array of objects
await mongo.analysisEvents.insertMany([
  { uid: 'user1', key: 'page_view', src: 'mobile', createdAt: new Date() },
  { uid: 'user2', key: 'click_stock', src: 'web', createdAt: new Date() },
  { uid: 'user3', key: 'page_view', src: 'mobile', createdAt: new Date() },
], { ordered: false })  // ordered: false → tiếp tục insert dù 1 doc lỗi
```

### ordered: true vs false

```ts
// ordered: true (default) - Dừng ngay khi gặp lỗi
await model.insertMany([doc1, doc2_ERROR, doc3])
// Kết quả: doc1 inserted, doc2 lỗi → doc3 KHÔNG được insert

// ordered: false - Bỏ qua lỗi, tiếp tục insert
await model.insertMany([doc1, doc2_ERROR, doc3], { ordered: false })
// Kết quả: doc1 inserted, doc2 lỗi (bỏ qua), doc3 inserted
```

> **Performance**: `insertMany` nhanh hơn nhiều so với gọi `create` trong loop vì chỉ 1 round-trip tới DB.

## 3. Pattern: Kiểm tra trước khi tạo

Code thật từ WatchListsController - kiểm tra user tồn tại:

```ts
// Bước 1: Kiểm tra user tồn tại
const exists = await mongo.users.findById(userId, { _id: 1 })
if (!exists) {
  return { error: { code: responseCodes.PERMISSION_DENIED } }
}

// Bước 2: Kiểm tra input
if (!name) {
  return { error: { code: responseCodes.INVALID_PARAM } }
}

// Bước 3: Tính point cho watchlist mới
const last = await mongo.watchLists
  .findOne({ userId: new ObjectId(userId) })
  .sort({ point: -1 })

// Bước 4: Tạo document
const document = await mongo.watchLists.create({
  userId: new ObjectId(userId),
  name: name,
  symbols: [],
  symbolsV2: [],
  point: last ? last.point + 1 : 0,
})
```

## 4. Batching với insertMany

Code thật - buffer events rồi insert theo batch:

```ts
// app/Services/analysisService/libs/insertEvent.ts
const insertPools: InsertEventInput[] = []

export const insertEvent = (events: InsertEventInput[]): void => {
  insertPools.push(...events)

  if (insertPools.length > 2000) {
    // Buffer quá 2000 → insert ngay
    insert()
  } else {
    // Buffer nhỏ → chờ 5-7 giây rồi insert (throttle)
    insertThrottle()
  }
}
```

> **Tại sao batch?** Thay vì insert 2000 lần (2000 round-trips), insert 1 lần (1 round-trip). Nhanh hơn 100x.

## 5. Giá trị trả về

```ts
// create() trả về document đầy đủ
const doc = await mongo.watchLists.create({ ... })
doc._id         // ObjectId - ID mới
doc.createdAt   // Date - thời gian tạo
doc.updatedAt   // Date - thời gian tạo (giống createdAt lúc đầu)

// insertMany() trả về array of documents
const docs = await mongo.analysisEvents.insertMany([...])
docs.length     // Số documents đã insert
docs[0]._id     // ID của document đầu tiên
```

---

## Tóm tắt

| Method | Dùng khi | Ví dụ |
|---|---|---|
| `create(obj)` | Tạo 1 document | Tạo watchlist mới |
| `insertMany(arr)` | Tạo nhiều documents | Batch insert analysis events |
| `insertMany(arr, { ordered: false })` | Insert nhiều, bỏ qua lỗi | Events logging |

## Bài tập

1. Viết code tạo 1 watchlist: kiểm tra user, validate name, tính point, create
2. Dùng `insertMany` tạo 5 notifications cho 1 user
3. Thử `insertMany` với `ordered: true` và `false` khi 1 document bị duplicate key
