import { useState } from 'react';
import { useShielded } from '../context/ShieldedContext';
import { TxStatus } from './TxStatus';

export function DepositForm() {
  const { deposit, tokenSymbol, tokenDecimals, txProgress, clearTxProgress, shieldedWallet } = useShielded();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isSubmitting) return;

    setIsSubmitting(true);
    clearTxProgress();

    try {
      const amountBigInt = BigInt(Math.round(parseFloat(amount) * 10 ** tokenDecimals));
      await deposit(amountBigInt);
      setAmount('');
    } catch (err) {
      // Error is captured in txProgress
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="card">
        <div className="card-title">Deposit to Shielded Pool</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
          Move tokens from your public wallet into the shielded pool. Your deposit amount is public, but once shielded, further transactions are private.
        </p>

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
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={!amount || parseFloat(amount) <= 0 || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className="spinner" /> Processing...
            </>
          ) : (
            `Deposit ${amount || '0'} ${tokenSymbol}`
          )}
        </button>
      </div>

      <TxStatus />
    </form>
  );
}
