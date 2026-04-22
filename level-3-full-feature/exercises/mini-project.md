# Mini Project Level 3: Hệ thống nhắc nhở hàng ngày

> Tổng hợp tất cả kiến thức Level 3: Kafka + Cronjob + HTTP Client + Slack + Logging.

---

## Yêu cầu

Tạo hệ thống **Daily Reminder** — mỗi sáng trước giờ giao dịch, gửi Slack thông báo tóm tắt thị trường.

### Luồng hoạt động

```
Cronjob (8:30 sáng T2-T6)
    │
    ▼
reminderService.sendDailyBrief()
    │
    ├── Gọi API lấy data thị trường
    │   └── GET /api/stocks/v3/overview (top 10 VN30)
    │
    ├── Tính toán tóm tắt
    │   └── Số mã tăng/giảm, VN-Index hôm trước
    │
    ├── Format message Slack (Block Kit)
    │
    ├── Gửi Slack webhook
    │
    └── Emit Kafka event: 'reminder.sent'
```

### Service structure

```
app/Services/reminderService/
├── docs.md
├── index.ts
├── constants.ts
├── type.ts
└── libs/
    ├── fetchMarketData.ts          ← Gọi API lấy data
    ├── fetchMarketData.spec.ts
    ├── buildDailyBrief.ts          ← Format message
    ├── buildDailyBrief.spec.ts
    ├── sendDailyBrief.ts           ← Orchestrate: fetch → build → send
    └── sendDailyBrief.spec.ts
```

### Cronjob

```typescript
// start/cronjob.ts
cronjobAdd('dailyBrief', '0 30 8 * * 1-5', async () => {
  await reminderService.sendDailyBrief()
})
```

### Slack message mẫu

```
📊 Tóm tắt thị trường — 18/03/2026

VN-Index: 1,285.5 (+0.8%)
HNX-Index: 225.3 (-0.2%)

Top tăng: VNM (+3.2%), FPT (+2.8%), HPG (+2.1%)
Top giảm: VIC (-1.5%), VHM (-1.2%)

Tổng GTGD: 18,500 tỷ
```

---

## Các bước thực hiện

1. **Viết docs.md** — Mô tả 3 functions
2. **TDD fetchMarketData** — Mock axios, test response parsing
3. **TDD buildDailyBrief** — Test format output
4. **TDD sendDailyBrief** — Mock fetch + slack, test orchestration
5. **Đăng ký cronjob** — Cron expression cho 8:30 sáng T2-T6
6. **Thêm Kafka event** — Emit `reminder.sent` sau khi gửi thành công
7. **Logging** — Logger.child({ tags: ['reminderService'] })

## Tiêu chí hoàn thành

- [ ] 3 functions hoạt động đúng
- [ ] Có unit test cho mỗi function
- [ ] Tất cả test pass
- [ ] Cronjob chạy đúng giờ
- [ ] Slack message hiển thị đẹp
- [ ] Log có cấu trúc (không console.log)
- [ ] Có docs.md đầy đủ
