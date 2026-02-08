import { useState, useRef } from 'react';
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
    importWallet,
    resetWallet,
    exportWallet,
    sync,
  } = useShielded();

  const [showImport, setShowImport] = useState(false);
  const [importKey, setImportKey] = useState('');
  const [importError, setImportError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatAmount = (amount: bigint) => {
    const divisor = BigInt(10 ** tokenDecimals);
    const whole = amount / divisor;
    const frac = amount % divisor;
    const fracStr = frac.toString().padStart(tokenDecimals, '0').replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleImportKey = () => {
    setImportError('');
    try {
      const clean = importKey.trim().replace(/^0x/, '');
      if (clean.length !== 64 || !/^[0-9a-fA-F]+$/.test(clean)) {
        setImportError('Invalid spending key: must be 64 hex characters (32 bytes)');
        return;
      }
      importWallet(clean);
      setShowImport(false);
      setImportKey('');
    } catch (err: any) {
      setImportError(err.message);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const data = JSON.parse(text);
        if (!data.spendingKey) {
          setImportError('Invalid wallet file: missing spendingKey field');
          return;
        }
        importWallet(data.spendingKey);
        setShowImport(false);
        setImportKey('');
      } catch (err: any) {
        setImportError(`Failed to parse wallet file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleExport = () => {
    const json = exportWallet();
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shielded-wallet-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!shieldedWallet) {
    return (
      <div className="card connect-card">
        <h3 style={{ color: 'var(--accent)', marginBottom: 8 }}>Setup Shielded Wallet</h3>
        <p style={{ marginBottom: 16 }}>
          Create a new shielded wallet or import an existing one
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-primary" onClick={initWallet}>
            Create New Wallet
          </button>
          <button className="btn btn-secondary" onClick={() => setShowImport(!showImport)}>
            Import Wallet
          </button>
        </div>

        {showImport && (
          <div style={{ marginTop: 16, textAlign: 'left' }}>
            <div className="input-group">
              <label>Spending Key (hex)</label>
              <input
                className="input"
                type="password"
                placeholder="0x... or paste 64 hex characters"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
              />
              <div className="input-hint">Your 32-byte spending key in hex format</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleImportKey} style={{ flex: 1 }}>
                Import Key
              </button>
              <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ flex: 1 }}>
                Import File
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            {importError && (
              <div className="status status-error" style={{ marginTop: 8 }}>{importError}</div>
            )}
          </div>
        )}
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
            onClick={() => handleCopy(bytesToHex(shieldedWallet.pubkey), 'shielded')}
            title="Click to copy"
          >
            {bytesToHex(shieldedWallet.pubkey)}
            {copied === 'shielded' && <span style={{ color: 'var(--success)', marginLeft: 6, fontSize: 10 }}>Copied!</span>}
          </span>
        </div>
        <div className="balance-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 8 }}>
          <span className="balance-label">Viewing Public Key</span>
          <span className="address" style={{ fontSize: 11, wordBreak: 'break-all', cursor: 'pointer' }}
            onClick={() => handleCopy(bytesToHex(shieldedWallet.getViewingPublicKey()), 'viewing')}
            title="Click to copy"
          >
            {bytesToHex(shieldedWallet.getViewingPublicKey())}
            {copied === 'viewing' && <span style={{ color: 'var(--success)', marginLeft: 6, fontSize: 10 }}>Copied!</span>}
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

      {/* Sync + Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button className="btn btn-secondary" onClick={sync} disabled={isSyncing} style={{ flex: 1 }}>
          {isSyncing ? (
            <>
              <span className="spinner" /> Syncing...
            </>
          ) : (
            'Sync Tree'
          )}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleExport} style={{ flex: 0, whiteSpace: 'nowrap' }}>
          Export
        </button>
        <button className="btn btn-danger btn-sm" onClick={resetWallet} style={{ flex: 0 }}>
          Reset
        </button>
      </div>

      {syncMessage && (
        <div className={`status ${
          syncMessage.includes('RPC limit') ? 'status-warning' :
          syncMessage.includes('failed') ? 'status-error' :
          isSyncing ? 'status-info' : 'status-success'
        }`}>
          {syncMessage}
        </div>
      )}
    </>
  );
}
