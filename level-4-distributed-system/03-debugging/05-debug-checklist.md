# Checklist 10 bước debug cross-service

## Mục tiêu

Một checklist ngắn gọn để debug **bất kỳ vấn đề nào** trong hệ thống nhiều service. In ra dán bên cạnh màn hình, hoặc mở file này khi cần.

---

## Checklist

### Bước 1: Ghi lại triệu chứng

```
[ ] Ai báo? User hay monitoring?
[ ] Triệu chứng cụ thể là gì? (lỗi gì, trang nào, data nào sai?)
[ ] Xảy ra từ lúc nào? Liên tục hay ngẫu nhiên?
[ ] Có thể reproduce không?
```

**Tại sao quan trọng:** Nếu không ghi lại, debug xong quên mất vấn đề ban đầu là gì. FE dev quen dùng DevTools reproduce -- BE cũng cần ghi chép tương tự.

---

### Bước 2: Xác định scope

```
[ ] Ảnh hưởng 1 user hay tất cả users?
[ ] Ảnh hưởng 1 feature hay toàn hệ thống?
[ ] Ảnh hưởng 1 service hay nhiều service?
```

```bash
# Nhanh: thử gọi API trực tiếp
curl -s http://localhost:3333/api/v1/health
curl -s http://localhost:3333/api/v1/analytics/overview
```

**Nếu tất cả API lỗi** → service chính bị vấn đề.
**Nếu chỉ 1 feature** → vấn đề cụ thể ở 1 module/service.

---

### Bước 3: Kiểm tra tất cả services có đang chạy không

```bash
[ ] Chạy lệnh kiểm tra ports
```

```bash
for port in 3333 3334 9093 9000 9006 9320 3335; do
  echo -n "Port $port: "
  lsof -i :$port > /dev/null 2>&1 && echo "OK" || echo "DOWN"
done

# Docker
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "kafka|message"
```

**Nếu service nào DOWN** → đó có thể là nguyên nhân. Xem log cuối cùng trước khi chết:

```bash
tail -50 /tmp/SERVICE.log
```

---

### Bước 4: Đọc log service liên quan

```bash
[ ] Xem log service chính (thường là logics)
[ ] Tìm error/warning gần thời điểm xảy ra lỗi
```

```bash
# Tìm lỗi gần đây
tail -200 /tmp/logics.log | grep -i "error\|warn\|fail"

# Nếu JSON log, dùng jq
tail -200 /tmp/logics.log | jq -c 'select(.level == "error")' 2>/dev/null

# Docker service
docker logs --tail 200 message_stream-message_stream-1 2>&1 | grep -i "error"
```

---

### Bước 5: Trace data flow

```bash
[ ] Xác định data đi qua những service nào
[ ] Kiểm tra từng service trên đường đi
```

```
Trace ngược từ symptom:
FE → logics → [data_feed | Kafka | source_service]

Mỗi service: log có gì? data đầu vào đúng không? data đầu ra đúng không?
```

---

### Bước 6: Kiểm tra kết nối giữa services

```bash
[ ] gRPC connections
[ ] Kafka connections
[ ] MongoDB/Redis connections
```

```bash
# gRPC: logics → source_service
grep -i "grpc\|UNAVAILABLE\|DEADLINE" /tmp/logics.log | tail -10

# Kafka: producer → consumer
docker exec kafka-kafka-1 kafka-consumer-groups \
  --bootstrap-server localhost:9092 --describe --all-groups 2>/dev/null

# MongoDB
grep -i "mongo\|connection" /tmp/logics.log | tail -10
```

---

### Bước 7: Kiểm tra resources

```bash
[ ] CPU
[ ] Memory
[ ] Disk
```

```bash
# CPU + Memory của Node.js processes
ps aux | grep "node" | grep -v grep | awk '{printf "PID=%s CPU=%s%% MEM=%sMB CMD=%s\n", $2, $3, $6/1024, $11}'

# Disk
df -h /tmp

# Docker resources
docker stats --no-stream
```

---

### Bước 8: Reproduce và xác nhận nguyên nhân

```
[ ] Có thể reproduce vấn đề không?
[ ] Giả thuyết nguyên nhân là gì?
[ ] Bằng chứng (log, data) hỗ trợ giả thuyết không?
```

**Quy tắc:** Không fix cho đến khi xác nhận nguyên nhân. Fix mù có thể gây thêm vấn đề.

---

### Bước 9: Fix và verify

```
[ ] Fix nguyên nhân gốc (không chỉ fix triệu chứng)
[ ] Verify: vấn đề ban đầu đã hết chưa?
[ ] Side effects: fix có gây vấn đề mới không?
```

```bash
# Sau khi fix, verify bằng cách:
# 1. Gọi lại API
curl -s http://localhost:3333/api/v1/analytics/overview | jq .

# 2. Xem log không còn lỗi
tail -f /tmp/logics.log | grep -i "error"
# (đợi 1-2 phút, không còn error mới = ok)

# 3. Kiểm tra data cập nhật
# So sánh data trước và sau fix
```

---

### Bước 10: Ghi chú postmortem

```
[ ] Nguyên nhân gốc là gì?
[ ] Fix như thế nào?
[ ] Có cần thêm monitoring/alert để phát hiện sớm hơn không?
[ ] Có cần thêm test case không?
```

**Ví dụ ghi chú:**

```
Vấn đề: Giá VNM không cập nhật trên FE
Thời gian: 2026-03-18 10:00 - 10:15
Nguyên nhân: message_stream container bị OOM killed
Fix: Restart container, tăng memory limit từ 256MB lên 512MB
Phòng ngừa: Thêm health check alert khi container restart
```

---

## Bản rút gọn (dán bên màn hình)

```
DEBUG CHECKLIST
═══════════════
 1. Ghi triệu chứng (cái gì, khi nào, ai bị)
 2. Xác định scope (1 user? 1 feature? toàn bộ?)
 3. Check services running (lsof -i :PORT)
 4. Đọc log (tail + grep error)
 5. Trace data flow (service nào trên đường đi)
 6. Check connections (gRPC, Kafka, MongoDB)
 7. Check resources (CPU, RAM, disk)
 8. Reproduce + xác nhận nguyên nhân
 9. Fix + verify (không còn lỗi? không side effect?)
10. Ghi postmortem (nguyên nhân, fix, phòng ngừa)
```

---

## Tóm tắt

- 10 bước **tuần tự**, không bỏ bước -- đặc biệt bước 1 (ghi triệu chứng) và bước 10 (postmortem)
- Bước 3-7 là phần **technical** -- dùng `lsof`, `tail`, `grep`, `docker` để thu thập thông tin
- Bước 8 là **quan trọng nhất** -- xác nhận nguyên nhân trước khi fix
- Checklist này áp dụng cho **bất kỳ vấn đề nào**, không chỉ data flow
- Dùng bản rút gọn khi đã quen -- 10 bước sẽ trở thành thói quen sau vài lần debug
