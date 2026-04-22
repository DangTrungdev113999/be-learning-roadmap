# Thiết kế monitoringService -- docs.md, constants, types

## Cấu trúc thư mục

```
app/Services/monitoringService/
├── docs.md              ← Mô tả tất cả functions
├── index.ts             ← Export: export const monitoringService = {}
├── constants.ts         ← Config, thresholds
├── type.ts              ← TypeScript types
└── libs/
    ├── checkStockAPI.ts
    ├── checkStockAPI.spec.ts
    ├── checkStockData.ts
    ├── checkStockData.spec.ts
    ├── sendAlert.ts
    ├── sendAlert.spec.ts
    └── runStockMonitor.ts
```

## docs.md

Viết trước khi code. Mô tả mỗi function: input, output, logic.

```markdown
# monitoringService

Stock data monitoring -- kiểm tra API và dữ liệu chứng khoán định kỳ.

## Functions

### checkStockAPI()

Gọi stock API endpoint, kiểm tra status và response time.

- Input: `symbols: string[]` -- danh sách mã cổ phiếu cần kiểm tra
- Output: `CheckAPIResult` -- status, responseTime, errors
- Logic:
  1. Gọi API cho từng symbol (hoặc batch endpoint)
  2. Đo response time
  3. Kiểm tra status code (200 = OK, khác = lỗi)
  4. Kiểm tra response có data (không rỗng)
  5. Return kết quả

### checkStockData()

So sánh dữ liệu hiện tại với snapshot trước đó, phát hiện data freeze hoặc giá trị bất thường.

- Input: `symbols: string[]` -- danh sách mã cổ phiếu
- Output: `CheckDataResult` -- anomalies found
- Logic:
  1. Lấy price hiện tại từ Redis/DB
  2. Lấy price snapshot trước đó (5 phút trước)
  3. So sánh: nếu tất cả price giống nhau → data freeze
  4. Kiểm tra giá trị bất thường: price = 0, volume < 0
  5. Return danh sách anomalies

### sendAlert()

Format message và gửi vào Slack channel.

- Input: `alert: AlertPayload` -- severity, title, details
- Output: `void`
- Logic:
  1. Format message theo Block Kit template
  2. Thêm severity emoji và timestamp
  3. Gửi qua Slack webhook
  4. Log kết quả

### runStockMonitor()

Orchestrator function -- chạy tất cả checks và gửi alert nếu cần.

- Input: none
- Output: `void`
- Logic:
  1. Gọi checkStockAPI
  2. Nếu API lỗi → sendAlert, return
  3. Gọi checkStockData
  4. Nếu có anomalies → sendAlert
  5. Log info nếu tất cả OK
```

## constants.ts

```typescript
import Env from '@ioc:Adonis/Core/Env'

/** Stock symbols to monitor */
export const MONITOR_SYMBOLS = ['VNM', 'FPT', 'VIC', 'HPG', 'VCB']

/** API configuration */
export const STOCK_API_CONFIG = {
  BASE_URL: Env.get('STOCK_API_BASE_URL', ''),
  API_KEY: Env.get('STOCK_API_KEY', ''),
  TIMEOUT_MS: 10000,
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
} as const

/** Monitoring thresholds */
export const THRESHOLDS = {
  /** Maximum acceptable API response time (ms) */
  MAX_RESPONSE_TIME_MS: 5000,

  /** Minimum time data must change (minutes). If data unchanged for this long → freeze alert */
  DATA_FREEZE_MINUTES: 30,

  /** Minimum acceptable stock price. Price below this → anomaly */
  MIN_VALID_PRICE: 1000,

  /** Alert throttle -- same alert key won't fire again within this time (ms) */
  ALERT_THROTTLE_MS: 5 * 60 * 1000,
} as const

/** Alert severity levels */
export const SEVERITY = {
  CRITICAL: 'CRITICAL',
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const
```

### Tại sao tách constants?

Giống `aiTeamService/constants.ts`:

```typescript
// app/Services/aiTeamService/constants.ts
export const AI_TEAM_CONFIG = {
  API_URL: Env.get('AI_TEAM_API_URL', ''),
  JWT_SECRET: Env.get('AI_TEAM_JWT_SECRET', ''),
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  TIMEOUT_MS: 10000,
} as const
```

**Pattern:** Config và thresholds tách riêng, dễ thay đổi mà không sửa logic.

## type.ts

```typescript
import { SEVERITY } from './constants'

/** Result of checking stock API health */
export interface CheckAPIResult {
  /** Is API responding correctly? */
  healthy: boolean
  /** Response time in ms */
  responseTimeMs: number
  /** HTTP status code (0 if no response) */
  statusCode: number
  /** Symbols that failed */
  failedSymbols: string[]
  /** Error message if any */
  error?: string
}

/** A single data anomaly */
export interface DataAnomaly {
  symbol: string
  type: 'PRICE_ZERO' | 'PRICE_NEGATIVE' | 'VOLUME_NEGATIVE' | 'DATA_FREEZE'
  message: string
  currentValue?: number
  previousValue?: number
}

/** Result of checking stock data */
export interface CheckDataResult {
  /** Were any anomalies found? */
  hasAnomalies: boolean
  /** List of anomalies */
  anomalies: DataAnomaly[]
}

/** Severity type from constants */
export type Severity = typeof SEVERITY[keyof typeof SEVERITY]

/** Payload for sending alerts */
export interface AlertPayload {
  severity: Severity
  title: string
  details: Record<string, string>
  /** Optional key for throttling (same key = throttle) */
  throttleKey?: string
}
```

### Tại sao cần types riêng?

```typescript
// Không có types: không biết function trả về gì
const result = await checkStockAPI(['VNM'])
result.???  // Không biết có field nào

// Có types: TypeScript báo lỗi khi dùng sai
const result: CheckAPIResult = await checkStockAPI(['VNM'])
result.healthy       // ✅ boolean
result.responseTimeMs // ✅ number
result.wrongField    // ❌ TypeScript error
```

## index.ts

```typescript
import { checkStockAPI } from './libs/checkStockAPI'
import { checkStockData } from './libs/checkStockData'
import { sendAlert } from './libs/sendAlert'
import { runStockMonitor } from './libs/runStockMonitor'

export const monitoringService = {
  checkStockAPI,
  checkStockData,
  sendAlert,
  runStockMonitor,
}
```

**Pattern giống các service khác:** Export 1 object chứa tất cả functions. Caller import từ index:

```typescript
import { monitoringService } from 'App/Services/monitoringService'

await monitoringService.runStockMonitor()
```

## Bài tập

1. Tạo thư mục `app/Services/monitoringService/`
2. Tạo `docs.md` với nội dung trên
3. Tạo `constants.ts` -- copy code trên, thêm env variables vào `.env`
4. Tạo `type.ts` -- copy code trên
5. Tạo `index.ts` -- export rỗng trước (sẽ thêm functions sau)
6. Chạy `yarn tsc --noEmit` để kiểm tra types

## Tiếp theo

Bắt đầu implement từng function theo thứ tự:
1. `checkStockAPI` -- đơn giản nhất, gọi API kiểm tra
2. `checkStockData` -- so sánh dữ liệu
3. `sendAlert` -- format và gửi Slack
4. `runStockMonitor` -- kết nối tất cả
