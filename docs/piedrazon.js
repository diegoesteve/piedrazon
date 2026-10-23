// Piedrazón: el personaje de granizo que cuenta cómo está el cielo. Cambia de cara según el nivel y habla en un globito.
//   tranqui  → sin nada a la vista
//   atento   → hay condiciones para tormenta (pronóstico de hoy, o alerta amarilla del SMN)
//   enojado  → posible granizo según el radar, o alerta naranja/roja del SMN
//   furioso  → granizo probable según el radar
//   mascota  → saludo al entrar
// Tocarlo muestra el siguiente consejo de ese nivel.
const Piedrazon = (() => {
  const TINTA = '#1F2D3A';
  const MENSAJES = {
    tranqui: ['Cielo tranquilo. Nada de qué preocuparse por ahora.', 'Si tenés planes para los próximos días, mirá el gráfico de abajo.', 'Buscá tu localidad y te cuento cómo viene.'],
    atento: ['Hay condiciones para tormenta. Mirá el cielo y seguí el pronóstico.', 'Si podés, dejá el auto bajo techo antes de la tarde.', 'Tené a mano dónde guardar plantas y cosas del patio.'],
    enojado: ['Probable caída de granizo. Guardá el auto y quedate bajo techo.', 'Entrá las plantas, las bicis y lo que se pueda romper.', 'Si empieza a caer, alejate de las ventanas.'],
    furioso: ['¡Granizo en curso! No salgas y alejate de las ventanas.', 'No te refugies debajo de árboles, carteles ni cables.', 'Emergencias: 103 (Defensa Civil) o 911.'],
    mascota: ['¡Hola! Soy Piedrazón. Miro los radares por vos.'],
  };
  const ETIQUETA = { tranqui: 'Sin alerta', atento: 'Aviso', enojado: 'Alerta', furioso: 'Alerta máxima', mascota: '' };

  const caras = {
    tranqui: `<path d="M42 56q5-6 10 0M68 56q5-6 10 0" fill="none" stroke="${TINTA}" stroke-width="3" stroke-linecap="round"/>
      <path d="M52 66q8 7 16 0" fill="none" stroke="${TINTA}" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="41" cy="65" rx="4.5" ry="2.6" fill="#F4A6B4" opacity=".8"/><ellipse cx="79" cy="65" rx="4.5" ry="2.6" fill="#F4A6B4" opacity=".8"/>`,
    atento: `<circle cx="48" cy="56" r="6.5" fill="#fff" stroke="${TINTA}" stroke-width="2.5"/><circle cx="72" cy="56" r="6.5" fill="#fff" stroke="${TINTA}" stroke-width="2.5"/>
      <circle class="pupila" cx="49" cy="53.5" r="2.8" fill="${TINTA}"/><circle class="pupila" cx="73" cy="53.5" r="2.8" fill="${TINTA}"/>
      <path d="M41 45q7-2 13 0M66 44q7-5 13-1" fill="none" stroke="${TINTA}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="60" cy="70" r="3.2" fill="none" stroke="${TINTA}" stroke-width="2.5"/>
      <text x="96" y="20" font-family="system-ui,sans-serif" font-weight="800" font-size="18" fill="var(--tinta)">?</text>`,
    enojado: `<path d="M41 46l12 6M79 46l-12 6" stroke="${TINTA}" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="48" cy="57" r="4" fill="${TINTA}"/><circle cx="72" cy="57" r="4" fill="${TINTA}"/>
      <path d="M52 71q8-6 16 0" fill="none" stroke="${TINTA}" stroke-width="3" stroke-linecap="round"/>
      <g class="burbujas" fill="#DCEBF7" stroke="#8FB3D1" stroke-width="2"><circle cx="16" cy="10" r="4"/><circle cx="23" cy="20" r="3"/><circle cx="104" cy="10" r="4"/><circle cx="97" cy="20" r="3"/></g>`,
    furioso: `<path d="M40 44l14 8M80 44l-14 8" stroke="${TINTA}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M43 55l9 3-9 2zM77 55l-9 3 9 2z" fill="${TINTA}" stroke="${TINTA}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M50 68q10-7 20 0q-1 12-10 12t-10-12z" fill="${TINTA}"/><path d="M54 76q6-4 12 0q-3 4-6 4t-6-4z" fill="#E8616B"/>
      <path d="M66 26l-5 10 6 4-4 8" fill="none" stroke="${TINTA}" stroke-width="2.2" stroke-linejoin="round"/>
      <g class="rayas" stroke="#8FB3D1" stroke-width="3" stroke-linecap="round"><path d="M38 2v9M60 0v9M82 2v9"/></g>`,
    mascota: `<path d="M42 56q5-5 10 0" fill="none" stroke="${TINTA}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="72" cy="55" r="4.5" fill="${TINTA}"/><circle cx="73.5" cy="53.5" r="1.4" fill="#fff"/>
      <path d="M51 65h18q-1 11-9 11t-9-11z" fill="${TINTA}"/><path d="M55 72q5-3 10 0q-2 4-5 4t-5-4z" fill="#E8616B"/>
      <ellipse cx="41" cy="65" rx="4.5" ry="2.6" fill="#F4A6B4" opacity=".8"/><ellipse cx="79" cy="65" rx="4.5" ry="2.6" fill="#F4A6B4" opacity=".8"/>
      <g class="saludo" fill="none" stroke="#8FB3D1" stroke-width="2.5" stroke-linecap="round"><path d="M108 20q4 6 0 12M113 15q7 11 0 22"/></g>`,
  };

  function svg(nivel) {
    const oscuro = nivel === 'furioso';
    const f = oscuro ? ['#BFD6EA', '#A3C2DE', '#86AED3', '#D3E4F2'] : ['#E4F0FA', '#CDE1F2', '#B3D0EA', '#F2F8FD'];
    const brazoDer = nivel === 'mascota'
      ? `<ellipse cx="103" cy="40" rx="7" ry="12" transform="rotate(35 103 40)" fill="${f[1]}" stroke="${TINTA}" stroke-width="3"/>`
      : `<ellipse cx="103" cy="64" rx="7" ry="11" transform="rotate(-25 103 64)" fill="${f[1]}" stroke="${TINTA}" stroke-width="3"/>`;
    return `<svg viewBox="0 0 120 124" role="img" aria-label="Piedrazón ${ETIQUETA[nivel] || ''}" class="pz-svg">
      <ellipse cx="60" cy="118" rx="26" ry="4" fill="#000" opacity=".1"/>
      <g class="pz-cuerpo">
        <rect x="47" y="94" width="8" height="18" rx="4" fill="#fff" stroke="${TINTA}" stroke-width="3"/>
        <rect x="65" y="94" width="8" height="18" rx="4" fill="#fff" stroke="${TINTA}" stroke-width="3"/>
        <ellipse cx="17" cy="64" rx="7" ry="11" transform="rotate(25 17 64)" fill="${f[1]}" stroke="${TINTA}" stroke-width="3"/>
        ${brazoDer}
        <polygon points="42,22 78,20 98,42 96,74 76,97 42,97 22,75 24,42" fill="${f[0]}"/>
        <polygon points="42,22 78,20 60,36" fill="${f[3]}"/><polygon points="78,20 98,42 82,46" fill="${f[1]}"/>
        <polygon points="98,42 96,74 84,62" fill="${f[2]}"/><polygon points="96,74 76,97 74,82" fill="${f[2]}"/>
        <polygon points="76,97 42,97 58,88" fill="${f[1]}"/><polygon points="22,75 42,97 36,80" fill="${f[2]}"/>
        <polygon points="24,42 22,75 32,58" fill="${f[1]}"/><polygon points="42,22 24,42 38,40" fill="${f[3]}"/>
        <polygon points="42,22 78,20 98,42 96,74 76,97 42,97 22,75 24,42" fill="none" stroke="${TINTA}" stroke-width="3.5" stroke-linejoin="round"/>
        ${caras[nivel]}
      </g></svg>`;
  }

  // Un Piedrazón dentro de `caja`. Devuelve un objeto para cambiarle el nivel y lo que dice.
  function crear(caja, { chico = false } = {}) {
    caja.classList.add('pz');
    if (chico) caja.classList.add('pz-chico');
    caja.innerHTML = `<button type="button" class="pz-boton" title="Tocá a Piedrazón para otro consejo"></button>
      <div class="pz-globo" aria-live="polite"><span class="pz-etiqueta"></span><p class="pz-texto"></p></div>`;
    const boton = caja.querySelector('.pz-boton'), etiqueta = caja.querySelector('.pz-etiqueta'), texto = caja.querySelector('.pz-texto');
    let nivel = null, frases = [], i = 0;
    const decir = () => { texto.innerHTML = frases[i % frases.length]; };
    const saltar = () => { boton.classList.remove('salta'); void boton.offsetWidth; boton.classList.add('salta'); };
    boton.addEventListener('click', () => { if (frases.length > 1) { i++; decir(); } saltar(); });
    return {
      poner(n, primera) {
        if (n !== nivel) { boton.innerHTML = svg(n); caja.dataset.nivel = n; saltar(); }
        nivel = n; i = 0;
        frases = [primera, ...MENSAJES[n].filter(m => m !== primera)].filter(Boolean);
        etiqueta.textContent = ETIQUETA[n];
        etiqueta.hidden = !ETIQUETA[n];
        decir();
      },
      get nivel() { return nivel; },
    };
  }

  return { crear, svg, MENSAJES, ETIQUETA };
})();
