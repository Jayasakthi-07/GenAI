-- Trigram (pg_trgm) indexes made every write to these tables load a native PostgreSQL library.
-- Windows Smart App Control / application-control policies can block that library, which breaks
-- inserts and updates. The tables are small (hundreds of rows), so ILIKE without them is fast.
DROP INDEX IF EXISTS "products_search_trgm";
DROP INDEX IF EXISTS "suppliers_name_trgm";
DROP INDEX IF EXISTS "customers_name_trgm";
