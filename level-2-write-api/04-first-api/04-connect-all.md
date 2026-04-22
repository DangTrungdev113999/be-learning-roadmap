# Kết nối tất cả: Route → Controller → Service → MongoDB

## Bức tranh toàn cảnh

```
Client (FE)
  │
  │  GET /api/tutorials?category=trading&page=1
  │
  ▼
routes/index.ts
  │  Route.group(() => tutorials(Route)).prefix('/tutorials')
  │
  ▼
routes/tutorials.ts
  │  Route.get('/', 'TutorialsController.list')
  │
  ▼
app/Middleware/RateLimit.ts
  │  Kiểm tra rate limit (60 req/s per IP)
  │
  ▼
app/Controllers/Http/TutorialsController.ts
  │  Nhận input, validate, gọi service
  │
  ▼
app/Services/tutorialService/libs/listTutorials.ts
  │  Query MongoDB, xử lý logic
  │
  ▼
MongoDB (collection: tutorials)
  │  Trả dữ liệu
  │
  ▼
Client nhận JSON response
```

## Walkthrough: Xây API "List Tutorials" từ đầu đến cuối

### Bước 1: Tạo service function (viết test trước)

```typescript
// app/Services/tutorialService/libs/listTutorials.spec.ts
import { test } from '@japa/runner'
import { listTutorials } from './listTutorials'
import mongo from 'Mongo/index'

test.group('listTutorials', (group) => {
  const testCategory = 'test-connect-all'

  group.setup(async () => {
    await mongo.tutorials.deleteMany({ category: testCategory })
    await mongo.tutorials.insertMany([
      { title: 'Bài 1', category: testCategory, isPublished: true, createdAt: new Date('2026-01-01') },
      { title: 'Bài 2', category: testCategory, isPublished: true, createdAt: new Date('2026-01-02') },
      { title: 'Bài 3', category: testCategory, isPublished: true, createdAt: new Date('2026-01-03') },
      { title: 'Bài 4', category: testCategory, isPublished: false, createdAt: new Date('2026-01-04') },
      { title: 'Bài 5', category: testCategory, isPublished: true, createdAt: new Date('2026-01-05') },
    ])
  })

  group.teardown(async () => {
    await mongo.tutorials.deleteMany({ category: testCategory })
  })

  test('should return paginated published tutorials', async ({ assert }) => {
    const result = await listTutorials({ category: testCategory, page: 1, pageSize: 2 })

    assert.properties(result, ['data', 'total'])
    assert.lengthOf(result.data, 2)
    assert.equal(result.total, 4) // 4 published
  })

  test('should return page 2', async ({ assert }) => {
    const result = await listTutorials({ category: testCategory, page: 2, pageSize: 2 })

    assert.lengthOf(result.data, 2) // 4 published, page 2 có 2
  })

  test('should return empty for invalid category', async ({ assert }) => {
    const result = await listTutorials({ category: 'nonexistent', page: 1, pageSize: 10 })

    assert.lengthOf(result.data, 0)
    assert.equal(result.total, 0)
  })
})
```

### Bước 2: Implement service function

```typescript
// app/Services/tutorialService/libs/listTutorials.ts
import mongo from 'Mongo/index'
import Logger from '@ioc:Adonis/Core/Logger'

const log = Logger.child({ tags: ['tutorialService.listTutorials'] })

type ListTutorialsParams = {
  category: string
  page: number
  pageSize: number
}

export async function listTutorials({ category, page, pageSize }: ListTutorialsParams) {
  const filter = { category, isPublished: true }

  const [data, total] = await Promise.all([
    mongo.tutorials
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    mongo.tutorials.countDocuments(filter),
  ])

  log.info({ category, page, total }, 'Listed tutorials')

  return { data, total }
}
```

### Bước 3: Export trong service index

```typescript
// app/Services/tutorialService/index.ts
import { listTutorials } from './libs/listTutorials'

export const tutorialService = {
  listTutorials,
}
```

### Bước 4: Tạo controller

```typescript
// app/Controllers/Http/TutorialsController.ts
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { tutorialService } from 'App/Services/tutorialService'

export default class TutorialsController {
  public async list({ util }: HttpContextContract) {
    const category = util.gp('category')
    const page = util.gp('page', 1, 'number')
    const pageSize = util.gp('pageSize', 10, 'number')

    util.check(category.length > 0, 'Thiếu category code:missing_category')

    const { data, total } = await tutorialService.listTutorials({
      category,
      page,
      pageSize,
    })

    return {
      data,
      paging: { total, page, pageSize },
    }
  }
}
```

### Bước 5: Tạo route

```typescript
// routes/tutorials.ts
import { RouterContract } from '@ioc:Adonis/Core/Route'

export const tutorials = (Route: RouterContract) => {
  Route.get('/', 'TutorialsController.list')
}
```

### Bước 6: Đăng ký route trong index

```typescript
// routes/index.ts -- thêm vào trong Route.group
import { tutorials } from './tutorials'

Route.group(() => tutorials(Route))
  .prefix('/tutorials')
  .middleware(RateLimitMiddleware.build('/api/tutorials', 'ip', 60, 1))
```

### Bước 7: Chạy test

```bash
rm -f tests/run-failed-tests.json && node ace test unit \
  --files app/Services/tutorialService/libs/listTutorials.spec.ts
```

### Bước 8: Type check

```bash
yarn tsc --noEmit
```

## Luồng dữ liệu chi tiết

Khi FE gọi `GET /api/tutorials?category=trading&page=1&pageSize=10`:

```
1. Request đến server
   URL: GET /api/tutorials?category=trading&page=1&pageSize=10

2. Route matching
   routes/index.ts → prefix /api
   routes/tutorials.ts → Route.get('/', ...)
   Khớp → gọi TutorialsController.list

3. Middleware chạy
   RateLimitMiddleware: kiểm tra IP, tăng counter trong Redis
   Nếu > 60 req/s → trả 429 Too Many Requests
   Nếu OK → next()

4. Controller chạy
   util.gp('category') → 'trading'
   util.gp('page', 1, 'number') → 1
   util.gp('pageSize', 10, 'number') → 10
   util.check(category.length > 0, ...) → OK
   Gọi tutorialService.listTutorials(...)

5. Service chạy
   MongoDB query: find({ category: 'trading', isPublished: true })
                  .sort({ createdAt: -1 })
                  .skip(0).limit(10)
   Trả { data: [...], total: 25 }

6. Response
   {
     "data": [{ "title": "...", ... }, ...],
     "paging": { "total": 25, "page": 1, "pageSize": 10 }
   }
```

## Checklist tạo API mới

- [ ] Viết test cho service function (TDD)
- [ ] Implement service function
- [ ] Export trong service `index.ts`
- [ ] Tạo controller method
- [ ] Tạo route file
- [ ] Đăng ký route trong `routes/index.ts`
- [ ] Chạy test: `node ace test unit --files ...`
- [ ] Chạy type check: `yarn tsc --noEmit`
- [ ] Test bằng curl/Postman (bài tiếp theo)
