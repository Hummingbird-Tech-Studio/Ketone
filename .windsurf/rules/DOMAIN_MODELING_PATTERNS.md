# Domain Modeling Patterns with Effect Schema

Universal patterns for domain modeling using Effect Schema in TypeScript applications.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [File Organization](#file-organization)
3. [Constants](#constants)
4. [Enums](#enums)
5. [Schema Patterns](#schema-patterns)
6. [Domain Types](#domain-types)
7. [Wire Format Separation](#wire-format-separation)
8. [Conversion Functions](#conversion-functions)
9. [Tagged Classes](#tagged-classes)
10. [Helper Functions](#helper-functions)

---

## Core Principles

### Parse, Don't Validate

Transform unknown data into validated domain types using schemas:

```typescript
// ❌ Bad: Manual validation
function validateUser(data: any): boolean {
  return typeof data.email === "string" && data.email.includes("@");
}

// ✅ Good: Parse with schema
const UserSchema = S.Struct({ email: EmailSchema });
const parseUser = (data: unknown) => S.decodeUnknown(UserSchema)(data);
```

### Type Safety First

Use branded types to prevent type confusion:

```typescript
// ❌ Bad: Can mix up user IDs and product IDs
type UserId = string;
type ProductId = string;

// ✅ Good: Branded types prevent mixing
const UserIdSchema = S.String.pipe(S.brand("UserId"));
const ProductIdSchema = S.String.pipe(S.brand("ProductId"));
```

### Fail Fast at Boundaries

Validate data when entering your system (API, database, user input):

```
External System → Wire Format → Parse/Validate → Domain Type → Business Logic
                                      ↑
                              Fail here if invalid
```

---

## File Organization

### Standard Structure

```
src/domain/
├── [entity]/
│   └── index.ts          # All domain models for this entity
└── shared/
    └── index.ts          # Shared domain types
```

### Domain File Template

```typescript
// 1. Imports
import { Effect } from 'effect';
import * as ParseResult from 'effect/ParseResult';
import * as S from 'effect/Schema';

// 2. Constants
export const VALIDATION_RULES = { ... } as const;

// 3. Enums
export enum Status { ... }

// 4. Primitive Schemas (Branded Types)
export const BrandedSchema = S.Type.pipe(..., S.brand('Name'));

// 5. Composable Schemas
const BaseSchema = S.Struct({ ... });

// 6. Domain Schemas
export const EntitySchema = S.Struct({ ... });

// 7. Input Schemas
export const CreateEntitySchema = S.Struct({ ... });

// 8. Domain Types
export type Entity = S.Schema.Type<typeof EntitySchema>;

// 9. Wire Format Types (if applicable)
export type WireEntity = { ... };

// 10. Conversion Functions
export const parseFromWire = (wire: WireEntity) => { ... };

// 11. Tagged Classes (optional)
export class ValueObject extends S.TaggedClass<T>()(...) { ... }

// 12. Helper Functions
export const helperFunction = (input: Type) => { ... };
```

---

## Constants

### Purpose

Define validation boundaries and business rules in one place.

### Pattern

```typescript
export const CONSTANT_NAME = {
  PROPERTY: value,
} as const;
```

### Example

```typescript
export const USERNAME_RULES = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 20,
  PATTERN: /^[a-zA-Z0-9_]+$/,
} as const;

export const PASSWORD_RULES = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_NUMBER: true,
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;
```

### Rules

- Use `SCREAMING_SNAKE_CASE` for constant names
- Always add `as const` for type inference
- Group related constants in objects
- Export for reuse in validation and UI

---

## Enums

### Purpose

Represent finite sets of known values.

### Pattern

```typescript
export enum EnumName {
  Value1 = "value1",
  Value2 = "value2",
}

export const EnumNameSchema = S.Enums(EnumName);
```

### Example

```typescript
export enum OrderStatus {
  Pending = "pending",
  Processing = "processing",
  Shipped = "shipped",
  Delivered = "delivered",
  Cancelled = "cancelled",
}

export enum UserRole {
  Admin = "admin",
  User = "user",
  Guest = "guest",
}

// Create schema from enum
export const OrderStatusSchema = S.Enums(OrderStatus);
export const UserRoleSchema = S.Enums(UserRole);
```

### Rules

- Use `PascalCase` for enum names and keys
- Use `snake_case` for string values
- Always assign string values (not numeric)
- Create schemas with `S.Enums(EnumName)`

---

## Schema Patterns

### 1. Branded Types (Primitive Schemas)

Prevent mixing types with the same underlying structure.

```typescript
// Email
export const EmailSchema = S.String.pipe(
  S.trimmed(),
  S.maxLength(254),
  S.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  S.brand("Email"),
);

// Positive integer
export const PositiveIntSchema = S.Number.pipe(
  S.int(),
  S.positive(),
  S.brand("PositiveInt"),
);

// UUID
export const UuidSchema = S.String.pipe(
  S.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  S.brand("Uuid"),
);

// Timestamp (milliseconds since epoch)
export const TimestampSchema = S.Number.pipe(
  S.int(),
  S.positive(),
  S.brand("Timestamp"),
);

// Range-constrained number
export const AgeSchema = S.Number.pipe(
  S.int(),
  S.between(0, 150),
  S.brand("Age"),
);

// URL
export const UrlSchema = S.String.pipe(
  S.pattern(/^https?:\/\/.+/),
  S.brand("Url"),
);
```

### 2. Composable Schemas

Reusable schema fragments for composition.

```typescript
// Base entity fields
const EntityBaseSchema = S.Struct({
  id: UuidSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

// Soft delete fields
const SoftDeleteSchema = S.Struct({
  deletedAt: S.optional(TimestampSchema),
  isDeleted: S.Boolean,
});

// Audit fields
const AuditSchema = S.Struct({
  createdBy: UuidSchema,
  updatedBy: UuidSchema,
});

// Compose into entity
export const EntitySchema = S.Struct({
  ...EntityBaseSchema.fields,
  ...AuditSchema.fields,
  ...SoftDeleteSchema.fields,
  name: S.String,
  status: StatusSchema,
});
```

### 3. Domain Entity Schemas

Complete entity definitions.

```typescript
export const UserSchema = S.Struct({
  id: UuidSchema,
  email: EmailSchema,
  username: S.String.pipe(
    S.minLength(USERNAME_RULES.MIN_LENGTH),
    S.maxLength(USERNAME_RULES.MAX_LENGTH),
    S.pattern(USERNAME_RULES.PATTERN),
  ),
  role: UserRoleSchema,
  createdAt: TimestampSchema,
  isActive: S.Boolean,
});

export const OrderSchema = S.Struct({
  id: UuidSchema,
  userId: UuidSchema,
  items: S.Array(OrderItemSchema),
  total: S.Number.pipe(S.positive()),
  status: OrderStatusSchema,
  createdAt: TimestampSchema,
  shippedAt: S.optional(TimestampSchema),
});
```

### 4. Input Schemas (Commands)

Schemas for user input and mutations.

```typescript
// Create command
export const CreateUserSchema = S.Struct({
  email: EmailSchema,
  username: S.String.pipe(
    S.minLength(USERNAME_RULES.MIN_LENGTH),
    S.maxLength(USERNAME_RULES.MAX_LENGTH),
  ),
  password: S.String.pipe(S.minLength(PASSWORD_RULES.MIN_LENGTH)),
});

// Update command
export const UpdateUserSchema = S.Struct({
  username: S.optional(S.String),
  isActive: S.optional(S.Boolean),
});

// Cross-field validation
export const ChangePasswordSchema = S.Struct({
  currentPassword: S.String,
  newPassword: S.String.pipe(S.minLength(PASSWORD_RULES.MIN_LENGTH)),
  confirmPassword: S.String,
}).pipe(
  S.filter((data) => data.newPassword === data.confirmPassword, {
    message: () => "Passwords do not match",
  }),
  S.filter((data) => data.currentPassword !== data.newPassword, {
    message: () => "New password must be different",
  }),
);
```

### Schema Operations Reference

| Operation             | Purpose             | Example                               |
| --------------------- | ------------------- | ------------------------------------- |
| `S.int()`             | Integer validation  | `S.Number.pipe(S.int())`              |
| `S.positive()`        | Positive numbers    | `S.Number.pipe(S.positive())`         |
| `S.between(min, max)` | Range validation    | `S.Number.pipe(S.between(0, 100))`    |
| `S.minLength(n)`      | Min string length   | `S.String.pipe(S.minLength(3))`       |
| `S.maxLength(n)`      | Max string length   | `S.String.pipe(S.maxLength(50))`      |
| `S.pattern(regex)`    | Regex validation    | `S.String.pipe(S.pattern(/^[A-Z]/))`  |
| `S.trimmed()`         | Trim whitespace     | `S.String.pipe(S.trimmed())`          |
| `S.optional(schema)`  | Optional field      | `S.optional(S.String)`                |
| `S.Array(schema)`     | Array of type       | `S.Array(S.String)`                   |
| `S.filter(fn, opts)`  | Custom validation   | `S.filter((x) => x > 0, { message })` |
| `S.brand('Name')`     | Create branded type | Always last in pipe                   |

---

## Domain Types

Extract TypeScript types from schemas.

### Pattern

```typescript
export type TypeName = S.Schema.Type<typeof TypeNameSchema>;
```

### Example

```typescript
// Extract domain types
export type Email = S.Schema.Type<typeof EmailSchema>;
export type Uuid = S.Schema.Type<typeof UuidSchema>;
export type Timestamp = S.Schema.Type<typeof TimestampSchema>;
export type User = S.Schema.Type<typeof UserSchema>;
export type Order = S.Schema.Type<typeof OrderSchema>;
export type CreateUser = S.Schema.Type<typeof CreateUserSchema>;
export type UpdateUser = S.Schema.Type<typeof UpdateUserSchema>;
```

### Rules

- Always use `S.Schema.Type<typeof Schema>`
- Export all domain types
- Name types without `Schema` suffix
- Group type exports together

---

## Wire Format Separation

Keep external data formats separate from domain types.

### Pattern

```typescript
// Wire format (from API/Database)
export type WireEntity = {
  id: string;
  created_at: string; // ISO string
  is_active: boolean; // snake_case
};

// Domain type
export type Entity = {
  id: Uuid;
  createdAt: Timestamp; // milliseconds
  isActive: boolean; // camelCase
};
```

### Example

```typescript
// Database wire format
export type DbUser = {
  id: string;
  email: string;
  created_at: string; // ISO date string
  updated_at: string;
  role: string;
};

// API wire format
export type ApiUser = {
  id: string;
  email: string;
  createdAt: number; // Unix timestamp in seconds
  updatedAt: number;
  role: "admin" | "user";
};

// Domain format
export type User = {
  id: Uuid;
  email: Email;
  createdAt: Timestamp; // Milliseconds
  updatedAt: Timestamp;
  role: UserRole; // Enum
};
```

### Rules

- Prefix wire types with source: `Db`, `Api`, `Wire`
- Keep wire and domain types separate
- Convert at boundaries (see Conversion Functions)
- Never use wire types in business logic

---

## Conversion Functions

Transform wire format to validated domain types.

### Pattern

```typescript
export const parseFromWire = (
  wireData: WireType,
): Effect.Effect<DomainType, ParseResult.ParseError> => {
  return S.decodeUnknown(DomainSchema)(wireData);
};
```

### Examples

#### Simple Parsing

```typescript
export const parseUser = (
  wire: WireUser,
): Effect.Effect<User, ParseResult.ParseError> => {
  return S.decodeUnknown(UserSchema)(wire);
};
```

#### With Transformation

```typescript
export const parseUserFromDb = (
  dbUser: DbUser,
): Effect.Effect<User, ParseResult.ParseError> => {
  // Transform wire format to match domain schema
  const transformed = {
    id: dbUser.id,
    email: dbUser.email,
    createdAt: new Date(dbUser.created_at).getTime(), // ISO → timestamp
    updatedAt: new Date(dbUser.updated_at).getTime(),
    role: dbUser.role,
  };

  return S.decodeUnknown(UserSchema)(transformed);
};
```

#### Handling Nulls

```typescript
export const parseOptionalEmail = (wire: {
  email?: string | null;
}): Effect.Effect<Email | null, ParseResult.ParseError> => {
  if (!wire.email) {
    return Effect.succeed(null);
  }
  return S.decodeUnknown(EmailSchema)(wire.email);
};
```

#### Multiple Sources

```typescript
export const parseUserFromApi = (
  apiUser: ApiUser,
): Effect.Effect<User, ParseResult.ParseError> => {
  const transformed = {
    ...apiUser,
    createdAt: apiUser.createdAt * 1000, // seconds → milliseconds
    updatedAt: apiUser.updatedAt * 1000,
  };

  return S.decodeUnknown(UserSchema)(transformed);
};
```

### Conversion Helpers

```typescript
// Domain → Wire (for API responses)
export const toWireUser = (user: User): ApiUser => ({
  id: user.id,
  email: user.email,
  createdAt: Math.floor(user.createdAt / 1000), // milliseconds → seconds
  updatedAt: Math.floor(user.updatedAt / 1000),
  role: user.role,
});

// Command → Update payload
export const toUpdatePayload = (command: UpdateUser) => ({
  username: command.username,
  is_active: command.isActive,
  updated_at: new Date().toISOString(),
});
```

---

## Tagged Classes

Domain objects with behavior (Value Objects, Entities).

### Pattern

```typescript
export class ClassName extends S.TaggedClass<ClassName>()('ClassName', {
  field1: Schema1,
  field2: Schema2,
}) {
  static factoryMethod(input: Type): ClassName {
    return new ClassName({ ... });
  }

  instanceMethod(): ReturnType {
    return this.field1 + this.field2;
  }
}
```

### Example: Money Value Object

```typescript
export class Money extends S.TaggedClass<Money>()("Money", {
  amount: S.Number.pipe(S.positive()),
  currency: S.Literal("USD", "EUR", "GBP"),
}) {
  static fromCents(cents: number, currency: "USD" | "EUR" | "GBP"): Money {
    return new Money({
      amount: cents / 100,
      currency,
    });
  }

  static zero(currency: "USD" | "EUR" | "GBP"): Money {
    return new Money({ amount: 0, currency });
  }

  toCents(): number {
    return Math.round(this.amount * 100);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error("Cannot add different currencies");
    }
    return new Money({
      amount: this.amount + other.amount,
      currency: this.currency,
    });
  }

  format(): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: this.currency,
    }).format(this.amount);
  }
}
```

### Example: Date Range Value Object

```typescript
export class DateRange extends S.TaggedClass<DateRange>()("DateRange", {
  start: TimestampSchema,
  end: TimestampSchema,
}) {
  static create(start: number, end: number): DateRange {
    if (start >= end) {
      throw new Error("Start must be before end");
    }
    return new DateRange({ start, end });
  }

  static fromDates(start: Date, end: Date): DateRange {
    return DateRange.create(start.getTime(), end.getTime());
  }

  duration(): number {
    return this.end - this.start;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.start && timestamp <= this.end;
  }

  overlaps(other: DateRange): boolean {
    return this.start <= other.end && other.start <= this.end;
  }
}
```

### Pattern Matching Tagged Classes

```typescript
import { Match } from "effect";

type Payment = CreditCard | PayPal | BankTransfer;

const processPayment = (payment: Payment): string =>
  Match.value(payment).pipe(
    Match.tag("CreditCard", (cc) => `Processing card: ${cc.last4}`),
    Match.tag("PayPal", (pp) => `Processing PayPal: ${pp.email}`),
    Match.tag(
      "BankTransfer",
      (bt) => `Processing transfer: ${bt.accountNumber}`,
    ),
    Match.exhaustive,
  );
```

---

## Helper Functions

Pure utility functions for domain logic.

### Pattern

```typescript
/**
 * JSDoc description
 */
export const functionName = (param: Type): ReturnType => {
  // Pure implementation
};
```

### Examples

```typescript
/**
 * Calculate password strength score (0-100)
 */
export const calculatePasswordStrength = (password: string): number => {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (password.length >= 12) score += 25;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[a-z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^A-Za-z0-9]/.test(password)) score += 10;
  return Math.min(score, 100);
};

/**
 * Mask email for display: "user@example.com" → "u***@example.com"
 */
export const maskEmail = (email: Email): string => {
  const [local, domain] = email.split("@");
  const masked = local[0] + "***";
  return `${masked}@${domain}`;
};

/**
 * Check if date range is in the past
 */
export const isInPast = (range: DateRange): boolean => {
  return range.end < Date.now();
};

/**
 * Format duration in milliseconds to human readable
 */
export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};
```

### Rules

- Keep pure (no side effects)
- Add JSDoc comments
- Use domain types as parameters
- Single responsibility
- Export for reuse

---

## Complete Example: Product Domain

```typescript
import { Effect } from "effect";
import * as ParseResult from "effect/ParseResult";
import * as S from "effect/Schema";

// ============================================================================
// Constants
// ============================================================================
export const PRODUCT_RULES = {
  NAME_MIN_LENGTH: 3,
  NAME_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 500,
  MIN_PRICE: 0.01,
  MAX_PRICE: 999999.99,
} as const;

export const INVENTORY_RULES = {
  MIN_STOCK: 0,
  LOW_STOCK_THRESHOLD: 10,
} as const;

// ============================================================================
// Enums
// ============================================================================
export enum ProductCategory {
  Electronics = "electronics",
  Clothing = "clothing",
  Books = "books",
  Food = "food",
}

export enum ProductStatus {
  Active = "active",
  Inactive = "inactive",
  OutOfStock = "out_of_stock",
  Discontinued = "discontinued",
}

// ============================================================================
// Primitive Schemas
// ============================================================================
export const ProductIdSchema = S.String.pipe(
  S.pattern(/^PRD-[0-9A-Z]{8}$/),
  S.brand("ProductId"),
);

export const SkuSchema = S.String.pipe(
  S.pattern(/^SKU-[0-9A-Z]{6}$/),
  S.brand("Sku"),
);

export const PriceSchema = S.Number.pipe(
  S.between(PRODUCT_RULES.MIN_PRICE, PRODUCT_RULES.MAX_PRICE),
  S.brand("Price"),
);

export const StockSchema = S.Number.pipe(
  S.int(),
  S.between(INVENTORY_RULES.MIN_STOCK, Number.MAX_SAFE_INTEGER),
  S.brand("Stock"),
);

export const ProductCategorySchema = S.Enums(ProductCategory);
export const ProductStatusSchema = S.Enums(ProductStatus);

// ============================================================================
// Domain Schemas
// ============================================================================
export const ProductSchema = S.Struct({
  id: ProductIdSchema,
  sku: SkuSchema,
  name: S.String.pipe(
    S.minLength(PRODUCT_RULES.NAME_MIN_LENGTH),
    S.maxLength(PRODUCT_RULES.NAME_MAX_LENGTH),
  ),
  description: S.optional(
    S.String.pipe(S.maxLength(PRODUCT_RULES.DESCRIPTION_MAX_LENGTH)),
  ),
  price: PriceSchema,
  category: ProductCategorySchema,
  status: ProductStatusSchema,
  stock: StockSchema,
  createdAt: S.Number.pipe(S.int(), S.positive()),
  updatedAt: S.Number.pipe(S.int(), S.positive()),
});

export const CreateProductSchema = S.Struct({
  name: S.String.pipe(
    S.minLength(PRODUCT_RULES.NAME_MIN_LENGTH),
    S.maxLength(PRODUCT_RULES.NAME_MAX_LENGTH),
  ),
  description: S.optional(S.String),
  price: PriceSchema,
  category: ProductCategorySchema,
  stock: StockSchema,
});

export const UpdateProductSchema = S.Struct({
  name: S.optional(S.String),
  description: S.optional(S.String),
  price: S.optional(PriceSchema),
  status: S.optional(ProductStatusSchema),
  stock: S.optional(StockSchema),
});

// ============================================================================
// Domain Types
// ============================================================================
export type ProductId = S.Schema.Type<typeof ProductIdSchema>;
export type Sku = S.Schema.Type<typeof SkuSchema>;
export type Price = S.Schema.Type<typeof PriceSchema>;
export type Stock = S.Schema.Type<typeof StockSchema>;
export type Product = S.Schema.Type<typeof ProductSchema>;
export type CreateProduct = S.Schema.Type<typeof CreateProductSchema>;
export type UpdateProduct = S.Schema.Type<typeof UpdateProductSchema>;

// ============================================================================
// Wire Format Types
// ============================================================================
export type DbProduct = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  status: string;
  stock: number;
  created_at: string;
  updated_at: string;
};

// ============================================================================
// Conversion Functions
// ============================================================================
export const parseProductFromDb = (
  dbProduct: DbProduct,
): Effect.Effect<Product, ParseResult.ParseError> => {
  const transformed = {
    id: dbProduct.id,
    sku: dbProduct.sku,
    name: dbProduct.name,
    description: dbProduct.description ?? undefined,
    price: dbProduct.price,
    category: dbProduct.category,
    status: dbProduct.status,
    stock: dbProduct.stock,
    createdAt: new Date(dbProduct.created_at).getTime(),
    updatedAt: new Date(dbProduct.updated_at).getTime(),
  };

  return S.decodeUnknown(ProductSchema)(transformed);
};

export const toDbProduct = (product: Product): Partial<DbProduct> => ({
  id: product.id,
  sku: product.sku,
  name: product.name,
  description: product.description ?? null,
  price: product.price,
  category: product.category,
  status: product.status,
  stock: product.stock,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if product is low on stock
 */
export const isLowStock = (product: Product): boolean => {
  return product.stock <= INVENTORY_RULES.LOW_STOCK_THRESHOLD;
};

/**
 * Check if product is available for purchase
 */
export const isAvailable = (product: Product): boolean => {
  return product.status === ProductStatus.Active && product.stock > 0;
};

/**
 * Format price for display
 */
export const formatPrice = (price: Price): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
};

/**
 * Calculate discounted price
 */
export const applyDiscount = (price: Price, discountPercent: number): Price => {
  const discounted = price * (1 - discountPercent / 100);
  return PriceSchema.make(Math.max(PRODUCT_RULES.MIN_PRICE, discounted));
};
```

---

## Best Practices Summary

### ✅ Do

1. **Use branded types** for all domain primitives
2. **Separate wire and domain types** completely
3. **Parse at boundaries** with `S.decodeUnknown()`
4. **Use constants** for validation rules
5. **Compose schemas** to reduce duplication
6. **Add JSDoc comments** for public functions
7. **Keep helpers pure** - no side effects
8. **Use `S.optional()`** not `| undefined`
9. **Export all domain types** for use in other layers
10. **Validate with schemas** not manual checks

### ❌ Don't

1. **Don't skip branding** - always use `S.brand()`
2. **Don't mix domain and wire types** in business logic
3. **Don't use `any` or `unknown`** in domain types
4. **Don't validate manually** - use schemas
5. **Don't hardcode rules** - use constants
6. **Don't use numeric enums** - use string enums
7. **Don't nest schemas deeply** - use composition
8. **Don't skip conversion functions** - transform at boundaries
9. **Don't put side effects** in helpers
10. **Don't expose internal schemas** unless needed

---

## Related Patterns

- **Service Layer**: How to use these domain types in services
- **Repository Pattern**: Converting wire format to domain at data access layer
- **Actor/State Machine**: Using domain types in state management
- **API Layer**: Transforming domain types to API responses
