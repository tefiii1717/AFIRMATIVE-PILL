# Configuración de Supabase (PostgreSQL)

## 1. Crear el proyecto

1. Entra a <https://supabase.com/dashboard> y crea un proyecto (región cercana, p. ej. `us-east-1`).
2. Guarda la contraseña de la base de datos.
3. Ve a **Project Settings → Database → Connection string → URI** y copia la cadena del **Session pooler** (puerto `5432`).
   > Usa *Session pooler* o la conexión directa, **no** el *Transaction pooler* (6543): los comandos usan transacciones con `SELECT … FOR UPDATE`, que necesitan una sesión estable.

## 2. Configurar el backend

```bash
cd backend
cp .env.example .env
```

Edita `.env`:

```dotenv
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
```

## 3. Crear el esquema y cargar el dataset

### Opción A: desde el backend (recomendada)

```bash
npm run db:setup      # = db:migrate (supabase/migrations/*.sql) + db:seed (supabase/seed.sql)
```

Salida esperada:

```
✔ 20260901000001_write_model.sql
✔ 20260901000002_read_model.sql
✔ 20260901000003_security.sql
✔ Seed aplicado: 50 medicamentos en write_model, 50 en read_model.medication_catalog
```

Ambos scripts son **idempotentes**: puedes ejecutarlos varias veces.

### Opción B: Supabase CLI

```bash
supabase link --project-ref <project-ref>
supabase db push                 # aplica supabase/migrations
psql "$DATABASE_URL" -f supabase/seed.sql
```

### Opción C: SQL Editor del dashboard

Pega y ejecuta, en orden, los tres archivos de `supabase/migrations/` y luego `supabase/seed.sql`.

## 4. Usar el dataset oficial del taller

El repositorio incluye `supabase/dataset/medications.csv` con 50 medicamentos reales del mercado colombiano (principio activo, presentación, laboratorio, precio, stock, requisito de fórmula, categoría, indicaciones y contraindicaciones). Para cargar el archivo entregado por el docente en su lugar:

```bash
cd backend
npm run db:generate-seed -- ../ruta/al/dataset_oficial.csv   # regenera supabase/seed.sql
npm run db:seed
```

El generador acepta encabezados en español o inglés (`nombre_comercial`/`commercial_name`, `principio_activo`/`active_ingredient`, `laboratorio`, `precio`, `stock`, `requiere_formula`/`requires_prescription`, `categoria`…) y precios con o sin separadores de miles.

## 5. Verificar

En el SQL Editor:

```sql
select count(*) from write_model.medications;          -- 50
select count(*) from read_model.medication_catalog;    -- 50

-- Índices del read model
select indexname, indexdef from pg_indexes where schemaname = 'read_model';

-- El índice trigram atiende la búsqueda por texto (con 50 filas el planner
-- prefiere un seq scan; se desactiva sólo para evidenciar que el índice sirve)
set enable_seqscan = off;
explain select id from read_model.medication_catalog where search_text like '%losartan%';
--  Bitmap Index Scan on medication_catalog_search_trgm_idx
```

## 6. Zero-REST también en Supabase

Supabase publica automáticamente una API REST (PostgREST) para el esquema `public`. En este proyecto:

- Las tablas viven en `write_model` y `read_model`, que **no** están expuestos por la API.
- La migración `…_security.sql` activa **RLS sin políticas** en todas las tablas y revoca los permisos de `anon` y `authenticated`.
- El frontend **nunca** usa `supabase-js` ni las llaves `anon`. Sólo el backend GraphQL conoce `DATABASE_URL`.

Para comprobarlo, una petición a `https://<project-ref>.supabase.co/rest/v1/medications` con la `anon key` no devuelve datos del proyecto.
