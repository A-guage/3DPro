import { useState } from 'react';

declare global {
  interface Window {
    electronAPI?: {
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;
    };
    electronEnv?: { isElectron: boolean };
  }
}

interface ElectronCSSProperties extends React.CSSProperties {
  WebkitAppRegion?: string;
}

export function TitleBar() {
  const [isElectron] = useState(!!window.electronAPI);
  const [maximized, setMaximized] = useState(false);

  if (!isElectron) return null;

  const handleMaximize = () => {
    setMaximized(v => !v);
    window.electronAPI?.windowMaximize();
  };

  return (
    <div style={barStyle}>
      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, letterSpacing: 0.5 }}>
        3D Scene Generator
      </div>
      <div style={{ display: 'flex', height: '100%' }}>
        <WinBtn onClick={() => window.electronAPI?.windowMinimize()} hoverColor="#334155">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="#94a3b8" /></svg>
        </WinBtn>
        <WinBtn onClick={handleMaximize} hoverColor="#334155">
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="2" y="0" width="8" height="8" stroke="#94a3b8" strokeWidth="1" />
              <rect x="0" y="2" width="8" height="8" stroke="#94a3b8" strokeWidth="1" fill="#1e293b" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="#94a3b8" strokeWidth="1" />
            </svg>
          )}
        </WinBtn>
        <WinBtn onClick={() => window.electronAPI?.windowClose()} hoverColor="#ef4444">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="#94a3b8" strokeWidth="1.2" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="#94a3b8" strokeWidth="1.2" />
          </svg>
        </WinBtn>
      </div>
    </div>
  );
}

function WinBtn({ onClick, hoverColor, children }: { onClick: () => void; hoverColor: string; children: React.ReactNode }) {
  const style: ElectronCSSProperties = {
    width: 46, height: '100%', border: 'none', background: 'transparent',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    WebkitAppRegion: 'no-drag',
  };
  return (
    <button style={style}
      onClick={onClick}
      onMouseEnter={e => (e.currentTarget.style.background = hoverColor)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >{children}</button>
  );
}

const barStyle: ElectronCSSProperties = {
  height: 32, background: '#1e293b', display: 'flex', alignItems: 'center',
  justifyContent: 'space-between', paddingLeft: 12,
  WebkitAppRegion: 'drag', userSelect: 'none', flexShrink: 0,
};
