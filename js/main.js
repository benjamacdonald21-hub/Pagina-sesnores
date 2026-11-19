/* ==========================================================
   Auto Fennec RC - comportamiento de la página
   Contenido:
   1. Utilidades
   2. Menú y sección activa
   3. Simulador del auto (portada)
   4. Pestañas (funcionamiento y conexiones)
   5. Catálogo de componentes
   6. Presupuesto
   7. Conexiones (pines)
   8. Visor de hojas de datos
   ========================================================== */

(function () {
  'use strict';

  /* ---------- 1. Utilidades ---------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pesos = (n) => '$' + new Intl.NumberFormat('es-AR').format(n);
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 2. Menú y sección activa ---------- */
  (function menu() {
    const boton = $('#menuBoton');
    const lista = $('#menu');
    if (!boton || !lista) return;

    boton.addEventListener('click', () => {
      const abierto = lista.classList.toggle('abierto');
      boton.setAttribute('aria-expanded', String(abierto));
    });
    $$('a', lista).forEach((a) =>
      a.addEventListener('click', () => {
        lista.classList.remove('abierto');
        boton.setAttribute('aria-expanded', 'false');
      })
    );

    if (!('IntersectionObserver' in window)) return;
    const enlaces = new Map($$('a', lista).map((a) => [a.getAttribute('href').slice(1), a]));
    const obs = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            enlaces.forEach((a) => a.classList.remove('activo'));
            const a = enlaces.get(e.target.id);
            if (a) a.classList.add('activo');
          }
        });
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    enlaces.forEach((_, id) => {
      const sec = document.getElementById(id);
      if (sec) obs.observe(sec);
    });
  })();

  /* ---------- 3. Simulador del auto ---------- */
  (function simulador() {
    const canvas = $('#pista');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // Escala: 4 px = 1 cm
    const PX_CM = 4;
    // Reglas iguales a las del código del auto
    const FRENTE_BLOQUEA_CM = 10;
    const AUTO_ESQUIVA_CM = 15;
    const ATRAS_DETECTA_PX = 5 * PX_CM;
    const VMAX = 130; // px por segundo
    const MAX_GIRO = (28 * Math.PI) / 180;
    const ALCANCE_FRENTE = 100 * PX_CM;

    const tinta = '#13243c';
    const azul = '#2358f2';
    const rojo = '#d8362b';
    const ambar = '#f0a500';

    const coche = { x: 150, y: 220, a: 0, v: 0, delta: 0, largo: 84, ancho: 40, base: 56 };
    const teclas = { up: false, down: false, left: false, right: false };
    let modo = sinMovimiento ? 'manual' : 'auto';
    let luces = false;

    const muros = [
      { x: 0, y: 0, w: W, h: 14 },
      { x: 0, y: H - 14, w: W, h: 14 },
      { x: 0, y: 0, w: 14, h: H },
      { x: W - 14, y: 0, w: 14, h: H },
    ];
    const bloques = [
      { x: 430, y: 110, w: 90, h: 70 },
      { x: 570, y: 280, w: 70, h: 100 },
      { x: 290, y: 330, w: 110, h: 42 },
    ];
    const todos = () => muros.concat(bloques);

    const dentro = (px, py) => {
      for (const r of todos()) {
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return true;
      }
      return false;
    };

    const rayo = (x, y, ang, max) => {
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      for (let d = 0; d <= max; d += 2) {
        if (dentro(x + dx * d, y + dy * d)) return d;
      }
      return Infinity;
    };

    const chocaCoche = (x, y, a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      for (let lx = -coche.largo / 2; lx <= coche.largo / 2; lx += 14) {
        for (const ly of [-coche.ancho / 2, 0, coche.ancho / 2]) {
          if (dentro(x + lx * c - ly * s, y + lx * s + ly * c)) return true;
        }
      }
      return false;
    };

    // ----- estado de los sensores, de las luces y del modo automático -----
    let distFrentePx = Infinity;
    let atras = false;
    let luzRoja = false, luzIzq = false, luzDer = false;
    let est = 'avanzar';
    let estT = 0;
    let lado = 1;

    function leerSensores() {
      const c = Math.cos(coche.a);
      const s = Math.sin(coche.a);
      const nx = coche.x + c * (coche.largo / 2);
      const ny = coche.y + s * (coche.largo / 2);
      distFrentePx = Math.min(
        rayo(nx, ny, coche.a, ALCANCE_FRENTE),
        rayo(nx, ny, coche.a - 0.13, ALCANCE_FRENTE),
        rayo(nx, ny, coche.a + 0.13, ALCANCE_FRENTE)
      );
      const bx = coche.x - c * (coche.largo / 2);
      const by = coche.y - s * (coche.largo / 2);
      atras = rayo(bx, by, coche.a + Math.PI, ATRAS_DETECTA_PX) <= ATRAS_DETECTA_PX;
    }

    function decidir(t) {
      const frenteCm = distFrentePx / PX_CM;
      let acel = 0;
      let dir = 0;

      if (modo === 'manual') {
        acel = (teclas.up ? 100 : 0) - (teclas.down ? 100 : 0);
        dir = (teclas.right ? 100 : 0) - (teclas.left ? 100 : 0);
      } else {
        if (est === 'avanzar') {
          acel = 60;
          dir = 0;
          if (frenteCm < AUTO_ESQUIVA_CM) {
            est = 'retroceder';
            estT = t;
            lado = -lado;
          }
        } else if (est === 'retroceder') {
          acel = -60;
          dir = 100 * lado;
          if (t - estT > 700 || atras) {
            est = 'girar';
            estT = t;
          }
        } else {
          acel = 60;
          dir = -100 * lado;
          if (t - estT > 700) est = 'avanzar';
        }
      }

      // Bloqueo por sensores (igual que en el auto)
      if (acel > 0 && frenteCm < FRENTE_BLOQUEA_CM) acel = 0;
      if (acel < 0 && atras) acel = 0;

      // Luces
      luzRoja = acel <= 0 || frenteCm < FRENTE_BLOQUEA_CM || atras;
      const parpadeo = Math.floor(t / 400) % 2 === 0;
      luzIzq = dir < -25 && parpadeo;
      luzDer = dir > 25 && parpadeo;
      return { acel, dir };
    }

    function actualizar(dt, t) {
      leerSensores();
      const { acel, dir } = decidir(t);

      // El servo no gira de golpe
      coche.delta += clamp(dir / 100 - coche.delta, -3.5 * dt, 3.5 * dt);
      // Arranque suave
      const objetivo = (acel / 100) * VMAX;
      coche.v += clamp(objetivo - coche.v, -240 * dt, 240 * dt);

      const da = (coche.v / coche.base) * Math.tan(coche.delta * MAX_GIRO) * dt;
      const na = coche.a + da;
      const nx = coche.x + Math.cos(na) * coche.v * dt;
      const ny = coche.y + Math.sin(na) * coche.v * dt;
      if (chocaCoche(nx, ny, na)) {
        coche.v = 0;
      } else {
        coche.x = nx;
        coche.y = ny;
        coche.a = na;
      }
    }

    // ----- dibujo -----
    function rectRedondeado(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function dibujarPista() {
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#e1e7ee';
      ctx.lineWidth = 1;
      for (let x = 14; x < W; x += 28) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
      }
      for (let y = 14; y < H; y += 28) {
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
      }
      ctx.fillStyle = tinta;
      muros.forEach((m) => ctx.fillRect(m.x, m.y, m.w, m.h));
      bloques.forEach((b) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.save();
        ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
        ctx.strokeStyle = '#9fb0c4';
        ctx.lineWidth = 2;
        for (let i = -b.h; i < b.w + b.h; i += 12) {
          ctx.beginPath(); ctx.moveTo(b.x + i, b.y + b.h); ctx.lineTo(b.x + i + b.h, b.y); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = tinta;
        ctx.lineWidth = 3;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      });
    }

    function dibujarSensores() {
      const c = Math.cos(coche.a);
      const s = Math.sin(coche.a);
      const nx = coche.x + c * (coche.largo / 2);
      const ny = coche.y + s * (coche.largo / 2);
      const largo = Math.min(distFrentePx, ALCANCE_FRENTE);
      const bloqueado = distFrentePx / PX_CM < FRENTE_BLOQUEA_CM;
      ctx.save();
      ctx.fillStyle = bloqueado ? 'rgba(216,54,43,0.22)' : 'rgba(35,88,242,0.13)';
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(nx + Math.cos(coche.a - 0.13) * largo, ny + Math.sin(coche.a - 0.13) * largo);
      ctx.lineTo(nx + Math.cos(coche.a + 0.13) * largo, ny + Math.sin(coche.a + 0.13) * largo);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = bloqueado ? rojo : azul;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(nx + c * largo, ny + s * largo);
      ctx.stroke();
      ctx.restore();

      if (atras) {
        const bx = coche.x - c * (coche.largo / 2);
        const by = coche.y - s * (coche.largo / 2);
        ctx.save();
        ctx.strokeStyle = rojo;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bx, by, ATRAS_DETECTA_PX, coche.a + Math.PI - 0.7, coche.a + Math.PI + 0.7);
        ctx.stroke();
        ctx.restore();
      }
    }

    function dibujarCoche() {
      ctx.save();
      ctx.translate(coche.x, coche.y);
      ctx.rotate(coche.a);
      const L = coche.largo;
      const A = coche.ancho;

      // luz de los faros
      if (luces) {
        const g = ctx.createRadialGradient(L / 2, 0, 4, L / 2 + 50, 0, 110);
        g.addColorStop(0, 'rgba(255, 250, 200, 0.75)');
        g.addColorStop(1, 'rgba(255, 250, 200, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(L / 2, -A / 2 + 4);
        ctx.lineTo(L / 2 + 120, -A / 2 - 34);
        ctx.lineTo(L / 2 + 120, A / 2 + 34);
        ctx.lineTo(L / 2, A / 2 - 4);
        ctx.closePath();
        ctx.fill();
      }

      // ruedas (las delanteras giran con el servo)
      const eje = coche.base / 2;
      const rueda = (x, y, ang) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.fillStyle = tinta;
        rectRedondeado(-9, -4.5, 18, 9, 3);
        ctx.fill();
        ctx.restore();
      };
      const giro = coche.delta * MAX_GIRO;
      rueda(eje, -A / 2 - 3, giro);
      rueda(eje, A / 2 + 3, giro);
      rueda(-eje, -A / 2 - 3, 0);
      rueda(-eje, A / 2 + 3, 0);

      // carrocería
      ctx.fillStyle = '#f4f6f9';
      ctx.strokeStyle = tinta;
      ctx.lineWidth = 3;
      rectRedondeado(-L / 2, -A / 2, L, A, 9);
      ctx.fill();
      ctx.stroke();
      // techo y parabrisas
      ctx.fillStyle = '#cfd8e3';
      rectRedondeado(-L / 2 + 22, -A / 2 + 6, 34, A - 12, 5);
      ctx.fill();
      ctx.fillStyle = '#9fb4cf';
      ctx.fillRect(L / 2 - 30, -A / 2 + 7, 7, A - 14);
      // alerón trasero
      ctx.fillStyle = tinta;
      ctx.fillRect(-L / 2 - 2, -A / 2 + 3, 4, A - 6);

      // faros delanteros
      ctx.fillStyle = luces ? '#ffffff' : '#c7d0db';
      ctx.strokeStyle = tinta;
      ctx.lineWidth = 1.5;
      [-1, 1].forEach((k) => {
        ctx.beginPath();
        ctx.rect(L / 2 - 6, k * (A / 2 - 8) - 4, 6, 8);
        ctx.fill();
        ctx.stroke();
      });

      // luces traseras
      ctx.fillStyle = luzRoja ? rojo : '#e3b2ae';
      [-1, 1].forEach((k) => {
        ctx.beginPath();
        ctx.rect(-L / 2 - 1, k * (A / 2 - 8) - 4, 5, 8);
        ctx.fill();
      });
      if (luzRoja) {
        ctx.save();
        ctx.shadowColor = rojo;
        ctx.shadowBlur = 14;
        ctx.fillStyle = rojo;
        [-1, 1].forEach((k) => ctx.fillRect(-L / 2 - 1, k * (A / 2 - 8) - 4, 5, 8));
        ctx.restore();
      }

      // intermitentes: la izquierda del auto es el lado negativo en y
      const intermitente = (signo, activo) => {
        [L / 2 - 14, -L / 2 + 12].forEach((px) => {
          ctx.save();
          ctx.fillStyle = activo ? ambar : '#ecd9a6';
          if (activo) {
            ctx.shadowColor = ambar;
            ctx.shadowBlur = 12;
          }
          ctx.beginPath();
          ctx.arc(px, signo * (A / 2 + 1), 3.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      };
      intermitente(-1, luzIzq);
      intermitente(1, luzDer);

      ctx.restore();
    }

    function dibujarEtiqueta() {
      const cm = distFrentePx / PX_CM;
      if (!isFinite(cm) || cm > 100) return;
      const c = Math.cos(coche.a);
      const s = Math.sin(coche.a);
      const medio = coche.largo / 2 + Math.min(distFrentePx, ALCANCE_FRENTE) / 2 + 6;
      const px = coche.x + c * medio;
      const py = coche.y + s * medio - 10;
      ctx.save();
      ctx.font = '700 13px "Atkinson Hyperlegible", sans-serif';
      ctx.fillStyle = cm < FRENTE_BLOQUEA_CM ? rojo : azul;
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(cm) + ' cm', clamp(px, 30, W - 30), clamp(py, 28, H - 22));
      ctx.restore();
    }

    function dibujar() {
      dibujarPista();
      dibujarSensores();
      dibujarCoche();
      dibujarEtiqueta();
    }

    // ----- panel de lecturas -----
    const el = {
      frente: $('#lecFrente'),
      atras: $('#lecAtras'),
      vel: $('#lecVel'),
      modo: $('#lecModo'),
      roja: $('#lamRoja'),
      izq: $('#lamIzq'),
      der: $('#lamDer'),
      blanca: $('#lamBlanca'),
    };
    let ultimoPanel = -1000;
    function panel(t) {
      el.roja.classList.toggle('on', luzRoja);
      el.izq.classList.toggle('on', luzIzq);
      el.der.classList.toggle('on', luzDer);
      el.blanca.classList.toggle('on', luces);
      if (t - ultimoPanel < 120) return;
      ultimoPanel = t;
      const cm = distFrentePx / PX_CM;
      el.frente.textContent = !isFinite(cm) || cm > 100 ? 'más de 100 cm' : Math.round(cm) + ' cm';
      el.atras.textContent = atras ? 'Obstáculo' : 'Libre';
      el.vel.textContent = Math.round(Math.abs(coche.v) / PX_CM) + ' cm/s';
      const fase = { avanzar: 'avanza', retroceder: 'retrocede', girar: 'esquiva' }[est];
      el.modo.textContent = modo === 'auto' ? 'Automático: ' + fase : 'Manual';
    }

    // ----- bucle -----
    let raf = 0;
    let ultimo = 0;
    let visible = true;
    function paso(ahora) {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000);
      ultimo = ahora;
      actualizar(dt, ahora);
      dibujar();
      panel(ahora);
      raf = requestAnimationFrame(paso);
    }
    function iniciar() {
      if (raf || !visible || document.hidden) return;
      ultimo = performance.now();
      raf = requestAnimationFrame(paso);
    }
    function parar() {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => {
        visible = es[0].isIntersecting;
        if (visible) iniciar(); else parar();
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', () => (document.hidden ? parar() : iniciar()));

    // Con "reducir movimiento" se dibuja un cuadro y solo se mueve si la persona maneja
    leerSensores();
    decidir(0);
    dibujar();
    panel(0);
    iniciar();

    // ----- controles -----
    const botonesModo = $$('[data-modo]');
    function ponerModo(m) {
      modo = m;
      est = 'avanzar';
      botonesModo.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === m)));
    }
    ponerModo(modo);
    botonesModo.forEach((b) => b.addEventListener('click', () => { ponerModo(b.dataset.modo); iniciar(); }));

    const botonLuces = $('#btnLuces');
    botonLuces.addEventListener('click', () => {
      luces = !luces;
      botonLuces.setAttribute('aria-pressed', String(luces));
      iniciar();
    });

    const mapa = {
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
    };
    function tomarControl() {
      if (modo !== 'manual') ponerModo('manual');
      iniciar();
    }
    canvas.addEventListener('keydown', (e) => {
      const k = mapa[e.key];
      if (!k) return;
      e.preventDefault();
      tomarControl();
      teclas[k] = true;
    });
    canvas.addEventListener('keyup', (e) => {
      const k = mapa[e.key];
      if (k) { e.preventDefault(); teclas[k] = false; }
    });
    canvas.addEventListener('blur', () => Object.keys(teclas).forEach((k) => (teclas[k] = false)));

    $$('[data-tecla]').forEach((b) => {
      const k = b.dataset.tecla;
      const soltar = () => { teclas[k] = false; b.classList.remove('presionado'); };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        tomarControl();
        teclas[k] = true;
        b.classList.add('presionado');
        b.setPointerCapture(e.pointerId);
      });
      b.addEventListener('pointerup', soltar);
      b.addEventListener('pointercancel', soltar);
      b.addEventListener('lostpointercapture', soltar);
    });

    // ----- arrastrar bloques -----
    let arrastre = null;
    const aCanvas = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
    };
    const sobreBloque = (p) =>
      bloques.find((q) => p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h);

    canvas.addEventListener('pointerdown', (e) => {
      const p = aCanvas(e);
      const b = sobreBloque(p);
      if (b) {
        arrastre = { b, dx: p.x - b.x, dy: p.y - b.y };
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = aCanvas(e);
      if (!arrastre) {
        canvas.style.cursor = sobreBloque(p) ? 'grab' : 'crosshair';
        return;
      }
      const b = arrastre.b;
      const antes = { x: b.x, y: b.y };
      b.x = clamp(p.x - arrastre.dx, 14, W - 14 - b.w);
      b.y = clamp(p.y - arrastre.dy, 14, H - 14 - b.h);
      if (chocaCoche(coche.x, coche.y, coche.a)) { b.x = antes.x; b.y = antes.y; }
      iniciar();
      if (!raf) { dibujar(); }
    });
    const soltarBloque = () => { arrastre = null; canvas.style.cursor = 'crosshair'; };
    canvas.addEventListener('pointerup', soltarBloque);
    canvas.addEventListener('pointercancel', soltarBloque);
  })();

  /* ---------- 4. Pestañas ---------- */
  function iniciarPestanas(raiz, alCambiar) {
    if (!raiz) return;
    const tabs = $$('[role="tab"]', raiz);
    const paneles = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));

    function elegir(i, enfocar) {
      tabs.forEach((t, j) => {
        const activo = i === j;
        t.setAttribute('aria-selected', String(activo));
        t.tabIndex = activo ? 0 : -1;
        if (paneles[j]) paneles[j].hidden = !activo;
      });
      if (enfocar) tabs[i].focus();
      if (alCambiar) alCambiar(i);
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => elegir(i, false));
      t.addEventListener('keydown', (e) => {
        let n = null;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') n = 0;
        if (e.key === 'End') n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); elegir(n, true); }
      });
    });
  }
  iniciarPestanas($('#pestanasFuncion'));

  /* ---------- 5. Catálogo de componentes ---------- */
  const ML = (busqueda) => 'https://listado.mercadolibre.com.ar/' + busqueda;

  const iconos = {
    chip: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="12" y="12" width="24" height="24" rx="3"/><path d="M18 6v6M24 6v6M30 6v6M18 36v6M24 36v6M30 36v6M6 18h6M6 24h6M6 30h6M36 18h6M36 24h6M36 30h6"/></svg>',
    motor: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="10" y="14" width="22" height="20" rx="3"/><path d="M32 20h6v8h-6M38 24h5"/><circle cx="21" cy="24" r="4"/></svg>',
    servo: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="8" y="16" width="26" height="18" rx="3"/><circle cx="34" cy="25" r="5"/><path d="M34 25l8-6M4 22h4M4 28h4"/></svg>',
    sensor: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="6" y="14" width="36" height="20" rx="3"/><circle cx="16" cy="24" r="5"/><circle cx="32" cy="24" r="5"/></svg>',
    joystick: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="8" y="30" width="32" height="10" rx="3"/><path d="M24 30V16"/><circle cx="24" cy="12" r="5"/></svg>',
    boton: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="10" y="22" width="28" height="16" rx="3"/><rect x="16" y="12" width="16" height="10" rx="2"/></svg>',
    led: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M16 26a8 8 0 1116 0v8H16z"/><path d="M20 34v8M28 34v8M24 4v4M10 10l3 3M38 10l-3 3"/></svg>',
    resistencia: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 24h8l3-8 6 16 6-16 6 16 3-8h8"/></svg>',
    capacitor: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 24h14M30 24h14M18 10v28M30 10v28"/></svg>',
    transistor: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="26" cy="24" r="14"/><path d="M6 24h14M20 14v20M20 20l12-8M20 28l12 8"/></svg>',
    bateria: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="6" y="16" width="32" height="16" rx="3"/><path d="M38 21h4v6h-4M14 24h8M18 20v8"/></svg>',
    regulador: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="8" y="10" width="32" height="28" rx="3"/><circle cx="24" cy="24" r="7"/><path d="M24 20v4l3 2"/></svg>',
    interruptor: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="8" y="18" width="32" height="14" rx="7"/><circle cx="31" cy="25" r="4"/></svg>',
    cables: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 14c14 0 6 20 20 20h16M6 24c10 0 6 10 16 10M6 34h6"/></svg>',
    protoboard: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="6" y="10" width="36" height="28" rx="3"/><path d="M14 18h20M14 24h20M14 30h20"/></svg>',
    impresion: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M10 34l14 6 14-6V16L24 10 10 16z"/><path d="M10 16l14 6 14-6M24 22v18"/></svg>',
  };

  const componentes = [
    { nombre: 'ESP32 NodeMCU de 30 pines', cant: '2', cat: ['control', 'auto'], icono: 'chip',
      texto: 'El cerebro de cada lado: una en el control y otra en el auto. Procesan los sensores y se hablan por ESP-NOW.',
      precio: 11000, nota: 'las 2', url: ML('esp32-nodemcu-30-pines') },
    { nombre: 'Driver L293D', cant: '1 en el auto', cat: ['auto', 'potencia'], icono: 'chip',
      texto: 'Maneja los dos motores N20 y su sentido de giro. Pierde entre 1,4 y 2,6 V, y aguanta 600 mA por motor.',
      precio: 16000, nota: 'el presupuesto incluye 2', url: ML('l293d') },
    { nombre: 'Motores N20 con reductor metálico, 6 V y 100 rpm', cant: '2', cat: ['auto', 'potencia'], img: 'img/n20.jpg', icono: 'motor',
      texto: 'Micromotores, uno por rueda trasera. Son chicos pero alcanzan para un auto liviano sobre piso liso.',
      precio: 8000, nota: 'los 2', url: ML('motor-n20-6v-100-rpm-reductor') },
    { nombre: 'Servo SG90', cant: '1', cat: ['auto', 'potencia'], icono: 'servo',
      texto: 'Gira el eje delantero para dirigir el auto, a izquierda y a derecha.',
      precio: 2900, url: ML('servo-sg90') },
    { nombre: 'Sensor ultrasónico HC-SR04', cant: '1', cat: ['auto', 'sensores'], img: 'img/hc-sr04.jpg', icono: 'sensor',
      texto: 'Mira al frente desde el capó. Mide de 2 cm a 4 m; el auto no avanza si hay algo a menos de 10 cm.',
      precio: 2300, url: ML('sensor-ultrasonico-hc-sr04') },
    { nombre: 'Sensor infrarrojo FC-51 (usamos el HW-201, equivalente)', cant: '1', cat: ['auto', 'sensores'], img: 'img/fc-51.jpg', icono: 'sensor',
      texto: 'Va atrás. Su alcance corto se regula con un tornillo y bloquea la marcha atrás. Da 0 al detectar.',
      precio: 8000, url: ML('sensor-infrarrojo-obstaculos-fc-51') },
    { nombre: 'Joystick analógico KY-023', cant: '2', cat: ['control', 'sensores'], icono: 'joystick',
      texto: 'Uno para los motores (adelante y atrás) y otro para la dirección. Se alimentan a 3.3 V.',
      precio: null, url: ML('joystick-analogico-ky-023') },
    { nombre: 'Pulsadores', cant: '2', cat: ['control'], icono: 'boton',
      texto: 'Uno activa el modo automático y otro enciende las luces delanteras.',
      precio: 200, nota: 'los 2', url: ML('pulsador-6x6-4-pines') },
    { nombre: 'LEDs de 5 mm: rojos, amarillos y blancos', cant: '2 de cada color', cat: ['auto', 'luces'], icono: 'led',
      texto: 'Rojos traseros, amarillos intermitentes y blancos como faros.',
      precio: 2400, url: ML('led-5mm-rojo-amarillo-blanco') },
    { nombre: 'Resistencias de 220 Ω', cant: '1 pack de 10', cat: ['auto', 'luces'], icono: 'resistencia',
      texto: 'Una en serie con cada LED rojo y amarillo. Los blancos llevan 150 Ω.',
      precio: 2400, url: ML('resistencias-220-ohm-pack') },
    { nombre: 'Resistencias de 1 kΩ', cant: '1 pack de 10', cat: ['auto', 'luces'], icono: 'resistencia',
      texto: 'Una para el divisor de voltaje del HC-SR04 y otra para la base del transistor de los faros.',
      precio: 2000, url: ML('resistencias-1k-ohm-pack') },
    { nombre: 'Resistencias de 2 kΩ', cant: '1 pack de 10', cat: ['auto', 'luces'], icono: 'resistencia',
      texto: 'La otra mitad del divisor de voltaje que protege a la ESP32 del pin ECHO.',
      precio: 7400, url: ML('resistencias-2k-ohm-pack') },
    { nombre: 'Capacitores cerámicos de 100 nF', cant: '2', cat: ['auto', 'luces'], icono: 'capacitor',
      texto: 'Se sueldan entre los terminales de cada motor para bajar el ruido eléctrico.',
      precio: 2500, url: ML('capacitor-ceramico-100nf') },
    { nombre: 'Capacitor electrolítico de 100 µF a 470 µF', cant: '1', cat: ['auto', 'luces'], icono: 'capacitor',
      texto: 'Va en la alimentación de los motores para aguantar los picos de corriente al arrancar.',
      precio: null, url: ML('capacitor-electrolitico-470uf-16v') },
    { nombre: 'Transistor NPN 2N2222 o BC547', cant: '1', cat: ['auto', 'luces'], icono: 'transistor',
      texto: 'Enciende los dos faros blancos con 5 V, porque un pin de la ESP32 solo da 3.3 V.',
      precio: null, url: ML('transistor-2n2222') },
    { nombre: 'Regulador reductor LM2596', cant: '1', cat: ['auto', 'potencia'], icono: 'regulador',
      texto: 'Baja los 7,4 V de las baterías a 5 V para la ESP32, el servo y los sensores. Se ajusta antes de conectar.',
      precio: 3500, url: ML('modulo-lm2596-step-down') },
    { nombre: 'Baterías 18650 de 2600 mAh', cant: '2', cat: ['auto', 'potencia'], icono: 'bateria',
      texto: 'En serie dan 7,4 V para los motores y el regulador. Hay que cargarlas con un cargador adecuado.',
      precioTexto: '$5.735 c/u', nota: 'precio visto al elegirlas',
      url: 'https://www.mercadolibre.com.ar/pila-bateria-recargable-18650-2600mah-37v-mayor-potencia/p/MLA67913384' },
    { nombre: 'Portapilas para 2 celdas (7,4 V)', cant: '1', cat: ['auto', 'potencia'], icono: 'bateria',
      texto: 'Tiene que ser para pilas 18650 y traer cables de salida.',
      precio: 3200, url: ML('portapilas-2-celdas-18650') },
    { nombre: 'Interruptor KCD11', cant: '2', cat: ['auto', 'potencia'], icono: 'interruptor',
      texto: 'Para encender y apagar el auto desde la batería.',
      precio: 4400, url: ML('switch-kcd11') },
    { nombre: 'Protoboard', cant: '1', cat: ['control', 'auto', 'estructura'], icono: 'protoboard',
      texto: 'Sirve para probar. En el montaje final conviene una placa perforada soldada, para evitar falsos contactos.',
      precio: null, url: ML('protoboard-830-puntos') },
    { nombre: 'Cables dupont', cant: 'pack de 40', cat: ['control', 'auto', 'estructura'], icono: 'cables',
      texto: 'Para unir todo entre sí.',
      precio: 9400, url: ML('cables-dupont-40') },
    { nombre: 'Filamento PLA para el chasis y la carcasa', cant: '1 rollo', cat: ['estructura'], img: 'img/fennec.jpg', icono: 'impresion',
      texto: 'La carcasa del Fennec y el chasis se imprimen en 3D, con paredes finas y relleno bajo.',
      precio: null, url: ML('filamento-pla-1kg') },
  ];

  (function catalogo() {
    const lista = $('#catalogo');
    const contador = $('#contadorFiltro');
    const filtros = $$('#filtros button');
    if (!lista) return;

    const etiquetaCat = {
      control: 'Control', auto: 'Auto', sensores: 'Sensores',
      potencia: 'Movimiento y energía', luces: 'Luces y pasivos', estructura: 'Estructura',
    };

    function fila(c) {
      const li = document.createElement('li');
      li.dataset.cat = c.cat.join(' ');

      const imgBox = document.createElement('div');
      imgBox.className = 'cat-img';
      if (c.img) {
        const im = document.createElement('img');
        im.src = c.img;
        im.alt = 'Foto de: ' + c.nombre;
        im.loading = 'lazy';
        im.addEventListener('error', () => { imgBox.innerHTML = iconos[c.icono] || ''; });
        imgBox.appendChild(im);
      } else {
        imgBox.innerHTML = iconos[c.icono] || '';
        imgBox.setAttribute('role', 'img');
        imgBox.setAttribute('aria-label', 'Ilustración: ' + c.nombre);
      }

      const info = document.createElement('div');
      info.className = 'cat-info';
      info.innerHTML = '<h3></h3><p></p><p><span class="cant"></span> · <span class="cat-tipos"></span></p>';
      info.querySelector('h3').textContent = c.nombre;
      info.querySelectorAll('p')[0].textContent = c.texto;
      info.querySelector('.cant').textContent = 'Cantidad: ' + c.cant;
      info.querySelector('.cat-tipos').textContent = c.cat.map((k) => etiquetaCat[k]).join(', ');

      const accion = document.createElement('div');
      accion.className = 'cat-accion';
      const precio = document.createElement('div');
      precio.className = 'cat-precio';
      if (c.precio != null) {
        precio.textContent = pesos(c.precio);
        if (c.nota) precio.insertAdjacentHTML('beforeend', '<small>' + c.nota + '</small>');
      } else if (c.precioTexto) {
        precio.textContent = c.precioTexto;
        if (c.nota) precio.insertAdjacentHTML('beforeend', '<small>' + c.nota + '</small>');
      } else {
        precio.innerHTML = '<small>Precio a consultar</small>';
      }
      const enlace = document.createElement('a');
      enlace.className = 'cat-comprar';
      enlace.href = c.url;
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      enlace.textContent = 'Ver en Mercado Libre';
      enlace.setAttribute('aria-label', 'Ver ' + c.nombre + ' en Mercado Libre (se abre en una pestaña nueva)');
      accion.append(precio, enlace);

      li.append(imgBox, info, accion);
      return li;
    }

    componentes.forEach((c) => lista.appendChild(fila(c)));

    function aplicar(filtro) {
      let visibles = 0;
      $$('li', lista).forEach((li) => {
        const ok = filtro === 'todos' || li.dataset.cat.split(' ').includes(filtro);
        li.hidden = !ok;
        if (ok) visibles++;
      });
      filtros.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro)));
      contador.textContent = 'Mostrando ' + visibles + ' de ' + componentes.length + ' componentes.';
    }
    filtros.forEach((b) => b.addEventListener('click', () => aplicar(b.dataset.filtro)));
    aplicar('todos');
  })();

  /* ---------- 6. Presupuesto ---------- */
  (function presupuesto() {
    const barra = $('#barraPres');
    const leyenda = $('#leyendaPres');
    const tbody = $('#tablaPres');
    const pie = $('#pieTablaPres');
    if (!barra || !tbody) return;

    const categorias = {
      cerebro: { nombre: 'Cerebro y driver', color: '#2358f2' },
      movimiento: { nombre: 'Movimiento', color: '#1f9d6b' },
      sensores: { nombre: 'Sensores', color: '#f0a500' },
      energia: { nombre: 'Energía', color: '#d8362b' },
      pasivos: { nombre: 'Luces y componentes pasivos', color: '#7a4dd8' },
      cableado: { nombre: 'Cableado y botones', color: '#8aa0ba' },
    };

    // Datos de la tabla de presupuesto de nuestro documento (ARS)
    const lineas = [
      ['ESP32 (NodeMCU 30 pines)', '2', 11000, 'cerebro'],
      ['Driver L293D', '2', 16000, 'cerebro'],
      ['Motor N20 con motorreductor', '2', 8000, 'movimiento'],
      ['Batería 9 V', '1', 2500, 'energia'],
      ['Servo SG90', '1', 2900, 'movimiento'],
      ['Ultrasónico HC-SR04', '1', 2300, 'sensores'],
      ['Sensor FC-51', '1', 8000, 'sensores'],
      ['Portapilas 2 celdas (7,4 V)', '1', 3200, 'energia'],
      ['Capacitor cerámico 100 nF', '2', 2500, 'pasivos'],
      ['Switch KCD11', '2', 4400, 'energia'],
      ['LEDs 5 mm (rojo, amarillo y blanco)', '2 de cada uno', 2400, 'pasivos'],
      ['Botón', '2', 200, 'cableado'],
      ['Resistencias 220 Ω', '1 pack de 10', 2400, 'pasivos'],
      ['Resistencias 1 kΩ', '1 pack de 10', 2000, 'pasivos'],
      ['Cables', 'pack de 40', 9400, 'cableado'],
      ['Resistencias 2 kΩ', '1 pack de 10', 7400, 'pasivos'],
      ['Regulador LM2596', '1', 3500, 'energia'],
    ];
    const TOTAL_DOCUMENTO = 94000;

    const suma = lineas.reduce((t, l) => t + l[2], 0);
    const porCat = {};
    lineas.forEach((l) => { porCat[l[3]] = (porCat[l[3]] || 0) + l[2]; });

    lineas.forEach((l) => {
      const tr = document.createElement('tr');
      tr.dataset.cat = l[3];
      tr.innerHTML = '<th scope="row"></th><td></td><td class="num"></td>';
      tr.children[0].textContent = l[0];
      tr.children[1].textContent = l[1];
      tr.children[2].textContent = pesos(l[2]);
      tbody.appendChild(tr);
    });
    const diferencia = TOTAL_DOCUMENTO - suma;
    pie.innerHTML =
      '<tr><th scope="row" colspan="2">Suma de los componentes</th><td class="num">' + pesos(suma) + '</td></tr>' +
      (diferencia !== 0
        ? '<tr><th scope="row" colspan="2">Diferencia con el total del documento</th><td class="num">' + pesos(diferencia) + '</td></tr>'
        : '') +
      '<tr><th scope="row" colspan="2">Total del documento</th><td class="num">' + pesos(TOTAL_DOCUMENTO) + '</td></tr>';

    const segmentos = [];
    Object.keys(categorias).forEach((k) => {
      const valor = porCat[k] || 0;
      const pct = (valor / suma) * 100;
      const s = document.createElement('span');
      s.style.background = categorias[k].color;
      s.dataset.ancho = pct.toFixed(2);
      s.dataset.cat = k;
      s.title = categorias[k].nombre + ': ' + pesos(valor);
      barra.appendChild(s);
      segmentos.push(s);

      const li = document.createElement('li');
      li.dataset.cat = k;
      li.innerHTML = '<i></i><span></span><b></b>';
      li.querySelector('i').style.background = categorias[k].color;
      li.querySelector('span').textContent = categorias[k].nombre;
      li.querySelector('b').textContent = pesos(valor) + ' · ' + Math.round(pct) + ' %';
      leyenda.appendChild(li);
    });

    function resaltar(cat) {
      segmentos.forEach((e) => e.classList.toggle('resalta', e.dataset.cat === cat));
      $$('li', leyenda).forEach((e) => e.classList.toggle('resalta', e.dataset.cat === cat));
      $$('tr', tbody).forEach((e) => e.classList.toggle('resalta', e.dataset.cat === cat));
    }
    [...segmentos, ...$$('li', leyenda)].forEach((e) => {
      e.addEventListener('mouseenter', () => resaltar(e.dataset.cat));
      e.addEventListener('mouseleave', () => resaltar(null));
    });

    // La barra se llena una sola vez, cuando aparece en pantalla
    const llenar = () => segmentos.forEach((s) => (s.style.width = s.dataset.ancho + '%'));
    if (sinMovimiento || !('IntersectionObserver' in window)) {
      llenar();
    } else {
      const obs = new IntersectionObserver((es) => {
        if (es[0].isIntersecting) { llenar(); obs.disconnect(); }
      }, { threshold: 0.4 });
      obs.observe(barra);
    }
  })();

  /* ---------- 7. Conexiones ---------- */
  const pinesControl = [
    { nombre: 'Joystick 1 (motores)', filas: [['VCC', '3.3V'], ['GND', 'GND'], ['VRy', 'GPIO34']] },
    { nombre: 'Joystick 2 (servo)', filas: [['VCC', '3.3V'], ['GND', 'GND'], ['VRx', 'GPIO35']] },
    { nombre: 'Botón de modo automático', filas: [['Una pata', 'GPIO27'], ['Otra pata', 'GND']] },
    { nombre: 'Botón de luces delanteras', filas: [['Una pata', 'GPIO26'], ['Otra pata', 'GND']] },
    { nombre: 'Alimentación', filas: [['Power bank o USB', 'Puerto USB de la ESP32']] },
  ];

  const pinesAuto = [
    { nombre: 'Driver L293D', filas: [
      ['1 (Enable 1,2)', 'GPIO25'], ['2 (Input 1)', 'GPIO26'], ['7 (Input 2)', 'GPIO27'],
      ['9 (Enable 3,4)', 'GPIO17'], ['10 (Input 3)', 'GPIO32'], ['15 (Input 4)', 'GPIO33'],
      ['3 y 6 (Output 1 y 2)', 'Motor N20 izquierdo'], ['11 y 14 (Output 3 y 4)', 'Motor N20 derecho'],
      ['16 (Vcc 1)', '5 V del regulador'], ['8 (Vcc 2)', '+ de la batería (7,4 V)'],
      ['4, 5, 12 y 13 (GND)', 'GND común'] ] },
    { nombre: 'Motores N20', filas: [['Cada motor', 'Capacitor cerámico de 100 nF soldado entre sus terminales']] },
    { nombre: 'Servo SG90', filas: [['Rojo', '5 V del regulador'], ['Marrón o negro', 'GND'], ['Señal (naranja o amarillo)', 'GPIO13']] },
    { nombre: 'HC-SR04 (frente)', filas: [
      ['VCC', '5 V del regulador'], ['GND', 'GND'], ['TRIG', 'GPIO5'],
      ['ECHO', '1 kΩ hacia GPIO18, y 2 kΩ de GPIO18 a GND (divisor de voltaje)'] ] },
    { nombre: 'HW-201 infrarrojo (atrás)', filas: [['VCC', '3.3V de la ESP32'], ['GND', 'GND'], ['OUT', 'GPIO19']] },
    { nombre: 'LEDs rojos traseros (2)', filas: [['Ánodo (+) de cada uno', '220 Ω y luego GPIO23'], ['Cátodo (−)', 'GND']] },
    { nombre: 'LED amarillo izquierdo', filas: [['Ánodo (+)', '220 Ω y luego GPIO22'], ['Cátodo (−)', 'GND']] },
    { nombre: 'LED amarillo derecho', filas: [['Ánodo (+)', '220 Ω y luego GPIO4'], ['Cátodo (−)', 'GND']] },
    { nombre: 'LEDs blancos (2) y transistor NPN', filas: [
      ['Ánodo (+) de cada LED', '150 Ω y luego 5 V del regulador'],
      ['Cátodo (−) de ambos LEDs', 'Colector del transistor'],
      ['Base del transistor', '1 kΩ y luego GPIO16'],
      ['Emisor del transistor', 'GND'] ] },
    { nombre: 'Alimentación', filas: [
      ['Batería 7,4 V (+)', 'Interruptor, y de ahí al regulador y al pin 8 del L293D'],
      ['Regulador (salida a 5 V)', 'VIN de la ESP32, pin 16 del L293D, servo, HC-SR04 y LEDs blancos'],
      ['Batería (−)', 'GND común'],
      ['Capacitor 470 µF a 1000 µF', 'Entre el + de la batería y GND, cerca del L293D (la franja a GND)'],
      ['Capacitor 100 µF', 'Entre 5 V y GND, cerca de la ESP32'] ] },
  ];

  (function conexiones() {
    const panelControl = $('#panel-pcontrol');
    const panelAuto = $('#panel-pauto');
    const buscador = $('#buscaPin');
    if (!panelControl || !panelAuto) return;

    function armar(panel, grupos) {
      grupos.forEach((g) => {
        const caja = document.createElement('div');
        caja.className = 'tabla-ancha';
        caja.dataset.nombre = g.nombre.toLowerCase();
        const t = document.createElement('table');
        const cap = document.createElement('caption');
        cap.textContent = g.nombre;
        t.appendChild(cap);
        const cuerpo = document.createElement('tbody');
        g.filas.forEach((f) => {
          const tr = document.createElement('tr');
          tr.innerHTML = '<th scope="row"></th><td></td>';
          tr.children[0].textContent = f[0];
          tr.children[1].textContent = f[1];
          tr.dataset.texto = (f[0] + ' ' + f[1]).toLowerCase();
          cuerpo.appendChild(tr);
        });
        t.appendChild(cuerpo);
        caja.appendChild(t);
        panel.appendChild(caja);
      });
      const vacio = document.createElement('p');
      vacio.className = 'sin-resultados';
      vacio.textContent = 'No encontramos nada con esa búsqueda en esta placa.';
      vacio.hidden = true;
      panel.appendChild(vacio);
    }
    armar(panelControl, pinesControl);
    armar(panelAuto, pinesAuto);

    function filtrar() {
      const q = (buscador.value || '').trim().toLowerCase();
      [panelControl, panelAuto].forEach((panel) => {
        let hay = 0;
        $$('.tabla-ancha', panel).forEach((caja) => {
          const porNombre = q !== '' && caja.dataset.nombre.includes(q);
          let visibles = 0;
          $$('tbody tr', caja).forEach((tr) => {
            const coincide = q !== '' && tr.dataset.texto.includes(q);
            const mostrar = q === '' || porNombre || coincide;
            tr.classList.toggle('oculta', !mostrar);
            tr.classList.toggle('coincide', coincide);
            if (mostrar) visibles++;
          });
          caja.hidden = visibles === 0;
          if (visibles) hay++;
        });
        const vacio = $('.sin-resultados', panel);
        if (vacio) vacio.hidden = hay > 0;
      });
    }
    buscador.addEventListener('input', filtrar);

    iniciarPestanas($('#pestanasPines'));
  })();

  /* ---------- 8. Visor de hojas de datos ---------- */
  (function visor() {
    const dlg = $('#visor');
    const galeria = $('#galeria');
    if (!dlg || !galeria || typeof dlg.showModal !== 'function') return;
    const img = $('#visorImg');
    const leyenda = $('#visorLeyenda');
    const botones = $$('button[data-img]', galeria);
    let actual = 0;

    function mostrar(i) {
      actual = (i + botones.length) % botones.length;
      const b = botones[actual];
      img.src = b.dataset.img;
      img.alt = b.dataset.leyenda;
      leyenda.textContent = b.dataset.leyenda + ' (' + (actual + 1) + ' de ' + botones.length + ')';
      dlg.scrollTop = 0;
    }
    botones.forEach((b, i) =>
      b.addEventListener('click', () => {
        mostrar(i);
        dlg.showModal();
      })
    );
    $('#visorPrev').addEventListener('click', () => mostrar(actual - 1));
    $('#visorNext').addEventListener('click', () => mostrar(actual + 1));
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') mostrar(actual - 1);
      if (e.key === 'ArrowRight') mostrar(actual + 1);
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
  })();
})();
