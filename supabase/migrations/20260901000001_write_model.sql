-- =============================================================================
-- Afirmative Pill · Migración 1: WRITE MODEL (lado de comandos de CQRS)
-- -----------------------------------------------------------------------------
-- Este esquema es la fuente de verdad transaccional. Sólo lo modifican los
-- command handlers del backend (mutations GraphQL). Ninguna query de lectura
-- del catálogo ni de órdenes debe consultar estas tablas directamente: para eso
-- existe el esquema read_model (ver migración 2).
--
-- Se usan esquemas propios (write_model / read_model) en lugar de "public" para
-- que la API REST automática de Supabase (PostgREST) NO los exponga: el canal
-- cliente-servidor es exclusivamente GraphQL (Zero-REST Mandate).
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists write_model;

-- -----------------------------------------------------------------------------
-- Datos maestros
-- -----------------------------------------------------------------------------
create table if not exists write_model.laboratories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  country     text not null,
  created_at  timestamptz not null default now()
);

create table if not exists write_model.therapeutic_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists write_model.medications (
  id                     uuid primary key default gen_random_uuid(),
  sku                    text not null unique,
  commercial_name        text not null,
  active_ingredient      text not null,
  concentration          text not null,
  dosage_form            text not null,
  presentation           text not null,
  laboratory_id          uuid not null references write_model.laboratories(id),
  category_id            uuid not null references write_model.therapeutic_categories(id),
  price                  numeric(12, 2) not null check (price > 0),
  -- Invariante de inventario protegida también a nivel de base de datos:
  -- jamás puede quedar stock negativo aunque falle la lógica de aplicación.
  stock                  integer not null check (stock >= 0),
  requires_prescription  boolean not null default false,
  indications            text not null default '',
  contraindications      text not null default '',
  version                integer not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists medications_laboratory_idx on write_model.medications (laboratory_id);
create index if not exists medications_category_idx   on write_model.medications (category_id);

-- -----------------------------------------------------------------------------
-- Carrito (agregado de sesión)
-- -----------------------------------------------------------------------------
create table if not exists write_model.carts (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'OPEN' check (status in ('OPEN', 'CHECKED_OUT')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists write_model.cart_items (
  cart_id        uuid not null references write_model.carts(id) on delete cascade,
  medication_id  uuid not null references write_model.medications(id),
  quantity       integer not null check (quantity > 0),
  added_at       timestamptz not null default now(),
  primary key (cart_id, medication_id)
);

-- -----------------------------------------------------------------------------
-- Órdenes
-- -----------------------------------------------------------------------------
create table if not exists write_model.orders (
  id                     uuid primary key default gen_random_uuid(),
  cart_id                uuid unique references write_model.carts(id),
  customer_name          text not null,
  customer_email         text not null,
  status                 text not null check (status in ('PENDING_APPROVAL', 'APPROVED', 'DISPATCHED', 'CANCELLED')),
  status_reason          text,
  total                  numeric(14, 2) not null check (total >= 0),
  requires_prescription  boolean not null default false,
  version                integer not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists orders_status_idx on write_model.orders (status);

create table if not exists write_model.order_items (
  order_id               uuid not null references write_model.orders(id) on delete cascade,
  medication_id          uuid not null references write_model.medications(id),
  quantity               integer not null check (quantity > 0),
  unit_price             numeric(12, 2) not null check (unit_price > 0),
  requires_prescription  boolean not null,
  primary key (order_id, medication_id)
);

create table if not exists write_model.prescriptions (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null unique references write_model.orders(id) on delete cascade,
  prescription_number  text not null,
  doctor_name          text not null,
  doctor_license       text not null,
  patient_document     text not null,
  issued_at            date not null,
  status               text not null default 'PENDING_VERIFICATION'
                         check (status in ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED')),
  rejection_reason     text,
  created_at           timestamptz not null default now(),
  verified_at          timestamptz
);

-- -----------------------------------------------------------------------------
-- Outbox de eventos de dominio
-- -----------------------------------------------------------------------------
-- Cada comando escribe, en la MISMA transacción, los eventos que produjo.
-- El proyector (backend/src/events/projector.ts) los consume de forma
-- asíncrona para actualizar el read_model => consistencia eventual garantizada
-- sin "dual writes".
create table if not exists write_model.domain_events (
  id              bigserial primary key,
  aggregate_type  text not null,
  aggregate_id    uuid not null,
  event_type      text not null,
  payload         jsonb not null,
  occurred_at     timestamptz not null default now(),
  processed_at    timestamptz
);

create index if not exists domain_events_pending_idx
  on write_model.domain_events (id) where processed_at is null;
create index if not exists domain_events_aggregate_idx
  on write_model.domain_events (aggregate_id, id);
