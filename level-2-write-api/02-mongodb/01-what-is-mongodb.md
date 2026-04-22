# MongoDB là gì?

## Mục tiêu

Hiểu MongoDB là gì, tại sao dùng trong dự án thật, và so sánh với những gì FE dev đã biết.

---

## 1. So sánh với localStorage

Là FE dev, bạn đã quen với `localStorage`:

```js
// Frontend - localStorage
localStorage.setItem('user', JSON.stringify({ name: 'Trung', age: 25 }))
const user = JSON.parse(localStorage.getItem('user'))
```

MongoDB cũng lưu dữ liệu dạng JSON (chính xác là BSON), nhưng:

| Tiêu chí | localStorage | MongoDB |
|---|---|---|
| Nơi lưu | Trình duyệt | Server |
| Dung lượng | ~5MB | Không giới hạn |
| Truy vấn | Chỉ get/set bằng key | Query phức tạp, filter, sort, aggregate |
| Chia sẻ | Chỉ 1 trình duyệt | Mọi client đều truy cập được |
| Mất dữ liệu | Xoá cache = mất | Lưu trữ vĩnh viễn trên disk |

## 2. So sánh với SQL (MySQL, PostgreSQL)

| Khái niệm SQL | MongoDB | Ví dụ trong logics |
|---|---|---|
| Database | Database | logics |
| Table | Collection | `watchLists`, `rooms`, `users` |
| Row | Document | 1 watchlist của 1 user |
| Column | Field | `name`, `symbols`, `point` |
| JOIN | Embed hoặc Reference | `rooms.owner` (embed), `watchLists.userId` (reference) |
| Schema cố định | Schema linh hoạt | Thêm field mới không cần migration |

## 3. Tại sao logics chọn MongoDB?

Dự án logics có ~100 collections:

```ts
// mongo/index.ts - export ~100 models
export default {
  users,
  watchLists,
  rooms,
  notifications,
  analysisEvents,
  portfolios,
  orders,
  // ... ~93 models khác
}
```

Lý do chọn MongoDB:

1. **Schema linh hoạt** - Mỗi room có `hotNews` là array of objects, mỗi object có cấu trúc khác nhau
2. **Nested objects** - `rooms.owner` chứa thông tin user ngay trong document, không cần JOIN
3. **Performance** - `analysisEvents` collection có 100M+ rows, aggregation pipeline xử lý tốt
4. **Developer experience** - Mongoose + TypeScript cho type safety

## 4. Cấu trúc dữ liệu trong MongoDB

```
Database: logics
├── Collection: users          (hàng triệu documents)
├── Collection: watchLists     (danh sách theo dõi cổ phiếu)
├── Collection: rooms          (phòng chat/cộng đồng)
├── Collection: analysisEvents (100M+ events phân tích)
├── Collection: orders         (đơn hàng thanh toán)
└── ... (~95 collections khác)
```

Mỗi document trong `watchLists` trông như thế này:

```json
{
  "_id": "ObjectId('65a1b2c3d4e5f6a7b8c9d0e1')",
  "userId": "ObjectId('64f1a2b3c4d5e6f7a8b9c0d1')",
  "name": "Cổ phiếu ngân hàng",
  "symbols": ["VCB", "TCB", "MBB"],
  "symbolsV2": [
    { "name": "VCB", "type": "stock" },
    { "name": "TCB", "type": "stock" }
  ],
  "point": 3,
  "isDeleted": false,
  "createdAt": "2024-01-12T10:30:00Z",
  "updatedAt": "2024-01-12T10:30:00Z"
}
```

## 5. Mongoose - ODM cho MongoDB

Logics dùng **Mongoose** - thư viện giúp làm việc với MongoDB trong Node.js:

```ts
import mongoose from 'mongoose'

// Định nghĩa schema (cấu trúc dữ liệu)
const schema = new mongoose.Schema({
  name: { type: String, required: true },
  symbols: { type: [String] },
  point: { type: Number, required: true },
}, { timestamps: true })

// Tạo model từ schema
export default mongoose.model('watchLists', schema)
```

Mongoose giống như TypeScript cho MongoDB - giúp bạn định nghĩa cấu trúc, validate dữ liệu, và có autocomplete.

## 6. BSON vs JSON

MongoDB lưu dữ liệu dạng BSON (Binary JSON), hỗ trợ thêm các kiểu dữ liệu:

| Kiểu | JSON | BSON (MongoDB) |
|---|---|---|
| String | "hello" | "hello" |
| Number | 42 | Int32, Int64, Double, Decimal128 |
| Boolean | true/false | true/false |
| Date | "2024-01-12" (string) | ISODate("2024-01-12") (native) |
| ID | Không có | ObjectId (12 bytes, unique) |
| Binary | Không có | BinData |

---

## Tóm tắt

- MongoDB lưu dữ liệu dạng document (giống JSON object)
- Không cần định nghĩa schema cứng như SQL (nhưng Mongoose giúp validate)
- Phù hợp cho dữ liệu có cấu trúc linh hoạt và nested objects
- Dự án logics dùng ~100 MongoDB collections qua Mongoose

## Bài tập

1. Mở MongoDB Compass, kết nối tới local MongoDB, tạo database `test_learning`
2. Tạo collection `notes`, thêm 3 documents với các field: `title`, `content`, `tags` (array)
3. So sánh: nếu dùng SQL cho `rooms.owner` (nested object), cần bao nhiêu tables?
