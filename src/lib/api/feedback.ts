import { api } from './client';
import type { FeedbackAccepted, FeedbackPayload } from '../utils/feedback';

/**
 * Feedback submission. Unlike every other module here, this does NOT reach MSW:
 * `/feedback` is deliberately absent from src/mocks/handlers.ts so the request
 * passes through to the real Next route handler in both modes. See the header of
 * src/app/api/feedback/route.ts.
 */
export const feedbackApi = {
  /**
   * `skipAuthRedirect` is required, not optional: the global 401 handler in
   * client.ts hard-navigates to /login, which unmounts the settings form and
   * destroys the message the user typed before any catch block can retain it.
   * The 10s timeout bounds a hung request — without it neither toast ever fires
   * and the user watches a pending button forever.
   */
  submitFeedback(data: FeedbackPayload) {
    return api.post<FeedbackAccepted>('/feedback', data, {
      skipAuthRedirect: true,
      signal: AbortSignal.timeout(10_000),
    });
  },
};
