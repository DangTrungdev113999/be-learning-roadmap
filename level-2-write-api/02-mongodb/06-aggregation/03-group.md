# $group - Nhóm và tính toán

## Mục tiêu

Học $group (GROUP BY) với các accumulator: $sum, $avg, $max, $min, $addToSet.

---

## 1. $group cơ bản

```ts
{
  $group: {
    _id: <expression>,       // Nhóm theo field nào (GROUP BY)
    field: { <accumulator>: <expression> }  // Tính toán gì
  }
}
```

## 2. Code thật: Đếm events theo key + date

```ts
// app/Services/analyticsService/libs/getEventCounts.ts
{
  $group: {
    _id: {
      key: '$key',           // Nhóm theo key
      date: {                // VÀ nhóm theo ngày
        $dateToString: {
          format: '%Y-%m-%d',
          date: '$createdAt',
        },
      },
    },
    count: { $sum: 1 },      // Đếm số documents trong mỗi nhóm
  },
}
```

Kết quả:

```json
[
  { "_id": { "key": "page_view", "date": "2024-01-15" }, "count": 5234 },
  { "_id": { "key": "click_stock", "date": "2024-01-15" }, "count": 1876 },
  { "_id": { "key": "page_view", "date": "2024-01-16" }, "count": 4892 }
]
```

## 3. $sum - Tổng

```ts
// Đếm số documents
{ $group: { _id: '$key', count: { $sum: 1 } } }

// Tính tổng giá trị field
{ $group: { _id: '$status', totalAmount: { $sum: '$payment.amount' } } }
```

## 4. Code thật: Active users

```ts
// app/Services/analyticsService/libs/getActiveUsers.ts
{
  $group: {
    _id: { $dateToString: { format: dateFormat, date: '$_date' } },
    activeUsers: { $sum: 1 },
    mobile: { $sum: { $cond: ['$_mobInRange', 1, 0] } },  // Đếm có điều kiện
    web: { $sum: { $cond: ['$_webInRange', 1, 0] } },
  },
}
```

> `$cond: ['$_mobInRange', 1, 0]` = nếu `_mobInRange` true thì cộng 1, false thì cộng 0.

## 5. Code thật: Overview totals

```ts
// app/Services/analyticsService/libs/getOverview.ts
{
  $group: {
    _id: null,              // Không nhóm → tính tổng tất cả
    total: { $sum: 1 },
    mobile: {
      $sum: { $cond: [{ $and: [{ $gte: ['$mob', from] }, { $lte: ['$mob', to] }] }, 1, 0] },
    },
    web: {
      $sum: { $cond: [{ $and: [{ $gte: ['$web', from] }, { $lte: ['$web', to] }] }, 1, 0] },
    },
  },
}
```

> `_id: null` = không nhóm, tính tổng cho toàn bộ collection.

## 6. $addToSet - Thu thập giá trị unique

```ts
// app/Services/analyticsService/libs/getRetention.ts
{
  $group: {
    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
    uids: { $addToSet: '$uid' },     // Thu thập tất cả uid unique
    newUsers: { $sum: 1 },
  },
}
```

Kết quả:

```json
{
  "_id": "2024-01-15",
  "uids": ["user_001", "user_002", "user_003"],
  "newUsers": 3
}
```

## 7. Các accumulator khác

```ts
// $avg - Trung bình
{ $group: { _id: '$category', avgPrice: { $avg: '$price' } } }

// $max - Giá trị lớn nhất
{ $group: { _id: '$category', maxPrice: { $max: '$price' } } }

// $min - Giá trị nhỏ nhất
{ $group: { _id: '$category', minPrice: { $min: '$price' } } }

// $first - Giá trị đầu tiên (sau sort)
{ $group: { _id: '$userId', latestLogin: { $first: '$lastLoggedIn' } } }

// $last - Giá trị cuối cùng
{ $group: { _id: '$userId', oldestLogin: { $last: '$lastLoggedIn' } } }
```

## 8. Nhóm theo nhiều fields

```ts
// Nhóm theo 1 field
{ $group: { _id: '$key' } }
// → { _id: 'page_view' }, { _id: 'click_stock' }

// Nhóm theo 2 fields
{ $group: { _id: { key: '$key', date: '$date' } } }
// → { _id: { key: 'page_view', date: '2024-01-15' } }
```

## 9. Bảng tổng hợp Accumulators

| Accumulator | Chức năng | SQL tương đương | Ví dụ |
|---|---|---|---|
| `$sum: 1` | Đếm | `COUNT(*)` | Đếm events |
| `$sum: '$field'` | Tổng | `SUM(field)` | Tổng doanh thu |
| `$avg: '$field'` | Trung bình | `AVG(field)` | Giá trung bình |
| `$max: '$field'` | Lớn nhất | `MAX(field)` | Đơn hàng lớn nhất |
| `$min: '$field'` | Nhỏ nhất | `MIN(field)` | Đơn hàng nhỏ nhất |
| `$addToSet` | Unique values | `GROUP_CONCAT(DISTINCT)` | Danh sách users |
| `$push` | Tất cả values | `GROUP_CONCAT` | Tất cả values |
| `$first` | Đầu tiên | Không có | Giá trị mới nhất |

---

## Bài tập

1. Viết $group đếm số `orders` theo `status` (pending, completed, canceled, failed)
2. Viết $group tính tổng `payment.amount` theo `payment.method` (apple, google, transfer)
3. Viết pipeline cho `analysisEvents`: group theo `key` theo tháng, đếm số events mỗi tháng
4. Giải thích `$cond: ['$_mobInRange', 1, 0]` trong getActiveUsers
