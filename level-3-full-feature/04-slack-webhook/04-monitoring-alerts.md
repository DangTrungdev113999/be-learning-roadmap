# Monitoring Alerts -- Alert template, severity levels, best practices

## Tình huống

Server chạy 24/7, không ai ngồi xem log liên tục. Cần hệ thống tự gửi alert khi:
- API bên ngoài không phản hồi
- Dữ liệu bất thường (giá cổ phiếu = 0, volume quá cao)
- Cronjob chạy thất bại
- Error rate tăng đột biến

## Alert vs Notification

| Khía cạnh | Notification (logics đang dùng) | Monitoring Alert (nâng cao) |
|-----------|-------------------------------|---------------------------|
| Khi nào gửi | User hành động (feedback, rút tiền) | Hệ thống phát hiện vấn đề |
| Ai cần xem | Ops/CS team | Dev/DevOps team |
| Tần suất | Mỗi khi user thao tác | Chỉ khi có vấn đề |
| Urgency | Trung bình | Tuỳ severity |
| Channel | #feedback, #banking | #alerts, #errors |

### logics đang có

```typescript
// Notification: user gửi feedback
await slack.sendFeedback(`---Có một feedback mới---\n+ UserId: ${user.identity}...`)

// Notification: lệnh rút tiền
await slack.sendNotityRequestWithdrawBanking(`---Có một lệnh rút tiền mới---...`)
```

### Monitoring alert (cần thêm)

```typescript
// Alert: API không phản hồi
await slack.sendErrorAlert('Stock API returned 500 for 3 consecutive requests')

// Alert: Dữ liệu bất thường
await slack.sendErrorAlert('VNM price = 0, possible data error')
```

## Severity levels

Không phải alert nào cũng khẩn cấp. Phân loại severity giúp team biết ưu tiên:

| Level | Emoji | Ý nghĩa | Ví dụ | Hành động |
|-------|-------|---------|-------|-----------|
| CRITICAL | :rotating_light: | Hệ thống sập | DB connection lost | Fix ngay |
| ERROR | :x: | Feature lỗi | API trả 500 liên tục | Fix trong 1 giờ |
| WARNING | :warning: | Bất thường | Response chậm > 5s | Điều tra |
| INFO | :information_source: | Thông báo | Cronjob chạy thành công | Để biết |

### Template theo severity

```typescript
type Severity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO'

const SEVERITY_CONFIG = {
  CRITICAL: { emoji: ':rotating_light:', color: '#FF0000' },
  ERROR:    { emoji: ':x:', color: '#E74C3C' },
  WARNING:  { emoji: ':warning:', color: '#F39C12' },
  INFO:     { emoji: ':information_source:', color: '#3498DB' },
}

function createAlertMessage(severity: Severity, title: string, details: Record<string, string>) {
  const config = SEVERITY_CONFIG[severity]

  const fieldsText = Object.entries(details)
    .map(([key, value]) => `*${key}:* ${value}`)
    .join('\n')

  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${config.emoji} [${severity}] ${title}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: fieldsText },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Service: logics | Time: ${new Date().toISOString()}` },
        ],
      },
    ],
  }
}
```

### Sử dụng

```typescript
// CRITICAL: DB mất kết nối
await alertWebhook.send(createAlertMessage('CRITICAL', 'Database Connection Lost', {
  'Database': 'MongoDB primary',
  'Error': 'MongoNetworkError: connection refused',
  'Impact': 'Tất cả API đều trả lỗi',
}))

// WARNING: API chậm
await alertWebhook.send(createAlertMessage('WARNING', 'Slow API Response', {
  'Endpoint': '/api/stocks/overview',
  'Response time': '8.5s (threshold: 5s)',
  'Affected users': '~500',
}))

// ERROR: Dữ liệu bất thường
await alertWebhook.send(createAlertMessage('ERROR', 'Stock Data Anomaly', {
  'Symbol': 'VNM',
  'Issue': 'Price = 0 (expected ~80,000)',
  'Source': 'stockDataService.syncPrice',
}))
```

## Alert template cho data monitoring

### Template: API Health Check

```typescript
function createAPIHealthAlert(serviceName: string, status: number, responseTime: number) {
  const isDown = status >= 500 || status === 0
  const isSlow = responseTime > 5000

  if (!isDown && !isSlow) return null  // Không cần alert

  const severity: Severity = isDown ? 'ERROR' : 'WARNING'
  const title = isDown ? `${serviceName} is DOWN` : `${serviceName} is SLOW`

  return createAlertMessage(severity, title, {
    'Status': status === 0 ? 'No response' : `${status}`,
    'Response time': `${responseTime}ms`,
    'Threshold': '5000ms',
  })
}
```

### Template: Data Anomaly

```typescript
function createDataAnomalyAlert(symbol: string, field: string, current: any, expected: string) {
  return createAlertMessage('ERROR', `Data Anomaly: ${symbol}`, {
    'Symbol': symbol,
    'Field': field,
    'Current value': String(current),
    'Expected': expected,
    'Action': 'Kiểm tra data source',
  })
}

// Sử dụng
await alertWebhook.send(createDataAnomalyAlert(
  'VNM', 'price', 0, '> 0 (last known: 80,000)'
))
```

### Template: Cronjob Status

```typescript
function createCronjobAlert(jobName: string, status: 'success' | 'failed', details?: string) {
  const severity: Severity = status === 'failed' ? 'ERROR' : 'INFO'
  const title = status === 'failed'
    ? `Cronjob Failed: ${jobName}`
    : `Cronjob Completed: ${jobName}`

  return createAlertMessage(severity, title, {
    'Job': jobName,
    'Status': status,
    ...(details ? { 'Details': details } : {}),
    'Time': new Date().toISOString(),
  })
}
```

## Best practices -- Tránh spam

### 1. Throttle alerts -- Không gửi liên tục cùng lỗi

```typescript
const lastAlerts = new Map<string, number>()
const THROTTLE_MS = 5 * 60 * 1000  // 5 phút

async function sendThrottledAlert(key: string, message: any) {
  const lastSent = lastAlerts.get(key) || 0
  const now = Date.now()

  if (now - lastSent < THROTTLE_MS) {
    return  // Bỏ qua, chưa đủ 5 phút kể từ lần gửi trước
  }

  lastAlerts.set(key, now)
  await alertWebhook.send(message)
}

// Sử dụng: cùng key chỉ gửi 1 lần/5 phút
await sendThrottledAlert('stock-api-down', createAPIHealthAlert('StockAPI', 500, 0))
```

### 2. Group alerts -- Gom nhiều lỗi thành 1 message

```typescript
// Thay vì gửi 50 messages cho 50 cổ phiếu lỗi data
// Gom thành 1 message
const anomalies = ['VNM: price=0', 'FPT: volume=-1', 'VIC: price=NaN']

await alertWebhook.send(createAlertMessage('ERROR', `Data Anomalies (${anomalies.length} symbols)`, {
  'Count': `${anomalies.length} symbols`,
  'Details': anomalies.slice(0, 10).join('\n'),  // Max 10 dòng
  ...(anomalies.length > 10 ? { 'More': `+${anomalies.length - 10} more` } : {}),
}))
```

### 3. Chỉ alert actionable items -- Chỉ gửi khi cần hành động

```
Tốt: "Stock API trả 500, đã retry 3 lần, vẫn lỗi → cần kiểm tra"
Xấu: "Stock API trả 500, retry lần 1" (có thể retry thành công, không cần alert)
```

### 4. Phân kênh theo severity

```
#alerts-critical  → CRITICAL only → Notification loud (mentions @channel)
#alerts-error     → ERROR + WARNING → Check vài lần/ngày
#alerts-info      → INFO → Đọc khi rảnh
```

### 5. Kèm đủ context để debug

```typescript
// Xấu: Thiếu context
await webhook.send({ text: 'Error occurred' })

// Tốt: Đủ context để debug ngay
await webhook.send(createAlertMessage('ERROR', 'Stock API Failed', {
  'Endpoint': 'https://api.stock.com/v1/prices',
  'Status': '503',
  'Error': 'Service Unavailable',
  'Retries': '3/3 exhausted',
  'Duration': '32s total',
  'Last success': '15 mins ago',
}))
```

## Tổng kết

- Phân biệt notification (user action) vs monitoring alert (system issue)
- 4 severity levels: CRITICAL, ERROR, WARNING, INFO
- Tạo template functions để tái sử dụng format
- Tránh spam: throttle (5 phút/lỗi), group alerts, chỉ gửi actionable items
- Kèm đủ context: service, endpoint, error, thời gian, lần retry
- Phân kênh Slack theo severity để không bị ngập thông báo
