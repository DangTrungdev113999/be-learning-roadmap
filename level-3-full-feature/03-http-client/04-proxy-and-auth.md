# Proxy, JWT, API Keys, OAuth -- Xác thực giữa các service

## Tình huống

Ở FE, bạn gửi access token trong header để server biết user là ai. Ở BE, khi server A gọi server B, cũng cần xác thực -- nhưng không phải xác thực user, mà xác thực **service**. Server B cần biết: "Ai đang gọi tôi? Có được phép không?"

```
FE auth:    User → [token trong header] → Server
BE auth:    Server A → [JWT/API key] → Server B
```

## 1. API Key -- Đơn giản nhất

Mỗi service có 1 secret key, gửi kèm trong header mỗi request.

```typescript
// Gọi API với API key
await axios.get('https://api.openai.com/v1/models', {
  headers: {
    'Authorization': 'Bearer sk-xxx-your-api-key',
  },
})
```

### Cách lưu API key

```typescript
// config/notification.ts
import Env from '@ioc:Adonis/Core/Env'

const notificationConfig = {
  notification_service_host: Env.get('NOTIFICATION_SERVICE_HOST'),
}
export default notificationConfig
```

```bash
# .env
NOTIFICATION_SERVICE_HOST=http://notification-service:3001
```

**Quy tắc:** API key, host, secret luôn đọc từ environment variables, KHÔNG BAO GIỜ hardcode trong code.

### Trong logics

```typescript
// services/notification/index.ts
import notificationConfig from 'Config/notification'

function bindUserDevice(userId: string, deviceId: string) {
  return axios({
    method: 'post',
    url: `${notificationConfig.notification_service_host}/api/v1/notification/device_token`,
    data: { userId, deviceId },
  })
}
```

Notification service trong cùng hệ thống internal nên không cần API key -- chỉ cần biết host. Nhưng khi gọi service bên ngoài (OpenAI, Facebook, etc.) thì cần API key.

## 2. JWT giữa các service

JWT không chỉ dùng cho user auth. Giữa các service, JWT dùng để:
- Xác thực service gọi (ai đang gọi?)
- Truyền data an toàn (data không bị sửa giữa đường)
- Có thời hạn (token hết hạn = phải tạo mới)

### Ví dụ thực tế -- aiTeamService/libs/send.ts

```typescript
import jwt from 'jsonwebtoken'

const { API_URL, JWT_SECRET, JWT_ISSUER } = AI_TEAM_CONFIG

// Tạo JWT chứa action và data
const jwtPayload: JwtPayload = {
  iss: JWT_ISSUER,      // 'finpath_be' -- ai đang gọi
  action,               // 'question_created' -- muốn làm gì
  payload: data,        // { _id: '123', question: 'Hello' } -- data gì
}

// Ký JWT bằng secret chung
const token = jwt.sign(jwtPayload, JWT_SECRET)

// Gửi token trong body
const response = await axios.post(
  API_URL,
  { token },  // ← JWT nằm trong body
  {
    timeout: TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  },
)
```

### Luồng JWT service-to-service

```
1. logics tạo JWT:
   { iss: 'finpath_be', action: 'question_created', payload: {...} }
   → Ký bằng JWT_SECRET → token string

2. Gửi token đến AI Team Service

3. AI Team Service nhận token:
   → Verify bằng cùng JWT_SECRET
   → Đọc iss = 'finpath_be' → Biết logics đang gọi
   → Đọc action, payload → Biết cần làm gì
```

### So sánh JWT user vs JWT service

| Khía cạnh | JWT cho user (FE→BE) | JWT giữa service (BE→BE) |
|-----------|---------------------|-------------------------|
| Tạo bởi | Server khi user login | Service A khi gọi Service B |
| Chứa gì | userId, roles | issuer, action, payload |
| Gửi ở đâu | Header `Authorization` | Header hoặc body |
| Verify bởi | Server nhận request | Service B |
| Secret | User JWT secret | Shared secret giữa 2 service |

## 3. OAuth -- Xác thực qua bên thứ 3

OAuth phức tạp hơn: service cần xin token từ bên thứ 3 trước khi gọi API.

### Ví dụ thực tế -- services/facebook/index.ts

```typescript
// Bước 1: Lấy app access token từ Facebook
const { data: tokenData } = await axios.get('oauth/access_token', {
  baseURL: 'https://graph.facebook.com/',
  params: {
    client_id: facebookConfig.client_id,
    client_secret: facebookConfig.client_secret,
    grant_type: 'client_credentials',
  },
})
// tokenData = { access_token: "xxx", token_type: "bearer" }

// Bước 2: Dùng token để gọi API
const bearerToken = tokenData.access_token
const { data: inspectData } = await axios.get(`v22.0/debug_token`, {
  baseURL: 'https://graph.facebook.com/',
  params: { input_token: accessToken },
  headers: { Authorization: `Bearer ${bearerToken}` },
})

// Bước 3: Lấy user profile
const { data: profile } = await axios.get(`v22.0/${fbID}`, {
  baseURL: 'https://graph.facebook.com/',
  params: { fields: 'id,email,first_name,last_name,name' },
  headers: { Authorization: `Bearer ${bearerToken}` },
})
```

### Luồng OAuth

```
1. logics gửi client_id + client_secret → Facebook
2. Facebook trả access_token
3. logics dùng access_token → gọi Facebook API
4. Nếu token hết hạn → lặp lại bước 1
```

## 4. Config pattern cho authentication

### config/slack.ts -- Webhook URL từ env

```typescript
import Env from '@ioc:Adonis/Core/Env'

const config = {
  FeedbackWebhookUrl: Env.get('FEEDBACK_SLACK_WEBHOOK_URL'),
  RequestWithdrawBankingWebhookUrl: Env.get('REQUEST_WITHDRAW_BANKING_SLACK_WEBHOOK_URL'),
}
export default config
```

### config/notification.ts -- Service host từ env

```typescript
import Env from '@ioc:Adonis/Core/Env'

const notificationConfig = {
  notification_service_host: Env.get('NOTIFICATION_SERVICE_HOST'),
}
export default notificationConfig
```

### aiTeamService/constants.ts -- Đầy đủ config

```typescript
import Env from '@ioc:Adonis/Core/Env'

export const AI_TEAM_CONFIG = {
  API_URL: Env.get('AI_TEAM_API_URL', ''),
  JWT_SECRET: Env.get('AI_TEAM_JWT_SECRET', ''),
  JWT_ISSUER: 'finpath_be',
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  TIMEOUT_MS: 10000,
} as const
```

### Pattern chung

```
config/
├── slack.ts           ← Webhook URLs
├── notification.ts    ← Service host
├── facebook.ts        ← OAuth client_id, client_secret
└── ...

services/
├── aiTeamService/
│   └── constants.ts   ← JWT_SECRET, API_URL, retry config
└── ...

.env
├── FEEDBACK_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
├── NOTIFICATION_SERVICE_HOST=http://notification:3001
├── AI_TEAM_API_URL=http://ai-team:4000
├── AI_TEAM_JWT_SECRET=my-secret-key
└── ...
```

## Guard clause -- Kiểm tra config trước khi gọi

```typescript
// aiTeamService/libs/send.ts
if (!API_URL || !JWT_SECRET) {
  log.warn('AI Team API not configured')
  return { success: false, error: 'AI Team API not configured' }
}
```

**Tại sao cần guard clause?**
- Trong development, có thể chưa setup env variables
- Nếu không check, axios sẽ gọi đến URL rỗng → lỗi khó debug
- Guard clause cho lỗi rõ ràng: "API not configured" thay vì "connect ECONNREFUSED undefined:undefined"

## Bảng tổng hợp các phương thức xác thực

| Phương thức | Độ phức tạp | Dùng khi | Ví dụ trong logics |
|-------------|------------|----------|-------------------|
| Không auth | Thấp | Internal service, cùng network | notificationService |
| API Key | Thấp | Service bên thứ 3 | -- |
| JWT | Trung bình | Service cần verify payload | aiTeamService |
| OAuth | Cao | API cần nhiều bước xác thực | facebookService |
| Webhook URL | Thấp | Gửi notification 1 chiều | slackService |

## Tổng kết

- Secret, API key, host luôn đọc từ env variables (`Env.get(...)`)
- JWT service-to-service: tạo token chứa issuer + action + data, ký bằng shared secret
- OAuth: lấy access_token trước, dùng token gọi API sau
- Guard clause kiểm tra config trước khi gọi API
- Config tập trung trong `config/` hoặc `constants.ts`, không rải rác trong code
