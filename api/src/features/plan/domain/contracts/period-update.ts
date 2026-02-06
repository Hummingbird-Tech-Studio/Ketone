import { Data, Schema as S } from 'effect';
import { FastingDurationSchema, EatingWindowSchema, PeriodOrderSchema } from '../plan.model';

/**
 * Single period update input with branded schemas for domain-level validation.
 */
export const DomainPeriodUpdateInput = S.Struct({
  periodOrder: PeriodOrderSchema,
  fastingDuration: S.optional(FastingDurationSchema),
  eatingWindow: S.optional(EatingWindowSchema),
  newStartDate: S.optional(S.DateFromSelf),
});
export type DomainPeriodUpdateInput = S.Schema.Type<typeof DomainPeriodUpdateInput>;

/**
 * PeriodUpdateDecision - Reified decision for period updates.
 *
 * UpdatePeriods: Periods have been recalculated and are ready for persistence
 * NoChanges: No updates are needed
 * BlockedByOverlap: New dates would overlap with existing cycle
 */
export type PeriodUpdateDecision = Data.TaggedEnum<{
  UpdatePeriods: { readonly planId: string };
  NoChanges: { readonly planId: string };
  BlockedByOverlap: {
    readonly planId: string;
    readonly overlappingCycleId: string;
  };
}>;
export const PeriodUpdateDecision = Data.taggedEnum<PeriodUpdateDecision>();
