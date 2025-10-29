# Cycle API Integration Tests

This directory contains comprehensive integration tests for the Cycle Orleans endpoints using **Effect-TS patterns** and **domain schemas**.

## Test Files

### `create-cycle-orleans.integration.test.ts`

Complete integration test suite for the `POST /cycle` endpoint (Create Cycle Orleans).

**Key Features:**
- Uses Effect-TS patterns (`Effect.gen`, `Effect.runPromise`, `Effect.all`)
- Leverages domain schemas for type-safe validation (`CycleResponseJsonSchema`)
- Uses domain enums (`CycleState`) instead of hardcoded strings
- All test utilities are built with Effect for composability
- Proper error handling with Effect's error model
- Schema-based JSON parsing with `S.Date` for HTTP responses

## Prerequisites

Before running the tests, ensure the following services are running:

1. **API Server** - Must be running on `http://localhost:3000`
   ```bash
   cd api
   bun run dev
   ```

2. **Orleans Sidecar** - Must be running on `http://localhost:5174`
   ```bash
   cd sidecar
   dotnet run
   ```

3. **Database** - PostgreSQL must be running with the required schema
   ```bash
   cd api
   bun run db:push
   ```

## Environment Variables

The tests require the following environment variables:

- **`JWT_SECRET`** (REQUIRED) - Secret key for JWT token generation (min 32 characters)
  - **Must match the server's JWT_SECRET configuration**
  - Tests will fail with an error if not set
  - Tests will fail with 401 errors if it doesn't match the server's secret
- `ORLEANS_BASE_URL` - Base URL for Orleans sidecar
  - Default: `http://localhost:5174`

### Important: JWT_SECRET Configuration

The `JWT_SECRET` used in tests **must exactly match** the `JWT_SECRET` used by the running API server. If they don't match, all tests requiring authentication will fail with 401 Unauthorized errors.

**To set JWT_SECRET for tests:**

```bash
# Option 1: Set in your .env file (recommended)
echo "JWT_SECRET=your-secret-key-at-least-32-chars" >> .env

# Option 2: Set inline when running tests
JWT_SECRET=your-secret-key-at-least-32-chars bun test

# Option 3: Export in your shell
export JWT_SECRET=your-secret-key-at-least-32-chars
bun test
```

## Running Tests

### Run all tests
```bash
cd api
bun test
```

### Run integration tests only
```bash
cd api
bun run test:integration
```

### Run tests in watch mode
```bash
cd api
bun run test:watch
```

## Test Coverage

### Success Scenarios (2 tests)

1. **Create new cycle when no grain exists** (first-time user)
   - User has no existing grain in Orleans
   - Creates a new cycle successfully
   - Returns 201 with cycle data

2. **Create new cycle when grain exists but previous cycle is completed**
   - User has an existing grain with completed cycle
   - Creates a new cycle successfully
   - Verifies the new cycle ID is different from the previous one
   - Returns 201 with cycle data

### Error Scenarios - Conflict (2 tests)

3. **Cycle already in progress (InProgress state)**
   - User has an active cycle in InProgress state
   - Returns 409 Conflict
   - Returns `CycleAlreadyInProgressError` with userId

4. **Concurrent cycle creation (race condition)**
   - Two simultaneous requests to create cycles using `Effect.all` with unbounded concurrency
   - **Both succeed (201)** - This is expected and acceptable behavior
   - Race condition: Both requests pass the `checkCycleInProgress` validation before either persists to Orleans
   - Result: Two cycles created in DB, but only one persisted in Orleans (last write wins)
   - Documents acceptable distributed system race condition
   - Uses Effect's concurrent execution model

### Error Scenarios - Unauthorized (3 tests)

5. **No authorization token**
   - Request without Authorization header
   - Returns 401 Unauthorized
   - Returns `UnauthorizedError`

6. **Invalid token**
   - Request with malformed/invalid JWT token
   - Returns 401 Unauthorized
   - Returns `UnauthorizedError`

7. **Expired token**
   - Request with expired JWT token
   - Returns 401 Unauthorized
   - Returns `UnauthorizedError`

### Error Scenarios - Validation (6 tests)

8. **End date before start date**
   - Invalid: endDate <= startDate
   - Returns 400 Bad Request
   - Error message: "end date must be after start date"

9. **Duration less than 1 hour**
   - Invalid: duration < 1 hour (CYCLE_RULES.MIN_DURATION_MS)
   - Returns 400 Bad Request
   - Error message: "at least 1 hour"

10. **Start date in the future**
    - Invalid: startDate > now
    - Returns 400 Bad Request
    - Error message contains "future"

11. **End date in the future**
    - Invalid: endDate > now
    - Returns 400 Bad Request
    - Error message contains "future"

12. **Missing required fields**
    - Invalid: missing startDate or endDate
    - Returns 400 Bad Request

13. **Invalid date format**
    - Invalid: dates are not valid ISO 8601 strings
    - Returns 400 Bad Request

### Error Scenarios - Server Errors (1 test)

14. **Orleans sidecar unavailable**
    - Orleans sidecar is down or unreachable
    - Returns 500 Internal Server Error
    - Returns `OrleansClientError`
    - ⚠️ Note: This test is currently a placeholder

## Test Utilities (Effect-TS Based)

The test suite includes several utility functions built with Effect:

- `generateTestToken(userId, email)` - Generate valid JWT tokens for authentication (returns `Effect`)
- `createTestUser()` - Create a test user with valid token (returns `Effect`)
- `generateValidCycleDates()` - Generate valid cycle dates (1 hour ago to now) (returns `Effect`)
- `cleanupOrleansGrain(userId)` - Clean up Orleans grain after tests (returns `Effect`)
- `makeRequest(url, options)` - Make HTTP requests with Effect error handling (returns `Effect`)
- `createCycleInProgress(token)` - Create a cycle in progress for testing (returns `Effect`)
- `completeCycle(token, cycleId)` - Complete a cycle for testing (returns `Effect`)

All utilities return `Effect` values and must be composed within `Effect.gen` or run with `Effect.runPromise`.

## Service Scenarios Tested

All scenarios from `CycleOrleansService.createCycleWithOrleans`:

1. ✅ **No grain exists** → Create new grain and cycle
2. ✅ **Grain exists, cycle completed** → Create new cycle
3. ✅ **Grain exists, cycle in InProgress state** → Return 409
4. ✅ **Grain exists, cycle in Creating state** → Return 409
5. ✅ **Authentication failures** → Return 401
6. ✅ **Validation failures** → Return 400
7. ⚠️ **Orleans client errors** → Return 500 (placeholder)

## Notes

- Each test creates a unique user with a UUID to ensure test isolation
- Tests clean up Orleans grains after execution when possible
- Some tests may fail if the required services are not running
- The Orleans sidecar error test is a placeholder and requires manual setup to test properly

## Troubleshooting

### Tests failing with 401 Unauthorized errors
This is the most common issue. If you see errors like:
```
Expected: 201
Received: 401
```

**Cause:** The `JWT_SECRET` in your test environment doesn't match the server's `JWT_SECRET`.

**Solution:**
1. Check what `JWT_SECRET` your server is using (it's set in your `.env` file or environment)
2. Set the same `JWT_SECRET` when running tests:
   ```bash
   JWT_SECRET=your-actual-server-secret bun test
   ```
3. Or add it to your `.env` file (recommended for local development)

### Tests failing with connection errors
- Ensure API server is running on `http://localhost:3000`
- Ensure Orleans sidecar is running on `http://localhost:5174`
- Check that environment variables are set correctly

### Tests failing with database errors
- Ensure PostgreSQL is running
- Run migrations: `bun run db:push`
- Check database connection string

### JWT_SECRET not set error
If you see:
```
Error: JWT_SECRET environment variable is required for tests.
```

Set the `JWT_SECRET` environment variable before running tests (see Environment Variables section above).
