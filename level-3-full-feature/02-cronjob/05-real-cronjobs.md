# Cronjobs thật trong dự án logics

## Mục tiêu

Đọc hiểu tất cả cronjobs thật trong `start/cronjob.ts`, giải thích mục đích và thời điểm chạy của từng cái.

---

## 1. File start/cronjob.ts đầy đủ

```typescript
// start/cronjob.ts
import { portfolioService } from 'App/Services/portfolioService'
import { qnaService } from 'App/Services/qnaService'
import { userService } from 'App/Services/userService'
import { cronjobAdd } from 'Utils/cronjob'

const main = async () => {
  if (process.env.LOCAL === '1' || process.env.NODE_ENV === 'test') {
    // Skip cronjob in local and test
    return
  }

  // Release T+ volume at 11:30 every day
  cronjobAdd('dailyReleaseBuyVolume', '4 30 11 * * *', async () => {
    await portfolioService.dailyReleaseBuyVolume()
  })

  // Run at 9h05 and 20h05 every day
  cronjobAdd('remindExpertAnswerQuestion', '0 5 9,20 * * *', async () => {
    await qnaService.remindExpertAnswerQuestion()
  })

  cronjobAdd('removeReversedFlagFn', '46 0 0 * * *', async () => {
    await userService.removeReversedFlagFn()
  })

  cronjobAdd('syncTpslToRedis', '10 15 8,12 * * *', async () => {
    await portfolioService.syncTpslToRedis()
  })

  cronjobAdd('syncLimitOrdersToRedis', '10 16 8,12 * * *', async () => {
    await portfolioService.syncLimitOrdersToRedis()
  })
}

main().catch(console.error)
```

---

## 2. Giải thích từng cronjob

### 1. dailyReleaseBuyVolume

```typescript
cronjobAdd('dailyReleaseBuyVolume', '4 30 11 * * *', async () => {
  await portfolioService.dailyReleaseBuyVolume()
})
```

| Thuộc tính | Giá trị |
|---|---|
| Key | `dailyReleaseBuyVolume` |
| Expression | `4 30 11 * * *` |
| Chạy lúc | **11:30:04** mỗi ngày |
| Service | `portfolioService` |
| Chức năng | Release khối lượng mua T+ |

**Giải thích nghiệp vụ:**

Khi mua cổ phiếu ở Việt Nam, có quy tắc T+2 (mua hôm nay, 2 ngày sau mới sở hữu thật). Trong thời gian chờ, khối lượng mua bị "khóa". Cronjob này release (mở khóa) những khối lượng đã đến hạn.

**Tại sao 11:30?** Phiên sáng kết thúc lúc 11:30. Release lúc này để data sẵn sàng cho phiên chiều (13:00).

**Tại sao giây = 4?** Delay 4 giây tránh chạy đúng giây 0 (thời điểm nhiều jobs khác cũng trigger).

---

### 2. remindExpertAnswerQuestion

```typescript
cronjobAdd('remindExpertAnswerQuestion', '0 5 9,20 * * *', async () => {
  await qnaService.remindExpertAnswerQuestion()
})
```

| Thuộc tính | Giá trị |
|---|---|
| Key | `remindExpertAnswerQuestion` |
| Expression | `0 5 9,20 * * *` |
| Chạy lúc | **9:05:00** và **20:05:00** mỗi ngày |
| Service | `qnaService` |
| Chức năng | Nhắc expert trả lời câu hỏi |

**Giải thích nghiệp vụ:**

Trong tính năng Q&A, user đặt câu hỏi cho expert. Nếu expert chưa trả lời, hệ thống nhắc 2 lần/ngày:
- **9:05 sáng** -- đầu ngày làm việc
- **20:05 tối** -- buổi tối (expert có thể rảnh)

**Tại sao `9,20` mà không dùng 2 cronjobs riêng?** Cron expression hỗ trợ liệt kê giờ bằng dấu phẩy, gọn hơn.

---

### 3. removeReversedFlagFn

```typescript
cronjobAdd('removeReversedFlagFn', '46 0 0 * * *', async () => {
  await userService.removeReversedFlagFn()
})
```

| Thuộc tính | Giá trị |
|---|---|
| Key | `removeReversedFlagFn` |
| Expression | `46 0 0 * * *` |
| Chạy lúc | **00:00:46** mỗi đêm |
| Service | `userService` |
| Chức năng | Xóa cờ "reversed" trên user |

**Giải thích nghiệp vụ:**

Flag "reversed" đánh dấu user có trạng thái đặc biệt cần được xử lý. Sau khi xử lý xong (qua ngày mới), flag được reset.

**Tại sao nửa đêm?** Đầu ngày mới, reset trạng thái cho ngày mới.

**Tại sao giây = 46?** Tránh trùng với các cronjobs khác cũng chạy lúc 0h. Mỗi cronjob dùng giây khác nhau (0, 4, 10, 46) để phân tán tải.

---

### 4. syncTpslToRedis

```typescript
cronjobAdd('syncTpslToRedis', '10 15 8,12 * * *', async () => {
  await portfolioService.syncTpslToRedis()
})
```

| Thuộc tính | Giá trị |
|---|---|
| Key | `syncTpslToRedis` |
| Expression | `10 15 8,12 * * *` |
| Chạy lúc | **8:15:10** và **12:15:10** mỗi ngày |
| Service | `portfolioService` |
| Chức năng | Sync dữ liệu Take Profit / Stop Loss vào Redis |

**Giải thích nghiệp vụ:**

TPSL (Take Profit / Stop Loss) là lệnh tự động bán khi giá đạt mức mục tiêu (take profit) hoặc giảm quá mức chịu (stop loss). Data TPSL lưu trong MongoDB nhưng cần cache vào Redis để tra cứu nhanh khi giá thay đổi.

**Tại sao 8:15 và 12:15?**
- **8:15** -- trước phiên sáng (9:00): chuẩn bị data TPSL cho phiên sáng
- **12:15** -- trước phiên chiều (13:00): refresh data TPSL cho phiên chiều

**Tại sao giây = 10?** Delay 10 giây, cùng lý do phân tán tải.

---

### 5. syncLimitOrdersToRedis

```typescript
cronjobAdd('syncLimitOrdersToRedis', '10 16 8,12 * * *', async () => {
  await portfolioService.syncLimitOrdersToRedis()
})
```

| Thuộc tính | Giá trị |
|---|---|
| Key | `syncLimitOrdersToRedis` |
| Expression | `10 16 8,12 * * *` |
| Chạy lúc | **8:16:10** và **12:16:10** mỗi ngày |
| Service | `portfolioService` |
| Chức năng | Sync lệnh giới hạn (limit orders) vào Redis |

**Giải thích nghiệp vụ:**

Limit orders là lệnh đặt sẵn: "Mua VNM khi giá xuống 80.000". Data này cần nằm trong Redis để matching nhanh khi giá thay đổi.

**Tại sao 8:16 và 12:16?** Chạy 1 phút sau `syncTpslToRedis` (8:15 và 12:15). Tránh 2 jobs sync đồng thời, giảm tải Redis.

---

## 3. Timeline tổng hợp trong ngày

```
00:00:46  removeReversedFlagFn          ← Reset flag đầu ngày
   │
   ▼
08:15:10  syncTpslToRedis               ← Chuẩn bị TPSL cho phiên sáng
08:16:10  syncLimitOrdersToRedis        ← Chuẩn bị limit orders
   │
   ▼
09:00     ═══ SÀN MỞ CỬA ═══
   │
09:05:00  remindExpertAnswerQuestion    ← Nhắc expert (sáng)
   │
   ▼
11:30     ═══ KẾT THÚC PHIÊN SÁNG ═══
11:30:04  dailyReleaseBuyVolume         ← Release T+ volume
   │
   ▼
12:15:10  syncTpslToRedis               ← Refresh TPSL cho phiên chiều
12:16:10  syncLimitOrdersToRedis        ← Refresh limit orders
   │
   ▼
13:00     ═══ SÀN MỞ CỬA (CHIỀU) ═══
   │
   ▼
14:30     ═══ SÀN ĐÓNG CỬA ═══
   │
   ▼
20:05:00  remindExpertAnswerQuestion    ← Nhắc expert (tối)
   │
   ▼
(lặp lại ngày hôm sau)
```

---

## 4. Patterns đáng chú ý

### Pattern 1: Giây phân tán

```
dailyReleaseBuyVolume:       giây 4
removeReversedFlagFn:        giây 46
syncTpslToRedis:             giây 10
syncLimitOrdersToRedis:      giây 10
remindExpertAnswerQuestion:  giây 0
```

Không có 2 cronjobs nào chạy cùng giây + phút + giờ. Giảm peak load trên server.

### Pattern 2: Cặp sync trước phiên

```
syncTpslToRedis:             8:15 và 12:15
syncLimitOrdersToRedis:      8:16 và 12:16
```

Luôn sync trước khi sàn mở cửa. Chạy cách nhau 1 phút để Redis không bị overload.

### Pattern 3: Skip local và test

```typescript
if (process.env.LOCAL === '1' || process.env.NODE_ENV === 'test') {
  return   // Không chạy cronjob
}
```

Dev local không cần cronjob (tránh trigger nhầm). Test cũng không cần (test unit function riêng).

### Pattern 4: Handler đơn giản

```typescript
// Mỗi handler chỉ gọi 1 method duy nhất
cronjobAdd('key', 'expr', async () => {
  await someService.someMethod()
})
```

Không có logic phức tạp trong handler. Tất cả logic nằm trong service method. Cronjob chỉ là "lịch chạy".

---

## 5. Thêm cronjob mới

Khi cần thêm cronjob:

```typescript
// start/cronjob.ts

// 1. Import service
import { newService } from 'App/Services/newService'

// 2. Thêm cronjobAdd
cronjobAdd('myNewJob', '0 0 3 * * *', async () => {
  await newService.doSomething()
})
```

Checklist:
- [ ] Key duy nhất (không trùng key nào trong file)
- [ ] Expression đúng 6 trường
- [ ] Giây không trùng với cronjob cùng giờ:phút
- [ ] Handler là async function
- [ ] Logic nằm trong service, không viết trong handler
- [ ] Test service method riêng (không cần test cronjob)

---

## Tóm tắt

| Cronjob | Giờ chạy | Mục đích |
|---|---|---|
| dailyReleaseBuyVolume | 11:30:04 | Release khối lượng T+ sau phiên sáng |
| remindExpertAnswerQuestion | 9:05, 20:05 | Nhắc expert trả lời câu hỏi |
| removeReversedFlagFn | 00:00:46 | Reset flag user đầu ngày |
| syncTpslToRedis | 8:15, 12:15 | Sync TP/SL vào Redis trước phiên |
| syncLimitOrdersToRedis | 8:16, 12:16 | Sync limit orders vào Redis trước phiên |
