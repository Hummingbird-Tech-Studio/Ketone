import {
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const ONE_HOUR_MS = 3600000;

export const cycleStatusEnum = pgEnum('cycle_status', ['InProgress', 'Completed']);
export const genderEnum = pgEnum('gender', ['Male', 'Female', 'Prefer not to say']);
export const weightUnitEnum = pgEnum('weight_unit', ['kg', 'lbs']);
export const heightUnitEnum = pgEnum('height_unit', ['cm', 'ft_in']);
export const fastingFeelingEnum = pgEnum('fasting_feeling', [
  'energetic',
  'motivated',
  'calm',
  'normal',
  'hungry',
  'tired',
  'swollen',
  'anxious',
  'dizzy',
  'weak',
  'suffering',
  'irritable',
]);

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
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id),
    status: cycleStatusEnum('status').notNull(),
    startDate: timestamp('start_date', { mode: 'date', withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { mode: 'date', withTimezone: true }).notNull(),
    notes: varchar('notes', { length: 1000 }),
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

/**
 * Profiles table schema definition using Drizzle ORM
 * Stores user personal information (name, date of birth) and physical information
 */
export const profilesTable = pgTable(
  'profiles',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id),
    name: varchar('name', { length: 255 }),
    dateOfBirth: date('date_of_birth', { mode: 'date' }),
    // Physical information fields
    weight: numeric('weight', { precision: 5, scale: 2 }), // kg (30-300)
    height: numeric('height', { precision: 5, scale: 2 }), // cm (120-250)
    gender: genderEnum('gender'),
    weightUnit: weightUnitEnum('weight_unit'),
    heightUnit: heightUnitEnum('height_unit'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_profiles_user_id').on(table.userId),
    // CHECK constraints for physical info validation
    check('chk_weight_range', sql`${table.weight} IS NULL OR (${table.weight} >= 30 AND ${table.weight} <= 300)`),
    check('chk_height_range', sql`${table.height} IS NULL OR (${table.height} >= 120 AND ${table.height} <= 250)`),
  ],
);

/**
 * Password Reset Tokens table schema definition using Drizzle ORM
 * Stores hashed reset tokens with expiration timestamps
 */
export const passwordResetTokensTable = pgTable(
  'password_reset_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(), // SHA-256 hash
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { mode: 'date', withTimezone: true }), // null = unused
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_password_reset_tokens_user_id').on(table.userId),
    index('idx_password_reset_tokens_token_hash').on(table.tokenHash),
  ],
);

/**
 * Cycle Feelings table schema definition using Drizzle ORM
 * Stores feelings/emotions associated with fasting cycles (0 to MAX_FEELINGS_PER_CYCLE per cycle)
 */
export const cycleFeelingsTable = pgTable(
  'cycle_feelings',
  {
    id: uuid().primaryKey().defaultRandom(),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => cyclesTable.id, { onDelete: 'cascade' }),
    feeling: fastingFeelingEnum('feeling').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_cycle_feelings_unique').on(table.cycleId, table.feeling),
    index('idx_cycle_feelings_cycle_id').on(table.cycleId),
  ],
);

// Type inference from Drizzle schema
export type UserRow = typeof usersTable.$inferSelect;
export type UserInsert = typeof usersTable.$inferInsert;
export type CycleRow = typeof cyclesTable.$inferSelect;
export type CycleInsert = typeof cyclesTable.$inferInsert;
export type ProfileRow = typeof profilesTable.$inferSelect;
export type ProfileInsert = typeof profilesTable.$inferInsert;
export type PasswordResetTokenRow = typeof passwordResetTokensTable.$inferSelect;
export type PasswordResetTokenInsert = typeof passwordResetTokensTable.$inferInsert;
export type CycleFeelingRow = typeof cycleFeelingsTable.$inferSelect;
export type CycleFeelingInsert = typeof cycleFeelingsTable.$inferInsert;
