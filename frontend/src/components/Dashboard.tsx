import { useShielded } from '../context/ShieldedContext';
import { useWallet } from '../context/WalletContext';
import { bytesToHex } from '../lib/browser-crypto';

export function Dashboard() {
  const { address } = useWallet();
  const {
    shieldedWallet,
    shieldedBalance,
    publicBalance,
    tokenSymbol,
    tokenDecimals,
    treeLeaves,
    isSyncing,
    syncMessage,
    initWallet,
    resetWallet,
    sync,
  } = useShielded();

  const formatAmount = (amount: bigint) => {
    const divisor = BigInt(10 ** tokenDecimals);
    const whole = amount / divisor;
    const frac = amount % divisor;
    const fracStr = frac.toString().padStart(tokenDecimals, '0').replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  };

  if (!shieldedWallet) {
    return (
      <div className="card connect-card">
        <h3 style={{ color: 'var(--accent)', marginBottom: 8 }}>Setup Shielded Wallet</h3>
        <p style={{ marginBottom: 16 }}>
          Create a new shielded wallet or import an existing spending key
        </p>
        <button className="btn btn-primary" onClick={initWallet}>
          Create New Wallet
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Balance Card */}
      <div className="card">
        <div className="card-title">Balances</div>
        <div className="balance-row">
          <span className="balance-label">Shielded</span>
          <span className="balance-value accent">
            {formatAmount(shieldedBalance)} {tokenSymbol}
          </span>
        </div>
        <div className="balance-row">
          <span className="balance-label">Public ({address?.slice(0, 6)}...)</span>
          <span className="balance-value">
            {formatAmount(publicBalance)} {tokenSymbol}
          </span>
        </div>
      </div>

      {/* Info Card — share these with senders */}
      <div className="card">
        <div className="card-title">Wallet Info</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
          Share both keys below with anyone who wants to send you a private transfer.
        </p>
        <div className="balance-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="balance-label">Shielded Public Key</span>
          <span className="address" style={{ fontSize: 11, wordBreak: 'break-all', cursor: 'pointer' }}
            onClick={() => navigator.clipboard.writeText(bytesToHex(shieldedWallet.pubkey))}
            title="Click to copy"
          >
            {bytesToHex(shieldedWallet.pubkey)}
          </span>
        </div>
        <div className="balance-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 8 }}>
          <span className="balance-label">Viewing Public Key</span>
          <span className="address" style={{ fontSize: 11, wordBreak: 'break-all', cursor: 'pointer' }}
            onClick={() => navigator.clipboard.writeText(bytesToHex(shieldedWallet.getViewingPublicKey()))}
            title="Click to copy"
          >
            {bytesToHex(shieldedWallet.getViewingPublicKey())}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <div className="balance-row">
            <span className="balance-label">Spendable Notes</span>
            <span className="balance-value" style={{ fontSize: 15, marginLeft: 8 }}>
              {shieldedWallet.getSpendableNotes().length}
            </span>
          </div>
          <div className="balance-row">
            <span className="balance-label">Tree Leaves</span>
            <span className="balance-value" style={{ fontSize: 15, marginLeft: 8 }}>
              {treeLeaves}
            </span>
          </div>
        </div>
      </div>

      {/* Sync */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-secondary" onClick={sync} disabled={isSyncing} style={{ flex: 1 }}>
          {isSyncing ? (
            <>
              <span className="spinner" /> Syncing...
            </>
          ) : (
            'Sync Tree'
          )}
        </button>
        <button className="btn btn-danger btn-sm" onClick={resetWallet} style={{ flex: 0 }}>
          Reset
        </button>
      </div>

      {syncMessage && (
        <div className={`status ${isSyncing ? 'status-info' : 'status-success'}`}>
          {syncMessage}
        </div>
      )}
    </>
  );
}
