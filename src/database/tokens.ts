/** Injection token of the shared pg Pool. Kept apart from the module to avoid import cycles. */
export const PG_POOL = Symbol('PG_POOL');
