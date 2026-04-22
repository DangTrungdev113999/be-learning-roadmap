# Controller là gì?

## Nếu bạn từng viết FE...

Bạn đã quen với Next.js API Routes hoặc page handler:

```ts
// Next.js API Route — FE dev quen thuộc
export default function handler(req, res) {
  const { name } = req.body
  // xử lý logic...
  res.status(200).json({ data: result })
}
```

Controller trong backend cũng **đúng vai trò đó** — nhưng có tổ chức hơn.

---

## Controller trong dự án logics

File nằm tại: `app/Controllers/Http/`

```
app/Controllers/Http/
├── RoomsController.ts
├── TutorialsController.ts
├── ChannelsController.ts
├── PaymentsController.ts
└── ...
```

Mỗi controller là **một class**, mỗi method xử lý **một endpoint**.

---

## Vai trò duy nhất của Controller

Controller chỉ làm **4 việc**, theo đúng thứ tự:

```
Request → [1] Auth → [2] Lấy & validate input → [3] Gọi service → [4] Trả response
```

### Code thật — `RoomsController.createRoom`

```ts
public async createRoom({ util, maker }: HttpContextContract) {
  // [1] Xác thực — chỉ expert mới được tạo phòng
  await util.auth.expert()

  // [2] Lấy input từ request & validate
  const name = util.gp('name')
  const description = util.gp('description')
  const avatar = util.gp('avatar')
  const isPrivate = util.gp('isPrivate', null, 'boolean')
  const shortDescription = util.gp('shortDescription', null)
  const isShowChatChannel = util.gp('isShowChatChannel', true, 'boolean')

  util.check(name.length >= 5 && name.length <= 200, 'Tên phòng phải có từ 5 đến 200 ký tự.')
  util.check(description.length >= 5 && description.length <= 2000, 'Mô tả phải có từ 5 đến 2000 ký tự')

  // [3] Gọi service — toàn bộ business logic nằm ở đây
  const { data, error } = await social_service.RoomService.createRoom({
    makerId: maker?._id, name, description, avatar, isPrivate, shortDescription, isShowChatChannel,
  })

  // [4] Kiểm tra lỗi & trả response
  util.check(!error, error)
  return { data }
}
```

---

## Quy tắc vàng: KHÔNG viết business logic trong controller

Controller giống như **người lễ tân** — tiếp nhận, kiểm tra giấy tờ, rồi chuyển cho phòng ban xử lý. Không bao giờ tự xử lý.

### So sánh với FE

| Khái niệm FE | Tương đương BE |
|---|---|
| Page component | Controller method |
| `useRouter().query` | `util.gp()` |
| `useAuth()` | `util.auth.login()` |
| API call (`fetch`) | Gọi service |
| `return <JSX>` | `return { data }` |

### Tại sao không viết logic trong controller?

- **Không test được** — controller cần HTTP context, rất khó mock
- **Không tái sử dụng** — logic bị gắn chặt vào endpoint
- **Khó đọc** — controller dài hàng trăm dòng không ai muốn review

Business logic nằm trong `app/Services/`, mỗi function có file riêng và file test riêng.

---

## Luồng hoàn chỉnh: từ Route đến Controller

```
routes/rooms.ts → app/Controllers/Http/RoomsController.ts → Services/social_service
```

File route định nghĩa URL nào gọi method nào:

```ts
// routes/rooms.ts
Route.post('/', 'RoomsController.createRoom')
Route.get('/mine', 'RoomsController.listMyRooms')
Route.put('/join', 'RoomsController.joinRoom')
Route.delete('/', 'RoomsController.deleteRoom')
```

Lưu ý: **không dùng params trong URL** (không có `/:id`). Tất cả dữ liệu truyền qua query string hoặc body.

---

## Tóm tắt

1. Controller nằm tại `app/Controllers/Http/`
2. Mỗi method = một endpoint, làm đúng 4 bước: auth, input, service, response
3. **Tuyệt đối không viết business logic** trong controller
4. Không dùng try/catch bao toàn bộ controller — framework tự xử lý lỗi
5. Không dùng URL params (`/:id`) — dùng query/body
