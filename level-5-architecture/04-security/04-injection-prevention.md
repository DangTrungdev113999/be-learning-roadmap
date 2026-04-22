# Injection Prevention: Phòng chống tấn công injection

## Mục tiêu

Hiểu các loại tấn công injection phổ biến (NoSQL Injection, XSS, CSRF), cách chúng hoạt động, và cách phòng chống trong Logics (MongoDB + Node.js).

---

## Injection là gì?

Injection xảy ra khi attacker chèn code/query độc hại vào input, và server thực thi input đó mà không kiểm tra.

```
So sánh FE:
  User nhập "<script>alert('hacked')</script>" vào ô comment
  -> Nếu FE render trực tiếp: trình duyệt chạy script đó
  -> React mặc định đã escape: hiển thị text thuần (an toàn)

BE tương tự:
  User nhập payload độc hại vào API request
  -> Nếu BE đưa thẳng vào query: database thực thi lệnh attacker
  -> Nếu BE validate/sanitize: an toàn
```

---

## 1. NoSQL Injection (MongoDB)

### SQL Injection vs NoSQL Injection

```
SQL Injection (database truyền thống):
  Input: ' OR '1'='1
  Query: SELECT * FROM users WHERE name = '' OR '1'='1'
  -> Trả về TẤT CẢ users

NoSQL Injection (MongoDB):
  Input: { "$gt": "" }
  Query: db.users.find({ password: { "$gt": "" } })
  -> Trả về TẤT CẢ users (vì mọi string > "")
```

### Cách tấn công MongoDB

#### Ví dụ 1: Bypass authentication

```ts
// Code không an toàn
app.post('/login', async (req, res) => {
  const user = await db.collection('users').findOne({
    email: req.body.email,
    password: req.body.password,  // User gửi { "$ne": "" } thay vì password string
  })
  // Query thành: { email: "admin@logics.vn", password: { "$ne": "" } }
  // -> Tìm user có password KHÔNG BẰNG "" -> Trả về admin!
})
```

#### Ví dụ 2: Data exfiltration

```ts
// Code không an toàn
app.get('/search', async (req, res) => {
  const results = await db.collection('users').find({
    name: req.query.name,  // User gửi { "$regex": ".*" }
  })
  // Query thành: { name: { "$regex": ".*" } }
  // -> Trả về TẤT CẢ users
})
```

#### Ví dụ 3: Operator injection

```ts
// User gửi JSON body:
{
  "username": "admin",
  "password": { "$gt": "" }     // MongoDB operator thay vì string
}

// Hoặc advanced hơn:
{
  "username": { "$regex": "^admin" },
  "password": { "$exists": true }    // Chỉ cần password tồn tại
}
```

### Cách phòng chống NoSQL Injection

#### 1. Validate type input

```ts
// ĐÚNG: Dùng util.gp() với type checking
const email = util.gp('email', '', 'string')    // Buộc phải là string
const password = util.gp('password', '', 'string')

// Nếu attacker gửi { "$gt": "" }, util.gp sẽ reject vì không phải string
```

#### 2. Mongoose tự động sanitize

```ts
// Mongoose Schema tự enforce type
const UserSchema = new Schema({
  email: { type: String, required: true },
  password: { type: String, required: true },
})

// Khi query qua Mongoose:
User.findOne({ email, password })
// Mongoose tự động cast email và password thành String
// Nếu là object { "$gt": "" } -> Mongoose sẽ cast thành "[object Object]"
// -> Query không thành công -> An toàn
```

#### 3. Sanitize MongoDB operators

```ts
// Hàm loại bỏ MongoDB operators từ input
function sanitizeMongoInput(input: any): any {
  if (typeof input === 'string') return input
  if (typeof input !== 'object' || input === null) return input

  const sanitized = {}
  for (const key of Object.keys(input)) {
    // Loại bỏ key bắt đầu bằng $ (MongoDB operators)
    if (key.startsWith('$')) continue
    sanitized[key] = sanitizeMongoInput(input[key])
  }
  return sanitized
}

// Hoặc dùng thư viện: express-mongo-sanitize
import mongoSanitize from 'express-mongo-sanitize'
app.use(mongoSanitize())  // Tự động strip $ từ req.body, req.query, req.params
```

#### 4. Không bao giờ dùng $where

```
CỰC KỲ NGUY HIỂM: $where cho phép chạy JavaScript tùy ý trong MongoDB query.
Nếu kết hợp với user input, attacker có thể inject bất kỳ code nào.

ĐÚNG: Luôn dùng MongoDB query operators thông thường
  db.users.find({ name: userInput })  // userInput đã được validate là string
```

---

## 2. XSS (Cross-Site Scripting)

### XSS là gì?

Attacker chèn JavaScript vào data, khi user khác xem data đó, script chạy trong browser của họ.

```
FE developer đã biết:
- React tự động escape: {userInput} -> an toàn
- Render HTML trực tiếp từ user input -> KHÔNG an toàn
- Nhưng tại sao BE cần quan tâm?

Tại sao BE quan tâm XSS:
- BE lưu data vào DB -> Data hiển thị ở nhiều nơi (web, mobile, email)
- Nếu BE không sanitize khi LƯU, mọi client hiển thị đều bị XSS
- Một số client (email, mobile webview) không có protection như React
```

### Các loại XSS

```
1. Stored XSS (Nguy hiểm nhất):
   Attacker lưu script vào DB -> Mọi user xem đều bị
   Ví dụ: Comment chứa <script>, tên user chứa <img onerror="...">

2. Reflected XSS:
   Script nằm trong URL -> User click link -> Bị
   Ví dụ: /search?q=<script>alert(1)</script>

3. DOM-based XSS:
   Script exploit DOM manipulation ở client
   Ví dụ: gán innerHTML trực tiếp từ location.hash
```

### Phòng chống XSS ở Backend

```ts
// 1. Sanitize HTML khi LƯU vào DB
import { sanitize } from 'isomorphic-dompurify'

const comment = sanitize(util.gp('comment'))
// Input:  <p>Hello</p><script>alert(1)</script>
// Output: <p>Hello</p>   (script bị loại bỏ)

// 2. Hoặc strip tất cả HTML tags
import striptags from 'striptags'

const name = striptags(util.gp('name'))
// Input:  <img src=x onerror="alert(1)">John
// Output: John

// 3. Set Content-Type header đúng
response.header('Content-Type', 'application/json')
// -> Browser không render HTML, chỉ parse JSON

// 4. Security headers
response.header('X-Content-Type-Options', 'nosniff')
response.header('X-XSS-Protection', '1; mode=block')  // Legacy browsers
```

### So sánh FE

```tsx
// FE: React tự escape (an toàn)
<p>{userComment}</p>
// Script tag hiển thị thành text thuần, không chạy

// FE: Render raw HTML từ user input (NGUY HIỂM)
// Nếu dùng innerHTML hoặc tương đương với untrusted data
// -> Script chạy trong browser!

// BE: Nên sanitize (DOMPurify) trước khi lưu vào DB
// -> Dù FE nào render, data đã sạch
```

---

## 3. CSRF (Cross-Site Request Forgery)

### CSRF là gì?

Attacker lừa user đã đăng nhập gửi request đến server mà user không biết.

```
Kịch bản tấn công:

1. User đăng nhập app Logics (cookie session active)

2. User mở trang attacker (ví dụ: email phishing link)

3. Trang attacker chứa hidden form tự động submit đến API Logics
   với các giá trị mà attacker chọn

4. Browser tự gửi cookie của logics.vn -> Server nghĩ user thật gửi request
   -> Hành động được thực thi mà user không biết!
```

### Tại sao Logics ít bị CSRF?

```
Logics dùng JWT trong Authorization header (không phải cookie)
-> Browser KHÔNG tự gửi JWT khi navigate đến URL
-> CSRF không hoạt động với Bearer token

Nhưng nếu dùng cookie-based auth:
-> Cần CSRF protection
```

### Phòng chống CSRF

```ts
// 1. Dùng JWT Bearer token thay vì cookie session
// Header: Authorization: Bearer <token>
// -> Browser không tự gửi -> CSRF không hoạt động

// 2. Nếu dùng cookie, thêm CSRF token
// Server tạo random token, gửi qua meta tag hoặc cookie
// Client gửi kèm mỗi POST request
// Server verify CSRF token khớp

// 3. SameSite cookie attribute
// Set-Cookie: session=abc; SameSite=Strict
// -> Cookie chỉ gửi từ same site, không từ cross-site

// 4. CORS configuration (Logics đã có)
// config/cors.ts
const corsConfig = {
  enabled: true,
  origin: true,         // Chỉ chấp nhận same origin
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH'],
}
```

---

## 4. Command Injection

### Cách tấn công

Khi server chạy shell command với user input, attacker có thể inject thêm lệnh:

```
Ví dụ: Server nhận hostname từ user và ping
  Input bình thường: "google.com"
  Input độc hại: "google.com; cat /etc/passwd"

  Command thực thi: ping -c 3 google.com; cat /etc/passwd
  -> Chạy THÊM lệnh thứ hai, đọc file mật khẩu hệ thống!
```

### Phòng chống

```ts
// 1. KHÔNG BAO GIỜ chạy shell command với user input trực tiếp
// 2. Nếu bắt buộc, dùng execFile (không qua shell, an toàn hơn)
import { execFile } from 'child_process'
execFile('ping', ['-c', '3', validatedHost])
// execFile không parse shell syntax nên "; rm -rf /" chỉ là 1 argument

// 3. Validate input format chặt
const host = util.gp('host', '', 'string')
util.check(
  /^[a-zA-Z0-9.-]+$/.test(host),
  'Host không hợp lệ code:invalid_host'
)

// 4. Ưu tiên dùng thư viện Node.js thay vì shell command
// Thay vì gọi imagemagick command -> dùng sharp library
// Thay vì gọi ffmpeg command -> dùng fluent-ffmpeg library với API
```

---

## Tổng kết các loại Injection

| Loại | Mục tiêu | Input độc hại | Phòng chống |
|------|----------|---------------|-------------|
| **NoSQL Injection** | MongoDB queries | `{ "$gt": "" }` | Type checking, Mongoose, sanitize `$` operators |
| **XSS** | Browser của user khác | `<script>alert(1)</script>` | Sanitize HTML, escape output, security headers |
| **CSRF** | Lừa user gửi request | Hidden form submit | JWT Bearer token, CSRF token, SameSite cookie |
| **Command Injection** | OS command | `; rm -rf /` | Không dùng shell, validate input, dùng execFile |

---

## Checklist phòng chống Injection

```
Mỗi khi nhận input từ user:

□ Input có được validate type không? (util.gp với 'string', 'number'...)
□ Input có được validate format không? (regex, enum)
□ Input có được sanitize không? (strip HTML, remove $ operators)
□ Input có được giới hạn length không?
□ Input có đi thẳng vào query/command không? (KHÔNG nên)
□ Mongoose schema có enforce type không?
□ Response có set đúng Content-Type không?
□ Có security headers không? (X-Content-Type-Options, X-XSS-Protection)
```

---

## Điểm chính cần nhớ

1. **NoSQL Injection**: Attacker gửi MongoDB operators (`$gt`, `$ne`) thay vì giá trị thường. Phòng bằng type checking (`util.gp('key', '', 'string')`) và Mongoose auto-cast.
2. **XSS**: Attacker chèn script vào data lưu DB. Phòng bằng sanitize HTML (DOMPurify) trước khi lưu. FE React tự escape nhưng BE nên sanitize vì data hiển thị ở nhiều client.
3. **CSRF**: Attacker lừa browser gửi request. Logics dùng JWT Bearer token nên ít bị, nhưng cần hiểu nếu dùng cookie-based auth.
4. Tuyệt đối **không dùng $where** trong MongoDB với user input, và tránh chạy shell commands với user input.
5. **Validate type + sanitize** là hai lớp phòng thủ cơ bản nhất.
