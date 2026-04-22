# Schema Patterns -- 5 mẫu thiết kế schema nâng cao

## Mục tiêu

Nắm 5 schema patterns thường dùng trong MongoDB. Mỗi pattern giải quyết một bài toán cụ thể mà embed/reference đơn thuần không đủ.

---

## 1. Subset Pattern -- Chỉ embed những gì cần

### Vấn đề

Document cha cần hiển thị một phần thông tin từ document con, nhưng không cần tất cả.

### Giải pháp

Embed **subset** (tập con) các fields thường đọc. Giữ full data ở collection riêng.

### Ví dụ thực tế: posts.creator trong Finpath

```ts
// users collection -- full user document (~40 fields)
{
  _id: ObjectId('u1'),
  identity: 'trung',
  fullName: 'Trung',
  avatar: '/trung.jpg',
  password: '$2b$10$...',        // Nhạy cảm
  plan: { level: 'PRO', ... },   // Không cần khi hiển thị post
  bank: { number: '...' },       // Nhạy cảm
  margin: { enable: true, ... }, // Không liên quan
  // ... 30+ fields khác
}

// posts collection -- embed subset
{
  title: 'Phân tích VNM Q4',
  creator: {
    _id: 'u1',            // Giữ ID để reference khi cần
    identity: 'trung',
    fullName: 'Trung',
    avatar: '/trung.jpg',
    expertId: 'e1',
  },
}
```

**Tại sao không embed full user?**
- Lãng phí bộ nhớ (mỗi post thêm ~2KB cho data không cần)
- Rủi ro bảo mật (password, bank info lộ qua API)
- Document post phình to không cần thiết

**Tại sao không chỉ reference userId?**
- Feed hiển thị 20 posts = 20 query thêm để lấy user info (N+1 problem)
- Performance quan trọng vì feed là trang chính

### Khi nào dùng

- Cần hiển thị **một phần** thông tin từ document khác
- Data embed ít thay đổi (tên, avatar)
- Read performance quan trọng hơn write complexity

---

## 2. Computed Pattern -- Tính trước, lưu kết quả

### Vấn đề

Một giá trị cần tính toán từ nhiều documents khác. Tính mỗi lần đọc thì chậm.

### Giải pháp

Tính trước và lưu kết quả vào document. Update khi data thay đổi.

### Ví dụ thực tế: rooms.numberOfMember

```ts
// mongo/rooms.ts
const schema = new mongoose.Schema({
  name: String,
  numberOfMember: {
    type: Number,
    default: 0,
  },
  numberOfHotnews: {
    type: Number,
    default: 0,
  },
})
```

**Không có computed pattern:**

```ts
// ❌ Mỗi lần load rooms, phải đếm members
const rooms = await mongo.rooms.find().lean()
for (const room of rooms) {
  room.memberCount = await mongo.roomMembers.countDocuments({
    roomId: room._id,
    isDeleted: { $ne: true },
  })
  // 100 rooms = 100 count queries!
}
```

**Có computed pattern:**

```ts
// ✅ numberOfMember đã lưu sẵn, chỉ cần 1 query
const rooms = await mongo.rooms.find().lean()
// rooms[0].numberOfMember = 1500 (đã có sẵn)

// Update khi member join/leave
await mongo.rooms.updateOne(
  { _id: roomId },
  { $inc: { numberOfMember: 1 } },  // Atomic increment
)
```

### Ví dụ khác: posts counters

```ts
// mongo/posts.ts
{
  numberOfComment: { type: Number, default: 0 },
  numberOfReact: { type: Number, default: 0 },
  numberOfView: { type: Number, default: 0 },
  numberOfSave: { type: Number, default: 0 },
  numberOfShare: { type: Number, default: 0 },
}
```

Mỗi counter được update bằng `$inc` khi có action tương ứng. Load post = có ngay tất cả counts mà không cần aggregate.

### So sánh FE

```typescript
// FE: useMemo -- tính lại khi dependencies thay đổi
const totalPrice = useMemo(() => {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0)
}, [items])

// BE: Computed pattern -- tính và lưu khi data thay đổi
await mongo.rooms.updateOne({ _id: roomId }, { $inc: { numberOfMember: 1 } })
```

**Giống nhau:** Tránh tính đi tính lại. **Khác nhau:** FE tính ở client mỗi render, BE tính 1 lần và lưu vào DB.

### Khi nào dùng

- Giá trị được **đọc thường xuyên** nhưng data gốc **ít thay đổi**
- Tính toán phức tạp (aggregate nhiều documents)
- Chấp nhận giá trị có thể **tạm thời không chính xác** (eventual consistency)

---

## 3. Bucket Pattern -- Nhóm dữ liệu theo khoảng thời gian

### Vấn đề

Data time-series (giá cổ phiếu mỗi giây, events mỗi phút) tạo ra **hàng triệu documents nhỏ**. Mỗi document có overhead (~100 bytes cho _id, metadata).

### Giải pháp

Nhóm nhiều data points vào **1 document** (bucket) theo khoảng thời gian.

### Ví dụ: Giá cổ phiếu

```ts
// ❌ 1 document mỗi giây = 23,400 documents/ngày/mã (6.5 giờ giao dịch)
{
  _id: ObjectId(),
  code: 'VNM',
  price: 85000,
  volume: 100,
  timestamp: ISODate('2026-03-18T09:00:01'),
}

// ✅ Bucket: 1 document mỗi phút = 390 documents/ngày/mã
{
  code: 'VNM',
  date: '2026-03-18',
  minute: '09:00',
  data: [
    { second: 1, price: 85000, volume: 100 },
    { second: 5, price: 85100, volume: 200 },
    { second: 12, price: 85050, volume: 150 },
    // ... tối đa 60 entries
  ],
  count: 42,
  avgPrice: 85050,
  maxPrice: 85200,
  minPrice: 84900,
  totalVolume: 5000,
}
```

### Lợi ích

| Metric | Không bucket | Có bucket (1 phút) |
|---|---|---|
| Documents/ngày/mã | 23,400 | 390 |
| Index entries | 23,400 | 390 |
| Overhead | ~2.3MB | ~39KB |
| Query 1 ngày | Scan 23K docs | Scan 390 docs |

### Kết hợp với Computed

Bucket thường kết hợp **computed values** trong mỗi bucket:

```ts
{
  // Computed aggregates cho bucket này
  count: 42,
  avgPrice: 85050,
  maxPrice: 85200,
  minPrice: 84900,
  totalVolume: 5000,
}
```

Query "giá cao nhất ngày" chỉ cần so sánh `maxPrice` của 390 buckets thay vì scan 23,400 documents.

### Khi nào dùng

- Data time-series (logs, giá, events, metrics)
- Data points nhỏ và nhiều
- Thường query theo khoảng thời gian

---

## 4. Polymorphic Pattern -- Nhiều loại trong 1 collection

### Vấn đề

Có nhiều loại đối tượng giống nhau 80% nhưng khác nhau 20%. Tạo collection riêng cho mỗi loại thì thừa, lẫn lộn thì khó quản lý.

### Giải pháp

Lưu chung 1 collection, dùng **type field** để phân biệt. Mỗi type có thể có fields riêng.

### Ví dụ thực tế: notifications trong Finpath

```ts
// Tất cả notifications lưu chung 1 collection
// "category" field phân biệt loại

// Notification đặt lệnh
{
  userId: ObjectId('u1'),
  category: 'order',
  title: 'Đặt lệnh thành công',
  content: 'Mua VNM x100',
  metadata: { orderId: 'o1', symbol: 'VNM', quantity: 100 },
}

// Notification follow
{
  userId: ObjectId('u1'),
  category: 'follow',
  title: 'Người theo dõi mới',
  content: 'Minh đã theo dõi bạn',
  metadata: { followerId: 'u2', followerName: 'Minh' },
}

// Notification giá
{
  userId: ObjectId('u1'),
  category: 'price_alert',
  title: 'VNM đạt giá mục tiêu',
  content: 'VNM = 90,000',
  metadata: { symbol: 'VNM', targetPrice: 90000, currentPrice: 90100 },
}
```

### So sánh FE: Union Types

```typescript
// FE: TypeScript union type
type Notification =
  | { type: 'order'; orderId: string; symbol: string }
  | { type: 'follow'; followerId: string }
  | { type: 'price_alert'; symbol: string; targetPrice: number }

// Render dựa vào type
switch (notification.type) {
  case 'order':
    return <OrderNotification {...notification} />
  case 'follow':
    return <FollowNotification {...notification} />
}
```

```ts
// BE: MongoDB polymorphic
// Shared fields: userId, category, title, content, createdAt
// Type-specific: metadata object khác nhau
```

### Ưu điểm

- 1 query lấy tất cả notifications cho user (không cần UNION nhiều collections)
- Index chung: `{ userId: 1, createdAt: 1 }`
- Thêm loại notification mới không cần tạo collection mới

### Khi nào dùng

- Nhiều loại đối tượng có **common fields** (userId, createdAt, status)
- Thường query **tất cả loại** cùng lúc (feed, notifications, logs)
- Số loại có thể tăng theo thời gian

---

## 5. Tree Pattern -- Dữ liệu phân cấp

### Vấn đề

Data có cấu trúc cây: categories, org chart, menu. Cần query "tất cả con" hoặc "đường đi từ gốc".

### 3 cách lưu Tree trong MongoDB

#### a) Parent Reference (đơn giản nhất)

```ts
// Mỗi node giữ ID của parent
{ _id: 'tech', name: 'Công nghệ', parentId: null }
{ _id: 'software', name: 'Phần mềm', parentId: 'tech' }
{ _id: 'hardware', name: 'Phần cứng', parentId: 'tech' }
{ _id: 'ai', name: 'AI', parentId: 'software' }

// Tìm con trực tiếp: dễ
db.categories.find({ parentId: 'tech' })

// Tìm tất cả con cháu: KHÓ -- phải recursive query
```

**Giống FE:** Component tree với `parentId`.

#### b) Materialized Path (lưu đường đi)

```ts
// Mỗi node lưu full path từ root
{ _id: 'tech', name: 'Công nghệ', path: '/tech' }
{ _id: 'software', name: 'Phần mềm', path: '/tech/software' }
{ _id: 'ai', name: 'AI', path: '/tech/software/ai' }

// Tìm tất cả con cháu: regex trên path
db.categories.find({ path: /^\/tech/ })

// Tìm ancestors: split path
'/tech/software/ai'.split('/') → ['tech', 'software', 'ai']
```

#### c) Array of Ancestors

```ts
// Mỗi node lưu danh sách tổ tiên
{ _id: 'ai', name: 'AI', ancestors: ['tech', 'software'] }

// Tìm tất cả con cháu của 'tech'
db.categories.find({ ancestors: 'tech' })

// Tìm ancestors: có sẵn trong array
```

### Ví dụ thực tế: Sectors trong Finpath

Ngành nghề cổ phiếu có cấu trúc phân cấp:

```
Tài chính
├── Ngân hàng
│   ├── Ngân hàng thương mại
│   └── Ngân hàng đầu tư
├── Bảo hiểm
└── Chứng khoán

Công nghệ
├── Phần mềm
└── Viễn thông
```

### So sánh với FE: Nested menu / file tree

```typescript
// FE: Nested object (recursive component)
const menuItems = {
  id: 'root',
  children: [
    {
      id: 'tech',
      label: 'Công nghệ',
      children: [
        { id: 'software', label: 'Phần mềm', children: [] },
      ],
    },
  ],
}

// BE: Flat documents với parent reference hoặc materialized path
// Vì MongoDB không hỗ trợ recursive query tốt như nested objects
```

### Khi nào dùng pattern nào

| Pattern | Ưu | Nhược | Dùng khi |
|---|---|---|---|
| Parent Reference | Đơn giản, update dễ | Query con cháu chậm | Cây nông, ít query depth |
| Materialized Path | Query subtree nhanh (regex) | Update parent phải sửa path tất cả con | Cây ít thay đổi cấu trúc |
| Array of Ancestors | Query subtree nhanh, ancestors có sẵn | Tốn bộ nhớ, update phải sửa tất cả con | Cần cả subtree và ancestors |

---

## Tổng hợp: Khi nào dùng pattern nào?

| Pattern | Bài toán | Ví dụ Finpath |
|---|---|---|
| Subset | Embed vài fields để đọc nhanh | `posts.creator`, `rooms.owner` |
| Computed | Tính trước giá trị đắt | `rooms.numberOfMember`, `posts.numberOfReact` |
| Bucket | Time-series data nhiều documents nhỏ | Giá cổ phiếu, bar data |
| Polymorphic | Nhiều loại chung collection | `notifications.category`, `analysisEvents.key` |
| Tree | Dữ liệu phân cấp | Sectors, categories |

---

## Tóm tắt

| Pattern | Một câu giải thích |
|---|---|
| Subset | Chỉ embed fields cần hiển thị, giữ ID để reference khi cần full |
| Computed | Tính 1 lần lưu vào document, không tính lại mỗi lần đọc |
| Bucket | Nhóm nhiều data points nhỏ vào 1 document, giảm overhead |
| Polymorphic | 1 collection chứa nhiều loại, phân biệt bằng type field |
| Tree | Lưu quan hệ cha-con bằng parentId, path, hoặc ancestors array |

## Bài tập

1. Collection `reviews` cần hiển thị tên + avatar người review. Thiết kế schema dùng Subset pattern.
2. Collection `rooms` cần biết tổng số bài viết. Thiết kế computed field và viết update logic.
3. Bạn cần lưu lịch sử giá vàng mỗi phút. Thiết kế schema dùng Bucket pattern, chọn kích thước bucket phù hợp.
4. Hệ thống cần lưu: bài viết (post), câu hỏi (question), tin tức (news). Đều có title, content, userId, createdAt. Dùng 1 collection hay 3? Phân tích bằng Polymorphic pattern.
