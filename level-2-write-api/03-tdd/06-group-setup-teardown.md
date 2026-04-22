# Lifecycle: group.setup và group.teardown

## Vấn đề: Test cần dữ liệu

Nhiều test cần dữ liệu có sẵn trong database. Nếu mỗi test tự tạo/xoá dữ liệu, code sẽ lặp lại rất nhiều. Japa cung cấp lifecycle hooks để giải quyết.

## Lifecycle hooks

```
group.setup()      ← Chạy 1 lần TRƯỚC tất cả test trong group
  test 1           ← Chạy test
  test 2           ← Chạy test
  test 3           ← Chạy test
group.teardown()   ← Chạy 1 lần SAU tất cả test trong group
```

## Cú pháp

```typescript
test.group('functionName', (group) => {
  // Chạy trước tất cả test
  group.setup(async () => {
    // Chuẩn bị dữ liệu
  })

  // Chạy sau tất cả test
  group.teardown(async () => {
    // Dọn dẹp dữ liệu
  })

  test('case 1', async ({ assert }) => { ... })
  test('case 2', async ({ assert }) => { ... })
})
```

**Chú ý:** Callback của `test.group` nhận parameter `group` (khác với không có lifecycle thì bỏ trống).

## Ví dụ thực tế: getOverview.spec.ts

Đây là code thật từ `analyticsService/libs/getOverview.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { getOverview } from './getOverview'
import mongo from 'Mongo/index'

test.group('getOverview', (group) => {
  const testUid = 'test-analytics-overview'

  // ===== SETUP: Insert test data vào MongoDB =====
  group.setup(async () => {
    // Xoá data cũ (phòng trường hợp test trước chưa cleanup)
    await mongo.analysisEvents.deleteMany({ uid: testUid })

    // Insert data test
    await mongo.analysisEvents.insertMany([
      {
        uid: testUid,
        key: 'post_view',
        val: { postId: 'p1' },
        src: 'w',
        createdAt: new Date('2026-01-15'),
      },
      {
        uid: testUid,
        key: 'post_view',
        val: { postId: 'p2' },
        src: 'm',
        createdAt: new Date('2026-01-15'),
      },
      {
        uid: testUid,
        key: 'user_created',
        val: {},
        src: 'w',
        createdAt: new Date('2026-01-15'),
      },
    ])
  })

  // ===== TEARDOWN: Dọn dẹp sau khi test xong =====
  group.teardown(async () => {
    await mongo.analysisEvents.deleteMany({ uid: testUid })
  })

  // ===== TEST CASES =====
  test('should return overview with correct structure', async ({ assert }) => {
    const result = await getOverview({
      from: new Date('2026-01-15'),
      to: new Date('2026-01-15T23:59:59'),
    })

    assert.properties(result, ['totalEvents', 'totalActiveUsers', 'totalNewUsers', 'topEventKeys', 'platformSplit'])
    assert.isTrue(result.totalEvents >= 3)
    assert.isTrue(result.totalNewUsers >= 1)
    assert.isArray(result.topEventKeys)
  })

  test('should return zeroes for empty date range', async ({ assert }) => {
    const result = await getOverview({
      from: new Date('2020-01-01'),
      to: new Date('2020-01-02'),
    })

    assert.equal(result.totalEvents, 0)
    assert.equal(result.totalNewUsers, 0)
  })
})
```

## Phân tích flow

```
1. group.setup() chạy:
   → Xoá data cũ với uid = 'test-analytics-overview'
   → Insert 3 documents vào analysisEvents

2. test 'should return overview...' chạy:
   → Gọi getOverview() → query database → có 3 documents
   → Assert structure và values

3. test 'should return zeroes...' chạy:
   → Gọi getOverview() với date range 2020 → không có data
   → Assert trả về 0

4. group.teardown() chạy:
   → Xoá tất cả documents với uid = 'test-analytics-overview'
   → Database sạch như ban đầu
```

## Tại sao cần testUid riêng?

```typescript
const testUid = 'test-analytics-overview'
```

Dùng một UID riêng biệt cho test để:
- Không xung đột với data thật trong database
- `deleteMany({ uid: testUid })` chỉ xoá data test, không ảnh hưởng data khác
- Nhiều developer chạy test cùng lúc cũng không conflict

## Pattern: Setup cả MongoDB và cache

```typescript
test.group('functionWithCache', (group) => {
  const testId = 'test-cached-function'

  group.setup(async () => {
    // Clear cache
    cache.flushAll()

    // Insert test data
    await mongo.collection.deleteMany({ testId })
    await mongo.collection.insertMany([...testData])
  })

  group.teardown(async () => {
    cache.flushAll()
    await mongo.collection.deleteMany({ testId })
  })

  test('should return cached data', async ({ assert }) => {
    // Lần 1: cache miss, query DB
    const result1 = await cachedFunction(testId)
    // Lần 2: cache hit
    const result2 = await cachedFunction(testId)

    assert.deepEqual(result1, result2)
  })
})
```

## Pattern: Setup mock, teardown restore

```typescript
test.group('createRoom', (group) => {
  let originalCreateRoom: typeof social_service.RoomService.createRoom

  group.setup(() => {
    originalCreateRoom = social_service.RoomService.createRoom
  })

  group.teardown(() => {
    social_service.RoomService.createRoom = originalCreateRoom
  })

  test('should validate name length', async ({ assert }) => {
    social_service.RoomService.createRoom = async () => ({
      data: { _id: 'mock-id' },
      error: null,
    })

    // Test validation logic...
  })
})
```

## So sánh với Jest/FE

| Japa (BE) | Jest (FE) | Chạy khi nào |
|-----------|-----------|-------------|
| `group.setup()` | `beforeAll()` | Trước tất cả test trong group |
| `group.teardown()` | `afterAll()` | Sau tất cả test trong group |
| `group.each.setup()` | `beforeEach()` | Trước MỖI test |
| `group.each.teardown()` | `afterEach()` | Sau MỖI test |

### group.each -- chạy trước/sau MỖI test

```typescript
test.group('useCache', (group) => {
  // Chạy trước MỖI test case
  group.each.setup(() => {
    cache.flushAll() // Reset cache trước mỗi test
  })

  test('test 1', async ({ assert }) => {
    // cache đã sạch
  })

  test('test 2', async ({ assert }) => {
    // cache lại sạch (flushAll chạy lại)
  })
})
```

## Quy tắc vàng: Luôn cleanup

Nếu setup tạo dữ liệu, teardown PHẢI xoá dữ liệu. Nếu không:
- Test chạy lần 2 sẽ fail (duplicate data)
- Database test ngày càng phình to
- Test của người khác bị ảnh hưởng

```typescript
// LUÔN có cặp setup/teardown
group.setup(async () => {
  await mongo.collection.insertMany([...data])    // TẠO
})

group.teardown(async () => {
  await mongo.collection.deleteMany({ testId })    // XOÁ
})
```

## Bài tập

Viết test group với setup/teardown cho function `getTopStocks()` -- function query MongoDB collection `stocks`, trả về top 5 cổ phiếu theo volume. Test cần:
1. Setup: insert 10 documents với volume khác nhau
2. Test: verify kết quả trả về 5 items, sắp xếp giảm dần
3. Teardown: xoá tất cả test data
