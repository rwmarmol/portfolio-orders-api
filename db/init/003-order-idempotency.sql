-- 003: idempotent order creation (see D14 in docs/decisions.md).
-- A client may send a `clientOrderId` with an order. A retry with the same id for the same user
-- returns the original order instead of creating a second one. The column is optional, so
-- existing rows and clients that send no id are unaffected.
--
-- Runs automatically after 002 the first time the local compose database starts. To apply it to
-- an existing database:
--   psql -v ON_ERROR_STOP=1 --single-transaction -f db/init/003-order-idempotency.sql
--
-- Rollback (manual):
--   DROP INDEX orders_userid_clientorderid_key;
--   ALTER TABLE orders DROP COLUMN clientorderid;

ALTER TABLE orders
  ADD COLUMN clientorderid VARCHAR(64);

-- Partial unique index: the uniqueness guard applies only to orders that carry an id, and it also
-- serves the lookup of an existing order by (user, id).
CREATE UNIQUE INDEX orders_userid_clientorderid_key
  ON orders (userid, clientorderid)
  WHERE clientorderid IS NOT NULL;
