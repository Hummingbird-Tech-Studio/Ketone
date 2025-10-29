import { Effect } from 'effect';
import { PgClient } from '@effect/sql-pg';

/**
 * Delete Orleans storage entry for a specific grain ID (user ID or actor ID)
 * Uses raw SQL to avoid coupling application code with Orleans schema
 *
 * @param grainId - The grain identifier (userId or actorId)
 * @returns Effect that completes when deletion is done
 */
export const deleteOrleansStorageByGrainId = (grainId: string) =>
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;

    yield* sql`
      DELETE FROM orleansstorage
      WHERE grainidextensionstring = ${grainId}
    `.pipe(
      Effect.tapError((error) =>
        Effect.logWarning(`Failed to delete Orleans storage for grain ${grainId}: ${error}`),
      ),
      Effect.catchAll(() => Effect.void),
    );
  });
