import { Effect, Fiber, Stream } from 'effect';

/**
 * Bridge an Effect's success/error channels to UI callbacks.
 *
 * Generic over:
 *   • A – success value
 *   • E – error value  (inferred from `eff`)
 *
 * Works for any `Effect` whose environment is already satisfied (`R = never`).
 */
export function runWithUi<A, E>(
  eff: Effect.Effect<A, E>,
  onSuccess: (value: A) => void,
  onFailure: (error: E) => void,
): Promise<void> {
  const handled: Effect.Effect<void, never> = eff.pipe(
    Effect.matchEffect({
      onSuccess: (value) => Effect.sync(() => onSuccess(value)), // pass value to UI
      onFailure: (err) => Effect.sync(() => onFailure(err)),
    }),
  );

  return Effect.runPromise(handled);
}

/**
 * Execute an `Effect` that *yields* a `Stream`, push every chunk to `onData`,
 * send domain errors to `onError`, and return a `cancel` function that
 * interrupts the fibre (which in turn runs the stream's finalizer).
 *
 * • Works with any error type `E` (`E` is inferred).
 * • Assumes the incoming Effect already has `R = never`
 *   (i.e. it provided its own Live layers, exactly like your
 *   `programCounterStream` helper).
 */
export function runStreamWithUi<A, E>(
  streamEff: Effect.Effect<Stream.Stream<A, E>, E>, // env = never
  onData: (data: A) => void,
  onError: (error: E) => void,
): () => void {
  // Build & fork a fibre that pulls the stream and pumps chunks to UI
  const fiber = Effect.runFork(
    streamEff.pipe(
      Effect.flatMap((str) => {
        return Stream.runForEach(str, (a) => {
          return Effect.sync(() => onData(a));
        });
      }),
      Effect.catchAll((err) => {
        return Effect.sync(() => onError(err));
      }),
    ),
  );

  // Return a cleanup function that interrupts the fibre
  return () => {
    Effect.runFork(Fiber.interrupt(fiber));
  };
}
