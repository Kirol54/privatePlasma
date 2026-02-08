import { useState, useEffect } from 'react';
import { getProxyUrl, setProxyUrl, resetProxyUrl } from '../lib/settings';

interface ProxySettingsModalProps {
    onClose: () => void;
}

export function ProxySettingsModal({ onClose }: ProxySettingsModalProps) {
    const [url, setUrl] = useState('');
    const [isDefault, setIsDefault] = useState(false);

    useEffect(() => {
        setUrl(getProxyUrl());
    }, []);

    const handleSave = () => {
        if (!url.trim()) return;
        setProxyUrl(url.trim());
        onClose();
        // Reload to apply changes cleanly if needed, or just let the next call use the new value.
        // Since getProxyUrl is called on every request, no reload is strictly necessary,
        // but a toast/alert would be nice. For now just close.
    };

    const handleReset = () => {
        resetProxyUrl();
        setUrl(getProxyUrl());
        setIsDefault(true);
        setTimeout(() => setIsDefault(false), 2000);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
        }}>
            <div className="card" style={{ width: '100%', maxWidth: '400px', margin: '20px' }}>
                <h3 className="card-title" style={{ fontSize: '16px', marginBottom: '20px' }}>⚙️ Proof Generation Proxy</h3>

                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Configure the URL for the Zero-Knowledge proof generation server.
                </p>

                <div className="input-group">
                    <label>Proxy URL</label>
                    <input
                        className="input"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://proxy.plasma.horse"
                    />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
                    <button className="btn btn-secondary" onClick={handleReset} style={{ flex: 1 }}>
                        {isDefault ? 'Reset ✓' : 'Reset to Default'}
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} style={{ flex: 1 }}>
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
