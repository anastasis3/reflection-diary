// Временные данные: потом веса придут с сервера
const zones = ["Характер", "Энергия", "Интересы", "Здоровье", "Логика", "Работа", "Удача", "Долг", "Память"];
const weights = [0.5, 0.45, 0.7, 0.35, 0.5, 0.9, 0.4, 0.8, 0.55];

function drawRadar(svgId, labels, values) {
  const svg = document.getElementById(svgId);
  const cx = 160, cy = 160, R = 105;
  const n = labels.length;
  const point = (i, r) => {
    const a = (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  let out = "";

  // Кольца сетки (50% и 100%)
  [0.5, 1].forEach(k => {
    const pts = labels.map((_, i) => point(i, R * k).join(",")).join(" ");
    out += `<polygon points="${pts}" fill="none" stroke="#302f45" stroke-width="1"/>`;
  });

  // Оси и подписи
  labels.forEach((name, i) => {
    const [x, y] = point(i, R);
    const [lx, ly] = point(i, R + 18);
    out += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#302f45"/>`;
    out += `<text x="${lx}" y="${ly}" fill="#b4b2c4" font-size="11" text-anchor="middle" dominant-baseline="middle">${name}</text>`;
  });

  // Профиль пользователя
  const poly = values.map((v, i) => point(i, R * v).join(",")).join(" ");
  out += `<defs><filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  out += `<polygon points="${poly}" fill="#9b8cff" fill-opacity="0.38" stroke="#c4baff" stroke-width="2" filter="url(#glow)"/>`;

  svg.innerHTML = out;
}

drawRadar("radar", zones, weights);