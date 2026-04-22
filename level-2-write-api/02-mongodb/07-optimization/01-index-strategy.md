# Index Strategy - Chiến lược đánh Index

## Mục tiêu

Hiểu cách thiết kế compound index hiệu quả, quy tắc ESR.

---

## 1. Single vs Compound Index

### Single field index

```ts
// mongo/watchLists.ts
userId: { type: ObjectId, required: true, index: true }
isDeleted: { type: Boolean, index: true }
```

Mỗi index chỉ phục vụ **1 field**. Nếu query 2 fields, MongoDB dùng 1 index rồi scan phần còn lại.

### Compound index

```ts
// mongo/watchLists.ts
schema.index({ userId: 1, isDeleted: 1 })   // 1 index phục vụ 2 fields
```

**1 compound index phục vụ query tốt hơn 2 single indexes**.

## 2. Quy tắc ESR (Equality - Sort - Range)

Thứ tự fields trong compound index ảnh hưởng performance:

```
E - Equality:  Fields so sánh bằng (=, $in)     → Đặt TRƯỚC
S - Sort:      Fields dùng trong .sort()          → Đặt GIỮA
R - Range:     Fields so sánh khoảng ($gte, $lte) → Đặt SAU
```

### Ví dụ: Query từ analyticsService

```ts
// Query
await mongo.analysisEvents.countDocuments({
  key: 'page_view',                       // Equality (E)
  createdAt: { $gte: from, $lte: to },    // Range (R)
})

// Index tốt (theo ESR)
schema.index({ key: 1, createdAt: 1 })    // E trước R ✓
```

Nếu ngược lại:

```ts
// Index kém
schema.index({ createdAt: 1, key: 1 })    // R trước E ✗
// MongoDB dùng index scan createdAt range, rồi filter key → chậm hơn
```

### Ví dụ: Query có sort

```ts
// Query
await mongo.watchLists
  .find({ userId: new ObjectId(userId), isDeleted: { $ne: true } })
  .sort({ point: -1 })

// Index lý tưởng (ESR): userId (E) → point (S) → isDeleted (R)
schema.index({ userId: 1, point: -1, isDeleted: 1 })
```

## 3. Compound Index trong logics

### watchLists

```ts
schema.index({ createdAt: 1 })
schema.index({ updatedAt: 1, isDeleted: 1 })
schema.index({ userId: 1, isDeleted: 1 })       // Phục vụ query phổ biến nhất
schema.index({ _id: 1, isDeleted: 1 })
```

Query sử dụng:

```ts
// Dùng index { userId: 1, isDeleted: 1 }
mongo.watchLists.find({
  userId: new ObjectId(userId),    // userId = Equality
  isDeleted: { $ne: true },        // isDeleted = Range (vì $ne)
})
```

### analysisEvents

```ts
schema.index({ key: 1, uid: 1, createdAt: 1 })   // E, E, R
schema.index({ createdAt: 1, key: 1 })             // R, E (cho query khác)
```

### followerships

```ts
schema.index({ followedUserId: 1, followerUserId: 1 }, { unique: true })
```

## 4. Prefix Rule - Index dùng được cho prefix

```ts
// Compound index
schema.index({ userId: 1, isDeleted: 1, createdAt: 1 })

// Index này phục vụ các query sau:
{ userId: 1 }                                    // ✓ prefix
{ userId: 1, isDeleted: 1 }                      // ✓ prefix
{ userId: 1, isDeleted: 1, createdAt: 1 }        // ✓ full match

// KHÔNG phục vụ:
{ isDeleted: 1 }                                  // ✗ không có userId (field đầu)
{ isDeleted: 1, createdAt: 1 }                    // ✗ skip userId
{ createdAt: 1 }                                  // ✗ skip userId và isDeleted
```

> **Quy tắc Prefix**: Compound index chỉ sử dụng được khi query bắt đầu từ **field đầu tiên** (leftmost prefix).

## 5. Bao nhiêu index là đủ?

```ts
// watchLists - 5 indexes cho 7 fields
schema.index({ createdAt: 1 })
schema.index({ updatedAt: 1, isDeleted: 1 })
schema.index({ userId: 1, isDeleted: 1 })
schema.index({ _id: 1, isDeleted: 1 })
// + _id (tự động) + userId (inline) + isDeleted (inline)
```

### Chi phí:

- Mỗi index tốn **RAM** (~10-30% so với data)
- Mỗi write (insert/update/delete) phải **cập nhật tất cả indexes**
- Nhiều index = write chậm hơn

### Quy tắc:

- Chỉ tạo index cho queries bạn **thực sự chạy**
- Xoá index không dùng
- 1 compound index tốt hơn nhiều single indexes

## 6. Covered Query - Query chỉ cần index

```ts
// Nếu tất cả fields trong query + projection đều nằm trong index
// MongoDB KHÔNG cần đọc document → siêu nhanh

// Index: { userId: 1, isDeleted: 1 }
// Covered query (chỉ cần index, không đọc document):
await mongo.watchLists.find(
  { userId: new ObjectId(userId) },
  { _id: 0, userId: 1 },    // Projection chỉ có fields trong index
)
```

---

## Tóm tắt

| Quy tắc | Giải thích |
|---|---|
| ESR | Equality → Sort → Range |
| Prefix | Compound index dùng từ field đầu tiên |
| Ít nhưng đúng | Ít index tốt hơn nhiều index sai |
| Covered query | Tất cả fields trong index = siêu nhanh |

## Bài tập

1. Query: `find({ status: 'completed', createdAt: { $gte: from } }).sort({ amount: -1 })`. Viết compound index theo ESR
2. Index `{ a: 1, b: 1, c: 1 }` có phục vụ query `{ b: 1, c: 1 }` không? Tại sao?
3. Collection có 10 indexes nhưng chỉ 3 cái được dùng. Nên làm gì?
