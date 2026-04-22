# Tất cả Assert Methods cần biết

## Bảng tổng hợp nhanh

| Method | Mô tả | Ví dụ |
|--------|-------|-------|
| `equal` | So sánh giá trị (===) | `assert.equal(1 + 1, 2)` |
| `notEqual` | Không bằng (!==) | `assert.notEqual(1, 2)` |
| `deepEqual` | So sánh object/array sâu | `assert.deepEqual({a: 1}, {a: 1})` |
| `notDeepEqual` | Object/array khác nhau | `assert.notDeepEqual({a: 1}, {a: 2})` |
| `isTrue` | Đúng là `true` | `assert.isTrue(result > 0)` |
| `isFalse` | Đúng là `false` | `assert.isFalse(isDeleted)` |
| `isNull` | Đúng là `null` | `assert.isNull(result)` |
| `isNotNull` | Không phải `null` | `assert.isNotNull(user)` |
| `isUndefined` | Đúng là `undefined` | `assert.isUndefined(obj.missing)` |
| `isDefined` | Không phải `undefined` | `assert.isDefined(result)` |
| `isArray` | Là array | `assert.isArray(items)` |
| `isObject` | Là object | `assert.isObject(user)` |
| `isAbove` | Lớn hơn (>) | `assert.isAbove(10, 5)` |
| `isBelow` | Nhỏ hơn (<) | `assert.isBelow(5, 10)` |
| `isAtLeast` | Lớn hơn hoặc bằng (>=) | `assert.isAtLeast(count, 1)` |
| `isAtMost` | Nhỏ hơn hoặc bằng (<=) | `assert.isAtMost(count, 100)` |
| `include` | Chứa phần tử/substring | `assert.include([1,2,3], 2)` |
| `notInclude` | Không chứa | `assert.notInclude([1,2], 3)` |
| `properties` | Object có các key | `assert.properties(obj, ['a', 'b'])` |
| `lengthOf` | Độ dài mảng/string | `assert.lengthOf([1,2,3], 3)` |
| `match` | Khớp regex | `assert.match(email, /@/)` |
| `exists` | Không phải null/undefined | `assert.exists(data)` |
| `notExists` | Là null hoặc undefined | `assert.notExists(error)` |
| `rejects` | Promise bị reject | `assert.rejects(() => fn(), 'Error msg')` |
| `throws` | Function throw error | `assert.throws(() => fn(), 'Error msg')` |
| `instanceOf` | Là instance của class | `assert.instanceOf(err, Error)` |

## Chi tiết và ví dụ thực tế

### 1. equal / notEqual -- So sánh primitive

```typescript
test('should return correct count', async ({ assert }) => {
  const result = await getOverview({ from, to })

  assert.equal(result.totalEvents, 3)
  assert.equal(result.totalNewUsers, 1)
  assert.notEqual(result.totalEvents, 0)
})
```

**Chú ý:** `equal` dùng `===`, không dùng cho object/array.

### 2. deepEqual -- So sánh object/array (dùng nhiều nhất)

```typescript
test('should cache and return data', async ({ assert }) => {
  const result = await useCache(handle, ['key1'], { maxAge: 10, revalidate: 5, engine: 'memory' })

  // So sánh toàn bộ object
  assert.deepEqual(result, { data: 'test' })

  // So sánh array
  assert.deepEqual([1, 2, 3], [1, 2, 3])

  // Nested object cũng OK
  assert.deepEqual(
    { user: { name: 'A', age: 20 } },
    { user: { name: 'A', age: 20 } },
  )
})
```

### 3. isTrue / isFalse -- Kiểm tra boolean

```typescript
test('should return overview with correct structure', async ({ assert }) => {
  const result = await getOverview({ from, to })

  assert.isTrue(result.totalEvents >= 3)
  assert.isTrue(result.totalNewUsers >= 1)
  assert.isFalse(result.totalEvents < 0)
})
```

### 4. properties -- Kiểm tra object có đủ key

```typescript
test('should return overview with correct structure', async ({ assert }) => {
  const result = await getOverview({ from, to })

  // Kiểm tra result có tất cả key cần thiết
  assert.properties(result, ['totalEvents', 'totalActiveUsers', 'totalNewUsers', 'topEventKeys', 'platformSplit'])
})
```

So sánh FE: giống `expect(result).toHaveProperty('key')` nhưng kiểm tra nhiều key cùng lúc.

### 5. isArray / lengthOf -- Kiểm tra mảng

```typescript
test('should return array of events', async ({ assert }) => {
  const result = await getOverview({ from, to })

  assert.isArray(result.topEventKeys)
  assert.lengthOf(result.topEventKeys, 2) // Đúng 2 phần tử

  // Hoặc kiểm tra length linh hoạt hơn
  assert.isAbove(result.topEventKeys.length, 0) // Có ít nhất 1 phần tử
})
```

### 6. include / notInclude -- Kiểm tra chứa

```typescript
test('should include specific items', async ({ assert }) => {
  const roles = ['admin', 'editor', 'viewer']

  assert.include(roles, 'admin')
  assert.notInclude(roles, 'superadmin')

  // Cũng dùng được với string
  assert.include('hello@email.com', '@')
  assert.include('Tên phòng phải có từ 5 đến 200 ký tự.', 'ký tự')
})
```

### 7. rejects -- Kiểm tra Promise throw error (cực quan trọng)

```typescript
test('should throw error if handle throws', async ({ assert }) => {
  const handle = async () => {
    throw new Error('Test error')
  }

  await assert.rejects(
    () => useCache(handle, ['error'], { maxAge: 10, revalidate: 5, engine: 'memory' }),
    'Test error',
  )
})

test('should throw error if maxAge is 0', async ({ assert }) => {
  const handle = async () => ({ data: 'test' })

  await assert.rejects(
    () => useCache(handle, ['invalid'], { maxAge: 0, revalidate: 5, engine: 'memory' }),
    'Missing required options',
  )
})
```

**Chú ý:** Tham số đầu phải là **function** (arrow function), không phải Promise.

### 8. isAbove / isBelow / isAtLeast / isAtMost -- So sánh số

```typescript
test('should revalidate correctly', async ({ assert }) => {
  const result3 = await useCache(handle, ['revalidate-stale'], opts)

  // result3 mới hơn result1
  assert.isAbove(result3.timestamp, result1.timestamp)

  // callCount ít nhất là 1
  assert.isAtLeast(callCount, 1, 'Handle should be called at least once')

  // Không quá 100 items
  assert.isAtMost(result.items.length, 100)
})
```

### 9. match -- Kiểm tra regex

```typescript
test('should return valid email format', async ({ assert }) => {
  const email = user.email
  assert.match(email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
})

test('should return valid date string', async ({ assert }) => {
  const dateStr = result.createdAt
  assert.match(dateStr, /^\d{4}-\d{2}-\d{2}/)
})
```

### 10. exists / notExists -- Kiểm tra null/undefined

```typescript
test('should return data when found', async ({ assert }) => {
  const result = await getDetail({ _id: validId })
  assert.exists(result)
  assert.exists(result.name)
})

test('should return null when not found', async ({ assert }) => {
  const result = await getDetail({ _id: 'invalid' })
  assert.notExists(result)
})
```

## Sai lầm thường gặp

### So sánh object bằng equal

```typescript
// SAI -- luôn fail vì 2 object khác reference
assert.equal({ a: 1 }, { a: 1 })

// ĐÚNG
assert.deepEqual({ a: 1 }, { a: 1 })
```

### Quên await với rejects

```typescript
// SAI -- test pass dù function không throw
assert.rejects(() => asyncFn(), 'Error')

// ĐÚNG
await assert.rejects(() => asyncFn(), 'Error')
```

### Truyền Promise thay vì function cho rejects

```typescript
// SAI -- truyền Promise
await assert.rejects(asyncFn(), 'Error')

// ĐÚNG -- truyền function
await assert.rejects(() => asyncFn(), 'Error')
```

## Bài tập

Cho function `validateAge(age: number)` throw error nếu `age < 0` hoặc `age > 150`, trả về `true` nếu hợp lệ. Viết test dùng ít nhất 5 assert methods khác nhau.

<details>
<summary>Gợi ý đáp án</summary>

```typescript
test.group('validateAge', () => {
  test('should return true for valid age', async ({ assert }) => {
    assert.isTrue(validateAge(25))
    assert.equal(validateAge(0), true)
  })

  test('should throw for negative age', async ({ assert }) => {
    assert.throws(() => validateAge(-1), 'Invalid age')
  })

  test('should throw for age over 150', async ({ assert }) => {
    assert.throws(() => validateAge(151), 'Invalid age')
  })

  test('should handle boundary values', async ({ assert }) => {
    assert.isTrue(validateAge(0))
    assert.isTrue(validateAge(150))
    assert.isAtLeast(0, 0)
    assert.isAtMost(150, 150)
  })
})
```

</details>
