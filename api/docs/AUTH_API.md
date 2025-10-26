# Authentication API

## Overview

The Authentication API provides secure user registration and authentication functionality using industry best practices.

## Features

- **Secure Password Hashing**: Uses bcrypt with 10 salt rounds via Bun's built-in crypto
- **Email Validation**: Validates email format before registration
- **Password Requirements**: Minimum 8 characters, maximum 100 characters
- **Unique Email Constraint**: Database-level unique index prevents duplicate accounts
- **Effect-based Architecture**: Fully typed error handling and composable effects

## Endpoints

### POST /auth/signup

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Validation Rules:**
- Email must be valid format (contains @ and domain)
- Password must be 8-100 characters

**Success Response (200):**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "createdAt": "2024-10-26T15:40:00.000Z",
    "updatedAt": "2024-10-26T15:40:00.000Z"
  }
}
```

**Error Responses:**

- **400 Bad Request** - Invalid email or password format
```json
{
  "_tag": "ParseError",
  "message": "Invalid email format"
}
```

- **409 Conflict** - User already exists
```json
{
  "_tag": "UserAlreadyExistsError",
  "message": "User with this email already exists",
  "email": "user@example.com"
}
```

- **500 Internal Server Error** - Database or hashing error
```json
{
  "_tag": "UserRepositoryError",
  "message": "Failed to create user in database"
}
```

## Architecture

### Layers

```
API Layer (auth-api.ts, auth-api-handler.ts)
  ↓
Service Layer (auth.service.ts, password.service.ts)
  ↓
Repository Layer (user.repository.ts)
  ↓
Database Layer (schema.ts)
```

### Security Best Practices

1. **Password Hashing**: Never stores plain-text passwords
   - Uses bcrypt algorithm
   - 10 salt rounds for strong security
   - Implemented via Bun's native `Bun.password.hash()`

2. **Input Validation**: Schema-based validation at API boundary
   - Email format validation
   - Password length constraints
   - Type-safe request/response schemas

3. **Error Handling**: Typed errors prevent information leakage
   - Generic error messages for security
   - Detailed logging for debugging
   - Proper HTTP status codes

4. **Database Constraints**: 
   - Unique index on email column
   - UUID primary keys
   - Timestamps for audit trail

## Database Schema

```typescript
usersTable:
  - id: UUID (primary key, auto-generated)
  - email: VARCHAR(255) (unique, not null)
  - passwordHash: VARCHAR(255) (not null)
  - createdAt: TIMESTAMP (auto-generated)
  - updatedAt: TIMESTAMP (auto-generated)
```

## Usage Example

```bash
# Register a new user
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "mySecurePassword123"
  }'
```

## Database Migration

To apply the users table schema to your database:

```bash
# Generate migration files
bun run db:generate

# Apply migrations
bun run db:push
```

## Next Steps

Future authentication features to implement:
- Login endpoint with JWT token generation
- Password reset flow
- Email verification
- Session management
- OAuth integration
