/**
 * Shared fromCallback logic for saving a plan as a template.
 *
 * Used by both plan.actor and planEdit.actor to avoid
 * duplicating the same error-matching boilerplate.
 *
 * Sends back events: ON_TEMPLATE_SAVED, ON_TEMPLATE_LIMIT_REACHED, ON_ERROR
 */
import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { programSaveAsTemplate } from '@/views/planTemplates/services/plan-template-application.service';
import { Match } from 'effect';
import { fromCallback, type EventObject } from 'xstate';

export const saveAsTemplateLogic = fromCallback<EventObject, { planId: string }>(({ sendBack, input }) =>
  runWithUi(
    programSaveAsTemplate(input.planId),
    () => sendBack({ type: 'ON_TEMPLATE_SAVED' }),
    (error) =>
      sendBack(
        Match.value(error).pipe(
          Match.when({ _tag: 'TemplateLimitReachedError' }, () => ({
            type: 'ON_TEMPLATE_LIMIT_REACHED',
          })),
          Match.when({ _tag: 'TemplateServiceError' }, (err) => ({
            type: 'ON_ERROR',
            error: err.message,
          })),
          // Infrastructure errors (HTTP, auth, body)
          Match.orElse((err) => ({
            type: 'ON_ERROR',
            error: extractErrorMessage(err),
          })),
        ),
      ),
  ),
);
