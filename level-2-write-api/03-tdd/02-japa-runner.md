# Japa Runner -- Test framework của AdonisJS

## Japa vs Jest

Nếu bạn từng viết test ở FE, bạn quen Jest. AdonisJS dùng **Japa** -- nhẹ hơn, tích hợp sâu hơn.

| Tính năng | Jest (FE) | Japa (BE - logics) |
|-----------|-----------|-------------------|
| Import | `import { describe, it, expect } from '@jest/globals'` | `import { test } from '@japa/runner'` |
| Group | `describe('name', () => {})` | `test.group('name', () => {})` |
| Test case | `it('should...', () => {})` | `test('should...', async ({ assert }) => {})` |
| Assert | `expect(value).toBe(expected)` | `assert.equal(value, expected)` |
| Async | `it('...', async () => {})` | `test('...', async ({ assert }) => {})` |
| Setup/Teardown | `beforeAll / afterAll` | `group.setup / group.teardown` |
| Chạy | `npx jest` | `node ace test unit --files ...` |

## Cú pháp cơ bản

### Import

```typescript
import { test } from '@japa/runner'
```

Chỉ cần 1 import duy nhất. `assert` được truyền vào qua callback parameter.

### test.group -- Nhóm các test liên quan

```typescript
test.group('isWeekend', () => {
  // Tất cả test liên quan đến isWeekend ở đây
})
```

Tương đương `describe()` trong Jest. Dùng để nhóm test theo function/feature.

### test -- Viết một test case

```typescript
test.group('isWeekend', () => {
  test('thứ 7 là weekend', async ({ assert }) => {
    assert.isTrue(isWeekend(new Date('2026-03-14')))
  })

  test('thứ 2 không phải weekend', async ({ assert }) => {
    assert.isFalse(isWeekend(new Date('2026-03-16')))
  })
})
```

**Chú ý:** `assert` không được import, mà lấy từ parameter destructuring `({ assert })`.

## Ví dụ thực tế từ logics

### useCache.spec.ts -- Test đơn giản

```typescript
import { test } from '@japa/runner'
import { useCache } from './useCache'
import { cache } from './state'

test.group('useCache', () => {
  test('should cache and return data', async ({ assert }) => {
    let callCount = 0
    const handle = async () => {
      callCount++
      return { data: 'test' }
    }

    const result1 = await useCache(handle, ['key1'], { maxAge: 10, revalidate: 5, engine: 'memory' })
    const result2 = await useCache(handle, ['key1'], { maxAge: 10, revalidate: 5, engine: 'memory' })

    assert.deepEqual(result1, { data: 'test' })
    assert.deepEqual(result2, { data: 'test' })
    assert.equal(callCount, 1) // Gọi 2 lần nhưng handle chỉ chạy 1 lần
  })
})
```

### getOverview.spec.ts -- Test với database

```typescript
import { test } from '@japa/runner'
import { getOverview } from './getOverview'
import mongo from 'Mongo/index'

test.group('getOverview', (group) => {
  const testUid = 'test-analytics-overview'

  group.setup(async () => {
    await mongo.analysisEvents.deleteMany({ uid: testUid })
    await mongo.analysisEvents.insertMany([
      { uid: testUid, key: 'post_view', val: { postId: 'p1' }, src: 'w', createdAt: new Date('2026-01-15') },
      { uid: testUid, key: 'post_view', val: { postId: 'p2' }, src: 'm', createdAt: new Date('2026-01-15') },
      { uid: testUid, key: 'user_created', val: {}, src: 'w', createdAt: new Date('2026-01-15') },
    ])
  })

  group.teardown(async () => {
    await mongo.analysisEvents.deleteMany({ uid: testUid })
  })

  test('should return overview with correct structure', async ({ assert }) => {
    const result = await getOverview({
      from: new Date('2026-01-15'),
      to: new Date('2026-01-15T23:59:59'),
    })

    assert.properties(result, ['totalEvents', 'totalActiveUsers', 'totalNewUsers', 'topEventKeys', 'platformSplit'])
    assert.isTrue(result.totalEvents >= 3)
    assert.isArray(result.topEventKeys)
  })
})
```

## Pattern Import trong logics

Luôn import module từ entry point, không import trực tiếp từ libs:

```typescript
// DO -- Import từ entry point
import { cacheService } from 'App/Services/cacheService'
import mongo from 'Mongo/index'

// DON'T -- Import trực tiếp từ libs (chỉ dùng trong file test)
// import { useCache } from 'App/Services/cacheService/libs/useCache'
```

Ngoại lệ: trong file `.spec.ts`, import trực tiếp function cần test:

```typescript
// Trong useCache.spec.ts -- OK vì đây là test file
import { useCache } from './useCache'
```

## Cấu trúc file test

```
app/Services/cacheService/
├── index.ts           # Export service
├── docs.md            # Tài liệu
├── type.ts            # Types
├── constants.ts       # Hằng số
└── libs/
    ├── useCache.ts        # Function
    ├── useCache.spec.ts   # Test cho function
    ├── getCache.ts
    ├── setCache.ts
    └── state.ts
```

Quy tắc: **1 function = 1 file + 1 file test**.

## Chạy test

```bash
# Test 1 file cụ thể
rm -f tests/run-failed-tests.json && node ace test unit \
  --files app/Services/cacheService/libs/useCache.spec.ts

# Test toàn bộ service
rm -f tests/run-failed-tests.json && find app/Services/analyticsService/libs \
  -name "*.spec.ts" -exec node ace test unit --files {} \;
```

## Bài tập nhỏ

Viết lại test sau theo cú pháp Japa (chuyển từ Jest sang Japa):

```typescript
// Jest
describe('add', () => {
  it('should add two numbers', () => {
    expect(add(1, 2)).toBe(3)
  })
  it('should handle negative numbers', () => {
    expect(add(-1, -2)).toBe(-3)
  })
})
```

<details>
<summary>Đáp án</summary>

```typescript
import { test } from '@japa/runner'
import { add } from './add'

test.group('add', () => {
  test('should add two numbers', async ({ assert }) => {
    assert.equal(add(1, 2), 3)
  })
  test('should handle negative numbers', async ({ assert }) => {
    assert.equal(add(-1, -2), -3)
  })
})
```

</details>
