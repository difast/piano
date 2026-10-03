import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PREVIEW } from './env';
import { installAudioUnlock } from './services/audio';
import { ErrorBoundary } from './components/ErrorBoundary';
import { captureRef } from './services/api';
import './styles.css';

// Один адрес сайта: с www. переходим на основной (вход хранится отдельно для каждого адреса)
const WWW = /^www\./i.test(window.location.hostname);
if (WWW) {
  window.location.replace(`${window.location.protocol}//${window.location.hostname.replace(/^www\./i, '')}${window.location.pathname}${window.location.search}${window.location.hash}`);
}

async function start() {
  installAudioUnlock();
  captureRef();
  if (PREVIEW) (await import('./preview/mockApi')).installMockApi();
  createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
}
if (!WWW) void start();
