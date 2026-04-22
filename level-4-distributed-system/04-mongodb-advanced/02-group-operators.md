# $group Operators -- $sum, $avg, $push, $addToSet...

## Mục tiêu

Hiểu tất cả operators dùng trong `$group` stage. Mỗi operator: chức năng, khi nào dùng, ví dụ thực tế.

---

## 1. Tổng quan

Trong `$group`, bạn cần 2 thứ:
- `_id`: group theo field nào
- Các field tính toán: dùng operator nào

```typescript
{ $group: {
  _id: '$key',              // Group theo field "key"
  count: { $sum: 1 },       // Đếm số documents
  totalViews: { $sum: '$views' },  // Tổng views
  avgDuration: { $avg: '$duration' },  // Trung bình duration
} }
```

---

## 2. $sum -- Tổng / Đếm

### Đếm số documents

```typescript
{ $group: { _id: '$key', count: { $sum: 1 } } }
// Mỗi document +1, kết quả = tổng số documents trong nhóm
// Input:  [{ key: 'view' }, { key: 'view' }, { key: 'click' }]
// Output: [{ _id: 'view', count: 2 }, { _id: 'click', count: 1 }]
```

### Tổng giá trị

```typescript
{ $group: { _id: '$category', totalRevenue: { $sum: '$price' } } }
// Input:  [{ category: 'A', price: 100 }, { category: 'A', price: 200 }, { category: 'B', price: 150 }]
// Output: [{ _id: 'A', totalRevenue: 300 }, { _id: 'B', totalRevenue: 150 }]
```

**So sánh JS:**

```typescript
// Đếm
items.reduce((acc, item) => acc + 1, 0)

// Tổng
items.reduce((acc, item) => acc + item.price, 0)
```

**Khi nào dùng:** Hầu hết mọi aggregation đều cần `$sum`. Đếm events, tổng doanh thu, tổng số lượng.

---

## 3. $avg -- Trung bình

```typescript
{ $group: { _id: '$category', avgPrice: { $avg: '$price' } } }
// Input:  [{ category: 'A', price: 100 }, { category: 'A', price: 200 }]
// Output: [{ _id: 'A', avgPrice: 150 }]
```

**So sánh JS:**

```typescript
const avg = items.reduce((sum, i) => sum + i.price, 0) / items.length
```

**Khi nào dùng:** Trung bình thời gian response, trung bình giá, trung bình điểm đánh giá.

---

## 4. $min và $max -- Giá trị nhỏ nhất / lớn nhất

```typescript
{ $group: {
  _id: '$symbol',
  lowestPrice: { $min: '$price' },
  highestPrice: { $max: '$price' },
} }
// Input:  [{ symbol: 'VNM', price: 80 }, { symbol: 'VNM', price: 85 }, { symbol: 'VNM', price: 78 }]
// Output: [{ _id: 'VNM', lowestPrice: 78, highestPrice: 85 }]
```

**So sánh JS:**

```typescript
Math.min(...prices)
Math.max(...prices)
```

**Khi nào dùng:** Giá cao nhất/thấp nhất trong ngày, thời gian response nhanh nhất/chậm nhất.

---

## 5. $first và $last -- Giá trị đầu / cuối

Lấy giá trị **đầu tiên** hoặc **cuối cùng** trong mỗi nhóm. Phụ thuộc vào thứ tự documents (thường cần `$sort` trước).

```typescript
[
  { $sort: { createdAt: 1 } },  // Quan trọng: sort trước
  { $group: {
    _id: '$symbol',
    openPrice: { $first: '$price' },   // Giá đầu tiên (mở cửa)
    closePrice: { $last: '$price' },    // Giá cuối cùng (đóng cửa)
  } }
]
// Lấy giá mở cửa và đóng cửa của mỗi mã cổ phiếu
```

**So sánh JS:**

```typescript
const sorted = items.sort((a, b) => a.createdAt - b.createdAt)
const first = sorted[0].price
const last = sorted[sorted.length - 1].price
```

**Khi nào dùng:** Giá mở cửa/đóng cửa, trạng thái đầu/cuối, tin nhắn mới nhất.

**Lưu ý:** `$first` và `$last` **phụ thuộc thứ tự input**. Nếu không `$sort` trước, kết quả không đáng tin cậy.

---

## 6. $push -- Thu thập vào array

Thu thập **tất cả** giá trị của 1 field vào array.

```typescript
{ $group: {
  _id: '$userId',
  allOrders: { $push: '$orderId' },
} }
// Input:  [{ userId: 'u1', orderId: 'o1' }, { userId: 'u1', orderId: 'o2' }, { userId: 'u2', orderId: 'o3' }]
// Output: [{ _id: 'u1', allOrders: ['o1', 'o2'] }, { _id: 'u2', allOrders: ['o3'] }]
```

**Push toàn bộ document:**

```typescript
{ $group: {
  _id: '$date',
  events: { $push: '$$ROOT' },  // $$ROOT = toàn bộ document
} }
```

**So sánh JS:**

```typescript
// Giống Object.groupBy hoặc lodash.groupBy
const grouped = {}
items.forEach(item => {
  if (!grouped[item.userId]) grouped[item.userId] = []
  grouped[item.userId].push(item.orderId)
})
```

**Khi nào dùng:** Thu thập danh sách items theo nhóm. Cẩn thận với data lớn -- array có thể rất lớn!

---

## 7. $addToSet -- Thu thập giá trị unique vào array

Giống `$push` nhưng **loại bỏ trùng lặp**.

```typescript
{ $group: {
  _id: '$date',
  uniqueUsers: { $addToSet: '$uid' },
} }
// Input:  [{ date: '2026-03', uid: 'u1' }, { date: '2026-03', uid: 'u1' }, { date: '2026-03', uid: 'u2' }]
// Output: [{ _id: '2026-03', uniqueUsers: ['u1', 'u2'] }]
// u1 chỉ xuất hiện 1 lần dù có 2 documents
```

**So sánh JS:**

```typescript
// Giống Set
const uniqueUsers = [...new Set(items.map(i => i.uid))]
```

**Khi nào dùng:** Đếm unique users, danh sách categories unique, tags không trùng.

**$addToSet vs $push:**

| | $push | $addToSet |
|---|-------|-----------|
| Trùng lặp | Giữ tất cả | Loại bỏ trùng |
| JS tương đương | `Array.push()` | `Set.add()` |
| Kết quả | Có thể duplicate | Luôn unique |

---

## 8. $count (stage riêng, không phải operator)

Đếm tổng số documents qua pipeline.

```typescript
// Cách 1: $count stage
[
  { $match: { key: 'view' } },
  { $count: 'totalViews' }
]
// Output: [{ totalViews: 42000 }]

// Cách 2: $group với $sum
[
  { $match: { key: 'view' } },
  { $group: { _id: null, totalViews: { $sum: 1 } } }
]
// Output: [{ _id: null, totalViews: 42000 }]
```

---

## 9. Ví dụ thực tế kết hợp nhiều operators

### Thống kê event theo ngày

```typescript
// Đếm events, tính unique users, tìm peak time
const result = await db.analysisEvents.aggregate([
  { $match: { key: 'page_view', createdAt: { $gte: from, $lte: to } } },
  { $group: {
    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
    totalEvents: { $sum: 1 },             // Tổng events
    uniqueUsers: { $addToSet: '$uid' },    // Users unique
    firstEvent: { $min: '$createdAt' },    // Event sớm nhất
    lastEvent: { $max: '$createdAt' },     // Event muộn nhất
  } },
  { $addFields: {
    uniqueUserCount: { $size: '$uniqueUsers' },  // Đếm từ set
  } },
  { $project: {
    _id: 0,
    date: '$_id',
    totalEvents: 1,
    uniqueUserCount: 1,
    firstEvent: 1,
    lastEvent: 1,
  } },
  { $sort: { date: 1 } },
])
```

### Bảng xếp hạng top cổ phiếu được xem nhiều nhất

```typescript
const result = await db.analysisEvents.aggregate([
  { $match: { key: 'stock_view', createdAt: { $gte: from, $lte: to } } },
  { $group: {
    _id: '$symbol',
    viewCount: { $sum: 1 },
    uniqueViewers: { $addToSet: '$uid' },
  } },
  { $addFields: {
    uniqueViewerCount: { $size: '$uniqueViewers' },
  } },
  { $sort: { viewCount: -1 } },
  { $limit: 10 },
  { $project: {
    _id: 0,
    symbol: '$_id',
    viewCount: 1,
    uniqueViewerCount: 1,
  } },
])
```

---

## 10. Bảng tổng hợp

| Operator | Chức năng | JS tương đương | Ví dụ |
|----------|-----------|----------------|-------|
| `$sum: 1` | Đếm docs | `length` | Đếm events |
| `$sum: '$field'` | Tổng giá trị | `reduce(+)` | Tổng doanh thu |
| `$avg` | Trung bình | `sum / length` | Giá trung bình |
| `$min` | Giá trị nhỏ nhất | `Math.min()` | Giá thấp nhất |
| `$max` | Giá trị lớn nhất | `Math.max()` | Giá cao nhất |
| `$first` | Giá trị đầu | `arr[0]` | Giá mở cửa |
| `$last` | Giá trị cuối | `arr[arr.length-1]` | Giá đóng cửa |
| `$push` | Thu thập vào array | `push()` | Danh sách orders |
| `$addToSet` | Thu thập unique | `Set.add()` | Users unique |

---

## Tóm tắt

- `$sum` và `$avg` là **phổ biến nhất** -- hầu hết aggregation đều cần
- `$addToSet` hữu ích khi cần **unique values** (unique users, unique sessions)
- `$first` và `$last` cần **$sort trước** để kết quả đáng tin cậy
- `$push` cẩn thận với **data lớn** -- array kết quả có thể rất lớn, gây OOM
- Kết hợp nhiều operators trong 1 `$group` để lấy nhiều metrics cùng lúc
- Bài tiếp theo sẽ xem **pipeline thật** từ analyticsService trong logics
