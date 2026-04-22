# Webhook là gì? Incoming vs Outgoing, so sánh FE notification

## Tình huống

User gửi feedback trên app. Team cần biết ngay. Mở database xem? Chậm. Viết trang admin? Tốn thời gian. Giải pháp: gửi thông báo vào Slack channel tự động.

```
User gửi feedback → logics xử lý → Gửi vào Slack channel #feedback
                                    → Team đọc ngay trên Slack
```

## Webhook là gì?

Webhook = "gọi API ngược". Thay vì bạn gọi API để lấy dữ liệu, bạn gửi dữ liệu đến 1 URL khi có sự kiện xảy ra.

### So sánh với polling

```
Polling (hỏi liên tục):
  Cứ 5 giây: "Có feedback mới không?" → "Không"
  Cứ 5 giây: "Có feedback mới không?" → "Không"
  Cứ 5 giây: "Có feedback mới không?" → "Có!"

Webhook (thông báo khi có):
  Có feedback mới → Gửi ngay đến Slack
  Không có gì → Không gọi
```

### So sánh FE notification vs Webhook

| Khía cạnh | FE push notification | BE webhook |
|-----------|---------------------|------------|
| Gửi từ | Server → Trình duyệt/App | Server → URL đích (Slack, Discord, etc.) |
| Nhận bởi | User | Channel/service |
| Mục đích | Thông báo cho user | Thông báo cho team/hệ thống |
| Cách gửi | Firebase/APNs | HTTP POST đến webhook URL |
| Ai cấu hình URL | Không (SDK tự quản lý) | Dev tạo webhook URL trên Slack |

### Ví dụ FE quen thuộc

```typescript
// FE: Gửi push notification qua Firebase
firebase.messaging().send({
  token: deviceToken,
  notification: { title: 'Có tin nhắn mới', body: 'Trung gửi cho bạn' },
})
```

### BE webhook tương đương

```typescript
// BE: Gửi Slack webhook
await webhook.send({ text: 'Có feedback mới từ user Trung' })
// Slack nhận HTTP POST → hiển thị message trong channel
```

## Incoming vs Outgoing Webhook

### Incoming Webhook -- Gửi message VÀO Slack

Bạn gửi data đến Slack. Slack hiển thị message.

```
logics → HTTP POST → Slack Webhook URL → Message trong #feedback channel
```

**Đây là cái logics đang dùng.** Mỗi khi có feedback, lệnh rút tiền, etc. → gửi message vào Slack.

### Outgoing Webhook -- Slack gửi data RA ngoài

User gõ command trong Slack, Slack gọi API của bạn.

```
User gõ /deploy → Slack → HTTP POST → Server của bạn → Chạy deploy
```

**logics không dùng outgoing webhook.** Chỉ dùng incoming để thông báo.

## Incoming Webhook hoạt động thế nào?

### Bước 1: Tạo webhook URL trên Slack

Vào Slack App settings → Incoming Webhooks → tạo webhook cho channel.

Slack cho bạn URL dạng:
```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

### Bước 2: Gửi HTTP POST đến URL đó

```bash
# Thử bằng curl
curl -X POST https://hooks.slack.com/services/T.../B.../XXX \
  -H 'Content-Type: application/json' \
  -d '{"text": "Hello từ terminal!"}'
```

Slack nhận request → hiển thị "Hello từ terminal!" trong channel.

### Bước 3: Làm tương tự trong code

```typescript
import axios from 'axios'

// Cách thủ công (dùng axios trực tiếp)
await axios.post('https://hooks.slack.com/services/T.../B.../XXX', {
  text: 'Hello từ code!',
})

// Cách dùng thư viện @slack/webhook (logics dùng cách này)
import { IncomingWebhook } from '@slack/webhook'
const webhook = new IncomingWebhook('https://hooks.slack.com/services/T.../B.../XXX')
await webhook.send({ text: 'Hello từ code!' })
```

## Tại sao dùng @slack/webhook thay vì axios trực tiếp?

```typescript
// Cách 1: axios -- Phải tự xử lý
await axios.post(webhookUrl, { text: message })
// Không có type checking, không validate format, không retry

// Cách 2: @slack/webhook -- Thư viện chính thức
const webhook = new IncomingWebhook(webhookUrl)
await webhook.send({ text: message })
// Type checking, validate format, retry built-in, Block Kit support
```

`@slack/webhook` là SDK chính thức của Slack, giúp:
- TypeScript types cho message format
- Hỗ trợ Block Kit (rich messages)
- Error handling tốt hơn

## Webhook URL là secret

Webhook URL chứa token. Ai có URL đều gửi được message vào channel.

```bash
# KHÔNG ĐƯỢC commit vào git
FEEDBACK_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../XXX

# Lưu trong .env, đọc bằng Env.get()
```

## Tổng kết

- Webhook = gửi HTTP POST đến URL khi có sự kiện, thay vì polling liên tục
- Incoming Webhook: gửi message vào Slack (logics đang dùng)
- Outgoing Webhook: Slack gọi API của bạn (logics không dùng)
- Webhook URL là secret, lưu trong `.env`
- Dùng `@slack/webhook` package thay vì axios trực tiếp
- Giống FE push notification, nhưng gửi cho channel/team thay vì user
