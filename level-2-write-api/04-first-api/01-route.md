# Route -- Điểm vào của mọi API

## Route là gì?

Route là bản đồ nói cho server biết: "Khi client gọi URL này với method này, hãy chạy function này."

So sánh FE:

```
FE (React Router):  <Route path="/rooms" element={<RoomPage />} />
BE (AdonisJS):      Route.get('/rooms', 'RoomsController.listRooms')
```

## HTTP Methods -- 4 methods chính

| Method | Mục đích | Ví dụ | Tương đương FE |
|--------|---------|-------|----------------|
| `GET` | Lấy dữ liệu | Lấy danh sách phòng | `fetch('/api/rooms')` |
| `POST` | Tạo mới | Tạo phòng mới | `fetch('/api/rooms', { method: 'POST' })` |
| `PUT` | Cập nhật | Sửa thông tin phòng | `fetch('/api/rooms', { method: 'PUT' })` |
| `DELETE` | Xoá | Xoá phòng | `fetch('/api/rooms', { method: 'DELETE' })` |

## Cấu trúc route file thực tế

Đây là `routes/rooms.ts` trong logics:

```typescript
import { RouterContract } from '@ioc:Adonis/Core/Route'

export const rooms = (Route: RouterContract) => {
  Route.get('/', 'RoomsController.listRooms')
  Route.post('/', 'RoomsController.createRoom')
  Route.put('/', 'RoomsController.updateRoom')
  Route.delete('/', 'RoomsController.deleteRoom')
  Route.get('/detail', 'RoomsController.detailRoom')
  Route.put('/join', 'RoomsController.joinRoom')
  Route.put('/leave', 'RoomsController.leaveRoom')
  Route.get('/mine', 'RoomsController.listMyRooms')
  Route.get('/members', 'RoomsController.listRoomMembers')
  Route.put('/members', 'RoomsController.updateRoomMember')
  Route.delete('/members', 'RoomsController.removeRoomMember')
  Route.get('/payment/summary', 'RoomsController.paymentExpertSummary')
  Route.post('/payment/withdraw', 'RoomsController.paymentCreateWithdrawRequest')
}
```

**Chú ý:** Trong logics, route path chỉ dùng `/` và tên resource. **Không dùng params trong URL** (không có `/rooms/:id`). Thay vào đó, id được truyền qua query string hoặc body.

## Route Group và Prefix

Route file trên được import và gộp trong `routes/index.ts`:

```typescript
import Route from '@ioc:Adonis/Core/Route'
import RateLimitMiddleware from '../app/Middleware/RateLimit'
import { rooms } from './rooms'

Route.group(() => {
  // ... các route khác

  Route.group(() => rooms(Route))
    .prefix('/rooms')
    .middleware(RateLimitMiddleware.build('/api/rooms', 'ip', 60, 1))

  // ... các route khác
})
  .prefix('/api')
```

Kết quả: URL đầy đủ là `/api/rooms/...`

```
Client gọi:  GET /api/rooms/
              POST /api/rooms/
              GET /api/rooms/detail?_id=abc123
              PUT /api/rooms/join
```

## Middleware -- Xử lý trước khi vào controller

Middleware là function chạy **trước** controller. Ví dụ thực tế:

```typescript
Route.group(() => rooms(Route))
  .prefix('/rooms')
  .middleware(RateLimitMiddleware.build('/api/rooms', 'ip', 60, 1))
  //                                   prefix       key  points duration
  // → Giới hạn 60 requests/giây cho mỗi IP
```

Trong logics, `RateLimitMiddleware` dùng Redis để đếm requests:

```typescript
// app/Middleware/RateLimit.ts (đơn giản hoá)
const rateLimiterRedis = new RateLimiterRedis({
  storeClient: pubclient,  // Redis client
  points: 60,              // Số request tối đa
  duration: 1,             // Trong 1 giây
  keyPrefix: '/api/rooms', // Key để phân biệt
})
```

## Cách tạo route file mới

Giả sử bạn cần tạo API cho "tutorials":

### Bước 1: Tạo route file

```typescript
// routes/tutorials.ts
import { RouterContract } from '@ioc:Adonis/Core/Route'

export const tutorials = (Route: RouterContract) => {
  Route.get('/', 'TutorialsController.list')
  Route.get('/detail', 'TutorialsController.detail')
  Route.post('/', 'TutorialsController.create')
  Route.put('/', 'TutorialsController.update')
  Route.delete('/', 'TutorialsController.delete')
}
```

### Bước 2: Đăng ký trong routes/index.ts

```typescript
import { tutorials } from './tutorials'

// Trong Route.group
Route.group(() => tutorials(Route))
  .prefix('/tutorials')
  .middleware(RateLimitMiddleware.build('/api/tutorials', 'ip', 60, 1))
```

## Quy tắc route trong logics

### 1. Không dùng URL params

```typescript
// SAI -- logics không dùng params
Route.get('/rooms/:id', 'RoomsController.detailRoom')

// ĐÚNG -- dùng query string
Route.get('/detail', 'RoomsController.detailRoom')
// Client gọi: GET /api/rooms/detail?_id=abc123
```

### 2. Prefix nhóm theo resource

```typescript
// Tất cả route liên quan rooms nằm trong prefix /rooms
Route.group(() => rooms(Route)).prefix('/rooms')
```

### 3. Rate limit cho mọi group

Mỗi route group đều có middleware rate limit để chống spam/DDoS.

## So sánh tổng quan

```
URL gọi từ FE:     GET /api/rooms/detail?_id=abc123
                         │       │        │
                         │       │        └─ Query params (util.gp)
                         │       └────────── Route path
                         └────────────────── Route prefix (/api + /rooms)

Xử lý phía BE:     RateLimit → Controller.detailRoom → Service → MongoDB
                    (middleware)  (nhận request)         (logic)   (data)
```

## Bài tập

1. Đọc `routes/rooms.ts` và liệt kê tất cả GET routes
2. Giải thích URL đầy đủ của `Route.post('/payment/withdraw', 'RoomsController.paymentCreateWithdrawRequest')`
3. Tạo route file cho resource "reviews" với 4 CRUD operations
