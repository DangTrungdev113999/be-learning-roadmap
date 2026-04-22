# kafkaService trong dự án logics

## Mục tiêu

Đọc hiểu code thật của `kafkaService` -- cách emit message, cách đăng ký handler, và cấu trúc nội bộ.

---

## 1. Tổng quan kiến trúc

```
logics/
├── app/Services/kafkaService/
│   ├── index.ts         ← Export kafkaService object
│   ├── type.ts          ← TypeScript interfaces
│   ├── constants.ts     ← Config values
│   └── libs/
│       ├── kafka.ts     ← Low-level: connect, pub, sub
│       └── task.ts      ← High-level: emit, on (có safety features)
├── tasks/
│   ├── index.ts         ← Import tất cả task files
│   ├── portfolio.ts     ← Handlers cho portfolio
│   ├── payment.ts       ← Handlers cho payment
│   ├── sync.ts          ← Handlers cho sync
│   └── ...
└── start/
    └── kafka.ts         ← Khởi tạo kafka khi app boot
```

Có 2 tầng:
- **kafka.ts (low-level):** Kết nối Kafka, gửi/nhận raw messages
- **task.ts (high-level):** Bọc thêm safety features (maxTrip, maxLoop, sender tracking)

Hầu hết code trong dự án dùng tầng **high-level** qua `kafkaService.emit()` và `kafkaService.on()`.

---

## 2. kafkaService -- Entry point

```typescript
// app/Services/kafkaService/index.ts
import { kafka } from './libs/kafka'
import { task } from './libs/task'

export const kafkaService = {
  kafka,
  task,

  // Direct access to task functions for convenience
  emit: task.emit,
  on: task.on,
}
```

Cách dùng từ bên ngoài:

```typescript
import { kafkaService } from 'App/Services/kafkaService'

// Gửi message (producer)
await kafkaService.emit('portfolio.stopLoss', { orderId })

// Đăng ký handler (consumer)
kafkaService.on('portfolio.stopLoss', portfolioService.handleStopLoss)
```

`kafkaService.emit` và `kafkaService.on` thực chất là `task.emit` và `task.on`.

---

## 3. task.emit() -- Gửi message

```typescript
// app/Services/kafkaService/libs/task.ts
async emit(name: string, data?: any) {
  const topic = `task.${name}`

  const meta: TaskMeta = {
    sender: task.asyncLocalStorage.getStore()?.get('sender') || uuidv4(),
    trips: task.asyncLocalStorage.getStore()?.get('trips') || [],
    loop: 0,
    timestamp: Date.now(),
  }

  await kafka.pub(topic, { data, meta } as TaskMessage)
}
```

**Phân tích:**

| Dòng | Giải thích |
|---|---|
| `const topic = \`task.${name}\`` | Tự thêm prefix `task.` -- gọi `emit('portfolio.stopLoss')` thực tế gửi vào topic `task.portfolio.stopLoss` |
| `sender` | ID duy nhất theo dõi ai gửi message đầu tiên, dùng `AsyncLocalStorage` để truyền qua chuỗi xử lý |
| `trips` | Mảng ghi lại chuỗi tasks đã đi qua (dùng để phát hiện vòng lặp) |
| `kafka.pub(topic, ...)` | Gọi xuống tầng low-level để gửi thật |

**Ví dụ message thật gửi đi:**

```json
{
  "data": { "orderId": "645abc123" },
  "meta": {
    "sender": "a1b2c3d4-...",
    "trips": [],
    "loop": 0,
    "timestamp": 1710700000000
  }
}
```

---

## 4. task.on() -- Đăng ký handler

```typescript
// app/Services/kafkaService/libs/task.ts
async on(name: string, handle: TaskHandler, options?: SubscribeOptions) {
  if (handle.constructor.name !== 'AsyncFunction') {
    throw new Error('Param handle must be a AsyncFunction')
  }

  const topic = `task.${name}`

  const opts: SubscribeOptions = {
    group: `${KAFKA_CONFIG.clientId}:${KAFKA_CONFIG.group}:${topic}`,
    fb: true,
    retry: TASK_DEFAULTS.retry,       // 12
    maxTrip: TASK_DEFAULTS.maxTrip,   // 10
    maxLoop: TASK_DEFAULTS.maxLoop,   // 3
    ...options,
  }

  // Local development: không dùng consumer group
  if (process.env.LOCAL === '1') {
    opts.fb = false
    opts.group += Date.now()
  }

  const wrap = async ({ data, meta }: TaskMessage, km: any) => {
    return task.asyncLocalStorage.run(new Map(), () => {
      meta.loop = 0

      for (const trip of meta.trips) {
        if (trip === name) {
          meta.loop++
        }
      }

      meta.trips.push(name)

      if (meta.trips.length > opts.maxTrip!) {
        log.error('Task break because reached maximum trip', meta)
        return
      }

      if (meta.loop > opts.maxLoop!) {
        log.error('Task break because reached maximum loop', meta)
        return
      }

      task.asyncLocalStorage.getStore()?.set('sender', meta.sender)
      task.asyncLocalStorage.getStore()?.set('trips', meta.trips.concat())

      meta.timestamp = +km.message.timestamp
      return handle(data, meta)
    })
  }

  await kafka.sub(topic, opts, wrap)
}
```

**Phân tích từng phần:**

### Bắt buộc async function

```typescript
if (handle.constructor.name !== 'AsyncFunction') {
  throw new Error('Param handle must be a AsyncFunction')
}
```

Handler **phải là async function**. Nếu truyền function thường sẽ throw error ngay khi đăng ký.

### Consumer group tự động

```typescript
group: `${KAFKA_CONFIG.clientId}:${KAFKA_CONFIG.group}:${topic}`
// Ví dụ: "logics:production:task.portfolio.stopLoss"
```

Mỗi topic có consumer group riêng. 3 instance chạy cùng group sẽ chia nhau message.

### Local development mode

```typescript
if (process.env.LOCAL === '1') {
  opts.fb = false           // Không đọc từ đầu
  opts.group += Date.now()  // Group unique = mỗi lần chạy là consumer mới
}
```

Khi dev local, mỗi lần restart app tạo consumer group mới, tránh nhận lại message cũ.

### Wrapper function -- Safety checks

Trước khi gọi handler thật, wrapper kiểm tra:
1. Đếm số lần task này xuất hiện trong `trips` (phát hiện loop)
2. Kiểm tra tổng số trips (phát hiện chain quá dài)
3. Lưu sender và trips vào `AsyncLocalStorage` để truyền cho emit tiếp theo

Chi tiết safety features sẽ học ở bài 05.

---

## 5. Tầng low-level: kafka.pub() và kafka.sub()

### kafka.pub() -- Gửi message thật

```typescript
// app/Services/kafkaService/libs/kafka.ts
async pub(topic: string, message: any, tries = 1) {
  await isReady   // Đợi kết nối xong

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
    return await kafka.pub(topic, message, tries + 1)  // Retry
  }
}
```

Gửi thất bại sẽ retry tối đa 3 lần. Message được serialize thành JSON string.

### kafka.sub() -- Nhận message

```typescript
// app/Services/kafkaService/libs/kafka.ts (rút gọn)
async sub(topic, handle, option) {
  const consumer = kafka.client.consumer({
    groupId: options.group!,
    sessionTimeout: 900_000,   // 15 phút
  })

  await consumer.connect()
  await consumer.subscribe({ topic, fromBeginning: options.fb! })

  await consumer.run({
    eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) => {
      const hb = setInterval(() => heartbeat(), 5000)   // Heartbeat mỗi 5 giây

      try {
        for (const message of batch.messages) {
          await handler(JSON.parse(message.value.toString()), { topic, message })
          resolveOffset(message.offset)          // Đánh dấu đã xử lý
          await commitOffsetsIfNecessary()        // Commit offset
        }
      } finally {
        clearInterval(hb)
      }
    },
  })
}
```

**Heartbeat**: Consumer gửi tín hiệu "tôi vẫn sống" mỗi 5 giây. Nếu không heartbeat trong 15 phút (`sessionTimeout`), Kafka xem như consumer đã chết và chuyển messages sang consumer khác.

---

## 6. Types -- Cấu trúc dữ liệu

```typescript
// app/Services/kafkaService/type.ts

// Metadata đi kèm mỗi message
interface TaskMeta {
  sender: string    // UUID của request gốc
  trips: string[]   // Chuỗi task đã đi qua: ['A', 'B', 'C']
  loop: number      // Số lần task hiện tại xuất hiện trong trips
  timestamp: number // Thời điểm message được gửi
}

// Cấu trúc message đầy đủ
interface TaskMessage {
  data: any         // Data thật (orderId, transactionId, ...)
  meta: TaskMeta    // Metadata để tracking
}

// Handler nhận data và meta
type TaskHandler = (data: any, meta: TaskMeta) => Promise<any>
```

---

## 7. Constants -- Giá trị mặc định

```typescript
// app/Services/kafkaService/constants.ts

const KAFKA_CONFIG = {
  clientId: 'logics',
  group: 'production',   // hoặc 'development'
  uri: '...',             // Từ env
}

const TASK_DEFAULTS = {
  maxTrip: 10,   // Tối đa 10 tasks trong chuỗi
  maxLoop: 3,    // Tối đa 1 task lặp 3 lần
  retry: 12,     // Consumer retry 12 lần khi lỗi
}
```

---

## Tóm tắt

| Thành phần | File | Chức năng |
|---|---|---|
| `kafkaService` | `index.ts` | Entry point, export emit/on |
| `task.emit()` | `libs/task.ts` | Gửi message kèm metadata (sender, trips) |
| `task.on()` | `libs/task.ts` | Đăng ký handler với safety checks |
| `kafka.pub()` | `libs/kafka.ts` | Low-level: gửi vào Kafka topic |
| `kafka.sub()` | `libs/kafka.ts` | Low-level: subscribe và nhận messages |
| Types | `type.ts` | TaskMeta, TaskMessage, TaskHandler |
| Constants | `constants.ts` | maxTrip=10, maxLoop=3, retry=12 |
