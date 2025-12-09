# Rate Limiting Business Rules

This document describes the business rules for rate limiting services implemented in the authentication API.

## Protection Summary

| Endpoint | Service | Tracking | Limit | Lockout | Delays |
|----------|---------|----------|-------|---------|--------|
| `POST /auth/login` | `LoginAttemptCache` | Email + IP | 5 attempts | 15 min | Progressive |
| `POST /auth/signup` | `SignupIpRateLimitService` | IP | 5/hour | 1 hour | No |
| `POST /auth/forgot-password` | `PasswordResetIpRateLimitService` | IP | 5/hour | 1 hour | No |
| `POST /auth/reset-password` | `PasswordResetIpRateLimitService` | IP | 5/hour | 1 hour | No |
| `PUT /user-account/password` | `PasswordAttemptCache` | UserId + IP | 3 attempts | 15 min | Progressive |

---

## 1. Login Rate Limiting

### Service: `LoginAttemptCache`

Protects the login endpoint against brute force attacks.

### Behavior

- **Dual tracking**: Tracked by **email** and **IP** independently
- **Limit**: 5 failed attempts before lockout
- **Lockout**: 15 minutes
- **Progressive delays**: Incremental delays applied between failed attempts

### Progressive Delays

| Attempt | Delay before response |
|---------|----------------------|
| 1 | 0 seconds |
| 2 | 2 seconds |
| 3 | 5 seconds |
| 4 | 10 seconds |
| 5 | 15 seconds |
| 6+ | Blocked (429) |

### Flow

```
User attempts login
    ├── Check rate limit (email + IP)
    │   └── If blocked → Return 429 with retryAfter
    ├── Verify credentials
    │   ├── If valid → Reset counter, return token
    │   └── If invalid:
    │       ├── Increment counter
    │       ├── Apply progressive delay
    │       └── Return 401
```

### Unlock

- **Automatic**: After 15 minutes of lockout
- **Manual**: Successful login resets the email counter (not IP)

### Constants

```typescript
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 900 // 15 minutes
LOGIN_ATTEMPT_DELAYS_SECONDS = [0, 2, 5, 10, 15]
```

---

## 2. Signup Rate Limiting

### Service: `SignupIpRateLimitService`

Protects against mass account creation from a single IP.

### Behavior

- **Tracking**: By **IP** only
- **Limit**: 5 signups per IP per hour
- **Window**: 1 hour (sliding window)
- **No delays**: Immediate response

### Flow

```
User attempts signup
    ├── Check rate limit (IP)
    │   └── If exceeded → Return 429
    ├── Increment counter
    └── Process registration
```

### Unlock

- **Automatic**: Window expires 1 hour after the first attempt

### Constants

```typescript
SIGNUP_IP_LIMIT = 5
SIGNUP_IP_WINDOW_SECONDS = 3600 // 1 hour
```

---

## 3. Password Recovery Rate Limiting

### Service: `PasswordResetIpRateLimitService`

**IMPORTANT**: This service is **shared** between two endpoints:
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Execute reset with token

### Behavior

- **Tracking**: By **IP** only
- **Limit**: 5 requests per IP per hour (combined across both endpoints)
- **Window**: 1 hour (sliding window)
- **No delays**: Immediate response

### Complete Password Recovery Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PASSWORD RECOVERY FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. POST /auth/forgot-password                                   │
│     ├── Check IP rate limit ←─┐                                  │
│     ├── Increment counter     │                                  │
│     └── Send email with token │  SHARE THE                       │
│                               │  SAME COUNTER                    │
│  2. POST /auth/reset-password │                                  │
│     ├── Check IP rate limit ←─┘                                  │
│     ├── Increment counter                                        │
│     ├── Validate token                                           │
│     └── Change password                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Shared Counter Implications

1. **Forgot-password requests consume from reset-password limit and vice versa**
   - If a user requests "forgot password" 5 times, they cannot do "reset password" until the window expires
   - This is intentional to prevent abuse of the complete flow

2. **Protection against token brute force**
   - Although tokens are cryptographically secure (256 bits), rate limiting prevents automated attempts
   - An attacker cannot try millions of tokens without being blocked

3. **Normal user flow**
   - Request forgot-password: 1 attempt
   - Click email link and reset: 1 attempt
   - Total: 2 attempts (3 remaining in the hour)

### Unlock

- **Automatic**: Window expires 1 hour after the first attempt

### Constants

```typescript
PASSWORD_RESET_IP_LIMIT = 5
PASSWORD_RESET_IP_WINDOW_SECONDS = 3600 // 1 hour
```

---

## 4. Password Change Rate Limiting

### Service: `PasswordAttemptCache`

Protects the password change endpoint (authenticated user) against attempts to guess the current password.

### Behavior

- **Dual tracking**: Tracked by **userId** and **IP** independently
- **Limit**: 3 failed attempts before lockout
- **Lockout**: 15 minutes
- **Progressive delays**: Incremental delays applied between failed attempts

### Progressive Delays

| Attempt | Delay before response |
|---------|----------------------|
| 1 | 0 seconds |
| 2 | 5 seconds |
| 3 | 10 seconds |
| 4+ | Blocked (429) |

### Flow

```
Authenticated user attempts to change password
    ├── Check rate limit (userId + IP)
    │   └── If blocked → Return 429 with retryAfter
    ├── Verify current password
    │   ├── If valid → Reset counter, change password
    │   └── If invalid:
    │       ├── Increment counter
    │       ├── Apply progressive delay
    │       └── Return 401
```

### Unlock

- **Automatic**: After 15 minutes of lockout
- **Manual**: Successful password verification resets the counter

### Constants

```typescript
MAX_PASSWORD_ATTEMPTS = 3
LOCKOUT_DURATION_SECONDS = 900 // 15 minutes
ATTEMPT_DELAYS_SECONDS = [0, 5, 10]
```

---

## Environment Configuration

### IP Rate Limiting

IP rate limiting is **only active in production**:

```typescript
const ENABLE_IP_RATE_LIMITING = Bun.env.NODE_ENV === 'production';
```

In development and tests, IP rate limiting is disabled to facilitate testing.

**Note**: Rate limiting by email/userId is always active in all environments.

---

## HTTP Responses

### When limit is reached

All endpoints return **HTTP 429 Too Many Requests** when rate limit is exceeded.

```json
{
  "_tag": "LoginRateLimitError",
  "message": "Too many failed login attempts. Please try again later.",
  "retryAfter": 847
}
```

The `retryAfter` field indicates remaining seconds of lockout (only for login and password change).

---

## Architecture

### Storage

All services use **Effect Cache** in memory:
- Capacity: 10,000 entries per cache
- TTL: 1 hour (automatically cleaned)

### Scalability Considerations

Current rate limiting is **per instance**. In a multi-instance environment:
- Each instance has its own cache
- An attacker could distribute attacks across instances
- For production with multiple instances, consider Redis or another centralized solution
