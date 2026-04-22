# Cách trả response — Các pattern chuẩn

## So sánh với FE

Ở FE bạn quen với dạng response khi gọi API:

```ts
// FE gọi API và nhận response
const { data } = await api.get('/rooms/mine')
const { data, paging } = await api.get('/rooms?page=1')
```

Ở BE, bạn là người **tạo ra** cấu trúc response đó. Dự án logics có 3 pattern chuẩn.

---

## Pattern 1: `{ data }` — Trả dữ liệu đơn giản

Dùng khi: tạo, cập nhật, xóa, hoặc lấy chi tiết một object.

### Code thật — createRoom

```ts
public async createRoom({ util, maker }: HttpContextContract) {
  await util.auth.expert()

  const name = util.gp('name')
  const description = util.gp('description')
  // ... validate ...

  const { data, error } = await social_service.RoomService.createRoom({
    makerId: maker?._id, name, description, /* ... */
  })

  util.check(!error, error)

  return { data }  // ← Chỉ trả data
}
```

**Response client nhận được:**

```json
{
  "data": {
    "_id": "65a1b2c3d4e5f6...",
    "name": "Phòng học TypeScript",
    "description": "Mô tả...",
    "isPrivate": false
  }
}
```

### Các endpoint dùng pattern này:

```ts
// Tạo
return { data }         // createRoom, joinRoom

// Xóa
return { data }         // deleteRoom, leaveRoom

// Cập nhật
return { data }         // updateRoom, updateRoomMember

// Chi tiết
return { data }         // detailRoom
```

---

## Pattern 2: `{ data, paging }` — Trả danh sách có phân trang

Dùng khi: lấy danh sách nhiều items.

### Code thật — listMyRooms

```ts
public async listMyRooms({ util, maker }: HttpContextContract) {
  await util.auth.login()

  const page = util.gp('page', 1, 'number')
  const pageSize = util.gp('pageSize', 10, 'number')
  const roles = util.gp('roles', null, 'comma')

  const { data, error, total } = await social_service.RoomService.listMyRooms({
    makerId: maker?._id,
    page,
    pageSize,
    roles,
  })

  util.check(!error, error)

  const paging = {
    total,      // Tổng số items
    page,       // Trang hiện tại
    pageSize,   // Số items mỗi trang
  }

  return { data, paging }  // ← Trả cả data và paging
}
```

**Response client nhận được:**

```json
{
  "data": [
    { "_id": "...", "name": "Phòng 1" },
    { "_id": "...", "name": "Phòng 2" }
  ],
  "paging": {
    "total": 45,
    "page": 1,
    "pageSize": 10
  }
}
```

### Phân trang luôn dùng 3 trường:

| Trường | Ý nghĩa | Ai cung cấp |
|---|---|---|
| `total` | Tổng số items thỏa điều kiện | Service trả về |
| `page` | Trang hiện tại | Client gửi lên |
| `pageSize` | Số items mỗi trang | Client gửi lên |

FE có thể tính: `totalPages = Math.ceil(total / pageSize)`

### Code thật — listRooms (cùng pattern)

```ts
public async listRooms({ util, maker }: HttpContextContract) {
  const page = util.gp('page', 1, 'number')
  const pageSize = util.gp('pageSize', 12, 'number')  // Có thể đặt default khác
  const isPrivate = util.gp('isPrivate', null, 'boolean')

  if (isPrivate) {
    await util.auth.admin()  // Phòng private chỉ admin xem
  }

  const { data, error, total } = await social_service.RoomService.listRooms({
    makerId: maker?._id, page, pageSize, isPrivate,
  })

  util.check(!error, error)

  const paging = { total, page, pageSize }

  return { data, paging }
}
```

### Code thật — getTutorials (cùng pattern)

```ts
public async getTutorials({ util }: HttpContextContract) {
  const page = util.gp('page', 1, 'number')
  const pageSize = util.gp('pageSize', 10, 'number')
  const categories = util.gp('categories', [TutorialCategoryEnum.GENERAL], 'comma')
  const statuses = util.gp('statuses', [TutorialStatusEnum.PUBLISHED], 'comma')

  // ... query database ...

  const paging = { page, pageSize, total }

  return { data: list, paging }
}
```

---

## Pattern 3: Lỗi — tự động qua util.check()

Bạn **không cần tự trả lỗi**. Khi `util.check()` fail hoặc `util.gp()` thiếu tham số bắt buộc, framework tự trả response lỗi.

```ts
// Code này:
util.check(name.length >= 5, 'Tên phòng phải có từ 5 đến 200 ký tự.')

// Khi name quá ngắn, client nhận được:
// HTTP 400
// { "error": { "message": "Tên phòng phải có từ 5 đến 200 ký tự." } }
```

```ts
// Code này:
util.check(expert, 'Không tìm thấy chuyên gia code:expert_not_found')

// Khi expert = null, client nhận được:
// HTTP 400
// { "error": { "message": "Không tìm thấy chuyên gia", "code": "expert_not_found" } }
```

---

## Quy tắc nhất quán

### Luôn dùng `page` và `pageSize` — KHÔNG dùng `limit` / `offset`

```ts
// SAI
const limit = util.gp('limit', 10, 'number')
const offset = util.gp('offset', 0, 'number')

// ĐÚNG
const page = util.gp('page', 1, 'number')
const pageSize = util.gp('pageSize', 10, 'number')
```

### Cấu trúc paging luôn giống nhau

```ts
// Mọi endpoint phân trang đều trả đúng format này
const paging = {
  total,     // number — tổng items
  page,      // number — trang hiện tại (bắt đầu từ 1)
  pageSize,  // number — items mỗi trang
}

return { data, paging }
```

---

## Tóm tắt

| Loại endpoint | Response format |
|---|---|
| Tạo / Sửa / Xóa / Chi tiết | `return { data }` |
| Danh sách có phân trang | `return { data, paging }` |
| Lỗi (tự động) | `{ error: { message, code? } }` |

Phân trang luôn dùng: `page` (trang), `pageSize` (số items/trang), `total` (tổng).
