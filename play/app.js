let x, y, xImage, yImage, layerImage, currentLayer;
let score = 0,
  distance = 0,
  imageRound = 1,
  seedForPlayingAgain,
  seedQueue;
let maxImages =
  parseInt(localStorage.getItem("maxRounds"), 10) ||
  localStorage.setItem("maxRounds", 5);
let difficulty =
  localStorage.getItem("difficulty") ||
  localStorage.setItem("difficulty", "hard");

if (isNaN(maxImages) || maxImages < 3 || maxImages > 15) {
  maxImages = 5;
  localStorage.setItem("maxRounds", 5);
}

let markerSet = false;
let isMultiplayer;

let scale = 1;
let translateX = 0,
  translateY = 0;
const zoomSpeed = 0.3;

let isDragging = false;
let dragStartX = 0,
  dragStartY = 0;

window.addEventListener("load", () => {
  let hoverableMap = true;
  const totkMap = document.querySelector(".totkMapC") || document.getElementById("totk-map");
  const imageUsageCount = {};

  const getMapSize = () => {
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      return {
        hoverWidth: "80%",
        hoverHeight: "55vh",
        defaultWidth: "80%",
        defaultHeight: "10%",
      };
    } else {
      return {
        hoverWidth: "70%",
        hoverHeight: "85vh",
        defaultWidth: "20%",
        defaultHeight: "25%",
      };
    }
  };
  const size = getMapSize();
  let resizeAnimationFrame = null;
  let resizeAnimationStart = 0;
  const resizeAnimationDuration = 300;

  function stopResizeAnimation() {
    if (resizeAnimationFrame) {
      cancelAnimationFrame(resizeAnimationFrame);
      resizeAnimationFrame = null;
    }
  }

  function syncMapToContainer() {
    if (map) {
      map.invalidateSize({ pan: false });
    }
  }

  function animateMapResize() {
    stopResizeAnimation();
    resizeAnimationStart = performance.now();

    const tick = () => {
      const elapsed = performance.now() - resizeAnimationStart;
      const progress = Math.min(elapsed / resizeAnimationDuration, 1);

      syncMapToContainer();

      if (progress < 1) {
        resizeAnimationFrame = requestAnimationFrame(tick);
      } else {
        stopResizeAnimation();
        syncMapToContainer();
      }
    };

    resizeAnimationFrame = requestAnimationFrame(tick);
  }

  totkMap.style.transition = "width 0.3s ease-in-out, height 0.3s ease-in-out";
  totkMap.style.width = size.defaultWidth;
  totkMap.style.height = size.defaultHeight;

  totkMap.addEventListener("mouseenter", () => {
    if (hoverableMap !== false) {
      const size = getMapSize();
      stopResizeAnimation();
      totkMap.style.height = size.hoverHeight;
      totkMap.style.width = size.hoverWidth;
      totkMap.style.marginTop = "50px";
      animateMapResize();
    }
  });

  totkMap.addEventListener("mouseleave", () => {
    if (hoverableMap !== false) {
      const size = getMapSize();
      stopResizeAnimation();
      totkMap.style.width = size.defaultWidth;
      totkMap.style.height = size.defaultHeight;
      animateMapResize();
    }
  });

  document.body.style.backgroundImage = "url(assets/images/totkBackground.png)";
  document.getElementById(
    "imageTurn"
  ).innerHTML = `IMG: <x style="color: red;">1</x>/${maxImages}`;

  (function () {
    const container = document.getElementById("image-container");
    const img = document.getElementById("location-image");
    const totkMap = document.querySelector(".totkMapC") || document.getElementById("totk-map");

    if (totkMap) {
      totkMap.style.transition = "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s ease-in-out, height 0.3s ease-in-out";
    }

    let currentScale = 1;
    let targetScale = 1;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const minScale = 1;
    const maxScale = 5;
    const zoomFactor = 0.2;
    const lerpFactor = 0.2;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let isAnimating = false;

    function clamp(val, min, max) {
      return Math.min(Math.max(val, min), max);
    }

    function updateBounds() {
      const rect = container.getBoundingClientRect();
      const maxTransX = (rect.width * (targetScale - 1)) / 2;
      const maxTransY = (rect.height * (targetScale - 1)) / 2;

      targetX = clamp(targetX, -maxTransX, maxTransX);
      targetY = clamp(targetY, -maxTransY, maxTransY);
    }

    function render() {
      currentScale += (targetScale - currentScale) * lerpFactor;
      currentX += (targetX - currentX) * lerpFactor;
      currentY += (targetY - currentY) * lerpFactor;

      img.style.transform = `translate3d(${currentX}px, ${currentY}px, 0px) scale(${currentScale})`;

      if (
        Math.abs(targetScale - currentScale) > 0.001 ||
        Math.abs(targetX - currentX) > 0.01 ||
        Math.abs(targetY - currentY) > 0.01 ||
        isDragging
      ) {
        requestAnimationFrame(render);
      } else {
        isAnimating = false;
      }
    }

    function startAnimationLoop() {
      if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(render);
      }
    }

    function slideOutMap() {
      if (totkMap) {
        totkMap.style.opacity = "0";
        totkMap.style.transform = "translateX(120%)";
        totkMap.style.pointerEvents = "none";
      }
    }

    function slideInMap() {
      if (totkMap) {
        totkMap.style.opacity = "1";
        totkMap.style.transform = "translateX(0)";
        totkMap.style.pointerEvents = "auto";
      }
    }

    container.addEventListener("wheel", (e) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      const delta = e.deltaY < 0 ? 1 + zoomFactor : 1 - zoomFactor;
      const newScale = clamp(targetScale * delta, minScale, maxScale);

      if (newScale !== targetScale) {
        const factor = newScale / targetScale - 1;
        targetX -= (mouseX - targetX) * factor;
        targetY -= (mouseY - targetY) * factor;
        targetScale = newScale;

        updateBounds();
        startAnimationLoop();
      }
    }, { passive: false });

    container.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;

      if (targetScale > 1) {
        e.preventDefault();
        slideOutMap();

        isDragging = true;
        startX = e.clientX - targetX;
        startY = e.clientY - targetY;
        container.style.cursor = "grabbing";
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      targetX = e.clientX - startX;
      targetY = e.clientY - startY;

      updateBounds();
      startAnimationLoop();
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        slideInMap();
        if (isDragging) {
          isDragging = false;
          container.style.cursor = "grab";
        }
      }
    });

    window.resetImageZoom = function () {
      targetScale = 1;
      targetX = 0;
      targetY = 0;
      currentScale = 1;
      currentX = 0;
      currentY = 0;
      isDragging = false;
      container.style.cursor = "default";
      img.style.transform = `translate3d(0px, 0px, 0px) scale(1)`;
      slideInMap();
    };
  })();

  const mapConfig = {
    preferCanvas: true,
    minZoom: -3,
    maxZoom: 0,
    center: [1800, -3450],
    zoom: -3,
    cursor: true,
    crs: L.CRS.Simple,
    attributionControl: false
  };

  const map = L.map("totk-map", mapConfig);

  const bounds = new L.LatLngBounds(
    map.unproject([-6000, 5000], 0),
    map.unproject([6000, -5000], 0)
  );
  map.setMaxBounds(bounds);

  const cursorIcon = L.icon({
    iconUrl: "assets/images/icons/selectionmarker.png",
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  const cursorMarker = L.marker([0, 0], {
    icon: cursorIcon,
    autoPan: false,
  });
  const finishMarker = L.marker();
  const lineLayer = L.layerGroup();

  const layers = {
    sky: L.imageOverlay("assets/images/maps/sky.jpg", bounds),
    surface: L.imageOverlay("assets/images/maps/surface.jpg", bounds),
    depths: L.imageOverlay("assets/images/maps/depths.jpg", bounds),
  };

  const zoomLayers = {
    zoom1: L.layerGroup(),
    zoom2: L.layerGroup(),
  };

  function initializeMap() {
    map.on("click", handleMapClick);
    map.on("zoom", updateLocations);

    jQuery("#show-layer-sky").click(() => activateLayer("sky"));
    jQuery("#show-layer-surface").click(() => activateLayer("surface"));
    jQuery("#show-layer-depths").click(() => activateLayer("depths"));

    applyDifficultyLayerVisibility();
    activateLayer("surface");
    jQuery("#show-layer-surface").trigger("click");
  }

  function handleMapClick(e) {
    x = Math.round(e.latlng.lng);
    y = Math.round(e.latlng.lat);

    cursorMarker
      .setLatLng([e.latlng.lat + 0, e.latlng.lng + 4])
      .bindPopup(generateMarkerPopup("Marker Position", x, y))
      .openPopup()
      .addTo(map);

    markerSet = true;
    document.getElementById("submit-marker").disabled = false;
  }

  function updateLocations() {
    if (currentLayer !== "surface") {
      map.removeLayer(zoomLayers.zoom1);
      map.removeLayer(zoomLayers.zoom2);
      return;
    }

    const zoomLevel = map.getZoom();
    if (zoomLevel <= -3) {
      map.addLayer(zoomLayers.zoom1);
      map.removeLayer(zoomLayers.zoom2);
    } else {
      map.removeLayer(zoomLayers.zoom1);
      map.addLayer(zoomLayers.zoom2);
    }
  }

  function activateLayer(layer) {
    Object.values(layers).forEach((l) => map.removeLayer(l));
    layers[layer].addTo(map);
    currentLayer = layer;
    updateLocations();
  }

  function generateMarkerPopup(title, x, y) {
    return `
            <div class='totk-marker'>
                <h2>${title}</h2>
                <div class='content'>
                    <div class='totk-marker-meta'>
                        <span><strong>X:</strong> ${x}</span>
                        <span><strong>Y:</strong> ${y}</span>
                    </div>
                </div>
            </div>`;
  }

  function applyDifficultyLayerVisibility() {
    const validDifficulties = ["easy", "medium", "hard"];
    if (!validDifficulties.includes(difficulty)) {
      difficulty = "hard";
      localStorage.setItem("difficulty", "hard");
    }

    const allowedLayers = {
      easy: ["surface"],
      medium: ["surface", "sky"],
      hard: ["surface", "sky", "depths"],
    }[difficulty];

    const layerButtons = {
      sky: document.getElementById("show-layer-sky"),
      surface: document.getElementById("show-layer-surface"),
      depths: document.getElementById("show-layer-depths"),
    };

    Object.keys(layerButtons).forEach((layer) => {
      const button = layerButtons[layer];
      if (!button) return;

      const isAllowed = allowedLayers.includes(layer);
      button.style.display = isAllowed ? "inline-block" : "none";
      button.disabled = !isAllowed;
    });

    if (currentLayer && !allowedLayers.includes(currentLayer)) {
      activateLayer(allowedLayers[0]);
    }
  }

  function getFilteredPool(data) {
    const validDifficulties = ["easy", "medium", "hard"];
    if (!validDifficulties.includes(difficulty)) {
      difficulty = "hard";
      localStorage.setItem("difficulty", "hard");
    }

    const allKeys = Object.keys(data);
    
    const pools = {
      surface: allKeys.filter(k => data[k] && data[k].split("_")[0] === "surface"),
      sky: allKeys.filter(k => data[k] && data[k].split("_")[0] === "sky"),
      depths: allKeys.filter(k => data[k] && data[k].split("_")[0] === "depths"),
    };

    if (difficulty === "easy") {
      return pools.surface;
    } else if (difficulty === "medium") {
      const targetSky = Math.round(maxImages / 2);
      const targetSurface = maxImages - targetSky;
      return [
        ...shuffle(pools.surface).slice(0, targetSurface),
        ...shuffle(pools.sky).slice(0, targetSky)
      ];
    } else {
      const baseCount = Math.floor(maxImages / 3);
      const remainder = maxImages % 3;
      
      let targetSurface = baseCount;
      let targetSky = baseCount;
      let targetDepths = baseCount;

      if (remainder === 1) {
        targetSurface += 1;
      } else if (remainder === 2) {
        targetSurface += 1;
        targetSky += 1;
      }

      return shuffle([
        ...shuffle(pools.surface).slice(0, targetSurface),
        ...shuffle(pools.sky).slice(0, targetSky),
        ...shuffle(pools.depths).slice(0, targetDepths)
      ]);
    }
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function getRandomHistoryKey() {
    return "randomHistory";
  }

  function pickNextImageKey(data) {
    const pool = getFilteredPool(data);
    if (pool.length === 0) {
      throw new Error(
        "Keine passenden Bilder für die aktuelle Schwierigkeit gefunden."
      );
    }

    const historyKey = getRandomHistoryKey();
    const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
    const counts = {};

    pool.forEach((key) => {
      counts[key] = 0;
    });

    history.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(counts, key)) {
        counts[key] += 1;
      }
    });

    const minCount = Math.min(...Object.values(counts));
    const eligibleKeys = pool.filter((key) => (counts[key] || 0) === minCount);
    const imageKey = eligibleKeys[Math.floor(Math.random() * eligibleKeys.length)];

    history.push(imageKey);
    localStorage.setItem(historyKey, JSON.stringify(history));

    return imageKey;
  }

  async function loadLocationData() {
    try {
      const response = await fetch(`assets/images/locations/locations.json`);
      if (!response.ok) throw new Error(`Error: ${response.status}`);
      const data = await response.json();

      const imageKey = pickNextImageKey(data);
      imageUsageCount[imageKey] = (imageUsageCount[imageKey] || 0) + 1;

      const imageNumber = parseInt(imageKey.replace("img", ""), 10);
      const seed = calculateSeed(imageNumber);

      const [layer, x, y] = data[imageKey].split("_");
      layerImage = layer;
      xImage = parseInt(x, 10);
      yImage = parseInt(y, 10);

      document.getElementById(
        "location-image"
      ).src = `assets/images/locations/${imageKey}.png`;

      updateURLWithSeed(seed);
    } catch (error) {
      console.error("Fehler beim Laden der Daten:", error);
    }
  }

  function calculateSeed(imageNumber) {
    let seed = imageNumber * 137;
    seed = (seed * 19 + 123456) % 1000000;
    seedForPlayingAgain = seed;

    return seed;
  }

  function updateURLWithSeed(seed) {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("seed", seed);
    window.history.pushState({}, "", currentUrl);
  }

  function getSeedQueueFromUrl() {
    const raw = window.location.search.replace(/^\?/, "").split("&").filter(Boolean);
    const queue = [];

    raw.forEach((part) => {
      if (!part) return;

      const separatorIndex = part.indexOf("=");
      if (separatorIndex !== -1) {
        const key = part.slice(0, separatorIndex);
        const value = part.slice(separatorIndex + 1).trim();
        if (key === "seed" && value && /^\d+$/.test(value)) {
          queue.push(value);
        }
        return;
      }

      if (/^\d+$/.test(part.trim())) {
        queue.push(part.trim());
      }
    });

    return queue.join("&");
  }

  function syncSeedQueueWithUrl() {
    const queueValue = getSeedQueueFromUrl();
    if (queueValue) {
      seedQueue = queueValue;
      localStorage.setItem("seedQueue", queueValue);
      return queueValue;
    }

    seedQueue = localStorage.getItem("seedQueue") || "";
    if (!seedQueue) {
      localStorage.removeItem("seedQueue");
    }
    return seedQueue;
  }

  async function getImageKeyFromSeed() {
    const response = await fetch(`assets/images/locations/locations.json`);
    if (!response.ok) throw new Error(`Error: ${response.status}`);
    const data = await response.json();

    const seedQueueValue = syncSeedQueueWithUrl();
    const seedSequence = seedQueueValue ? seedQueueValue.split("&").filter(Boolean) : [];
    const seed = seedSequence[0];
    const parsedSeed = parseInt(seed, 10);

    if (seedSequence.length > 1) {
      isMultiplayer = true;
      maxImages = seedSequence.length;
      localStorage.removeItem("lastRandomImageKey");
      localStorage.removeItem("bild2");
      localStorage.removeItem("randomHistory");

      const currentSeed = seedSequence[Math.max(0, imageRound - 1)] || seedSequence[0];
      const currentSeedNumber = parseInt(currentSeed, 10);
      const imageNumber = (currentSeedNumber - 123456) / 19;
      const resolvedImageNumber = imageNumber / 137;
      const imageKey = `img${resolvedImageNumber}`;
      const keyedImage = data[imageKey] || data[`img${Math.round(resolvedImageNumber)}`];

      if (keyedImage) {
        seedForPlayingAgain = currentSeedNumber;
        const [layer, x, y] = keyedImage.split("_");
        layerImage = layer;
        xImage = parseInt(x, 10);
        yImage = parseInt(y, 10);
        document.getElementById(
          "location-image"
        ).src = `assets/images/locations/${imageKey}.png`;
      } else {
        loadLocationData();
      }
    } else {
      let imageNumber = (parsedSeed - 123456) / 19;
      imageNumber = imageNumber / 137;
      seedForPlayingAgain = parsedSeed;

      if (imageNumber >= 1 && imageNumber <= 61) {
        const imageKey = `img${imageNumber}`;
        loadImage(imageKey);
      } else {
        loadLocationData();
      }
    }
  }

  async function loadImage(imageKey) {
    const response = await fetch(`assets/images/locations/locations.json`);
    if (!response.ok) throw new Error(`Error: ${response.status}`);
    const data = await response.json();

    const [layer, x, y] = data[imageKey].split("_");
    layerImage = layer;
    xImage = parseInt(x, 10);
    yImage = parseInt(y, 10);

    document.getElementById(
      "location-image"
    ).src = `assets/images/locations/${imageKey}.png`;
  }

  function checkValidUrl() {
    const seedQueueValue = getSeedQueueFromUrl();

    if (seedQueueValue) {
      seedQueue = seedQueueValue;
      localStorage.setItem("seedQueue", seedQueueValue);
      getImageKeyFromSeed();
    } else {
      seedQueue = "";
      localStorage.removeItem("seedQueue");
      loadLocationData();
    }
  }

function calculateScore(x, y, xImage, yImage) {
    distance = Math.sqrt(Math.pow(x - xImage, 2) + Math.pow(y - yImage, 2));
    const maxScore = 5000;
    
    if (distance <= 90) return { points: maxScore, distance };

    const excessDistance = distance - 80;
    const maxExcess = 1000 - 80; 

    if (excessDistance >= maxExcess) {
      const points = Math.max(Math.round(500 * (1 - (excessDistance - maxExcess) / 4000)), 0);
      return { points, distance };
    }
    const dropOff = Math.pow(excessDistance / maxExcess, 0.85);
    const points = Math.round(maxScore - (maxScore - 500) * dropOff);

    return { points, distance };
  }

  function drawLine() {
    lineLayer.clearLayers();
    const line = L.polyline(
      [
        [y, x],
        [yImage, xImage],
      ],
      { color: "red", weight: 2 }
    );
    lineLayer.addLayer(line).addTo(map);
  }

  function getResult() {
    if (currentLayer !== layerImage) {
      updateInnerHTMLWithAnimation(
        "customMessage",
        "Falsche Ebene :D"
      );
      return;
    }

    drawLine();

    const { points, distance } = calculateScore(x, y, xImage, yImage);
    score += points;

    document.getElementById(
      "imageTurn"
    ).innerHTML = `IMG: <span style="color: red;">${imageRound}</span>/${maxImages}`;
    updateInnerHTMLWithAnimation("score", `SCORE: ${score}`);
    updateInnerHTMLWithAnimation(
      "customMessage",
      `Distance: ${Math.round(
        distance
      )} Hm <br> <x style="color: #13fc03;">+${points}</x> points`
    );
  }

  document.getElementById("submit-marker").addEventListener("click", () => {
    if (!markerSet) return;

    const buttonText = document.getElementById("submit-marker").innerText.trim().toUpperCase();

    if (buttonText === "SUBMIT") {
      finishMarker
        .setLatLng([yImage, xImage])
        .bindPopup(generateMarkerPopup("Korrekte Position", xImage, yImage))
        .openPopup()
        .addTo(map);

      getResult();

      const queueFromStorage = localStorage.getItem("seedQueue") || getSeedQueueFromUrl() || "";
      const queueParts = queueFromStorage ? queueFromStorage.split("&").filter(Boolean) : [];
      const nextSeed = String(seedForPlayingAgain ?? "");

      if (nextSeed && !queueParts.includes(nextSeed)) {
        queueParts.push(nextSeed);
      }

      const nextQueue = queueParts.join("&");
      seedQueue = nextQueue;
      localStorage.setItem("seedQueue", nextQueue);

      totkMap.style.width = "80%";
      totkMap.style.height = "90%";
      totkMap.style.bottom = "6%";
      map.setZoom(-3);
      map.setView([2000, -5000], map.getZoom());

      setTimeout(() => map.invalidateSize({ pan: false }), 300);
      hoverableMap = false;

      if (imageRound > maxImages - 1) {
        document.getElementById("submit-marker").innerText = "VIEW RESULT";
      } else {
        document.getElementById("submit-marker").innerText = "NEXT IMAGE";
      }
    } else if (buttonText === "NEXT IMAGE") {
      if (imageRound < maxImages) {
        imageRound++;
      }
      updateInnerHTMLWithAnimation("customMessage", "Where could this be?");
      map.setZoom(-3);
      map.setView([1800, -3450], map.getZoom());
      loadNewImage();

      if (window.resetImageZoom) {
        window.resetImageZoom();
      }

      document.getElementById(
        "imageTurn"
      ).innerHTML = `IMG: <span style="color: red;">${imageRound}</span>/${maxImages}`;

      document.getElementById("submit-marker").innerText = "SUBMIT";

      markerSet = false;
      document.getElementById("submit-marker").disabled = true;

      cursorMarker.remove();
      finishMarker.remove();
      lineLayer.clearLayers();

      const size = getMapSize();
      totkMap.style.width = size.defaultWidth;
      totkMap.style.height = size.defaultHeight;
      totkMap.style.bottom = "12px";
      setTimeout(() => map.invalidateSize({ pan: false }), 300);
      hoverableMap = true;
    } else if (buttonText === "VIEW RESULT") {
      endGame();
    }
  });

  function loadNewImage() {
    if (isMultiplayer) {
      getImageKeyFromSeed();
    } else {
      loadLocationData();
    }
  }

  initializeMap();
  checkValidUrl();
  document.getElementById("submit-marker").disabled = true;
});

function updateInnerHTMLWithAnimation(elementId, newValue) {
  const element = document.getElementById(elementId);
  element.classList.remove("score-updated");
  element.innerHTML = newValue;
  void element.offsetWidth;
  element.classList.add("score-updated");
  setTimeout(() => element.classList.remove("score-updated"), 800);
}

function endGame() {
  const totkMap = document.getElementById("totk-map");
  const image = document.getElementById("location-image");
  const sidebar = document.getElementById("sidebar");
  const imageContainer = document.getElementById("image-container");

  if (totkMap) {
    totkMap.style.transition = "transform 1s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease";
    totkMap.style.opacity = "0";
    totkMap.style.transform = "scale(0.6) translateY(100px)";
    totkMap.style.pointerEvents = "none";
    setTimeout(() => totkMap.remove(), 1000);
  }

  if (sidebar) {
    sidebar.style.transition = "all 1.2s cubic-bezier(0.16, 1, 0.3, 1)";
    sidebar.style.opacity = "0";
    sidebar.style.maxWidth = "0px";
    sidebar.style.minWidth = "0px";
    sidebar.style.width = "0px";
    sidebar.style.paddingLeft = "0px";
    sidebar.style.paddingRight = "0px";
    sidebar.style.margin = "0px";
    sidebar.style.overflow = "hidden";
  }

  if (imageContainer) {
    imageContainer.style.transition = "all 1.2s cubic-bezier(0.16, 1, 0.3, 1)";
    imageContainer.style.flex = "1 1 100%";
    imageContainer.style.width = "100%";
    imageContainer.style.borderRadius = "0px";
  }

  if (image) {
    image.style.transition = "filter 1.5s ease, transform 1.5s cubic-bezier(0.16, 1, 0.3, 1)";
    image.style.filter = "brightness(20%) blur(6px)";
    image.style.transform = "scale(1.08)";
  }

  const overlay = document.createElement("div");
  overlay.id = "end-game-overlay";
  overlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    opacity: 0;
    transition: opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1);
    color: #fff;
    font-family: inherit;
    text-align: center;
    pointer-events: auto;
  `;

  const maxPossibleScore = maxImages * 5000;
  const percentage = (score / maxPossibleScore) * 100;
  const difficultyLabel =
    difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  const difficultyColor =
    difficulty === "easy" ? "#11a832" : difficulty === "medium" ? "#facc15" : "#ff4d4d";

  let rankTitle = "Hyrule Explorer";
  let rankColor = "#e6c35c";

  if (percentage >= 90) {
    rankTitle = "HERO OF HYRULE";
    rankColor = "#00f3ff";
  } else if (percentage >= 70) {
    rankTitle = "MASTER NAVIGATOR";
    rankColor = "#50ff72";
  } else if (percentage >= 40) {
    rankTitle = "ADVENTURER";
    rankColor = "#ffb830";
  } else {
    rankTitle = "LOST KOROK";
    rankColor = "#ff4d4d";
  }

  const contentBox = document.createElement("div");
  contentBox.style.cssText = `
    background: rgba(8, 12, 16, 0.82);
    border: 2px solid ${rankColor};
    box-shadow: 0 0 40px ${rankColor}55, inset 0 0 20px ${rankColor}22;
    padding: 45px 70px;
    border-radius: 20px;
    backdrop-filter: blur(12px);
    transform: translateY(40px) scale(0.95);
    transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
    max-width: 90%;
  `;

  contentBox.innerHTML = `
    <div style="font-size: 1.3rem; letter-spacing: 6px; text-transform: uppercase; color: ${rankColor}; margin-bottom: 12px; font-weight: 700;">${rankTitle}</div>
    <div style="font-size: 0.9rem; letter-spacing: 2px; text-transform: uppercase; color: ${difficultyColor}; margin-bottom: 18px; font-weight: 800; text-shadow: 0 0 12px ${difficultyColor}88;">Difficulty: ${difficultyLabel}</div>
    <div id="end-score-title" style="font-size: 1.4rem; margin-bottom: 15px; color: #d1d5db; letter-spacing: 1px;">
      Out of <span style="color: #0ba6d9; font-weight: bold;">${maxImages} Images</span> you got
    </div>
    <div id="end-score-number" style="font-size: 4.5rem; font-weight: 900; color: ${rankColor}; text-shadow: 0 0 25px ${rankColor}aa; line-height: 1;">
      0
    </div>
    <div style="font-size: 1.1rem; color: #9ca3af; margin-top: 8px; margin-bottom: 35px; letter-spacing: 3px; font-weight: 600;">POINTS</div>
  `;

  const buttonDiv = document.createElement("div");
  buttonDiv.style.cssText = `
    display: flex;
    gap: 20px;
    justify-content: center;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.8s ease 0.6s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s;
  `;

  const btnStyle = `
    padding: 16px 32px;
    font-size: 0.95rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  `;

  const playAgainBtn = document.createElement("button");
  playAgainBtn.textContent = "Play New Game";
  playAgainBtn.style.cssText = btnStyle;
  playAgainBtn.addEventListener("mouseover", () => {
    playAgainBtn.style.background = rankColor;
    playAgainBtn.style.color = "#000";
    playAgainBtn.style.borderColor = rankColor;
    playAgainBtn.style.boxShadow = `0 0 25px ${rankColor}aa`;
    playAgainBtn.style.transform = "translateY(-3px)";
  });
  playAgainBtn.addEventListener("mouseout", () => {
    playAgainBtn.style.background = "rgba(255, 255, 255, 0.06)";
    playAgainBtn.style.color = "#fff";
    playAgainBtn.style.borderColor = "rgba(255, 255, 255, 0.25)";
    playAgainBtn.style.boxShadow = "0 10px 25px rgba(0, 0, 0, 0.4)";
    playAgainBtn.style.transform = "translateY(0)";
  });
  playAgainBtn.addEventListener("click", () => {
    window.location = window.location.href.split("?")[0];
  });

  const copySeedBtn = document.createElement("button");
  copySeedBtn.textContent = "Copy Seed Link";
  copySeedBtn.style.cssText = btnStyle;
  copySeedBtn.addEventListener("mouseover", () => {
    copySeedBtn.style.background = "#0ba6d9";
    copySeedBtn.style.color = "#000";
    copySeedBtn.style.borderColor = "#0ba6d9";
    copySeedBtn.style.boxShadow = "0 0 25px #0ba6d9aa";
    copySeedBtn.style.transform = "translateY(-3px)";
  });
  copySeedBtn.addEventListener("mouseout", () => {
    copySeedBtn.style.background = "rgba(255, 255, 255, 0.06)";
    copySeedBtn.style.color = "#fff";
    copySeedBtn.style.borderColor = "rgba(255, 255, 255, 0.25)";
    copySeedBtn.style.boxShadow = "0 10px 25px rgba(0, 0, 0, 0.4)";
    copySeedBtn.style.transform = "translateY(0)";
  });
  copySeedBtn.addEventListener("click", () => {
    const baseUrl = window.location.href.split('?')[0];
    const seedQueue = localStorage.getItem("seedQueue") || getSeedQueueFromUrl() || "";
    navigator.clipboard.writeText(`${baseUrl}?seed=${seedQueue}`);

    copySeedBtn.textContent = "Copied!";
    setTimeout(() => {
      copySeedBtn.textContent = "Copy Seed Link";
    }, 2000);
  });

  buttonDiv.appendChild(playAgainBtn);
  buttonDiv.appendChild(copySeedBtn);
  contentBox.appendChild(buttonDiv);
  overlay.appendChild(contentBox);
  imageContainer.appendChild(overlay);

  setTimeout(() => {
    overlay.style.opacity = "1";
    contentBox.style.transform = "translateY(0) scale(1)";

    const scoreElement = document.getElementById("end-score-number");
    const duration = 2200;
    const startTime = performance.now();

    const animateNumber = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      const currentVal = Math.floor(easeProgress * score);

      scoreElement.textContent = currentVal.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(animateNumber);
      } else {
        scoreElement.textContent = score.toLocaleString();
        scoreElement.style.transition = "transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        scoreElement.style.transform = "scale(1.12)";
        setTimeout(() => {
          scoreElement.style.transform = "scale(1)";
        }, 250);

        buttonDiv.style.opacity = "1";
        buttonDiv.style.transform = "translateY(0)";
      }
    };

    requestAnimationFrame(animateNumber);
  }, 600);
}