# Implement checkStockAPI -- Gọi API, validate response

## Yêu cầu

Gọi stock API endpoint, kiểm tra:
1. API có trả response không? (network error)
2. Status code có phải 200 không?
3. Response time có chấp nhận được không? (< 5 giây)
4. Response có chứa data không? (không rỗng)

## Bước 1: Viết test trước (TDD)

```typescript
// app/Services/monitoringService/libs/checkStockAPI.spec.ts
import { test } from '@japa/runner'
import axios from 'axios'
import { checkStockAPI } from './checkStockAPI'
import { STOCK_API_CONFIG } from '../constants'

test.group('checkStockAPI', (group) => {
  let originalGet: typeof axios.get

  group.setup(() => {
    originalGet = axios.get
  })

  group.teardown(() => {
    axios.get = originalGet
  })

  test('trả healthy=true khi API response 200 với data', async ({ assert }) => {
    // Mock axios.get trả về thành công
    axios.get = async () => ({
      status: 200,
      data: { VNM: { price: 80000, volume: 1500000 } },
    }) as any

    const result = await checkStockAPI(['VNM'])

    assert.isTrue(result.healthy)
    assert.equal(result.statusCode, 200)
    assert.isEmpty(result.failedSymbols)
    assert.isBelow(result.responseTimeMs, STOCK_API_CONFIG.TIMEOUT_MS)
  })

  test('trả healthy=false khi API response 500', async ({ assert }) => {
    axios.get = async () => {
      const error: any = new Error('Internal Server Error')
      error.response = { status: 500 }
      throw error
    }

    const result = await checkStockAPI(['VNM'])

    assert.isFalse(result.healthy)
    assert.equal(result.statusCode, 500)
    assert.isNotEmpty(result.error)
  })

  test('trả healthy=false khi network error (không có response)', async ({ assert }) => {
    axios.get = async () => {
      throw new Error('connect ECONNREFUSED')
    }

    const result = await checkStockAPI(['VNM'])

    assert.isFalse(result.healthy)
    assert.equal(result.statusCode, 0)
    assert.include(result.error, 'ECONNREFUSED')
  })

  test('trả healthy=false khi response rỗng', async ({ assert }) => {
    axios.get = async () => ({
      status: 200,
      data: {},  // Rỗng!
    }) as any

    const result = await checkStockAPI(['VNM'])

    assert.isFalse(result.healthy)
    assert.include(result.error, 'empty')
  })

  test('đo response time', async ({ assert }) => {
    axios.get = async () => {
      await new Promise((r) => setTimeout(r, 100))  // Giả lập 100ms delay
      return { status: 200, data: { VNM: { price: 80000 } } }
    }

    const result = await checkStockAPI(['VNM'])

    assert.isAbove(result.responseTimeMs, 50)  // Ít nhất 50ms
    assert.isBelow(result.responseTimeMs, 500) // Không quá 500ms
  })

  test('guard clause khi API_URL chưa config', async ({ assert }) => {
    // Tạm set API_URL = ''
    const originalUrl = STOCK_API_CONFIG.BASE_URL
    Object.defineProperty(STOCK_API_CONFIG, 'BASE_URL', { value: '', writable: true, configurable: true })

    const result = await checkStockAPI(['VNM'])

    assert.isFalse(result.healthy)
    assert.include(result.error, 'not configured')

    // Restore
    Object.defineProperty(STOCK_API_CONFIG, 'BASE_URL', { value: originalUrl, writable: true, configurable: true })
  })
})
```

## Bước 2: Chạy test -- Tất cả FAIL

```bash
rm -f tests/run-failed-tests.json && node ace test unit --files app/Services/monitoringService/libs/checkStockAPI.spec.ts
```

Kết quả: tất cả test FAIL vì `checkStockAPI` chưa tồn tại.

## Bước 3: Implement

```typescript
// app/Services/monitoringService/libs/checkStockAPI.ts
import axios from 'axios'
import Logger from '@ioc:Adonis/Core/Logger'
import { STOCK_API_CONFIG, THRESHOLDS } from '../constants'
import type { CheckAPIResult } from '../type'

const log = Logger.child({ tags: ['monitoringService.checkStockAPI'] })

/**
 * Check stock API health by calling the endpoint and validating the response.
 *
 * @param symbols - Stock symbols to check
 * @returns CheckAPIResult with health status, response time, and any errors
 */
export async function checkStockAPI(symbols: string[]): Promise<CheckAPIResult> {
  const { BASE_URL, API_KEY, TIMEOUT_MS } = STOCK_API_CONFIG

  // Guard clause
  if (!BASE_URL) {
    log.warn('Stock API not configured')
    return {
      healthy: false,
      responseTimeMs: 0,
      statusCode: 0,
      failedSymbols: symbols,
      error: 'Stock API not configured',
    }
  }

  const startTime = Date.now()

  try {
    const response = await axios.get(`${BASE_URL}/api/stocks`, {
      params: { symbols: symbols.join(',') },
      headers: API_KEY ? { 'X-API-Key': API_KEY } : {},
      timeout: TIMEOUT_MS,
    })

    const responseTimeMs = Date.now() - startTime

    // Check empty response
    if (!response.data || Object.keys(response.data).length === 0) {
      log.warn({ symbols, responseTimeMs }, 'Stock API returned empty data')
      return {
        healthy: false,
        responseTimeMs,
        statusCode: response.status,
        failedSymbols: symbols,
        error: 'Stock API returned empty data',
      }
    }

    // Check which symbols are missing from response
    const failedSymbols = symbols.filter((s) => !response.data[s])

    // Check response time threshold
    if (responseTimeMs > THRESHOLDS.MAX_RESPONSE_TIME_MS) {
      log.warn({ responseTimeMs, threshold: THRESHOLDS.MAX_RESPONSE_TIME_MS }, 'Stock API slow response')
    }

    log.info({ responseTimeMs, symbolCount: symbols.length, failedCount: failedSymbols.length }, 'Stock API check completed')

    return {
      healthy: failedSymbols.length === 0,
      responseTimeMs,
      statusCode: response.status,
      failedSymbols,
    }
  } catch (error: any) {
    const responseTimeMs = Date.now() - startTime
    const statusCode = error.response?.status || 0

    log.error({ error: error.message, statusCode, responseTimeMs }, 'Stock API check failed')

    return {
      healthy: false,
      responseTimeMs,
      statusCode,
      failedSymbols: symbols,
      error: error.message,
    }
  }
}
```

## Bước 4: Chạy test -- Tất cả PASS

```bash
rm -f tests/run-failed-tests.json && node ace test unit --files app/Services/monitoringService/libs/checkStockAPI.spec.ts
```

## Bước 5: Type check

```bash
yarn tsc --noEmit
```

## Phân tích code

### Pattern từ aiTeamService

| aiTeamService.send | monitoringService.checkStockAPI |
|----|----|
| Guard clause: `if (!API_URL \|\| !JWT_SECRET)` | Guard clause: `if (!BASE_URL)` |
| `log.warn('not configured')` | `log.warn('not configured')` |
| `return { success: false, error }` | `return { healthy: false, error }` |
| `timeout: TIMEOUT_MS` | `timeout: TIMEOUT_MS` |
| `log.error({ error }, 'failed')` | `log.error({ error, statusCode }, 'failed')` |

### Đo response time

```typescript
const startTime = Date.now()
// ... gọi API ...
const responseTimeMs = Date.now() - startTime
```

Pattern đơn giản: ghi thời gian trước và sau API call, trừ ra được thời gian chờ.

### Empty response check

```typescript
if (!response.data || Object.keys(response.data).length === 0) {
  // API trả 200 nhưng body rỗng → vẫn là lỗi
}
```

**Tại sao cần check?** API có thể trả 200 OK nhưng body là `{}` hoặc `null`. Nếu không check, hệ thống nghĩ data bình thường.

## Bài tập mở rộng

1. Thêm retry cho `checkStockAPI` (dùng pattern từ aiTeamService)
2. Thêm test case: API trả 200 nhưng thiếu 1 symbol (ví dụ gửi ['VNM', 'FPT'] nhưng response chỉ có VNM)
3. Thêm test case: timeout error (`error.code === 'ECONNABORTED'`)
