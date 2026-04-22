# Security Checklist: Checklist bảo mật cho API

## Mục tiêu

Cung cấp checklist nhanh để review bảo mật mỗi khi tạo API mới hoặc review code. Tổng hợp tất cả kiến thức từ các bài trước.

---

## Checklist cho mỗi API mới

Dùng checklist này khi tạo mỗi endpoint mới trong Logics.

### 1. Authentication -- Xác thực

```
□ API có cần đăng nhập không?
  □ CÓ  -> Thêm util.auth.login() ở đầu controller
  □ KHÔNG -> Chắc chắn không? Data có nhạy cảm không?

□ Endpoint có sử dụng đúng auth level không?
  □ Chỉ user    -> util.auth.login()
  □ Chỉ expert  -> util.auth.expert()
  □ Chỉ admin   -> util.auth.admin()

□ Có kiểm tra ownership không?
  □ User chỉ truy cập resource của mình?
  □ util.check(resource.userId === util.auth.userId || isAdmin, '...')
```

**Ví dụ:**

```ts
class PostsController {
  async update(util) {
    // ✅ Auth
    await util.auth.login()

    const postId = util.gp('postId')
    const post = await postService.getById(postId)

    // ✅ Ownership check
    const isAdmin = await util.auth.admin(false)
    util.check(
      post.authorId === util.auth.userId || isAdmin,
      'Không có quyền sửa bài viết code:forbidden'
    )

    // ... update logic
  }
}
```

---

### 2. Input Validation -- Kiểm tra đầu vào

```
□ Mọi input đều được lấy qua util.gp() với type checking?
  □ String:  util.gp('name', '', 'string')
  □ Number:  util.gp('age', 0, 'number')
  □ Boolean: util.gp('active', true, 'boolean')
  □ Enum:    util.gp('status', null, ['active', 'inactive'])

□ Input bắt buộc có được check?
  □ util.gp('requiredField')  // throw nếu thiếu
  □ util.check(field, 'Thiếu field code:missing_field')

□ Giới hạn đã được set?
  □ String length: util.check(name.length <= 100, '...')
  □ Number range:  util.check(amount >= 0 && amount <= 10_000_000, '...')
  □ Array size:    util.check(ids.length <= 100, '...')
  □ Page size:     Math.min(util.gp('pageSize', 20, 'number'), 100)
  □ Date range:    Giới hạn max range (ví dụ: 60 ngày)

□ Không có MongoDB operator injection?
  □ Input là string/number/boolean, không phải object chứa $
  □ Mongoose schema enforce types
```

**Ví dụ:**

```ts
// ✅ Input validation đầy đủ
const name = util.gp('name', '', 'string')
util.check(name.length <= 100, 'Tên tối đa 100 ký tự code:name_too_long')

const amount = util.gp('amount', 0, 'number')
util.check(amount >= 50_000, 'Tối thiểu 50,000 VND code:amount_too_small')
util.check(amount <= 10_000_000, 'Tối đa 10 triệu VND code:amount_too_large')

const type = util.gp('type', null, ['post', 'symbol', 'expert'])
const pageSize = Math.min(util.gp('pageSize', 20, 'number'), 100)
```

---

### 3. Rate Limiting -- Giới hạn tần suất

```
□ API có rate limit không?
  □ Public API -> Per IP:     RateLimitMiddleware.build(path, 'ip', points, duration)
  □ User API   -> Per User:   RateLimitMiddleware.build(path, 'userId', points, duration)
  □ Auth API   -> Per IP (strict): RateLimitMiddleware.build(path, 'ip', 5, 60)

□ Rate limit có hợp lý không?
  □ Không quá lỏng (để bị abuse)
  □ Không quá chặt (gây ảnh hưởng user thật)
  □ Auth endpoints: max 5 req/phút per IP
  □ Normal endpoints: 10 req/s per user
  □ Heavy endpoints: 2-5 req/phút per user

□ Rate limit đã được test?
  □ Verify trả HTTP 429 khi vượt giới hạn
  □ Verify reset sau duration
```

**Ví dụ:**

```ts
// routes/posts.ts
Route.post('/create', 'PostsController.create').middleware([
  RateLimitMiddleware.build('/api/posts/create', 'userId', 10, 60),
  // 10 bài viết / phút / user
])

Route.get('/list', 'PostsController.list').middleware([
  RateLimitMiddleware.build('/api/posts/list', 'ip', 30, 1),
  // 30 requests / giây / IP
])
```

---

### 4. Logging -- Ghi log

```
□ Có log cho các sự kiện quan trọng?
  □ log.info() khi thành công (tạo, sửa, xóa resource)
  □ log.warn() khi có gì bất thường (retry, fallback)
  □ log.error() khi lỗi (exception, validation fail)

□ Log có đủ context?
  □ userId (ai thực hiện?)
  □ Resource ID (thao tác trên resource nào?)
  □ Input data (với data gì?)
  □ Error message (lỗi gì?)

□ Log KHÔNG chứa dữ liệu nhạy cảm?
  □ Không log password (kể cả hash)
  □ Không log full credit card number
  □ Không log JWT token
  □ Không log OTP code

□ Logger có tags đúng format?
  □ Logger.child({ tags: ['serviceName.functionName'] })
```

**Ví dụ:**

```ts
const log = Logger.child({ tags: ['postService.createPost'] })

// ✅ Log đủ context, không chứa sensitive data
log.info({ userId, postId: newPost._id, title: newPost.title }, 'Post created')
log.error({ userId, error: error.message }, 'Failed to create post')

// ❌ SAI: Log password, token
log.info({ password, token }, 'User login')
```

---

### 5. CORS -- Cross-Origin Resource Sharing

```
□ CORS đã được cấu hình?
  □ origin: Chỉ cho phép domain hợp lệ (production)
  □ methods: Chỉ cho phép methods cần thiết
  □ credentials: true nếu dùng cookies

□ Logics config hiện tại (config/cors.ts):
  □ origin: true (cho phép request origin) -- production nên restrict hơn
  □ methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH']
  □ credentials: true
  □ maxAge: 90 giây
```

**Ví dụ config tốt hơn cho production:**

```ts
const corsConfig = {
  enabled: true,
  origin: [
    'https://app.logics.vn',
    'https://admin.logics.vn',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
  maxAge: 3600,  // Cache preflight 1 giờ
}
```

---

### 6. Security Headers

```
□ Response có security headers?
  □ X-Content-Type-Options: nosniff
  □ X-Frame-Options: DENY (hoặc SAMEORIGIN)
  □ Strict-Transport-Security: max-age=31536000 (HSTS)
  □ X-XSS-Protection: 1; mode=block
  □ Content-Security-Policy (nếu serve HTML)
  □ Referrer-Policy: strict-origin-when-cross-origin
```

**Setup trong AdonisJS:**

```ts
// Thêm middleware hoặc dùng @adonisjs/shield
app.use(async (ctx, next) => {
  ctx.response.header('X-Content-Type-Options', 'nosniff')
  ctx.response.header('X-Frame-Options', 'DENY')
  ctx.response.header('X-XSS-Protection', '1; mode=block')
  ctx.response.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  await next()
})
```

---

## Quick Reference Card

Bản tóm tắt 1 trang để in ra hoặc bookmark:

```
┌─────────────────────────────────────────────────────────┐
│          SECURITY CHECKLIST - MỖI API MỚI               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. AUTH                                                 │
│     □ util.auth.login/expert/admin()                     │
│     □ Ownership check (resource.userId === auth.userId)  │
│                                                          │
│  2. VALIDATE                                             │
│     □ util.gp() với type ('string', 'number', enum)      │
│     □ util.check() cho business rules                    │
│     □ Giới hạn: length, range, array size, page size     │
│                                                          │
│  3. RATE LIMIT                                           │
│     □ Public -> per IP                                   │
│     □ User -> per userId                                 │
│     □ Auth -> per IP, strict (5 req/min)                 │
│                                                          │
│  4. LOG                                                  │
│     □ info/warn/error với đủ context                     │
│     □ KHÔNG log password, token, sensitive data           │
│     □ Logger.child({ tags: ['service.function'] })       │
│                                                          │
│  5. CORS                                                 │
│     □ Restrict origin cho production                     │
│                                                          │
│  6. HEADERS                                              │
│     □ X-Content-Type-Options: nosniff                    │
│     □ X-Frame-Options: DENY                              │
│     □ Strict-Transport-Security                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Ví dụ đầy đủ: API tạo bài viết

```ts
// routes/posts.ts
Route.post('/create', 'PostsController.create').middleware([
  RateLimitMiddleware.build('/api/posts/create', 'userId', 10, 60),
])

// Controller
class PostsController {
  async create(util) {
    // 1. AUTH
    await util.auth.login()

    // 2. VALIDATE
    const title = util.gp('title', '', 'string')
    util.check(title.length >= 1, 'Thiếu tiêu đề code:missing_title')
    util.check(title.length <= 200, 'Tiêu đề tối đa 200 ký tự code:title_too_long')

    const content = util.gp('content', '', 'string')
    util.check(content.length >= 10, 'Nội dung quá ngắn code:content_too_short')
    util.check(content.length <= 50_000, 'Nội dung tối đa 50,000 ký tự code:content_too_long')

    const tags = util.gp('tags', [])
    util.check(Array.isArray(tags), 'Tags phải là mảng code:invalid_tags')
    util.check(tags.length <= 10, 'Tối đa 10 tags code:too_many_tags')

    // 3. RATE LIMIT -> Đã xử lý ở middleware

    // 4. BUSINESS LOGIC
    const post = await postService.create({
      authorId: util.auth.userId,
      title,
      content,
      tags,
    })

    // 5. LOG
    log.info({ userId: util.auth.userId, postId: post._id }, 'Post created')

    return post
  }
}
```

---

## Code Review Checklist

Khi review PR của teammate, kiểm tra:

```
□ Controller có util.auth ở dòng đầu tiên không?
□ Input có validate type qua util.gp không?
□ Có util.check cho business rules không?
□ Route có middleware rate limit không?
□ Có log success/error actions không?
□ Log có chứa sensitive data không? (password, token)
□ Có kiểm tra ownership khi sửa/xóa không?
□ Array/page size có giới hạn không?
□ Có xử lý edge case: null, undefined, empty string?
```

---

## Điểm chính cần nhớ

1. Mỗi API mới phải qua **6 checkpoint**: Auth, Validate, Rate Limit, Log, CORS, Headers.
2. **Auth đầu tiên** -- dòng đầu tiên của controller phải là `util.auth.*()`.
3. **Validate hết** -- không tin bất kỳ input nào từ client, dùng `util.gp()` + `util.check()`.
4. **Rate limit phù hợp** -- strict cho auth API, moderate cho user API, lenient cho read API.
5. **Log đủ nhưng an toàn** -- đủ context để debug, không chứa sensitive data.
6. In **Quick Reference Card** ra và dán cạnh màn hình cho đến khi thành thói quen.
