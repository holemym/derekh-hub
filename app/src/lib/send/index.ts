import "server-only";

/**
 * Sending capabilities — which channels can send for real (env keys present).
 * Server pages compute this and pass it to client components, so no secret
 * ever reaches the browser; without keys the UI stays pure hand-off.
 */

import { emailConfigured, sendEmail, type SendResult } from "./email";
import { whatsappConfigured, sendWhatsApp } from "./whatsapp";

export { sendEmail, sendWhatsApp, emailConfigured, whatsappConfigured };
export type { SendResult };

export interface SendCapabilities {
  email: boolean;
  whatsapp: boolean;
}

export function sendCapabilities(): SendCapabilities {
  return { email: emailConfigured(), whatsapp: whatsappConfigured() };
}
