# Mocking -- Giả lập dependencies trong test

## Tại sao cần mock?

Khi test function `createRoom()`, bạn không muốn:
- Gọi API thật đến social service
- Ghi dữ liệu thật vào database production
- Gửi notification thật cho user

Mock giúp **thay thế dependency thật bằng bản giả** để test logic riêng lẻ.

## So sánh FE vs BE mocking

```
FE: jest.mock('axios')         → Mock HTTP client
BE: service.method = mockFn    → Mock service method
    Object.defineProperty(...)  → Mock module export
```

## Cách 1: Mock service method (đơn giản nhất)

Khi function gọi một service method, mock trực tiếp method đó:

```typescript
import { test } from '@japa/runner'
import { socialService } from 'App/Services/socialService'

test.group('limitContent', () => {
  test('should limit content for free users', async ({ assert }) => {
    // Lưu method gốc
    const originalMethod = socialService.limitContent

    // Mock
    socialService.limitContent = async ({ datas }) => {
      // Giả lập: cắt content cho user free
      datas.forEach((item) => {
        item.content = item.content.substring(0, 100)
      })
    }

    // Test logic
    const datas = [{ content: 'A'.repeat(500) }]
    await socialService.limitContent({ datas, maker: null, appinfo: null, isPro: false, isAdmin: false })

    assert.equal(datas[0].content.length, 100)

    // Khôi phục method gốc
    socialService.limitContent = originalMethod
  })
})
```

## Cách 2: Object.defineProperty (mock module export)

Khi function được export trực tiếp (không phải method của object):

```typescript
import { test } from '@japa/runner'
import * as useCacheModule from './useCache'

test.group('functionUsingCache', () => {
  test('should call useCache with correct params', async ({ assert }) => {
    let capturedArgs: any[] = []

    // Mock function export
    Object.defineProperty(useCacheModule, 'useCache', {
      value: async (handle, deps, opts) => {
        capturedArgs = [handle, deps, opts]
        return { data: 'mocked' }
      },
      writable: true,
      configurable: true,
    })

    // Gọi function cần test
    const result = await someFunction()

    // Verify mock được gọi đúng
    assert.equal(capturedArgs[1][0], 'expected-key')
    assert.deepEqual(result, { data: 'mocked' })
  })
})
```

## Cách 3: Mock với callback counter

Pattern phổ biến nhất trong logics -- đếm số lần function được gọi:

```typescript
// Từ useCache.spec.ts thực tế
test('should handle cache stampede', async ({ assert }) => {
  let callCount = 0
  const handle = async () => {
    callCount++
    await new Promise((resolve) => setTimeout(resolve, 100))
    return { data: 'test' }
  }

  cache.flushAll()

  // 3 request đồng thời
  const promises = [
    useCache(handle, ['stampede'], { maxAge: 10, revalidate: 5, engine: 'memory' }),
    useCache(handle, ['stampede'], { maxAge: 10, revalidate: 5, engine: 'memory' }),
    useCache(handle, ['stampede'], { maxAge: 10, revalidate: 5, engine: 'memory' }),
  ]

  const results = await Promise.all(promises)

  // Tất cả trả cùng data
  results.forEach((result) => {
    assert.deepEqual(result, { data: 'test' })
  })

  // handle chỉ chạy 1 lần (stampede protection)
  assert.equal(callCount, 1)
})
```

`callCount` là mock đơn giản nhất -- chỉ đếm. Không cần thư viện mock phức tạp.

## Khi nào mock, khi nào không?

### MOCK khi:

| Tình huống | Ví dụ |
|-----------|-------|
| Gọi external service | `social_service.RoomService.createRoom()` |
| Gọi database write | `mongo.rooms.insertOne()` |
| Gọi Redis write | `pubclient.set()` |
| Gửi notification | `notificationService.send()` |
| Gọi API bên thứ 3 | `paymentGateway.charge()` |

### KHÔNG mock khi:

| Tình huống | Lý do |
|-----------|-------|
| Logic thuần (pure function) | `isWeekend()` -- không có side effect |
| Test integration | Test toàn bộ flow từ đầu đến cuối |
| Test với test database | Dùng data thật, cleanup sau |

### Ví dụ thực tế -- getOverview KHÔNG mock database:

```typescript
// getOverview.spec.ts -- dùng database thật, KHÔNG mock
test.group('getOverview', (group) => {
  const testUid = 'test-analytics-overview'

  // Insert test data vào DB thật
  group.setup(async () => {
    await mongo.analysisEvents.deleteMany({ uid: testUid })
    await mongo.analysisEvents.insertMany([...testData])
  })

  // Cleanup sau khi test xong
  group.teardown(async () => {
    await mongo.analysisEvents.deleteMany({ uid: testUid })
  })

  test('should return overview with correct structure', async ({ assert }) => {
    const result = await getOverview({ from, to })
    assert.properties(result, ['totalEvents', 'totalActiveUsers'])
  })
})
```

## Pattern: Save & Restore

Luôn khôi phục mock sau khi test xong để không ảnh hưởng test khác:

```typescript
test.group('myFunction', (group) => {
  let originalMethod: typeof someService.someMethod

  group.setup(() => {
    // Lưu method gốc
    originalMethod = someService.someMethod
  })

  group.teardown(() => {
    // Khôi phục method gốc
    someService.someMethod = originalMethod
  })

  test('test case 1', async ({ assert }) => {
    someService.someMethod = async () => 'mocked'
    // ... test logic
  })
})
```

## Sai lầm thường gặp

### 1. Mock quá nhiều

```typescript
// SAI -- mock tất cả, test chẳng test được gì
test('should create room', async ({ assert }) => {
  const createRoom = async () => ({ data: { _id: '123' } })
  const result = await createRoom()
  assert.equal(result.data._id, '123') // Test gì đây? Test mock trả về đúng?
})
```

### 2. Quên khôi phục mock

```typescript
// SAI -- mock ở test 1, ảnh hưởng test 2
test('test 1', async ({ assert }) => {
  someService.method = async () => 'mocked'
  // Quên khôi phục → test 2 dùng mock thay vì function thật
})
```

### 3. Mock internal implementation

```typescript
// SAI -- mock chi tiết bên trong function
// Chỉ mock boundary (database, external service), không mock logic nội bộ
```

## Tổng kết

| Kỹ thuật | Khi nào dùng | Cú pháp |
|---------|-------------|---------|
| `service.method = mockFn` | Mock method của service object | Đơn giản, dùng nhiều nhất |
| `Object.defineProperty` | Mock export trực tiếp | Khi function không nằm trong object |
| Callback counter | Đếm số lần gọi | `let count = 0; const fn = () => { count++ }` |
| Save & Restore | Cleanup mock | `group.setup` / `group.teardown` |
