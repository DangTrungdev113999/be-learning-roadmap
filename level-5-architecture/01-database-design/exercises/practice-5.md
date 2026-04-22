# Bài tập Database Design -- 5 bài thực hành

## Bài 1: Thiết kế Schema cho tính năng mới

### Đề bài

Finpath muốn thêm tính năng **"Nhật ký giao dịch"** (Trading Journal). Mỗi user có thể tạo journal entries sau khi mua/bán cổ phiếu để ghi lại lý do, tâm lý, bài học.

**Yêu cầu:**
- Mỗi entry gắn với 1 mã cổ phiếu và 1 order (nếu có)
- Entry có: tiêu đề, nội dung (rich text), tags, ảnh đính kèm (tối đa 5)
- Mỗi entry có thể có ghi chú sau (follow-up notes) -- thêm sau vài ngày
- User có thể tìm kiếm entries theo mã, theo tag, theo khoảng thời gian
- Hiển thị feed journal entries với tên + avatar user

### Yêu cầu

1. Thiết kế schema cho collection `tradingJournals`
2. Quyết định: embed hay reference cho user info, order info, follow-up notes?
3. Thiết kế indexes dựa trên query patterns
4. Ước lượng document size trung bình

### Gợi ý

- Xem cách `posts.ts` embed `creator` (Subset pattern)
- Xem cách `watchLists.ts` lưu `symbols`
- Follow-up notes: có thể phình vô hạn không?

---

## Bài 2: Chọn Embed vs Reference

### Đề bài

Cho 4 tình huống, mỗi tình huống chọn Embed hay Reference và giải thích.

**Tình huống A:** Collection `experts` cần hiển thị danh sách rooms mà expert quản lý (mỗi expert tối đa 5 rooms).

**Tình huống B:** Collection `orders` cần lưu lịch sử thay đổi giá (price history). Mỗi order có thể có 0-1000 thay đổi giá trong ngày.

**Tình huống C:** Collection `chatMessages` cần hiển thị tên + avatar người gửi. Chat có hàng triệu messages.

**Tình huống D:** Collection `portfolios` cần lưu danh sách cổ phiếu đang nắm giữ. Mỗi portfolio tối đa 50 mã.

### Yêu cầu

Cho mỗi tình huống:
1. Chọn Embed hay Reference
2. Giải thích dựa trên tiêu chí: tần suất thay đổi, giới hạn số lượng, có cần query độc lập không
3. Viết schema mẫu (Mongoose syntax)

---

## Bài 3: Thiết kế Index cho query phức tạp

### Đề bài

Collection `orders` có schema:

```ts
{
  userId: ObjectId,
  symbol: String,            // 'VNM', 'FPT', ...
  side: String,              // 'buy', 'sell'
  status: String,            // 'pending', 'matched', 'cancelled'
  price: Number,
  quantity: Number,
  matchedPrice: Number,
  matchedAt: Date,
  createdAt: Date,
  isDeleted: Boolean,
}
```

**Query patterns:**
1. Lấy tất cả orders pending của 1 user, sắp xếp theo createdAt mới nhất
2. Đếm tổng orders matched trong 30 ngày gần nhất
3. Lấy orders của 1 user cho 1 symbol cụ thể, status matched
4. Tìm orders matched trong 1 khoảng giá (price range)
5. Admin: lấy tất cả orders pending, sắp xếp theo createdAt

### Yêu cầu

1. Viết compound index cho mỗi query pattern theo ESR rule
2. Kiểm tra prefix rule: index nào phục vụ được nhiều queries?
3. Tối ưu: giảm số indexes xuống tối thiểu mà vẫn phục vụ tất cả queries
4. Query nào có thể là covering query? Index cần gì thêm?
5. Cân nhắc: nên dùng partial index cho queries nào?

---

## Bài 4: Viết Migration Script

### Đề bài

Collection `users` (200,000 documents) cần migration:

**Trước:**
```ts
{
  bank: {
    name: 'Vietcombank',
    code: 'VCB',
    number: '0123456789',
    beneficiary: 'NGUYEN VAN A',
  },
}
```

**Sau:**
```ts
{
  bank: { ... },  // Giữ nguyên field cũ (backward compatible)
  banks: [         // Field mới: array nhiều bank accounts
    {
      name: 'Vietcombank',
      code: 'VCB',
      number: '0123456789',
      beneficiary: 'NGUYEN VAN A',
    },
  ],
}
```

### Yêu cầu

1. Viết kế hoạch migration theo expand-contract pattern (4 bước)
2. Viết script backfill: copy data từ `bank` sang `banks[0]`
3. Script phải: chạy theo batch (1000/batch), idempotent (chạy lại an toàn), có logging
4. Viết function `getUserBanks(user)` xử lý backward compatible (đọc từ banks, fallback bank)
5. Ước tính thời gian chạy script (200K documents, batch 1000, throttle 100ms giữa batches)

### Gợi ý

Xem `users.ts` thực tế -- field `bank` và `banks` đã tồn tại! Đây là migration thật.

---

## Bài 5: Thiết kế Scaling cho Collection 100M+ rows

### Đề bài

Collection `analysisEvents` hiện có 150 triệu documents và tăng 2 triệu documents/ngày. Schema:

```ts
{
  uid: String,        // userId
  key: String,        // event name (~50 unique values)
  val: Object,        // event data (dynamic)
  src: String,        // source: 'web', 'app', 'api'
  createdAt: Date,
}
```

**Query patterns chính:**
1. Đếm events của 1 user trong N ngày gần nhất (filtered by key)
2. Đếm unique users có event X trong N ngày
3. Aggregate events theo ngày cho báo cáo (admin dashboard)
4. Xóa events cũ hơn 90 ngày

### Yêu cầu

1. **Index strategy:** Thiết kế indexes cho 4 query patterns trên. Giải thích ESR cho mỗi cái.
2. **TTL:** Thiết kế TTL index cho auto-cleanup 90 ngày. Lưu ý gì?
3. **Sharding:** Nếu cần shard, chọn shard key nào? Phân tích pros/cons của ít nhất 3 options.
4. **Bucket pattern:** Data này có phù hợp với bucket pattern không? Thiết kế bucket schema nếu có.
5. **Read replica:** Query nào nên đọc từ slave? Query nào bắt buộc đọc primary?
6. **Estimate:** Với tốc độ 2M docs/ngày, bao lâu nữa collection đạt 1 tỷ documents? Cần hành động gì trước khi đạt ngưỡng đó?

---

## Tiêu chí đánh giá

| Tiêu chí | Mô tả |
|---|---|
| Schema hợp lý | Embed/Reference đúng chỗ, có giới hạn array, có default values |
| Index hiệu quả | Theo ESR, phục vụ actual query patterns, không thừa |
| Migration an toàn | Backward compatible, batch update, idempotent |
| Scaling phù hợp | Chọn đúng strategy cho đúng vấn đề |
| Trade-offs rõ ràng | Nêu được ưu/nhược của mỗi quyết định |
