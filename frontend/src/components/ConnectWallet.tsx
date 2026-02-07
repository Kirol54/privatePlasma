import { useWallet } from '../context/WalletContext';

export function ConnectWallet() {
  const { address, isConnecting, error, connect, disconnect } = useWallet();

  if (address) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
        <span className="address">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={disconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="card connect-card">
      <h2 style={{ color: 'var(--accent)', marginBottom: 8 }}>Shielded Pool</h2>
      <p>Connect your wallet to start using private payments</p>
      {error && <div className="status status-error" style={{ marginBottom: 16 }}>{error}</div>}
      <button className="btn btn-primary" onClick={connect} disabled={isConnecting}>
        {isConnecting ? (
          <>
            <span className="spinner" /> Connecting...
          </>
        ) : (
          'Connect MetaMask'
        )}
      </button>
    </div>
  );
}
