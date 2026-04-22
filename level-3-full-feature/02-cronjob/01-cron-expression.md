# Cron Expression -- Biểu thức định thời

## Mục tiêu

Hiểu cách đọc và viết cron expression (6 trường có giây), thành thạo 10+ pattern phổ biến.

---

## 1. Cấu trúc cron expression

Dự án logics dùng cron expression **6 trường** (có giây), khác với cron Unix truyền thống (5 trường).

```
┌────────── giây (0-59)
│  ┌───────── phút (0-59)
│  │  ┌──────── giờ (0-23)
│  │  │  ┌─────── ngày trong tháng (1-31)
│  │  │  │  ┌────── tháng (1-12)
│  │  │  │  │  ┌───── ngày trong tuần (0-6, 0=Chủ nhật)
│  │  │  │  │  │
*  *  *  *  *  *
```

| Vị trí | Ý nghĩa | Phạm vi | Ví dụ |
|---|---|---|---|
| 1 | Giây | 0-59 | `30` = giây thứ 30 |
| 2 | Phút | 0-59 | `15` = phút thứ 15 |
| 3 | Giờ | 0-23 | `9` = 9 giờ sáng |
| 4 | Ngày | 1-31 | `1` = ngày mùng 1 |
| 5 | Tháng | 1-12 | `6` = tháng 6 |
| 6 | Thứ | 0-6 | `1` = thứ Hai |

---

## 2. Ký tự đặc biệt

### `*` -- Mọi giá trị

```
*  *  *  *  *  *
↑
Mỗi giây

0  *  *  *  *  *
   ↑
   Mỗi phút (tại giây 0)

0  0  *  *  *  *
      ↑
      Mỗi giờ (tại phút 0, giây 0)
```

### `,` -- Liệt kê nhiều giá trị

```
0  5  9,20  *  *  *
      ↑
      Lúc 9h05 VÀ 20h05
```

### `-` -- Khoảng liên tục

```
0  0  9-17  *  *  *
      ↑
      Mỗi giờ từ 9h đến 17h
```

### `/` -- Lặp theo chu kỳ

```
*/10  *  *  *  *  *
↑
Mỗi 10 giây (0, 10, 20, 30, 40, 50)

0  */5  *  *  *  *
   ↑
   Mỗi 5 phút (0, 5, 10, 15, ..., 55)
```

---

## 3. 10+ ví dụ phổ biến (có hình minh họa)

### Ví dụ 1: Mỗi ngày lúc 9h00

```
0  0  9  *  *  *

Giây: 0    (giây 0)
Phút: 0    (phút 0)
Giờ:  9    (9 giờ sáng)
Ngày: *    (mỗi ngày)
Tháng: *   (mỗi tháng)
Thứ: *     (mỗi ngày trong tuần)

Timeline:
──[9:00]──────────────────────[9:00]──────────────────────[9:00]──
  Hôm nay                    Ngày mai                    Ngày kia
```

### Ví dụ 2: Mỗi ngày lúc 9h05 và 20h05

```
0  5  9,20  *  *  *

Timeline:
──[9:05]────────[20:05]────────[9:05]────────[20:05]──
  Sáng           Tối           Sáng mai      Tối mai
```

Code thật trong logics:

```typescript
// Nhắc expert trả lời câu hỏi lúc 9h05 và 20h05
cronjobAdd('remindExpertAnswerQuestion', '0 5 9,20 * * *', async () => {
  await qnaService.remindExpertAnswerQuestion()
})
```

### Ví dụ 3: Mỗi ngày lúc 11h30 (giây thứ 4)

```
4  30  11  *  *  *

Giây: 4    (delay 4 giây tránh peak)
Phút: 30
Giờ:  11

→ Chạy lúc 11:30:04 mỗi ngày
```

Code thật:

```typescript
// Release khối lượng mua T+ lúc 11:30
cronjobAdd('dailyReleaseBuyVolume', '4 30 11 * * *', async () => {
  await portfolioService.dailyReleaseBuyVolume()
})
```

### Ví dụ 4: Mỗi ngày lúc 00:00 (nửa đêm)

```
46  0  0  *  *  *

Giây: 46   (delay 46 giây tránh trùng nhiều job)
Phút: 0
Giờ:  0

→ Chạy lúc 00:00:46 mỗi đêm
```

Code thật:

```typescript
// Xóa cờ reversed cho users
cronjobAdd('removeReversedFlagFn', '46 0 0 * * *', async () => {
  await userService.removeReversedFlagFn()
})
```

### Ví dụ 5: 2 lần/ngày lúc 8h15 và 12h15

```
10  15  8,12  *  *  *

Giây: 10   (delay 10 giây)
Phút: 15
Giờ:  8,12

→ Chạy lúc 8:15:10 và 12:15:10
```

Code thật:

```typescript
// Sync take-profit/stop-loss vào Redis
cronjobAdd('syncTpslToRedis', '10 15 8,12 * * *', async () => {
  await portfolioService.syncTpslToRedis()
})
```

### Ví dụ 6: Mỗi 30 phút

```
0  */30  *  *  *  *

→ Chạy lúc XX:00:00 và XX:30:00 mỗi giờ
```

### Ví dụ 7: Mỗi giờ từ 9h-15h các ngày trong tuần

```
0  0  9-15  *  *  1-5

Giờ:  9-15   (9h đến 15h)
Thứ:  1-5    (thứ 2 đến thứ 6)

→ Phù hợp cho giờ giao dịch chứng khoán
```

### Ví dụ 8: Ngày đầu tiên mỗi tháng lúc 2h sáng

```
0  0  2  1  *  *

Ngày: 1    (mùng 1)
Giờ:  2    (2 giờ sáng)

→ Báo cáo tháng, dọn dẹp dữ liệu cũ
```

### Ví dụ 9: Mỗi 10 giây

```
*/10  *  *  *  *  *

→ Chạy tại giây 0, 10, 20, 30, 40, 50 mỗi phút
```

### Ví dụ 10: Thứ 2 đến thứ 6 lúc 8h30

```
0  30  8  *  *  1-5

→ Ngày làm việc, trước giờ giao dịch
```

### Ví dụ 11: Mỗi 5 phút trong giờ hành chính

```
0  */5  9-17  *  *  1-5

→ 9:00, 9:05, 9:10, ..., 17:55 (thứ 2-6)
```

### Ví dụ 12: Cuối tuần lúc 3h sáng

```
0  0  3  *  *  0,6

Thứ: 0,6   (Chủ nhật và thứ 7)

→ Maintenance window cuối tuần
```

---

## 4. Cách đọc nhanh cron expression

**Quy tắc:** Đọc từ phải sang trái, bỏ qua `*`.

```
4  30  11  *  *  *
                     ← Mọi ngày trong tuần (*)
                  ← Mọi tháng (*)
               ← Mọi ngày (*)
          ← Lúc 11 giờ
      ← Phút 30
   ← Giây 4

→ "Mỗi ngày lúc 11:30:04"
```

```
0  5  9,20  *  *  *
                      ← Mọi ngày
             ← Lúc 9 giờ VÀ 20 giờ
         ← Phút 5
      ← Giây 0

→ "Mỗi ngày lúc 9:05 và 20:05"
```

```
0  */5  9-17  *  *  1-5
                         ← Thứ 2 đến thứ 6
                   ← Mọi ngày, mọi tháng
             ← Từ 9h đến 17h
        ← Mỗi 5 phút
     ← Giây 0

→ "Mỗi 5 phút, 9h-17h, thứ 2-6"
```

---

## 5. Lỗi thường gặp

### Nhầm 5 trường và 6 trường

```
// ❌ 5 trường (Unix cron) -- thiếu giây
30  11  *  *  *

// ✅ 6 trường (node-cron) -- có giây
0  30  11  *  *  *
```

Dự án logics dùng thư viện `cron` (node-cron), yêu cầu **6 trường** bắt buộc.

### Nhầm ngày trong tuần

```
// Ngày trong tuần: 0 = Chủ nhật, 1 = Thứ Hai, ..., 6 = Thứ Bảy

// ❌ Muốn thứ 2-6, viết 2-6 → thứ 3 đến thứ 7
0  0  9  *  *  2-6

// ✅ Đúng: 1-5 = thứ Hai đến thứ Sáu
0  0  9  *  *  1-5
```

### Giây cố định vs giây pattern

```
// Giây cố định: 4 → chạy 1 lần tại giây 4
4  30  11  *  *  *     → 11:30:04

// Giây pattern: */10 → chạy 6 lần mỗi phút
*/10  30  11  *  *  *  → 11:30:00, 11:30:10, 11:30:20, 11:30:30, 11:30:40, 11:30:50
```

---

## Tóm tắt

| Ký tự | Ý nghĩa | Ví dụ |
|---|---|---|
| `*` | Mọi giá trị | `* * * * * *` = mỗi giây |
| `,` | Liệt kê | `9,20` = 9 và 20 |
| `-` | Khoảng | `9-17` = từ 9 đến 17 |
| `/` | Chu kỳ | `*/5` = mỗi 5 đơn vị |
| Số | Giá trị cụ thể | `30` = đúng 30 |

| Pattern | Đọc là |
|---|---|
| `0 0 9 * * *` | Mỗi ngày lúc 9h00 |
| `0 5 9,20 * * *` | Mỗi ngày lúc 9h05 và 20h05 |
| `0 */5 * * * *` | Mỗi 5 phút |
| `0 0 9-17 * * 1-5` | Mỗi giờ, 9h-17h, thứ 2-6 |
| `0 0 0 1 * *` | Mùng 1 mỗi tháng lúc 0h |
