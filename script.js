  // Scale the 1920x1080 deck to fit the viewport. Cap at 1.0 so we never blow
  // the deck up bigger than its native size on huge monitors.
  const deck = document.getElementById('deck');
  function fit() {
    const sx = window.innerWidth / 1280;
    const sy = window.innerHeight / 720;
    const s = Math.min(sx, sy);
    deck.style.transform = `scale(${s})`;
  }
  fit();
  window.addEventListener('resize', fit);

  const slides = document.querySelectorAll('.slide');
  let i = 0;

  function applyStripeState(slide) {
    const stripe = slide.querySelector('[data-stripe]');
    if (stripe) {
      const anyShown = [...slide.querySelectorAll('[data-replaces-stripe]')]
        .some(el => el.classList.contains('shown'));
      stripe.classList.toggle('hidden', anyShown);
    }
    const base = slide.querySelector('[data-base]');
    const baseReplacer = slide.querySelector('[data-replaces-base]');
    if (base && baseReplacer) {
      base.classList.toggle('hidden', baseReplacer.classList.contains('shown'));
    }
    const rightStack = slide.querySelector('[data-right-stack]');
    if (rightStack) {
      const rsReplacer = slide.querySelector('[data-replaces-right-stack]');
      if (rsReplacer) {
        rightStack.classList.toggle('hidden', rsReplacer.classList.contains('shown'));
      }
    }
    const temples = slide.querySelector('.temples-stage');
    if (temples) {
      const replacers = slide.querySelectorAll('[data-replaces-temples]');
      const anyShown = [...replacers].some(el => el.classList.contains('shown'));
      temples.classList.toggle('hidden', anyShown);
    }
    const portraitCollage = slide.querySelector('.portrait-collage-stage');
    if (portraitCollage) {
      const replacers = slide.querySelectorAll('[data-replaces-portrait-collage]');
      const anyShown = [...replacers].some(el => el.classList.contains('shown'));
      portraitCollage.classList.toggle('hidden', anyShown);
    }
    // Remake-table language reveal + fly-then-settle logic
    if (slide.classList.contains('remake-table')) {
      // Each .rt-fly card has a .rt-settle r-step inside it. When that marker
      // is shown, mark the card as .settled so it drops into its grid slot.
      slide.querySelectorAll('.rt-card.rt-fly').forEach(card => {
        const settle = card.querySelector('.rt-settle');
        card.classList.toggle('settled', settle && settle.classList.contains('shown'));
      });
      const trigger = slide.querySelector('.rt-lang-trigger');
      if (trigger) {
        slide.classList.toggle('langs-shown', trigger.classList.contains('shown'));
        slide.querySelectorAll('.rt-card[data-lang-color]').forEach(card => {
          card.style.setProperty('--lang-color', card.dataset.langColor);
        });
      }
    }
  }
  function resetReveals(slide) {
    slide.querySelectorAll('.r-step').forEach(el => el.classList.remove('shown'));
    slide.classList.remove('split');
    applyStripeState(slide);
  }
  function showAllReveals(slide) {
    slide.querySelectorAll('.r-step').forEach(el => el.classList.add('shown'));
    if (slide.dataset.wall !== undefined) slide.classList.add('split');
    applyStripeState(slide);
  }
  function nextRStep(slide) {
    if (slide.dataset.wall !== undefined && !slide.classList.contains('split')) {
      slide.querySelectorAll('.col .tile').forEach((el, i) => {
        el.style.transitionDelay = (i * 12) + 'ms';
      });
      slide.classList.add('split');
      return true;
    }
    const steps = slide.querySelectorAll('.r-step');
    for (const el of steps) {
      if (!el.classList.contains('shown')) {
        el.classList.add('shown');
        applyStripeState(slide);
        return true;
      }
    }
    return false;
  }
  function prevRStep(slide) {
    if (slide.dataset.wall !== undefined && slide.classList.contains('split')) {
      slide.classList.remove('split');
      return true;
    }
    const steps = [...slide.querySelectorAll('.r-step')];
    for (let k = steps.length - 1; k >= 0; k--) {
      if (steps[k].classList.contains('shown')) {
        steps[k].classList.remove('shown');
        applyStripeState(slide);
        return true;
      }
    }
    return false;
  }

  const navCounter = document.getElementById('navCounter');
  function updateCounter() {
    if (navCounter) navCounter.textContent = `${i + 1} / ${slides.length}`;
  }
  function show(n) {
    slides[i].classList.remove('active');
    i = (n + slides.length) % slides.length;
    slides[i].classList.add('active');
    resetReveals(slides[i]);
    updateCounter();
    try { sessionStorage.setItem('vc-slide-idx', String(i)); } catch (_) {}
  }

  // Restore last-viewed slide if the tab was reloaded (browser can discard
  // backgrounded tabs, which would otherwise dump the user back on the title).
  try {
    const saved = parseInt(sessionStorage.getItem('vc-slide-idx'), 10);
    if (!isNaN(saved) && saved > 0 && saved < slides.length) {
      slides[0].classList.remove('active');
      i = saved;
      slides[i].classList.add('active');
    }
  } catch (_) {}
  updateCounter();
  document.getElementById('navPrev').addEventListener('click', prev);
  document.getElementById('navNext').addEventListener('click', next);
  function next() {
    const slide = slides[i];
    if ((slide.dataset.reveal !== undefined || slide.dataset.wall !== undefined) && nextRStep(slide)) return;
    show(i + 1);
  }
  function prev() {
    const slide = slides[i];
    if ((slide.dataset.reveal !== undefined || slide.dataset.wall !== undefined) && prevRStep(slide)) return;
    show(i - 1);
    const newSlide = slides[i];
    if (newSlide.dataset.reveal !== undefined || newSlide.dataset.wall !== undefined) showAllReveals(newSlide);
  }
  // Expose so the speaker view (notes.html) can drive the deck directly via
  // window.opener when BroadcastChannel/localStorage don't cross file:// windows.
  window.deckNext = next;
  window.deckPrev = prev;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') next();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'Home') show(0);
    if (e.key === 'End') show(slides.length - 1);
  });

  // Speaker-notes hook (fully isolated — never touches nav functions).
  try {
    (function setupNotesHook() {
      if (!('BroadcastChannel' in window)) return;
      const bc = new BroadcastChannel('vc-bollywood-notes');
      const decks = document.querySelectorAll('.slide');
      const isPreview = /[#&]r=/.test(location.hash);

      // If the URL says "jump to slide N", do that (used by notes-view iframes).
      // Optional "s=K" reveals only the first K r-steps (defaults to all).
      const m = location.hash.match(/p=(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n >= 0 && n < decks.length) {
          decks.forEach(s => s.classList.remove('active'));
          decks[n].classList.add('active');
          const stepMatch = location.hash.match(/s=(\d+)/);
          const steps = decks[n].querySelectorAll('.r-step');
          const limit = stepMatch ? parseInt(stepMatch[1], 10) : steps.length;
          steps.forEach((el, i) => {
            if (i < limit) el.classList.add('shown');
            else el.classList.remove('shown');
          });
        }
      }

      function currentIndex() {
        for (let k = 0; k < decks.length; k++) {
          if (decks[k].classList.contains('active')) return k;
        }
        return 0;
      }
      function notesForSlide(slide) {
        const raw = slide.getAttribute('data-notes') || '';
        if (!raw.includes('|||')) return raw;
        // Segments are separated by "|||" and may specify a threshold with "|||@N".
        // A segment activates when shownCount >= its threshold. Segment 0 defaults
        // to threshold 0; subsequent segments default to their 1-based index.
        const rawParts = raw.split(/\|\|\|(@\d+)?/);
        const segments = [];
        for (let k = 0; k < rawParts.length; k++) {
          const chunk = rawParts[k];
          if (chunk == null) continue;
          if (/^@\d+$/.test(chunk)) {
            const t = parseInt(chunk.slice(1), 10);
            if (segments.length) segments[segments.length - 1].threshold = t;
            continue;
          }
          segments.push({ threshold: segments.length, text: chunk.trim() });
        }
        const shownCount = slide.querySelectorAll('.r-step.shown').length;
        let picked = segments[0];
        for (const seg of segments) {
          if (shownCount >= seg.threshold) picked = seg;
        }
        return picked ? picked.text : '';
      }
      function broadcast() {
        if (isPreview) return;
        const idx = currentIndex();
        const shownCount = decks[idx].querySelectorAll('.r-step.shown').length;
        const payload = {
          type: 'state',
          index: idx,
          step: shownCount,
          total: decks.length,
          notes: notesForSlide(decks[idx])
        };
        console.log('[deck] broadcast idx=', idx, 'step=', shownCount, 'notesLen=', payload.notes.length);
        try { bc.postMessage(payload); } catch (_) {}
        try {
          localStorage.setItem('vc-state', JSON.stringify({ ...payload, t: Date.now() }));
        } catch (_) {}
      }
      const mo = new MutationObserver(broadcast);
      decks.forEach(s => {
        mo.observe(s, { attributes: true, attributeFilter: ['class'], subtree: true });
      });

      function doNav(dir) {
        console.log('[deck] doNav', dir, 'isPreview?', isPreview);
        const fn = dir === 'next' ? window.deckNext : window.deckPrev;
        if (typeof fn === 'function') {
          console.log('[deck] calling deckNext/Prev, current active idx=', currentIndex());
          fn();
          console.log('[deck] after nav, active idx=', currentIndex());
        } else {
          console.log('[deck] no deckNext/deckPrev fn');
        }
        setTimeout(broadcast, 0);
      }

      bc.addEventListener('message', (ev) => {
        if (!ev.data || isPreview) return;
        if (ev.data.type === 'poll') broadcast();
        if (ev.data.type === 'nav') doNav(ev.data.dir);
      });

      // Listen for nav requests from the speaker view when it has no opener
      // reference (e.g. it was opened by pasting the URL, not via S).
      if (!isPreview) {
        window.addEventListener('storage', (ev) => {
          if (ev.key !== 'vc-nav' || !ev.newValue) return;
          doNav(ev.newValue.split(':')[0]);
        });
      }

      document.addEventListener('keydown', (e) => {
        if ((e.key === 's' || e.key === 'S') && !isPreview) {
          window.open('notes.html', 'vc-notes', 'width=1100,height=700');
        }
      });

      setTimeout(broadcast, 60);
    })();
  } catch (_) {}

  // ============== LATA VIDEO — trim last 2s from loop ==============
  (function trimLataVideo() {
    const v = document.querySelector('.slide.hall-of-fame .hof-lata video');
    if (!v) return;
    const TRIM = 2; // seconds to cut from the end
    v.addEventListener('timeupdate', () => {
      if (v.duration && v.currentTime >= v.duration - TRIM) {
        v.currentTime = 0;
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    });
  })();

  // ============== HOW-TITLE — Lata word-occurrence bar chart ==============
  (function renderLataWordChart() {
    const root = document.getElementById('lataWordChart');
    if (!root) return;
    const data = [
      { word: 'aaja',    n: 60 },
      { word: 'jhalak',  n: 20 },
      { word: 'dikhla',  n: 20 },
      { word: 'jaa',     n: 20 },
      { word: 'ek',      n: 15 },
      { word: 'baar',    n: 15 },
      { word: 'aa',      n: 15 },
      { word: 'ja',      n: 15 },
      { word: 'na',      n: 8 },
      { word: 'ko',      n: 4 },
      { word: 'main',    n: 4 },
      { word: 'teri',    n: 3 },
      { word: 'hoon',    n: 3 },
    ];
    const max = Math.max(...data.map(d => d.n));
    root.innerHTML = '';
    data.forEach(d => {
      const row = document.createElement('div');
      row.className = 'lwc-row';
      const label = document.createElement('div');
      label.className = 'lwc-label';
      label.textContent = d.word;
      const track = document.createElement('div');
      track.className = 'lwc-bar-track';
      const bar = document.createElement('div');
      bar.className = 'lwc-bar';
      bar.style.width = ((d.n / max) * 100) + '%';
      track.appendChild(bar);
      const value = document.createElement('div');
      value.className = 'lwc-value';
      value.textContent = d.n;
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(value);
      root.appendChild(row);
    });
  })();

  // ============== KONTI STORY VIDEO — skip first 4s and loop from 4s ==============
  (function trimKontiVideo() {
    const v = document.querySelector('.slide.konti-video video');
    if (!v) return;
    const START = 4; // seconds to skip from the start
    function seekStart() {
      try { v.currentTime = START; } catch (_) {}
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    v.addEventListener('loadedmetadata', seekStart);
    v.addEventListener('ended', seekStart);
    // Also handle browsers that loop natively — force back to START when we sense a rewind past it
    v.addEventListener('timeupdate', () => {
      if (v.currentTime < START - 0.05) seekStart();
    });
    if (v.readyState >= 1) seekStart();
  })();

  // ============== VIDEOS RESTART ON SLIDE ACTIVATION ==============
  // Videos should not be midway when their slide loads — restart each video
  // from its intended start point every time its slide becomes .active.
  (function restartVideosOnActivate() {
    // Map each video to its start offset (seconds). Konti skips the first 4s.
    const videoStarts = [
      { sel: '.slide.hall-of-fame .hof-lata video', start: 0 },
      { sel: '.slide.konti-video video',            start: 4 },
    ];
    // Also cover the SRK birthday video and any other inline videos with start 0.
    document.querySelectorAll('video').forEach(v => {
      if (!videoStarts.some(x => v.matches(x.sel))) {
        videoStarts.push({ sel: null, node: v, start: 0 });
      }
    });

    function bindSlide(v, start) {
      const slide = v.closest('.slide');
      if (!slide) return;
      function restart() {
        if (!slide.classList.contains('active')) return;
        try { v.currentTime = start; } catch (_) {}
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      const obs = new MutationObserver(() => {
        if (slide.classList.contains('active')) restart();
      });
      obs.observe(slide, { attributes: true, attributeFilter: ['class'] });
      // Also handle the initial load if the slide is already active
      if (slide.classList.contains('active')) restart();
    }

    videoStarts.forEach(entry => {
      const v = entry.node || document.querySelector(entry.sel);
      if (v) bindSlide(v, entry.start);
    });
  })();

  // ============== STREAMGRAPH SLIDE ==============
  (function setupStreamgraph() {
    const slide = document.getElementById('streamgraphSlide');
    if (!slide || typeof FILMS === 'undefined' || typeof d3 === 'undefined') return;

    // Normalize legacy label
    FILMS.forEach(f => { if (f.l === 'Hinglish/Anglicised') f.l = 'Hinglish'; });

    // Palette uses the deck's accent2 blue family for Urdu, warm yellows for Hindi/Hinglish, neutral slate for English
    const palette = {
      'Hindi':    'rgb(232, 163, 61)',
      'Urdu':     'rgb(17, 93, 131)',
      'Hinglish': 'rgb(247, 216, 106)',
      'English':  '#2a2a2a'
    };
    const wordColor = {
      'Hindi':    '#8a5b14',
      'Urdu':     'rgb(17, 93, 131)',
      'Hinglish': '#7a6420',
      'English':  '#1a1a1a'
    };
    // Visual top→bottom: Urdu, Hindi, Hinglish, English  ⇒  stack array (bottom→top) is reversed
    const stackOrder = ['English', 'Hinglish', 'Hindi', 'Urdu'];

    const yMin = 1950, yMax = 2024;
    const years = d3.range(yMin, yMax + 1);

    // raw counts per year
    const raw = years.map(y => {
      const r = { year: y };
      stackOrder.forEach(l => r[l] = 0);
      return r;
    });
    FILMS.forEach(f => {
      const idx = f.y - yMin;
      if (idx >= 0 && idx < raw.length && raw[idx][f.l] != null) raw[idx][f.l]++;
    });
    const smoothed = raw.map((d, i) => {
      const w = 2, lo = Math.max(0, i - w), hi = Math.min(raw.length - 1, i + w);
      const out = { year: d.year };
      stackOrder.forEach(l => {
        let s = 0, n = 0;
        for (let j = lo; j <= hi; j++) { s += raw[j][l]; n++; }
        out[l] = s / n;
      });
      return out;
    });

    const filmsByLang = {};
    stackOrder.forEach(l => filmsByLang[l] = []);
    FILMS.forEach(f => { if (filmsByLang[f.l]) filmsByLang[f.l].push(f); });

    const svgSel = d3.select('#sgChart');
    let W, H, margin, innerW, innerH, xScale, yScale, layers;
    let layerPaths, layerLabels, measureNode;
    let built = false;
    let measureCache = new Map();
    let wordPlacementsCache = null;   // { key, layers: [{lang, fill, placed}] }
    let iconicSetCache = null;

    function measure() {
      const stage = slide.querySelector('.sg-stage');
      const r = stage.getBoundingClientRect();
      W = Math.max(800, r.width);
      H = Math.max(420, r.height);
      margin = { top: 38, right: 0, bottom: 12, left: 0 };
      innerW = W - margin.left - margin.right;
      innerH = H - margin.top - margin.bottom;
      svgSel.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');
    }
    function measureText(str, fs, fw) {
      const key = `${str}|${fs}|${fw || 700}`;
      const hit = measureCache.get(key);
      if (hit !== undefined) return hit;
      if (!measureNode) {
        measureNode = svgSel.append('text')
          .style('visibility', 'hidden')
          .attr('font-family', '"Benguiat", serif');
      }
      measureNode.attr('font-size', fs).attr('font-weight', fw || 700).text(str);
      const w = measureNode.node().getComputedTextLength();
      measureCache.set(key, w);
      return w;
    }
    function buildLayers() {
      xScale = d3.scaleLinear().domain([yMin, yMax]).range([margin.left, margin.left + innerW]);
      const stk = d3.stack()
        .keys(stackOrder)
        .order(d3.stackOrderNone)
        .offset(d3.stackOffsetWiggle);
      layers = stk(smoothed);
      const yLo = d3.min(layers, l => d3.min(l, d => d[0]));
      const yHi = d3.max(layers, l => d3.max(l, d => d[1]));
      const pad = (yHi - yLo) * 0.04;
      yScale = d3.scaleLinear()
        .domain([yLo - pad, yHi + pad])
        .range([margin.top + innerH, margin.top]);
    }
    const areaGen = () => d3.area()
      .x(d => xScale(d.data.year))
      .y0(d => yScale(d[0]))
      .y1(d => yScale(d[1]))
      .curve(d3.curveBasis);

    function renderAxis() {
      svgSel.selectAll('.sg-axis').remove();
      const axis = svgSel.append('g').attr('class', 'sg-axis')
        .attr('transform', `translate(0,${margin.top - 6})`);
      d3.range(1960, 2025, 10).forEach(y => {
        axis.append('text')
          .attr('x', xScale(y)).attr('y', 0)
          .attr('text-anchor', 'middle')
          .text(y);
      });
    }
    function renderEventLine(delayMs) {
      svgSel.selectAll('.sg-event').remove();
      const g = svgSel.append('g').attr('class', 'sg-event').style('opacity', 0);
      const x = xScale(1991);
      const yTop = margin.top;
      const yBot = margin.top + innerH;

      g.append('line')
        .attr('class', 'sg-event-line')
        .attr('x1', x).attr('x2', x)
        .attr('y1', yTop).attr('y2', yBot);

      // top cap dot
      g.append('circle')
        .attr('class', 'sg-event-dot')
        .attr('cx', x).attr('cy', yTop)
        .attr('r', 3.5);

      // two-line label sitting to the right of the line, near the top
      const labelX = x + 10;
      const labelYear = g.append('text')
        .attr('class', 'sg-event-year')
        .attr('x', labelX)
        .attr('y', yTop + 22)
        .attr('text-anchor', 'start')
        .text('1991');
      g.append('text')
        .attr('class', 'sg-event-label')
        .attr('x', labelX)
        .attr('y', yTop + 40)
        .attr('text-anchor', 'start')
        .text('Economic liberalisation');

      // animated line draw
      const lineLen = yBot - yTop;
      g.select('.sg-event-line')
        .attr('stroke-dasharray', `${lineLen} ${lineLen}`)
        .attr('stroke-dashoffset', lineLen);

      g.style('opacity', 1);
      g.select('.sg-event-line')
        .transition()
        .delay(delayMs || 0)
        .duration(700)
        .ease(d3.easeCubicOut)
        .attr('stroke-dashoffset', 0);
      g.select('.sg-event-dot')
        .style('opacity', 0)
        .transition()
        .delay((delayMs || 0) + 550)
        .duration(260)
        .style('opacity', 1);
      g.selectAll('.sg-event-year, .sg-event-label')
        .style('opacity', 0)
        .transition()
        .delay((delayMs || 0) + 400)
        .duration(500)
        .style('opacity', 1);
    }

    function renderStream() {
      svgSel.selectAll('.sg-stream, .sg-event, defs').remove();

      // Per-layer clip paths so each stream rolls in independently
      const defs = svgSel.append('defs');
      layers.forEach((_, idx) => {
        defs.append('clipPath').attr('id', `sg-clip-${idx}`)
          .append('rect').attr('class', `sg-clip-rect-${idx}`)
          .attr('x', margin.left).attr('y', 0)
          .attr('width', 0).attr('height', H);
      });

      const g = svgSel.append('g').attr('class', 'sg-stream');
      const area = areaGen();

      layerPaths = g.selectAll('path.sg-path')
        .data(layers)
        .join('path')
          .attr('class', 'sg-path')
          .attr('d', area)
          .attr('fill', d => palette[d.key])
          .attr('stroke', '#f8f8f8')
          .attr('stroke-width', 2.2)
          .attr('clip-path', (_, idx) => `url(#sg-clip-${idx})`);

      // Animate each layer's clip — Urdu rolls in first, then Hindi, Hinglish, English
      const rollOrder = ['Urdu', 'Hindi', 'Hinglish', 'English'];
      layers.forEach((layer, idx) => {
        const orderPos = rollOrder.indexOf(layer.key);
        svgSel.select(`.sg-clip-rect-${idx}`)
          .transition()
          .delay(orderPos * 220)
          .duration(1500)
          .ease(d3.easeCubicOut)
          .attr('width', innerW);
      });

      renderEventLine(rollOrder.length * 220 + 1500);

      layerLabels = g.selectAll('g.sg-label-g')
        .data(layers).join('g').attr('class', 'sg-label-g');
      // small per-language x-offset (years) + y-offset (fraction of band thickness)
      const labelYearOffset = {
        'Hindi':    0,
        'Urdu':     0,
        'Hinglish': -4,   // nudge slightly left
        'English':   4    // nudge slightly right
      };
      const labelYOffsetFrac = {
        'Hindi':    0,
        'Urdu':     0,
        'Hinglish': -0.22,  // slightly above midline so it fits in the band
        'English':  0
      };
      // Hinglish label needs dark text against yellow; others stay white
      const labelFill = {
        'Hindi':    '#ffffff',
        'Urdu':     '#ffffff',
        'Hinglish': '#5a5a5a',
        'English':  '#ffffff'
      };
      layerLabels.each(function(layer) {
        const sel = d3.select(this);
        let maxThick = -Infinity, maxIdx = 0;
        layer.forEach((d, i) => {
          const t = d[1] - d[0];
          if (t > maxThick) { maxThick = t; maxIdx = i; }
        });
        const d = layer[maxIdx];
        const offsetYears = labelYearOffset[layer.key] || 0;
        const labelYear = Math.max(yMin + 4, Math.min(yMax - 4, d.data.year + offsetYears));
        const cx = xScale(labelYear);
        const thickPx = yScale(d[0]) - yScale(d[1]);
        const cy = (yScale(d[0]) + yScale(d[1])) / 2 + thickPx * (labelYOffsetFrac[layer.key] || 0);
        let fs = Math.max(13, Math.min(42, thickPx * 0.36));
        const txt = layer.key.toUpperCase();
        const budget = (xScale(yMin + 18) - xScale(yMin));
        while (measureText(txt, fs, 700) > budget && fs > 11) fs -= 1;
        sel.append('text')
          .attr('class', 'sg-layer-label')
          .attr('x', cx).attr('y', cy + fs * 0.34)
          .attr('text-anchor', 'middle')
          .attr('font-size', fs)
          .attr('fill', labelFill[layer.key])
          .text(txt);
      });
    }

    // Rectangle-collision word-cloud packing inside each stream's shape.
    // Walk left → right and place words into the leftmost free row at each x,
    // using a per-pixel-column "top of free space" array per row (a skyline).
    // After the chronological pass, run a fill pass to plug remaining gaps with
    // bigger versions of representative titles.
    const WORD_FILL = {
      'Hindi':    'rgb(232, 163, 61)',
      'Urdu':     'rgb(17, 93, 131)',
      'Hinglish': 'rgb(196, 161, 50)',
      'English':  '#2a2a2a'
    };

    function computeWordPlacements() {
      const out = [];
      layers.forEach((layer, layerIdx) => {
        const lang = layer.key;
        const fill = WORD_FILL[lang];

        const yTopAt = d3.scaleLinear()
          .domain(layer.map(d => xScale(d.data.year)))
          .range(layer.map(d => yScale(d[1])))
          .clamp(true);
        const yBotAt = d3.scaleLinear()
          .domain(layer.map(d => xScale(d.data.year)))
          .range(layer.map(d => yScale(d[0])))
          .clamp(true);

        const xLeft = Math.ceil(xScale(yMin) + 3);
        const xRight = Math.floor(xScale(yMax) - 3);
        const widthPx = xRight - xLeft;

        // Skyline: for each integer x in [xLeft, xRight], floor[x] = current top of free space,
        // ceil[x] = bottom edge of the band at x. We place words downward from floor.
        const colWidth = 2;  // resolution in px; 1 is precise but slower
        const nCols = Math.ceil(widthPx / colWidth);
        const floor = new Float32Array(nCols);
        const ceil  = new Float32Array(nCols);
        for (let c = 0; c < nCols; c++) {
          const x = xLeft + c * colWidth;
          floor[c] = yTopAt(x) + 2;   // tiny inset so words don't touch the outline
          ceil[c]  = yBotAt(x) - 2;
        }

        const films = filmsByLang[lang].slice().sort((a, b) => a.y - b.y || a.t.localeCompare(b.t));
        if (!films.length) return;

        const avgThick = d3.mean(layer, d => yScale(d[0]) - yScale(d[1]));
        // base size scales with band thickness
        const baseSize = Math.max(8, Math.min(20, Math.round(avgThick * 0.13)));

        // Curated iconic titles — rendered at the largest size in their language.
        const iconic = new Set([
          // hindi
          'dil','aankhen','sholay','sangam','agneepath','khalnayak','baazigar','darr',
          'kaho naa... pyaar hai','lagaan','devdas','swades','rang de basanti','dangal',
          'pk','padmaavat','gangubai kathiawadi','dilwale dulhania le jayenge',
          'kuch kuch hota hai','om shanti om','jodhaa akbar','bajirao mastani','dabangg',
          'krrish','bharat',
          // urdu
          'mughal-e-azam','pakeezah','awaara','ishq','mohabbatein','deewana',
          'pathaan','jawan','sultan','raees','baaghi','aashiqui','shaitaan','zindagi na milegi dobara',
          'jab tak hai jaan','kabhi alvida naa kehna','muqaddar ka sikandar',
          // english — recognizable, era-defining titles only
          'my name is khan','i hate luv storys','3 idiots','animal','rockstar',
          'the dirty picture','2 states','happy new year','wanted','bodyguard','race',
          // hinglish — anglicised mix titles
          'namastey london','chak de! india','rocky aur rani kii prem kahaani','singh is kinng',
          'singham','dunki','love aaj kal','ek tha tiger','tiger zinda hai',
          'kabhi khushi kabhie gham...','jab harry met sejal'
        ].map(s => s.toLowerCase()));

        const isIconic = f => iconic.has(f.t.toLowerCase());

        // Hero tier — even bigger than iconic. These are the marquee titles per language.
        const hero = new Set([
          'my name is khan',
          'i hate luv storys',
          'namastey london',
          'kuch kuch hota hai',
          'dilwale dulhania le jayenge',
          'pathaan',
          'jawan',
          'sholay',
          'dangal'
        ]);
        const isHero = f => hero.has(f.t.toLowerCase());

        // tier multipliers — per-title overrides for the very biggest titles
        const heroXL = new Set(['my name is khan', 'i hate luv storys']);

        const sizeFor = (f, i) => {
          const key = f.t.toLowerCase();
          if (heroXL.has(key))   return Math.round(baseSize * 5.4);  // XL marquee
          if (isHero(f))         return Math.round(baseSize * 3.0);  // marquee
          if (isIconic(f))       return Math.round(baseSize * 2.2);  // big
          const r = (i * 37) % 100;
          if (r < 8)  return Math.round(baseSize * 1.6);
          if (r < 32) return Math.round(baseSize * 1.22);
          if (r < 78) return baseSize;
          return Math.max(7, Math.round(baseSize * 0.78));
        };
        // very rare vertical orientation — only a few short titles, only if non-iconic
        const isVertical = (f, i) => !isIconic(f) && f.t.length <= 8 && ((i * 53) % 100) < 4;

        const gapY = 2;

        // Try to place a word starting from a given column index, scanning right.
        // Returns { col, top } where the word fits, or null.
        function findSlotHorizontal(wPx, fs, startCol) {
          const colsNeeded = Math.ceil(wPx / colWidth);
          for (let c = startCol; c <= nCols - colsNeeded; c++) {
            // max floor across these columns = top of word's bounding box
            let maxFloor = -Infinity, minCeil = Infinity;
            for (let k = 0; k < colsNeeded; k++) {
              if (floor[c + k] > maxFloor) maxFloor = floor[c + k];
              if (ceil[c + k] < minCeil) minCeil = ceil[c + k];
            }
            if (maxFloor + fs <= minCeil) {
              return { col: c, top: maxFloor, colsNeeded };
            }
          }
          return null;
        }
        function findSlotVertical(hPx, fs, startCol) {
          const colsNeeded = Math.ceil(fs / colWidth);
          for (let c = startCol; c <= nCols - colsNeeded; c++) {
            let maxFloor = -Infinity, minCeil = Infinity;
            for (let k = 0; k < colsNeeded; k++) {
              if (floor[c + k] > maxFloor) maxFloor = floor[c + k];
              if (ceil[c + k] < minCeil) minCeil = ceil[c + k];
            }
            if (maxFloor + hPx <= minCeil) {
              return { col: c, top: maxFloor, colsNeeded };
            }
          }
          return null;
        }
        function commitSlot(col, colsNeeded, top, hPx) {
          for (let k = 0; k < colsNeeded; k++) {
            floor[col + k] = top + hPx + gapY;
          }
        }

        const placed = [];
        const dropped = [];

        // Pass 1: chronological placement — each film constrained to a window around its release year
        // ±4 years initial window so films stay roughly in their era after jitter.
        const yearWindowYears = 4;
        const windowSpanCols = Math.round((xScale(yMin + yearWindowYears) - xScale(yMin)) / colWidth);

        films.forEach((f, i) => {
          let fs = sizeFor(f, i);
          let vertical = isVertical(f, i) && f.t.length <= 10;

          // ideal column = where this film's year sits on the x-axis
          const idealX = xScale(f.y);
          const idealCol = Math.max(0, Math.min(nCols - 1, Math.round((idealX - xLeft) / colWidth)));
          const startCol = Math.max(0, idealCol - windowSpanCols);
          const endCol = Math.min(nCols, idealCol + windowSpanCols);

          // Try slot within window first; if not found, widen progressively
          function trySearch(sCol, eCol, vert) {
            if (vert) {
              const hPx = measureText(f.t, fs, 700);
              const colsNeeded = Math.ceil(fs / colWidth);
              for (let c = sCol; c <= eCol - colsNeeded; c++) {
                let maxFloor = -Infinity, minCeil = Infinity;
                for (let k = 0; k < colsNeeded; k++) {
                  if (floor[c+k] > maxFloor) maxFloor = floor[c+k];
                  if (ceil[c+k] < minCeil) minCeil = ceil[c+k];
                }
                if (maxFloor + hPx <= minCeil) return { col: c, top: maxFloor, colsNeeded, hPx };
              }
              return null;
            } else {
              const wPx = measureText(f.t, fs, 700);
              const colsNeeded = Math.ceil(wPx / colWidth);
              for (let c = sCol; c <= eCol - colsNeeded; c++) {
                let maxFloor = -Infinity, minCeil = Infinity;
                for (let k = 0; k < colsNeeded; k++) {
                  if (floor[c+k] > maxFloor) maxFloor = floor[c+k];
                  if (ceil[c+k] < minCeil) minCeil = ceil[c+k];
                }
                if (maxFloor + fs <= minCeil) return { col: c, top: maxFloor, colsNeeded, wPx };
              }
              return null;
            }
          }

          // try vertical first if marked
          if (vertical) {
            const slot = trySearch(startCol, endCol, true);
            if (slot) {
              const cxPx = xLeft + (slot.col + slot.colsNeeded / 2) * colWidth;
              const cyPx = slot.top + slot.hPx / 2;
              placed.push({ f, fs, cx: cxPx, cy: cyPx, vertical: true });
              commitSlot(slot.col, slot.colsNeeded, slot.top, slot.hPx);
              return;
            }
            vertical = false;
          }

          // horizontal search — within year window, shrink fs if needed
          let slot = trySearch(startCol, endCol, false);
          while (!slot && fs > 8) {
            fs -= 1;
            slot = trySearch(startCol, endCol, false);
          }
          // widen window slightly (decade-ish) if still no fit, but never cross eras
          if (!slot) {
            const wider = Math.round(windowSpanCols * 1.5);  // ~6 years either way
            const sCol2 = Math.max(0, idealCol - wider);
            const eCol2 = Math.min(nCols, idealCol + wider);
            fs = sizeFor(f, i);
            slot = trySearch(sCol2, eCol2, false);
            while (!slot && fs > 7) {
              fs -= 1;
              slot = trySearch(sCol2, eCol2, false);
            }
          }
          // do NOT place vertically as a fallback; drop instead so chronology stays honest
          if (!slot) { dropped.push(f); return; }

          const cxPx = xLeft + (slot.col + slot.colsNeeded / 2) * colWidth;
          const cyPx = slot.top + fs / 2;
          placed.push({ f, fs, cx: cxPx, cy: cyPx, vertical: false });
          commitSlot(slot.col, slot.colsNeeded, slot.top, fs);
        });

        // Pass 2: fill remaining whitespace with films FROM THAT GAP'S ERA so chronology stays honest.
        // For each gap, pick a film whose year matches the gap's x-position.
        const minFillerSize = 7;
        const eraFilms = new Map();   // year -> list of films from that year
        films.forEach(f => {
          if (!eraFilms.has(f.y)) eraFilms.set(f.y, []);
          eraFilms.get(f.y).push(f);
        });
        // for each x, the "year at that x"
        function yearAtCol(col) {
          const x = xLeft + col * colWidth;
          return Math.round(xScale.invert(x));
        }
        function pickEraFiller(centerCol) {
          const yr = yearAtCol(centerCol);
          // try the year ±3 years
          for (let span = 0; span <= 3; span++) {
            for (const off of [0, -span, span]) {
              const y = yr + off;
              const list = eraFilms.get(y);
              if (list && list.length) {
                // pick the shortest title in that era as filler
                const sorted = list.slice().sort((a, b) => a.t.length - b.t.length);
                return sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
              }
            }
          }
          return null;
        }

        for (let pass = 0; pass < 200; pass++) {
          // find the largest remaining gap (by area)
          let bestCol = -1, bestWidth = 0, bestSlack = 0;
          let c = 0;
          while (c < nCols) {
            const slackC = ceil[c] - floor[c];
            if (slackC < minFillerSize + 2) { c++; continue; }
            let runEnd = c + 1;
            let minSlack = slackC;
            while (runEnd < nCols) {
              const s = ceil[runEnd] - floor[runEnd];
              if (s < minFillerSize + 2) break;
              if (s < slackC * 0.5) break;
              if (s < minSlack) minSlack = s;
              runEnd++;
            }
            const runWidth = (runEnd - c) * colWidth;
            const area = minSlack * runWidth;
            if (area > bestSlack * bestWidth && runWidth > minFillerSize * 2.5) {
              bestCol = c; bestWidth = runWidth; bestSlack = minSlack;
            }
            c = runEnd;
          }
          if (bestCol < 0) break;

          // pick a filler from this gap's ERA, not anywhere in the dataset
          const centerCol = bestCol + Math.floor(bestWidth / (2 * colWidth));
          const filler = pickEraFiller(centerCol);
          if (!filler) {
            // no film from that era — better to leave gap than misplace
            // close this gap by raising its floor so the loop moves on
            for (let k = 0; k < Math.floor(bestWidth / colWidth); k++) floor[bestCol + k] = ceil[bestCol + k];
            continue;
          }

          let fs = Math.min(Math.floor(bestSlack * 0.82), Math.floor(bestWidth * 0.22));
          fs = Math.max(minFillerSize, Math.min(fs, Math.round(baseSize * 1.6)));
          let wPx = measureText(filler.t, fs, 700);
          while (wPx > bestWidth && fs > minFillerSize) {
            fs -= 1;
            wPx = measureText(filler.t, fs, 700);
          }
          if (wPx > bestWidth) {
            // can't fit this era's filler — close the gap
            for (let k = 0; k < Math.floor(bestWidth / colWidth); k++) floor[bestCol + k] = ceil[bestCol + k];
            continue;
          }
          const slot = findSlotHorizontal(wPx, fs, bestCol);
          if (!slot) continue;
          const cxPx = xLeft + (slot.col + slot.colsNeeded / 2) * colWidth;
          const cyPx = slot.top + fs / 2;
          placed.push({ f: filler, fs, cx: cxPx, cy: cyPx, vertical: false, filler: true });
          commitSlot(slot.col, slot.colsNeeded, slot.top, fs);
        }

        // diagnostic — count placed vs dropped
        const realPlaced = placed.filter(p => !p.filler).length;
        console.log(`[${lang}] films: ${films.length}, placed: ${realPlaced}, dropped: ${dropped.length}, fillers: ${placed.length - realPlaced}`);
        if (dropped.length) console.log(`[${lang}] dropped:`, dropped.map(f => `${f.t} (${f.y})`).join(', '));

        // freeze precomputed positions (with jitter) and iconic flag so paint is DOM-only work
        const frozen = placed.map((p, i) => {
          const seed = (p.f.y * 11 + i * 17 + (p.f.t.length * 3)) % 1000;
          const jx = ((seed * 0.13) % 2.4) - 1.2;
          const jy = (((seed * 0.27) % 3) - 1.5);
          return {
            t: p.f.t,
            fs: p.fs,
            cx: p.cx + jx,
            cy: p.cy + jy,
            vertical: !!p.vertical,
            filler: !!p.filler,
            iconic: iconic.has(p.f.t.toLowerCase())
          };
        });
        out.push({ lang, layerIdx, fill, placed: frozen });
      });
      return out;
    }

    function renderWords() {
      svgSel.selectAll('.sg-words').remove();
      const g = svgSel.append('g').attr('class', 'sg-words');

      const key = `${Math.round(W)}x${Math.round(H)}`;
      if (!wordPlacementsCache || wordPlacementsCache.key !== key) {
        wordPlacementsCache = { key, layers: computeWordPlacements() };
      }

      wordPlacementsCache.layers.forEach(({ layerIdx, fill, placed }) => {
        placed.forEach((p, i) => {
          const node = g.append('text')
            .attr('class', 'sg-word')
            .attr('x', p.cx)
            .attr('y', p.cy)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', p.fs)
            .attr('font-weight', p.iconic ? 700 : 600)
            .attr('letter-spacing', '0.005em')
            .attr('fill', fill)
            .style('opacity', 0)
            .text(p.t);
          if (p.vertical) {
            node.attr('transform', `rotate(-90, ${p.cx}, ${p.cy})`);
          }
          node.transition()
            .duration(220)
            .delay(layerIdx * 20 + i * 0.6)
            .style('opacity', p.filler ? 0.75 : 0.97);
        });
      });
    }

    function build() {
      measure();
      buildLayers();
      renderAxis();
      renderStream();
      built = true;
    }
    function dissolveToWords() {
      // Always rebuild so layers/scales reflect the current stage size,
      // otherwise word placement can be based on a stale (initial hidden) measure.
      svgSel.selectAll('*').remove();
      measureNode = null;
      build();
      // Snap clips wide-open — no wipe animation during dissolve
      svgSel.selectAll('[class^="sg-clip-rect-"]').interrupt().attr('width', innerW);
      slide.classList.add('dissolved');
      if (layerLabels) layerLabels.transition('lbl').duration(180).style('opacity', 0);
      layerPaths.interrupt('stream');
      layerPaths
        .transition('stream')
        .duration(450)
        .ease(d3.easeCubicInOut)
        .attr('fill-opacity', 0)
        .attr('stroke', d => palette[d.key])
        .attr('stroke-width', 1.6)
        .attr('stroke-opacity', 0.9);
      svgSel.selectAll('.sg-event').interrupt().transition().duration(180).style('opacity', 0);
      setTimeout(renderWords, 180);
      const hint = slide.querySelector('.sg-hint-text');
      if (hint) hint.style.opacity = 0;
    }
    function showStreams() {
      slide.classList.remove('dissolved');
      svgSel.selectAll('.sg-words').transition('words').duration(260).style('opacity', 0).remove();
      if (layerPaths) {
        layerPaths.interrupt('stream');
        layerPaths.transition('stream')
          .duration(900)
          .delay(140)
          .ease(d3.easeCubicInOut)
          .attr('fill-opacity', 1)
          .attr('stroke', '#f8f8f8')
          .attr('stroke-width', 2.2)
          .attr('stroke-opacity', 1);
      }
      if (layerLabels) layerLabels.transition('lbl').duration(360).delay(640).style('opacity', 1);
      const hint = slide.querySelector('.sg-hint-text');
      if (hint) hint.style.opacity = '';
    }

    // Build eagerly on page load — this guarantees no half-render glitches when slide 2 first appears
    // Tiny delay so the slide has its computed size even though it's not yet visible
    function initialBuild() {
      // make slide briefly measurable
      const wasHidden = !slide.classList.contains('active');
      if (wasHidden) {
        slide.style.display = 'flex';
        slide.style.visibility = 'hidden';
      }
      svgSel.selectAll('*').remove();
      measureNode = null;
      build();
      if (wasHidden) {
        slide.style.display = '';
        slide.style.visibility = '';
      }
      // immediately fast-forward all clip wipes to full width — the active-handler will restart them
      svgSel.selectAll('[class^="sg-clip-rect-"]').interrupt().attr('width', innerW);
    }
    initialBuild();

    // Warm the placement cache in idle time so the dissolve-to-words transition
    // is DOM-only work when the user actually triggers it.
    function precomputePlacements() {
      if (wordPlacementsCache && wordPlacementsCache.key === `${Math.round(W)}x${Math.round(H)}`) return;
      const key = `${Math.round(W)}x${Math.round(H)}`;
      wordPlacementsCache = { key, layers: computeWordPlacements() };
    }
    const scheduleIdle = window.requestIdleCallback
      ? (fn) => window.requestIdleCallback(fn, { timeout: 1500 })
      : (fn) => setTimeout(fn, 300);
    scheduleIdle(precomputePlacements);

    // Invalidate the placement cache on resize — geometry changes make old placements wrong
    window.addEventListener('resize', () => { wordPlacementsCache = null; });

    function restartWipe() {
      // Reset opacities in case the slide was last left dissolved
      svgSel.selectAll('.sg-words').remove();
      if (layerPaths) layerPaths.interrupt().attr('fill-opacity', 1).attr('stroke-opacity', 1);
      if (layerLabels) layerLabels.interrupt().style('opacity', 0);

      // Snap every clip back to width 0, then animate left-to-right roll-in.
      const rollOrder = ['Urdu', 'Hindi', 'Hinglish', 'English'];
      layers.forEach((layer, idx) => {
        const rect = svgSel.select(`.sg-clip-rect-${idx}`);
        rect.interrupt().attr('width', 0);
        const orderPos = rollOrder.indexOf(layer.key);
        rect.transition()
          .delay(orderPos * 220)
          .duration(1500)
          .ease(d3.easeCubicOut)
          .attr('width', innerW);
      });
      // Fade labels in once streams are established
      if (layerLabels) {
        layerLabels.transition('lbl').delay(900).duration(400).style('opacity', 1);
      }
      renderEventLine(rollOrder.length * 220 + 1500);
    }

    // Hook slide-active and trigger-shown transitions
    const trigger = slide.querySelector('[data-sg-dissolve]');
    let wasActive = slide.classList.contains('active');
    const mo = new MutationObserver(() => {
      const nowActive = slide.classList.contains('active');
      // Only run the wipe on the *transition* into active state
      if (nowActive && !wasActive) {
        restartWipe();
      }
      wasActive = nowActive;
    });
    mo.observe(slide, { attributes: true, attributeFilter: ['class'] });

    const stepObserver = new MutationObserver(() => {
      if (!slide.classList.contains('active')) return;
      if (trigger.classList.contains('shown')) dissolveToWords();
      else showStreams();
    });
    stepObserver.observe(trigger, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('resize', () => {
      if (slide.classList.contains('active')) {
        svgSel.selectAll('*').remove();
        measureNode = null;
        build();
        if (trigger.classList.contains('shown')) {
          layerLabels.style('opacity', 0);
          layerPaths.attr('fill-opacity', 0).attr('stroke-opacity', 0);
          renderWords();
        }
      }
    });
  })();

  // Dumbbell chart: Bollywood Original vs Remake IMDB ratings, sorted by difference
  (function renderRemakeRated() {
    const svg = document.getElementById('remakeRatedChart');
    if (!svg || typeof d3 === 'undefined') return;
    const data = [
      { film: 'Devdas',                                      orig: 7.7, remake: 7.5 },
      { film: 'Ittefaq',                                     orig: 7.4, remake: 7.2 },
      { film: 'Don',                                         orig: 7.7, remake: 7.1 },
      { film: 'Agneepath',                                   orig: 7.6, remake: 6.9 },
      { film: 'Khubsoorat',                                  orig: 7.6, remake: 6.4 },
      { film: 'Pati Patni aur Woh',                          orig: 7.0, remake: 5.8 },
      { film: 'Albert Pinto Ko Gussa Kyun Aata Hai?',        orig: 7.1, remake: 5.5 },
      { film: 'Coolie no. 1',                                orig: 6.6, remake: 4.2 },
      { film: 'Umrao Jaan',                                  orig: 7.7, remake: 5.3 },
      { film: 'Chashme Buddoor',                             orig: 7.9, remake: 5.4 },
      { film: 'Judwaa (Judwaa 2)',                           orig: 6.1, remake: 3.6 },
      { film: 'Gol Maal (Bol Bachchan)',                     orig: 8.5, remake: 5.6 },
      { film: 'Himmatwala',                                  orig: 4.7, remake: 1.7 },
      { film: 'Ek Hi Rasta',                                 orig: 7.0, remake: 3.8 },
      { film: 'Hero',                                        orig: 6.7, remake: 3.5 },
      { film: 'Victoria no. 203',                            orig: 7.3, remake: 3.7 },
      { film: 'Zanjeer',                                     orig: 7.5, remake: 3.3 },
      { film: 'Karz (Karzzzz)',                              orig: 7.4, remake: 2.3 },
      { film: 'Sholay (Ram Gopal Varma Ki Aag)',             orig: 8.1, remake: 1.4 },
    ];

    const wrap = svg.parentElement;
    const W = wrap.clientWidth || 1280;
    const H = wrap.clientHeight || 600;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const margin = { top: 30, right: 24, bottom: 140, left: 56 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const s = d3.select(svg);
    s.selectAll('*').remove();
    const g = s.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Legend (top-right)
    const legend = s.append('g')
      .attr('class', 'rr-legend')
      .attr('transform', `translate(${W - margin.right}, 20)`);
    legend.append('text').attr('x', -110).attr('y', 0).attr('class', 'rr-orig').attr('text-anchor', 'end').text('● Original');
    legend.append('text').attr('x', 0).attr('y', 0).attr('class', 'rr-remake').attr('text-anchor', 'end').text('● Remake');

    const x = d3.scalePoint().domain(data.map(d => d.film)).range([0, innerW]).padding(0.5);
    const y = d3.scaleLinear().domain([0, 9]).range([innerH, 0]).nice();

    // Y axis
    g.append('g')
      .attr('class', 'rr-axis')
      .call(d3.axisLeft(y).ticks(9).tickSize(-innerW).tickFormat(d => d.toFixed(1)));
    g.append('text')
      .attr('class', 'rr-y-label')
      .attr('transform', `translate(-42, ${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('IMDB Rating');

    const isHighlight = d => /Karz|Sholay/.test(d.film);
    // Connecting lines between original and remake
    g.selectAll('.rr-link')
      .data(data)
      .join('line')
        .attr('class', d => 'rr-link' + (isHighlight(d) ? ' rr-highlight' : ''))
        .attr('x1', d => x(d.film))
        .attr('x2', d => x(d.film))
        .attr('y1', d => y(d.orig))
        .attr('y2', d => y(d.remake))
        .attr('stroke', d => d.orig >= d.remake ? '#c12818' : '#1B5D9F')
        .attr('stroke-opacity', 0.7);

    const R = 14;
    // Original dots
    g.selectAll('.rr-dot-orig')
      .data(data)
      .join('circle')
        .attr('class', d => 'rr-dot-orig' + (isHighlight(d) ? ' rr-highlight' : ''))
        .attr('cx', d => x(d.film))
        .attr('cy', d => y(d.orig))
        .attr('r', R);

    // Remake dots
    g.selectAll('.rr-dot-remake')
      .data(data)
      .join('circle')
        .attr('class', d => 'rr-dot-remake' + (isHighlight(d) ? ' rr-highlight' : ''))
        .attr('cx', d => x(d.film))
        .attr('cy', d => y(d.remake))
        .attr('r', R);

    // Value labels inside the dots
    g.selectAll('.rr-value-orig')
      .data(data)
      .join('text')
        .attr('class', d => 'rr-value' + (isHighlight(d) ? ' rr-highlight' : ''))
        .attr('x', d => x(d.film))
        .attr('y', d => y(d.orig))
        .text(d => d.orig.toFixed(1));
    g.selectAll('.rr-value-remake')
      .data(data)
      .join('text')
        .attr('class', d => 'rr-value' + (isHighlight(d) ? ' rr-highlight' : ''))
        .attr('x', d => x(d.film))
        .attr('y', d => y(d.remake))
        .text(d => d.remake.toFixed(1));

    // Film labels along the x-axis, wrapped to 2 lines max
    // Horizontal labels, wrapped to fit the column width (innerW / # films)
    const slotW = innerW / data.length;
    function wrapWords(text, maxChars) {
      const sel = d3.select(text);
      const words = sel.text().split(/\s+/);
      sel.text(null);
      const lines = [];
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).trim().length > maxChars && line.length) {
          lines.push(line.trim());
          line = w;
        } else {
          line = (line + ' ' + w).trim();
        }
      }
      if (line) lines.push(line);
      lines.slice(0, 6).forEach((ln, i) => {
        sel.append('tspan')
          .attr('x', sel.attr('x'))
          .attr('dy', i === 0 ? '0.9em' : '1.1em')
          .text(ln);
      });
    }
    // 11px IBM Plex Sans ≈ 6.2px per character avg → chars per line ≈ slot / 6.2
    const charsPerLine = Math.max(4, Math.floor(slotW / 6.2));
    g.selectAll('.rr-film-label')
      .data(data)
      .join('text')
        .attr('class', d => 'rr-film-label' + (isHighlight(d) ? ' rr-highlight' : ''))
        .attr('x', d => x(d.film))
        .attr('y', innerH + 8)
        .text(d => d.film)
        .each(function() { wrapWords(this, charsPerLine); });
  })();

  // Stacked-bar trend chart (Year vs share of categories), from remake-trend.csv (embedded)
  (function renderTrendStack() {
    const svg = document.getElementById('trendStackChart');
    if (!svg || typeof d3 === 'undefined') return;
    const rows = [
      { Year: 2000, Remake: 44, Franchise: 2,  'Franchise + Remake': 2, Original: 52 },
      { Year: 2001, Remake: 36, Franchise: 2,  'Franchise + Remake': 0, Original: 62 },
      { Year: 2002, Remake: 46, Franchise: 4,  'Franchise + Remake': 4, Original: 46 },
      { Year: 2003, Remake: 32, Franchise: 8,  'Franchise + Remake': 6, Original: 54 },
      { Year: 2004, Remake: 34, Franchise: 8,  'Franchise + Remake': 2, Original: 56 },
      { Year: 2005, Remake: 44, Franchise: 6,  'Franchise + Remake': 4, Original: 46 },
      { Year: 2006, Remake: 32, Franchise: 12, 'Franchise + Remake': 8, Original: 48 },
      { Year: 2007, Remake: 32, Franchise: 0,  'Franchise + Remake': 6, Original: 62 },
      { Year: 2008, Remake: 30, Franchise: 8,  'Franchise + Remake': 6, Original: 56 },
      { Year: 2009, Remake: 30, Franchise: 4,  'Franchise + Remake': 0, Original: 66 },
      { Year: 2010, Remake: 28, Franchise: 12, 'Franchise + Remake': 4, Original: 56 },
      { Year: 2011, Remake: 16, Franchise: 12, 'Franchise + Remake': 8, Original: 64 },
      { Year: 2012, Remake: 28, Franchise: 26, 'Franchise + Remake': 4, Original: 42 },
      { Year: 2013, Remake: 16, Franchise: 22, 'Franchise + Remake': 6, Original: 56 },
      { Year: 2014, Remake: 24, Franchise: 14, 'Franchise + Remake': 6, Original: 56 },
      { Year: 2015, Remake: 28, Franchise: 18, 'Franchise + Remake': 6, Original: 48 },
      { Year: 2016, Remake: 12, Franchise: 22, 'Franchise + Remake': 2, Original: 64 },
      { Year: 2017, Remake: 16, Franchise: 22, 'Franchise + Remake': 2, Original: 60 },
      { Year: 2018, Remake: 10, Franchise: 20, 'Franchise + Remake': 4, Original: 66 },
      { Year: 2019, Remake: 14, Franchise: 10, 'Franchise + Remake': 2, Original: 74 },
    ];
    const keys = ['Remake', 'Franchise', 'Franchise + Remake', 'Original'];
    const color = d3.scaleOrdinal()
      .domain(keys)
      .range(['#2a5b66', '#5f8e96', '#a4c3c8', '#e8dec9']);

    function draw() {
      const wrap = svg.parentElement;
      // The slide is display:none until active; fall back to its CSS-declared size (420×720 stage).
      const W = wrap.clientWidth  || 420;
      const H = wrap.clientHeight || 720;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      const margin = { top: 48, right: 16, bottom: 32, left: 50 };
      const innerW = W - margin.left - margin.right;
      const innerH = H - margin.top - margin.bottom;
      const s = d3.select(svg);
      s.selectAll('*').remove();

      // Legend across the top — wrap onto two rows so it fits a narrow chart
      const legend = s.append('g').attr('class', 'ts-legend').attr('transform', `translate(${margin.left}, 18)`);
      const swatchW = 14, gap = 6, itemGap = 18, rowH = 22;
      let lx = 0, ly = 0;
      keys.forEach(k => {
        const labelW = k.length * 7.2; // rough char-width estimate
        const itemW = swatchW + gap + labelW;
        if (lx > 0 && lx + itemW > innerW) { lx = 0; ly += rowH; }
        const g = legend.append('g').attr('transform', `translate(${lx}, ${ly})`);
        g.append('rect').attr('width', swatchW).attr('height', 14).attr('y', -11).attr('fill', color(k));
        g.append('text').attr('x', swatchW + gap).attr('y', 1).text(k);
        lx += itemW + itemGap;
      });

      const g = s.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

      const y = d3.scaleBand()
        .domain(rows.map(d => d.Year))
        .range([0, innerH])
        .padding(0.18);
      const x = d3.scaleLinear().domain([0, 100]).range([0, innerW]);
      const stack = d3.stack().keys(keys);
      const series = stack(rows);

      g.append('g')
        .attr('class', 'ts-axis')
        .call(d3.axisLeft(y).tickFormat(d3.format('d')).tickSize(0).tickPadding(8))
        .call(gg => gg.select('.domain').remove());
      g.append('g')
        .attr('class', 'ts-axis')
        .attr('transform', `translate(0, ${innerH})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d => d + '%').tickSize(-innerH));

      const seriesG = g.selectAll('.ts-series')
        .data(series)
        .join('g')
          .attr('class', 'ts-series')
          .attr('fill', d => color(d.key));

      seriesG.selectAll('rect')
        .data(d => d.map(v => ({ ...v, key: d.key })))
        .join('rect')
          .attr('y', d => y(d.data.Year))
          .attr('x', d => x(d[0]))
          .attr('width', d => x(d[1]) - x(d[0]))
          .attr('height', y.bandwidth());

      seriesG.selectAll('text.ts-pct')
        .data(d => d.map(v => ({ ...v, key: d.key })))
        .join('text')
          .attr('class', 'ts-pct')
          .attr('y', d => y(d.data.Year) + y.bandwidth() / 2)
          .attr('x', d => (x(d[0]) + x(d[1])) / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-family', '"IBM Plex Sans", system-ui, sans-serif')
          .attr('font-weight', 700)
          .attr('font-size', 10)
          .attr('fill', d => (d.key === 'Original' || d.key === 'Franchise + Remake') ? '#1a1a1a' : '#ffffff')
          .text(d => {
            const pct = d.data[d.key];
            const segPx = x(d[1]) - x(d[0]);
            return (pct >= 5 && segPx >= 22) ? pct + '%' : '';
          });
    }

    draw();
    // Redraw when the slide becomes visible or when the "stack" r-step trigger fires.
    const slide = svg.closest('.slide');
    if (slide) {
      const obs = new MutationObserver(() => {
        if (slide.classList.contains('active')) draw();
      });
      obs.observe(slide, { attributes: true, attributeFilter: ['class'] });
      const stackTrigger = slide.querySelector('[data-rs-show="stack"]');
      if (stackTrigger) {
        const obs2 = new MutationObserver(() => {
          if (stackTrigger.classList.contains('shown')) {
            // Wait one frame so the phase has reflowed to its real dimensions.
            requestAnimationFrame(draw);
          }
        });
        obs2.observe(stackTrigger, { attributes: true, attributeFilter: ['class'] });
      }
    }
    window.addEventListener('resize', draw);
  })();

  // Remake-ROI diverging bar chart: 4 small multiples (one per part),
  // bars go up for profit, down for loss. Data: remake-profit.csv
  (function renderRemakeROI() {
    const svg = document.getElementById('remakeROIChart');
    if (!svg || typeof d3 === 'undefined') return;

    const PART_ORDER = ['Original', 'Sequel', '2nd Sequel', '3rd Sequel'];
    const PART_LABEL = { 'Original': 'Part 1', 'Sequel': 'Part 2', '2nd Sequel': 'Part 3', '3rd Sequel': 'Part 4' };

    let dataReady = null;
    function loadData() {
      if (dataReady) return dataReady;
      dataReady = d3.csv('data/remake-profit.csv', d => ({
        franchise: d.Franchise.trim(),
        film: d.Film.trim(),
        category: d.Category.trim(),
        roi: +d['Return on Investment'],
      }));
      return dataReady;
    }

    let lastRows = null;

    function draw(rowsRaw) {
      lastRows = rowsRaw;
      const wrap = svg.parentElement;
      const W = wrap.clientWidth  || 1160;
      const H = wrap.clientHeight || 520;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      const byFranchise = d3.group(rowsRaw, d => d.franchise);
      const franchises = Array.from(byFranchise.keys());

      const allROI = rowsRaw.map(d => d.roi);
      const magMax = Math.max(d3.max(allROI), Math.abs(d3.min(allROI)));

      const s = d3.select(svg);
      s.selectAll('*').remove();

      const margin = { top: 56, right: 24, bottom: 24, left: 220 };
      const innerW = W - margin.left - margin.right;
      const innerH = H - margin.top - margin.bottom;

      // Bring Part 1..4 columns closer together — use only ~60% of the inner width for the 4 columns
      const colsW = innerW * 0.6;
      const xCol = d3.scaleBand()
        .domain(PART_ORDER)
        .range([0, colsW])
        .paddingInner(0.02);
      const yRow = d3.scaleBand()
        .domain(franchises)
        .range([0, innerH])
        .paddingInner(0.03);

      // Bubble radius: scale by sqrt(|ROI|) so area encodes magnitude proportionally.
      // Bubbles may overlap — area encodes ROI magnitude (sqrt scale from 0).
      const cellMin = Math.min(yRow.bandwidth(), xCol.bandwidth());
      const maxR = cellMin * 0.95;
      const rScale = d3.scaleSqrt().domain([0, magMax]).range([0, maxR]);

      const profitColor = '#1e4d8c';
      const lossColor   = '#c12818';

      const g = s.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

      // Column headers
      g.append('g').selectAll('text')
        .data(PART_ORDER)
        .join('text')
          .attr('class', 'rr-col-label')
          .attr('x', d => xCol(d) + xCol.bandwidth() / 2)
          .attr('y', -18)
          .attr('text-anchor', 'middle')
          .text(d => PART_LABEL[d]);

      // Row labels
      g.append('g').selectAll('text')
        .data(franchises)
        .join('text')
          .attr('class', 'rr-row-label')
          .attr('x', -12)
          .attr('y', d => yRow(d) + yRow.bandwidth() / 2)
          .attr('text-anchor', 'end')
          .attr('dominant-baseline', 'middle')
          .text(d => d);

      // Determine which parts are visible right now so newly drawn bubbles
      // start at the correct opacity (avoids a flash of all-parts on load).
      const visibleParts = new Set(['Original']);
      const slideEl = svg.closest('.slide');
      if (slideEl) {
        slideEl.querySelectorAll('.r-step[data-rr-part]').forEach(el => {
          if (el.classList.contains('shown')) visibleParts.add(el.dataset.rrPart);
        });
      }

      // Bubbles
      const cellG = g.append('g').attr('class', 'rr-cells');
      rowsRaw.forEach(rec => {
        if (!PART_ORDER.includes(rec.category)) return;
        const cx = xCol(rec.category) + xCol.bandwidth() / 2;
        const cy = yRow(rec.franchise) + yRow.bandwidth() / 2;
        const isLoss = rec.roi < 0;
        const r = rScale(Math.abs(rec.roi));
        const startOpacity = visibleParts.has(rec.category) ? 1 : 0;

        cellG.append('circle')
          .attr('class', `rr-cell rr-bubble`)
          .attr('data-part', rec.category)
          .attr('cx', cx).attr('cy', cy).attr('r', r)
          .attr('fill', isLoss ? lossColor : profitColor)
          .attr('fill-opacity', 0.78)
          .attr('stroke', isLoss ? lossColor : profitColor)
          .attr('stroke-width', 1)
          .style('opacity', startOpacity);

        cellG.append('text')
          .attr('class', 'rr-value')
          .attr('data-part', rec.category)
          .attr('x', cx).attr('y', cy)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', r >= 18 ? 12 : 10)
          .attr('font-weight', 700)
          .attr('fill', '#ffffff')
          .style('opacity', startOpacity)
          .text(Math.round(rec.roi));
      });
    }

    // Show only the Parts whose r-steps have fired (Part 1 always visible).
    function applyVisibility() {
      const slide = svg.closest('.slide');
      const visibleParts = new Set(['Original']);
      if (slide) {
        slide.querySelectorAll('.r-step[data-rr-part]').forEach(el => {
          if (el.classList.contains('shown')) visibleParts.add(el.dataset.rrPart);
        });
      }
      d3.select(svg).selectAll('.rr-cells > circle, .rr-cells > text')
        .transition().duration(350)
        .style('opacity', function() {
          const p = this.getAttribute('data-part');
          return visibleParts.has(p) ? 1 : 0;
        });
    }

    function tryDraw() {
      loadData().then(rows => draw(rows))
        .catch(err => {
          d3.select(svg).selectAll('*').remove();
          d3.select(svg).append('text')
            .attr('x', 20).attr('y', 40).attr('fill', '#c33').attr('font-size', 13)
            .text('Could not load remake-profit.csv. Serve from a local server.');
        });
    }

    tryDraw();
    const slide = svg.closest('.slide');
    if (slide) {
      const obs = new MutationObserver(() => {
        if (slide.classList.contains('active')) requestAnimationFrame(tryDraw);
      });
      obs.observe(slide, { attributes: true, attributeFilter: ['class'] });
      // Reveal bubbles part-by-part as r-steps fire
      slide.querySelectorAll('.r-step[data-rr-part]').forEach(el => {
        const o2 = new MutationObserver(() => applyVisibility());
        o2.observe(el, { attributes: true, attributeFilter: ['class'] });
      });
    }
    window.addEventListener('resize', tryDraw);
  })();

  // Stacked area chart: source of remakes grouped into 4 buckets.
  // World Cinema = American + French + British + Spanish + Korean + Others
  // Hindi = Hindi + Marathi (Hindi-belt Indian)
  // Regional (South) = Tamil + Telugu + Malayalam + Kannada
  // Hollywood = American only? per user spec it's a separate bucket alongside World Cinema.
  // Spec: World Cinema / Hindi / Regional (south) / Hollywood
  (function renderSourceArea() {
    const svg = document.getElementById('sourceAreaChart');
    if (!svg || typeof d3 === 'undefined') return;
    const raw = [
      { Year: 2000, American: 48, Telugu: 17, Tamil: 4,  Malayalam: 13, Kannada: 4, Hindi: 4,  Marathi: 4, French: 4,  British: 0, Spanish: 0, Korean: 0,  Others: 0 },
      { Year: 2001, American: 44, Telugu: 17, Tamil: 28, Malayalam: 6,  Kannada: 0, Hindi: 6,  Marathi: 0, French: 0,  British: 0, Spanish: 0, Korean: 0,  Others: 0 },
      { Year: 2002, American: 48, Telugu: 20, Tamil: 16, Malayalam: 4,  Kannada: 0, Hindi: 4,  Marathi: 0, French: 0,  British: 4, Spanish: 0, Korean: 0,  Others: 4 },
      { Year: 2003, American: 58, Telugu: 11, Tamil: 16, Malayalam: 11, Kannada: 0, Hindi: 5,  Marathi: 0, French: 0,  British: 0, Spanish: 0, Korean: 0,  Others: 0 },
      { Year: 2004, American: 78, Telugu: 0,  Tamil: 11, Malayalam: 6,  Kannada: 6, Hindi: 0,  Marathi: 0, French: 0,  British: 0, Spanish: 0, Korean: 0,  Others: 0 },
      { Year: 2005, American: 54, Telugu: 4,  Tamil: 4,  Malayalam: 17, Kannada: 8, Hindi: 4,  Marathi: 0, French: 0,  British: 0, Spanish: 0, Korean: 0,  Others: 8 },
      { Year: 2006, American: 35, Telugu: 0,  Tamil: 0,  Malayalam: 20, Kannada: 5, Hindi: 15, Marathi: 0, French: 0,  British: 10, Spanish: 0, Korean: 5,  Others: 10 },
      { Year: 2007, American: 47, Telugu: 0,  Tamil: 5,  Malayalam: 11, Kannada: 0, Hindi: 5,  Marathi: 0, French: 11, British: 11, Spanish: 0, Korean: 5,  Others: 5 },
      { Year: 2008, American: 50, Telugu: 6,  Tamil: 6,  Malayalam: 6,  Kannada: 0, Hindi: 11, Marathi: 0, French: 0,  British: 6, Spanish: 0, Korean: 11, Others: 6 },
      { Year: 2009, American: 47, Telugu: 13, Tamil: 7,  Malayalam: 20, Kannada: 0, Hindi: 0,  Marathi: 0, French: 7,  British: 0, Spanish: 0, Korean: 0,  Others: 7 },
      { Year: 2010, American: 56, Telugu: 6,  Tamil: 6,  Malayalam: 6,  Kannada: 0, Hindi: 0,  Marathi: 6, French: 0,  British: 0, Spanish: 6, Korean: 0,  Others: 13 },
      { Year: 2011, American: 33, Telugu: 17, Tamil: 17, Malayalam: 8,  Kannada: 0, Hindi: 0,  Marathi: 0, French: 0,  British: 0, Spanish: 0, Korean: 8,  Others: 17 },
      { Year: 2012, American: 13, Telugu: 19, Tamil: 6,  Malayalam: 13, Kannada: 0, Hindi: 13, Marathi: 0, French: 6,  British: 6, Spanish: 0, Korean: 0,  Others: 25 },
      { Year: 2013, American: 9,  Telugu: 9,  Tamil: 9,  Malayalam: 9,  Kannada: 0, Hindi: 36, Marathi: 0, French: 9,  British: 9, Spanish: 9, Korean: 0,  Others: 0 },
      { Year: 2014, American: 13, Telugu: 33, Tamil: 7,  Malayalam: 7,  Kannada: 0, Hindi: 13, Marathi: 0, French: 0,  British: 7, Spanish: 7, Korean: 7,  Others: 7 },
      { Year: 2015, American: 29, Telugu: 12, Tamil: 6,  Malayalam: 6,  Kannada: 6, Hindi: 12, Marathi: 0, French: 0,  British: 6, Spanish: 0, Korean: 12, Others: 12 },
      { Year: 2016, American: 14, Telugu: 14, Tamil: 14, Malayalam: 14, Kannada: 0, Hindi: 0,  Marathi: 0, French: 14, British: 0, Spanish: 0, Korean: 29, Others: 0 },
      { Year: 2017, American: 11, Telugu: 0,  Tamil: 33, Malayalam: 0,  Kannada: 0, Hindi: 22, Marathi: 11,French: 0,  British: 0, Spanish: 0, Korean: 0,  Others: 22 },
      { Year: 2018, American: 14, Telugu: 43, Tamil: 0,  Malayalam: 0,  Kannada: 0, Hindi: 0,  Marathi: 14,French: 14, British: 0, Spanish: 0, Korean: 0,  Others: 14 },
      { Year: 2019, American: 13, Telugu: 25, Tamil: 0,  Malayalam: 0,  Kannada: 13,Hindi: 13, Marathi: 0, French: 13, British: 0, Spanish: 13, Korean: 13, Others: 0 },
    ];
    const data = raw.map(r => ({
      Year: r.Year,
      'Hollywood':            r.American,
      'Regional (South)':     r.Telugu + r.Tamil + r.Malayalam + r.Kannada,
      'Hindi':                r.Hindi + r.Marathi,
      'World Cinema':         r.French + r.British + r.Spanish + r.Korean + r.Others,
    }));
    // d3.stack: first key sits at the BOTTOM of the chart (since y-scale is [innerH, 0]
    // and the first key stacks first at value 0). To get visual order top→bottom:
    // World Cinema, Hindi, Regional (South), Hollywood — list them in REVERSE.
    const keys = ['Hollywood', 'Regional (South)', 'Hindi', 'World Cinema'];
    // Editorial palette (warm/cool mix, low-saturation jewel tones)
    const color = d3.scaleOrdinal()
      .domain(['World Cinema', 'Hindi', 'Regional (South)', 'Hollywood'])
      .range(['#3d7b8a', '#b25a8e', '#d68d3a', '#7d9b54']);

    const wrap = svg.parentElement;
    const W = wrap.clientWidth || 1280, H = wrap.clientHeight || 580;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Full-bleed: no horizontal margins; small bottom margin for year labels
    const margin = { top: 0, right: 0, bottom: 28, left: 0 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;
    const s = d3.select(svg);
    s.selectAll('*').remove();

    const g = s.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

    const years = data.map(d => d.Year);
    const x = d3.scaleLinear()
      .domain(d3.extent(years))
      .range([0, innerW]);

    // Stacked-area (expand to 100%) — NOT streamgraph
    const stack = d3.stack()
      .keys(keys)
      .offset(d3.stackOffsetExpand);
    const series = stack(data);
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

    const area = d3.area()
      .x(d => x(d.data.Year))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveMonotoneX);

    // Set up clip paths so each band can sweep in left → right
    const defs = s.append('defs');
    series.forEach((layer, i) => {
      const cp = defs.append('clipPath').attr('id', 'sa-clip-' + i);
      cp.append('rect')
        .attr('class', 'sa-clip-rect')
        .attr('data-band-idx', i)
        .attr('x', 0).attr('y', 0)
        .attr('width', 0).attr('height', innerH);
    });

    // Stacking order: first key (Hollywood) sits at bottom, last (World Cinema) at top.
    // The user wants reveal sequence: 1) Hollywood, 2) Regional, 3) Hindi, 4) World Cinema.
    // That maps directly to series index 0..3 (which matches `keys`).
    const seriesG = g.selectAll('.sa-stream')
      .data(series)
      .join('path')
        .attr('class', 'sa-stream')
        .attr('data-band-idx', (d, i) => i)
        .attr('clip-path', (d, i) => `url(#sa-clip-${i})`)
        .attr('fill', d => color(d.key))
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.5)
        .attr('d', area);

    // Year labels along the bottom (no axis line)
    const yearTicks = years.filter((_, i) => i % 2 === 0);
    g.append('g')
      .attr('transform', `translate(0, ${innerH + 6})`)
      .selectAll('text')
      .data(yearTicks)
      .join('text')
        .attr('x', d => x(d))
        .attr('y', 12)
        .attr('text-anchor', 'middle')
        .attr('font-family', '"IBM Plex Sans", system-ui, sans-serif')
        .attr('font-size', 12)
        .attr('fill', '#4a4a4a')
        .text(d => d);

    // In-band labels with wrapping. Each label sized to its band's LOCAL thickness,
    // positioned at the band's thickest column, and clamped to stay inside the slide.
    const labelGroup = g.append('g').attr('class', 'sa-labels');
    // Per-band placement overrides (xFrac is a fraction of innerW; null = use band's thickest column)
    const placement = {
      'Hollywood':        { xFrac: 0.18, yOffset: 18 },   // slightly below band center
      'Regional (South)': { xFrac: 0.82, yOffset: 0  },   // toward right side
      'Hindi':            { xFrac: null, yOffset: 0 },
      'World Cinema':     { xFrac: null, yOffset: 0 },
    };
    const labelData = series.map((layer, i) => {
      const p = placement[layer.key] || { xFrac: null, yOffset: 0 };
      let xPos, yMid;
      if (p.xFrac != null) {
        // Use the user-supplied column fraction to locate the band point
        const idx = Math.round(p.xFrac * (layer.length - 1));
        const d = layer[idx];
        xPos = x(d.data.Year);
        yMid = (y(d[0]) + y(d[1])) / 2 + p.yOffset;
      } else {
        // Default: pick column where band is widest
        let bestI = 0, bestT = -Infinity;
        layer.forEach((d, k) => {
          const t = d[1] - d[0];
          if (t > bestT) { bestT = t; bestI = k; }
        });
        const d = layer[bestI];
        xPos = x(d.data.Year);
        yMid = (y(d[0]) + y(d[1])) / 2 + p.yOffset;
      }
      // Use the local band thickness around the label column to size text
      const idx = Math.max(0, Math.min(layer.length - 1, Math.round(xPos / innerW * (layer.length - 1))));
      const bandPx = Math.abs(y(layer[idx][1]) - y(layer[idx][0]));
      const fontSize = Math.max(13, Math.min(26, bandPx * 0.38));
      const text = layer.key;
      const lines = text.includes('(') ? text.split(/\s+(?=\()/) : [text];
      const longest = lines.reduce((a, b) => a.length > b.length ? a : b);
      const textW = longest.length * fontSize * 0.62;
      const xClamped = Math.max(textW / 2 + 12, Math.min(innerW - textW / 2 - 12, xPos));
      return { key: text, lines, xClamped, yMid, fontSize, layerIdx: i };
    });

    const labelSel = labelGroup.selectAll('text.sa-layer-label')
      .data(labelData)
      .join('text')
        .attr('class', 'sa-layer-label')
        .attr('data-band-idx', d => d.layerIdx)
        .attr('x', d => d.xClamped)
        .attr('y', d => d.yMid)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-family', '"Benguiat", serif')
        .attr('font-weight', 700)
        .attr('text-transform', 'uppercase')
        .attr('letter-spacing', '0.04em')
        .attr('opacity', 0)
        .style('font-size', d => d.fontSize + 'px')
        .style('paint-order', 'stroke')
        .style('stroke', 'rgba(0,0,0,0.22)')
        .style('stroke-width', '2px');

    labelSel.each(function(d) {
      const t = d3.select(this);
      t.selectAll('tspan').remove();
      const n = d.lines.length;
      d.lines.forEach((ln, i) => {
        // First tspan offset so that the lines are centered on yMid
        const dyEm = (i === 0)
          ? `${-(n - 1) * 0.55}em`
          : '1.1em';
        t.append('tspan')
          .attr('x', d.xClamped)
          .attr('dy', dyEm)
          .text(ln);
      });
    });

    // Reveal each band one click at a time (band 0 / Hollywood visible by default,
    // bands 1..3 unlock on data-sa-band="2|3|4" markers).
    const slide = svg.closest('.slide');
    function setBandVisible(idx, on) {
      const clipRect = defs.select(`rect.sa-clip-rect[data-band-idx="${idx}"]`);
      const label = labelGroup.select(`text.sa-layer-label[data-band-idx="${idx}"]`);
      if (on) {
        clipRect.transition().duration(2200).ease(d3.easeCubicInOut).attr('width', innerW);
        label.transition().delay(900).duration(700).attr('opacity', 1);
      } else {
        clipRect.interrupt().attr('width', 0);
        label.interrupt().attr('opacity', 0);
      }
    }

    function refresh() {
      // Reveal all bands at once in a single left→right sweep.
      setBandVisible(0, true);
      setBandVisible(1, true);
      setBandVisible(2, true);
      setBandVisible(3, true);
    }

    // Initial state
    refresh();
    if (slide) {
      const obs = new MutationObserver(() => refresh());
      obs.observe(slide, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
  })();

  // Render the 99-film waffle on the "58 of 99" remake-stat slide.
  // Sort by category so each highlight group is contiguous.
  (function renderRemakeWaffle() {
    const root = document.getElementById('remakeWaffle');
    if (!root || !window.remake100crPosters) return;
    const order = { remake: 0, franchise: 1, both: 2, original: 3 };
    const films = window.remake100crPosters
      .slice()
      .sort((a, b) => (order[a.category] - order[b.category]) || (a.year - b.year) || a.title.localeCompare(b.title));
    root.innerHTML = '';
    for (const f of films) {
      const cell = document.createElement('div');
      cell.className = 'rs-cell is-' + f.category;
      cell.title = `${f.title} (${f.year})`;
      if (f.file) {
        const img = document.createElement('img');
        img.src = f.file;
        img.alt = f.title;
        img.loading = 'lazy';
        cell.appendChild(img);
      } else {
        const txt = document.createElement('div');
        txt.className = 'rs-cell-text';
        txt.textContent = f.title;
        cell.appendChild(txt);
      }
      root.appendChild(cell);
    }
  })();

  // Why-do-I-do-this Venn diagram (three overlapping circles, single yellowish fill, no borders)
  (function renderWhyVenn() {
    const svg = document.getElementById('whyVenn');
    if (!svg || typeof d3 === 'undefined') return;
    const W = 720, H = 640;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Equilateral triangle of circle centers for a balanced 3-set Venn.
    // For a clear 3-way intersection, the side of the triangle (d * 2 for the two
    // top circles, but the geometric distance between adjacent centers is `side`)
    // must be < r * sqrt(3). We pick side ≈ r to give a generous central overlap.
    // Reference image: BLUE-TEAL circle on TOP, soft GREEN bottom-left, TEAL bottom-right
    const r = 180;
    const side = 210;            // distance between any two adjacent centers
    const cx = W / 2;
    const cyMid = 370;
    const tri = side * Math.sqrt(3) / 2;
    // Step order: 1) Watch movies (top)  2) Work with Data (bottom-right)  3) Have fun (bottom-left)  4) Yellow center
    // Labels sit INSIDE each circle, in the non-overlap crescent area.
    // For each circle, the "safe" non-overlap zone is opposite the triangle centroid —
    // push the label outward from centroid by ~0.5r so it lands in the crescent but stays in-circle.
    const topCy   = cyMid - tri / 1.6;
    const sideCy  = cyMid + tri / 2.4;
    const centX = cx;
    const centY = (topCy + sideCy * 2) / 3;
    function insideLabel(c, push) {
      const dx = c.cx - centX, dy = c.cy - centY;
      const len = Math.hypot(dx, dy) || 1;
      return { lx: c.cx + (dx / len) * push, ly: c.cy + (dy / len) * push };
    }
    const topRaw   = { id: 'movies', step: 1, cx: cx,          cy: topCy,  color: '#3a9aaa', label: ['Watch', 'movies'] };
    const rightRaw = { id: 'data',   step: 2, cx: cx + side/2, cy: sideCy, color: '#5fa896', label: ['Work with', 'Data'] };
    const leftRaw  = { id: 'fun',    step: 3, cx: cx - side/2, cy: sideCy, color: '#a9c79a', label: ['Have', 'fun'] };
    const push = r * 0.55;
    const top   = { ...topRaw,   ...insideLabel(topRaw,   push), anchor: 'middle' };
    const right = { ...rightRaw, ...insideLabel(rightRaw, push), anchor: 'middle' };
    const left  = { ...leftRaw,  ...insideLabel(leftRaw,  push), anchor: 'middle' };
    const sets = [top, right, left];

    // Place pair labels inside each 2-circle lens, pushed outward from the 3-circle centroid
    const centroidX = (top.cx + left.cx + right.cx) / 3;
    const centroidY = (top.cy + left.cy + right.cy) / 3;
    function lensCenter(a, b, push) {
      const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
      const dx = mx - centroidX, dy = my - centroidY;
      const len = Math.hypot(dx, dy) || 1;
      return { x: mx + (dx / len) * push, y: my + (dy / len) * push };
    }
    const plotsP   = lensCenter(top, right, 40);
    const popcornP = lensCenter(top, left,  40);
    const playP    = lensCenter(left, right, 40);
    const pairs = [
      { id: 'plots',   x: plotsP.x,   y: plotsP.y,   lines: ['It has', 'plots']   },
      { id: 'popcorn', x: popcornP.x, y: popcornP.y, lines: ['It has', 'popcorn'] },
      { id: 'play',    x: playP.x,    y: playP.y,    lines: ['You have to', 'play around'] },
    ];

    const s = d3.select(svg);

    s.append('text')
      .attr('class', 'venn-intro')
      .attr('x', cx).attr('y', 6)
      .attr('text-anchor', 'middle')
      .text('I like to:');

    s.selectAll('circle.venn-circle')
      .data(sets, d => d.id)
      .join('circle')
        .attr('class', d => `venn-circle venn-step-${d.step}`)
        .attr('cx', d => d.cx)
        .attr('cy', d => d.cy)
        .attr('r', r)
        .attr('fill', d => d.color);

    // Compute the 3-way intersection (Reuleaux triangle bounded by 3 circular arcs).
    function pairInner(a, b) {
      const dx = b.cx - a.cx, dy = b.cy - a.cy;
      const dist = Math.hypot(dx, dy);
      const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
      const h = Math.sqrt(r * r - (dist / 2) * (dist / 2));
      const px = -dy / dist, py = dx / dist;
      const cxC = (top.cx + left.cx + right.cx) / 3;
      const cyC = (top.cy + left.cy + right.cy) / 3;
      const p1 = { x: mx + px * h, y: my + py * h };
      const p2 = { x: mx - px * h, y: my - py * h };
      return Math.hypot(p1.x - cxC, p1.y - cyC) < Math.hypot(p2.x - cxC, p2.y - cyC) ? p1 : p2;
    }
    const pTL = pairInner(top, left);
    const pTR = pairInner(top, right);
    const pLR = pairInner(left, right);

    function arcTo(p, sweep) {
      return `A ${r} ${r} 0 0 ${sweep} ${p.x} ${p.y}`;
    }
    // Boundary: arc pTR→pLR is on circle 'top'? No — both pTR and pLR are on 'right' → that arc is on 'right'.
    // pTL & pLR are on 'left'; pTL & pTR are on 'top'. We want each arc to bulge OUTWARD.
    const trianglePath =
      `M ${pTL.x} ${pTL.y} ` +
      arcTo(pTR, 1) +   // arc on 'top' between pTL & pTR
      arcTo(pLR, 1) +   // arc on 'right' between pTR & pLR
      arcTo(pTL, 1) +   // arc on 'left' between pLR & pTL
      'Z';

    s.append('path')
      .attr('class', 'venn-center')
      .attr('d', trianglePath);

    // Centroid of the 3-way intersection (centroid of the three pair points)
    const centerX = (pTL.x + pTR.x + pLR.x) / 3;
    const centerY = (pTL.y + pTR.y + pLR.y) / 3;
    const centerLabel = s.append('text')
      .attr('class', 'venn-center-label')
      .attr('x', centerX)
      .attr('y', centerY)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle');
    centerLabel.append('tspan').attr('x', centerX).attr('dy', '-0.55em').text('Bollywood');
    centerLabel.append('tspan').attr('x', centerX).attr('dy', '1.1em').text('Dataviz');

    const labelSel = s.selectAll('text.venn-set-label')
      .data(sets, d => d.id)
      .join('text')
        .attr('class', d => `venn-set-label venn-step-${d.step}`)
        .attr('x', d => d.lx)
        .attr('y', d => d.ly)
        .attr('text-anchor', d => d.anchor);
    labelSel.selectAll('tspan')
      .data(d => d.label.map(line => ({ line, x: d.lx })))
      .join('tspan')
        .attr('x', d => d.x)
        .attr('dy', (d, i) => i === 0 ? 0 : '1.1em')
        .text(d => d.line);

    const pairSel = s.selectAll('text.venn-pair-label')
      .data(pairs)
      .join('text')
        .attr('class', d => `venn-pair-label venn-pair-${d.id}`)
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    pairSel.selectAll('tspan')
      .data(d => d.lines.map(line => ({ line, x: d.x })))
      .join('tspan')
        .attr('x', d => d.x)
        .attr('dy', (d, i) => i === 0 ? '-0.55em' : '1.1em')
        .text(d => d.line);
  })();

  // ============== MARRIAGE HEATMAP SLIDE ==============
  (function setupMarriageHeatmap() {
    const slide = document.getElementById('marriageHeatmapSlide');
    if (!slide || typeof d3 === 'undefined') return;

    const MARRIAGE = {
      actresses: [
        { name: "Saira Banu",           year: 1966 },
        { name: "Neetu Singh",          year: 1980, displayName: "Neetu Kapoor" },
        { name: "Madhuri Dixit",        year: 1999 },
        { name: "Kajol",                year: 1999 },
        { name: "Karisma Kapoor",       year: 2003 },
        { name: "Aishwarya Rai",        year: 2007, aliases: ["Aishwarya Rai Bachchan"] },
        { name: "Kareena Kapoor Khan",  year: 2012, displayName: "Kareena Kapoor" },
        { name: "Rani Mukherji",        year: 2014, displayName: "Rani Mukerji" },
        { name: "Deepika Padukone",     year: 2018 },
        { name: "Katrina Kaif",         year: 2021 },
        { name: "Alia Bhatt",           year: 2022 },
        { name: "Anushka Sharma",       year: 2017 }
      ],
      actors: [
        { name: "Dilip Kumar",       year: 1966 },
        { name: "Rishi Kapoor",      year: 1980 },
        { name: "Shah Rukh Khan",    year: 1991 },
        { name: "Ajay Devgn",        year: 1999 },
        { name: "Hrithik Roshan",    year: 2000 },
        { name: "Aamir Khan",        year: 2005 },
        { name: "Saif Ali Khan",     year: 2012 },
        { name: "Shahid Kapoor",     year: 2015 },
        { name: "Ranveer Singh",     year: 2018 },
        { name: "Vicky Kaushal",     year: 2021 },
        { name: "Ranbir Kapoor",     year: 2022 },
        { name: "Sidharth Malhotra", year: 2023 }
      ]
    };

    const FILES = {
      actresses: "data/age-wage-marriage/actresses.csv",
      actors:    "data/age-wage-marriage/actors.csv",
      more:      "data/age-wage-marriage/more-actor-actresses.csv"
    };

    let chartReady = false;
    let menRows = [], womenRows = [], offsets = [], globalMin = 0, globalMax = 0;
    let color = null, ramp = null, maxCount = 1;
    let prevPhase = -1;

    function fillColor(c) { return c === 0 ? '#0a0a0a' : color(c); }

    function drawPanel(containerId, rows, showPost, animatePost) {
      const cellW = 13;
      const rowH  = 95;
      const leftPad = 290;
      const rightPad = 22;
      const topPad = 70;
      const bottomPad = 70;

      const width  = leftPad + cellW * offsets.length + rightPad;
      const height = topPad + rowH * rows.length + bottomPad;

      d3.select(containerId).selectAll('*').remove();
      const svg = d3.select(containerId).append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('background', '#000000');

      const rowG = svg.append('g')
        .attr('transform', `translate(0, ${topPad})`)
        .selectAll('g.mh-row')
        .data(rows)
        .join('g')
          .attr('class', 'mh-row')
          .attr('transform', (_, i) => `translate(0, ${i * rowH})`);

      rowG.append('text')
        .attr('class', 'mh-row-label')
        .attr('x', leftPad - 10)
        .attr('y', rowH / 2 + 1)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .text(d => d.displayName || d.name);

      rowG.each(function(d, rowIdx) {
        const g = d3.select(this);
        const preOffsets  = d3.range(d.minOff, d.maxOff + 1).filter(off => off < 0);
        const postOffsets = d3.range(d.minOff, d.maxOff + 1).filter(off => off >= 0);

        function makeCellData(off) {
          const yr = d.year + off;
          return {
            off,
            year: yr,
            count: d.counts[yr] || 0,
            titles: d.films[yr] || [],
            name: d.displayName || d.name,
            marriageYear: d.year
          };
        }

        g.selectAll('rect.pre')
          .data(preOffsets.map(makeCellData))
          .join('rect')
            .attr('class', 'mh-cell pre')
            .attr('x', c => leftPad + (c.off - globalMin) * cellW)
            .attr('y', 2)
            .attr('width', cellW - 1)
            .attr('height', rowH - 4)
            .attr('fill', c => fillColor(c.count));

        if (!showPost || postOffsets.length === 0) return;

        g.selectAll('rect.post')
          .data(postOffsets.map(makeCellData))
          .join('rect')
            .attr('class', 'mh-cell post')
            .attr('x', c => leftPad + (c.off - globalMin) * cellW)
            .attr('y', 2)
            .attr('width', cellW - 1)
            .attr('height', rowH - 4)
            .attr('fill', c => fillColor(c.count));

        if (!animatePost) return;

        // Curtain spans the entire post region (offset 0 → globalMax) for every row,
        // so each row's reveal sweeps the same horizontal range at the same speed —
        // otherwise rows with very different post-spans (e.g. SRK) feel out of sync.
        const fullPostX = leftPad + (0 - globalMin) * cellW;
        const fullPostW = (globalMax + 1) * cellW;
        g.append('rect')
          .attr('class', 'mh-post-curtain')
          .attr('x', fullPostX)
          .attr('y', 0)
          .attr('width', fullPostW + 2)
          .attr('height', rowH)
          .attr('fill', '#000000')
          .transition()
            .duration(1100)
            .delay(150 + rowIdx * 30)
            .ease(d3.easeCubicOut)
            .attr('x', fullPostX + fullPostW + 2)
            .attr('width', 0)
            .remove();
      });

      const centerX = leftPad + (0 - globalMin) * cellW + cellW / 2;
      svg.append('line')
        .attr('class', 'mh-center-line')
        .attr('x1', centerX)
        .attr('x2', centerX)
        .attr('y1', topPad - 10)
        .attr('y2', topPad + rows.length * rowH + 6);

      svg.append('text')
        .attr('class', 'mh-center-tag')
        .attr('x', centerX)
        .attr('y', topPad - 20)
        .attr('text-anchor', 'middle')
        .text('MARRIAGE');

      const xScale = d3.scaleLinear()
        .domain([globalMin, globalMax + 1])
        .range([leftPad, leftPad + offsets.length * cellW]);

      // Wider step so the larger axis labels don't crowd each other.
      const tickStep = offsets.length > 40 ? 10 : (offsets.length > 20 ? 5 : 2);
      const ticks = d3.range(Math.ceil(globalMin / tickStep) * tickStep, globalMax + 1, tickStep);
      if (!ticks.includes(0)) ticks.push(0);
      ticks.sort((a, b) => a - b);

      svg.append('g')
        .attr('class', 'mh-axis')
        .attr('transform', `translate(0, ${topPad + rows.length * rowH + 8})`)
        .call(d3.axisBottom(xScale).tickValues(ticks).tickFormat(d => d === 0 ? 'T' : (d > 0 ? `T+${d}` : `T${d}`)).tickSize(6));
    }

    function currentPhase() {
      const steps = slide.querySelectorAll('.r-step[data-mh-step]');
      let phase = 0;
      steps.forEach(s => { if (s.classList.contains('shown')) phase++; });
      return phase;
    }

    function render(animate) {
      if (!chartReady) return;
      const phase = currentPhase();
      const menShowPost   = phase >= 1;
      const womenShowPost = phase >= 2;
      const animateMen   = animate && phase === 1 && prevPhase < 1;
      const animateWomen = animate && phase === 2 && prevPhase < 2;
      drawPanel('#mh-chart-men',   menRows,   menShowPost,   animateMen);
      drawPanel('#mh-chart-women', womenRows, womenShowPost, animateWomen);
      prevPhase = phase;
    }

    function buildLegend() {
      const legend = d3.select('#mh-legend');
      legend.html('');
      legend.append('div').attr('class', 'mh-legend-title').text('No. of movies released per year');
      const row = legend.append('div').attr('class', 'mh-legend-row');
      const swatches = row.append('span').attr('class', 'mh-legend-swatches');
      swatches.append('span').style('background', '#0a0a0a').style('border', '1px solid #444');
      ramp.forEach(c => swatches.append('span').style('background', c));
      const step = maxCount / ramp.length;
      const scale = legend.append('div').attr('class', 'mh-legend-scale');
      scale.append('span').text('0');
      scale.append('span').text(Math.round(step * ramp.length));
    }

    Promise.all([
      d3.csv(FILES.actresses),
      d3.csv(FILES.actors),
      d3.csv(FILES.more)
    ]).then(([fRows, mRows, moreRows]) => {
      const countsByActor = {};
      const filmsByActor = {};
      const seen = new Set();
      function ingest(rows, nameKey, titleKey) {
        rows.forEach(r => {
          const name = r[nameKey];
          const yr = +r.Year;
          const title = (r[titleKey] || '').trim();
          if (!name || !yr) return;
          // Drop the upcoming 2026 "King" entries — they stretch the chart's x-extent
          // and put SRK's lone stripe far away from the rest of his row.
          const cleanTitle = title.replace(/[†*\s]+$/g, '').toLowerCase();
          if (cleanTitle === 'king') return;
          const key = `${name}|${yr}|${title.toLowerCase()}`;
          if (seen.has(key)) return;
          seen.add(key);
          if (!countsByActor[name]) countsByActor[name] = {};
          countsByActor[name][yr] = (countsByActor[name][yr] || 0) + 1;
          if (!filmsByActor[name]) filmsByActor[name] = {};
          if (!filmsByActor[name][yr]) filmsByActor[name][yr] = [];
          filmsByActor[name][yr].push(title || '(untitled)');
        });
      }
      ingest(fRows, 'Actor', 'Film');
      ingest(mRows, 'Actor', 'Film');
      ingest(moreRows, 'Actresss', 'Title [ a ]');

      function mergedCounts(d) {
        const merged = { ...(countsByActor[d.name] || {}) };
        (d.aliases || []).forEach(alias => {
          const src = countsByActor[alias] || {};
          for (const y in src) merged[y] = (merged[y] || 0) + src[y];
        });
        return merged;
      }
      function mergedFilms(d) {
        const merged = {};
        const sources = [filmsByActor[d.name] || {}, ...(d.aliases || []).map(a => filmsByActor[a] || {})];
        sources.forEach(src => {
          for (const y in src) {
            if (!merged[y]) merged[y] = [];
            merged[y] = merged[y].concat(src[y]);
          }
        });
        return merged;
      }
      function enrich(d) {
        const counts = mergedCounts(d);
        const films = mergedFilms(d);
        const yrs = Object.keys(counts).map(Number);
        const minOff = yrs.length ? d3.min(yrs) - d.year : 0;
        const maxOff = yrs.length ? d3.max(yrs) - d.year : 0;
        const debutYear = yrs.length ? d3.min(yrs) : d.year;
        return { ...d, counts, films, minOff, maxOff, debutYear };
      }

      const byDebut = (a, b) => a.debutYear - b.debutYear;
      menRows   = MARRIAGE.actors.map(enrich).sort(byDebut);
      womenRows = MARRIAGE.actresses.map(enrich).sort(byDebut);

      const allRows = [...menRows, ...womenRows];
      globalMin = d3.min(allRows, e => e.minOff);
      globalMax = d3.max(allRows, e => e.maxOff);
      offsets = d3.range(globalMin, globalMax + 1);

      maxCount = Math.max(
        d3.max(allRows, e => d3.max(offsets, off => e.counts[e.year + off] || 0)) || 1,
        4
      );
      ramp = ['#1a8090', '#28a8a8', '#3fc4b7', '#6ad6c1', '#9ee0c8', '#c5ead4', '#e5f5e1'];
      color = d3.scaleQuantize().domain([0.001, maxCount]).range(ramp);

      chartReady = true;
      buildLegend();
      render(false);
    }).catch(err => {
      d3.select('#mh-chart-men').html(
        `<div style="color:#c33;padding:20px;font-size:13px;">Could not load CSVs from age-wage-marriage/. ${err}</div>`
      );
    });

    // React when this slide becomes active, or when its r-steps toggle.
    const obs = new MutationObserver(() => {
      const isActive = slide.classList.contains('active');
      if (!isActive) {
        prevPhase = -1;
        return;
      }
      render(true);
    });
    obs.observe(slide, { attributes: true, attributeFilter: ['class'] });
    slide.querySelectorAll('.r-step[data-mh-step]').forEach(s => {
      obs.observe(s, { attributes: true, attributeFilter: ['class'] });
    });
  })();
