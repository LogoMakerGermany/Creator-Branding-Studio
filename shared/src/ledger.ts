/** Immutable euro balance ledger — amounts in cents. */

export type LedgerEntryType =
  | 'STRIPE_PAYMENT'
  | 'STRIPE_TOP_UP'
  | 'PROMOTIONAL_CREDIT'
  | 'ADMIN_TEST_CREDIT'
  | 'ORDER_RESERVATION'
  | 'ORDER_CHARGE'
  | 'ORDER_REFUND'
  | 'PROMOTIONAL_CREDIT_EXPIRED'
  | 'ADMIN_ADJUSTMENT'
  | 'PAYMENT_REFUND';

export interface BalanceLedgerEntry {
  id: string;
  userId: string;
  type: LedgerEntryType;
  amountCents: number;
  balanceAfterCents: number;
  orderId?: string;
  generationJobId?: string;
  paymentId?: string;
  quoteId?: string;
  relatedTransactionId?: string;
  description: string;
  idempotencyKey: string;
  /** True for promotional / test credit that cannot be withdrawn */
  isPromotional?: boolean;
  expiresAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface UserBalance {
  userId: string;
  /** Spendable balance in cents (includes promotional credit) */
  balanceCents: number;
  promotionalCents: number;
  updatedAt: string;
}
