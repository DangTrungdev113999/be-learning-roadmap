# Logger API -- Logger.child, naming convention, info/warn/error

## Logger.child({ tags }) -- Tạo child logger

Mỗi file tạo 1 child logger với tags xác định nguồn gốc. Tất cả log từ child logger đều kèm tags.

### Cú pháp

```typescript
import Logger from '@ioc:Adonis/Core/Logger'

const log = Logger.child({ tags: ['serviceName.functionName'] })
```

### Ví dụ trong logics

```typescript
// app/Services/analyticsService/libs/getOverview.ts
const log = Logger.child({ tags: ['analyticsService.getOverview'] })

// app/Services/analyticsService/libs/getActiveUsers.ts
const log = Logger.child({ tags: ['analyticsService.getActiveUsers'] })

// app/Services/analyticsService/libs/getEventCounts.ts
const log = Logger.child({ tags: ['analyticsService.getEventCounts'] })

// app/Services/analyticsService/libs/getRetention.ts
const log = Logger.child({ tags: ['analyticsService.getRetention'] })

// app/Services/analyticsService/libs/getTopContent.ts
const log = Logger.child({ tags: ['analyticsService.getTopContent'] })

// app/Services/aiTeamService/libs/send.ts
const log = Logger.child({ tags: ['aiTeamService.send'] })

// utils/cronjob.ts
const log = Logger.child({ tags: ['cronjob'] })
```

## Naming convention cho tags

### Pattern: `serviceName.functionName`

```typescript
// Format
Logger.child({ tags: ['<serviceName>.<functionName>'] })

// Ví dụ
Logger.child({ tags: ['analyticsService.getOverview'] })
//                     ↑ service        ↑ function
```

### Tại sao format này?

```json
// Khi đọc log, biết ngay log từ đâu:
{ "tags": ["analyticsService.getOverview"], "msg": "getOverview error" }
//          ↑ Service: analyticsService
//                      ↑ Function: getOverview

{ "tags": ["aiTeamService.send"], "msg": "AI Team request failed" }
//          ↑ Service: aiTeamService
//                      ↑ Function: send
```

### Quy tắc đặt tags

| Loại file | Tags format | Ví dụ |
|-----------|-------------|-------|
| Service function | `serviceName.functionName` | `analyticsService.getOverview` |
| Utility | `utilityName` | `cronjob` |
| External service | `serviceName` hoặc `SERVICE_NAME` | `FB_LOGIN` |

### Trường hợp đặc biệt -- Facebook service

```typescript
// services/facebook/index.ts
const log = Logger.child({ tags: ['FB_LOGIN'] })
```

Facebook service dùng UPPER_CASE vì đây là service bên ngoài, muốn dễ phân biệt trong log.

## log.info -- Thông tin bình thường

Dùng khi operation thành công, cần ghi lại để tra cứu sau.

```typescript
// Cú pháp
log.info(dataObject, messageString)
//       ↑ object     ↑ string mô tả ngắn
```

### Ví dụ trong logics

```typescript
// aiTeamService.send: gọi API thành công
log.info({ action, attempt }, 'AI Team request successful')
// Output: { level: "info", tags: ["aiTeamService.send"],
//           action: "question_created", attempt: 1,
//           msg: "AI Team request successful" }
```

### Khi nào dùng info?

```
Dùng info:
- API call thành công
- Cronjob hoàn thành
- Dữ liệu đã sync xong
- User đăng nhập (audit trail)

Không dùng info cho:
- Mỗi request (quá nhiều)
- Debug data (dùng trong development rồi xoá)
- Sensitive data (password, token)
```

## log.warn -- Cảnh báo, bất thường nhưng xử lý được

Dùng khi có gì đó bất thường, nhưng hệ thống vẫn tiếp tục được.

### Ví dụ trong logics

```typescript
// aiTeamService.send: 1 attempt thất bại, đang retry
log.warn({ action, attempt, error: error.message }, 'AI Team request failed')
// Ý nghĩa: "Lỗi rồi, nhưng còn retry, chưa phải lỗi cuối cùng"

// aiTeamService.send: config chưa setup
log.warn('AI Team API not configured')
// Ý nghĩa: "Không gọi được AI Team, nhưng app vẫn chạy được"
```

### Khi nào dùng warn?

```
Dùng warn:
- Retry (đang thử lại, chưa fail hẳn)
- Config thiếu nhưng không critical
- Response chậm (> threshold)
- Data bất thường nhưng xử lý được

Không dùng warn cho:
- Lỗi nghiêm trọng (dùng error)
- Thông tin bình thường (dùng info)
```

## log.error -- Lỗi cần hành động

Dùng khi có lỗi cần ai đó nhìn vào và xử lý.

### Ví dụ trong logics

```typescript
// aiTeamService.send: hết tất cả retry
log.error({ action, error: lastError?.message }, 'AI Team request failed after all retries')

// analyticsService: query thất bại
log.error({ error, query }, 'getOverview error')

// analyticsService (nhiều functions cùng pattern)
log.error({ error, query }, 'getActiveUsers error')
log.error({ error, query }, 'getEventCounts error')
log.error({ error, query }, 'getRetention error')
log.error({ error, query }, 'getTopContent error')

// cronjob: cronjob chạy lỗi
log.error({ error }, 'Cronjob error')

// cronjob: key bị trùng
log.error({ key }, 'Cronjob key already exists')
```

### Pattern trong analyticsService

Tất cả functions trong analyticsService dùng cùng pattern:

```typescript
const log = Logger.child({ tags: ['analyticsService.<functionName>'] })

export async function functionName(query: Query): Promise<Result> {
  try {
    // ... logic ...
    return result
  } catch (error) {
    log.error({ error, query }, '<functionName> error')
    return emptyResult
  }
}
```

**5 functions, cùng 1 pattern:**
- `getOverview` → `log.error({ error, query }, 'getOverview error')`
- `getActiveUsers` → `log.error({ error, query }, 'getActiveUsers error')`
- `getEventCounts` → `log.error({ error, query }, 'getEventCounts error')`
- `getRetention` → `log.error({ error, query }, 'getRetention error')`
- `getTopContent` → `log.error({ error, query }, 'getTopContent error')`

## API cheatsheet

```typescript
import Logger from '@ioc:Adonis/Core/Logger'
const log = Logger.child({ tags: ['serviceName.functionName'] })

// Info: hoạt động bình thường
log.info({ key: value }, 'Message mô tả')

// Warn: bất thường, xử lý được
log.warn({ key: value, error: error.message }, 'Warning message')

// Error: lỗi cần hành động
log.error({ error, contextData }, 'Error message')

// Warn không có data object
log.warn('Simple warning message')
```

### Quy tắc quan trọng

```typescript
// Parameter thứ 1: Object (data)
// Parameter thứ 2: String (message)
log.info({ action, attempt }, 'AI Team request successful')
//        ↑ data object        ↑ message string

// KHÔNG LÀM: message trước, data sau
// ❌ log.info('AI Team request successful', { action, attempt })
```

**Đây là API của Pino (logger engine bên dưới AdonisJS).** Pino dùng thứ tự `(object, string)`, ngược với `console.log(string, object)`.

## Tổng kết

- `Logger.child({ tags: [...] })` -- mỗi file 1 child logger
- Tags format: `serviceName.functionName` -- để biết log từ đâu
- `log.info(data, 'message')` -- thành công, cần ghi lại
- `log.warn(data, 'message')` -- bất thường, nhưng xử lý được
- `log.error(data, 'message')` -- lỗi, cần ai đó xử lý
- Thứ tự: `(object, string)` -- data trước, message sau (Pino convention)
- Trong logics, analyticsService có 5 functions dùng cùng pattern error logging
