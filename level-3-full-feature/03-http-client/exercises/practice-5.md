# 5 bài thực hành HTTP Client

## Hướng dẫn chung

- Bài 1-2: Đọc code, trả lời câu hỏi
- Bài 3-5: Viết code thực tế (tạo file `.ts` và `.spec.ts`)
- Chạy test: `rm -f tests/run-failed-tests.json && node ace test unit --files <path>`

---

## Bài 1: Đọc hiểu notification service (Dễ)

Đọc file `services/notification/index.ts`:

```typescript
import axios from 'axios'
import notificationConfig from 'Config/notification'

function bindUserDevice(userId: string, deviceId: string) {
  return axios({
    method: 'post',
    url: `${notificationConfig.notification_service_host}/api/v1/notification/device_token`,
    data: { userId, deviceId },
  })
}
```

**Câu hỏi:**

1. Function này gọi HTTP method gì? URL lấy từ đâu?
2. Nếu `NOTIFICATION_SERVICE_HOST` chưa set trong `.env`, chuyện gì xảy ra?
3. Function này có xử lý lỗi (try/catch) không? Nếu service notification tắt, ai sẽ phải xử lý lỗi?
4. Function này có timeout không? Có nên thêm timeout không? Tại sao?
5. So sánh với FE gọi API: FE dùng `fetch('/api/device', { method: 'POST', body: JSON.stringify(data) })` -- khác gì?

---

## Bài 2: Phân tích aiTeamService retry (Trung bình)

Đọc file `app/Services/aiTeamService/libs/send.ts` và `constants.ts`:

```typescript
export const AI_TEAM_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  TIMEOUT_MS: 10000,
} as const
```

**Câu hỏi:**

1. Với config trên, tính thời gian delay cho mỗi attempt:
   - Attempt 1 lỗi → delay bao nhiêu ms?
   - Attempt 2 lỗi → delay bao nhiêu ms?
   - Attempt 3 là lần cuối, không delay

2. Tổng thời gian tối đa từ attempt 1 đến hết attempt 3 là bao nhiêu? (tính cả timeout + delay)

3. Tại sao dùng `log.warn` cho mỗi attempt thất bại, nhưng `log.error` khi hết tất cả retry?

4. Guard clause `if (!API_URL || !JWT_SECRET)` trả về gì? Tại sao không throw error?

5. `options?.maxRetries ?? MAX_RETRIES` -- Giải thích dòng này. Khi nào caller muốn override maxRetries?

---

## Bài 3: Viết HTTP client đơn giản (Trung bình)

Viết function `fetchStockPrice` gọi API lấy giá cổ phiếu.

**Yêu cầu:**

```typescript
// Input
const symbol = 'VNM'

// Output thành công
{ success: true, data: { symbol: 'VNM', price: 80000 } }

// Output thất bại
{ success: false, error: 'Request timeout' }
```

**Gợi ý:**

1. Tạo file `fetchStockPrice.ts`:

```typescript
import axios from 'axios'

const STOCK_API_URL = 'https://api.example.com'
const TIMEOUT_MS = 5000

export async function fetchStockPrice(symbol: string) {
  // TODO:
  // 1. Gọi axios.get(`${STOCK_API_URL}/stocks/${symbol}`)
  // 2. Set timeout
  // 3. Return { success: true, data: response.data }
  // 4. Catch error → return { success: false, error: error.message }
}
```

2. Tạo file `fetchStockPrice.spec.ts`:

```typescript
import { test } from '@japa/runner'

test.group('fetchStockPrice', () => {
  test('trả về success khi API thành công', async ({ assert }) => {
    // Mock axios hoặc dùng nock
    // Gọi fetchStockPrice('VNM')
    // Assert result.success === true
    // Assert result.data.symbol === 'VNM'
  })

  test('trả về error khi API timeout', async ({ assert }) => {
    // Mock axios throw timeout error
    // Assert result.success === false
    // Assert result.error chứa 'timeout'
  })
})
```

---

## Bài 4: Thêm retry cho function (Khó)

Mở rộng bài 3, thêm exponential backoff retry.

**Yêu cầu:**

```typescript
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 500,
  TIMEOUT_MS: 5000,
}

export async function fetchStockPriceWithRetry(symbol: string) {
  // TODO:
  // 1. Dùng for loop với maxRetries
  // 2. Mỗi lần lỗi, tính delay = RETRY_DELAY_MS * 2^(attempt-1)
  // 3. Log warn mỗi attempt thất bại
  // 4. Log info khi thành công (kèm attempt number)
  // 5. Log error khi hết tất cả retry
  // 6. Return { success, data/error }
}
```

**Test cases cần viết:**

1. Thành công ở attempt 1 → không retry, return data
2. Lỗi attempt 1, thành công attempt 2 → retry 1 lần
3. Lỗi tất cả attempt → return error
4. Lỗi 400 → không retry (client error)
5. Kiểm tra delay tăng dần: 500ms, 1000ms, 2000ms

---

## Bài 5: Viết service client hoàn chỉnh (Khó)

Viết `weatherService` giống pattern aiTeamService -- có config, retry, JWT, logging.

**Yêu cầu:**

1. Tạo `constants.ts`:

```typescript
export const WEATHER_CONFIG = {
  API_URL: Env.get('WEATHER_API_URL', ''),
  API_KEY: Env.get('WEATHER_API_KEY', ''),
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
  TIMEOUT_MS: 5000,
} as const
```

2. Tạo `getWeather.ts`:

```typescript
export async function getWeather(city: string): Promise<WeatherResponse> {
  // TODO:
  // 1. Guard clause: kiểm tra API_URL và API_KEY
  // 2. Gọi axios.get với timeout, headers chứa API key
  // 3. Retry với exponential backoff
  // 4. Log mỗi attempt (warn khi lỗi, info khi thành công)
  // 5. Return { success, data/error }
}
```

3. Tạo `getWeather.spec.ts` với test cases:
   - Config trống → return `{ success: false, error: 'not configured' }`
   - API thành công → return data
   - API lỗi, retry thành công → return data, verify 2 attempts
   - API lỗi hết retry → return error

**Checklist hoàn thành:**

- [ ] Guard clause kiểm tra config
- [ ] Timeout cho mọi request
- [ ] Exponential backoff retry
- [ ] Logger.child với tags đúng convention
- [ ] log.warn mỗi attempt, log.error khi hết retry
- [ ] Return `{ success, data/error }`, không throw
- [ ] Config trong constants.ts, đọc từ env
- [ ] Test coverage cho tất cả cases
