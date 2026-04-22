# Controller -- Nhận request, trả response

## Controller là gì?

Controller là lớp xử lý trung gian: nhận input từ client, gọi service xử lý logic, trả kết quả về.

So sánh FE:

```
FE Component:  nhận props → render UI → trả JSX
BE Controller:  nhận request → gọi service → trả JSON
```

## Cấu trúc controller thực tế

Đây là `RoomsController` trong logics:

```typescript
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import social_service from 'Services/social_service'

export default class RoomsController {
  public async createRoom({ util, maker }: HttpContextContract) {
    // 1. Auth: kiểm tra quyền
    await util.auth.expert()

    // 2. Input: lấy dữ liệu từ request
    const name = util.gp('name')
    const description = util.gp('description')
    const avatar = util.gp('avatar')
    const isPrivate = util.gp('isPrivate', null, 'boolean')

    // 3. Validate: kiểm tra dữ liệu hợp lệ
    util.check(name.length >= 5 && name.length <= 200, 'Tên phòng phải có từ 5 đến 200 ký tự.')
    util.check(description.length >= 5 && description.length <= 2000, 'Mô tả phải có từ 5 đến 2000 ký tự')

    // 4. Gọi service
    const { data, error } = await social_service.RoomService.createRoom({
      makerId: maker?._id,
      name,
      description,
      avatar,
      isPrivate,
    })

    // 5. Kiểm tra lỗi từ service
    util.check(!error, error)

    // 6. Trả response
    return { data }
  }
}
```

## util.gp -- Lấy input từ request

`util.gp` (get parameter) lấy giá trị từ query string (GET) hoặc body (POST/PUT/DELETE).

```typescript
// Required -- nếu thiếu sẽ throw error
const name = util.gp('name')

// Optional -- trả default nếu thiếu
const page = util.gp('page', 1, 'number')
const isPrivate = util.gp('isPrivate', null, 'boolean')

// Validate type
util.gp('name')                          // Required, bất kỳ type
util.gp('page', 1, 'number')            // Number, default 1
util.gp('query', '', 'string')          // String, default ''
util.gp('isActive', true, 'boolean')    // Boolean, default true
util.gp('status', null, ['active', 'inactive', 'banned'])  // Enum
util.gp('code', null, /^[A-Z]{3}$/)    // Regex validation
util.gp('age', null, (v) => v > 0)     // Custom validation
```

So sánh FE:

```
FE:  const { id } = useParams()         →  BE: util.gp('_id')
FE:  const searchParams = useSearchParams()  →  BE: util.gp('page', 1, 'number')
FE:  const formData = new FormData(...)  →  BE: util.gp('name')
```

## util.check -- Validate và throw error

```typescript
// Nếu điều kiện false → throw error với message
util.check(name.length >= 5 && name.length <= 200, 'Tên phòng phải có từ 5 đến 200 ký tự.')
util.check(description.length >= 5, 'Mô tả phải có từ 5 đến 2000 ký tự')
util.check(!error, error) // Nếu có error từ service → throw
```

**Quan trọng:** KHÔNG wrap controller trong try/catch. `util.check` tự throw error, framework tự bắt và trả JSON error cho client.

## Ví dụ thực tế: listMyRooms (có pagination)

```typescript
public async listMyRooms({ util, maker }: HttpContextContract) {
  // Auth
  await util.auth.login()

  // Input với pagination
  const page = util.gp('page', 1, 'number')
  const pageSize = util.gp('pageSize', 10, 'number')
  const roles = util.gp('roles', null, 'comma')

  // Gọi service
  const { data, error, total } = await social_service.RoomService.listMyRooms({
    makerId: maker?._id,
    page,
    pageSize,
    roles,
  })

  util.check(!error, error)

  // Trả response với pagination info
  const paging = {
    total,
    page,
    pageSize,
  }

  return { data, paging }
}
```

Client nhận được:

```json
{
  "data": [
    { "_id": "room1", "name": "Phòng Trading" },
    { "_id": "room2", "name": "Phòng Phân tích" }
  ],
  "paging": {
    "total": 25,
    "page": 1,
    "pageSize": 10
  }
}
```

## Ví dụ thực tế: deleteRoom (cần quyền admin)

```typescript
public async deleteRoom({ util, maker }: HttpContextContract) {
  // Kiểm tra quyền admin
  const isAdmin = await util.auth.admin()

  // Input
  const _id = util.gp('_id')

  // Gọi service
  const { data, error } = await social_service.RoomService.deleteRoom({
    _id,
    makerId: isAdmin ? undefined : maker?._id,
  })

  util.check(!error, error)

  return { data }
}
```

## Pattern controller trong logics

Mọi controller method đều theo pattern:

```typescript
public async methodName({ util, maker }: HttpContextContract) {
  // 1. Auth (nếu cần)
  await util.auth.login()   // Yêu cầu đăng nhập
  await util.auth.admin()   // Yêu cầu admin
  await util.auth.expert()  // Yêu cầu expert

  // 2. Lấy input
  const param1 = util.gp('param1')
  const param2 = util.gp('param2', defaultValue, 'type')

  // 3. Validate
  util.check(condition, 'Error message')

  // 4. Gọi service (KHÔNG viết logic ở đây)
  const { data, error } = await someService.someMethod({ ... })

  // 5. Check error
  util.check(!error, error)

  // 6. Return
  return { data }
}
```

## Quy tắc quan trọng

### 1. KHÔNG viết logic trong controller

```typescript
// SAI
public async listRooms({ util }: HttpContextContract) {
  const rooms = await mongo.rooms.find({}).toArray()
  const filtered = rooms.filter(r => r.isActive)
  const sorted = filtered.sort((a, b) => b.createdAt - a.createdAt)
  return { data: sorted }
}

// ĐÚNG -- gọi service
public async listRooms({ util }: HttpContextContract) {
  const { data, error } = await roomService.listRooms({ ... })
  util.check(!error, error)
  return { data }
}
```

### 2. KHÔNG dùng try/catch

Framework tự xử lý errors. `util.check` throw error khi cần.

### 3. Pagination dùng page/pageSize

```typescript
const page = util.gp('page', 1, 'number')
const pageSize = util.gp('pageSize', 10, 'number')
// KHÔNG dùng limit/offset
```

## Bài tập

Viết controller method `getStockDetail` theo pattern trên:
- Yêu cầu đăng nhập
- Nhận `symbol` (required, string) và `period` (optional, default 'D', enum ['D', 'W', 'M'])
- Validate symbol phải từ 3-10 ký tự
- Gọi `stockService.getDetail({ symbol, period })`
- Trả `{ data }`
