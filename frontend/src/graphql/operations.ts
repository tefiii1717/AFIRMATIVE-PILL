/**
 * Operaciones GraphQL del cliente. Cada vista pide EXACTAMENTE los campos que
 * pinta (anti over-fetching):
 *   - MedicationCard: nombre, precio, presentación y disponibilidad.
 *   - MedicationDetail: además laboratorio, categoría e información clínica.
 */
import { gql, type TypedDocumentNode } from '@apollo/client';
import type {
  CartData,
  Connection,
  MedicationCardData,
  MedicationDetailData,
  OrderData,
  OrderReceiptData,
  OrderRowData,
  OrderStatus,
  UserErrorData,
} from './types';

// ---------------------------------------------------------------------------
// Fragmentos
// ---------------------------------------------------------------------------
export const MEDICATION_CARD = gql`
  fragment MedicationCard on Medication {
    id
    commercialName
    presentation
    price
    requiresPrescription
    availability
    stockAvailable
  }
`;

export const USER_ERROR_FIELDS = gql`
  fragment UserErrorFields on UserError {
    __typename
    code
    message
    path
    ... on ValidationError {
      field
    }
    ... on InsufficientStockError {
      requested
      available
      medication {
        id
        commercialName
      }
    }
    ... on PrescriptionRequiredError {
      medications {
        id
        commercialName
      }
    }
    ... on InvalidPrescriptionError {
      reason
    }
  }
`;

export const CART_FIELDS = gql`
  fragment CartFields on Cart {
    id
    status
    itemCount
    subtotal
    requiresPrescription
    items {
      quantity
      lineTotal
      medication {
        ...MedicationCard
        activeIngredient
      }
    }
  }
  ${MEDICATION_CARD}
`;

export const ORDER_ROW = gql`
  fragment OrderRow on Order {
    id
    status
    statusReason
    total
    itemCount
    requiresPrescription
    prescriptionStatus
    placedAt
    projectionVersion
    customer {
      fullName
      email
    }
  }
`;

export const ORDER_DETAIL = gql`
  fragment OrderDetail on Order {
    ...OrderRow
    updatedAt
    prescriptionRejectionReason
    prescription {
      number
      doctorName
      doctorLicense
      issuedAt
    }
    items {
      commercialName
      presentation
      quantity
      unitPrice
      subtotal
      medication {
        id
        availability
      }
    }
    timeline {
      status
      note
      occurredAt
    }
  }
  ${ORDER_ROW}
`;

const RECEIPT_FIELDS = gql`
  fragment ReceiptFields on OrderReceipt {
    orderId
    status
    total
    requiresPrescription
    acceptedAt
    eventVersion
  }
`;

// ---------------------------------------------------------------------------
// Queries (lado de lectura)
// ---------------------------------------------------------------------------
export interface CatalogVars {
  filter?: {
    search?: string;
    categoryId?: string;
    requiresPrescription?: boolean;
    onlyAvailable?: boolean;
  };
  sort?: { field: 'NAME' | 'PRICE' | 'STOCK'; direction: 'ASC' | 'DESC' };
  first?: number;
  after?: string | null;
}

export const CATALOG_QUERY: TypedDocumentNode<
  { medications: Connection<MedicationCardData> },
  CatalogVars
> = gql`
  query Catalog($filter: MedicationFilter, $sort: MedicationSort, $first: PositiveInt, $after: String) {
    medications(filter: $filter, sort: $sort, first: $first, after: $after) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        cursor
        node {
          ...MedicationCard
        }
      }
    }
  }
  ${MEDICATION_CARD}
`;

export const CATEGORIES_QUERY: TypedDocumentNode<{
  therapeuticCategories: { id: string; name: string; medicationCount: number }[];
}> = gql`
  query Categories {
    therapeuticCategories {
      id
      name
      medicationCount
    }
  }
`;

export const MEDICATION_DETAIL_QUERY: TypedDocumentNode<
  { medication: MedicationDetailData | null },
  { id: string }
> = gql`
  query MedicationDetail($id: ID!) {
    medication(id: $id) {
      ...MedicationCard
      sku
      activeIngredient
      concentration
      dosageForm
      laboratory {
        id
        name
        country
      }
      category {
        id
        name
      }
      clinicalInfo {
        indications
        contraindications
      }
    }
  }
  ${MEDICATION_CARD}
`;

export const CART_QUERY: TypedDocumentNode<{ cart: CartData | null }, { id: string }> = gql`
  query Cart($id: ID!) {
    cart(id: $id) {
      ...CartFields
    }
  }
  ${CART_FIELDS}
`;

export const ORDER_QUERY: TypedDocumentNode<{ order: OrderData | null }, { id: string }> = gql`
  query Order($id: ID!) {
    order(id: $id) {
      ...OrderDetail
    }
  }
  ${ORDER_DETAIL}
`;

export const ORDERS_QUERY: TypedDocumentNode<
  { orders: Connection<OrderRowData> },
  { filter?: { status?: OrderStatus; customerEmail?: string }; first?: number; after?: string | null }
> = gql`
  query Orders($filter: OrderFilter, $first: PositiveInt, $after: String) {
    orders(filter: $filter, first: $first, after: $after) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        cursor
        node {
          ...OrderRow
        }
      }
    }
  }
  ${ORDER_ROW}
`;

// ---------------------------------------------------------------------------
// Mutations (lado de escritura: comandos)
// ---------------------------------------------------------------------------
type CartPayload = { __typename?: 'CartPayload'; cart: CartData | null; errors: UserErrorData[] };

export const CREATE_CART: TypedDocumentNode<{ createCart: CartPayload }> = gql`
  mutation CreateCart {
    createCart {
      cart {
        ...CartFields
      }
      errors {
        ...UserErrorFields
      }
    }
  }
  ${CART_FIELDS}
  ${USER_ERROR_FIELDS}
`;

export const ADD_ITEM_TO_CART: TypedDocumentNode<
  { addItemToCart: CartPayload },
  { input: { cartId: string; medicationId: string; quantity: number } }
> = gql`
  mutation AddItemToCart($input: AddItemToCartInput!) {
    addItemToCart(input: $input) {
      cart {
        ...CartFields
      }
      errors {
        ...UserErrorFields
      }
    }
  }
  ${CART_FIELDS}
  ${USER_ERROR_FIELDS}
`;

export const CHANGE_CART_ITEM_QUANTITY: TypedDocumentNode<
  { changeCartItemQuantity: CartPayload },
  { input: { cartId: string; medicationId: string; quantity: number } }
> = gql`
  mutation ChangeCartItemQuantity($input: ChangeCartItemQuantityInput!) {
    changeCartItemQuantity(input: $input) {
      cart {
        ...CartFields
      }
      errors {
        ...UserErrorFields
      }
    }
  }
  ${CART_FIELDS}
  ${USER_ERROR_FIELDS}
`;

export const REMOVE_ITEM_FROM_CART: TypedDocumentNode<
  { removeItemFromCart: CartPayload },
  { input: { cartId: string; medicationId: string } }
> = gql`
  mutation RemoveItemFromCart($input: RemoveItemFromCartInput!) {
    removeItemFromCart(input: $input) {
      cart {
        ...CartFields
      }
      errors {
        ...UserErrorFields
      }
    }
  }
  ${CART_FIELDS}
  ${USER_ERROR_FIELDS}
`;

export interface PlaceOrderVars {
  input: {
    cartId: string;
    customer: { fullName: string; email: string };
    prescription?: {
      number: string;
      doctorName: string;
      doctorLicense: string;
      patientDocument: string;
      issuedAt: string;
    } | null;
  };
}

export const PLACE_ORDER: TypedDocumentNode<
  { placeOrder: { receipt: OrderReceiptData | null; errors: UserErrorData[] } },
  PlaceOrderVars
> = gql`
  mutation PlaceOrder($input: PlaceOrderInput!) {
    placeOrder(input: $input) {
      receipt {
        ...ReceiptFields
      }
      errors {
        ...UserErrorFields
      }
    }
  }
  ${RECEIPT_FIELDS}
  ${USER_ERROR_FIELDS}
`;

type OrderCommandPayload = { receipt: OrderReceiptData | null; errors: UserErrorData[] };

export const APPROVE_ORDER: TypedDocumentNode<
  { approveOrder: OrderCommandPayload },
  { input: { orderId: string; note?: string } }
> = gql`
  mutation ApproveOrder($input: ApproveOrderInput!) {
    approveOrder(input: $input) {
      receipt {
        ...ReceiptFields
      }
      errors {
        ...UserErrorFields
      }
    }
  }
  ${RECEIPT_FIELDS}
  ${USER_ERROR_FIELDS}
`;

export const DISPATCH_ORDER: TypedDocumentNode<
  { dispatchOrder: OrderCommandPayload },
  { input: { orderId: string; carrier?: string } }
> = gql`
  mutation DispatchOrder($input: DispatchOrderInput!) {
    dispatchOrder(input: $input) {
      receipt {
        ...ReceiptFields
      }
      errors {
        ...UserErrorFields
      }
    }
  }
  ${RECEIPT_FIELDS}
  ${USER_ERROR_FIELDS}
`;

export const CANCEL_ORDER: TypedDocumentNode<
  { cancelOrder: OrderCommandPayload },
  { input: { orderId: string; reason: string } }
> = gql`
  mutation CancelOrder($input: CancelOrderInput!) {
    cancelOrder(input: $input) {
      receipt {
        ...ReceiptFields
      }
      errors {
        ...UserErrorFields
      }
    }
  }
  ${RECEIPT_FIELDS}
  ${USER_ERROR_FIELDS}
`;

// ---------------------------------------------------------------------------
// Subscriptions (tiempo real)
// ---------------------------------------------------------------------------
export const ORDER_UPDATED: TypedDocumentNode<{ orderUpdated: OrderData }, { orderId: string }> = gql`
  subscription OrderUpdated($orderId: ID!) {
    orderUpdated(orderId: $orderId) {
      ...OrderDetail
    }
  }
  ${ORDER_DETAIL}
`;

export const ORDERS_FEED: TypedDocumentNode<{ ordersFeed: OrderRowData }> = gql`
  subscription OrdersFeed {
    ordersFeed {
      ...OrderRow
    }
  }
  ${ORDER_ROW}
`;

export const MEDICATION_STOCK_CHANGED: TypedDocumentNode<{
  medicationStockChanged: Pick<MedicationCardData, '__typename' | 'id' | 'availability' | 'stockAvailable'>;
}> = gql`
  subscription MedicationStockChanged {
    medicationStockChanged {
      id
      availability
      stockAvailable
    }
  }
`;
