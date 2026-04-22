# Message Formats -- Simple text, Block Kit, mrkdwn syntax

## Simple text -- Đơn giản nhất

### Cách logics đang dùng

```typescript
// services/slack/index.ts
await feedbackWebhook.send({
  text: message,  // Chỉ cần text
})
```

### Format message trong controller

```typescript
// app/Controllers/Http/FeedBacksController.ts
await slack.sendFeedback(`
  ---Có một feedback mới---
+ UserId: ${user.identity || ''}
+ Name: ${user.fullName || ''}
+ PhoneNumber: ${user.phoneNumber || ''}
+ Title: ${title}
+ Content: ${content}
----------End----------`)
```

Kết quả trên Slack:

```
---Có một feedback mới---
+ UserId: usr_123
+ Name: Nguyễn Văn A
+ PhoneNumber: 0901234567
+ Title: App bị chậm
+ Content: Trang chủ load lâu quá
----------End----------
```

Đơn giản, nhanh, nhưng khó đọc khi nhiều thông tin.

## mrkdwn syntax -- Markdown của Slack

Slack dùng `mrkdwn` (không phải Markdown), cú pháp hơi khác:

| Format | mrkdwn | Markdown | Kết quả |
|--------|--------|----------|---------|
| Bold | `*text*` | `**text**` | **text** |
| Italic | `_text_` | `*text*` | _text_ |
| Strike | `~text~` | `~~text~~` | ~~text~~ |
| Code | `` `code` `` | `` `code` `` | `code` |
| Code block | ` ```code``` ` | ` ```code``` ` | Code block |
| Link | `<url\|text>` | `[text](url)` | Hyperlink |
| List | `- item` hoặc `1. item` | Giống | List |

### Ví dụ mrkdwn

```typescript
await webhook.send({
  text: `*Feedback mới* từ _${user.fullName}_

*UserId:* \`${user.identity}\`
*Tiêu đề:* ${title}

> ${content}

<https://admin.app.com/users/${userId}|Xem chi tiết trên Admin>`
})
```

Kết quả:

```
Feedback mới từ Nguyễn Văn A

UserId: usr_123
Tiêu đề: App bị chậm

> Trang chủ load lâu quá

Xem chi tiết trên Admin (link)
```

## Block Kit -- Rich messages

Block Kit cho phép tạo message có cấu trúc: header, sections, fields, dividers, buttons.

### Cấu trúc

```typescript
await webhook.send({
  blocks: [
    // Block 1: Header
    { type: 'header', text: { type: 'plain_text', text: 'Tiêu đề' } },

    // Block 2: Section
    { type: 'section', text: { type: 'mrkdwn', text: 'Nội dung' } },

    // Block 3: Divider (đường kẻ ngang)
    { type: 'divider' },

    // Block 4: Context (text nhỏ, màu xám)
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Thông tin phụ' }] },
  ],
})
```

### Ví dụ: Feedback message với Block Kit

```typescript
// Nâng cấp feedback message từ simple text → Block Kit
async function sendFeedbackRich(user: any, title: string, content: string) {
  await feedbackWebhook.send({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Feedback mới' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*User:*\n${user.fullName}` },
          { type: 'mrkdwn', text: `*UserId:*\n\`${user.identity}\`` },
          { type: 'mrkdwn', text: `*Phone:*\n${user.phoneNumber || 'N/A'}` },
          { type: 'mrkdwn', text: `*Email:*\n${user.email || 'N/A'}` },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${title}*\n${content}` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Sent at ${new Date().toISOString()}` },
        ],
      },
    ],
  })
}
```

### Ví dụ: Alert rút tiền với Block Kit

```typescript
async function sendWithdrawAlert(transaction: any) {
  await bankWebhook.send({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Lệnh rút tiền mới' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Transaction:*\n\`${transaction.id}\`` },
          { type: 'mrkdwn', text: `*Amount:*\n${transaction.amount.toLocaleString()} VNĐ` },
          { type: 'mrkdwn', text: `*User:*\n${transaction.userName}` },
          { type: 'mrkdwn', text: `*Phone:*\n${transaction.phone}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Ngân hàng:* ${transaction.bankName}\n*STK:* \`${transaction.accountNumber}\``,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Request at ${new Date().toISOString()}` },
        ],
      },
    ],
  })
}
```

## Các block types phổ biến

### Header -- Tiêu đề lớn

```typescript
{
  type: 'header',
  text: { type: 'plain_text', text: 'Alert: Hệ thống lỗi' },
}
```

### Section -- Nội dung chính

```typescript
// Text đơn giản
{
  type: 'section',
  text: { type: 'mrkdwn', text: '*Bold title*\nNội dung chi tiết' },
}

// Fields (2 cột)
{
  type: 'section',
  fields: [
    { type: 'mrkdwn', text: '*Cột trái:*\nGiá trị' },
    { type: 'mrkdwn', text: '*Cột phải:*\nGiá trị' },
  ],
}
```

### Divider -- Đường kẻ ngang

```typescript
{ type: 'divider' }
```

### Context -- Text nhỏ, màu xám

```typescript
{
  type: 'context',
  elements: [
    { type: 'mrkdwn', text: 'Updated 5 mins ago | Source: logics' },
  ],
}
```

## Khi nào dùng simple text vs Block Kit?

| Tình huống | Nên dùng | Lý do |
|-----------|---------|-------|
| Debug log | Simple text | Nhanh, không cần đẹp |
| Feedback notification | Block Kit | Dễ đọc, có cấu trúc |
| Error alert | Block Kit | Cần phân biệt severity |
| Rút tiền alert | Block Kit | Nhiều thông tin, cần rõ ràng |
| Test thử webhook | Simple text | Xác nhận hoạt động trước |

**Trong logics hiện tại:** Đang dùng simple text cho tất cả. Khi nào message phức tạp, nhiều thông tin, nên chuyển sang Block Kit.

## Template pattern

```typescript
// Tạo template function, tái sử dụng
function createAlertBlocks(title: string, fields: Record<string, string>, note?: string) {
  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: title } },
    {
      type: 'section',
      fields: Object.entries(fields).map(([key, value]) => ({
        type: 'mrkdwn' as const,
        text: `*${key}:*\n${value}`,
      })),
    },
  ]

  if (note) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: note }],
    })
  }

  return blocks
}

// Sử dụng
await webhook.send({
  blocks: createAlertBlocks('Feedback mới', {
    User: user.fullName,
    Phone: user.phoneNumber,
    Title: title,
  }, `Sent at ${new Date().toISOString()}`),
})
```

## Tổng kết

- Simple text (`{ text: 'message' }`) -- nhanh, gọn, dùng cho debug/test
- mrkdwn -- Markdown của Slack: `*bold*`, `_italic_`, `` `code` ``, `<url|text>`
- Block Kit -- Rich messages: header, section (fields 2 cột), divider, context
- logics đang dùng simple text, có thể nâng cấp lên Block Kit khi cần
- Tạo template function để tái sử dụng format
