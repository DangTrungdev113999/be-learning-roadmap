# Checklist Level 3: Viết tính năng hoàn chỉnh

Hoàn thành tất cả items trước khi lên Level 4.

## Kafka

- [ ] Giải thích được message queue là gì và tại sao cần
- [ ] Dùng được `kafkaService.emit()` để gửi message
- [ ] Dùng được `kafkaService.on()` để nhận message
- [ ] Biết tổ chức task handlers trong `tasks/` directory
- [ ] Hiểu safety features: maxTrip, maxLoop
- [ ] Hoàn thành ít nhất 6/8 bài tập Kafka

## Cronjob

- [ ] Đọc và viết được cron expression
- [ ] Dùng được `cronjobAdd()` utility
- [ ] Hiểu tại sao cần distributed lock cho cronjob
- [ ] Viết được cron cho giờ giao dịch (skip nghỉ trưa, T7/CN)
- [ ] Hoàn thành ít nhất 4/5 bài tập cronjob

## HTTP Client

- [ ] Gọi được API bên ngoài bằng axios (GET/POST)
- [ ] Xử lý được lỗi: timeout, network error, HTTP error
- [ ] Hiểu retry pattern: simple retry và exponential backoff
- [ ] Hoàn thành ít nhất 3/5 bài tập

## Slack Webhook

- [ ] Gửi được tin nhắn đơn giản qua Slack webhook
- [ ] Viết được Block Kit message có format đẹp
- [ ] Thiết kế được alert template cho monitoring

## Logging

- [ ] Dùng `Logger.child({ tags })` thay vì `console.log`
- [ ] Log đúng level: info, warn, error
- [ ] Log structured data (object as first param)
- [ ] Không mắc 5 anti-patterns trong logging

## Project Data Monitoring

- [ ] Thiết kế được service structure (docs.md, index.ts, libs/)
- [ ] Implement được ít nhất 1 check function với TDD
- [ ] Implement được sendAlert function
- [ ] Đăng ký được cronjob cho giờ giao dịch
- [ ] Tất cả test pass + type check pass

---

**Khi tất cả checked → Chuyển sang `level-4-distributed-system/`**
