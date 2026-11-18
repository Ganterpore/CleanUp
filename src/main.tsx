import Konva from 'konva';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import { startSyncLoop } from './sync/engine';
import { applyTheme, getTheme } from './themes';
import './styles.css';

if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, { __store: useStore, __konva: Konva });
}

applyTheme(getTheme(useStore.getState().theme));
useStore.subscribe((s, prev) => s.theme !== prev.theme && applyTheme(getTheme(s.theme)));

startSyncLoop();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
