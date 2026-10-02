import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PREVIEW } from './env';
import './styles.css';

async function start() {
  if (PREVIEW) (await import('./preview/mockApi')).installMockApi();
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
}
void start();
