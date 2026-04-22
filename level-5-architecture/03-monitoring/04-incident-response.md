# Incident Response: Xử lý sự cố

## Mục tiêu

Hiểu quy trình xử lý sự cố từ lúc phát hiện đến khi viết postmortem, để team không hoảng loạn khi production gặp vấn đề.

---

## So sánh với Frontend

| Bước | FE | BE |
|------|----|----|
| **Phát hiện** | User báo bug, Sentry alert | Alert từ monitoring, user report |
| **Triage** | Check browser console, reproduce | Check logs, metrics, xác định severity |
| **Sửa** | Fix code, push PR | Hotfix, rollback, hoặc manual fix data |
| **Deploy** | CI/CD build FE | CI/CD deploy BE, có thể cần migration |
| **Review** | Code review, merge | Postmortem, tìm root cause, cải thiện |

Khác biệt lớn nhất: lỗi FE ảnh hưởng 1 user tại 1 thời điểm, lỗi BE có thể ảnh hưởng **tất cả user đồng thời**.

---

## Incident Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────────┐
│  DETECT  │ -> │  TRIAGE  │ -> │ MITIGATE │ -> │ RESOLVE  │ -> │ POSTMORTEM │
│ Phát hiện│    │Đánh giá  │    │Giảm thiểu│    │Sửa triệt │    │ Rút kinh   │
│          │    │mức độ    │    │thiệt hại │    │để         │    │ nghiệm     │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └────────────┘
   5 phút         10 phút       30 phút-vài giờ   vài giờ-ngày    1-3 ngày sau
```

---

### 1. Detect -- Phát hiện sự cố

**Nguồn phát hiện:**

```
Tự động (tốt nhất):
├── Alert: Error rate tăng > 5%
├── Alert: Response time P95 > 3 giây
├── Alert: MongoDB connection pool cạn
└── Health check endpoint trả 503

Thủ công (tệ hơn):
├── User phàn nàn trên app store / Zalo / email
├── Team QA phát hiện khi test
├── Dev tình cờ thấy lỗi trong logs
└── CEO gọi lúc 3h sáng: "App sập rồi!"
```

**Mục tiêu:** Giảm MTTD (Mean Time To Detect) -- thời gian từ lúc lỗi xảy ra đến lúc team biết.

### 2. Triage -- Đánh giá mức độ

Xác định **severity** (mức nghiêm trọng) và **impact** (ảnh hưởng).

```
Severity Levels:

SEV-1 (Critical):
  - Toàn bộ hệ thống ngừng hoạt động
  - Mất dữ liệu người dùng
  - Bảo mật bị xâm phạm
  → Huy động toàn team, thông báo leadership

SEV-2 (Major):
  - Tính năng chính không hoạt động (thanh toán, đăng nhập)
  - Ảnh hưởng > 50% user
  → On-call engineer + 1-2 người hỗ trợ

SEV-3 (Minor):
  - Tính năng phụ bị lỗi
  - Ảnh hưởng < 10% user
  → On-call engineer tự xử lý

SEV-4 (Low):
  - Cosmetic issue, performance degradation nhẹ
  → Tạo ticket, xử lý trong sprint tiếp theo
```

**Checklist triage nhanh:**

```
□ Bao nhiêu user bị ảnh hưởng?
□ Tính năng nào bị ảnh hưởng?
□ Lỗi bắt đầu từ khi nào? (check metrics timeline)
□ Có deploy hoặc thay đổi gì gần đây không?
□ Lỗi đang tệ hơn, ổn định, hay tự giảm?
```

### 3. Mitigate -- Giảm thiểu thiệt hại

**Ưu tiên: DỪNG CHẢY MÁU trước, TÌM NGUYÊN NHÂN sau.**

```
Các chiến thuật mitigation (nhanh -> chậm):

1. Rollback deploy gần nhất (nếu lỗi do code mới)
   $ git revert <commit> && deploy

2. Feature flag tắt tính năng lỗi
   $ redis-cli SET feature:payment:enabled false

3. Scale up (nếu do quá tải)
   $ kubectl scale deployment api --replicas=5

4. Rate limit tăng (nếu bị DDoS)
   $ Tăng rate limit hoặc block IP

5. Manual data fix (nếu lỗi dữ liệu)
   $ mongo --eval "db.users.updateMany({...})"

6. Redirect traffic (nếu 1 server chết)
   $ Cập nhật load balancer
```

**Lưu ý quan trọng:** Mitigation không cần hoàn hảo. Mục tiêu là **giảm ảnh hưởng ngay lập tức**, không phải sửa triệt để.

### 4. Resolve -- Sửa triệt để

Sau khi đã mitigation (bleeding đã dừng), bắt đầu tìm và sửa root cause.

```
Quy trình:

1. Tìm root cause
   - Xem logs quanh thời điểm lỗi bắt đầu
   - Correlate với deploy, config change, traffic spike
   - Dùng tags trong Logger.child() để trace qua các service

2. Viết fix
   - Fix code + viết test cho case gây lỗi
   - Code review (vẫn cần, dù khẩn cấp)

3. Deploy fix
   - Deploy lên staging test trước (nếu có thời gian)
   - Deploy production
   - Monitor metrics sau deploy

4. Verify
   - Error rate về mức bình thường?
   - Latency về mức bình thường?
   - Không có side effect mới?
```

### 5. Postmortem -- Rút kinh nghiệm

Họp sau sự cố để tìm hiểu nguyên nhân sâu và ngăn lặp lại. **Blameless** -- không đổ lỗi cá nhân.

---

## Postmortem Template

```markdown
# Postmortem: [Tên sự cố ngắn gọn]

## Tóm tắt
- **Ngày:** 2026-03-18
- **Thời gian ảnh hưởng:** 14:30 - 15:15 (45 phút)
- **Severity:** SEV-2
- **Ảnh hưởng:** User không thể thanh toán qua Google Pay
- **Người xử lý:** [Tên]

## Timeline (UTC+7)
- 14:25 - Deploy phiên bản v2.5.1 lên production
- 14:30 - Alert: payment_error_rate > 5%
- 14:32 - On-call engineer xác nhận lỗi
- 14:35 - Triage: SEV-2, tất cả thanh toán Google Pay thất bại
- 14:40 - Quyết định rollback
- 14:45 - Rollback hoàn tất, error rate giảm
- 15:00 - Error rate về 0%, xác nhận resolved
- 15:15 - Tất cả thanh toán pending được xử lý lại

## Root Cause
Phiên bản mới thay đổi format của Google purchase token validation.
Hàm `verifyGooglePurchase` gọi API Google với token format mới,
nhưng Google API chưa hỗ trợ format này.

Lỗi không được phát hiện ở staging vì staging dùng sandbox API
(chấp nhận mọi format).

## Lessons Learned
### Đã làm tốt
- Alert phát hiện nhanh (5 phút sau deploy)
- Quyết định rollback nhanh chóng
- Communication rõ ràng trong Slack channel

### Cần cải thiện
- Staging environment không giống production (sandbox vs real API)
- Không có canary deployment (deploy 100% traffic cùng lúc)
- Không có integration test cho Google Pay flow

## Action Items
| Hành động | Người phụ trách | Deadline |
|-----------|----------------|----------|
| Thêm integration test cho payment flows | Dev A | 2026-03-25 |
| Setup canary deployment (5% -> 25% -> 100%) | DevOps B | 2026-04-01 |
| Staging dùng production-like Google API | Dev C | 2026-03-28 |
| Thêm alert cho payment latency (hiện chỉ có error rate) | Dev A | 2026-03-22 |
```

---

## Communication trong Incident

### Khi sự cố đang diễn ra

```
Slack #incidents channel:

[14:32] @oncall: 🔴 INCIDENT DECLARED - SEV-2
  Vấn đề: Thanh toán Google Pay thất bại
  Ảnh hưởng: Tất cả user thanh toán qua Google Pay
  Status: Đang điều tra

[14:40] @oncall: Đã xác định nguyên nhân: deploy v2.5.1 thay đổi token format
  Hành động: Đang rollback về v2.5.0

[14:45] @oncall: Rollback hoàn tất. Error rate đang giảm.

[15:00] @oncall: ✅ INCIDENT RESOLVED
  Thời gian ảnh hưởng: 30 phút
  Postmortem sẽ được tổ chức ngày mai
```

### Nguyên tắc communication

```
1. Cập nhật mỗi 15 phút (dù chưa có gì mới)
   -> "Đang tiếp tục điều tra, chưa có update mới"
   -> Tốt hơn im lặng (im lặng = mọi người lo lắng)

2. Phân biệt FACT vs SPECULATION
   -> "Error rate là 15%" (fact)
   -> "Có thể do deploy gần nhất" (speculation, cần verify)

3. Ai cần biết?
   -> SEV-1: Leadership, tất cả team
   -> SEV-2: Team liên quan
   -> SEV-3: Chỉ engineering
```

---

## Ví dụ thực tế trong Logics

### Scenario: MongoDB slow queries gây timeout

```
Phát hiện:
  - Alert: p95_latency > 3s trong 5 phút
  - Logs: nhiều dòng "getGooglePurchase failed" với status timeout

Triage:
  - Check MongoDB metrics: connections = 490/500 (gần cạn)
  - Check slow query log: aggregation trên analysisEvents
    (collection 100M+ rows, thiếu index)
  - Severity: SEV-2 (ảnh hưởng tất cả API, không chỉ payment)

Mitigate:
  - Kill slow queries: db.killOp(opId)
  - Tạm thời disable analytics aggregation endpoint
  - Restart MongoDB connection pool

Resolve:
  - Thêm compound index cho analysisEvents
  - Giới hạn date range query từ 365 xuống 60 ngày
  - Optimize aggregation pipeline

Postmortem:
  - Root cause: Analytics query quét toàn bộ collection 100M rows
  - Action: Thêm index, giới hạn date range, monitoring cho slow queries
```

Đây chính xác là câu chuyện thật từ commit history: `fix(analytics): reduce max date range from 365 to 60 days` và `fix(analytics): optimize queries for 100M+ row analysisEvents collection`.

---

## Metrics đo lường Incident Response

```
MTTD (Mean Time To Detect):
  Từ lúc lỗi xảy ra -> team biết
  Mục tiêu: < 5 phút

MTTA (Mean Time To Acknowledge):
  Từ lúc alert -> ai đó nhận và bắt đầu xử lý
  Mục tiêu: < 15 phút

MTTR (Mean Time To Resolve):
  Từ lúc lỗi xảy ra -> hệ thống hoạt động bình thường
  Mục tiêu: < 1 giờ (SEV-2), < 4 giờ (SEV-3)

Frequency:
  Số incident mỗi tuần/tháng
  Mục tiêu: Giảm theo thời gian
```

---

## Điểm chính cần nhớ

1. **5 bước**: Detect -> Triage -> Mitigate -> Resolve -> Postmortem.
2. **Mitigate trước, fix sau** -- dừng chảy máu rồi mới mổ tìm nguyên nhân.
3. **Postmortem blameless** -- không đổ lỗi cá nhân, tập trung vào hệ thống.
4. **Communication** đều đặn mỗi 15 phút, phân biệt fact vs speculation.
5. Đo **MTTD, MTTA, MTTR** để cải thiện quy trình theo thời gian.
6. Mỗi incident là cơ hội học -- nếu cùng lỗi xảy ra 2 lần, quy trình có vấn đề.
