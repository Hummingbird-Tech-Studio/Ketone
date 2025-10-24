import { Effect, Match, Queue } from 'effect';
import { createActor, waitFor } from 'xstate';
import {
  cycleActor,
  Emit,
  EmitType,
  CycleEvent,
  CycleState,
} from '../domain';
import { CycleActorError } from '../domain';
import { OrleansActorNotFoundError, OrleansClient, OrleansClientError } from '../infrastructure/orleans-client';
import { CycleRepositoryError } from '../repositories';

/**
 * Cycle Orleans Service
 *
 * Orchestrates the new architecture:
 * 1. Check if actor exists in Orleans sidecar (GET)
 * 2. If 404: Create local XState machine to orchestrate cycle creation
 * 3. Machine creates cycle in database
 * 4. Persist machine state to Orleans sidecar (POST)
 */

// Persisted snapshot type from XState - this is what getPersistedSnapshot() returns
export type CycleOrleansActorState = ReturnType<
  ReturnType<typeof createActor<typeof cycleActor>>['getPersistedSnapshot']
>;

// ============================================================================
// Service Implementation
// ============================================================================

export class CycleOrleansService extends Effect.Service<CycleOrleansService>()('CycleOrleansService', {
  effect: Effect.gen(function* () {
    const orleansClient = yield* OrleansClient;

    return {
      /**
       * Create a cycle using Orleans architecture
       *
       * Flow:
       * 1. Check if actor exists in Orleans
       * 2. If 404: Create new machine and orchestrate cycle creation
       * 3. Persist final state to Orleans
       */
      createCycleWithOrleans: (actorId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Orleans] Starting cycle creation for actor ${actorId}`);

          // Step 1: Check if actor exists in Orleans
          const actorExists = yield* orleansClient.getActor(actorId).pipe(
            Effect.match({
              onSuccess: () => true,
              onFailure: (error) => {
                if (error instanceof OrleansActorNotFoundError) {
                  return false;
                }
                // Re-throw other errors
                throw error;
              },
            }),
          );

          if (actorExists) {
            yield* Effect.logInfo(`[Orleans] Actor ${actorId} already exists in Orleans`);
            return yield* Effect.fail(
              new CycleActorError({
                message: `Actor ${actorId} already exists`,
                cause: new Error('Actor already initialized'),
              }),
            );
          }

          yield* Effect.logInfo(`[Orleans] Actor ${actorId} not found (404), creating new machine`);

          // Step 2: Create local XState machine to orchestrate
          const machine = yield* Effect.sync(() => createActor(cycleActor));

          // Create error queue for error events
          const errorQueue = yield* Queue.unbounded<EmitType>();

          // Handler for emitted events
          const handleEmit = (event: EmitType) => {
            Match.value(event).pipe(
              Match.when({ type: Emit.ERROR_CREATE_CYCLE }, (emit) => {
                console.log('❌ [Orleans Service] Error event emitted:', emit);
                Effect.runFork(Queue.offer(errorQueue, emit));
              }),
              Match.when({ type: Emit.REPOSITORY_ERROR }, (emit) => {
                console.log('❌ [Orleans Service] Repository error event emitted:', emit);
                Effect.runFork(Queue.offer(errorQueue, emit));
              }),
              Match.when({ type: Emit.PERSIST_ERROR }, (emit) => {
                console.log('❌ [Orleans Service] Persist error event emitted:', emit);
                Effect.runFork(Queue.offer(errorQueue, emit));
              }),
              Match.exhaustive,
            );
          };

          // Register emit listeners
          const emitSubscriptions = Object.values(Emit).map((emit) => machine.on(emit, handleEmit));

          // Get the current runtime to use in callbacks
          const runtime = yield* Effect.runtime();

          // Start the machine
          machine.start();

          // Subscribe to state changes to persist automatically (like Dapr service)
          const stateSubscription = machine.subscribe({
            next: () => {
              // This callback fires on actual state transitions
              Effect.runFork(
                Effect.gen(function* () {
                  const persistedSnapshot = machine.getPersistedSnapshot();
                  yield* Effect.logInfo(`[Orleans Service] Auto-persisting state after transition`);
                  yield* orleansClient.persistActor(actorId, persistedSnapshot);
                }).pipe(
                  Effect.catchAll((error) => Effect.logError('[Orleans Service] Auto-persist failed', error)),
                  Effect.provide(runtime),
                ),
              );
            },
          });

          // Send CREATE_CYCLE event
          machine.send({
            type: CycleEvent.CREATE_CYCLE,
            actorId,
            startDate,
            endDate,
          });

          // Create Effect for error subscription
          const errorEffect = Effect.gen(function* () {
            const errorEvent = yield* Queue.take(errorQueue);
            console.log('❌ [Orleans] Error consumed from queue:', errorEvent);

            return yield* Match.value(errorEvent).pipe(
              Match.when({ type: Emit.REPOSITORY_ERROR }, (emit) =>
                Effect.fail(
                  new CycleRepositoryError({
                    message: 'Repository error while creating cycle',
                    cause: emit.error,
                  }),
                ),
              ),
              Match.when({ type: Emit.ERROR_CREATE_CYCLE }, (emit) =>
                Effect.fail(
                  new CycleActorError({
                    message: 'Failed to create cycle',
                    cause: emit.error,
                  }),
                ),
              ),
              Match.when({ type: Emit.PERSIST_ERROR }, (emit) =>
                Effect.fail(
                  new OrleansClientError({
                    message: 'Failed to persist state to Orleans',
                    cause: emit.error,
                  }),
                ),
              ),
              Match.exhaustive,
            );
          });

          // Create Effect for success (wait for state transition to InProgress)
          // The machine will handle persistence automatically in the Persisting state
          const successEffect = Effect.gen(function* () {
            yield* Effect.logInfo(`[Orleans Service] Step 4: Waiting for machine to reach InProgress state...`);

            yield* Effect.tryPromise({
              try: () =>
                waitFor(machine, (snapshot) => snapshot.value === CycleState.InProgress, { timeout: 10000 }),
              catch: (error) =>
                new CycleActorError({
                  message: 'Failed to create cycle: timeout waiting for state transition',
                  cause: error,
                }),
            });

            yield* Effect.logInfo(`[Orleans Service] ✅ Machine reached InProgress state`);

            // Get persisted snapshot (correct way to persist XState state)
            const persistedSnapshot = machine.getPersistedSnapshot();

            yield* Effect.logInfo(`[Orleans Service] Persisted snapshot:`, persistedSnapshot);

            // Cleanup
            yield* Effect.logInfo(`[Orleans Service] Cleaning up machine and listeners...`);
            stateSubscription.unsubscribe();
            emitSubscriptions.forEach((sub) => sub.unsubscribe());
            machine.stop();
            yield* Effect.logInfo(`[Orleans Service] ✅ Cleanup complete`);

            return persistedSnapshot;
          });

          // Race between success and error
          return yield* Effect.raceFirst(successEffect, errorEffect);
        }),

      /**
       * Get cycle state from Orleans
       */
      getCycleStateFromOrleans: (actorId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Orleans] Getting cycle state for actor ${actorId}`);

          const state = yield* orleansClient.getActor(actorId).pipe(
            Effect.mapError((error) => {
              if (error instanceof OrleansActorNotFoundError) {
                return new CycleActorError({
                  message: `Actor ${actorId} not found in Orleans`,
                  cause: error,
                });
              }
              return error;
            }),
          );

          return state;
        }),

      /**
       * Update cycle state in Orleans
       *
       * Flow using XState machine with persisted snapshot:
       * 1. Get current persisted snapshot from Orleans sidecar
       * 2. Restore XState machine with snapshot
       * 3. Send COMPLETE event to machine
       * 4. Machine orchestrates: InProgress -> Completing (persist) -> Completed
       * 5. Return persisted snapshot
       */
      updateCycleStateInOrleans: (actorId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Orleans Service] Starting cycle completion for actor ${actorId}`);

          // Step 1: Get current persisted snapshot from Orleans sidecar
          const persistedSnapshot = yield* orleansClient.getActor(actorId).pipe(
            Effect.mapError((error) => {
              if (error instanceof OrleansActorNotFoundError) {
                return new CycleActorError({
                  message: `Actor ${actorId} not found in Orleans`,
                  cause: error,
                });
              }
              return error;
            }),
          );

          yield* Effect.logInfo(`[Orleans Service] Current persisted snapshot from Orleans:`, persistedSnapshot);

          // Step 2: Restore XState machine with persisted snapshot
          // Cast to any because Orleans currently stores {value, context} instead of full persisted snapshot
          const machine = yield* Effect.sync(() =>
            createActor(cycleActor, { snapshot: persistedSnapshot as any }),
          );

          // Get the current runtime to use in callbacks
          const runtime = yield* Effect.runtime();

          // Create error queue for error events
          const errorQueue = yield* Queue.unbounded<EmitType>();

          // Handler for emitted events
          const handleEmit = (event: EmitType) => {
            Match.value(event).pipe(
              Match.when({ type: Emit.PERSIST_ERROR }, (emit) => {
                console.log('❌ [Orleans Service] Persist error event emitted:', emit);
                Effect.runFork(Queue.offer(errorQueue, emit));
              }),
              Match.orElse(() => {}),
            );
          };

          // Register emit listener for persist errors
          const emitSubscription = machine.on(Emit.PERSIST_ERROR, handleEmit);

          // Start machine with restored state
          machine.start();

          const currentSnapshot = machine.getSnapshot();
          yield* Effect.logInfo(`[Orleans Service] Machine restored with state: ${currentSnapshot.value}`);

          // Subscribe to state changes to persist automatically (like Dapr service)
          const stateSubscription = machine.subscribe({
            next: () => {
              // This callback fires on actual state transitions
              Effect.runFork(
                Effect.gen(function* () {
                  const persistedSnapshot = machine.getPersistedSnapshot();
                  yield* Effect.logInfo(`[Orleans Service] Auto-persisting state after transition`);
                  yield* orleansClient.persistActor(actorId, persistedSnapshot as any);
                }).pipe(
                  Effect.catchAll((error) => Effect.logError('[Orleans Service] Auto-persist failed', error)),
                  Effect.provide(runtime),
                ),
              );
            },
          });

          // Step 3: Send COMPLETE event to machine
          yield* Effect.logInfo(`[Orleans Service] Sending COMPLETE event to machine`);

          // Step 4: Send COMPLETE event - machine will orchestrate the rest
          machine.send({
            type: CycleEvent.COMPLETE,
            startDate,
            endDate,
          });

          // Create Effect for error subscription
          const errorEffect = Effect.gen(function* () {
            const errorEvent = yield* Queue.take(errorQueue);
            console.log('❌ [Orleans Service] Error consumed from queue:', errorEvent);

            return yield* Effect.fail(
              new OrleansClientError({
                message: 'Failed to persist state to Orleans',
                cause: errorEvent.error,
              }),
            );
          });

          // Create Effect for success (wait for state transition to Completed)
          // The machine will handle persistence automatically in the Completing state
          const successEffect = Effect.gen(function* () {
            yield* Effect.logInfo(`[Orleans Service] Waiting for machine to reach Completed state...`);

            yield* Effect.tryPromise({
              try: () =>
                waitFor(machine, (snapshot) => snapshot.value === CycleState.Completed, { timeout: 10000 }),
              catch: (error) =>
                new CycleActorError({
                  message: 'Failed to complete cycle: timeout waiting for state transition',
                  cause: error,
                }),
            });

            yield* Effect.logInfo(`[Orleans Service] ✅ Machine reached Completed state`);

            // Get persisted snapshot
            const finalPersistedSnapshot = machine.getPersistedSnapshot();

            yield* Effect.logInfo(`[Orleans Service] Final persisted snapshot:`, finalPersistedSnapshot);

            // Cleanup
            yield* Effect.logInfo(`[Orleans Service] Cleaning up machine and listeners...`);
            stateSubscription.unsubscribe();
            emitSubscription.unsubscribe();
            machine.stop();
            yield* Effect.logInfo(`[Orleans Service] ✅ Cleanup complete`);

            return finalPersistedSnapshot;
          });

          // Race between success and error
          return yield* Effect.raceFirst(successEffect, errorEffect);
        }),
    };
  }),
  accessors: true,
}) {}
