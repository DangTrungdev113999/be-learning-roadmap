# Bài tập thực hành Level 1

> Tất cả bài tập dùng project `logics` tại `~/Desktop/logics`
> Mở terminal và IDE cùng lúc để làm

---

## Nhóm A: Cấu trúc project (5 bài)

### Bài 1: Đếm và liệt kê
Dùng terminal, trả lời các câu hỏi:
```bash
# Gợi ý dùng các lệnh này
ls app/Controllers/Http/ | wc -l
ls app/Services/ | wc -l
ls mongo/ | wc -l
ls routes/ | wc -l
```
- Có bao nhiêu controller?
- Có bao nhiêu service?
- Có bao nhiêu model MongoDB?
- Có bao nhiêu file route?

### Bài 2: Tìm file khởi tạo
Mở thư mục `start/`. Liệt kê mỗi file và giải thích nó khởi tạo cái gì.

**Kết quả mong đợi**: Bạn biết app khởi tạo Redis, MongoDB, Kafka, Cronjob... ở đâu.

### Bài 3: Tìm config
Mở thư mục `config/`. Trả lời:
- File nào chứa config Redis?
- File nào chứa config MongoDB?
- File nào chứa config Kafka?
- File nào chứa config Slack?

### Bài 4: Path alias
Tìm 3 file bất kỳ trong `app/Services/` và xem cách chúng import. Trả lời:
- Chúng dùng path alias gì? (App, Mongo, Redis...)
- Có file nào dùng import tương đối (`../..`) không?

### Bài 5: So sánh với FE
Lấy 1 feature trong project FE của bạn (finpath-web). Tìm phần BE tương ứng trong logics:
- FE component → BE controller nào?
- FE API call → BE route nào?
- FE state management → BE service nào?

---

## Nhóm B: Trace API (5 bài)

### Bài 6: Trace đơn giản
Trace API `GET /api/health/readiness`:
1. Tìm route trong file nào?
2. Controller method tên gì?
3. Method đó làm gì? (check Redis? check Mongo?)

```bash
grep -rn "readiness" routes/
grep -rn "readiness" app/Controllers/
```

### Bài 7: Trace stock API
Trace API `GET /api/stocks/v3/overview`:
1. Route file nào? Dòng bao nhiêu?
2. Controller method tên gì?
3. Nó lấy data từ đâu? (MongoDB? Redis? Cache?)
4. Response format như thế nào?

### Bài 8: Trace với middleware
Trace API `GET /api/watchlists`:
1. Route file nào?
2. Có middleware gì? (rate limit? auth?)
3. Rate limit bao nhiêu request/giây?
4. Cần đăng nhập không?

### Bài 9: Trace POST API
Trace API `POST /api/otp/send`:
1. Route file nào?
2. Controller nhận input gì? (util.gp dùng key nào?)
3. Có validate input không? (util.check?)
4. Gọi service nào?

### Bài 10: Trace flow ngược
Bạn biết FE gọi API lấy danh sách watchlist. Từ FE code, tìm:
1. URL API là gì?
2. Từ URL → tìm route file
3. Từ route → tìm controller
4. Từ controller → tìm service
5. Từ service → tìm MongoDB model

---

## Nhóm C: Service pattern (5 bài)

### Bài 11: Đọc docs.md
Mở `app/Services/dateService/docs.md`. Trả lời:
- Service này có bao nhiêu function?
- `isTradingTime()` nhận input gì?
- Giờ giao dịch HOSE là mấy giờ đến mấy giờ?

### Bài 12: Đọc service khác
Mở `app/Services/countService/docs.md`. Trả lời:
- `takeNumber()` làm gì?
- `numberToCode()` làm gì?
- Service này dùng MongoDB collection nào?

### Bài 13: Đọc index.ts
Mở `app/Services/banService/index.ts`. Trả lời:
- Export những function nào?
- Có gì đặc biệt ngoài export? (event listener?)
- Bạn import service này thế nào?

### Bài 14: Tìm service theo chức năng
Không mở code, chỉ đọc tên 47 services. Đoán xem:
- Service nào xử lý thanh toán?
- Service nào xử lý portfolio (danh mục đầu tư)?
- Service nào xử lý cache?
- Service nào xử lý AI/LLM?

Sau đó mở docs.md của chúng để kiểm tra.

### Bài 15: Workflow thực tế
Giả sử bạn cần thêm function `isHoliday()` vào `dateService`. Liệt kê các bước:
1. Đọc file nào trước?
2. Tạo file gì?
3. Viết gì trước — test hay implementation?
4. Sửa file nào để export function mới?
5. Cập nhật file nào cuối cùng?

---

## Nhóm D: Testing (5 bài — không cần viết code)

### Bài 16: Chạy test
Chạy test của `dateService`:
```bash
cd ~/Desktop/logics
rm -f tests/run-failed-tests.json && node ace test unit --files app/Services/dateService/libs/isTradingTime.spec.ts
```
- Có bao nhiêu test case?
- Tất cả pass không?
- Mất bao lâu?

### Bài 17: Đọc test file
Mở `app/Services/dateService/libs/isTradingTime.spec.ts`. Trả lời:
- Test case đầu tiên test cái gì?
- Có test cho ngày nghỉ (Saturday/Sunday) không?
- Có test cho giờ nghỉ trưa không?

### Bài 18: Tìm service có test
Tìm tất cả file `.spec.ts` trong project:
```bash
find app/Services -name "*.spec.ts" | head -20
```
- Có bao nhiêu file test?
- Service nào có nhiều test nhất?

### Bài 19: Type check
Chạy type check:
```bash
yarn tsc --noEmit
```
- Có lỗi không?
- Nếu có lỗi, đọc lỗi đầu tiên — file nào, dòng nào?

### Bài 20: Hiểu test = tài liệu
Chọn 1 function bất kỳ mà bạn chưa đọc code. Chỉ đọc file test của nó.
- Bạn có hiểu function làm gì chỉ từ test không?
- Liệt kê 3 behavior bạn rút ra được từ test.

---

## Tự đánh giá

Sau khi làm xong 20 bài, trả lời:

| Câu hỏi | Có/Không |
|---|---|
| Bạn biết mỗi folder trong logics làm gì? | |
| Bạn trace được API từ URL → response? | |
| Bạn đọc được docs.md và hiểu service? | |
| Bạn chạy được test và đọc kết quả? | |
| Bạn tự tin chuyển sang Level 2? | |

Tất cả "Có" → Lên Level 2!
