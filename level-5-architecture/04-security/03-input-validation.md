# Input Validation: Kiểm tra đầu vào

## Mục tiêu

Hiểu tại sao BE bắt buộc phải validate input (dù FE đã validate), cách Logics dùng `util.gp()` và `util.check()`, và nguyên tắc sanitization.

---

## Tại sao BE phải validate dù FE đã validate?

### FE validation dễ bypass

```
Cách bypass FE validation:

1. Tắt JavaScript trong browser
   -> Tất cả validation bằng JS không chạy

2. Sửa request qua DevTools > Network > Edit and Resend
   -> Gửi bất kỳ data nào

3. Dùng curl/Postman gọi API trực tiếp
   $ curl -X POST /api/users/update \
     -d '{"name": "<script>alert(1)</script>", "age": -999}'
   -> Không đi qua FE nào cả

4. Sửa localStorage/state trong Console
   -> Bypass validation logic trong component
```

### Nguyên tắc

```
FE validation = User Experience
  -> Hiển thị lỗi ngay, không cần đợi server
  -> "Email không đúng format" ngay khi gõ

BE validation = Security
  -> Hàng rào cuối cùng trước khi data vào database
  -> Không tin bất kỳ gì từ client
  -> Dù FE có validate, BE vẫn phải validate lại
```

---

## util.gp() -- Lấy và validate input

`util.gp()` (get parameter) là helper của Logics để lấy input từ query/body kèm validation.

### Cú pháp

```ts
// Lấy giá trị bắt buộc (throw nếu thiếu)
const name = util.gp('name')

// Lấy giá trị có default (trả default nếu thiếu)
const page = util.gp('page', 1)
const search = util.gp('search', null)

// Validate type
const age = util.gp('age', 0, 'number')          // Phải là number
const email = util.gp('email', '', 'string')       // Phải là string
const active = util.gp('active', true, 'boolean')  // Phải là boolean

// Validate enum (chỉ chấp nhận giá trị trong danh sách)
const sortBy = util.gp('sortBy', 'date', ['date', 'name', 'price'])
const groupBy = util.gp('groupBy', 'day', ['day', 'week', 'month'])

// Validate regex
const code = util.gp('code', null, /^[A-Z]{3}$/)  // 3 chữ cái in hoa

// Validate bằng function tùy chỉnh
const limit = util.gp('limit', 10, (v) => v > 0 && v <= 100)
```

### Ví dụ thật từ Logics

```ts
// Analytics dashboard controller
const fromStr = util.gp('from')                            // Bắt buộc
const toStr = util.gp('to')                                // Bắt buộc
const groupBy = util.gp('groupBy', 'day', ['day', 'week', 'month'])  // Enum
const eventKeys = util.gp('eventKeys', null)                // Tùy chọn
const type = util.gp('type', null, ['post', 'symbol', 'expert'])     // Enum
const limit = Math.min(util.gp('limit', 10, 'number'), 100)          // Number + giới hạn max
```

### So sánh FE vs BE validation

```tsx
// FE: React form validation
<input
  value={name}
  onChange={(e) => {
    if (e.target.value.length > 50) return  // Max length
    setName(e.target.value)
  }}
/>
{!name && <span className="error">Tên không được để trống</span>}

// BE: util.gp() validation
const name = util.gp('name')                          // Bắt buộc, throw nếu thiếu
util.check(name.length <= 50, 'Tên quá dài code:name_too_long')  // Max length
```

---

## util.check() -- Assert điều kiện

`util.check()` kiểm tra điều kiện và throw error nếu không thỏa mãn. Pattern: `util.check(condition, 'Vietnamese message code:error_code')`.

### Cú pháp

```ts
util.check(condition, 'Thông báo lỗi tiếng Việt code:error_code')
//         |           |                              |
//         boolean     Hiển thị cho user               Cho FE handle programmatically
```

### Ví dụ thật từ Logics

```ts
// Validate dữ liệu thanh toán
util.check(content, 'Missing content code:missing_content')
util.check(extract.code, 'Missing finpath code in message code:missing_code')
util.check(extract.amount, 'Missing amount in message code:missing_amount')
util.check(user, 'Không tìm thấy người dùng code:user_not_found')
util.check(room, 'Không tìm thấy nhóm code:room_not_found')
util.check(expert, 'Không tìm thấy chuyên gia code:expert_not_found')
util.check(plan, 'Plan not found code:plan_not_found')
util.check(plan.price >= 50_000, 'Số tiền thanh toán phải từ 50,000 VND code:plan_price_too_small')
```

### Pattern: Validate sớm, fail nhanh

```ts
class PaymentsController {
  async createPayment(util) {
    await util.auth.login()

    // 1. Lấy input + validate type
    const planId = util.gp('planId')
    const provider = util.gp('provider', null, ['google', 'apple', 'bank'])
    const amount = util.gp('amount', 0, 'number')

    // 2. Validate business rules (fail nhanh trước khi query DB)
    util.check(amount >= 50_000, 'Số tiền phải từ 50,000 VND code:amount_too_small')
    util.check(amount <= 10_000_000, 'Số tiền không quá 10 triệu code:amount_too_large')

    // 3. Validate data từ DB
    const plan = await planService.getById(planId)
    util.check(plan, 'Plan không tồn tại code:plan_not_found')
    util.check(plan.isActive, 'Plan đã ngừng bán code:plan_inactive')

    // 4. Logic chính (chỉ chạy nếu tất cả validation pass)
    const payment = await paymentService.create({
      userId: util.auth.userId,
      planId,
      provider,
      amount,
    })

    return payment
  }
}
```

---

## Các loại validation

### 1. Presence -- Có tồn tại không?

```ts
const name = util.gp('name')  // Throw nếu thiếu
util.check(name, 'Thiếu tên code:missing_name')
```

### 2. Type -- Đúng kiểu dữ liệu không?

```ts
const age = util.gp('age', 0, 'number')        // Phải là number
const active = util.gp('active', true, 'boolean') // Phải là boolean
```

### 3. Range -- Trong khoảng cho phép không?

```ts
const page = util.gp('page', 1, 'number')
util.check(page > 0, 'Page phải lớn hơn 0 code:invalid_page')

const limit = util.gp('limit', 10, 'number')
util.check(limit >= 1 && limit <= 100, 'Limit từ 1-100 code:invalid_limit')
```

### 4. Format -- Đúng format không?

```ts
const email = util.gp('email', '', 'string')
util.check(
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  'Email không hợp lệ code:invalid_email'
)

const phone = util.gp('phone', null, /^0\d{9}$/)  // SĐT Việt Nam
```

### 5. Enum -- Thuộc danh sách cho phép không?

```ts
const status = util.gp('status', null, ['active', 'inactive', 'banned'])
const sortBy = util.gp('sortBy', 'createdAt', ['createdAt', 'name', 'price'])
```

### 6. Business logic -- Thỏa mãn nghiệp vụ không?

```ts
util.check(plan.price >= 50_000, 'Giá phải từ 50,000 VND code:price_too_low')
util.check(
  endDate > startDate,
  'Ngày kết thúc phải sau ngày bắt đầu code:invalid_date_range'
)
```

---

## Sanitization -- Làm sạch dữ liệu

Validation kiểm tra "có hợp lệ không". Sanitization biến đổi dữ liệu "cho an toàn".

### Các kỹ thuật sanitization

```ts
// 1. Trim whitespace
const name = util.gp('name').trim()

// 2. Giới hạn độ dài
const bio = util.gp('bio', '').substring(0, 500)

// 3. Remove HTML tags (chống XSS)
const comment = stripHtml(util.gp('comment'))

// 4. Escape special characters
const searchQuery = escapeRegex(util.gp('query'))

// 5. Normalize Unicode
const text = util.gp('text').normalize('NFC')

// 6. Lowercase email
const email = util.gp('email').toLowerCase().trim()
```

### Thứ tự xử lý input

```
Client gửi input
  ↓
1. Parse (JSON.parse, URL decode)
  ↓
2. Sanitize (trim, lowercase, strip HTML)
  ↓
3. Validate (type check, range check, format check)
  ↓
4. Business validation (check DB, check permissions)
  ↓
5. Sử dụng (lưu DB, xử lý logic)
```

---

## Lỗi thường gặp

### 1. Validate ở FE nhưng quên ở BE

```ts
// FE có maxLength={50} trên input
// Nhưng BE không check -> User gửi trực tiếp string 10,000 ký tự
// -> DB bloat, performance issues

// Fix: Luôn validate cả ở BE
util.check(name.length <= 50, 'Tên tối đa 50 ký tự code:name_too_long')
```

### 2. Không validate array size

```ts
// User gửi array 1 triệu items
const ids = util.gp('ids')  // Mảng không giới hạn!

// Fix:
const ids = util.gp('ids')
util.check(Array.isArray(ids), 'ids phải là mảng code:invalid_ids')
util.check(ids.length <= 100, 'Tối đa 100 items code:too_many_ids')
```

### 3. Không giới hạn page size

```ts
// User gửi pageSize=999999 -> query trả về toàn bộ DB
const pageSize = util.gp('pageSize', 20, 'number')

// Fix:
const pageSize = Math.min(util.gp('pageSize', 20, 'number'), 100)
```

---

## Điểm chính cần nhớ

1. **FE validation = UX, BE validation = Security**. BE luôn phải validate dù FE đã validate.
2. `util.gp('key')` bắt buộc, `util.gp('key', default)` tùy chọn, `util.gp('key', default, validator)` có kiểm tra type/enum/regex.
3. `util.check(condition, 'message code:code')` -- assert và throw nếu false.
4. **Validate sớm, fail nhanh** -- kiểm tra input trước khi query DB hay xử lý logic nặng.
5. **Sanitize trước, validate sau** -- trim, lowercase, strip HTML trước khi kiểm tra.
6. Luôn **giới hạn**: độ dài string, kích thước array, page size, date range.
