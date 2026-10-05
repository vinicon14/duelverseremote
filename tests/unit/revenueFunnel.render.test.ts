// @vitest-environment happy-dom
/**
 * Renderiza as telas do funil com um Supabase falso e confere QUANDO os eventos GA4 saem.
 * (Arquivo .ts sem JSX porque o vitest só inclui tests/unit/**\/*.test.ts.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  tables: {} as Record<string, Row[] | ((filters: { eq: [string, unknown][]; in: [string, unknown[]][] }) => Row[])>,
  rpc: (() => Promise.resolve({ data: null, error: null })) as (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>,
  invoke: (() => Promise.resolve({ data: null, error: null })) as (name: string, opts: unknown) => Promise<{ data: unknown; error: unknown }>,
  rpcCalls: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const filters = { eq: [] as [string, unknown][], in: [] as [string, unknown[]][] };
    let one = false;
    const run = () => {
      const src = db.tables[table] ?? [];
      let rows = typeof src === 'function' ? src(filters) : src;
      rows = rows.filter((r) =>
        filters.eq.every(([c, v]) => !(c in r) || r[c] === v) &&
        filters.in.every(([c, vs]) => vs.includes(r[c])));
      return { data: one ? rows[0] ?? null : rows, error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b, order: () => b, limit: () => b, gte: () => b,
      eq: (c: string, v: unknown) => { filters.eq.push([c, v]); return b; },
      in: (c: string, vs: unknown[]) => { filters.in.push([c, vs]); return b; },
      single: () => { one = true; return b; },
      maybeSingle: () => { one = true; return b; },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: db.session } }),
        getUser: () => Promise.resolve({ data: { user: db.session?.user ?? null } }),
        signOut: () => Promise.resolve({}),
      },
      from,
      rpc: (name: string, args: unknown) => { db.rpcCalls.push(name); return db.rpc(name, args); },
      functions: { invoke: (name: string, opts: unknown) => db.invoke(name, opts) },
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === 'string' ? d : k), i18n: { language: 'pt-BR' } }),
}));
const toastSpy = vi.hoisted(() => ({ calls: [] as Array<{ title?: unknown }> }));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: (o: { title?: unknown }) => { toastSpy.calls.push(o); } }),
  toast: (o: { title?: unknown }) => { toastSpy.calls.push(o); },
}));
vi.mock('@/hooks/useBanCheck', () => ({ useBanCheck: () => {} }));
vi.mock('@/hooks/useAccountType', () => ({ useAccountType: () => ({ isPro: false, loading: false }) }));
vi.mock('@/components/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/DuelCoinsBalance', () => ({ DuelCoinsBalance: () => null }));

const w = window as unknown as Window & { gtag?: ReturnType<typeof vi.fn> };
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
}

async function render(el: unknown, url: string) {
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: [url] }, el as never));
  });
  await flush();
}

function events(name: string) {
  return (w.gtag!.mock.calls as unknown[][]).filter((c) => c[0] === 'event' && c[1] === name).map((c) => c[2]);
}

function buttonByText(re: RegExp): HTMLElement {
  const el = Array.from(container.querySelectorAll('button, a')).find((b) => re.test(b.textContent || '')) as HTMLElement | undefined;
  if (!el) throw new Error(`botão ${re} não encontrado em: ${container.textContent}`);
  return el;
}

async function click(el: HTMLElement) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  w.gtag = vi.fn();
  db.session = { user: { id: 'u1' } };
  db.tables = {};
  db.rpcCalls = [];
  toastSpy.calls = [];
  db.rpc = () => Promise.resolve({ data: { success: true }, error: null });
  db.invoke = () => Promise.resolve({ data: null, error: null });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete w.gtag;
  vi.restoreAllMocks();
});

describe('GoPro (/go-pro)', () => {
  const plans = [
    { id: 'p-week', name: 'Semanal', description: null, price_duelcoins: 20, duration_days: 7, duration_type: 'weekly', is_featured: true },
    { id: 'p-month', name: 'Mensal', description: null, price_duelcoins: 60, duration_days: 30, duration_type: 'monthly', is_featured: false },
  ];

  beforeEach(() => {
    db.tables.subscription_plans = plans;
    db.tables.profiles = [{ user_id: 'u1', duelcoins_balance: 100 }];
    db.tables.user_subscriptions = [];
  });

  it('renderiza sem erro e dispara view_pro 1x, com src sanitizado', async () => {
    const { default: GoPro } = await import('../../src/pages/GoPro');
    await render(h(GoPro), '/go-pro?src=toast_route');
    expect(container.textContent).toContain('Seja PRO no DuelVerse');
    expect(events('view_pro')).toEqual([{ src: 'toast_route', logged_in: true, has_enough_dc: true }]);

    // trocar de plano não dispara de novo
    await click(buttonByText(/Mensal/));
    expect(events('view_pro')).toHaveLength(1);
  });

  it('descarta ?src= com PII', async () => {
    const { default: GoPro } = await import('../../src/pages/GoPro');
    await render(h(GoPro), '/go-pro?src=fulano@gmail.com');
    expect(events('view_pro')).toEqual([{ logged_in: true, has_enough_dc: true }]);
  });

  it('pro_activated só depois do sucesso do RPC; o reload pós-ativação não repete view_pro', async () => {
    const { default: GoPro } = await import('../../src/pages/GoPro');
    await render(h(GoPro), '/go-pro?src=expiry_reminder');
    await click(buttonByText(/Virar PRO por 20/));
    expect(db.rpcCalls).toEqual(['activate_subscription']);
    expect(events('pro_activated')).toEqual([{ plan_id: 'p-week', price_dc: 20, src: 'expiry_reminder' }]);
    expect(events('view_pro')).toHaveLength(1);
  });

  it('sem pro_activated quando o RPC falha ou devolve success:false', async () => {
    const { default: GoPro } = await import('../../src/pages/GoPro');
    db.rpc = () => Promise.resolve({ data: { success: false, message: 'Saldo insuficiente' }, error: null });
    await render(h(GoPro), '/go-pro');
    await click(buttonByText(/Virar PRO por 20/));
    db.rpc = () => Promise.resolve({ data: null, error: { message: 'boom' } });
    await click(buttonByText(/Virar PRO por 20/));
    expect(db.rpcCalls).toHaveLength(2);
    expect(events('pro_activated')).toEqual([]);
  });

  it('não quebra sem gtag (adblock)', async () => {
    delete w.gtag;
    const { default: GoPro } = await import('../../src/pages/GoPro');
    await render(h(GoPro), '/go-pro');
    expect(container.textContent).toContain('Virar PRO por 20');
    w.gtag = vi.fn();
  });
});

describe('ProUpsellBanner', () => {
  it('shown 1x; CTA conta clicked (sem dismissed) e leva src=toast_route', async () => {
    const { ProUpsellBanner } = await import('../../src/components/ProUpsellBanner');
    await render(h(ProUpsellBanner), '/duels');
    expect(events('pro_upsell_shown')).toEqual([{ placement: 'toast_route' }]);
    const cta = buttonByText(/Ver planos PRO/);
    expect(cta.getAttribute('href')).toBe('/go-pro?src=toast_route');
    await click(cta);
    expect(events('pro_upsell_clicked')).toEqual([{ placement: 'toast_route' }]);
    expect(events('pro_upsell_dismissed')).toEqual([]);
    expect(localStorage.getItem('dv_pro_upsell_dismissed_at')).not.toBeNull();
    expect(container.textContent).toBe('');
  });

  it('fechar no X conta dismissed', async () => {
    const { ProUpsellBanner } = await import('../../src/components/ProUpsellBanner');
    await render(h(ProUpsellBanner), '/ranking');
    await click(container.querySelector('button[aria-label]') as HTMLElement);
    expect(events('pro_upsell_dismissed')).toEqual([{ placement: 'toast_route' }]);
    expect(events('pro_upsell_clicked')).toEqual([]);
  });

  it('não aparece nem dispara fora das rotas ou deslogado', async () => {
    const { ProUpsellBanner } = await import('../../src/components/ProUpsellBanner');
    await render(h(ProUpsellBanner), '/go-pro');
    db.session = null;
    expect(events('pro_upsell_shown')).toEqual([]);
  });
});

describe('BuyDuelCoins (/buy-duelcoins)', () => {
  const pkg = { id: 'pkg-1', name: 'Pacote', description: null, duelcoins_amount: 1000, price_brl: 49.9, checkout_url: null, is_featured: false, image_url: null, sort_order: 1, is_active: true };

  beforeEach(() => {
    db.tables.duelcoins_packages = [pkg];
  });

  it('retorno ?success=true: purchase só quando o pedido iniciado aqui fica paid; 1x mesmo com reload', async () => {
    // checkout de cartão iniciado neste navegador (preference_id pref-NEW)
    localStorage.setItem('dv_pending_checkouts', JSON.stringify([{ ref: 'pref-NEW', method: 'card', at: Date.now() }]));
    let status = 'pending';
    db.tables.duelcoins_orders = () => [
      // pedido antigo, já pago, de outro checkout: nunca pode virar purchase
      { id: 'ord-OLD', user_id: 'u1', status: 'paid', amount_brl: 9.9, duelcoins_amount: 100, coupon_code: null, payment_method: 'pix', external_order_id: 'mp-OLD', created_at: '2026-09-01', paid_at: '2026-09-01' },
      { id: 'ord-NEW', user_id: 'u1', status, amount_brl: 44.91, duelcoins_amount: 1000, coupon_code: 'PROMO10', payment_method: status === 'paid' ? 'master' : 'card', external_order_id: 'pref-NEW', created_at: '2026-10-04', paid_at: null },
    ];
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { default: BuyDuelCoins } = await import('../../src/pages/BuyDuelCoins');
      await render(h(BuyDuelCoins), '/buy-duelcoins?success=true');
      expect(events('purchase')).toEqual([]); // webhook ainda não chegou

      status = 'paid';
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      await flush();
      expect(events('purchase')).toEqual([{
        transaction_id: 'ord-NEW', value: 44.91, currency: 'BRL', method: 'card', package_dc: 1000, coupon: 'PROMO10',
      }]);

      // "reload"
      await act(async () => root.unmount());
      root = createRoot(container);
      await render(h(BuyDuelCoins), '/buy-duelcoins?success=true');
      await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
      expect(events('purchase')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retorno ?success=true mostra o toast de pagamento 1x, como antes do PR', async () => {
    db.tables.duelcoins_orders = [];
    const { default: BuyDuelCoins } = await import('../../src/pages/BuyDuelCoins');
    await render(h(BuyDuelCoins), '/buy-duelcoins?success=true');
    expect(toastSpy.calls.map((c) => c.title)).toEqual(['buyCoins.paymentDone']);
  });

  it('sem checkout iniciado aqui, o retorno não dispara purchase de pedido antigo', async () => {
    db.tables.duelcoins_orders = [
      { id: 'ord-OLD', user_id: 'u1', status: 'paid', amount_brl: 9.9, duelcoins_amount: 100, coupon_code: null, payment_method: 'pix', external_order_id: 'mp-OLD', created_at: '2026-09-01', paid_at: '2026-09-01' },
    ];
    const { default: BuyDuelCoins } = await import('../../src/pages/BuyDuelCoins');
    await render(h(BuyDuelCoins), '/buy-duelcoins?success=true');
    expect(events('purchase')).toEqual([]);
  });

  it('PIX: begin_checkout com o valor do servidor; nada em erro', async () => {
    db.tables.duelcoins_orders = [];
    const { default: BuyDuelCoins } = await import('../../src/pages/BuyDuelCoins');
    await render(h(BuyDuelCoins), '/buy-duelcoins');

    db.invoke = () => Promise.resolve({ data: { success: false, error: 'falhou' }, error: null });
    await click(buttonByText(/pix/i));
    db.invoke = () => Promise.resolve({ data: null, error: new Error('rede') });
    await click(buttonByText(/pix/i));
    expect(events('begin_checkout')).toEqual([]);

    db.invoke = () => Promise.resolve({ data: { success: true, qr_code: 'x', qr_code_base64: 'x', ticket_url: 'x', amount_brl: 47.4, duelcoins_amount: 1000, payment_id: 987 }, error: null });
    await click(buttonByText(/pix/i));
    expect(events('begin_checkout')).toEqual([{ method: 'pix', package_dc: 1000, value: 47.4, currency: 'BRL', intent: 'dc' }]);
    expect(JSON.parse(localStorage.getItem('dv_pending_checkouts')!)[0]).toMatchObject({ ref: '987', method: 'pix' });
  });

  it('cartão: nada de begin_checkout quando o checkout falha', async () => {
    db.tables.duelcoins_orders = [];
    const { default: BuyDuelCoins } = await import('../../src/pages/BuyDuelCoins');
    await render(h(BuyDuelCoins), '/buy-duelcoins');
    db.invoke = () => Promise.resolve({ data: { success: false, error: 'falhou' }, error: null });
    await click(buttonByText(/payCard/));
    db.invoke = () => Promise.resolve({ data: null, error: new Error('rede') });
    await click(buttonByText(/payCard/));
    expect(events('begin_checkout')).toEqual([]);
    expect(localStorage.getItem('dv_pending_checkouts')).toBeNull();
  });

  it('PIX pago depois de fechar o QR: a próxima visita dispara purchase 1x', async () => {
    localStorage.setItem('dv_pending_checkouts', JSON.stringify([{ ref: '987', method: 'pix', at: Date.now() }]));
    db.tables.duelcoins_orders = [
      { id: 'ord-PIX', user_id: 'u1', status: 'paid', amount_brl: 47.4, duelcoins_amount: 1000, coupon_code: null, payment_method: 'pix', external_order_id: '987', created_at: '2026-10-04', paid_at: '2026-10-04' },
    ];
    const { default: BuyDuelCoins } = await import('../../src/pages/BuyDuelCoins');
    await render(h(BuyDuelCoins), '/buy-duelcoins');
    expect(events('purchase')).toEqual([{ transaction_id: 'ord-PIX', value: 47.4, currency: 'BRL', method: 'pix', package_dc: 1000 }]);
    expect(JSON.parse(localStorage.getItem('dv_pending_checkouts')!)).toEqual([]);
  });
});

describe('torneios', () => {
  const weekly = {
    id: 't1', name: 'Semanal #1', description: null, prize_pool: 500, entry_fee: 50, max_participants: 32,
    start_date: '2026-10-05T00:00:00Z', end_date: '2026-10-12T00:00:00Z', status: 'upcoming', creator_id: 'u9',
    created_at: '2026-10-01', participant_count: 3, total_collected: 0, prize_paid: false, is_weekly: true,
  };

  it('WeeklyTournamentCard: tournament_join só no sucesso (RPC ou fallback)', async () => {
    const { WeeklyTournamentCard } = await import('../../src/components/tournament/WeeklyTournamentCard');
    db.tables.tournament_participants = [];

    // RPC falha e a edge function também: nada
    db.rpc = () => Promise.resolve({ data: { success: false }, error: null });
    db.invoke = () => Promise.resolve({ data: { success: false, message: 'Saldo insuficiente' }, error: null });
    await render(h(WeeklyTournamentCard, { tournament: weekly }), '/tournaments');
    await click(buttonByText(/Inscrever-se/));
    expect(events('tournament_join')).toEqual([]);

    // fallback (charge-tournament-entry-fee) com sucesso
    db.invoke = () => Promise.resolve({ data: { success: true }, error: null });
    await click(buttonByText(/Inscrever-se/));
    expect(events('tournament_join')).toEqual([{ entry_fee_dc: 50, is_weekly: true, free: false }]);

    // RPC com sucesso
    db.rpc = () => Promise.resolve({ data: { success: true }, error: null });
    await click(buttonByText(/Inscrever-se/));
    expect(events('tournament_join')).toHaveLength(2);
  });

  it('CreateTournament: tournament_create só depois do RPC com sucesso', async () => {
    const { default: CreateTournament } = await import('../../src/pages/CreateTournament');
    await render(h(CreateTournament), '/create-tournament');
    const form = container.querySelector('form')!;

    db.rpc = () => Promise.resolve({ data: { success: false, message: 'Saldo insuficiente' }, error: null });
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(db.rpcCalls).toEqual(['create_normal_tournament']);
    expect(events('tournament_create')).toEqual([]);

    db.rpc = () => Promise.resolve({ data: { success: true }, error: null });
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(events('tournament_create')).toEqual([{ is_weekly: false, prize_pool_dc: 0, entry_fee_dc: 0 }]);
  });
});
