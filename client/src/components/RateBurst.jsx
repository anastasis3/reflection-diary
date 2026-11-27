/**
 * The burst when a question is rated: a fan of sparks and small thumbs for
 * "relevant", a soft drop for "not relevant". Drawn at the button, over the
 * page, and removed after a second. Nothing at all with reduced motion.
 */
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Thumb } from './Icon.jsx';

export default function RateBurst({ kind, rect, onDone }) {
  const up = kind === 'up';
  const parts = useMemo(() => {
    const cols = up ? ['#F5D0FE', '#E879F9', '#C084FC', '#A5F3FC', '#FFFFFF'] : ['#C4B5FD', '#93A5CF', '#A5B4FC'];
    return [...Array(up ? 18 : 8)].map((_, i) => {
      // up: a fan opening upwards; down: a few sparks dropping off
      const a = up ? (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 1.5 : (Math.PI / 2) + (Math.random() - 0.5) * 1.6;
      const d = up ? 46 + Math.random() * 60 : 22 + Math.random() * 30;
      const c = cols[i % cols.length];
      return {
        thumb: up && i % 5 === 0,
        c,
        size: (4 + Math.random() * 4).toFixed(0),
        style: {
          '--dx': `${(Math.cos(a) * d).toFixed(0)}px`,
          '--dy': `${(Math.sin(a) * d + (up ? 0 : 16)).toFixed(0)}px`,
          '--c': c,
          '--rot': `${((Math.random() - 0.5) * 80).toFixed(0)}deg`,
          animationDelay: `${(Math.random() * 60).toFixed(0)}ms`,
        },
      };
    });
  }, [up]);

  useEffect(() => {
    const t = setTimeout(onDone, 1100);
    return () => clearTimeout(t);
  }, [onDone]);

  return createPortal(
    <div className="rfx" style={{ left: rect.left + 30, top: rect.top + rect.height / 2 }}>
      <i className={`rfx-ring ${up ? '' : 'soft'}`} />
      {parts.map((p, i) => (p.thumb
        ? <i key={i} className="rfx-p rfx-thumb" style={p.style}><Thumb c={p.c} up /></i>
        : <i key={i} className={`rfx-p ${up ? '' : 'soft'}`} style={{ ...p.style, width: `${p.size}px`, height: `${p.size}px` }} />))}
    </div>,
    document.body,
  );
}
