# util.gp() — Lấy và validate input từ request

## So sánh với FE

Ở FE bạn lấy dữ liệu từ URL hoặc form:

```ts
// Next.js
const { query } = useRouter()
const page = Number(query.page) || 1

// React Hook Form
const { name } = getValues()
```

Ở BE, `util.gp()` (**g**et **p**aram) làm tất cả trong một lệnh — lấy giá trị từ query string hoặc body, set default, và validate kiểu dữ liệu.

---

## Cú pháp

```ts
util.gp(key)                          // Bắt buộc — throw lỗi nếu thiếu
util.gp(key, defaultValue)            // Tùy chọn — trả default nếu thiếu
util.gp(key, defaultValue, validator) // Tùy chọn + validate kiểu/giá trị
```

---

## Bảng tổng hợp tất cả cách dùng

| Cách dùng | Ý nghĩa | Ví dụ thật |
|---|---|---|
| `util.gp('name')` | **Bắt buộc** — throw nếu thiếu | `const name = util.gp('name')` |
| `util.gp('avatar', null)` | **Tùy chọn** — null nếu thiếu | `const shortDescription = util.gp('shortDescription', null)` |
| `util.gp('page', 1, 'number')` | **Number** — ép kiểu số | `const page = util.gp('page', 1, 'number')` |
| `util.gp('search', '', 'string')` | **String** — ép kiểu chuỗi | `const search = util.gp('search', '')` |
| `util.gp('isPrivate', null, 'boolean')` | **Boolean** — ép kiểu boolean | `const isPrivate = util.gp('isPrivate', null, 'boolean')` |
| `util.gp('roles', null, 'comma')` | **Comma-separated** — tách chuỗi thành mảng | `const roles = util.gp('roles', null, 'comma')` |
| `util.gp('from', null, 'date')` | **Date** — parse thành Date object | `const createdFrom = util.gp('createdFrom', null, 'date')` |
| `util.gp('_id', null, 'objectid')` | **ObjectId** — validate MongoDB ObjectId | `const _id = util.gp('_id', null, 'objectid')` |
| `util.gp('status', null, ['a', 'b'])` | **Enum** — chỉ chấp nhận giá trị trong danh sách | `const order = util.gp('order', '-1', ['-1', '1'])` |
| `util.gp('key', null, /^[a-z]+$/)` | **Regex** — validate theo pattern | |
| `util.gp('key', null, (v) => v > 0)` | **Custom function** — validate tùy chỉnh | |

---

## Code thật từ dự án

### createRoom — Nhiều kiểu input khác nhau

```ts
// RoomsController.createRoom
const name = util.gp('name')                                    // Bắt buộc
const description = util.gp('description')                      // Bắt buộc
const avatar = util.gp('avatar')                                // Bắt buộc
const isPrivate = util.gp('isPrivate', null, 'boolean')         // Tùy chọn, boolean
const shortDescription = util.gp('shortDescription', null)      // Tùy chọn
const isShowChatChannel = util.gp('isShowChatChannel', true, 'boolean')  // Default true, boolean
```

### listMyRooms — Phân trang + comma filter

```ts
// RoomsController.listMyRooms
const page = util.gp('page', 1, 'number')          // Default 1, ép kiểu số
const pageSize = util.gp('pageSize', 10, 'number')  // Default 10, ép kiểu số
const roles = util.gp('roles', null, 'comma')       // "admin,member" → ['admin', 'member']
```

### listRoomMembers — Date filter

```ts
// RoomsController.listRoomMembers
const planExpireFrom = util.gp('planExpireFrom', null, 'date')    // Parse thành Date
const planExpireTo = util.gp('planExpireTo', null, 'date')
const lastUpgradeFrom = util.gp('lastUpgradeFrom', null, 'date')
const lastUpgradeTo = util.gp('lastUpgradeTo', null, 'date')
```

### paymentExpertTransactions — Enum validation

```ts
// RoomsController.paymentExpertTransactions
const status = util.gp('status', null, [
  PaymentRequestStatus.COMPLETED,
  PaymentRequestStatus.PENDING,
  PaymentRequestStatus.FAILED,
])
// Chỉ chấp nhận 3 giá trị trên, gửi giá trị khác sẽ bị lỗi

const order = util.gp('order', '-1', ['-1', '1'])
// Chỉ chấp nhận '-1' hoặc '1'

const orderBy = util.gp('orderBy', 'totalCommission', ['totalCommission', '_id'])
// Chỉ chấp nhận 'totalCommission' hoặc '_id'
```

### updateTutorial — ObjectId validation

```ts
// TutorialsController.updateTutorial
const _id = util.gp('_id', null, 'objectid')
// Validate đây là MongoDB ObjectId hợp lệ (24 ký tự hex)
```

---

## Tại sao util.gp() tốt hơn cách thủ công?

### Cách thủ công (dài dòng, dễ quên validate):

```ts
// Phải tự xử lý từng bước
const page = req.query.page ? Number(req.query.page) : 1
if (isNaN(page)) throw new Error('page must be a number')

const isPrivate = req.body.isPrivate
if (isPrivate !== undefined && typeof isPrivate !== 'boolean') {
  throw new Error('isPrivate must be boolean')
}
```

### Với util.gp() (ngắn gọn, nhất quán):

```ts
const page = util.gp('page', 1, 'number')           // 1 dòng làm hết
const isPrivate = util.gp('isPrivate', null, 'boolean') // 1 dòng làm hết
```

---

## Lưu ý quan trọng

1. `util.gp()` lấy từ **cả query string và body** — không cần phân biệt GET hay POST
2. Tham số bắt buộc (`util.gp('name')`) sẽ **tự động throw lỗi** nếu client không gửi
3. Dùng `'comma'` khi client gửi dạng `?roles=admin,member` — tự tách thành mảng
4. Dùng `'date'` để tự parse chuỗi ngày thành Date object
5. Dùng mảng `[...]` khi chỉ muốn chấp nhận một số giá trị cố định (enum)
