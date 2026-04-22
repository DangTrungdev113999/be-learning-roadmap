# Bài tập dự án thật - Dùng data từ logics (10 bài)

## Hướng dẫn

- Các bài tập mô phỏng requirements thật từ dự án logics
- Dùng các models: `watchLists`, `rooms`, `users`, `analysisEvents`, `orders`, `notifications`
- Viết code production-ready (có validation, error handling, projection, lean)

---

## Bài 1: WatchList CRUD Service

Viết service hoàn chỉnh cho WatchList:

```ts
const watchListService = {
  // Tạo watchlist mới (kiểm tra user, tính point)
  create(userId: string, name: string): Promise<WatchList>,

  // Lấy tất cả watchlists (filter isDeleted, sort point)
  getByUser(userId: string): Promise<WatchList[]>,

  // Đổi tên (findOneAndUpdate, kiểm tra owner)
  rename(userId: string, watchListId: string, name: string): Promise<WatchList>,

  // Xoá (deleteOne, kiểm tra owner)
  delete(userId: string, watchListId: string): Promise<boolean>,
}
```

Yêu cầu:
- Validate input (userId hợp lệ, name không rỗng)
- Projection đúng
- Error handling

## Bài 2: Quản lý Symbols

Viết functions thêm/xoá symbols:

```ts
// Thêm symbols (dùng $addToSet + $each)
async function addSymbols(userId: string, watchListId: string, symbols: string[])

// Xoá symbols (dùng $pull + $in)
async function removeSymbols(userId: string, watchListId: string, symbols: string[])

// Sắp xếp lại symbols
async function reorderSymbols(userId: string, watchListId: string, symbols: string[])
```

## Bài 3: Room Pagination API

Viết API lấy danh sách rooms với:
- Phân trang (page, pageSize)
- Filter: `isDeleted != true`, optional `isPrivate`
- Sort: `numberOfMember` giảm dần
- Projection: name, owner.fullName, owner.avatar, numberOfMember

```ts
async function getRooms(params: {
  page: number
  pageSize: number
  isPrivate?: boolean
}) {
  // Promise.all cho data + count
  // .lean() cho performance
}
```

## Bài 4: Event Analytics Dashboard

Viết function cho admin dashboard:

```ts
async function getEventAnalytics(params: {
  from: Date
  to: Date
  groupBy: 'day' | 'week' | 'month'
  eventKeys?: string[]
}) {
  // Aggregation pipeline:
  // $match → $group (theo key + date) → $sort → $project
  // allowDiskUse(true)
}
```

## Bài 5: Sắp xếp lại Watchlists

Viết function sắp xếp lại thứ tự watchlists (drag & drop):

```ts
// Input: userId, watchListIds (thứ tự mới)
// Logic:
// 1. Lấy tất cả watchlists của user
// 2. Validate tất cả IDs thuộc về user
// 3. Update point cho mỗi watchlist theo thứ tự mới
// Tham khảo: WatchListsController.applyPositions
```

## Bài 6: Active Users Report

Viết function đếm active users theo platform:

```ts
async function getActiveUsers(params: {
  from: Date
  to: Date
  platform?: 'mobile' | 'web' | 'all'
  groupBy: 'day' | 'week' | 'month'
}): Promise<{ date: string; activeUsers: number; mobile: number; web: number }[]>

// Tham khảo: getActiveUsers.ts
// Dynamic $match dựa trên platform
// $addFields cho computed fields
// $group với $cond
```

## Bài 7: User Retention

Viết function tính user retention (D1, D7, D30):

```ts
// Bước 1: Aggregation trên analysisEvents → new users per day
// Bước 2: Query logs collection → check return activity
// Bước 3: Tính retention rate
// Tham khảo: getRetention.ts
```

Yêu cầu:
- Dùng 2 queries riêng (không dùng $lookup trên collection lớn)
- Promise.all cho 3 retention periods

## Bài 8: Top Content Report

Viết function lấy top N content phổ biến:

```ts
async function getTopContent(params: {
  from: Date
  to: Date
  type: 'stock' | 'post' | 'expert'
  limit: number
}): Promise<{ id: string; count: number }[]>

// Dynamic field name dựa trên type
// $match + $group + $sort + $limit + $project
// allowDiskUse(true)
```

## Bài 9: Schema Migration

Collection `watchLists` hiện có field `symbols` (array of strings). Cần migrate sang `symbolsV2` (array of objects):

```ts
// symbols: ["VCB", "TCB"]
// → symbolsV2: [{ name: "VCB", type: "stock" }, { name: "TCB", type: "stock" }]

async function migrateSymbols() {
  // Tìm tất cả watchlists có symbols nhưng chưa có symbolsV2
  // Batch update (không update 1 lần tất cả)
  // Log tiến trình
}
```

## Bài 10: Notifications System

Viết notification service hoàn chỉnh:

```ts
const notificationService = {
  // Tạo notification
  create(userId: string, title: string, content: string, category: string),

  // Tạo nhiều (dùng insertMany cho broadcast)
  broadcast(userIds: string[], title: string, content: string),

  // Lấy có phân trang (cursor-based vì feed)
  getByUser(userId: string, lastId?: string, limit?: number),

  // Đếm chưa đọc
  countUnread(userId: string),
}
```

Yêu cầu:
- Schema có TTL index (tự xoá sau 7 ngày)
- Cursor-based pagination (không dùng skip)
- insertMany cho broadcast

---

## Tiêu chí đánh giá

- [ ] Code production-ready (validation, error handling)
- [ ] Performance: projection, lean, batch operations
- [ ] Index strategy: compound indexes cho query patterns
- [ ] Aggregation: $match đầu tiên, allowDiskUse
- [ ] Security: luôn filter userId, không expose password
- [ ] Pattern: giống code thật trong logics
