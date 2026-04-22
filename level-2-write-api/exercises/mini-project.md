# Mini Project Level 2: API Quản lý Bookmarks

> Tổng hợp tất cả kiến thức Level 2 vào 1 project thực tế.
> Tạo API CRUD cho tính năng Bookmarks (lưu bài viết yêu thích).

---

## Yêu cầu

Tạo tính năng **Bookmarks** cho phép user lưu/xóa/xem các bài viết yêu thích.

### API cần tạo

| Method | URL | Mô tả | Auth |
|---|---|---|---|
| GET | `/api/bookmarks` | Lấy danh sách bookmarks (có phân trang) | Login |
| POST | `/api/bookmarks` | Thêm bookmark mới | Login |
| DELETE | `/api/bookmarks` | Xóa bookmark | Login |
| GET | `/api/bookmarks/count` | Đếm số bookmark | Login |

### MongoDB Schema

```typescript
// mongo/bookmarks.ts
const schema = new mongoose.Schema({
  userId: { type: ObjectId, required: true, index: true },
  postId: { type: ObjectId, required: true },
  postTitle: { type: String },
  postType: { type: String, enum: ['news', 'analysis', 'signal'] },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true })

schema.index({ userId: 1, postId: 1 }, { unique: true })
schema.index({ userId: 1, isDeleted: 1, createdAt: -1 })
```

---

## Các bước thực hiện

### Bước 1: Tạo MongoDB Model
- Tạo file `mongo/bookmarks.ts`
- Export trong `mongo/index.ts`

### Bước 2: Tạo Service (TDD)

```
app/Services/bookmarkService/
├── docs.md
├── index.ts
├── type.ts
├── constants.ts
└── libs/
    ├── getBookmarks.ts
    ├── getBookmarks.spec.ts
    ├── addBookmark.ts
    ├── addBookmark.spec.ts
    ├── removeBookmark.ts
    ├── removeBookmark.spec.ts
    ├── countBookmarks.ts
    └── countBookmarks.spec.ts
```

Workflow cho mỗi function:
1. Viết docs.md trước
2. Viết test (.spec.ts) — chạy FAIL
3. Implement function — chạy PASS
4. Export trong index.ts

### Bước 3: Tạo Controller

```typescript
// app/Controllers/Http/BookmarksController.ts

public async list({ util, maker }: HttpContextContract) {
  await util.auth.login()
  const page = util.gp('page', 1, 'number')
  const pageSize = util.gp('pageSize', 20, 'number')
  const postType = util.gp('postType', null, ['news', 'analysis', 'signal'])
  // ... gọi service, trả { data, paging }
}

public async add({ util, maker }: HttpContextContract) {
  await util.auth.login()
  const postId = util.gp('postId')
  const postTitle = util.gp('postTitle', null)
  const postType = util.gp('postType', 'news', ['news', 'analysis', 'signal'])
  // ... gọi service, trả { data }
}
```

### Bước 4: Tạo Route

```typescript
// routes/bookmarks.ts
export const bookmarks = (Route: RouterContract) => {
  Route.get('/', 'BookmarksController.list')
  Route.post('/', 'BookmarksController.add')
  Route.delete('/', 'BookmarksController.remove')
  Route.get('/count', 'BookmarksController.count')
}
```

Mount trong `routes/index.ts` với prefix `/api/bookmarks`.

### Bước 5: Test bằng curl

```bash
# Lấy danh sách
curl "http://localhost:3333/api/bookmarks?page=1&pageSize=10" -H "Authorization: Bearer TOKEN"

# Thêm bookmark
curl -X POST "http://localhost:3333/api/bookmarks" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"postId": "abc123", "postTitle": "Phân tích VNM", "postType": "analysis"}'

# Xóa bookmark
curl -X DELETE "http://localhost:3333/api/bookmarks" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"postId": "abc123"}'

# Đếm
curl "http://localhost:3333/api/bookmarks/count" -H "Authorization: Bearer TOKEN"
```

---

## Bonus (nếu muốn thử thêm)

1. **Cache**: Dùng `cacheService.useCache()` cho API count
2. **Soft delete**: Dùng `isDeleted` thay vì xóa thật
3. **Unique constraint**: Không cho bookmark trùng (userId + postId)
4. **Aggregation**: API thống kê bookmark theo postType

---

## Tiêu chí hoàn thành

- [ ] 4 API hoạt động đúng
- [ ] Có unit test cho mỗi service function
- [ ] Tất cả test pass
- [ ] `yarn tsc --noEmit` không lỗi
- [ ] Có docs.md cho bookmarkService
- [ ] Code theo đúng pattern của project (không try/catch controller, dùng util.gp/check)
