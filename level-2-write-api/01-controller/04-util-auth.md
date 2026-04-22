# util.auth — Xác thực và phân quyền

## So sánh với FE

Ở FE bạn kiểm tra quyền truy cập:

```ts
// Next.js — protected route
const { user, isLoggedIn } = useAuth()
if (!isLoggedIn) redirect('/login')

// Route guard
<ProtectedRoute requiredRole="admin">
  <AdminPage />
</ProtectedRoute>
```

Ở BE, `util.auth` làm điều tương tự — kiểm tra token trong request header, xác thực user, và phân quyền.

---

## 4 cấp độ xác thực

| Method | Yêu cầu | Khi nào dùng |
|---|---|---|
| `util.auth.login()` | Đã đăng nhập | Tính năng cần biết user là ai |
| `util.auth.expert()` | Là chuyên gia (expert) | Tính năng dành riêng cho expert |
| `util.auth.admin()` | Là admin | Tính năng quản trị |
| `util.auth.admin(false)` | Kiểm tra admin **không throw lỗi** | Chỉ cần biết có phải admin không |

---

## Code thật từ dự án

### `util.auth.login()` — Chỉ cần đăng nhập

```ts
// RoomsController.listMyRooms — xem danh sách phòng của mình
public async listMyRooms({ util, maker }: HttpContextContract) {
  await util.auth.login()  // Ai đăng nhập cũng xem được phòng của mình

  const page = util.gp('page', 1, 'number')
  const pageSize = util.gp('pageSize', 10, 'number')
  // ...
}
```

```ts
// RoomsController.joinRoom — tham gia phòng
public async joinRoom({ util, maker }: HttpContextContract) {
  await util.auth.login()  // Đăng nhập mới được join

  const _id = util.gp('_id')
  const { data, error } = await social_service.RoomService.joinRoom({
    _id, makerId: maker?._id,
  })
  // ...
}
```

### `util.auth.expert()` — Phải là chuyên gia

```ts
// RoomsController.createRoom — tạo phòng (chỉ expert)
public async createRoom({ util, maker }: HttpContextContract) {
  await util.auth.expert()  // Chỉ expert mới được tạo phòng

  const name = util.gp('name')
  // ...
}
```

```ts
// RoomsController.paymentExpertSummary — xem tổng hợp thanh toán
public async paymentExpertSummary({ util, maker }: HttpContextContract) {
  await util.auth.expert()  // Chỉ expert mới xem được dữ liệu tài chính

  const expert = await mongo.experts.findOne({ userId: maker._id }).lean()
  util.check(expert, 'Không tìm thấy chuyên gia code:expert_not_found')
  // ...
}
```

### `util.auth.admin()` — Phải là admin (throw nếu không phải)

```ts
// RoomsController.deleteRoom — xóa phòng (chỉ admin)
public async deleteRoom({ util, maker }: HttpContextContract) {
  const isAdmin = await util.auth.admin()  // Throw lỗi nếu không phải admin

  const _id = util.gp('_id')
  const { data, error } = await social_service.RoomService.deleteRoom({
    _id,
    makerId: isAdmin ? undefined : maker?._id,
  })
  // ...
}
```

```ts
// TutorialsController — chỉ admin mới thao tác trên production
public async createTutorials({ util }: HttpContextContract) {
  if (this.isProduction) {
    await util.auth.admin()  // Production: bắt buộc admin
  }
  // Development: ai cũng được (để test dễ hơn)
  // ...
}
```

### `util.auth.admin(false)` — Kiểm tra mà không throw

Đây là pattern đặc biệt quan trọng: kiểm tra user có phải admin không, nhưng **không block** nếu không phải.

```ts
// RoomsController.detailRoom — xem chi tiết phòng
public async detailRoom({ util, maker }: HttpContextContract) {
  const _id = util.gp('_id')

  const { data, error } = await social_service.RoomService.detailRoom({
    _id, makerId: maker?._id,
  })
  util.check(!error, error)

  // Admin xem được toàn bộ nội dung, user thường bị giới hạn
  await socialService.limitContent({
    datas: data?.hotNews,
    maker,
    isAdmin: await util.auth.admin(false),  // false = không throw, chỉ trả true/false
  })

  return { data }
}
```

```ts
// RoomsController.removeRoomMember — xóa thành viên
public async removeRoomMember({ util, maker }: HttpContextContract) {
  await util.auth.login()

  const isAdmin = await util.auth.admin(false)  // Kiểm tra nhưng không yêu cầu

  const _id = util.gp('_id')
  const memberId = util.gp('memberId')

  const { data, error } = await social_service.RoomService.removeRoomMember({
    _id,
    memberId,
    makerId: isAdmin ? undefined : maker?._id,
    // Admin: bỏ qua makerId check → xóa bất kỳ ai
    // User thường: phải là owner của phòng
  })
  // ...
}
```

---

## `maker` object là gì?

Khi `util.auth.login()` thành công, `maker` chứa thông tin user hiện tại:

```ts
// maker được destructure từ HttpContextContract
public async createRoom({ util, maker }: HttpContextContract) {
  await util.auth.login()

  // maker._id — ID của user đang đăng nhập
  // Dùng để biết "ai đang thực hiện hành động này"
  const { data, error } = await social_service.RoomService.createRoom({
    makerId: maker?._id,  // Truyền ID user vào service
    // ...
  })
}
```

`maker?._id` dùng optional chaining vì khi endpoint **không yêu cầu đăng nhập** (không có `util.auth.login()`), maker có thể là `null`.

---

## Luồng hoạt động

```
Client gửi request với header: Authorization: Bearer <token>
    ↓
util.auth.login() → Giải mã token → Tìm user → Gán vào maker
    ↓
util.auth.expert() → login() + Kiểm tra user có role expert không
    ↓
util.auth.admin() → login() + Kiểm tra user có role admin không
    ↓
util.auth.admin(false) → Như admin() nhưng trả false thay vì throw
```

---

## Bảng so sánh FE vs BE

| FE | BE |
|---|---|
| `useAuth().isLoggedIn` | `await util.auth.login()` |
| `useAuth().user.role === 'admin'` | `await util.auth.admin()` |
| `user?.id` | `maker?._id` |
| `<ProtectedRoute>` | `await util.auth.login()` đặt đầu method |
| Redirect về `/login` | Tự throw 401 Unauthorized |

---

## Tóm tắt

1. `util.auth` luôn đặt ở **dòng đầu tiên** của method controller
2. Chọn đúng cấp: `login` < `expert` < `admin`
3. Dùng `admin(false)` khi cần biết role mà không muốn block user thường
4. `maker._id` là ID user hiện tại — truyền vào service để phân quyền ở tầng business logic
