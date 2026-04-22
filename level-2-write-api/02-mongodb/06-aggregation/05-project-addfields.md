# $project và $addFields - Chọn và tính toán Fields

## Mục tiêu

Học cách chọn fields, đổi tên, và tạo fields tính toán trong aggregation.

---

## 1. $project - Chọn và transform fields

### Code thật từ getEventCounts

```ts
// app/Services/analyticsService/libs/getEventCounts.ts
{
  $project: {
    _id: 0,                    // Bỏ _id
    key: '$_id.key',           // Lấy giá trị từ _id.key → đổi tên thành 'key'
    date: '$_id.date',         // Lấy giá trị từ _id.date → đổi tên thành 'date'
    count: 1,                  // Giữ nguyên field count
  },
}
```

Trước $project:

```json
{ "_id": { "key": "page_view", "date": "2024-01-15" }, "count": 5234 }
```

Sau $project:

```json
{ "key": "page_view", "date": "2024-01-15", "count": 5234 }
```

### Code thật từ getTopContent

```ts
// app/Services/analyticsService/libs/getTopContent.ts
{
  $project: {
    _id: 0,
    id: '$_id',       // Đổi tên _id thành id
    count: 1,
  },
}
```

### Code thật từ getActiveUsers

```ts
// app/Services/analyticsService/libs/getActiveUsers.ts
{
  $project: {
    _id: 0,
    date: '$_id',
    activeUsers: 1,
    mobile: platform === 'web' ? { $literal: 0 } : '$mobile',
    web: platform === 'mobile' ? { $literal: 0 } : '$web',
  },
}
```

> `$literal: 0` = giá trị cố định 0 (không phải field reference).

### Code thật từ getOverview

```ts
// Tính phần trăm trong $project
{
  $project: {
    _id: 0,
    date: '$_id',
    activeUsers: 1,
    mobile: platform === 'web' ? { $literal: 0 } : '$mobile',
    web: platform === 'mobile' ? { $literal: 0 } : '$web',
  },
}
```

## 2. $project operations

### Đổi tên field

```ts
{
  $project: {
    userId: '$_id',       // _id → userId
    fullName: '$name',    // name → fullName
  }
}
```

### Giữ nguyên field

```ts
{
  $project: {
    name: 1,        // Giữ nguyên
    symbols: 1,     // Giữ nguyên
    _id: 0,         // Bỏ
  }
}
```

### Tính toán

```ts
{
  $project: {
    total: { $add: ['$price', '$tax'] },                    // Cộng
    discount: { $subtract: ['$price', '$discountAmount'] }, // Trừ
    average: { $divide: ['$total', '$count'] },             // Chia
    doubled: { $multiply: ['$price', 2] },                  // Nhân
  }
}
```

### Điều kiện ($cond)

```ts
{
  $project: {
    status: 1,
    label: {
      $cond: {
        if: { $eq: ['$status', 'completed'] },
        then: 'Hoàn thành',
        else: 'Đang xử lý',
      },
    },
  },
}
```

## 3. $addFields - Thêm fields mới (giữ nguyên fields cũ)

### Code thật từ getActiveUsers

```ts
// app/Services/analyticsService/libs/getActiveUsers.ts
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
}
```

> `$addFields` khác `$project`: `$addFields` **giữ nguyên** tất cả fields cũ và thêm fields mới. `$project` chỉ giữ fields được liệt kê.

## 4. So sánh $project vs $addFields

```ts
// Document: { name: "VCB", price: 100, quantity: 5 }

// $project - CHỈ giữ fields liệt kê
{ $project: { total: { $multiply: ['$price', '$quantity'] } } }
// Kết quả: { _id: ..., total: 500 }  ← name, price, quantity BIẾN MẤT

// $addFields - THÊM field, giữ nguyên cũ
{ $addFields: { total: { $multiply: ['$price', '$quantity'] } } }
// Kết quả: { _id: ..., name: "VCB", price: 100, quantity: 5, total: 500 }
```

## 5. $dateToString - Format ngày

```ts
// Dùng nhiều trong analyticsService
{ $dateToString: {
  format: '%Y-%m-%d',       // 2024-01-15
  date: '$createdAt',
} }

// Formats phổ biến
'%Y-%m-%d'    // 2024-01-15
'%Y-W%V'      // 2024-W03 (tuần)
'%Y-%m'        // 2024-01 (tháng)
```

---

## Tóm tắt

| Stage | Chức năng | Giữ fields cũ? |
|---|---|---|
| `$project` | Chọn, đổi tên, tính toán | Không (chỉ giữ fields liệt kê) |
| `$addFields` | Thêm fields mới | Có (giữ tất cả + thêm mới) |

| Expression | Chức năng | Ví dụ |
|---|---|---|
| `'$fieldName'` | Tham chiếu field | `'$_id.key'` |
| `{ $literal: value }` | Giá trị cố định | `{ $literal: 0 }` |
| `{ $cond: [if, then, else] }` | Điều kiện | `{ $cond: ['$active', 1, 0] }` |
| `{ $add: [a, b] }` | Cộng | `{ $add: ['$price', '$tax'] }` |

## Bài tập

1. Viết $project đổi `_id` thành `orderId` và thêm `totalPrice = price * quantity`
2. Viết $addFields thêm field `isPremium` = true nếu `plan.level` là 'pro' hoặc 'vip'
3. Viết pipeline hoàn chỉnh: match orders → group theo status → project để format đẹp
