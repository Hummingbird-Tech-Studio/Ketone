import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { SqlClient } from '@effect/sql';
import { Effect, Option, Schema as S } from 'effect';
import { planTemplatesTable, templatePeriodsTable } from '../../../db';
import { PlanTemplateRepositoryError } from './errors';
import type { PlanTemplate } from '../domain';
import { PlanTemplateRecordSchema, TemplatePeriodRecordSchema } from './schemas';
import { decodePlanTemplate, decodePlanTemplateWithPeriods } from './mappers';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { IPlanTemplateRepository } from './plan-template.repository.interface';

export class PlanTemplateRepositoryPostgres extends Effect.Service<PlanTemplateRepositoryPostgres>()(
  'PlanTemplateRepository',
  {
    effect: Effect.gen(function* () {
      const drizzle = yield* PgDrizzle.PgDrizzle;
      const sqlClient = yield* SqlClient.SqlClient;

      /**
       * Helper: Decode a single DB row into Option<PlanTemplate>.
       * Returns None if results array is empty, Some(PlanTemplate) otherwise.
       */
      const decodeTemplateOption = (
        results: unknown[],
      ): Effect.Effect<Option.Option<PlanTemplate>, PlanTemplateRepositoryError> =>
        Effect.gen(function* () {
          if (results.length === 0) {
            return Option.none();
          }

          const record = yield* S.decodeUnknown(PlanTemplateRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new PlanTemplateRepositoryError({
                  message: 'Failed to validate plan template record from database',
                  cause: error,
                }),
            ),
          );
          const template = yield* decodePlanTemplate(record);

          return Option.some(template);
        });

      const repository: IPlanTemplateRepository = {
        createPlanTemplate: (
          userId: string,
          name: string,
          description: string | null,
          periods: ReadonlyArray<{ order: number; fastingDuration: number; eatingWindow: number }>,
        ) =>
          sqlClient
            .withTransaction(
              Effect.gen(function* () {
                // 1. Insert the plan template
                const [templateResult] = yield* drizzle
                  .insert(planTemplatesTable)
                  .values({
                    userId,
                    name,
                    description,
                    periodCount: periods.length,
                  })
                  .returning()
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new PlanTemplateRepositoryError({
                          message: 'Failed to create plan template in database',
                          cause: error,
                        }),
                    ),
                  );

                const templateRecord = yield* S.decodeUnknown(PlanTemplateRecordSchema)(templateResult).pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanTemplateRepositoryError({
                        message: 'Failed to validate plan template record from database',
                        cause: error,
                      }),
                  ),
                );

                // 2. Insert all period configurations
                const periodValues = periods.map((period) => ({
                  planTemplateId: templateRecord.id,
                  order: period.order,
                  fastingDuration: String(period.fastingDuration),
                  eatingWindow: String(period.eatingWindow),
                }));

                const periodResults = yield* drizzle
                  .insert(templatePeriodsTable)
                  .values(periodValues)
                  .returning()
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new PlanTemplateRepositoryError({
                          message: 'Failed to create template periods in database',
                          cause: error,
                        }),
                    ),
                  );

                const periodRecords = yield* Effect.all(
                  periodResults.map((result) =>
                    S.decodeUnknown(TemplatePeriodRecordSchema)(result).pipe(
                      Effect.mapError(
                        (error) =>
                          new PlanTemplateRepositoryError({
                            message: 'Failed to validate template period record from database',
                            cause: error,
                          }),
                      ),
                    ),
                  ),
                );

                return yield* decodePlanTemplateWithPeriods(
                  templateRecord,
                  periodRecords.sort((a, b) => a.order - b.order),
                );
              }),
            )
            .pipe(
              Effect.catchTag('SqlError', (error) =>
                Effect.fail(
                  new PlanTemplateRepositoryError({
                    message: 'Transaction failed during plan template creation',
                    cause: error,
                  }),
                ),
              ),
              Effect.tapError((error) => Effect.logError('Database error in createPlanTemplate', error)),
              Effect.annotateLogs({ repository: 'PlanTemplateRepository' }),
            ),

        getPlanTemplateById: (userId: string, planTemplateId: string) =>
          Effect.gen(function* () {
            const results = yield* drizzle
              .select()
              .from(planTemplatesTable)
              .where(and(eq(planTemplatesTable.id, planTemplateId), eq(planTemplatesTable.userId, userId)))
              .pipe(
                Effect.tapError((error) => Effect.logError('Database error in getPlanTemplateById', error)),
                Effect.mapError(
                  (error) =>
                    new PlanTemplateRepositoryError({
                      message: 'Failed to get plan template by ID from database',
                      cause: error,
                    }),
                ),
              );

            return yield* decodeTemplateOption(results);
          }).pipe(Effect.annotateLogs({ repository: 'PlanTemplateRepository' })),

        getPlanTemplateWithPeriods: (userId: string, planTemplateId: string) =>
          Effect.gen(function* () {
            const templateOption = yield* repository.getPlanTemplateById(userId, planTemplateId);

            if (Option.isNone(templateOption)) {
              return Option.none();
            }

            const template = templateOption.value;

            const periodResults = yield* drizzle
              .select()
              .from(templatePeriodsTable)
              .where(eq(templatePeriodsTable.planTemplateId, planTemplateId))
              .orderBy(asc(templatePeriodsTable.order))
              .pipe(
                Effect.mapError(
                  (error) =>
                    new PlanTemplateRepositoryError({
                      message: 'Failed to get template periods from database',
                      cause: error,
                    }),
                ),
              );

            const periodRecords = yield* Effect.all(
              periodResults.map((result) =>
                S.decodeUnknown(TemplatePeriodRecordSchema)(result).pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanTemplateRepositoryError({
                        message: 'Failed to validate template period record from database',
                        cause: error,
                      }),
                  ),
                ),
              ),
            );

            const aggregate = yield* decodePlanTemplateWithPeriods(template, periodRecords);

            return Option.some(aggregate);
          }).pipe(Effect.annotateLogs({ repository: 'PlanTemplateRepository' })),

        getAllPlanTemplates: (userId: string) =>
          Effect.gen(function* () {
            const results = yield* drizzle
              .select()
              .from(planTemplatesTable)
              .where(eq(planTemplatesTable.userId, userId))
              .orderBy(sql`COALESCE(${planTemplatesTable.lastUsedAt}, ${planTemplatesTable.updatedAt}) DESC`)
              .pipe(
                Effect.tapError((error) => Effect.logError('Database error in getAllPlanTemplates', error)),
                Effect.mapError(
                  (error) =>
                    new PlanTemplateRepositoryError({
                      message: 'Failed to get all plan templates from database',
                      cause: error,
                    }),
                ),
              );

            return yield* Effect.all(
              results.map((result) =>
                S.decodeUnknown(PlanTemplateRecordSchema)(result).pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanTemplateRepositoryError({
                        message: 'Failed to validate plan template record from database',
                        cause: error,
                      }),
                  ),
                  Effect.flatMap(decodePlanTemplate),
                ),
              ),
            );
          }).pipe(Effect.annotateLogs({ repository: 'PlanTemplateRepository' })),

        countPlanTemplates: (userId: string) =>
          Effect.gen(function* () {
            const results = yield* drizzle
              .select()
              .from(planTemplatesTable)
              .where(eq(planTemplatesTable.userId, userId))
              .pipe(
                Effect.tapError((error) => Effect.logError('Database error in countPlanTemplates', error)),
                Effect.mapError(
                  (error) =>
                    new PlanTemplateRepositoryError({
                      message: 'Failed to count plan templates in database',
                      cause: error,
                    }),
                ),
              );

            return results.length;
          }).pipe(Effect.annotateLogs({ repository: 'PlanTemplateRepository' })),

        updatePlanTemplate: (
          userId: string,
          planTemplateId: string,
          updates: { name?: string; description?: string | null },
          periods?: ReadonlyArray<{ order: number; fastingDuration: number; eatingWindow: number }>,
          now?: Date,
        ) =>
          sqlClient
            .withTransaction(
              Effect.gen(function* () {
                // 1. Build the update set
                const updateSet: Record<string, unknown> = { updatedAt: now };
                if (updates.name !== undefined) updateSet.name = updates.name;
                if (updates.description !== undefined) updateSet.description = updates.description;

                // If periods are being replaced, update periodCount
                if (periods !== undefined) {
                  updateSet.periodCount = periods.length;
                }

                // 2. Update the template
                const updatedTemplates = yield* drizzle
                  .update(planTemplatesTable)
                  .set(updateSet)
                  .where(and(eq(planTemplatesTable.id, planTemplateId), eq(planTemplatesTable.userId, userId)))
                  .returning()
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new PlanTemplateRepositoryError({
                          message: 'Failed to update plan template in database',
                          cause: error,
                        }),
                    ),
                  );

                if (updatedTemplates.length === 0) {
                  return yield* Effect.fail(
                    new PlanTemplateRepositoryError({
                      message: `Plan template ${planTemplateId} not found during update`,
                    }),
                  );
                }

                const templateRecord = yield* S.decodeUnknown(PlanTemplateRecordSchema)(updatedTemplates[0]).pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanTemplateRepositoryError({
                        message: 'Failed to validate plan template record from database',
                        cause: error,
                      }),
                  ),
                );

                // 3. If periods are being replaced, delete old and insert new
                if (periods !== undefined) {
                  yield* drizzle
                    .delete(templatePeriodsTable)
                    .where(eq(templatePeriodsTable.planTemplateId, planTemplateId))
                    .pipe(
                      Effect.mapError(
                        (error) =>
                          new PlanTemplateRepositoryError({
                            message: 'Failed to delete existing template periods',
                            cause: error,
                          }),
                      ),
                    );

                  const periodValues = periods.map((period) => ({
                    planTemplateId,
                    order: period.order,
                    fastingDuration: String(period.fastingDuration),
                    eatingWindow: String(period.eatingWindow),
                  }));

                  yield* drizzle
                    .insert(templatePeriodsTable)
                    .values(periodValues)
                    .pipe(
                      Effect.mapError(
                        (error) =>
                          new PlanTemplateRepositoryError({
                            message: 'Failed to insert new template periods',
                            cause: error,
                          }),
                      ),
                    );
                }

                // 4. Re-fetch periods and return aggregate
                const periodResults = yield* drizzle
                  .select()
                  .from(templatePeriodsTable)
                  .where(eq(templatePeriodsTable.planTemplateId, planTemplateId))
                  .orderBy(asc(templatePeriodsTable.order))
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new PlanTemplateRepositoryError({
                          message: 'Failed to get updated template periods from database',
                          cause: error,
                        }),
                    ),
                  );

                const periodRecords = yield* Effect.all(
                  periodResults.map((result) =>
                    S.decodeUnknown(TemplatePeriodRecordSchema)(result).pipe(
                      Effect.mapError(
                        (error) =>
                          new PlanTemplateRepositoryError({
                            message: 'Failed to validate template period record from database',
                            cause: error,
                          }),
                      ),
                    ),
                  ),
                );

                return yield* decodePlanTemplateWithPeriods(templateRecord, periodRecords);
              }),
            )
            .pipe(
              Effect.catchTag('SqlError', (error) =>
                Effect.fail(
                  new PlanTemplateRepositoryError({
                    message: 'Transaction failed during plan template update',
                    cause: error,
                  }),
                ),
              ),
              Effect.tapError((error) => Effect.logError('Database error in updatePlanTemplate', error)),
              Effect.annotateLogs({ repository: 'PlanTemplateRepository' }),
            ),

        deletePlanTemplate: (userId: string, planTemplateId: string) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(`Deleting plan template ${planTemplateId}`);

            // Cascade delete handles template_periods
            yield* drizzle
              .delete(planTemplatesTable)
              .where(and(eq(planTemplatesTable.id, planTemplateId), eq(planTemplatesTable.userId, userId)))
              .pipe(
                Effect.tapError((error) => Effect.logError('Database error in deletePlanTemplate', error)),
                Effect.mapError(
                  (error) =>
                    new PlanTemplateRepositoryError({
                      message: 'Failed to delete plan template from database',
                      cause: error,
                    }),
                ),
              );
          }).pipe(Effect.annotateLogs({ repository: 'PlanTemplateRepository' })),

        touchLastUsedAt: (planTemplateId: string, now: Date) =>
          Effect.gen(function* () {
            yield* drizzle
              .update(planTemplatesTable)
              .set({ lastUsedAt: now })
              .where(eq(planTemplatesTable.id, planTemplateId))
              .pipe(
                Effect.tapError((error) => Effect.logError('Database error in touchLastUsedAt', error)),
                Effect.mapError(
                  (error) =>
                    new PlanTemplateRepositoryError({
                      message: 'Failed to update last_used_at for plan template',
                      cause: error,
                    }),
                ),
              );
          }).pipe(Effect.annotateLogs({ repository: 'PlanTemplateRepository' })),

        deleteAllByUserId: (userId: string) =>
          Effect.gen(function* () {
            yield* Effect.logInfo('Deleting all plan templates for user');

            // Cascade delete handles template_periods
            yield* drizzle
              .delete(planTemplatesTable)
              .where(eq(planTemplatesTable.userId, userId))
              .pipe(
                Effect.tapError((error) => Effect.logError('Database error in deleteAllByUserId', error)),
                Effect.mapError(
                  (error) =>
                    new PlanTemplateRepositoryError({
                      message: 'Failed to delete all plan templates for user from database',
                      cause: error,
                    }),
                ),
              );
          }).pipe(Effect.annotateLogs({ repository: 'PlanTemplateRepository' })),
      };

      return repository;
    }),
    dependencies: [],
    accessors: true,
  },
) {}
