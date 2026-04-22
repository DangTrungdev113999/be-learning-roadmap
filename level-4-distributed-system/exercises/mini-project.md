# Mini Project Level 4: Service Health Dashboard

> Tổng hợp kiến thức Level 4: gRPC, WebSocket, Debug cross-service, MongoDB aggregation.

---

## Yêu cầu

Tạo **Service Health Dashboard** — API trả về trạng thái realtime của tất cả services trong hệ thống.

### API

```
GET /api/admin/system/health
```

### Response

```json
{
  "data": {
    "timestamp": "2026-03-18T10:30:00+07:00",
    "services": [
      { "name": "logics", "status": "ok", "latency": 2, "port": 3333 },
      { "name": "source_service", "status": "ok", "latency": 15, "port": 3334 },
      { "name": "message_stream", "status": "ok", "latency": 5, "port": 9000 },
      { "name": "kafka", "status": "ok", "latency": 12, "port": 9093 },
      { "name": "redis", "status": "ok", "latency": 1 },
      { "name": "mongodb", "status": "ok", "latency": 8 }
    ],
    "stats": {
      "totalEvents24h": 1250000,
      "activeUsers24h": 3200,
      "topEvents": [
        { "key": "post_view", "count": 450000 },
        { "key": "stock_view", "count": 380000 }
      ]
    }
  }
}
```

### Kỹ năng sử dụng

| Kỹ năng | Áp dụng |
|---|---|
| gRPC | Check message_stream connection |
| HTTP Client | Ping source_service, data_feed APIs |
| Redis | Check Redis connection + latency |
| MongoDB | Check connection + aggregation 24h stats |
| Aggregation | getActiveUsers, topEvents (từ analysisEvents) |
| Logging | Log health check results |
| Debug | Trace khi 1 service không respond |

### Các bước

1. Tạo `systemHealthService` với docs.md, index.ts, libs/
2. **checkServiceHealth** — Ping tất cả services, đo latency
3. **getSystemStats** — Aggregation từ analysisEvents (24h)
4. **Controller** — Kết hợp 2 functions, trả response
5. **Route** — `GET /api/admin/system/health` (admin only)

### Tiêu chí hoàn thành

- [ ] API trả về status của ít nhất 4 services
- [ ] MongoDB aggregation tính stats 24h
- [ ] Có unit test cho mỗi function
- [ ] Admin-only auth
- [ ] Latency đo chính xác (ms)
- [ ] Xử lý gracefully khi 1 service chết (trả status: "down" thay vì crash)
