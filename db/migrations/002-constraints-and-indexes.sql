-- 002: constraints and indexes on the initial schema (see D8 in docs/decisions.md).
-- CHECK constraints are added NOT VALID and then validated: the validation scan holds a weaker
-- lock, so it is safe on a busy orders table.
--
-- Rollback (manual):
--   DROP INDEX marketdata_instrumentid_date_idx, orders_userid_status_idx;
--   ALTER TABLE orders DROP CONSTRAINT orders_size_check, DROP CONSTRAINT orders_status_check,
--     DROP CONSTRAINT orders_type_check, DROP CONSTRAINT orders_side_check;
--   ALTER TABLE instruments DROP CONSTRAINT instruments_ticker_key;

ALTER TABLE instruments
  ADD CONSTRAINT instruments_ticker_key UNIQUE (ticker);

ALTER TABLE orders
  ADD CONSTRAINT orders_side_check
    CHECK (side IN ('BUY', 'SELL', 'CASH_IN', 'CASH_OUT')) NOT VALID,
  ADD CONSTRAINT orders_type_check
    CHECK (type IN ('MARKET', 'LIMIT')) NOT VALID,
  ADD CONSTRAINT orders_status_check
    CHECK (status IN ('NEW', 'FILLED', 'REJECTED', 'CANCELLED')) NOT VALID,
  ADD CONSTRAINT orders_size_check
    CHECK (size > 0) NOT VALID;

ALTER TABLE orders
  VALIDATE CONSTRAINT orders_side_check,
  VALIDATE CONSTRAINT orders_type_check,
  VALIDATE CONSTRAINT orders_status_check,
  VALIDATE CONSTRAINT orders_size_check;

CREATE INDEX orders_userid_status_idx ON orders (userid, status);
CREATE INDEX marketdata_instrumentid_date_idx ON marketdata (instrumentid, date);
