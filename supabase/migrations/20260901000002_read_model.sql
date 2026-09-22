-- =============================================================================
-- Afirmative Pill · Migración 2: READ MODEL (lado de consultas de CQRS)
-- -----------------------------------------------------------------------------
-- Tablas desnormalizadas, pobladas EXCLUSIVAMENTE por el proyector a partir de
-- los eventos de dominio. Están optimizadas para las pantallas:
--   * medication_catalog  -> búsqueda facetada / tarjetas / ficha técnica
--   * order_summary       -> resumen de la orden (total, estado, receta)
--   * order_line_view     -> detalle de ítems (snapshot de precio y nombre)
--   * order_timeline      -> historial de estados (para la UI en tiempo real)
--   * cart_view / cart_line_view -> proyección síncrona del carrito
-- =============================================================================

-- En Supabase las extensiones viven en el esquema "extensions"; lo incluimos en
-- el search_path para que gin_trgm_ops se resuelva en ambos entornos.
set search_path to public, extensions;
create extension if not exists pg_trgm;

create schema if not exists read_model;

create table if not exists read_model.laboratory_view (
  id          uuid primary key,
  name        text not null,
  country     text not null
);

create table if not exists read_model.category_view (
  id                uuid primary key,
  name              text not null,
  slug              text not null unique,
  description       text,
  medication_count  integer not null default 0
);

create table if not exists read_model.medication_catalog (
  id                     uuid primary key,
  sku                    text not null,
  commercial_name        text not null,
  active_ingredient      text not null,
  concentration          text not null,
  dosage_form            text not null,
  presentation           text not null,
  price                  numeric(12, 2) not null,
  stock_available        integer not null,
  availability           text not null check (availability in ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK')),
  requires_prescription  boolean not null,
  laboratory_id          uuid not null,
  category_id            uuid not null,
  indications            text not null,
  contraindications      text not null,
  -- Texto normalizado (minúsculas, sin tildes) calculado por el proyector
  -- con nombre comercial + principio activo + laboratorio + categoría.
  search_text            text not null,
  updated_at             timestamptz not null default now()
);

-- Búsqueda por subcadena (ILIKE '%...%') acelerada con trigramas.
create index if not exists medication_catalog_search_trgm_idx
  on read_model.medication_catalog using gin (search_text gin_trgm_ops);
create index if not exists medication_catalog_active_ingredient_trgm_idx
  on read_model.medication_catalog using gin (lower(active_ingredient) gin_trgm_ops);
-- Filtros facetados + orden por defecto.
create index if not exists medication_catalog_category_name_idx
  on read_model.medication_catalog (category_id, commercial_name);
create index if not exists medication_catalog_laboratory_idx
  on read_model.medication_catalog (laboratory_id);
create index if not exists medication_catalog_name_idx
  on read_model.medication_catalog (commercial_name);
create index if not exists medication_catalog_price_idx
  on read_model.medication_catalog (price);
create index if not exists medication_catalog_rx_idx
  on read_model.medication_catalog (requires_prescription);

create table if not exists read_model.cart_view (
  id          uuid primary key,
  status      text not null,
  updated_at  timestamptz not null
);

create table if not exists read_model.cart_line_view (
  cart_id        uuid not null references read_model.cart_view(id) on delete cascade,
  medication_id  uuid not null,
  quantity       integer not null,
  added_at       timestamptz not null,
  primary key (cart_id, medication_id)
);

create table if not exists read_model.order_summary (
  id                       uuid primary key,
  status                   text not null,
  status_reason            text,
  customer_name            text not null,
  customer_email           text not null,
  total                    numeric(14, 2) not null,
  item_count               integer not null,
  requires_prescription    boolean not null,
  prescription_number      text,
  prescription_doctor      text,
  prescription_license     text,
  prescription_issued_at   date,
  prescription_status      text not null,
  prescription_rejection   text,
  placed_at                timestamptz not null,
  updated_at               timestamptz not null,
  -- Último evento aplicado: permite idempotencia y exponer "versión" a la UI.
  last_event_id            bigint not null
);

create index if not exists order_summary_status_idx on read_model.order_summary (status, placed_at desc);
create index if not exists order_summary_email_idx  on read_model.order_summary (lower(customer_email), placed_at desc);
create index if not exists order_summary_placed_idx on read_model.order_summary (placed_at desc);

create table if not exists read_model.order_line_view (
  order_id         uuid not null references read_model.order_summary(id) on delete cascade,
  medication_id    uuid not null,
  commercial_name  text not null,
  presentation     text not null,
  quantity         integer not null,
  unit_price       numeric(12, 2) not null,
  subtotal         numeric(14, 2) not null,
  primary key (order_id, medication_id)
);

create table if not exists read_model.order_timeline (
  id           bigserial primary key,
  order_id     uuid not null references read_model.order_summary(id) on delete cascade,
  event_id     bigint not null unique,
  status       text not null,
  note         text,
  occurred_at  timestamptz not null
);

create index if not exists order_timeline_order_idx on read_model.order_timeline (order_id, occurred_at);
