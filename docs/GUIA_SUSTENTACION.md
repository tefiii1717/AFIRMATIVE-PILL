# Guion del video de sustentación (5–8 minutos)

Checklist alineado con los entregables y la rúbrica del taller. Antes de grabar:

```bash
# Terminal 1
cd backend && npm run dev          # logs con colores: SQL, LOADER, COMMAND, PROJECTOR, SAGA
# Terminal 2
cd frontend && npm run dev         # http://localhost:3000
```

Deja `PROJECTION_DELAY_MS=800` y `APPROVAL_DELAY_MS=4000` en `backend/.env` para que la consistencia eventual se vea en pantalla.

| Min. | Qué mostrar | Qué decir (criterio de la rúbrica) |
|---|---|---|
| 0:00 | Diagrama del README | Arquitectura: Next.js + Apollo Client → Apollo Server → resolvers/DataLoader → Supabase. Separación `read_model` / `write_model`. |
| 0:45 | `backend/schema.graphql` | Scalars personalizados (`Money`, `DateTime`, `Date`, `PositiveInt`, `Email`), enums, interfaz `UserError` con 8 errores tipados, inputs y payloads; mutations con nombre de intención (`placeOrder`, `dispatchOrder`). |
| 1:30 | **Catálogo** + DevTools → *Network* (filtro `graphql`) | Todas las peticiones van a `POST /graphql`. En *Response* sólo aparecen `commercialName`, `presentation`, `price`… sin indicaciones clínicas: **no hay over-fetching**. Busca “losartan” y filtra por categoría. |
| 2:15 | **Ficha técnica** de un medicamento | La query agrega `laboratory`, `category` y `clinicalInfo`: el cliente decide los campos. La tarjeta ya estaba en caché y se muestra al instante (typePolicy `Query.medication`). |
| 2:45 | Terminal del backend | Líneas `LOADER laboratoryById: 7 clave(s) agrupadas -> 1 consulta SQL`: el catálogo con relaciones hace 3 consultas en total, no 1 + 2N. Menciona el test `DataLoader (N+1)`: 4 consultas tanto para 5 como para 50 medicamentos. |
| 3:30 | **Carrito**: agrega Dolex + Amoxicilina (Rx). Sube la cantidad | `addItemToCart` devuelve el `Cart` y la caché normalizada actualiza el contador del header sin refetch. `optimisticResponse` en los botones +/−. |
| 4:00 | Envía el pedido **sin** fórmula | Error tipado `PrescriptionRequiredError` / `ValidationError` con `path`: la invariante se protege en el comando y no se modifica nada (ROLLBACK). |
| 4:30 | Completa la fórmula y paga | `placeOrder` devuelve un `OrderReceipt`. La vista muestra **“sincronizando…”** con el recibo: consistencia eventual. En los logs: `COMMAND PlaceOrder ✔` → `PROJECTOR #n OrderPlaced, StockReserved`. |
| 5:15 | La orden pasa a **Aprobada** sola | `SAGA … fórmula verificada -> approveOrder`. Llega por `subscription OrderUpdated` (WebSocket en DevTools → *WS* → mensajes). `projectionVersion` sube. |
| 5:45 | **Farmacia** → Despachar | `dispatchOrder` → `DISPATCHED` en tiempo real. Si intentas despachar dos veces: `InvalidStateTransitionError`. |
| 6:15 | Opcional: pedido con registro médico terminado en `000` | La saga rechaza la fórmula → `CANCELLED` y el stock se libera (`StockReleased`). |
| 6:45 | `npm test` en `backend` | 16 pruebas: máquina de estados, validación de fórmulas, **concurrencia** (8 compras simultáneas sobre 5 unidades ⇒ 5 OK y 3 rechazadas) y N+1. |
| 7:15 | Cierre | Zero-REST: `curl localhost:4000/api/anything` → 404; en Supabase las tablas no están en `public` y tienen RLS. |

## Consultas útiles para Apollo Sandbox (`http://localhost:4000/graphql`)

Ver [`docs/operaciones-ejemplo.graphql`](operaciones-ejemplo.graphql).
