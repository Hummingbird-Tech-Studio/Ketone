import { Schema as S } from 'effect';

/**
 * Cycle Response Schema
 *
 * This schema handles both encoding and decoding:
 * - **Encoding (Handler → JSON)**: Accepts Date objects, serializes to ISO strings
 * - **Decoding (JSON → Tests)**: Accepts ISO strings, parses to Date objects
 *
 * Effect Schema automatically handles the transformation based on context:
 * - In HttpApiBuilder: Uses as "Type" (Date objects) for type safety
 * - In S.decodeUnknown: Parses from "Encoded" (ISO strings) to Date objects
 *
 * S.Date is a bidirectional transformation: Schema<Date, string>
 * - Type: Date (what the handler returns)
 * - Encoded: string (what JSON contains)
 */
export const CycleResponseSchema = S.Struct({
  actorId: S.String,
  state: S.String,
  cycle: S.Struct({
    id: S.NullOr(S.String),
    startDate: S.NullOr(S.Date),
    endDate: S.NullOr(S.Date),
  }),
});
