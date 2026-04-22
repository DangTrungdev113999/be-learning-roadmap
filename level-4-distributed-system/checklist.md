# Checklist Level 4: Hiểu hệ thống phân tán

Hoàn thành tất cả items trước khi lên Level 5.

## gRPC

- [ ] Giải thích được gRPC là gì và tại sao dùng thay REST giữa services
- [ ] Đọc hiểu proto file (message, service, rpc)
- [ ] Hiểu cách logics tạo gRPC client (loadSync, credentials, keepalive)
- [ ] Phân biệt 4 loại RPC: Unary, Server streaming, Client streaming, Bidirectional
- [ ] Vẽ được sơ đồ gRPC connections trong hệ thống Finpath
- [ ] Hoàn thành ít nhất 4/5 bài tập

## WebSocket

- [ ] Phân biệt HTTP vs WebSocket
- [ ] Hiểu server-side WebSocket: accept connection, read message, broadcast
- [ ] Hiểu channel management: subscribe/unsubscribe
- [ ] Hiểu connection management: heartbeat, cleanup, CCU limits
- [ ] Trace được full flow: FE → data-stream → message_stream → source_service
- [ ] Hoàn thành ít nhất 4/5 bài tập

## Debug cross-service

- [ ] Vẽ được bản đồ hệ thống: tất cả services, ports, connections
- [ ] Trace được lỗi "data không cập nhật" từ FE ngược về source
- [ ] Đọc được log nhiều service cùng lúc (tail -f, tmux)
- [ ] Nhận biết được 5 pattern debug thường gặp
- [ ] Áp dụng được checklist 10 bước debug
- [ ] Hoàn thành ít nhất 7/10 kịch bản debug

## MongoDB nâng cao

- [ ] Viết được aggregation pipeline: $match → $group → $sort → $project
- [ ] Dùng được group operators: $sum, $avg, $min, $max, $push, $addToSet
- [ ] Đọc hiểu multi-stage pipeline thật từ analyticsService
- [ ] Hiểu compound index và ESR rule
- [ ] Đọc được .explain() output: IXSCAN vs COLLSCAN
- [ ] Tối ưu được query chậm (case study 100M+ rows)
- [ ] Hoàn thành ít nhất 7/10 bài tập

---

**Khi tất cả checked → Chuyển sang `level-5-architecture/`**
