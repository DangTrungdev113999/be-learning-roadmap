# util.check() — Validation không cần try/catch

## So sánh với FE

Ở FE bạn validate rồi hiển thị lỗi:

```ts
// React — validate rồi set error
if (!name) {
  setError('Vui lòng nhập tên')
  return
}

// hoặc throw
if (!valid) throw new Error('Invalid input')
```

Ở BE, `util.check()` làm điều tương tự — nhưng ngắn gọn hơn và **không cần try/catch**.

---

## Cú pháp

```ts
util.check(condition, 'Thông báo tiếng Việt code:error_code_english')
```

- `condition` — nếu **falsy** (false, null, undefined, 0, '') thì throw lỗi
- Message format: `'Thông báo người dùng đọc được code:mã_lỗi_cho_FE'`

---

## Code thật — RoomsController.createRoom

```ts
// Validate độ dài tên phòng
util.check(
  name.length >= 5 && name.length <= 200,
  'Tên phòng phải có từ 5 đến 200 ký tự.'
)

// Validate độ dài mô tả
util.check(
  description.length >= 5 && description.length <= 2000,
  'Mô tả phải có từ 5 đến 2000 ký tự'
)

// Kiểm tra kết quả từ service
const { data, error } = await social_service.RoomService.createRoom({ ... })
util.check(!error, error)
```

---

## Code thật — TutorialsController.createTutorials (validate trong vòng lặp)

Đây là ví dụ validate **từng item trong mảng** — pattern rất hay dùng khi nhận batch data:

```ts
public async createTutorials({ util, request: req }: HttpContextContract) {
  if (this.isProduction) {
    await util.auth.admin();
  }

  const body = req.body();

  // Validate mảng
  if (!Array.isArray(body)) {
    return res.status(400).json({ message: 'Payload must be an array' });
  }

  // Validate từng item — chỉ ra chính xác item nào bị lỗi
  for (const [index, item] of body.entries()) {
    if (!item.title?.vi && !item.title?.en) {
      util.check(false, `Item at index ${index} missing title.vi or title.en code:missing_title`)
    }

    if (!item.thumb?.vert || !item.thumb?.horz) {
      util.check(false, `Item at index ${index} missing thumb.vert or thumb.horz code:missing_thumb`)
    }

    if (!item.category) {
      util.check(false, `Item at index ${index} missing category code:missing_category`)
    }

    if (!Object.values(TutorialCategoryEnum).includes(item.category)) {
      const categories = Object.values(TutorialCategoryEnum).join(', ')
      util.check(false, `Item at index ${index} has invalid category(valid: ${categories}) code:invalid_category`)
    }
  }

  await tutorials.insertMany(body);
  return res.status(200).json({ message: 'success' });
}
```

### Điểm hay của pattern này:

1. `util.check(false, ...)` — luôn throw, dùng khi đã check bằng `if` trước đó
2. Message chứa `index` — FE biết chính xác item nào sai
3. `code:missing_title` — FE dùng để xử lý logic (hiển thị lỗi đúng field)

---

## Code thật — kiểm tra tồn tại

```ts
// RoomsController.paymentExpertSummary
const expert = await mongo.experts.findOne({ userId: maker._id }).lean()
util.check(expert, 'Không tìm thấy chuyên gia code:expert_not_found')

// RoomsController.paymentExpertTransactionDetail
util.check(data, 'Không tìm thấy giao dịch code:transaction_not_found')

// TutorialsController.updateTutorial
if (!res) {
  util.check(false, 'Tutorial not found code:not_found')
  return
}
```

---

## Format error message

```
'Thông báo tiếng Việt cho người dùng code:error_code_cho_frontend'
 ─────────────────────────────────────  ─────────────────────────
 Phần hiển thị cho user                 Phần FE dùng để xử lý logic
```

**Ví dụ thực tế:**
- `'Tên phòng phải có từ 5 đến 200 ký tự.'` — không có code (lỗi chung)
- `'Không tìm thấy chuyên gia code:expert_not_found'` — có code cho FE
- `'Item at index 3 missing category code:missing_category'` — có cả vị trí lẫn code

---

## Tại sao không dùng try/catch?

### Quy tắc: KHÔNG bao controller bằng try/catch

Framework (AdonisJS) đã có **global error handler**. Khi `util.check()` throw lỗi, framework tự:
1. Bắt exception
2. Trả response dạng `{ error: { message, code } }`
3. Set HTTP status code phù hợp

### Nếu dùng try/catch thì sao?

```ts
// SAI — nuốt lỗi, FE không biết có lỗi gì
public async createRoom({ util, maker }: HttpContextContract) {
  try {
    const name = util.gp('name')
    // ... logic
    return { data }
  } catch (err) {
    return { error: err.message }  // Tự xử lý lỗi = mất thông tin
  }
}
```

```ts
// ĐÚNG — để framework xử lý, response nhất quán
public async createRoom({ util, maker }: HttpContextContract) {
  const name = util.gp('name')  // Thiếu name? Tự throw, framework bắt
  util.check(name.length >= 5, 'Tên quá ngắn')  // Sai? Tự throw, framework bắt
  // ... logic
  return { data }
}
```

---

## Tóm tắt

| Tình huống | Cách dùng |
|---|---|
| Validate điều kiện | `util.check(age > 0, 'Tuổi phải lớn hơn 0 code:age_invalid')` |
| Kiểm tra tồn tại | `util.check(user, 'Không tìm thấy user code:not_found')` |
| Kiểm tra kết quả service | `util.check(!error, error)` |
| Luôn throw (sau if) | `util.check(false, 'Lỗi cụ thể code:error_code')` |
| Validate trong vòng lặp | `util.check(false, \`Item ${index} lỗi code:item_error\`)` |
