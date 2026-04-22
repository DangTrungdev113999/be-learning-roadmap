# Safety Features -- Chống vòng lặp vô hạn

## Mục tiêu

Hiểu tại sao cần maxTrip, maxLoop, sender tracking, và cách hệ thống task bảo vệ khỏi vòng lặp vô hạn.

---

## 1. Vấn đề: Chuỗi task vô hạn

Khi task A emit message cho task B, và task B emit message cho task A, sẽ tạo thành vòng lặp vô hạn:

```
A emit → B xử lý → B emit → A xử lý → A emit → B xử lý → ...
                    ↑                                      │
                    └──────────────────────────────────────┘
                           VÒNG LẶP VÔ HẠN 💀
```

**Ví dụ thực tế có thể xảy ra:**

```typescript
// tasks/portfolio.ts
kafkaService.on('portfolio.stopLoss', async (data) => {
  await portfolioService.handleStopLoss(data)
  // handleStopLoss() bên trong lại emit 'portfolio.calculateProfit'
})

// tasks/portfolio.ts
kafkaService.on('portfolio.calculateProfit', async (data) => {
  await portfolioService.calculateProfit(data)
  // Nếu calculateProfit() lại emit 'portfolio.stopLoss' → VÒNG LẶP
})
```

Kafka sẽ xử lý messages liên tục, chiếm hết tài nguyên, và tạo ra hàng triệu messages rác.

---

## 2. Giải pháp: TaskMeta -- Metadata đi kèm mỗi message

Mỗi message trong hệ thống task đều mang theo metadata:

```typescript
// app/Services/kafkaService/type.ts
interface TaskMeta {
  sender: string    // UUID -- ai gửi message đầu tiên
  trips: string[]   // Chuỗi tasks đã đi qua
  loop: number      // Số lần task hiện tại lặp lại
  timestamp: number // Thời điểm gửi
}
```

**Ví dụ metadata thật khi chuỗi task chạy:**

```
Bước 1: Controller emit 'portfolio.stopLoss'
  meta = {
    sender: "uuid-abc",
    trips: [],
    loop: 0
  }

Bước 2: handleStopLoss emit 'portfolio.calculateProfit'
  meta = {
    sender: "uuid-abc",       ← Giữ nguyên sender
    trips: ["portfolio.stopLoss"],   ← Ghi lại đã qua stopLoss
    loop: 0
  }

Bước 3: calculateProfit emit 'portfolio.notify'
  meta = {
    sender: "uuid-abc",
    trips: ["portfolio.stopLoss", "portfolio.calculateProfit"],
    loop: 0
  }
```

---

## 3. maxTrip -- Giới hạn độ dài chuỗi

```typescript
// app/Services/kafkaService/constants.ts
const TASK_DEFAULTS = {
  maxTrip: 10,   // Tối đa 10 tasks trong chuỗi
}
```

`maxTrip` giới hạn tổng số tasks trong chuỗi. Nếu chuỗi vượt quá 10, message bị từ chối.

```typescript
// Code thật từ task.ts
meta.trips.push(name)

if (meta.trips.length > opts.maxTrip!) {
  log.error('Task break because reached maximum trip', meta)
  return  // ← Dừng, không xử lý
}
```

**Ví dụ:**

```
trips = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
                                                          ↑
                                                     10 trips

Task K emit → trips.length = 11 > maxTrip(10) → DỪNG ❌
```

**Tại sao cần:** Ngay cả khi không có vòng lặp, một chuỗi quá dài (A->B->C->D->...->Z) cũng là dấu hiệu thiết kế có vấn đề. 10 bước là đủ cho mọi luồng nghiệp vụ hợp lý.

---

## 4. maxLoop -- Giới hạn số lần lặp lại

```typescript
// app/Services/kafkaService/constants.ts
const TASK_DEFAULTS = {
  maxLoop: 3,   // Tối đa 1 task lặp 3 lần
}
```

`maxLoop` đếm số lần **cùng 1 task** xuất hiện trong `trips`. Nếu vượt quá 3, message bị từ chối.

```typescript
// Code thật từ task.ts
meta.loop = 0

for (const trip of meta.trips) {
  if (trip === name) {
    meta.loop++
  }
}

if (meta.loop > opts.maxLoop!) {
  log.error('Task break because reached maximum loop', meta)
  return  // ← Dừng, không xử lý
}
```

**Ví dụ -- Phát hiện vòng lặp:**

```
trips = ['A', 'B', 'A', 'B', 'A', 'B', 'A']
                                          ↑
                                Task A xuất hiện lần 4

Khi task A nhận message:
  loop = đếm số lần 'A' trong trips = 4
  4 > maxLoop(3) → DỪNG ❌
```

**Tại sao maxLoop = 3 chứ không phải 1?** Vì có trường hợp hợp lệ task A gọi lại chính nó vài lần (retry logic, recursive processing). 3 lần đủ linh hoạt mà vẫn an toàn.

---

## 5. Sender tracking -- Theo dõi nguồn gốc

```typescript
// Code thật từ task.ts - emit
const meta: TaskMeta = {
  sender: task.asyncLocalStorage.getStore()?.get('sender') || uuidv4(),
  // ...
}
```

```typescript
// Code thật từ task.ts - on (wrapper)
task.asyncLocalStorage.getStore()?.set('sender', meta.sender)
task.asyncLocalStorage.getStore()?.set('trips', meta.trips.concat())
```

**Cách hoạt động:**

1. **Lần emit đầu tiên** (từ controller): `sender = uuidv4()` -- tạo UUID mới
2. **Consumer nhận message**: lưu `sender` vào `AsyncLocalStorage`
3. **Handler emit message tiếp**: `sender` lấy từ `AsyncLocalStorage` -- giữ nguyên UUID gốc

Tất cả messages trong cùng chuỗi xử lý đều có **cùng sender UUID**, giúp trace log.

### AsyncLocalStorage là gì?

Giống `React Context` nhưng cho async operations trên server:

```typescript
// FE: React Context truyền data qua component tree
const UserContext = React.createContext()
<UserContext.Provider value={user}>
  <ChildComponent />   ← tự có access đến user
</UserContext.Provider>

// BE: AsyncLocalStorage truyền data qua async call chain
task.asyncLocalStorage.run(new Map(), () => {
  store.set('sender', meta.sender)
  // Mọi async function bên trong đều access được sender
  // Kể cả function ở file khác, service khác
  await handle(data, meta)
    // → handle emit message khác
    //   → emit đọc sender từ AsyncLocalStorage ✅
})
```

---

## 6. Ví dụ đầy đủ -- Chuỗi task an toàn

```
1. Controller: emit('portfolio.stopLoss', { orderId: '123' })
   meta = { sender: "uuid-1", trips: [], loop: 0 }

2. handleStopLoss nhận message
   → Check: trips.length = 1 <= maxTrip(10) ✅
   → Check: loop = 0 <= maxLoop(3) ✅
   → Xử lý: đóng lệnh stop loss
   → emit('portfolio.calculateProfit', { userId })
   meta = { sender: "uuid-1", trips: ["portfolio.stopLoss"], loop: 0 }

3. calculateProfit nhận message
   → Check: trips.length = 2 <= maxTrip(10) ✅
   → Check: loop = 0 <= maxLoop(3) ✅
   → Xử lý: tính lãi/lỗ
   → emit('user.updated', { userId })
   meta = { sender: "uuid-1", trips: ["portfolio.stopLoss", "portfolio.calculateProfit"] }

4. syncService.onUserUpdated nhận message
   → Check: trips.length = 3 <= maxTrip(10) ✅
   → Check: loop = 0 <= maxLoop(3) ✅
   → Xử lý: sync data
   → Không emit thêm → chuỗi kết thúc ✅
```

### Ví dụ -- Chuỗi bị chặn vì loop

```
1. emit('A', data)
   meta = { trips: [], loop: 0 }

2. handler A → emit('B', data)
   meta = { trips: ["A"] }

3. handler B → emit('A', data)
   meta = { trips: ["A", "B"] }

4. handler A: loop = 1 (A xuất hiện 1 lần) ✅ → emit('B', data)
   meta = { trips: ["A", "B", "A"] }

5. handler B → emit('A', data)
   meta = { trips: ["A", "B", "A", "B"] }

6. handler A: loop = 2 ✅ → emit('B', data)
   meta = { trips: ["A", "B", "A", "B", "A"] }

7. handler B → emit('A', data)
   meta = { trips: ["A", "B", "A", "B", "A", "B"] }

8. handler A: loop = 3 ✅ (vẫn cho qua, maxLoop cho phép đến 3)

9. handler A: loop = 4 > maxLoop(3) → DỪNG ❌
   log.error('Task break because reached maximum loop')
```

---

## 7. Tại sao cần cả maxTrip lẫn maxLoop?

| Tình huống | maxTrip bắt được? | maxLoop bắt được? |
|---|---|---|
| A→B→A→B→A→B→... (vòng lặp 2 tasks) | Bắt sau 10 bước | Bắt sau 3 lần lặp |
| A→B→C→D→E→F→G→H→I→J→K (chuỗi thẳng dài) | Bắt sau 10 bước | Không (mỗi task chỉ 1 lần) |
| A→A→A→A→... (self-loop) | Bắt sau 10 bước | Bắt sau 3 lần |

- **maxTrip** bảo vệ khỏi chuỗi quá dài (dù không lặp)
- **maxLoop** bảo vệ khỏi vòng lặp sớm hơn (không cần đợi đến 10 bước)

Hai cơ chế bổ sung cho nhau, tạo lưới an toàn kép.

---

## Tóm tắt

| Cơ chế | Giá trị mặc định | Bảo vệ khỏi |
|---|---|---|
| maxTrip | 10 | Chuỗi task quá dài |
| maxLoop | 3 | Cùng 1 task bị gọi lặp |
| sender | UUID | Trace nguồn gốc chuỗi task |
| trips | string[] | Ghi lại lịch sử đường đi |
| AsyncLocalStorage | -- | Truyền context qua async calls |
