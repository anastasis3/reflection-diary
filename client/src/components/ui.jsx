/**
 * Small building blocks used by several screens.
 */
import { useEffect, useRef, useState } from 'react';
import { zc, zl } from '../lib/zones.js';
import { Warn, Info, Eye, EyeOff } from './Icon.jsx';

/** A zone's name with its coloured dot. */
export function ZoneTag({ zone }) {
  return <span className="zone" style={{ color: zc(zone) }}><i />{zl(zone)}</span>;
}

/** The red line under a field. Kept in the layout when hidden, so nothing jumps. */
export function FieldError({ id, on, children }) {
  return (
    <p className={`err${on ? ' on' : ''}`} id={id}>
      <Warn c="#FF9B8A" s={13} /> <span>{children}</span>
    </p>
  );
}

/** Messages from the server at the top of the screen. */
export function Notices({ notices }) {
  return notices.map((n) => (
    <div key={n.id} className={`toast ${n.kind}`} role={n.kind === 'e' ? 'alert' : 'status'}>
      {n.kind === 'e' ? <Warn /> : <Info />} <span>{n.message}</span>
    </div>
  ));
}

/**
 * A modal dialog on the native <dialog> element: focus is kept inside, the
 * page behind is inert, Escape closes it.
 */
export function Dialog({ open, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      {open ? children : null}
    </dialog>
  );
}

/** A password field with the show / hide button; the icon and label follow the state. */
export function PasswordInput({ id, value, onChange, onBlur, onKeyDown, invalid, describedBy, autoComplete }) {
  const [shown, setShown] = useState(false);
  const input = useRef(null);
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={input} id={id} type={shown ? 'text' : 'password'} autoComplete={autoComplete}
        className={invalid ? 'bad' : ''} aria-describedby={describedBy}
        value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown}
      />
      <button
        className="reveal" type="button" aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'}
        onClick={() => { setShown(!shown); input.current.focus(); }}
      >
        {shown ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

/** Body text of a dialog: heading, one paragraph, the buttons. */
export function DialogText({ title, children }) {
  return (
    <>
      <h2 style={{ margin: '0 0 10px', fontSize: 18 }}>{title}</h2>
      {children}
    </>
  );
}
