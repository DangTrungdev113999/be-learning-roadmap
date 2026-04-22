# Service Function -- Nơi chứa logic thực sự

## Vị trí trong kiến trúc

```
Route → Controller → SERVICE → MongoDB/Redis
                     ^^^^^^^^
                     Logic ở đây
```

Controller chỉ nhận input và trả output. **Toàn bộ business logic nằm trong service.**

## Cấu trúc service trong logics

```
app/Services/cacheService/
├── docs.md            ← Tài liệu (đọc trước khi code)
├── index.ts           ← Export service object
├── type.ts            ← TypeScript types
├── constants.ts       ← Hằng số
└── libs/
    ├── useCache.ts        ← Function chính
    ├── useCache.spec.ts   ← Test cho function
    ├── getCache.ts
    ├── setCache.ts
    └── state.ts
```

Quy tắc: **1 function = 1 file + 1 file test**.

## Workflow viết service function (TDD)

### Bước 1: Đọc docs.md

```bash
# Tìm function trong docs
grep '### functionName()' -A 15 app/Services/serviceName/docs.md
```

### Bước 2: Viết test trước

```typescript
// app/Services/tutorialService/libs/getTutorialsByCategory.spec.ts
import { test } from '@japa/runner'
import { getTutorialsByCategory } from './getTutorialsByCategory'
import mongo from 'Mongo/index'

test.group('getTutorialsByCategory', (group) => {
  const testCategory = 'test-category-tdd'

  group.setup(async () => {
    await mongo.tutorials.deleteMany({ category: testCategory })
    await mongo.tutorials.insertMany([
      { title: 'Tutorial 1', category: testCategory, order: 2, isPublished: true },
      { title: 'Tutorial 2', category: testCategory, order: 1, isPublished: true },
      { title: 'Tutorial 3', category: testCategory, order: 3, isPublished: false },
    ])
  })

  group.teardown(async () => {
    await mongo.tutorials.deleteMany({ category: testCategory })
  })

  test('should return published tutorials sorted by order', async ({ assert }) => {
    const result = await getTutorialsByCategory({ category: testCategory })

    assert.lengthOf(result, 2) // Chỉ 2 cái published
    assert.equal(result[0].title, 'Tutorial 2') // order: 1 lên đầu
    assert.equal(result[1].title, 'Tutorial 1') // order: 2
  })

  test('should return empty array for unknown category', async ({ assert }) => {
    const result = await getTutorialsByCategory({ category: 'nonexistent' })

    assert.isArray(result)
    assert.lengthOf(result, 0)
  })
})
```

### Bước 3: Implement function

```typescript
// app/Services/tutorialService/libs/getTutorialsByCategory.ts
import mongo from 'Mongo/index'

/**
 * Get published tutorials by category, sorted by display order
 */
export async function getTutorialsByCategory({ category }: { category: string }) {
  const tutorials = await mongo.tutorials
    .find({
      category,
      isPublished: true,
    })
    .sort({ order: 1 })
    .toArray()

  return tutorials
}
```

### Bước 4: Chạy test

```bash
rm -f tests/run-failed-tests.json && node ace test unit \
  --files app/Services/tutorialService/libs/getTutorialsByCategory.spec.ts
```

### Bước 5: Export trong index.ts

```typescript
// app/Services/tutorialService/index.ts
import { getTutorialsByCategory } from './libs/getTutorialsByCategory'

export const tutorialService = {
  getTutorialsByCategory,
}
```

### Bước 6: Kiểm tra type

```bash
yarn tsc --noEmit
```

## Ví dụ thực tế: useCache

Đây là service function thật từ `cacheService`:

```typescript
// app/Services/cacheService/libs/useCache.ts
export async function useCache(
  handle: () => any,
  dependencies: any[],
  maxAge?: number | UseCacheOptions,
): Promise<any> {
  // Parse options
  const options: UseCacheOptions = {
    maxAge: CACHE_EXPIRE_SECONDS,
    revalidate: CACHE_REVALIDATE_SECONDS,
    prefix: '',
    engine: 'memory',
  }

  if (typeof maxAge === 'object') {
    Object.assign(options, maxAge)
  }

  if (!options.engine || !options.maxAge || !options.revalidate) {
    throw new Error('Missing required options')
  }

  // Tạo cache key từ dependencies
  const hash = crypto.createHash('md5').update(JSON.stringify(dependencies)).digest('hex')
  const key = `${VERSION}.${options.prefix}:${hash}`

  // Kiểm tra cache
  const { data, iat } = await getCache(key, options.engine)

  if (data) {
    revalidate(key, iat, options, handle).catch((error) => {
      log.error({ error, key }, 'Revalidate failed silently')
    })
    return data
  }

  // Cache stampede protection
  const existingDeferred = deferredMap.get(key)
  if (existingDeferred) {
    return await existingDeferred
  }

  // Gọi handle và cache kết quả
  try {
    const data = await handle()
    await setCache(key, data, options.engine, options.maxAge + options.revalidate)
    return data
  } catch (error) {
    throw error
  }
}
```

Và nó được export trong `index.ts`:

```typescript
// app/Services/cacheService/index.ts
import { useCache } from './libs/useCache'
import { removeCacheByPrefix } from './libs/removeCacheByPrefix'

export const cacheService = {
  useCache,
  removeCacheByPrefix,
}
```

## Logger trong service

Mỗi service function nên có logger:

```typescript
import Logger from '@ioc:Adonis/Core/Logger'

const log = Logger.child({ tags: ['tutorialService.getTutorialsByCategory'] })

export async function getTutorialsByCategory({ category }: { category: string }) {
  log.info({ category }, 'Fetching tutorials')

  try {
    const tutorials = await mongo.tutorials.find({ category }).toArray()
    log.info({ count: tutorials.length }, 'Tutorials fetched')
    return tutorials
  } catch (error) {
    log.error({ error, category }, 'Failed to fetch tutorials')
    throw error
  }
}
```

## Import service từ controller

```typescript
// Trong controller -- import từ entry point
import { tutorialService } from 'App/Services/tutorialService'

// Gọi method
const result = await tutorialService.getTutorialsByCategory({ category })
```

**KHÔNG import trực tiếp từ libs:**

```typescript
// SAI
import { getTutorialsByCategory } from 'App/Services/tutorialService/libs/getTutorialsByCategory'
```

## Checklist viết service function

- [ ] Đọc `docs.md` trước
- [ ] Viết file test `.spec.ts` trước (TDD)
- [ ] Implement function trong file riêng (`libs/functionName.ts`)
- [ ] Chạy test pass
- [ ] Export trong `index.ts`
- [ ] Chạy `yarn tsc --noEmit`
- [ ] Cập nhật `docs.md`

## Bài tập

Viết service function `getActiveRoomCount()` theo TDD:
1. Viết test: query collection `rooms`, đếm rooms có `isActive: true`
2. Implement: dùng `mongo.rooms.countDocuments({ isActive: true })`
3. Export trong `index.ts`
4. Chạy test và type check
