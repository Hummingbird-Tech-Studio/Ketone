import { Effect, Match, Queue, Stream } from 'effect';
import { createActor, waitFor } from 'xstate';
import { cycleActor, CycleActorError, CycleEvent, CycleState, Emit, type EmitType } from '../domain';
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
            Effect.as(true),
            Effect.catchTag('OrleansActorNotFoundError', () => Effect.succeed(false)),
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

          // Create queue for events (errors and persistence)
          const eventQueue = yield* Queue.unbounded<EmitType>();

          // Create queue for persistence confirmations
          const persistConfirmQueue = yield* Queue.unbounded<CycleState>();

          // Handler for emitted events
          const handleEmit = (event: EmitType) => {
            Match.value(event).pipe(
              Match.when({ type: Emit.ERROR_CREATE_CYCLE }, (emit) => {
                console.log('❌ [Orleans Service] Error event emitted:', emit);
                Effect.runFork(Queue.offer(eventQueue, emit));
              }),
              Match.when({ type: Emit.REPOSITORY_ERROR }, (emit) => {
                console.log('❌ [Orleans Service] Repository error event emitted:', emit);
                Effect.runFork(Queue.offer(eventQueue, emit));
              }),
              Match.when({ type: Emit.PERSIST_ERROR }, (emit) => {
                console.log('❌ [Orleans Service] Persist error event emitted:', emit);
                Effect.runFork(Queue.offer(eventQueue, emit));
              }),
              Match.when({ type: Emit.PERSIST_STATE }, (emit) => {
                console.log('✅ [Orleans Service] Persist state event emitted for:', emit.state);
                Effect.runFork(Queue.offer(eventQueue, emit));
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
            actorId,
            startDate,
            endDate,
          });

          // Create Effect for event processing (errors and persistence)
          const eventProcessingEffect = Stream.fromQueue(eventQueue).pipe(
            Stream.runForEach((event) =>
              Match.value(event).pipe(
                Match.when({ type: Emit.PERSIST_STATE }, (emit) =>
                  Effect.gen(function* () {
                    yield* Effect.logInfo(`[Orleans Service] Persisting state: ${emit.state}`);
                    // Get snapshot from machine after transition completes
                    const snapshot = machine.getPersistedSnapshot();
                    yield* orleansClient.persistActor(actorId, snapshot);
                    yield* Effect.logInfo(`[Orleans Service] ✅ State persisted successfully`);
                    // Confirm persistence completed
                    yield* Queue.offer(persistConfirmQueue, emit.state);
                  }),
                ),
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
              ),
            ),
          );

          // Create Effect for success (wait for state transition to InProgress)
          const successEffect = Effect.gen(function* () {
            yield* Effect.logInfo(`[Orleans Service] Step 4: Waiting for machine to reach InProgress state...`);

            yield* Effect.tryPromise({
              try: () => waitFor(machine, (snapshot) => snapshot.value === CycleState.InProgress, { timeout: 10000 }),
              catch: (error) =>
                new CycleActorError({
                  message: 'Failed to create cycle: timeout waiting for state transition',
                  cause: error,
                }),
            });

            yield* Effect.logInfo(`[Orleans Service] ✅ Machine reached InProgress state`);

            // Wait for persistence confirmation
            yield* Effect.logInfo(`[Orleans Service] Waiting for persistence confirmation...`);
            const confirmedState = yield* Queue.take(persistConfirmQueue);
            yield* Effect.logInfo(`[Orleans Service] ✅ Persistence confirmed for state: ${confirmedState}`);

            // Get persisted snapshot - it's already in Orleans format
            const persistedSnapshot = machine.getPersistedSnapshot();

            yield* Effect.logInfo(`[Orleans Service] Persisted snapshot:`, persistedSnapshot);

            return persistedSnapshot;
          });

          // Cleanup effect
          const cleanup = Effect.gen(function* () {
            yield* Effect.logInfo(`[Orleans Service] Cleaning up machine and listeners...`);
            emitSubscriptions.forEach((sub) => sub.unsubscribe());
            machine.stop();
            yield* Effect.logInfo(`[Orleans Service] ✅ Cleanup complete`);
          });

          // Race between success and event processing, with guaranteed cleanup
          return yield* Effect.race(successEffect, eventProcessingEffect).pipe(Effect.ensuring(cleanup));
        }),

      /**
       * Get cycle state from Orleans
       */
      getCycleStateFromOrleans: (actorId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Orleans] Getting cycle state for actor ${actorId}`);

          return yield* orleansClient.getActor(actorId).pipe(
            Effect.catchTags({
              OrleansActorNotFoundError: (error) =>
                Effect.fail(
                  new CycleActorError({
                    message: `Actor ${actorId} not found in Orleans`,
                    cause: error,
                  }),
                ),
              OrleansClientError: (error) =>
                Effect.fail(
                  new CycleActorError({
                    message: `Orleans client error fetching actor ${actorId}`,
                    cause: error,
                  }),
                ),
            }),
          );
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
            Effect.catchTags({
              OrleansActorNotFoundError: (error) =>
                Effect.fail(
                  new CycleActorError({
                    message: `Actor ${actorId} not found in Orleans`,
                    cause: error,
                  }),
                ),
              OrleansClientError: (error) =>
                Effect.fail(
                  new CycleActorError({
                    message: `Orleans client error fetching actor ${actorId}`,
                    cause: error,
                  }),
                ),
            }),
          );
          yield* Effect.logInfo(`[Orleans Service] Current persisted snapshot from Orleans:`, persistedSnapshot);

          // Step 2: Restore XState machine with persisted snapshot
          // OrleansActorState is compatible with XState snapshot structure
          const machine = yield* Effect.sync(() => createActor(cycleActor, { snapshot: persistedSnapshot as any }));

          // Create queue for events (errors and persistence)
          const eventQueue = yield* Queue.unbounded<EmitType>();

          // Create queue for persistence confirmations
          const persistConfirmQueue = yield* Queue.unbounded<CycleState>();

          // Handler for emitted events
          const handleEmit = (event: EmitType) => {
            Match.value(event).pipe(
              Match.when({ type: Emit.PERSIST_ERROR }, (emit) => {
                console.log('❌ [Orleans Service] Persist error event emitted:', emit);
                Effect.runFork(Queue.offer(eventQueue, emit));
              }),
              Match.when({ type: Emit.PERSIST_STATE }, (emit) => {
                console.log('✅ [Orleans Service] Persist state event emitted for:', emit.state);
                Effect.runFork(Queue.offer(eventQueue, emit));
              }),
              Match.orElse(() => {}),
            );
          };

          // Register emit listeners
          const emitSubscriptions = [
            machine.on(Emit.PERSIST_ERROR, handleEmit),
            machine.on(Emit.PERSIST_STATE, handleEmit),
          ];

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

          // Create Effect for event processing (errors and persistence)
          const eventProcessingEffect = Stream.fromQueue(eventQueue).pipe(
            Stream.runForEach((event) =>
              Match.value(event).pipe(
                Match.when({ type: Emit.PERSIST_STATE }, (emit) =>
                  Effect.gen(function* () {
                    yield* Effect.logInfo(`[Orleans Service] Persisting state: ${emit.state}`);
                    // Get snapshot from machine after transition completes
                    const snapshot = machine.getPersistedSnapshot();
                    yield* orleansClient.persistActor(actorId, snapshot);
                    yield* Effect.logInfo(`[Orleans Service] ✅ State persisted successfully`);
                    // Confirm persistence completed
                    yield* Queue.offer(persistConfirmQueue, emit.state);
                  }),
                ),
                Match.when({ type: Emit.PERSIST_ERROR }, (emit) =>
                  Effect.fail(
                    new OrleansClientError({
                      message: 'Failed to persist state to Orleans',
                      cause: emit.error,
                    }),
                  ),
                ),
                Match.orElse(() => Effect.void),
              ),
            ),
          );

          // Create Effect for success (wait for state transition to Completed)
          const successEffect = Effect.gen(function* () {
            yield* Effect.logInfo(`[Orleans Service] Waiting for machine to reach Completed state...`);

            yield* Effect.tryPromise({
              try: () => waitFor(machine, (snapshot) => snapshot.value === CycleState.Completed, { timeout: 10000 }),
              catch: (error) =>
                new CycleActorError({
                  message: 'Failed to complete cycle: timeout waiting for state transition',
                  cause: error,
                }),
            });

            yield* Effect.logInfo(`[Orleans Service] ✅ Machine reached Completed state`);

            // Wait for persistence confirmation
            yield* Effect.logInfo(`[Orleans Service] Waiting for persistence confirmation...`);
            const confirmedState = yield* Queue.take(persistConfirmQueue);
            yield* Effect.logInfo(`[Orleans Service] ✅ Persistence confirmed for state: ${confirmedState}`);

            // Get persisted snapshot - it's already in Orleans format
            const finalPersistedSnapshot = machine.getPersistedSnapshot();

            yield* Effect.logInfo(`[Orleans Service] Final persisted snapshot:`, finalPersistedSnapshot);

            return finalPersistedSnapshot;
          });

          // Cleanup effect
          const cleanup = Effect.gen(function* () {
            yield* Effect.logInfo(`[Orleans Service] Cleaning up machine and listeners...`);
            emitSubscriptions.forEach((sub) => sub.unsubscribe());
            machine.stop();
            yield* Effect.logInfo(`[Orleans Service] ✅ Cleanup complete`);
          });

          // Race between success and event processing, with guaranteed cleanup
          return yield* Effect.race(successEffect, eventProcessingEffect).pipe(Effect.ensuring(cleanup));
        }),
    };
  }),
  accessors: true,
}) {}
