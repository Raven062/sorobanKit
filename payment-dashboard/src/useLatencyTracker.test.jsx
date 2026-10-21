import React from 'react';
import { render, act } from '@testing-library/react';
import { useLatencyTracker } from './useLatencyTracker';

describe('useLatencyTracker', () => {
  let originalFetch;

  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function TestComponent() {
    useLatencyTracker();
    return null;
  }

  it('clears the polling interval on unmount and does not fire callbacks afterwards', async () => {
    const { unmount } = render(<TestComponent />);

    // Allow any initial effect-triggered fetch to settle.
    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    const callsBeforeUnmount = global.fetch.mock.calls.length;

    unmount();

    // Advance timers well past the 30s polling interval.
    await act(async () => {
      jest.advanceTimersByTime(120000);
    });

    expect(global.fetch.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it('does not update state after unmount (no React warnings)', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(<TestComponent />);

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    unmount();

    await act(async () => {
      jest.advanceTimersByTime(120000);
    });

    const stateUpdateWarnings = consoleErrorSpy.mock.calls.filter((call) =>
      String(call[0]).includes('unmounted component')
    );
    expect(stateUpdateWarnings).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });
});