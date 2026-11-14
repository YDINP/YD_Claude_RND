// 선명이: 시력검사 란돌트 고리(바깥 지름 5, 두께 1, 틈 1)를 후드처럼 쓴 아이. 손으로 좌표를 잡아 그린 SVG.
// gap: 틈 방향(도, 0=오른쪽, -90=위), expr: 표정
function sunmyeong(size, gap, expr, id){
  id = id || ('c'+Math.random().toString(36).slice(2,7));
  const R=100, t=40, r=R-t;               // 바깥 반지름 100, 두께 40, 틈 40
  const C='#e0483a', D='#c23a2e', F='#fff4e4', N='#1d2433', B='#f5a493';
  const eyes={
    smile:`<path d="M-30,-4 q8,-12 16,0" stroke="${N}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M14,-4 q8,-12 16,0" stroke="${N}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M-9,16 q9,10 18,0" stroke="${N}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    wink:`<circle cx="-21" cy="-4" r="7" fill="${N}"/><circle cx="-19" cy="-7" r="2.2" fill="#fff"/><path d="M14,-4 q8,-10 16,0" stroke="${N}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M-8,15 q8,9 16,0" stroke="${N}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    sleepy:`<path d="M-30,-2 h16" stroke="${N}" stroke-width="6" stroke-linecap="round"/><path d="M14,-2 h16" stroke="${N}" stroke-width="6" stroke-linecap="round"/><ellipse cx="0" cy="18" rx="5" ry="4" fill="${N}"/>`,
    tilt:`<circle cx="-21" cy="-3" r="7" fill="${N}"/><circle cx="21" cy="-3" r="7" fill="${N}"/><circle cx="-19" cy="-6" r="2.2" fill="#fff"/><circle cx="23" cy="-6" r="2.2" fill="#fff"/><circle cx="0" cy="18" r="5" fill="none" stroke="${N}" stroke-width="4"/>`,
    open:`<circle cx="-21" cy="-3" r="8" fill="${N}"/><circle cx="21" cy="-3" r="8" fill="${N}"/><circle cx="-18" cy="-7" r="2.6" fill="#fff"/><circle cx="24" cy="-7" r="2.6" fill="#fff"/><path d="M-10,13 q10,13 20,0 z" fill="${N}"/>`,
    squint:`<path d="M-31,-8 l14,6 l-14,6" stroke="${N}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M31,-8 l-14,6 l14,6" stroke="${N}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M-7,18 h14" stroke="${N}" stroke-width="5" stroke-linecap="round"/>`
  }[expr||'open'];
  return `<svg width="${size}" height="${size*1.16}" viewBox="-120 -118 240 278" overflow="visible">
  <defs><mask id="m${id}" maskUnits="userSpaceOnUse" x="-130" y="-130" width="260" height="260"><rect x="-130" y="-130" width="260" height="260" fill="#fff"/>
    <rect x="0" y="-20" width="130" height="40" fill="#000" transform="rotate(${gap})"/></mask></defs>
  <ellipse cx="0" cy="124" rx="70" ry="9" fill="#000" opacity=".10"/>
  <ellipse cx="-30" cy="110" rx="17" ry="11" fill="${N}"/><ellipse cx="30" cy="110" rx="17" ry="11" fill="${N}"/>
  <circle r="${r+2}" fill="${F}"/>
  ${eyes}
  <ellipse cx="-36" cy="12" rx="9" ry="5.5" fill="${B}" opacity=".85"/><ellipse cx="36" cy="12" rx="9" ry="5.5" fill="${B}" opacity=".85"/>
  <g mask="url(#m${id})">
    <circle r="${R-t/2}" fill="none" stroke="${C}" stroke-width="${t}"/>
  </g>
  </svg>`;
}
