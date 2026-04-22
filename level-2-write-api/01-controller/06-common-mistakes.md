# Lỗi thường gặp khi viết Controller

---

## 1. Bao toàn bộ controller bằng try/catch

Framework đã có global error handler. Tự bắt lỗi = mất thông tin + response không nhất quán.

```ts
// SAI
public async createRoom({ util, maker }: HttpContextContract) {
  try {
    await util.auth.expert()
    const name = util.gp('name')
    util.check(name.length >= 5, 'Tên quá ngắn')
    const { data, error } = await social_service.RoomService.createRoom({ ... })
    util.check(!error, error)
    return { data }
  } catch (err) {
    return { error: err.message }  // Nuốt lỗi, mất stack trace, mất HTTP status
  }
}
```

```ts
// ĐÚNG — để framework xử lý lỗi
public async createRoom({ util, maker }: HttpContextContract) {
  await util.auth.expert()
  const name = util.gp('name')
  util.check(name.length >= 5, 'Tên quá ngắn')
  const { data, error } = await social_service.RoomService.createRoom({ ... })
  util.check(!error, error)
  return { data }
}
```

---

## 2. Viết business logic trong controller

Controller chỉ làm 4 việc: auth, input, gọi service, trả response. Logic phức tạp thuộc về service.

```ts
// SAI — query database, tính toán trong controller
public async paymentSummary({ util, maker }: HttpContextContract) {
  await util.auth.expert()
  const expert = await mongo.experts.findOne({ userId: maker._id }).lean()

  // Logic tính tiền nằm trong controller = không test được, không reuse
  const transactions = await mongo.paymentRequests.find({ expertId: expert._id })
  let total = 0
  for (const tx of transactions) {
    if (tx.status === 'completed') {
      total += tx.amount * 0.85  // Phí 15%
      if (tx.type === 'affiliate') {
        total -= tx.amount * 0.05  // Phí thêm
      }
    }
  }
  return { data: { total } }
}
```

```ts
// ĐÚNG — gọi service, logic nằm trong service (có test riêng)
public async paymentSummary({ util, maker }: HttpContextContract) {
  await util.auth.expert()
  const { data, error } = await paymentService.getExpertSummary({ makerId: maker._id })
  util.check(!error, error)
  return { data }
}
```

---

## 3. Dùng URL params (/:id) thay vì query/body

Dự án logics **không dùng URL params**. Tất cả dữ liệu truyền qua query string (GET) hoặc body (POST/PUT/DELETE).

```ts
// SAI — dùng params trong route
Route.get('/rooms/:id', 'RoomsController.detailRoom')
Route.delete('/rooms/:id', 'RoomsController.deleteRoom')

// Trong controller:
const id = request.param('id')  // Không dùng cách này
```

```ts
// ĐÚNG — dùng query/body
Route.get('/detail', 'RoomsController.detailRoom')
Route.delete('/', 'RoomsController.deleteRoom')

// Trong controller:
const _id = util.gp('_id')  // Lấy từ query string hoặc body
```

**Route thật trong dự án:**

```ts
// routes/rooms.ts
Route.get('/', 'RoomsController.listRooms')
Route.post('/', 'RoomsController.createRoom')
Route.put('/', 'RoomsController.updateRoom')
Route.delete('/', 'RoomsController.deleteRoom')
Route.get('/detail', 'RoomsController.detailRoom')
Route.get('/mine', 'RoomsController.listMyRooms')
```

---

## 4. Dùng `limit` thay vì `pageSize`

Dự án thống nhất dùng `page` + `pageSize`, không dùng `limit` + `offset` hay `skip`.

```ts
// SAI
public async listRooms({ util }: HttpContextContract) {
  const limit = util.gp('limit', 10, 'number')
  const offset = util.gp('offset', 0, 'number')
  // ...
  return { data, total: count, limit, offset }
}
```

```ts
// ĐÚNG
public async listRooms({ util }: HttpContextContract) {
  const page = util.gp('page', 1, 'number')
  const pageSize = util.gp('pageSize', 10, 'number')
  // ...
  const paging = { total, page, pageSize }
  return { data, paging }
}
```

---

## 5. Quên validate input

Lấy input mà không validate = bug chờ xảy ra. Luôn validate ngay sau khi lấy.

```ts
// SAI — không validate, client gửi name rỗng vẫn tạo được
public async createRoom({ util, maker }: HttpContextContract) {
  await util.auth.expert()
  const name = util.gp('name')
  const description = util.gp('description')

  // Gọi thẳng service mà không kiểm tra gì
  const { data, error } = await social_service.RoomService.createRoom({
    makerId: maker?._id, name, description,
  })
  util.check(!error, error)
  return { data }
}
```

```ts
// ĐÚNG — validate trước khi gọi service
public async createRoom({ util, maker }: HttpContextContract) {
  await util.auth.expert()
  const name = util.gp('name')
  const description = util.gp('description')

  util.check(name.length >= 5 && name.length <= 200, 'Tên phòng phải có từ 5 đến 200 ký tự.')
  util.check(description.length >= 5 && description.length <= 2000, 'Mô tả phải có từ 5 đến 2000 ký tự')

  const { data, error } = await social_service.RoomService.createRoom({
    makerId: maker?._id, name, description,
  })
  util.check(!error, error)
  return { data }
}
```

---

## 6. Quên await util.auth

`util.auth.login()` là async. Quên `await` = không xác thực, ai cũng truy cập được.

```ts
// SAI — thiếu await, auth không chạy
public async createRoom({ util, maker }: HttpContextContract) {
  util.auth.expert()  // Promise bị bỏ qua, không ai bị chặn
  const name = util.gp('name')
  // ...
}
```

```ts
// ĐÚNG
public async createRoom({ util, maker }: HttpContextContract) {
  await util.auth.expert()  // Chờ xác thực xong mới tiếp tục
  const name = util.gp('name')
  // ...
}
```

---

## 7. Không kiểm tra kết quả từ service

Service trả `{ data, error }`. Nếu không check error, lỗi bị nuốt.

```ts
// SAI — bỏ qua error
public async joinRoom({ util, maker }: HttpContextContract) {
  await util.auth.login()
  const _id = util.gp('_id')
  const { data } = await social_service.RoomService.joinRoom({
    _id, makerId: maker?._id,
  })
  return { data }  // Nếu service trả error, client vẫn nhận data: undefined
}
```

```ts
// ĐÚNG — luôn kiểm tra error
public async joinRoom({ util, maker }: HttpContextContract) {
  await util.auth.login()
  const _id = util.gp('_id')
  const { data, error } = await social_service.RoomService.joinRoom({
    _id, makerId: maker?._id,
  })
  util.check(!error, error)  // Throw nếu service báo lỗi
  return { data }
}
```

---

## Checklist nhanh khi viết Controller

- [ ] Có `await` trước `util.auth`?
- [ ] Dùng `util.gp()` để lấy input (không dùng `request.param`)?
- [ ] Đã validate input bằng `util.check()`?
- [ ] Logic phức tạp nằm trong service, không trong controller?
- [ ] Phân trang dùng `page` + `pageSize` (không dùng `limit`)?
- [ ] Đã `util.check(!error, error)` sau khi gọi service?
- [ ] Không có try/catch bao toàn bộ method?
- [ ] Response đúng format: `{ data }` hoặc `{ data, paging }`?
