-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('AI', 'RULE');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "AbcClass" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "XyzClass" AS ENUM ('X', 'Y', 'Z');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING_BALANCE', 'RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT', 'WRITE_OFF', 'TRANSFER_OUT', 'TRANSFER_IN', 'COUNT_CORRECTION');

-- CreateEnum
CREATE TYPE "ReasonDirection" AS ENUM ('IN', 'OUT', 'BOTH');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('RETAIL', 'WHOLESALE', 'ONLINE');

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('STORE', 'WHOLESALE', 'ONLINE');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CycleCountStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CountLineStatus" AS ENUM ('PENDING', 'COUNTED', 'ACCEPTED', 'RECOUNT');

-- CreateEnum
CREATE TYPE "ForecastMethod" AS ENUM ('HOLT_WINTERS', 'CROSTON_SBA', 'SES', 'MOVING_AVERAGE');

-- CreateEnum
CREATE TYPE "DemandPattern" AS ENUM ('SMOOTH', 'ERRATIC', 'INTERMITTENT', 'LUMPY');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK', 'OVERSTOCK', 'PROJECTED_STOCKOUT', 'EXPIRING_BATCH', 'DEMAND_SPIKE', 'ANOMALY', 'SUPPLIER_RISK', 'FORECAST_SHIFT', 'DEAD_STOCK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "Autonomy" AS ENUM ('OBSERVE', 'RECOMMEND', 'ACT');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('SCHEDULE', 'EVENT', 'MANUAL', 'CHAT', 'HANDOFF');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'NO_CHANGE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('AI', 'RULE_BASED');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('CONTEXT', 'ANALYSIS', 'LLM_CALL', 'TOOL_CALL', 'THINKING', 'VALIDATION_ERROR', 'HANDOFF', 'FINAL', 'ERROR');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CREATE_PURCHASE_ORDER', 'CREATE_TRANSFER', 'UPDATE_REORDER_PARAMS', 'CREATE_CYCLE_COUNT', 'MARKDOWN_PRICE', 'CHANGE_PREFERRED_SUPPLIER');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('OLLAMA', 'OPENAI_COMPATIBLE', 'GEMINI', 'MOCK');

-- CreateEnum
CREATE TYPE "ProviderHealth" AS ENUM ('CONNECTED', 'INVALID_KEY', 'RATE_LIMITED', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LlmCallStatus" AS ENUM ('SUCCESS', 'ERROR', 'RATE_LIMITED', 'TIMEOUT', 'INVALID_KEY', 'BUDGET_EXCEEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LlmPurpose" AS ENUM ('AGENT', 'CHAT', 'PROBE', 'CONNECTION_TEST', 'LATENCY_TEST');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('DAILY_BRIEFING', 'WEEKLY_SUMMARY');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "locale" TEXT NOT NULL DEFAULT 'en-IN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("key","year")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "page" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" UUID NOT NULL,
    "brand" TEXT,
    "unit_id" UUID NOT NULL,
    "cost_price" DECIMAL(14,2) NOT NULL,
    "selling_price" DECIMAL(14,2) NOT NULL,
    "mrp" DECIMAL(14,2),
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "image_path" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "track_expiry" BOOLEAN NOT NULL DEFAULT false,
    "shelf_life_days" INTEGER,
    "reorder_point" INTEGER,
    "safety_stock" INTEGER,
    "max_stock" INTEGER,
    "lead_time_days" INTEGER,
    "abc_class" "AbcClass",
    "xyz_class" "XyzClass",
    "classified_at" TIMESTAMPTZ(3),
    "preferred_supplier_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reorder_point" INTEGER,
    "safety_stock" INTEGER,
    "max_stock" INTEGER,
    "last_movement_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reason_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "direction" "ReasonDirection" NOT NULL,
    "applies_to" "MovementType"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reason_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "batch_id" UUID,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "reason_code_id" UUID,
    "reference" TEXT,
    "source_type" TEXT,
    "source_id" UUID,
    "note" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" UUID,
    "agent_run_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "batch_no" TEXT NOT NULL,
    "manufactured_on" DATE,
    "expiry_date" DATE,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_daily" (
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,
    "cogs" DECIMAL(14,2) NOT NULL,
    "orders" INTEGER NOT NULL,

    CONSTRAINT "sales_daily_pkey" PRIMARY KEY ("product_id","warehouse_id","date")
);

-- CreateTable
CREATE TABLE "inventory_snapshots" (
    "date" DATE NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "total_units" INTEGER NOT NULL,
    "total_value" DECIMAL(16,2) NOT NULL,
    "sku_count" INTEGER NOT NULL,
    "low_stock_count" INTEGER NOT NULL,
    "out_of_stock_count" INTEGER NOT NULL,

    CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("date","warehouse_id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "score" DECIMAL(5,2),
    "score_breakdown" JSONB,
    "risk_level" "RiskLevel",
    "scored_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_products" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "supplier_sku" TEXT,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "moq" INTEGER NOT NULL DEFAULT 1,
    "pack_size" INTEGER NOT NULL DEFAULT 1,
    "lead_time_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_date" DATE,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_total" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "rationale" TEXT,
    "created_by_type" "ActorType" NOT NULL,
    "created_by_id" UUID,
    "agent_run_id" UUID,
    "agent_action_id" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_ordered" INTEGER NOT NULL,
    "quantity_received" INTEGER NOT NULL DEFAULT 0,
    "quantity_rejected" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,
    "rationale" TEXT,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" "ActorType" NOT NULL,
    "received_by_id" UUID,
    "notes" TEXT,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "goods_receipt_id" UUID NOT NULL,
    "purchase_order_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_received" INTEGER NOT NULL,
    "quantity_rejected" INTEGER NOT NULL DEFAULT 0,
    "reject_reason" TEXT,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "batch_no" TEXT,
    "expiry_date" DATE,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "gstin" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "channel" "SalesChannel" NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilled_at" TIMESTAMPTZ(3),
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_by_type" "ActorType" NOT NULL,
    "created_by_id" UUID,
    "is_simulated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantity_fulfilled" INTEGER NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "from_warehouse_id" UUID NOT NULL,
    "to_warehouse_id" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "created_by_type" "ActorType" NOT NULL,
    "created_by_id" UUID,
    "agent_action_id" UUID,
    "shipped_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_lines" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batch_id" UUID,

    CONSTRAINT "transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_counts" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "CycleCountStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "due_date" DATE,
    "created_by_type" "ActorType" NOT NULL,
    "created_by_id" UUID,
    "agent_action_id" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cycle_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_count_lines" (
    "id" UUID NOT NULL,
    "cycle_count_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "expected_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER,
    "variance" INTEGER,
    "variance_value" DECIMAL(14,2),
    "status" "CountLineStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "counted_by_id" UUID,
    "counted_at" TIMESTAMPTZ(3),

    CONSTRAINT "cycle_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecasts" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID,
    "method" "ForecastMethod" NOT NULL,
    "demand_pattern" "DemandPattern" NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "history_days" INTEGER NOT NULL,
    "params" JSONB NOT NULL,
    "points" JSONB NOT NULL,
    "avg_daily_demand" DECIMAL(12,4) NOT NULL,
    "demand_std_dev" DECIMAL(12,4) NOT NULL,
    "mape" DECIMAL(7,2),
    "wape" DECIMAL(7,2),
    "is_latest" BOOLEAN NOT NULL DEFAULT true,
    "agent_run_id" UUID,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "explanation" TEXT,
    "explanation_source" "ContentSource" NOT NULL,
    "model_used" TEXT,
    "product_id" UUID,
    "warehouse_id" UUID,
    "supplier_id" UUID,
    "batch_id" UUID,
    "data" JSONB NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "agent_run_id" UUID,
    "snoozed_until" TIMESTAMPTZ(3),
    "acknowledged_by_id" UUID,
    "acknowledged_at" TIMESTAMPTZ(3),
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution" TEXT,
    "auto_resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "severity" "Severity",
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_definitions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "allowed_tools" TEXT[],
    "triggers" JSONB NOT NULL,
    "autonomy" "Autonomy" NOT NULL DEFAULT 'RECOMMEND',
    "model_override" JSONB,
    "limits" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "trigger" "RunTrigger" NOT NULL,
    "trigger_detail" JSONB,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "mode" "RunMode",
    "provider_key" TEXT,
    "model_id" TEXT,
    "parent_run_id" UUID,
    "fingerprint" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "duration_ms" INTEGER,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "tool_call_count" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "output" JSONB,
    "error" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_steps" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" "StepType" NOT NULL,
    "label" TEXT NOT NULL,
    "tool_name" TEXT,
    "input" JSONB,
    "output" JSONB,
    "content" TEXT,
    "reasoning" TEXT,
    "error" JSONB,
    "llm_call_id" UUID,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_ms" INTEGER,

    CONSTRAINT "agent_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" UUID NOT NULL,
    "run_id" UUID,
    "agent_id" UUID NOT NULL,
    "type" "ActionType" NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "rationale_source" "ContentSource" NOT NULL,
    "model_used" TEXT,
    "payload" JSONB NOT NULL,
    "edited_payload" JSONB,
    "expected_impact" JSONB NOT NULL,
    "data_used" JSONB NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "auto_executed" BOOLEAN NOT NULL DEFAULT false,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_reason" TEXT,
    "executed_at" TIMESTAMPTZ(3),
    "result" JSONB,
    "error" JSONB,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_configs" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "ProviderKind" NOT NULL,
    "display_name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_key_ciphertext" BYTEA,
    "api_key_last4" TEXT,
    "extra_headers_ciphertext" BYTEA,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL,
    "health" "ProviderHealth" NOT NULL DEFAULT 'UNKNOWN',
    "health_message" TEXT,
    "health_checked_at" TIMESTAMPTZ(3),
    "latency_ms" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_capabilities" (
    "provider_key" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "context_window" INTEGER,
    "source" TEXT NOT NULL,
    "probed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_capabilities_pkey" PRIMARY KEY ("provider_key","model_id")
);

-- CreateTable
CREATE TABLE "llm_calls" (
    "id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "purpose" "LlmPurpose" NOT NULL,
    "agent_key" TEXT,
    "run_id" UUID,
    "status" "LlmCallStatus" NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parts" JSONB,
    "run_id" UUID,
    "model_used" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "type" "ReportType" NOT NULL,
    "title" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "content" JSONB NOT NULL,
    "narrative_source" "ContentSource" NOT NULL,
    "model_used" TEXT,
    "run_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" UUID,
    "agent_key" TEXT,
    "agent_run_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_user_id_page_name_key" ON "saved_views"("user_id", "page", "name");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_abc_class_xyz_class_idx" ON "products"("abc_class", "xyz_class");

-- CreateIndex
CREATE INDEX "products_preferred_supplier_id_idx" ON "products"("preferred_supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "stock_levels_warehouse_id_idx" ON "stock_levels"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_product_id_warehouse_id_key" ON "stock_levels"("product_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "reason_codes_code_key" ON "reason_codes"("code");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_warehouse_id_occurred_at_idx" ON "stock_movements"("product_id", "warehouse_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_warehouse_id_occurred_at_idx" ON "stock_movements"("warehouse_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_type_occurred_at_idx" ON "stock_movements"("type", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_source_type_source_id_idx" ON "stock_movements"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "stock_movements_occurred_at_idx" ON "stock_movements"("occurred_at");

-- CreateIndex
CREATE INDEX "batches_product_id_warehouse_id_expiry_date_idx" ON "batches"("product_id", "warehouse_id", "expiry_date");

-- CreateIndex
CREATE INDEX "batches_expiry_date_idx" ON "batches"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "batches_product_id_warehouse_id_batch_no_key" ON "batches"("product_id", "warehouse_id", "batch_no");

-- CreateIndex
CREATE INDEX "sales_daily_date_idx" ON "sales_daily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "supplier_products_product_id_idx" ON "supplier_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_products_supplier_id_product_id_key" ON "supplier_products"("supplier_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_agent_action_id_key" ON "purchase_orders"("agent_action_id");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_order_date_idx" ON "purchase_orders"("supplier_id", "order_date");

-- CreateIndex
CREATE INDEX "purchase_orders_warehouse_id_status_idx" ON "purchase_orders"("warehouse_id", "status");

-- CreateIndex
CREATE INDEX "purchase_order_lines_purchase_order_id_idx" ON "purchase_order_lines"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_lines_product_id_idx" ON "purchase_order_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_number_key" ON "goods_receipts"("number");

-- CreateIndex
CREATE INDEX "goods_receipts_purchase_order_id_idx" ON "goods_receipts"("purchase_order_id");

-- CreateIndex
CREATE INDEX "goods_receipts_received_at_idx" ON "goods_receipts"("received_at");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_goods_receipt_id_idx" ON "goods_receipt_lines"("goods_receipt_id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchase_order_line_id_idx" ON "goods_receipt_lines"("purchase_order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_number_key" ON "sales_orders"("number");

-- CreateIndex
CREATE INDEX "sales_orders_status_idx" ON "sales_orders"("status");

-- CreateIndex
CREATE INDEX "sales_orders_order_date_idx" ON "sales_orders"("order_date");

-- CreateIndex
CREATE INDEX "sales_orders_customer_id_order_date_idx" ON "sales_orders"("customer_id", "order_date");

-- CreateIndex
CREATE INDEX "sales_orders_warehouse_id_order_date_idx" ON "sales_orders"("warehouse_id", "order_date");

-- CreateIndex
CREATE INDEX "sales_order_lines_sales_order_id_idx" ON "sales_order_lines"("sales_order_id");

-- CreateIndex
CREATE INDEX "sales_order_lines_product_id_idx" ON "sales_order_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_number_key" ON "transfers"("number");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_agent_action_id_key" ON "transfers"("agent_action_id");

-- CreateIndex
CREATE INDEX "transfers_status_idx" ON "transfers"("status");

-- CreateIndex
CREATE INDEX "transfer_lines_transfer_id_idx" ON "transfer_lines"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_counts_number_key" ON "cycle_counts"("number");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_counts_agent_action_id_key" ON "cycle_counts"("agent_action_id");

-- CreateIndex
CREATE INDEX "cycle_counts_status_idx" ON "cycle_counts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_count_lines_cycle_count_id_product_id_key" ON "cycle_count_lines"("cycle_count_id", "product_id");

-- CreateIndex
CREATE INDEX "forecasts_product_id_is_latest_idx" ON "forecasts"("product_id", "is_latest");

-- CreateIndex
CREATE INDEX "forecasts_generated_at_idx" ON "forecasts"("generated_at");

-- CreateIndex
CREATE INDEX "alerts_status_severity_created_at_idx" ON "alerts"("status", "severity", "created_at");

-- CreateIndex
CREATE INDEX "alerts_product_id_idx" ON "alerts"("product_id");

-- CreateIndex
CREATE INDEX "alerts_type_status_idx" ON "alerts"("type", "status");

-- CreateIndex
CREATE INDEX "alerts_dedupe_key_idx" ON "alerts"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_definitions_key_key" ON "agent_definitions"("key");

-- CreateIndex
CREATE INDEX "agent_runs_agent_id_created_at_idx" ON "agent_runs"("agent_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");

-- CreateIndex
CREATE INDEX "agent_runs_parent_run_id_idx" ON "agent_runs"("parent_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_steps_run_id_seq_key" ON "agent_steps"("run_id", "seq");

-- CreateIndex
CREATE INDEX "agent_actions_status_created_at_idx" ON "agent_actions"("status", "created_at");

-- CreateIndex
CREATE INDEX "agent_actions_agent_id_created_at_idx" ON "agent_actions"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_actions_dedupe_key_idx" ON "agent_actions"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "provider_configs_key_key" ON "provider_configs"("key");

-- CreateIndex
CREATE INDEX "llm_calls_started_at_idx" ON "llm_calls"("started_at");

-- CreateIndex
CREATE INDEX "llm_calls_provider_key_started_at_idx" ON "llm_calls"("provider_key", "started_at");

-- CreateIndex
CREATE INDEX "llm_calls_run_id_idx" ON "llm_calls"("run_id");

-- CreateIndex
CREATE INDEX "chat_conversations_user_id_updated_at_idx" ON "chat_conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_type_created_at_idx" ON "reports"("type", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_agent_run_id_idx" ON "audit_logs"("agent_run_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_preferred_supplier_id_fkey" FOREIGN KEY ("preferred_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_code_id_fkey" FOREIGN KEY ("reason_code_id") REFERENCES "reason_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_daily" ADD CONSTRAINT "sales_daily_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_count_lines" ADD CONSTRAINT "cycle_count_lines_cycle_count_id_fkey" FOREIGN KEY ("cycle_count_id") REFERENCES "cycle_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_count_lines" ADD CONSTRAINT "cycle_count_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────── Hand-written constraints ───────────────────────────
-- Prisma can't express these; they are the database-level backstop for service invariants.

-- Stock can never go negative, and reservations can't exceed what is on hand.
ALTER TABLE "stock_levels"
  ADD CONSTRAINT "stock_levels_on_hand_nonneg" CHECK ("on_hand" >= 0),
  ADD CONSTRAINT "stock_levels_reserved_valid" CHECK ("reserved" >= 0 AND "reserved" <= "on_hand");
ALTER TABLE "batches" ADD CONSTRAINT "batches_quantity_nonneg" CHECK ("quantity" >= 0);
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_nonzero" CHECK ("quantity" <> 0),
  ADD CONSTRAINT "stock_movements_balance_nonneg" CHECK ("balance_after" >= 0);

-- Order quantities.
ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "po_lines_qty_positive" CHECK ("quantity_ordered" > 0),
  ADD CONSTRAINT "po_lines_received_valid" CHECK (
    "quantity_received" >= 0 AND "quantity_rejected" >= 0
    AND "quantity_received" + "quantity_rejected" <= "quantity_ordered"
  );
ALTER TABLE "sales_order_lines"
  ADD CONSTRAINT "so_lines_qty_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "so_lines_fulfilled_valid" CHECK ("quantity_fulfilled" >= 0 AND "quantity_fulfilled" <= "quantity");
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_distinct_warehouses" CHECK ("from_warehouse_id" <> "to_warehouse_id");

-- Prices.
ALTER TABLE "products"
  ADD CONSTRAINT "products_prices_nonneg" CHECK ("cost_price" >= 0 AND "selling_price" >= 0),
  ADD CONSTRAINT "products_tax_rate_valid" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100);
ALTER TABLE "supplier_products"
  ADD CONSTRAINT "supplier_products_valid" CHECK ("unit_cost" >= 0 AND "moq" >= 1 AND "pack_size" >= 1 AND "lead_time_days" >= 0);

-- Only one open alert / pending proposal per dedupe key (duplicates are refused, not just avoided in code).
CREATE UNIQUE INDEX "alerts_open_dedupe_key" ON "alerts" ("dedupe_key") WHERE "status" <> 'RESOLVED';
CREATE UNIQUE INDEX "agent_actions_open_dedupe_key" ON "agent_actions" ("dedupe_key") WHERE "status" IN ('PENDING', 'APPROVED');

-- At most one default warehouse.
CREATE UNIQUE INDEX "warehouses_single_default" ON "warehouses" ("is_default") WHERE "is_default";

-- Fast "contains" search for the products table, the command palette and agent tools.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "products_search_trgm" ON "products" USING gin ("name" gin_trgm_ops, "sku" gin_trgm_ops);
CREATE INDEX "suppliers_name_trgm" ON "suppliers" USING gin ("name" gin_trgm_ops);
CREATE INDEX "customers_name_trgm" ON "customers" USING gin ("name" gin_trgm_ops);
