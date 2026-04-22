# So sánh FE và BE — Bản đồ kiến thức

> Bạn đã biết React/Next.js. File này giúp bạn **map** kiến thức FE sang BE, để bạn thấy: "À, BE cũng có cái tương tự!"

---

## Bảng so sánh tổng hợp

### Routing

| # | Khái niệm FE (Next.js) | Tương đương BE (logics) | Ở đâu trong project | Giải thích |
|---|---|---|---|---|
| 1 | `app/users/page.tsx` (file-based routing) | `routes/users.ts` | `routes/` (43 files) | FE dùng file system làm route. BE khai báo route bằng code, map URL tới controller method |
| 2 | `<Link href="/rooms">` | `Route.get('/rooms', 'RoomsController.listRooms')` | `routes/rooms.ts` | FE navigate bằng component. BE define endpoint bằng Route object |
| 3 | Dynamic route `[id]` | `util.gp('_id')` lấy từ query/body | `app/Controllers/` | FE dùng `params.id` từ URL. BE lấy param từ query string hoặc request body |
| 4 | Middleware `middleware.ts` | `app/Middleware/Auth.ts` | `app/Middleware/` (7 files) | FE middleware chạy trước page render. BE middleware chạy trước controller |
| 5 | Route groups (`(auth)/`) | `Route.group(() => { ... }).prefix('/api')` | `routes/index.ts` | FE dùng folder có ngoặc. BE dùng `Route.group` với prefix và middleware chung |

### State & Data

| # | Khái niệm FE | Tương đương BE | Ở đâu trong project | Giải thích |
|---|---|---|---|---|
| 6 | `useState`, `useReducer` | MongoDB collections | `mongo/` (101 models) | FE lưu state trong memory. BE lưu state trong database |
| 7 | React Query / SWR (cache) | Redis cache + `cacheService` | `redis/`, `app/Services/cacheService/` | FE cache API response. BE cache DB query result trong Redis |
| 8 | Context / Zustand (global state) | Config + Env variables | `config/` (28 files), `.env` | FE dùng global store. BE dùng config files đọc từ environment |
| 9 | `fetch('/api/rooms')` | `mongo.rooms.find({})` | `mongo/rooms.ts` | FE fetch từ API. BE query trực tiếp database |
| 10 | TypeScript interfaces | Mongoose Schema | `mongo/*.ts` | FE define type cho data. BE define schema cho database collection |

### Side Effects & Background Jobs

| # | Khái niệm FE | Tương đương BE | Ở đâu trong project | Giải thích |
|---|---|---|---|---|
| 11 | `useEffect` | Kafka consumers (tasks/) | `tasks/` (10 files) | FE chạy side-effect khi state thay đổi. BE chạy background job khi nhận Kafka event |
| 12 | `setTimeout`, `setInterval` | Cron jobs | `start/cronjob.ts` | FE dùng timer. BE dùng cron schedule (ví dụ: "mỗi ngày lúc 11h30") |
| 13 | Event listener (`onClick`) | `kafkaService.on('event', handler)` | `tasks/portfolio.ts` | FE lắng nghe DOM event. BE lắng nghe message queue event |
| 14 | WebSocket (`socket.on`) | `websocketService` | `app/Services/websocketService/` | FE nhận real-time data. BE gửi real-time data |

### Auth & Security

| # | Khái niệm FE | Tương đương BE | Ở đâu trong project | Giải thích |
|---|---|---|---|---|
| 15 | `useAuth()` hook | `Auth` middleware + `AuthParser` | `app/Middleware/Auth.ts` | FE check auth state. BE verify JWT token mỗi request |
| 16 | Protected routes | `util.auth.expert()`, `util.auth.admin()` | Controllers | FE redirect nếu chưa login. BE throw error nếu không có quyền |
| 17 | CORS config | `config/cors.ts` | `config/cors.ts` | FE gặp lỗi CORS. BE config CORS để cho phép FE gọi API |

### Error Handling

| # | Khái niệm FE | Tương đương BE | Ở đâu trong project | Giải thích |
|---|---|---|---|---|
| 18 | `ErrorBoundary` | `ExceptionHandler` | `app/Exceptions/Handler.ts` | FE bắt render error. BE bắt mọi error và trả response chuẩn |
| 19 | `try/catch` trong component | `util.check(condition, 'msg code:err')` | Controllers | FE catch error rồi show toast. BE throw error với code, handler tự format |
| 20 | Form validation (Zod, Yup) | `util.gp('key', null, 'number')` | Controllers | FE validate input trước submit. BE validate input khi nhận request |

### Testing & Deploy

| # | Khái niệm FE | Tương đương BE | Ở đâu trong project | Giải thích |
|---|---|---|---|---|
| 21 | Jest / Vitest | Japa (AdonisJS test runner) | `*.spec.ts` trong `libs/` | FE test component. BE test từng function trong service |
| 22 | `npm run dev` | `node ace serve --watch` | `package.json` | FE dev server. BE dev server với auto-reload |
| 23 | `next build` | `node ace build` | `build/` | FE build ra static/SSR. BE compile TS thành JS |
| 24 | Vercel / Netlify | Docker + K8s | `Dockerfile` | FE deploy lên CDN. BE deploy lên server/container |

---

## Code thực tế: FE vs BE cùng 1 concept

### 1. Routing — Định nghĩa endpoint

**FE (Next.js App Router):**
```tsx
// app/rooms/page.tsx — Tự động tạo route GET /rooms
export default function RoomsPage() {
  return <div>Rooms</div>
}

// app/rooms/[id]/page.tsx — Dynamic route
export default function RoomDetail({ params }: { params: { id: string } }) {
  return <div>Room {params.id}</div>
}
```

**BE (logics project):**
```ts
// routes/rooms.ts — Khai báo tường minh
export const rooms = (Route: RouterContract) => {
  Route.get('/', 'RoomsController.listRooms')          // GET  /api/rooms
  Route.post('/', 'RoomsController.createRoom')         // POST /api/rooms
  Route.get('/detail', 'RoomsController.detailRoom')    // GET  /api/rooms/detail
  Route.put('/join', 'RoomsController.joinRoom')        // PUT  /api/rooms/join
  Route.delete('/', 'RoomsController.deleteRoom')       // DELETE /api/rooms
}
```

> **Điểm khác biệt:** FE dùng file system làm route (tạo file = tạo route). BE khai báo route bằng code, cho phép gán middleware, rate limit, prefix cho từng nhóm.

---

### 2. Lấy data — fetch vs query

**FE:**
```tsx
// React component
const [rooms, setRooms] = useState([])

useEffect(() => {
  fetch('/api/rooms')
    .then(res => res.json())
    .then(data => setRooms(data))
}, [])
```

**BE:**
```ts
// Controller method — phía sau API /api/rooms
public async listRooms({ util, maker }: HttpContextContract) {
  const page = util.gp('page', 1, 'number')
  const pageSize = util.gp('pageSize', 20, 'number')

  const rooms = await mongo.rooms
    .find({ isActive: true })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()

  return { data: rooms }
}
```

> **Liên kết:** FE `fetch('/api/rooms')` → BE `routes/rooms.ts` → `RoomsController.listRooms` → query `mongo.rooms`

---

### 3. Validate input — form validation vs request validation

**FE:**
```tsx
// Dùng Zod/Yup validate form
const schema = z.object({
  name: z.string().min(5).max(200),
  description: z.string().min(5).max(2000),
})

const result = schema.safeParse(formData)
if (!result.success) {
  setError(result.error.message)
}
```

**BE:**
```ts
// Controller — validate bằng util.gp và util.check
public async createRoom({ util, maker }: HttpContextContract) {
  const name = util.gp('name')                                    // Required, throw nếu thiếu
  const description = util.gp('description')                      // Required
  const isPrivate = util.gp('isPrivate', null, 'boolean')         // Optional, phải là boolean

  util.check(name.length >= 5 && name.length <= 200,
    'Tên phòng phải có từ 5 đến 200 ký tự. code:invalid_name')

  util.check(description.length >= 5 && description.length <= 2000,
    'Mô tả phải có từ 5 đến 2000 ký tự code:invalid_description')

  // Nếu check thất bại → throw error → ExceptionHandler bắt và trả response
}
```

> **Điểm giống:** Cả hai đều validate trước khi xử lý. **Điểm khác:** FE show error trên UI. BE throw error, `ExceptionHandler` tự động format thành `{ error: { code, message } }`.

---

### 4. Middleware — chạy trước khi xử lý

**FE (Next.js middleware):**
```ts
// middleware.ts (ở root)
export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')

  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}
```

**BE (logics middleware):**
```ts
// app/Middleware/Auth.ts
export default class Auth {
  public async handle(ctx: HttpContextContract, next: () => Promise<void>) {
    if (!ctx.auth) {
      ctx.response.unauthorized({
        error: { code: 'INVALID_TOKEN' }
      })
      return  // Không gọi next() = chặn request
    }

    await next()  // Gọi next() = cho request đi tiếp
  }
}
```

> **Giống nhau hoàn toàn:** Cả hai đều chạy trước handler chính. Nếu không hợp lệ → chặn lại. Nếu OK → cho đi tiếp (`next()`).

---

### 5. Error handling — ErrorBoundary vs ExceptionHandler

**FE:**
```tsx
// ErrorBoundary bao ngoài component tree
class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    logErrorToService(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return <h1>Có lỗi xảy ra</h1>
    }
    return this.props.children
  }
}
```

**BE:**
```ts
// app/Exceptions/Handler.ts — bắt MỌI error trong app
export default class ExceptionHandler extends HttpExceptionHandler {
  public async handle(error: any, ctx: HttpContextContract) {
    const message = error.message || error
    const response = { error: { code: 'ERROR_SYSTEM' } }

    // Parse error message có format: "Thông báo code:error_code"
    if (/ code:[a-zA-Z0-9_:()=,]{3,64}$/.test(message)) {
      const [msg, code] = error.message.split('code:')
      response.error.code = code.trim()
      response.error.message = msg.trim()
    }

    return ctx.response.status(200).send(response)
  }
}
```

> **Pattern đặc biệt của project:** Thay vì try/catch ở mọi chỗ, developer chỉ cần `throw` hoặc `util.check()`. `ExceptionHandler` tự động bắt và format. Tương tự ErrorBoundary bắt mọi render error.

---

### 6. Cache — React Query vs Redis

**FE:**
```tsx
// React Query cache API response
const { data: rooms } = useQuery({
  queryKey: ['rooms'],
  queryFn: () => fetch('/api/rooms').then(r => r.json()),
  staleTime: 5 * 60 * 1000, // Cache 5 phút
})
```

**BE:**
```ts
// cacheService — cache DB query trong Redis
const rooms = await cacheService.useCache({
  key: 'rooms:list:active',
  ttl: 300, // Cache 5 phút (300 giây)
  fn: async () => {
    return mongo.rooms.find({ isActive: true }).lean()
  }
})
```

> **Cùng ý tưởng:** Cả hai đều cache data với key + TTL. FE cache trong browser memory. BE cache trong Redis (shared giữa tất cả server instances).

---

### 7. Background jobs — useEffect vs Kafka tasks

**FE:**
```tsx
// Side effect khi user thực hiện hành động
useEffect(() => {
  if (orderPlaced) {
    sendAnalytics('order_placed', orderData)
    showNotification('Đặt lệnh thành công!')
    updatePortfolioCache()
  }
}, [orderPlaced])
```

**BE:**
```ts
// Controller — emit event, không chờ xử lý
public async placeOrder({ util }: HttpContextContract) {
  const order = await orderService.create(...)

  // Gửi event vào Kafka, xử lý bất đồng bộ
  kafkaService.emit('analysis.insert', [{ uid: order.userId, key: 'order_placed' }])
  kafkaService.emit('portfolio.stopLoss', { orderId: order._id })

  return { data: order } // Trả về ngay, không đợi background job
}

// tasks/analysis.ts — Kafka consumer xử lý ngầm
kafkaService.on('analysis.insert', async (events) => {
  analysisService.insertEvent(events) // Xử lý bất đồng bộ
})

// tasks/portfolio.ts — Kafka consumer khác
kafkaService.on('portfolio.stopLoss', portfolioService.handleStopLoss)
```

> **Điểm khác lớn:** FE `useEffect` chạy đồng bộ trong browser. BE tách thành 2 phần: controller emit event (nhanh) và task xử lý ngầm (có thể mất vài giây/phút).

---

### 8. Testing — Component test vs Function test

**FE:**
```tsx
// Component test với React Testing Library
test('renders room list', async () => {
  render(<RoomList />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()

  await waitFor(() => {
    expect(screen.getByText('Room 1')).toBeInTheDocument()
  })
})
```

**BE:**
```ts
// Function test với Japa (tương tự Jest)
// app/Services/userService/libs/removeReversedFlagFn.spec.ts
import { test } from '@japa/runner'

test.group('removeReversedFlagFn', () => {
  test('should process users and remove reversed flag', async ({ assert }) => {
    // Mock mongo.users.find()
    // Mock subscriptionService.updateReversedFlag()
    // Verify function chạy không lỗi
    assert.isTrue(true)
  })

  test('should handle empty user list', async ({ assert }) => {
    // Mock mongo.users.find() trả về mảng rỗng
    assert.isTrue(true)
  })
})
```

> **So sánh:** FE test component (render + interaction). BE test function (input → output). BE project này có quy tắc: **1 function = 1 file = 1 file test** (`.spec.ts` nằm cạnh file chính trong `libs/`).

---

## Service structure so với React module

```
FE (React)                              BE (logics)
src/                                    app/Services/
├── features/                           ├── roomService/
│   └── rooms/                          │   ├── docs.md          ← Tài liệu (FE không có)
│       ├── hooks/                      │   ├── index.ts          ← Export (giống barrel file)
│       │   ├── useRoomList.ts          │   ├── type.ts           ← Types
│       │   └── useCreateRoom.ts        │   ├── constants.ts      ← Constants
│       ├── components/                 │   └── libs/
│       │   ├── RoomCard.tsx            │       ├── getRoomDetail.ts     ← 1 function = 1 file
│       │   └── RoomList.tsx            │       ├── checkRoomPermission.ts
│       ├── types.ts                    │       ├── isVipOfRoom.ts
│       └── index.ts (barrel)           │       └── *.spec.ts           ← Test riêng
```

> **Giống nhau:** Cả hai đều chia module theo feature, có barrel file (index.ts), tách type riêng. **Khác nhau:** BE có `docs.md` cho mỗi service và bắt buộc mỗi function phải có test.

---

## Tóm tắt nhanh cho FE developer

| Bạn đã biết (FE) | Tương đương (BE) | File cần đọc đầu tiên |
|---|---|---|
| `pages/` hoặc `app/` | `routes/` | `routes/index.ts` |
| Component | Controller method | `app/Controllers/Http/RoomsController.ts` |
| Custom hooks | Service functions | `app/Services/roomService/index.ts` |
| `useState` / DB | MongoDB model | `mongo/rooms.ts` |
| React Query cache | Redis + cacheService | `app/Services/cacheService/` |
| `useEffect` | Kafka tasks | `tasks/portfolio.ts` |
| `middleware.ts` | Middleware class | `app/Middleware/Auth.ts` |
| ErrorBoundary | ExceptionHandler | `app/Exceptions/Handler.ts` |
| `.env.local` | `.env` + `config/` | `config/app.ts` |
| `npm test` | `node ace test unit` | `*.spec.ts` trong `libs/` |

**Lời khuyên số 1:** Khi đọc code BE, hãy tự hỏi "Cái này ở FE là gì?" — bạn sẽ thấy mọi thứ đều có tương đương. Backend không phải thế giới mới, chỉ là **góc nhìn khác** của cùng 1 bài toán.
