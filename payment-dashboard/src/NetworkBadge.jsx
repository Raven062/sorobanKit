const STELLAR_NETWORK = (import.meta.env.VITE_STELLAR_NETWORK || '').toLowerCase()

function inferNetwork() {
  const explicit = (import.meta.env.VITE_NETWORK || '').toLowerCase()
  if (explicit === 'mainnet' || explicit === 'public') return 'mainnet'
  if (explicit === 'testnet') return 'testnet'

  const apiBase = (import.meta.env.VITE_API_BASE || '').toLowerCase()
  if (apiBase.includes('mainnet') || apiBase.includes('public')) return 'mainnet'
  if (apiBase.includes('testnet')) return 'testnet'

  return 'testnet'
}

function resolveNetwork() {
  if (STELLAR_NETWORK === 'mainnet' || STELLAR_NETWORK === 'testnet') {
    return STELLAR_NETWORK
  }

  if (STELLAR_NETWORK) {
    console.warn(
      `[NetworkBadge] Unrecognized VITE_STELLAR_NETWORK value "${STELLAR_NETWORK}". ` +
        'Expected "testnet" or "mainnet". Falling back to inference.'
    )
  } else {
    console.warn(
      '[NetworkBadge] VITE_STELLAR_NETWORK is not set. ' +
        'Inferring network label from VITE_NETWORK/VITE_API_BASE. ' +
        'Set VITE_STELLAR_NETWORK to "testnet" or "mainnet" to avoid mislabeling.'
    )
  }

  return inferNetwork()
}

const NETWORK = resolveNetwork()
const isMainnet = NETWORK === 'mainnet'

export default function NetworkBadge() {
  return (
    <span
      className="network-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.03em',
        backgroundColor: isMainnet ? '#D1FAE5' : '#FEF3C7',
        color: isMainnet ? '#065F46' : '#92400E',
        border: `1px solid ${isMainnet ? '#6EE7B7' : '#FCD34D'}`,
      }}
      aria-label={`Network: ${isMainnet ? 'Mainnet' : 'Testnet'}`}
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: isMainnet ? '#059669' : '#D97706',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      {isMainnet ? 'Mainnet' : 'Testnet'}
    </span>
  )
}