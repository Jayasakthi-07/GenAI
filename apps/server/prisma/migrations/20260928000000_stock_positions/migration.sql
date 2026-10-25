-- Goods leaving stock for internal use, samples or promotions.
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'ISSUE' AFTER 'RETURN';

-- One definition of a stock position (product × warehouse), shared by lists, alerts, agents and the dashboard.
--   available      on hand − reserved
--   on_order       remaining quantity on approved / sent / partially received POs
--   state          OUT · LOW (at/below reorder point, not covered by open POs) · ON_ORDER (covered) · OVER (> 2× max) · OK
--   avg_daily_demand / days_of_cover use the last 28 days of sales in the organization's timezone.
CREATE VIEW "v_stock_positions" AS
WITH open_po AS (
  SELECT pol.product_id, po.warehouse_id,
         SUM(GREATEST(pol.quantity_ordered - pol.quantity_received - pol.quantity_rejected, 0))::int AS qty
  FROM purchase_order_lines pol
  JOIN purchase_orders po ON po.id = pol.purchase_order_id
  WHERE po.status IN ('APPROVED', 'SENT', 'PARTIALLY_RECEIVED')
  GROUP BY 1, 2
), demand AS (
  SELECT product_id, warehouse_id, SUM(quantity)::numeric / 28 AS avg_daily
  FROM sales_daily
  WHERE date > (now() AT TIME ZONE COALESCE((SELECT timezone FROM organizations ORDER BY created_at LIMIT 1), 'Asia/Kolkata'))::date - 28
  GROUP BY 1, 2
)
SELECT
  sl.id,
  sl.product_id,
  sl.warehouse_id,
  sl.on_hand,
  sl.reserved,
  sl.on_hand - sl.reserved AS available,
  COALESCE(o.qty, 0) AS on_order,
  COALESCE(sl.reorder_point, p.reorder_point) AS reorder_point,
  COALESCE(sl.safety_stock, p.safety_stock) AS safety_stock,
  COALESCE(sl.max_stock, p.max_stock) AS max_stock,
  sl.avg_cost,
  ROUND(sl.on_hand * sl.avg_cost, 2) AS value,
  COALESCE(d.avg_daily, 0)::float8 AS avg_daily_demand,
  CASE WHEN COALESCE(d.avg_daily, 0) > 0 THEN (GREATEST(sl.on_hand - sl.reserved, 0) / d.avg_daily)::float8 END AS days_of_cover,
  CASE
    WHEN sl.on_hand - sl.reserved <= 0 THEN 'OUT'
    WHEN COALESCE(sl.reorder_point, p.reorder_point) IS NOT NULL
         AND sl.on_hand - sl.reserved + COALESCE(o.qty, 0) <= COALESCE(sl.reorder_point, p.reorder_point) THEN 'LOW'
    WHEN COALESCE(sl.reorder_point, p.reorder_point) IS NOT NULL
         AND sl.on_hand - sl.reserved <= COALESCE(sl.reorder_point, p.reorder_point) THEN 'ON_ORDER'
    WHEN COALESCE(sl.max_stock, p.max_stock) IS NOT NULL
         AND sl.on_hand > 2 * COALESCE(sl.max_stock, p.max_stock) THEN 'OVER'
    ELSE 'OK'
  END AS state,
  sl.last_movement_at,
  sl.updated_at
FROM stock_levels sl
JOIN products p ON p.id = sl.product_id
LEFT JOIN open_po o ON o.product_id = sl.product_id AND o.warehouse_id = sl.warehouse_id
LEFT JOIN demand d ON d.product_id = sl.product_id AND d.warehouse_id = sl.warehouse_id;

-- Hot paths added with the Phase 2 screens.
CREATE INDEX IF NOT EXISTS "purchase_order_lines_open_idx" ON "purchase_order_lines" ("product_id", "purchase_order_id");
CREATE INDEX IF NOT EXISTS "sales_daily_product_date_idx" ON "sales_daily" ("product_id", "date");
CREATE INDEX IF NOT EXISTS "stock_movements_product_occurred_idx" ON "stock_movements" ("product_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_entity_created_idx" ON "audit_logs" ("entity_type", "entity_id", "created_at" DESC);
