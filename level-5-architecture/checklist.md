# Checklist Level 5: Thiết kế & kiến trúc

## Database Design

- [ ] Giải thích được khi nào embed, khi nào reference
- [ ] Biết 5 schema patterns: Subset, Computed, Bucket, Polymorphic, Tree
- [ ] Thiết kế được index strategy cho collection mới
- [ ] Viết được migration script an toàn
- [ ] Hiểu sharding, read replicas, connection pooling

## System Design

- [ ] Giải thích được horizontal scaling và stateless requirement
- [ ] Hiểu load balancing algorithms
- [ ] Thiết kế được caching strategy (where, TTL, invalidation)
- [ ] Phân biệt được message queue patterns: Pub/Sub, Fan-out, Event Sourcing
- [ ] Hiểu microservice patterns: Circuit breaker, API Gateway, Saga
- [ ] Phân tích được kiến trúc Finpath (tại sao tách 7 services, trade-offs)

## Monitoring & Observability

- [ ] Hiểu 3 pillars: Logs, Metrics, Traces
- [ ] Biết 4 Golden Signals: Latency, Traffic, Errors, Saturation
- [ ] Thiết kế được alerting rules (levels, routing, anti-fatigue)
- [ ] Viết được postmortem sau incident
- [ ] Đề xuất được observability roadmap

## Security

- [ ] Hiểu JWT authentication flow (access + refresh token)
- [ ] Implement được RBAC (login/expert/admin)
- [ ] Validate input đúng cách (util.gp + util.check)
- [ ] Nhận biết và phòng được: NoSQL injection, XSS, CSRF
- [ ] Thiết kế được rate limiting strategy
- [ ] Áp dụng được security checklist cho API mới

## Tổng hợp

- [ ] Viết được technical design document cho 1 tính năng
- [ ] Review được code BE của người khác
- [ ] Đề xuất được giải pháp cho bài toán kiến trúc

---

**Khi hoàn thành Level 5 → Bạn đã là BE developer!**
