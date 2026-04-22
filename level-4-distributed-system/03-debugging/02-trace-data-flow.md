# Trace Data Flow -- "Giá VNM không cập nhật trên FE"

## Mục tiêu

Học cách debug một vấn đề cross-service thực tế: giá cổ phiếu VNM không cập nhật trên giao diện FE. Trace ngược từ FE về tận nguồn, kiểm tra từng service trên đường đi.

---

## 1. Tình huống

User báo: **"Giá VNM trên app không thay đổi từ 10 phút trước."**

Là FE dev, bạn quen check Network tab. Nhưng ở BE, data đi qua 5-6 services trước khi tới FE. Cần biết **chỗ nào bị tắc**.

```
Sàn CK → source_service → Kafka → message_stream → data_stream → FE
                                                 ↘ data_feed → logics → FE (API)

Bị tắc ở đâu? Phải kiểm tra từng đoạn.
```

---

## 2. Bước 1 -- Kiểm tra FE nhận được gì

**Mục đích:** Xác nhận vấn đề từ phía FE trước.

```bash
# Kiểm tra API trả về data gì
curl -s "http://localhost:3333/api/v1/market/price?symbol=VNM" | jq .

# Nếu response có giá nhưng timestamp cũ → data không được cập nhật từ BE
# Nếu response timeout hoặc 500 → logics có vấn đề
```

**Kiểm tra WebSocket:**

```bash
# Xem log data_stream có đang push giá không
tail -20 /tmp/data_stream.log | grep -i "VNM"

# Nếu không có dòng nào → data_stream không nhận được giá VNM
# Nếu có dòng → FE có thể bị mất kết nối WebSocket
```

**Kết luận bước 1:**
- Nếu API trả data cũ → vấn đề ở upstream (đi tiếp bước 2)
- Nếu API trả 500 → check log logics (nhảy bước 3)
- Nếu API ok nhưng WS không push → check data_stream

---

## 3. Bước 2 -- Kiểm tra logics

**Mục đích:** logics (:3333) có nhận được giá mới từ data_feed không?

```bash
# Xem log logics, tìm liên quan đến giá hoặc market data
tail -200 /tmp/logics.log | grep -i "price\|market\|VNM"

# Tìm lỗi gần đây
tail -200 /tmp/logics.log | grep -i "error\|fail\|timeout"

# Nếu dùng structured log (JSON), lọc chính xác hơn
tail -200 /tmp/logics.log | jq 'select(.level == "error")' 2>/dev/null
```

**Kiểm tra kết nối gRPC tới data_feed:**

```bash
# logics gọi data_feed qua gRPC :9010
# Nếu log có "gRPC timeout" hoặc "UNAVAILABLE" → data_feed bị down
tail -200 /tmp/logics.log | grep -i "grpc\|9010\|data_feed"
```

**Kết luận bước 2:**
- Log có lỗi gRPC → data_feed có vấn đề (đi bước 4)
- Log không có lỗi nhưng data cũ → data_feed trả data cũ (đi bước 4)
- logics hoàn toàn im lặng → không có request nào tới (vấn đề FE hoặc network)

---

## 4. Bước 3 -- Kiểm tra data_feed

**Mục đích:** data_feed (:9320) có nhận và xử lý giá mới không?

```bash
# Xem log data_feed
tail -200 /tmp/data_feed.log | grep -i "VNM\|price\|update"

# Tìm lỗi
tail -200 /tmp/data_feed.log | grep -i "error\|fail"

# Kiểm tra data_feed có đang chạy không
lsof -i :9320
lsof -i :9010
```

**Kết luận bước 3:**
- data_feed không chạy → cần restart
- data_feed chạy nhưng log không có update → không nhận message từ Kafka (đi bước 5)
- data_feed có lỗi connect → kiểm tra Kafka hoặc MongoDB

---

## 5. Bước 4 -- Kiểm tra Kafka

**Mục đích:** Message có được produce vào Kafka topic không? Consumer có đang đọc không?

```bash
# Kiểm tra Kafka container có chạy không
docker ps | grep kafka

# Xem log Kafka
docker logs --tail 50 kafka-kafka-1

# Vào container Kafka để check topic
docker exec -it kafka-kafka-1 bash

# Liệt kê topics
kafka-topics --bootstrap-server localhost:9092 --list

# Xem message mới nhất trong topic (thay TOPIC_NAME bằng topic thật)
kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic TOPIC_NAME \
  --from-beginning --max-messages 5

# Xem consumer group lag (messages chưa được xử lý)
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group GROUP_NAME
```

**Kiểm tra message_stream:**

```bash
# message_stream nhận data từ source_service qua Kafka và chuyển tiếp
docker logs --tail 100 message_stream-message_stream-1 | grep -i "VNM\|error"
```

**Kết luận bước 4:**
- Kafka không chạy → `docker compose up kafka` hoặc restart
- Topic trống (không có message) → source_service không gửi (đi bước 6)
- Topic có message nhưng consumer lag → consumer bị stuck, cần restart consumer
- message_stream có lỗi → kiểm tra config hoặc restart

---

## 6. Bước 5 -- Kiểm tra source_service

**Mục đích:** source_service (:3334) có lấy được giá từ sàn chứng khoán không?

```bash
# Xem log source_service
tail -200 /tmp/source_service.log | grep -i "VNM\|price\|error\|connect"

# Kiểm tra service có đang chạy không
lsof -i :3334
lsof -i :9004

# Thử gọi trực tiếp
curl -s "http://localhost:3334/health"
```

**Kết luận bước 5:**
- source_service không chạy → restart
- Log có "connection refused" hoặc "timeout" → sàn chứng khoán bị sự cố, hoặc mạng có vấn đề
- Log có "VNM" nhưng data cũ → sàn đang đóng cửa (ngoài giờ giao dịch, thứ 7/CN)
- Log có data mới nhưng không emit → lỗi Kafka producer

---

## 7. Sơ đồ quyết định

```
"Giá VNM không cập nhật"
    │
    ├─ Bước 1: curl API logics
    │   ├─ 500 error → Check /tmp/logics.log
    │   ├─ Timeout → logics chết? lsof -i :3333
    │   └─ Data cũ → Đi tiếp ↓
    │
    ├─ Bước 2: Check /tmp/logics.log
    │   ├─ gRPC error → data_feed chết?
    │   └─ Không lỗi → Đi tiếp ↓
    │
    ├─ Bước 3: Check /tmp/data_feed.log
    │   ├─ Không chạy → Restart
    │   ├─ Lỗi Kafka → Đi tiếp ↓
    │   └─ Không có update → Đi tiếp ↓
    │
    ├─ Bước 4: Check Kafka
    │   ├─ Container chết → docker compose up
    │   ├─ Consumer lag → Restart consumer
    │   └─ Topic trống → Đi tiếp ↓
    │
    └─ Bước 5: Check /tmp/source_service.log
        ├─ Không chạy → Restart
        ├─ Mạng lỗi → Kiểm tra kết nối sàn CK
        └─ Ngoài giờ → Sàn đóng cửa, bình thường
```

---

## 8. Thời gian debug thực tế

| Bước | Thời gian | Lệnh chính |
|------|-----------|-------------|
| Check API | 10 giây | `curl localhost:3333/...` |
| Check log logics | 30 giây | `tail -200 /tmp/logics.log \| grep error` |
| Check data_feed | 30 giây | `tail -200 /tmp/data_feed.log` |
| Check Kafka | 1-2 phút | `docker ps`, `docker logs` |
| Check source_service | 30 giây | `tail -200 /tmp/source_service.log` |
| **Tổng** | **3-5 phút** | |

Debug cross-service không khó nếu biết thứ tự kiểm tra. Đi từ gần (FE) ra xa (source), mỗi bước loại trừ 1 service.

---

## 9. Nguyên tắc chung khi trace

1. **Bắt đầu từ symptom** -- user thấy gì? API trả gì?
2. **Trace ngược dòng** -- từ FE → logics → data_feed → Kafka → source
3. **Mỗi bước: 1 câu hỏi** -- "Service này có đang chạy không? Log nói gì?"
4. **Loại trừ nhanh** -- nếu service chạy và log bình thường, bỏ qua, đi tiếp
5. **Ghi chú findings** -- note lại mỗi bước đã check gì, thấy gì

---

## Tóm tắt

- Debug cross-service = **trace ngược từ FE về source**, kiểm tra từng service trên đường đi
- Mỗi service có **log riêng** -- đọc log là công cụ chính
- Thứ tự: **API response → logics log → data_feed log → Kafka → source_service log**
- Với hệ thống 7 services, trung bình mất **3-5 phút** để xác định service nào bị vấn đề
- Bài tiếp theo sẽ học cách **đọc log nhiều service cùng lúc** để trace nhanh hơn
