# Error Handling -- try/catch, phân loại lỗi, return pattern

## Tình huống

FE gọi API thất bại, hiển thị toast "Có lỗi xảy ra". Ở BE, khi gọi service khác thất bại, bạn cần biết **lỗi gì** để xử lý đúng: retry nếu timeout, log nếu server lỗi, bỏ qua nếu không quan trọng.

```
logics → Notification Service
         ↓
         Lỗi! Nhưng lỗi gì?
         - Network error? → Retry
         - Timeout? → Retry với timeout lớn hơn
         - 400 Bad Request? → Bug trong code, cần fix
         - 500 Server Error? → Service kia bị lỗi, retry
         - 401 Unauthorized? → Token hết hạn, refresh
```

## try/catch cơ bản

### FE quen thuộc

```typescript
// FE: Gọi API, hiển thị lỗi cho user
try {
  const data = await api.getStocks()
  setStocks(data)
} catch (error) {
  toast.error('Không thể tải dữ liệu')  // User không cần biết chi tiết
}
```

### BE khác biệt

```typescript
// BE: Cần phân loại lỗi để xử lý đúng
try {
  const response = await axios.post(API_URL, data, { timeout: 10000 })
  return { success: true, data: response.data }
} catch (error: any) {
  // BE cần biết: lỗi gì? có nên retry? log gì?
  log.error({ error: error.message }, 'Request failed')
  return { success: false, error: error.message }
}
```

## Các loại lỗi khi gọi API

### 1. Network Error -- Không kết nối được

```typescript
// Service kia tắt, DNS sai, network down
try {
  await axios.post('http://notification-service:3001/api', data)
} catch (error: any) {
  if (!error.response) {
    // Không có response = không kết nối được
    console.log(error.message) // "connect ECONNREFUSED" hoặc "getaddrinfo ENOTFOUND"
  }
}
```

**Xử lý:** Retry sau vài giây. Nếu retry nhiều lần vẫn lỗi, log error và trả lỗi cho caller.

### 2. Timeout Error -- Kết nối được nhưng đợi quá lâu

```typescript
try {
  await axios.post(API_URL, data, { timeout: 10000 })  // 10s timeout
} catch (error: any) {
  if (error.code === 'ECONNABORTED') {
    // Request bị huỷ vì timeout
    console.log('Request timed out')
  }
}
```

**Xử lý:** Retry với cùng timeout, hoặc tăng timeout. Nếu service luôn chậm, cần điều tra nguyên nhân.

### 3. 4xx Client Error -- Lỗi do mình

```typescript
try {
  await axios.post(API_URL, { invalidField: 'xxx' })
} catch (error: any) {
  if (error.response) {
    console.log(error.response.status)  // 400, 401, 403, 404, 422
    console.log(error.response.data)    // Chi tiết lỗi từ server
  }
}
```

| Status | Ý nghĩa | Xử lý |
|--------|---------|--------|
| 400 | Bad Request -- data sai format | Fix code, không retry |
| 401 | Unauthorized -- token hết hạn | Refresh token, retry 1 lần |
| 403 | Forbidden -- không có quyền | Log error, không retry |
| 404 | Not Found -- URL sai | Fix code, không retry |
| 422 | Unprocessable -- validation fail | Fix data, không retry |

### 4. 5xx Server Error -- Lỗi service kia

```typescript
try {
  await axios.post(API_URL, data)
} catch (error: any) {
  if (error.response?.status >= 500) {
    console.log('Server error:', error.response.status)  // 500, 502, 503
  }
}
```

**Xử lý:** Retry vì service kia có thể đang deploy hoặc quá tải tạm thời.

## Phân loại lỗi trong axios

```typescript
function classifyError(error: any) {
  if (!error.response) {
    // Network error hoặc timeout
    return error.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK_ERROR'
  }

  const status = error.response.status

  if (status >= 500) return 'SERVER_ERROR'   // Retry
  if (status === 401) return 'UNAUTHORIZED'  // Refresh token
  if (status >= 400) return 'CLIENT_ERROR'   // Fix code

  return 'UNKNOWN'
}
```

## Return pattern: { success, data } vs { success, error }

### Ví dụ thực tế -- aiTeamService/libs/send.ts

```typescript
export async function send(
  action: string,
  data: Record<string, any>,
  options?: SendCallOptions,
): Promise<SendResponse> {
  const { API_URL, JWT_SECRET } = AI_TEAM_CONFIG

  // Guard clause: kiểm tra config trước khi gọi
  if (!API_URL || !JWT_SECRET) {
    log.warn('AI Team API not configured')
    return { success: false, error: 'AI Team API not configured' }
  }

  try {
    const response = await axios.post(API_URL, { token }, {
      timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    })

    log.info({ action, attempt }, 'AI Team request successful')
    return { success: true, data: response.data }  // ← Thành công
  } catch (error: any) {
    log.error({ action, error: error.message }, 'AI Team request failed after all retries')
    return { success: false, error: error.message }  // ← Thất bại, nhưng KHÔNG throw
  }
}
```

### Tại sao return thay vì throw?

```typescript
// Pattern 1: Throw (FE style)
// Caller phải try/catch, dễ quên
async function callAPI() {
  const response = await axios.post(url, data)  // Throw nếu lỗi
  return response.data
}

// Pattern 2: Return { success, data/error } (BE service style)
// Caller kiểm tra success, rõ ràng hơn
async function callAPI() {
  try {
    const response = await axios.post(url, data)
    return { success: true, data: response.data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
```

Pattern 2 tốt hơn cho service-to-service vì:
- Caller không cần try/catch, code sạch hơn
- Lỗi được xử lý tại chỗ, không "lan" ra ngoài
- Dễ kiểm tra: `if (result.success) { ... }`

### Caller sử dụng

```typescript
// Sạch, rõ ràng
const result = await aiTeamService.send('question_created', { _id: '123' })

if (result.success) {
  // Xử lý data
  console.log(result.data)
} else {
  // Xử lý lỗi
  log.warn({ error: result.error }, 'AI Team failed, skipping')
}
```

## Error handling trong getOverview (analyticsService)

```typescript
// app/Services/analyticsService/libs/getOverview.ts
const log = Logger.child({ tags: ['analyticsService.getOverview'] })

export async function getOverview(query: OverviewQuery): Promise<OverviewResult> {
  const empty: OverviewResult = {
    totalEvents: 0, totalActiveUsers: 0, totalNewUsers: 0,
    topEventKeys: [], platformSplit: { mobile: 0, web: 0 },
  }

  try {
    // ... logic query MongoDB ...
    return { totalEvents, totalActiveUsers, ... }
  } catch (error) {
    log.error({ error, query }, 'getOverview error')
    return empty  // ← Trả default value thay vì throw
  }
}
```

**Pattern:** Khi function trả về data cho dashboard/report, return giá trị mặc định (empty) thay vì throw. Dashboard vẫn hiển thị được, chỉ thiếu dữ liệu.

## Checklist error handling cho BE HTTP calls

- [ ] Luôn wrap `axios` call trong `try/catch`
- [ ] Set `timeout` cho mọi request
- [ ] Log error với đủ context: `{ action, error: error.message, url }`
- [ ] Phân biệt lỗi cần retry (network, timeout, 5xx) vs không (4xx)
- [ ] Return `{ success, data/error }` thay vì throw cho service functions
- [ ] Guard clause kiểm tra config trước khi gọi API
- [ ] Có giá trị mặc định khi lỗi (cho dashboard/report)

## Tổng kết

- BE cần phân loại lỗi: network, timeout, 4xx, 5xx -- mỗi loại xử lý khác nhau
- `error.response` cho biết server có trả response không (network error thì không có)
- `error.code === 'ECONNABORTED'` là timeout
- Pattern `{ success: true, data }` / `{ success: false, error }` phổ biến trong service-to-service
- Luôn log error với context đầy đủ để debug sau này
