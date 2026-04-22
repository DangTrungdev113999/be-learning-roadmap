# Setup Slack Webhook -- @slack/webhook, config, .env

## Cấu trúc trong logics

```
config/
└── slack.ts                  ← Config đọc env variables

services/
├── index.ts                  ← Export tất cả services
└── slack/
    └── index.ts              ← Slack webhook functions

.env
├── FEEDBACK_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
└── REQUEST_WITHDRAW_BANKING_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

## Bước 1: Config -- config/slack.ts

```typescript
import Env from '@ioc:Adonis/Core/Env'

const config = {
  FeedbackWebhookUrl: Env.get('FEEDBACK_SLACK_WEBHOOK_URL'),
  RequestWithdrawBankingWebhookUrl: Env.get('REQUEST_WITHDRAW_BANKING_SLACK_WEBHOOK_URL'),
}

export default config
```

**Chú ý pattern:**
- Mỗi webhook URL cho 1 channel riêng biệt
- `FEEDBACK_SLACK_WEBHOOK_URL` → channel #feedback
- `REQUEST_WITHDRAW_BANKING_SLACK_WEBHOOK_URL` → channel #banking-alerts
- Config đọc từ `.env`, không hardcode

### .env file

```bash
# Slack Webhooks
FEEDBACK_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
REQUEST_WITHDRAW_BANKING_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B11111111/YYYYYYYYYYYYYYYYYYYYYYYY
```

## Bước 2: Service -- services/slack/index.ts

```typescript
import { IncomingWebhook } from '@slack/webhook'
import slackConfig from '../../config/slack'

// Tạo webhook instances khi server khởi động
const feedbackWebhook = new IncomingWebhook(slackConfig.FeedbackWebhookUrl)
const bankWebhook = new IncomingWebhook(slackConfig.RequestWithdrawBankingWebhookUrl)

export default {
  sendFeedback: async (message: string) => {
    return feedbackWebhook.send({
      text: message,
    })
  },
  sendNotityRequestWithdrawBanking: async (message: string) => {
    return bankWebhook.send({
      text: message,
    })
  },
}
```

### Phân tích code

**1. Tạo webhook instance 1 lần:**

```typescript
// Tạo instance khi file được import (server startup)
const feedbackWebhook = new IncomingWebhook(slackConfig.FeedbackWebhookUrl)

// KHÔNG tạo instance mỗi lần gọi (lãng phí)
// ❌ export default {
//   sendFeedback: async (message) => {
//     const webhook = new IncomingWebhook(url)  // Tạo mới mỗi lần
//     return webhook.send({ text: message })
//   }
// }
```

**2. Mỗi channel = 1 webhook instance:**

```typescript
const feedbackWebhook = new IncomingWebhook(slackConfig.FeedbackWebhookUrl)      // #feedback
const bankWebhook = new IncomingWebhook(slackConfig.RequestWithdrawBankingWebhookUrl)  // #banking
```

**3. Export dạng object với methods:**

```typescript
export default {
  sendFeedback: async (message: string) => { ... },
  sendNotityRequestWithdrawBanking: async (message: string) => { ... },
}
```

## Bước 3: Export qua services/index.ts

```typescript
// services/index.ts
import slack from './slack'
import notification from './notification'

export { slack, notification }
```

Các controller import từ đây:

```typescript
// app/Controllers/Http/FeedBacksController.ts
import { slack } from '../../../services'

// Gọi
await slack.sendFeedback('message here')
```

## Bước 4: Sử dụng trong Controller

### Ví dụ thực tế -- FeedBacksController

```typescript
import { slack } from '../../../services'

export default class FeedBacksController {
  public async create({ auth, request }: HttpContextContract) {
    const { rule, userId } = auth || {}
    const { title = '', content = '' } = request.body()

    const user = await mongo.users.findById(userId, {
      phoneNumber: true, fullName: true, email: true, identity: true,
    })

    // Gửi feedback lên Slack
    await slack.sendFeedback(`
      ---Có một feedback mới---
+ UserId: ${user.identity || ''}
+ Name: ${user.fullName || ''}
+ PhoneNumber: ${user.phoneNumber || ''}
+ Title: ${title}
+ Content: ${content}
----------End----------`)

    return { data: { ok: 'ok' } }
  }
}
```

### Ví dụ thực tế -- Rút tiền

```typescript
// app/Controllers/Http/PredictionsController.ts
await slack.sendNotityRequestWithdrawBanking(`
  ---Có một lệnh rút tiền mới---
+ TransactionId: ${transactionId}
+ UserId: ${identity || ''}
+ Name: ${fullName || ''}
+ PhoneNumber: ${phoneNumber || ''}
+ Amount: ${amount}
----------End----------`)
```

## Thêm webhook mới -- Quy trình

Nếu cần gửi alert vào channel mới (ví dụ #error-alerts):

### 1. Tạo webhook URL trên Slack

Slack App → Incoming Webhooks → Add New Webhook → chọn channel #error-alerts.

### 2. Thêm vào .env

```bash
ERROR_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../ZZZ
```

### 3. Thêm vào config/slack.ts

```typescript
const config = {
  FeedbackWebhookUrl: Env.get('FEEDBACK_SLACK_WEBHOOK_URL'),
  RequestWithdrawBankingWebhookUrl: Env.get('REQUEST_WITHDRAW_BANKING_SLACK_WEBHOOK_URL'),
  ErrorAlertWebhookUrl: Env.get('ERROR_ALERT_SLACK_WEBHOOK_URL'),  // ← Thêm
}
```

### 4. Thêm vào services/slack/index.ts

```typescript
const errorAlertWebhook = new IncomingWebhook(slackConfig.ErrorAlertWebhookUrl)  // ← Thêm

export default {
  sendFeedback: async (message: string) => feedbackWebhook.send({ text: message }),
  sendNotityRequestWithdrawBanking: async (message: string) => bankWebhook.send({ text: message }),
  sendErrorAlert: async (message: string) => errorAlertWebhook.send({ text: message }),  // ← Thêm
}
```

### 5. Sử dụng

```typescript
await slack.sendErrorAlert('Database connection failed!')
```

## Package @slack/webhook

### Cài đặt

```bash
yarn add @slack/webhook
```

### API đơn giản

```typescript
import { IncomingWebhook } from '@slack/webhook'

// Tạo instance
const webhook = new IncomingWebhook(url)

// Gửi text đơn giản
await webhook.send({ text: 'Hello!' })

// Gửi với Block Kit (rich format)
await webhook.send({
  blocks: [
    { type: 'header', text: { type: 'plain_text', text: 'Alert!' } },
    { type: 'section', text: { type: 'mrkdwn', text: 'Chi tiết lỗi...' } },
  ],
})
```

## Tổng kết

- 3 file cần tạo/sửa: `config/slack.ts`, `services/slack/index.ts`, `.env`
- Mỗi Slack channel = 1 webhook URL = 1 IncomingWebhook instance
- Webhook instance tạo 1 lần khi server khởi động, không tạo mỗi lần gọi
- Controller import slack service qua `services/index.ts`
- Thêm webhook mới: 4 bước (env → config → service → sử dụng)
