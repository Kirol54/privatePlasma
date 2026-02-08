import { useState } from 'react';
import { WalletProvider, useWallet } from './context/WalletContext';
import { ShieldedProvider } from './context/ShieldedContext';
import { ConnectWallet } from './components/ConnectWallet';
import { Dashboard } from './components/Dashboard';
import { DepositForm } from './components/DepositForm';
import { TransferForm } from './components/TransferForm';
import { WithdrawForm } from './components/WithdrawForm';
import { NotesList } from './components/NotesList';
import { LandingPage } from './components/LandingPage';

type Tab = 'deposit' | 'transfer' | 'withdraw' | 'notes';

function AppContent() {
  const { address } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('deposit');
  const [showLanding, setShowLanding] = useState(
    () => !sessionStorage.getItem('hideLanding')
  );

  const goToLanding = () => {
    sessionStorage.removeItem('hideLanding');
    setShowLanding(true);
  };

  const dismissLanding = () => {
    sessionStorage.setItem('hideLanding', '1');
    setShowLanding(false);
  };

  if (showLanding) {
    return <LandingPage onLaunchApp={dismissLanding} />;
  }

  if (!address) {
    return (
      <div className="app-container">
        <div className="app-header">
          <button className="header-logo" onClick={goToLanding} title="Back to landing page">
            🛡️ Shielded Pool
          </button>
          <p>Private payments on Plasma</p>
        </div>
        <ConnectWallet />
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="app-header">
        <button className="header-logo" onClick={goToLanding} title="Back to landing page">
          🛡️ Shielded Pool
        </button>
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
