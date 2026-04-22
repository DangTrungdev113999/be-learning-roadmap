# Error Handling trong Pub/Sub

## Mục tiêu

Hiểu cách xử lý lỗi trong hệ thống message queue: retry, idempotency, và dead letter queue.

---

## 1. Vấn đề: Message xử lý thất bại

Khi consumer xử lý message bị lỗi (DB timeout, external API down, bug), cần trả lời câu hỏi:

- Message đó có **bị mất** không?
- Có **retry** không? Bao nhiêu lần?
- Nếu retry nhiều lần vẫn lỗi thì sao?
- Nếu retry thành công, có bị **xử lý 2 lần** không?

---

## 2. Retry trong logics

### Consumer-level retry

```typescript
// app/Services/kafkaService/constants.ts
const TASK_DEFAULTS = {
  retry: 12,   // Consumer retry 12 lần khi lỗi
}
```

```typescript
// task.on() -- truyền retry vào consumer config
const opts: SubscribeOptions = {
  retry: TASK_DEFAULTS.retry,   // 12
  ...options,
}
```

Khi handler throw error, Kafka consumer tự động retry message đó. Sau 12 lần thất bại, consumer dừng hẳn cho topic đó.

### Publisher-level retry

```typescript
// app/Services/kafkaService/libs/kafka.ts
async pub(topic: string, message: any, tries = 1) {
  try {
    await kafka.producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    })
  } catch (error) {
    if (tries > MAX_PUBLISH_RETRIES) {    // MAX = 3
      log.error({ error }, 'Producer send error')
      return
    }
    return await kafka.pub(topic, message, tries + 1)   // Retry
  }
}
```

Nếu gửi message thất bại (Kafka broker tạm disconnect), retry tối đa 3 lần.

### Connection-level retry

```typescript
// app/Services/kafkaService/libs/kafka.ts
const options: KafkaConfig = {
  retry: {
    initialRetryTime: 200,   // Retry sau 200ms
    retries: 100,            // Tối đa 100 lần
  },
}
```

Nếu kết nối Kafka bị mất, client tự reconnect (tối đa 100 lần, bắt đầu sau 200ms, tăng dần).

### Tổng hợp các tầng retry

```
Tầng 1: Connection retry     (100 lần)  -- Kết nối lại Kafka broker
Tầng 2: Publisher retry      (3 lần)    -- Gửi lại message
Tầng 3: Consumer retry       (12 lần)   -- Xử lý lại message
Tầng 4: Consumer restart     (3 lần)    -- Khởi động lại consumer

→ Rất khó để message bị mất hoàn toàn
```

---

## 3. Idempotency -- Xử lý 2 lần không sao

### Vấn đề

Khi retry, cùng 1 message có thể được xử lý **nhiều hơn 1 lần**:

```
Tình huống: Consumer xử lý xong nhưng chưa kịp commit offset → crash
→ Khi restart, consumer đọc lại message → xử lý lần 2

Ví dụ xấu:
  Lần 1: Trừ 1 triệu trong tài khoản user → thành công
  Lần 2: Trừ thêm 1 triệu → user mất 2 triệu ❌
```

### Giải pháp: Viết handler idempotent

**Idempotent** = chạy 1 lần hay 10 lần đều cho kết quả giống nhau.

```typescript
// ❌ KHÔNG idempotent -- chạy 2 lần = trừ 2 lần
kafkaService.on('payment.deduct', async (data) => {
  await mongo.accounts.updateOne(
    { userId: data.userId },
    { $inc: { balance: -data.amount } }   // Mỗi lần chạy trừ thêm
  )
})

// ✅ Idempotent -- dùng transactionId để kiểm tra đã xử lý chưa
kafkaService.on('payment.deduct', async (data) => {
  const existing = await mongo.transactions.findOne({ _id: data.transactionId })
  if (existing) return   // Đã xử lý rồi, bỏ qua

  await mongo.transactions.create({ _id: data.transactionId, status: 'completed' })
  await mongo.accounts.updateOne(
    { userId: data.userId },
    { $inc: { balance: -data.amount } }
  )
})
```

### Các kỹ thuật idempotency phổ biến

| Kỹ thuật | Giải thích | Ví dụ |
|---|---|---|
| Unique ID check | Kiểm tra ID đã xử lý chưa trước khi xử lý | `findOne({ transactionId })` |
| Upsert thay vì insert | Tạo hoặc cập nhật, không duplicate | `updateOne({ _id }, data, { upsert: true })` |
| Status check | Kiểm tra trạng thái trước khi thay đổi | `if (order.status === 'pending')` |
| $set thay vì $inc | Đặt giá trị tuyệt đối thay vì tăng/giảm | `$set: { balance: 500 }` thay vì `$inc: { balance: -100 }` |

### Ví dụ thật: rollback payment

```typescript
// tasks/payment.ts
kafkaService.on('payment.rollback_expired_atx_deposit', async (data: { transactionId: string }) => {
  await paymentService.rollbackExpiredATXDeposit(data.transactionId)
})
```

Hàm `rollbackExpiredATXDeposit` nhận `transactionId` cụ thể. Nếu transaction đã được rollback rồi (status đã là 'rolled_back'), gọi lần 2 sẽ không làm gì thêm.

---

## 4. Dead Letter Queue (DLQ) -- Khái niệm

Khi message retry hết số lần vẫn thất bại, cần một nơi lưu lại để điều tra sau. Đó là **Dead Letter Queue**.

```
                    ┌──────────┐
                    │ Consumer │
 ┌────────┐        │          │     Thành công ──> ✅ Done
 │ Topic  │ ──────>│  Retry   │
 └────────┘        │  1..12   │     Thất bại hết ──> DLQ
                    └──────────┘                      │
                                                      ▼
                                              ┌──────────────┐
                                              │  Dead Letter  │
                                              │  Queue        │
                                              │               │
                                              │ - Message gốc │
                                              │ - Error info  │
                                              │ - Retry count │
                                              └──────────────┘
                                                      │
                                                      ▼
                                              Dev kiểm tra và
                                              xử lý thủ công
```

### DLQ trong logics

Hiện tại logics không implement DLQ riêng. Thay vào đó:

1. **Consumer retry 12 lần** -- đủ cho hầu hết lỗi tạm thời
2. **restartOnFailure: false** -- sau khi retry hết, consumer **dừng** (không restart vô hạn)
3. **Log error** -- team monitor log để phát hiện

```typescript
// Code thật -- kafka.ts
const consumer = kafka.client.consumer({
  groupId: options.group!,
  retry: {
    retries: options.retry!,
    restartOnFailure: async (error) => {
      log.error({ topic, error }, 'All retries failed')
      return false   // ← Không restart, dừng hẳn
    },
  },
})
```

### Khi nào cần DLQ thật?

- Hệ thống xử lý hàng triệu messages/ngày
- Cần đảm bảo không mất message nào
- Cần tự động replay messages sau khi fix bug

Đối với hệ thống vừa phải, log + alert + manual intervention đủ dùng.

---

## 5. Offset commit -- Khi nào đánh dấu "đã xử lý"?

```typescript
// Code thật -- kafka.ts
await consumer.run({
  eachBatch: async ({ batch, resolveOffset, commitOffsetsIfNecessary }) => {
    for (const message of batch.messages) {
      await handler(/* xử lý message */)      // 1. Xử lý trước
      resolveOffset(message.offset)             // 2. Đánh dấu offset
      await commitOffsetsIfNecessary()          // 3. Commit offset
    }
  },
})
```

**Thứ tự quan trọng:**
1. Xử lý message **trước**
2. Commit offset **sau**

Nếu làm ngược lại (commit trước, xử lý sau), khi crash giữa chừng sẽ mất message.

```
✅ Đúng: Xử lý → Commit → Crash → Message đã xử lý, offset đã commit
✅ Đúng: Xử lý → Crash (trước commit) → Restart → Xử lý lại (nên cần idempotent)
❌ Sai:  Commit → Crash (trước xử lý) → Restart → Bỏ qua message → MẤT DATA
```

---

## 6. So sánh với FE error handling

| Khía cạnh | FE | BE (Kafka) |
|---|---|---|
| Retry | `axios.interceptors` retry request | Consumer tự retry message |
| Duplicate | API gọi 2 lần → debounce/disable button | Message xử lý 2 lần → idempotency |
| Error boundary | React Error Boundary catch render errors | `restartOnFailure` + log |
| Offline queue | Service Worker cache requests | Kafka lưu messages trên disk |
| State consistency | Optimistic update + rollback | Idempotent handlers |

---

## Tóm tắt

| Khái niệm | Giải thích |
|---|---|
| Retry (Publisher) | Gửi message thất bại → retry tối đa 3 lần |
| Retry (Consumer) | Xử lý thất bại → retry tối đa 12 lần |
| Idempotency | Xử lý nhiều lần cho kết quả giống nhau |
| Dead Letter Queue | Nơi lưu message retry hết vẫn thất bại |
| Offset commit | Commit SAU khi xử lý xong, tránh mất message |
| At-least-once | Kafka đảm bảo message được xử lý ít nhất 1 lần (có thể hơn) |
