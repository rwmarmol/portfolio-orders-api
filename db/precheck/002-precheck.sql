-- Read-only pre-check for db/init/002-constraints-and-indexes.sql. Run it against a database
-- BEFORE applying 002 to it. Every query must return zero rows; any row is data (or an existing
-- object) that would make 002 fail or that other writers could trip over. Never run automatically.

-- 1. orders.side outside the allowed set
SELECT 'side' AS check_name, id, side AS value
FROM orders
WHERE side IS NULL OR side NOT IN ('BUY', 'SELL', 'CASH_IN', 'CASH_OUT');

-- 2. orders.type outside the allowed set
SELECT 'type' AS check_name, id, type AS value
FROM orders
WHERE type IS NULL OR type NOT IN ('MARKET', 'LIMIT');

-- 3. orders.status outside the allowed set
SELECT 'status' AS check_name, id, status AS value
FROM orders
WHERE status IS NULL OR status NOT IN ('NEW', 'FILLED', 'REJECTED', 'CANCELLED');

-- 4. orders.size null or not positive
SELECT 'size' AS check_name, id, size::text AS value
FROM orders
WHERE size IS NULL OR size <= 0;

-- 5. duplicate tickers
SELECT 'ticker' AS check_name, ticker AS value, count(*) AS occurrences
FROM instruments
GROUP BY ticker
HAVING count(*) > 1;

-- 6. objects that 002 creates already existing under the same names
SELECT 'constraint' AS check_name, conname AS value
FROM pg_constraint
WHERE conname IN ('instruments_ticker_key', 'orders_side_check', 'orders_type_check',
                  'orders_status_check', 'orders_size_check')
UNION ALL
SELECT 'index', indexname
FROM pg_indexes
WHERE indexname IN ('orders_userid_status_idx', 'marketdata_instrumentid_date_idx');
