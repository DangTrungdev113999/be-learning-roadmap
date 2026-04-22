# MongoDB/Mongoose Cheatsheet

Tra cứu nhanh tất cả lệnh thường dùng.

---

## Schema Definition

```ts
import mongoose from 'mongoose'
const ObjectId = mongoose.Schema.Types.ObjectId

const schema = new mongoose.Schema(
  {
    // Kiểu cơ bản
    name: { type: String, required: true },
    age: { type: Number, default: 0 },
    active: { type: Boolean, index: true },
    createdAt: { type: Date, default: Date.now },
    userId: { type: ObjectId, required: true, index: true },
    data: Object,                              // any object

    // Enum
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },

    // Array
    tags: [String],                            // ["a", "b"]
    items: [{ _id: false, name: String, qty: Number }],  // array of objects

    // Nested object
    owner: { _id: String, fullName: String, avatar: String },

    // Unique + Sparse
    email: { type: String, index: { unique: true, sparse: true } },
  },
  {
    timestamps: true,              // createdAt + updatedAt tự động
    versionKey: false,             // bỏ __v
  },
)

// Compound indexes
schema.index({ userId: 1, status: 1 })
schema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 })  // TTL 7 ngày
schema.index({ a: 1, b: 1 }, { unique: true })                  // Unique compound

// Type exports
export type MyType = mongoose.InferSchemaType<typeof schema> & { _id: mongoose.Types.ObjectId }
export type MyDocument = mongoose.HydratedDocument<MyType>
export default mongoose.model('myCollection', schema)
```

---

## CRUD Operations

### Create

```ts
// Tạo 1
const doc = await mongo.watchLists.create({ userId, name, symbols: [], point: 0 })

// Tạo nhiều
await mongo.analysisEvents.insertMany(events, { ordered: false })
```

### Read

```ts
// Tìm nhiều
const docs = await mongo.watchLists.find(filter, projection).sort({ point: -1 }).lean()

// Tìm 1
const doc = await mongo.watchLists.findOne(filter).sort({ point: -1 })

// Tìm bằng ID
const doc = await mongo.users.findById(userId, { _id: 1, fullName: 1 })

// Đếm
const count = await mongo.orders.countDocuments(filter)
```

### Update

```ts
// Update 1
await mongo.watchLists.updateOne({ _id }, { $set: { name: 'new' } })

// Update nhiều
await mongo.watchLists.updateMany({ userId }, { $set: { isDeleted: true } })

// Tìm + update + trả về
const doc = await mongo.watchLists.findOneAndUpdate(
  { _id, userId },
  { name: 'new' },
  { new: true, projection: { name: 1, symbols: 1 } },
)
```

### Delete

```ts
await mongo.watchLists.deleteOne({ _id, userId })
await mongo.notifications.deleteMany({ createdAt: { $lt: date } })
```

---

## Update Operators

```ts
{ $set: { name: 'new', 'owner.fullName': 'Name' } }    // Gán giá trị
{ $unset: { tempField: 1 } }                             // Xoá field
{ $inc: { count: 1, point: -1 } }                        // Tăng/giảm
{ $push: { symbols: 'VCB' } }                            // Thêm vào array
{ $addToSet: { symbols: { $each: ['VCB', 'TCB'] } } }   // Thêm không trùng
{ $pull: { symbols: { $in: ['VCB', 'TCB'] } } }          // Xoá khỏi array
{ $pop: { symbols: 1 } }                                  // Xoá phần tử cuối (-1 = đầu)
```

---

## Query Operators

```ts
{ field: value }                    // Bằng
{ field: { $ne: value } }           // Khác
{ field: { $gt: 10 } }             // >
{ field: { $gte: 10 } }            // >=
{ field: { $lt: 10 } }             // <
{ field: { $lte: 10 } }            // <=
{ field: { $in: [1, 2, 3] } }     // Thuộc list
{ field: { $nin: [1, 2] } }       // Không thuộc list
{ field: { $exists: true } }      // Field tồn tại
{ field: { $regex: /abc/i } }     // Pattern match
{ $or: [{ a: 1 }, { b: 2 }] }    // Hoặc
{ $and: [{ a: 1 }, { b: 2 }] }   // Và
```

---

## Query Chaining

```ts
mongo.collection
  .find(filter)
  .select({ name: 1, _id: 0 })     // Projection
  .sort({ createdAt: -1 })          // Sắp xếp
  .skip((page - 1) * pageSize)      // Phân trang
  .limit(pageSize)
  .lean()                            // Plain object (nhanh hơn)
```

---

## Aggregation Pipeline

```ts
const result = await mongo.collection
  .aggregate([
    // Lọc (WHERE) - LUÔN đặt đầu tiên
    { $match: { key: { $in: keys }, createdAt: { $gte: from, $lte: to } } },

    // Thêm fields tính toán
    { $addFields: { total: { $multiply: ['$price', '$qty'] } } },

    // Nhóm (GROUP BY)
    { $group: {
      _id: '$key',                        // Group theo field
      count: { $sum: 1 },                 // COUNT(*)
      total: { $sum: '$amount' },         // SUM(amount)
      avg: { $avg: '$price' },            // AVG(price)
      max: { $max: '$price' },            // MAX(price)
      min: { $min: '$price' },            // MIN(price)
      items: { $addToSet: '$name' },      // Unique values
    }},

    // Sắp xếp
    { $sort: { count: -1 } },

    // Phân trang
    { $skip: 20 },
    { $limit: 10 },

    // Chọn fields + đổi tên
    { $project: { _id: 0, key: '$_id', count: 1 } },

    // JOIN
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },

    // Tách array
    { $unwind: '$items' },

    // Đếm
    { $count: 'total' },

    // Phân nhánh
    { $facet: {
      data: [{ $skip: 0 }, { $limit: 10 }],
      total: [{ $count: 'count' }],
    }},
  ])
  .allowDiskUse(true)
```

---

## Date trong Aggregation

```ts
// Format date
{ $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }

// Formats
'%Y-%m-%d'    // 2024-01-15
'%Y-W%V'      // 2024-W03
'%Y-%m'        // 2024-01
'%H:%M:%S'    // 14:30:00
```

---

## Aggregation Expressions

```ts
// Điều kiện
{ $cond: { if: { $eq: ['$status', 'active'] }, then: 1, else: 0 } }
{ $cond: ['$isActive', 1, 0] }               // Short form

// So sánh
{ $eq: ['$a', '$b'] }    // a == b
{ $gt: ['$a', 10] }      // a > 10
{ $and: [expr1, expr2] }
{ $or: [expr1, expr2] }

// Toán học
{ $add: ['$a', '$b'] }        // a + b
{ $subtract: ['$a', '$b'] }   // a - b
{ $multiply: ['$a', '$b'] }   // a * b
{ $divide: ['$a', '$b'] }     // a / b

// Giá trị cố định
{ $literal: 0 }
```

---

## Pagination Pattern

```ts
const page = Math.max(1, inputPage)
const pageSize = Math.min(100, Math.max(1, inputPageSize))

const [data, total] = await Promise.all([
  mongo.collection
    .find(query)
    .sort({ _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean(),
  mongo.collection.countDocuments(query),
])

return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
```

---

## Index Rules

```
ESR: Equality → Sort → Range

Prefix Rule: { a, b, c } phục vụ { a }, { a, b }, { a, b, c }
                          KHÔNG phục vụ { b }, { c }, { b, c }
```

---

## ObjectId

```ts
import mongoose from 'mongoose'
const ObjectId = mongoose.Types.ObjectId

new ObjectId(stringId)                // String → ObjectId
ObjectId.isValid(stringId)            // Kiểm tra hợp lệ
id1.equals(id2)                       // So sánh (KHÔNG dùng ===)
id.toString()                         // ObjectId → String
```

---

## Models trong logics

```ts
import mongo from 'Mongo/index'      // ~100 models

mongo.users                           // Users
mongo.watchLists                      // Danh sách theo dõi
mongo.rooms                           // Phòng chat
mongo.analysisEvents                  // Events phân tích (100M+)
mongo.orders                          // Đơn hàng
mongo.notifications                   // Thông báo (TTL 7 ngày)
mongo.followerships                   // Follow relationships
mongo.portfolios                      // Danh mục đầu tư
mongo.experts                         // Chuyên gia
mongo.stocks                          // Thông tin cổ phiếu
```
