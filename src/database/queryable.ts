import type { Pool } from 'pg';

/** Anything that can run a query: the pool itself or a client inside a transaction. */
export type Queryable = Pick<Pool, 'query'>;
