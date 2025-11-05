# Redis Commands Reference for Cycle Management

This document provides useful Redis commands for exploring, managing, and monitoring cycle data stored in Redis.

## Table of Contents
- [Connection & Setup](#connection--setup)
- [General Statistics](#general-statistics)
- [Counting Cycles](#counting-cycles)
- [Exploring Cycle Data](#exploring-cycle-data)
- [User-Specific Queries](#user-specific-queries)
- [Data Management](#data-management)
- [Monitoring & Performance](#monitoring--performance)
- [GUI Tools](#gui-tools)

---

## Connection & Setup

### Start Redis Container
```bash
# Start Redis using docker-compose
docker-compose up -d redis

# Check if Redis is running
docker ps | grep ketone-redis

# Stop Redis
docker-compose stop redis

# Restart Redis
docker-compose restart redis
```

### Connect to Redis CLI
```bash
# Interactive mode
docker exec -it ketone-redis redis-cli

# Non-interactive (single command)
docker exec ketone-redis redis-cli <COMMAND>

# Test connection
docker exec ketone-redis redis-cli PING
# Expected output: PONG
```

---

## General Statistics

### Database Overview
```bash
# Total number of keys in database
docker exec ketone-redis redis-cli DBSIZE

# Get Redis server info
docker exec ketone-redis redis-cli INFO

# Memory usage
docker exec ketone-redis redis-cli INFO memory | grep used_memory_human

# Persistence status
docker exec ketone-redis redis-cli INFO persistence | grep -E "rdb_|aof_"

# Server statistics
docker exec ketone-redis redis-cli INFO stats
```

### Data Volume Location
```bash
# Get Redis data volume location
docker volume inspect ketone_redis-data --format '{{.Mountpoint}}'
# Output: /var/lib/docker/volumes/ketone_redis-data/_data
```

---

## Counting Cycles

### Count All Cycles
```bash
# Count total cycle records (Redis Hashes)
docker exec ketone-redis redis-cli KEYS "cycle:*" | wc -l

# Count users with active cycles
docker exec ketone-redis redis-cli KEYS "user:*:active" | wc -l

# Count users with completed cycles
docker exec ketone-redis redis-cli KEYS "user:*:completed" | wc -l
```

### Count by Pattern
```bash
# List all keys matching a pattern (use carefully with large datasets)
docker exec ketone-redis redis-cli KEYS "cycle:*"

# Count keys with SCAN (safer for large datasets)
docker exec ketone-redis redis-cli --scan --pattern "cycle:*" | wc -l
```

---

## Exploring Cycle Data

### View a Specific Cycle
```bash
# Get all fields of a cycle (Redis Hash)
docker exec ketone-redis redis-cli HGETALL "cycle:CYCLE_ID"

# Get a specific field
docker exec ketone-redis redis-cli HGET "cycle:CYCLE_ID" status
docker exec ketone-redis redis-cli HGET "cycle:CYCLE_ID" userId

# Check if a cycle exists
docker exec ketone-redis redis-cli EXISTS "cycle:CYCLE_ID"
```

### View First N Cycles
```bash
# Get first 10 cycle IDs
docker exec ketone-redis redis-cli KEYS "cycle:*" | head -10

# Get a random cycle ID
CYCLE_ID=$(docker exec ketone-redis redis-cli KEYS "cycle:*" | head -1 | sed 's/cycle://')

# View its content
docker exec ketone-redis redis-cli HGETALL "cycle:$CYCLE_ID"
```

### Explore Cycle Fields
```bash
# Get all field names of a cycle hash
docker exec ketone-redis redis-cli HKEYS "cycle:CYCLE_ID"

# Get number of fields in a cycle
docker exec ketone-redis redis-cli HLEN "cycle:CYCLE_ID"

# Get multiple fields at once
docker exec ketone-redis redis-cli HMGET "cycle:CYCLE_ID" id status startDate endDate
```

---

## User-Specific Queries

### Active Cycles
```bash
# Get active cycle ID for a specific user
docker exec ketone-redis redis-cli GET "user:USER_ID:active"

# Check if user has an active cycle
docker exec ketone-redis redis-cli EXISTS "user:USER_ID:active"

# List all users with active cycles
docker exec ketone-redis redis-cli KEYS "user:*:active"
```

### Completed Cycles
```bash
# Count completed cycles for a user (Sorted Set)
docker exec ketone-redis redis-cli ZCARD "user:USER_ID:completed"

# Get the most recent completed cycle (highest score)
docker exec ketone-redis redis-cli ZREVRANGE "user:USER_ID:completed" 0 0

# Get the 5 most recent completed cycles with timestamps
docker exec ketone-redis redis-cli ZREVRANGE "user:USER_ID:completed" 0 4 WITHSCORES

# Get all completed cycles for a user
docker exec ketone-redis redis-cli ZREVRANGE "user:USER_ID:completed" 0 -1 WITHSCORES

# Get completed cycles in a timestamp range
docker exec ketone-redis redis-cli ZREVRANGEBYSCORE "user:USER_ID:completed" +inf -inf WITHSCORES
```

### Full User Cycle History
```bash
# Get active cycle
ACTIVE_ID=$(docker exec ketone-redis redis-cli GET "user:USER_ID:active")
echo "Active cycle: $ACTIVE_ID"
docker exec ketone-redis redis-cli HGETALL "cycle:$ACTIVE_ID"

# Get all completed cycles
docker exec ketone-redis redis-cli ZREVRANGE "user:USER_ID:completed" 0 -1 WITHSCORES
```

---

## Data Management

### Test Data Operations
```bash
# Create test data
docker exec ketone-redis redis-cli SET test:key "Hello Redis"
docker exec ketone-redis redis-cli HSET test:hash field1 "value1" field2 "value2"

# Read test data
docker exec ketone-redis redis-cli GET test:key
docker exec ketone-redis redis-cli HGETALL test:hash

# Delete test data
docker exec ketone-redis redis-cli DEL test:key test:hash
```

### Cleanup Commands

⚠️ **WARNING**: These commands will delete data. Use with caution!

```bash
# Delete a specific cycle
docker exec ketone-redis redis-cli DEL "cycle:CYCLE_ID"

# Delete all data for a specific user
docker exec ketone-redis redis-cli DEL "user:USER_ID:active"
docker exec ketone-redis redis-cli DEL "user:USER_ID:completed"

# Delete all cycles (DANGEROUS - deletes all cycle data!)
docker exec ketone-redis redis-cli KEYS "cycle:*" | xargs -n 1 docker exec ketone-redis redis-cli DEL

# Flush entire database (DANGEROUS - deletes everything!)
docker exec ketone-redis redis-cli FLUSHDB

# Flush all databases in Redis instance (EXTREMELY DANGEROUS!)
docker exec ketone-redis redis-cli FLUSHALL
```

### Safe Bulk Operations
```bash
# Count before deleting
COUNT=$(docker exec ketone-redis redis-cli KEYS "cycle:*" | wc -l)
echo "About to delete $COUNT cycles. Press Ctrl+C to cancel."
sleep 5

# Then delete
docker exec ketone-redis redis-cli KEYS "cycle:*" | xargs -n 1 docker exec ketone-redis redis-cli DEL
```

---

## Monitoring & Performance

### Real-time Monitoring
```bash
# Monitor commands in real-time
docker exec ketone-redis redis-cli MONITOR

# Watch specific stats (update every second)
watch -n 1 'docker exec ketone-redis redis-cli INFO stats'

# Monitor memory usage
watch -n 1 'docker exec ketone-redis redis-cli INFO memory | grep used_memory_human'
```

### Performance Analysis
```bash
# Get slowlog (slow queries)
docker exec ketone-redis redis-cli SLOWLOG GET 10

# Check latency
docker exec ketone-redis redis-cli --latency

# Benchmark Redis performance
docker exec ketone-redis redis-cli --intrinsic-latency 100
```

### View Logs
```bash
# View Redis container logs
docker logs ketone-redis

# Follow logs in real-time
docker logs -f ketone-redis

# View last 100 lines
docker logs --tail 100 ketone-redis
```

---

## GUI Tools

### RedisInsight (Recommended)
Redis official GUI for exploring and managing data.

```bash
# Install with Docker
docker run -d --name redisinsight \
  -p 8001:8001 \
  redislabs/redisinsight:latest

# Access at: http://localhost:8001
# Connect to: localhost:6379
```

**Features:**
- Visual browser for keys
- Query builder
- Real-time monitoring
- Performance analytics
- Memory analysis

### Redis Commander (Lightweight Alternative)
```bash
# Install with Docker
docker run -d --name redis-commander \
  -p 8081:8081 \
  -e REDIS_HOSTS=local:localhost:6379 \
  rediscommander/redis-commander:latest

# Access at: http://localhost:8081
```

**Features:**
- Web-based interface
- Simple key browser
- Basic CRUD operations

---

## Data Structure Reference

### Cycle Keys in Redis

**Cycle Record (Hash):**
```
cycle:{cycleId} → Hash
  ├─ id: string
  ├─ userId: string
  ├─ status: "InProgress" | "Completed"
  ├─ startDate: ISO8601 timestamp
  ├─ endDate: ISO8601 timestamp
  ├─ createdAt: ISO8601 timestamp
  └─ updatedAt: ISO8601 timestamp
```

**Active Cycle Reference (String):**
```
user:{userId}:active → String (cycleId)
```

**Completed Cycles Index (Sorted Set):**
```
user:{userId}:completed → Sorted Set
  └─ Score: timestamp (milliseconds)
  └─ Member: cycleId
```

### Example Queries by Use Case

**Find a user's current cycle:**
```bash
# 1. Get active cycle ID
ACTIVE_ID=$(docker exec ketone-redis redis-cli GET "user:USER_ID:active")

# 2. Get full cycle data
docker exec ketone-redis redis-cli HGETALL "cycle:$ACTIVE_ID"
```

**Get cycle history for a user:**
```bash
# 1. Get all completed cycle IDs (most recent first)
docker exec ketone-redis redis-cli ZREVRANGE "user:USER_ID:completed" 0 -1

# 2. Loop through and get each cycle
docker exec ketone-redis redis-cli ZREVRANGE "user:USER_ID:completed" 0 -1 | \
  while read CYCLE_ID; do
    echo "Cycle: $CYCLE_ID"
    docker exec ketone-redis redis-cli HGETALL "cycle:$CYCLE_ID"
    echo "---"
  done
```

**Count cycles by status:**
```bash
# This requires scanning all cycles (can be slow with many records)
docker exec ketone-redis redis-cli --scan --pattern "cycle:*" | \
  while read key; do
    docker exec ketone-redis redis-cli HGET "$key" status
  done | sort | uniq -c
```

---

## Troubleshooting

### Connection Issues
```bash
# Check if Redis is running
docker ps | grep ketone-redis

# Check Redis health
docker exec ketone-redis redis-cli PING

# Check Redis logs for errors
docker logs ketone-redis --tail 50
```

### Performance Issues
```bash
# Check memory usage
docker exec ketone-redis redis-cli INFO memory

# Check connected clients
docker exec ketone-redis redis-cli CLIENT LIST

# Check slow queries
docker exec ketone-redis redis-cli SLOWLOG GET 10
```

### Data Inconsistencies
```bash
# Verify data integrity
docker exec ketone-redis redis-cli DBSIZE

# Check for orphaned keys
docker exec ketone-redis redis-cli KEYS "user:*:active" | \
  while read key; do
    CYCLE_ID=$(docker exec ketone-redis redis-cli GET "$key")
    EXISTS=$(docker exec ketone-redis redis-cli EXISTS "cycle:$CYCLE_ID")
    if [ "$EXISTS" -eq 0 ]; then
      echo "Orphaned active reference: $key -> $CYCLE_ID"
    fi
  done
```

---

## Best Practices

### DO ✅
- Use `SCAN` instead of `KEYS` in production for large datasets
- Always test destructive commands on a backup first
- Monitor memory usage regularly
- Use TTL for temporary data
- Use transactions (MULTI/EXEC) for atomic operations

### DON'T ❌
- Don't use `KEYS *` in production (blocks the server)
- Don't run `FLUSHDB` or `FLUSHALL` without confirmation
- Don't store large objects in Redis without compression
- Don't forget to backup before bulk operations
- Don't use Redis as primary storage without AOF/RDB enabled

---

## Additional Resources

- [Redis Commands Documentation](https://redis.io/commands)
- [Redis Data Types](https://redis.io/docs/data-types/)
- [Redis Persistence](https://redis.io/docs/management/persistence/)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)

---

## Quick Reference Card

| Command | Description |
|---------|-------------|
| `DBSIZE` | Total keys in database |
| `KEYS pattern` | Find keys by pattern |
| `SCAN cursor` | Iterate keys safely |
| `GET key` | Get string value |
| `SET key value` | Set string value |
| `HGETALL key` | Get all hash fields |
| `HGET key field` | Get hash field |
| `HSET key field value` | Set hash field |
| `ZREVRANGE key start stop` | Get sorted set members (desc) |
| `ZCARD key` | Count sorted set members |
| `DEL key` | Delete key |
| `EXISTS key` | Check if key exists |
| `INFO` | Server information |
| `MONITOR` | Real-time command monitor |
| `PING` | Test connection |
