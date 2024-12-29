let x, y, xImage, yImage, layerImage, currentLayer;
let score = 0, distance = 0, imageRound = 1;
let maxImages = parseInt(localStorage.getItem("maxRounds"), 10) || localStorage.setItem("maxRounds", 5);
let difficulty = localStorage.getItem("difficulty") || localStorage.setItem("difficulty", "hard");

if (isNaN(maxImages) || maxImages < 3 || maxImages > 15) {
  maxImages = 5;
  localStorage.setItem("maxRounds", 5);
}

let markerSet = false;

let scale = 1;
let translateX = 0, translateY = 0;
const zoomSpeed = 0.3;

let isDragging = false;
let dragStartX = 0, dragStartY = 0;

window.addEventListener("load", () => {
  let hoverableMap = true;
  const totkMap = document.querySelector(".totkMapC");
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

  totkMap.style.transition = "width 3.5s ease-in-out, height 3.5s ease-in-out";
  totkMap.style.width = size.defaultWidth;
  totkMap.style.height = size.defaultHeight;

  totkMap.addEventListener("mouseenter", () => {
    if (hoverableMap == false) {
      totkMap.removeEventListener("mouseenter", () => {
        console.log("EventListener entfernt");
      });
    } else {
      const size = getMapSize();

      totkMap.style.transition =
        "width 0.3s ease-in-out, height 0.3s ease-in-out";
      totkMap.style.height = size.hoverHeight;
      totkMap.style.width = size.hoverWidth;
      totkMap.style.marginTop = "50px";
    }
  });

  totkMap.addEventListener("mouseleave", () => {
    if (hoverableMap == false) {
      totkMap.removeEventListener("mouseleave", () => {
        console.log("EventListener entfernt");
      });
    } else {
      const size = getMapSize();

      totkMap.style.transition =
        "width 0.3s ease-in-out, height 0.3s ease-in-out";
      totkMap.style.width = size.defaultWidth;
      totkMap.style.height = size.defaultHeight;
    }
  });
  document.body.style.backgroundImage = "url(assets/images/totkBackground.png)";
  document.getElementById(
    "imageTurn"
  ).innerHTML = `IMG: <x style="color: red;">1</x>/${maxImages}`;

  (function () {
    const container = document.getElementById("image-container");
    const img = document.getElementById("location-image");

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function updateTransform() {
        img.style.transform = `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`;
    }

    container.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
        const newScale = Math.max(1, scale + delta);
        const rect = img.getBoundingClientRect();
        const offsetX = (e.clientX - rect.left) / rect.width;
        const offsetY = (e.clientY - rect.top) / rect.height;

        translateX += (offsetX - 0.5) * (scale - newScale) * rect.width;
        translateY += (offsetY - 0.5) * (scale - newScale) * rect.height;
        scale = newScale;

        const maxTranslateX = ((scale - 1) * rect.width) / 2;
        const maxTranslateY = ((scale - 1) * rect.height) / 2;
        translateX = clamp(translateX, -maxTranslateX, maxTranslateX);
        translateY = clamp(translateY, -maxTranslateY, maxTranslateY);

        updateTransform();
    });

    window.addEventListener("mousedown", (e) => {
        if (!container.contains(e.target)) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        container.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;

        translateX += dx;
        translateY += dy;

        const rect = img.getBoundingClientRect();
        const maxTranslateX = ((scale - 1) * rect.width) / 2;
        const maxTranslateY = ((scale - 1) * rect.height) / 2;
        translateX = clamp(translateX, -maxTranslateX, maxTranslateX);
        translateY = clamp(translateY, -maxTranslateY, maxTranslateY);

        updateTransform();

        dragStartX = e.clientX;
        dragStartY = e.clientY;
    });

    window.addEventListener("mouseup", () => {
        isDragging = false;
        container.style.cursor = "grab";
    });
})();

  const mapConfig = {
    preferCanvas: true,
    minZoom: -3,
    maxZoom: 0,
    center: [1800, -3450],
    zoom: -3,
    cursor: true,
    crs: L.CRS.Simple,
    //maxBoundsViscosity: 1.0, Kümmere ich mich später drum
  };

  const map = L.map("totk-map", mapConfig);

  const bounds = new L.LatLngBounds(
    map.unproject([-6000, 5000], 0),
    map.unproject([6000, -5000], 0)
  );
  map.setMaxBounds(bounds);

  const cursorIcon = L.icon({
    iconUrl: "assets/images/icons/selectionmarker.png",
    //iconSize: [50, 82],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  const cursorMarker = L.marker([0, 0], {
    icon: cursorIcon,
    autoPan: false, // verschieben auf der karte ist aus? bin mir selber nicht sicher
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
    activateLayer("surface");
    jQuery("#show-layer-sky").click(() => activateLayer("sky"));
    jQuery("#show-layer-surface")
      .click(() => activateLayer("surface"))
      .trigger("click");
    jQuery("#show-layer-depths").click(() => activateLayer("depths"));
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
    Object.values(layers).forEach((layer) => map.removeLayer(layer));
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

  async function loadLocationData() {
    try {
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
            if (allowedLayers.includes(layer)) {
                layerButtons[layer].style.display = "inline-block";
            } else {
                layerButtons[layer].style.display = "none";
            }
        });

        const response = await fetch(`assets/images/locations/locations.json`);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        const data = await response.json();

        // Bilder aus Schwierigkeit filtern
        const filteredKeys = Object.keys(data).filter((key) => {
            const [layer] = data[key].split("_");
            return allowedLayers.includes(layer);
        });

        if (filteredKeys.length === 0) {
            throw new Error(
                "Keine passenden Bilder für die aktuelle Schwierigkeit gefunden."
            );
        }

        const imageKey =
            filteredKeys[Math.floor(Math.random() * filteredKeys.length)];

        const [layer, x, y] = data[imageKey].split("_");
        layerImage = layer;
        xImage = parseInt(x, 10);
        yImage = parseInt(y, 10);

        document.getElementById(
            "location-image"
        ).src = `assets/images/locations/${imageKey}.png`;
    } catch (error) {
        console.error("Fehler beim Laden der Daten:", error);
    }
}

  function calculateScore(x, y, xImage, yImage) {
    distance = Math.sqrt(Math.pow(x - xImage, 2) + Math.pow(y - yImage, 2));
    const maxScore = 5000;
    if (distance <= 50) return { points: maxScore, distance };

    const scoreDeduction = Math.floor((distance - 50) / 0.25);
    const points = Math.max(maxScore - scoreDeduction, 0);
    return { points, distance };
  } // falls das jemand liest, diese funktion hat mich gefickt

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
        "Digga nicht mal die Ebene ist korrekt, wtf"
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

    if (document.getElementById("submit-marker").innerText === "SUBMIT") {
      finishMarker
        .setLatLng([yImage, xImage])
        .bindPopup(generateMarkerPopup("Korrekte Position", xImage, yImage))
        .openPopup()
        .addTo(map);

      getResult();

      document.getElementById("totk-map").style.width = "80%"; // 70%
      document.getElementById("totk-map").style.height = "90%"; // 80% um maxBounds zu perfektionieren
      document.getElementById("totk-map").style.bottom = "6%";
      map.setZoom(-3);

      map.setView([2000, -5000], map.getZoom());
      hoverableMap = false;

      if (imageRound > maxImages - 1) {
        document.getElementById("submit-marker").innerText = "View Result";
      } else {
        document.getElementById("submit-marker").innerText = "NEXT IMAGE";
      }
    } else if (
      document.getElementById("submit-marker").innerText === "NEXT IMAGE"
    ) {
      if (imageRound < maxImages) {
        imageRound++;
      }
      updateInnerHTMLWithAnimation("customMessage", "Where could this be?");
      map.setZoom(-3);
      map.setView([1800, -3450], map.getZoom());
      loadNewImage();

      function resetImageZoom() {
        document.getElementById("location-image").style.transform = `scale(1) translate(0px, 0px)`;
        scale = 1;
        translateX = 0;
        translateY = 0;
        isDragging = false;
        dragStartX = 0;
        dragStartY = 0;
      }
      resetImageZoom();
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
      totkMap.style.transition =
        "width 0.5s ease-in-out, height 0.5s ease-in-out";
      totkMap.style.width = size.defaultWidth;
      totkMap.style.height = size.defaultHeight;
      totkMap.style.bottom = "12px";
      hoverableMap = true;
    } else if (
      document.getElementById("submit-marker").innerText === "VIEW RESULT"
    ) {
      endGame();
    }
  });

  function loadNewImage() {
    loadLocationData();
  }

  initializeMap();
  loadLocationData();
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

  totkMap.style.transition = "width 2s ease-in-out, height 2s ease-in-out";
  totkMap.style.width = "0px";
  totkMap.style.height = "0px";

  image.style.filter = "brightness(100%)";
  image.style.transition = "filter 2s ease-in-out";

  setTimeout(() => {
    image.style.filter = "brightness(8%)";
  }, 10);

  setTimeout(() => {
    totkMap.remove();
  }, 2000);

  const fadeOutContent = () => {
    sidebar.style.transition = "opacity 1s ease-out";
    sidebar.style.opacity = "0";

    setTimeout(() => {
      sidebar.innerHTML = "";
      shrinkSidebar();
    }, 1000);
  };

  const shrinkSidebar = () => {
    sidebar.style.transition = "height 1s ease-out, width 1s ease-out";
    sidebar.style.height = "0px";
    sidebar.style.width = "0px";
  };

  const createOverlay = () => {
    const imageContainer = document.getElementById("image-container");
  
    const overlay = document.createElement("div");
    overlay.classList.add("overlay");
  
    const textDiv = document.createElement("div");
    textDiv.classList.add("overlay-text");
    textDiv.innerHTML = "0";
    overlay.appendChild(textDiv);
  
    const buttonDiv = document.createElement("div");
    buttonDiv.classList.add("button-div");
  
    const button = document.createElement("button");
    button.textContent = "Play Again";
    button.classList.add("button");
    button.addEventListener("click", () => {
      location.reload();
    });
  
    buttonDiv.appendChild(button);
    overlay.appendChild(buttonDiv);
  
    imageContainer.appendChild(overlay);
  
    let scoreColor;
    function getScoreColor() {
      if (difficulty == "easy") {
        scoreColor = "#11a832";
      } else if (difficulty == "medium") {
        scoreColor = "yellow";
      } else if (difficulty == "hard") {
        scoreColor = "red";
      }
    }
    getScoreColor();
    let currentScore = 0;
    const scoreElement = textDiv;
    const targetScore = score;
    const totalDuration = 1700;
    const animationStartTime = Date.now();
  
    const animateScore = () => {
      const elapsedTime = Date.now() - animationStartTime;
      const progress = elapsedTime / totalDuration;
  
      if (progress < 1) {
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        currentScore = Math.round(easeProgress * targetScore);
        scoreElement.innerHTML = `Out of <y style="color: #0ba6d9;">${maxImages} Images</y> you got<br><x style="color: ${scoreColor};">${currentScore}</x> points`;
  
        requestAnimationFrame(animateScore);
      } else {
        scoreElement.innerHTML = `Out of <y style="color: #0ba6d9;">${maxImages} Images</y> you got<br><x style="color: ${scoreColor};">${targetScore}</x> points`;
        setTimeout(() => {
          buttonDiv.style.opacity = "1";
        }, 500);
      }
    };
  
    setTimeout(() => {
      scoreElement.style.opacity = "1";
      animateScore();
    }, 500);
  };

  setTimeout(() => {
    createOverlay();
    fadeOutContent();
  }, 3000);
}
