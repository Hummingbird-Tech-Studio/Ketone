import { index, pgTable, pgEnum, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const cycleStatusEnum = pgEnum('cycle_status', ['InProgress', 'Completed']);

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
 */
export const cyclesTable = pgTable(
  'cycles',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => usersTable.id),
    status: cycleStatusEnum('status').notNull(),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_cycles_user_id').on(table.userId),
    index('idx_cycles_dates').on(table.startDate, table.endDate),
    index('idx_cycles_status').on(table.status),
  ],
);

// Type inference from Drizzle schema
export type UserRow = typeof usersTable.$inferSelect;
export type UserInsert = typeof usersTable.$inferInsert;
export type CycleRow = typeof cyclesTable.$inferSelect;
export type CycleInsert = typeof cyclesTable.$inferInsert;
