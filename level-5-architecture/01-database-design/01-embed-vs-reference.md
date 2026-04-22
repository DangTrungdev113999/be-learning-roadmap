# Embed vs Reference -- Quyết định thiết kế quan trọng nhất trong MongoDB

## Mục tiêu

Hiểu khi nào nên embed (nhúng) data vào document, khi nào nên reference (tham chiếu) sang collection khác. So sánh với normalized/denormalized state bên FE.

---

## 1. Hai cách lưu quan hệ dữ liệu

### Embed (nhúng trực tiếp)

Data con nằm **bên trong** document cha.

```ts
// mongo/rooms.ts -- owner được embed vào room
const schema = new mongoose.Schema({
  name: String,
  owner: {
    _id: String,
    identity: String,
    fullName: String,
    avatar: String,
  },
  hotNews: [
    {
      title: String,
      content: Object,
      createdAt: Date,
    },
  ],
})
```

Khi query `rooms.findOne({ _id: roomId })`, bạn có ngay thông tin owner mà **không cần query thêm**.

### Reference (tham chiếu qua ID)

Chỉ lưu ID, khi cần thì query collection khác.

```ts
// mongo/watchLists.ts -- userId tham chiếu sang users collection
const schema = new mongoose.Schema({
  userId: {
    type: ObjectId,
    required: true,
    index: true,
  },
  name: String,
  symbols: [String],
})
```

Khi cần thông tin user, phải query thêm: `users.findOne({ _id: watchList.userId })`.

---

## 2. So sánh với FE -- Normalized vs Denormalized state

### Denormalized (giống Embed)

```typescript
// FE: Denormalized state -- mỗi post chứa full user info
const posts = [
  {
    id: '1',
    title: 'Phân tích VNM',
    author: { id: 'u1', name: 'Trung', avatar: '/trung.jpg' },
  },
  {
    id: '2',
    title: 'Nhận định thị trường',
    author: { id: 'u1', name: 'Trung', avatar: '/trung.jpg' }, // duplicate!
  },
]
// Ưu: Render nhanh, không cần lookup
// Nhược: User đổi avatar → phải update TẤT CẢ posts
```

```ts
// BE: rooms.ts embed owner
{ name: 'Phòng VNM', owner: { _id: 'u1', fullName: 'Trung', avatar: '/trung.jpg' } }
// Giống hệt! Đọc nhanh, nhưng user đổi avatar → phải update nhiều rooms
```

### Normalized (giống Reference)

```typescript
// FE: Normalized state (Redux style)
const state = {
  users: { u1: { name: 'Trung', avatar: '/trung.jpg' } },
  posts: {
    p1: { title: 'Phân tích VNM', authorId: 'u1' },
    p2: { title: 'Nhận định thị trường', authorId: 'u1' },
  },
}
// Ưu: Update user 1 chỗ, tất cả posts tự đúng
// Nhược: Render phải lookup: users[post.authorId]
```

```ts
// BE: watchLists.ts reference userId
{ name: 'Danh mục theo dõi', userId: ObjectId('u1') }
// Giống hệt! Update user 1 chỗ, nhưng đọc phải JOIN
```

### So sánh tổng hợp

| Đặc điểm | FE Denormalized | BE Embed | FE Normalized | BE Reference |
|---|---|---|---|---|
| Đọc | Nhanh (có sẵn) | Nhanh (1 query) | Cần lookup | Cần JOIN/populate |
| Ghi | Chậm (update nhiều chỗ) | Chậm | Nhanh (1 chỗ) | Nhanh (1 chỗ) |
| Consistency | Có thể inconsistent | Có thể inconsistent | Luôn consistent | Luôn consistent |
| Kích thước | State lớn hơn | Document lớn hơn | State gọn hơn | Document nhỏ hơn |

---

## 3. Decision Tree -- Khi nào Embed, khi nào Reference?

```
                     Quan hệ dữ liệu?
                          │
               ┌──────────┼──────────┐
               ▼                      ▼
          1:few (1:ít)           1:many (1:nhiều)
               │                      │
               ▼                      │
      Data thay đổi thường?     ┌─────┼──────┐
          │         │           ▼            ▼
         Có        Không    1:vài trăm   1:vài triệu
          │         │           │            │
          ▼         ▼           ▼            ▼
      Reference   Embed    Embed nếu     Reference
                           ít thay đổi    (LUÔN LUÔN)
```

### Quy tắc ngắn gọn

| Điều kiện | Chọn | Ví dụ trong Finpath |
|---|---|---|
| Data con ít thay đổi | Embed | `rooms.owner` -- tên/avatar user hiếm khi đổi |
| Luôn cần khi đọc cha | Embed | `rooms.hotNews` -- hiển thị room luôn cần hotNews |
| Data con thay đổi thường xuyên | Reference | `watchLists.userId` -- user info update nhiều |
| Có thể phình to không giới hạn | Reference | comments, transactions -- mỗi post có thể 10k comments |
| Cần query độc lập | Reference | `posts.userId` -- cần tìm posts theo nhiều tiêu chí |
| Data con dùng chung cho nhiều cha | Reference | `users` -- 1 user xuất hiện trong nhiều collections |

---

## 4. Phân tích real cases trong Finpath

### Case 1: rooms.owner (Embed) -- Quyết định đúng

```ts
// mongo/rooms.ts
owner: {
  _id: String,
  identity: String,
  fullName: String,
  avatar: String,
  expertId: String,
}
```

**Tại sao embed?**
- Mỗi room **luôn** cần hiển thị thông tin owner
- Tên và avatar user **hiếm khi** thay đổi
- Chỉ embed **vài fields** cần thiết (không embed cả user document)
- Tránh JOIN khi load danh sách rooms (performance quan trọng vì hiển thị trên home)

**Trade-off:** Khi user đổi avatar, phải update tất cả rooms của user đó:

```ts
await mongo.rooms.updateMany(
  { 'owner._id': userId },
  { $set: { 'owner.avatar': newAvatar, 'owner.fullName': newName } },
)
```

### Case 2: rooms.hotNews (Embed Array) -- Có giới hạn

```ts
// mongo/rooms.ts
hotNews: [
  {
    _id: String,
    title: String,
    content: Object,
    createdAt: Date,
    isPro: Boolean,
  },
]
```

**Tại sao embed?**
- HotNews thuộc về room, không tồn tại độc lập
- Mỗi room chỉ có **vài** hotNews (có giới hạn, không phình vô hạn)
- Load room = cần hotNews ngay

**Nguy hiểm nếu không giới hạn:** MongoDB document tối đa 16MB. Nếu hotNews không giới hạn, document sẽ phình quá 16MB.

### Case 3: watchLists.userId (Reference) -- Quyết định đúng

```ts
// mongo/watchLists.ts
userId: {
  type: ObjectId,
  required: true,
  index: true,
}
```

**Tại sao reference?**
- 1 user có **nhiều** watchlists
- Cần query watchlists theo userId (index trên userId)
- User info thay đổi (plan, avatar, settings) -- nếu embed phải update tất cả watchlists

### Case 4: posts.creator (Embed Subset) -- Pattern thông minh

```ts
// mongo/posts.ts
creator: {
  _id: String,
  identity: String,
  fullName: String,
  avatars: Array,
  username: String,
  expertId: String,
}
```

**Tại sao không reference?** Posts cần hiển thị tên + avatar người viết. Nếu reference, mỗi lần load feed 20 posts = 20 thêm queries tìm user. Embed vài fields cần hiển thị = 1 query duy nhất.

**Tại sao không embed full user?** User document trong Finpath có ~40 fields (plan, bank, margin, kyc...). Embed hết vừa lãng phí, vừa có vấn đề bảo mật (password, bank info).

---

## 5. Anti-patterns -- Sai lầm thường gặp

### Anti-pattern 1: Embed array không giới hạn

```ts
// ❌ Mỗi post có thể có hàng nghìn comments
const postSchema = {
  title: String,
  comments: [{ userId: ObjectId, content: String, createdAt: Date }],
}
// Document phình to → vượt 16MB → crash

// ✅ Tách collection riêng
const commentSchema = {
  postId: { type: ObjectId, index: true },
  userId: ObjectId,
  content: String,
}
```

### Anti-pattern 2: Reference khi luôn cần data

```ts
// ❌ Load feed phải query 20 users
const posts = await mongo.posts.find().limit(20)
for (const post of posts) {
  post.user = await mongo.users.findOne({ _id: post.userId }) // N+1 problem!
}

// ✅ Embed subset
const posts = await mongo.posts.find().limit(20)
// post.creator đã có sẵn { fullName, avatar }
```

### Anti-pattern 3: Embed data thay đổi thường xuyên

```ts
// ❌ Giá cổ phiếu thay đổi mỗi giây
const watchListSchema = {
  stocks: [
    {
      code: 'VNM',
      price: 85000,        // Thay đổi liên tục!
      change: 1.5,         // Thay đổi liên tục!
      volume: 1000000,     // Thay đổi liên tục!
    },
  ],
}

// ✅ Chỉ embed code, lấy giá từ Redis
const watchListSchema = {
  symbols: ['VNM', 'FPT', 'HPG'],
}
// Giá realtime lấy từ Redis overviewStock (xem redis/models/overviewStock.ts)
```

---

## 6. Khi nào cần kết hợp cả hai?

Finpath dùng pattern **Hybrid**: embed subset cho đọc nhanh, reference cho update dễ.

```ts
// rooms.ts -- embed owner subset để hiển thị nhanh
owner: {
  _id: String,       // Giữ ID để reference khi cần full user info
  fullName: String,   // Embed để hiển thị
  avatar: String,     // Embed để hiển thị
}

// Khi cần full user info (ví dụ: trang profile owner):
const room = await mongo.rooms.findOne({ _id: roomId })
const fullOwner = await mongo.users.findOne({ _id: room.owner._id })
```

---

## Tóm tắt

| Quy tắc | Giải thích |
|---|---|
| Embed khi đọc cùng nhau | Data luôn cần khi load document cha |
| Embed khi ít thay đổi | Tránh phải update nhiều documents |
| Embed khi có giới hạn | Array không được phình vô hạn (16MB limit) |
| Reference khi thay đổi nhiều | Update 1 chỗ, không phải sync |
| Reference khi query độc lập | Cần tìm kiếm, filter, aggregate riêng |
| Subset pattern | Embed vài fields cần thiết + giữ ID để reference |

## Bài tập

1. Collection `orders` cần hiển thị tên + avatar người đặt lệnh. Nên embed hay reference user info? Tại sao?
2. Mỗi user có danh sách `devices` (tối đa 5). Nên embed hay tách collection? Phân tích trade-offs.
3. Tìm 2 collections trong `mongo/` mà dùng embed, 2 collections dùng reference. Giải thích tại sao mỗi cái chọn đúng.
