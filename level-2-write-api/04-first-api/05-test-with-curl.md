# Test API bằng curl, Postman, và trình duyệt

## Tại sao cần test manual?

Unit test kiểm tra logic function. Nhưng bạn vẫn cần test API thật để đảm bảo:
- Route mapping đúng
- Middleware hoạt động
- Input parsing từ HTTP request đúng
- Response format đúng

## Cách 1: curl (nhanh nhất)

### GET request

```bash
# Lấy danh sách rooms
curl http://localhost:3333/api/rooms

# Lấy danh sách rooms với pagination
curl "http://localhost:3333/api/rooms?page=1&pageSize=10"

# Lấy chi tiết room
curl "http://localhost:3333/api/rooms/detail?_id=abc123"

# Lấy rooms của mình (cần auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3333/api/rooms/mine?page=1&pageSize=10"
```

### POST request

```bash
# Tạo room mới
curl -X POST http://localhost:3333/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Phòng Trading Chứng Khoán",
    "description": "Phòng chia sẻ kiến thức trading",
    "isPrivate": false
  }'
```

### PUT request

```bash
# Tham gia room
curl -X PUT http://localhost:3333/api/rooms/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"_id": "room123"}'
```

### DELETE request

```bash
# Xoá room (cần admin)
curl -X DELETE http://localhost:3333/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"_id": "room123"}'
```

## Đọc hiểu response

### Response thành công

```json
{
  "data": {
    "_id": "room123",
    "name": "Phòng Trading"
  }
}
```

### Response thành công với pagination

```json
{
  "data": [
    { "_id": "room1", "name": "Phòng 1" },
    { "_id": "room2", "name": "Phòng 2" }
  ],
  "paging": {
    "total": 25,
    "page": 1,
    "pageSize": 10
  }
}
```

### Response lỗi

```json
{
  "error": {
    "message": "Tên phòng phải có từ 5 đến 200 ký tự.",
    "code": "VALIDATION_ERROR"
  }
}
```

### Response rate limit

```json
{
  "error": {
    "code": "REQUEST_LIMIT_EXCEEDED"
  }
}
```

## Cách 2: Postman

### Tạo request

1. Mở Postman → New Request
2. Chọn method (GET/POST/PUT/DELETE)
3. Nhập URL: `http://localhost:3333/api/rooms`
4. Tab **Params**: thêm query params (page, pageSize, _id)
5. Tab **Headers**: thêm `Authorization: Bearer YOUR_TOKEN`
6. Tab **Body** (cho POST/PUT): chọn "raw" → "JSON" → nhập JSON body
7. Click **Send**

### Tạo collection cho logics

```
logics API/
├── Rooms/
│   ├── GET List Rooms
│   ├── GET Detail Room
│   ├── POST Create Room
│   ├── PUT Join Room
│   └── DELETE Room
├── Tutorials/
│   ├── GET List
│   └── GET Detail
└── Users/
    ├── GET Profile
    └── PUT Update Profile
```

### Dùng Environment Variables

```
# Environment: Development
BASE_URL = http://localhost:3333/api
TOKEN = eyJhbGciOi...

# Trong request URL:
{{BASE_URL}}/rooms?page=1
# Header:
Authorization: Bearer {{TOKEN}}
```

## Cách 3: Trình duyệt (chỉ GET)

Mở trình duyệt, nhập URL trực tiếp:

```
http://localhost:3333/api/rooms?page=1&pageSize=5
```

Chỉ hoạt động với **GET** requests (không gửi được body). Cài extension "JSON Formatter" để đọc response dễ hơn.

## Cách 4: VS Code REST Client

Tạo file `.http` trong project:

```http
### Lấy danh sách rooms
GET http://localhost:3333/api/rooms?page=1&pageSize=10

### Tạo room mới
POST http://localhost:3333/api/rooms
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Phòng Trading Chứng Khoán",
  "description": "Chia sẻ kiến thức và tín hiệu trading",
  "isPrivate": false
}

### Tham gia room
PUT http://localhost:3333/api/rooms/join
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "_id": "room123"
}
```

Click "Send Request" trên mỗi block để gọi API.

## Tips debug

### 1. curl với verbose mode

```bash
curl -v "http://localhost:3333/api/rooms?page=1"
```

Hiển thị headers, status code, timing.

### 2. curl chỉ xem status code

```bash
curl -o /dev/null -s -w "%{http_code}" http://localhost:3333/api/rooms
# → 200
```

### 3. Format JSON output

```bash
curl -s "http://localhost:3333/api/rooms" | python3 -m json.tool
# hoặc
curl -s "http://localhost:3333/api/rooms" | jq '.'
```

### 4. Đo thời gian response

```bash
curl -o /dev/null -s -w "Time: %{time_total}s\n" \
  "http://localhost:3333/api/rooms"
# → Time: 0.045s
```

## Kiểm tra phổ biến khi test API

| Kiểm tra | Cách làm |
|---------|---------|
| Route mapping đúng? | Gọi URL → không trả 404 |
| Auth hoạt động? | Gọi không có token → trả 401 |
| Validation hoạt động? | Gửi data sai → trả error message |
| Pagination đúng? | Gửi page/pageSize → kiểm tra paging object |
| Rate limit hoạt động? | Gọi liên tục 61 lần/giây → trả REQUEST_LIMIT_EXCEEDED |

## Bài tập

1. Dùng curl gọi `GET /api/rooms?page=1&pageSize=5` và đọc response
2. Dùng curl gọi POST với body sai (name ngắn hơn 5 ký tự) và xem error message
3. Tạo file `.http` với 3 requests: list, create, detail
4. Gọi API 100 lần liên tiếp và xem khi nào bị rate limit:

```bash
for i in $(seq 1 100); do
  code=$(curl -o /dev/null -s -w "%{http_code}" "http://localhost:3333/api/rooms")
  echo "Request $i: $code"
done
```
