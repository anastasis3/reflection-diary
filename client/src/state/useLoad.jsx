/**
 * Loading a screen's data. A screen passes one async function; until it
 * finishes the screen shows "Loading…", and if it fails, the message and a
 * "Try again" button. A 401 (the session has expired) signs the person out,
 * which takes them to the log-in screen.
 */
import { useEffect, useState } from 'react';
import { useDiary } from './DiaryContext.jsx';

export function useLoad(load, deps = []) {
  const { signOut } = useDiary();
  const [state, setState] = useState({ ready: false, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ ready: false, error: null });
    load()
      .then(() => { if (live) setState({ ready: true, error: null }); })
      .catch((error) => {
        if (!live) return;
        if (error.status === 401) { signOut(); return; }
        setState({ ready: false, error });
      });
    return () => { live = false; };
  }, [...deps, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

/** What a screen shows while its data is loading or failed to load. */
export function LoadState({ state }) {
  if (state.error) {
    return (
      <div className="card">
        <p style={{ margin: '0 0 12px', color: 'var(--txt2)' }}>{state.error.message}</p>
        <button className="btn ghost" onClick={state.retry}>Try again</button>
      </div>
    );
  }
  return <p className="sub">Loading…</p>;
}
