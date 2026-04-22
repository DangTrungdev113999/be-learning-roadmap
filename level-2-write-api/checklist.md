# Checklist Level 2: Viết API đơn giản

Hoàn thành tất cả items trước khi lên Level 3.

## Controller

- [ ] Dùng được `util.gp()` với tất cả kiểu: string, number, boolean, comma, date, enum
- [ ] Dùng được `util.check()` với format `'Thông báo code:error_code'`
- [ ] Biết 4 cấp auth: `login()`, `expert()`, `admin()`, `admin(false)`
- [ ] Biết 3 response patterns: `{ data }`, `{ data, paging }`, `{ error }`
- [ ] Không mắc 7 lỗi thường gặp trong controller

## MongoDB

- [ ] Viết được schema với: String, Number, Boolean, Date, ObjectId, Array, nested object
- [ ] Biết tạo index và giải thích tại sao cần index
- [ ] Thành thạo CRUD: create, find, findOne, updateOne, deleteOne
- [ ] Dùng được operators: `$gt`, `$in`, `$ne`, `$set`, `$push`, `$pull`, `$exists`
- [ ] Viết được pagination: skip/limit + countDocuments
- [ ] Viết được aggregation cơ bản: `$match` → `$group` → `$sort`
- [ ] Biết dùng `.lean()` và giải thích tại sao
- [ ] Hoàn thành ít nhất 30/50 bài tập MongoDB

## TDD

- [ ] Viết được test file với `@japa/runner`
- [ ] Dùng được ít nhất 8 assert methods
- [ ] Biết mock service và module
- [ ] Viết được test với `group.setup()` và `group.teardown()`
- [ ] Hoàn thành ít nhất 7/10 bài tập TDD

## Tạo API

- [ ] Tạo được route file mới
- [ ] Viết được controller method
- [ ] Viết được service function theo TDD
- [ ] Kết nối route → controller → service → MongoDB thành công
- [ ] Test API bằng curl hoặc Postman

## Redis

- [ ] Dùng được GET, SET, DEL, EXPIRE
- [ ] Hiểu 4 data types: String, Hash, List, Set
- [ ] Hiểu `cacheService.useCache()` và khi nào dùng cache
- [ ] Hiểu Redis Pub/Sub concept
- [ ] Hoàn thành ít nhất 7/10 bài tập Redis

## Mini Project

- [ ] Hoàn thành mini project tổng hợp trong `exercises/mini-project.md`

---

**Khi tất cả checked → Chuyển sang `level-3-full-feature/`**
