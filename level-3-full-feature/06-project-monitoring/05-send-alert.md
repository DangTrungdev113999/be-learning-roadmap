# Implement sendAlert -- Format message, gửi Slack

## Yêu cầu

1. Nhận `AlertPayload` (severity, title, details)
2. Format thành Slack Block Kit message
3. Throttle: cùng lỗi không gửi liên tục (5 phút/lần)
4. Gửi qua Slack webhook
5. Log kết quả

## Bước 1: Viết test trước

```typescript
// app/Services/monitoringService/libs/sendAlert.spec.ts
import { test } from '@japa/runner'
import { sendAlert, _resetThrottleMap } from './sendAlert'
import type { AlertPayload } from '../type'

// Mock slack service
let lastSentMessage: any = null
let sendCount = 0

const mockSlack = {
  sendMonitoringAlert: async (message: any) => {
    lastSentMessage = message
    sendCount++
  },
}

test.group('sendAlert', (group) => {
  group.each.setup(() => {
    lastSentMessage = null
    sendCount = 0
    _resetThrottleMap()  // Reset throttle state giữa các test
  })

  test('gửi message khi có alert', async ({ assert }) => {
    const alert: AlertPayload = {
      severity: 'ERROR',
      title: 'Stock API Down',
      details: {
        'Status': '500',
        'Error': 'Internal Server Error',
      },
    }

    await sendAlert(alert, mockSlack as any)

    assert.isNotNull(lastSentMessage)
    assert.equal(sendCount, 1)
  })

  test('message chứa severity và title', async ({ assert }) => {
    const alert: AlertPayload = {
      severity: 'CRITICAL',
      title: 'Database Connection Lost',
      details: { 'Error': 'MongoNetworkError' },
    }

    await sendAlert(alert, mockSlack as any)

    // Kiểm tra Block Kit format
    const headerBlock = lastSentMessage.blocks.find((b: any) => b.type === 'header')
    assert.exists(headerBlock)
    assert.include(headerBlock.text.text, 'CRITICAL')
    assert.include(headerBlock.text.text, 'Database Connection Lost')
  })

  test('message chứa details dưới dạng fields', async ({ assert }) => {
    const alert: AlertPayload = {
      severity: 'WARNING',
      title: 'Slow Response',
      details: {
        'Endpoint': '/api/stocks',
        'Response time': '8500ms',
      },
    }

    await sendAlert(alert, mockSlack as any)

    const sectionBlock = lastSentMessage.blocks.find((b: any) => b.type === 'section' && b.fields)
    assert.exists(sectionBlock)
    assert.isAbove(sectionBlock.fields.length, 0)
  })

  test('throttle: cùng key không gửi lại trong 5 phút', async ({ assert }) => {
    const alert: AlertPayload = {
      severity: 'ERROR',
      title: 'API Down',
      details: {},
      throttleKey: 'stock-api-down',
    }

    await sendAlert(alert, mockSlack as any)
    assert.equal(sendCount, 1)

    // Gửi lại cùng key → bị throttle
    await sendAlert(alert, mockSlack as any)
    assert.equal(sendCount, 1)  // Vẫn 1, không tăng
  })

  test('throttle: key khác nhau gửi bình thường', async ({ assert }) => {
    const alert1: AlertPayload = {
      severity: 'ERROR',
      title: 'API Down',
      details: {},
      throttleKey: 'stock-api-down',
    }
    const alert2: AlertPayload = {
      severity: 'WARNING',
      title: 'Data Freeze',
      details: {},
      throttleKey: 'data-freeze',
    }

    await sendAlert(alert1, mockSlack as any)
    await sendAlert(alert2, mockSlack as any)
    assert.equal(sendCount, 2)  // Cả 2 đều gửi
  })

  test('không có throttleKey → luôn gửi', async ({ assert }) => {
    const alert: AlertPayload = {
      severity: 'INFO',
      title: 'Test',
      details: {},
      // Không có throttleKey
    }

    await sendAlert(alert, mockSlack as any)
    await sendAlert(alert, mockSlack as any)
    assert.equal(sendCount, 2)  // Cả 2 đều gửi
  })
})
```

## Bước 2: Implement

```typescript
// app/Services/monitoringService/libs/sendAlert.ts
import Logger from '@ioc:Adonis/Core/Logger'
import { THRESHOLDS } from '../constants'
import type { AlertPayload, Severity } from '../type'

const log = Logger.child({ tags: ['monitoringService.sendAlert'] })

const SEVERITY_EMOJI: Record<Severity, string> = {
  CRITICAL: ':rotating_light:',
  ERROR: ':x:',
  WARNING: ':warning:',
  INFO: ':information_source:',
}

/** Throttle map: key → last sent timestamp */
const throttleMap = new Map<string, number>()

/** Reset throttle map (for testing) */
export function _resetThrottleMap() {
  throttleMap.clear()
}

/**
 * Format and send monitoring alert to Slack.
 *
 * Features:
 * - Block Kit format with severity emoji
 * - Throttle: same key won't fire again within ALERT_THROTTLE_MS
 * - Logs alert details for audit
 *
 * @param alert - Alert payload with severity, title, details
 * @param slackService - Slack service (injectable for testing)
 */
export async function sendAlert(
  alert: AlertPayload,
  slackService?: { sendMonitoringAlert: (message: any) => Promise<void> },
) {
  const { severity, title, details, throttleKey } = alert

  // Throttle check
  if (throttleKey) {
    const lastSent = throttleMap.get(throttleKey) || 0
    const now = Date.now()

    if (now - lastSent < THRESHOLDS.ALERT_THROTTLE_MS) {
      log.info({ throttleKey, severity }, 'Alert throttled')
      return
    }

    throttleMap.set(throttleKey, now)
  }

  // Build Block Kit message
  const emoji = SEVERITY_EMOJI[severity] || ''
  const message = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} [${severity}] ${title}` },
      },
      {
        type: 'section',
        fields: Object.entries(details).map(([key, value]) => ({
          type: 'mrkdwn' as const,
          text: `*${key}:*\n${value}`,
        })),
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Service: logics | Time: ${new Date().toISOString()}` },
        ],
      },
    ],
  }

  try {
    if (slackService) {
      await slackService.sendMonitoringAlert(message)
    } else {
      // Default: import real slack service
      const { slack } = await import('../../../../services')
      await (slack as any).sendMonitoringAlert(message)
    }

    log.info({ severity, title }, 'Alert sent successfully')
  } catch (error: any) {
    log.error({ error: error.message, severity, title }, 'Failed to send alert')
  }
}
```

## Bước 3: Chạy test

```bash
rm -f tests/run-failed-tests.json && node ace test unit --files app/Services/monitoringService/libs/sendAlert.spec.ts
```

## Phân tích code

### Dependency Injection cho Slack

```typescript
export async function sendAlert(
  alert: AlertPayload,
  slackService?: { sendMonitoringAlert: (message: any) => Promise<void> },
)
```

**Tại sao inject slackService?**

- Test: truyền mock, không cần Slack thật
- Production: không truyền, dùng import mặc định

```typescript
// Test: dùng mock
await sendAlert(alert, mockSlack)

// Production: không truyền param
await sendAlert(alert)  // Tự import real slack service
```

### Throttle pattern

```typescript
const throttleMap = new Map<string, number>()

// Kiểm tra: cùng key, gửi lại trong 5 phút → bỏ qua
if (throttleKey) {
  const lastSent = throttleMap.get(throttleKey) || 0
  if (Date.now() - lastSent < THRESHOLDS.ALERT_THROTTLE_MS) {
    return  // Bỏ qua
  }
  throttleMap.set(throttleKey, Date.now())
}
```

Giống pattern throttle alerts trong bài 04-slack-webhook/04-monitoring-alerts.md.

### _resetThrottleMap cho testing

```typescript
export function _resetThrottleMap() {
  throttleMap.clear()
}
```

Prefix `_` cho biết đây là function internal, chỉ export để test. Nếu không reset, test chạy lần 2 sẽ bị throttle từ lần 1.

### Block Kit message structure

```
┌──────────────────────────────────┐
│ :x: [ERROR] Stock API Down       │  ← header
├──────────────────────────────────┤
│ *Status:*    │ *Error:*          │  ← section with fields
│ 500          │ Internal Server   │
├──────────────────────────────────┤
│ ─────────────────────────────── │  ← divider
├──────────────────────────────────┤
│ Service: logics | Time: 2026... │  ← context
└──────────────────────────────────┘
```

## Bài tập mở rộng

1. Thêm `@channel` mention cho CRITICAL alerts (Slack sẽ notify tất cả members)
2. Thêm field "Source" tự động từ tags
3. Thêm link đến dashboard/admin trong context block
