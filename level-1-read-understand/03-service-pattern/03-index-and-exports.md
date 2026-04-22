# index.ts -- Export service

## index.ts làm gì?

`index.ts` là **entry point** của service. Nó làm 2 việc:

1. Import các function từ `libs/`
2. Export chúng thành **1 object duy nhất**

Tất cả code bên ngoài service chỉ tương tác qua object này.

---

## Ví dụ thật: dateService/index.ts

```typescript
export * from './type'
export * from './constants'

import { isTradingTime } from './libs/isTradingTime'
import { getTradingDatesByT } from './libs/getTradingDatesByT'
import { isTimeInRange } from './libs/isTimeInRange'

/**
 * DateService - Date utility functions for trading
 * @example
 * import { dateService } from 'App/Services/dateService'
 * await dateService.isTradingTime({ date: new Date(), code: 'VNM' })
 * dateService.getTradingDatesByT({ t: 5 })
 * dateService.isTimeInRange({ timeRange: { start: '09:00', end: '11:30' }, currentTime: moment() })
 */
export const dateService = {
  isTradingTime,
  getTradingDatesByT,
  isTimeInRange,
}
```

Phân tích:

| Dòng | Giải thích |
|------|------------|
| `export * from './type'` | Re-export types để bên ngoài có thể import `IsTradingTimeParams`, `TimeRange`, etc. |
| `export * from './constants'` | Re-export constants để bên ngoài có thể import `TIMEZONE`, `TRADING_TIMES`, etc. |
| `import { isTradingTime } from './libs/isTradingTime'` | Import từng function từ file riêng trong `libs/` |
| `export const dateService = { ... }` | Gom tất cả function thành 1 object để export |

---

## Ví dụ: countService/index.ts

```typescript
export * from './type'
export * from './constants'

import { takeNumber } from './libs/takeNumber'
import { takeCode } from './libs/takeCode'
import { numberToCode } from './libs/numberToCode'
import { reset } from './libs/reset'

/**
 * CountService - Counter and code generation service
 *
 * @example
 * import { countService } from 'App/Services/countService'
 *
 * const count = await countService.takeNumber('user_id_counter')
 * const code = await countService.takeCode('order_code_counter')
 * const encoded = countService.numberToCode(123)
 * await countService.reset('user_id_counter')
 */
export const countService = {
  takeNumber,
  takeCode,
  numberToCode,
  reset,
}
```

---

## Ví dụ: banService/index.ts

```typescript
export * from './type'
export * from './constants'

import { eventService } from 'App/Services/eventService'
import { isBanned } from './libs/isBanned'
import { addBanLog } from './libs/addBanLog'
import { loadBannedMap } from './libs/loadBannedMap'
import { clearOldLogs } from './libs/clearOldLogs'
import { map } from './libs/shared'
import type { BanSetBannedEvent } from './type'

export const banService = {
  isBanned,
  addBanLog,
  loadBannedMap,
  clearOldLogs,
}

// Setup event listener for cache synchronization
eventService.on('ban.setBanned', (data: BanSetBannedEvent) => {
  map.set(data.key, true, data.ttlSeconds)
})
```

Điểm đặc biệt: banService có thêm **event listener** ngay trong index.ts. Khi file này được import lần đầu, event listener sẽ được đăng ký. Đây là pattern thường gặp cho các service cần "lắng nghe" sự kiện.

---

## Cách import service: ĐÚNG và SAI

### ĐÚNG -- Import từ entry point

```typescript
import { dateService } from 'App/Services/dateService'
import { countService } from 'App/Services/countService'
import { banService } from 'App/Services/banService'

// Sử dụng
await dateService.isTradingTime({ date: new Date(), exchange: 'HOSE' })
const count = await countService.takeNumber('order_counter')
const isBanned = await banService.isBanned('192.168.1.1')
```

### SAI -- Import trực tiếp từ libs

```typescript
// KHÔNG làm thế này!
import { isTradingTime } from 'App/Services/dateService/libs/isTradingTime'
import { takeNumber } from 'App/Services/countService/libs/takeNumber'
```

### Tại sao?

1. **Nhất quán**: Tất cả function gọi qua `serviceName.functionName()` -- dễ trace, dễ debug
2. **Encapsulation**: index.ts kiểm soát những gì được expose ra ngoài
3. **Refactor an toàn**: Nếu đổi tên file trong libs/, chỉ cần sửa index.ts, không ảnh hưởng code bên ngoài
4. **Autocomplete**: Gõ `dateService.` là IDE sẽ gợi ý tất cả function có sẵn

### Ngoại lệ: Import types và constants

Types và constants **được phép** import trực tiếp vì chúng được re-export:

```typescript
// Đều ĐÚNG vì index.ts đã re-export
import { dateService, TIMEZONE, TRADING_TIMES } from 'App/Services/dateService'
import type { IsTradingTimeParams } from 'App/Services/dateService'
```

---

## Cách thêm function mới vào service có sẵn

Giả sử bạn cần thêm function `isWeekend()` vào dateService:

### Bước 1: Tạo file function

```typescript
// app/Services/dateService/libs/isWeekend.ts
import moment from 'moment-timezone'
import { TIMEZONE } from '../constants'

/**
 * Check if the given date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = moment(date).tz(TIMEZONE).day()
  return day === 0 || day === 6
}
```

### Bước 2: Tạo file test

```typescript
// app/Services/dateService/libs/isWeekend.spec.ts
import { test } from '@japa/runner'
import { isWeekend } from './isWeekend'

test.group('isWeekend', () => {
  test('should return true on Saturday', async ({ assert }) => {
    const saturday = new Date('2024-12-14T10:00:00+07:00')
    assert.isTrue(isWeekend(saturday))
  })

  test('should return false on Monday', async ({ assert }) => {
    const monday = new Date('2024-12-16T10:00:00+07:00')
    assert.isFalse(isWeekend(monday))
  })
})
```

### Bước 3: Cập nhật index.ts

```typescript
// app/Services/dateService/index.ts
export * from './type'
export * from './constants'

import { isTradingTime } from './libs/isTradingTime'
import { getTradingDatesByT } from './libs/getTradingDatesByT'
import { isTimeInRange } from './libs/isTimeInRange'
import { isWeekend } from './libs/isWeekend'    // <-- Thêm dòng này

export const dateService = {
  isTradingTime,
  getTradingDatesByT,
  isTimeInRange,
  isWeekend,    // <-- Thêm dòng này
}
```

### Bước 4: Cập nhật docs.md

Thêm section mới vào `docs.md` với format chuẩn (Input, Output, Logic).

---

## Path alias

Dự án dùng path alias (cấu hình trong tsconfig.json) để import ngắn gọn:

| Alias | Trỏ đến |
|-------|---------|
| `App` | `app/` |
| `Services` | `services/` |
| `Mongo` | `mongo/` |
| `Redis` | `redis/` |
| `Utils` | `utils/` |
| `Config` | `config/` |

Nên bạn viết `'App/Services/dateService'` thay vì `'../../Services/dateService'`.

---

## Tổng kết

```
index.ts = cửa trước của service

- Import function từ libs/ -> export thành 1 object
- Bên ngoài chỉ import từ entry point, KHÔNG import từ libs/
- Thêm function mới: tạo file + test -> cập nhật index.ts -> cập nhật docs.md
```
