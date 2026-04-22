# Checklist Level 1: Đọc hiểu code BE

Hoàn thành tất cả items trước khi lên Level 2.

## Kiến thức cốt lõi

- [ ] Biết vai trò của: `app/`, `routes/`, `mongo/`, `redis/`, `config/`, `tasks/`, `start/`, `utils/`
- [ ] Hiểu Controller = nhận request, Service = business logic
- [ ] Biết 6 path aliases: App, Mongo, Redis, Utils, Config, Services
- [ ] Nói được 5+ điểm khác nhau giữa FE và BE

## Thực hành — Trace API

- [ ] Trace được `GET /api/stocks/v3/overview` (route → controller → data source)
- [ ] Trace được 1 API khác tự chọn
- [ ] Biết cách dùng `grep` để tìm route, controller, service

## Thực hành — Service pattern

- [ ] Đọc hiểu `docs.md` của 3 service (dateService + 2 service khác)
- [ ] Giải thích được cấu trúc: docs.md, index.ts, constants.ts, type.ts, libs/
- [ ] Biết workflow: đọc docs → confirm → test → implement → update docs

## Thực hành — Testing

- [ ] Chạy test thành công: `node ace test unit --files ...`
- [ ] Chạy `yarn tsc --noEmit` không lỗi
- [ ] Đọc 1 file `.spec.ts` và hiểu mỗi test case kiểm tra gì

## Bài tập

- [ ] Hoàn thành ít nhất 15/20 bài trong `exercises/practice.md`

---

**Khi tất cả checked → Chuyển sang `level-2-write-api/`**
