/**
 * SaveTemplateLimit Contract
 *
 * Cross-cutting limit guard shared by create-from-plan, duplicate, and
 * duplicate-with-periods use cases.
 *
 * Input: current template count + max allowed
 * Decision: CanSave or LimitReached
 */
import { Data, Schema as S } from 'effect';

const SaveTemplateLimitInput = S.Struct({
  currentCount: S.Number,
  maxTemplates: S.Number,
});
export type SaveTemplateLimitInput = S.Schema.Type<typeof SaveTemplateLimitInput>;

/**
 * SaveTemplateLimitDecision — Reified decision for save/duplicate guard.
 *
 * CanSave: Under the 20-template limit, proceed
 * LimitReached: User hit the template cap
 */
export type SaveTemplateLimitDecision = Data.TaggedEnum<{
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  CanSave: {};
  LimitReached: { readonly currentCount: number; readonly maxTemplates: number };
}>;

export const SaveTemplateLimitDecision = Data.taggedEnum<SaveTemplateLimitDecision>();
export const { $match: matchSaveDecision } = SaveTemplateLimitDecision;
