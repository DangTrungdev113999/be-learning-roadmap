# Enum và Default Values

## Mục tiêu

Hiểu cách dùng `enum` để giới hạn giá trị, và `default` để gán giá trị mặc định.

---

## 1. Enum - Giới hạn giá trị cho phép

### Khai báo enum bằng TypeScript

```ts
// mongo/orders.ts - Dự án logics
export enum OrderStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELED = 'canceled',
  FAILED = 'failed',
}

export enum OrderPaymentMethod {
  APPLE = 'apple',
  GOOGLE = 'google',
  TRANSFER = 'transfer',
  ADMIN = 'admin',
  ATX = 'atx',
}
```

### Dùng enum trong schema

```ts
// mongo/orders.ts
const schema = new mongoose.Schema({
  status: {
    type: String,
    enum: Object.values(OrderStatus),     // ['pending', 'completed', 'canceled', 'failed']
    default: OrderStatus.PENDING,
  },

  payment: {
    method: {
      type: String,
      enum: Object.values(OrderPaymentMethod),  // ['apple', 'google', 'transfer', 'admin', 'atx']
    },
  },
})
```

### Enum trong users.ts

```ts
// mongo/users.ts
import { PlanLevel } from 'Const/plan'

const schema = new mongoose.Schema({
  plan: {
    level: {
      type: String,
      enum: Object.values(PlanLevel),    // ['basic', 'pro', 'vip', ...]
      default: PlanLevel.BASIC,
    },
    method: {
      type: String,
      enum: Object.values(OrderPaymentMethod),
    },
  },

  kycStatus: {
    type: String,
    enum: Object.values(UserKycStatus),   // ['pending', 'approved', 'rejected']
  },
})
```

### Validation - Nếu giá trị không hợp lệ

```ts
// Nếu gán giá trị không có trong enum → Mongoose sẽ throw ValidationError
await mongo.orders.create({
  status: 'invalid_status',  // ERROR! "invalid_status" không có trong enum
})
// ValidationError: `invalid_status` is not a valid enum value for path `status`
```

## 2. Default - Giá trị mặc định

### Default với giá trị cố định

```ts
// mongo/rooms.ts
const schema = new mongoose.Schema({
  numberOfMember: {
    type: Number,
    default: 0,               // Mặc định = 0
  },
  numberOfHotnews: {
    type: Number,
    default: 0,
  },
})
```

Khi tạo document không cần truyền `numberOfMember`:

```ts
const room = await mongo.rooms.create({
  name: 'Phòng Đầu tư',
  // numberOfMember tự động = 0
})
console.log(room.numberOfMember)  // 0
```

### Default với function

```ts
// mongo/analysisEvents.ts
const schema = new mongoose.Schema({
  createdAt: {
    type: Date,
    default: Date.now,        // Function, không phải Date.now()
  },
})
```

> **Chú ý**: `Date.now` (không có `()`) là function reference - mỗi document sẽ có thời gian khác nhau. `Date.now()` (có `()`) gọi luôn lúc define schema - tất cả documents sẽ có cùng thời gian!

### Default kết hợp config

```ts
// mongo/rooms.ts - Default lấy từ config
import { roomConfig } from 'Config/room'

const schema = new mongoose.Schema({
  affiliate: {
    commissionRate: {
      type: Number,
      default: roomConfig.affiliateCommissionRate,  // Lấy từ config
    },
    commissionCapacityRate: {
      type: Number,
      default: roomConfig.expertCommissionRate,
    },
  },
})
```

### Default cho Number trong users.ts

```ts
// mongo/users.ts
const schema = new mongoose.Schema({
  trialCount: {
    type: Number,
    default: 0,
  },
  rewritePostContentLimit: {
    count: { type: Number, default: 0 },
    date: Date,
  },
})
```

## 3. Enum + Default kết hợp

Pattern phổ biến nhất:

```ts
// Trạng thái đơn hàng - mới tạo luôn là "pending"
status: {
  type: String,
  enum: ['pending', 'completed', 'canceled', 'failed'],
  default: 'pending',
},

// Plan level - mặc định là "basic"
level: {
  type: String,
  enum: ['basic', 'pro', 'vip'],
  default: 'basic',
},
```

## 4. So sánh với FE

| FE (TypeScript) | BE (Mongoose) |
|---|---|
| `type Status = 'pending' \| 'completed'` | `enum: ['pending', 'completed']` |
| `const count = 0` (initial state) | `default: 0` |
| Chỉ check lúc compile | Check lúc **runtime** (save vào DB) |

---

## Tóm tắt

- `enum` giới hạn giá trị → validation tự động khi save
- `default` gán giá trị khi không truyền → giảm code
- Kết hợp TypeScript enum + Mongoose enum = type-safe ở cả compile và runtime

## Bài tập

1. Tạo schema `tasks` với `status` (enum: todo/in_progress/done, default: todo) và `priority` (enum: low/medium/high/urgent, default: medium)
2. Thử create document với `status: 'invalid'` - xem lỗi gì?
3. Viết enum TypeScript cho `OrderPaymentMethod` rồi dùng trong schema
