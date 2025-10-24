import { Schema as S } from 'effect';
import { CycleState } from './actors/cycleOrleansActor';

/**
 * Domain Types and Enums
 *
 * Core domain concepts that are shared across layers.
 */

export const CycleStateSchema = S.Enums(CycleState);
