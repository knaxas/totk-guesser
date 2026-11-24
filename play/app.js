(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    stage: $("stage"),
    imageWrap: $("image-wrap"),
    image: $("location-image"),
    zoomHint: $("zoom-hint"),
    mapWrap: $("map-wrap"),
    mapPin: $("map-pin"),
    mapClose: $("map-close"),
    mapCatcher: $("map-catcher"),
    round: $("round"),
    score: $("score"),
    progress: $("progress"),
    message: $("message"),
    submit: $("submit"),
    restart: $("restart"),
    layerButtons: [...document.querySelectorAll("#layer-switch button")],
  };

  const MAX_POINTS = 5000;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");

  const state = {
    rounds: [],
    seedString: "",
    difficulty: "hard",
    index: 0,
    results: [],
    phase: "loading",
    guess: null,
    layer: "surface",
    pinned: false,
    displayedScore: 0,
  };

  const totalScore = () => state.results.reduce((sum, r) => sum + r.points, 0);
  const currentRound = () => state.rounds[state.index];
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  function calculateScore(distance) {
    if (distance <= 90) return MAX_POINTS;

    const excessDistance = distance - 80;
    const maxExcess = 1000 - 80;

    if (excessDistance >= maxExcess) {
      return Math.max(Math.round(500 * (1 - (excessDistance - maxExcess) / 4000)), 0);
    }
    const dropOff = Math.pow(excessDistance / maxExcess, 0.85);
    return Math.round(MAX_POINTS - (MAX_POINTS - 500) * dropOff);
  }

  function pointsColor(points) {
    if (points >= 4500) return "#30d158";
    if (points >= 2500) return "#ffd60a";
    if (points > 0) return "#ff9f0a";
    return "#ff453a";
  }

  const bounds = L.latLngBounds([-5000, -6000], [5000, 6000]);

  const map = L.map("totk-map", {
    crs: L.CRS.Simple,
    minZoom: -6,
    maxZoom: 0,
    zoomSnap: 0,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 110,
    maxBoundsViscosity: 1,
    attributionControl: false,
    preferCanvas: true,
    fadeAnimation: false,
  });

  map.createPane("overview").style.zIndex = 150;

  const overlays = {};
  function getOverlay(layer) {
    if (!overlays[layer]) {
      const overview = L.imageOverlay(`assets/images/maps/overview/${layer}.webp`, bounds, {
        pane: "overview",
        interactive: false,
      });
      const tiles = L.tileLayer(`assets/images/maps/tiles/${layer}/{z}/{x}_{y}.webp`, {
        bounds,
        tileSize: 256,
        minNativeZoom: -5,
        maxNativeZoom: -1,
        minZoom: -8,
        maxZoom: 0,
        noWrap: true,
        keepBuffer: 6,
        updateWhenZooming: false,
      });
      tiles.once("tileerror", () => overview.setUrl(`assets/images/maps/webp/${layer}.webp`));
      overlays[layer] = L.layerGroup([overview, tiles]);
    }
    return overlays[layer];
  }

  function preloadLayerOverviews() {
    TG.DIFFICULTIES[state.difficulty].layers.forEach((layer) => {
      new Image().src = `assets/images/maps/overview/${layer}.webp`;
    });
  }

  const guessMarker = L.marker([0, 0], {
    icon: L.divIcon({
      className: "",
      html: '<div class="guess-marker"><div class="pin"></div></div>',
      iconSize: [26, 32],
      iconAnchor: [13, 31],
    }),
    interactive: false,
    keyboard: false,
  });

  const answerMarker = L.marker([0, 0], {
    icon: L.divIcon({
      className: "",
      html: '<div class="answer-marker"></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    }),
    keyboard: false,
    zIndexOffset: 1000,
  });

  const lineLayer = L.layerGroup().addTo(map);

  const MAP_W = 12000, MAP_H = 10000;
  function zoomFor(size, cover = true) {
    const fit = cover ? Math.max(size.w / MAP_W, size.h / MAP_H) : Math.min(size.w / MAP_W, size.h / MAP_H);
    return Math.min(Math.log2(fit), map.getMaxZoom());
  }

  function mapSize() {
    const { x, y } = map.getSize();
    return { w: x, h: y };
  }

  function updateMinZoom() {
    const guessing = state.phase !== "revealed";
    map.setMinZoom(zoomFor(mapSize(), guessing));
    map.setMaxBounds(guessing ? bounds : null);
  }

  function showWholeMap() {
    updateMinZoom();
    map.setView(bounds.getCenter(), map.getMinZoom(), { animate: false });
  }

  function setLayer(layer) {
    if (!TG.DIFFICULTIES[state.difficulty].layers.includes(layer)) return;
    Object.entries(overlays).forEach(([name, ov]) => name !== layer && map.removeLayer(ov));
    getOverlay(layer).addTo(map);
    state.layer = layer;
    els.layerButtons.forEach((b) => {
      const active = b.dataset.layer === layer;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
    });
  }

  function applyDifficulty() {
    const allowed = TG.DIFFICULTIES[state.difficulty].layers;
    els.layerButtons.forEach((b) => (b.hidden = !allowed.includes(b.dataset.layer)));
    $("layer-switch").hidden = allowed.length < 2;
    if (!allowed.includes(state.layer)) setLayer("surface");
  }

  let collapseTimer = null;

  let autoFit = true;
  ["wheel", "pointerdown", "touchstart"].forEach((type) =>
    map.getContainer().addEventListener(type, () => (autoFit = false), { passive: true })
  );

  const FLIP_MS = 460;
  const FLIP_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  const FLIP_TRANSITION = `transform ${FLIP_MS}ms ${FLIP_EASE}, clip-path ${FLIP_MS}ms ${FLIP_EASE}`;
  let flip = null;

  function currentMode() {
    const c = els.mapWrap.classList;
    return c.contains("result") ? "result" : c.contains("expanded") ? "expanded" : "collapsed";
  }

  function applyMode(mode) {
    els.mapWrap.classList.toggle("expanded", mode === "expanded");
    els.mapWrap.classList.toggle("result", mode === "result");
  }

  function frameRect() {
    const w = els.mapWrap;
    return { x: w.offsetLeft, y: w.offsetTop, w: w.offsetWidth, h: w.offsetHeight };
  }

  function measureFrame(mode) {
    const before = els.mapWrap.className;
    applyMode(mode);
    const rect = frameRect();
    els.mapWrap.className = before;
    return rect;
  }

  function flipStyle(small, large, radius) {
    const s = Math.max(small.w / large.w, small.h / large.h);
    const dx = small.x + small.w / 2 - (large.x + large.w - (s * large.w) / 2);
    const dy = small.y + small.h / 2 - (large.y + large.h - (s * large.h) / 2);
    const ix = Math.max(0, (large.w - small.w / s) / 2);
    const iy = Math.max(0, (large.h - small.h / s) / 2);
    return {
      scale: s,
      transform: `translate(${dx}px, ${dy}px) scale(${s})`,
      clip: `inset(${iy}px ${ix}px ${iy}px ${ix}px round ${radius / s}px)`,
    };
  }

  function frameStyle(transform, clip, transition) {
    const st = els.mapWrap.style;
    st.transition = transition;
    st.transform = transform;
    st.clipPath = clip;
  }

  function setMapMode(mode, done) {
    clearTimeout(collapseTimer);
    if (flip) flip.finish();
    if (currentMode() === mode) {
      if (done) done();
      return;
    }

    const wrap = els.mapWrap;
    const from = frameRect();
    const to = measureFrame(mode);
    const grows = to.w * to.h >= from.w * from.h;
    const small = grows ? from : to;
    const large = grows ? to : from;
    const radius = parseFloat(getComputedStyle(wrap).borderTopLeftRadius) || 0;
    const f = flipStyle(small, large, radius);
    const dz = Math.log2(f.scale);
    const fit = autoFit && state.phase === "guessing";
    const center = fit ? bounds.getCenter() : map.getCenter();
    const smallZoom = grows
      ? (fit ? zoomFor(small) : map.getZoom())
      : (fit ? zoomFor(small) : map.getZoom() + dz);

    wrap.classList.add("animating");
    map.setMaxBounds(null);
    map.setMinZoom(-8);
    if (grows) applyMode(mode);
    map.invalidateSize({ animate: false, pan: false });
    map.setView(center, smallZoom - dz, { animate: false });

    const identity = `inset(0px 0px 0px 0px round ${radius}px)`;
    if (grows) {
      frameStyle(f.transform, f.clip, "none");
      void wrap.offsetWidth;
      frameStyle("translate(0px, 0px) scale(1)", identity, FLIP_TRANSITION);
    } else {
      frameStyle("translate(0px, 0px) scale(1)", identity, "none");
      void wrap.offsetWidth;
      frameStyle(f.transform, f.clip, FLIP_TRANSITION);
    }

    const finish = () => {
      clearTimeout(timer);
      flip = null;
      if (!grows) {
        applyMode(mode);
        map.invalidateSize({ animate: false, pan: false });
      }
      frameStyle("", "", "none");
      void wrap.offsetWidth;
      frameStyle("", "", "");
      wrap.classList.remove("animating");
      updateMinZoom();
      if (!grows) map.setView(center, Math.max(smallZoom, map.getMinZoom()), { animate: false });
      else if (map.getZoom() < map.getMinZoom()) map.setZoom(map.getMinZoom(), { animate: false });
      if (done) done();
    };
    const timer = setTimeout(finish, FLIP_MS + 20);
    flip = { finish };
  }

  function collapseMap() {
    if (state.pinned || state.phase !== "guessing") return;
    setMapMode("collapsed");
  }

  function setPinned(pinned) {
    state.pinned = pinned;
    els.mapPin.setAttribute("aria-pressed", pinned);
    if (pinned) setMapMode("expanded");
    else if (!els.mapWrap.matches(":hover")) collapseMap();
  }

  els.mapWrap.addEventListener("mouseenter", () => {
    clearTimeout(collapseTimer);
    if (canHover.matches && state.phase === "guessing") setMapMode("expanded");
  });

  els.mapWrap.addEventListener("mouseleave", () => {
    if (!canHover.matches) return;
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(collapseMap, 350);
  });

  els.mapCatcher.addEventListener("click", () => {
    if (state.phase === "guessing") setMapMode("expanded");
  });

  els.mapClose.addEventListener("click", () => {
    state.pinned = false;
    els.mapPin.setAttribute("aria-pressed", false);
    setMapMode("collapsed");
  });

  els.mapPin.addEventListener("click", () => setPinned(!state.pinned));

  const dock = $("dock");
  dock.addEventListener("mouseenter", () => clearTimeout(collapseTimer));
  dock.addEventListener("mouseleave", (e) => {
    if (!canHover.matches || els.mapWrap.contains(e.relatedTarget)) return;
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(collapseMap, 350);
  });

  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--dock-h", `${dock.offsetHeight}px`);
  }).observe(dock);

  window.addEventListener("resize", () => {
    map.invalidateSize({ animate: false });
    updateMinZoom();
  });

  map.on("click", (e) => {
    if (state.phase !== "guessing") return;
    const latlng = bounds.contains(e.latlng) ? e.latlng : bounds.getCenter();
    state.guess = { x: Math.round(latlng.lng), y: Math.round(latlng.lat) };
    guessMarker.remove();
    guessMarker.setLatLng(latlng).addTo(map);
    setSubmit("Submit Guess", true);
  });

  els.layerButtons.forEach((button) =>
    button.addEventListener("click", (e) => {
      setLayer(button.dataset.layer);
      if (e.detail > 0) button.blur();
    })
  );

  function setSubmit(label, enabled, ready = enabled) {
    els.submit.textContent = label;
    els.submit.disabled = !enabled;
    els.submit.classList.toggle("ready", ready);
  }

  function setMessage(html, tone = "") {
    els.message.innerHTML = html;
    els.message.classList.toggle("good", tone === "good");
    els.message.classList.toggle("bad", tone === "bad");
    bump(els.message);
  }

  function bump(el) {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  let scoreAnim = null;
  function animateScore(to) {
    cancelAnimationFrame(scoreAnim);
    const from = state.displayedScore;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / 800, 1);
      const value = from + (to - from) * (1 - Math.pow(1 - t, 3));
      els.score.textContent = fmt(value);
      if (t < 1) scoreAnim = requestAnimationFrame(step);
    };
    state.displayedScore = to;
    scoreAnim = requestAnimationFrame(step);
    bump(els.score.parentElement);
  }

  let toastTimer = null;
  function toast(text) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = text;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  const LAYER_ICONS = {
    sky: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z"/>',
    surface: '<path d="M3 19l6-10 4 6 2-3 6 7z"/>',
    depths: '<path d="M4 5h16M7 9h10M10 13h4M12 16v4M9 18l3 3 3-3"/>',
    unknown: '<circle cx="12" cy="12" r="8"/><path d="M10 10a2 2 0 1 1 2.5 1.9c-.4.2-.5.5-.5.9v.7M12 16.5v.01"/>',
  };
  const icon = (name) => `<svg class="h-icon" viewBox="0 0 24 24" aria-hidden="true">${LAYER_ICONS[name]}</svg>`;

  function renderHud() {
    els.round.innerHTML = `<b>${Math.min(state.index + 1, state.rounds.length)}</b>/${state.rounds.length}`;
    els.progress.innerHTML = state.rounds
      .map((_, i) => {
        const r = state.results[i];
        if (r) return `<span class="seg done" style="--c:${pointsColor(r.points)}"></span>`;
        return `<span class="seg${i === state.index ? " current" : ""}"></span>`;
      })
      .join("");
    renderHistory();
  }

  function renderHistory() {
    const list = $("history");
    if (!list) return;
    list.innerHTML = state.rounds
      .map((loc, i) => {
        const r = state.results[i];
        const n = `<span class="h-n">#${i + 1}</span>`;
        if (r) {
          const layer = TG.LAYERS[r.layer];
          const detail = r.guessLayer !== r.layer ? "wrong layer" : `${fmt(r.distance)} m`;
          const fresh = i === state.results.length - 1 && state.phase === "revealed";
          return `<li class="done${fresh ? "" : " old"}" style="--c:${pointsColor(r.points)};--lc:${layer.color}">
            ${n}${icon(r.layer)}<span class="h-text">${layer.label} · ${detail}</span><span class="h-pts">${fmt(r.points)}</span></li>`;
        }
        if (i === state.index && state.phase !== "finished") {
          return `<li class="current">${n}${icon("unknown")}<span class="h-text">Guessing…</span><span class="h-pts"></span></li>`;
        }
        return `<li>${n}${icon("unknown")}<span class="h-text">Image ${i + 1}</span><span class="h-pts">–</span></li>`;
      })
      .join("");
    const active = list.querySelector(".current") || list.lastElementChild;
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  const zoom = (() => {
    const wrap = els.imageWrap;
    const img = els.image;
    const MIN = 1;
    const MAX = 5;
    let scale = 1, x = 0, y = 0;
    let tScale = 1, tx = 0, ty = 0;
    let frame = null;
    const pointers = new Map();
    let pinch = null;
    let drag = null;
    let lastTap = 0;
    let lastPointerType = "mouse";

    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

    function clampTarget() {
      const rect = wrap.getBoundingClientRect();
      const maxX = (rect.width * (tScale - 1)) / 2;
      const maxY = (rect.height * (tScale - 1)) / 2;
      tx = clamp(tx, -maxX, maxX);
      ty = clamp(ty, -maxY, maxY);
    }

    function render() {
      const k = drag || pinch ? 0.45 : 0.22;
      scale += (tScale - scale) * k;
      x += (tx - x) * k;
      y += (ty - y) * k;
      img.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      if (Math.abs(tScale - scale) > 0.001 || Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1) {
        frame = requestAnimationFrame(render);
      } else {
        frame = null;
      }
    }

    function animate() {
      wrap.classList.toggle("zoomed", tScale > 1.01);
      if (!frame) frame = requestAnimationFrame(render);
    }

    function zoomAt(clientX, clientY, newScale) {
      newScale = clamp(newScale, MIN, MAX);
      if (newScale === tScale) return;
      const rect = wrap.getBoundingClientRect();
      const mx = clientX - rect.left - rect.width / 2;
      const my = clientY - rect.top - rect.height / 2;
      const factor = newScale / tScale - 1;
      tx -= (mx - tx) * factor;
      ty -= (my - ty) * factor;
      tScale = newScale;
      clampTarget();
      animate();
      hideZoomHint();
    }

    function toggleZoom(clientX, clientY) {
      if (tScale > 1.05) {
        tScale = 1;
        tx = ty = 0;
        animate();
      } else {
        zoomAt(clientX, clientY, 2.5);
      }
    }

    function reset() {
      scale = tScale = 1;
      x = y = tx = ty = 0;
      pointers.clear();
      pinch = drag = null;
      img.style.transform = "";
      wrap.classList.remove("zoomed", "dragging");
      peekMap(false);
    }

    function peekMap(away) {
      const mapBusy = els.mapWrap.classList.contains("expanded") || els.mapWrap.classList.contains("result");
      els.mapWrap.classList.toggle("peek-away", away && !mapBusy);
    }

    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    wrap.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 0.05 : 0.0018;
        zoomAt(e.clientX, e.clientY, tScale * Math.exp(-e.deltaY * unit));
      },
      { passive: false }
    );

    wrap.addEventListener("dblclick", (e) => {
      if (lastPointerType === "touch") return;
      toggleZoom(e.clientX, e.clientY);
    });

    wrap.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      lastPointerType = e.pointerType;
      wrap.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: distance(a, b), scale: tScale };
        drag = null;
      } else if (pointers.size === 1 && tScale > 1.01) {
        drag = { x: e.clientX - tx, y: e.clientY - ty };
        wrap.classList.add("dragging");
        peekMap(true);
      }
    });

    wrap.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;

      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const mid = midpoint(a, b);
        zoomAt(mid.x, mid.y, pinch.scale * (distance(a, b) / pinch.dist));
      } else if (drag) {
        tx = e.clientX - drag.x;
        ty = e.clientY - drag.y;
        clampTarget();
        animate();
      }
    });

    function endPointer(e) {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      pointers.delete(e.pointerId);

      if (e.type === "pointerup" && e.pointerType === "touch" && !pinch &&
          Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 10) {
        const now = performance.now();
        if (now - lastTap < 300) {
          toggleZoom(e.clientX, e.clientY);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }

      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1 && tScale > 1.01) {
        const [rest] = pointers.values();
        drag = { x: rest.x - tx, y: rest.y - ty };
      } else if (pointers.size === 0) {
        drag = null;
        wrap.classList.remove("dragging");
        peekMap(false);
      }
    }

    wrap.addEventListener("pointerup", endPointer);
    wrap.addEventListener("pointercancel", endPointer);

    return { reset };
  })();

  let hintTimer = null;
  function showZoomHint() {
    if (TG.store.get("seenZoomHint")) return;
    els.zoomHint.textContent = canHover.matches
      ? "Scroll to zoom · drag to pan · double-click to zoom in"
      : "Pinch or double-tap to zoom";
    els.zoomHint.classList.add("show");
    hintTimer = setTimeout(hideZoomHint, 5000);
  }

  function hideZoomHint() {
    if (!els.zoomHint.classList.contains("show")) return;
    clearTimeout(hintTimer);
    els.zoomHint.classList.remove("show");
    TG.store.set("seenZoomHint", "1");
  }

  function loadImage(loc) {
    return new Promise((resolve) => {
      els.stage.classList.add("loading");
      const img = els.image;
      let triedFallback = false;
      img.onload = () => {
        els.stage.classList.remove("loading");
        const backdrop = $("backdrop-image");
        backdrop.classList.remove("show");
        backdrop.onload = () => backdrop.classList.add("show");
        backdrop.src = img.currentSrc || img.src;
        resolve();
      };
      img.onerror = () => {
        if (!triedFallback) {
          triedFallback = true;
          img.src = TG.imageFallbackUrl(loc);
        } else {
          els.stage.classList.remove("loading");
          setMessage('<span class="warn">This image could not be loaded.</span>');
          resolve();
        }
      };
      img.src = TG.imageUrl(loc);
    });
  }

  function preload(loc) {
    if (!loc) return;
    const img = new Image();
    img.onerror = () => (img.src = TG.imageFallbackUrl(loc));
    img.src = TG.imageUrl(loc);
  }

  function startRound() {
    state.phase = "guessing";
    state.guess = null;
    guessMarker.remove();
    answerMarker.remove();
    lineLayer.clearLayers();
    zoom.reset();

    autoFit = true;
    setLayer("surface");
    setMapMode(state.pinned ? "expanded" : "collapsed", showWholeMap);

    renderHud();
    const multi = TG.DIFFICULTIES[state.difficulty].layers.length > 1;
    setMessage(
      `<span class="title">Where could this be?</span>` +
        `<span>${multi ? "Choose the right layer and drop a pin." : "Drop a pin on the map."}</span>`
    );
    setSubmit("Submit Guess", false);

    const loc = currentRound();
    loadImage(loc).then(() => preload(state.rounds[state.index + 1]));
  }

  function reveal() {
    if (state.phase !== "guessing" || !state.guess) return;
    const loc = currentRound();
    const g = state.guess;
    const distance = Math.hypot(g.x - loc.x, g.y - loc.y);
    const correctLayer = state.layer === loc.layer;
    const points = correctLayer ? calculateScore(distance) : 0;

    state.results.push({ key: loc.key, layer: loc.layer, guessLayer: state.layer, distance, points });
    state.phase = "revealed";
    saveProgress();

    if (!correctLayer) setLayer(loc.layer);

    const answer = L.latLng(loc.y, loc.x);
    const guess = L.latLng(g.y, g.x);
    lineLayer.clearLayers();
    L.polyline([guess, answer], {
      color: correctLayer ? "#ffffff" : "#ff453a",
      weight: 3,
      opacity: 0.95,
      dashArray: "0.1 8",
      lineCap: "round",
      interactive: false,
    }).addTo(lineLayer);
    answerMarker
      .setLatLng(answer)
      .addTo(map)
      .unbindTooltip()
      .bindTooltip(`${TG.LAYERS[loc.layer].label} · X ${loc.x} · Y ${loc.y}`, {
        className: "result-tip",
        direction: "top",
        offset: [0, -24],
      });

    setMapMode("result", () => {
      const padX = Math.min(130, map.getSize().x * 0.3);
      map.fitBounds(L.latLngBounds([guess, answer]), {
        paddingTopLeft: [padX, 90],
        paddingBottomRight: [padX, 50],
        maxZoom: -1,
        animate: true,
      });
      answerMarker.openTooltip();
    });

    animateScore(totalScore());
    renderHud();

    const flavour =
      points === MAX_POINTS ? "Perfect! 🎯" :
      points >= 4000 ? "Great guess!" :
      points >= 2000 ? "Not bad!" :
      points > 0 ? "Way off…" : "";

    if (correctLayer) {
      setMessage(
        `<span class="points">+${fmt(points)}</span>` +
          `<span><strong>${fmt(distance)} m</strong> away${flavour ? " · " + flavour : ""}</span>`,
        points >= 2000 ? "good" : "bad"
      );
    } else {
      setMessage(
        `<span class="points zero">+0</span>` +
          `<span><span class="warn">Wrong layer!</span> This was in the <strong>${TG.LAYERS[loc.layer].label}</strong>.</span>`,
        "bad"
      );
    }

    const last = state.index >= state.rounds.length - 1;
    setSubmit(last ? "See Results" : "Next Image", true, false);
    els.submit.focus({ preventScroll: true });
  }

  function nextRound() {
    if (state.phase !== "revealed") return;
    if (state.index >= state.rounds.length - 1) {
      finish();
      return;
    }
    state.index++;
    startRound();
  }

  function onPrimary() {
    if (state.phase === "guessing") reveal();
    else if (state.phase === "revealed") nextRound();
  }

  els.submit.addEventListener("click", onPrimary);
  els.restart.addEventListener("click", () => {
    clearProgress();
    window.location.href = "guess.html";
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    const onControl = tag === "button" || tag === "a";

    if ((e.key === " " || e.key === "Enter") && !onControl && state.phase !== "finished") {
      e.preventDefault();
      if (!els.submit.disabled) onPrimary();
      return;
    }

    const layerKeys = { 1: "sky", 2: "surface", 3: "depths" };
    if (layerKeys[e.key]) {
      const btn = els.layerButtons.find((b) => b.dataset.layer === layerKeys[e.key]);
      if (btn && !btn.hidden) setLayer(layerKeys[e.key]);
    } else if (e.key === "m" || e.key === "M") {
      if (state.phase === "guessing") setPinned(!state.pinned);
    } else if (e.key === "Escape") {
      if (state.phase === "guessing" && !state.pinned) setMapMode("collapsed");
    }
  });

  const progressKey = () => `tg-progress:${state.seedString}`;

  function saveProgress() {
    try {
      sessionStorage.setItem(progressKey(), JSON.stringify({ results: state.results }));
    } catch {}
  }

  function clearProgress() {
    try {
      sessionStorage.removeItem(progressKey());
    } catch {}
  }

  function restoreProgress() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(progressKey()) || "null");
      if (!saved || !Array.isArray(saved.results)) return;
      if (saved.results.length >= state.rounds.length) {
        clearProgress();
        return;
      }
      state.results = saved.results;
      state.index = saved.results.length;
      if (state.index > 0) toast(`Welcome back – continuing at image ${state.index + 1}.`);
    } catch {}
  }

  function shareUrl() {
    const url = new URL(window.location.href);
    url.search = `?seed=${state.seedString}`;
    url.hash = "";
    return url.toString();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {}
      ta.remove();
      return ok;
    }
  }

  function finish() {
    state.phase = "finished";
    clearProgress();
    setSubmit("Game Over", false, false);

    const score = totalScore();
    const max = state.rounds.length * MAX_POINTS;
    const pct = (score / max) * 100;
    const diff = TG.DIFFICULTIES[state.difficulty];

    const rank =
      pct >= 90 ? { title: "Hero of Hyrule", color: "#30d158" } :
      pct >= 70 ? { title: "Master Navigator", color: "#64d2ff" } :
      pct >= 40 ? { title: "Adventurer", color: "#ffd60a" } :
                  { title: "Lost Korok", color: "#ff9f0a" };

    const best = TG.store.get(`best:${state.difficulty}:${state.rounds.length}`);
    const isRecord = !best || score > Number(best);
    if (isRecord) TG.store.set(`best:${state.difficulty}:${state.rounds.length}`, score);

    const rows = state.results
      .map((r, i) => {
        const layer = TG.LAYERS[r.layer];
        const wrong = r.guessLayer !== r.layer;
        return `<li style="--c:${pointsColor(r.points)};animation-delay:${1.2 + i * 0.08}s">
          <span class="n">#${i + 1}</span>
          <span class="layer" style="color:${layer.color}">${layer.label}</span>
          <span class="dist">${wrong ? "wrong layer" : fmt(r.distance) + " m"}</span>
          <span class="pts" style="color:${pointsColor(r.points)}">${fmt(r.points)}</span>
        </li>`;
      })
      .join("");

    const overlay = document.createElement("div");
    overlay.className = "end-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Results");
    overlay.innerHTML = `
      <div class="end-box" style="--rank:${rank.color}">
        <div class="end-diff">${diff.label} · ${state.rounds.length} images</div>
        <div class="end-rank">${rank.title}</div>
        <div class="end-sub">Your score</div>
        <div class="end-score" id="end-score">0</div>
        <div class="end-max">of ${fmt(max)} points · ${
          isRecord ? "New personal best" : `Best: ${fmt(Number(best))}`
        }</div>
        <ul class="end-rounds">${rows}</ul>
        <div class="end-actions" id="end-actions">
          <button type="button" class="main" id="end-again">Play Again</button>
          <button type="button" id="end-copy">Copy Link</button>
          <a href="index.html">Home</a>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector("#end-again").addEventListener("click", () => {
      window.location.href = "guess.html";
    });
    const copyBtn = overlay.querySelector("#end-copy");
    copyBtn.addEventListener("click", async () => {
      const ok = await copyText(shareUrl());
      copyBtn.textContent = ok ? "Copied!" : "Copy failed";
      setTimeout(() => (copyBtn.textContent = "Copy Link"), 2000);
    });

    requestAnimationFrame(() => overlay.classList.add("show"));

    const scoreEl = overlay.querySelector("#end-score");
    const actions = overlay.querySelector("#end-actions");
    setTimeout(() => {
      const start = performance.now();
      const duration = 2000;
      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        scoreEl.textContent = fmt(score * (1 - Math.pow(1 - t, 4)));
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          scoreEl.style.transform = "scale(1.12)";
          setTimeout(() => (scoreEl.style.transform = ""), 250);
          actions.classList.add("show");
          overlay.querySelector("#end-again").focus({ preventScroll: true });
        }
      };
      requestAnimationFrame(step);
    }, 500);
  }

  async function init() {
    els.stage.classList.add("loading");
    let locations;
    try {
      locations = await TG.loadLocations();
    } catch (err) {
      console.error(err);
      els.stage.classList.remove("loading");
      setMessage(
        '<span class="warn">Could not load the locations.</span>' +
          "<span>If you opened the file directly, run it through a local web server.</span>"
      );
      return;
    }

    const parts = TG.seedPartsFromUrl();
    if (parts.length) {
      const { rounds, invalid } = TG.resolveSeeds(parts, locations);
      if (rounds.length) {
        state.rounds = rounds.slice(0, TG.MAX_ROUNDS);
        if (invalid.length) toast(`Ignored ${invalid.length} invalid seed value(s).`);
      } else {
        toast("That seed doesn't match any images – starting a random game.");
      }
    }

    if (state.rounds.length) {
      state.difficulty = TG.difficultyForRounds(state.rounds);
    } else {
      const settings = TG.getSettings();
      state.difficulty = settings.difficulty;
      state.rounds = TG.generateRounds(locations, settings.difficulty, settings.rounds);
      TG.rememberPlayed(state.rounds);
    }

    state.seedString = TG.joinSeeds(state.rounds.map((r) => TG.encodeSeed(r.n)));
    try {
      window.history.replaceState(null, "", `?seed=${state.seedString}`);
    } catch {}

    applyDifficulty();
    restoreProgress();
    state.displayedScore = totalScore();
    els.score.textContent = fmt(state.displayedScore);

    startRound();
    showZoomHint();
    preloadLayerOverviews();
  }

  init();
})();
