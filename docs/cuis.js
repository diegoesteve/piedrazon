// El Cuis: el compañero de Piedrazón que contesta preguntas en la pestaña «El Cuis». Un cuis (Microcavia), roedor
// autóctono de Córdoba. Tiene una cara por nivel, igual que Piedrazón:
//   tranqui, atento, enojado, asustado (para el nivel «furioso»), mascota
const Cuis = (() => {
  const T = '#1B2733', PELO = '#A88B6A', PELO_OSC = '#7D6449', HOCICO = '#EADCC6', ANILLO = '#F4EEE2', OREJA = '#E8A9A3', NARIZ = '#D27A88';
  const CARA_DE_NIVEL = { tranqui: 'tranqui', atento: 'atento', enojado: 'enojado', furioso: 'asustado', mascota: 'mascota' };

  const oreja = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${PELO}" stroke="${T}" stroke-width="7"/><circle cx="${x}" cy="${y + 2}" r="${r / 2}" fill="${OREJA}"/>`;
  const orejas = { normal: oreja(50, 64, 22) + oreja(170, 64, 22), paradas: oreja(48, 52, 25) + oreja(172, 52, 25),
    gachas: `<ellipse cx="44" cy="76" rx="24" ry="14" transform="rotate(-35 44 76)" fill="${PELO}" stroke="${T}" stroke-width="7"/>
      <ellipse cx="176" cy="76" rx="24" ry="14" transform="rotate(35 176 76)" fill="${PELO}" stroke="${T}" stroke-width="7"/>` };
  const coronilla = `<path d="M100 62q4 10 0 18M112 60q4 10 0 18M124 62q4 10 0 18" fill="none" stroke="${PELO_OSC}" stroke-width="4" stroke-linecap="round"/>`;
  const nariz = (y = 136) => `<path d="M102 ${y}h16q0 8-8 10q-8-2-8-10z" fill="${NARIZ}" stroke="${T}" stroke-width="3.5" stroke-linejoin="round"/>`;
  const bigotes = `<path d="M70 146l-34-6M70 154l-34 4M150 146l34-6M150 154l34 4" fill="none" stroke="${T}" stroke-width="3" stroke-linecap="round"/>`;
  const ojo = (x, y, r = 10) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${T}"/><circle cx="${x + 3}" cy="${y - 4}" r="${r / 3}" fill="#fff"/>`;
  const cachetes = `<ellipse cx="56" cy="138" rx="9" ry="5" fill="#F2A7B5" opacity=".85"/><ellipse cx="164" cy="138" rx="9" ry="5" fill="#F2A7B5" opacity=".85"/>`;
  const boca = `<path d="M110 146v6M96 154q7 6 14-2q7 8 14 2" fill="none" stroke="${T}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const dientes = y => `<rect x="104" y="${y}" width="12" height="9" rx="2" fill="#fff"/><path d="M110 ${y}v9" stroke="${T}" stroke-width="2"/>`;

  const caras = {
    tranqui: { orejas: 'normal', cara: `<path d="M68 114q10-10 20 0M132 114q10-10 20 0" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round"/>${cachetes}${nariz()}${boca}` },
    atento: { orejas: 'paradas', cara: `<path d="M64 86q14-10 28 0M128 86q14-10 28 0" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round"/>
      ${ojo(78, 106, 11)}${ojo(142, 106, 11)}${nariz()}<ellipse cx="110" cy="158" rx="4.5" ry="5.5" fill="${T}"/>` },
    enojado: { orejas: 'gachas', cara: `<path d="M60 92l30 12M160 92l-30 12" fill="none" stroke="${T}" stroke-width="6" stroke-linecap="round"/>
      ${ojo(80, 116, 8)}${ojo(140, 116, 8)}${nariz(134)}
      <rect x="103" y="147" width="14" height="11" rx="2" fill="#fff" stroke="${T}" stroke-width="3"/><path d="M110 147v11" stroke="${T}" stroke-width="2.5"/>
      <path d="M94 170q16-10 32 0" fill="none" stroke="${T}" stroke-width="4" stroke-linecap="round"/>` },
    asustado: { orejas: 'normal', pelos: true, cara: `<path d="M62 88l24-8M158 88l-24-8" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="78" cy="110" r="13" fill="#fff" stroke="${T}" stroke-width="4"/><circle cx="142" cy="110" r="13" fill="#fff" stroke="${T}" stroke-width="4"/>
      <circle cx="78" cy="110" r="4" fill="${T}"/><circle cx="142" cy="110" r="4" fill="${T}"/>${nariz(132)}
      <path d="M94 148q16-6 32 0q0 28-16 28t-16-28z" fill="${T}"/>${dientes(147)}
      <path d="M180 96q8 12 0 18q-8-6 0-18z" fill="#8FC3E6" stroke="${T}" stroke-width="3" stroke-linejoin="round"/>` },
    mascota: { orejas: 'normal', cara: `${ojo(78, 112)}<path d="M132 114q10-10 20 0" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round"/>${cachetes}${nariz(132)}
      <path d="M94 148h32q0 24-16 24t-16-24z" fill="${T}"/>${dientes(148)}<ellipse cx="110" cy="166" rx="7" ry="3.5" fill="#E26D6D"/>` },
  };

  // cara: tranqui | atento | enojado | asustado | mascota, o un nivel de Piedrazón (furioso → asustado)
  function svg(cara, etiqueta = '') {
    const c = caras[CARA_DE_NIVEL[cara] || cara] || caras.mascota;
    const anillos = cara === 'asustado' || CARA_DE_NIVEL[cara] === 'asustado'
      ? `<ellipse cx="78" cy="110" rx="19" ry="17" fill="${ANILLO}"/><ellipse cx="142" cy="110" rx="19" ry="17" fill="${ANILLO}"/>`
      : `<ellipse cx="78" cy="112" rx="17" ry="15" fill="${ANILLO}"/><ellipse cx="142" cy="112" rx="17" ry="15" fill="${ANILLO}"/>`;
    return `<svg viewBox="0 0 220 210" class="cuis-svg" ${etiqueta ? `role="img" aria-label="${etiqueta}"` : 'aria-hidden="true"'}>
      ${orejas[c.orejas]}
      ${c.pelos ? `<path d="M80 66L86 34L98 54L110 26L122 54L134 34L140 66Z" fill="${PELO}" stroke="${T}" stroke-width="6" stroke-linejoin="round"/>` : ''}
      <ellipse cx="110" cy="122" rx="80" ry="70" fill="${PELO}" stroke="${T}" stroke-width="7"/>
      ${c.pelos ? '' : coronilla}
      <ellipse cx="110" cy="152" rx="44" ry="30" fill="${HOCICO}"/>${anillos}
      ${c.cara}${bigotes}</svg>`;
  }

  return { svg };
})();
