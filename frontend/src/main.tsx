import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PREVIEW } from './env';
import { installAudioUnlock } from './services/audio';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

async function start() {
  installAudioUnlock();
  if (PREVIEW) (await import('./preview/mockApi')).installMockApi();
  createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
}
void start();
