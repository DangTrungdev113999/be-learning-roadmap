# Đăng ký Cronjob -- Trading hours, runStockMonitor, integration

## Tổng kết flow

```
Cronjob (mỗi 5 phút, giờ giao dịch)
  → runStockMonitor()
    → checkStockAPI(['VNM', 'FPT', 'VIC', 'HPG', 'VCB'])
    → checkStockData(currentSnapshots, previousSnapshots)
    → sendAlert(payload) nếu có vấn đề
```

## runStockMonitor -- Orchestrator function

```typescript
// app/Services/monitoringService/libs/runStockMonitor.ts
import Logger from '@ioc:Adonis/Core/Logger'
import { MONITOR_SYMBOLS } from '../constants'
import { checkStockAPI } from './checkStockAPI'
import { checkStockData } from './checkStockData'
import { sendAlert } from './sendAlert'
import type { StockSnapshot } from '../type'

const log = Logger.child({ tags: ['monitoringService.runStockMonitor'] })

/** Store previous snapshot for comparison */
let previousSnapshot: StockSnapshot[] = []

/**
 * Main monitoring function -- orchestrates all checks and sends alerts.
 * Called by cronjob every 5 minutes during trading hours.
 */
export async function runStockMonitor() {
  log.info('Starting stock monitor check')

  // Step 1: Check API health
  const apiResult = await checkStockAPI(MONITOR_SYMBOLS)

  if (!apiResult.healthy) {
    await sendAlert({
      severity: apiResult.statusCode === 0 ? 'CRITICAL' : 'ERROR',
      title: 'Stock API Health Check Failed',
      details: {
        'Status': String(apiResult.statusCode),
        'Response time': `${apiResult.responseTimeMs}ms`,
        'Failed symbols': apiResult.failedSymbols.join(', '),
        'Error': apiResult.error || 'Unknown',
      },
      throttleKey: 'stock-api-health',
    })
    return  // Không check data nếu API lỗi
  }

  // Step 2: Get current data and check for anomalies
  // (Trong thực tế, lấy data từ Redis/DB sau khi sync)
  const currentSnapshot = await getCurrentSnapshot(MONITOR_SYMBOLS)

  const dataResult = checkStockData(currentSnapshot, previousSnapshot)

  if (dataResult.hasAnomalies) {
    const anomalyDetails: Record<string, string> = {}
    dataResult.anomalies.forEach((a, i) => {
      anomalyDetails[`Anomaly ${i + 1}`] = `${a.symbol}: ${a.message}`
    })

    await sendAlert({
      severity: dataResult.anomalies.some((a) => a.type === 'DATA_FREEZE') ? 'ERROR' : 'WARNING',
      title: `Stock Data Anomalies (${dataResult.anomalies.length})`,
      details: anomalyDetails,
      throttleKey: 'stock-data-anomaly',
    })
  }

  // Step 3: Save current snapshot for next comparison
  previousSnapshot = currentSnapshot

  log.info(
    { apiResponseMs: apiResult.responseTimeMs, anomalyCount: dataResult.anomalies.length },
    'Stock monitor check completed'
  )
}

/**
 * Get current stock snapshots from Redis/DB.
 * (Simplified version -- in production, read from redis/models/overviewStock)
 */
async function getCurrentSnapshot(symbols: string[]): Promise<StockSnapshot[]> {
  // TODO: Read from redis or mongo
  // Example:
  // const stocks = await Promise.all(symbols.map(s => redisStock.get(s)))
  // return stocks.map(s => ({ symbol: s.symbol, price: s.price, volume: s.volume, updatedAt: s.updatedAt }))
  return []
}
```

### Phân tích flow

```
runStockMonitor()
  │
  ├── checkStockAPI() → API lỗi?
  │     ├── Có → sendAlert('Stock API Down') → RETURN (dừng)
  │     └── Không → Tiếp tục
  │
  ├── getCurrentSnapshot() → Lấy data hiện tại
  │
  ├── checkStockData(current, previous) → Có anomaly?
  │     ├── Có → sendAlert('Data Anomalies')
  │     └── Không → OK
  │
  └── previousSnapshot = currentSnapshot (lưu cho lần sau)
```

**Tại sao return sớm khi API lỗi?**

Nếu API lỗi, data sẽ cũ hoặc không có. Check data lúc này sẽ cho kết quả sai (false positive). Tốt hơn là chỉ alert API lỗi và đợi lần check sau.

## Đăng ký Cronjob

### start/cronjob.ts trong logics

```typescript
// start/cronjob.ts (file hiện tại)
import { portfolioService } from 'App/Services/portfolioService'
import { qnaService } from 'App/Services/qnaService'
import { userService } from 'App/Services/userService'
import { cronjobAdd } from 'Utils/cronjob'

const main = async () => {
  if (process.env.LOCAL === '1' || process.env.NODE_ENV === 'test') {
    return  // Skip cronjob in local and test
  }

  // Release T+ volume at 11:30 every day
  cronjobAdd('dailyReleaseBuyVolume', '4 30 11 * * *', async () => {
    await portfolioService.dailyReleaseBuyVolume()
  })

  // Run at 9h05 and 20h05 every day
  cronjobAdd('remindExpertAnswerQuestion', '0 5 9,20 * * *', async () => {
    await qnaService.remindExpertAnswerQuestion()
  })

  // ...các cronjob khác...
}

main().catch(console.error)
```

### Thêm monitoring cronjob

```typescript
// Thêm vào start/cronjob.ts
import { monitoringService } from 'App/Services/monitoringService'

// Stock monitoring: every 5 minutes during trading hours (9:00-15:00, Mon-Fri)
cronjobAdd('stockMonitor', '0 */5 9-14 * * 1-5', async () => {
  await monitoringService.runStockMonitor()
})
```

### Phân tích cron expression

```
'0 */5 9-14 * * 1-5'
 │  │   │    │ │  │
 │  │   │    │ │  └── 1-5: Thứ Hai đến Thứ Sáu
 │  │   │    │ └──── *: Mọi tháng
 │  │   │    └────── *: Mọi ngày
 │  │   └─────────── 9-14: Từ 9 giờ đến 14 giờ (sàn đóng 14:30, check đến 14:55)
 │  └──────────────── */5: Mỗi 5 phút (0, 5, 10, 15, 20, ...)
 └─────────────────── 0: Giây 0
```

**Tại sao 9-14 thay vì 9-15?**
- Sàn mở 9:00, đóng 14:30
- Cronjob chạy lúc 14:00, 14:05, 14:10, ..., 14:55
- `9-14` cover 9:00 đến 14:59

### So sánh với cronjob khác trong logics

```typescript
// Chạy lúc 11:30 hàng ngày
cronjobAdd('dailyReleaseBuyVolume', '4 30 11 * * *', ...)
//                                   s  m  h

// Chạy lúc 9:05 và 20:05 hàng ngày
cronjobAdd('remindExpertAnswerQuestion', '0 5 9,20 * * *', ...)
//                                        s m h1,h2

// Chạy mỗi 5 phút, giờ giao dịch, ngày làm việc
cronjobAdd('stockMonitor', '0 */5 9-14 * * 1-5', ...)
//                          s  m    h range  weekday range
```

## cronjobAdd helper

```typescript
// utils/cronjob.ts
import { CronJob } from 'cron'
import { lockService } from 'App/Services/lockService'

const log = Logger.child({ tags: ['cronjob'] })

export const cronjobAdd = (key: string, expression: string, handle: () => Promise<void>) => {
  if (has.has(key)) {
    return log.error({ key }, 'Cronjob key already exists')
  }

  has.set(key, true)

  const wrapper = async () => {
    try {
      // Distributed lock: chỉ 1 instance chạy cronjob
      if (!(await lockService.acquire([APP_NAME, 'cronjob', key], ...))) {
        return
      }
      await handle()
    } catch (error) {
      log.error({ error }, 'Cronjob error')
    }
  }

  new CronJob(expression, wrapper, null, true, TIMEZONE).start()
}
```

**Chú ý:**
- `lockService.acquire` -- đảm bảo chỉ 1 server instance chạy cronjob (nhiều instances chạy cùng lúc sẽ gây trùng lặp)
- `try/catch` trong wrapper -- cronjob không được crash, lỗi phải catch và log
- `key` phải unique -- helper kiểm tra và log error nếu trùng

## Integration test

Sau khi implement tất cả functions, test integration:

```typescript
// Test flow hoàn chỉnh (manual test)
import { monitoringService } from 'App/Services/monitoringService'

// 1. Test checkStockAPI
const apiResult = await monitoringService.checkStockAPI(['VNM', 'FPT'])
console.log('API Result:', apiResult)

// 2. Test checkStockData
const dataResult = monitoringService.checkStockData(
  [{ symbol: 'VNM', price: 0, volume: 1000, updatedAt: new Date() }],
  [{ symbol: 'VNM', price: 80000, volume: 1000, updatedAt: new Date(Date.now() - 300000) }]
)
console.log('Data Result:', dataResult)

// 3. Test sendAlert
await monitoringService.sendAlert({
  severity: 'WARNING',
  title: 'Test Alert',
  details: { 'Source': 'Integration test' },
})

// 4. Test full flow
await monitoringService.runStockMonitor()
```

## Checklist hoàn thành

### Code

- [ ] `constants.ts` -- MONITOR_SYMBOLS, STOCK_API_CONFIG, THRESHOLDS
- [ ] `type.ts` -- CheckAPIResult, CheckDataResult, DataAnomaly, AlertPayload, StockSnapshot
- [ ] `libs/checkStockAPI.ts` + `.spec.ts` -- 6+ test cases
- [ ] `libs/checkStockData.ts` + `.spec.ts` -- 7+ test cases
- [ ] `libs/sendAlert.ts` + `.spec.ts` -- 6+ test cases
- [ ] `libs/runStockMonitor.ts` -- orchestrator
- [ ] `index.ts` -- export monitoringService
- [ ] `docs.md` -- mô tả tất cả functions
- [ ] Thêm cronjob vào `start/cronjob.ts`

### Quality

- [ ] Tất cả test PASS: `rm -f tests/run-failed-tests.json && find app/Services/monitoringService/libs -name "*.spec.ts" -exec node ace test unit --files {} \;`
- [ ] Type check PASS: `yarn tsc --noEmit`
- [ ] Logger dùng đúng convention: `Logger.child({ tags: ['monitoringService.functionName'] })`
- [ ] Không hardcode config, đọc từ env/constants
- [ ] Không log sensitive data
- [ ] Mỗi catch block có log.error

### Kiến thức đã áp dụng

- [ ] HTTP Client: axios, timeout, error handling, retry
- [ ] Slack Webhook: IncomingWebhook, Block Kit format
- [ ] Logging: Logger.child, tags, info/warn/error, structured data
- [ ] Cronjob: cron expression, cronjobAdd, trading hours
- [ ] TDD: test first, implement, green
- [ ] Service pattern: docs.md, index.ts, libs/, constants, types

## Tổng kết

Bạn vừa xây dựng 1 monitoring service hoàn chỉnh:

1. **checkStockAPI** -- Gọi API, đo response time, phát hiện lỗi
2. **checkStockData** -- So sánh data, phát hiện freeze/anomaly
3. **sendAlert** -- Format Block Kit, throttle, gửi Slack
4. **runStockMonitor** -- Orchestrate tất cả, chạy mỗi 5 phút

Service này tích hợp tất cả kiến thức từ Level 3: HTTP client, Slack webhook, structured logging, cronjob, và TDD.
