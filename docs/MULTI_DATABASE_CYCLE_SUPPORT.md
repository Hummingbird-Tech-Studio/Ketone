# Database Architecture for Ketone Application

This document describes the database architecture implemented for the Ketone application, using a hybrid approach with two specialized databases.

## Overview

The application uses a **fixed dual-database architecture** with each database optimized for its specific domain:

- **Postgres**: User authentication and authorization
- **Redis**: Cycle business logic (high-performance, in-memory operations)

### Architecture

```
┌─────────────────────────────────────┐
│     Application Layer               │
│  (Services, API Handlers)           │
└─────────────────────────────────────┘
           │              │
           ▼              ▼
    ┌──────────┐   ┌──────────────┐
    │  Users   │   │   Cycles     │
    │  (Auth)  │   │(Business Logic)│
    └──────────┘   └──────────────┘
           │              │
           ▼              ▼
     ┌──────────┐   ┌──────────────┐
     │ Postgres │   │    Redis     │
     │  (Fixed) │   │   (Fixed)    │
     └──────────┘   └──────────────┘
```

- **Users**: Stored in Postgres (authentication, sessions, user data)
- **Cycles**: Stored in Redis (fast, in-memory cycle operations)

## Database Details

### Postgres (Authentication)

**Purpose**: User authentication and authorization

**Implementation**:
- Uses Drizzle ORM with Effect-SQL (@effect/sql-pg)
- Full ACID transactions
- Production-ready with Neon serverless Postgres
- Tables: `users` (email, password hash, timestamps)

**Connection**: Configured via `DATABASE_URL` environment variable

### Redis (Cycle Business Logic)

**Purpose**: High-performance cycle operations

**Implementation**:
- In-memory data structure store
- Native Redis data types (Hashes, Sorted Sets)
- Lua scripts for atomic operations (prevent race conditions)
- MULTI/EXEC transactions for consistency
- Persistence enabled (RDB + AOF)
- Docker-based local deployment

**Key Design**:
```
cycle:{cycleId}              → Hash with cycle fields (id, userId, status, dates)
user:{userId}:active         → String with active cycle ID
user:{userId}:completed      → Sorted Set (score=timestamp, member=cycleId)
```

**Redis Commands Used**:
- `HSET`/`HGETALL`: Store and retrieve cycle data as hash
- `SET`/`GET`/`DEL`: Manage active cycle reference
- `ZADD`/`ZREVRANGE`: Time-ordered index of completed cycles
- `MULTI`/`EXEC`: Atomic transactions
- **Lua Scripts**: Complex atomic operations

## Configuration

### Postgres Configuration

**Environment variables** (`.env`):
```bash
DATABASE_URL=postgres://user:password@host:5432/database
```

The application uses Neon serverless Postgres in production.

### Redis Configuration

Redis runs in Docker for local development:

```bash
# Start Redis container
docker-compose up -d redis

# Stop Redis container
docker-compose down
```

**Environment variables** (`.env`):
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=""  # Optional
# REDIS_DB="0"       # Optional
```

**Redis settings**:
- Persistence: RDB + AOF enabled
- Port: 6379
- Data directory: Docker volume `redis-data`
- Library: ioredis

## Usage

### Running the Server

```bash
# Start Redis (required)
docker-compose up -d redis

# Start the API server
bun run dev:api
```

The server will automatically connect to both Postgres (for auth) and Redis (for cycles).

### Running Tests

Integration tests validate both database connections:

```bash
# Ensure Redis is running
docker-compose up -d redis

# Run cycle integration tests
bun test src/features/cycle-v1/api/__tests__/cycle-v1.integration.test.ts

# Run auth integration tests
bun test src/features/auth/api/__tests__/auth.integration.test.ts

# Run all integration tests
bun run test:integration
```

### Performance Benchmarking

Use the built-in benchmark scripts:

```bash
# Ensure Redis is running
docker-compose up -d redis

# Run Redis benchmark (production setup)
bun run benchmark:cycles:redis

# Run Postgres benchmark (for comparison)
bun run benchmark:cycles:postgres

# Compare both implementations
bun run benchmark:cycles:compare
```

**Benchmark Test Structure**:
1. **Phase 1**: Create 500 concurrent users (Sign Up)
2. **Phase 2**: Execute cycle operations for all users
   - Create cycle
   - Update cycle dates
   - Complete cycle

**Metrics Tracked**:
- Total execution time
- Requests per second (RPS)
- Success/failure rates
- Time distribution by phase

## Architecture Details

### Repository Interface

All database implementations conform to `ICycleRepository`:

```typescript
interface ICycleRepository {
  getCycleById(userId: string, cycleId: string): Effect<Option<CycleRecord>, Error>;
  getActiveCycle(userId: string): Effect<Option<CycleRecord>, Error>;
  getLastCompletedCycle(userId: string): Effect<Option<CycleRecord>, Error>;
  createCycle(data: CycleData): Effect<CycleRecord, Error>;
  updateCycleDates(userId: string, cycleId: string, startDate: Date, endDate: Date): Effect<CycleRecord, Error>;
  completeCycle(userId: string, cycleId: string, startDate: Date, endDate: Date): Effect<CycleRecord, Error>;
}
```

### Business Rules Enforcement

All implementations enforce the same business rules:

1. **One Active Cycle**: Users can only have ONE cycle with status "InProgress" at a time
2. **No Overlap**: New cycles cannot start before the last completed cycle ended
3. **State Transitions**: Only InProgress cycles can be updated or completed
4. **Data Validation**: All data is validated using Effect Schema

### Error Handling

Consistent error types across all implementations:

- `CycleRepositoryError`: Database/technical errors
- `CycleAlreadyInProgressError`: Attempt to create second active cycle
- `CycleInvalidStateError`: Invalid state transition
- `CycleNotFoundError`: Cycle not found
- `CycleOverlapError`: Cycle overlaps with previous cycle

## Implementation Files

### Core Files

- **Repository Interface**: `api/src/features/cycle-v1/repositories/cycle.repository.interface.ts`
- **Redis Repository** (Production): `api/src/features/cycle-v1/repositories/cycle.repository.redis.ts`
- **Postgres Repository** (Alternative): `api/src/features/cycle-v1/repositories/cycle.repository.postgres.ts`
- **Repository Exports**: `api/src/features/cycle-v1/repositories/index.ts`
- **User Repository**: `api/src/features/auth/repositories/user.repository.ts`

### Database Connections

- **Postgres**: `api/src/db/connection.ts`, `api/src/db/schema.ts`
- **Redis**: `api/src/db/providers/redis/connection.ts`, `api/src/db/providers/redis/schema.ts`

### Application Entry

- **Main Index**: `api/src/index.ts` (Layer configuration: DatabaseLive + RedisLive)

### Infrastructure

- **Docker Compose**: `docker-compose.yml` (Redis configuration)

### Tests

- **Cycle Integration Tests**: `api/src/features/cycle-v1/api/__tests__/cycle-v1.integration.test.ts`
- **Auth Integration Tests**: `api/src/features/auth/api/__tests__/auth.integration.test.ts`
- **Stress Test**: `api/src/tests/cycle-stress-test.ts`

## Troubleshooting

### Redis Connection Issues

If Redis connection fails:

```bash
# Ensure Redis is running
docker-compose up -d redis

# Check Redis logs
docker-compose logs redis

# Test Redis connection
docker-compose exec redis redis-cli ping
# Expected: PONG
```

### Postgres Connection Issues

If Postgres connection fails:

1. Verify `DATABASE_URL` is correctly set in `.env`
2. Check network connectivity to Neon Postgres
3. Review connection logs in the application console

### Integration Test Failures

If tests fail:

1. Ensure both Redis and Postgres are accessible
2. Clean up test data: `bun run db:cleanup-test-data`
3. Check database connection logs
4. Verify environment variables are set correctly

## Performance Considerations

### Why Redis for Cycles?

**Advantages**:
- Very fast in-memory operations (sub-millisecond latency)
- Native data structures (Hash, Sorted Set) perfect for cycle data model
- Built-in persistence (RDB + AOF) for durability
- Lua scripts for atomic operations (prevent race conditions)
- MULTI/EXEC transactions for consistency
- Easy to scale horizontally (Redis Cluster, replication)
- Mature ecosystem and excellent tooling

**Trade-offs**:
- Memory-bound (dataset must fit in RAM)
- Requires separate Redis installation (Docker for local dev)
- Persistence configuration impacts write performance

### Why Postgres for Auth?

**Advantages**:
- ACID transactions for critical user data
- Mature, battle-tested for authentication
- Rich query capabilities for user management
- Strong consistency guarantees
- Excellent for relational data (users, sessions)
- Native support for unique constraints

**Trade-offs**:
- Network latency (mitigated with connection pooling)
- Heavier resource footprint than in-memory stores

## Future Enhancements

- [ ] Redis Cluster support for horizontal scaling
- [ ] Automated benchmark comparison reports
- [ ] Grafana dashboard for performance metrics
- [ ] Redis Sentinel for high availability
- [ ] Connection pooling optimization
- [ ] Cache warming strategies
