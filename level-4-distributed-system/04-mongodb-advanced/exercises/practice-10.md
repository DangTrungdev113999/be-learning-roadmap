# 10 bài tập MongoDB Advanced

## Hướng dẫn

Mỗi bài tập có đề bài, dữ liệu mẫu, và yêu cầu cụ thể. Viết aggregation pipeline, tạo index, hoặc phân tích explain output. Kiểm tra bằng cách chạy trên MongoDB shell.

---

## Bài 1: Viết aggregation đếm events theo tuần

**Đề bài:** Viết aggregation pipeline đếm số lượng events có key = 'page_view' theo từng tuần, trong 30 ngày gần nhất.

**Dữ liệu mẫu (collection: analysisEvents):**

```javascript
{ key: 'page_view', uid: 'u1', createdAt: ISODate('2026-03-01T10:00:00Z') }
{ key: 'page_view', uid: 'u2', createdAt: ISODate('2026-03-01T11:00:00Z') }
{ key: 'click',     uid: 'u1', createdAt: ISODate('2026-03-02T09:00:00Z') }
{ key: 'page_view', uid: 'u1', createdAt: ISODate('2026-03-08T10:00:00Z') }
```

**Yêu cầu:**
1. Viết pipeline hoàn chỉnh
2. Output format: `{ week: '2026-W09', count: 150 }`
3. Sắp xếp theo tuần tăng dần
4. Pipeline nào dùng cho bài này -- getEventCounts hay getActiveUsers? Tại sao?

**Gợi ý:** `$dateToString` format cho tuần là `'%Y-W%V'`

---

## Bài 2: Đếm unique users theo ngày (double group)

**Đề bài:** Viết pipeline đếm số users unique hoạt động mỗi ngày. User tạo nhiều events trong ngày chỉ tính 1 lần.

**Dữ liệu mẫu:**

```javascript
{ key: 'page_view', uid: 'u1', createdAt: ISODate('2026-03-18T10:00:00Z') }
{ key: 'page_view', uid: 'u1', createdAt: ISODate('2026-03-18T10:05:00Z') }  // u1 lặp lại
{ key: 'page_view', uid: 'u2', createdAt: ISODate('2026-03-18T11:00:00Z') }
{ key: 'click',     uid: 'u1', createdAt: ISODate('2026-03-18T12:00:00Z') }  // u1 event khác
{ key: 'page_view', uid: 'u1', createdAt: ISODate('2026-03-19T09:00:00Z') }
```

**Yêu cầu:**
1. Viết pipeline dùng **double group pattern**
2. Output: `{ date: '2026-03-18', count: 2 }` (u1 và u2)
3. Giải thích tại sao double group tốt hơn $addToSet ở đây

---

## Bài 3: Top 5 cổ phiếu được xem nhiều nhất

**Đề bài:** Viết pipeline tìm top 5 cổ phiếu (stockId) được xem nhiều nhất trong 7 ngày gần nhất.

**Dữ liệu mẫu:**

```javascript
{ key: 'stock_view', stockId: 'VNM', uid: 'u1', createdAt: ISODate('2026-03-18T10:00:00Z') }
{ key: 'stock_view', stockId: 'FPT', uid: 'u2', createdAt: ISODate('2026-03-18T10:01:00Z') }
{ key: 'stock_view', stockId: 'VNM', uid: 'u2', createdAt: ISODate('2026-03-18T10:02:00Z') }
{ key: 'stock_view', stockId: null,  uid: 'u3', createdAt: ISODate('2026-03-18T10:03:00Z') }
{ key: 'click',      stockId: 'VNM', uid: 'u1', createdAt: ISODate('2026-03-18T10:04:00Z') }
```

**Yêu cầu:**
1. Viết pipeline hoàn chỉnh (tham khảo getTopContent)
2. Phải loại bỏ documents có stockId = null
3. Chỉ đếm events có key = 'stock_view' (bỏ qua 'click')
4. Output: `{ id: 'VNM', count: 2 }`

---

## Bài 4: Thiết kế compound index

**Đề bài:** Cho 3 queries sau, thiết kế index tối ưu cho mỗi query. Giải thích lý do dùng ESR rule.

**Query A:**
```javascript
db.orders.find({ userId: 'u123', status: 'completed' }).sort({ createdAt: -1 })
```

**Query B:**
```javascript
db.orders.find({ status: 'pending', createdAt: { $gte: sevenDaysAgo } })
```

**Query C:**
```javascript
db.orders.find({ userId: 'u123', createdAt: { $gte: thirtyDaysAgo } }).sort({ amount: -1 })
```

**Yêu cầu:**
1. Viết index definition cho mỗi query
2. Xác định mỗi field là Equality, Sort, hay Range
3. Có thể gộp 2 queries dùng chung 1 index không?

---

## Bài 5: Đọc explain output

**Đề bài:** Phân tích explain output sau và trả lời câu hỏi.

**Explain output:**

```json
{
  "executionStats": {
    "nReturned": 350,
    "executionTimeMillis": 28500,
    "totalKeysExamined": 0,
    "totalDocsExamined": 85000000
  },
  "winningPlan": {
    "stage": "COLLSCAN",
    "filter": {
      "$and": [
        { "key": { "$eq": "purchase" } },
        { "createdAt": { "$gte": "2026-01-01T00:00:00Z" } }
      ]
    }
  }
}
```

**Câu hỏi:**
1. Query này nhanh hay chậm? Tại sao?
2. Stage "COLLSCAN" nghĩa là gì?
3. Tỉ lệ totalDocsExamined / nReturned là bao nhiêu? Nghĩa là gì?
4. Viết index nào để tối ưu query này?
5. Sau khi thêm index, ước tính executionTimeMillis sẽ giảm bao nhiêu?

---

## Bài 6: Optimize slow query

**Đề bài:** Query sau mất 12 giây trên collection 80M documents. Tối ưu nó.

```typescript
const result = await mongo.analysisEvents.aggregate([
  { $sort: { createdAt: -1 } },
  { $match: { key: 'page_view', createdAt: { $gte: sixtyDaysAgo } } },
  { $group: { _id: '$uid', eventCount: { $sum: 1 } } },
  { $match: { eventCount: { $gte: 10 } } },
  { $sort: { eventCount: -1 } },
  { $limit: 50 },
])
```

**Yêu cầu:**
1. Tìm **ít nhất 3 vấn đề** trong pipeline trên
2. Viết lại pipeline đã tối ưu
3. Thêm `.allowDiskUse(true)` có cần không? Tại sao?
4. Index nào cần thiết?

---

## Bài 7: $lookup và $unwind

**Đề bài:** Viết pipeline lấy top 10 rooms có nhiều portfolios nhất, kèm tên room.

**Collections:**
- `portfolios`: `{ userId, roomId, isDeleted, profit }`
- `rooms`: `{ _id, name, createdBy }`

**Yêu cầu:**
1. Đếm portfolios (chưa xoá) theo roomId
2. $lookup để lấy tên room
3. $unwind kết quả lookup
4. Output: `{ roomName: 'Room Alpha', portfolioCount: 150, avgProfit: 12.5 }`

---

## Bài 8: Phân tích index của collection thật

**Đề bài:** Collection portfolios có index sau:

```typescript
schema.index({ userId: 1, roomId: 1, isDeleted: 1 })
```

**Câu hỏi:**
1. Query nào dùng được index này? (liệt kê 3 ví dụ)
2. Query nào KHÔNG dùng được? (liệt kê 2 ví dụ)
3. Nếu thêm query mới: `db.portfolios.find({ roomId: 'r1', isDeleted: false }).sort({ createdAt: -1 })`, index hiện tại có giúp được không? Tại sao?
4. Cần tạo index mới nào cho query trên?

---

## Bài 9: $facet -- Dashboard 1 query

**Đề bài:** Dashboard analytics cần 3 metrics cùng lúc cho 1 khoảng thời gian:
- Tổng số events
- Số unique users
- Top 5 events theo key

Viết 1 aggregation pipeline dùng $facet để lấy cả 3 metrics.

**Yêu cầu:**
1. Viết pipeline hoàn chỉnh dùng $facet
2. $match chung trước $facet (filter date range)
3. Mỗi facet branch xử lý 1 metric
4. So sánh: chạy 3 queries riêng vs 1 query $facet -- ưu/nhược điểm?

---

## Bài 10: Case study mini -- Tối ưu collection mới

**Đề bài:** Team vừa tạo collection `userSessions` để lưu phiên đăng nhập. Collection đang có 5M documents và tăng 100K/ngày.

**Schema:**

```javascript
{
  userId: String,
  device: String,       // 'ios', 'android', 'web'
  startedAt: Date,
  endedAt: Date,        // null nếu đang active
  duration: Number,     // giây
  isActive: Boolean
}
```

**Queries thường dùng:**
1. Tìm sessions active của 1 user: `{ userId: 'u1', isActive: true }`
2. Đếm sessions theo device mỗi ngày: group by device + date
3. Tìm sessions > 1 giờ cho monitoring: `{ duration: { $gte: 3600 } }`
4. Xoá sessions cũ hơn 90 ngày (tự động)

**Yêu cầu:**
1. Thiết kế **tất cả indexes** cần thiết (giải thích ESR cho mỗi index)
2. Viết aggregation cho query 2 (đếm sessions theo device mỗi ngày)
3. Loại index nào dùng cho query 4 (tự động xoá)?
4. Khi collection đạt 50M docs, cần thay đổi gì?

---

## Cách tự kiểm tra

### Chạy trên MongoDB shell

```bash
# Kết nối
mongosh "mongodb://localhost:27017/logics"

# Tạo test data
db.testCollection.insertMany([
  { key: 'view', uid: 'u1', createdAt: new Date('2026-03-18') },
  { key: 'view', uid: 'u2', createdAt: new Date('2026-03-18') },
  // ... thêm data
])

# Chạy pipeline
db.testCollection.aggregate([ ... ])

# Kiểm tra explain
db.testCollection.aggregate([ ... ]).explain('executionStats')

# Xoá test data
db.testCollection.drop()
```

### Checklist cho mỗi bài

```
[ ] Pipeline chạy không lỗi
[ ] Output format đúng yêu cầu
[ ] $match đặt đầu tiên
[ ] Index được dùng (IXSCAN, không COLLSCAN)
[ ] allowDiskUse nếu data lớn
```
