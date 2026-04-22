# 10 bài thực hành viết test (dễ → khó)

## Hướng dẫn chung

- Mỗi bài: viết file `.spec.ts` trước, rồi implement `.ts`
- Dùng cú pháp Japa: `import { test } from '@japa/runner'`
- Chạy test: `rm -f tests/run-failed-tests.json && node ace test unit --files <path>`

---

## Bài 1: clamp (Dễ)

Viết function `clamp(value: number, min: number, max: number): number` -- giới hạn giá trị trong khoảng [min, max].

```typescript
clamp(5, 1, 10)   // → 5 (trong khoảng)
clamp(-3, 0, 100)  // → 0 (dưới min)
clamp(150, 0, 100) // → 100 (trên max)
```

**Yêu cầu test:**
- Happy path: giá trị trong khoảng
- Dưới min → trả min
- Trên max → trả max
- Min bằng max

---

## Bài 2: truncateText (Dễ)

Viết function `truncateText(text: string, maxLength: number): string` -- cắt text và thêm "..." nếu quá dài.

```typescript
truncateText('Hello', 10)        // → 'Hello'
truncateText('Hello World', 5)   // → 'Hello...'
```

**Yêu cầu test:**
- Text ngắn hơn maxLength → giữ nguyên
- Text dài hơn → cắt + "..."
- Text rỗng
- maxLength = 0

---

## Bài 3: parseQueryParams (Dễ)

Viết function `parseQueryParams(query: Record<string, any>)` -- parse page, pageSize từ query params, trả default nếu thiếu.

```typescript
parseQueryParams({ page: '2', pageSize: '20' })  // → { page: 2, pageSize: 20 }
parseQueryParams({})                               // → { page: 1, pageSize: 10 }
parseQueryParams({ page: '-1' })                   // → { page: 1, pageSize: 10 }
```

**Yêu cầu test:**
- Có đủ params → parse đúng
- Thiếu params → dùng default
- Giá trị âm → dùng default
- Giá trị không phải số → dùng default

---

## Bài 4: validateRoomName (Trung bình)

Viết function `validateRoomName(name: string): { valid: boolean, error?: string }` -- validate tên phòng theo rules của logics.

Quy tắc (từ RoomsController thật):
- Tên phải từ 5 đến 200 ký tự
- Không chứa ký tự đặc biệt (chỉ cho phép chữ, số, khoảng trắng, dấu tiếng Việt)

**Yêu cầu test:**
- Tên hợp lệ
- Quá ngắn (< 5 ký tự)
- Quá dài (> 200 ký tự)
- Chứa ký tự đặc biệt
- Đúng 5 ký tự (boundary)
- Đúng 200 ký tự (boundary)

---

## Bài 5: formatCurrency (Trung bình)

Viết function `formatCurrency(amount: number, currency: 'VND' | 'USD'): string`.

```typescript
formatCurrency(1000000, 'VND')  // → '1,000,000 ₫'
formatCurrency(1234.56, 'USD')  // → '$1,234.56'
formatCurrency(0, 'VND')       // → '0 ₫'
```

**Yêu cầu test:**
- Format VND (không thập phân)
- Format USD (2 chữ số thập phân)
- Số 0
- Số âm
- Số rất lớn

---

## Bài 6: retry (Trung bình)

Viết function `retry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T>` -- gọi lại function nếu fail.

```typescript
let attempt = 0
const flaky = async () => {
  attempt++
  if (attempt < 3) throw new Error('Fail')
  return 'success'
}

await retry(flaky, 5)  // → 'success' (thành công lần thứ 3)
```

**Yêu cầu test:**
- Thành công lần đầu → gọi 1 lần
- Fail 2 lần, thành công lần 3 → gọi 3 lần (dùng callCount)
- Fail tất cả → throw error
- maxRetries = 0 → gọi 1 lần rồi throw nếu fail

---

## Bài 7: Cache đơn giản (Khó)

Viết function `simpleCache<T>(key: string, fn: () => Promise<T>, ttlSeconds: number): Promise<T>` -- cache kết quả trong memory.

**Yêu cầu test:**
- Gọi 2 lần cùng key → fn chỉ chạy 1 lần (dùng callCount pattern từ useCache.spec.ts)
- Khác key → fn chạy 2 lần
- Sau khi TTL hết → fn chạy lại (dùng setTimeout/await)
- fn throw error → không cache, lần sau gọi lại

---

## Bài 8: Rate Limiter (Khó)

Viết function `rateLimiter(maxRequests: number, windowSeconds: number)` trả về function `checkLimit(key: string): boolean`.

```typescript
const check = rateLimiter(3, 60) // 3 requests per 60 seconds
check('user1') // → true (1/3)
check('user1') // → true (2/3)
check('user1') // → true (3/3)
check('user1') // → false (exceeded)
check('user2') // → true (user2 riêng biệt)
```

**Yêu cầu test:**
- Trong limit → trả true
- Vượt limit → trả false
- Key khác nhau → độc lập
- Sau khi window reset → cho phép lại

---

## Bài 9: Batch processor (Khó)

Viết function `processBatch<T, R>(items: T[], batchSize: number, processor: (batch: T[]) => Promise<R[]>): Promise<R[]>`.

```typescript
const result = await processBatch(
  [1, 2, 3, 4, 5],
  2,
  async (batch) => batch.map((n) => n * 2),
)
// → [2, 4, 6, 8, 10]
```

**Yêu cầu test:**
- Xử lý đúng theo batch size
- Items ít hơn batch size
- Batch size = 1
- Processor throw error ở batch thứ 2
- Items rỗng → trả []
- Đếm số lần processor được gọi

---

## Bài 10: Stampede Protection (Rất khó)

Viết function `withStampedeProtection<T>(key: string, fn: () => Promise<T>): Promise<T>` -- đảm bảo chỉ 1 request chạy fn tại một thời điểm, các request khác chờ kết quả.

Tham khảo pattern từ `useCache.spec.ts`:

```typescript
// 3 request đồng thời nhưng fn chỉ chạy 1 lần
const promises = [
  withStampedeProtection('key', fn),
  withStampedeProtection('key', fn),
  withStampedeProtection('key', fn),
]
const results = await Promise.all(promises)
assert.equal(callCount, 1) // fn chỉ chạy 1 lần
```

**Yêu cầu test:**
- 3 request đồng thời → fn chạy 1 lần, tất cả nhận cùng kết quả
- Key khác nhau → fn chạy riêng biệt
- fn throw error → tất cả request nhận error
- Sau khi hoàn thành → request mới gọi fn lại (không cache)

---

## Gợi ý chung

- Bài 1-3: Chỉ cần `assert.equal`, `assert.deepEqual`, `assert.throws`
- Bài 4-6: Thêm `assert.isTrue`, `assert.properties`, `assert.include`
- Bài 7-8: Cần `group.each.setup` để reset state giữa các test
- Bài 9-10: Cần `callCount` pattern, `Promise.all`, `assert.rejects`
