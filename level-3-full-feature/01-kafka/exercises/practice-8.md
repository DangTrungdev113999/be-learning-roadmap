# 8 bài thực hành Kafka (dễ đến khó)

## Hướng dẫn chung

- Bài 1-3: Đọc code, trả lời câu hỏi (không cần viết code)
- Bài 4-6: Viết code mô phỏng (in-memory, không cần Kafka thật)
- Bài 7-8: Thiết kế hệ thống (viết pseudocode + giải thích)

---

## Bài 1: Đọc hiểu task files (Dễ)

Đọc file `tasks/portfolio.ts` trong dự án logics và trả lời:

```typescript
kafkaService.on('portfolio.stopLoss', portfolioService.handleStopLoss)
kafkaService.on('portfolio.takeProfit', portfolioService.handleTakeProfit)
kafkaService.on('portfolio.limitBuy', portfolioService.handleLimitBuy)
kafkaService.on('portfolio.limitSell', portfolioService.handleLimitSell)
kafkaService.on('portfolio.calculatePortfolioProfitForExpert', portfolioService.calculatePortfolioProfitForExpert)
kafkaService.on('portfolio.autoFixPortfolio', portfolioService.autoFixPortfolio)
kafkaService.on('events.prepare_div_and_iss', portfolioService.prepareDivOrIss)
```

**Câu hỏi:**
1. File này có bao nhiêu consumer handlers?
2. Tên topic nào **không** theo pattern `portfolio.*`? Tại sao nó vẫn nằm trong file `tasks/portfolio.ts`?
3. Tất cả handlers truyền bằng method reference. Nếu handler cần biến đổi data trước khi gọi service, phải viết thế nào? (Gợi ý: xem `tasks/payment.ts`)
4. Consumer group của topic `portfolio.stopLoss` sẽ là gì nếu `clientId = 'logics'` và `group = 'production'`?

---

## Bài 2: Trace chuỗi task (Dễ)

Cho chuỗi xử lý sau:

```
1. Controller emit('order.placed', { orderId: '001' })
2. handler 'order.placed' xử lý xong, emit('portfolio.updateBalance', { userId: 'u1' })
3. handler 'portfolio.updateBalance' xử lý xong, emit('notification.send', { userId: 'u1' })
4. handler 'notification.send' xử lý xong, không emit thêm
```

**Câu hỏi:**
1. Viết ra giá trị `meta.trips` tại mỗi bước (bước 2, 3, 4)
2. Giá trị `meta.sender` có thay đổi giữa các bước không? Tại sao?
3. Nếu bước 3 lại emit('order.placed'), `meta.loop` tại bước tiếp sẽ là bao nhiêu? Có bị chặn không?

---

## Bài 3: Phân tích safety (Dễ)

Với `maxTrip = 10` và `maxLoop = 3`, phân tích các tình huống sau:

**Tình huống A:**
```
A → B → C → D → E → F → G → H → I → J → K
```
Có bị chặn không? Tại bước nào? Bởi maxTrip hay maxLoop?

**Tình huống B:**
```
A → B → A → B → A → B → A → B
```
Có bị chặn không? Tại bước nào? `meta.loop` bằng bao nhiêu khi bị chặn?

**Tình huống C:**
```
A → A → A → A → A
```
Bị chặn sớm hơn hay muộn hơn tình huống B? Tại sao?

---

## Bài 4: EventEmitter đơn giản (Trung bình)

Viết class `SimpleMessageQueue` mô phỏng kafkaService (in-memory, không cần Kafka thật):

```typescript
class SimpleMessageQueue {
  async emit(topic: string, data: any): Promise<void>
  async on(topic: string, handler: (data: any) => Promise<void>): Promise<void>
}
```

**Yêu cầu:**
- `emit` gửi data đến handler đã đăng ký cho topic đó
- `on` đăng ký handler cho topic
- Nếu emit mà chưa có handler → lưu vào queue, khi `on` được gọi thì xử lý tất cả messages chờ
- Handler phải là async function

**Test cases:**
```typescript
const mq = new SimpleMessageQueue()

// Test 1: on trước, emit sau
mq.on('test', async (data) => { console.log(data) })
await mq.emit('test', { msg: 'hello' })
// → in ra { msg: 'hello' }

// Test 2: emit trước, on sau
await mq.emit('pending', { msg: 'waiting' })
mq.on('pending', async (data) => { console.log(data) })
// → in ra { msg: 'waiting' }

// Test 3: Nhiều messages
await mq.emit('multi', { id: 1 })
await mq.emit('multi', { id: 2 })
mq.on('multi', async (data) => { console.log(data.id) })
// → in ra 1, rồi 2
```

---

## Bài 5: Thêm metadata tracking (Trung bình)

Mở rộng `SimpleMessageQueue` từ bài 4, thêm metadata tracking giống `task.ts`:

```typescript
interface TaskMeta {
  sender: string
  trips: string[]
  loop: number
  timestamp: number
}

class TrackedMessageQueue {
  async emit(topic: string, data: any): Promise<void>
  async on(topic: string, handler: (data: any, meta: TaskMeta) => Promise<void>): Promise<void>
}
```

**Yêu cầu:**
- `emit` lần đầu tạo sender UUID mới
- Mỗi khi handler được gọi, thêm topic vào `trips`
- Nếu handler bên trong emit tiếp, `sender` giữ nguyên, `trips` được nối thêm
- Tính `loop` = số lần topic hiện tại xuất hiện trong trips

**Test cases:**
```typescript
const mq = new TrackedMessageQueue()

mq.on('A', async (data, meta) => {
  console.log('A trips:', meta.trips)   // ['A']
  console.log('A sender:', meta.sender) // uuid-xxx
  await mq.emit('B', data)
})

mq.on('B', async (data, meta) => {
  console.log('B trips:', meta.trips)   // ['A', 'B']
  console.log('B sender:', meta.sender) // uuid-xxx (giống A)
  console.log('B loop:', meta.loop)     // 0
})

await mq.emit('A', { test: true })
```

---

## Bài 6: Thêm maxTrip và maxLoop (Trung bình)

Mở rộng `TrackedMessageQueue` từ bài 5, thêm safety features:

```typescript
class SafeMessageQueue {
  constructor(private maxTrip = 10, private maxLoop = 3) {}
  async emit(topic: string, data: any): Promise<void>
  async on(topic: string, handler: (data: any, meta: TaskMeta) => Promise<void>): Promise<void>
}
```

**Yêu cầu:**
- Kiểm tra `trips.length > maxTrip` → log error, không xử lý
- Kiểm tra `loop > maxLoop` → log error, không xử lý

**Test cases:**
```typescript
const mq = new SafeMessageQueue(5, 2)

// Test maxTrip: chain A→B→C→D→E→F phải dừng ở F
mq.on('A', async (data) => await mq.emit('B', data))
mq.on('B', async (data) => await mq.emit('C', data))
mq.on('C', async (data) => await mq.emit('D', data))
mq.on('D', async (data) => await mq.emit('E', data))
mq.on('E', async (data) => await mq.emit('F', data))
mq.on('F', async (data) => console.log('F reached?'))   // Không nên đến đây

await mq.emit('A', {})

// Test maxLoop: A→B→A→B→A phải dừng
mq.on('X', async (data) => await mq.emit('Y', data))
mq.on('Y', async (data) => await mq.emit('X', data))

await mq.emit('X', {})  // phải dừng sau vài vòng
```

---

## Bài 7: Thiết kế idempotent handler (Khó)

Thiết kế handler xử lý thanh toán qua Kafka. Yêu cầu **idempotent** -- xử lý 2 lần không gây lỗi.

**Scenario:**
```
Topic: payment.process
Data: { transactionId: string, userId: string, amount: number, type: 'deposit' | 'withdraw' }
```

**Viết pseudocode cho handler xử lý:**
1. Kiểm tra transaction đã xử lý chưa (dùng transactionId)
2. Nếu chưa: cập nhật balance, lưu transaction log
3. Nếu rồi: bỏ qua

**Câu hỏi thêm:**
- Nếu bước 2 thành công (cập nhật balance) nhưng bước lưu transaction log thất bại, lần retry tiếp sẽ cập nhật balance lần nữa. Làm sao giải quyết? (Gợi ý: MongoDB transaction hoặc check balance + transaction trong cùng 1 query)
- Nếu 2 consumer instances nhận cùng message (do rebalance), cả 2 đều qua bước kiểm tra (đều thấy "chưa xử lý"). Làm sao ngăn? (Gợi ý: dùng unique index hoặc distributed lock)

---

## Bài 8: Thiết kế task file cho domain mới (Khó)

Bạn được yêu cầu thêm feature **QnA (hỏi đáp)** vào hệ thống. Các use case:

1. User đặt câu hỏi → thông báo cho expert
2. Expert trả lời → thông báo cho user
3. Câu hỏi quá 24h chưa có trả lời → nhắc expert
4. Expert trả lời → cập nhật thống kê (số câu trả lời, thời gian trung bình)
5. User đánh giá câu trả lời → cập nhật điểm expert

**Yêu cầu:**
1. Thiết kế tên topics (theo naming convention `{domain}.{action}`)
2. Viết file `tasks/qna.ts` với tất cả handlers
3. Cập nhật `tasks/index.ts`
4. Xác định handler nào cần inline function, handler nào dùng method reference
5. Vẽ sơ đồ chuỗi task có thể xảy ra và kiểm tra có vi phạm maxTrip/maxLoop không

**Gợi ý topics:**
```
qna.questionCreated
qna.answerCreated
qna.questionExpired
qna.answerRated
qna.updateExpertStats
```

**Câu hỏi thêm:**
- Use case 3 (nhắc expert sau 24h) nên dùng Kafka hay Cronjob? Tại sao?
- Nếu expert trả lời → cập nhật thống kê → gửi thông báo "Bạn đã trả lời X câu" → chuỗi task dài bao nhiêu? Có an toàn với maxTrip = 10 không?

---

## Gợi ý chung

- Bài 1-3: Đọc lại bài 03-05, đối chiếu code thật
- Bài 4-6: Bắt đầu từ `Map<string, handler>`, thêm dần complexity
- Bài 7: Tham khảo `tasks/payment.ts` và suy nghĩ về edge cases
- Bài 8: Tham khảo `tasks/portfolio.ts` về cách tổ chức
