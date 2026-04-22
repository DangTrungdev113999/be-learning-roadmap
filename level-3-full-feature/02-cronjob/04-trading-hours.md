# Lịch giao dịch và Cron cho giờ GD

## Mục tiêu

Hiểu lịch giao dịch chứng khoán Việt Nam (HOSE, HNX, UPCOM, Phái sinh), cách viết cron expression cho giờ GD, và xử lý các trường hợp đặc biệt.

---

## 1. Lịch giao dịch chứng khoán Việt Nam

### HOSE (Sở Giao dịch TP.HCM)

```
┌─────────────────────────────────────────────────────────┐
│                    HOSE - Thứ 2 đến Thứ 6              │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│  9:00    │  9:15    │ 11:30   │ 13:00   │ 14:30  15:00│
│  ATO     │  Liên    │ Nghỉ    │ Liên    │ ATC   Đóng  │
│  (mở cửa)│  tục     │ trưa    │ tục     │ (đóng cửa)  │
├──────────┴──────────┴──────────┴──────────┴─────────────┤
│  9:00-9:15: Khớp lệnh định kỳ mở cửa (ATO)            │
│  9:15-11:30: Khớp lệnh liên tục (Phiên sáng)           │
│  11:30-13:00: Nghỉ trưa                                 │
│  13:00-14:30: Khớp lệnh liên tục (Phiên chiều)         │
│  14:30-14:45: Khớp lệnh định kỳ đóng cửa (ATC)        │
└─────────────────────────────────────────────────────────┘
```

### HNX (Sở Giao dịch Hà Nội)

```
┌─────────────────────────────────────────────────────────┐
│                    HNX - Thứ 2 đến Thứ 6               │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│  9:00    │  9:15    │ 11:30   │ 13:00   │ 14:30  15:00│
│  Định kỳ │  Liên    │ Nghỉ    │ Liên    │ Đóng cửa    │
│          │  tục     │ trưa    │ tục     │              │
└─────────────────────────────────────────────────────────┘
```

### UPCOM

```
Giống HNX nhưng không có phiên ATO/ATC
9:00-11:30: Liên tục (sáng)
13:00-15:00: Liên tục (chiều)
```

### Phái sinh (Derivatives)

```
┌─────────────────────────────────────────────────────────┐
│                Phái sinh - Thứ 2 đến Thứ 6             │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│  8:45    │  9:00    │ 11:30   │ 13:00   │ 14:45  15:00│
│  ATO     │  Liên    │ Nghỉ    │ Liên    │ ATC   Đóng  │
│          │  tục     │ trưa    │ tục     │              │
└─────────────────────────────────────────────────────────┘

Phái sinh mở sớm hơn (8:45) và đóng muộn hơn (15:00)
```

---

## 2. Các khung giờ quan trọng

| Sự kiện | Giờ | Ý nghĩa |
|---|---|---|
| Trước phiên sáng | 8:00-8:59 | Chuẩn bị data, sync cache |
| Mở cửa | 9:00 | Bắt đầu giao dịch |
| Nghỉ trưa bắt đầu | 11:30 | Kết thúc phiên sáng |
| Nghỉ trưa kết thúc | 13:00 | Bắt đầu phiên chiều |
| Đóng cửa | 14:30-15:00 | Kết thúc giao dịch |
| Sau phiên | 15:00+ | Tính toán, báo cáo, release |
| Nửa đêm | 00:00 | Dọn dẹp, reset flag |

---

## 3. Cron expressions cho giờ giao dịch

### Chạy trước giờ giao dịch (chuẩn bị)

```
0  15  8  *  *  1-5
↑  ↑   ↑           ↑
│  │   8 giờ       Thứ 2-6

→ 8:15 sáng, ngày làm việc
→ Sync data trước khi sàn mở cửa
```

Code thật:

```typescript
// Sync take-profit/stop-loss vào Redis trước giờ GD
cronjobAdd('syncTpslToRedis', '10 15 8,12 * * *', async () => {
  await portfolioService.syncTpslToRedis()
})
```

`8,12` = chạy lúc 8:15 (trước phiên sáng) và 12:15 (trước phiên chiều).

### Chạy trong giờ giao dịch

```
// Mỗi phút trong phiên sáng (9:00-11:30) + phiên chiều (13:00-15:00)
// Cần 2 cronjobs riêng vì có khoảng nghỉ trưa

// Phiên sáng
0  *  9-11  *  *  1-5

// Phiên chiều
0  *  13-14  *  *  1-5
```

### Chạy sau khi đóng cửa

```
// Sau HOSE đóng (sau 14:45)
0  0  15  *  *  1-5

→ 15:00, thứ 2-6
→ Tính toán lãi/lỗ cuối ngày
```

### Chạy giữa phiên (tránh nghỉ trưa)

```
// ❌ Sai: Chạy mỗi giờ từ 9-15 → sẽ chạy lúc 12h (nghỉ trưa)
0  0  9-15  *  *  1-5

// ✅ Đúng: Chỉ giờ có GD
0  0  9,10,11,13,14  *  *  1-5
```

### Release buy volume sau phiên sáng

```typescript
// Code thật: chạy lúc 11:30 (kết thúc phiên sáng)
cronjobAdd('dailyReleaseBuyVolume', '4 30 11 * * *', async () => {
  await portfolioService.dailyReleaseBuyVolume()
})
```

`11:30` là thời điểm phiên sáng kết thúc -- lý tưởng để release khối lượng mua T+.

---

## 4. Skip thứ 7 và Chủ nhật

Sàn chứng khoán **không giao dịch** vào T7 và CN.

```
// Ngày trong tuần:
// 0 = Chủ nhật
// 1 = Thứ Hai
// 2 = Thứ Ba
// 3 = Thứ Tư
// 4 = Thứ Năm
// 5 = Thứ Sáu
// 6 = Thứ Bảy

// Chỉ ngày làm việc:
0  0  9  *  *  1-5
                ↑
                Thứ 2 đến thứ 6
```

**Lưu ý:** Các cronjob trong logics hiện dùng `* * *` (mọi ngày) thay vì `1-5`. Lý do: handler tự kiểm tra có phải ngày GD không (tính cả ngày lễ mà cron không biết).

```typescript
// Cách xử lý ngày lễ trong handler (không phải trong cron):
async function dailyReleaseBuyVolume() {
  const isTradeDay = await isTradingDay(new Date())
  if (!isTradeDay) return   // Ngày lễ, T7, CN → bỏ qua
  // ... logic thật
}
```

---

## 5. Skip nghỉ trưa

Nếu cần cronjob chạy liên tục trong giờ GD nhưng **nghỉ** lúc 11:30-13:00:

```
// Cách 1: Liệt kê giờ cụ thể
0  */5  9,10,11,13,14  *  *  1-5
        ↑
        Mỗi 5 phút lúc 9h, 10h, 11h, 13h, 14h
        (bỏ 12h = nghỉ trưa)

// Cách 2: 2 cronjobs riêng
cronjobAdd('morning', '0 */5 9-11 * * 1-5', handler)    // Phiên sáng
cronjobAdd('afternoon', '0 */5 13-14 * * 1-5', handler)  // Phiên chiều
```

---

## 6. Bảng tham chiếu nhanh

### Cron expressions cho chứng khoán

| Mục đích | Expression | Giải thích |
|---|---|---|
| Trước phiên sáng | `0 30 8 * * 1-5` | 8:30 thứ 2-6 |
| Mở cửa phiên sáng | `0 0 9 * * 1-5` | 9:00 thứ 2-6 |
| Trong phiên sáng (mỗi 5 phút) | `0 */5 9-11 * * 1-5` | 9:00-11:55 thứ 2-6 |
| Kết thúc phiên sáng | `0 30 11 * * 1-5` | 11:30 thứ 2-6 |
| Trước phiên chiều | `0 45 12 * * 1-5` | 12:45 thứ 2-6 |
| Mở phiên chiều | `0 0 13 * * 1-5` | 13:00 thứ 2-6 |
| Trong phiên chiều (mỗi 5 phút) | `0 */5 13-14 * * 1-5` | 13:00-14:55 thứ 2-6 |
| Đóng cửa | `0 30 14 * * 1-5` | 14:30 thứ 2-6 |
| Sau phiên | `0 0 15 * * 1-5` | 15:00 thứ 2-6 |
| Báo cáo cuối ngày | `0 0 17 * * 1-5` | 17:00 thứ 2-6 |

### Ngày lễ và sự kiện đặc biệt

Cron expression **không biết** ngày lễ. Phải xử lý trong handler:

```typescript
// Ngày lễ VN: Tết Nguyên đán, 30/4, 1/5, 2/9, ...
// Sàn nghỉ GD vào ngày lễ

// Cách xử lý:
cronjobAdd('tradingJob', '0 0 9 * * 1-5', async () => {
  // Kiểm tra ngày lễ trong handler, không phải trong cron
  if (await isHoliday(new Date())) return
  // ... logic
})
```

---

## 7. Gotchas (bẫy thường gặp)

### Bẫy 1: 11:30 có thuộc giờ GD không?

```
Phiên sáng HOSE: 9:00 - 11:30
11:30 là lúc phiên sáng KẾT THÚC

// Nếu cron chạy "9-11" → 11:xx vẫn chạy → đúng
// Nếu cron chạy "9-12" → 12:xx cũng chạy → SAI (đang nghỉ trưa)
```

### Bẫy 2: Timezone khi deploy ở nước ngoài

```typescript
// Server đặt ở Singapore (UTC+8), nhưng sàn VN là UTC+7
// Cron expression phải dùng timezone VN

new CronJob(expression, wrapper, null, true, 'Asia/Ho_Chi_Minh')
//                                           ↑ QUAN TRỌNG
```

### Bẫy 3: Phái sinh mở sớm hơn cơ sở

```
Phái sinh: 8:45 - 15:00
Cơ sở:     9:00 - 14:45

// Nếu cronjob liên quan đến CSTL, cần chú ý giờ khác nhau
```

---

## Tóm tắt

| Phiên | HOSE/HNX | Phái sinh |
|---|---|---|
| Mở cửa | 9:00 | 8:45 |
| Phiên sáng | 9:00-11:30 | 8:45-11:30 |
| Nghỉ trưa | 11:30-13:00 | 11:30-13:00 |
| Phiên chiều | 13:00-14:30 | 13:00-14:45 |
| Đóng cửa | 14:45 | 15:00 |
| Không GD | T7, CN, ngày lễ | T7, CN, ngày lễ |

| Lưu ý | Chi tiết |
|---|---|
| Nghỉ trưa | Cron phải skip 11:30-13:00 |
| Cuối tuần | Dùng `1-5` trong trường thứ |
| Ngày lễ | Xử lý trong handler, không phải cron |
| Timezone | Luôn dùng `Asia/Ho_Chi_Minh` |
