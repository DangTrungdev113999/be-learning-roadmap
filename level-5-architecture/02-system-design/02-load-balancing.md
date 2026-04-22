# Load Balancing -- Phân tải requests giữa các instances

## Mục tiêu

Hiểu cách load balancer phân phối requests, các thuật toán phổ biến, Nginx config. So sánh với CDN load balancing bên FE.

---

## 1. Load Balancer là gì?

Load balancer đứng trước nhiều server instances, nhận tất cả requests từ client và phân phối đến instance phù hợp.

```
                         Client requests
                              │
                              ▼
                     ┌─────────────────┐
                     │  Load Balancer  │
                     │    (Nginx)      │
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ logics   │   │ logics   │   │ logics   │
        │ :3333    │   │ :3334    │   │ :3335    │
        │ inst.1   │   │ inst.2   │   │ inst.3   │
        └──────────┘   └──────────┘   └──────────┘
```

**Không có load balancer:**
- Client gọi thẳng 1 server → server đó quá tải, server khác rảnh
- Server chết → client không gọi được

**Có load balancer:**
- Client chỉ biết 1 địa chỉ (load balancer)
- Load balancer phân phối đều
- Server chết → load balancer tự bỏ qua, route sang server khác

---

## 2. Thuật toán phân tải

### Round Robin -- Lần lượt

```
Request 1 → Instance 1
Request 2 → Instance 2
Request 3 → Instance 3
Request 4 → Instance 1  (quay lại đầu)
Request 5 → Instance 2
...
```

**Ưu:** Đơn giản, công bằng.
**Nhược:** Không quan tâm instance nào đang bận. Nếu Instance 1 đang xử lý request nặng (10s), vẫn nhận request tiếp.

### Least Connections -- Ít kết nối nhất

```
Instance 1: 5 connections đang xử lý
Instance 2: 2 connections đang xử lý
Instance 3: 8 connections đang xử lý

Request mới → Instance 2 (ít nhất) ✅
```

**Ưu:** Thông minh hơn Round Robin -- instance bận ít sẽ nhận nhiều hơn.
**Nhược:** Phức tạp hơn, load balancer phải track connections.

### IP Hash -- Cùng IP luôn đến cùng server

```
IP 1.2.3.4 → hash → Instance 2
IP 5.6.7.8 → hash → Instance 1
IP 1.2.3.4 → hash → Instance 2  (LUÔN cùng instance)
```

**Ưu:** Giống sticky sessions -- user luôn đến cùng instance.
**Nhược:** Phân bổ không đều (vì hash distribution), instance chết → user bị ảnh hưởng.

### Weighted -- Có trọng số

```
Instance 1 (weight 3):  nhận 3/6 = 50% requests
Instance 2 (weight 2):  nhận 2/6 = 33% requests
Instance 3 (weight 1):  nhận 1/6 = 17% requests
```

**Dùng khi:** Máy mạnh hơn nhận nhiều requests hơn, hoặc canary deployment (instance mới nhận ít requests để test).

### So sánh

| Thuật toán | Đơn giản | Công bằng | Thông minh | Sticky |
|---|---|---|---|---|
| Round Robin | +++ | ++ | - | - |
| Least Connections | ++ | +++ | ++ | - |
| IP Hash | ++ | + | - | +++ |
| Weighted | ++ | + | + | - |

---

## 3. Nginx Config

### Basic Round Robin

```nginx
# /etc/nginx/conf.d/finpath.conf

upstream logics {
    server 10.0.0.1:3333;
    server 10.0.0.2:3333;
    server 10.0.0.3:3333;
}

server {
    listen 80;
    server_name api.finpath.vn;

    location / {
        proxy_pass http://logics;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Least Connections

```nginx
upstream logics {
    least_conn;                     # Thêm dòng này
    server 10.0.0.1:3333;
    server 10.0.0.2:3333;
    server 10.0.0.3:3333;
}
```

### Weighted

```nginx
upstream logics {
    server 10.0.0.1:3333 weight=3;  # Máy mạnh
    server 10.0.0.2:3333 weight=2;  # Máy trung bình
    server 10.0.0.3:3333 weight=1;  # Máy yếu / canary
}
```

### Health Check

```nginx
upstream logics {
    server 10.0.0.1:3333 max_fails=3 fail_timeout=30s;
    server 10.0.0.2:3333 max_fails=3 fail_timeout=30s;
    server 10.0.0.3:3333 max_fails=3 fail_timeout=30s;
    # Nếu 1 server fail 3 lần liên tiếp → bỏ qua 30 giây
}
```

### WebSocket support

```nginx
location /ws {
    proxy_pass http://logics;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;        # WebSocket upgrade
    proxy_set_header Connection "upgrade";          # WebSocket upgrade
    proxy_set_header Host $host;
}
```

> Finpath dùng WebSocket cho realtime data (giá cổ phiếu). Nginx cần config đặc biệt cho WebSocket.

---

## 4. So sánh FE: CDN Load Balancing

### CDN phân phối static assets

```
User Hà Nội  → CDN server Hà Nội  → bundle.js (10ms)
User HCM     → CDN server HCM     → bundle.js (10ms)
User Mỹ      → CDN server Mỹ      → bundle.js (10ms)

Không có CDN:
User Hà Nội  → Server HCM → bundle.js (50ms)
User Mỹ      → Server HCM → bundle.js (300ms)
```

### So sánh

| Đặc điểm | CDN (FE) | Load Balancer (BE) |
|---|---|---|
| Mục đích | Phục vụ static files gần user | Phân tải dynamic requests |
| Nội dung | Giống nhau (bundle.js, images) | Khác nhau (mỗi request khác) |
| Caching | Cache mạnh (files ít thay đổi) | Thường không cache |
| Geography | Phân bổ theo địa lý | Phân bổ theo thuật toán |
| Ví dụ | Cloudflare, CloudFront | Nginx, AWS ALB |

### FE cũng có load balancing!

```typescript
// FE: Retry với fallback URL
const fetchData = async () => {
  try {
    return await fetch('https://api1.finpath.vn/stocks')
  } catch {
    return await fetch('https://api2.finpath.vn/stocks')  // Fallback
  }
}

// Tương tự load balancer: nếu server 1 fail → chuyển sang server 2
```

---

## 5. Load Balancing cho Finpath Services

### Kiến trúc thực tế

```
                    Internet
                       │
                  ┌────▼────┐
                  │  Nginx  │  (Load Balancer + Reverse Proxy)
                  └────┬────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     ┌─────────┐ ┌─────────┐ ┌─────────────┐
     │ logics  │ │ logics  │ │  source     │
     │ :3333   │ │ :3333   │ │  _service   │
     │ inst.1  │ │ inst.2  │ │  :3334      │
     └─────────┘ └─────────┘ └─────────────┘
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
          ┌──────┐ ┌──────┐ ┌──────┐
          │Kafka │ │Redis │ │Mongo │
          │:9093 │ │:6379 │ │:27017│
          └──────┘ └──────┘ └──────┘
```

### Nginx cũng là Reverse Proxy

```
Reverse Proxy che giấu backend servers:
- Client chỉ biết api.finpath.vn
- Không biết có bao nhiêu instances
- Không biết IP của instances
- Nginx xử lý SSL/TLS, CORS, rate limiting
```

### Rate Limiting trong Nginx

```nginx
# Giới hạn 10 requests/giây per IP
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location /api/ {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://logics;
}

# burst=20: cho phép 20 requests vượt limit (xếp hàng)
# nodelay: xử lý burst ngay, không delay
```

---

## 6. Layer 4 vs Layer 7 Load Balancing

### Layer 4 (Transport -- TCP/UDP)

```
Load balancer chỉ nhìn thấy IP + Port
Không đọc nội dung request
→ Nhanh, đơn giản
→ Không thể route dựa trên URL path
```

### Layer 7 (Application -- HTTP)

```
Load balancer đọc HTTP headers, URL, cookies
→ Route dựa trên path: /api/* → logics, /ws/* → websocket server
→ Chậm hơn L4 (phải parse HTTP)
→ Nginx hoạt động ở Layer 7
```

```nginx
# Layer 7: Route theo path
location /api/ {
    proxy_pass http://logics;
}

location /ws/ {
    proxy_pass http://message_stream;  # WebSocket server riêng
}

location /admin/ {
    proxy_pass http://admin_service;
}
```

---

## 7. Vấn đề thường gặp

### Connection draining (Graceful shutdown)

Khi deploy version mới, instance cũ cần tắt. Nhưng nó đang xử lý requests!

```
1. Nginx nhận tín hiệu: Instance 1 sắp tắt
2. Nginx ngừng gửi requests MỚI đến Instance 1
3. Instance 1 xử lý xong requests ĐANG CHẠY
4. Instance 1 tắt an toàn
5. Instance 1 mới (version mới) khởi động
6. Nginx bắt đầu gửi requests đến Instance 1 mới
```

### Thundering herd (tất cả requests đổ vào 1 instance)

Khi Instance 2 chết, tất cả requests của nó đổ sang Instance 1 và 3:

```
TRƯỚC:  Inst1: 33%,  Inst2: 33%,  Inst3: 33%
SAU:    Inst1: 50%,  Inst3: 50%   ← Tải tăng 50% mỗi instance

Nếu load gần max → Instance 1 cũng chết → cascade failure!
```

**Giải pháp:** Luôn có headroom (chạy 60-70% capacity), auto-scaling thêm instance khi load cao.

---

## Tóm tắt

| Khái niệm | Giải thích |
|---|---|
| Load Balancer | Phân phối requests đến nhiều server instances |
| Round Robin | Lần lượt, đơn giản |
| Least Connections | Ưu tiên server ít bận |
| Reverse Proxy | Che giấu backend, xử lý SSL/CORS/rate-limit |
| Layer 7 | Route dựa trên URL path, HTTP headers |
| Health Check | Tự phát hiện server chết, ngừng gửi requests |
| Graceful Shutdown | Xử lý xong requests đang chạy trước khi tắt |

## Bài tập

1. Finpath có 3 instances logics. Thuật toán nào phù hợp nhất? Giải thích tại sao.
2. Viết Nginx config cho: API requests → upstream logics (least connections), WebSocket → upstream message_stream, Static files → trả trực tiếp từ /public/.
3. Instance 2 chết lúc 10h sáng (giờ cao điểm). Mô tả chuyện gì xảy ra: Nginx detect thế nào? Requests xử lý thế nào? User có bị ảnh hưởng không?
