# Path Aliases — Đường tắt import

## Vấn đề: import dài dòng và dễ vỡ

Khi project lớn (101 mongo models, 47 services, 54 controllers), việc import file thành ác mộng:

```ts
// ❌ WRONG — Đường dẫn tương đối dài dòng, dễ vỡ khi move file
import mongo from '../../../mongo/index'
import { userService } from '../../Services/userService'
import utils from '../../../../utils/index'
import { TIMEZONE } from '../../../config/room'
```

Mỗi khi bạn **move file sang folder khác**, tất cả đường dẫn tương đối đều **vỡ hết**. Với 54 controllers + 47 services, đây là thảm hoạ.

## Giải pháp: Path Aliases

Path alias là **tên tắt** cho folder gốc. Thay vì đếm số `../`, bạn dùng tên alias:

```ts
// ✅ RIGHT — Ngắn gọn, không bao giờ vỡ
import mongo from 'Mongo/index'
import { userService } from 'App/Services/userService'
import utils from 'Utils/index'
import { roomConfig } from 'Config/room'
```

**Dù file nằm ở đâu trong project, import vẫn giữ nguyên.** Move file? Không ảnh hưởng gì.

---

## Tất cả aliases trong project logics

| Alias | Trỏ tới folder | Mục đích | Ví dụ import |
|---|---|---|---|
| `App/*` | `./app/*` | Controllers, Services, Middleware, Hooks | `import { userService } from 'App/Services/userService'` |
| `Mongo/*` | `./mongo/*` | MongoDB models (101 files) | `import mongo from 'Mongo/index'` |
| `Redis/*` | `./redis/*` | Redis client & cache helpers | `import { pubclient } from 'Redis/client'` |
| `Utils/*` | `./utils/*` | Hàm tiện ích (14 files) | `import utils from 'Utils/index'` |
| `Config/*` | `./config/*` | Cấu hình (28 files) | `import { roomConfig } from 'Config/room'` |
| `Services/*` | `./services/*` | External services (gRPC, API) | `import social_service from 'Services/social_service'` |
| `Const/*` | `./const/*` | Hằng số toàn cục | `import { SYMBOL_SHORT_NAME_MAP } from 'Const/symbol'` |
| `Types/*` | `./types/*` | TypeScript type definitions | `import { GoogleSubscriptionNotificationType } from 'Types/plan'` |
| `Contracts/*` | `./contracts/*` | Adonis IoC contracts | `import { HttpContextContract } from 'Contracts/...'` |
| `Database/*` | `./database/*` | Database migrations & seeds | — |

---

## Cấu hình trong tsconfig.json

Aliases được định nghĩa trong `tsconfig.json` ở gốc project:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "App/*":       ["./app/*"],
      "Config/*":    ["./config/*"],
      "Contracts/*": ["./contracts/*"],
      "Database/*":  ["./database/*"],
      "Mongo/*":     ["./mongo/*"],
      "Redis/*":     ["./redis/*"],
      "Utils/*":     ["./utils/*"],
      "Const/*":     ["./const/*"],
      "Types/*":     ["./types/*"],
      "Services/*":  ["./services/*"]
    }
  }
}
```

- `baseUrl: "."` — Điểm gốc tính từ thư mục chứa `tsconfig.json`
- `paths` — Map alias name → folder thật

**Lưu ý:** AdonisJS còn có hệ thống IoC container riêng, nên bạn sẽ thấy import dạng `@ioc:Adonis/Core/...`. Đây là alias của framework, không phải alias của project.

```ts
// IoC container import (của AdonisJS framework)
import Route from '@ioc:Adonis/Core/Route'
import Logger from '@ioc:Adonis/Core/Logger'
import Server from '@ioc:Adonis/Core/Server'
```

---

## So sánh WRONG vs RIGHT

### 1. Import Mongo model

```ts
// ❌ WRONG
import mongo from '../../../mongo/index'
import { PortfolioCategory } from '../../../mongo/portfolios'

// ✅ RIGHT
import mongo from 'Mongo/index'
import { PortfolioCategory } from 'Mongo/portfolios'
```

### 2. Import Service

```ts
// ❌ WRONG — Import từ file trong libs/
import { handleStopLoss } from '../../Services/portfolioService/libs/handleStopLoss'

// ✅ RIGHT — Import từ entry point (index.ts) của service
import { portfolioService } from 'App/Services/portfolioService'
// Gọi: portfolioService.handleStopLoss(...)
```

> **Quy tắc quan trọng:** Luôn import service từ entry point (`App/Services/serviceName`), KHÔNG BAO GIỜ import trực tiếp từ `libs/`. Entry point (`index.ts`) export tất cả functions của service.

### 3. Import Utils

```ts
// ❌ WRONG
import { validateEmail } from '../../../utils/validator'

// ✅ RIGHT
import utils from 'Utils/index'
// Hoặc import trực tiếp file:
import { validateEmail } from 'Utils/validator'
```

### 4. Import Config

```ts
// ❌ WRONG
import redisConfig from '../../../../config/redis'

// ✅ RIGHT
import redisConfig from 'Config/redis'
```

### 5. Import across layers

```ts
// ❌ WRONG — Controller import quá nhiều cấp
import { kafkaService } from '../../Services/kafkaService'
import mongo from '../../../mongo/index'
import { PORTFOLIO_ROOM_CAPITAL } from '../../../config/portfolio'

// ✅ RIGHT
import { kafkaService } from 'App/Services/kafkaService'
import mongo from 'Mongo/index'
import { PORTFOLIO_ROOM_CAPITAL } from 'Config/portfolio'
```

---

## So sánh với FE (Next.js / React)

Nếu bạn dùng Next.js, bạn đã quen với cách tương tự:

### Next.js (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@hooks/*": ["./src/hooks/*"],
      "@lib/*": ["./src/lib/*"]
    }
  }
}
```

```tsx
// FE (Next.js)
import { Button } from '@components/ui/Button'
import { useAuth } from '@hooks/useAuth'
import { fetcher } from '@lib/fetcher'
```

### Backend (AdonisJS — logics project)

```ts
// BE (AdonisJS)
import { roomService } from 'App/Services/roomService'
import mongo from 'Mongo/index'
import utils from 'Utils/index'
```

| FE (Next.js) | BE (logics) | Giống nhau |
|---|---|---|
| `@/*` → `./src/*` | `App/*` → `./app/*` | Alias tới folder chính |
| `@components/*` | `App/Controllers/*` | Alias tới subfolder |
| `@hooks/*` | `App/Hooks/*` | Alias tới subfolder |
| `@lib/*` | `Utils/*` | Alias tới utilities |
| Config trong `tsconfig.json` | Config trong `tsconfig.json` | Cùng chỗ config |

**Khác biệt chính:**
- FE thường dùng prefix `@` (ví dụ `@components/`), BE project này dùng PascalCase không có prefix (ví dụ `App/`, `Mongo/`)
- FE chỉ cần config trong `tsconfig.json`. BE cần thêm config tương ứng trong `.adonisrc.json` để runtime hiểu alias
- Webpack/Vite cũng hỗ trợ alias riêng (`resolve.alias`), nhưng khi dùng TypeScript thì `tsconfig.json paths` là đủ

---

## Mẹo nhớ

1. **Alias luôn viết PascalCase** — `App/`, `Mongo/`, `Config/` (không phải `app/`, `mongo/`)
2. **Import service từ entry point** — `App/Services/userService` (KHÔNG PHẢI `App/Services/userService/libs/fn`)
3. **Khi thấy `../` nhiều cấp** — Đó là dấu hiệu nên dùng alias
4. **Khi thêm alias mới** — Phải thêm trong `tsconfig.json` và `.adonisrc.json`
5. **IDE support** — VSCode tự động suggest import bằng alias nhờ đọc `tsconfig.json`
