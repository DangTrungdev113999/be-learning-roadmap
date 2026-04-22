# Thực hành: Trace API Stock Overview

## Mục tiêu

Trace từng bước API `GET /api/stocks/v3/overview` từ URL cho đến response.
Hiểu cách đọc code BE bằng cách đi theo flow thực tế.

---

## Bước 1: Tìm route trong `routes/index.ts`

Tìm xem `/api/stocks` được mount ở đâu.

```bash
# Lệnh grep để tìm:
grep -n "stocks" routes/index.ts
```

Kết quả:

```typescript
// routes/index.ts (dòng 17, 60-62)

import { stocks } from './stocks'     // Import route file

Route.group(() => {
  Route.group(() => stocks(Route))     // Gọi hàm stocks() để đăng ký các route
    .prefix('/stocks')                 // Gán prefix /stocks
    .middleware(RateLimitMiddleware.build('/api/stocks', 'ip', 500, 1))
    //                                 Rate limit: 500 req/phút/IP cho toàn bộ /api/stocks
})
  .prefix('/api')                      // Prefix chung cho tất cả: /api
  .middleware(RateLimitMiddleware.build('/api', '', 50 * 10000, 1))   // 500K req/phút tổng
  .middleware(RateLimitMiddleware.build('/api', 'ip', 50 * 100, 1))  // 5K req/phút/IP
```

**Kết luận bước 1:**
- URL bắt đầu bằng `/api` (prefix chung) + `/stocks` (prefix nhóm) = `/api/stocks/...`
- Request phải vượt qua 2 rate limit global TRƯỚC KHI vào route cụ thể

---

## Bước 2: Tìm route cụ thể trong `routes/stocks.ts`

```bash
# Lệnh grep để tìm:
grep -n "v3/overview" routes/stocks.ts
```

Kết quả:

```typescript
// routes/stocks.ts (dòng 13-15)

Route.get('/v3/overview', 'StocksController.getOverviewV3').middleware([
  RateLimitMiddleware.build('/api/stocks/overview', 'ip', 10, 1),
  //                        ^^^^^^^^^^^^^^^^^^^^   ^^^  ^^  ^
  //                        key prefix trong Redis  |   |   |
  //                                         theo IP   |   |
  //                                         10 request    |
  //                                              mỗi 1 giây (= 600/phút)
])
```

**Kết luận bước 2:**
- `Route.get` -> chỉ chấp nhận method GET
- URL: prefix `/api/stocks` + route `/v3/overview` = **`GET /api/stocks/v3/overview`**
- Map đến: `StocksController.getOverviewV3`
- Có thêm 1 rate limit riêng: 10 req/giây/IP

**Tổng cộng rate limit mà request phải vượt qua:**
```
1. Global total:  500,000 req/phút   (tất cả user)
2. Global IP:     5,000 req/phút     (mỗi IP)
3. Stock group:   500 req/phút       (mỗi IP, cho /api/stocks/*)
4. Route:         10 req/giây        (mỗi IP, cho /api/stocks/overview)
```

---

## Bước 3: Tìm Controller method

```bash
# Lệnh grep để tìm:
grep -n "getOverviewV3" app/Controllers/Http/StocksController.ts
```

Kết quả:

```typescript
// app/Controllers/Http/StocksController.ts (dòng 147-201)

import models from 'Redis/models'                     // Redis models (data real-time)
import mongo from 'Mongo/index'                        // MongoDB
import { cacheService } from 'App/Services/cacheService' // Cache layer
import { codeToSector } from 'Const/sectors'           // Map mã cổ phiếu -> ngành
import { objectUtil } from 'Utils/object'              // Utility functions

export default class StocksController {

  public async getOverviewV3({ util, response }: HttpContextContract) {
    // ---- BƯỚC 3a: Đọc query params ----
    const codes = util.gp('code', null, 'comma')
    //            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //   Đọc param "code" từ query string, tách bằng dấu phẩy
    //   VD: ?code=VNM,FPT -> ['VNM', 'FPT']
    //   Nếu không truyền -> null (lấy tất cả)

    const fields = util.gp('fields', null, 'comma')
    //   Đọc param "fields" để filter chỉ lấy 1 số trường
    //   VD: ?fields=code,price -> chỉ trả về { code, price }

    // ---- BƯỚC 3b: Set cache header ----
    response.header('Cache-Control', 'public, max-age=5')
    //   Báo browser: cache response này 5 giây
    //   Trong 5 giây, browser không cần gọi lại API

    // ---- BƯỚC 3c: Đọc data (có cache) ----
    const cachedData = await cacheService.useCache(
      async () => {
        // --- Logic đọc data (chỉ chạy khi cache hết hạn) ---
        const stocks = []

        if (!codes) {
          // Không truyền code -> lấy TẤT CẢ cổ phiếu
          stocks.push(...(await models.overviewStock.getAllObject()).values())
          //                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
          //   Đọc từ Redis: ~1700 cổ phiếu, mỗi cổ phiếu có 50+ trường
          //   (giá, khối lượng, thay đổi ngày/tuần/tháng, ...)
        } else {
          // Có truyền code -> chỉ lấy những mã được yêu cầu
          stocks.push(...(await models.overviewStock.getMCodeObject(codes)).values())
        }

        // Đọc thêm tên viết tắt của cổ phiếu từ MongoDB
        const symbolNameShortMap = await cacheService.useCache(
          async () => {
            const stocks = await mongo.stocks
              .find()
              .select('code symbolNameShort')  // Chỉ lấy 2 trường
              .lean()                          // Trả về plain object (nhanh hơn)
              .read('secondaryPreferred')      // Đọc từ replica (giảm tải primary)

            // Chuyển mảng -> object để lookup nhanh
            return stocks.reduce((pre, cur) => {
              pre[cur.code] = cur.symbolNameShort
              return pre
            }, {} as Record<string, string>)
          },
          ['getOverviewV2.symbolNameShortMap', codes],
          { maxAge: 3600, revalidate: 7200, engine: 'memcached' }
          //  Cache 1 giờ, revalidate sau 2 giờ
        )

        // Map data và trả về
        return {
          data: {
            stocks: stocks.map((stock) => ({
              ...models.overviewStock.mapData(stock),  // Format data chuẩn
              st2: codeToSector[stock.code],           // Thêm ngành (VD: "Ngân hàng")
              sns: symbolNameShortMap[stock.code],     // Thêm tên viết tắt
            })),
          },
        }
      },
      ['StocksController.getOverviewV2', codes],  // Cache key
      { maxAge: 5, revalidate: 60, engine: 'memcached' }
      //  Cache 5 giây, revalidate sau 60 giây
    )

    // ---- BƯỚC 3d: Filter fields nếu cần ----
    if (fields) {
      return {
        data: {
          stocks: cachedData.data.stocks.map((stock) =>
            objectUtil.pickFields(stock, fields)
            //   Chỉ giữ lại các trường được yêu cầu
          ),
        },
      }
    }

    // ---- BƯỚC 3e: Trả response ----
    return cachedData
    //   -> { data: { stocks: [ { code: 'VNM', price: 75000, ... }, ... ] } }
  }
}
```

---

## Bước 4: Hiểu Data Layer

### Redis Model: `overviewStock`

```bash
# Lệnh grep để tìm:
grep -n "getAllObject\|mapData" redis/models/overviewStock.ts | head -20
```

```typescript
// redis/models/overviewStock.ts

export type OverviewStock = {
  code: string              // Mã cổ phiếu (VNM, FPT, ...)
  exchange: string          // Sàn (HOSE, HNX, UPCOM)
  dayChange: number         // Thay đổi trong ngày (VND)
  dayChangePercent: number  // Thay đổi trong ngày (%)
  dayVolume: number         // Khối lượng giao dịch trong ngày
  dayValue: number          // Giá trị giao dịch trong ngày
  weekChange: number        // Thay đổi trong tuần
  highWeek52Price: number   // Giá cao nhất 52 tuần
  lowWeek52Price: number    // Giá thấp nhất 52 tuần
  dayNetRoomVal: number     // Giá trị mua/bán ròng của nước ngoài
  // ... 50+ trường khác
}
```

Data này được crawler cập nhật liên tục vào Redis (mỗi vài giây),
controller chỉ cần đọc ra và trả về.

### Flow data:

```
Crawler (service khác)
    |
    | cập nhật mỗi 3-5 giây
    v
  Redis (overviewStock)     <-- models.overviewStock.getAllObject()
    |
    | đọc từ Redis
    v
  Memcached (cache 5 giây)  <-- cacheService.useCache(...)
    |
    | trả về
    v
  Controller
    |
    | JSON response
    v
  Browser
```

---

## Bước 5: Test thử API

```bash
# Gọi API (thay domain bằng domain thực tế):
curl "https://api.example.com/api/stocks/v3/overview?code=VNM,FPT&fields=code,dayChangePercent"
```

Response mẫu:
```json
{
  "data": {
    "stocks": [
      { "code": "VNM", "dayChangePercent": 1.5 },
      { "code": "FPT", "dayChangePercent": -0.3 }
    ]
  }
}
```

---

## Tóm tắt trace

```
URL:        GET /api/stocks/v3/overview?code=VNM,FPT

File 1:     routes/index.ts
            -> prefix('/api') + prefix('/stocks') + rate limit global

File 2:     routes/stocks.ts
            -> Route.get('/v3/overview', 'StocksController.getOverviewV3')
            -> rate limit: 10 req/giây/IP

File 3:     app/Controllers/Http/StocksController.ts
            -> getOverviewV3()
            -> đọc query params: code, fields
            -> gọi cacheService.useCache()

File 4:     redis/models/overviewStock.ts
            -> getAllObject(): đọc tất cả cổ phiếu từ Redis
            -> mapData(): format data

File 5:     cacheService (App/Services/cacheService)
            -> Cache kết quả vào memcached 5 giây

Response:   { data: { stocks: [...] } }
```

---

## Key takeaways cho FE dev

1. **URL = prefix chung + prefix nhóm + route** -- tương tự nested routes trong React Router
2. **Middleware chạy trước controller** -- giống middleware trong Next.js hoặc Redux
3. **Controller không chứa business logic nặng** -- nó chỉ gọi service/model
4. **Data có nhiều lớp cache** -- Redis -> Memcached -> Response Cache-Control
5. **Response luôn có dạng `{ data }` hoặc `{ error }`** -- đây là convention chung
