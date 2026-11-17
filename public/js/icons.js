/**
 * Icons, drawn as inline SVG.
 *
 * Not an icon font and not image files: inline SVG inherits the text colour,
 * stays sharp at any size, costs no extra request, and carries
 * aria-hidden="true" so a screen reader reads the label beside it instead of
 * announcing a meaningless glyph.
 */

const svg = (body, size = 16, viewBox = '0 0 16 16') =>
  `<svg width="${size}" height="${size}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  spark: (c = 'currentColor', s = 16) =>
    svg(`<path d="M8,1 L9.5,6.1 L14.6,7.6 L9.5,9.1 L8,14.2 L6.5,9.1 L1.4,7.6 L6.5,6.1 Z" fill="${c}"/>`, s),

  check: (c = '#3DDBA8', s = 16) =>
    svg(`<path d="M2,9 l3.2,3.2 L14,3.5" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`, s),

  warn: (c = '#FF9B8A', s = 14) =>
    svg(`<path d="M8,1 L15,14.5 L1,14.5 Z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>
         <path d="M8,6 V10.4" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>
         <circle cx="8" cy="12.7" r="1.1" fill="${c}"/>`, s),

  info: (c = 'currentColor', s = 16) =>
    svg(`<circle cx="8" cy="8" r="7" fill="none" stroke="${c}" stroke-width="1.6"/>
         <circle cx="8" cy="4.8" r="1.1" fill="${c}"/>
         <path d="M8,7.6 V12.4" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`, s),

  clock: (c = 'currentColor', s = 14) =>
    svg(`<circle cx="7" cy="7" r="6.2" fill="none" stroke="${c}" stroke-width="1.5"/>
         <path d="M7,3.8 V7 H10" stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`, s, '0 0 14 14'),

  lock: (c = 'currentColor', s = 15) =>
    svg(`<rect x="1" y="6.3" width="13" height="8.2" rx="2" fill="none" stroke="${c}" stroke-width="1.4"/>
         <path d="M4.3,6.3 V3.9 a3.2,3.2 0 0 1 6.4,0 V6.3" fill="none" stroke="${c}" stroke-width="1.4"/>`, s, '0 0 15 15'),

  key: (c = 'currentColor', s = 15) =>
    svg(`<circle cx="4.5" cy="7.5" r="3.4" fill="none" stroke="${c}" stroke-width="1.4"/>
         <path d="M8.2,7.5 H14.5 M12.2,7.5 V10.3" stroke="${c}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`, s, '0 0 15 15'),

  trash: (c = 'currentColor', s = 15) =>
    svg(`<path d="M2,4 H13 M3.6,4 V13.2 H11.4 V4 M5.6,2 H9.4" fill="none" stroke="${c}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`, s, '0 0 15 15'),

  eye: (c = 'currentColor', s = 16) =>
    svg(`<path d="M0.6,8 C3,4.4 13,4.4 15.4,8 C13,11.6 3,11.6 0.6,8 Z" fill="none" stroke="${c}" stroke-width="1.4"/>
         <circle cx="8" cy="8" r="2.4" fill="${c}"/>`, s),

  thumb: (c = 'currentColor', up = true, s = 18) =>
    svg(`<g fill="${c}"${up ? '' : ' transform="translate(0,24) scale(1,-1)"'}>
           <path d="M3,10 h4 v11 h-4 z"/>
           <path d="M8.5,10 c0,-3.2 2.4,-4.2 2.4,-6.6 c0,-1.2 1.1,-2.1 2.2,-1.2 c1.2,1 0.5,4.2 0.2,5.4 h4.6 c1.3,0 2.2,1.1 1.8,2.2 l-2.4,7.4 c-0.3,0.9 -1.1,1.5 -2,1.5 h-6.8 z"/>
         </g>`, s, '0 0 24 24'),

  note: (c = 'currentColor', s = 34) =>
    `<svg width="${s}" height="${s * 1.25}" viewBox="0 0 34 42" aria-hidden="true" focusable="false">
       <rect x="1" y="1" width="32" height="40" rx="6" fill="none" stroke="${c}" stroke-width="2"/>
       <path d="M9,12 h16 M9,21 h11 M9,30 h6" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
     </svg>`,

  // --- bottom navigation ---------------------------------------------------
  today: (c = 'currentColor', s = 20) =>
    svg(`<path d="M10,2.5 v15 M2.5,10 h15" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>`, s, '0 0 20 20'),
  profile: (c = 'currentColor', s = 20) =>
    svg(`<polygon points="10,2 17,7 14.5,16 5.5,16 3,7" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>
         <circle cx="10" cy="10" r="2" fill="${c}"/>`, s, '0 0 20 20'),
  history: (c = 'currentColor', s = 20) =>
    svg(`<rect x="2.5" y="3.5" width="15" height="14" rx="3" fill="none" stroke="${c}" stroke-width="1.5"/>
         <path d="M2.5,7.5 H17.5 M7,2 V5 M13,2 V5" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`, s, '0 0 20 20'),
  settings: (c = 'currentColor', s = 20) =>
    svg(`<circle cx="10" cy="10" r="2.6" fill="none" stroke="${c}" stroke-width="1.5"/>
         <path d="M10,2 v2.2 M10,15.8 V18 M2,10 h2.2 M15.8,10 H18 M4.3,4.3 l1.6,1.6 M14.1,14.1 l1.6,1.6 M15.7,4.3 l-1.6,1.6 M5.9,14.1 l-1.6,1.6"
               stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`, s, '0 0 20 20'),

  chevron: (c = 'currentColor', s = 14) =>
    svg(`<path d="M5,2.5 L10.5,8 L5,13.5" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`, s),
};

export default icons;
