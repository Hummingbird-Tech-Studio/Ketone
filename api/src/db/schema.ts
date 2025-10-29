import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Users table schema definition using Drizzle ORM
 * Stores user authentication credentials
 */
export const usersTable = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    passwordChangedAt: timestamp('password_changed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_users_email').on(table.email)],
);

/**
 * Cycles table schema definition using Drizzle ORM
 * Each actor (user) can have multiple cycles over time
 */
export const cyclesTable = pgTable(
  'cycles',
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: varchar('actor_id', { length: 255 }).notNull(),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_cycles_actor_id').on(table.actorId),
    index('idx_cycles_dates').on(table.startDate, table.endDate),
  ],
);

/**
 * Orleans Storage table schema definition using Drizzle ORM
 * This table is managed by Orleans for grain state persistence
 * We define it here for type-safe cleanup operations only
 *
 * IMPORTANT: Do NOT use Drizzle migrations to create/modify this table!
 * Orleans creates and manages this table structure.
 */
export const orleansStorageTable = pgTable(
  'orleansstorage',
  {
    grainIdHash: integer('grainidhash').notNull(),
    grainIdN0: bigint('grainidn0', { mode: 'bigint' }).notNull(),
    grainIdN1: bigint('grainidn1', { mode: 'bigint' }).notNull(),
    grainTypeHash: integer('graintypehash').notNull(),
    grainTypeString: varchar('graintypestring', { length: 512 }).notNull(),
    grainIdExtensionString: varchar('grainidextensionstring', { length: 512 }),
    serviceId: varchar('serviceid', { length: 150 }).notNull(),
    payloadBinary: varchar('payloadbinary'), // BYTEA in PostgreSQL
    modifiedOn: timestamp('modifiedon').notNull(),
    version: integer('version'),
  },
  (table) => [
    primaryKey({
      columns: [table.grainIdHash, table.grainTypeHash, table.grainIdN0, table.grainIdN1, table.serviceId],
    }),
    index('ix_orleansstorage').on(table.grainIdHash, table.grainTypeHash),
  ],
);

// Type inference from Drizzle schema
export type UserRow = typeof usersTable.$inferSelect;
export type UserInsert = typeof usersTable.$inferInsert;
export type CycleRow = typeof cyclesTable.$inferSelect;
export type CycleInsert = typeof cyclesTable.$inferInsert;
export type OrleansStorageRow = typeof orleansStorageTable.$inferSelect;
