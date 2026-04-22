# Message Queue là gì?

## Mục tiêu

Hiểu khái niệm message queue, tại sao cần nó, và so sánh với những thứ quen thuộc bên FE.

---

## 1. Khái niệm đơn giản

Message queue là một **hàng đợi tin nhắn** giữa các phần của hệ thống. Thay vì gọi trực tiếp, bên gửi (producer) đặt tin nhắn vào hàng đợi, bên nhận (consumer) tự lấy ra xử lý.

```
┌──────────┐     ┌─────────────┐     ┌──────────┐
│ Producer │ ──> │   Queue     │ ──> │ Consumer │
│ (gửi)    │     │ (hàng đợi)  │     │ (nhận)   │
└──────────┘     └─────────────┘     └──────────┘
```

Giống như **bỏ thư vào hộp thư** -- người gửi không cần đợi người nhận đọc xong mới đi làm việc khác.

---

## 2. So sánh với FE -- Những thứ bạn đã biết

### EventEmitter / DOM Events

```typescript
// FE: Click button -> handler xử lý
button.addEventListener('click', handleClick)

// BE: Kafka message -> handler xử lý
kafkaService.on('portfolio.stopLoss', portfolioService.handleStopLoss)
```

**Giống nhau:** Đều là pattern "ai đó phát sự kiện, ai đó lắng nghe và xử lý".

**Khác nhau:** EventEmitter chạy trong 1 process, mất khi app tắt. Kafka chạy trên server riêng, tin nhắn **không mất** khi app restart.

### Redux dispatch

```typescript
// FE: dispatch action -> reducer xử lý
dispatch({ type: 'ORDER_PLACED', payload: { orderId: '123' } })

// BE: emit message -> consumer xử lý
await kafkaService.emit('portfolio.stopLoss', { orderId: '123' })
```

**Giống nhau:** Đều gửi một "action/message" kèm data, không quan tâm ai xử lý.

**Khác nhau:** Redux xử lý **đồng bộ** trong cùng app. Kafka xử lý **bất đồng bộ**, có thể ở server khác, thời điểm khác.

### So sánh tổng hợp

| Đặc điểm | EventEmitter / Redux | Message Queue (Kafka) |
|---|---|---|
| Chạy ở đâu | Trong 1 process | Server riêng biệt |
| Mất data khi restart | Có | Không |
| Cross-service | Không | Có |
| Retry tự động | Không | Có |
| Xử lý | Tức thì (sync) | Bất đồng bộ |

---

## 3. Tại sao cần Message Queue?

### Vấn đề 1: Coupling (phụ thuộc chặt)

**Không có queue:** Khi user đặt lệnh, controller phải gọi trực tiếp tất cả service.

```typescript
// ❌ Controller phải biết và gọi tất cả
async placeOrder(orderId) {
  await portfolioService.updatePortfolio(orderId)
  await notificationService.sendPushNotification(orderId)
  await analysisService.logEvent(orderId)
  await syncService.syncToPartner(orderId)
  // Thêm feature mới? Phải sửa controller!
}
```

**Có queue:** Controller chỉ phát 1 message, ai cần thì tự nghe.

```typescript
// ✅ Controller chỉ emit, không cần biết ai xử lý
async placeOrder(orderId) {
  await kafkaService.emit('order.placed', { orderId })
  // Thêm feature mới? Thêm 1 consumer, KHÔNG sửa chỗ này
}
```

### Vấn đề 2: Async processing (xử lý nặng)

Một số tác vụ mất nhiều thời gian. Nếu chạy đồng bộ, user phải đợi.

```typescript
// ❌ User đợi 5 giây
app.post('/order', async (req, res) => {
  await createOrder()           // 100ms
  await calculateProfit()       // 2000ms ← chậm
  await syncToExternalAPI()     // 3000ms ← chậm
  res.json({ success: true })   // User đợi 5.1 giây
})

// ✅ User nhận response ngay
app.post('/order', async (req, res) => {
  await createOrder()                                      // 100ms
  await kafkaService.emit('portfolio.calculateProfit', {}) // 5ms
  await kafkaService.emit('sync.external', {})             // 5ms
  res.json({ success: true })                              // User đợi 110ms
})
```

### Vấn đề 3: Resilience (chịu lỗi)

Khi service B bị lỗi, message vẫn nằm trong queue. Khi B hoạt động lại, tự lấy message ra xử lý. Không mất data.

```
Gọi trực tiếp:    A ──> B (lỗi) ──> MẤT DATA ❌
Qua queue:         A ──> Queue ──> B (lỗi) ──> B (phục hồi) ──> Xử lý lại ✅
```

---

## 4. Kafka là gì?

Kafka là một message queue phổ biến, được phát triển bởi LinkedIn. Đặc điểm:

- **Nhanh:** Xử lý hàng triệu messages/giây
- **Bền:** Messages được lưu trên disk, không mất khi restart
- **Scalable:** Thêm consumer dễ dàng khi cần xử lý nhanh hơn
- **Ordering:** Messages trong cùng partition được xử lý theo thứ tự

Trong dự án logics, Kafka được dùng để giao tiếp giữa các service: stop loss, take profit, sync dữ liệu, xử lý payment, v.v.

---

## 5. Khi nào dùng, khi nào không?

### Nên dùng message queue

- Tác vụ nặng không cần trả kết quả ngay (gửi email, tính toán, sync)
- Nhiều service cần biết về cùng 1 sự kiện
- Cần retry khi lỗi
- Cần decouple giữa các service

### Không cần message queue

- Cần kết quả ngay lập tức (kiểm tra số dư trước khi đặt lệnh)
- Logic đơn giản trong cùng 1 service
- Hệ thống nhỏ, 1 server duy nhất

---

## Tóm tắt

| Khái niệm | Giải thích |
|---|---|
| Message Queue | Hàng đợi tin nhắn giữa các phần hệ thống |
| Producer | Bên gửi tin nhắn |
| Consumer | Bên nhận và xử lý tin nhắn |
| Kafka | Một loại message queue phổ biến, nhanh, bền |
| Decoupling | Producer không cần biết consumer là ai |
| Async | Gửi xong đi làm việc khác, không đợi |
| Resilience | Message không mất khi consumer bị lỗi |
