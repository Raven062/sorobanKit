import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NetworkBadge from './NetworkBadge';

describe('NetworkBadge', () => {
  const originalEnv = { ...import.meta.env };
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    // Restore original env values
    for (const key of Object.keys(import.meta.env)) {
      if (!(key in originalEnv)) {
        delete import.meta.env[key];
      }
    }
    Object.assign(import.meta.env, originalEnv);
  });

  it('renders "Testnet" when VITE_STELLAR_NETWORK is "testnet"', () => {
    import.meta.env.VITE_STELLAR_NETWORK = 'testnet';

    render(<NetworkBadge />);

    expect(screen.getByText(/testnet/i)).toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('renders "Mainnet" when VITE_STELLAR_NETWORK is "mainnet"', () => {
    import.meta.env.VITE_STELLAR_NETWORK = 'mainnet';

    render(<NetworkBadge />);

    expect(screen.getByText(/mainnet/i)).toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to the heuristic and logs a warning when VITE_STELLAR_NETWORK is unset', () => {
    delete import.meta.env.VITE_STELLAR_NETWORK;
    // Point API base at a testnet-like URL so the heuristic infers "Testnet"
    import.meta.env.VITE_API_BASE = 'https://horizon-testnet.stellar.org';

    render(<NetworkBadge />);

    expect(warnSpy).toHaveBeenCalled();
    expect(screen.getByText(/testnet/i)).toBeInTheDocument();
  });
});