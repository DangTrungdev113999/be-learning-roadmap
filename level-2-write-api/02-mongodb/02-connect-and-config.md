# Kết nối MongoDB trong dự án logics

## Mục tiêu

Hiểu cách dự án thật kết nối MongoDB: config, khởi tạo, và cách sử dụng trong code.

---

## 1. Cấu trúc file kết nối

```
logics/
├── config/
│   └── mongo.ts          ← Config (đọc URI từ env)
├── start/
│   └── mongo.ts          ← Khởi tạo kết nối khi app boot
├── mongo/
│   ├── index.ts          ← Export tất cả models
│   ├── users.ts          ← Schema + Model cho users
│   ├── watchLists.ts     ← Schema + Model cho watchLists
│   ├── rooms.ts          ← Schema + Model cho rooms
│   └── ... (~97 files)
└── .env
    └── MONGODB_URI=mongodb://...
```

## 2. Config - Đọc URI từ environment

```ts
// config/mongo.ts
import Env from '@ioc:Adonis/Core/Env'

const mongoConfig = {
  uri: Env.get('MONGODB_URI'),
}

export default mongoConfig
```

File `.env`:

```bash
MONGODB_URI=mongodb://localhost:27017/logics
# Production: mongodb+srv://user:pass@cluster.mongodb.net/logics
```

> **Quy tắc bảo mật**: KHÔNG BAO GIỜ hardcode URI trong source code. Luôn dùng environment variables.

## 3. Khởi tạo kết nối khi app khởi động

```ts
// start/mongo.ts - Preloaded file (chạy khi app boot)
import mongoose from 'mongoose'
import mongoConfig from '../config/mongo'
import Logger from '@ioc:Adonis/Core/Logger'

const log = Logger.child({ tags: ['MONGO'] })

mongoose.set('strictQuery', false)

const connect = async () => {
  try {
    await mongoose.connect(mongoConfig.uri)
    log.info({ uri: mongoConfig.uri.match(/@[^?]+/)?.pop() }, 'Connected')
  } catch (error) {
    log.error({ error }, 'Connect error')

    // Tự động reconnect sau 5 giây nếu lỗi
    setTimeout(() => {
      log.info('Reconnect...')
      connect()
    }, 5000)
  }
}

connect()
```

Điểm đáng chú ý:

- `strictQuery: false` - Cho phép query field không có trong schema
- Auto-reconnect khi mất kết nối (quan trọng cho production)
- Log URI đã ẩn password (dùng regex `/@[^?]+/`)

## 4. Định nghĩa Schema và Model

Mỗi collection có 1 file riêng trong `mongo/`:

```ts
// mongo/watchLists.ts
import mongoose from 'mongoose'

const ObjectId = mongoose.Schema.Types.ObjectId

const schema = new mongoose.Schema(
  {
    userId: { type: ObjectId, required: true, index: true },
    name: { type: String, required: true },
    symbols: { type: [String] },
    isDeleted: { type: Boolean, index: true },
    point: { type: Number, required: true },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
)

// Compound indexes
schema.index({ userId: 1, isDeleted: 1 })

export default mongoose.model('watchLists', schema)
```

## 5. Export tất cả models từ 1 file

```ts
// mongo/index.ts
import users from './users'
import watchLists from './watchLists'
import rooms from './rooms'
import notifications from './notifications'
import analysisEvents from './analysisEvents'
import orders from './orders'
// ... ~94 imports khác

export default {
  users,
  watchLists,
  rooms,
  notifications,
  analysisEvents,
  orders,
  // ... ~94 models khác (tổng ~100)
}
```

## 6. Sử dụng trong Controller/Service

```ts
// Trong controller - import mongo object
import mongo from '../../../mongo'

// Dùng model qua mongo object
const watchlists = await mongo.watchLists.find({ userId })
const user = await mongo.users.findById(userId)
const room = await mongo.rooms.findOne({ _id: roomId })
```

```ts
// Trong service - dùng path alias
import mongo from 'Mongo/index'

const count = await mongo.analysisEvents.countDocuments({
  key: 'page_view',
  createdAt: { $gte: from, $lte: to },
})
```

## 7. Connection String giải thích

```
mongodb://username:password@host:port/database?options
│         │        │        │    │     │        │
│         │        │        │    │     │        └── retryWrites=true
│         │        │        │    │     └── Tên database
│         │        │        │    └── Port (default: 27017)
│         │        │        └── Host server
│         │        └── Mật khẩu
│         └── Tên đăng nhập
└── Protocol
```

Production thường dùng `mongodb+srv://` (DNS Seedlist):

```
mongodb+srv://user:pass@cluster0.abc123.mongodb.net/logics?retryWrites=true
```

---

## Tóm tắt

| Bước | File | Chức năng |
|---|---|---|
| 1 | `.env` | Chứa MONGODB_URI |
| 2 | `config/mongo.ts` | Đọc URI từ env |
| 3 | `start/mongo.ts` | Kết nối khi app boot |
| 4 | `mongo/*.ts` | Định nghĩa schema + model |
| 5 | `mongo/index.ts` | Export tất cả models |
| 6 | Controller/Service | `import mongo` rồi dùng |

## Bài tập

1. Tạo file `config/mongo.ts` đọc URI từ `.env`, kết nối thành công tới MongoDB local
2. Tạo 1 schema `notes` với fields: `title` (String, required), `content` (String), `tags` ([String])
3. Viết script test: tạo 1 document, đọc lại, in ra console
