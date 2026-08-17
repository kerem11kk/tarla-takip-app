
import React, { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { Buffer } from 'buffer';
import process from 'process';

// Suppress WebSocket HMR errors in AI Studio and preview environments
if (typeof window !== 'undefined') {
  const isWsError = (err: any) => {
    if (!err) return false;
    const msg = String(err.message || err.reason || err || '').toLowerCase();
    const stack = String(err.stack || '').toLowerCase();
    const type = String(err.type || '').toLowerCase();
    const target = err.target ? String(err.target.constructor?.name || '').toLowerCase() : '';
    
    return (
      msg.includes('websocket') ||
      msg.includes('vite') ||
      msg.includes('closed without opened') ||
      type.includes('websocket') ||
      target.includes('websocket') ||
      stack.includes('websocket')
    );
  };

  const originalConsoleError = console.error;
  console.error = (...args) => {
    const msg = args.join(' ').toLowerCase();
    if (msg.includes('websocket') || msg.includes('vite') || msg.includes('closed without opened')) {
      return;
    }
    originalConsoleError(...args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (isWsError(event.reason) || isWsError(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener('error', (event) => {
    if (isWsError(event.message) || isWsError(event.error) || isWsError(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.Buffer = window.Buffer || Buffer;
  (window as any).process = (window as any).process || process;
  (window as any).global = window;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare state: ErrorBoundaryState;
  declare props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="p-4 bg-red-950/80 border border-red-800 text-red-400 rounded-2xl max-w-md w-full shadow-2xl">
            <h2 className="text-lg font-bold mb-1">Uygulama Yüklenirken Bir Hata Oluştu</h2>
            <p className="text-xs text-zinc-300 mb-4 leading-relaxed">
              {this.state.error?.message || 'Bilinmeyen bir uygulama hatası.'}
            </p>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md"
            >
              Uygulamayı Sıfırla ve Yeniden Başlat
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

