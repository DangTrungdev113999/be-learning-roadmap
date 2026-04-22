# Đọc log nhiều service cùng lúc

## Mục tiêu

Khi debug cross-service, bạn cần xem log của 3-4 service đồng thời để thấy data flow. Bài này hướng dẫn các kỹ thuật thực tế: tail nhiều file, tmux layout, grep pattern, và cách structured log giúp filter.

---

## 1. tail -f -- Cơ bản nhất

### Xem 1 service

```bash
# Follow log realtime (giống watch network tab trên FE)
tail -f /tmp/logics.log

# Chỉ xem 50 dòng cuối + follow
tail -50f /tmp/logics.log

# Follow + highlight lỗi (macOS/Linux)
tail -f /tmp/logics.log | grep --color=always -i "error\|warn\|$"
```

### Xem nhiều file cùng lúc

```bash
# tail nhiều file -- có header phân biệt
tail -f /tmp/logics.log /tmp/source_service.log /tmp/data_feed.log

# Output:
# ==> /tmp/logics.log <==
# {"level":"info","tags":["analyticsService"],...}
#
# ==> /tmp/source_service.log <==
# {"level":"info","msg":"price updated",...}
```

**Nhược điểm:** Tất cả trộn lẫn trong 1 terminal, khó theo dõi khi log nhiều.

---

## 2. tmux -- Chia terminal thành nhiều panel

tmux cho phép chia 1 terminal thành nhiều ô, mỗi ô theo dõi 1 service. Đây là cách hiệu quả nhất.

### Cài đặt

```bash
# macOS
brew install tmux
```

### Tạo layout debug 4 service

```bash
# Tạo session mới tên "debug"
tmux new-session -s debug

# Trong tmux, chia panel:
# Ctrl+B rồi " → chia ngang
# Ctrl+B rồi % → chia dọc
# Ctrl+B rồi arrow keys → di chuyển giữa panels

# Hoặc dùng script tự động:
tmux new-session -d -s debug 'tail -f /tmp/logics.log'
tmux split-window -h 'tail -f /tmp/source_service.log'
tmux split-window -v 'tail -f /tmp/data_feed.log'
tmux select-pane -t 0
tmux split-window -v 'tail -f /tmp/data_stream.log'
tmux attach -t debug
```

### Layout kết quả

```
┌─────────────────────────┬─────────────────────────┐
│                         │                         │
│   logics.log            │   source_service.log    │
│   tail -f               │   tail -f               │
│                         │                         │
├─────────────────────────┼─────────────────────────┤
│                         │                         │
│   data_stream.log       │   data_feed.log         │
│   tail -f               │   tail -f               │
│                         │                         │
└─────────────────────────┴─────────────────────────┘
```

### tmux cheat sheet

| Phím tắt | Chức năng |
|----------|-----------|
| `Ctrl+B "` | Chia ngang |
| `Ctrl+B %` | Chia dọc |
| `Ctrl+B arrow` | Di chuyển giữa panels |
| `Ctrl+B z` | Zoom 1 panel (full screen), bấm lại để thu nhỏ |
| `Ctrl+B [` | Scroll mode (dùng arrow/PgUp để cuộn) |
| `q` | Thoát scroll mode |
| `Ctrl+B d` | Detach (thoát nhưng tmux vẫn chạy) |
| `tmux attach -t debug` | Quay lại session |

---

## 3. grep -- Filter log thông minh

### Filter theo level

```bash
# Chỉ xem lỗi
tail -f /tmp/logics.log | grep '"level":"error"'

# Xem lỗi và cảnh báo
tail -f /tmp/logics.log | grep -E '"level":"(error|warn)"'

# Xem tất cả NGOẠI TRỪ info (chỉ warn + error)
tail -f /tmp/logics.log | grep -v '"level":"info"'
```

### Filter theo service/tag

```bash
# Chỉ xem log từ analyticsService
tail -f /tmp/logics.log | grep "analyticsService"

# Chỉ xem log từ portfolioService và có lỗi
tail -f /tmp/logics.log | grep "portfolioService" | grep '"level":"error"'
```

### Filter theo thời gian

```bash
# Log trong giờ hiện tại (ví dụ 14:xx)
grep "T14:" /tmp/logics.log

# Log trong 5 phút gần nhất (10:25 đến 10:30)
grep -E "T10:2[5-9]:|T10:30:" /tmp/logics.log

# 20 dòng cuối có chứa "error"
grep -i "error" /tmp/logics.log | tail -20
```

### Kết hợp grep với context

```bash
# Xem 3 dòng trước và 3 dòng sau mỗi dòng lỗi
grep -B 3 -A 3 "error" /tmp/logics.log

# Xem 5 dòng sau khi tìm thấy "timeout"
grep -A 5 "timeout" /tmp/source_service.log
```

---

## 4. Structured log -- Tại sao JSON log mạnh hơn

### Text log (khó filter)

```
[2026-03-18 10:00:01] INFO: Request received from user 123
[2026-03-18 10:00:01] ERROR: MongoDB connection timeout after 5000ms
[2026-03-18 10:00:02] INFO: Retrying connection...
```

Muốn tìm tất cả lỗi timeout: `grep "timeout"` -- nhưng có thể match cả message bình thường chứa từ "timeout".

### JSON log (filter chính xác)

```json
{"level":"info","tags":["userService.getProfile"],"userId":"123","msg":"Request received","time":"2026-03-18T10:00:01.000Z"}
{"level":"error","tags":["mongo"],"error":"MongoNetworkError","timeout":5000,"msg":"Connection timeout","time":"2026-03-18T10:00:01.000Z"}
{"level":"info","tags":["mongo"],"attempt":2,"msg":"Retrying connection","time":"2026-03-18T10:00:02.000Z"}
```

### Dùng jq để filter JSON log

```bash
# jq = JSON query tool (như DevTools filter nhưng cho terminal)

# Cài đặt
brew install jq

# Xem log đẹp (pretty print)
tail -1 /tmp/logics.log | jq .

# Chỉ lấy error
tail -200 /tmp/logics.log | jq -c 'select(.level == "error")' 2>/dev/null

# Chỉ lấy log từ analyticsService
tail -200 /tmp/logics.log | jq -c 'select(.tags[]? == "analyticsService.getOverview")' 2>/dev/null

# Lấy error + chỉ hiển thị msg và error field
tail -200 /tmp/logics.log | jq -c 'select(.level == "error") | {msg, error, tags}' 2>/dev/null

# Đếm lỗi theo tag
cat /tmp/logics.log | jq -r '.tags[0]? // "unknown"' 2>/dev/null | sort | uniq -c | sort -rn

# Follow realtime + filter
tail -f /tmp/logics.log | jq -c 'select(.level == "error")' 2>/dev/null
```

### So sánh grep vs jq

| Tác vụ | grep | jq |
|--------|------|----|
| Tìm text bất kỳ | `grep "error"` | Khó hơn |
| Lọc theo level | `grep '"level":"error"'` (dễ sai) | `jq 'select(.level == "error")'` (chính xác) |
| Lọc theo service | `grep "analyticsService"` | `jq 'select(.tags[]? == "...")'` |
| Kết hợp điều kiện | `grep A \| grep B` (AND) | `jq 'select(.level == "error" and .tags[]? == "...")'` |
| Trích xuất field | Rất khó | `jq '{msg, error}'` |
| Đếm/thống kê | `grep -c` (đơn giản) | `jq + sort + uniq` (linh hoạt) |

---

## 5. Script debug nhanh

Tạo 1 script để mở layout debug nhanh:

```bash
#!/bin/bash
# File: ~/bin/debug-services.sh
# Dùng: bash ~/bin/debug-services.sh

SESSION="debug"

# Kill session cũ nếu có
tmux kill-session -t $SESSION 2>/dev/null

# Tạo layout 4 panel
tmux new-session -d -s $SESSION \
  "echo '=== LOGICS ===' && tail -f /tmp/logics.log | jq -c '{level,tags,msg,error}' 2>/dev/null || tail -f /tmp/logics.log"

tmux split-window -h -t $SESSION \
  "echo '=== SOURCE ===' && tail -f /tmp/source_service.log"

tmux split-window -v -t $SESSION \
  "echo '=== DATA_FEED ===' && tail -f /tmp/data_feed.log"

tmux select-pane -t 0
tmux split-window -v -t $SESSION \
  "echo '=== DATA_STREAM ===' && tail -f /tmp/data_stream.log"

# Attach
tmux attach -t $SESSION
```

```bash
# Cấp quyền chạy
chmod +x ~/bin/debug-services.sh

# Chạy
bash ~/bin/debug-services.sh
```

---

## 6. Docker logs

Đối với services chạy trong Docker (Kafka, message_stream):

```bash
# Follow log
docker logs -f message_stream-message_stream-1
docker logs -f kafka-kafka-1

# Xem 100 dòng cuối
docker logs --tail 100 message_stream-message_stream-1

# Filter log Docker
docker logs message_stream-message_stream-1 2>&1 | grep -i "error"

# Log từ thời điểm cụ thể
docker logs --since "2026-03-18T10:00:00" message_stream-message_stream-1
```

---

## 7. Kết hợp tất cả -- Workflow debug thực tế

Khi nhận bug report "giá không cập nhật":

```bash
# 1. Mở tmux layout
bash ~/bin/debug-services.sh

# 2. Ở panel logics, filter error
# (trong panel logics, Ctrl+C rồi gõ lại)
tail -f /tmp/logics.log | grep --color -i "error\|warn"

# 3. Ở panel source, tìm VNM
tail -f /tmp/source_service.log | grep --color -i "VNM"

# 4. Mở thêm 1 terminal, check Kafka
docker logs --tail 50 kafka-kafka-1

# 5. Zoom vào panel cần xem kỹ
# Ctrl+B z (zoom), Ctrl+B z (zoom out)

# 6. Scroll lên xem log cũ trong panel
# Ctrl+B [ (scroll mode), q (thoát scroll)
```

---

## Tóm tắt

| Kỹ thuật | Khi nào dùng | Lệnh |
|----------|-------------|------|
| `tail -f` | Xem 1 service | `tail -f /tmp/logics.log` |
| `tail -f` nhiều file | Xem 2-3 service đơn giản | `tail -f /tmp/logics.log /tmp/data_feed.log` |
| tmux | Xem 4+ service chuyên nghiệp | `tmux new-session -s debug` |
| `grep` | Filter text nhanh | `grep -i "error"` |
| `jq` | Filter JSON log chính xác | `jq 'select(.level == "error")'` |
| Docker logs | Service chạy Docker | `docker logs -f container_name` |

- **tmux + jq** là combo mạnh nhất để debug cross-service
- Structured log (JSON) giúp filter chính xác hơn text log rất nhiều
- Tạo script debug để mở layout nhanh, không mất thời gian setup mỗi lần
