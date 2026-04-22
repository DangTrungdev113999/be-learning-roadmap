# Bài tập: Security

## Bài 1: Xác định lỗ hổng bảo mật

### Đề bài

Đọc các đoạn code controller dưới đây và tìm tất cả lỗ hổng bảo mật. Với mỗi lỗ hổng, ghi rõ: loại lỗ hổng, rủi ro, và cách sửa.

**Controller A: Cập nhật profile**

```ts
class UsersController {
  async updateProfile(util) {
    const userId = util.gp('userId')
    const name = util.gp('name')
    const role = util.gp('role', null)
    const bio = util.gp('bio', '')

    await userService.update(userId, { name, role, bio })

    return { success: true }
  }
}
```

**Controller B: Xóa bình luận**

```ts
class CommentsController {
  async delete(util) {
    await util.auth.login()
    const commentId = util.gp('commentId')

    await commentService.delete(commentId)
    log.info({ commentId, password: util.auth.password }, 'Comment deleted')

    return { success: true }
  }
}
```

**Controller C: Tìm kiếm user**

```ts
class SearchController {
  async searchUsers(util) {
    const query = util.gp('query')
    const limit = util.gp('limit', 100, 'number')

    const users = await db.collection('users').find({
      $where: `this.name.includes('${query}')`
    }).limit(limit).toArray()

    return users
  }
}
```

**Controller D: Export dữ liệu**

```ts
class ExportController {
  async exportData(util) {
    await util.auth.login()
    const format = util.gp('format')
    const dateFrom = util.gp('dateFrom')
    const dateTo = util.gp('dateTo')

    const data = await exportService.generate(
      util.auth.userId, format, dateFrom, dateTo
    )

    return data
  }
}
```

### Yêu cầu
Với mỗi controller (A, B, C, D), liệt kê:
1. Số lỗ hổng tìm được (gợi ý: tổng cộng ít nhất 12 lỗ hổng)
2. Loại lỗ hổng (Missing auth, Missing validation, Injection, Logging sensitive data, v.v.)
3. Mức độ nghiêm trọng (Low/Medium/High/Critical)
4. Code đã sửa

---

## Bài 2: Sửa code không an toàn

### Đề bài

Viết lại controller dưới đây cho an toàn, áp dụng đầy đủ security checklist.

**Code gốc (không an toàn):**

```ts
// Route: Không có middleware
Route.post('/api/payments/create', 'PaymentsController.create')

class PaymentsController {
  async create(util) {
    const userId = util.gp('userId')
    const amount = util.gp('amount')
    const planId = util.gp('planId')
    const provider = util.gp('provider')

    const plan = await planService.getById(planId)
    const payment = await paymentService.create({
      userId,
      amount,
      planId,
      provider,
    })

    log.info({ userId, amount, planId, provider, token: util.auth.token }, 'Payment created')

    return payment
  }
}
```

### Yêu cầu
1. Viết lại route với rate limit middleware
2. Viết lại controller với:
   - Authentication
   - Input validation (type, range, enum)
   - Ownership check (userId phải là user hiện tại)
   - Business validation (plan exists, amount matches plan price)
   - Logging an toàn (không log token)
3. Giải thích mỗi thay đổi

---

## Bài 3: Thiết kế Authentication Flow

### Đề bài

Thiết kế auth flow cho tính năng "Đăng nhập bằng số điện thoại + OTP" gồm:
1. User nhập số điện thoại
2. Server gửi OTP qua SMS
3. User nhập OTP
4. Server verify OTP và trả Access Token + Refresh Token

### Yêu cầu
1. Vẽ sequence diagram (dạng text/ASCII) cho toàn bộ flow
2. Liệt kê tất cả API endpoints cần tạo, mỗi endpoint ghi rõ:
   - Method + Path
   - Input (request body)
   - Output (response)
   - Rate limit config
   - Các token tạo ra ở mỗi bước (tham khảo `rules` trong `utils/token.ts`)
3. Trả lời các câu hỏi bảo mật:
   - OTP nên hết hạn sau bao lâu? Tại sao?
   - Giới hạn bao nhiêu lần nhập OTP sai? Tại sao?
   - Nếu attacker biết số điện thoại user, họ có thể làm gì? Cách phòng?
   - Tại sao cần token khác nhau cho mỗi bước (REQUEST_OTP, VERIFY_OTP, ACCESS)?
   - Refresh Token nên lưu ở đâu trên mobile app? Tại sao?

### Gợi ý
- Tham khảo flow Google login trong `utils/token.ts` (rule 6 -> rule 7 -> rule 1)
- Rate limit SMS API rất quan trọng (SMS tốn tiền!)
- OTP thường 4-6 chữ số, hết hạn 5 phút

---

## Bài 4: Viết Rate Limit Config

### Đề bài

Cho hệ thống API sau, thiết kế rate limit config phù hợp:

```
Public APIs (không cần login):
  GET  /api/stocks/overview        -- Lấy tổng quan thị trường
  GET  /api/stocks/detail          -- Chi tiết 1 cổ phiếu
  GET  /api/news/list              -- Danh sách tin tức

Auth APIs:
  POST /api/auth/request-otp       -- Gửi OTP
  POST /api/auth/verify-otp        -- Xác thực OTP
  POST /api/auth/login             -- Đăng nhập email/password
  POST /api/auth/refresh-token     -- Làm mới token

User APIs (cần login):
  GET  /api/users/profile          -- Xem profile
  PUT  /api/users/update           -- Sửa profile
  POST /api/alerts/create          -- Tạo cảnh báo giá
  DELETE /api/alerts/delete        -- Xóa cảnh báo

Expert APIs (cần expert role):
  POST /api/rooms/create           -- Tạo phòng
  POST /api/posts/create           -- Tạo bài viết

Admin APIs:
  GET  /api/admin/users            -- Danh sách users
  POST /api/admin/ban-user         -- Ban user
  GET  /api/admin/reports          -- Báo cáo (query nặng)

Payment APIs:
  POST /api/plans/verify-google    -- Xác thực Google Pay
  POST /api/plans/verify-apple     -- Xác thực Apple Pay
```

### Yêu cầu

1. Với mỗi endpoint, ghi:
   - `uniqueKey`: 'ip', 'userId', hoặc ''
   - `points`: Bao nhiêu requests
   - `duration`: Trong bao nhiêu giây
   - Lý do chọn config đó

2. Viết code route cho 5 endpoints quan trọng nhất (dùng `RateLimitMiddleware.build()`)

3. Trả lời:
   - Endpoint nào cần rate limit chặt nhất? Tại sao?
   - Endpoint nào có thể lỏng nhất? Tại sao?
   - Nếu 1 IP gửi 1000 request/giây đến `/api/auth/login`, chuyện gì xảy ra?
   - Nếu admin bị rate limit khi debug, làm sao?

---

## Bài 5: Security Audit mô phỏng

### Đề bài

Bạn được giao audit bảo mật cho một module mới trong Logics. Module "Room Chat" có các chức năng:

- Tạo room (chỉ expert)
- Mời user vào room (chủ room hoặc admin)
- Gửi tin nhắn (thành viên room)
- Xóa tin nhắn (tác giả tin nhắn hoặc chủ room hoặc admin)
- Kick user khỏi room (chủ room hoặc admin)
- Xóa room (chủ room hoặc admin)

### Yêu cầu

1. **Threat modeling**: Liệt kê ít nhất 8 attack vectors (cách tấn công) cho module này. Ví dụ:
   - User gửi tin nhắn chứa XSS payload
   - User không phải thành viên nhưng gọi API gửi tin
   - ...

2. **Security design**: Với mỗi API endpoint, viết pseudo-code cho phần security (auth + validate + rate limit):

   ```ts
   async createRoom(util) {
     // Viết phần security ở đây
     // ...
     // Business logic bên dưới
   }
   ```

3. **Input validation**: Liệt kê tất cả input cần validate cho mỗi endpoint:
   - Field name
   - Type
   - Constraints (min/max length, format, enum)
   - Tại sao validate đó quan trọng

4. **Incident scenario**: Nếu bạn phát hiện 1 user gửi 10,000 tin nhắn/phút (spam), mô tả:
   - Cách phát hiện (monitoring/alert)
   - Cách xử lý ngay (mitigation)
   - Cách ngăn lặp lại (prevention)
