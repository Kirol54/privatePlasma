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
import { ProxySettingsModal } from './components/ProxySettingsModal'; // Import logic

type Tab = 'deposit' | 'transfer' | 'withdraw' | 'notes';

function AppContent() {
  const { address } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('deposit');
  const [showLanding, setShowLanding] = useState(
    () => !sessionStorage.getItem('hideLanding')
  );
  const [showSettings, setShowSettings] = useState(false); // Settings state

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

  // Common header button for settings
  const SettingsButton = () => (
    <button
      onClick={() => setShowSettings(true)}
      style={{
        position: 'absolute',
        top: '24px',
        right: '16px',
        background: 'none',
        border: 'none',
        fontSize: '20px',
        cursor: 'pointer',
        opacity: 0.7,
        transition: 'opacity 0.2s',
      }}
      title="Settings"
      onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
      onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
    >
      ⚙️
    </button>
  );

  if (!address) {
    return (
      <div className="app-container" style={{ position: 'relative' }}>
        <SettingsButton />
        <div className="app-header">
          <button className="header-logo" onClick={goToLanding} title="Back to landing page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>
            <img src="/logo.svg" alt="Plasma Confidential SP1" style={{ height: '60px', width: 'auto' }} />
          </button>
          <p>Private payments on Plasma</p>
        </div>
        <ConnectWallet />
        {showSettings && <ProxySettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    );
  }

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      <SettingsButton />
      <div className="app-header">
        <button className="header-logo" onClick={goToLanding} title="Back to landing page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>
          <img src="/logo.svg" alt="Plasma Confidential SP1" style={{ height: '60px', width: 'auto' }} />
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

      {showSettings && <ProxySettingsModal onClose={() => setShowSettings(false)} />}
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
