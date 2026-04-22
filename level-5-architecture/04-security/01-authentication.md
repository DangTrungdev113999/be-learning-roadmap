# Authentication: Xác thực người dùng

## Mục tiêu

Hiểu JWT hoạt động thế nào, tại sao dùng Access Token + Refresh Token, và cách Logics triển khai authentication.

---

## So sánh với Frontend

```
FE developer đã biết:
- Lưu token vào localStorage/cookie sau khi login
- Gửi token qua header Authorization mỗi request
- Redirect về /login khi token hết hạn

Bài này sẽ giải thích:
- Token đó được tạo ra thế nào ở BE?
- BE verify token bằng cách nào?
- Tại sao cần cả Access Token và Refresh Token?
```

---

## JWT là gì?

JWT (JSON Web Token) là chuỗi string mã hóa, chứa thông tin user mà BE có thể verify mà **không cần query database**.

### Cấu trúc: Header.Payload.Signature

```
eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMiLCJydWxlIjoxfQ.abc123signature
|_____ Header ________||_________ Payload ___________||___ Signature ___|
```

#### 1. Header -- Thuật toán mã hóa

```json
{
  "alg": "HS256",    // Thuật toán: HMAC-SHA256
  "typ": "JWT"       // Loại token
}
```

#### 2. Payload -- Dữ liệu user

```json
{
  "userId": "123",
  "identity": "user@example.com",
  "rule": 1,          // ACCESS_RESOURCE = 1 (trong Logics)
  "iat": 1742300000,  // Issued at (thời điểm tạo)
  "exp": 1742386400   // Expires at (thời điểm hết hạn)
}
```

**Lưu ý quan trọng:** Payload chỉ được **encode** (Base64), KHÔNG được **encrypt**. Ai cũng có thể đọc nội dung payload. Đừng bao giờ đặt password, credit card, hay thông tin nhạy cảm trong JWT.

#### 3. Signature -- Chữ ký xác thực

```
HMAC-SHA256(
  base64(header) + "." + base64(payload),
  SECRET_KEY    // Chỉ server biết
)
```

Signature đảm bảo: nếu ai đó sửa payload (ví dụ đổi userId), signature sẽ không khớp và BE sẽ reject.

### So sánh: JWT vs Session

```
Session-based (truyền thống):
  Client gửi sessionId -> Server tra database -> Tìm user info
  ✅ Có thể revoke ngay lập tức (xóa session khỏi DB)
  ❌ Mỗi request phải query database

JWT-based (stateless):
  Client gửi JWT -> Server verify signature -> Đọc user info từ payload
  ✅ Không cần query database (nhanh hơn)
  ❌ Không thể revoke trước khi hết hạn (trừ khi dùng blacklist)
```

---

## Trong Logics: utils/token.ts

### Các loại token

```ts
const rules = {
  ACCESS_RESOURCE: 1,                          // Token chính, dùng cho mọi API
  REFRESH_TOKEM: 2,                            // Token làm mới access token
  VERIFY_OTP_TOKEN: 3,                         // Token sau khi verify OTP
  REGISTER_WITH_OTP_TOKEN: 4,                  // Token cho flow đăng ký
  RESET_PASSWORD_WITH_OTP_TOKEN: 5,            // Token cho flow reset password
  REQUEST_OTP_TO_VERIFY_ACCOUNT_GOOGLE_TOKEN: 6,
  VERIFY_ACCOUNT_GOOGLE_WITH_OTP_TOKEN: 7,
  REQUEST_OTP_TO_VERIFY_ACCOUNT_FB_TOKEN: 8,
  VERIFY_ACCOUNT_FB_WITH_OTP_TOKEN: 9,
  REQUEST_OTP_TO_VERIFY_ACCOUNT_APPLE_TOKEN: 10,
  VERIFY_ACCOUNT_APPLE_WITH_OTP_TOKEN: 11,
  ADD_INFO_WITH_OTP_TOKEN: 12,
}
```

Mỗi token có `rule` khác nhau để BE biết token này dùng cho mục đích gì. Không thể dùng OTP token để gọi API thường.

### Tạo Access Token

```ts
genAccessResourceToken: ({ userId, identity }) => {
  return jwt.sign(
    {
      userId,           // ID người dùng
      identity,         // Email hoặc SĐT
      rule: rules.ACCESS_RESOURCE,  // Loại token = 1
    },
    tokenConfig.secretKeyToken,     // Secret key (từ env)
    {
      expiresIn: 6 * 60 * 60 * 24 * 30,  // 6 tháng (production)
      // Development: 30 * 6 tháng (gần như không hết hạn)
    },
  )
}
```

### Tạo Refresh Token

```ts
genRefreshToken: ({ userId, identity }) => {
  return jwt.sign(
    {
      userId,
      identity,
      rule: rules.REFRESH_TOKEM,    // Loại token = 2
    },
    tokenConfig.secretKeyToken,
    {
      expiresIn: 60 * 60 * 24 * 30 * 12 * 3,  // 3 năm!
    },
  )
}
```

### Verify Token

```ts
verifyToken: ({ token }) => {
  try {
    const decoded = jwt.verify(token, tokenConfig.secretKeyToken)
    return decoded  // { userId, identity, rule, iat, exp }
  } catch (e) {
    return undefined  // Token không hợp lệ hoặc hết hạn
  }
}
```

---

## Access Token vs Refresh Token

### Tại sao cần hai loại?

```
Vấn đề:
- Access Token hết hạn ngắn (bảo mật) -> User phải login lại thường xuyên (UX tệ)
- Access Token hết hạn dài (UX tốt) -> Bị đánh cắp thì attacker dùng lâu (bảo mật tệ)

Giải pháp: Dùng 2 token
- Access Token: hết hạn ngắn (thường 15 phút - vài giờ)
- Refresh Token: hết hạn dài (vài tháng - vài năm), chỉ dùng để lấy Access Token mới
```

### Flow hoạt động

```
1. Login:
   Client -> POST /login { email, password }
   Server -> Verify password
   Server -> Tạo Access Token (6 tháng) + Refresh Token (3 năm)
   Server -> Response { accessToken, refreshToken }
   Client -> Lưu cả hai

2. Gọi API bình thường:
   Client -> GET /api/users/profile
             Header: Authorization: Bearer <accessToken>
   Server -> Verify accessToken -> OK -> Trả data

3. Access Token hết hạn:
   Client -> GET /api/users/profile
             Header: Authorization: Bearer <accessToken>
   Server -> Verify accessToken -> EXPIRED -> Trả 401

4. Làm mới token:
   Client -> POST /refresh { refreshToken }
   Server -> Verify refreshToken -> OK
   Server -> Tạo Access Token mới
   Server -> Response { accessToken: newAccessToken }
   Client -> Lưu Access Token mới, tiếp tục gọi API
```

### Trong Logics

Logics dùng Access Token hết hạn 6 tháng (khá dài so với best practice 15 phút - 1 giờ). Đây là trade-off: app mobile không muốn user phải login lại thường xuyên.

---

## Lưu trữ Token ở Frontend

```
Cách lưu            | XSS attack | CSRF attack | Recommendation
---------------------|------------|-------------|---------------
localStorage         | Dễ bị     | Không       | Không nên
sessionStorage       | Dễ bị     | Không       | Tạm được
HttpOnly Cookie      | Không     | Dễ bị      | Tốt (thêm CSRF token)
Memory (biến JS)     | Không     | Không       | Tốt nhất (mất khi refresh)
```

**Best practice cho mobile app (React Native):**
- Lưu Refresh Token trong Secure Storage (Keychain/Keystore)
- Lưu Access Token trong memory

**Best practice cho web:**
- Access Token: memory (biến JavaScript)
- Refresh Token: HttpOnly, Secure, SameSite cookie

---

## OTP Tokens trong Logics

Logics dùng JWT cho cả OTP flow -- mỗi bước tạo một token khác nhau với `rule` riêng:

```
Flow đăng ký qua Google:

1. User login Google -> Server nhận Google profile
   -> Tạo REQUEST_OTP_TO_VERIFY_ACCOUNT_GOOGLE_TOKEN (rule=6)
   -> Hết hạn: 5 phút

2. Gửi OTP qua SMS -> User nhập OTP
   -> Verify OTP + verify token (rule=6)
   -> Tạo VERIFY_ACCOUNT_GOOGLE_WITH_OTP_TOKEN (rule=7)
   -> Hết hạn: 5 phút

3. User hoàn tất đăng ký
   -> Verify token (rule=7)
   -> Tạo ACCESS_RESOURCE token (rule=1) + REFRESH_TOKEN (rule=2)
   -> User đã đăng nhập

Mỗi bước = 1 token với rule riêng
-> Token bước 1 không dùng được ở bước 3
-> Hết hạn 5 phút -> Không thể dùng lại
```

---

## Password Hashing: utils/password.ts

### Tại sao hash password?

```
Lưu password dạng plain text:
  Database bị hack -> Attacker có tất cả password -> Thảm họa

Lưu password đã hash:
  Database bị hack -> Attacker có hash -> Không thể reverse thành password
```

### Logics dùng Argon2

```ts
import * as argon2 from 'argon2'

export default {
  hash: (password: string, key: string) => {
    return argon2.hash(`${password}-${key}-${passwordConfig.secretKeyPassword}`)
    //                  |            |      |
    //                  password     salt    pepper (server secret)
  },
  verify: (hash: string, password: string, key: string) => {
    return argon2.verify(hash, `${password}-${key}-${passwordConfig.secretKeyPassword}`)
  },
}
```

**Argon2** là thuật toán hash password hiện đại nhất (thắng Password Hashing Competition 2015). Tốt hơn bcrypt vì:
- Chống GPU attack tốt hơn (memory-hard)
- Có thể tune memory + CPU cost

**Ba thành phần:**
- `password`: password user nhập
- `key`: unique per user (thường là `userId` hoặc random salt)
- `secretKeyPassword`: server secret (pepper) -- nếu DB bị leak, attacker vẫn thiếu pepper

---

## Điểm chính cần nhớ

1. **JWT** = Header.Payload.Signature -- payload không mã hóa, chỉ ký.
2. **Access Token** (ngắn hạn, dùng cho API) + **Refresh Token** (dài hạn, dùng để lấy Access Token mới).
3. Logics dùng `rule` trong JWT payload để phân biệt mục đích token (access, refresh, OTP...).
4. **Không lưu thông tin nhạy cảm trong JWT payload** -- ai cũng decode được.
5. Password phải **hash** (Argon2/bcrypt), không bao giờ lưu plain text.
6. Logics hash password với 3 thành phần: password + user key + server pepper.
