import { check, index, pgTable, pgEnum, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const ONE_HOUR_MS = 3600000;

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
    passwordChangedAt: timestamp('password_changed_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
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
    startDate: timestamp('start_date', { mode: 'date', withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { mode: 'date', withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_cycles_user_id').on(table.userId),
    index('idx_cycles_dates').on(table.startDate, table.endDate),
    index('idx_cycles_status').on(table.status),
    // Partial unique index to prevent multiple InProgress cycles per user
    uniqueIndex('idx_cycles_user_active')
      .on(table.userId)
      .where(sql`${table.status} = 'InProgress'`),
    // CHECK constraint: end_date must be after start_date
    check('chk_cycles_valid_date_range', sql`${table.endDate} > ${table.startDate}`),
  ],
);

// Type inference from Drizzle schema
export type UserRow = typeof usersTable.$inferSelect;
export type UserInsert = typeof usersTable.$inferInsert;
export type CycleRow = typeof cyclesTable.$inferSelect;
export type CycleInsert = typeof cyclesTable.$inferInsert;
