# Bài tập System Design -- 5 bài thực hành

## Bài 1: Thiết kế hệ thống Realtime Leaderboard

### Đề bài

Finpath muốn thêm tính năng **"Bảng xếp hạng lợi nhuận realtime"**: hiển thị top 100 users có lợi nhuận portfolio cao nhất, cập nhật mỗi phút.

**Yêu cầu:**
- 200K users, mỗi user có portfolio với giá cổ phiếu thay đổi liên tục
- Top 100 cập nhật mỗi 1 phút
- User có thể xem rank của mình
- Hiển thị: rank, username, avatar, lợi nhuận %

### Yêu cầu thiết kế

1. **Data storage:** Lưu leaderboard ở đâu? MongoDB, Redis, hay cả hai?
2. **Compute:** Tính lợi nhuận 200K users mỗi phút -- dùng service nào? Kafka consumer hay cronjob?
3. **Caching:** Cache strategy cho leaderboard data (engine, TTL, invalidation)
4. **API design:** Endpoint lấy top 100 và endpoint lấy rank của user hiện tại
5. **Scale:** Nếu users tăng lên 1 triệu, bottleneck ở đâu? Giải pháp?

### Gợi ý

- Redis Sorted Set (`ZADD`, `ZRANK`, `ZRANGE`) phù hợp cho leaderboard
- Tính profit = (giá hiện tại - giá mua) / giá mua -- cần data từ portfolio + overviewStock
- Không cần tính lại tất cả mỗi phút -- chỉ tính khi giá thay đổi

---

## Bài 2: Identify Bottlenecks

### Đề bài

Giờ giao dịch 9h-9h30 (30 phút đầu), hệ thống Finpath gặp các vấn đề:

```
Triệu chứng:
A. API /stocks/overview response time tăng từ 50ms lên 2000ms
B. WebSocket disconnect + reconnect liên tục
C. MongoDB CPU 95%
D. Một số users thấy giá cổ phiếu cũ (stale data)
E. Kafka consumer lag tăng (messages xử lý chậm hơn gửi)
```

### Yêu cầu

Cho mỗi triệu chứng:

1. **Root cause:** Nguyên nhân có thể là gì? (liệt kê 2-3 khả năng)
2. **Diagnosis:** Kiểm tra bằng cách nào? (tools, commands, logs)
3. **Quick fix:** Giải quyết tạm thời ngay lập tức
4. **Long-term fix:** Giải pháp lâu dài (architecture change)

### Gợi ý

- A: Cache miss storm? Redis overloaded? Query chậm?
- B: message_stream quá tải? Nginx timeout? Memory leak?
- C: Missing index? Heavy aggregation? Too many connections?
- D: Redis replication lag? Cache stale? data_feed chậm?
- E: Consumer xử lý chậm? Partition không đủ? Consumer group imbalanced?

---

## Bài 3: Thiết kế Notification System

### Đề bài

Thiết kế hệ thống notification cho Finpath với yêu cầu:

**Loại notifications:**
- Price alert: Giá cổ phiếu đạt mức target (realtime, < 5 giây)
- Order matched: Lệnh khớp (near-realtime, < 30 giây)
- Social: Ai đó follow/like/comment (eventual, < 5 phút)
- Marketing: Promotion, announcement (batch, có thể delay)

**Channels:**
- In-app notification (badge + list)
- Push notification (mobile)
- Email (cho marketing)

**Scale:**
- 200K users
- Peak: 50K notifications/phút (lúc thị trường biến động)
- 100K price alerts cần check mỗi giây

### Yêu cầu thiết kế

1. **Architecture:** Vẽ sơ đồ hệ thống. Cần tách thành service riêng không?
2. **Price alert engine:** Check 100K alerts vs 1700 mã mỗi giây -- thiết kế thuật toán và data structure
3. **Message queue:** Pattern nào cho mỗi loại notification? (direct, fan-out, batch)
4. **Storage:** Schema cho notifications collection. TTL bao lâu?
5. **Delivery guarantee:** At-least-once hay exactly-once cho mỗi loại? Trade-offs?

### Gợi ý

- Price alerts: Reverse index -- key = symbol, value = list of alerts. Giá thay đổi → check alerts của symbol đó (không check tất cả 100K)
- Push notification: Firebase Cloud Messaging (FCM) hoặc APNs
- Batch: Kafka consumer group xử lý song song

---

## Bài 4: Propose Scaling Solution

### Đề bài

Finpath traffic tăng gấp 10 lần trong 6 tháng tới:

```
Hiện tại:               Dự kiến:
- 10K concurrent users   - 100K concurrent users
- 2M events/ngày        - 20M events/ngày
- 3 logics instances    - ??? instances
- 1 MongoDB server      - ???
- 1 Redis server        - ???
- 1 Kafka broker        - ???
```

### Yêu cầu

1. **App layer:** Bao nhiêu logics instances? Tính toán dựa trên CPU, memory, throughput.
2. **Database layer:** MongoDB cần gì? (Replica set? Sharding? Dedicated per service?)
3. **Cache layer:** Redis scaling strategy? (Sentinel → Cluster? Tách theo use case?)
4. **Message queue:** Kafka scaling? (Thêm partitions? Thêm brokers? Consumer groups?)
5. **Infrastructure:** Docker Compose còn đủ không? Cần Kubernetes? CI/CD thay đổi thế nào?
6. **Cost estimate:** Ước tính chi phí server tăng bao nhiêu % so với hiện tại.
7. **Timeline:** Lên kế hoạch thực hiện 6 tháng (milestone nào trước?)

### Gợi ý

- Mỗi logics instance handle ~1000 concurrent users (estimate)
- MongoDB sharding cần planning trước 2-3 tháng
- Kubernetes learning curve ~1-2 tháng cho team

---

## Bài 5: Design System cho Use Case mới

### Đề bài

Finpath muốn thêm tính năng **"Copy Trading"**: user có thể follow expert, tự động copy lệnh mua/bán của expert.

**Yêu cầu business:**
- Expert đặt lệnh mua VNM → tất cả followers cũng tự động mua VNM
- Mỗi follower có thể set: max amount per trade, daily limit, symbol blacklist
- Expert có thể có 10K followers
- Latency: từ lúc expert đặt lệnh đến followers nhận lệnh < 10 giây
- Reliability: KHÔNG được mất lệnh copy (liên quan tiền thật)

**Yêu cầu kỹ thuật:**
- Xử lý concurrent: 1 expert đặt lệnh → 10K orders cần tạo
- Idempotent: Nếu retry, không tạo duplicate order
- Audit trail: Log tất cả copy trades cho compliance
- Graceful degradation: Nếu 1 follower's order fail, không ảnh hưởng followers khác

### Yêu cầu thiết kế

1. **Architecture diagram:** Vẽ flow từ expert đặt lệnh → followers nhận lệnh copy
2. **Schema design:**
   - CopyTradingSubscription (follower subscribe expert)
   - CopyTradeOrder (lệnh copy)
   - CopyTradeLog (audit trail)
3. **Message flow:** Dùng Kafka pattern nào? Partition strategy? Consumer groups?
4. **Error handling:** Expert đặt lệnh, 8000/10000 followers thành công, 2000 fail (thiếu tiền). Xử lý thế nào?
5. **Scale estimation:** 100 experts, mỗi expert 10K followers, mỗi expert đặt 10 lệnh/ngày. Tổng bao nhiêu messages/ngày? Kafka handle được không?
6. **Race conditions:** Expert đặt 2 lệnh liên tiếp nhanh. Follower nhận đúng thứ tự không? Làm sao đảm bảo?

### Gợi ý

- Kafka partition key = expertId (đảm bảo ordering per expert)
- Consumer group: nhiều instances xử lý parallel, mỗi instance xử lý subset followers
- bulkWrite cho batch insert orders
- lockService cho follower-level dedup

---

## Tiêu chí đánh giá

| Tiêu chí | Mô tả |
|---|---|
| Architecture hợp lý | Sơ đồ rõ ràng, tách service khi có lý do |
| Trade-offs rõ ràng | Nêu được ưu/nhược của mỗi quyết định |
| Scalability | Thiết kế handle được growth 10x |
| Reliability | Xử lý failure gracefully, không mất data quan trọng |
| Real-world awareness | Tham chiếu được patterns từ Finpath, không chỉ lý thuyết |
| Estimation | Có tính toán cụ thể (throughput, latency, cost) |
