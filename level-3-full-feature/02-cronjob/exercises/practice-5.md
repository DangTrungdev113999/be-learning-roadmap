# 5 bài viết Cron Expression

## Hướng dẫn chung

- Tất cả cron expression phải **6 trường** (có giây): `giây phút giờ ngày tháng thứ`
- Viết expression rồi **tự giải thích** bằng tiếng Việt để kiểm tra hiểu đúng
- Kiểm tra bằng cách đọc ngược: từ phải sang trái, bỏ qua `*`

---

## Bài 1: Đọc hiểu Cron Expression (Dễ)

Giải thích bằng tiếng Việt mỗi cron expression sau đây. Với mỗi expression, cho biết: chạy lúc mấy giờ, ngày nào, tần suất.

```
a) 0  0  9  *  *  *
b) 0  30  14  *  *  1-5
c) 0  */15  9-11  *  *  *
d) 46  0  0  *  *  *
e) 0  5  9,20  *  *  *
f) 10  15  8,12  *  *  *
g) */10  *  *  *  *  *
h) 0  0  3  1  *  *
```

**Gợi ý:** Dùng bảng sau để kiểm tra:

| Expression | Giây | Phút | Giờ | Ngày | Tháng | Thứ | Đọc là |
|---|---|---|---|---|---|---|---|
| a | 0 | 0 | 9 | * | * | * | ? |
| b | 0 | 30 | 14 | * | * | 1-5 | ? |
| ... | | | | | | | |

---

## Bài 2: Viết Cron Expression (Trung bình)

Viết cron expression cho mỗi yêu cầu:

**a)** Mỗi ngày lúc 7 giờ sáng (giây 0)

**b)** Mỗi 30 phút, 24/7

**c)** Thứ 2 đến thứ 6 lúc 8:45 sáng (chuẩn bị trước phiên phái sinh)

**d)** 2 lần mỗi ngày: lúc 11:30 và 14:30 (kết thúc mỗi phiên)

**e)** Mỗi 5 phút, chỉ trong giờ 9-11 và 13-14, thứ 2-6 (trong giờ GD, bỏ nghỉ trưa)

**f)** Ngày 1 và ngày 15 mỗi tháng lúc 2 giờ sáng (báo cáo nửa tháng)

**g)** Mỗi Chủ nhật lúc 3 giờ sáng (maintenance window)

**h)** Mỗi 10 giây (monitoring)

**Đáp án mẫu cho câu a:**
```
0  0  7  *  *  *
```
Giải thích: Giây 0, phút 0, giờ 7, mỗi ngày, mỗi tháng, mọi ngày trong tuần.

---

## Bài 3: Viết cronjobAdd cho dự án chứng khoán (Trung bình)

Viết code `cronjobAdd()` cho các tình huống sau. Bao gồm: key, expression, và handler (gọi service method).

**a)** Sync giá cổ phiếu vào cache mỗi 30 giây trong giờ GD (9:00-15:00), thứ 2-6.

```typescript
// Service method có sẵn:
await priceService.syncPriceToCache()
```

**b)** Gửi báo cáo lãi/lỗ cuối ngày lúc 16:00, thứ 2-6.

```typescript
// Service method có sẵn:
await reportService.sendDailyProfitReport()
```

**c)** Dọn dẹp sessions hết hạn mỗi ngày lúc 2:30 sáng.

```typescript
// Service method có sẵn:
await sessionService.cleanExpiredSessions()
```

**d)** Kiểm tra và cảnh báo portfolio bất thường mỗi 5 phút, 8:00-17:00, thứ 2-6.

```typescript
// Service method có sẵn:
await monitorService.checkAbnormalPortfolio()
```

**Gợi ý format:**
```typescript
cronjobAdd('keyName', 'expression', async () => {
  await someService.someMethod()
})
```

---

## Bài 4: Sửa lỗi Cron Expression (Khó)

Mỗi expression dưới đây có lỗi. Tìm lỗi và sửa lại.

**a)** Muốn chạy mỗi ngày lúc 9:30 sáng, nhưng viết:
```
30  9  *  *  *
```

**b)** Muốn chạy thứ 2-6 nhưng viết:
```
0  0  9  *  *  2-6
```

**c)** Muốn chạy mỗi 5 phút trong giờ GD, nhưng viết:
```
0  */5  9-15  *  *  1-5
```
(Gợi ý: có gì sai với khoảng giờ 9-15 trong ngữ cảnh HOSE?)

**d)** Muốn chạy lúc 11:30 sáng, nhưng viết:
```
0  30  11  *  *  *  *
```

**e)** Muốn chạy mỗi ngày lúc nửa đêm, nhưng viết:
```
0  0  24  *  *  *
```

---

## Bài 5: Thiết kế lịch cronjob cho hệ thống mới (Khó)

Bạn đang xây dựng hệ thống **quản lý quỹ đầu tư** với các yêu cầu:

1. **Sync NAV (Net Asset Value):** Mỗi ngày làm việc lúc 15:30 (sau khi sàn đóng), tính và lưu NAV của quỹ.

2. **Cảnh báo biến động:** Mỗi 10 phút trong giờ GD (9:00-11:30, 13:00-14:30), kiểm tra nếu portfolio giảm > 5%.

3. **Báo cáo tuần:** Mỗi thứ 6 lúc 17:00, gửi email báo cáo tuần cho nhà đầu tư.

4. **Rebalance tự động:** Ngày 1 mỗi tháng lúc 8:00 (trước giờ GD), tính toán và đề xuất rebalance.

5. **Cleanup logs:** Mỗi Chủ nhật lúc 3:00 sáng, xóa logs cũ hơn 90 ngày.

**Yêu cầu:**
- Viết `cronjobAdd()` cho tất cả 5 jobs
- Chọn giây hợp lý (phân tán, không trùng nhau)
- Giải thích tại sao chọn thời điểm đó
- Vẽ timeline trong ngày (giống bài 05-real-cronjobs.md)
- Xác định job nào cần xử lý ngày lễ trong handler

**Gợi ý:**
- Job 2 cần 2 cronjobs riêng (phiên sáng + phiên chiều) vì có nghỉ trưa
- Job 4 và 5 không liên quan đến giờ GD nhưng vẫn nên tránh giờ cao điểm

---

## Đáp án tham khảo (chỉ xem sau khi tự làm)

### Bài 1 - Đáp án

```
a) Mỗi ngày lúc 9:00:00
b) Thứ 2 đến thứ 6 lúc 14:30:00
c) Mỗi 15 phút, từ 9h-11h, mỗi ngày (9:00, 9:15, 9:30, ..., 11:45)
d) Mỗi ngày lúc 00:00:46 (nửa đêm, delay 46 giây)
e) Mỗi ngày lúc 9:05:00 và 20:05:00
f) Mỗi ngày lúc 8:15:10 và 12:15:10
g) Mỗi 10 giây
h) Ngày mùng 1 mỗi tháng lúc 3:00:00
```

### Bài 4 - Đáp án

```
a) Thiếu trường giây. Sửa: 0 30 9 * * *
b) 2-6 = thứ Ba đến thứ Bảy. Sửa: 0 0 9 * * 1-5
c) Giờ 12 nằm trong nghỉ trưa. Sửa: dùng 2 jobs hoặc liệt kê 9,10,11,13,14
d) Thừa 1 trường (7 trường). Sửa: bỏ 1 dấu *
e) Giờ 24 không tồn tại (0-23). Sửa: 0 0 0 * * *
```
