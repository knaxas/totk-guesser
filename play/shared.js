const TG = (() => {
  const MIN_ROUNDS = 3;
  const MAX_ROUNDS = 15;
  const DEFAULT_ROUNDS = 5;

  const LAYERS = {
    sky: { label: "Sky", color: "#64d2ff" },
    surface: { label: "Surface", color: "#30d158" },
    depths: { label: "Depths", color: "#bf5af2" },
  };

  const DIFFICULTIES = {
    easy: { label: "Easy", color: "#30d158", layers: ["surface"] },
    medium: { label: "Medium", color: "#ffd60a", layers: ["surface", "sky"] },
    hard: { label: "Hard", color: "#ff453a", layers: ["surface", "sky", "depths"] },
  };

  const SEED_MULT = 137 * 19;
  const SEED_OFFSET = 123456;

  const store = {
    get(key, fallback = null) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {}
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  };

  function clampRounds(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) return DEFAULT_ROUNDS;
    return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, n));
  }

  function getSettings() {
    let difficulty = store.get("difficulty", "hard");
    if (!DIFFICULTIES[difficulty]) difficulty = "hard";
    return { difficulty, rounds: clampRounds(store.get("maxRounds", DEFAULT_ROUNDS)) };
  }

  function saveSettings({ difficulty, rounds }) {
    if (difficulty && DIFFICULTIES[difficulty]) store.set("difficulty", difficulty);
    if (rounds != null) store.set("maxRounds", clampRounds(rounds));
  }

  let locationsPromise = null;

  function loadLocations() {
    if (!locationsPromise) {
      locationsPromise = fetch("assets/images/locations/locations.json")
        .then((r) => {
          if (!r.ok) throw new Error(`locations.json: HTTP ${r.status}`);
          return r.json();
        })
        .then((data) =>
          Object.entries(data)
            .map(([key, value]) => {
              const [layer, x, y] = String(value).split("_");
              const n = parseInt(key.replace("img", ""), 10);
              return { key, n, layer, x: parseInt(x, 10), y: parseInt(y, 10) };
            })
            .filter((l) => LAYERS[l.layer] && !isNaN(l.n) && !isNaN(l.x) && !isNaN(l.y))
        )
        .catch((err) => {
          locationsPromise = null;
          throw err;
        });
    }
    return locationsPromise;
  }

  function imageUrl(loc) {
    return `assets/images/locations/webp/${loc.key}.webp`;
  }

  function imageFallbackUrl(loc) {
    return `assets/images/locations/${loc.key}.png`;
  }

  function encodeSeed(n) {
    return (n * SEED_MULT + SEED_OFFSET) % 1000000;
  }

  function decodeSeed(seed) {
    const n = (Number(seed) - SEED_OFFSET) / SEED_MULT;
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function splitSeedString(str) {
    return String(str || "")
      .split(/[^0-9]+/)
      .filter(Boolean);
  }

  function joinSeeds(seeds) {
    return seeds.join("-");
  }

  function seedPartsFromUrl(search = window.location.search) {
    const parts = [];
    search
      .replace(/^\?/, "")
      .split("&")
      .filter(Boolean)
      .forEach((part) => {
        const eq = part.indexOf("=");
        if (eq === -1) {
          if (/^\d+$/.test(part)) parts.push(part);
        } else if (part.slice(0, eq) === "seed") {
          parts.push(...splitSeedString(decodeURIComponent(part.slice(eq + 1))));
        }
      });
    return parts;
  }

  function resolveSeeds(parts, locations) {
    const byNumber = new Map(locations.map((l) => [l.n, l]));
    const rounds = [];
    const invalid = [];
    parts.forEach((p) => {
      const loc = byNumber.get(decodeSeed(p));
      if (loc) rounds.push(loc);
      else invalid.push(p);
    });
    return { rounds, invalid };
  }

  function difficultyForRounds(rounds) {
    const layers = new Set(rounds.map((r) => r.layer));
    if (layers.has("depths")) return "hard";
    if (layers.has("sky")) return "medium";
    return "easy";
  }

  function maxRoundsFor(locations, difficulty) {
    const allowed = DIFFICULTIES[difficulty].layers;
    const available = locations.filter((l) => allowed.includes(l.layer)).length;
    return Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, available));
  }

  function shuffle(items) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getHistory() {
    try {
      const h = JSON.parse(store.get("randomHistory", "[]"));
      return Array.isArray(h) ? h : [];
    } catch {
      return [];
    }
  }

  function pickFresh(pool, count, history) {
    const seen = {};
    history.forEach((k) => (seen[k] = (seen[k] || 0) + 1));
    return shuffle(pool)
      .sort((a, b) => (seen[a.key] || 0) - (seen[b.key] || 0))
      .slice(0, count);
  }

  function targetCounts(difficulty, total) {
    if (difficulty === "easy") return { surface: total };
    if (difficulty === "medium") {
      const sky = Math.round(total / 2);
      return { surface: total - sky, sky };
    }
    const base = Math.floor(total / 3);
    const rest = total % 3;
    return {
      surface: base + (rest >= 1 ? 1 : 0),
      sky: base + (rest >= 2 ? 1 : 0),
      depths: base,
    };
  }

  function generateRounds(locations, difficulty, total) {
    const history = getHistory();
    total = Math.min(clampRounds(total), maxRoundsFor(locations, difficulty));
    const targets = targetCounts(difficulty, total);
    const pools = {};
    Object.keys(LAYERS).forEach((layer) => (pools[layer] = locations.filter((l) => l.layer === layer)));

    let picked = [];
    Object.entries(targets).forEach(([layer, count]) => {
      picked.push(...pickFresh(pools[layer], count, history));
    });

    if (picked.length < total) {
      const used = new Set(picked.map((p) => p.key));
      const allowed = DIFFICULTIES[difficulty].layers;
      const spare = locations.filter((l) => allowed.includes(l.layer) && !used.has(l.key));
      picked.push(...pickFresh(spare, total - picked.length, history));
    }
    return shuffle(picked);
  }

  function rememberPlayed(rounds) {
    const history = getHistory().concat(rounds.map((r) => r.key)).slice(-300);
    store.set("randomHistory", JSON.stringify(history));
  }

  return {
    MIN_ROUNDS,
    MAX_ROUNDS,
    DEFAULT_ROUNDS,
    LAYERS,
    DIFFICULTIES,
    store,
    clampRounds,
    getSettings,
    saveSettings,
    loadLocations,
    imageUrl,
    imageFallbackUrl,
    encodeSeed,
    decodeSeed,
    splitSeedString,
    joinSeeds,
    seedPartsFromUrl,
    resolveSeeds,
    difficultyForRounds,
    maxRoundsFor,
    generateRounds,
    rememberPlayed,
  };
})();
