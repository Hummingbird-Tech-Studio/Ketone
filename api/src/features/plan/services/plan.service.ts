import { DateTime, Effect, Option } from 'effect';
import { PlanRepository, PlanRepositoryError } from '../repositories';
import {
  type Plan,
  type PlanWithPeriods,
  PlanAlreadyActiveError,
  PlanNotFoundError,
  NoActivePlanError,
  PlanInvalidStateError,
  ActiveCycleExistsError,
  InvalidPeriodCountError,
  PeriodOverlapWithCycleError,
  PeriodNotInPlanError,
  DuplicatePeriodIdError,
  PeriodsNotCompletedError,
  PlanCreationDecision,
  PlanCancellationDecision,
  PlanCompletionDecision,
  PeriodUpdateDecision,
  PlanValidationService,
  PeriodCalculationService,
  PlanCancellationService,
  PlanCompletionService,
  PeriodUpdateService,
  PlanMetadataService,
} from '../domain';
import { type PeriodInput } from '../api';

export class PlanService extends Effect.Service<PlanService>()('PlanService', {
  effect: Effect.gen(function* () {
    const repository = yield* PlanRepository;
    const validationService = yield* PlanValidationService;
    const calculationService = yield* PeriodCalculationService;
    const cancellationService = yield* PlanCancellationService;
    const completionService = yield* PlanCompletionService;
    const periodUpdateService = yield* PeriodUpdateService;
    const metadataService = yield* PlanMetadataService;

    return {
      /**
       * Create a new plan with periods.
       *
       * Three Phases:
       *   Collection: repository.hasActivePlanOrCycle(userId)
       *   Logic:      decidePlanCreation(userId, activePlanId, activeCycleId)
       *   Persistence: calculatePeriodDates + repository.createPlan(...)
       */
      createPlan: (
        userId: string,
        startDate: Date,
        periods: PeriodInput[],
        name: string,
        description?: string,
      ): Effect.Effect<
        PlanWithPeriods,
        | PlanRepositoryError
        | PlanAlreadyActiveError
        | ActiveCycleExistsError
        | InvalidPeriodCountError
        | PeriodOverlapWithCycleError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Creating new plan');

          // Collection phase
          const { activePlanId, activeCycleId } = yield* repository.hasActivePlanOrCycle(userId);

          // Logic phase (pure decision)
          const creationDecision = validationService.decidePlanCreation({
            userId,
            activePlanId,
            activeCycleId,
            periodCount: periods.length,
          });

          yield* PlanCreationDecision.$match(creationDecision, {
            CanCreate: () => Effect.void,
            BlockedByActivePlan: () =>
              Effect.fail(new PlanAlreadyActiveError({ message: 'User already has an active plan', userId })),
            BlockedByActiveCycle: () =>
              Effect.fail(
                new ActiveCycleExistsError({
                  message: 'Cannot create plan while user has an active standalone cycle',
                  userId,
                }),
              ),
            InvalidPeriodCount: ({ periodCount, minPeriods, maxPeriods }) =>
              Effect.fail(
                new InvalidPeriodCountError({
                  message: `Plan must have between ${minPeriods} and ${maxPeriods} periods, got ${periodCount}`,
                  periodCount,
                  minPeriods,
                  maxPeriods,
                }),
              ),
          });

          const periodData = calculationService.calculatePeriodDates(startDate, periods);

          // Persistence phase
          const plan = yield* repository.createPlan(userId, startDate, periodData, name, description);

          yield* Effect.logInfo(`Plan created successfully with ID: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Get the active plan for a user with all periods.
       */
      getActivePlanWithPeriods: (
        userId: string,
      ): Effect.Effect<PlanWithPeriods, PlanRepositoryError | NoActivePlanError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Getting active plan with periods');

          const planOption = yield* repository.getActivePlanWithPeriods(userId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new NoActivePlanError({
                message: 'No active plan found',
                userId,
              }),
            );
          }

          yield* Effect.logInfo(`Active plan retrieved: ${planOption.value.id}`);

          return planOption.value;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Get a specific plan by ID with all periods.
       */
      getPlanWithPeriods: (
        userId: string,
        planId: string,
      ): Effect.Effect<PlanWithPeriods, PlanRepositoryError | PlanNotFoundError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Getting plan ${planId} with periods`);

          const planOption = yield* repository.getPlanWithPeriods(userId, planId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new PlanNotFoundError({
                message: 'Plan not found',
                userId,
                planId,
              }),
            );
          }

          yield* Effect.logInfo(`Plan retrieved: ${planOption.value.id}`);

          return planOption.value;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Get all plans for a user (without periods).
       */
      getAllPlans: (userId: string): Effect.Effect<Plan[], PlanRepositoryError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Getting all plans');

          const plans = yield* repository.getAllPlans(userId);

          yield* Effect.logInfo(`Retrieved ${plans.length} plans`);

          return plans;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Cancel an active plan.
       *
       * Three Phases:
       *   Collection: repository.getPlanWithPeriods(userId, planId)
       *   Logic:      decidePlanCancellation(planId, status, periods, now)
       *   Persistence: repository.cancelPlanWithCyclePreservation(...)
       */
      cancelPlan: (
        userId: string,
        planId: string,
      ): Effect.Effect<Plan, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Cancelling plan ${planId}`);

          // Collection phase
          const planOption = yield* repository.getPlanWithPeriods(userId, planId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new PlanNotFoundError({
                message: 'Plan not found',
                userId,
                planId,
              }),
            );
          }

          const planWithPeriods = planOption.value;

          // Logic phase (pure decision)
          const now = yield* DateTime.nowAsDate;
          const cancellationDecision = cancellationService.decidePlanCancellation({
            planId: planWithPeriods.id,
            status: planWithPeriods.status,
            periods: planWithPeriods.periods,
            now,
          });

          // Persistence phase (match on decision ADT)
          const cancelledPlan = yield* PlanCancellationDecision.$match(cancellationDecision, {
            InvalidState: ({ currentStatus }) =>
              Effect.fail(
                new PlanInvalidStateError({
                  message: `Plan must be InProgress to cancel, but is ${currentStatus}`,
                  currentState: currentStatus,
                  expectedState: 'InProgress',
                }),
              ),
            Cancel: ({ completedPeriodsFastingDates, inProgressPeriodFastingDates, cancelledAt }) =>
              Effect.gen(function* () {
                if (completedPeriodsFastingDates.length > 0) {
                  yield* Effect.logInfo(
                    `Found ${completedPeriodsFastingDates.length} completed period(s). Will preserve as cycles.`,
                  );
                }

                if (inProgressPeriodFastingDates) {
                  yield* Effect.logInfo('In-progress period found. Will preserve fasting record.');
                }

                return yield* repository.cancelPlanWithCyclePreservation(
                  userId,
                  planId,
                  inProgressPeriodFastingDates,
                  [...completedPeriodsFastingDates],
                  cancelledAt,
                );
              }),
          });

          yield* Effect.logInfo(`Plan cancelled: ${cancelledPlan.id}`);

          return cancelledPlan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Update plan periods with new durations.
       *
       * Three Phases:
       *   Collection: repository.getPlanWithPeriods(userId, planId)
       *   Logic:      decidePeriodUpdate(planId, planStartDate, existingPeriods, inputPeriods)
       *   Persistence: match decision → repository.persistPeriodUpdate(...) or Effect.fail(...)
       */
      updatePlanPeriods: (
        userId: string,
        planId: string,
        periods: Array<{ id?: string; fastingDuration: number; eatingWindow: number }>,
      ): Effect.Effect<
        PlanWithPeriods,
        | PlanRepositoryError
        | PlanNotFoundError
        | PlanInvalidStateError
        | InvalidPeriodCountError
        | PeriodNotInPlanError
        | DuplicatePeriodIdError
        | PeriodOverlapWithCycleError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating periods for plan ${planId}`);

          // Collection phase
          const planOption = yield* repository.getPlanWithPeriods(userId, planId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new PlanNotFoundError({
                message: 'Plan not found',
                userId,
                planId,
              }),
            );
          }

          const planWithPeriods = planOption.value;

          // BR-01: Plan must be InProgress before mutation (domain rule)
          if (!validationService.isPlanInProgress(planWithPeriods.status)) {
            yield* Effect.fail(
              new PlanInvalidStateError({
                message: `Plan must be InProgress to update periods, but is ${planWithPeriods.status}`,
                currentState: planWithPeriods.status,
                expectedState: 'InProgress',
              }),
            );
          }

          // Logic phase (pure decision)
          const decision = periodUpdateService.decidePeriodUpdate({
            planId: planWithPeriods.id,
            planStartDate: planWithPeriods.startDate,
            existingPeriods: planWithPeriods.periods.map((p) => ({ id: p.id, order: p.order })),
            inputPeriods: periods,
          });

          // Persistence phase (match on decision ADT)
          const updatedPlan = yield* PeriodUpdateDecision.$match(decision, {
            CanUpdate: ({ periodsToWrite }) => repository.persistPeriodUpdate(userId, planId, periodsToWrite),
            InvalidPeriodCount: ({ periodCount, minPeriods, maxPeriods }) =>
              Effect.fail(
                new InvalidPeriodCountError({
                  message: `Plan must have between ${minPeriods} and ${maxPeriods} periods, got ${periodCount}`,
                  periodCount,
                  minPeriods,
                  maxPeriods,
                }),
              ),
            DuplicatePeriodId: ({ periodId }) =>
              Effect.fail(
                new DuplicatePeriodIdError({
                  message: `Duplicate period ID ${periodId} in request`,
                  planId,
                  periodId,
                }),
              ),
            PeriodNotInPlan: ({ periodId }) =>
              Effect.fail(
                new PeriodNotInPlanError({
                  message: `Period ${periodId} does not belong to plan ${planId}`,
                  planId,
                  periodId,
                }),
              ),
          });

          yield* Effect.logInfo(`Plan periods updated successfully for plan ${planId}`);

          return updatedPlan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Complete a plan when all periods are finished.
       *
       * Three Phases:
       *   Collection: repository.getPlanWithPeriods(userId, planId)
       *   Logic:      decidePlanCompletion(planId, status, periods, now, userId)
       *   Persistence: repository.persistPlanCompletion(userId, planId, cyclesToCreate, completedAt)
       */
      completePlan: (
        userId: string,
        planId: string,
      ): Effect.Effect<
        Plan,
        PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError | PeriodsNotCompletedError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Completing plan ${planId}`);

          // Collection phase
          const planOption = yield* repository.getPlanWithPeriods(userId, planId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new PlanNotFoundError({
                message: 'Plan not found',
                userId,
                planId,
              }),
            );
          }

          const planWithPeriods = planOption.value;

          // Logic phase (pure decision)
          const now = yield* DateTime.nowAsDate;
          const completionDecision = completionService.decidePlanCompletion({
            planId: planWithPeriods.id,
            status: planWithPeriods.status,
            periods: planWithPeriods.periods,
            now,
            userId,
          });

          // Persistence phase (match on decision ADT)
          const completedPlan = yield* PlanCompletionDecision.$match(completionDecision, {
            CanComplete: ({ cyclesToCreate, completedAt }) =>
              repository.persistPlanCompletion(userId, planId, cyclesToCreate, completedAt),
            PeriodsNotFinished: ({ completedCount, totalCount }) =>
              Effect.fail(
                new PeriodsNotCompletedError({
                  message: `Cannot complete plan: ${completedCount} of ${totalCount} periods are completed`,
                  planId,
                  completedCount,
                  totalCount,
                }),
              ),
            InvalidState: ({ currentStatus }) =>
              Effect.fail(
                new PlanInvalidStateError({
                  message: `Plan must be InProgress to complete, but is ${currentStatus}`,
                  currentState: currentStatus,
                  expectedState: 'InProgress',
                }),
              ),
          });

          yield* Effect.logInfo(`Plan completed: ${completedPlan.id}`);

          return completedPlan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Update plan metadata (name, description, startDate).
       * If startDate changes, all periods are recalculated.
       *
       * Three Phases:
       *   Collection: repository.getPlanWithPeriods(userId, planId)
       *   Logic:      isPlanInProgress(status) + computeMetadataUpdate(...)
       *   Persistence: repository.persistMetadataUpdate(userId, planId, planUpdate, recalculatedPeriods)
       */
      updatePlanMetadata: (
        userId: string,
        planId: string,
        metadata: { name?: string; description?: string; startDate?: Date },
      ): Effect.Effect<
        PlanWithPeriods,
        PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError | PeriodOverlapWithCycleError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating metadata for plan ${planId}`);

          // Collection phase
          const planOption = yield* repository.getPlanWithPeriods(userId, planId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new PlanNotFoundError({
                message: 'Plan not found',
                userId,
                planId,
              }),
            );
          }

          const planWithPeriods = planOption.value;

          // Logic phase — BR-01: Plan must be InProgress before mutation
          if (!validationService.isPlanInProgress(planWithPeriods.status)) {
            yield* Effect.fail(
              new PlanInvalidStateError({
                message: `Plan must be InProgress to update metadata, but is ${planWithPeriods.status}`,
                currentState: planWithPeriods.status,
                expectedState: 'InProgress',
              }),
            );
          }

          // Logic phase — compute update data (pure)
          const { planUpdate, recalculatedPeriods } = metadataService.computeMetadataUpdate({
            existingPlan: planWithPeriods,
            existingPeriods: planWithPeriods.periods,
            metadata,
          });

          // Persistence phase
          const updatedPlan = yield* repository.persistMetadataUpdate(userId, planId, planUpdate, recalculatedPeriods);

          yield* Effect.logInfo(`Plan metadata updated successfully: ${updatedPlan.id}`);

          return updatedPlan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),
    };
  }),
  dependencies: [
    PlanRepository.Default,
    PlanValidationService.Default,
    PeriodCalculationService.Default,
    PlanCancellationService.Default,
    PlanCompletionService.Default,
    PeriodUpdateService.Default,
    PlanMetadataService.Default,
  ],
  accessors: true,
}) {}
