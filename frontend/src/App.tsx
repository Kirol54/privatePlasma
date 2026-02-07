import { useState } from 'react';
import { WalletProvider, useWallet } from './context/WalletContext';
import { ShieldedProvider } from './context/ShieldedContext';
import { ConnectWallet } from './components/ConnectWallet';
import { Dashboard } from './components/Dashboard';
import { DepositForm } from './components/DepositForm';
import { TransferForm } from './components/TransferForm';
import { WithdrawForm } from './components/WithdrawForm';
import { NotesList } from './components/NotesList';

type Tab = 'deposit' | 'transfer' | 'withdraw' | 'notes';

function AppContent() {
  const { address } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('deposit');

  if (!address) {
    return (
      <div className="app-container">
        <div className="app-header">
          <h1>Shielded Pool</h1>
          <p>Private payments on Plasma</p>
        </div>
        <ConnectWallet />
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>Shielded Pool</h1>
        <p>Private payments on Plasma</p>
      </div>

      <ConnectWallet />

      <div style={{ marginTop: 24 }}>
        <Dashboard />
      </div>

      <div className="tabs">
        {(['deposit', 'transfer', 'withdraw', 'notes'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'deposit' && <DepositForm />}
      {activeTab === 'transfer' && <TransferForm />}
      {activeTab === 'withdraw' && <WithdrawForm />}
      {activeTab === 'notes' && <NotesList />}
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <ShieldedProvider>
        <AppContent />
      </ShieldedProvider>
    </WalletProvider>
  );
}
