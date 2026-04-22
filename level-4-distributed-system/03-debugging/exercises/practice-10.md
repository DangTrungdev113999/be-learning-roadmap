# 10 kịch bản debug thực tế

## Hướng dẫn

Mỗi kịch bản mô tả một tình huống thực tế. Nhiệm vụ của bạn:
1. Xác định **service nào** có vấn đề
2. Liệt kê **các bước kiểm tra** theo thứ tự
3. Viết **lệnh cụ thể** để xác định nguyên nhân
4. Đề xuất **cách fix**

---

## Kịch bản 1: FE không nhận giá realtime

**Triệu chứng:** Trang danh mục cổ phiếu trên FE hiển thị giá, nhưng giá không thay đổi. Trước đó giá cập nhật mỗi giây. Đã thử refresh trang, vẫn không cập nhật.

**Gợi ý:**
- Giá realtime đến FE qua WebSocket từ service nào?
- Kiểm tra kết nối WebSocket trên FE (DevTools → Network → WS)
- Trace ngược: data_stream → message_stream → Kafka → source_service

**Câu hỏi:**
1. Bạn sẽ kiểm tra service nào đầu tiên? Tại sao?
2. Viết 3 lệnh để kiểm tra 3 service trên đường data flow
3. Nếu `lsof -i :9006` không có output, bạn kết luận gì?

---

## Kịch bản 2: Kafka consumer lag tăng liên tục

**Triệu chứng:** Monitoring dashboard báo Kafka consumer lag đang tăng, hiện đã 50,000 messages. Data trên FE chậm khoảng 2 phút so với thực tế.

**Gợi ý:**
- Consumer lag = messages chưa được xử lý
- Kiểm tra consumer service có đang chạy không
- Consumer có thể chậm vì xử lý nặng, hoặc bị stuck

**Câu hỏi:**
1. Lệnh nào để xem consumer lag chi tiết?
2. Nếu consumer service đang chạy nhưng lag vẫn tăng, nguyên nhân có thể là gì?
3. Khác biệt giữa "consumer chết" và "consumer chậm" trong log?

---

## Kịch bản 3: gRPC timeout từ logics đến source_service

**Triệu chứng:** Một số API calls từ FE bị lỗi 500. Log logics hiển thị:
```json
{"level":"error","tags":["marketService.getPrice"],"error":"14 UNAVAILABLE: No connection established","msg":"gRPC call failed"}
```

**Gợi ý:**
- Error code 14 = UNAVAILABLE trong gRPC
- Kiểm tra source_service (:3334, gRPC :9004)
- "No connection established" có thể do service chết hoặc network

**Câu hỏi:**
1. Lệnh kiểm tra source_service có đang listen trên gRPC port không?
2. Nếu source_service đang chạy nhưng vẫn UNAVAILABLE, nguyên nhân khác có thể là gì?
3. Bạn sẽ kiểm tra gì trong `/tmp/source_service.log`?

---

## Kịch bản 4: API analytics trả về data rỗng

**Triệu chứng:** FE gọi API analytics overview, response trả về nhưng tất cả số liệu đều = 0. Tuần trước data bình thường.

**Gợi ý:**
- analyticsService query MongoDB collection analysisEvents
- Data rỗng có thể do: query sai, data chưa được ghi, timezone lệch
- Kiểm tra trực tiếp trong MongoDB xem data có không

**Câu hỏi:**
1. Lệnh MongoDB nào để kiểm tra xem collection analysisEvents có data trong khoảng thời gian query không?
2. Nếu MongoDB có data nhưng API trả rỗng, bạn kiểm tra gì trong code?
3. Timezone UTC vs local có thể gây ra vấn đề gì với `$gte` và `$lte`?

---

## Kịch bản 5: message_stream container restart liên tục

**Triệu chứng:** `docker ps` hiển thị message_stream container đang chạy nhưng uptime chỉ 30 giây. Sau vài phút lại thấy uptime reset về 0.

```
NAMES                              STATUS
message_stream-message_stream-1    Up 30 seconds (Restarting)
```

**Gợi ý:**
- Container restart loop = crash rồi Docker tự khởi động lại
- Cần xem log trước khi crash
- Có thể do OOM, config sai, hoặc dependency không available

**Câu hỏi:**
1. Lệnh nào xem log của container đã restart nhiều lần?
2. Nếu log cuối cùng trước khi crash là "JavaScript heap out of memory", bạn fix thế nào?
3. Nếu log có "Error: connect ECONNREFUSED localhost:9093", nguyên nhân là gì?

---

## Kịch bản 6: MongoDB query chậm đột ngột

**Triệu chứng:** API `/api/v1/analytics/event-counts` trước trả về trong 200ms, giờ mất 15 giây. Không có code change nào gần đây.

**Gợi ý:**
- Query chậm đột ngột khi data tăng hoặc index bị drop
- Kiểm tra explain plan
- Collection analysisEvents có 100M+ rows

**Câu hỏi:**
1. Lệnh MongoDB nào để kiểm tra query đang dùng index hay full collection scan?
2. Lệnh nào để xem tất cả indexes của collection analysisEvents?
3. Nếu explain cho thấy COLLSCAN thay vì IXSCAN, bạn kết luận gì?

---

## Kịch bản 7: Data bị duplicate trên FE

**Triệu chứng:** Trang portfolio hiển thị cùng 1 cổ phiếu 2 lần. Database chỉ có 1 record. Refresh trang vẫn bị duplicate.

**Gợi ý:**
- FE hiển thị duplicate nhưng DB chỉ có 1 → vấn đề ở API response hoặc FE rendering
- Kiểm tra API response trực tiếp (curl)
- Có thể do Kafka message bị consume 2 lần

**Câu hỏi:**
1. Lệnh curl nào để kiểm tra API response có bị duplicate không?
2. Nếu API response chỉ có 1 record, vấn đề ở đâu?
3. Nếu API response có 2 records giống nhau, bạn kiểm tra gì ở BE?

---

## Kịch bản 8: Service A gọi Service B thành công, nhưng Service B không xử lý

**Triệu chứng:** logics emit Kafka message "portfolio.rebalance". Log logics cho thấy emit thành công. Nhưng portfolio không được rebalance. data_aggregation (:3335) là consumer nhưng log không có dấu hiệu nhận message.

**Gợi ý:**
- Emit thành công ≠ consumer nhận được
- Kiểm tra: topic đúng chưa, consumer group đúng chưa, consumer có subscribe topic này chưa

**Câu hỏi:**
1. Lệnh Kafka nào để kiểm tra message có trong topic không?
2. Lệnh nào để kiểm tra consumer group có subscribe topic này không?
3. Nếu topic có message nhưng consumer không nhận, nguyên nhân phổ biến là gì?

---

## Kịch bản 9: Lỗi xảy ra chỉ vào giờ cao điểm (9:00-9:30 sáng)

**Triệu chứng:** Mỗi sáng từ 9:00-9:30 (mở cửa sàn), log logics có nhiều error "MongoNetworkTimeoutError". Sau 9:30 hết lỗi, mọi thứ bình thường.

**Gợi ý:**
- Giờ cao điểm = nhiều request + nhiều data cập nhật cùng lúc
- MongoDB connection pool có thể không đủ
- Source_service gửi quá nhiều message, downstream quá tải

**Câu hỏi:**
1. Bạn kiểm tra resource nào của MongoDB instance?
2. Connection pool size ảnh hưởng thế nào khi concurrent requests tăng đột ngột?
3. Giải pháp nào để giảm load lên MongoDB trong giờ cao điểm?

---

## Kịch bản 10: Sau khi deploy code mới, 1 API bị 500

**Triệu chứng:** Vừa deploy code mới lên logics. API `/api/v1/rooms/list` trả 500. Các API khác bình thường. Log:
```json
{"level":"error","tags":["roomsController.list"],"error":"util.gp is not a function","msg":"Unhandled error"}
```

**Gợi ý:**
- "util.gp is not a function" → import bị thiếu hoặc sai
- Chỉ 1 API lỗi → vấn đề cụ thể ở controller/route đó
- Code mới có thể thiếu import hoặc typo

**Câu hỏi:**
1. Bạn kiểm tra file nào đầu tiên?
2. "util.gp is not a function" gợi ý vấn đề gì cụ thể?
3. Lệnh nào để kiểm tra code vừa thay đổi so với version trước?

---

## Cách tự kiểm tra

Với mỗi kịch bản, viết ra:

1. **3-5 lệnh** bạn sẽ chạy, theo thứ tự
2. **Nguyên nhân** có thể (ít nhất 2 khả năng)
3. **Cách fix** cho mỗi nguyên nhân

So sánh với các bài đã học:
- `01-system-overview.md` -- biết service nào, port nào
- `02-trace-data-flow.md` -- biết cách trace ngược
- `03-read-multiple-logs.md` -- biết cách đọc log
- `04-common-patterns.md` -- nhận diện pattern
- `05-debug-checklist.md` -- quy trình 10 bước
