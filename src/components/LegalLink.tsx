import type { ReactNode } from 'react';

/** Ссылка на юридический документ — всегда в новой вкладке (форма регистрации не теряется). */
export function LegalLink({ to, children }: { to: string; children: ReactNode }) {
  return <a href={to} target="_blank" rel="noopener noreferrer">{children}</a>;
}
