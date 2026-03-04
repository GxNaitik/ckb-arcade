import React from 'react';
import ReactDOM from 'react-dom/client';
import { ccc } from '@ckb-ccc/connector-react';
import { AppWithCcc } from './App.tsx';
import './index.css';

class RootErrorBoundary extends React.Component<
  React.PropsWithChildren<{ fallback: React.ReactNode }>,
  { hasError: boolean }
> {
  constructor(props: React.PropsWithChildren<{ fallback: React.ReactNode }>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p>Please refresh the page and try again.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// CCC Provider with error handling
const CkbProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ccc.Provider>
      {children}
    </ccc.Provider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CkbProvider>
      <RootErrorBoundary fallback={<div>Loading...</div>}>
        <AppWithCcc />
      </RootErrorBoundary>
    </CkbProvider>
  </React.StrictMode>,
);
