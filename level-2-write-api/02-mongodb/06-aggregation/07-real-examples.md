# Ví dụ thật từ analyticsService

## Mục tiêu

Đọc và hiểu code aggregation thật từ dự án logics.

---

## 1. getEventCounts - Đếm events theo ngày

Bài toán: Đếm số lượng mỗi loại event (page_view, click_stock, ...) theo từng ngày/tuần/tháng.

```ts
// app/Services/analyticsService/libs/getEventCounts.ts
const GROUP_BY_FORMAT: Record<string, string> = {
  day: '%Y-%m-%d',       // 2024-01-15
  week: '%Y-W%V',        // 2024-W03
  month: '%Y-%m',        // 2024-01
}

const result = await mongo.analysisEvents
  .aggregate([
    // Stage 1: Lọc events theo key và thời gian
    {
      $match: {
        key: { $in: keys },
        createdAt: { $gte: from, $lte: to },
      },
    },
    // Stage 2: Nhóm theo (key + date), đếm mỗi nhóm
    {
      $group: {
        _id: {
          key: '$key',
          date: { $dateToString: { format: GROUP_BY_FORMAT[groupBy], date: '$createdAt' } },
        },
        count: { $sum: 1 },
      },
    },
    // Stage 3: Sắp xếp theo ngày
    { $sort: { '_id.date': 1, '_id.key': 1 } },
    // Stage 4: Format kết quả đẹp
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
```

### Giải thích từng stage

```
100M+ analysisEvents
    │
    ▼ $match: key IN ['page_view', 'click_stock'] AND createdAt trong 30 ngày
    │ → Dùng index { createdAt: 1, key: 1 }
    │ → Từ 100M xuống ~50K documents
    │
    ▼ $group: nhóm theo key + date, đếm
    │ → { _id: { key: 'page_view', date: '2024-01-15' }, count: 5234 }
    │ → ~200 groups
    │
    ▼ $sort: theo date tăng dần
    │
    ▼ $project: đổi { _id: { key, date } } thành { key, date, count }
    │
    ▼ Kết quả: [{ key: 'page_view', date: '2024-01-15', count: 5234 }, ...]
```

## 2. getActiveUsers - Active users theo platform

Bài toán: Đếm users active trên mobile/web theo từng ngày.

```ts
// app/Services/analyticsService/libs/getActiveUsers.ts
const result = await mongo.userLastAccesses.aggregate([
  // Stage 1: Lọc users active trong khoảng thời gian
  { $match: match },
  // Stage 2: Tính toán fields mới
  {
    $addFields: {
      _mobInRange: {
        $and: [{ $gte: ['$mob', from] }, { $lte: ['$mob', to] }],
      },
      _webInRange: {
        $and: [{ $gte: ['$web', from] }, { $lte: ['$web', to] }],
      },
      _date: {
        $max: [
          { $cond: [{ $and: [{ $gte: ['$mob', from] }, { $lte: ['$mob', to] }] }, '$mob', new Date(0)] },
          { $cond: [{ $and: [{ $gte: ['$web', from] }, { $lte: ['$web', to] }] }, '$web', new Date(0)] },
        ],
      },
    },
  },
  // Stage 3: Nhóm theo ngày, đếm mobile/web riêng
  {
    $group: {
      _id: { $dateToString: { format: dateFormat, date: '$_date' } },
      activeUsers: { $sum: 1 },
      mobile: { $sum: { $cond: ['$_mobInRange', 1, 0] } },
      web: { $sum: { $cond: ['$_webInRange', 1, 0] } },
    },
  },
  // Stage 4-5: Sort + project
  { $sort: { _id: 1 } },
  {
    $project: {
      _id: 0,
      date: '$_id',
      activeUsers: 1,
      mobile: platform === 'web' ? { $literal: 0 } : '$mobile',
      web: platform === 'mobile' ? { $literal: 0 } : '$web',
    },
  },
])
```

### Điểm hay

- `$addFields` tính `_mobInRange`, `_webInRange` trước → dùng lại trong `$group`
- `$cond` trong `$sum`: đếm có điều kiện (mobile active = +1, không = +0)
- `$literal: 0`: trả cố định 0 khi platform không phù hợp

## 3. getTopContent - Top nội dung phổ biến

```ts
// app/Services/analyticsService/libs/getTopContent.ts
const result = await mongo.analysisEvents
  .aggregate([
    { $match: {
      createdAt: { $gte: from, $lte: to },
      key: { $in: eventKeys },
      [valField]: { $exists: true, $ne: null },
    }},
    { $group: { _id: `$${valField}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { _id: 0, id: '$_id', count: 1 } },
  ])
  .allowDiskUse(true)
```

### Điểm hay

- `[valField]` = dynamic field name (có thể là `val.symbol`, `val.postId`, ...)
- `$exists: true, $ne: null` = field phải tồn tại VÀ không null
- Sort + limit = Top N pattern

## 4. getOverview - Dashboard tổng quan

```ts
// app/Services/analyticsService/libs/getOverview.ts
// Dùng countDocuments thay vì aggregation cho event counts
const keyCounts = await Promise.all(
  KNOWN_EVENT_KEYS.map(async (key) => {
    const count = await mongo.analysisEvents.countDocuments({
      createdAt: { $gte: from, $lte: to },
      key,
    })
    return { key, count }
  })
)

// Aggregation chỉ cho phần active users
const activeUserStats = await mongo.userLastAccesses.aggregate([
  { $match: { $or: [{ mob: { $gte: from, $lte: to } }, { web: { $gte: from, $lte: to } }] } },
  {
    $group: {
      _id: null,          // Không nhóm → tổng tất cả
      total: { $sum: 1 },
      mobile: { $sum: { $cond: [{ $and: [{ $gte: ['$mob', from] }, { $lte: ['$mob', to] }] }, 1, 0] } },
      web: { $sum: { $cond: [{ $and: [{ $gte: ['$web', from] }, { $lte: ['$web', to] }] }, 1, 0] } },
    },
  },
])
```

### Tại sao dùng countDocuments thay vì $group?

> Comment trong code: "Uses countDocuments per event key instead of expensive $group aggregation to avoid overloading DB on the large analysisEvents collection."

`countDocuments` dùng index trực tiếp, nhanh hơn `$group` trên 100M+ documents.

## 5. getRetention - User retention

```ts
// app/Services/analyticsService/libs/getRetention.ts
// Bước 1: Lấy new users
const cohorts = await mongo.analysisEvents.aggregate([
  { $match: { key: 'user_created', createdAt: { $gte: from, $lte: to }, uid: { $exists: true, $ne: null } } },
  { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, uids: { $addToSet: '$uid' }, newUsers: { $sum: 1 } } },
  { $sort: { _id: 1 } },
])

// Bước 2: Check retention bằng query riêng (không dùng $lookup)
const activeRecords = await mongo.logs.aggregate([
  { $match: { userId: { $in: allOids }, createdAt: { $gte: minDate, $lte: maxDate } } },
  { $group: { _id: { userId: '$userId', date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } } },
])
```

### Tại sao 2 queries riêng thay vì $lookup?

- `analysisEvents` có 100M+ documents
- `logs` cũng rất lớn
- $lookup giữa 2 collections lớn = cực chậm
- 2 queries riêng + xử lý trong code = nhanh hơn

---

## Tóm tắt patterns

| Pattern | Khi nào dùng | Ví dụ |
|---|---|---|
| `$match` + `$group` + `$sort` | Đếm/tổng hợp theo nhóm | getEventCounts |
| `$addFields` + `$group` + `$cond` | Đếm có điều kiện | getActiveUsers |
| `$sort` + `$limit` | Top N | getTopContent |
| `$group { _id: null }` | Tổng toàn bộ | getOverview |
| 2 queries riêng | JOIN collections lớn | getRetention |

## Bài tập

1. Viết pipeline đếm số orders theo `status` theo tháng (giống getEventCounts)
2. Viết pipeline top 10 users có nhiều watchlists nhất
3. Giải thích tại sao getOverview dùng `countDocuments` thay vì `$group` cho analysisEvents
