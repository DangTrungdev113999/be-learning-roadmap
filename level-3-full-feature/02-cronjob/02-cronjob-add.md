# cronjobAdd() -- Utility đăng ký cronjob

## Mục tiêu

Đọc hiểu từng dòng code của `cronjobAdd()` -- utility chính để đăng ký cronjobs trong dự án logics.

---

## 1. Code đầy đủ

```typescript
// utils/cronjob.ts
import { CronJob } from 'cron'
import { TIMEZONE } from 'App/Services/dateService'
import { lockService } from 'App/Services/lockService'
import Logger from '@ioc:Adonis/Core/Logger'

const APP_NAME = 'logics'
const log = Logger.child({ tags: ['cronjob'] })
const has = new Map<string, boolean>()

export const cronjobAdd = (key: string, expression: string, handle: () => Promise<void>) => {
  if (has.has(key)) {
    return log.error({ key }, 'Cronjob key already exists')
  }

  has.set(key, true)

  const wrapper = async () => {
    try {
      const seconds = expression.split(' ').slice(-6, -5).pop() || ''

      if (!(await lockService.acquire([APP_NAME, 'cronjob', key], /[\*\,\-\/]/.test(seconds) ? 900 : 10000))) {
        return
      }

      await handle()
    } catch (error) {
      log.error({ error }, 'Cronjob error')
    }
  }

  new CronJob(expression, wrapper, null, true, TIMEZONE).start()
}
```

---

## 2. Phân tích từng phần

### Parameters

```typescript
cronjobAdd(key: string, expression: string, handle: () => Promise<void>)
```

| Param | Kiểu | Ý nghĩa | Ví dụ |
|---|---|---|---|
| `key` | string | Tên định danh duy nhất | `'dailyReleaseBuyVolume'` |
| `expression` | string | Cron expression 6 trường | `'4 30 11 * * *'` |
| `handle` | async function | Hàm thực thi | `async () => { ... }` |

### Chống đăng ký trùng key

```typescript
const has = new Map<string, boolean>()

if (has.has(key)) {
  return log.error({ key }, 'Cronjob key already exists')
}

has.set(key, true)
```

**Tại sao cần?** Nếu code bị import 2 lần (do bug), cùng 1 cronjob sẽ chạy 2 lần. Map `has` đảm bảo mỗi key chỉ đăng ký 1 lần.

So sánh FE:

```typescript
// FE: useEffect chạy 2 lần trong React Strict Mode → cleanup
useEffect(() => {
  const timer = setInterval(fn, 1000)
  return () => clearInterval(timer)   // Cleanup
}, [])

// BE: Map kiểm tra trùng lặp
if (has.has(key)) return   // Đã đăng ký rồi, bỏ qua
```

### Wrapper function

```typescript
const wrapper = async () => {
  try {
    // 1. Tính TTL cho lock
    const seconds = expression.split(' ').slice(-6, -5).pop() || ''

    // 2. Acquire distributed lock
    if (!(await lockService.acquire([APP_NAME, 'cronjob', key], /[\*\,\-\/]/.test(seconds) ? 900 : 10000))) {
      return
    }

    // 3. Chạy handler thật
    await handle()
  } catch (error) {
    log.error({ error }, 'Cronjob error')
  }
}
```

**Tại sao cần wrapper?** 3 lý do:

1. **Distributed lock** -- đảm bảo chỉ 1 instance chạy (chi tiết ở bài 03)
2. **try/catch** -- cronjob lỗi không được crash app
3. **TTL thông minh** -- tự tính thời gian lock dựa vào cron expression

### Tại sao try/catch ở wrapper mà không ở handle?

```typescript
// ❌ Nếu không có try/catch ở wrapper:
const wrapper = async () => {
  await lockService.acquire(...)    // Nếu Redis disconnect → throw
  await handle()                     // Nếu handler lỗi → throw
  // → Unhandled rejection → có thể crash app!
}

// ✅ try/catch bọc tất cả:
const wrapper = async () => {
  try {
    await lockService.acquire(...)
    await handle()
  } catch (error) {
    log.error({ error }, 'Cronjob error')   // Log lỗi, app tiếp tục chạy
  }
}
```

Cronjob chạy tự động, không có ai "bắt" error. Nếu throw mà không catch, process có thể crash.

### TTL thông minh

```typescript
const seconds = expression.split(' ').slice(-6, -5).pop() || ''

// Nếu giây là pattern (*/10, 0,30, 0-5) → TTL ngắn (900ms)
// Nếu giây là số cố định (0, 4, 46) → TTL dài (10000ms = 10 giây)
/[\*\,\-\/]/.test(seconds) ? 900 : 10000
```

**Giải thích logic:**

```
Expression: '*/10 * * * * *'  (mỗi 10 giây)
  → seconds = '*/10'
  → /[\*\,\-\/]/.test('*/10') = true (có ký tự *)
  → TTL = 900ms

Expression: '4 30 11 * * *'  (11:30:04 mỗi ngày)
  → seconds = '4'
  → /[\*\,\-\/]/.test('4') = false
  → TTL = 10000ms (10 giây)
```

**Tại sao?**
- Cronjob chạy mỗi 10 giây → lock phải hết trước lần chạy tiếp (900ms << 10 giây)
- Cronjob chạy 1 lần/ngày → lock 10 giây đủ để ngăn instance khác chạy trùng

### Tạo và start CronJob

```typescript
new CronJob(expression, wrapper, null, true, TIMEZONE).start()
```

| Param | Giá trị | Ý nghĩa |
|---|---|---|
| `expression` | `'4 30 11 * * *'` | Lịch chạy |
| `wrapper` | function | Hàm được gọi khi đến giờ |
| `null` | -- | onComplete callback (không dùng) |
| `true` | -- | Start ngay lập tức |
| `TIMEZONE` | `'Asia/Ho_Chi_Minh'` | Múi giờ Việt Nam |

**TIMEZONE quan trọng:** Nếu không set, cron dùng UTC. `11:30 UTC` ≠ `11:30 VN` (lệch 7 tiếng).

---

## 3. Cách sử dụng

```typescript
// start/cronjob.ts
import { portfolioService } from 'App/Services/portfolioService'
import { cronjobAdd } from 'Utils/cronjob'

const main = async () => {
  if (process.env.LOCAL === '1' || process.env.NODE_ENV === 'test') {
    return   // Không chạy cronjob khi dev local hoặc test
  }

  cronjobAdd('dailyReleaseBuyVolume', '4 30 11 * * *', async () => {
    await portfolioService.dailyReleaseBuyVolume()
  })

  cronjobAdd('remindExpertAnswerQuestion', '0 5 9,20 * * *', async () => {
    await qnaService.remindExpertAnswerQuestion()
  })
}

main().catch(console.error)
```

**Điểm đáng chú ý:**
- Skip cronjob khi `LOCAL=1` hoặc `NODE_ENV=test` -- tránh cronjob chạy khi dev/test
- Mỗi cronjob là 1 lần gọi `cronjobAdd()` với key duy nhất
- Handler luôn là async function

---

## 4. Luồng hoạt động

```
1. App khởi động
   └── start/cronjob.ts được load

2. cronjobAdd('dailyReleaseBuyVolume', '4 30 11 * * *', handle)
   ├── Kiểm tra key trùng → OK
   ├── Lưu key vào Map
   └── Tạo CronJob → đặt lịch

3. Đến 11:30:04 hàng ngày
   ├── CronJob trigger → gọi wrapper()
   ├── wrapper:
   │   ├── Tính TTL = 10000ms (giây cố định = '4')
   │   ├── lockService.acquire(['logics', 'cronjob', 'dailyReleaseBuyVolume'], 10000)
   │   │   ├── Instance 1: acquire thành công ✅
   │   │   ├── Instance 2: acquire thất bại → return (bỏ qua) ✅
   │   │   └── Instance 3: acquire thất bại → return (bỏ qua) ✅
   │   └── await handle() → portfolioService.dailyReleaseBuyVolume()
   └── Xong
```

---

## 5. So sánh với FE scheduling

| FE | BE (cronjobAdd) |
|---|---|
| `setInterval(fn, 60000)` | `new CronJob('0 * * * * *', fn)` |
| Đơn vị: milliseconds | Đơn vị: cron expression |
| Chạy trên browser | Chạy trên server |
| Mất khi đóng tab | Chạy 24/7 |
| 1 instance | Nhiều instances → cần lock |
| Không cần timezone | Cần timezone rõ ràng |

`setInterval` đơn giản hơn nhưng thiếu tính năng:
- Không chạy "lúc 11h30" mà chỉ "mỗi X ms"
- Không có timezone
- Không có distributed lock

---

## Tóm tắt

| Thành phần | Vai trò |
|---|---|
| `key` | Định danh duy nhất, chống đăng ký trùng |
| `expression` | Cron 6 trường (có giây), timezone VN |
| `handle` | Async function chứa logic thật |
| `wrapper` | Bọc handle với lock + try/catch |
| `has` Map | Chống đăng ký cùng key 2 lần |
| TTL thông minh | 900ms cho pattern giây, 10s cho giây cố định |
| Skip local/test | Không chạy cronjob khi dev/test |
