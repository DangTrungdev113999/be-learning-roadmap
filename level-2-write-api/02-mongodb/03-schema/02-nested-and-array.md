# Nested Objects và Arrays trong Schema

## Mục tiêu

Hiểu cách MongoDB lưu dữ liệu lồng nhau (nested) và mảng (array) - điểm mạnh so với SQL.

---

## 1. Nested Object - Object lồng

Trong SQL, bạn cần bảng riêng + JOIN. Trong MongoDB, nhúng luôn vào document:

```ts
// mongo/rooms.ts - Owner là nested object
const schema = new mongoose.Schema({
  name: String,

  owner: {
    _id: String,
    identity: String,
    fullName: String,
    avatar: String,
    expertId: String,
    expertUsername: String,
    expertLevel: Number,
  },
})
```

Document trong MongoDB:

```json
{
  "name": "Phòng Đầu tư Giá trị",
  "owner": {
    "_id": "user123",
    "identity": "trungdt",
    "fullName": "Trung Đào",
    "avatar": "https://cdn.example.com/avatar.jpg",
    "expertId": "expert456",
    "expertLevel": 3
  }
}
```

> **So sánh SQL**: Cần bảng `rooms` + bảng `users` + JOIN. MongoDB nhúng trực tiếp, query 1 lần là đủ.

## 2. Nested Object sâu hơn

```ts
// mongo/rooms.ts - affiliate cũng là nested object
const schema = new mongoose.Schema({
  affiliate: {
    commissionRate: {
      type: Number,
      default: roomConfig.affiliateCommissionRate,
    },
    commissionCapacityRate: {
      type: Number,
      default: roomConfig.expertCommissionRate,
    },
  },
})
```

```ts
// mongo/users.ts - plan là nested object phức tạp
const schema = new mongoose.Schema({
  plan: {
    expiredDate: Date,
    level: { type: String, enum: Object.values(PlanLevel), default: PlanLevel.BASIC },
    method: { type: String, enum: Object.values(OrderPaymentMethod) },
    key: String,
    name: String,
    price: Number,
    duration: Number,
    unit: String,
  },
})
```

## 3. Array of Strings

Mảng đơn giản nhất:

```ts
// mongo/watchLists.ts
const schema = new mongoose.Schema({
  symbols: { type: [String] },   // ["VCB", "TCB", "MBB"]
})
```

```ts
// mongo/users.ts
const schema = new mongoose.Schema({
  roles: [String],    // ["admin", "expert"]
  bans: [String],     // ["chat", "post"]
})
```

## 4. Array of Objects

Mảng chứa các object - pattern rất phổ biến:

```ts
// mongo/watchLists.ts - symbolsV2 là array of objects
const schema = new mongoose.Schema({
  symbolsV2: [
    {
      _id: false,          // Không tự sinh _id cho mỗi phần tử
      name: String,
      type: { type: String },
    },
  ],
})
```

Data:

```json
{
  "symbolsV2": [
    { "name": "VCB", "type": "stock" },
    { "name": "VNINDEX", "type": "index" },
    { "name": "GOLD", "type": "commodity" }
  ]
}
```

## 5. Array of Objects phức tạp

```ts
// mongo/rooms.ts - hotNews là array of objects phức tạp
const schema = new mongoose.Schema({
  hotNews: [
    {
      _id: String,
      type: { type: String },
      title: String,
      shortDesc: String,
      content: Object,
      createdAt: Date,
      isPro: Boolean,
      unlockDate: Date,
      logPortfolio: Object,
    },
  ],
})
```

## 6. `_id: false` trong subdocument

Mặc định, Mongoose tự thêm `_id` cho mỗi phần tử trong array of objects:

```ts
// Không có _id: false
symbolsV2: [{ name: String, type: { type: String } }]
// Kết quả: { _id: ObjectId(...), name: "VCB", type: "stock" }

// Có _id: false
symbolsV2: [{ _id: false, name: String, type: { type: String } }]
// Kết quả: { name: "VCB", type: "stock" }
```

> Dùng `_id: false` khi bạn không cần truy cập từng phần tử trong array bằng ID.

## 7. Array of nested objects trong users.ts

```ts
// mongo/users.ts - banks là array of nested objects
const schema = new mongoose.Schema({
  banks: [
    {
      _id: false,
      name: String,        // "Vietcombank"
      key: String,         // "VCB"
      code: String,        // "970436"
      logo: String,
      beneficiary: String, // "NGUYEN VAN A"
      number: String,      // "0123456789"
    },
  ],
})
```

## 8. Khi nào embed, khi nào reference?

| Tiêu chí | Embed (nhúng) | Reference (tham chiếu) |
|---|---|---|
| Kích thước | Nhỏ, ít thay đổi | Lớn, thay đổi thường xuyên |
| Truy vấn | Luôn cần cùng lúc | Đôi khi mới cần |
| Ví dụ | `rooms.owner` | `watchLists.userId` → `users._id` |
| Ưu điểm | Query 1 lần, nhanh | Dữ liệu không trùng lặp |
| Nhược điểm | Dữ liệu có thể lỗi thời | Cần query thêm |

Trong logics:

- `rooms.owner` - **Embed**: Khi hiển thị room luôn cần info owner
- `watchLists.userId` - **Reference**: User có nhiều dữ liệu, chỉ cần ID để tra cứu
- `rooms.hotNews` - **Embed**: Hot news gắn chặt với room

---

## Bài tập

1. Viết schema cho `blogPosts` với: `title`, `author` (nested: name, avatar), `tags` ([String]), `comments` (array of objects: userId, content, createdAt)
2. Giải thích tại sao `rooms.owner` dùng embed thay vì reference
3. Document MongoDB tối đa 16MB. Nếu `hotNews` có 10.000 items, điều gì xảy ra?
