# TDD là gì? Tại sao Backend bắt buộc phải viết test?

## Bối cảnh cho FE dev

Ở Frontend, bạn có thể click vào nút, nhìn UI thay đổi và biết code chạy đúng. Ở Backend, **không có UI để nhìn**. Cách duy nhất để biết API trả đúng dữ liệu là viết test.

Trong dự án `logics`, mỗi function trong `app/Services/*/libs/` đều có file `.spec.ts` đi kèm. Đây không phải tùy chọn -- đây là **quy tắc bắt buộc**.

## TDD là gì?

**Test-Driven Development** (Phát triển hướng kiểm thử) là quy trình viết code theo 3 bước lặp lại:

```
RED → GREEN → REFACTOR
```

### Bước 1: RED -- Viết test trước, test sẽ FAIL

```typescript
// isWeekend.spec.ts
import { test } from '@japa/runner'
import { isWeekend } from './isWeekend'

test.group('isWeekend', () => {
  test('thứ 7 là weekend', async ({ assert }) => {
    const saturday = new Date('2026-03-14') // Thứ 7
    assert.isTrue(isWeekend(saturday))
  })
})
```

Lúc này chạy test sẽ **đỏ (FAIL)** vì function `isWeekend` chưa tồn tại.

### Bước 2: GREEN -- Viết code vừa đủ để test PASS

```typescript
// isWeekend.ts
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}
```

Chạy lại test -- **xanh (PASS)**.

### Bước 3: REFACTOR -- Cải thiện code, giữ test xanh

Nếu code đã sạch thì bỏ qua bước này. Nếu cần refactor, cứ sửa thoải mái -- test sẽ bảo vệ bạn khỏi breaking changes.

## Tại sao Backend bắt buộc test?

### 1. Không có UI để verify

```
FE: Click nút → nhìn UI → biết đúng/sai
BE: Gọi function → ??? → chỉ test mới biết đúng/sai
```

### 2. Dữ liệu là tiền

Trong `logics`, một bug ở `paymentService` có thể tính sai tiền thanh toán. Một bug ở `cacheService` có thể trả dữ liệu cũ cho hàng nghìn user. Test là lớp bảo vệ duy nhất.

### 3. Refactor không sợ

Khi bạn cần thay đổi logic trong `useCache()`, bạn có 20+ test cases đảm bảo mọi thứ vẫn hoạt động:

```typescript
// cacheService/libs/useCache.spec.ts -- 20 test cases thực tế
test('should cache and return data', ...)
test('should handle different cache keys separately', ...)
test('should handle cache stampede', ...)
test('should throw error if handle throws', ...)
test('should revalidate when cache is stale', ...)
```

### 4. Documentation sống

Test là tài liệu tốt nhất. Đọc test file, bạn hiểu ngay function làm gì mà không cần đọc docs.

## Red-Green-Refactor trong dự án thực tế

Quy trình viết một function mới trong `logics`:

```
1. Đọc docs.md của service
2. Tạo file test: functionName.spec.ts
3. Viết test cases (RED)
4. Tạo file function: functionName.ts
5. Implement cho test pass (GREEN)
6. Refactor nếu cần
7. Chạy type check: yarn tsc --noEmit
8. Cập nhật docs.md
```

## Lệnh chạy test trong logics

```bash
# Chạy test cho 1 function cụ thể
rm -f tests/run-failed-tests.json && node ace test unit \
  --files app/Services/cacheService/libs/useCache.spec.ts

# Chạy tất cả test trong 1 service
rm -f tests/run-failed-tests.json && find app/Services/cacheService/libs \
  -name "*.spec.ts" -exec node ace test unit --files {} \;

# Kiểm tra types
yarn tsc --noEmit
```

## So sánh nhanh: FE testing vs BE testing

| Khía cạnh | FE (React) | BE (AdonisJS) |
|-----------|-----------|---------------|
| Công cụ | Jest + React Testing Library | Japa (built-in) |
| Test gì | UI render, user interaction | Logic, data, side effects |
| Mức độ bắt buộc | Tùy team | **Bắt buộc mỗi function** |
| Mock gì | API calls, DOM | Database, Redis, external services |
| Chạy bằng | `npm test` | `node ace test unit --files ...` |

## Tổng kết

- TDD = viết test trước, code sau
- Chu kỳ: **RED** (test fail) → **GREEN** (code pass) → **REFACTOR** (cải thiện)
- Trong `logics`: mỗi function trong `libs/` phải có `.spec.ts` đi kèm
- Test là documentation sống, là lưới an toàn khi refactor
