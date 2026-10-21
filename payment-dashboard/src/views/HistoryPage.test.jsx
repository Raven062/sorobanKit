// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HistoryPage from './HistoryPage';

vi.mock('@creit.tech/stellar-wallets-kit', () => {
  class Stub {}
  return {
    StellarWalletsKit: Stub,
    WalletNetwork: { TESTNET: 'TESTNET' },
    FreighterModule: Stub,
    xBullModule: Stub,
    AlbedoModule: Stub,
    LobstrModule: Stub,
  };
});

const PUBLIC_KEY = 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB';
const noop = () => {};

const makeRecord = (id) => ({
  id: String(id),
  type: 'payment',
  from: 'GSENDER111',
  to: PUBLIC_KEY,
  amount: '10.0',
  asset_type: 'native',
  transaction_successful: true,
  created_at: new Date(2026, 0, id).toISOString(),
  transaction_hash: `hash${id}`,
});

const makeHorizonResponse = (records, nextCursor = null) => ({
  _embedded: { records },
  _links: {
    next: nextCursor
      ? { href: `https://horizon-testnet.stellar.org/accounts/x/payments?cursor=${nextCursor}&order=desc&limit=50` }
      : { href: '' },
  },
});

const renderPage = (key = PUBLIC_KEY) =>
  render(
    <HistoryPage
      userPublicKey={key}
      setUserPublicKey={noop}
      onConnectWallet={noop}
      onDisconnectWallet={noop}
      onRefreshBalance={noop}
      onDashboardClick={noop}
      onAnalyticsClick={noop}
      onHelpClick={noop}
      onRegisterClick={noop}
      canRegister={false}
    />,
  );

describe('HistoryPage pagination', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches only the first page (limit=50, page=1) on initial render', async () => {
    const firstPageRecords = Array.from({ length: 50 }, (_, i) => makeRecord(i + 1));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeHorizonResponse(firstPageRecords, 'cursor-page-2'),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: noop, removeListener: noop }));

    renderPage();

    await waitFor(() => expect(screen.queryByText('Loading transactions...')).toBeNull());

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('limit=50');
    expect(url).toContain('page=1');
    expect(url).not.toContain('cursor=');
  });

  it('shows "Next" and "Previous" pagination controls', async () => {
    const firstPageRecords = Array.from({ length: 50 }, (_, i) => makeRecord(i + 1));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeHorizonResponse(firstPageRecords, 'cursor-page-2'),
    }));
    vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: noop, removeListener: noop }));

    renderPage();

    const nextBtn = await screen.findByRole('button', { name: /next/i });
    const prevBtn = screen.getByRole('button', { name: /previous/i });
    expect(nextBtn).toBeTruthy();
    expect(prevBtn).toBeTruthy();
    expect(prevBtn.disabled).toBe(true);
  });

  it('disables "Next" when there is no next page', async () => {
    const records = Array.from({ length: 5 }, (_, i) => makeRecord(i + 1));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeHorizonResponse(records, null),
    }));
    vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: noop, removeListener: noop }));

    renderPage();

    await waitFor(() => expect(screen.queryByText('Loading transactions...')).toBeNull());
    expect(screen.getByRole('button', { name: /next/i }).disabled).toBe(true);
  });

  it('fetches the following page when "Next" is clicked', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => makeRecord(i + 1));
    const page2 = Array.from({ length: 50 }, (_, i) => makeRecord(i + 51));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeHorizonResponse(page1, 'cursor-page-2'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeHorizonResponse(page2, 'cursor-page-3'),
      });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: noop, removeListener: noop }));

    renderPage();

    const nextBtn = await screen.findByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [secondUrl] = fetchMock.mock.calls[1];
    expect(secondUrl).toContain('page=2');
    expect(secondUrl).toContain('limit=50');
  });

  it('returns to the previous page when "Previous" is clicked', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => makeRecord(i + 1));
    const page2 = Array.from({ length: 50 }, (_, i) => makeRecord(i + 51));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeHorizonResponse(page1, 'cursor-page-2'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeHorizonResponse(page2, 'cursor-page-3'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeHorizonResponse(page1, 'cursor-page-2'),
      });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: noop, removeListener: noop }));

    renderPage();

    const nextBtn = await screen.findByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const prevBtn = screen.getByRole('button', { name: /previous/i });
    await waitFor(() => expect(prevBtn.disabled).toBe(false));
    fireEvent.click(prevBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const [thirdUrl] = fetchMock.mock.calls[2];
    expect(thirdUrl).toContain('page=1');
    expect(thirdUrl).toContain('limit=50');
  });

  it('shows a loading spinner during page transitions', async () => {
    let resolvePage2;
    const page2Promise = new Promise((resolve) => { resolvePage2 = resolve; });
    const page1 = Array.from({ length: 50 }, (_, i) => makeRecord(i + 1));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeHorizonResponse(page1, 'cursor-p2'),
      })
      .mockReturnValueOnce(page2Promise);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: noop, removeListener: noop }));

    renderPage();

    const nextBtn = await screen.findByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);

    await waitFor(() => expect(screen.queryByText('Loading transactions...')).not.toBeNull());

    resolvePage2({ ok: true, json: async () => makeHorizonResponse([], null) });
    await waitFor(() => expect(screen.queryByText('Loading transactions...')).toBeNull());
  });
});
