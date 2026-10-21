import { Fragment, useCallback, useEffect, useState } from 'react';
import NetworkBadge from '../NetworkBadge';
import ScrollToTop from '../ScrollToTop';
import LoadingSpinner from '../LoadingSpinner';
import MobileNav from './MobileNav';
import { NAV_STORAGE_KEY, formatShortAddress, useNavState, useWalletMenu } from './shared';

/**
 * @typedef {Object} HistoryEntry
 * @property {string} id
 * @property {string} counterparty
 * @property {string} direction
 * @property {string} amount
 * @property {string} status
 * @property {string} type
 * @property {string} createdAt
 * @property {string} [transactionHash]
 * @property {string} asset
 * @property {string} explorerLink
 */

/**
 * @typedef {Object} AssetBalanceChange
 * @property {string} [asset_type]
 * @property {string} [from]
 * @property {string} [to]
 * @property {string} [amount]
 */

/**
 * @typedef {Object} HorizonRecord
 * @property {string} id
 * @property {string} type
 * @property {string} [created_at]
 * @property {string} [transaction_hash]
 * @property {boolean} [transaction_successful]
 * @property {string} [from]
 * @property {string} [to]
 * @property {string} [into]
 * @property {string} [account]
 * @property {string} [funder]
 * @property {string} [asset_type]
 * @property {string} [asset_code]
 * @property {string} [amount]
 * @property {string} [starting_balance]
 * @property {AssetBalanceChange[]} [asset_balance_changes]
 */

/**
 * @typedef {Object} HistoryPageProps
 * @property {string | null} userPublicKey
 * @property {(address: string) => void} setUserPublicKey
 * @property {() => Promise<{ address?: string } | void>} onConnectWallet
 * @property {() => void} onDisconnectWallet
 * @property {() => void} onRefreshBalance
 * @property {() => void} onDashboardClick
 * @property {() => void} onAnalyticsClick
 * @property {() => void} onHelpClick
 * @property {() => void} onRegisterClick
 * @property {boolean} canRegister
 */

/**
 * @param {HistoryPageProps} props
 */
function HistoryPage({
  userPublicKey,
  setUserPublicKey,
  onConnectWallet,
  onDisconnectWallet,
  onRefreshBalance,
  onDashboardClick,
  onAnalyticsClick,
  onHelpClick,
  onRegisterClick,
  canRegister,
}) {
  const PAGE_LIMIT = 50;

  const [isNavOpen, setIsNavOpen] = useNavState();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  /** @type {[HistoryEntry[], (value: HistoryEntry[] | ((prev: HistoryEntry[]) => HistoryEntry[])) => void]} */
  const [history, setHistory] = useState([]);
  /** @type {[string | null, (value: string | null | ((prev: string | null) => string | null)) => void]} */
  const [expandedId, setExpandedId] = useState(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const {
    menuRef,
    isOpen: isWalletMenuOpen,
    setIsOpen: setIsWalletMenuOpen,
  } = useWalletMenu();
  const closeNav = () => {
    sessionStorage.setItem(NAV_STORAGE_KEY, "false");
    setIsNavOpen(false);
  };
  const handleNav = (action) => {
    sessionStorage.setItem(NAV_STORAGE_KEY, "false");
    setIsNavOpen(false);
    action();
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const result = await onConnectWallet();
      if (result?.address) {
        setUserPublicKey(result.address);
      }
    } finally {
      setIsConnecting(false);
    }
  };
  const handleDisconnect = () => {
    onDisconnectWallet();
  };

  const loadHistory = useCallback(
    async (signal, { pageNumber = 1 } = {}) => {
      if (!userPublicKey) {
        return;
      }

      await Promise.resolve();
      setIsLoading(true);
      setHistory([]);
      setHasMore(false);
      setHistoryError("");
      try {
        const url = `${HORIZON_BASE}/transactions/export?account=${encodeURIComponent(userPublicKey)}&page=${pageNumber}&limit=${PAGE_LIMIT}`;
        const response = await fetch(url, { signal, cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Export error (${response.status}).`);
        }

        const data = await response.json();
        const records = Array.isArray(data)
          ? data
          : (data?.records ?? data?.transactions ?? data?._embedded?.records ?? []);
        const filtered = records.filter((record) =>
          [
            "payment",
            "path_payment_strict_receive",
            "path_payment_strict_send",
            "create_account",
            "account_merge",
            "invoke_host_function",
          ].includes(record.type),
        );
        /** @type {HistoryEntry[]} */
        const formatted = filtered
          .flatMap((record) => {
            if (
              record.type === "invoke_host_function" &&
              record.asset_balance_changes?.length
            ) {
              const changes = record.asset_balance_changes
                .filter((change) => change.asset_type === "native")
                .filter(
                  (change) =>
                    change.from === userPublicKey ||
                    change.to === userPublicKey,
                );

              return changes.map((change, index) => {
                const direction =
                  change.from === userPublicKey ? "Sent" : "Received";
                const counterparty =
                  change.from === userPublicKey ? change.to : change.from;
                const amount = `${change.amount} XLM`;
                const status =
                  record.transaction_successful === false
                    ? "Failed"
                    : "Success";
                const explorerLink = record.transaction_hash
                  ? `https://stellar.expert/explorer/testnet/tx/${record.transaction_hash}`
                  : "";

                return {
                  id: `${record.id}-${index}`,
                  counterparty: counterparty || "Unknown",
                  direction,
                  amount,
                  status,
                  type: record.type,
                  createdAt: record.created_at,
                  transactionHash: record.transaction_hash,
                  asset: "XLM",
                  explorerLink,
                };
              });
            }

            const isSender =
              record.from === userPublicKey || record.account === userPublicKey;
            const isReceiver =
              record.to === userPublicKey || record.into === userPublicKey;
            const direction =
              isSender && !isReceiver
                ? "Sent"
                : isReceiver
                  ? "Received"
                  : "Sent";
            const counterparty =
              direction === "Sent"
                ? record.to || record.into || record.account || "Unknown"
                : record.from || record.funder || record.account || "Unknown";

            const asset =
              record.asset_type === "native"
                ? "XLM"
                : record.asset_code || "Asset";
            const rawAmount = record.amount || record.starting_balance || "";
            const amount = rawAmount ? `${rawAmount} ${asset}` : "-";
            const status =
              record.transaction_successful === false ? "Failed" : "Success";
            const explorerLink = record.transaction_hash
              ? `https://stellar.expert/explorer/testnet/tx/${record.transaction_hash}`
              : "";

            return [
              {
                id: String(record.id),
                counterparty,
                direction,
                amount,
                status,
                type: record.type,
                createdAt: record.created_at,
                transactionHash: record.transaction_hash,
                asset,
                explorerLink,
              },
            ];
          })
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );

        const latest = formatted[0];
        if (latest?.status === "Success") {
          const lastSeen = sessionStorage.getItem("stellar-last-tx");
          const latestKey = `${latest.transactionHash || latest.id}-${latest.amount}`;
          if (latestKey !== lastSeen) {
            sessionStorage.setItem("stellar-last-tx", latestKey);
            onRefreshBalance();
          }
        }

        setHasMore(records.length >= PAGE_LIMIT);
        setHistory(formatted);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setHistoryError(
            error.message || "Unable to load transaction history.",
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [onRefreshBalance, userPublicKey, PAGE_LIMIT],
  );

  const handlePreviousPage = () => {
    setExpandedId(null);
    setPage((current) => Math.max(1, current - 1));
  };

  const handleNextPage = () => {
    setExpandedId(null);
    setPage((current) => current + 1);
  };

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      await loadHistory(controller.signal, { pageNumber: page });
    };
    run();
    return () => controller.abort();
  }, [loadHistory, refreshIndex, userPublicKey, page]);

  useEffect(() => {
    setPage(1);
  }, [userPublicKey]);

  useEffect(() => {
    const handleUpdate = () => {
      setRefreshIndex((value) => value + 1);
    };

    window.addEventListener("stellar:tx-update", handleUpdate);
    return () => window.removeEventListener("stellar:tx-update", handleUpdate);
  }, []);
  return (
    <div className={`dashboard ${isNavOpen ? "nav-open" : ""}`}>
      <button
        type="button"
        className={`sidebar-scrim ${isNavOpen ? "is-open" : ""}`}
        onClick={() => setIsNavOpen(false)}
        aria-label="Close navigation"
      />
      <aside className={`sidebar ${isNavOpen ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">S</div>
          <h1>Stellar Pay</h1>
        </div>
        <div className="nav">
          <button type="button" onClick={() => handleNav(onDashboardClick)}>
            Dashboard
          </button>
          <button type="button" aria-current="page" onClick={closeNav}>
            History
          </button>
          <button type="button" onClick={() => handleNav(onAnalyticsClick)}>
            Analytics
          </button>
          <button type="button" onClick={() => handleNav(onHelpClick)}>
            Help
          </button>
          {canRegister && (
            <button type="button" onClick={() => handleNav(onRegisterClick)}>
              Registration
            </button>
          )}
        </div>
        <div className="sidebar-card">
          <h3>Timeline</h3>
          <p>Payments are archived for 90 days.</p>
        </div>
        <div className="sidebar-card">
          <h3>Filters</h3>
          <p>Sort by status, amount, or corridor.</p>
        </div>
        {userPublicKey && (
          <button
            type="button"
            className="disconnect-button"
            onClick={onDisconnectWallet}
          >
            Disconnect wallet
          </button>
        )}
      </aside>

      <main className="main">
        <section className="topbar reveal">
          <button
            type="button"
            className="hamburger"
            onClick={() => setIsNavOpen((prev) => !prev)}
            aria-label="Toggle navigation"
            aria-expanded={isNavOpen}
          >
            <span />
            <span />
            <span />
          </button>
          <div>
            <h2 className="headline">Transaction history</h2>
            <p className="subtle">
              Connect your wallet to review recent transactions.
            </p>
          </div>
          <div className="topbar-actions">
            <span className="chip">Last 24 hours</span>
            <NetworkBadge />
            <div className="wallet-menu" ref={menuRef}>
              <button
                type="button"
                className="connect-pill"
                onClick={() => {
                  if (userPublicKey) {
                    setIsWalletMenuOpen((prev) => !prev);
                  } else {
                    handleConnect();
                  }
                }}
                disabled={isConnecting}
                aria-expanded={isWalletMenuOpen}
              >
                {userPublicKey
                  ? `Connected: ${formatShortAddress(userPublicKey)}`
                  : isConnecting
                    ? "Connecting..."
                    : "Connect wallet"}
              </button>
              {userPublicKey && isWalletMenuOpen && (
                <div className="wallet-dropdown">
                  <button type="button" onClick={handleDisconnect}>
                    Disconnect wallet
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card reveal">
          <div className="card-header">
            <h2>Recent transactions</h2>
            <div className="history-actions">
              <span className="chip">Latest</span>
              <button
                type="button"
                className={`refresh-button ${isLoading ? "is-loading" : ""}`}
                onClick={() => setRefreshIndex((value) => value + 1)}
                disabled={!userPublicKey || isLoading}
                aria-label="Refresh history"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                  <path d="M20 4v6h-6" />
                </svg>
              </button>
            </div>
          </div>
          {!userPublicKey && (
            <div className="wallet-status">
              Connect your wallet to view your transaction history.
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting..." : "Connect wallet"}
              </button>
            </div>
          )}
          {userPublicKey && isLoading && (
            <div className="wallet-status" aria-live="polite">
              <LoadingSpinner label="Loading transactions..." />
            </div>
          )}
          {userPublicKey && historyError && (
            <div className="wallet-status">{historyError}</div>
          )}
          {userPublicKey &&
            !isLoading &&
            !historyError &&
            history.length === 0 && (
              <div className="wallet-status">
                No transactions found for this wallet.
              </div>
            )}
          {userPublicKey &&
            !isLoading &&
            !historyError &&
            history.length > 0 && (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Counterparty</th>
                    <th>Direction</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <Fragment key={entry.id}>
                      <tr>
                        <td>{formatShortAddress(entry.counterparty)}</td>
                        <td>{entry.direction}</td>
                        <td>{entry.amount}</td>
                        <td>{entry.status}</td>
                        <td>
                          <button
                            type="button"
                            className="details-button"
                            onClick={() =>
                              setExpandedId((current) =>
                                current === entry.id ? null : entry.id,
                              )
                            }
                          >
                            {expandedId === entry.id ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {expandedId === entry.id && (
                        <tr className="details-row">
                          <td colSpan={5}>
                            <div className="details-panel">
                              <div>
                                <strong>Type:</strong> {entry.type}
                              </div>
                              <div>
                                <strong>Counterparty:</strong>{" "}
                                {entry.counterparty}
                              </div>
                              <div>
                                <strong>Asset:</strong> {entry.asset}
                              </div>
                              <div>
                                <strong>Time:</strong>{" "}
                                {new Date(entry.createdAt).toLocaleString()}
                              </div>
                              <div>
                                <strong>Hash:</strong>{" "}
                                {entry.transactionHash || "Unavailable"}
                              </div>
                              {entry.explorerLink && (
                                <div>
                                  <a
                                    className="details-link"
                                    href={entry.explorerLink}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View on Stellar Expert
                                  </a>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          {userPublicKey && !historyError && (
            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-button"
                onClick={handlePreviousPage}
                disabled={isLoading || page <= 1}
              >
                Previous
              </button>
              <span className="pagination-status" aria-live="polite">
                Page {page}
              </span>
              <button
                type="button"
                className="pagination-button"
                onClick={handleNextPage}
                disabled={isLoading || !hasMore}
              >
                Next
              </button>
            </div>
          )}
        </section>
      </main>
      <MobileNav
        active="history"
        onDashboardClick={() => handleNav(onDashboardClick)}
        onHistoryClick={closeNav}
        onAnalyticsClick={() => handleNav(onAnalyticsClick)}
        onHelpClick={() => handleNav(onHelpClick)}
        onRegisterClick={() => handleNav(onRegisterClick)}
        canRegister={canRegister}
      />
      <ScrollToTop />
    </div>
  );
}

export default HistoryPage;
