# Cấu trúc 1 Service

## So sánh với FE trước

Ở FE, bạn có thể quen với cấu trúc custom hook:

```
hooks/
  useAuth/
    useAuth.ts
    useAuth.test.ts
    types.ts
```

Ở BE (dự án logics), mỗi service giống như một custom hook folder -- nhưng **bắt buộc** phải theo đúng cấu trúc này:

```
app/Services/{ServiceName}/
├── docs.md          # Tài liệu -- đọc TRƯỚC KHI làm bất kỳ gì
├── index.ts         # Entry point -- nơi export service ra ngoài
├── constants.ts     # Các hằng số
├── type.ts          # TypeScript types/interfaces
└── libs/            # Thư mục chứa các function
    ├── functionA.ts
    ├── functionA.spec.ts    # Test cho functionA
    ├── functionB.ts
    └── functionB.spec.ts    # Test cho functionB
```

---

## Ví dụ thật: dateService

Đây là cấu trúc thật của `dateService` trong dự án:

```
app/Services/dateService/
├── docs.md                          # Mô tả isTradingTime, getTradingDatesByT, isTimeInRange
├── index.ts                         # export const dateService = { isTradingTime, getTradingDatesByT, isTimeInRange }
├── constants.ts                     # TIMEZONE, TRADING_TIMES, DERIVATIVE_TRADING_TIMES, CALENDAR_DATA
├── type.ts                          # IsTradingTimeParams, GetTradingDatesByTParams, TimeRange, IsTimeInRangeParams
└── libs/
    ├── isTradingTime.ts             # Check giờ giao dịch theo sàn (HOSE, HNX, UPCOM, VNF)
    ├── isTradingTime.spec.ts        # 54 test cases cover mọi trường hợp
    ├── getTradingDatesByT.ts        # Lấy ngày giao dịch T+n / T-n
    ├── getTradingDatesByT.spec.ts
    ├── isTimeInRange.ts             # Check thời gian nằm trong khoảng (hỗ trợ qua đêm)
    └── isTimeInRange.spec.ts
```

### Giải thích từng file

| File | Vai trò | Ví dụ trong dateService |
|------|---------|------------------------|
| `docs.md` | Tài liệu đầu tiên cần đọc. Mô tả input/output/logic của mỗi function | Mô tả chi tiết giờ giao dịch HOSE 9:00-14:45, HNX 9:00-15:00, etc. |
| `index.ts` | Entry point. Import các function từ `libs/` và export thành 1 object | `export const dateService = { isTradingTime, getTradingDatesByT, isTimeInRange }` |
| `constants.ts` | Các hằng số dùng chung trong service | `TIMEZONE = 'Asia/Ho_Chi_Minh'`, `TRADING_TIMES = { MORNING_START: 540 }` |
| `type.ts` | Định nghĩa TypeScript types | `IsTradingTimeParams`, `TimeRange`, `IsTimeInRangeParams` |
| `libs/` | Mỗi function = 1 file riêng + 1 file test | `isTradingTime.ts` + `isTradingTime.spec.ts` |

---

## Ví dụ thứ hai: countService

```
app/Services/countService/
├── docs.md          # Mô tả takeNumber, takeCode, numberToCode, reset
├── index.ts         # export const countService = { takeNumber, takeCode, numberToCode, reset }
├── constants.ts     # SEED (64 ký tự dùng cho encoding)
├── type.ts          # Types cho counter
└── libs/
    ├── takeNumber.ts        # Atomic counter trong MongoDB
    ├── takeNumber.spec.ts
    ├── takeCode.ts          # Counter + encode thành mã alphanumeric
    ├── takeCode.spec.ts
    ├── numberToCode.ts      # Chuyển số thành mã base64-like
    ├── numberToCode.spec.ts
    ├── reset.ts             # Reset counter về 0
    └── reset.spec.ts
```

countService đơn giản hơn dateService -- chỉ 4 function, không có business logic phức tạp. Nhưng cấu trúc folder **hoàn toàn giống nhau**.

---

## Quy tắc đặt tên

### Folders: PascalCase

```
app/Services/dateService/        # tên service là camelCase
app/Services/countService/
app/Services/banService/
app/Controllers/Http/            # folders khác là PascalCase
```

> Lưu ý: Tên thư mục service là camelCase (dateService, countService), nhưng tên folder cấp trên (Services, Controllers) là PascalCase.

### Files: camelCase cho function, PascalCase cho class

```
libs/
  isTradingTime.ts          # function file -> camelCase
  isTradingTime.spec.ts     # test file -> camelCase + .spec.ts
  getTradingDatesByT.ts     # function file -> camelCase
```

### Constants: UPPER_SNAKE_CASE

```typescript
// constants.ts
export const TIMEZONE = 'Asia/Ho_Chi_Minh'

export const TRADING_TIMES = {
  MORNING_START: 540,           // 9:00 = 9 * 60 = 540 phút
  MORNING_START_AFTER_ATO: 556, // 9:16
  MORNING_END: 690,             // 11:30
  AFTERNOON_START: 780,         // 13:00
  AFTERNOON_END_CONTINUOUS: 870,// 14:30
  AFTERNOON_END_ATC: 885,      // 14:45
  AFTERNOON_END_PLO: 900,      // 15:00
  AFTERNOON_END_UPCOM: 900,    // 15:00
} as const
```

### Functions: camelCase

```typescript
export async function isTradingTime(params: IsTradingTimeParams): Promise<boolean> { ... }
export function getTradingDatesByT(params: GetTradingDatesByTParams): moment.Moment[] { ... }
export function numberToCode(number: number): string { ... }
```

---

## Quy tắc quan trọng: 1 function = 1 file + 1 test file

Ở FE, bạn có thể viết nhiều function trong 1 file. Ở BE, **mỗi function phải nằm trong file riêng** và có **file test riêng**:

```
# ĐÚNG
libs/
  isTradingTime.ts           # 1 function
  isTradingTime.spec.ts      # test cho function đó
  isTimeInRange.ts           # 1 function khác
  isTimeInRange.spec.ts      # test riêng

# SAI -- không làm thế này
libs/
  tradingUtils.ts            # nhiều function trong 1 file
  tradingUtils.spec.ts       # test chung cho tất cả
```

Lý do:
- Dễ tìm code: cần function nào thì mở file đó
- Dễ review: PR chỉ thay đổi 1 file = dễ hiểu thay đổi gì
- Dễ test: chạy test 1 function không ảnh hưởng function khác
- Dễ xóa: function không dùng nữa thì xóa 1 file, không sợ ảnh hưởng

---

## File nào không bắt buộc?

| File | Bắt buộc? | Ghi chú |
|------|-----------|---------|
| `docs.md` | **Có** | Luôn luôn phải có |
| `index.ts` | **Có** | Entry point bắt buộc |
| `libs/` | **Có** | Nơi chứa code |
| `constants.ts` | Không | Chỉ cần khi có hằng số |
| `type.ts` | Không | Chỉ cần khi có type riêng |

---

## Tổng kết

```
1 Service = 1 folder có cấu trúc chuẩn
          = docs.md (đọc trước) + index.ts (export) + libs/ (code + test)
```

Giống như FE có convention cho component folder, BE có convention cho service folder. Sự khác biệt lớn nhất: **test là bắt buộc**, không phải optional.
