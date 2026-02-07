import { useShielded } from '../context/ShieldedContext';
import { bytesToHex } from '../lib/browser-crypto';

export function NotesList() {
  const { notes, shieldedWallet, tokenSymbol, tokenDecimals } = useShielded();

  if (!shieldedWallet) {
    return (
      <div className="card">
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
          Create a shielded wallet first
        </p>
      </div>
    );
  }

  const formatAmount = (amount: bigint) => {
    const divisor = BigInt(10 ** tokenDecimals);
    const whole = amount / divisor;
    const frac = amount % divisor;
    const fracStr = frac.toString().padStart(tokenDecimals, '0').replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  };

  if (notes.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Notes</div>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>
          No notes yet. Make a deposit to create your first note.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: 'auto' }}>
      <div className="card-title">Notes ({notes.length})</div>
      <table className="notes-table">
        <thead>
          <tr>
            <th>Leaf</th>
            <th>Amount</th>
            <th>Commitment</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((note, i) => {
            const isSpent = shieldedWallet.isNoteSpent(note);
            return (
              <tr key={i}>
                <td style={{ color: 'var(--text-secondary)' }}>#{note.leafIndex}</td>
                <td>
                  {formatAmount(note.amount)} {tokenSymbol}
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  {bytesToHex(note.commitment).slice(0, 14)}...
                </td>
                <td>
                  <span className={`badge ${isSpent ? 'badge-spent' : 'badge-active'}`}>
                    {isSpent ? 'spent' : 'active'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
