/**
 * The state the screens share: who is signed in, the nine weights, the
 * entries, the week, and the messages at the top of the screen.
 *
 * The server owns the data. This context holds what the screens show and
 * offers one loader per kind of data, so Today, Profile and History load and
 * count the same way.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { api, token } from '../lib/api.js';
import { entryStats, fromProfile } from '../lib/stats.js';

const DiaryContext = createContext(null);

export function DiaryProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ weights: {}, startW: {}, muted: [] });
  const [entries, setEntries] = useState([]);
  const [week, setWeek] = useState(null);
  const [notices, setNotices] = useState([]);
  const nextNotice = useRef(0);

  const applyProfile = useCallback((response) => setProfile(fromProfile(response)), []);
  const loadProfile = useCallback(async () => applyProfile(await api.profile()), [applyProfile]);
  const loadEntries = useCallback(async () => {
    const list = (await api.entries()).entries;
    setEntries(list);
    return list;
  }, []);
  const loadWeek = useCallback(async () => setWeek(await api.snapshots(7)), []);

  /** A message at the top of the screen; it goes away after seven seconds. */
  const notify = useCallback((message, kind = 'e') => {
    nextNotice.current += 1;
    const id = nextNotice.current;
    setNotices((list) => [...list, { id, message, kind }]);
    setTimeout(() => setNotices((list) => list.filter((n) => n.id !== id)), 7000);
  }, []);

  const signIn = useCallback(({ user: account, token: value }) => {
    token.set(value);
    setUser(account);
  }, []);

  const signOut = useCallback(() => {
    token.clear();
    setUser(null);
    setEntries([]);
    setWeek(null);
  }, []);

  const stats = useMemo(() => entryStats(entries), [entries]);

  const value = {
    user, setUser, signIn, signOut,
    profile, setProfile, applyProfile, loadProfile,
    entries, setEntries, loadEntries, stats,
    week, setWeek, loadWeek,
    notices, notify,
  };
  return <DiaryContext.Provider value={value}>{children}</DiaryContext.Provider>;
}

export const useDiary = () => useContext(DiaryContext);
