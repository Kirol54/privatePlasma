import { useState, useEffect } from 'react';
import { WalletProvider, useWallet } from './context/WalletContext';
import { ShieldedProvider } from './context/ShieldedContext';
import { ConnectWallet } from './components/ConnectWallet';
import { Dashboard } from './components/Dashboard';
import { DepositForm } from './components/DepositForm';
import { TransferForm } from './components/TransferForm';
import { WithdrawForm } from './components/WithdrawForm';
import { NotesList } from './components/NotesList';
import { LandingPage } from './components/LandingPage';
import { ProxySettingsModal } from './components/ProxySettingsModal';
import { getProxyUrl } from './lib/settings';

type Tab = 'deposit' | 'transfer' | 'withdraw' | 'notes';

/* ── Subtle proxy health toast ───────────────────────────────────────── */

function ProxyBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const url = getProxyUrl();
    console.log(`Checking proof generation proxy health at ${url}/health...`);
    let cancelled = false;
    fetch(`${url}/health`)
      .then((res) => {
        if (!cancelled && !res.ok) setVisible(true);
      })
      .catch(() => {
        if (!cancelled) setVisible(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;

  return (
    <div className="proxy-toast">
      <span className="proxy-toast-dot" />
      <span>Proxy offline — proof generation unavailable</span>
      <button className="proxy-toast-btn" onClick={onOpenSettings}>
        Configure
      </button>
      <button
        className="proxy-toast-close"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/* ── Main app ────────────────────────────────────────────────────────── */

function AppContent() {
  const { address } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('deposit');
  const [showLanding, setShowLanding] = useState(
    () => !sessionStorage.getItem('hideLanding')
  );
  const [showSettings, setShowSettings] = useState(false);

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
            <img src="/favicon.svg" alt="Plasma Confidential SP1" style={{ height: '60px', width: 'auto' }} />
          </button>
          <p>Private payments on Plasma</p>
        </div>
        <ConnectWallet />
        <ProxyBanner onOpenSettings={() => setShowSettings(true)} />
        {showSettings && <ProxySettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    );
  }

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      <SettingsButton />
      <div className="app-header">
        <button className="header-logo" onClick={goToLanding} title="Back to landing page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>
          <img src="/favicon.svg" alt="Plasma Confidential SP1" style={{ height: '60px', width: 'auto' }} />
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

      <ProxyBanner onOpenSettings={() => setShowSettings(true)} />
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
