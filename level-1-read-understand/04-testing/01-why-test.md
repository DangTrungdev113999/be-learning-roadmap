# Tại sao cần viết test?

## Thực tế ở FE vs BE

### Ở FE

- Nhiều dự án FE **không có test** -- vẫn ship được
- Lỗi FE thường **thấy ngay** trên UI: nút sai màu, layout vỡ, text bị cắt
- User báo lỗi -> fix nhanh -> deploy lại
- Test thường là "nice to have", không bắt buộc

### Ở BE

- BE **bắt buộc phải có test** -- không có test = không merge
- Lỗi BE thường **ẩn** và **nguy hiểm**: tính sai tiền, trả dữ liệu sai, mất dữ liệu
- User **không thấy** lỗi BE trực tiếp -- có thể mất tiền thật trước khi phát hiện
- Test là **bắt buộc**, không phải optional

---

## 3 vai trò của test

### 1. Test là tài liệu sống

Đọc test file sẽ cho bạn biết function làm gì nhanh hơn đọc code:

```typescript
// Từ file isTradingTime.spec.ts thật của dự án
test('should return false on Saturday', async ({ assert }) => {
  const saturday = new Date('2024-12-14T10:00:00+07:00')
  const result = await isTradingTime({ date: saturday, exchange: 'HOSE' })
  assert.isFalse(result)
})

test('HOSE: should return false during ATO session (9:10) when includeATOATC=false', async ({ assert }) => {
  const date = new Date('2024-12-16T09:10:00+07:00')
  const result = await isTradingTime({ date, exchange: 'HOSE' })
  assert.isFalse(result)
})

test('HOSE: should return true at continuous morning start (9:16)', async ({ assert }) => {
  const date = new Date('2024-12-16T09:16:00+07:00')
  const result = await isTradingTime({ date, exchange: 'HOSE' })
  assert.isTrue(result)
})
```

Chỉ đọc 3 test cases này, bạn đã biết:
- Thứ Bảy không giao dịch
- HOSE từ 9:00-9:16 là phiên ATO (không tính mặc định)
- HOSE bắt đầu giao dịch liên tục từ 9:16

**Không cần đọc docs.md, không cần đọc source code** -- test tự kể chuyện.

### 2. Test là lưới an toàn

Giả sử bạn sửa `isTradingTime()` để thêm logic ngày lễ. Nếu bạn vô tình làm sai logic giờ giao dịch, 54 test cases sẽ báo lỗi ngay lập tức:

```
FAILED: HOSE: should return true at continuous morning start (9:16)
  Expected: true
  Received: false
```

Không có test? Bạn sẽ ship code lỗi lên production, và function `isTradingTime()` sẽ trả sai kết quả cho tất cả user đang giao dịch. Hậu quả:
- User không đặt lệnh được trong giờ giao dịch
- Hoặc tệ hơn: user đặt lệnh ngoài giờ giao dịch

### 3. Test là ví dụ sử dụng

Khi bạn cần gọi `isTradingTime()` trong code mới, bạn xem test để biết cách gọi:

```typescript
// Từ test file -- bạn biết cách gọi function
await isTradingTime({ date: new Date(), exchange: 'HOSE' })
await isTradingTime({ date: new Date(), exchange: 'HNX', includeATOATC: true })
await isTradingTime({ date: new Date(), exchange: 'HNX', includePLO: true })
await isTradingTime({ date: new Date(), code: 'VNM' })
```

Giống như Storybook cho FE component -- test cho bạn thấy mọi cách sử dụng function.

---

## Ví dụ thật: 54 test cases của isTradingTime

`isTradingTime` có 54 test cases, cover tất cả các trường hợp:

| Nhóm test | Số test | Cover gì |
|-----------|---------|----------|
| Weekend | 2 | Thứ 7, Chủ nhật -> false |
| HOSE (không ATO/ATC) | 8 | 9:10 false, 9:16 true, 10:30 true, 11:30 true, 12:30 false, 14:00 true, 14:30 true, 14:31 false |
| HOSE (có ATO/ATC) | 7 | 9:00 true, 9:10 true, 9:15 true, 9:16 true, 10:30 true, 14:40 true, 14:46 false |
| HNX (không ATC) | 5 | 9:00 true, 10:30 true, 14:00 true, 14:30 true, 14:31 false |
| HNX (có ATC) | 3 | 14:40 true, 14:45 true, 14:46 false |
| HNX (có PLO) | 5 | 14:50 true, 15:00 true, 15:01 false, PLO extend test, HOSE no PLO |
| UPCOM | 5 | 9:00 true, 14:50 true, 15:00 true, 15:01 false, ATC no effect |
| Edge cases | 4 | 8:59 false, default HOSE, case-insensitive |
| Code lookup | 11 | VNM->HOSE, SHS->HNX, OIL->UPCOM, exchange override |
| Holiday | 2 | 2026-01-01 false, 2026-01-05 true |

**54 test cases cho 1 function.** Đây là mức độ cover cần thiết cho BE -- vì sai 1 phút có thể ảnh hưởng đến tất cả lệnh giao dịch.

So sánh: ở FE, bạn test component `Button` có thể chỉ cần 5-10 test cases (render, click, disabled, loading, custom style). Ở BE, 1 function nghiệp vụ có thể cần 50+ test cases vì mỗi edge case đều có hậu quả thật.

---

## Khi nào test THẬT SỰ cần thiết?

| Loại function | Cần test? | Lý do |
|---------------|-----------|-------|
| Business logic (isTradingTime, takeNumber) | **Bắt buộc** | Sai = mất tiền, mất dữ liệu |
| Utility (numberToCode, isTimeInRange) | **Bắt buộc** | Được nhiều function khác dùng |
| CRUD đơn giản (get, create, update) | Nên có | Đảm bảo query đúng |
| Config/constants | Không cần | Không có logic |

---

## Tổng kết

```
FE: test là optional, lỗi thấy ngay trên UI
BE: test là bắt buộc, lỗi ẨN và NGUY HIỂM

Test = tài liệu sống + lưới an toàn + ví dụ sử dụng

isTradingTime() có 54 test cases vì:
- 4 sàn giao dịch (HOSE, HNX, UPCOM, VNF) x nhiều khung giờ
- Sai 1 phút = ảnh hưởng tất cả lệnh giao dịch
- Không có test = không dám sửa code
```
