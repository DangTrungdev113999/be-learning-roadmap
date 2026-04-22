# Schema Migration -- Thay đổi schema trong MongoDB

## Mục tiêu

Hiểu cách thay đổi schema MongoDB an toàn: thêm field, đổi type, backfill data, xóa field. MongoDB không có migration tool như SQL -- cách Finpath xử lý.

---

## 1. MongoDB vs SQL: Schema Evolution khác biệt

### SQL (PostgreSQL, MySQL)

```sql
-- Migration file: 20260318_add_avatar.sql
ALTER TABLE users ADD COLUMN avatar VARCHAR(255);
ALTER TABLE users ALTER COLUMN phone_number SET NOT NULL;
ALTER TABLE users DROP COLUMN old_field;

-- Chạy bằng tool: knex migrate:latest, prisma migrate deploy
-- Rollback: knex migrate:rollback
```

SQL có **migration tool** rõ ràng: mỗi thay đổi = 1 file, chạy tuần tự, có rollback.

### MongoDB

```ts
// Không có ALTER TABLE
// Không có migration tool built-in
// Documents trong cùng collection CÓ THỂ có schema khác nhau!

// Document cũ (trước khi thêm avatar)
{ _id: 'u1', fullName: 'Trung' }

// Document mới (sau khi thêm avatar)
{ _id: 'u2', fullName: 'Minh', avatar: '/minh.jpg' }

// Cả hai đều hợp lệ trong cùng collection!
```

### So sánh FE: API versioning

```typescript
// FE: API response thay đổi theo version
// v1: { user: { name: 'Trung' } }
// v2: { user: { fullName: 'Trung', avatar: '/trung.jpg' } }

// FE phải handle cả 2 format:
const displayName = user.fullName || user.name || 'Unknown'
```

MongoDB schema evolution tương tự: code phải handle cả documents cũ (chưa có field mới) và documents mới.

---

## 2. Thêm Field mới

### Trường hợp đơn giản: Field optional với default

```ts
// TRƯỚC: rooms.ts
const schema = new mongoose.Schema({
  name: String,
  owner: { _id: String, fullName: String },
})

// SAU: Thêm isPrivate
const schema = new mongoose.Schema({
  name: String,
  owner: { _id: String, fullName: String },
  isPrivate: Boolean,  // Documents cũ: isPrivate = undefined
})
```

**Không cần migration.** Documents cũ không có `isPrivate`, query sẽ trả `undefined`. Code xử lý:

```ts
// ✅ Handle undefined
const isPrivate = room.isPrivate ?? false
// Hoặc dùng default trong schema:
isPrivate: { type: Boolean, default: false }
```

### Trường hợp phức tạp: Field required cho logic

```ts
// Thêm field "plan" cho users -- ảnh hưởng authorization logic
plan: {
  level: { type: String, enum: ['BASIC', 'PRO', 'EXPERT'], default: 'BASIC' },
  expiredDate: Date,
}
```

**Cần backfill** cho documents cũ. Nếu không, users cũ không có `plan.level` sẽ bị lỗi ở authorization check.

---

## 3. Backfill Data -- Cập nhật documents cũ

### Script backfill

```ts
// scripts/backfill-user-plan.ts
import mongo from 'Mongo'

async function backfillUserPlan() {
  const log = Logger.child({ tags: ['backfill.userPlan'] })

  // Đếm documents cần update
  const count = await mongo.users.countDocuments({
    'plan.level': { $exists: false },
  })
  log.info({ count }, 'Documents to backfill')

  // Update batch -- KHÔNG update tất cả 1 lần (lock collection)
  const BATCH_SIZE = 1000
  let updated = 0

  while (updated < count) {
    const result = await mongo.users.updateMany(
      { 'plan.level': { $exists: false } },
      {
        $set: {
          'plan.level': 'BASIC',
          'plan.expiredDate': null,
        },
      },
      { limit: BATCH_SIZE },  // Mongoose không hỗ trợ limit trong updateMany
    )

    updated += result.modifiedCount

    log.info({ updated, total: count }, 'Progress')

    // Nghỉ giữa các batch để không overload DB
    await new Promise((r) => setTimeout(r, 100))
  }

  log.info({ updated }, 'Backfill completed')
}
```

### Batch update an toàn

```ts
// ❌ NGUY HIỂM: Update 1 triệu documents cùng lúc
await mongo.users.updateMany({}, { $set: { plan: { level: 'BASIC' } } })
// Lock collection, chậm, có thể timeout

// ✅ AN TOÀN: Update theo batch
const cursor = mongo.users.find({ 'plan.level': { $exists: false } }).cursor()

let batch = []
for await (const doc of cursor) {
  batch.push({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { 'plan.level': 'BASIC' } },
    },
  })

  if (batch.length >= 1000) {
    await mongo.users.bulkWrite(batch)
    batch = []
    await new Promise((r) => setTimeout(r, 50)) // Throttle
  }
}

if (batch.length > 0) {
  await mongo.users.bulkWrite(batch)
}
```

### Lưu ý quan trọng

- **Không chạy trên production giờ cao điểm** -- update nhiều documents tốn I/O
- **Luôn có filter** trong updateMany -- không bao giờ `updateMany({}, ...)` trên production
- **Test trên staging trước** -- verify kết quả đúng
- **Log progress** -- biết chạy đến đâu nếu bị gián đoạn
- **Idempotent** -- chạy lại cho kết quả giống nhau (dùng `$exists: false` làm filter)

---

## 4. Đổi Type của Field

### Ví dụ: Đổi `symbols` từ string array sang object array

```ts
// TRƯỚC: watchLists.ts
symbols: { type: [String] }
// Data: symbols: ['VNM', 'FPT', 'HPG']

// SAU: Cần thêm type cho mỗi symbol
symbolsV2: [
  {
    _id: false,
    name: String,
    type: { type: String },  // 'stock', 'index', 'crypto'
  },
]
// Data: symbolsV2: [{ name: 'VNM', type: 'stock' }, { name: 'BTC', type: 'crypto' }]
```

### Chiến lược: Thêm field mới, giữ field cũ

```ts
// Bước 1: Schema có CẢ HAI fields
const schema = new mongoose.Schema({
  symbols: { type: [String] },        // Field cũ -- giữ nguyên
  symbolsV2: [{                        // Field mới
    _id: false,
    name: String,
    type: { type: String },
  }],
})

// Bước 2: Code đọc từ field mới, fallback field cũ
function getSymbols(watchList) {
  if (watchList.symbolsV2?.length) {
    return watchList.symbolsV2
  }
  // Fallback: chuyển đổi format cũ
  return watchList.symbols.map((s) => ({ name: s, type: 'stock' }))
}

// Bước 3: Code ghi luôn ghi vào CẢ HAI fields
await mongo.watchLists.updateOne(
  { _id: watchListId },
  {
    $set: {
      symbolsV2: newSymbols,
      symbols: newSymbols.map((s) => s.name),  // Giữ field cũ compatible
    },
  },
)

// Bước 4: Backfill tất cả documents cũ sang format mới

// Bước 5: Sau khi tất cả code đã dùng symbolsV2, xóa symbols field
```

### Tại sao không đổi trực tiếp?

```ts
// ❌ NGUY HIỂM: Đổi type trực tiếp
// Nếu có code đang chạy expect string array, sẽ bị lỗi ngay
symbols: [{ name: String, type: String }]  // Code cũ expect: symbols[0] = 'VNM'
                                            // Nhận: symbols[0] = { name: 'VNM', type: 'stock' }
```

**Trong production, luôn dùng chiến lược "expand and contract":**
1. **Expand:** Thêm field mới, giữ field cũ
2. **Migrate:** Backfill data sang format mới
3. **Switch:** Chuyển code sang đọc/ghi field mới
4. **Contract:** Xóa field cũ (optional, có thể giữ vô thời hạn)

---

## 5. Xóa Field

### Bước 1: Xóa khỏi code trước

```ts
// Xóa tất cả chỗ đọc/ghi field đó trong code
// Deploy code mới
// Đợi vài ngày đảm bảo không có lỗi
```

### Bước 2: Xóa data trong DB

```ts
// Xóa field khỏi tất cả documents
await mongo.users.updateMany(
  { oldField: { $exists: true } },
  { $unset: { oldField: '' } },
)
```

### Bước 3: Xóa khỏi schema

```ts
// Xóa field khỏi schema definition
// Đây là bước cuối cùng, sau khi đã deploy và xóa data
```

**Thứ tự quan trọng:** Code trước, data sau, schema cuối. Ngược lại sẽ lỗi.

---

## 6. Thêm/Xóa Index

### Thêm index

```ts
// Thêm trong schema file
schema.index({ userId: 1, createdAt: -1 })

// MongoDB tự tạo khi app restart (nếu dùng ensureIndex/createIndex)
// HOẶC tạo manual qua mongo shell:
// db.watchLists.createIndex({ userId: 1, createdAt: -1 }, { background: true })
```

**Lưu ý:** Tạo index trên collection lớn tốn thời gian và I/O:
- `{ background: true }` -- tạo index không block writes (mặc định từ MongoDB 4.2+)
- Collection 100M+ documents: có thể mất 10-30 phút

### Xóa index

```ts
// Xóa qua mongo shell
db.watchLists.dropIndex('userId_1_createdAt_-1')

// Kiểm tra indexes hiện tại
db.watchLists.getIndexes()
```

---

## 7. Rename Collection

Hiếm khi cần, nhưng khi cần:

```js
// Mongo shell
db.adminCommand({
  renameCollection: 'finpath.oldName',
  to: 'finpath.newName',
})
```

**Cực kỳ nguy hiểm trên production.** Tốt hơn: tạo collection mới, copy data, switch code.

---

## 8. Migration Checklist

Khi cần thay đổi schema trên production:

- [ ] **Schema:** Thêm field mới với default value (documents cũ vẫn hoạt động)
- [ ] **Code:** Update code đọc/ghi field mới, handle backward compatibility
- [ ] **Test:** Chạy test với cả documents cũ và mới
- [ ] **Deploy code** trước khi chạy migration script
- [ ] **Backfill:** Chạy script update documents cũ (batch, có throttle)
- [ ] **Verify:** Kiểm tra data đã đúng
- [ ] **Index:** Thêm/xóa index nếu cần (background)
- [ ] **Cleanup:** Xóa code backward compatibility (sau vài tuần)
- [ ] **Remove:** Xóa field cũ nếu không cần (optional)

---

## Tóm tắt

| Thao tác | Cách làm | Lưu ý |
|---|---|---|
| Thêm field optional | Thêm vào schema, dùng default | Không cần migration |
| Thêm field required | Thêm schema + backfill documents cũ | Batch update, throttle |
| Đổi type | Tạo field mới, migrate, switch, xóa cũ | Expand-contract pattern |
| Xóa field | Xóa code → xóa data → xóa schema | Thứ tự quan trọng! |
| Thêm index | Thêm vào schema hoặc manual | Background, collection lớn chậm |

## Bài tập

1. Collection `rooms` cần thêm field `tags: [String]`. Viết kế hoạch migration: cần backfill không? Code cần xử lý gì?
2. Field `user.bank` (object) cần đổi thành `user.banks` (array). Viết từng bước migration theo expand-contract pattern.
3. Collection `deviceLogs` có 50 triệu documents cần backfill field `platform`. Viết script batch update an toàn, ước tính thời gian chạy.
