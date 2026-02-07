import { useState } from 'react';
import { useShielded } from '../context/ShieldedContext';
import { TxStatus } from './TxStatus';

export function TransferForm() {
  const { privateTransfer, tokenSymbol, tokenDecimals, shieldedBalance, txProgress, clearTxProgress, shieldedWallet } = useShielded();
  const [recipientPubkey, setRecipientPubkey] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!shieldedWallet) {
    return (
      <div className="card">
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
          Create a shielded wallet first
        </p>
      </div>
    );
  }

  const formatBalance = (bal: bigint) => {
    const divisor = BigInt(10 ** tokenDecimals);
    const whole = bal / divisor;
    const frac = bal % divisor;
    const fracStr = frac.toString().padStart(tokenDecimals, '0').replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !recipientPubkey || isSubmitting) return;

    setIsSubmitting(true);
    clearTxProgress();

    try {
      const amountBigInt = BigInt(Math.round(parseFloat(amount) * 10 ** tokenDecimals));
      await privateTransfer(recipientPubkey, amountBigInt);
      setAmount('');
      setRecipientPubkey('');
    } catch (err) {
      // Error captured in txProgress
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="card">
        <div className="card-title">Private Transfer</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
          Send tokens privately within the shielded pool. Neither the amount nor the recipient is visible on-chain.
        </p>

        <div className="input-group">
          <label>Recipient Public Key</label>
          <input
            type="text"
            className="input"
            placeholder="0x..."
            value={recipientPubkey}
            onChange={(e) => setRecipientPubkey(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="input-hint">The recipient's shielded wallet public key (64 hex chars)</div>
        </div>

        <div className="input-group">
          <label>Amount ({tokenSymbol})</label>
          <input
            type="number"
            className="input"
            placeholder="0.00"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="input-hint">
            Available: {formatBalance(shieldedBalance)} {tokenSymbol}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={!amount || !recipientPubkey || parseFloat(amount) <= 0 || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className="spinner" /> Generating proof & sending...
            </>
          ) : (
            'Send Private Transfer'
          )}
        </button>
      </div>

      <TxStatus />
    </form>
  );
}
