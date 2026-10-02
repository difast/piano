import type { ReactNode } from 'react';
import { PREVIEW } from '../env';

/** Ссылка на юридический документ — всегда в новой вкладке (форма регистрации не теряется). */
export function LegalLink({ to, children }: { to: string; children: ReactNode }) {
  return <a href={PREVIEW ? `#${to}` : to} target="_blank" rel="noopener noreferrer">{children}</a>;
}
