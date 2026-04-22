# Chạy test có sẵn

## Các lệnh chạy test

### Chạy test 1 function cụ thể

```bash
rm -f tests/run-failed-tests.json && node ace test unit \
  --files app/Services/dateService/libs/isTradingTime.spec.ts
```

Giải thích:
- `rm -f tests/run-failed-tests.json` -- Xóa file lưu test đã fail trước đó. Nếu không xóa, lần chạy tiếp chỉ chạy lại các test đã fail, không chạy hết.
- `node ace test unit` -- Lệnh chạy test của AdonisJS framework
- `--files {path}` -- Chỉ chạy test trong file cụ thể

### Chạy tất cả test của 1 service

```bash
rm -f tests/run-failed-tests.json && find app/Services/dateService/libs \
  -name "*.spec.ts" -exec node ace test unit --files {} \;
```

Giải thích:
- `find ... -name "*.spec.ts"` -- Tìm tất cả file có đuôi `.spec.ts` trong thư mục `libs/`
- `-exec node ace test unit --files {} \;` -- Chạy test cho từng file tìm được

### Type check toàn bộ dự án

```bash
yarn tsc --noEmit
```

Giải thích:
- `tsc` -- TypeScript compiler
- `--noEmit` -- Chỉ check type, không tạo file output. Giống như FE chạy `tsc --noCheck` nhưng ngược lại -- chỉ check, không build.

---

## Đọc kết quả test

### Khi tất cả test PASS

```
  isTradingTime
    ✓ should return false on Saturday (2ms)
    ✓ should return false on Sunday (1ms)
    ✓ HOSE: should return false during ATO session (9:10) when includeATOATC=false (1ms)
    ✓ HOSE: should return true at continuous morning start (9:16) (0ms)
    ✓ HOSE: should return true during continuous morning session (10:30) (1ms)
    ...

  Tests:    54 passed
  Duration: 127ms
```

Nhận biết:
- Dấu `✓` = test pass
- Cuối cùng: `54 passed` = tất cả 54 test đều pass
- `Duration: 127ms` = chạy xong trong 127 mili giây (rất nhanh)

### Khi có test FAIL

```
  isTradingTime
    ✓ should return false on Saturday (2ms)
    ✗ HOSE: should return true at continuous morning start (9:16) (3ms)

      Expected: true
      Received: false

      at assert.isTrue (isTradingTime.spec.ts:37:12)

  Tests:    1 failed, 53 passed
  Duration: 134ms
```

Nhận biết:
- Dấu `✗` = test fail
- `Expected: true` -- test mong đợi kết quả là `true`
- `Received: false` -- nhưng thực tế nhận được `false`
- `at ... (isTradingTime.spec.ts:37:12)` -- lỗi ở dòng 37, cột 12 của file test
- `1 failed, 53 passed` -- 1 test fail, 53 test pass

### Cách đọc lỗi

```
Expected: true
Received: false
```

Nghĩa là: function trả về `false` nhưng đúng ra phải trả về `true`. Bạn cần xem lại logic của function -- có thể đã sửa sai gì đó.

---

## Quy trình chạy test hàng ngày

### Trước khi commit

```bash
# 1. Chạy test cho file bạn vừa sửa
rm -f tests/run-failed-tests.json && node ace test unit \
  --files app/Services/dateService/libs/isTradingTime.spec.ts

# 2. Type check toàn bộ dự án
yarn tsc --noEmit
```

### Sau khi merge code mới

```bash
# Chạy test toàn bộ service liên quan
rm -f tests/run-failed-tests.json && find app/Services/dateService/libs \
  -name "*.spec.ts" -exec node ace test unit --files {} \;
```

---

## Troubleshooting -- Các lỗi thường gặp

### 1. "Cannot find module"

```
Error: Cannot find module 'App/Services/dateService'
```

Nguyên nhân: Path alias chưa được cấu hình hoặc file không tồn tại.

Cách xử lý:
- Kiểm tra file có tồn tại không: `ls app/Services/dateService/index.ts`
- Kiểm tra tsconfig.json có cấu hình path alias không

### 2. "Connection refused" (MongoDB/Redis)

```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

Nguyên nhân: MongoDB hoặc Redis chưa chạy.

Cách xử lý:
- Kiểm tra MongoDB: `mongosh --eval "db.runCommand({ ping: 1 })"`
- Kiểm tra Redis: `redis-cli ping`
- Đảm bảo file `.env` có đúng connection string

### 3. Test pass ở local nhưng fail ở CI

Nguyên nhân thường gặp:
- **Timezone khác nhau**: Local là `Asia/Ho_Chi_Minh`, CI có thể là `UTC`. Luôn dùng timezone tuyệt đối trong test:
  ```typescript
  // ĐÚNG -- timezone rõ ràng
  new Date('2024-12-14T10:00:00+07:00')

  // SAI -- timezone phụ thuộc môi trường
  new Date('2024-12-14 10:00:00')
  ```
- **Dữ liệu test phụ thuộc database**: Test nên tự tạo dữ liệu cần thiết, không dựa vào dữ liệu có sẵn trong DB.

### 4. File `tests/run-failed-tests.json` gây lỗi

```
Error: Only running previously failed tests
```

Nguyên nhân: File `run-failed-tests.json` từ lần chạy trước vẫn tồn tại.

Cách xử lý: Xóa file trước khi chạy test:
```bash
rm -f tests/run-failed-tests.json
```

Đây là lý do mọi lệnh test ở trên đều bắt đầu bằng `rm -f tests/run-failed-tests.json`.

### 5. Test chạy chậm

Nếu 1 test mất > 5 giây, có thể do:
- Function gọi API bên ngoài (cần mock)
- Function query database lớn (cần giới hạn dữ liệu test)
- Không có timeout -- test treo vĩnh viễn

---

## Tổng kết

```
3 lệnh cần nhớ:

# Test 1 function
rm -f tests/run-failed-tests.json && node ace test unit \
  --files app/Services/{service}/libs/{function}.spec.ts

# Test toàn bộ service
rm -f tests/run-failed-tests.json && find app/Services/{service}/libs \
  -name "*.spec.ts" -exec node ace test unit --files {} \;

# Type check
yarn tsc --noEmit

Quy tắc: LUÔN xóa run-failed-tests.json trước khi chạy test.
```
