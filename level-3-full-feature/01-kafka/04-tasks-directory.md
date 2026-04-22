# Cấu trúc thư mục tasks/

## Mục tiêu

Hiểu cách tổ chức Kafka consumer handlers trong thư mục `tasks/`, naming convention, và cách hệ thống tải chúng.

---

## 1. Tổng quan cấu trúc

```
logics/
└── tasks/
    ├── index.ts         ← Import tất cả task files (entry point)
    ├── portfolio.ts     ← Handlers liên quan đến danh mục đầu tư
    ├── payment.ts       ← Handlers liên quan đến thanh toán
    ├── sync.ts          ← Handlers đồng bộ dữ liệu
    ├── analysis.ts      ← Handlers tracking/analytics
    ├── ban.ts           ← Handlers quản lý ban user
    ├── metadata.ts      ← Handlers cập nhật metadata
    ├── navigation.ts    ← Handlers tìm kiếm/navigation
    ├── event.ts         ← Handlers log code events
    └── user.ts          ← Handlers xử lý user events
```

Mỗi file chứa các consumer handlers cho một **nhóm chức năng** (domain). Giống cách FE tổ chức reducers theo feature.

---

## 2. tasks/index.ts -- Entry point

```typescript
// tasks/index.ts
import './portfolio'
import './sync'
import './analysis'
import './ban'
import './metadata'
import './navigation'
import './event'
import './user'
```

File này **chỉ import** -- không có logic. Khi app boot, nó import tất cả task files, kích hoạt `kafkaService.on()` trong mỗi file. Sau đó, tất cả consumers sẵn sàng nhận message.

### So sánh FE

Giống cách `store/index.ts` combine tất cả reducers:

```typescript
// FE: store/index.ts
import { portfolioReducer } from './portfolio'
import { paymentReducer } from './payment'
import { userReducer } from './user'

export const rootReducer = combineReducers({
  portfolio: portfolioReducer,
  payment: paymentReducer,
  user: userReducer,
})
```

---

## 3. Các task files thật

### tasks/portfolio.ts -- Nhiều handlers nhất

```typescript
import { kafkaService } from 'App/Services/kafkaService'
import { portfolioService } from 'App/Services/portfolioService'

kafkaService.on('portfolio.stopLoss', portfolioService.handleStopLoss)
kafkaService.on('portfolio.takeProfit', portfolioService.handleTakeProfit)
kafkaService.on('portfolio.limitBuy', portfolioService.handleLimitBuy)
kafkaService.on('portfolio.limitSell', portfolioService.handleLimitSell)
kafkaService.on('portfolio.calculatePortfolioProfitForExpert', portfolioService.calculatePortfolioProfitForExpert)
kafkaService.on('portfolio.autoFixPortfolio', portfolioService.autoFixPortfolio)
kafkaService.on('events.prepare_div_and_iss', portfolioService.prepareDivOrIss)
```

**Điểm đáng chú ý:**
- Handler là method reference trực tiếp (`portfolioService.handleStopLoss`), không phải arrow function
- Tên topic có format `{domain}.{action}`: `portfolio.stopLoss`, `portfolio.takeProfit`
- Có 1 topic ngoại lệ: `events.prepare_div_and_iss` -- vẫn thuộc portfolio vì portfolioService xử lý

### tasks/payment.ts -- Inline handler

```typescript
import { kafkaService } from 'App/Services/kafkaService'
import { paymentService } from 'App/Services/paymentService'

kafkaService.on('payment.rollback_expired_atx_deposit', async (data: { transactionId: string }) => {
  await paymentService.rollbackExpiredATXDeposit(data.transactionId)
})
```

**Điểm khác biệt:** Dùng inline async function thay vì method reference. Lý do: cần trích xuất `data.transactionId` trước khi gọi service method (service method nhận `string`, không nhận object).

### tasks/sync.ts -- Đơn giản nhất

```typescript
import { kafkaService } from 'App/Services/kafkaService'
import { syncService } from 'App/Services/syncService'

kafkaService.on('user.updated', syncService.onUserUpdated)
```

Chỉ 1 handler: khi user thay đổi thông tin, đồng bộ sang hệ thống khác.

### tasks/analysis.ts -- Analytics events

```typescript
import { analysisService } from 'App/Services/analysisService'
import { kafkaService } from 'App/Services/kafkaService'

kafkaService.on('analysis.upsert', async (commands) => {
  analysisService.upsertEvent(commands)
})

kafkaService.on('analysis.insert', async (events) => {
  analysisService.insertEvent(events)
})
```

Tracking events qua Kafka thay vì ghi trực tiếp vào DB, giảm tải cho request chính.

### tasks/ban.ts -- Ban management

```typescript
import { kafkaService } from 'App/Services/kafkaService'
import { banService } from 'App/Services/banService'

banService.loadBannedMap()

kafkaService.on('ban.addBanLog', async (data: { key: string; ttlSeconds: number }) => {
  return banService.addBanLog(data.key, data.ttlSeconds)
})

kafkaService.on('ban.clearOldLogs', async () => {
  return banService.clearOldLogs()
})
```

**Điểm đáng chú ý:** Có logic khởi tạo (`banService.loadBannedMap()`) chạy ngay khi file được import, trước khi đăng ký consumers.

### tasks/user.ts -- Side effects khi user bị ban

```typescript
import { kafkaService } from 'App/Services/kafkaService'
import mongo from 'Mongo/index'

kafkaService.on('user.bans.created', async (data: { uid: string; bans: string[] }) => {
  if (data.bans.includes('qna:comment')) {
    await mongo.commentQuestionAnswerPosts.deleteMany({ 'creator._id': data.uid })
    await mongo.questionAnswerPosts.deleteMany({ 'creator._id': data.uid })
  }
})
```

Khi user bị ban comment, tự động xóa tất cả comments và bài viết Q&A của user đó.

### tasks/metadata.ts -- Metadata counter

```typescript
import { kafkaService } from 'App/Services/kafkaService'
import { metadataService } from 'App/Services/metadataService'

kafkaService.on('metadata.increase', metadataService.increase)
```

Tăng counter bất đồng bộ (view count, like count, ...) qua Kafka thay vì update DB trực tiếp trong request.

### tasks/navigation.ts -- Search cache

```typescript
import { kafkaService } from 'App/Services/kafkaService'
import mongo from 'Mongo/index'

kafkaService.on('navigation.remove_most_search_result', async (data: { _id: string; all: Boolean }) => {
  try {
    if (data.all) {
      await mongo.searchTopResults.deleteMany({})
      return
    }
    if (data._id) {
      await mongo.searchTopResults.deleteOne({ _id: data._id })
      return
    }
    throw new Error('Invalid data')
  } catch (error) {
    console.error(error)
  }
})
```

Xóa cache kết quả tìm kiếm phổ biến khi dữ liệu thay đổi.

---

## 4. Naming Convention

### Topic naming

```
{domain}.{action}

Ví dụ:
  portfolio.stopLoss             ← camelCase cho action
  portfolio.takeProfit
  portfolio.limitBuy
  payment.rollback_expired_...   ← snake_case cũng OK
  user.updated
  analysis.upsert
  ban.addBanLog
  metadata.increase
```

Quy tắc: Topic name phản ánh **domain + hành động**, dễ hiểu khi đọc.

### File naming

```
tasks/{domain}.ts

Ví dụ:
  tasks/portfolio.ts    ← Tất cả portfolio handlers
  tasks/payment.ts      ← Tất cả payment handlers
  tasks/sync.ts         ← Tất cả sync handlers
```

1 file = 1 domain. Nếu portfolio có 7 handlers, tất cả đều nằm trong `tasks/portfolio.ts`.

### Handler naming

Hai style:

```typescript
// Style 1: Method reference (ưu tiên khi signature khớp)
kafkaService.on('portfolio.stopLoss', portfolioService.handleStopLoss)

// Style 2: Inline function (khi cần transform data)
kafkaService.on('payment.rollback_expired_atx_deposit', async (data: { transactionId: string }) => {
  await paymentService.rollbackExpiredATXDeposit(data.transactionId)
})
```

---

## 5. Luồng từ boot đến xử lý

```
1. App khởi động
   └── start/kafka.ts
       └── kafkaService.kafka.init()     ← Kết nối Kafka broker

2. Import tasks
   └── tasks/index.ts
       ├── import './portfolio'
       │   └── kafkaService.on('portfolio.stopLoss', ...)     ← Subscribe
       │   └── kafkaService.on('portfolio.takeProfit', ...)   ← Subscribe
       ├── import './payment'
       │   └── kafkaService.on('payment.rollback...', ...)    ← Subscribe
       ├── import './sync'
       │   └── kafkaService.on('user.updated', ...)           ← Subscribe
       └── ...

3. App sẵn sàng -- Consumers đang lắng nghe

4. Message đến
   └── portfolio.stopLoss message
       └── portfolioService.handleStopLoss(data, meta)       ← Xử lý
```

---

## 6. Thêm task handler mới

Khi cần thêm consumer handler cho feature mới:

**Bước 1:** Nếu domain đã có file, thêm vào file đó.

```typescript
// tasks/portfolio.ts -- thêm handler mới
kafkaService.on('portfolio.newFeature', portfolioService.handleNewFeature)
```

**Bước 2:** Nếu domain mới, tạo file mới + import trong index.

```typescript
// tasks/newDomain.ts
import { kafkaService } from 'App/Services/kafkaService'
import { newDomainService } from 'App/Services/newDomainService'

kafkaService.on('newDomain.action', newDomainService.handleAction)
```

```typescript
// tasks/index.ts -- thêm import
import './portfolio'
import './sync'
import './newDomain'   // ← thêm dòng này
```

---

## Tóm tắt

| Quy tắc | Chi tiết |
|---|---|
| 1 file = 1 domain | `tasks/portfolio.ts` chứa tất cả portfolio handlers |
| `tasks/index.ts` | Chỉ import, không có logic |
| Topic name | `{domain}.{action}` -- phản ánh nghiệp vụ |
| Handler | Ưu tiên method reference, dùng inline khi cần transform |
| Thêm handler | Thêm vào file domain hoặc tạo file mới + import trong index |
