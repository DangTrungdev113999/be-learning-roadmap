# docs.md -- Tài liệu service

## Tại sao phải đọc docs.md TRƯỚC?

Khi bạn mới vào dự án FE, bạn thường làm gì? Mở code rồi đọc từ đầu. Ở BE, cách này **không hiệu quả** vì:

- Business logic phức tạp (ví dụ: giờ giao dịch khác nhau giữa HOSE, HNX, UPCOM, VNF)
- Một function có thể có 54 test cases -- bạn sẽ không hiểu hết nếu không đọc tài liệu trước
- docs.md cho bạn bức tranh tổng thể TRƯỚC KHI đi vào chi tiết code

**Quy tắc: Luôn đọc docs.md trước khi làm bất kỳ gì với service.**

---

## Ví dụ thật: dateService/docs.md

Đây là một phần nội dung thật của `app/Services/dateService/docs.md`:

```markdown
# Module: DateService

## Overview

Date utility service for trading operations. Migrated from `utils/datetime.ts`
with enhanced functionality.

## Constants

### TIMEZONE
- **Value**: `'Asia/Ho_Chi_Minh'`
- **Purpose**: Default timezone for all date operations

### TRADING_TIMES
- **Type**: `object`
- **Purpose**: Trading session times in minutes since midnight for stock exchanges
- **Values**:
  - `MORNING_START`: 540 (9:00)
  - `MORNING_START_AFTER_ATO`: 556 (9:16 - after HOSE ATO)
  - `MORNING_END`: 690 (11:30)
  - `AFTERNOON_START`: 780 (13:00)
  - `AFTERNOON_END_CONTINUOUS`: 870 (14:30)
  - `AFTERNOON_END_ATC`: 885 (14:45)
  - `AFTERNOON_END_PLO`: 900 (15:00)

## API / Functions

### isTradingTime()

- **Input**:
  - `params.date: Date` - The date to check
  - `params.exchange?: string` - Exchange name (HOSE, HNX, UPCOM, VNF). Defaults to HOSE
  - `params.code?: string` - Stock code. If provided, will lookup exchange
  - `params.includeATOATC?: boolean` - Include ATO and ATC sessions. Defaults to false
  - `params.includePLO?: boolean` - Include PLO session (14:45-15:00). Defaults to false
- **Output**: `Promise<boolean>`
- **Trading Hours by Exchange**:
  - **HOSE**: ATO 9:00-9:16, Continuous 9:16-11:30 & 13:00-14:30, ATC 14:30-14:45
  - **HNX**: Continuous 9:00-11:30 & 13:00-14:30, ATC 14:30-14:45, PLO 14:45-15:00
  - **UPCOM**: Continuous 9:00-11:30 & 13:00-15:00 (no ATO/ATC/PLO)
  - **VNF**: ATO 8:45-9:00, Continuous 9:00-11:30 & 13:00-14:30, ATC 14:30-14:45
- **Logic**:
  1. If `code` is provided and `exchange` is not, lookup exchange from Redis
  2. Default to HOSE if no exchange found
  3. Check if weekend (Saturday/Sunday) -> return false
  4. Convert time to minutes since midnight
  5. Determine morning/afternoon session based on exchange
  6. Return true if in any session

## Dependencies

### Internal
- `Redis/index` - For `models.overviewStock.getOne()` in `isTradingTime`

### External
- `moment-timezone` - Date/time manipulation with timezone support
```

Nhận xét:
- **Input/Output** rõ ràng -- bạn biết function nhận gì, trả gì
- **Logic** viết từng bước -- bạn hiểu flow trước khi đọc code
- **Trading Hours** là domain knowledge -- không đọc tài liệu thì không biết
- **Dependencies** cho bạn biết service này dùng gì

---

## Ví dụ: countService/docs.md

```markdown
# Module: CountService

## Overview

Service for managing counters in MongoDB and converting numbers to encoded
alphanumeric codes. Used for generating sequential IDs and codes.

## API / Functions

### takeNumber()
- **Input**: `key: string`, `increment?: number` (default: 1, must be > 0)
- **Output**: `Promise<number>` - The new counter value after increment
- **Logic**:
  1. Validates that increment is greater than 0
  2. Uses MongoDB `findOneAndUpdate` with `$inc` to atomically increment
  3. Creates the counter document if it doesn't exist (upsert: true)
  4. Returns the new counter value or 0 if not found

### takeCode()
- **Input**: `key: string`, `increment?: number`
- **Output**: `Promise<string>` - Encoded string code
- **Logic**:
  1. Atomically increment counter in MongoDB
  2. Converts the counter value to encoded code using `numberToCode()`
  3. Returns the encoded code

### numberToCode()
- **Input**: `number: number`
- **Output**: `string` - Encoded string
- **Logic**:
  1. Converts number to base64-like encoding using SEED character set
  2. Uses modulo 64 to get character index
  3. Returns the encoded string

## Notes
- Counters are stored in `counts` collection: `{ key: string, value: number }`
- All counter operations are atomic using MongoDB's `findOneAndUpdate`
```

So sánh với dateService:
- countService đơn giản hơn -- 4 functions, logic ngắn gọn
- dateService phức tạp hơn -- có domain knowledge (giờ giao dịch), nhiều nhánh logic
- Nhưng **format docs.md giống nhau**: Overview -> API/Functions -> Dependencies -> Notes

---

## Ví dụ: banService/docs.md

```markdown
# Module: BanService

## Overview

BanService manages user and IP address bans using an in-memory cache (NodeCache)
and persistent storage in MongoDB.

## API / Functions

### isBanned()
- **Input**: `key: string` - The key to check (IP address or user ID)
- **Output**: `Promise<boolean>`
- **Logic**:
  1. Check if `disableBanMiddleware` flag is enabled in systemConfig
  2. If enabled, return false (ban check is disabled)
  3. Otherwise, check if the key exists in the in-memory cache (NodeCache)
  4. Return true if found, false otherwise

### addBanLog()
- **Input**: `key: string, ttlSeconds: number`
- **Output**: `Promise<void>`
- **Logic**:
  1. Validate that key is provided
  2. Check if active ban log already exists (expiration > now)
  3. If exists, update expiration date
  4. If not, create new ban log
  5. Emit 'ban.setBanned' event to update in-memory cache

### loadBannedMap()
- **Input**: None
- **Output**: `Promise<void>`
- **Logic**:
  1. Query MongoDB for all ban logs with expiration > now
  2. For each log, calculate remaining TTL
  3. Add each key to in-memory cache with calculated TTL

### clearOldLogs()
- **Input**: None
- **Output**: `Promise<void>`
- **Logic**:
  1. Query MongoDB for ban logs older than 3 months
  2. Delete all matching logs

## Notes
- Uses NodeCache for fast in-memory lookups
- Ban logs are persisted in MongoDB (banLogs collection)
- Event listener 'ban.setBanned' updates cache when new bans are added
```

Điểm đặc biệt của banService: dùng **2 tầng lưu trữ** (in-memory cache + MongoDB). Nếu không đọc docs.md trước, bạn sẽ thắc mắc tại sao code check cache thay vì query database.

---

## Cách tra cứu nhanh bằng grep

Khi bạn chỉ cần xem 1 function cụ thể, không cần đọc toàn bộ docs.md:

```bash
# Tìm thông tin function isTradingTime
grep '### isTradingTime()' -A 15 app/Services/dateService/docs.md

# Tìm thông tin function takeCode
grep '### takeCode()' -A 15 app/Services/countService/docs.md

# Tìm thông tin function isBanned
grep '### isBanned()' -A 15 app/Services/banService/docs.md
```

`-A 15` nghĩa là hiển thị 15 dòng SAU dòng match. Thường đủ để thấy Input, Output và Logic.

---

## Template khi bạn cần viết docs.md

Khi tạo service mới hoặc thêm function mới, dùng template này:

```markdown
# Module: {ServiceName}

## Overview

{Mô tả ngắn gọn service làm gì, dùng cho mục đích gì}

## Constants

### {CONSTANT_NAME}
- **Value**: `{value}`
- **Purpose**: {Mô tả mục đích}

## API / Functions

### {functionName}()

- **Input**:
  - `{paramName}: {type}` - {Mô tả}
  - `{paramName}?: {type}` - {Mô tả} (optional, default: {value})
- **Output**: `{returnType}`
- **Logic**:
  1. {Bước 1}
  2. {Bước 2}
  3. {Bước 3}
- **Example**:
  ```typescript
  const result = await serviceName.functionName({ param1: 'value' })
  ```

## Dependencies

### Internal
- `{ModulePath}` - {Mô tả dùng cho gì}

### External
- `{packageName}` - {Mô tả}

## Notes

- {Ghi chú quan trọng 1}
- {Ghi chú quan trọng 2}
```

---

## Tổng kết

```
docs.md = bản đồ của service

1. Đọc docs.md TRƯỚC -- hiểu bức tranh tổng thể
2. Tra cứu nhanh bằng grep -- tìm function cụ thể
3. Viết docs.md khi tạo/sửa -- cập nhật tài liệu
```

docs.md không phải tài liệu "cho đẹp". Nó là công cụ làm việc hàng ngày. Team dùng grep để tra cứu, AI dùng để hiểu context, người mới dùng để onboard.
