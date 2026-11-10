import { useState, type InputHTMLAttributes } from 'react';
import './PasswordInput.css';

/** Поле пароля с «глазиком»: показать / скрыть введённый пароль. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} type={show ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" className="pw-eye" onMouseDown={(e) => e.preventDefault()} onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={show} title={show ? 'Скрыть пароль' : 'Показать пароль'}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
          {show && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
