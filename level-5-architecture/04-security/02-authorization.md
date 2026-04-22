# Authorization: Phân quyền người dùng

## Mục tiêu

Hiểu sự khác nhau giữa Authentication (xác thực) và Authorization (phân quyền), cách Logics triển khai RBAC với `util.auth`, và so sánh với phân quyền ở FE.

---

## Authentication vs Authorization

```
Authentication (Xác thực):  "Bạn LÀ AI?"
  -> Verify identity: đăng nhập bằng email/password, Google, Facebook
  -> Kết quả: biết userId

Authorization (Phân quyền):  "Bạn ĐƯỢC LÀM GÌ?"
  -> Check permissions: user này có quyền xem/sửa/xóa resource này không?
  -> Kết quả: cho phép hoặc từ chối

Ví dụ thực tế:
  Bạn vào tòa nhà:
  - Authentication = quẹt thẻ ở cổng (chứng minh bạn là nhân viên)
  - Authorization = thẻ chỉ mở được tầng 3-5 (quyền truy cập tầng nào)
```

---

## So sánh với Frontend

| Khái niệm | FE implementation | BE implementation |
|-----------|-------------------|-------------------|
| Check đăng nhập | `if (!token) redirect('/login')` | `await util.auth.login()` |
| Check role | `{user.role === 'admin' && <AdminPanel />}` | `await util.auth.admin()` |
| Protected route | `<ProtectedRoute role="expert">` | Middleware hoặc `util.auth.expert()` |
| Ẩn UI theo quyền | `{canEdit && <EditButton />}` | Controller chỉ xử lý nếu có quyền |

**Khác biệt quan trọng:**

```
FE authorization chỉ là UI/UX:
  - Ẩn nút "Xóa" với user thường
  - Nhưng user vẫn có thể gọi API trực tiếp (Postman, curl)
  -> FE authorization KHÔNG BẢO MẬT

BE authorization là enforcement thật sự:
  - Kiểm tra quyền trước khi thực thi
  - Nếu không có quyền -> trả 403 Forbidden
  -> BE authorization LÀ HÀNG RÀO THẬT
```

Quy tắc vàng: **FE authorization để UX tốt hơn, BE authorization để bảo mật.**

---

## RBAC trong Logics

Logics dùng Role-Based Access Control (RBAC) với 3 cấp độ:

```
┌─────────────────────────────────────────┐
│              Phân cấp quyền             │
│                                         │
│   admin   ──────>  expert  ──────>  login   ──────>  public
│   (Quản trị)       (Chuyên gia)      (Đã đăng nhập)   (Ai cũng được)
│                                         │
│   Mọi quyền       Quyền expert        Quyền cơ bản    Không cần auth
│   + quản lý       + tạo nội dung      + xem/tương tác
└─────────────────────────────────────────┘
```

### util.auth trong Controller

```ts
// routes/rooms.ts - Ví dụ thật từ Logics

// API chỉ expert mới được tạo room
Route.post('/rooms/create', 'RoomsController.create')

// Controller
class RoomsController {
  async create(util) {
    await util.auth.expert()  // Throw 401/403 nếu không phải expert
    // ... logic tạo room
  }
}
```

### Các method của util.auth

```ts
// 1. util.auth.login() -- Yêu cầu đăng nhập
// Verify JWT token trong header Authorization
// Throw nếu: không có token, token hết hạn, token không hợp lệ
await util.auth.login()
// Sau khi gọi, util.auth chứa { userId, identity, ... }

// 2. util.auth.expert() -- Yêu cầu là chuyên gia
// Gọi login() + kiểm tra user có role expert
// Throw nếu: chưa đăng nhập HOẶC không phải expert
await util.auth.expert()

// 3. util.auth.admin() -- Yêu cầu là admin
// Gọi login() + kiểm tra user có role admin
// Throw nếu: chưa đăng nhập HOẶC không phải admin
await util.auth.admin()

// 4. util.auth.admin(false) -- Check admin nhưng KHÔNG throw
// Trả về true/false thay vì throw error
// Dùng khi logic khác nhau giữa admin và user thường
const isAdmin = await util.auth.admin(false)
```

### Pattern thực tế trong Logics

```ts
// Pattern 1: Chỉ admin
class PaymentsController {
  async adminGetPayments(util) {
    await util.auth.admin()
    // Chỉ admin mới vào được đây
    const payments = await paymentService.getAll()
    return payments
  }
}

// Pattern 2: Chỉ expert
class RoomsController {
  async create(util) {
    await util.auth.expert()
    // Chỉ expert mới tạo được room
    const name = util.gp('name')
    // ...
  }
}

// Pattern 3: Login required
class NavigationsController {
  async getNavigation(util) {
    await util.auth.login()
    // Mọi user đã đăng nhập đều xem được
    const nav = await navigationService.get(util.auth.userId)
    return nav
  }
}

// Pattern 4: Logic khác nhau theo role
class RoomsController {
  async getList(util) {
    await util.auth.login()
    const isAdmin = await util.auth.admin(false)  // không throw

    if (isAdmin) {
      // Admin thấy tất cả rooms, kể cả bị ẩn
      return roomService.getAllRooms()
    } else {
      // User thường chỉ thấy rooms public
      return roomService.getPublicRooms()
    }
  }
}

// Pattern 5: Kiểm tra quyền sở hữu (ownership)
class RoomsController {
  async update(util) {
    await util.auth.login()
    const roomId = util.gp('roomId')
    const room = await roomService.getById(roomId)

    // Chỉ chủ room hoặc admin mới được sửa
    const isAdmin = await util.auth.admin(false)
    util.check(
      room.ownerId === util.auth.userId || isAdmin,
      'Bạn không có quyền sửa room này code:forbidden'
    )

    // ... update room
  }
}
```

---

## Ownership-based Authorization

RBAC chỉ kiểm tra role. Nhưng nhiều trường hợp cần kiểm tra **ownership** -- "đây có phải resource của bạn không?"

```
Ví dụ:
  User A tạo bài viết #123
  User B cũng là "login" role, nhưng không được sửa/xóa bài viết #123
  -> Cần check: post.authorId === currentUserId

Trong Logics, dùng util.check:
  util.check(
    post.authorId === util.auth.userId,
    'Bạn không phải tác giả bài viết code:not_author'
  )
```

### So sánh FE

```tsx
// FE: Ẩn nút Edit nếu không phải tác giả (chỉ UI)
{post.authorId === currentUser.id && <EditButton />}

// BE: Từ chối nếu không phải tác giả (enforcement thật)
util.check(
  post.authorId === util.auth.userId,
  'Không có quyền code:forbidden'
)
```

---

## Authorization Patterns phổ biến

### 1. RBAC (Role-Based) -- Logics đang dùng

```
Roles: admin, expert, user
Mỗi role có một tập quyền cố định

Ưu điểm: Đơn giản, dễ hiểu
Nhược điểm: Không linh hoạt (thêm quyền = thêm role mới?)
```

### 2. ABAC (Attribute-Based) -- Phức tạp hơn

```
Quyền dựa trên attributes (thuộc tính) của user, resource, context

Ví dụ:
  "User ở department 'finance' có thể xem report nếu report.type === 'financial'
   VÀ thời gian hiện tại trong giờ hành chính"

Ưu điểm: Rất linh hoạt
Nhược điểm: Phức tạp, khó debug
```

### 3. Permission-Based -- Trung gian

```ts
// Thay vì check role, check permission cụ thể
const permissions = {
  admin: ['read', 'write', 'delete', 'manage_users'],
  expert: ['read', 'write', 'create_room'],
  user: ['read'],
}

// Trong controller
util.check(
  userPermissions.includes('create_room'),
  'Không có quyền tạo room code:forbidden'
)
```

---

## Security Considerations

### 1. Luôn kiểm tra quyền ở TỪNG endpoint

```ts
// SAI: Quên kiểm tra auth
class UsersController {
  async deleteUser(util) {
    const userId = util.gp('userId')
    await userService.delete(userId)  // Ai cũng xóa được!
  }
}

// ĐÚNG: Kiểm tra admin
class UsersController {
  async deleteUser(util) {
    await util.auth.admin()  // Chỉ admin
    const userId = util.gp('userId')
    await userService.delete(userId)
  }
}
```

### 2. Không tin tưởng client gửi role

```ts
// SAI: Tin role từ client
async updateProfile(util) {
  const role = util.gp('role')  // Client gửi role = 'admin'???
  await userService.update({ role })
}

// ĐÚNG: Role chỉ thay đổi qua admin action
async updateProfile(util) {
  await util.auth.login()
  const name = util.gp('name')
  // Chỉ update fields user được phép sửa
  await userService.update(util.auth.userId, { name })
}
```

### 3. Kiểm tra ownership trước khi thao tác

```ts
// SAI: Chỉ check login, không check ownership
async deletePost(util) {
  await util.auth.login()
  const postId = util.gp('postId')
  await postService.delete(postId)  // User A xóa bài User B!
}

// ĐÚNG: Check ownership hoặc admin
async deletePost(util) {
  await util.auth.login()
  const postId = util.gp('postId')
  const post = await postService.getById(postId)
  const isAdmin = await util.auth.admin(false)

  util.check(
    post.authorId === util.auth.userId || isAdmin,
    'Không có quyền xóa bài viết code:forbidden'
  )

  await postService.delete(postId)
}
```

---

## Điểm chính cần nhớ

1. **Authentication** = "Bạn là ai?", **Authorization** = "Bạn được làm gì?".
2. FE authorization chỉ là UI/UX, **BE authorization mới là enforcement thật**.
3. Logics dùng RBAC với 3 level: `util.auth.login()`, `util.auth.expert()`, `util.auth.admin()`.
4. `util.auth.admin(false)` trả boolean thay vì throw -- dùng khi logic khác nhau theo role.
5. Luôn kiểm tra **ownership** ngoài role: resource có phải của user hiện tại không?
6. Không bao giờ tin role/permission do client gửi lên.
