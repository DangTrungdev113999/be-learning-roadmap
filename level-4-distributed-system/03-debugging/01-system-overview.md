# Bản đồ hệ thống -- Tất cả services đang chạy

## Mục tiêu

Hiểu toàn bộ hệ thống đang chạy trên máy local: bao nhiêu service, cổng nào, kết nối ra sao. Đây là kiến thức nền tảng trước khi debug bất kỳ vấn đề nào.

---

## 1. Toàn cảnh hệ thống

```
                              ┌─────────────────────────────────────────┐
                              │            FE Browser (React)           │
                              │         http://localhost:3000           │
                              └────────┬──────────────┬────────────────┘
                                       │ HTTP/WS      │ HTTP
                                       │              │
                              ┌────────▼──────────────▼────────────────┐
                              │         logics (AdonisJS)              │
                              │         localhost:3333                  │
                              │                                        │
                              │  analyticsService  portfolioService    │
                              │  aiTeamService      planService        │
                              │  userService        qnaService         │
                              │  roomService        paymentService     │
                              └──┬──────────┬──────────┬───────────────┘
                                 │          │          │
                    MongoDB      │   Kafka  │   gRPC   │
                    Redis        │          │          │
                                 │          │          │
         ┌───────────────────────┤          │          ├──────────────────────┐
         │                       │          │          │                      │
         ▼                       ▼          ▼          ▼                      ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ source_service  │  │  message_stream  │  │    data_feed     │  │finpath-data-stream│
│ localhost:3334  │  │  localhost:9000   │  │  localhost:9320  │  │  localhost:9006   │
│ gRPC:9004       │  │  (Docker)        │  │  gRPC:9010       │  │                  │
│                 │  │                  │  │                  │  │                  │
│ Lấy giá từ sàn │  │ Phân phối data   │  │ Tổng hợp data   │  │ Stream realtime  │
│ chứng khoán    │  │ qua Kafka        │  │ cho FE           │  │ data             │
└────────┬────────┘  └────────┬─────────┘  └──────────────────┘  └──────────────────┘
         │                    │
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌──────────────────┐
│  Sàn chứng      │  │     Kafka        │
│  khoán (HoSE,   │  │  localhost:9093  │
│  HNX, UPCOM)    │  │  (Docker)        │
│                 │  │                  │
│  Nguồn giá gốc │  │  Message broker  │
└─────────────────┘  └──────────────────┘


┌─────────────────┐  ┌──────────────────┐
│ data_aggregation│  │                  │
│ localhost:3335  │  │   MongoDB        │
│                 │  │   Redis          │
│ Tính toán tổng  │  │                  │
│ hợp dữ liệu    │  │  Database layer  │
└─────────────────┘  └──────────────────┘
```

---

## 2. Bảng tổng hợp tất cả services

| Service | Port | Giao thức | Chạy bằng | Vai trò |
|---------|------|-----------|-----------|---------|
| **logics** | 3333 | HTTP, WebSocket | Node.js (AdonisJS) | Backend chính, xử lý business logic |
| **source_service** | 3334, gRPC 9004 | HTTP, gRPC | Node.js | Lấy giá từ sàn chứng khoán |
| **data_feed** | 9320, gRPC 9010 | HTTP, gRPC | Node.js | Tổng hợp và cung cấp data cho FE |
| **data_aggregation** | 3335 | HTTP | Node.js | Tính toán tổng hợp dữ liệu |
| **finpath-data-stream** | 9006 | HTTP | Node.js | Stream dữ liệu realtime |
| **message_stream** | 9000 | HTTP | Docker | Phân phối data qua Kafka |
| **Kafka** | 9093 | Kafka protocol | Docker | Message broker giữa các service |

---

## 3. Data flow: Giá cổ phiếu từ sàn đến FE

```
Sàn CK (HoSE/HNX)
    │
    │  (1) API/WebSocket lấy giá gốc
    ▼
source_service (:3334, gRPC :9004)
    │
    │  (2) Emit message qua Kafka
    ▼
Kafka (:9093)
    │
    │  (3) Consumer nhận message
    ├───────────────────────┐
    ▼                       ▼
message_stream (:9000)   data_feed (:9320)
    │                       │
    │  (4) Xử lý và         │  (5) Tổng hợp
    │  phân phối             │  cho API
    ▼                       ▼
finpath-data-stream (:9006)  logics (:3333)
    │                       │
    │  (6) WebSocket         │  (7) REST API
    │  push realtime         │  response
    ▼                       ▼
┌─────────────────────────────────┐
│         FE Browser              │
│  WebSocket: giá realtime        │
│  REST API: data tĩnh, tổng hợp │
└─────────────────────────────────┘
```

### Giải thích từng bước

1. **source_service** kết nối tới sàn chứng khoán (HoSE, HNX, UPCOM), lấy giá cổ phiếu realtime
2. Giá mới được **emit vào Kafka** dưới dạng message
3. Các **consumer** (message_stream, data_feed) lắng nghe Kafka topic tương ứng
4. **message_stream** nhận message, xử lý và chuyển tiếp cho data stream
5. **data_feed** tổng hợp dữ liệu, tính toán chỉ số
6. **finpath-data-stream** push giá realtime xuống FE qua WebSocket
7. **logics** trả data qua REST API khi FE gọi (portfolio, analytics, room...)

---

## 4. Log ở đâu?

Khi debug, điều đầu tiên là biết log từng service nằm ở đâu.

| Service | Log location | Cách xem |
|---------|-------------|----------|
| source_service | `/tmp/source_service.log` | `tail -f /tmp/source_service.log` |
| logics | `/tmp/logics.log` | `tail -f /tmp/logics.log` |
| finpath-data-stream | `/tmp/data_stream.log` | `tail -f /tmp/data_stream.log` |
| data_feed | `/tmp/data_feed.log` | `tail -f /tmp/data_feed.log` |
| message_stream | Docker logs | `docker logs -f message_stream-message_stream-1` |
| Kafka | Docker logs | `docker logs -f kafka-kafka-1` |

### Mẹo nhanh

```bash
# Xem log realtime của 1 service
tail -f /tmp/logics.log

# Xem log realtime và filter theo keyword
tail -f /tmp/logics.log | grep -i "error"

# Xem 100 dòng cuối
tail -100 /tmp/logics.log

# Docker service: xem 50 dòng cuối + follow
docker logs -f --tail 50 message_stream-message_stream-1
```

---

## 5. Kiểm tra service có đang chạy không

```bash
# Kiểm tra port có ai đang listen
lsof -i :3333   # logics
lsof -i :3334   # source_service
lsof -i :9093   # Kafka
lsof -i :9000   # message_stream
lsof -i :9006   # finpath-data-stream
lsof -i :9320   # data_feed
lsof -i :3335   # data_aggregation

# Kiểm tra tất cả cùng lúc
for port in 3333 3334 9093 9000 9006 9320 3335; do
  echo -n "Port $port: "
  lsof -i :$port > /dev/null 2>&1 && echo "RUNNING" || echo "NOT RUNNING"
done

# Kiểm tra Docker containers
docker ps | grep -E "kafka|message_stream"

# Health check bằng curl
curl -s http://localhost:3333/health  # logics
curl -s http://localhost:3334/health  # source_service
```

---

## 6. Giao thức giao tiếp

### HTTP (REST API)

```
FE ──HTTP──> logics (:3333)
            Ví dụ: GET /api/v1/analytics/overview
            Ví dụ: POST /api/v1/rooms/create
```

Quen thuộc với FE dev. Giống hệt khi FE gọi API.

### gRPC

```
logics ──gRPC──> source_service (:9004)
logics ──gRPC──> data_feed (:9010)
```

Nhanh hơn HTTP, dùng cho giao tiếp giữa backend services. FE không thấy gRPC -- chỉ thấy HTTP từ logics.

### Kafka (Message Queue)

```
source_service ──produce──> Kafka (:9093) ──consume──> message_stream
                                          ──consume──> data_feed
```

Bất đồng bộ, không cần response. Gửi message rồi đi làm việc khác.

### WebSocket

```
finpath-data-stream ──WebSocket──> FE Browser
```

Kết nối 2 chiều, giá cổ phiếu cập nhật realtime không cần FE poll.

---

## 7. So sánh với FE

| FE | BE (hệ thống này) |
|----|--------------------|
| 1 app React duy nhất | 7+ services chạy đồng thời |
| DevTools để debug | Log files + Docker logs |
| `npm start` là xong | Phải khởi động nhiều service + Docker |
| Lỗi ở 1 chỗ | Lỗi có thể từ service bất kỳ |
| Network tab thấy tất cả | Phải trace qua nhiều service |

---

## Tóm tắt

- Hệ thống gồm **7 services** chạy đồng thời, giao tiếp qua HTTP, gRPC, Kafka, WebSocket
- Data chạy từ **sàn chứng khoán** qua source_service, Kafka, message_stream, rồi tới **FE**
- Mỗi service có **log riêng** -- biết log ở đâu là bước đầu tiên của debug
- Kiểm tra service bằng `lsof -i :PORT` hoặc `curl` health check
- Bài tiếp theo sẽ dùng bản đồ này để **trace lỗi thực tế**
