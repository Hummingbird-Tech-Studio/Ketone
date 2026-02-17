/**
 * Plan API Client
 *
 * API adapter — HTTP transport + boundary mappers (DTO ↔ domain types).
 */
export { PlanApiClientService } from './plan-client.service';
export type {
  CancelPlanError,
  CompletePlanError,
  CreatePlanError,
  GetActivePlanError,
  GetPlanError,
  ListPlansError,
  UpdateMetadataError,
  UpdatePeriodsError,
} from './plan.errors';
