import { useEffect, useRef } from 'react';
import './RecentAddresses.css';

/**
 * @typedef {Object} RecentAddressesProps
 * @property {string[]} addresses - Ordered list of recent entries.
 * @property {(value: string) => void} onSelect - Called when the user clicks an entry.
 * @property {() => void} onClear - Called when the user clicks "Clear history".
 * @property {boolean} isVisible - Controls whether the dropdown is shown.
 * @property {() => void} onClose - Called when the dropdown should close.
 */

/**
 * RecentAddresses
 *
 * Renders a dropdown list of recently used recipient addresses/usernames.
 * Clicking an entry calls onSelect with that value.
 * The list is hidden when there are no entries, when the input is empty, or
 * when the parent signals it should be closed.
 *
 * @param {RecentAddressesProps} props
 * @returns {import('react').ReactElement | null}
 */
function RecentAddresses({ addresses, onSelect, onClear, isVisible, onClose }) {
  /** @type {import('react').RefObject<HTMLDivElement>} */
  const containerRef = useRef(null);

  // Close dropdown when the user clicks outside of it.
  useEffect(() => {
    if (!isVisible) return;

    /** @param {MouseEvent} event */
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible, onClose]);

  // Close on Escape key.
  useEffect(() => {
    if (!isVisible) return;

    /** @param {KeyboardEvent} event */
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onClose]);

  if (!isVisible || addresses.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="recent-addresses"
      role="listbox"
      aria-label="Recently used recipients"
    >
      <div className="recent-addresses__header">
        <span className="recent-addresses__title">Recent recipients</span>
        <button
          type="button"
          className="recent-addresses__clear"
          onClick={() => {
            onClear();
            onClose();
          }}
          aria-label="Clear recent recipients history"
        >
          Clear history
        </button>
      </div>
      <ul className="recent-addresses__list">
        {addresses.map((address) => (
          <li key={address} className="recent-addresses__item">
            <button
              type="button"
              className="recent-addresses__option"
              onClick={() => {
                onSelect(address);
                onClose();
              }}
              // Allow keyboard activation.
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(address);
                  onClose();
                }
              }}
              role="option"
              aria-selected={false}
            >
              {/* Clock icon */}
              <svg
                className="recent-addresses__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="recent-addresses__label">{address}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default RecentAddresses;
