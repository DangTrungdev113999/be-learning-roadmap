# Bài tập: Trace thêm API

## Hướng dẫn chung

Với mỗi bài tập, hãy trace theo 6 bước:
1. Tìm route trong `routes/index.ts` (prefix nào?)
2. Tìm route cụ thể trong file route (URL nào? Controller method nào?)
3. Tìm middleware (rate limit? auth?)
4. Đọc controller method (nhận gì? gọi gì? trả về gì?)
5. Tìm service/model được gọi
6. Xác định response format

**Thư mục gốc dự án:** `~/Desktop/logics`

---

## Bài 1: GET /api/indexes/overview (Độ khó: Dễ)

**Mục tiêu:** Trace API lấy tổng quan chỉ số (VNINDEX, HNX, UPCOM).
Tương tự stock overview nhưng cho index.

**Bắt đầu từ đâu:**

```bash
# Bước 1: Tìm index routes trong index.ts
grep -n "indexes" routes/index.ts

# Bước 2: Tìm route /overview trong file route
grep -n "overview" routes/indexes.ts

# Bước 3: Tìm controller method
grep -n "getOverview" app/Controllers/Http/IndexsController.ts
```

**Gợi ý:**
- Route file: `routes/indexes.ts`
- Controller: `IndexsController` (lưu ý: `Indexs` không phải `Indexes` -- tên file cũ)
- Method: `getOverview`
- Prefix: `/api` + `/indexes` = `/api/indexes`
- Rate limit nhóm: 500 req/phút/IP (giống stocks)
- Rate limit route: 10 req/giây/IP
- Data từ: `models.overviewIndex.getAllObject()` (Redis)

**Câu hỏi để kiểm tra:**
1. Controller nhận tham số gì từ query string?
2. Data được đọc từ đâu (Redis hay MongoDB)?
3. Response có dạng gì? (hint: `{ data: { indexs: [...] } }`)
4. Nếu truyền `?code=VNINDEX`, controller xử lý khác gì so với không truyền?

---

## Bài 2: GET /api/stocks/rooms (Độ khó: Dễ)

**Mục tiêu:** Trace API lấy data room (dữ liệu giao dịch nước ngoài, mua/bán ròng).

**Bắt đầu từ đâu:**

```bash
# Bước 1: Tìm route /rooms trong stocks.ts
grep -n "rooms" routes/stocks.ts

# Bước 2: Tìm controller method
grep -n "getRoomStocks\b" app/Controllers/Http/StocksController.ts

# Bước 3: Tìm Redis model
grep -rn "roomStock" redis/models/
```

**Gợi ý:**
- Route: `Route.get('/rooms', 'StocksController.getRoomStocks')`
- URL đầy đủ: `/api/stocks/rooms`
- Controller rất ngắn (~10 dòng), là ví dụ tốt cho API đơn giản
- Data từ: `models.roomStock.getAll()` (Redis)
- Có response header: `Cache-Control: public, max-age=5`

**Câu hỏi để kiểm tra:**
1. Controller này có nhận bất kỳ query param nào không?
2. So sánh `getRoomStocks` vs `getRoomStocksV2` -- khác nhau chỗ nào?
3. V2 có filter data theo `moment().add({ weeks: -2 })` -- nó làm gì?

---

## Bài 3: POST /api/users/login (Độ khó: Trung bình)

**Mục tiêu:** Trace flow đăng nhập. Đây là API phức tạp hơn vì có:
- Nhiều rate limit
- Xử lý password (hash, verify)
- Tạo token (JWT)

**Bắt đầu từ đâu:**

```bash
# Bước 1: Tìm route login
grep -n "login" routes/users.ts | head -5

# Bước 2: Tìm controller method
grep -n "public async login\b" app/Controllers/Http/UsersController.ts

# Bước 3: Đọc method login (bắt đầu từ dòng tìm được)
# Dùng IDE hoặc:
sed -n '1074,1140p' app/Controllers/Http/UsersController.ts
```

**Gợi ý:**
- Route: `Route.post('/login', 'UsersController.login')`
- URL đầy đủ: `POST /api/users/login`
- Method: POST (không phải GET -- vì gửi password trong body)
- Có 2 rate limit:
  - `('/api/users/login', '', 100, 1)` -- 100 req/giây TỔNG (tất cả user)
  - `('/api/users/login:ip', 'ip', 10, 1)` -- 10 req/giây mỗi IP
- KHÔNG có middleware `'auth'` (vì đang login, chưa có token!)

**Flow trong controller:**

```
1. Lấy phoneNumber, password từ request body
2. Validate số điện thoại (dùng thư viện `phone`)
3. Tìm user trong MongoDB theo phoneNumber
4. Verify password (hash + salt)
5. Nếu đúng -> tạo accessToken + refreshToken (JWT)
6. Nếu sai -> trả về lỗi INVALID_PHONE_NUMBER_OR_PASSWORD
```

**Câu hỏi để kiểm tra:**
1. Request body cần trường gì? (hint: `phoneNumber`, `country`, `password`)
2. `utils.password.verify(passwordHash, password, key)` -- tại sao cần `key`?
3. Response thành công trả về những gì? (hint: `token` và `refreshToken`)
4. Nếu user bị xóa (`is_delete = true`), API trả về lỗi gì?
5. So sánh `login` vs `loginV2` -- route khác nhau không? Controller method khác nhau không?

---

## Bài 4: GET /api/v1/health/readiness (Độ khó: Dễ nhưng đặc biệt)

**Mục tiêu:** Trace API health check. Đây là API đơn giản nhất nhưng có điểm ĐẶC BIỆT:
- Không nằm trong nhóm `/api` thông thường
- Không có rate limit
- Kiểm tra sức khỏe của server (Redis, MongoDB, event loop)

**Bắt đầu từ đâu:**

```bash
# Bước 1: Tìm route health
grep -n "health" routes/index.ts

# Bước 2: Đọc file route
cat routes/health.ts

# Bước 3: Đọc controller
cat app/Controllers/Http/HealthCheckController.ts
```

**Gợi ý:**
- Route file: `routes/health.ts`
- **Đặc biệt:** Route này được mount NGOÀI nhóm rate limit global!
  ```typescript
  // routes/index.ts
  // GROUP 1: NO GLOBAL RATE LIMIT
  health(Route)     // <-- không có .prefix('/api') bọc ngoài
  ```
- URL là `/api/v1/health/readiness` (prefix được định nghĩa TRONG file route, không phải index.ts)
- Controller: `HealthCheckController.checkReadiness`

**Flow trong controller:**

```
1. Kiểm tra event loop lag (>30ms = unhealthy)
2. Ping Redis pub client
3. Ping Redis sub client
4. Kiểm tra MongoDB connection state
5. Kiểm tra thời gian xử lý (>5 giây = unhealthy)
6. Trả về { date: new Date() } nếu OK
7. Trả về 503 hoặc 500 nếu có vấn đề
```

**Câu hỏi để kiểm tra:**
1. Tại sao health route không có rate limit? (hint: Kubernetes gọi liên tục để kiểm tra)
2. `mongoose.connection.readyState === 1` nghĩa là gì?
3. Khi nào server trả về 503 vs 500?
4. `monitorEventLoopDelay()` là gì và tại sao cần kiểm tra?

---

## Bài 5: GET /api/watchlists (Độ khó: Trung bình)

**Mục tiêu:** Trace API cần xác thực (auth). Hiểu middleware `'auth'` hoạt động thế nào.

**Bắt đầu từ đâu:**

```bash
# Bước 1: Tìm route watchlists
grep -n "watchlists" routes/index.ts

# Bước 2: Đọc file route
cat routes/watchlists.ts

# Bước 3: Tìm controller method
grep -n "public async get\b" app/Controllers/Http/WatchListsController.ts

# Bước 4: Đọc middleware auth
cat app/Middleware/Auth.ts
```

**Gợi ý:**
- Route: `Route.get('/', 'WatchListsController.get')`
- URL đầy đủ: `/api` + `/watchlists` + `/` = `GET /api/watchlists`
- Middleware: `['auth', RateLimitMiddleware.build(..., 'userId', 10, 1)]`
  - `'auth'` -- kiểm tra token trước
  - Rate limit theo `'userId'` (không phải `'ip'`) -- mỗi user 10 req/giây
- Controller nhận `{ auth }` thay vì `{ request }` -- vì đã qua middleware auth

**Flow trong controller:**

```
1. Lấy userId và rule từ auth (đã được middleware parse từ JWT token)
2. Kiểm tra rule === ACCESS_RESOURCE (không phải refresh token)
3. Query MongoDB: tìm tất cả watchlist của userId
4. Sort theo point (thứ tự ưu tiên)
5. Trả về danh sách watchlists
```

**Câu hỏi để kiểm tra:**
1. Nếu gọi API mà không gửi token, sẽ nhận được lỗi gì? (hint: đọc `Auth.ts`)
2. Tại sao rate limit dùng `'userId'` thay vì `'ip'`?
3. `isDeleted: { $ne: true }` nghĩa là gì trong MongoDB query?
4. `auth.rule` dùng để làm gì? Có những rule nào?
5. So sánh với FE: khi nào FE gửi token trong header? (hint: `Authorization: Bearer <token>`)

---

## Mẫu báo cáo sau khi trace

Sau khi trace xong mỗi bài, viết lại theo format này:

```
API:        [METHOD] [URL]
Route file: [tên file]
Controller: [tên class].[tên method]
Middleware: [danh sách middleware]
Data from:  [Redis/MongoDB/cache]
Response:   [mô tả ngắn]
Đặc biệt:   [điểm đáng lưu ý]
```

Ví dụ:

```
API:        GET /api/stocks/v3/overview
Route file: routes/stocks.ts
Controller: StocksController.getOverviewV3
Middleware: RateLimit(global) -> RateLimit(stocks) -> RateLimit(overview)
Data from:  Redis (overviewStock) + MongoDB (symbolNameShort) + Memcached (cache)
Response:   { data: { stocks: [...] } }
Đặc biệt:   3 lớp cache (Redis -> Memcached -> Browser Cache-Control)
```
