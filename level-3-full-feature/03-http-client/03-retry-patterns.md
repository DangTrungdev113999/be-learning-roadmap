# Retry Patterns -- Simple retry, Exponential backoff, khi nào nên retry

## Tình huống

logics gọi AI Team Service, nhưng service kia đang deploy, mất 5 giây. Nếu không retry, user nhận lỗi. Nếu retry 1 lần sau 1 giây, service đã sẵn sàng, user không biết gì.

```
Không retry:
logics → AI Team (đang deploy) → Lỗi → User thấy lỗi

Có retry:
logics → AI Team (đang deploy) → Lỗi
      → đợi 1s
      → AI Team (đã sẵn sàng) → Thành công → User bình thường
```

## Khi nào nên retry?

### Nên retry

| Loại lỗi | Lý do |
|-----------|-------|
| Network error | Service tạm mất kết nối |
| Timeout | Service đang bận, có thể rảnh sau |
| 500 Internal Server Error | Service crash tạm thời |
| 502 Bad Gateway | Proxy/load balancer chưa sẵn sàng |
| 503 Service Unavailable | Service đang deploy/restart |
| 429 Too Many Requests | Bị rate limit, đợi rồi thử lại |

### Không nên retry

| Loại lỗi | Lý do |
|-----------|-------|
| 400 Bad Request | Data sai, retry cũng sai |
| 401 Unauthorized | Token sai, cần refresh token không phải retry |
| 403 Forbidden | Không có quyền, retry vô ích |
| 404 Not Found | URL sai, retry không giúp gì |
| 422 Validation Error | Data không hợp lệ |

## Pattern 1: Simple retry -- Thử lại n lần

Đơn giản nhất: thử lại ngay, không đợi.

```typescript
async function callWithRetry(fn: () => Promise<any>, maxRetries = 3) {
  let lastError: Error

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      console.log(`Attempt ${attempt} failed: ${error.message}`)
    }
  }

  throw lastError
}
```

### Vấn đề của simple retry

```
Attempt 1: Service bận → Lỗi
Attempt 2: Service vẫn bận (vừa lỗi xong mà) → Lỗi
Attempt 3: Service vẫn bận → Lỗi

→ 3 lần retry đều thất bại vì không cho service thời gian phục hồi
```

## Pattern 2: Retry với delay cố định

Thêm thời gian đợi giữa các lần retry.

```typescript
async function callWithDelay(fn: () => Promise<any>, maxRetries = 3, delayMs = 1000) {
  let lastError: Error

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError
}
```

```
Attempt 1: Lỗi → đợi 1s
Attempt 2: Lỗi → đợi 1s
Attempt 3: Thành công!
```

## Pattern 3: Exponential backoff -- Đợi lâu dần

Mỗi lần retry, đợi **gấp đôi** lần trước. Đây là pattern được dùng trong production.

### Ví dụ thực tế -- aiTeamService/libs/send.ts

```typescript
const log = Logger.child({ tags: ['aiTeamService.send'] })

export async function send(
  action: string,
  data: Record<string, any>,
  options?: SendCallOptions,
): Promise<SendResponse> {
  const { API_URL, JWT_SECRET, JWT_ISSUER, MAX_RETRIES, RETRY_DELAY_MS, TIMEOUT_MS } = AI_TEAM_CONFIG
  const maxRetries = Math.max(1, options?.maxRetries ?? MAX_RETRIES)

  if (!API_URL || !JWT_SECRET) {
    log.warn('AI Team API not configured')
    return { success: false, error: 'AI Team API not configured' }
  }

  const jwtPayload: JwtPayload = {
    iss: JWT_ISSUER,
    action,
    payload: data,
  }

  const token = jwt.sign(jwtPayload, JWT_SECRET)

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        API_URL,
        { token },
        {
          timeout: TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        },
      )

      log.info({ action, attempt }, 'AI Team request successful')
      return { success: true, data: response.data }
    } catch (error: any) {
      lastError = error
      log.warn({ action, attempt, error: error.message }, 'AI Team request failed')

      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1)  // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  log.error({ action, error: lastError?.message }, 'AI Team request failed after all retries')
  return { success: false, error: lastError?.message || 'Request failed' }
}
```

### Phân tích exponential backoff

```
RETRY_DELAY_MS = 1000 (1 giây)

Attempt 1: Gọi API → Lỗi
  delay = 1000 * 2^(1-1) = 1000 * 1 = 1 giây

Attempt 2: Gọi API → Lỗi
  delay = 1000 * 2^(2-1) = 1000 * 2 = 2 giây

Attempt 3: Gọi API → Lỗi hoặc thành công
  (không delay nữa, đây là lần cuối)

Tổng thời gian đợi tối đa: 1 + 2 = 3 giây
```

### Công thức

```
delay = RETRY_DELAY_MS * 2^(attempt - 1)

Attempt 1: delay = base * 1  = 1s
Attempt 2: delay = base * 2  = 2s
Attempt 3: delay = base * 4  = 4s
Attempt 4: delay = base * 8  = 8s
Attempt 5: delay = base * 16 = 16s
```

### Tại sao exponential tốt hơn delay cố định?

```
Service bị quá tải:

Delay cố định (1s):
  1s → 1s → 1s → 1s  (gõ cửa liên tục, service càng quá tải)

Exponential backoff:
  1s → 2s → 4s → 8s  (gõ cửa thưa dần, cho service thời gian phục hồi)
```

## Config retry -- Cấu hình qua constants

```typescript
// app/Services/aiTeamService/constants.ts
export const AI_TEAM_CONFIG = {
  API_URL: Env.get('AI_TEAM_API_URL', ''),
  JWT_SECRET: Env.get('AI_TEAM_JWT_SECRET', ''),
  JWT_ISSUER: 'finpath_be',
  MAX_RETRIES: 3,           // Tối đa 3 lần
  RETRY_DELAY_MS: 1000,     // Base delay 1 giây
  TIMEOUT_MS: 10000,        // Timeout 10 giây mỗi request
} as const
```

**Pattern quan trọng:**
- Retry config đặt trong `constants.ts`, không hardcode trong function
- `as const` giúp TypeScript hiểu đây là giá trị cố định
- `options?.maxRetries ?? MAX_RETRIES` cho phép caller override khi cần

```typescript
// Caller có thể override maxRetries
await send('question_created', { _id: '123' })                    // Dùng MAX_RETRIES = 3
await send('question_created', { _id: '123' }, { maxRetries: 1 }) // Chỉ thử 1 lần
```

## Logging trong retry

Mỗi attempt cần log để debug sau này:

```typescript
// Mỗi lần thất bại → log.warn (cảnh báo, chưa phải lỗi cuối)
log.warn({ action, attempt, error: error.message }, 'AI Team request failed')

// Thành công → log.info (kèm attempt number để biết retry mấy lần)
log.info({ action, attempt }, 'AI Team request successful')

// Thất bại hoàn toàn → log.error (lỗi nghiêm trọng)
log.error({ action, error: lastError?.message }, 'AI Team request failed after all retries')
```

**Tại sao cần `attempt` trong log?**

```
// Không có attempt: không biết retry bao nhiêu lần
[WARN] AI Team request failed  ← lần nào?

// Có attempt: biết ngay
[WARN] AI Team request failed { attempt: 1 }  ← lần 1, có thể retry
[WARN] AI Team request failed { attempt: 2 }  ← lần 2, đang retry
[INFO] AI Team request successful { attempt: 3 }  ← thành công ở lần 3
```

## Bảng so sánh retry patterns

| Pattern | Delay | Dùng khi | Ví dụ trong logics |
|---------|-------|----------|-------------------|
| No retry | 0 | Lỗi không thể phục hồi | Validation error (400) |
| Simple retry | 0 | Lỗi rất thoáng qua | -- |
| Fixed delay | Cố định | Service thường phục hồi nhanh | -- |
| Exponential backoff | Tăng dần | Service có thể quá tải | aiTeamService.send |

## Tổng kết

- Chỉ retry với lỗi có thể phục hồi: network, timeout, 5xx
- Không retry với lỗi logic: 400, 401, 403, 404
- Exponential backoff = delay tăng gấp đôi mỗi lần: `delay * 2^(attempt-1)`
- Config retry trong `constants.ts`: maxRetries, delayMs, timeoutMs
- Log mỗi attempt: warn khi lỗi, info khi thành công, error khi hết retry
- Cho phép caller override retry config qua options parameter
