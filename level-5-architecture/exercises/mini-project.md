# Mini Project Level 5: Technical Design Document

> Tổng hợp tất cả kiến thức Level 5: viết 1 Technical Design Doc hoàn chỉnh.

---

## Yêu cầu

Viết **Technical Design Document** cho tính năng **Copy Trading** — cho phép user tự động copy giao dịch của expert.

### Bối cảnh

User muốn follow 1 expert và tự động copy mọi giao dịch mà expert thực hiện trong room. Khi expert mua VNM, user cũng tự động mua VNM với tỉ lệ vốn tương ứng.

### Template Design Doc

```markdown
# Technical Design: Copy Trading

## 1. Tổng quan
- Mô tả tính năng
- User story
- Scope (in/out)

## 2. Database Design
- Schema mới cần tạo
- Embed vs Reference decisions
- Index strategy
- Migration plan (nếu sửa schema cũ)

## 3. API Design
- Endpoints (method, URL, input, output)
- Auth requirements
- Rate limiting

## 4. Service Architecture
- Service nào xử lý?
- Data flow diagram
- Kafka events cần tạo
- Cronjob cần tạo

## 5. Caching Strategy
- Cache ở đâu, bao lâu, invalidate khi nào

## 6. Error Handling
- Failure scenarios
- Retry/rollback strategy

## 7. Security
- Input validation
- Authorization rules
- Rate limiting

## 8. Monitoring
- Metrics cần track
- Alert rules
- Logging points

## 9. Testing Strategy
- Unit tests
- Integration tests

## 10. Risks & Trade-offs
- Technical risks
- Decisions và lý do
```

### Tiêu chí hoàn thành

- [ ] Design doc có đủ 10 sections
- [ ] Database schema hợp lý (embed vs reference có giải thích)
- [ ] API design rõ ràng (method, URL, input, output, auth)
- [ ] Data flow diagram (ASCII hoặc Mermaid)
- [ ] Có xem xét failure scenarios
- [ ] Có security considerations
- [ ] Có monitoring plan
- [ ] Trade-offs được ghi rõ với lý do
