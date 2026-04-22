# .lean() - Tối ưu performance

## Mục tiêu

Hiểu `.lean()` là gì, tại sao cần, và khi nào dùng.

---

## 1. Mongoose Document vs Plain Object

Khi query bằng Mongoose, kết quả **không phải** plain JavaScript object:

```ts
// Không có .lean() → trả về Mongoose Document
const room = await mongo.rooms.findById(roomId)

// room là Mongoose Document, có:
// - Tất cả fields data
// - Methods: save(), toJSON(), toObject(), populate(), ...
// - Getters/Setters
// - Change tracking (biết fields nào đã thay đổi)
// - Prototype chain phức tạp
```

```ts
// Có .lean() → trả về plain JavaScript object
const room = await mongo.rooms.findById(roomId).lean()

// room là plain object, CHỈ có data
// - KHÔNG có methods (save, populate, ...)
// - KHÔNG có change tracking
// - Nhẹ hơn, nhanh hơn
```

## 2. Code thật từ RoomsController

```ts
// RoomsController.ts - dùng .lean() cho API response
const expert = await mongo.experts
  .findOne({ userId: maker._id })
  .lean()

// Pagination với .lean()
const [data, total] = await Promise.all([
  mongo.paymentRequests
    .find(query)
    .sort({ _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .select(select)
    .lean(),                              // Plain objects cho API response
  mongo.paymentRequests.countDocuments(query),
])
```

## 3. Tại sao .lean() nhanh hơn?

### Không có .lean()

```
MongoDB → BSON → Mongoose tạo Document instances
                 → Wrap với getters/setters
                 → Attach methods (save, validate, ...)
                 → Setup change tracking
                 → Tốn memory + CPU
```

### Có .lean()

```
MongoDB → BSON → Plain JavaScript objects
                 → Xong!
                 → Nhẹ, nhanh
```

> **Benchmark**: `.lean()` nhanh hơn **2-5x** so với không dùng, đặc biệt khi query nhiều documents.

## 4. Khi nào dùng .lean()?

### Nên dùng .lean()

```ts
// 1. API response - chỉ cần đọc data, không cần modify
const data = await mongo.rooms.find(query).lean()
return { data }

// 2. Pagination - trả về list
const items = await mongo.paymentRequests
  .find(query)
  .skip((page - 1) * pageSize)
  .limit(pageSize)
  .lean()

// 3. Aggregation result (đã là plain objects)
// Không cần .lean() vì aggregate luôn trả về plain objects
```

### Không nên dùng .lean()

```ts
// 1. Cần modify rồi save
const doc = await mongo.watchLists.findOne({ _id })
doc.name = 'Tên mới'
await doc.save()     // CẦN Mongoose Document, không dùng .lean()

// 2. Cần dùng methods
const user = await mongo.users.findById(userId)
user.toJSON()        // Cần Mongoose method
```

## 5. Gotcha: .lean() thay đổi behavior

```ts
// Không có .lean() - ObjectId là object
const doc = await mongo.watchLists.findOne({ _id })
typeof doc._id          // 'object' (ObjectId instance)
doc._id.toString()      // '65a1b2c3...'

// Có .lean() - ObjectId vẫn là object nhưng khác
const doc = await mongo.watchLists.findOne({ _id }).lean()
typeof doc._id          // 'object' (vẫn ObjectId, nhưng behavior khác)
```

```ts
// Không có .lean() - virtuals hoạt động
// Có .lean() - virtuals KHÔNG hoạt động (vì không có Mongoose wrapper)
```

## 6. Pattern kết hợp

```ts
// Pattern phổ biến nhất trong logics: find + sort + pagination + lean
const [data, total] = await Promise.all([
  mongo.roomMembers
    .find(query)
    .sort(sort)
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .select(select)
    .lean(),                    // Luôn .lean() cho pagination response
  mongo.roomMembers.countDocuments(query),
])
```

---

## Tóm tắt

| | Không .lean() | Có .lean() |
|---|---|---|
| Kiểu trả về | Mongoose Document | Plain JS Object |
| Methods (save, ...) | Có | Không |
| Change tracking | Có | Không |
| Performance | Chậm hơn | Nhanh 2-5x |
| Memory | Nhiều hơn | Ít hơn |
| Dùng khi | Cần modify + save | API response, đọc data |

## Bài tập

1. Viết query lấy 10 rooms mới nhất, dùng `.lean()`, so sánh kết quả khi không dùng
2. Tại sao aggregation không cần `.lean()`?
3. Viết code: findOne → modify → save. Giải thích tại sao KHÔNG dùng `.lean()` ở đây
