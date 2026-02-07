import { useShielded } from '../context/ShieldedContext';

const STAGE_PROGRESS: Record<string, number> = {
  idle: 0,
  approving: 15,
  depositing: 30,
  proving: 50,
  submitting: 75,
  confirming: 90,
  done: 100,
  error: 0,
};

export function TxStatus() {
  const { txProgress, clearTxProgress } = useShielded();

  if (!txProgress || txProgress.stage === 'idle') return null;

  const progress = STAGE_PROGRESS[txProgress.stage] || 0;
  const isDone = txProgress.stage === 'done';
  const isError = txProgress.stage === 'error';

  return (
    <div
      className={`status ${isError ? 'status-error' : isDone ? 'status-success' : 'status-info'}`}
      style={{ marginTop: 16 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isDone && !isError && <span className="spinner" />}
          <span>{txProgress.message}</span>
        </div>
        {(isDone || isError) && (
          <button
            onClick={clearTxProgress}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            x
          </button>
        )}
      </div>

      {txProgress.txHash && (
        <div style={{ marginTop: 8, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          Tx: {txProgress.txHash.slice(0, 14)}...{txProgress.txHash.slice(-8)}
        </div>
      )}

      {!isDone && !isError && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
