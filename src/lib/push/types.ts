/**
 * DuelVerse - Tipos do sistema modular de Push Notifications
 */
export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export interface PushEnvironment {
  supported: boolean;
  reason?: string;
  permission: PushPermission;
}

export interface PushSubscriptionInfo {
  provider: string;
  id?: string;
  endpoint?: string;
  raw?: unknown;
}

/**
 * Contrato que todo provedor de push deve implementar.
 * Cada provedor é independente do resto do DuelVerse.
 */
export interface PushProvider {
  readonly id: string;
  /** Verifica se o provedor pode ser usado neste dispositivo/navegador. */
  isAvailable(): Promise<boolean>;
  /** Carrega/inicializa o SDK do provedor. Deve ser idempotente. */
  init(): Promise<void>;
  /** Solicita permissão ao usuário (quando aplicável ao provedor). */
  requestPermission(): Promise<PushPermission>;
  /** Registra a subscription/token do usuário, quando aplicável. */
  subscribe(userId?: string): Promise<PushSubscriptionInfo | null>;
  /** Remove a subscription/token do usuário. */
  unsubscribe(userId?: string): Promise<void>;
}
