# Tổng quan cấu trúc project

> Hãy tưởng tượng project backend như một **công ty**. Mỗi folder là một **phòng ban** với chức năng riêng. Không ai làm việc của người khác — mỗi phòng ban có trách nhiệm rõ ràng.

## Sơ đồ tổng thể

```
logics/
├── app/                          # "Trụ sở chính" — toàn bộ logic ứng dụng
│   ├── Common/                   #   10 files — hàm dùng chung (upload S3, xử lý KYC, referral...)
│   ├── Controllers/Http/         #   54 controllers — tiếp nhận & phản hồi request
│   ├── Exceptions/               #   2 files — xử lý lỗi toàn cục
│   ├── Hooks/                    #   1 folder (userHook) — side-effect sau khi user thay đổi
│   ├── Middleware/               #   7 files — kiểm tra trước khi request vào controller
│   └── Services/                 #   47 services — xử lý business logic
│
├── mongo/                        # "Kho dữ liệu" — 101 models
│   └── *.ts                      #   Mỗi file = 1 collection trong MongoDB
│
├── redis/                        # "Bộ nhớ tạm" — cache & real-time data
│   ├── client.ts                 #   Kết nối Redis
│   ├── models/                   #   Cấu trúc cache data
│   └── *.ts                      #   Các hàm đọc/ghi cache
│
├── routes/                       # "Lễ tân" — 43 route files
│   ├── index.ts                  #   Tổng hợp tất cả routes
│   └── *.ts                      #   Mỗi file = 1 nhóm API endpoints
│
├── config/                       # "Phòng hành chính" — 28 config files
│   └── *.ts                      #   Cấu hình cho từng service/tính năng
│
├── start/                        # "Phòng khởi động" — 9 files
│   └── *.ts                      #   Khởi tạo DB, cache, message queue...
│
├── tasks/                        # "Phòng xử lý nền" — 10 files
│   └── *.ts                      #   Kafka consumers xử lý background jobs
│
├── utils/                        # "Hộp công cụ" — 14 files
│   └── *.ts                      #   Hàm tiện ích dùng chung
│
├── const/                        # Hằng số toàn cục
├── types/                        # TypeScript type definitions
├── contracts/                    # Adonis IoC container contracts
└── tsconfig.json                 # Cấu hình TypeScript + path aliases
```

## Con số thực tế

| Thành phần | Số lượng | Ý nghĩa |
|---|---|---|
| Controllers | **54** | 54 nhóm API (Users, Rooms, Payments, Stocks...) |
| Services | **47** | 47 module nghiệp vụ (userService, paymentService, portfolioService...) |
| Mongo Models | **101** | 101 collections trong database |
| Route files | **43** | 43 nhóm đường dẫn API |
| Config files | **28** | 28 file cấu hình |
| Utility files | **14** | 14 file hàm tiện ích |

---

## Chi tiết từng phòng ban

### `app/Controllers/Http/` — Phòng tiếp khách (54 controllers)

Controller là người **tiếp nhận yêu cầu** từ client (mobile app, web). Công việc của controller rất đơn giản: nhận request, lấy tham số, gọi service xử lý, rồi trả kết quả. Controller **không chứa business logic phức tạp** — nó giống nhân viên lễ tân chỉ ghi nhận yêu cầu rồi chuyển cho phòng ban phù hợp. Mỗi controller là một class với nhiều method, mỗi method tương ứng với một API endpoint.

Ví dụ thực tế: `RoomsController.ts` có các method `createRoom`, `deleteRoom`, `joinRoom`, `listRooms`...

```
UsersController.ts          StocksController.ts         PaymentsController.ts
RoomsController.ts          PortfoliosController.ts     AnalyticsController.ts
NewsController.ts           SignalsController.ts        LlmsController.ts
...và 45 controllers khác
```

### `app/Services/` — Phòng nghiệp vụ (47 services)

Service là **bộ não** của ứng dụng — nơi chứa toàn bộ business logic. Mỗi service là một folder riêng với cấu trúc chuẩn: `docs.md` (tài liệu), `index.ts` (export), `libs/` (các hàm). Một hàm = một file, mỗi hàm có test riêng. Service giao tiếp với database (Mongo), cache (Redis), message queue (Kafka), và các service khác. Đây là nơi bạn sẽ đọc nhiều nhất khi cần hiểu logic.

```
app/Services/
├── userService/           ├── paymentService/        ├── portfolioService/
│   ├── docs.md            │   ├── docs.md            │   ├── docs.md
│   ├── index.ts           │   ├── index.ts           │   ├── index.ts
│   └── libs/              │   └── libs/              │   └── libs/
│       ├── fn1.ts         │       ├── fn1.ts         │       ├── fn1.ts
│       └── fn1.spec.ts    │       └── fn1.spec.ts    │       └── fn1.spec.ts
├── roomService/           ├── cacheService/          ├── kafkaService/
├── analysisService/       ├── llmService/            ├── syncService/
...và 38 services khác
```

### `app/Middleware/` — Phòng bảo vệ (7 files)

Middleware là **lớp kiểm tra** chạy TRƯỚC khi request đến controller. Giống như bảo vệ ở cổng công ty — kiểm tra thẻ nhân viên, kiểm tra giới hạn ra vào. Mọi request HTTP đều phải đi qua middleware trước. Middleware có thể chặn request (trả về 401, 429) hoặc cho đi tiếp bằng cách gọi `next()`.

| File | Vai trò |
|---|---|
| `Auth.ts` | Xác thực user đã đăng nhập chưa (kiểm tra token) |
| `AdminAuth.ts` | Xác thực quyền admin |
| `AuthParser.ts` | Parse token từ header, gắn `auth` và `maker` vào context |
| `BanMiddleware.ts` | Kiểm tra user có bị ban không |
| `LogRequest.ts` | Ghi log mỗi request (method, url, thời gian xử lý) |
| `RateLimit.ts` | Giới hạn số request/giây theo IP hoặc user |
| `RateLimitIpOctet.ts` | Rate limit theo dải IP (ví dụ: 192.168.1.*) |

Thứ tự chạy (đăng ký trong `start/kernel.ts`):
```
Request → BodyParser → AuthParser → BanMiddleware → LogRequest → [Route Middleware] → Controller
```

### `app/Common/` — Phòng hậu cần (10 files)

Common chứa các **hàm dùng chung** cho nhiều nơi trong project — không thuộc về một service cụ thể nào. Đây là những tác vụ hay lặp lại như upload file, xử lý membership, tính referral. Khác với `utils/` (hàm thuần túy không phụ thuộc), Common có thể gọi tới service, database.

```
saveFileToS3.ts             saveFileToS3Public.ts       handleKyc.ts
handleReferal.ts            bonusMembership.ts          payCredit.ts
payAffiliate.ts             bonusTurnPricePredictions.ts
bonusReferTurnPricePredictions.ts                       index.ts
```

### `app/Exceptions/` — Phòng xử lý sự cố (2 files)

Exceptions xử lý **tất cả lỗi** xảy ra trong ứng dụng. `Handler.ts` là exception handler toàn cục — bắt mọi error chưa được xử lý và format thành response thống nhất cho client. Pattern đặc biệt: lỗi có format `"Thông báo code:error_code"` sẽ được parse thành `{ error: { code, message } }`. Điều này cho phép throw error ở bất kỳ đâu mà không cần try/catch.

### `app/Hooks/` — Phòng phản ứng (1 folder)

Hooks chứa các **side-effect** được trigger khi có sự kiện xảy ra. Hiện tại chỉ có `userHook` — chạy sau khi dữ liệu user thay đổi. Tương tự concept `useEffect` trong React nhưng ở phía server, hook lắng nghe sự kiện và thực hiện hành động phụ.

### `mongo/` — Kho dữ liệu (101 models)

Mỗi file trong `mongo/` định nghĩa **schema** (cấu trúc) của một collection trong MongoDB. Tương tự như bạn thiết kế bảng trong database. Mỗi model mô tả các fields, kiểu dữ liệu, index, và relationships. 101 models = 101 loại dữ liệu khác nhau mà ứng dụng quản lý — từ users, stocks, portfolios đến payments, notifications, signals.

Một số models tiêu biểu:
```
users.ts              stocks.ts             portfolios.ts         orders.ts
rooms.ts              news.ts               signals.ts            payments.ts
notifications.ts      events.ts             subscriptions.ts      tutorials.ts
watchLists.ts         analysisReports.ts    creditTransactions.ts  kycUsers.ts
...và 85 models khác
```

### `routes/` — Bảng chỉ dẫn (43 files)

Routes là **bản đồ** kết nối URL với controller method. Khi client gọi `POST /api/rooms`, route sẽ chỉ đến `RoomsController.createRoom`. Mỗi file route quản lý một nhóm API endpoint. Tất cả routes được tổng hợp trong `routes/index.ts`, được nhóm lại dưới prefix `/api` với rate limiting riêng cho từng nhóm.

Ví dụ thực tế từ `routes/rooms.ts`:
```ts
Route.get('/', 'RoomsController.listRooms')        // GET  /api/rooms
Route.post('/', 'RoomsController.createRoom')       // POST /api/rooms
Route.get('/detail', 'RoomsController.detailRoom')  // GET  /api/rooms/detail
Route.put('/join', 'RoomsController.joinRoom')      // PUT  /api/rooms/join
```

### `config/` — Phòng hành chính (28 files)

Config chứa **cấu hình** cho mọi thành phần trong hệ thống. Mỗi file config tương ứng với một service hoặc tính năng cụ thể. Giá trị thường được đọc từ environment variables (`.env`) để có thể thay đổi giữa các môi trường (dev, staging, production) mà không cần sửa code.

| File | Cấu hình cho |
|---|---|
| `app.ts` | Ứng dụng chung (port, host, key) |
| `mongo.ts` | Kết nối MongoDB (URI, options) |
| `redis.ts`, `redisSlave.ts` | Kết nối Redis master & slave |
| `cors.ts` | Cross-origin resource sharing |
| `payment.ts` | Cổng thanh toán |
| `aws.ts` | Amazon Web Services (S3 storage) |
| `google.ts`, `apple.ts`, `facebook.ts` | OAuth / social login |
| `kafka.ts` (message-stream.ts) | Message queue |
| `notification.ts` | Push notification |
| `slack.ts` | Slack alert integration |
| `token.ts` | JWT token settings |
| `portfolio.ts` | Portfolio trading config |
| `room.ts` | Room feature config |
| ...và 14 files khác | |

### `utils/` — Hộp công cụ (14 files)

Utils chứa các **hàm tiện ích thuần túy** — không phụ thuộc vào database hay service nào. Đây là những hàm có thể dùng ở bất kỳ đâu: format số, validate input, mã hóa token, tạo OTP. Tương tự như lodash hay date-fns mà bạn hay dùng ở FE, nhưng được viết riêng cho project.

| File | Chức năng |
|---|---|
| `index.ts` | Export tổng hợp tất cả utils |
| `number.ts` | Format, làm tròn, tính toán số |
| `validator.ts` | Validate email, phone, URL... |
| `token.ts` | Tạo & verify JWT token |
| `password.ts` | Hash & compare password |
| `otp.ts` | Tạo & verify OTP |
| `mask.ts` | Ẩn thông tin nhạy cảm (SĐT, email) |
| `content.ts` | Xử lý nội dung text |
| `object.ts` | Thao tác với object (pick, omit...) |
| `identity.ts` | Xử lý CMND/CCCD |
| `jws.ts` | JSON Web Signature |
| `qrpay.ts` | Tạo mã QR thanh toán |
| `cronjob.ts` | Helper cho cron job scheduling |
| `tradingview.ts` | Helper cho TradingView integration |

---

## Folder `start/` — Quá trình khởi động server (9 files)

Khi server khởi động, các file trong `start/` chạy **tự động theo thứ tự**. Đây là nơi kết nối tất cả các thành phần lại với nhau.

| File | Vai trò | Chi tiết |
|---|---|---|
| `tracer.ts` | Khởi tạo **OpenTelemetry** tracing | Gửi trace data tới Tempo qua OTLP/gRPC để monitor performance |
| `kernel.ts` | Đăng ký **middleware** toàn cục | BodyParser → AuthParser → BanMiddleware → LogRequest |
| `mongo.ts` | Kết nối **MongoDB** | Dùng mongoose, tự động reconnect khi mất kết nối |
| `redis.ts` | Kết nối **Redis** | Khởi tạo Redis client cho cache & pub/sub |
| `routes.ts` | Load **tất cả routes** | Import `routes/index.ts` → đăng ký 43 nhóm route |
| `kafka.ts` | Khởi tạo **Kafka** consumer/producer | Kết nối message queue + import tất cả tasks/ |
| `cronjob.ts` | Đăng ký **cron jobs** | Các tác vụ định kỳ (release volume, nhắc expert, sync TP/SL) |
| `google.ts` | Khởi tạo **Google PubSub** listener | Lắng nghe Google Play billing events (subscription renewed) |
| `migrate.ts` | Chạy **data migrations** | Cập nhật/sửa dữ liệu cũ khi deploy version mới |

---

## Folder `tasks/` — Kafka consumers (10 files)

Tasks là các **background workers** lắng nghe sự kiện từ Kafka. Khi controller cần xử lý tác vụ nặng, nó emit event vào Kafka — task sẽ nhận và xử lý bất đồng bộ. Điều này giúp API phản hồi nhanh mà không bị block.

| File | Lắng nghe event | Xử lý |
|---|---|---|
| `portfolio.ts` | `portfolio.stopLoss`, `portfolio.takeProfit`, `portfolio.limitBuy`, `portfolio.limitSell` | Tự động cắt lỗ, chốt lời, mua/bán limit order |
| `sync.ts` | `user.updated` | Đồng bộ dữ liệu user khi có thay đổi |
| `analysis.ts` | `analysis.upsert`, `analysis.insert` | Ghi nhận sự kiện phân tích (analytics tracking) |
| `ban.ts` | `ban.addBanLog`, `ban.clearOldLogs` | Quản lý ban user + dọn log cũ |
| `event.ts` | `events.created` | Tạo log code khi có sự kiện mới |
| `metadata.ts` | `metadata.increase` | Tăng counter metadata (view count, like count...) |
| `navigation.ts` | `navigation.remove_most_search_result` | Xóa kết quả tìm kiếm top |
| `payment.ts` | `payment.rollback_expired_atx_deposit` | Hoàn tiền deposit ATX hết hạn |
| `user.ts` | `user.bans.created` | Xóa comments/posts của user bị ban |
| `index.ts` | — | Import tất cả task files ở trên |

---

## Luồng xử lý request (tổng quan)

```
Client (Mobile/Web)
    │
    ▼
┌─────────────────────────┐
│  routes/ (43 files)     │  Tìm đúng controller method
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Middleware (7 files)   │  Auth → Ban → RateLimit → Log
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Controllers/ (54)      │  Nhận params, gọi service
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Services/ (47)         │  Business logic
└────────────┬────────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
  Mongo    Redis    Kafka
  (101)   (cache)  (tasks/)
```

---

## Mẹo đọc code

1. **Bắt đầu từ route** — Muốn hiểu API nào đó, tìm trong `routes/` trước
2. **Theo dấu controller** — Route chỉ tới controller method nào, đọc method đó
3. **Đào sâu service** — Controller gọi service nào, đọc `docs.md` của service đó
4. **Xem model** — Service dùng model nào trong `mongo/`, đọc schema để hiểu data
5. **Kiểm tra config** — Nếu thấy import từ `Config/`, xem file config tương ứng
