/**
 * PlanTemplate Contracts
 *
 * Use-case inputs and outputs. These define:
 * - What data enters a use case (Input)
 * - What decisions/results exit a use case (Output/Decision)
 *
 * Contracts change when the operation interface changes,
 * NOT when the domain model changes.
 */
export * from './create-from-plan.contract';
export * from './update-template.contract';
export * from './duplicate-template.contract';
export * from './delete-template.contract';
