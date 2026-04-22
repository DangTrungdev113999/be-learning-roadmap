# Structured Data -- Object as first param, tại sao không string concat

## Vấn đề: String concatenation

```typescript
// FE thường làm
console.log('Error in getOverview: ' + error.message + ', query: ' + JSON.stringify(query))

// Output: text dài, khó parse
// "Error in getOverview: MongoNetworkError, query: {"from":"2026-03-01","to":"2026-03-18"}"
```

Khi có 10.000 log lines, tìm kiếm bằng text rất khó:
- Tìm tất cả lỗi query từ tháng 3? → regex phức tạp
- Đếm số lỗi theo action? → không thể
- Lọc theo attempt number? → không có field riêng

## Giải pháp: Object as first parameter

```typescript
// Structured logging
log.error({ error, query }, 'getOverview error')

// Output: JSON có cấu trúc
// {
//   "level": "error",
//   "tags": ["analyticsService.getOverview"],
//   "error": { "message": "MongoNetworkError", "stack": "..." },
//   "query": { "from": "2026-03-01", "to": "2026-03-18" },
//   "msg": "getOverview error"
// }
```

Bây giờ tìm kiếm dễ dàng:
```bash
# Tìm lỗi có query tháng 3
jq 'select(.query.from | startswith("2026-03"))'

# Đếm lỗi theo tags
jq '.tags[0]' | sort | uniq -c
```

## So sánh 2 cách

### String concatenation

```typescript
// ❌ Khó parse, khó search
log.error('AI Team request failed, action=' + action + ', attempt=' + attempt + ', error=' + error.message)

// Output (1 chuỗi text):
// "AI Team request failed, action=question_created, attempt=2, error=timeout"
```

### Object as first param

```typescript
// ✅ Dễ parse, dễ search
log.warn({ action, attempt, error: error.message }, 'AI Team request failed')

// Output (JSON có fields riêng biệt):
// {
//   "action": "question_created",
//   "attempt": 2,
//   "error": "timeout",
//   "msg": "AI Team request failed"
// }
```

## Ví dụ thực tế trong logics

### Pattern 1: Error + Context data

```typescript
// analyticsService -- Truyền error và query context
log.error({ error, query }, 'getOverview error')
log.error({ error, query }, 'getActiveUsers error')
log.error({ error, query }, 'getEventCounts error')
log.error({ error, query }, 'getRetention error')
log.error({ error, query }, 'getTopContent error')
```

**Tại sao truyền `query`?**

Khi `getOverview` lỗi lúc 3 giờ sáng, bạn cần biết:
1. Lỗi gì? → `error` object
2. Query gì gây lỗi? → `query` object (from, to, groupBy...)

```json
{
  "error": { "message": "MongoNetworkError: connection 5 to mongo:27017 closed" },
  "query": { "from": "2026-03-01T00:00:00Z", "to": "2026-03-18T23:59:59Z" },
  "msg": "getOverview error"
}
```

Nhìn log biết ngay: MongoDB mất kết nối khi query data từ 1/3 đến 18/3.

### Pattern 2: Action + Attempt (retry tracking)

```typescript
// aiTeamService.send -- Truyền action và attempt number
log.info({ action, attempt }, 'AI Team request successful')
log.warn({ action, attempt, error: error.message }, 'AI Team request failed')
log.error({ action, error: lastError?.message }, 'AI Team request failed after all retries')
```

**Tại sao truyền `attempt`?**

```json
// Attempt 1 thất bại
{ "level": "warn", "action": "question_created", "attempt": 1, "error": "timeout" }

// Attempt 2 thất bại
{ "level": "warn", "action": "question_created", "attempt": 2, "error": "timeout" }

// Attempt 3 thành công
{ "level": "info", "action": "question_created", "attempt": 3 }
```

Nhìn log biết: API timeout 2 lần, thành công ở lần 3. Nếu tất cả đều fail:

```json
{ "level": "error", "action": "question_created", "error": "timeout",
  "msg": "AI Team request failed after all retries" }
```

### Pattern 3: Key identifier

```typescript
// cronjob -- Truyền key để biết cronjob nào
log.error({ key }, 'Cronjob key already exists')
log.error({ error }, 'Cronjob error')
```

## Quy tắc chọn data truyền vào object

### Luôn truyền

| Data | Lý do | Ví dụ |
|------|-------|-------|
| `error` | Nguyên nhân lỗi | `{ error }` hoặc `{ error: error.message }` |
| Query/input | Context gây lỗi | `{ query }`, `{ action }` |
| Identifier | Xác định record/entity | `{ key }`, `{ userId }`, `{ transactionId }` |

### Tuỳ trường hợp

| Data | Khi nào | Ví dụ |
|------|---------|-------|
| `attempt` | Có retry logic | `{ attempt }` |
| `duration` | Cần track performance | `{ duration: Date.now() - start }` |
| `count` | Batch operation | `{ count: records.length }` |

### Không truyền

| Data | Lý do |
|------|-------|
| Password/token | Bảo mật! |
| Toàn bộ response body | Quá lớn, tốn storage |
| Sensitive user data | GDPR/privacy |

## error object vs error.message

```typescript
// Truyền error object: có stack trace, debug sâu hơn
log.error({ error }, 'Something failed')
// Output: { error: { message: "timeout", stack: "Error: timeout\n at..." } }

// Truyền error.message: gọn hơn, đủ cho hầu hết trường hợp
log.warn({ error: error.message }, 'Request failed')
// Output: { error: "timeout" }
```

**Quy tắc trong logics:**
- `log.error` → truyền `{ error }` (cần stack trace để debug)
- `log.warn` → truyền `{ error: error.message }` (chỉ cần message)

### Ví dụ thực tế

```typescript
// aiTeamService: warn chỉ truyền message
log.warn({ action, attempt, error: error.message }, 'AI Team request failed')

// aiTeamService: error chỉ truyền message (vì lastError?.message đã extract)
log.error({ action, error: lastError?.message }, 'AI Team request failed after all retries')

// analyticsService: error truyền cả object (cần stack trace)
log.error({ error, query }, 'getOverview error')
```

## Template: Cách viết log cho function mới

```typescript
import Logger from '@ioc:Adonis/Core/Logger'

const log = Logger.child({ tags: ['myService.myFunction'] })

export async function myFunction(input: MyInput): Promise<MyResult> {
  try {
    // Bắt đầu operation (optional, chỉ khi cần track)
    // log.info({ input }, 'Starting myFunction')

    const result = await doSomething(input)

    // Thành công
    log.info({ resultCount: result.length }, 'myFunction completed')

    return result
  } catch (error) {
    // Thất bại -- truyền error + input context
    log.error({ error, input }, 'myFunction error')
    return defaultValue
  }
}
```

## Tổng kết

- Luôn dùng object as first param: `log.info({ data }, 'message')`
- Không dùng string concatenation: `log.info('message ' + data)`
- Truyền `error` + context (query, action, key) vào data object
- `log.error` → `{ error }` (cả object), `log.warn` → `{ error: error.message }` (chỉ message)
- Không log sensitive data (password, token, personal info)
- Mỗi field trong object = 1 trường có thể search/filter trong log system
