/**
 * DuelVerse - Status de pedidos físicos
 * Fonte única de verdade para a linha do tempo de pedidos do marketplace.
 */

export type OrderStatusValue =
  | "pending"
  | "payment_approved"
  | "preparing"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export interface OrderStatusInfo {
  value: OrderStatusValue;
  label: string;
  description: string;
  /** Ordem na linha do tempo. -1 = fora do fluxo (cancelado). */
  step: number;
  color: string;
}

export const ORDER_STATUSES: OrderStatusInfo[] = [
  {
    value: "pending",
    label: "Pedido recebido",
    description: "Recebemos seu pedido e ele está na fila.",
    step: 0,
    color: "bg-muted text-foreground",
  },
  {
    value: "payment_approved",
    label: "Pagamento aprovado",
    description: "Pagamento confirmado com sucesso.",
    step: 1,
    color: "bg-primary/20 text-primary",
  },
  {
    value: "preparing",
    label: "Preparando envio",
    description: "Estamos separando e embalando seu produto.",
    step: 2,
    color: "bg-primary/30 text-primary",
  },
  {
    value: "shipped",
    label: "Enviado",
    description: "O pedido foi despachado.",
    step: 3,
    color: "bg-secondary/30 text-secondary",
  },
  {
    value: "in_transit",
    label: "Em transporte",
    description: "O pedido está a caminho da sua cidade.",
    step: 4,
    color: "bg-secondary/40 text-secondary",
  },
  {
    value: "out_for_delivery",
    label: "Saiu para entrega",
    description: "O pedido está com o entregador.",
    step: 5,
    color: "bg-accent/40 text-accent-foreground",
  },
  {
    value: "delivered",
    label: "Entregue",
    description: "Pedido entregue. Bom jogo!",
    step: 6,
    color: "bg-green-500/20 text-green-500",
  },
  {
    value: "cancelled",
    label: "Cancelado",
    description: "Pedido cancelado.",
    step: -1,
    color: "bg-destructive/20 text-destructive",
  },
];

/** Status legados usados antes da linha do tempo completa. */
const LEGACY_ALIASES: Record<string, OrderStatusValue> = {
  completed: "delivered",
  shipping: "in_transit",
  paid: "payment_approved",
};

export const normalizeOrderStatus = (status?: string | null): OrderStatusValue => {
  if (!status) return "pending";
  if (LEGACY_ALIASES[status]) return LEGACY_ALIASES[status];
  const found = ORDER_STATUSES.find((s) => s.value === status);
  return found ? found.value : "pending";
};

export const getOrderStatusInfo = (status?: string | null): OrderStatusInfo => {
  const value = normalizeOrderStatus(status);
  return ORDER_STATUSES.find((s) => s.value === value) as OrderStatusInfo;
};

/** Fluxo linear (sem cancelado) usado para desenhar a timeline. */
export const ORDER_TIMELINE = ORDER_STATUSES.filter((s) => s.step >= 0).sort(
  (a, b) => a.step - b.step,
);

export interface OrderStatusHistoryEntry {
  status: string;
  at: string;
  by?: string | null;
}
