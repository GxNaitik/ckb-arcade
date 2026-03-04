import React from 'react';
import ReactDOM from 'react-dom/client';
import { ccc } from '@ckb-ccc/connector-react';
import { AppWithCcc } from './App.tsx';
import './index.css';

class RootErrorBoundary extends React.Component<
  React.PropsWithChildren<{ fallback: React.ReactNode }>,
  { hasError: boolean; error: Error | null }
> {
  constructor(props: React.PropsWithChildren<{ fallback: React.ReactNode }>) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[CKB Arcade] React Error Boundary caught:', error);
    console.error('[CKB Arcade] Component Stack:', errorInfo.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#fff',
          background: '#050505',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, sans-serif'
        }}>
          <h2 style={{ color: '#ff4444', fontSize: '24px', marginBottom: '16px' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#aaa', marginBottom: '8px' }}>
            The app encountered an error while loading.
          </p>
          <p style={{ color: '#666', fontSize: '12px', fontFamily: 'monospace', maxWidth: '600px', wordBreak: 'break-all' }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '24px',
              padding: '12px 24px',
              background: '#39ff14',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// CCC Provider with error handling
const CkbProvider = ({ children }: { children: React.ReactNode }) => {
  try {
    return (
      <ccc.Provider>
        {children}
      </ccc.Provider>
    );
  } catch (error) {
    console.error('[CKB Arcade] CCC Provider error:', error);
    return <>{children}</>;
  }
};

console.log('[CKB Arcade] App initializing...');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary fallback={<div>Loading...</div>}>
      <CkbProvider>
        <AppWithCcc />
      </CkbProvider>
    </RootErrorBoundary>
  </React.StrictMode>,
);

