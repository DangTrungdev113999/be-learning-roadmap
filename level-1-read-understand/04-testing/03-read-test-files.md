# Đọc hiểu file test

## Cấu trúc 1 file test

Dự án dùng **@japa/runner** -- test framework của AdonisJS. Nếu bạn đã biết Jest (FE), Japa tương tự nhưng nhẹ hơn.

### So sánh nhanh với Jest

| Jest (FE) | Japa (BE dự án này) |
|-----------|---------------------|
| `describe('name', () => {})` | `test.group('name', () => {})` |
| `it('should...', () => {})` | `test('should...', async ({ assert }) => {})` |
| `expect(value).toBe(true)` | `assert.isTrue(value)` |
| `beforeAll(() => {})` | `group.setup(() => {})` |
| `afterAll(() => {})` | `group.teardown(() => {})` |
| `beforeEach(() => {})` | `group.each.setup(() => {})` |

---

## Giải phẫu file test thật: isTradingTime.spec.ts

```typescript
// 1. Import test framework
import { test } from '@japa/runner'

// 2. Import function cần test (từ cùng thư mục libs/)
import { isTradingTime } from './isTradingTime'

// 3. Nhóm test -- gom các test case liên quan
test.group('isTradingTime', () => {

  // 4. Từng test case
  test('should return false on Saturday', async ({ assert }) => {
    // ARRANGE: Chuẩn bị dữ liệu
    const saturday = new Date('2024-12-14T10:00:00+07:00')

    // ACT: Gọi function
    const result = await isTradingTime({ date: saturday, exchange: 'HOSE' })

    // ASSERT: Kiểm tra kết quả
    assert.isFalse(result)
  })

})
```

### Phân tích từng phần

#### 1. Import

```typescript
import { test } from '@japa/runner'
import { isTradingTime } from './isTradingTime'
```

- Import `test` từ framework Japa
- Import function cần test từ **cùng thư mục libs/** (dùng relative path `./`)
- Không import từ entry point (index.ts) -- test file nằm cùng chỗ với function file

#### 2. test.group()

```typescript
test.group('isTradingTime', () => {
  // các test case ở đây
})
```

- Nhóm các test case lại, giống `describe()` trong Jest
- Tên group thường là tên function đang test
- Có thể có nhiều group trong 1 file (nhưng thường chỉ có 1)

#### 3. test()

```typescript
test('should return false on Saturday', async ({ assert }) => {
  // ...
})
```

- Mô tả test case bằng tiếng Anh, bắt đầu bằng "should..."
- Luôn là `async` vì nhiều function BE là async (gọi DB, Redis, API)
- `{ assert }` là destructure từ tham số -- do Japa inject vào

#### 4. Pattern AAA (Arrange - Act - Assert)

Mỗi test case theo pattern này:

```typescript
test('HOSE: should return true at continuous morning start (9:16)', async ({ assert }) => {
  // ARRANGE -- Chuẩn bị input
  const date = new Date('2024-12-16T09:16:00+07:00')

  // ACT -- Gọi function
  const result = await isTradingTime({ date, exchange: 'HOSE' })

  // ASSERT -- Kiểm tra kết quả
  assert.isTrue(result)
})
```

Ở FE, bạn cũng dùng pattern này với React Testing Library:
```javascript
// FE tương đương
const { getByText } = render(<Button>Click me</Button>)  // Arrange
fireEvent.click(getByText('Click me'))                     // Act
expect(screen.getByText('Clicked')).toBeInTheDocument()    // Assert
```

---

## Các test case thật từ dự án

### Test weekend (2 cases)

```typescript
test('should return false on Saturday', async ({ assert }) => {
  const saturday = new Date('2024-12-14T10:00:00+07:00')  // 14/12/2024 là thứ 7
  const result = await isTradingTime({ date: saturday, exchange: 'HOSE' })
  assert.isFalse(result)
})

test('should return false on Sunday', async ({ assert }) => {
  const sunday = new Date('2024-12-15T10:00:00+07:00')    // 15/12/2024 là chủ nhật
  const result = await isTradingTime({ date: sunday, exchange: 'HOSE' })
  assert.isFalse(result)
})
```

Nhận xét:
- Date được tạo với timezone `+07:00` (Việt Nam) -- tránh lỗi do timezone
- `2024-12-14` đúng là thứ 7 -- test dùng ngày cụ thể, không dùng "next Saturday"
- Assert đơn giản: `assert.isFalse(result)` -- kiểm tra kết quả là false

### Test giờ giao dịch HOSE (edge cases)

```typescript
test('HOSE: should return false during ATO session (9:10) when includeATOATC=false', async ({ assert }) => {
  const date = new Date('2024-12-16T09:10:00+07:00')
  const result = await isTradingTime({ date, exchange: 'HOSE' })
  assert.isFalse(result)
  // 9:10 nằm trong phiên ATO (9:00-9:16), mặc định không tính -> false
})

test('HOSE: should return true at continuous morning start (9:16)', async ({ assert }) => {
  const date = new Date('2024-12-16T09:16:00+07:00')
  const result = await isTradingTime({ date, exchange: 'HOSE' })
  assert.isTrue(result)
  // 9:16 là phút đầu tiên của phiên liên tục -> true
})

test('HOSE: should return false during lunch break (12:30)', async ({ assert }) => {
  const date = new Date('2024-12-16T12:30:00+07:00')
  const result = await isTradingTime({ date, exchange: 'HOSE' })
  assert.isFalse(result)
  // 12:30 là giờ nghỉ trưa (11:30-13:00) -> false
})
```

Nhận xét:
- Test tên mô tả rõ ràng: "HOSE: should return false during ATO session (9:10)"
  - Sàn nào? HOSE
  - Kết quả mong đợi? false
  - Khi nào? 9:10 (phiên ATO)
- Edge case: 9:15 vs 9:16 -- chênh 1 phút nhưng kết quả khác nhau hoàn toàn

### Test so sánh 2 kết quả

```typescript
test('HNX: includePLO should extend from continuous to 15:00', async ({ assert }) => {
  const date = new Date('2024-12-16T14:31:00+07:00')

  // Gọi 2 lần với options khác nhau
  const resultWithout = await isTradingTime({ date, exchange: 'HNX' })
  const resultWith = await isTradingTime({ date, exchange: 'HNX', includePLO: true })

  // So sánh 2 kết quả
  assert.isFalse(resultWithout)  // Không có PLO: 14:31 là ngoài giờ
  assert.isTrue(resultWith)       // Có PLO: 14:31 vẫn trong giờ (đến 15:00)
})
```

Pattern này hữu ích khi cần chứng minh 1 option thay đổi kết quả.

---

## group.setup và group.teardown

Dùng để chuẩn bị và dọn dẹp trước/sau khi chạy nhóm test:

```typescript
test.group('Function cần database', (group) => {

  // Chạy 1 lần TRƯỚC tất cả test trong group
  group.setup(async () => {
    // Chuẩn bị dữ liệu test trong DB
    await db.collection('counts').insertOne({ key: 'test_counter', value: 0 })
  })

  // Chạy 1 lần SAU tất cả test trong group
  group.teardown(async () => {
    // Dọn dẹp dữ liệu test
    await db.collection('counts').deleteMany({ key: 'test_counter' })
  })

  // Chạy TRƯỚC MỖI test case
  group.each.setup(async () => {
    // Reset trạng thái trước mỗi test
    await db.collection('counts').updateOne(
      { key: 'test_counter' },
      { $set: { value: 0 } }
    )
  })

  test('should increment counter', async ({ assert }) => {
    const result = await takeNumber('test_counter')
    assert.equal(result, 1)
  })

  test('should increment by custom amount', async ({ assert }) => {
    const result = await takeNumber('test_counter', 5)
    assert.equal(result, 5)
  })
})
```

So sánh với Jest:

| Japa | Jest | Khi nào chạy |
|------|------|-------------|
| `group.setup()` | `beforeAll()` | 1 lần trước tất cả test |
| `group.teardown()` | `afterAll()` | 1 lần sau tất cả test |
| `group.each.setup()` | `beforeEach()` | Trước MỖI test case |
| `group.each.teardown()` | `afterEach()` | Sau MỖI test case |

> Lưu ý: `isTradingTime.spec.ts` không cần setup/teardown vì function này chỉ tính toán, không đọc/ghi database (trừ trường hợp lookup code từ Redis, nhưng test đó gọi Redis thật).

---

## Các assert method thường dùng

### So sánh giá trị

```typescript
// Kiểm tra bằng (strict equal)
assert.equal(result, 42)
assert.equal(code, 'ABC')

// Kiểm tra không bằng
assert.notEqual(result, 0)

// Kiểm tra deep equal (cho object/array)
assert.deepEqual(result, { key: 'test', value: 1 })
assert.deepEqual(arr, [1, 2, 3])
```

### Kiểm tra boolean

```typescript
// Kiểm tra true/false
assert.isTrue(result)           // result === true
assert.isFalse(result)          // result === false

// Kiểm tra truthy/falsy (giống JS truthy/falsy)
assert.isOk(result)             // result is truthy
assert.isNotOk(result)          // result is falsy
```

### Kiểm tra tồn tại

```typescript
// Kiểm tra null/undefined
assert.isNull(result)
assert.isNotNull(result)
assert.isUndefined(result)
assert.isDefined(result)

// Kiểm tra exists (không null và không undefined)
assert.exists(result)
assert.notExists(result)
```

### Kiểm tra kiểu dữ liệu

```typescript
assert.isString(result)
assert.isNumber(result)
assert.isBoolean(result)
assert.isArray(result)
assert.isObject(result)
```

### Kiểm tra chuỗi

```typescript
assert.include('hello world', 'world')     // chứa chuỗi con
assert.match(result, /^[A-Z]+$/)           // match regex
```

### Kiểm tra số

```typescript
assert.isAbove(result, 0)        // result > 0
assert.isBelow(result, 100)      // result < 100
assert.isAtLeast(result, 1)      // result >= 1
assert.isAtMost(result, 10)      // result <= 10
```

### Kiểm tra array

```typescript
assert.lengthOf(arr, 5)                     // arr.length === 5
assert.includeMembers([1, 2, 3], [1, 2])    // arr chứa các phần tử
assert.isEmpty([])                           // arr rỗng
assert.isNotEmpty([1, 2])                    // arr không rỗng
```

### Kiểm tra error/exception

```typescript
// Kiểm tra function throw error
assert.throws(() => {
  numberToCode(-1)
}, 'Number must be positive')

// Kiểm tra async function throw error
await assert.rejects(async () => {
  await takeNumber('key', -1)
}, 'Increment must be greater than 0')
```

---

## Mẹo đọc test file hiệu quả

### 1. Đọc tên test case trước

Lướt qua tất cả tên test case để có bức tranh tổng thể:

```
should return false on Saturday
should return false on Sunday
HOSE: should return false during ATO session (9:10)
HOSE: should return true at continuous morning start (9:16)
HOSE: should return true during continuous morning session (10:30)
HOSE: should return false during lunch break (12:30)
...
```

Chỉ đọc tên, bạn đã biết function cover những gì.

### 2. Tìm test case tương tự khi cần viết mới

Cần viết test cho function mới? Tìm test file có logic tương tự:

```bash
# Tìm tất cả test file trong dự án
find app/Services -name "*.spec.ts" | head -20

# Tìm test file có dùng assert method cụ thể
grep -r "assert.isTrue" app/Services/dateService/libs/ --include="*.spec.ts"
```

### 3. Chú ý các test có so sánh 2 kết quả

Những test gọi function 2 lần với options khác nhau thường chứng minh behavior quan trọng:

```typescript
test('HNX: includePLO should extend from continuous to 15:00', async ({ assert }) => {
  const date = new Date('2024-12-16T14:31:00+07:00')
  const resultWithout = await isTradingTime({ date, exchange: 'HNX' })
  const resultWith = await isTradingTime({ date, exchange: 'HNX', includePLO: true })
  assert.isFalse(resultWithout)
  assert.isTrue(resultWith)
})
```

---

## Tổng kết

```
File test Japa = test.group + test() + assert

Pattern AAA:
  Arrange -- chuẩn bị dữ liệu
  Act     -- gọi function
  Assert  -- kiểm tra kết quả

Đọc test file:
  1. Lướt tên test case -> hiểu bức tranh tổng thể
  2. Đọc chi tiết test case -> hiểu logic function
  3. Tham khảo test case -> biết cách gọi function

isTradingTime.spec.ts là ví dụ tốt:
  - 54 test cases
  - Cover 4 sàn, nhiều khung giờ, edge cases
  - Tên test case mô tả rõ: "HOSE: should return false during ATO (9:10)"
```
