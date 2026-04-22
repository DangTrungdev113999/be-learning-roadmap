# Viết test đầu tiên -- isWeekend()

## Mục tiêu

Thực hành TDD từ đầu đến cuối: viết test trước, implement sau, chạy và verify.

## Bước 0: Hiểu yêu cầu

Viết function `isWeekend(date: Date): boolean` -- trả về `true` nếu ngày truyền vào là thứ 7 hoặc chủ nhật.

Tạo trong một service giả lập theo cấu trúc logics:

```
app/Services/dateService/
├── index.ts
└── libs/
    ├── isWeekend.ts
    └── isWeekend.spec.ts    ← Viết file này TRƯỚC
```

## Bước 1: RED -- Viết test trước

Tạo file `isWeekend.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { isWeekend } from './isWeekend'

test.group('isWeekend', () => {
  // Case 1: Thứ 7 là weekend
  test('should return true for Saturday', async ({ assert }) => {
    const saturday = new Date('2026-03-14') // Thứ 7
    assert.isTrue(isWeekend(saturday))
  })

  // Case 2: Chủ nhật là weekend
  test('should return true for Sunday', async ({ assert }) => {
    const sunday = new Date('2026-03-15') // Chủ nhật
    assert.isTrue(isWeekend(sunday))
  })

  // Case 3: Ngày thường không phải weekend
  test('should return false for Monday', async ({ assert }) => {
    const monday = new Date('2026-03-16') // Thứ 2
    assert.isFalse(isWeekend(monday))
  })

  // Case 4: Thứ 6 không phải weekend
  test('should return false for Friday', async ({ assert }) => {
    const friday = new Date('2026-03-13') // Thứ 6
    assert.isFalse(isWeekend(friday))
  })

  // Case 5: Test nhiều ngày trong tuần
  test('should return false for all weekdays', async ({ assert }) => {
    const weekdays = [
      new Date('2026-03-16'), // Thứ 2
      new Date('2026-03-17'), // Thứ 3
      new Date('2026-03-18'), // Thứ 4
      new Date('2026-03-19'), // Thứ 5
      new Date('2026-03-20'), // Thứ 6
    ]

    for (const day of weekdays) {
      assert.isFalse(isWeekend(day))
    }
  })

  // Case 6: Edge case -- Date không hợp lệ
  test('should handle invalid date', async ({ assert }) => {
    const invalid = new Date('invalid')
    assert.isFalse(isWeekend(invalid))
  })
})
```

Chạy test -- sẽ **FAIL** vì file `isWeekend.ts` chưa tồn tại:

```bash
rm -f tests/run-failed-tests.json && node ace test unit \
  --files app/Services/dateService/libs/isWeekend.spec.ts
```

```
ERROR: Cannot find module './isWeekend'
```

Đây là trạng thái **RED** -- hoàn toàn đúng kế hoạch.

## Bước 2: GREEN -- Implement vừa đủ

Tạo file `isWeekend.ts`:

```typescript
/**
 * Check if a given date falls on a weekend (Saturday or Sunday)
 * @param date - The date to check
 * @returns true if the date is Saturday (6) or Sunday (0)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()

  if (isNaN(day)) {
    return false
  }

  return day === 0 || day === 6
}
```

Chạy test lại:

```bash
rm -f tests/run-failed-tests.json && node ace test unit \
  --files app/Services/dateService/libs/isWeekend.spec.ts
```

```
  isWeekend
    ✓ should return true for Saturday
    ✓ should return true for Sunday
    ✓ should return false for Monday
    ✓ should return false for Friday
    ✓ should return false for all weekdays
    ✓ should handle invalid date

  6 passed
```

Trạng thái **GREEN** -- tất cả test pass.

## Bước 3: REFACTOR -- Cải thiện (nếu cần)

Code đã đơn giản và rõ ràng, không cần refactor. Nhưng nếu muốn, có thể viết gọn hơn:

```typescript
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return !isNaN(day) && (day === 0 || day === 6)
}
```

Chạy test lại -- vẫn **GREEN**. An toàn.

## Bước 4: Kiểm tra type

```bash
yarn tsc --noEmit
```

Không có lỗi type → xong.

## Phân tích: Tại sao viết test theo thứ tự này?

### 1. Happy path trước (Case 1, 2)

Bắt đầu với trường hợp đơn giản nhất -- input đúng, output đúng.

### 2. Negative cases (Case 3, 4)

Kiểm tra function trả `false` khi cần.

### 3. Bulk test (Case 5)

Đảm bảo tất cả ngày trong tuần đều trả `false`. Dùng vòng lặp để test nhiều giá trị.

### 4. Edge case (Case 6)

Input bất thường -- Date không hợp lệ. Function không được crash.

## Quy tắc đặt tên test

```typescript
// Pattern: should + [hành vi mong muốn] + [điều kiện]
test('should return true for Saturday', ...)
test('should return false for Monday', ...)
test('should handle invalid date', ...)
test('should throw error if maxAge is 0', ...)
test('should cache and return data', ...)
```

## Mở rộng: Thêm test case sau

Giả sử PM yêu cầu thêm: "function cũng nhận string date". Quy trình:

1. Viết test mới (RED):

```typescript
test('should accept string date', async ({ assert }) => {
  assert.isTrue(isWeekend('2026-03-14')) // Thứ 7
})
```

2. Test fail → sửa function (GREEN):

```typescript
export function isWeekend(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  const day = d.getDay()
  return !isNaN(day) && (day === 0 || day === 6)
}
```

3. Chạy tất cả test -- vẫn xanh → xong.

## Tổng kết

| Bước | Hành động | Trạng thái |
|------|-----------|-----------|
| 1 | Viết test (6 cases) | RED -- test fail |
| 2 | Viết code implement | GREEN -- test pass |
| 3 | Refactor code | GREEN -- vẫn pass |
| 4 | `yarn tsc --noEmit` | Không lỗi type |

Bạn vừa hoàn thành một vòng TDD hoàn chỉnh.
