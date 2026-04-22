# Implement checkStockData -- So sánh snapshots, detect freeze

## Yêu cầu

So sánh dữ liệu giá cổ phiếu hiện tại với snapshot trước đó:
1. **Data freeze** -- tất cả giá không thay đổi trong 30 phút
2. **Price = 0** -- giá bằng 0, rõ ràng là lỗi
3. **Price < 0 hoặc volume < 0** -- giá trị bất thường

## Khái niệm: Snapshot comparison

```
Snapshot lúc 10:00: VNM=80000, FPT=120000, VIC=45000
Snapshot lúc 10:05: VNM=80100, FPT=120000, VIC=45200
→ FPT không đổi, nhưng 2 mã khác đổi → OK, chưa freeze

Snapshot lúc 10:00: VNM=80000, FPT=120000, VIC=45000
Snapshot lúc 10:30: VNM=80000, FPT=120000, VIC=45000
→ 30 phút, KHÔNG mã nào đổi → Data freeze! API có thể lỗi
```

## Bước 1: Viết test trước

```typescript
// app/Services/monitoringService/libs/checkStockData.spec.ts
import { test } from '@japa/runner'
import { checkStockData } from './checkStockData'
import type { StockSnapshot } from '../type'

test.group('checkStockData', () => {
  test('trả hasAnomalies=false khi data bình thường', async ({ assert }) => {
    const current: StockSnapshot[] = [
      { symbol: 'VNM', price: 80100, volume: 1500000, updatedAt: new Date() },
      { symbol: 'FPT', price: 120200, volume: 2000000, updatedAt: new Date() },
    ]
    const previous: StockSnapshot[] = [
      { symbol: 'VNM', price: 80000, volume: 1400000, updatedAt: new Date(Date.now() - 5 * 60000) },
      { symbol: 'FPT', price: 120000, volume: 1900000, updatedAt: new Date(Date.now() - 5 * 60000) },
    ]

    const result = checkStockData(current, previous)

    assert.isFalse(result.hasAnomalies)
    assert.isEmpty(result.anomalies)
  })

  test('phát hiện price = 0', async ({ assert }) => {
    const current: StockSnapshot[] = [
      { symbol: 'VNM', price: 0, volume: 1500000, updatedAt: new Date() },
      { symbol: 'FPT', price: 120000, volume: 2000000, updatedAt: new Date() },
    ]
    const previous: StockSnapshot[] = [
      { symbol: 'VNM', price: 80000, volume: 1400000, updatedAt: new Date(Date.now() - 5 * 60000) },
      { symbol: 'FPT', price: 120000, volume: 1900000, updatedAt: new Date(Date.now() - 5 * 60000) },
    ]

    const result = checkStockData(current, previous)

    assert.isTrue(result.hasAnomalies)
    assert.lengthOf(result.anomalies, 1)
    assert.equal(result.anomalies[0].symbol, 'VNM')
    assert.equal(result.anomalies[0].type, 'PRICE_ZERO')
  })

  test('phát hiện volume < 0', async ({ assert }) => {
    const current: StockSnapshot[] = [
      { symbol: 'VNM', price: 80000, volume: -1, updatedAt: new Date() },
    ]
    const previous: StockSnapshot[] = [
      { symbol: 'VNM', price: 80000, volume: 1400000, updatedAt: new Date(Date.now() - 5 * 60000) },
    ]

    const result = checkStockData(current, previous)

    assert.isTrue(result.hasAnomalies)
    assert.equal(result.anomalies[0].type, 'VOLUME_NEGATIVE')
  })

  test('phát hiện data freeze -- tất cả price không đổi > 30 phút', async ({ assert }) => {
    const thirtyMinAgo = new Date(Date.now() - 31 * 60000)

    const current: StockSnapshot[] = [
      { symbol: 'VNM', price: 80000, volume: 1500000, updatedAt: thirtyMinAgo },
      { symbol: 'FPT', price: 120000, volume: 2000000, updatedAt: thirtyMinAgo },
    ]
    const previous: StockSnapshot[] = [
      { symbol: 'VNM', price: 80000, volume: 1500000, updatedAt: new Date(Date.now() - 35 * 60000) },
      { symbol: 'FPT', price: 120000, volume: 2000000, updatedAt: new Date(Date.now() - 35 * 60000) },
    ]

    const result = checkStockData(current, previous)

    assert.isTrue(result.hasAnomalies)
    const freezeAnomaly = result.anomalies.find((a) => a.type === 'DATA_FREEZE')
    assert.exists(freezeAnomaly)
  })

  test('KHÔNG phát hiện freeze khi chỉ 1 mã không đổi', async ({ assert }) => {
    const current: StockSnapshot[] = [
      { symbol: 'VNM', price: 80000, volume: 1500000, updatedAt: new Date() },  // Không đổi
      { symbol: 'FPT', price: 120500, volume: 2100000, updatedAt: new Date() }, // Đổi
    ]
    const previous: StockSnapshot[] = [
      { symbol: 'VNM', price: 80000, volume: 1500000, updatedAt: new Date(Date.now() - 5 * 60000) },
      { symbol: 'FPT', price: 120000, volume: 2000000, updatedAt: new Date(Date.now() - 5 * 60000) },
    ]

    const result = checkStockData(current, previous)

    // 1 mã không đổi là bình thường (có thể không có giao dịch)
    assert.isFalse(result.hasAnomalies)
  })

  test('phát hiện nhiều anomalies cùng lúc', async ({ assert }) => {
    const current: StockSnapshot[] = [
      { symbol: 'VNM', price: 0, volume: 1500000, updatedAt: new Date() },      // price = 0
      { symbol: 'FPT', price: 120000, volume: -100, updatedAt: new Date() },    // volume < 0
    ]
    const previous: StockSnapshot[] = [
      { symbol: 'VNM', price: 80000, volume: 1400000, updatedAt: new Date(Date.now() - 5 * 60000) },
      { symbol: 'FPT', price: 120000, volume: 1900000, updatedAt: new Date(Date.now() - 5 * 60000) },
    ]

    const result = checkStockData(current, previous)

    assert.isTrue(result.hasAnomalies)
    assert.lengthOf(result.anomalies, 2)
  })

  test('trả rỗng khi current hoặc previous rỗng', async ({ assert }) => {
    const result = checkStockData([], [])
    assert.isFalse(result.hasAnomalies)
  })
})
```

## Bước 2: Thêm type cho snapshot

Thêm vào `type.ts`:

```typescript
/** Stock price snapshot at a point in time */
export interface StockSnapshot {
  symbol: string
  price: number
  volume: number
  updatedAt: Date
}
```

## Bước 3: Implement

```typescript
// app/Services/monitoringService/libs/checkStockData.ts
import Logger from '@ioc:Adonis/Core/Logger'
import { THRESHOLDS } from '../constants'
import type { CheckDataResult, DataAnomaly, StockSnapshot } from '../type'

const log = Logger.child({ tags: ['monitoringService.checkStockData'] })

/**
 * Compare current stock data with previous snapshot to detect anomalies.
 *
 * Checks for:
 * - Price = 0 or negative
 * - Volume negative
 * - Data freeze (all prices unchanged for > threshold minutes)
 */
export function checkStockData(current: StockSnapshot[], previous: StockSnapshot[]): CheckDataResult {
  if (current.length === 0) {
    return { hasAnomalies: false, anomalies: [] }
  }

  const anomalies: DataAnomaly[] = []

  // Check each symbol for value anomalies
  for (const stock of current) {
    if (stock.price === 0) {
      anomalies.push({
        symbol: stock.symbol,
        type: 'PRICE_ZERO',
        message: `${stock.symbol} price is 0`,
        currentValue: stock.price,
      })
    }

    if (stock.price < 0) {
      anomalies.push({
        symbol: stock.symbol,
        type: 'PRICE_NEGATIVE',
        message: `${stock.symbol} price is negative: ${stock.price}`,
        currentValue: stock.price,
      })
    }

    if (stock.volume < 0) {
      anomalies.push({
        symbol: stock.symbol,
        type: 'VOLUME_NEGATIVE',
        message: `${stock.symbol} volume is negative: ${stock.volume}`,
        currentValue: stock.volume,
      })
    }
  }

  // Check data freeze: all prices unchanged AND updatedAt stale
  if (previous.length > 0) {
    const previousMap = new Map(previous.map((s) => [s.symbol, s]))

    const unchangedCount = current.filter((stock) => {
      const prev = previousMap.get(stock.symbol)
      return prev && stock.price === prev.price && stock.volume === prev.volume
    }).length

    const allUnchanged = unchangedCount === current.length
    const freezeThreshold = THRESHOLDS.DATA_FREEZE_MINUTES * 60 * 1000
    const oldestUpdate = Math.min(...current.map((s) => s.updatedAt.getTime()))
    const timeSinceUpdate = Date.now() - oldestUpdate

    if (allUnchanged && timeSinceUpdate > freezeThreshold) {
      anomalies.push({
        symbol: 'ALL',
        type: 'DATA_FREEZE',
        message: `All ${current.length} symbols unchanged for ${Math.round(timeSinceUpdate / 60000)} minutes`,
      })

      log.warn(
        { unchangedCount, timeSinceMinutes: Math.round(timeSinceUpdate / 60000) },
        'Data freeze detected'
      )
    }
  }

  if (anomalies.length > 0) {
    log.warn({ anomalyCount: anomalies.length, anomalies }, 'Data anomalies found')
  } else {
    log.info({ symbolCount: current.length }, 'Stock data check passed')
  }

  return {
    hasAnomalies: anomalies.length > 0,
    anomalies,
  }
}
```

## Bước 4: Chạy test

```bash
rm -f tests/run-failed-tests.json && node ace test unit --files app/Services/monitoringService/libs/checkStockData.spec.ts
```

## Phân tích code

### Pure function

`checkStockData` là **pure function** -- không gọi API, không đọc database. Nhận input, trả output. Điều này làm nó rất dễ test.

```typescript
// Pure: input → output, no side effects
function checkStockData(current: StockSnapshot[], previous: StockSnapshot[]): CheckDataResult

// So sánh với checkStockAPI: impure, gọi axios
async function checkStockAPI(symbols: string[]): Promise<CheckAPIResult>
```

### Map cho lookup nhanh

```typescript
const previousMap = new Map(previous.map((s) => [s.symbol, s]))
// { 'VNM' → { price: 80000, ... }, 'FPT' → { price: 120000, ... } }

const prev = previousMap.get(stock.symbol)  // O(1) thay vì O(n)
```

### Data freeze detection logic

```
1. Đếm số mã không đổi (price VÀ volume giống nhau)
2. Nếu TẤT CẢ không đổi (unchangedCount === total):
   3. Kiểm tra thời gian: nếu > 30 phút → FREEZE
```

Tại sao cần cả 2 điều kiện?
- Chỉ 1-2 mã không đổi: bình thường (ít giao dịch)
- Tất cả mã không đổi nhưng mới update 5 phút trước: chưa đủ để kết luận
- Tất cả mã không đổi và > 30 phút: data feed có thể bị lỗi

## Bài tập mở rộng

1. Thêm check: giá thay đổi quá lớn (> 7% trong 5 phút) -- có thể là circuit breaker hoặc data error
2. Thêm check: volume = 0 trong giờ giao dịch (bình thường là có volume)
3. Thêm parameter `tradingHours: boolean` -- ngoài giờ giao dịch thì relax threshold
