# Subscribe & Broadcast -- Quản lý Channels

## Vấn đề: Không phải ai cũng cần tất cả data

Finpath có hàng chục loại data real-time:

```
- Giá cổ phiếu (1600+ mã)
- Chỉ số VN-Index, HNX-Index
- Orderbook (sổ lệnh)
- Lịch sử giao dịch
- Giá crypto, forex, vàng, hàng hóa
- Sector performance
- Room stocks (cổ phiếu theo phòng)
```

Nếu server gửi TẤT CẢ data cho TẤT CẢ clients → lãng phí bandwidth kinh khủng. User đang xem VNM không cần nhận data về Bitcoin.

**Giải pháp: Channel-based subscription** -- Client chỉ nhận data từ channels đã subscribe.

## Channel là gì?

Channel giống **kênh TV**. Bạn chỉ xem kênh nào bạn bật:

```
Channel "on_model_overviewStock"   → Data giá cổ phiếu
Channel "on_model_overviewIndex"   → Data chỉ số index
Channel "on_model_orderbook"       → Data sổ lệnh
Channel "on_model_overviewCrypto"  → Data giá crypto
```

Client subscribe channel nào → chỉ nhận data từ channel đó.

## Subscribe/Unsubscribe flow

### FE gửi subscribe request

```typescript
// FE code
ws.send(JSON.stringify({
  event: 'subscribe',
  payload: {
    channels: ['on_model_overviewStock', 'on_model_overviewIndex']
  }
}))
```

### Server xử lý

```go
// finpath-data-stream
func readPump(client *Client) {
    for {
        _, message, err := client.Conn.ReadMessage()
        msg := parseMessage(message)

        if msg.Event == "subscribe" {
            // Thêm client vào channels
            channelmanager.Subscribe(client, msg.Payload.Channels)
        }
        if msg.Event == "unsubscribe" {
            // Xóa client khỏi channels
            channelmanager.Unsubscribe(client, msg.Payload.Channels)
        }
    }
}
```

### Channel manager nội bộ

Bên trong server, channel manager là một **map** từ channel name → danh sách clients:

```go
// Cấu trúc dữ liệu (minh họa)
type ChannelManager struct {
    channels map[string][]*Client
}

// Subscribe: thêm client vào channel
func (cm *ChannelManager) Subscribe(client *Client, channels []string) {
    for _, channel := range channels {
        cm.channels[channel] = append(cm.channels[channel], client)
    }
}

// Unsubscribe: xóa client khỏi channel
func (cm *ChannelManager) Unsubscribe(client *Client, channels []string) {
    for _, channel := range channels {
        // Tìm và xóa client khỏi danh sách
        cm.channels[channel] = removeFromSlice(cm.channels[channel], client)
    }
}
```

**So sánh JavaScript:**
```typescript
// Tương đương TypeScript
const channels = new Map<string, Set<Client>>()

function subscribe(client: Client, channelNames: string[]) {
  for (const name of channelNames) {
    if (!channels.has(name)) channels.set(name, new Set())
    channels.get(name).add(client)
  }
}

function unsubscribe(client: Client, channelNames: string[]) {
  for (const name of channelNames) {
    channels.get(name)?.delete(client)
  }
}
```

## Broadcast -- Gửi data tới subscribers

Khi có data mới (VD: giá VNM thay đổi), server broadcast tới tất cả clients đã subscribe channel đó:

```go
// Broadcast (minh họa)
func (cm *ChannelManager) Broadcast(channel string, data []byte) {
    clients := cm.channels[channel]    // Lấy danh sách subscribers

    for _, client := range clients {
        err := client.Conn.WriteMessage(websocket.TextMessage, data)
        if err != nil {
            // Client đã ngắt kết nối → xóa
            cm.Unsubscribe(client, []string{channel})
        }
    }
}
```

### Ví dụ cụ thể

```
Trạng thái channel manager:
┌──────────────────────────┬────────────────────────────┐
│ Channel                  │ Subscribers                │
├──────────────────────────┼────────────────────────────┤
│ on_model_overviewStock   │ [Client A, Client B, C]    │
│ on_model_overviewIndex   │ [Client A, Client C]       │
│ on_model_orderbook       │ [Client B]                 │
│ on_model_overviewCrypto  │ [Client C]                 │
└──────────────────────────┴────────────────────────────┘

Khi giá cổ phiếu thay đổi:
  Broadcast("on_model_overviewStock", data)
  → Gửi cho: Client A, Client B, Client C

Khi VN-Index thay đổi:
  Broadcast("on_model_overviewIndex", data)
  → Gửi cho: Client A, Client C
  → Client B KHÔNG nhận (chưa subscribe)
```

## Real channel names trong Finpath

Channels trong Finpath đặt tên theo pattern `on_model_` + tên Redis model:

```
Chứng khoán Việt Nam:
├── on_model_overviewStock         → Giá cổ phiếu (tổng quan 1600+ mã)
├── on_model_overviewIndex         → Chỉ số VN-Index, HNX-Index, UPCOM
├── on_model_roomStock             → Cổ phiếu theo phòng (Room feature)
├── on_model_orderbook             → Sổ lệnh (bid/ask)
├── on_model_historyTrade          → Lịch sử giao dịch
├── on_model_overviewSector        → Hiệu suất ngành (ngân hàng, BĐS, ...)
├── on_model_stockBar              → Nến giá cổ phiếu (candlestick chart)
├── on_model_Indexbar              → Nến giá index
├── on_model_moneyFlowBar          → Dòng tiền
├── on_model_overviewIndexDerivative → Phái sinh
└── on_model_indexDerivativeBar    → Nến giá phái sinh

Thị trường quốc tế:
├── on_model_overviewCrypto        → Giá crypto (BTC, ETH, ...)
├── on_model_cryptoBar             → Nến giá crypto
├── on_model_overviewForex         → Tỷ giá ngoại tệ
├── on_model_forexBar              → Nến giá forex
├── on_model_overviewCommodity     → Giá hàng hóa (dầu, bạc, ...)
├── on_model_commodityBar          → Nến giá hàng hóa
├── on_model_overviewIndice        → Chỉ số quốc tế (S&P 500, Nikkei, ...)
└── on_model_indiceBar             → Nến chỉ số quốc tế

Vàng & đô la trong nước:
├── on_model_overviewDomesticGold  → Giá vàng SJC, PNJ, ...
├── on_model_domesticGoldBar       → Nến giá vàng
├── on_model_overviewDomesticDollar → Tỷ giá USD ngân hàng
└── on_model_domesticDollarBar     → Nến tỷ giá USD

Thông tin doanh nghiệp:
├── on_model_companyProfile        → Thông tin công ty
├── on_model_shareholder           → Cổ đông lớn
├── on_model_shareholderStructure  → Cơ cấu cổ đông
└── on_model_leader                → Ban lãnh đạo

Xóa/Reset:
├── on_model_reset_historyTrade    → Reset lịch sử giao dịch (đầu phiên)
├── on_model_reset_orderbook       → Reset sổ lệnh (đầu phiên)
└── on_remove_model_*              → Xóa mã (delisted)
```

## Luồng data: Từ Redis publish → WebSocket broadcast

Khi data thay đổi trong logics:

```typescript
// redis/models/overviewStock.ts (logics)
async function set(data) {
  // 1. Cập nhật Redis cache
  await redisClient.hset('overviewStock', code, JSON.stringify(data))

  // 2. Publish event qua Redis Pub/Sub
  pubclient.publish('on_model_overviewStock', JSON.stringify(data))
}
```

```typescript
// handledata/index.ts (logics) -- Lắng nghe Redis event
subscribeRedis((channel, message) => {
  switch (channel) {
    case 'on_model_overviewStock':
      handleOverviewStock(message)    // Transform data, rồi publish qua gRPC
      break
  }
})
```

```
Luồng đầy đủ:

1. source_service nhận giá VNM mới từ sàn
2. Gửi vào message_stream (gRPC Producer)
3. message_stream đẩy vào Kafka
4. logics nhận từ Kafka (gRPC Consumer)
5. logics cập nhật Redis + publish Redis event
6. logics publish qua gRPC Publisher → message_stream
7. message_stream chuyển tới data-stream (gRPC)
8. data-stream broadcast qua WebSocket tới FE:
   channelmanager.Broadcast("on_model_overviewStock", data)
   → Tất cả FE clients đã subscribe "on_model_overviewStock" nhận data
```

## FE subscribe flow thực tế

```typescript
// Khi user mở trang "Bảng giá" (FE)
ws.send(JSON.stringify({
  event: 'subscribe',
  payload: { channels: ['on_model_overviewStock', 'on_model_overviewIndex'] }
}))

// Khi user chuyển sang trang "Crypto"
ws.send(JSON.stringify({
  event: 'unsubscribe',
  payload: { channels: ['on_model_overviewStock', 'on_model_overviewIndex'] }
}))
ws.send(JSON.stringify({
  event: 'subscribe',
  payload: { channels: ['on_model_overviewCrypto'] }
}))

// Khi user mở chi tiết cổ phiếu VNM
ws.send(JSON.stringify({
  event: 'subscribe',
  payload: { channels: ['on_model_orderbook', 'on_model_historyTrade'] }
}))
```

## Tóm tắt

```
Channel = kênh data (VD: on_model_overviewStock)
Subscribe = đăng ký nhận data từ channel
Unsubscribe = hủy đăng ký
Broadcast = gửi data tới tất cả subscribers của 1 channel

Pattern tên channel: on_model_ + tên Redis model
  on_model_overviewStock  → Giá cổ phiếu
  on_model_overviewIndex  → Chỉ số index
  on_model_orderbook      → Sổ lệnh
  on_model_overviewCrypto → Giá crypto

Server lưu trữ:
  Map<channel_name, Set<client>>

  subscribe("on_model_overviewStock", clientA)
  → channels["on_model_overviewStock"].add(clientA)

  broadcast("on_model_overviewStock", data)
  → channels["on_model_overviewStock"].forEach(client => client.send(data))
```
