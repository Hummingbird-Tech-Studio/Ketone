/**
 * PlanTemplate API Client
 *
 * API adapter — HTTP transport + boundary mappers (DTO ↔ domain types).
 */
export { PlanTemplateApiClientService } from './plan-template-client.service';
export type {
  CreateFromPlanError,
  DeleteTemplateError,
  DuplicateTemplateError,
  GetTemplateError,
  ListTemplatesError,
  UpdateTemplateError,
} from './plan-template.errors';
