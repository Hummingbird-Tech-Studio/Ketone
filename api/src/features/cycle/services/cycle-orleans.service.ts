import { Deferred, Effect, Match, Option, Queue, Stream } from 'effect';
import { createActor, type Snapshot } from 'xstate';
import {
  cycleActor,
  CycleActorError,
  CycleAlreadyInProgressError,
  CycleIdMismatchError,
  CycleInvalidStateError,
  CycleEvent,
  CycleState,
  Emit,
  type EmitType,
  type CycleActorSnapshot,
} from '../domain';
import { OrleansClient, OrleansClientError } from '../infrastructure/orleans-client';
import { CycleRepositoryError } from '../repositories';

const getActorWithErrorHandling = (orleansClient: OrleansClient, actorId: string) =>
  orleansClient.getActor(actorId).pipe(
    Effect.catchTags({
      OrleansActorNotFoundError: (error) =>
        Effect.fail(
          new CycleActorError({
            message: `User ${actorId} not found in Orleans`,
            cause: error,
          }),
        ),
      OrleansClientError: (error) =>
        Effect.fail(
          new CycleActorError({
            message: `Orleans client error fetching user ${actorId}`,
            cause: error,
          }),
        ),
    }),
  );

const validateCycleIdMatch = (
  persistedSnapshot: { context?: { id?: string | null } },
  cycleId: string,
): Effect.Effect<void, CycleIdMismatchError> =>
  Effect.gen(function* () {
    const activeCycleId = Option.fromNullable(persistedSnapshot.context?.id);

    if (Option.isSome(activeCycleId) && activeCycleId.value !== cycleId) {
      yield* Effect.logWarning(
        `[Orleans Service] Cycle ID mismatch: requested=${cycleId}, active=${activeCycleId.value}`,
      );

      return yield* Effect.fail(
        new CycleIdMismatchError({
          message: 'The cycle ID does not match the currently active cycle',
          requestedCycleId: cycleId,
          activeCycleId: activeCycleId.value,
        }),
      );
    }
  });

export class CycleOrleansService extends Effect.Service<CycleOrleansService>()('CycleOrleansService', {
  effect: Effect.gen(function* () {
    const orleansClient = yield* OrleansClient;

    // Shared helper: Handle PERSIST_STATE event
    const handlePersistState =
      (actorId: string, machine: ReturnType<typeof createActor>, persistConfirmQueue: Queue.Queue<CycleState>) =>
      (emit: { type: Emit.PERSIST_STATE; state: CycleState }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Orleans Service] Persisting state: ${emit.state}`);
          // Get snapshot from machine after transition completes
          const snapshot = machine.getPersistedSnapshot();
          yield* orleansClient.persistActor(actorId, snapshot);
          yield* Effect.logInfo(`[Orleans Service] ✅ State persisted successfully`);
          // Confirm persistence completed
          yield* Queue.offer(persistConfirmQueue, emit.state);
        });

    // Shared helper: Cleanup machine and listeners
    const createCleanup = (
      machine: ReturnType<typeof createActor>,
      emitSubscriptions: Array<{ unsubscribe: () => void }>,
    ) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`[Orleans Service] Cleaning up machine and listeners...`);
        emitSubscriptions.forEach((sub) => sub.unsubscribe());
        machine.stop();
        yield* Effect.logInfo(`[Orleans Service] ✅ Cleanup complete`);
      });

    /**
     * Check if a cycle is already in progress for the given actor
     *
     * @returns Effect that fails with CycleAlreadyInProgressError if a cycle is in progress,
     *          or succeeds with void if no cycle is in progress or actor doesn't exist
     */
    const checkCycleInProgress = (actorId: string) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`[Orleans] Checking if cycle is in progress for actor ${actorId}`);

        // Check if grain exists in Orleans
        const existingGrain = yield* orleansClient.getActor(actorId).pipe(
          Effect.asSome,
          Effect.catchTag('OrleansActorNotFoundError', () => Effect.succeedNone),
        );

        if (Option.isSome(existingGrain)) {
          yield* Effect.logInfo(`[Orleans] Grain ${actorId} exists, checking state`);

          // Load the XState machine with existing grain data
          const machine = yield* Effect.sync(() =>
            createActor(cycleActor, { snapshot: existingGrain.value as CycleActorSnapshot }),
          );
          machine.start();

          const currentState = machine.getSnapshot().value;
          yield* Effect.logInfo(`[Orleans] Current cycle state: ${currentState}`);

          // Check if cycle is currently in progress
          if (currentState === CycleState.InProgress || currentState === CycleState.Creating) {
            machine.stop();
            yield* Effect.logInfo(`[Orleans] Cycle is already in progress for user ${actorId}`);
            return yield* Effect.fail(
              new CycleAlreadyInProgressError({
                message: 'A cycle is already in progress',
                userId: actorId,
              }),
            );
          }

          machine.stop();
          yield* Effect.logInfo(`[Orleans] No active cycle found, proceeding`);
        } else {
          yield* Effect.logInfo(`[Orleans] No grain found for actor ${actorId}`);
        }
      });

    return {
      createCycleWithOrleans: (userId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Orleans] Starting cycle creation for user ${userId}`);

          // Step 1: Check if a cycle is already in progress
          yield* checkCycleInProgress(userId);

          yield* Effect.logInfo(`[Orleans] No cycle in progress, creating new machine`);

          // Step 2: Create local XState machine to orchestrate
          const machine = yield* Effect.sync(() => createActor(cycleActor));

          // Create queue for persistence events
          const persistQueue = yield* Queue.unbounded<{ type: Emit.PERSIST_STATE; state: CycleState }>();

          // Create queue for persistence confirmations
          const persistConfirmQueue = yield* Queue.unbounded<CycleState>();

          // Create deferred for result coordination (completes with success or error)
          const resultDeferred = yield* Deferred.make<
            Snapshot<unknown>,
            CycleRepositoryError | CycleActorError | OrleansClientError | CycleAlreadyInProgressError
          >();

          // Handler for emitted events
          const handleEmit = (event: EmitType) => {
            Match.value(event).pipe(
              Match.when({ type: Emit.REPOSITORY_ERROR }, (emit) => {
                console.log('❌ [Orleans Service] Repository error - completing deferred');
                Effect.runFork(
                  Deferred.fail(
                    resultDeferred,
                    new CycleRepositoryError({
                      message: 'Repository error while creating cycle',
                      cause: emit.error,
                    }),
                  ),
                );
              }),
              Match.when({ type: Emit.ERROR_CREATE_CYCLE }, (emit) => {
                console.log('❌ [Orleans Service] Actor error - completing deferred');
                Effect.runFork(
                  Deferred.fail(
                    resultDeferred,
                    new CycleActorError({
                      message: 'Failed to create cycle',
                      cause: emit.error,
                    }),
                  ),
                );
              }),
              Match.when({ type: Emit.PERSIST_STATE }, (emit) => {
                Effect.runFork(Queue.offer(persistQueue, emit));
              }),
              Match.exhaustive,
            );
          };

          // Register emit listeners
          const emitSubscriptions = Object.values(Emit).map((emit) => machine.on(emit, handleEmit));

          // Start the machine
          machine.start();

          // Send CREATE_CYCLE event
          machine.send({
            type: CycleEvent.CREATE_CYCLE,
            userId,
            startDate,
            endDate,
          });

          // Create Effect for persistence processing
          const persistProcessingEffect = Stream.fromQueue(persistQueue).pipe(
            Stream.runForEach((event) => handlePersistState(userId, machine, persistConfirmQueue)(event)),
          );

          // Create Effect for success (wait for state transition to InProgress)
          const successEffect = Effect.gen(function* () {
            const confirmedState = yield* Queue.take(persistConfirmQueue);
            yield* Effect.logInfo(`[Orleans Service] ✅ Persistence confirmed: ${confirmedState}`);

            const persistedSnapshot = machine.getPersistedSnapshot();
            yield* Effect.logInfo(`[Orleans Service] Persisted snapshot:`, persistedSnapshot);

            // Complete deferred with success
            yield* Deferred.succeed(resultDeferred, persistedSnapshot);
          });

          // Cleanup effect
          const cleanup = createCleanup(machine, emitSubscriptions);

          // Race between success effect and deferred (which completes on first error or success)
          return yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Effect.forkScoped(persistProcessingEffect);
              yield* Effect.forkScoped(successEffect);
              return yield* Deferred.await(resultDeferred);
            }),
          ).pipe(Effect.ensuring(cleanup));
        }),

      getCycleStateFromOrleans: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Orleans] Getting cycle state for user ${userId}`);

          return yield* getActorWithErrorHandling(orleansClient, userId);
        }),

      updateCycleDatesInOrleans: (userId: string, cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Orleans Service] Updating cycle dates for user ${userId}, cycle ${cycleId}`);

          // Step 1: Get current persisted snapshot from Orleans sidecar
          const persistedSnapshot = yield* getActorWithErrorHandling(orleansClient, userId);
          yield* Effect.logInfo(`[Orleans Service] Current persisted snapshot from Orleans:`, persistedSnapshot);

          // Step 2: Validate cycle ID matches (prevent race conditions from multiple tabs)
          yield* validateCycleIdMatch(persistedSnapshot, cycleId);
          yield* Effect.logInfo(`[Orleans Service] Cycle ID validated: ${cycleId}`);

          // Step 3: Restore XState machine with persisted snapshot
          const machine = yield* Effect.sync(() =>
            createActor(cycleActor, { snapshot: persistedSnapshot as CycleActorSnapshot }),
          );

          // Start machine with restored state
          machine.start();

          const currentSnapshot = machine.getSnapshot();
          yield* Effect.logInfo(`[Orleans Service] Machine restored with state: ${currentSnapshot.value}`);

          // Step 4: Verify cycle is in InProgress state
          const currentState = machine.getSnapshot().value;
          if (currentState !== CycleState.InProgress) {
            yield* Effect.logWarning(
              `[Orleans Service] Cannot update dates: cycle is in ${String(currentState)} state, expected InProgress`,
            );
            machine.stop();

            return yield* Effect.fail(
              new CycleInvalidStateError({
                message: 'Can only update dates for cycles in InProgress state',
                currentState: String(currentState),
                expectedState: CycleState.InProgress,
              }),
            );
          }

          // Create queue for persistence events
          const persistQueue = yield* Queue.unbounded<{ type: Emit.PERSIST_STATE; state: CycleState }>();

          // Create queue for persistence confirmations
          const persistConfirmQueue = yield* Queue.unbounded<CycleState>();

          // Create deferred for result coordination (completes with success or error)
          const resultDeferred = yield* Deferred.make<
            Snapshot<unknown>,
            CycleRepositoryError | CycleActorError | OrleansClientError
          >();

          // Handler for emitted events
          const handleEmit = (event: EmitType) => {
            Match.value(event).pipe(
              Match.when({ type: Emit.REPOSITORY_ERROR }, (emit) => {
                console.log('❌ [Orleans Service] Repository error - completing deferred');
                Effect.runFork(
                  Deferred.fail(
                    resultDeferred,
                    new CycleRepositoryError({
                      message: 'Repository error while updating cycle dates',
                      cause: emit.error,
                    }),
                  ),
                );
              }),
              Match.when({ type: Emit.ERROR_CREATE_CYCLE }, (emit) => {
                console.log('❌ [Orleans Service] Actor error - completing deferred');
                Effect.runFork(
                  Deferred.fail(
                    resultDeferred,
                    new CycleActorError({
                      message: 'Failed to update cycle dates',
                      cause: emit.error,
                    }),
                  ),
                );
              }),
              Match.when({ type: Emit.PERSIST_STATE }, (emit) => {
                Effect.runFork(Queue.offer(persistQueue, emit));
              }),
              Match.exhaustive,
            );
          };

          // Register emit listeners
          const emitSubscriptions = Object.values(Emit).map((emit) => machine.on(emit, handleEmit));

          // Step 5: Send UPDATE_DATES event to machine
          yield* Effect.logInfo(`[Orleans Service] Sending UPDATE_DATES event to machine`);

          machine.send({
            type: CycleEvent.UPDATE_DATES,
            startDate,
            endDate,
          });

          // Create Effect for persistence processing
          const persistProcessingEffect = Stream.fromQueue(persistQueue).pipe(
            Stream.runForEach((event) => handlePersistState(userId, machine, persistConfirmQueue)(event)),
          );

          // Create Effect for success (wait for state transition back to InProgress)
          const successEffect = Effect.gen(function* () {
            const confirmedState = yield* Queue.take(persistConfirmQueue);
            yield* Effect.logInfo(`[Orleans Service] ✅ Persistence confirmed: ${confirmedState}`);

            const finalPersistedSnapshot = machine.getPersistedSnapshot();
            yield* Effect.logInfo(`[Orleans Service] Final persisted snapshot:`, finalPersistedSnapshot);

            // Complete deferred with success
            yield* Deferred.succeed(resultDeferred, finalPersistedSnapshot);
          });

          // Cleanup effect
          const cleanup = createCleanup(machine, emitSubscriptions);

          // Fork persistence processing in background
          // Race between success effect and deferred (which completes on first error or success)
          return yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Effect.forkScoped(persistProcessingEffect);
              yield* Effect.forkScoped(successEffect);
              return yield* Deferred.await(resultDeferred);
            }),
          ).pipe(Effect.ensuring(cleanup));
        }),

      updateCycleStateInOrleans: (userId: string, cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Orleans Service] Starting cycle completion for user ${userId}, cycle ${cycleId}`);

          // Step 1: Get current persisted snapshot from Orleans sidecar
          const persistedSnapshot = yield* getActorWithErrorHandling(orleansClient, userId);
          yield* Effect.logInfo(`[Orleans Service] Current persisted snapshot from Orleans:`, persistedSnapshot);

          // Step 2: Validate cycle ID matches (prevent race conditions from multiple tabs)
          yield* validateCycleIdMatch(persistedSnapshot, cycleId);
          yield* Effect.logInfo(`[Orleans Service] Cycle ID validated: ${cycleId}`);

          // Step 3: Restore XState machine with persisted snapshot
          // OrleansActorState is compatible with XState snapshot structure
          const machine = yield* Effect.sync(() =>
            createActor(cycleActor, { snapshot: persistedSnapshot as CycleActorSnapshot }),
          );

          // Create queue for persistence events
          const persistQueue = yield* Queue.unbounded<{ type: Emit.PERSIST_STATE; state: CycleState }>();

          // Create queue for persistence confirmations
          const persistConfirmQueue = yield* Queue.unbounded<CycleState>();

          // Create deferred for result coordination (completes with success or error)
          const resultDeferred = yield* Deferred.make<
            Snapshot<unknown>,
            CycleRepositoryError | CycleActorError | OrleansClientError
          >();

          // Handler for emitted events
          const handleEmit = (event: EmitType) => {
            Match.value(event).pipe(
              Match.when({ type: Emit.REPOSITORY_ERROR }, (emit) => {
                console.log('❌ [Orleans Service] Repository error - completing deferred');
                Effect.runFork(
                  Deferred.fail(
                    resultDeferred,
                    new CycleRepositoryError({
                      message: 'Repository error while updating cycle state',
                      cause: emit.error,
                    }),
                  ),
                );
              }),
              Match.when({ type: Emit.ERROR_CREATE_CYCLE }, (emit) => {
                console.log('❌ [Orleans Service] Actor error - completing deferred');
                Effect.runFork(
                  Deferred.fail(
                    resultDeferred,
                    new CycleActorError({
                      message: 'Failed to update cycle state',
                      cause: emit.error,
                    }),
                  ),
                );
              }),
              Match.when({ type: Emit.PERSIST_STATE }, (emit) => {
                Effect.runFork(Queue.offer(persistQueue, emit));
              }),
              Match.exhaustive,
            );
          };

          // Register emit listeners
          const emitSubscriptions = Object.values(Emit).map((emit) => machine.on(emit, handleEmit));

          // Start machine with restored state
          machine.start();

          const currentSnapshot = machine.getSnapshot();
          yield* Effect.logInfo(`[Orleans Service] Machine restored with state: ${currentSnapshot.value}`);

          // Step 3: Check if already completed
          const currentState = machine.getSnapshot().value;
          if (currentState === CycleState.Completed) {
            yield* Effect.logInfo(`[Orleans Service] Actor already in Completed state, returning current snapshot`);
            return persistedSnapshot;
          }

          // Step 4: Send COMPLETE event to machine
          yield* Effect.logInfo(`[Orleans Service] Sending COMPLETE event to machine`);

          // Step 4: Send COMPLETE event - machine will orchestrate the rest
          machine.send({
            type: CycleEvent.COMPLETE,
            startDate,
            endDate,
          });

          // Create Effect for persistence processing
          const persistProcessingEffect = Stream.fromQueue(persistQueue).pipe(
            Stream.runForEach((event) => handlePersistState(userId, machine, persistConfirmQueue)(event)),
          );

          // Create Effect for success (wait for state transition to Completed)
          const successEffect = Effect.gen(function* () {
            const confirmedState = yield* Queue.take(persistConfirmQueue);
            yield* Effect.logInfo(`[Orleans Service] ✅ Persistence confirmed: ${confirmedState}`);

            const finalPersistedSnapshot = machine.getPersistedSnapshot();
            yield* Effect.logInfo(`[Orleans Service] Final persisted snapshot:`, finalPersistedSnapshot);

            // Complete deferred with success
            yield* Deferred.succeed(resultDeferred, finalPersistedSnapshot);
          });

          // Cleanup effect
          const cleanup = createCleanup(machine, emitSubscriptions);

          // Fork persistence processing in background
          // Race between success effect and deferred (which completes on first error or success)
          return yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Effect.forkScoped(persistProcessingEffect);
              yield* Effect.forkScoped(successEffect);
              return yield* Deferred.await(resultDeferred);
            }),
          ).pipe(Effect.ensuring(cleanup));
        }),
    };
  }),
  accessors: true,
}) {}
