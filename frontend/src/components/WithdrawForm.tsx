import { useState } from 'react';
import { useShielded } from '../context/ShieldedContext';
import { useWallet } from '../context/WalletContext';
import { TxStatus } from './TxStatus';

export function WithdrawForm() {
  const { withdraw, tokenSymbol, tokenDecimals, shieldedBalance, txProgress, clearTxProgress, shieldedWallet } = useShielded();
  const { address } = useWallet();
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
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
    if (!amount || isSubmitting) return;

    setIsSubmitting(true);
    clearTxProgress();

    try {
      const amountBigInt = BigInt(Math.round(parseFloat(amount) * 10 ** tokenDecimals));
      const toAddress = recipient || address || '';
      await withdraw(amountBigInt, toAddress);
      setAmount('');
    } catch (err) {
      // Error captured in txProgress
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="card">
        <div className="card-title">Withdraw from Shielded Pool</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
          Move tokens from the shielded pool back to a public address. A ZK proof ensures validity without revealing your identity.
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
          <div className="input-hint">
            Available: {formatBalance(shieldedBalance)} {tokenSymbol}
          </div>
        </div>

        <div className="input-group">
          <label>Recipient Address (optional)</label>
          <input
            type="text"
            className="input"
            placeholder={address || '0x...'}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="input-hint">
            Leave empty to withdraw to your connected wallet
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={!amount || parseFloat(amount) <= 0 || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className="spinner" /> Generating proof & withdrawing...
            </>
          ) : (
            `Withdraw ${amount || '0'} ${tokenSymbol}`
          )}
        </button>
      </div>

      <TxStatus />
    </form>
  );
}
