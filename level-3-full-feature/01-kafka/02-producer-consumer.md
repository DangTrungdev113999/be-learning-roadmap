# Producer - Consumer Pattern

## Mục tiêu

Hiểu cách Producer gửi message, Consumer nhận message, và khái niệm Topic trong Kafka.

---

## 1. Producer -- Người gửi

Producer là bên **tạo và gửi** message vào Kafka. Trong dự án logics, producer dùng `kafkaService.emit()`:

```typescript
// Khi user đặt lệnh stop loss, controller emit message
await kafkaService.emit('portfolio.stopLoss', { orderId })
```

Producer chỉ cần biết 2 thứ:
- **Topic name**: gửi vào kênh nào (`'portfolio.stopLoss'`)
- **Data**: gửi gì (`{ orderId }`)

Producer **không cần biết** ai sẽ xử lý, xử lý bao lâu, hay có bao nhiêu consumer.

### So sánh FE

```typescript
// FE: dispatch không cần biết reducer nào xử lý
dispatch({ type: 'STOP_LOSS_TRIGGERED', payload: { orderId } })

// BE: emit không cần biết handler nào xử lý
await kafkaService.emit('portfolio.stopLoss', { orderId })
```

---

## 2. Consumer -- Người nhận

Consumer là bên **lắng nghe và xử lý** message. Trong logics, consumer dùng `kafkaService.on()`:

```typescript
// File: tasks/portfolio.ts
kafkaService.on('portfolio.stopLoss', portfolioService.handleStopLoss)
```

Consumer cần:
- **Topic name**: lắng nghe kênh nào (`'portfolio.stopLoss'`)
- **Handler function**: hàm xử lý (`portfolioService.handleStopLoss`)

### So sánh FE

```typescript
// FE: addEventListener lắng nghe event
document.addEventListener('click', handleClick)

// BE: kafkaService.on lắng nghe topic
kafkaService.on('portfolio.stopLoss', portfolioService.handleStopLoss)
```

**Khác biệt quan trọng:** FE event listener mất khi trang đóng. Kafka consumer nhận được cả những message gửi lúc nó chưa chạy (nếu cấu hình `fromBeginning`).

---

## 3. Topic -- Kênh giao tiếp

Topic là **tên kênh** để phân loại message. Mỗi topic chứa một loại message nhất định.

```
┌─────────────────────────────────────────────────────┐
│                    Kafka Broker                      │
│                                                      │
│  Topic: portfolio.stopLoss     ─── [msg1] [msg2]    │
│  Topic: portfolio.takeProfit   ─── [msg3]           │
│  Topic: payment.rollback...    ─── [msg4] [msg5]    │
│  Topic: user.updated           ─── [msg6]           │
└─────────────────────────────────────────────────────┘
```

Trong logics, naming convention cho topic:

```
{service}.{action}

Ví dụ:
  portfolio.stopLoss                           ← portfolioService xử lý stop loss
  portfolio.takeProfit                         ← portfolioService xử lý take profit
  portfolio.limitBuy                           ← portfolioService xử lý lệnh mua giới hạn
  payment.rollback_expired_atx_deposit         ← paymentService rollback giao dịch hết hạn
  user.updated                                 ← syncService đồng bộ khi user thay đổi
  analysis.upsert                              ← analysisService cập nhật event
  metadata.increase                            ← metadataService tăng counter
```

### So sánh FE

| FE | BE (Kafka) |
|---|---|
| Event name (`'click'`, `'submit'`) | Topic name (`'portfolio.stopLoss'`) |
| Redux action type (`'ORDER_PLACED'`) | Topic name (`'payment.rollback...'`) |
| Channel trong WebSocket | Topic trong Kafka |

---

## 4. Luồng hoạt động đầy đủ

```
flowchart TD
    A[Controller nhận request] --> B[Xử lý logic chính]
    B --> C["kafkaService.emit('portfolio.stopLoss', data)"]
    C --> D[Kafka broker lưu message]
    D --> E["Consumer nhận message<br/>(tasks/portfolio.ts)"]
    E --> F[portfolioService.handleStopLoss]
    F --> G[Xử lý xong]

    B --> H[Trả response cho user ngay]
```

**Ví dụ cụ thể -- Stop Loss:**

```typescript
// Bước 1: Ở đâu đó trong code, detect giá chạm stop loss
await kafkaService.emit('portfolio.stopLoss', { orderId: '645abc123' })

// Bước 2: Kafka lưu message vào topic "task.portfolio.stopLoss"
// (kafkaService tự thêm prefix "task." khi gửi)

// Bước 3: Consumer (đã đăng ký khi app khởi động) nhận message
// File: tasks/portfolio.ts
kafkaService.on('portfolio.stopLoss', portfolioService.handleStopLoss)

// Bước 4: portfolioService.handleStopLoss(data) được gọi
// data = { orderId: '645abc123' }
```

---

## 5. Consumer Group -- Nhiều instance

Khi chạy 3 instance backend (để chịu tải), Kafka đảm bảo mỗi message chỉ **1 instance** xử lý, nhờ consumer group.

```
                    ┌──────────────┐
                ┌──>│ Instance 1   │  ← xử lý msg1, msg4
                │   └──────────────┘
 ┌───────────┐  │   ┌──────────────┐
 │  Kafka    │──┼──>│ Instance 2   │  ← xử lý msg2, msg5
 │  Topic    │  │   └──────────────┘
 └───────────┘  │   ┌──────────────┐
                └──>│ Instance 3   │  ← xử lý msg3, msg6
                    └──────────────┘

        Cùng consumer group = phân chia message
```

Trong logics, consumer group được tạo tự động:

```typescript
// Code thật từ task.ts
const opts: SubscribeOptions = {
  group: `${KAFKA_CONFIG.clientId}:${KAFKA_CONFIG.group}:${topic}`,
  // Ví dụ: "logics:production:task.portfolio.stopLoss"
}
```

**Nếu không có consumer group:** 3 instance đều xử lý cùng 1 message = đặt stop loss 3 lần!

---

## 6. Offset -- Vị trí đọc

Kafka lưu vị trí đọc (offset) của mỗi consumer group. Nếu consumer chết và quay lại, nó tiếp tục từ chỗ dừng, không đọc lại từ đầu.

```
Topic: portfolio.stopLoss
Messages:  [msg0] [msg1] [msg2] [msg3] [msg4] [msg5]
                                  ↑
                           offset = 3
                    (consumer đã xử lý 0-2)
                    (tiếp tục từ msg3)
```

Trong code thật, sau mỗi message xử lý xong, offset được commit:

```typescript
// Code thật từ kafka.ts
await consumer.run({
  eachBatch: async ({ batch, resolveOffset, commitOffsetsIfNecessary }) => {
    for (const message of batch.messages) {
      await handler(/* ... */)
      resolveOffset(message.offset)         // ← Đánh dấu đã xử lý
      await commitOffsetsIfNecessary()       // ← Commit offset
    }
  },
})
```

---

## Tóm tắt

| Khái niệm | Giải thích | Ví dụ FE tương đương |
|---|---|---|
| Producer | Gửi message | `dispatch()`, `emit()` |
| Consumer | Nhận và xử lý message | `addEventListener()`, reducer |
| Topic | Kênh phân loại message | Event name, action type |
| Consumer Group | Nhóm consumer, chia nhau xử lý | Không có |
| Offset | Vị trí đọc, giúp resume | Không có |
