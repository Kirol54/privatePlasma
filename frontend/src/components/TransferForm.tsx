import { useState } from 'react';
import { useShielded } from '../context/ShieldedContext';
import { TxStatus } from './TxStatus';

export function TransferForm() {
  const { privateTransfer, tokenSymbol, tokenDecimals, shieldedBalance, txProgress, clearTxProgress, shieldedWallet } = useShielded();
  const [recipientPubkey, setRecipientPubkey] = useState('');
  const [recipientViewingPubkey, setRecipientViewingPubkey] = useState('');
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

  const spendableCount = shieldedWallet.getSpendableNotes().length;
  const needsMoreNotes = spendableCount < 2;

  const formatBalance = (bal: bigint) => {
    const divisor = BigInt(10 ** tokenDecimals);
    const whole = bal / divisor;
    const frac = bal % divisor;
    const fracStr = frac.toString().padStart(tokenDecimals, '0').replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !recipientPubkey || !recipientViewingPubkey || isSubmitting) return;

    setIsSubmitting(true);
    clearTxProgress();

    try {
      const amountBigInt = BigInt(Math.round(parseFloat(amount) * 10 ** tokenDecimals));
      await privateTransfer(recipientPubkey, amountBigInt, recipientViewingPubkey);
      setAmount('');
      setRecipientPubkey('');
      setRecipientViewingPubkey('');
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

        {needsMoreNotes && (
          <div className="status status-warning" style={{ marginBottom: 16 }}>
            The 2-in-2-out transfer circuit requires at least 2 shielded notes.
            You have {spendableCount}. Make {2 - spendableCount} more deposit{2 - spendableCount > 1 ? 's' : ''} first,
            or use Withdraw to move funds with a single note.
          </div>
        )}

        <div className="input-group">
          <label>Recipient Shielded Public Key</label>
          <input
            type="text"
            className="input"
            placeholder="0x... (64 hex chars)"
            value={recipientPubkey}
            onChange={(e) => setRecipientPubkey(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="input-hint">The recipient's shielded pubkey from their Dashboard</div>
        </div>

        <div className="input-group">
          <label>Recipient Viewing Public Key</label>
          <input
            type="text"
            className="input"
            placeholder="0x... (64 hex chars)"
            value={recipientViewingPubkey}
            onChange={(e) => setRecipientViewingPubkey(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="input-hint">So the recipient can decrypt and claim the note</div>
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
          disabled={!amount || !recipientPubkey || !recipientViewingPubkey || parseFloat(amount) <= 0 || isSubmitting || needsMoreNotes}
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
