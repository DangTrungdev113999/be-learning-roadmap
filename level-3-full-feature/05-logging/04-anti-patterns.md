# 5 Anti-patterns -- Sai lầm phổ biến khi logging

## Sai lầm 1: Dùng console.log trong production code

### Sai

```typescript
// ❌ FeedBacksController.ts -- console.error thay vì Logger
export default class FeedBacksController {
  public async create({ auth, request }: HttpContextContract) {
    try {
      // ... logic ...
    } catch (e) {
      console.error('ERROR', e)  // ❌ Không có tags, không có level, không có context
      return { error: { code: responseCodes.ERROR_SYSTEM } }
    }
  }
}
```

Đây là code thật trong logics! File `app/Controllers/Http/FeedBacksController.ts` dùng `console.error` thay vì Logger.

### Đúng

```typescript
// ✅ Dùng Logger với tags và context
import Logger from '@ioc:Adonis/Core/Logger'
const log = Logger.child({ tags: ['FeedBacksController.create'] })

export default class FeedBacksController {
  public async create({ auth, request }: HttpContextContract) {
    try {
      // ... logic ...
    } catch (error) {
      log.error({ error, userId: auth?.userId }, 'Create feedback failed')
      return { error: { code: responseCodes.ERROR_SYSTEM } }
    }
  }
}
```

### Tại sao console.log/error xấu?

```
console.error('ERROR', e)
→ Output: "ERROR [object Object]"
→ Không biết từ file nào
→ Không biết user nào gây lỗi
→ Không filter được theo level
→ Không search được theo field

log.error({ error, userId }, 'Create feedback failed')
→ Output: { level: "error", tags: ["FeedBacksController.create"],
            error: { message: "...", stack: "..." },
            userId: "usr_123", msg: "Create feedback failed" }
→ Biết chính xác nguồn gốc, context, searchable
```

## Sai lầm 2: String concatenation thay vì structured data

### Sai

```typescript
// ❌ String concat -- khó parse, khó search
log.info(`User ${userId} created order ${orderId}, amount: ${amount}`)
log.error(`Error in getOverview: ${error.message}, query: ${JSON.stringify(query)}`)
log.warn(`Attempt ${attempt} failed for action ${action}: ${error.message}`)
```

### Đúng

```typescript
// ✅ Structured -- mỗi field riêng biệt, searchable
log.info({ userId, orderId, amount }, 'Order created')
log.error({ error, query }, 'getOverview error')
log.warn({ action, attempt, error: error.message }, 'AI Team request failed')
```

### So sánh khi search

```bash
# String concat → phải regex
grep "User.*created order" logs.txt | grep "amount: 5000"

# Structured → query chính xác
jq 'select(.amount == 5000 and .msg == "Order created")' logs.json
```

## Sai lầm 3: Log sensitive data

### Sai

```typescript
// ❌ KHÔNG BAO GIỜ log những thứ này
log.info({ password: user.password }, 'User login')
log.info({ token: jwtToken }, 'Token created')
log.info({ creditCard: '4111-1111-1111-1111' }, 'Payment processed')
log.info({ phoneNumber, email, fullName, address }, 'User data')  // PII
```

### Đúng

```typescript
// ✅ Chỉ log identifier, không log sensitive data
log.info({ userId: user._id }, 'User login')
log.info({ action: 'token_created' }, 'Token created')
log.info({ paymentId: 'pay_123', last4: '1111' }, 'Payment processed')
log.info({ userId }, 'User data accessed')
```

### Ví dụ trong logics -- Facebook service dùng mask

```typescript
// services/facebook/index.ts
import { maskObj } from 'Utils/mask'

// Mask sensitive data trước khi log
log.info(`RESULT data=${JSON.stringify(maskObj(data))}`)
log.info(`RESULT user profile = ${JSON.stringify(maskObj(fbProfileData))}`)
```

`maskObj` ẩn bớt thông tin nhạy cảm: `{ email: "t***@gmail.com", name: "N***n A" }`.

### Checklist: Data nào KHÔNG được log?

- [ ] Password, hash password
- [ ] JWT tokens, API keys, secrets
- [ ] Số thẻ tín dụng, CVV
- [ ] Số điện thoại, email, địa chỉ (PII -- Personal Identifiable Information)
- [ ] Session tokens, cookies
- [ ] Request/response body chứa sensitive data

## Sai lầm 4: Log quá nhiều (log flooding)

### Sai

```typescript
// ❌ Log mỗi iteration trong loop
const stocks = await getStocks() // 1000 stocks
for (const stock of stocks) {
  log.info({ symbol: stock.symbol, price: stock.price }, 'Processing stock')
  // → 1000 log lines mỗi lần chạy!
  await processStock(stock)
  log.info({ symbol: stock.symbol }, 'Stock processed')
  // → Thêm 1000 nữa = 2000 lines!
}

// ❌ Log mỗi request trong middleware
app.use((req, res, next) => {
  log.info({ url: req.url, method: req.method, headers: req.headers }, 'Request received')
  // → Hàng triệu log lines/ngày
  next()
})
```

### Đúng

```typescript
// ✅ Log tổng kết, không log từng item
const stocks = await getStocks()
const results = await Promise.all(stocks.map(processStock))
const failed = results.filter(r => !r.success)

if (failed.length > 0) {
  log.warn({ failedCount: failed.length, total: stocks.length }, 'Some stocks failed to process')
}
log.info({ processedCount: stocks.length }, 'Stocks processing completed')

// ✅ Chỉ log request bất thường
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    if (duration > 5000) {  // Chỉ log nếu > 5 giây
      log.warn({ url: req.url, duration }, 'Slow request')
    }
  })
  next()
})
```

### Hậu quả log quá nhiều

```
1. Tốn storage: 1 log line ~ 500 bytes, 1M requests/ngày = 500MB/ngày = 15GB/tháng
2. Khó tìm: log quan trọng bị chìm trong hàng triệu log vô nghĩa
3. Performance: ghi log cũng tốn CPU/IO
4. Chi phí: CloudWatch/Datadog tính tiền theo volume
```

## Sai lầm 5: Log quá ít (missing context)

### Sai

```typescript
// ❌ Catch error nhưng không log
try {
  await doSomething()
} catch (error) {
  return { error: 'Something went wrong' }  // Lỗi gì? Ở đâu?
}

// ❌ Log message nhưng không có context
log.error('Request failed')  // Request nào? User nào? Lỗi gì?

// ❌ Swallow error (nuốt lỗi)
try {
  await importantOperation()
} catch (error) {
  // Không làm gì cả, lỗi bị nuốt
}
```

### Đúng

```typescript
// ✅ Log với đủ context
try {
  await doSomething(userId, action)
} catch (error) {
  log.error({ error, userId, action }, 'doSomething failed')
  return { success: false, error: 'Something went wrong' }
}
```

### Pattern chuẩn trong logics

```typescript
// analyticsService -- Luôn có error + query context
log.error({ error, query }, 'getOverview error')

// aiTeamService -- Có action + attempt + error
log.warn({ action, attempt, error: error.message }, 'AI Team request failed')

// cronjob -- Có error hoặc key
log.error({ error }, 'Cronjob error')
log.error({ key }, 'Cronjob key already exists')
```

## Bảng tổng hợp anti-patterns

| Sai lầm | Ví dụ sai | Cách đúng |
|---------|----------|-----------|
| console.log | `console.error('ERROR', e)` | `log.error({ error }, 'message')` |
| String concat | `log.info('User ' + id)` | `log.info({ userId: id }, 'message')` |
| Log sensitive | `log.info({ password })` | `log.info({ userId })` |
| Log quá nhiều | Log trong loop 1000 items | Log tổng kết sau loop |
| Log quá ít | Catch nhưng không log | Log với error + context |

## Checklist logging cho function mới

- [ ] Import Logger, tạo child với tags đúng convention
- [ ] Dùng `log.info/warn/error`, KHÔNG dùng `console.log`
- [ ] Data truyền qua object, KHÔNG dùng string concat
- [ ] KHÔNG log sensitive data (password, token, PII)
- [ ] Log tổng kết thay vì log từng item trong loop
- [ ] Mỗi `catch` block đều có `log.error({ error, context }, 'message')`
- [ ] `warn` cho retry/bất thường, `error` cho lỗi thật sự
- [ ] Message ngắn gọn, mô tả what happened: `'getOverview error'`

## Tổng kết

5 sai lầm cần tránh:

1. **console.log** → Dùng Logger với tags
2. **String concatenation** → Object as first param
3. **Log sensitive data** → Chỉ log identifiers, dùng mask
4. **Log quá nhiều** → Log tổng kết, không log trong loop
5. **Log quá ít** → Mỗi catch đều log error + context
