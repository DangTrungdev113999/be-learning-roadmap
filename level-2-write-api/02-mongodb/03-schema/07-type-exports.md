# Type Exports - TypeScript Integration

## Mục tiêu

Hiểu cách export TypeScript types từ Mongoose schemas để có type safety.

---

## 1. Vấn đề: Schema không có type

Khi dùng Mongoose model, TypeScript không biết document có những fields gì:

```ts
const user = await mongo.users.findById(userId)
user.fullName  // TypeScript: 'any' - không biết có field này
user.abc       // TypeScript: 'any' - không báo lỗi dù field không tồn tại
```

## 2. InferSchemaType - Tự suy ra type từ schema

```ts
// mongo/analysisEvents.ts
import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  uid: String,
  key: String,
  val: Object,
  src: String,
  createdAt: { type: Date, default: Date.now },
})

// Tự động suy ra type từ schema definition
export type AnalysisEvent = mongoose.InferSchemaType<typeof schema> & {
  _id: mongoose.Types.ObjectId
}

export default mongoose.model('analysisEvents', schema)
```

`InferSchemaType` tự suy ra:

```ts
type AnalysisEvent = {
  _id: mongoose.Types.ObjectId
  uid?: string
  key?: string
  val?: any
  src?: string
  createdAt?: Date
}
```

## 3. Ví dụ thực tế: users.ts

```ts
// mongo/users.ts
const schema = new mongoose.Schema({
  identity: { type: String, index: { sparse: true, unique: true } },
  email: { type: String, index: { sparse: true, unique: true } },
  fullName: { type: String },
  password: { type: String, required: true },
  plan: {
    level: { type: String, enum: Object.values(PlanLevel), default: PlanLevel.BASIC },
    expiredDate: Date,
  },
  roles: [String],
  bans: [String],
})

// Type đầy đủ
export type User = mongoose.InferSchemaType<typeof schema> & {
  _id: mongoose.Types.ObjectId
}

// Type cho payload (chỉ lấy vài fields)
export type UserPayload = Pick<User, '_id' | 'identity' | 'plan' | 'roles' | 'bans'> & {
  _id: string
}

// Type cho Mongoose document (có methods save(), toJSON(), ...)
export type UserDocument = mongoose.HydratedDocument<User>

export default mongoose.model('users', schema)
```

## 4. Các loại type export

### Type cơ bản - Dữ liệu thuần

```ts
// Dùng khi truyền data giữa các functions
export type User = mongoose.InferSchemaType<typeof schema> & {
  _id: mongoose.Types.ObjectId
}

// Sử dụng
function processUser(user: User) {
  console.log(user.fullName)  // TypeScript biết có field này
  console.log(user.abc)       // ERROR: Property 'abc' does not exist
}
```

### HydratedDocument - Document với Mongoose methods

```ts
// Dùng khi cần gọi .save(), .toJSON(), ...
export type UserDocument = mongoose.HydratedDocument<User>

// Sử dụng
async function updateUser(doc: UserDocument) {
  doc.fullName = 'Tên mới'
  await doc.save()            // TypeScript biết có method save()
  const json = doc.toJSON()   // TypeScript biết có method toJSON()
}
```

### Pick type - Chỉ lấy vài fields

```ts
// Dùng cho API response hoặc auth payload
export type UserPayload = Pick<User, '_id' | 'identity' | 'plan' | 'roles' | 'bans'> & {
  _id: string    // Override _id thành string (sau khi serialize)
}

// Sử dụng
function checkPermission(payload: UserPayload) {
  if (payload.roles.includes('admin')) { /* ... */ }
}
```

## 5. Type cho orders.ts

```ts
// mongo/orders.ts
export enum OrderStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELED = 'canceled',
  FAILED = 'failed',
}

const schema = new mongoose.Schema({
  status: { type: String, enum: Object.values(OrderStatus) },
  user: { _id: String, fullName: String },
  payment: { method: String, amount: Number },
})

export type Order = mongoose.InferSchemaType<typeof schema> & {
  _id: mongoose.Types.ObjectId
}

export default mongoose.model('orders', schema)
```

## 6. Import type trong service

```ts
// Trong service file
import type { User, UserDocument } from 'Mongo/users'
import type { AnalysisEvent } from 'Mongo/analysisEvents'
import type { Order } from 'Mongo/orders'

// Dùng type cho function parameters
async function getOrdersByUser(userId: User['_id']): Promise<Order[]> {
  return mongo.orders.find({ 'user._id': userId.toString() })
}
```

> **import type** chỉ import type, không import code. Giúp giảm bundle size.

## 7. So sánh với FE

| FE | BE (Mongoose) |
|---|---|
| `interface User { name: string }` | `InferSchemaType<typeof schema>` |
| Tự viết type | Tự suy ra từ schema |
| Chỉ check compile time | Check cả compile + runtime (validation) |

---

## Tóm tắt

| Export | Dùng khi |
|---|---|
| `InferSchemaType` + `_id` | Type cho data thuần (truyền giữa functions) |
| `HydratedDocument<T>` | Type cho Mongoose document (có .save(), etc.) |
| `Pick<T, 'field'>` | Type cho subset (API response, payload) |

## Bài tập

1. Tạo schema `products`, export `Product` type bằng `InferSchemaType`
2. Viết function nhận `ProductDocument` và gọi `.save()`
3. Tạo `ProductSummary = Pick<Product, '_id' | 'name' | 'price'>` cho API response
