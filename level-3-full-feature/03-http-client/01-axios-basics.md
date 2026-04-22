# Axios cơ bản -- GET, POST, config, so sánh FE fetch

## Tình huống

Ở FE, bạn dùng `fetch` hoặc `axios` để gọi API từ trình duyệt đến server. Ở BE, server cũng cần gọi API đến **server khác**. Ví dụ: logics cần gọi Notification Service để gửi push notification, gọi AI Team Service để phân tích dữ liệu, gọi Facebook API để xác thực token.

```
[User App] → [logics BE] → [Notification Service]
                         → [AI Team Service]
                         → [Facebook Graph API]
```

**BE gọi API giống FE, nhưng khác mục đích:** FE gọi để lấy dữ liệu hiển thị, BE gọi để tích hợp với các service khác trong hệ thống.

## So sánh fetch (FE) vs axios (BE)

| Khía cạnh | FE (fetch/axios) | BE (axios) |
|-----------|-----------------|------------|
| Gọi từ | Trình duyệt | Server (Node.js) |
| Gọi đến | API backend của mình | Service khác, API bên thứ 3 |
| CORS | Bị chặn nếu khác domain | Không bị chặn (server-to-server) |
| Timeout | Ít quan tâm | Rất quan trọng (tránh treo request) |
| Retry | Hiếm khi cần | Thường xuyên (network không ổn định) |
| Auth | Token của user | API key, JWT, OAuth giữa các service |

### FE quen thuộc

```typescript
// FE: Gọi API lấy danh sách cổ phiếu
const response = await fetch('/api/stocks')
const data = await response.json()
```

### BE tương đương

```typescript
// BE: logics gọi Notification Service
import axios from 'axios'

const response = await axios.get('http://notification-service:3001/api/health')
const data = response.data  // axios tự parse JSON
```

## axios.get -- Lấy dữ liệu

```typescript
// Cú pháp
axios.get(url, config?)

// Ví dụ đơn giản
const response = await axios.get('https://api.example.com/users')
console.log(response.data)    // Body đã parse JSON
console.log(response.status)  // 200
```

### Ví dụ thực tế -- services/facebook/index.ts

Facebook service dùng `axios.get` với `baseURL` và `params`:

```typescript
// 1. Lấy access token từ Facebook
const { data: tokenData } = await axios.get('oauth/access_token', {
  baseURL: FB_GRAPH_URL,
  params: {
    client_id: facebookConfig.client_id,
    client_secret: facebookConfig.client_secret,
    grant_type: 'client_credentials',
  },
})

// 2. Verify token
const { data: inspectTokenData } = await axios.get(`${FB_VERSION}/debug_token`, {
  baseURL: FB_GRAPH_URL,
  params: {
    input_token: accessToken,
  },
  headers: {
    Authorization: `Bearer ${bearerToken}`,
  },
})

// 3. Lấy profile user
const { data: fbProfileData } = await axios.get(`${FB_VERSION}/${fbID}`, {
  baseURL: FB_GRAPH_URL,
  params: {
    fields: ['id', 'email', 'first_name', 'last_name', 'name'].join(','),
  },
  headers: {
    Authorization: `Bearer ${bearerToken}`,
  },
})
```

**Chú ý pattern:** `const { data: tokenData } = await axios.get(...)` -- destructure trực tiếp `response.data` và đặt tên biến rõ ràng.

## axios.post -- Gửi dữ liệu

```typescript
// Cú pháp
axios.post(url, data, config?)
```

### Ví dụ thực tế -- services/notification/index.ts

```typescript
import axios from 'axios'
import notificationConfig from 'Config/notification'

function bindUserDevice(userId: string, deviceId: string) {
  return axios({
    method: 'post',
    url: `${notificationConfig.notification_service_host}/api/v1/notification/device_token`,
    data: {
      userId: userId,
      deviceId: deviceId,
    },
  })
}
```

### Ví dụ thực tế -- aiTeamService/libs/send.ts

```typescript
const response = await axios.post(
  API_URL,
  { token },                                         // data (body)
  {
    timeout: TIMEOUT_MS,                              // config
    headers: { 'Content-Type': 'application/json' },
  },
)
```

## Axios config -- Các tuỳ chọn quan trọng

```typescript
const config = {
  // URL
  baseURL: 'https://api.example.com',  // URL gốc, tự nối với url
  url: '/users',                       // Path cụ thể

  // Method
  method: 'post',                      // get, post, put, delete

  // Data
  data: { name: 'Trung' },            // Body (POST, PUT)
  params: { page: 1, limit: 10 },     // Query string (?page=1&limit=10)

  // Headers
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer xxx',
  },

  // Timeout (ms) -- RẤT QUAN TRỌNG ở BE
  timeout: 10000,  // 10 giây, sau đó throw error
}
```

### Tại sao timeout quan trọng ở BE?

```
Không có timeout:
User → logics → Notification Service (treo 60s)
                 ↑ User đợi 60s, nghĩ app bị lỗi

Có timeout 10s:
User → logics → Notification Service (timeout 10s) → trả lỗi cho user
                 ↑ User biết ngay có lỗi, không đợi lâu
```

Ở FE, nếu API chậm, user tắt trang đi. Ở BE, nếu không có timeout, request bị treo chiếm resource, nhiều request treo sẽ làm crash server.

### Ví dụ thực tế -- AI_TEAM_CONFIG

```typescript
// app/Services/aiTeamService/constants.ts
export const AI_TEAM_CONFIG = {
  API_URL: Env.get('AI_TEAM_API_URL', ''),
  JWT_SECRET: Env.get('AI_TEAM_JWT_SECRET', ''),
  JWT_ISSUER: 'finpath_be',
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  TIMEOUT_MS: 10000,       // 10 giây timeout
} as const
```

## Hai cách gọi axios

```typescript
// Cách 1: axios(config) -- Dùng khi cần config phức tạp
axios({
  method: 'post',
  url: `${host}/api/v1/notification/device_token`,
  data: { userId, deviceId },
})

// Cách 2: axios.method(url, ...) -- Dùng khi đơn giản
axios.post(API_URL, { token }, { timeout: TIMEOUT_MS })
axios.get('/users', { params: { page: 1 } })
```

Trong logics, cả hai cách đều được dùng:
- `services/notification/index.ts` dùng cách 1 (`axios({ method: 'post', ... })`)
- `app/Services/aiTeamService/libs/send.ts` dùng cách 2 (`axios.post(...)`)

## response object

```typescript
const response = await axios.get('/users')

response.data     // Body đã parse JSON (khác fetch phải .json())
response.status   // HTTP status code (200, 404, 500)
response.headers  // Response headers
```

### So sánh với FE fetch

```typescript
// FE fetch: phải gọi .json() thủ công
const res = await fetch('/api/users')
const data = await res.json()  // Bước thêm

// BE axios: tự parse JSON
const { data } = await axios.get('/api/users')  // Gọn hơn
```

## Tổng kết

- axios ở BE hoạt động giống FE, nhưng gọi giữa các server với nhau
- Luôn set `timeout` cho mọi request (thường 5-30 giây)
- Dùng `baseURL` khi gọi nhiều endpoint cùng service
- Dùng `params` cho query string, `data` cho request body
- `response.data` đã tự parse JSON, không cần `.json()` như fetch
- Config URL lấy từ environment variables, không hardcode
