# Performance Tips - Tối ưu hiệu suất

## Mục tiêu

Học các kỹ thuật tối ưu production từ dự án logics thật.

---

## 1. .lean() - Giảm memory

```ts
// Code thật - RoomsController.ts
const data = await mongo.paymentRequests
  .find(query)
  .sort({ _id: -1 })
  .skip((page - 1) * pageSize)
  .limit(pageSize)
  .select(select)
  .lean()                    // Nhanh hơn 2-5x, ít memory hơn

// Khi nào: API response, pagination, report
// Khi nào KHÔNG: cần .save(), .populate()
```

## 2. allowDiskUse(true) - Xử lý data lớn

```ts
// Code thật - getEventCounts.ts
const result = await mongo.analysisEvents
  .aggregate([
    { $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: { key: '$key', date: '...' }, count: { $sum: 1 } } },
    { $sort: { '_id.date': 1 } },
  ])
  .allowDiskUse(true)     // Cho phép dùng disk khi memory không đủ
```

Mặc định, mỗi aggregation stage giới hạn **100MB RAM**. Với 100M+ documents, dễ vượt.

> `.allowDiskUse(true)` cho phép MongoDB ghi tạm ra disk → chậm hơn nhưng không crash.

## 3. Projection - Chỉ lấy fields cần thiết

```ts
// XẤU: Lấy toàn bộ user document (40+ fields, bao gồm password)
const user = await mongo.users.findById(userId)

// TỐT: Chỉ lấy fields cần thiết
const user = await mongo.users.findById(userId, { _id: 1, fullName: 1, avatar: 1 })

// TỐT NHẤT: Chỉ kiểm tra tồn tại
const exists = await mongo.users.findById(userId, { _id: 1 })
```

## 4. Batch operations - Gom nhiều thao tác

### insertMany thay vì loop create

```ts
// Code thật - insertEvent.ts
// XẤU: Insert từng cái
for (const event of events) {
  await mongo.analysisEvents.create(event)  // N round-trips
}

// TỐT: Insert batch
await mongo.analysisEvents.insertMany(events, { ordered: false })  // 1 round-trip
```

### Batching với throttle

```ts
// Code thật - insertEvent.ts
const insertPools: InsertEventInput[] = []

export const insertEvent = (events: InsertEventInput[]): void => {
  insertPools.push(...events)

  if (insertPools.length > 2000) {
    insert()                // Buffer lớn → insert ngay
  } else {
    insertThrottle()        // Buffer nhỏ → chờ 5-7 giây
  }
}
```

## 5. Promise.all - Chạy song song

```ts
// Code thật - RoomsController.ts
// XẤU: Chạy tuần tự
const data = await mongo.paymentRequests.find(query).limit(20).lean()
const total = await mongo.paymentRequests.countDocuments(query)
// Tổng thời gian: query1 + query2

// TỐT: Chạy song song
const [data, total] = await Promise.all([
  mongo.paymentRequests.find(query).limit(20).lean(),
  mongo.paymentRequests.countDocuments(query),
])
// Tổng thời gian: max(query1, query2) → nhanh gần 2x
```

### Code thật - getOverview

```ts
// Chạy song song nhiều countDocuments
const keyCounts = await Promise.all(
  KNOWN_EVENT_KEYS.map(async (key) => {
    const count = await mongo.analysisEvents.countDocuments({
      createdAt: { $gte: from, $lte: to },
      key,
    })
    return { key, count }
  })
)
```

## 6. countDocuments vs $group

```ts
// Code thật - getOverview.ts
// Comment: "Uses countDocuments per event key instead of expensive $group
//           aggregation to avoid overloading DB"

// CHẬM: $group trên 100M+ documents
await mongo.analysisEvents.aggregate([
  { $match: { createdAt: { $gte: from, $lte: to } } },
  { $group: { _id: '$key', count: { $sum: 1 } } },
])

// NHANH: countDocuments dùng index trực tiếp
const count = await mongo.analysisEvents.countDocuments({
  createdAt: { $gte: from, $lte: to },
  key: 'page_view',
})
```

## 7. Index Strategy cho production

```ts
// mongo/analysisEvents.ts - 100M+ documents
schema.index({ key: 1, uid: 1, createdAt: 1 })   // getRetention
schema.index({ createdAt: 1, key: 1 })             // getEventCounts, getOverview
```

Mỗi index phục vụ queries cụ thể. Không tạo index thừa.

## 8. Cursor-based pagination cho data lớn

```ts
// skip + limit chậm ở trang sâu
.skip(100000).limit(20)  // MongoDB quét 100000 docs rồi bỏ

// Cursor-based: luôn nhanh
.find({ _id: { $lt: lastId } })
.sort({ _id: -1 })
.limit(20)
```

## 9. Tránh in-memory sort

```ts
// Sort field không có index → in-memory sort
// Giới hạn 32MB → crash nếu data lớn

// Giải pháp 1: Thêm index
schema.index({ point: -1 })

// Giải pháp 2: allowDiskUse cho aggregation
.aggregate([...]).allowDiskUse(true)
```

## 10. Connection pooling

```ts
// Mongoose mặc định pool 100 connections
// Đủ cho hầu hết apps

// Nếu cần tuỳ chỉnh:
mongoose.connect(uri, {
  maxPoolSize: 50,       // Max connections
  minPoolSize: 10,       // Min connections giữ sẵn
})
```

---

## Checklist Performance

| Kỹ thuật | Khi nào | Hiệu quả |
|---|---|---|
| `.lean()` | Read-only responses | 2-5x nhanh hơn |
| `allowDiskUse(true)` | Aggregation data lớn | Tránh crash |
| Projection | Mọi query | Giảm bandwidth |
| `insertMany` | Tạo nhiều docs | 10-100x nhanh hơn loop |
| `Promise.all` | Queries độc lập | ~2x nhanh hơn |
| `countDocuments` vs `$group` | Đếm đơn giản | Nhanh hơn trên collections lớn |
| Cursor pagination | Trang sâu | Luôn nhanh |
| Index đúng | Mọi query thường xuyên | 1000x nhanh hơn |

## Bài tập

1. Optimize: viết lại đoạn code chạy 5 queries tuần tự thành Promise.all
2. Collection `logs` có 50M documents. Viết aggregation an toàn (có $match đầu, allowDiskUse)
3. So sánh thời gian: `find()` vs `find().lean()` trên 1000 documents
