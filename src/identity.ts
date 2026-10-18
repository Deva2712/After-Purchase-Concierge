import { createHash } from 'node:crypto';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// ponytail: one fixed demo customer, no account linking. Production path is OAuth (docs/ARCHITECTURE.md section 9).
export function demoCustomer(): { email: string; hash: string } {
  const email = process.env.DEMO_CUSTOMER_EMAIL ?? '';
  if (!email) throw new Error('DEMO_CUSTOMER_EMAIL is not set');
  return { email, hash: sha256(email.trim().toLowerCase()).slice(0, 16) };
}

/** Idempotency key for every write: a repeated "yes" maps to the same record. */
export function idemKey(orderId: string, lineItemId: string, action: string): string {
  return sha256(orderId + lineItemId + action);
}
