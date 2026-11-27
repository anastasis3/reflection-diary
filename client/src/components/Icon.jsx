/**
 * Vector icons, never font glyphs. Each takes a colour `c` and a size `s`.
 * All are decorative (aria-hidden): the text next to them carries the meaning.
 */
const svg = (s, h, viewBox, children) => (
  <svg width={s} height={h} viewBox={viewBox} aria-hidden="true">{children}</svg>
);

export const Spark = ({ c = '#9B8CFF', s = 16 }) => svg(s, s, '0 0 16 16',
  <path d="M8,1 L9.5,6.1 L14.6,7.6 L9.5,9.1 L8,14.2 L6.5,9.1 L1.4,7.6 L6.5,6.1 Z" fill={c} />);

export const Check = ({ c = '#3DDBA8', s = 16 }) => svg(s, s, '0 0 16 16',
  <path d="M2,9 l3.2,3.2 L14,3.5" stroke={c} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />);

export const Warn = ({ c = '#FF9B8A', s = 16 }) => svg(s, s, '0 0 16 16', <>
  <path d="M8,1 L15,14.5 L1,14.5 Z" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
  <path d="M8,6 V10.4" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
  <circle cx="8" cy="12.7" r="1.1" fill={c} />
</>);

export const Info = ({ c = '#9B8CFF', s = 16 }) => svg(s, s, '0 0 16 16', <>
  <circle cx="8" cy="8" r="7" fill="none" stroke={c} strokeWidth="1.6" />
  <circle cx="8" cy="4.8" r="1.1" fill={c} />
  <path d="M8,7.6 V12.4" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
</>);

export const Clock = ({ c = '#8B89A3', s = 14 }) => svg(s, s, '0 0 14 14', <>
  <circle cx="7" cy="7" r="6.2" fill="none" stroke={c} strokeWidth="1.5" />
  <path d="M7,3.8 V7 H10" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
</>);

export const Lock = ({ c = '#9B8CFF', s = 15 }) => svg(s, s, '0 0 15 15', <>
  <rect x="1" y="6.3" width="13" height="8.2" rx="2" fill="none" stroke={c} strokeWidth="1.4" />
  <path d="M4.3,6.3 V3.9 a3.2,3.2 0 0 1 6.4,0 V6.3" fill="none" stroke={c} strokeWidth="1.4" />
</>);

export const Key = ({ c = '#9B8CFF', s = 15 }) => svg(s, s, '0 0 15 15', <>
  <circle cx="4.5" cy="7.5" r="3.4" fill="none" stroke={c} strokeWidth="1.4" />
  <path d="M8.2,7.5 H14.5 M12.2,7.5 V10.3" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round" />
</>);

export const Trash = ({ c = '#9B8CFF', s = 15 }) => svg(s, s, '0 0 15 15',
  <path d="M2,4 H13 M3.6,4 V13.2 H11.4 V4 M5.6,2 H9.4" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />);

const line = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const Eye = ({ c = '#C9C6E8', s = 20 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" stroke={c} {...line}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOff = ({ c = '#C9C6E8', s = 20 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" stroke={c} {...line}>
    <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.5M6.6 6.6A17.5 17.5 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="M3 3l18 18" />
  </svg>
);

export const Thumb = ({ c = '#C9C6E8', up = true, s = 18 }) => svg(s, s, '0 0 24 24',
  <g fill={c} transform={up ? undefined : 'translate(0,24) scale(1,-1)'}>
    <path d="M3,10 h4 v11 h-4 z" />
    <path d="M8.5,10 c0,-3.2 2.4,-4.2 2.4,-6.6 c0,-1.2 1.1,-2.1 2.2,-1.2 c1.2,1 0.5,4.2 0.2,5.4 h4.6 c1.3,0 2.2,1.1 1.8,2.2 l-2.4,7.4 c-0.3,0.9 -1.1,1.5 -2,1.5 h-6.8 z" />
  </g>);

export const Calendar = ({ c = '#8B89A3', s = 18 }) => svg(s, s, '0 0 18 18', <>
  <rect x="1" y="3" width="16" height="14" rx="3" fill="none" stroke={c} strokeWidth="1.5" />
  <path d="M1,7 H17 M6,1.5 V4 M12,1.5 V4" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
</>);

export const Note = ({ c = '#6A6890', s = 34 }) => svg(s, s * 1.25, '0 0 34 42', <>
  <rect x="1" y="1" width="32" height="40" rx="6" fill="none" stroke={c} strokeWidth="2" />
  <path d="M9,12 h16 M9,21 h11 M9,30 h6" stroke={c} strokeWidth="2" strokeLinecap="round" />
</>);
