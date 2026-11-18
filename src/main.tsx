import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import { startSyncLoop } from './sync/engine';
import './styles.css';

if (import.meta.env.DEV) (window as unknown as { __store: typeof useStore }).__store = useStore;

startSyncLoop();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
