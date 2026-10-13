// C-SAT survey links carry the customer's only credential in the path; keep it out of
// request logs and self-heal incidents (which are forwarded to an LLM for triage).
const CSAT_TOKEN_IN_PATH = /\/csat\/[0-9a-f]{64}/gi;

export function redactSecrets(text: string): string {
  return text.replace(CSAT_TOKEN_IN_PATH, '/csat/[redacted]');
}
