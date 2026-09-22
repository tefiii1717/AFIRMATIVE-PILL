<!-- Generado por scripts/build-readme.mjs a partir de docs/README.template.md. Edita la plantilla. -->
# Afirmative Pill 💊

**E-commerce farmacéutico con GraphQL (Apollo) + CQRS + Supabase PostgreSQL**

Taller práctico avanzado de Ingeniería de Software: *Arquitectura de software basada en GraphQL y CQRS*.

| Pilar | Implementación |
|---|---|
| **Zero-REST** | Único endpoint `/graphql` (HTTP para queries/mutations, WebSocket para subscriptions). Sin rutas `/api` en Next.js ni controladores REST. En Supabase, las tablas tampoco están expuestas por la API REST automática. |
| **Ecosistema Apollo** | Backend: Apollo Server 5 (monolito modular) sobre Express. Frontend: Next.js 16 + React 19 + Apollo Client 4 con `<ApolloProvider>` en el árbol raíz. |
| **CQRS** | `write_model` (comandos transaccionales + outbox de eventos) separado de `read_model` (proyecciones desnormalizadas por pantalla). Consistencia eventual visible y gestionada en la UI. |
| **N+1** | 10 DataLoaders por request con batching (`= ANY($1)`) y caché por request. Evidencia en logs y en un test automatizado. |
| **Tiempo real** | `orderUpdated`, `ordersFeed` y `medicationStockChanged` por `graphql-ws`. |

![Catálogo](docs/img/catalogo.png)

---

## Contenido

1. [Arquitectura](#1-arquitectura)
2. [Cómo ejecutarlo](#2-cómo-ejecutarlo)
3. [Estructura del repositorio](#3-estructura-del-repositorio)
4. [Aplicación de CQRS](#4-aplicación-de-cqrs)
5. [Mitigación del problema N+1](#5-mitigación-del-problema-n1)
6. [Decisiones de diseño del schema](#6-decisiones-de-diseño-del-schema)
7. [Frontend: Apollo Client y caché](#7-frontend-apollo-client-y-caché)
8. [Persistencia en Supabase](#8-persistencia-en-supabase)
9. [Pruebas y evidencias](#9-pruebas-y-evidencias)
10. [Schema SDL completo](#10-schema-sdl-completo-schemagraphql)

Documentación complementaria:

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): diagramas de secuencia y ER, eventos y ADRs.
- [`docs/SUPABASE.md`](docs/SUPABASE.md): configuración paso a paso de Supabase.
- [`docs/GUIA_SUSTENTACION.md`](docs/GUIA_SUSTENTACION.md): guion del video minuto a minuto.
- [`docs/operaciones-ejemplo.graphql`](docs/operaciones-ejemplo.graphql): operaciones listas para Apollo Sandbox.

---

## 1. Arquitectura

```mermaid
flowchart LR
    subgraph FE["Frontend · Next.js + React"]
        direction TB
        P["Páginas<br/>useQuery · useMutation · useSubscription"]
        AP["ApolloProvider (contexto raíz)<br/>InMemoryCache normalizada"]
        SPL{"split"}
        P --> AP --> SPL
    end

    subgraph BE["Backend · Apollo Server 5"]
        direction TB
        EP["/graphql"]
        subgraph Q["QUERY (lectura)"]
            QR["Query resolvers"] --> DL["DataLoaders<br/>batch + caché por request"]
        end
        subgraph C["COMMAND (escritura)"]
            MR["Mutation resolvers"] --> CB["Command bus<br/>transacción + invariantes"]
        end
        PRJ["Proyector<br/>outbox → read model"]
        SAGA["Saga verificación<br/>de fórmula"]
        PS["PubSub → Subscription resolvers"]
        EP --> QR
        EP --> MR
    end

    subgraph DB["Supabase PostgreSQL"]
        direction TB
        W[("write_model<br/>+ domain_events (outbox)")]
        R[("read_model<br/>proyecciones")]
    end

    SPL -- "HTTP POST" --> EP
    SPL -- "WebSocket" --> EP
    DL -- "SELECT … WHERE id = ANY($1)" --> R
    CB -- "BEGIN … FOR UPDATE … COMMIT" --> W
    W -- "eventos" --> PRJ
    PRJ --> R
    PRJ --> PS --> EP
    PRJ --> SAGA -- "approveOrder / cancelOrder" --> CB
```

<details>
<summary>Versión en texto (si tu visor no renderiza Mermaid)</summary>

```
┌──────────────── Navegador ────────────────┐
│ Next.js + React                           │
│  páginas ─ hooks Apollo ─ <ApolloProvider>│
│          InMemoryCache (normalizada)      │
│      HttpLink ──┐        ┌── GraphQLWsLink│
└─────────────────┼────────┼────────────────┘
          POST /graphql   WS /graphql
┌─────────────────▼────────▼────────────────┐
│ Apollo Server 5 (Express + graphql-ws)    │
│  Query resolvers ──► DataLoaders ──┐      │
│  Mutation resolvers ──► Command bus│      │
│  Subscription ◄── PubSub ◄── Proyector    │
│                    Saga ◄──┘  ▲           │
└──────────────────────┼────────┼───┼───────┘
                       │        │   │
┌──────────── Supabase PostgreSQL ▼───▼─────┐
│ write_model (+ outbox domain_events)      │
│ read_model  (medication_catalog, order_…) │
└───────────────────────────────────────────┘
```
</details>

**Flujo del Escenario B/C, resumido:** `placeOrder` valida las invariantes y reserva stock en **una** transacción del `write_model`, y en esa misma transacción escribe los eventos `OrderPlaced` y `StockReserved` en el outbox. Responde de inmediato con un `OrderReceipt`. Después, el **proyector** consume el outbox, actualiza el `read_model` y publica `orderUpdated`. La **saga** de verificación reacciona a `OrderPlaced` y emite un nuevo comando (`approveOrder` o `cancelOrder`), que vuelve a pasar por el mismo ciclo. El diagrama de secuencia completo está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md#2-flujo-de-un-comando-placeorder).

---

## 2. Cómo ejecutarlo

### Requisitos

- Node.js ≥ 20 (probado con 22)
- Una base PostgreSQL: **Supabase** (entrega) o PostgreSQL 14+ local (desarrollo)

### Paso a paso

```bash
# 1. Dependencias
npm run install:all               # instala backend/ y frontend/

# 2. Backend: configurar la conexión
cp backend/.env.example backend/.env
#   → DATABASE_URL = cadena del Session pooler de Supabase
#   → DATABASE_SSL = true  (Supabase)   |  false (Postgres local)
#   Guía detallada: docs/SUPABASE.md

# 3. Crear los esquemas y cargar los 50 medicamentos
npm run db:setup                  # migraciones + seed (idempotente)

# 4. Levantar (dos terminales)
npm run dev:backend               # http://localhost:4000/graphql  (Apollo Sandbox)
npm run dev:frontend              # http://localhost:3000
```

El frontend lee `frontend/.env.local` (ver `frontend/.env.example`). Por defecto apunta a `http://localhost:4000/graphql` y `ws://localhost:4000/graphql`.

<details>
<summary>PostgreSQL local con Docker (alternativa a Supabase para desarrollo)</summary>

```bash
docker run -d --name afirmative-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=afirmative_pill -p 5432:5432 postgres:16
# backend/.env → DATABASE_URL=postgresql://postgres:postgres@localhost:5432/afirmative_pill  DATABASE_SSL=false
npm run db:setup
```
</details>

### Variables del backend

| Variable | Por defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | — | Cadena de conexión PostgreSQL / Supabase. |
| `DATABASE_SSL` | `false` | `true` para Supabase. |
| `PORT` | `4000` | Puerto HTTP/WS. |
| `CORS_ORIGINS` | `http://localhost:3000` | Orígenes permitidos. |
| `PROJECTION_DELAY_MS` | `800` | Latencia artificial del proyector, para que la consistencia eventual sea visible en la demo. |
| `APPROVAL_DELAY_MS` | `4000` | Tiempo que tarda la saga en verificar la fórmula. |
| `AUTO_APPROVAL` | `true` | `false`: la aprobación se hace a mano desde `/admin`. |
| `LOG_SQL` / `LOG_DATALOADER` | `true` | Logs de cada consulta y de cada lote (evidencia N+1). |

### Scripts

| Comando (raíz) | Qué hace |
|---|---|
| `npm run db:setup` | Aplica `supabase/migrations/*.sql` y `supabase/seed.sql`. |
| `npm run db:generate-seed -- <csv>` | Regenera el seed desde otro CSV (p. ej. el dataset oficial). |
| `npm test` | 16 pruebas del backend (dominio, concurrencia, N+1). Requieren la BD. |
| `npm run typecheck` | TypeScript estricto en backend y frontend. |
| `npm run build` | Build de producción de ambos proyectos. |

### Guía rápida de la demo

1. **Catálogo** (`/`): busca “losartan”, filtra por categoría o por *Sólo con fórmula (Rx)*.
2. Abre una **ficha técnica** y agrega el medicamento al carrito.
3. **Carrito** (`/cart`): combina un OTC (Dolex) con un Rx (Amoxicilina). Aparece el formulario de fórmula médica.
4. **Paga**: verás “sincronizando…” (el recibo del comando) y luego la orden en *Pendiente de aprobación*. A los ~4 s pasa a **Aprobada** en tiempo real.
5. **Farmacia** (`/admin`): despacha la orden y la vista del pedido se actualiza sola.
6. Para ver un rechazo, usa un registro médico terminado en `000`: la orden se **cancela** y el stock se libera.

---

## 3. Estructura del repositorio

```
.
├── backend/
│   ├── schema.graphql                 ← contrato SDL (fuente única)
│   ├── src/
│   │   ├── index.ts                   ← arranque: servidor + proyector + saga
│   │   ├── server.ts                  ← Express + Apollo + graphql-ws (sólo /graphql)
│   │   ├── graphql/                   ← adaptadores: resolvers, scalars, depthLimit, paginación
│   │   │   └── resolvers/{query,mutation,subscription,types}.ts
│   │   ├── read/                      ← LADO DE LECTURA
│   │   │   ├── catalogReadRepository.ts
│   │   │   ├── orderReadRepository.ts
│   │   │   └── loaders.ts             ← DataLoaders
│   │   ├── write/                     ← LADO DE ESCRITURA
│   │   │   ├── commandBus.ts
│   │   │   ├── commands/{cartCommands,orderCommands}.ts
│   │   │   ├── domain/{order,errors}.ts   ← reglas puras (sin I/O)
│   │   │   └── prescriptionVerificationSaga.ts
│   │   ├── events/                    ← outbox, proyector, pubsub, tipos de eventos
│   │   ├── db/                        ← pool pg, transacciones, logging SQL
│   │   └── config/
│   ├── scripts/                       ← migrate, seed, generate-seed
│   └── test/                          ← node:test (dominio, comandos, dataloader)
├── frontend/
│   └── src/
│       ├── app/                       ← App Router: /, /medications/[id], /cart, /orders, /orders/[id], /admin
│       │   └── providers.tsx          ← <ApolloProvider> + <CartProvider>
│       ├── graphql/operations.ts      ← queries, mutations, subscriptions y fragmentos tipados
│       ├── lib/apollo.ts              ← ApolloClient: split HTTP/WS, typePolicies
│       └── components/
├── supabase/
│   ├── migrations/                    ← write_model, read_model (+ índices), seguridad (RLS)
│   ├── dataset/medications.csv        ← 50 medicamentos reales
│   └── seed.sql                       ← generado desde el CSV
└── docs/                              ← arquitectura, Supabase, guion del video, capturas
```

---

## 4. Aplicación de CQRS

### Segregación conceptual

| | Lado de comandos (Write) | Lado de consultas (Read) |
|---|---|---|
| Operaciones GraphQL | `Mutation.*` | `Query.*`, `Subscription.*` |
| Código | `backend/src/write/**` | `backend/src/read/**` |
| Esquema de BD | `write_model` (normalizado, con restricciones) | `read_model` (desnormalizado por pantalla) |
| Modelo | Agregados `Cart` y `Order` con reglas de dominio | Vistas: `medication_catalog`, `order_summary`, `order_line_view`, `order_timeline`… |
| Respuesta | Recibo del comando + errores tipados | Proyección |
| Consistencia | Fuerte (transacción ACID) | Eventual (ms), salvo el carrito |

**Regla estricta:** los resolvers de `Query` nunca leen `write_model` y los comandos nunca leen `read_model`. El único puente entre ambos es el **outbox de eventos** (`write_model.domain_events`).

### Comandos que expresan intención de negocio

`createCart`, `addItemToCart`, `changeCartItemQuantity`, `removeItemFromCart`, `placeOrder`, `approveOrder`, `dispatchOrder` y `cancelOrder`. No existen mutations CRUD genéricas (`updateOrder`, `setStock`): el stock sólo cambia como **consecuencia** de `placeOrder` (reserva) o `cancelOrder` (compensación).

### Invariantes farmacéuticas protegidas en el write model

| Invariante | Dónde se protege |
|---|---|
| Ítems con `requires_prescription = true` ⇒ la fórmula es obligatoria | `placeOrder` → `PrescriptionRequiredError` |
| Fórmula bien formada y vigente (≤ 30 días, no futura) | `validatePrescription` → `ValidationError` / `InvalidPrescriptionError` |
| Una orden con receta no pasa a `APPROVED` sin fórmula verificada | `approveOrder` |
| No se vende sin stock, ni siquiera bajo concurrencia | `SELECT … FOR UPDATE` en orden de `id` + `UPDATE … WHERE stock >= qty` + `CHECK (stock >= 0)` |
| Máquina de estados `PENDING_APPROVAL → APPROVED → DISPATCHED` (+ `CANCELLED`) | `checkTransition` → `InvalidStateTransitionError` |
| Un carrito sólo se convierte en orden una vez | `carts.status` + `orders.cart_id UNIQUE` → `CartNotOpenError` |
| Cancelar libera el inventario reservado | `cancelOrder` emite `StockReleased` (compensación) |

Si **cualquier** invariante falla, el command bus hace `ROLLBACK` y devuelve **todos** los errores juntos en el payload (p. ej. falta la fórmula *y* un ítem está agotado).

### Tratamiento de la consistencia eventual

*¿Qué ve el usuario mientras la orden se valida o el stock se sincroniza?*

1. **Inmediatamente después del comando:** `placeOrder` devuelve un `OrderReceipt` (`orderId`, `status`, `total`, `eventVersion`), que es lo que el write model sabe con certeza. La UI navega a `/orders/:id` y, si la proyección aún no existe (`order: null`), muestra el recibo con un aviso de **“sincronizando…”** y sondea cada segundo.
   ![Orden sincronizando](docs/img/orden-sincronizando.png)
2. **Proyección disponible:** se muestra la orden en `PENDING_APPROVAL` con *“Fórmula en verificación”*. El sondeo se detiene y la **suscripción `orderUpdated`** mantiene la vista al día.
3. **Aprobación asíncrona:** la saga (simula al químico farmacéutico) emite `approveOrder` o `cancelOrder`. El cambio llega por WebSocket; Apollo normaliza `Order:<id>` y la vista se re-renderiza sola.
   ![Orden aprobada](docs/img/orden-aprobada.png)
4. **Versión de la proyección:** `Order.projectionVersion` (id del último evento aplicado) frente a `OrderReceipt.eventVersion` indica si la proyección ya refleja el comando.
5. **Stock del catálogo:** el catálogo muestra `stockAvailable` proyectado, que puede ir unos ms detrás. **Esto nunca provoca sobreventa**, porque `placeOrder` valida contra el `write_model` con bloqueo de fila; en el peor caso el paciente recibe un `InsufficientStockError` con la cantidad real disponible. Además, la suscripción `medicationStockChanged` actualiza las tarjetas en vivo.
6. **Carrito (excepción deliberada):** su proyección es **síncrona** (misma transacción) porque el paciente necesita *read-your-writes* al armar el pedido.

---

## 5. Mitigación del problema N+1

Consultas como el catálogo con `laboratory` y `category`, o una orden con `items { medication }`, harían **1 + N** consultas si cada resolver anidado fuera a la BD por separado. Cada request crea sus propios **DataLoaders** (`backend/src/read/loaders.ts`):

| Loader | Relación | Consulta en lote |
|---|---|---|
| `medicationById` | `OrderItem.medication`, `CartItem.medication`, errores | `… WHERE id = ANY($1)` |
| `laboratoryById` | `Medication.laboratory` | `… laboratory_view WHERE id = ANY($1)` |
| `categoryById` | `Medication.category` | `… category_view WHERE id = ANY($1)` |
| `clinicalInfoByMedicationId` | `Medication.clinicalInfo` (columnas pesadas bajo demanda) | `… WHERE id = ANY($1)` |
| `medicationsByLaboratoryId` | `Laboratory.medications` (1:N) | `row_number() OVER (PARTITION BY laboratory_id)` |
| `orderLinesByOrderId`, `orderTimelineByOrderId` | `Order.items`, `Order.timeline` (1:N) | `… WHERE order_id = ANY($1)` |
| `orderById`, `cartById`, `cartLinesByCartId` | raíces y carrito | `… WHERE id = ANY($1)` |

- **Batching:** las claves pedidas en el mismo tick se agrupan en **una** consulta.
- **Caché por request:** un laboratorio que aparece en 5 medicamentos se consulta una sola vez; crear los loaders en cada request evita datos obsoletos o compartidos entre usuarios.
- **Suscripciones:** en cada evento se reinician los loaders (`ctx.resetLoaders()`), para no servir datos de un evento anterior dentro de una suscripción larga.

**Evidencia en los logs del servidor** (`LOG_DATALOADER=true`) para 12 medicamentos con laboratorio y categoría:

```
SQL     select … from read_model.medication_catalog … | rows=12 | 2.9ms
LOADER  laboratoryById: 7 clave(s) agrupadas -> 1 consulta SQL
LOADER  categoryById: 9 clave(s) agrupadas -> 1 consulta SQL
SQL     select id, name, country from read_model.laboratory_view where id = any($1::uuid[]) | rows=7
SQL     select id, name, slug, … from read_model.category_view where id = any($1::uuid[]) | rows=9
SERVER  [0a44f558] query CatalogWithRelations (18ms)
```

Son **3 consultas** en lugar de 1 + 12 + 12 = 25. El test `backend/test/dataloader.test.ts` lo verifica: el catálogo con `laboratory`, `category` y `clinicalInfo` usa **4 consultas tanto para 5 como para 50 medicamentos** (sin DataLoader serían 151).

---

## 6. Decisiones de diseño del schema

| Decisión | Justificación |
|---|---|
| **Scalars personalizados** `Money`, `DateTime`, `Date`, `PositiveInt`, `Email` | La validación vive en el contrato: una cantidad `0` o un correo inválido se rechazan antes de llegar al dominio. `Money` redondea a 2 decimales (internamente se opera en centavos). |
| **Enums** `OrderStatus`, `StockAvailability`, `PrescriptionStatus`, `ErrorCode`… | Valores cerrados y autodocumentados; el cliente puede hacer `switch` exhaustivos. |
| **Mutations con nombre de intención** y un único argumento `input` | Cada mutation es un comando (`placeOrder`, no `createOrder`/`updateOrder`); el patrón `input` permite evolucionar sin romper clientes. |
| **Payloads** `{ resultado, errors: [UserError!]! }` | Los errores de negocio son **datos tipados**, no excepciones: la interfaz `UserError` tiene 8 implementaciones (`InsufficientStockError { requested, available, medication }`, `PrescriptionRequiredError { medications }`, `InvalidStateTransitionError { currentStatus, attemptedStatus }`…) con `code` estable y `path` al campo del input. |
| **`OrderReceipt` vs `Order`** | Las mutations de órdenes devuelven el acuse del write model y no la proyección, que todavía no existe al hacer COMMIT (CQRS honesto). `eventVersion`/`projectionVersion` conectan ambos mundos. |
| **`ClinicalInformation` como tipo separado** | Indicaciones y contraindicaciones (texto largo) se cargan con su propio DataLoader **sólo si el cliente las selecciona**. La vista condensada no las trae ni de la BD. |
| **Paginación tipo Relay** (`MedicationConnection`, `edges`, `pageInfo`, `totalCount`) | Estándar compatible con `fetchMore` y las `typePolicies` de Apollo; `first` acotado a 50. |
| **Interfaz `Node`** en entidades con identidad | Coherencia de identificadores globales y normalización en la caché del cliente. |
| **`Query.order` puede ser `null`** | Documenta explícitamente la consistencia eventual en el contrato. |
| **Subscriptions** para proyecciones | Se notifican cambios del *read model* (lo que el usuario ve), no eventos internos. |
| **Límite de profundidad = 8** | Protege frente a consultas recursivas (`laboratory → medications → laboratory…`). |

---

## 7. Frontend: Apollo Client y caché

- **`ApolloProvider` en la raíz** (`frontend/src/app/providers.tsx`, usado en `layout.tsx`): una sola instancia de `ApolloClient` y de su caché para toda la app.
- **Link dividido** (`lib/apollo.ts`): `ApolloLink.split` envía las subscriptions por `GraphQLWsLink` (graphql-ws) y el resto por `HttpLink`. Ambos contra `/graphql`.
- **Hooks idiomáticos:** `useQuery` (catálogo, ficha, carrito, orden, listas), `useMutation` (8 comandos) y `useSubscription` (orden, feed de farmacia, stock). Todas las vistas manejan `loading`, `error` y `data`.
- **Actualización inteligente de la caché tras mutations:**
  - Los comandos de carrito devuelven el `Cart` completo ⇒ la caché normalizada (`Cart:<id>`) se actualiza sola, **sin refetch** (p. ej. el contador del header).
  - `changeCartItemQuantity` y `removeItemFromCart` usan **`optimisticResponse`** con el carrito recalculado; si el servidor rechaza el comando, Apollo revierte la capa optimista.
  - Tras `placeOrder`, `cache.evict` + `cache.gc` eliminan el carrito cerrado.
  - Las proyecciones de órdenes llegan por suscripción con `id` ⇒ se fusionan en `Order:<id>`.
- **`typePolicies`:** paginación del catálogo y de las órdenes (`keyArgs` + `merge` para `fetchMore`); redirección `Query.medication → Medication:<id>`, para que la ficha se muestre al instante con los datos que ya trajo el catálogo; `keyFields: false` para los tipos embebidos.
- **`possibleTypes`** para que los fragmentos `... on InsufficientStockError` funcionen sobre la interfaz `UserError`.
- **Fragmentos por vista:** `MedicationCard` (condensado) frente a la ficha completa; el Network de DevTools muestra que cada respuesta trae **sólo** lo pedido.

| Carrito con fórmula médica | Panel de la farmacia |
|---|---|
| ![Carrito](docs/img/carrito.png) | ![Farmacia](docs/img/panel-farmacia.png) |

---

## 8. Persistencia en Supabase

- **Dataset:** `supabase/dataset/medications.csv` contiene **50 medicamentos reales** del mercado colombiano (14 laboratorios y 15 categorías terapéuticas), con principio activo, concentración, presentación, laboratorio, precio COP, stock y requisito de fórmula. Incluye casos límite para la demo: *Seretide* agotado y *Xarelto* con 3 unidades. Si el docente entrega otro CSV, `npm run db:generate-seed -- archivo.csv` regenera el seed (los encabezados en español se reconocen automáticamente).
- **Migraciones** compatibles con la CLI de Supabase (`supabase/migrations`).
- **Índices del read model**, pensados para las consultas reales:
  - `GIN (search_text gin_trgm_ops)`: búsqueda por subcadena sin tildes en nombre, principio activo, laboratorio, categoría y SKU.
  - `GIN (lower(active_ingredient) gin_trgm_ops)`: filtro por principio activo.
  - `(category_id, commercial_name)`: filtro por categoría con el orden por defecto.
  - `(price)`, `(commercial_name)`, `(laboratory_id)` y `(requires_prescription)`: ordenamientos y facetas.
  - `order_summary (status, placed_at DESC)` y `(lower(customer_email), placed_at DESC)`: panel de farmacia y “Mis pedidos”.
  - Outbox: índice parcial `WHERE processed_at IS NULL`.
- **Seguridad:** esquemas fuera de `public`, RLS activo y permisos revocados a `anon` y `authenticated` (ver [`docs/SUPABASE.md`](docs/SUPABASE.md#6-zero-rest-también-en-supabase)).

---

## 9. Pruebas y evidencias

```bash
npm test          # backend: node:test contra la BD configurada
```

```
▶ Máquina de estados de la orden            ✔ 2
▶ Validación de la fórmula médica           ✔ 4
▶ Utilidades (disponibilidad, centavos)     ✔ 2
▶ Invariantes del comando placeOrder        ✔ 6   ← incluye concurrencia: 8 compras / 5 unidades ⇒ 5 OK, 3 InsufficientStock
▶ DataLoader (N+1)                          ✔ 2   ← 4 consultas para 5 y para 50 medicamentos
# tests 16 · pass 16
```

**Zero-REST verificado con un navegador real** (Playwright recorriendo catálogo → ficha → carrito → pago → pedido → farmacia). Todas las peticiones de red salientes del frontend fueron:

```
POST http://localhost:4000/graphql
WS   ws://localhost:4000/graphql
```

y cualquier otra ruta del backend responde 404 (`curl localhost:4000/api/medications → 404`).

---

## 10. Schema SDL completo (`schema.graphql`)

Fuente: [`backend/schema.graphql`](backend/schema.graphql).

```graphql
"""
Afirmative Pill — contrato GraphQL único entre clientes y backend (Zero-REST).

Convenciones del schema:
  * Query        -> lado de LECTURA (CQRS). Sólo lee proyecciones del read_model.
  * Mutation     -> lado de ESCRITURA (CQRS). Cada mutation es un COMANDO que
                    expresa una intención de negocio (placeOrder, dispatchOrder...),
                    nunca un CRUD genérico (updateOrder, setStock...).
  * Subscription -> notificaciones en tiempo real cuando una proyección cambia.
  * Los errores de negocio esperables NO se lanzan como errores GraphQL: viajan
    tipados en el campo `errors` de cada Payload (interfaz UserError), de modo que
    el cliente puede reaccionar con precisión (p. ej. mostrar el stock disponible).
"""
schema {
  query: Query
  mutation: Mutation
  subscription: Subscription
}

# =============================================================================
# Scalars personalizados
# =============================================================================

"Instante en formato ISO-8601 con zona horaria (p. ej. 2026-09-22T15:04:05.000Z)."
scalar DateTime

"Fecha de calendario ISO-8601 sin hora (YYYY-MM-DD). Usada en fórmulas médicas."
scalar Date

"""
Valor monetario en pesos colombianos (COP) con 2 decimales. Se serializa como
número (p. ej. 12900.5) y se valida como no negativo con máximo 2 decimales.
"""
scalar Money

"Entero estrictamente mayor que cero (cantidades de ítems, tamaños de página)."
scalar PositiveInt

"Correo electrónico válido (RFC 5322 simplificado). Se normaliza en minúsculas."
scalar Email

# =============================================================================
# Enums
# =============================================================================

"Ciclo de vida operacional de una orden."
enum OrderStatus {
  "La orden fue aceptada por el sistema y espera validación (pago / fórmula médica)."
  PENDING_APPROVAL
  "Validada por el químico farmacéutico; lista para despacho."
  APPROVED
  "Entregada al operador logístico."
  DISPATCHED
  "Cancelada (por el paciente, por rechazo de la fórmula o por la farmacia). El stock fue liberado."
  CANCELLED
}

"Semáforo de disponibilidad calculado en la proyección del catálogo."
enum StockAvailability {
  IN_STOCK
  "Quedan 10 unidades o menos."
  LOW_STOCK
  OUT_OF_STOCK
}

enum PrescriptionStatus {
  "La orden no contiene medicamentos que exijan fórmula médica."
  NOT_REQUIRED
  PENDING_VERIFICATION
  VERIFIED
  REJECTED
}

enum CartStatus {
  OPEN
  CHECKED_OUT
}

enum MedicationSortField {
  NAME
  PRICE
  STOCK
}

enum SortDirection {
  ASC
  DESC
}

"Códigos estables de error de negocio (para i18n y lógica en el cliente)."
enum ErrorCode {
  VALIDATION_FAILED
  NOT_FOUND
  INSUFFICIENT_STOCK
  PRESCRIPTION_REQUIRED
  INVALID_PRESCRIPTION
  EMPTY_CART
  CART_NOT_OPEN
  INVALID_STATE_TRANSITION
}

# =============================================================================
# Interfaces
# =============================================================================

"Toda entidad con identidad global."
interface Node {
  id: ID!
}

"""
Error de negocio esperable devuelto dentro de un Payload. Cada implementación
agrega el contexto necesario para que la UI actúe sin parsear mensajes.
"""
interface UserError {
  code: ErrorCode!
  "Mensaje legible en español, listo para mostrar al usuario."
  message: String!
  "Ruta del input que originó el error (p. ej. [\"input\", \"customer\", \"email\"])."
  path: [String!]
}

# =============================================================================
# Read model: catálogo
# =============================================================================

type Laboratory implements Node {
  id: ID!
  name: String!
  country: String!
  "Medicamentos del laboratorio (resuelto en lote con DataLoader)."
  medications(first: PositiveInt = 10): [Medication!]!
}

type TherapeuticCategory implements Node {
  id: ID!
  name: String!
  slug: String!
  description: String
  "Contador precalculado en la proyección (no requiere COUNT en cada consulta)."
  medicationCount: Int!
}

"""
Información clínica pesada. Vive en un tipo aparte para que la vista condensada
del catálogo no la cargue: sólo se consulta a la BD si el cliente la selecciona.
"""
type ClinicalInformation {
  indications: String!
  contraindications: String!
}

"""
Proyección de un medicamento en el catálogo (read_model.medication_catalog).
La vista condensada selecciona sólo nombre/precio/presentación; la ficha técnica
selecciona además laboratorio, categoría e información clínica.
"""
type Medication implements Node {
  id: ID!
  sku: String!
  commercialName: String!
  activeIngredient: String!
  concentration: String!
  dosageForm: String!
  presentation: String!
  price: Money!
  requiresPrescription: Boolean!
  availability: StockAvailability!
  "Stock visible en la proyección (eventualmente consistente con el inventario real)."
  stockAvailable: Int!
  laboratory: Laboratory!
  category: TherapeuticCategory!
  clinicalInfo: ClinicalInformation!
  updatedAt: DateTime!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}

type MedicationEdge {
  cursor: String!
  node: Medication!
}

type MedicationConnection {
  edges: [MedicationEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

"Filtros facetados del catálogo. Todos opcionales y combinables (AND)."
input MedicationFilter {
  "Texto libre: nombre comercial, principio activo, laboratorio, categoría o SKU (sin tildes)."
  search: String
  activeIngredient: String
  categoryId: ID
  laboratoryId: ID
  requiresPrescription: Boolean
  "Excluye los medicamentos agotados."
  onlyAvailable: Boolean = false
}

input MedicationSort {
  field: MedicationSortField! = NAME
  direction: SortDirection! = ASC
}

# =============================================================================
# Read model: carrito y órdenes
# =============================================================================

type CartItem {
  medication: Medication!
  quantity: Int!
  lineTotal: Money!
}

type Cart implements Node {
  id: ID!
  status: CartStatus!
  items: [CartItem!]!
  itemCount: Int!
  subtotal: Money!
  "true si algún ítem exige fórmula médica: la UI debe pedir los datos de la receta."
  requiresPrescription: Boolean!
  updatedAt: DateTime!
}

type Customer {
  fullName: String!
  email: Email!
}

type Prescription {
  number: String!
  doctorName: String!
  doctorLicense: String!
  issuedAt: Date!
}

type OrderItem {
  "Proyección actual del medicamento (resuelta con DataLoader)."
  medication: Medication!
  "Snapshot del nombre al momento de la compra."
  commercialName: String!
  presentation: String!
  quantity: Int!
  "Snapshot del precio al momento de la compra."
  unitPrice: Money!
  subtotal: Money!
}

type OrderStatusChange {
  status: OrderStatus!
  note: String
  occurredAt: DateTime!
}

"Proyección de la orden (read_model.order_summary + order_line_view + order_timeline)."
type Order implements Node {
  id: ID!
  status: OrderStatus!
  "Motivo del último cambio de estado (p. ej. razón de cancelación)."
  statusReason: String
  customer: Customer!
  items: [OrderItem!]!
  itemCount: Int!
  total: Money!
  requiresPrescription: Boolean!
  prescriptionStatus: PrescriptionStatus!
  prescriptionRejectionReason: String
  prescription: Prescription
  timeline: [OrderStatusChange!]!
  placedAt: DateTime!
  updatedAt: DateTime!
  "Id del último evento de dominio aplicado a esta proyección (versión monotónica)."
  projectionVersion: Int!
}

type OrderEdge {
  cursor: String!
  node: Order!
}

type OrderConnection {
  edges: [OrderEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

input OrderFilter {
  status: OrderStatus
  customerEmail: Email
}

type Query {
  "Búsqueda facetada y paginada del catálogo."
  medications(
    filter: MedicationFilter
    sort: MedicationSort
    first: PositiveInt = 12
    after: String
  ): MedicationConnection!
  "Ficha técnica de un medicamento."
  medication(id: ID!): Medication
  therapeuticCategories: [TherapeuticCategory!]!
  laboratories: [Laboratory!]!
  cart(id: ID!): Cart
  """
  Proyección de una orden. Puede ser null durante unos instantes después de
  placeOrder (consistencia eventual): el cliente debe mostrar el recibo del
  comando y esperar la suscripción orderUpdated.
  """
  order(id: ID!): Order
  orders(filter: OrderFilter, first: PositiveInt = 20, after: String): OrderConnection!
}

# =============================================================================
# Write model: comandos (Mutations orientadas a intención)
# =============================================================================

input AddItemToCartInput {
  cartId: ID!
  medicationId: ID!
  quantity: PositiveInt!
}

input ChangeCartItemQuantityInput {
  cartId: ID!
  medicationId: ID!
  quantity: PositiveInt!
}

input RemoveItemFromCartInput {
  cartId: ID!
  medicationId: ID!
}

input CustomerInput {
  fullName: String!
  email: Email!
}

"Soporte de la fórmula médica. Obligatorio si algún ítem tiene requiresPrescription = true."
input PrescriptionInput {
  "Número consecutivo de la fórmula (MIPRES o interno de la IPS)."
  number: String!
  doctorName: String!
  "Registro médico (RETHUS) del prescriptor."
  doctorLicense: String!
  "Documento de identidad del paciente."
  patientDocument: String!
  "Fecha de expedición. Vigencia máxima: 30 días."
  issuedAt: Date!
}

input PlaceOrderInput {
  cartId: ID!
  customer: CustomerInput!
  prescription: PrescriptionInput
}

input ApproveOrderInput {
  orderId: ID!
  note: String
}

input DispatchOrderInput {
  orderId: ID!
  carrier: String
}

input CancelOrderInput {
  orderId: ID!
  reason: String!
}

# ---- Errores tipados ---------------------------------------------------------

type ValidationError implements UserError {
  code: ErrorCode!
  message: String!
  path: [String!]
  field: String!
}

type NotFoundError implements UserError {
  code: ErrorCode!
  message: String!
  path: [String!]
  resource: String!
  resourceId: ID!
}

type InsufficientStockError implements UserError {
  code: ErrorCode!
  message: String!
  path: [String!]
  medication: Medication!
  requested: Int!
  available: Int!
}

type PrescriptionRequiredError implements UserError {
  code: ErrorCode!
  message: String!
  path: [String!]
  "Medicamentos del carrito que exigen fórmula médica."
  medications: [Medication!]!
}

type InvalidPrescriptionError implements UserError {
  code: ErrorCode!
  message: String!
  path: [String!]
  reason: String!
}

type EmptyCartError implements UserError {
  code: ErrorCode!
  message: String!
  path: [String!]
}

type CartNotOpenError implements UserError {
  code: ErrorCode!
  message: String!
  path: [String!]
  status: CartStatus!
}

type InvalidStateTransitionError implements UserError {
  code: ErrorCode!
  message: String!
  path: [String!]
  currentStatus: OrderStatus!
  attemptedStatus: OrderStatus!
}

# ---- Payloads ----------------------------------------------------------------

type CartPayload {
  "Estado del carrito tras el comando (proyección síncrona: read-your-writes)."
  cart: Cart
  errors: [UserError!]!
}

"""
Acuse de recibo de un comando sobre una orden. Contiene sólo lo que el write model
conoce con certeza al confirmar la transacción; la proyección completa llega
después (consistencia eventual) vía Query.order / Subscription.orderUpdated.
"""
type OrderReceipt {
  orderId: ID!
  status: OrderStatus!
  total: Money!
  requiresPrescription: Boolean!
  acceptedAt: DateTime!
  "Versión del evento que generó el comando; la UI la compara con Order.projectionVersion."
  eventVersion: Int!
}

type PlaceOrderPayload {
  receipt: OrderReceipt
  errors: [UserError!]!
}

type OrderCommandPayload {
  receipt: OrderReceipt
  errors: [UserError!]!
}

type Mutation {
  "Abre un carrito vacío para la sesión del paciente."
  createCart: CartPayload!
  "Agrega un medicamento (o suma cantidad si ya estaba). Valida existencia y stock visible."
  addItemToCart(input: AddItemToCartInput!): CartPayload!
  changeCartItemQuantity(input: ChangeCartItemQuantityInput!): CartPayload!
  removeItemFromCart(input: RemoveItemFromCartInput!): CartPayload!
  """
  Comando central del dominio. En UNA transacción:
    1. Verifica invariantes (carrito abierto y no vacío, datos del cliente,
       fórmula médica obligatoria y vigente si hay ítems con receta).
    2. Reserva inventario de forma atómica (UPDATE ... WHERE stock >= cantidad).
    3. Crea la orden en PENDING_APPROVAL y emite los eventos OrderPlaced y
       StockReserved al outbox.
  Si cualquier invariante falla no se modifica nada y se devuelven errores tipados.
  """
  placeOrder(input: PlaceOrderInput!): PlaceOrderPayload!
  "Aprobación manual por el químico farmacéutico (verifica la fórmula si aplica)."
  approveOrder(input: ApproveOrderInput!): OrderCommandPayload!
  "Sólo órdenes APPROVED pueden despacharse."
  dispatchOrder(input: DispatchOrderInput!): OrderCommandPayload!
  "Cancela una orden no despachada y libera el inventario reservado."
  cancelOrder(input: CancelOrderInput!): OrderCommandPayload!
}

# =============================================================================
# Tiempo real
# =============================================================================

type Subscription {
  "Emite la proyección actualizada de la orden cada vez que cambia."
  orderUpdated(orderId: ID!): Order!
  "Feed de todas las órdenes (panel de la farmacia)."
  ordersFeed: Order!
  "Emite el medicamento cuando su stock proyectado cambia."
  medicationStockChanged: Medication!
}
```
