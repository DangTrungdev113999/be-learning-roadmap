# Index Strategy Nâng Cao -- Ngoài ESR còn gì?

## Mục tiêu

Nắm 4 loại index nâng cao trong MongoDB: Covering, Partial, TTL, Wildcard. Recap ESR với ví dụ phức tạp hơn từ Finpath.

---

## 0. ESR Recap nhanh

> Level 2 đã học ESR cơ bản. Ở đây recap lại và đi sâu hơn.

```
E - Equality:  So sánh bằng (=, $in)     → Đặt ĐẦU TIÊN
S - Sort:      Dùng trong .sort()          → Đặt GIỮA
R - Range:     Khoảng ($gte, $lte, $ne)    → Đặt CUỐI
```

### Ví dụ phức tạp: analysisEvents (100M+ rows)

```ts
// mongo/analysisEvents.ts -- collection 100 triệu+ documents
schema.index({ key: 1, uid: 1, createdAt: 1 })
//              E        E        R

// Query: Đếm page views của 1 user trong 60 ngày gần nhất
await mongo.analysisEvents.countDocuments({
  key: 'page_view',                         // E (Equality)
  uid: userId,                               // E (Equality)
  createdAt: { $gte: from, $lte: to },       // R (Range)
})
```

**Tại sao giới hạn 60 ngày?** Collection 100M+ rows. Query range quá rộng (365 ngày) sẽ scan quá nhiều index entries, ngay cả khi có index. Finpath giới hạn `MAX_DATE_RANGE_DAYS = 60` để kiểm soát.

### Khi có Sort

```ts
// Query posts mới nhất của 1 category
await mongo.posts
  .find({
    templateType: 'analysis',              // E
    category: 'stock',                     // E
  })
  .sort({ createdAt: -1 })                // S

// Index tốt nhất (ESR):
schema.index({ templateType: 1, category: 1, createdAt: -1 })
//                E                E              S
```

```ts
// posts.ts thực tế có:
schema.index({ createdAt: 1, templateType: 1, category: 1 })
// R trước E -- không optimal! Nhưng vẫn dùng được vì phục vụ nhiều query patterns khác
```

> **Bài học:** Trong thực tế, 1 index phải phục vụ nhiều queries. Đôi khi trade-off giữa optimal cho 1 query vs phục vụ được nhiều queries.

---

## 1. Covering Index -- Query không cần đọc document

### Khái niệm

Bình thường MongoDB: tìm index -> lấy _id -> đọc document từ disk.

**Covering index:** Tất cả fields trong query + projection đều **nằm trong index**. MongoDB trả kết quả **chỉ từ index**, không cần đọc document. Nhanh hơn rất nhiều.

```
Query bình thường:  Index B-Tree → Document (disk I/O)
Covering query:     Index B-Tree → Trả kết quả (không đọc disk)
```

### Ví dụ

```ts
// Index: { userId: 1, isDeleted: 1 }

// ✅ Covered -- tất cả fields trong index
await mongo.watchLists.countDocuments({
  userId: new ObjectId(userId),
  isDeleted: { $ne: true },
})
// countDocuments chỉ cần đếm, không cần document data

// ✅ Covered -- projection chỉ có index fields
await mongo.watchLists.find(
  { userId: new ObjectId(userId) },
  { _id: 0, userId: 1, isDeleted: 1 },  // Chỉ fields trong index
)

// ❌ Không covered -- cần "name" nhưng name không trong index
await mongo.watchLists.find(
  { userId: new ObjectId(userId) },
  { name: 1 },
)
```

### Kiểm tra bằng explain

```ts
const explain = await mongo.watchLists
  .find({ userId: new ObjectId(userId) }, { _id: 0, userId: 1 })
  .explain('executionStats')

// Nếu covered: totalDocsExamined = 0
// explain.executionStats.totalDocsExamined → 0 (không đọc document nào!)
```

### So sánh FE

```typescript
// FE: Memoized selector -- chỉ tính từ data đã có, không fetch thêm
const selectUserNames = createSelector(
  (state) => state.users,
  (users) => Object.values(users).map((u) => u.name),
)
// Không cần gọi API nếu data đã trong store

// BE: Covering index -- chỉ đọc index, không đọc document
```

### Khi nào dùng

- Queries chạy rất thường xuyên (hot path)
- Chỉ cần vài fields (count, exists, specific fields)
- Collection lớn mà document size lớn (tránh đọc document nặng)

---

## 2. Partial Index -- Index chỉ một phần documents

### Khái niệm

Index bình thường index **tất cả** documents. Partial index chỉ index documents **thỏa điều kiện**. Index nhỏ hơn = nhanh hơn + tốn ít RAM hơn.

### Ví dụ: users.identity (Sparse Index)

```ts
// mongo/users.ts
identity: {
  type: String,
  index: {
    sparse: true,    // Sparse = partial index đơn giản nhất
    unique: true,     // Chỉ index documents CÓ identity
  },
}
```

**Sparse index** = partial index cho điều kiện "field exists". Documents không có `identity` sẽ **không có trong index**.

**Tại sao cần sparse?**
- Nhiều users đăng ký qua Google/Facebook, chưa có `identity` (username)
- Nếu unique index bình thường: tất cả users chưa có identity = `null`, mà `null` chỉ được 1 cái → lỗi duplicate
- Sparse unique: bỏ qua documents không có field → không conflict

### Partial Index nâng cao

```ts
// Chỉ index documents chưa xóa
schema.index(
  { userId: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: { $ne: true } } },
)

// Index chỉ chứa documents active → nhỏ hơn nhiều
// Query PHẢI có cùng filter condition để dùng partial index:
// ✅ Dùng partial index
await mongo.watchLists.find({ userId, isDeleted: { $ne: true } })
// ❌ KHÔNG dùng partial index (thiếu isDeleted condition)
await mongo.watchLists.find({ userId })
```

### Lợi ích cụ thể

| Metric | Full Index | Partial Index (50% deleted) |
|---|---|---|
| Kích thước | 100MB | 50MB |
| RAM sử dụng | 100MB | 50MB |
| Insert speed | Mỗi insert update index | Chỉ update nếu thỏa condition |
| Scan speed | Scan tất cả | Scan ít hơn |

### Khi nào dùng

- Collection có nhiều documents "inactive" (soft deleted, archived)
- Query luôn filter cùng 1 condition (`isDeleted: false`, `status: 'active'`)
- Collection lớn, muốn giảm index size

---

## 3. TTL Index -- Tự xóa documents hết hạn

### Khái niệm

TTL (Time To Live) index tự động xóa documents sau một khoảng thời gian. MongoDB chạy background task mỗi 60 giây để xóa expired documents.

### Ví dụ thực tế: notifications trong Finpath

```ts
// mongo/notifications.ts
schema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 7 },  // 7 ngày
)
```

Notifications tự động bị xóa sau 7 ngày. Không cần cronjob, không cần code cleanup.

### Cách hoạt động

```
Document created: 2026-03-18T10:00:00
TTL: 7 days (604800 seconds)
Expire at: 2026-03-25T10:00:00

MongoDB background thread (mỗi 60s):
  - Tìm documents có createdAt + 604800s < now
  - Xóa chúng
```

### Cú pháp

```ts
// Cách 1: Hết hạn sau N giây kể từ field value
schema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 }) // 1 ngày

// Cách 2: Hết hạn tại thời điểm chính xác
// (set expireAfterSeconds = 0, field value = thời điểm expire)
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 })
// Document: { expireAt: ISODate('2026-03-25T10:00:00') }
```

### Use cases phổ biến

| Use case | TTL | Field |
|---|---|---|
| Notifications | 7 ngày | createdAt |
| Sessions | 30 phút | lastAccess |
| OTP codes | 5 phút | createdAt |
| Temp uploads | 24 giờ | createdAt |
| Device logs | 30 ngày | createdAt |

### So sánh FE

```typescript
// FE: Session timeout
setTimeout(() => {
  localStorage.removeItem('token')
}, 30 * 60 * 1000) // 30 phút

// BE: TTL index -- MongoDB tự xóa, không cần code
```

### Lưu ý

- TTL chỉ hoạt động trên **Date fields**
- MongoDB xóa mỗi 60 giây → document có thể tồn tại thêm tối đa 60 giây
- Không thể tạo TTL trên **compound index** (chỉ single field)
- Xóa không trigger middleware/hooks

---

## 4. Wildcard Index -- Index cho dynamic fields

### Khái niệm

Khi document có fields **không biết trước** (dynamic keys), bạn không thể tạo index cụ thể. Wildcard index tự động index tất cả fields.

### Ví dụ: metadata Object

```ts
// mongo/users.ts
metaData: { type: Object }

// Document 1
{ metaData: { source: 'google', campaign: 'summer_2026' } }

// Document 2
{ metaData: { referralCode: 'ABC123', utm_medium: 'social' } }

// Wildcard index
schema.index({ 'metaData.$**': 1 })

// Bây giờ có thể query:
db.users.find({ 'metaData.source': 'google' })           // ✅ Dùng index
db.users.find({ 'metaData.referralCode': 'ABC123' })     // ✅ Dùng index
db.users.find({ 'metaData.utm_medium': 'social' })       // ✅ Dùng index
```

### Khi nào dùng

- Fields trong sub-document **thay đổi theo thời gian** (metadata, settings, custom fields)
- Không biết trước user sẽ query field nào
- Mỗi document có thể có **different fields**

### Khi nào KHÔNG dùng

- Fields cố định → dùng compound index (hiệu quả hơn)
- Cần sort → wildcard không hỗ trợ sort
- Cần compound conditions → wildcard chỉ match 1 field path tại 1 thời điểm

---

## 5. Text Index -- Full-text search

### Ví dụ thực tế: posts text search

```ts
// mongo/posts.ts
schema.index({
  'title': 'text',
  'textSearch': 'text',
  'content.text': 'text',
  'tags': 'text',
  'symbols': 'text',
})

// Query
await mongo.posts.find({ $text: { $search: 'phân tích VNM' } })
```

### Hạn chế

- Mỗi collection chỉ có **1 text index**
- Performance kém hơn dedicated search engines (Elasticsearch)
- Không hỗ trợ tiếng Việt tốt (không có Vietnamese stemming)

> **Thực tế:** Finpath dùng text index cho search đơn giản. Nếu cần search phức tạp hơn, cân nhắc Elasticsearch.

---

## 6. Tổng hợp: Chọn Index nào?

```
                      Cần index gì?
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
     Query cụ thể    Dynamic fields    Auto cleanup
          │               │               │
     ┌────┼────┐          ▼               ▼
     ▼         ▼     Wildcard Index   TTL Index
  Tất cả docs  Một phần docs
     │              │
     ▼              ▼
  Compound     Partial Index
  Index
     │
     ▼
  Chỉ cần index fields?
     │         │
    Có        Không
     │         │
     ▼         ▼
  Covering   Compound
  Index      Index
```

---

## 7. Index Design Checklist

Khi thiết kế index cho collection mới:

- [ ] Liệt kê tất cả query patterns (từ controller/service code)
- [ ] Xác định fields nào là E, S, R trong mỗi query
- [ ] Thiết kế compound indexes theo ESR
- [ ] Kiểm tra prefix rule -- 1 compound index phục vụ nhiều queries
- [ ] Collection lớn? Cân nhắc partial index (filter inactive docs)
- [ ] Cần auto-cleanup? Dùng TTL index
- [ ] Dynamic fields? Cân nhắc wildcard index
- [ ] Chạy explain() để verify

---

## Tóm tắt

| Loại Index | Một câu giải thích | Ví dụ Finpath |
|---|---|---|
| Covering | Query trả kết quả chỉ từ index, không đọc document | Count queries trên watchLists |
| Partial/Sparse | Index chỉ documents thỏa điều kiện, nhỏ hơn | `users.identity` sparse unique |
| TTL | Tự xóa documents sau thời gian | `notifications` hết hạn sau 7 ngày |
| Wildcard | Index dynamic fields không biết trước | `users.metaData` |
| Text | Full-text search trong strings | `posts` search title/content |

## Bài tập

1. Collection `deviceLogs` lưu log thiết bị. Mỗi log có `userId`, `action`, `createdAt`, `deviceInfo` (dynamic object). Thiết kế indexes bao gồm: compound index cho query thường dùng, TTL cho auto-cleanup 30 ngày, wildcard cho deviceInfo.
2. Collection `orders` có 80% documents với `status: 'completed'` và 20% `status: 'pending'`. Query chủ yếu trên pending orders. Nên dùng index nào để tối ưu?
3. Chạy `explain()` trên 1 query trong logics và phân tích: index nào được sử dụng? Có phải covering query không? Đề xuất cải thiện.
