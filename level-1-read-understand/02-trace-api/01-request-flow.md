# Request Flow -- Vòng đời 1 API request

## Tổng quan

Mỗi khi app mobile/web gọi 1 API, request sẽ đi qua nhiều "lớp" trước khi trả về response.
Hiểu được flow này là nền tảng để đọc bất kỳ API nào trong dự án.

## ASCII Diagram: Full Request Flow

```
  Browser / App mobile
       |
       | GET /api/stocks/v3/overview
       v
  +------------------+
  |   routes/index   |  <-- Mount tất cả route files, gán prefix (/api/stocks, /api/users, ...)
  +------------------+
       |
       v
  +------------------+
  |  routes/stocks   |  <-- Map URL cụ thể -> Controller method
  +------------------+
       |
       v
  +------------------+
  |   Middleware(s)   |  <-- Rate Limit, Auth, ... (chạy TRƯỚC controller)
  +------------------+
       |
       | Nếu middleware BLOCK -> trả về lỗi (429 Too Many Requests, 401 Unauthorized)
       | Nếu middleware PASS  -> tiếp tục xuống controller
       v
  +--------------------+
  |    Controller       |  <-- Nhận request, gọi service/model, trả response
  +--------------------+
       |
       v
  +--------------------+
  |  Service / Model    |  <-- Business logic, đọc Redis/MongoDB
  +--------------------+
       |
       v
  +--------------------+
  |   Redis / MongoDB   |  <-- Data layer (database)
  +--------------------+
       |
       v
  +--------------------+
  |     Response        |  <-- { data: { ... } } hoặc { error: { code: '...' } }
  +--------------------+
       |
       v
  Browser / App mobile
```

## So sánh với FE (React/Next.js)

```
FE Flow:                              BE Flow:
---------                             ---------
onClick / useEffect                   Browser gửi HTTP request
    |                                     |
dispatch(action)                      routes/index.ts (mount prefix)
    |                                     |
API call (fetch/axios)       --->     routes/stocks.ts (match URL -> Controller)
    |                                     |
middleware (Redux/Next.js)            Middleware (Rate Limit, Auth)
    |                                     |
reducer (xử lý data)                  Controller (xử lý request)
    |                                     |
component render                      Service/Model (đọc DB)
    |                                     |
UI update                             Response JSON -> trả về cho FE
```

**Điểm tương đồng:**
- FE middleware (Next.js middleware) chạy trước khi vào page -- BE middleware chạy trước khi vào controller
- FE reducer xử lý logic -- BE controller/service xử lý logic
- FE state (Redux store) -- BE data (Redis/MongoDB)
- Cả 2 đều có pattern: nhận input -> xử lý -> trả output

## Chi tiết từng lớp

### 1. `routes/index.ts` -- Trung tâm điều phối

File này là "tổng đài" của server. Nó import tất cả route files và mount với prefix tương ứng.

```typescript
// routes/index.ts
Route.group(() => {
  // Mount stock routes với prefix /stocks
  Route.group(() => stocks(Route))
    .prefix('/stocks')
    .middleware(RateLimitMiddleware.build('/api/stocks', 'ip', 500, 1))
    //                                                        ^^^  ^
    //                                              500 requests / 1 phút / mỗi IP

  // Mount index routes với prefix /indexes
  Route.group(() => indexes(Route))
    .prefix('/indexes')
    .middleware(RateLimitMiddleware.build('/api/indexes', 'ip', 500, 1))

  // Mount user routes với prefix /users
  Route.group(() => users(Route))
    .prefix('/users')
    .middleware(RateLimitMiddleware.build('/api/users', 'ip', 60, 1))

  // ... 30+ route files khác ...

}).prefix('/api')                                                    // <-- prefix chung /api
  .middleware(RateLimitMiddleware.build('/api', '', 50 * 10000, 1))  // <-- 500,000 req/phút tổng
  .middleware(RateLimitMiddleware.build('/api', 'ip', 50 * 100, 1)) // <-- 5,000 req/phút mỗi IP
```

**Cách tính URL đầy đủ:**
```
prefix chung  + prefix nhóm  + route cụ thể    = URL đầy đủ
/api          + /stocks      + /v3/overview    = /api/stocks/v3/overview
/api          + /users       + /login          = /api/users/login
/api          + /watchlists  + /               = /api/watchlists
```

**Số lượng route files trong dự án:** ~40 files
```
stocks.ts, indexes.ts, users.ts, watchlists.ts, news.ts, alerts.ts,
portfolios.ts, signals.ts, payments.ts, rooms.ts, plans.ts, health.ts,
admin.ts, social.ts, llm.ts, brokers.ts, ...
```

### 2. `routes/stocks.ts` -- Route file cụ thể

Mỗi route file định nghĩa các endpoint (URL) và map đến controller method tương ứng.

```typescript
// routes/stocks.ts
export const stocks = (Route: RouterContract) => {
  // GET /v3/overview -> StocksController.getOverviewV3
  Route.get('/v3/overview', 'StocksController.getOverviewV3').middleware([
    RateLimitMiddleware.build('/api/stocks/overview', 'ip', 10, 1),
    //                                                     ^^   ^
    //                              Route-level limit: 10 req/1 phút/mỗi IP
  ])

  // GET /rooms -> StocksController.getRoomStocks
  Route.get('/rooms', 'StocksController.getRoomStocks').middleware(
    RateLimitMiddleware.build('/api/stocks/rooms', 'ip', 10, 1),
  )
}
```

**Lưu ý:** 1 request có thể đi qua NHIỀU rate limit:
1. Global API limit: 500,000 req/phút (tất cả user cộng lại)
2. Global IP limit: 5,000 req/phút (mỗi IP)
3. Group limit: 500 req/phút (cho /api/stocks)
4. Route limit: 10 req/phút (cho /api/stocks/overview)

### 3. Middleware -- Người gác cổng

Middleware là hàm chạy TRƯỚC controller. Có thể CHẶN request hoặc CHO ĐI TIẾP.

**Rate Limit Middleware** (phím nhất):
```typescript
// app/Middleware/RateLimit.ts
export default {
  build: function (keyPrefix, uniqueKey, points, duration) {
    //                                    ^^^^^^  ^^^^^^^^
    //                              số lần tối đa / trong bao nhiêu giây
    const rateLimiterRedis = new RateLimiterRedis({
      storeClient: pubclient,  // Dùng Redis để đếm request
      points,                  // VD: 10
      duration,                // VD: 1 (giây) -> 10 req/phút
    })

    return async (ctx, next) => {
      // Đếm số request từ IP này
      await rateLimiterRedis.consume(ip)
      // Nếu vượt giới hạn -> trả về lỗi 429
      // Nếu chưa vượt -> cho đi tiếp
      await next()  // <-- gọi controller
    }
  }
}
```

**Auth Middleware** (kiểm tra đăng nhập):
```typescript
// app/Middleware/Auth.ts
export default class Auth {
  public async handle(ctx, next) {
    if (!ctx.auth) {
      // Không có token -> trả về 401 Unauthorized
      ctx.response.unauthorized({ error: { code: 'INVALID_TOKEN' } })
      return
    }
    await next()  // <-- token hợp lệ, cho đi tiếp
  }
}
```

**So sánh với FE:**
```typescript
// Next.js middleware.ts -- tương tự!
export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')
  if (!token) {
    return NextResponse.redirect('/login')  // Chặn và redirect
  }
  return NextResponse.next()                // Cho đi tiếp
}
```

### 4. Controller -- Xử lý request

Controller nhận request từ client, gọi service/model để lấy data, rồi trả response.

```typescript
// app/Controllers/Http/StocksController.ts
export default class StocksController {
  public async getOverviewV3({ util, response }: HttpContextContract) {
    // 1. Lấy params từ query string
    const codes = util.gp('code', null, 'comma')   // ?code=VNM,FPT -> ['VNM', 'FPT']
    const fields = util.gp('fields', null, 'comma') // ?fields=code,price -> ['code', 'price']

    // 2. Set cache header (browser cache 5 giây)
    response.header('Cache-Control', 'public, max-age=5')

    // 3. Gọi model/service để lấy data
    const cachedData = await cacheService.useCache(async () => {
      const stocks = await models.overviewStock.getAllObject()  // Đọc từ Redis
      return { data: { stocks: stocks.map(...) } }
    }, cacheKey, { maxAge: 5 })

    // 4. Trả response
    return cachedData  // -> { data: { stocks: [...] } }
  }
}
```

### 5. Service / Model -- Business logic và Data

**Redis models:** Data real-time (giá cổ phiếu, orderbook, ...) được lưu trong Redis để đọc nhanh.
```typescript
// redis/models/overviewStock.ts
// Lưu thông tin tổng quan cổ phiếu: giá, khối lượng, thay đổi, ...
const stocks = await models.overviewStock.getAllObject()  // Đọc tất cả từ Redis
```

**MongoDB:** Data nặng hơn (user info, watchlists, lịch sử, ...) lưu trong MongoDB.
```typescript
// Ví dụ: tìm user theo số điện thoại
const user = await mongo.users.findOne({ phoneNumber: '0901234567' })
```

**Cache service:** Cache kết quả để tránh gọi DB liên tục.
```typescript
await cacheService.useCache(
  async () => { /* logic đọc DB */ },
  ['cache-key'],
  { maxAge: 5, engine: 'memcached' }  // Cache 5 giây
)
```

### 6. Response -- Kết quả trả về

Dự án này có 2 dạng response chuẩn:

**Thành công:**
```json
{
  "data": {
    "stocks": [
      { "code": "VNM", "price": 75000, "dayChange": 1.5 },
      { "code": "FPT", "price": 120000, "dayChange": -0.3 }
    ]
  }
}
```

**Lỗi:**
```json
{
  "error": {
    "code": "INVALID_PHONE_NUMBER_OR_PASSWORD"
  }
}
```

## Tổng kết: Nhớ 6 bước

```
1. routes/index.ts     -> Mount prefix          (/api/stocks)
2. routes/stocks.ts    -> Map URL -> Controller  (/v3/overview -> getOverviewV3)
3. Middleware           -> Kiểm tra (rate limit, auth)
4. Controller           -> Nhận request, gọi service
5. Service/Model        -> Đọc Redis/MongoDB
6. Response             -> Trả JSON về cho client
```

> Mỗi khi đọc 1 API mới, chỉ cần trace theo 6 bước này là hiểu được toàn bộ flow.
