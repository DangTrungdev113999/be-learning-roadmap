# Tại sao cần Structured Logging? console.log vs Logger

## Tình huống

logics chạy 6 services cùng lúc: analyticsService, aiTeamService, planService, portfolioService, qnaService, userService. Mỗi service xử lý hàng trăm request/giây. Khi có bug, bạn mở terminal và thấy:

```
user created
error
something happened
data saved
request failed
timeout
```

**Không biết log nào từ service nào, request nào, user nào.** Kiểu log này vô dụng trong production.

## console.log -- Vấn đề gì?

### FE quen thuộc

```typescript
// FE: console.log để debug, mở DevTools xem
console.log('user data:', userData)
console.log('error:', error)
// Chỉ 1 user, 1 tab, dễ tìm
```

### BE -- Tại sao console.log không đủ?

```typescript
// BE: 1000 users cùng lúc, log trộn lẫn nhau
console.log('Request received')      // User nào?
console.log('Error:', error.message)  // Service nào? Function nào?
console.log('Data saved')             // Record nào?
```

**5 vấn đề của console.log ở BE:**

| Vấn đề | console.log | Structured Logger |
|--------|------------|-------------------|
| Ai gọi? | Không biết | `tags: ['analyticsService.getOverview']` |
| Mức độ nghiêm trọng? | Không phân biệt | `info`, `warn`, `error` |
| Tìm kiếm? | Grep text → không chính xác | Lọc theo field: `tags`, `action`, `userId` |
| Format? | Text tuỳ ý | JSON chuẩn, tool đọc được |
| Production? | Phải xoá trước deploy | Giữ nguyên, có log level control |

## Structured Logging là gì?

Log ở dạng **JSON có cấu trúc**, thay vì text tự do.

### console.log (unstructured)

```
[2026-03-18 10:00:00] AI Team request failed, attempt 2, error: timeout
```

### Structured log (JSON)

```json
{
  "level": "warn",
  "tags": ["aiTeamService.send"],
  "action": "question_created",
  "attempt": 2,
  "error": "timeout",
  "msg": "AI Team request failed",
  "time": "2026-03-18T10:00:00.000Z"
}
```

### Tại sao JSON tốt hơn?

```bash
# Tìm tất cả lỗi từ aiTeamService
cat logs.json | jq 'select(.tags[] == "aiTeamService.send" and .level == "error")'

# Tìm request thất bại ở attempt 3
cat logs.json | jq 'select(.attempt == 3 and .level == "warn")'

# Đếm lỗi theo service
cat logs.json | jq '.tags[0]' | sort | uniq -c | sort -rn
```

Với text log, bạn phải regex phức tạp. Với JSON, lọc theo field chính xác.

## Logger trong logics -- @ioc:Adonis/Core/Logger

### Cách import và sử dụng

```typescript
import Logger from '@ioc:Adonis/Core/Logger'

// Tạo child logger với tags
const log = Logger.child({ tags: ['analyticsService.getOverview'] })

// Sử dụng
log.info({ data }, 'Message')      // Thông tin bình thường
log.warn({ data }, 'Message')      // Cảnh báo
log.error({ data, error }, 'Message')  // Lỗi
```

### Ví dụ thực tế -- analyticsService/libs/getOverview.ts

```typescript
import Logger from '@ioc:Adonis/Core/Logger'

const log = Logger.child({ tags: ['analyticsService.getOverview'] })

export async function getOverview(query: OverviewQuery): Promise<OverviewResult> {
  try {
    // ... query logic ...
    return result
  } catch (error) {
    log.error({ error, query }, 'getOverview error')
    //         ↑ object        ↑ message string
    return empty
  }
}
```

Output:
```json
{
  "level": "error",
  "tags": ["analyticsService.getOverview"],
  "error": { "message": "MongoNetworkError...", "stack": "..." },
  "query": { "from": "2026-03-01", "to": "2026-03-18" },
  "msg": "getOverview error"
}
```

### Ví dụ thực tế -- aiTeamService/libs/send.ts

```typescript
const log = Logger.child({ tags: ['aiTeamService.send'] })

// Thành công
log.info({ action, attempt }, 'AI Team request successful')
// Output: { level: "info", tags: ["aiTeamService.send"], action: "question_created", attempt: 1, msg: "AI Team request successful" }

// Cảnh báo (retry)
log.warn({ action, attempt, error: error.message }, 'AI Team request failed')
// Output: { level: "warn", tags: ["aiTeamService.send"], action: "question_created", attempt: 2, error: "timeout", msg: "AI Team request failed" }

// Lỗi nghiêm trọng
log.error({ action, error: lastError?.message }, 'AI Team request failed after all retries')
// Output: { level: "error", tags: ["aiTeamService.send"], action: "question_created", error: "timeout", msg: "AI Team request failed after all retries" }
```

## Log levels -- Khi nào dùng gì?

| Level | Khi nào | Ví dụ trong logics |
|-------|---------|-------------------|
| `info` | Hoạt động bình thường cần ghi lại | `'AI Team request successful'` |
| `warn` | Bất thường nhưng xử lý được | `'AI Team request failed'` (đang retry) |
| `error` | Lỗi cần hành động | `'getOverview error'`, `'request failed after all retries'` |

### Quy tắc

```
info  → "Mọi thứ ổn, ghi lại để có thể tra cứu sau"
warn  → "Có gì đó không ổn, nhưng hệ thống vẫn chạy được"
error → "Có lỗi, cần ai đó nhìn vào"
```

## So sánh với console trên FE

| FE (DevTools) | BE (Logger) |
|---------------|-------------|
| `console.log(data)` | `log.info({ data }, 'message')` |
| `console.warn('Slow response')` | `log.warn({ responseTime }, 'Slow response')` |
| `console.error(error)` | `log.error({ error }, 'Failed')` |
| Tắt tab → mất log | Log lưu file/service → persist |
| 1 user debug | 1000 users cùng lúc, cần filter |
| Hiển thị đẹp trong DevTools | JSON → tool xử lý (Kibana, CloudWatch) |

## Tổng kết

- `console.log` dùng cho FE debug, không đủ cho BE production
- Structured logging = log dạng JSON, có tags, level, data rõ ràng
- logics dùng `Logger.child({ tags: [...] })` từ AdonisJS
- 3 levels: `info` (bình thường), `warn` (bất thường), `error` (cần hành động)
- Log có cấu trúc giúp filter/search khi debug trên production
- Mỗi function tạo child logger riêng với tags xác định nguồn gốc
