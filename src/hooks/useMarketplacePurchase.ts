/**
 * DuelVerse - Compra no Marketplace
 * Centraliza a chamada da RPC atômica de compra, incluindo dados de entrega
 * quando algum item do pedido for um produto físico.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ShippingInfo } from "@/components/marketplace/ShippingDialog";

export interface PurchasableProduct {
  id: string;
  name: string;
  price_duelcoins: number;
  category: string;
  product_type: string;
  stock: number | null;
}

export interface PurchaseItem {
  product: PurchasableProduct;
  quantity: number;
}

export const isPhysicalProduct = (product: { category?: string | null; product_type?: string | null }) =>
  product.category === "physical" || product.product_type === "physical";

export interface PurchaseResult {
  success: boolean;
  message: string;
  total?: number;
}

export function useMarketplacePurchase() {
  const [purchasing, setPurchasing] = useState(false);

  const purchase = useCallback(
    async (items: PurchaseItem[], options?: { couponCode?: string | null; shipping?: ShippingInfo | null }): Promise<PurchaseResult> => {
      if (items.length === 0) return { success: false, message: "Carrinho vazio" };
      setPurchasing(true);
      try {
        const { data, error } = await (supabase.rpc as any)("purchase_marketplace_items", {
          p_items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
          p_coupon_code: options?.couponCode || null,
          p_shipping: options?.shipping ?? null,
        });

        if (error) return { success: false, message: error.message };
        const result = data as PurchaseResult | null;
        if (!result?.success) return { success: false, message: result?.message || "Falha ao processar compra" };
        return result;
      } catch (err: any) {
        return { success: false, message: err?.message || "Erro inesperado" };
      } finally {
        setPurchasing(false);
      }
    },
    []
  );

  return { purchase, purchasing };
}
