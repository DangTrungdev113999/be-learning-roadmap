# 5 Pattern Debug thường gặp

## Mục tiêu

Nhận diện nhanh 5 loại vấn đề phổ biến nhất trong hệ thống microservice. Mỗi pattern: triệu chứng nhìn thấy, cách xác định nguyên nhân, cách khắc phục.

---

## Pattern 1: Service chết (Process crashed)

### Triệu chứng

- API trả về **connection refused** hoặc **ECONNREFUSED**
- FE hiển thị lỗi mạng hoặc timeout
- Log dừng hẳn (không có dòng mới)

### Cách xác định

```bash
# Kiểm tra port có ai listen không
lsof -i :3333  # logics
lsof -i :3334  # source_service
lsof -i :9320  # data_feed

# Nếu không có output → service đã chết

# Kiểm tra Docker containers
docker ps | grep -E "kafka|message_stream"
# Nếu container không trong danh sách → đã stop/crash

# Xem log cuối cùng trước khi chết
tail -50 /tmp/logics.log
# Thường thấy: "FATAL", "out of memory", "uncaught exception"
```

### Nguyên nhân phổ biến

| Nguyên nhân | Dấu hiệu trong log |
|-------------|---------------------|
| Uncaught exception | `UnhandledPromiseRejection`, `TypeError: Cannot read property` |
| Out of memory | `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory` |
| Port conflict | `EADDRINUSE :::3333` |
| Config sai | `Error: Missing environment variable`, `MongoParseError` |

### Cách khắc phục

```bash
# 1. Xem lý do chết
tail -100 /tmp/logics.log | grep -i "fatal\|crash\|uncaught\|EADDRINUSE"

# 2. Restart service
# Node.js service:
cd /path/to/service && node ace serve --watch

# Docker service:
docker compose up -d message_stream
docker compose up -d kafka

# 3. Nếu port bị chiếm
lsof -i :3333 | grep LISTEN
kill -9 <PID>  # PID từ lệnh trên
```

---

## Pattern 2: Data dừng chảy (Data pipeline stalled)

### Triệu chứng

- Service vẫn chạy (port vẫn listen), log vẫn có
- Nhưng **data không cập nhật** -- giá cũ, analytics cũ
- Không có error rõ ràng

### Cách xác định

```bash
# 1. Kiểm tra data có đang chảy qua Kafka không
docker exec -it kafka-kafka-1 bash -c \
  "kafka-consumer-groups --bootstrap-server localhost:9092 --describe --all-groups"

# Tìm cột LAG -- nếu LAG tăng liên tục → consumer không xử lý kịp
# Nếu LAG = 0 nhưng không có message mới → producer đã ngừng gửi

# 2. Kiểm tra source_service có gửi data không
tail -f /tmp/source_service.log | head -20
# Nếu không có log mới trong 30 giây → source bị stuck

# 3. Kiểm tra message_stream
docker logs --tail 20 message_stream-message_stream-1
# Tìm "processing" hoặc "received" → đang nhận message
# Không có → không nhận được gì từ Kafka

# 4. Kiểm tra kết nối giữa services
curl -s http://localhost:3334/health  # source_service
curl -s http://localhost:9000/health  # message_stream
```

### Nguyên nhân phổ biến

| Nguyên nhân | Cách nhận biết |
|-------------|----------------|
| Sàn CK đóng cửa | Ngoài 9:00-15:00 ngày thường, không có giá mới |
| Kafka consumer bị stuck | LAG tăng liên tục, consumer log im lặng |
| source_service mất kết nối sàn | Log: "connection lost", "reconnecting" |
| message_stream bị deadlock | Container chạy nhưng log dừng |

### Cách khắc phục

```bash
# Consumer bị stuck → restart consumer service
# (ví dụ restart message_stream)
docker restart message_stream-message_stream-1

# source_service mất kết nối → restart
# source_service thường có auto-reconnect, nhưng nếu không:
# Kill và start lại

# Kafka bị đầy disk
docker exec kafka-kafka-1 df -h
# Nếu disk > 90% → xóa old segments hoặc tăng disk
```

---

## Pattern 3: Timeout

### Triệu chứng

- API response chậm (> 5 giây) hoặc trả 504/timeout
- Log có **"timeout"**, **"DEADLINE_EXCEEDED"** (gRPC), **"ETIMEDOUT"**
- Một số request thành công, một số bị timeout (không phải tất cả)

### Cách xác định

```bash
# 1. Tìm timeout trong log
grep -i "timeout\|DEADLINE_EXCEEDED\|ETIMEDOUT" /tmp/logics.log | tail -20

# 2. Xem service nào bị timeout
# gRPC timeout → downstream service chậm
grep "DEADLINE_EXCEEDED" /tmp/logics.log | tail -10
# Thường kèm thông tin: service nào, method nào

# 3. Kiểm tra MongoDB chậm
grep -i "slow query\|command.*took" /tmp/logics.log | tail -10

# 4. Kiểm tra response time
# Nếu log có request duration:
grep "duration\|responseTime\|elapsed" /tmp/logics.log | tail -20
```

### Nguyên nhân phổ biến

| Nguyên nhân | Triệu chứng cụ thể |
|-------------|---------------------|
| MongoDB query chậm | Log: "slow query", query scan hàng triệu docs |
| gRPC service chậm | Log: "DEADLINE_EXCEEDED", downstream service quá tải |
| Network latency | Timeout ngẫu nhiên, không consistent |
| Connection pool cạn | Tất cả request cùng chậm, log: "pool exhausted" |

### Cách khắc phục

```bash
# MongoDB slow query → thêm index hoặc optimize query
# (xem chi tiết ở phần MongoDB Advanced)

# gRPC timeout → tăng timeout hoặc fix downstream service
# Kiểm tra downstream service có healthy không
curl -s http://localhost:3334/health  # source_service
lsof -i :9004  # gRPC port

# Connection pool → tăng pool size trong config
# Hoặc fix connection leak (connection không được release)

# Tạm thời: restart service để reset connections
```

---

## Pattern 4: Data sai (Data inconsistency)

### Triệu chứng

- API trả về data nhưng **giá trị sai** (số liệu lệch, trùng lặp, thiếu)
- FE hiển thị data không khớp giữa các trang
- Không có lỗi trong log -- mọi thứ "bình thường" nhưng kết quả sai

### Cách xác định

```bash
# 1. So sánh data từ nhiều nguồn
# Kiểm tra data trong MongoDB trực tiếp
# Mở mongo shell hoặc dùng MongoDB Compass

# 2. Kiểm tra data đầu vào
# Log input của function xử lý
grep "input\|params\|query" /tmp/logics.log | tail -20

# 3. Kiểm tra logic xử lý
# Tìm function bị nghi ngờ, đọc code
# So sánh expected vs actual output

# 4. Kiểm tra race condition
# Nếu data sai intermittent (lúc đúng lúc sai)
# → Có thể 2 process cùng ghi vào 1 record
grep "concurrent\|conflict\|duplicate" /tmp/logics.log | tail -10
```

### Nguyên nhân phổ biến

| Nguyên nhân | Cách phát hiện |
|-------------|----------------|
| Query sai điều kiện | Kiểm tra $match trong aggregation, thiếu filter |
| Timezone lệch | Ngày bắt đầu/kết thúc lệch 1 ngày, UTC vs local |
| Race condition | Cùng 1 request, chạy 2 lần kết quả khác nhau |
| Cache stale | Data cũ vẫn được trả từ Redis/memory cache |
| Duplicate data | Kafka message bị consume 2 lần, data bị tính đúp |

### Cách khắc phục

```bash
# Cache stale → clear cache
# Nếu dùng Redis:
redis-cli FLUSHDB  # cẩn thận, xóa toàn bộ DB!
redis-cli DEL "cache:specific-key"  # xóa key cụ thể

# Timezone → đảm bảo tất cả service dùng UTC
# Kiểm tra: date -u (UTC) vs date (local)

# Duplicate → kiểm tra Kafka consumer có enable idempotent không
# hoặc thêm deduplication logic

# Query sai → fix query, thêm test case
```

---

## Pattern 5: Memory leak

### Triệu chứng

- Service chạy ngày càng **chậm** theo thời gian
- Sau vài giờ/ngày, service **tự chết** (OOM killed)
- Memory sử dụng tăng liên tục, không giảm

### Cách xác định

```bash
# 1. Kiểm tra memory hiện tại
# Node.js process
ps aux | grep "node\|ts-node" | grep -v grep
# Cột RSS (resident set size) = memory thực tế đang dùng (KB)

# 2. Theo dõi memory theo thời gian
# Chạy mỗi 5 giây, quan sát RSS có tăng không
watch -n 5 'ps aux | grep "node ace serve" | grep -v grep | awk "{print \$6/1024 \" MB\"}"'

# 3. Docker containers
docker stats
# Xem cột MEM USAGE, nếu tăng liên tục → leak

# 4. Kiểm tra log OOM
# macOS:
log show --predicate 'eventMessage contains "out of memory"' --last 1h

# Linux:
dmesg | grep -i "out of memory\|oom"
```

### Nguyên nhân phổ biến

| Nguyên nhân | Ví dụ thực tế |
|-------------|---------------|
| Event listener không remove | `emitter.on(...)` trong loop, không `off()` |
| Array/Map tích lũy | Cache trong memory không có limit/TTL |
| Closure giữ reference | Callback giữ reference tới object lớn |
| Connection không close | MongoDB/Redis connection mở mà không đóng |

### Cách khắc phục

```bash
# Tạm thời: restart service (reset memory)
# Service sẽ quay về memory ban đầu

# Lâu dài: tìm và fix leak
# 1. Thêm memory monitoring
# Trong code Node.js:
# setInterval(() => {
#   const used = process.memoryUsage()
#   log.info({ heapUsed: Math.round(used.heapUsed / 1024 / 1024) + ' MB' }, 'Memory')
# }, 60000) // log mỗi phút

# 2. Dùng --max-old-space-size để giới hạn
# node --max-old-space-size=512 ace serve

# 3. Dùng Chrome DevTools để profile
# node --inspect ace serve
# Mở chrome://inspect → Take heap snapshot
```

---

## Bảng tổng hợp nhanh

| Pattern | Triệu chứng chính | Lệnh kiểm tra đầu tiên |
|---------|-------------------|------------------------|
| Service chết | Connection refused | `lsof -i :PORT` |
| Data dừng | Data cũ, không update | `tail -f /tmp/SERVICE.log` |
| Timeout | Response chậm/504 | `grep -i timeout /tmp/SERVICE.log` |
| Data sai | Giá trị lệch | So sánh data MongoDB vs API response |
| Memory leak | Chậm dần, OOM | `ps aux \| grep node` xem RSS |

---

## Quy trình chung

```
Bug report
    │
    ├─ Service có đang chạy không?
    │   └─ Không → Pattern 1: Service chết
    │
    ├─ Service chạy nhưng data không update?
    │   └─ Đúng → Pattern 2: Data dừng
    │
    ├─ Request chậm hoặc timeout?
    │   └─ Đúng → Pattern 3: Timeout
    │
    ├─ Data có nhưng giá trị sai?
    │   └─ Đúng → Pattern 4: Data sai
    │
    └─ Chậm dần theo thời gian?
        └─ Đúng → Pattern 5: Memory leak
```

---

## Tóm tắt

- **5 pattern** bao phủ ~90% vấn đề bạn sẽ gặp khi debug microservice
- Mỗi pattern có **triệu chứng riêng** -- nhận diện nhanh giúp tiết kiệm thời gian
- Luôn bắt đầu bằng **kiểm tra service có chạy không** (`lsof -i :PORT`)
- Sau đó **đọc log** để xác định pattern cụ thể
- Bài tiếp theo sẽ tổng hợp thành **checklist 10 bước** debug bất kỳ vấn đề nào
