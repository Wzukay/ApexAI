/**
 * F1Shi - Motorsport Racing Line & Telemetry Visualization Engine
 * High-DPI HTML5 2D Canvas Renderers:
 *  - window.App.TrackRenderer (#track-canvas)
 *  - window.App.TelemetryRenderer (#telemetry-canvas, #gg-canvas)
 */
window.App = window.App || {};

(function () {
  'use strict';

  // ============================================================================
  // UTILITY & COLOR HELPERS
  // ============================================================================

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpColorRGB(c1, c2, t) {
    const u = clamp(t, 0, 1);
    const r = Math.round(lerp(c1[0], c2[0], u));
    const g = Math.round(lerp(c1[1], c2[1], u));
    const b = Math.round(lerp(c1[2], c2[2], u));
    return `rgb(${r},${g},${b})`;
  }

  function resolveCanvas(canvasOrId, fallbackId) {
    if (!canvasOrId && fallbackId) {
      return document.getElementById(fallbackId.replace(/^#/, ''));
    }
    if (typeof canvasOrId === 'string') {
      return (
        document.getElementById(canvasOrId.replace(/^#/, '')) ||
        document.querySelector(canvasOrId)
      );
    }
    return canvasOrId || null;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // Multi-stop color palettes
  const RGB_EMERALD = [16, 185, 129]; // #10b981
  const RGB_AMBER = [245, 158, 11];   // #f59e0b
  const RGB_CRIMSON = [239, 68, 68];  // #ef4444
  const RGB_CYAN = [6, 182, 212];     // #06b6d4
  const RGB_BLUE = [59, 130, 246];    // #3b82f6
  const RGB_YELLOW = [234, 179, 8];   // #eab308
  const RGB_ROSE = [244, 63, 94];     // #f43f5e
  const RGB_SLATE = [100, 116, 139];  // #64748b
  const RGB_PURPLE = [168, 85, 247];  // #a855f7

  /**
   * Computes color for a racing line station according to viewOptions.colorMode
   */
  function getStationColor(pt, colorMode, minSpeedKmh, maxSpeedKmh) {
    const mode = (colorMode || 'brake_throttle').toLowerCase();

    if (mode === 'speed') {
      const span = Math.max(10, maxSpeedKmh - minSpeedKmh);
      const t = clamp((pt.speedKmh - minSpeedKmh) / span, 0, 1);
      if (t < 0.5) {
        return lerpColorRGB(RGB_CYAN, RGB_YELLOW, t * 2);
      }
      return lerpColorRGB(RGB_YELLOW, RGB_ROSE, (t - 0.5) * 2);
    }

    if (mode === 'grip' || mode === 'friction') {
      const g = clamp(pt.gripUsage, 0, 1);
      if (g < 0.6) {
        return lerpColorRGB(RGB_BLUE, RGB_AMBER, g / 0.6);
      }
      return lerpColorRGB(RGB_AMBER, RGB_CRIMSON, (g - 0.6) / 0.4);
    }

    if (mode === 'curvature' || mode === 'gforce' || mode === 'lat_g') {
      const latAbs = Math.abs(pt.latG || 0);
      const t = clamp(latAbs / 3.0, 0, 1);
      if (t < 0.5) {
        return lerpColorRGB(RGB_SLATE, RGB_PURPLE, t * 2);
      }
      return lerpColorRGB(RGB_PURPLE, RGB_ROSE, (t - 0.5) * 2);
    }

    if (mode === 'wetness' || mode === 'wet' || mode === 'surface_wetness') {
      const w = clamp(
        pt.wetness !== undefined
          ? pt.wetness
          : pt.localWetness !== undefined
          ? pt.localWetness
          : 0,
        0,
        1
      );
      if (w < 0.08) {
        // Dry grip tarmac: Bright Emerald to Yellow by throttle/speed
        const thr = clamp(pt.throttle || 0, 0, 1);
        return lerpColorRGB(RGB_YELLOW, RGB_EMERALD, thr);
      }
      if (w < 0.35) {
        // Damp transition: Emerald/Yellow -> Cyan
        return lerpColorRGB(RGB_EMERALD, RGB_CYAN, (w - 0.08) / 0.27);
      }
      if (w < 0.7) {
        // Wet tarmac: Cyan -> Deep Electric Blue
        return lerpColorRGB(RGB_CYAN, RGB_BLUE, (w - 0.35) / 0.35);
      }
      // Heavy standing water / aquaplaning zone: Electric Blue -> Purple
      return lerpColorRGB(RGB_BLUE, RGB_PURPLE, (w - 0.7) / 0.3);
    }

    // Default: 'brake_throttle'
    const brake = clamp(pt.brake || 0, 0, 1);
    const throttle = clamp(pt.throttle || 0, 0, 1);

    if (brake > 0.08) {
      const bNorm = clamp((brake - 0.08) / 0.75, 0, 1);
      return lerpColorRGB(RGB_AMBER, RGB_CRIMSON, bNorm);
    }
    if (throttle > 0.12) {
      const tNorm = clamp((throttle - 0.12) / 0.8, 0, 1);
      return lerpColorRGB(RGB_AMBER, RGB_EMERALD, tNorm);
    }
    return `rgb(${RGB_AMBER[0]},${RGB_AMBER[1]},${RGB_AMBER[2]})`;
  }

  /**
   * Normalizes track samples so leftX/Y, rightX/Y, nx/ny, tx/ty, s are always available.
   */
  function getNormalizedTrackSamples(track) {
    if (!track) return [];
    const raw = track.samples || track.points || track.centerline || [];
    if (!raw.length) return [];

    // Return cached if already normalized for same array reference and revision
    if (
      track._normSamples &&
      track._normSource === raw &&
      track._normRev === track.version
    ) {
      return track._normSamples;
    }

    const n = raw.length;
    const out = new Array(n);
    let cumS = 0;

    for (let i = 0; i < n; i++) {
      const p = raw[i];
      const prev = raw[(i - 1 + n) % n];
      const next = raw[(i + 1) % n];

      if (i > 0) {
        const ds = Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y);
        cumS += ds;
      }

      const s = typeof p.s === 'number' ? p.s : cumS;
      const width =
        typeof p.width === 'number'
          ? p.width
          : typeof p.halfWidth === 'number'
          ? p.halfWidth * 2
          : track.defaultWidth || 12;
      const halfW = width * 0.5;

      let tx = p.tx;
      let ty = p.ty;
      if (typeof tx !== 'number' || typeof ty !== 'number') {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        tx = dx / len;
        ty = dy / len;
      }

      let nx = p.nx;
      let ny = p.ny;
      if (typeof nx !== 'number' || typeof ny !== 'number') {
        nx = -ty;
        ny = tx;
      }

      const leftX = typeof p.leftX === 'number' ? p.leftX : p.x + nx * halfW;
      const leftY = typeof p.leftY === 'number' ? p.leftY : p.y + ny * halfW;
      const rightX = typeof p.rightX === 'number' ? p.rightX : p.x - nx * halfW;
      const rightY = typeof p.rightY === 'number' ? p.rightY : p.y - ny * halfW;

      out[i] = {
        index: i,
        x: p.x,
        y: p.y,
        s: s,
        width: width,
        halfWidth: halfW,
        tx: tx,
        ty: ty,
        nx: nx,
        ny: ny,
        leftX: leftX,
        leftY: leftY,
        rightX: rightX,
        rightY: rightY,
        curvature: p.curvature !== undefined ? p.curvature : p.kappa || 0,
        kerbLeft: Boolean(p.kerbLeft),
        kerbRight: Boolean(p.kerbRight),
        segmentMode: (
          p.segmentMode ||
          p.segmentType ||
          p.mode ||
          'spline'
        ).toLowerCase(),
        nodeIndex: p.nodeIndex !== undefined ? p.nodeIndex : -1
      };
    }

    track._normSamples = out;
    track._normSource = raw;
    track._normRev = track.version;
    return out;
  }

  /**
   * Normalizes a solver result (optimalResult, ghostResult, centerlineResult)
   * into a consistent structure with `stations[]`, `minSpeedKmh`, `maxSpeedKmh`, `totalLength`, `lapTime`, `corners[]`.
   */
  function normalizeSolverResult(result, track) {
    if (!result) return null;
    if (result._normalized && result._normLen === (result.stations || result.points || result.samples || result.telemetry || result.x || []).length) {
      return result._normalized;
    }

    const trackSamples = getNormalizedTrackSamples(track);
    const srcArray = result.stations || result.points || result.samples || result.telemetry || null;
    const count = srcArray
      ? srcArray.length
      : Array.isArray(result.x)
      ? result.x.length
      : Array.isArray(result.v)
      ? result.v.length
      : Array.isArray(result.speed)
      ? result.speed.length
      : 0;

    if (count === 0) return null;

    const stations = new Array(count);
    let minSpeedKmh = Infinity;
    let maxSpeedKmh = -Infinity;

    for (let i = 0; i < count; i++) {
      const item = srcArray ? srcArray[i] : {};
      const ts = trackSamples[i] || trackSamples[Math.min(i, trackSamples.length - 1)] || {
        x: 0,
        y: 0,
        s: i * 5,
        nx: 0,
        ny: 1,
        halfWidth: 6
      };

      const alpha =
        item.alpha !== undefined
          ? item.alpha
          : result.alpha
          ? result.alpha[i]
          : item.offsetRatio || 0;

      let x = item.x !== undefined ? item.x : result.x ? result.x[i] : undefined;
      let y = item.y !== undefined ? item.y : result.y ? result.y[i] : undefined;

      if (typeof x !== 'number' || typeof y !== 'number') {
        const latOffset =
          item.offset !== undefined
            ? item.offset
            : alpha * (ts.halfWidth || 6);
        x = ts.x + ts.nx * latOffset;
        y = ts.y + ts.ny * latOffset;
      }

      const s =
        item.s !== undefined
          ? item.s
          : result.s
          ? result.s[i]
          : ts.s || i * 4;

      // Speed in m/s and km/h
      let speedMs =
        item.speedMs !== undefined
          ? item.speedMs
          : item.v !== undefined
          ? item.v
          : item.speed !== undefined
          ? item.speed
          : result.v
          ? result.v[i]
          : result.speed
          ? result.speed[i]
          : 0;

      let speedKmh =
        item.speedKmh !== undefined
          ? item.speedKmh
          : result.speedKmh
          ? result.speedKmh[i]
          : speedMs * 3.6;

      if (item.speedKmh !== undefined && item.v === undefined && item.speed === undefined) {
        speedMs = speedKmh / 3.6;
      }

      if (speedKmh < minSpeedKmh) minSpeedKmh = speedKmh;
      if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh;

      const throttle =
        item.throttle !== undefined
          ? item.throttle
          : result.throttle
          ? result.throttle[i]
          : 0;
      const brake =
        item.brake !== undefined
          ? item.brake
          : result.brake
          ? result.brake[i]
          : 0;

      const latG =
        item.latG !== undefined
          ? item.latG
          : item.ay !== undefined
          ? item.ay / 9.81
          : result.latG
          ? result.latG[i]
          : result.ay
          ? result.ay[i] / 9.81
          : 0;

      const longG =
        item.longG !== undefined
          ? item.longG
          : item.ax !== undefined
          ? item.ax / 9.81
          : result.longG
          ? result.longG[i]
          : result.ax
          ? result.ax[i] / 9.81
          : 0;

      let gripUsage =
        item.gripUsage !== undefined
          ? item.gripUsage
          : item.grip !== undefined
          ? item.grip
          : result.gripUsage
          ? result.gripUsage[i]
          : result.grip
          ? result.grip[i]
          : Math.min(1, Math.hypot(latG, longG) / 2.2);
      if (gripUsage > 1.5) gripUsage /= 100; // handle percentage 0..100

      const curvature =
        item.curvature !== undefined
          ? item.curvature
          : item.kappa !== undefined
          ? item.kappa
          : result.curvature
          ? result.curvature[i]
          : result.kappa
          ? result.kappa[i]
          : ts.curvature || 0;

      const gear =
        item.gear !== undefined
          ? item.gear
          : result.gear
          ? result.gear[i]
          : Math.max(1, Math.min(8, Math.floor(speedKmh / 38) + 1));

      const downforce =
        item.downforce !== undefined
          ? item.downforce
          : item.downforceKg !== undefined
          ? item.downforceKg
          : result.downforce
          ? result.downforce[i]
          : 0;

      const time =
        item.time !== undefined
          ? item.time
          : item.t !== undefined
          ? item.t
          : result.time
          ? result.time[i]
          : result.t
          ? result.t[i]
          : 0;

      const heading =
        item.heading !== undefined
          ? item.heading
          : result.heading
          ? result.heading[i]
          : Math.atan2(ts.ty || 0, ts.tx || 1);

      const wetness =
        item.wetness !== undefined
          ? item.wetness
          : item.localWetness !== undefined
          ? item.localWetness
          : result.wetness
          ? result.wetness[i]
          : 0;

      stations[i] = {
        index: i,
        x,
        y,
        s,
        alpha,
        speedMs,
        speedKmh,
        throttle,
        brake,
        latG,
        longG,
        gripUsage,
        curvature,
        gear,
        downforce,
        time,
        heading,
        wetness
      };
    }

    if (!isFinite(minSpeedKmh)) minSpeedKmh = 60;
    if (!isFinite(maxSpeedKmh)) maxSpeedKmh = 300;

    const totalLength =
      result.totalLength ||
      (track && (track.totalLength || track.length)) ||
      (stations.length ? stations[stations.length - 1].s : 1000);

    // Normalize or synthesize corners
    let corners = [];
    if (Array.isArray(result.corners) && result.corners.length > 0) {
      corners = result.corners.map((c, idx) => {
        const stIdx = clamp(
          c.stationIndex !== undefined
            ? c.stationIndex
            : c.index !== undefined
            ? c.index
            : c.sampleIndex !== undefined
            ? c.sampleIndex
            : 0,
          0,
          stations.length - 1
        );
        const st = stations[stIdx] || stations[0];
        const apexSpeedKmh =
          c.apexSpeedKmh !== undefined
            ? c.apexSpeedKmh
            : c.minSpeedKmh !== undefined
            ? c.minSpeedKmh
            : c.speedKmh !== undefined
            ? c.speedKmh
            : c.apexSpeed !== undefined
            ? c.apexSpeed > 90
              ? c.apexSpeed
              : c.apexSpeed * 3.6
            : st.speedKmh;

        return {
          number: c.number || idx + 1,
          label: c.label || c.name || `T${c.number || idx + 1}`,
          stationIndex: stIdx,
          s: c.s !== undefined ? c.s : st.s,
          x: c.x !== undefined ? c.x : st.x,
          y: c.y !== undefined ? c.y : st.y,
          apexSpeedKmh: Math.round(apexSpeedKmh),
          gear: c.gear || st.gear || 2,
          brakeStationIndex:
            c.brakeStationIndex !== undefined ? c.brakeStationIndex : null
        };
      });
    } else if (stations.length > 16) {
      // Auto-detect corners from local minimum speeds where curvature is significant
      const minGap = Math.max(8, Math.floor(stations.length / 22));
      let lastCornerIdx = -minGap;
      let turnCounter = 1;
      for (let i = 0; i < stations.length; i++) {
        const st = stations[i];
        if (Math.abs(st.curvature) < 0.006 && Math.abs(st.latG) < 0.65) continue;
        let isLocalMin = true;
        const win = Math.max(4, Math.floor(stations.length / 60));
        for (let k = -win; k <= win; k++) {
          if (k === 0) continue;
          const nb = stations[(i + k + stations.length) % stations.length];
          if (nb.speedKmh < st.speedKmh - 0.2) {
            isLocalMin = false;
            break;
          }
        }
        if (isLocalMin && i - lastCornerIdx >= minGap) {
          // Find braking start before apex
          let brakeIdx = null;
          for (let b = 1; b <= win * 3; b++) {
            const prevIdx = (i - b + stations.length) % stations.length;
            if (stations[prevIdx].brake > 0.72) {
              brakeIdx = prevIdx;
            }
          }
          corners.push({
            number: turnCounter,
            label: `T${turnCounter}`,
            stationIndex: i,
            s: st.s,
            x: st.x,
            y: st.y,
            apexSpeedKmh: Math.round(st.speedKmh),
            gear: st.gear,
            brakeStationIndex: brakeIdx
          });
          turnCounter++;
          lastCornerIdx = i;
        }
      }
    }

    const normalized = {
      stations,
      minSpeedKmh,
      maxSpeedKmh,
      totalLength,
      lapTime: result.lapTime || result.totalTime || (stations[stations.length - 1] && stations[stations.length - 1].time) || 0,
      corners,
      color: result.color || (result.car && result.car.color) || '#06b6d4',
      carName: result.carName || (result.car && result.car.name) || ''
    };

    result._normalized = normalized;
    result._normLen = count;
    return normalized;
  }

  function formatOrdinalGear(gear) {
    const g = Math.max(1, Math.round(gear || 1));
    if (g === 1) return '1st';
    if (g === 2) return '2nd';
    if (g === 3) return '3rd';
    return `${g}th`;
  }

  // ============================================================================
  // PART 1: TrackRenderer (#track-canvas)
  // ============================================================================

  class TrackRenderer {
    constructor(canvasOrId) {
      this.canvas = resolveCanvas(canvasOrId, 'track-canvas');
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

      // Camera state (world coordinates in meters)
      this.camX = 0;
      this.camY = 0;
      this.zoom = 1.65; // pixels per meter
      this.minZoom = 0.25;
      this.maxZoom = 25.0;
      this.followCar = false;
      this.rotateWithCar = false;
      this.camRotation = 0; // radians when rotateWithCar is active

      // Viewport dimensions in CSS pixels
      this.width = 800;
      this.height = 600;
      this.dpr = window.devicePixelRatio || 1;

      // Persistent visual effects (skid marks, drift smoke & wet rooster-tail spray particles)
      this.skidMarks = [];
      this.maxSkidMarks = 550;
      this.smokeParticles = [];
      this.maxSmokeParticles = 180;
      this.sprayParticles = [];
      this.maxSprayParticles = 240;
      this._lastCarPos = null;
      this._pulsePhase = 0;

      // Weather & Wind Streamline Particle Pool
      this.windParticles = [];
      this.maxWindParticles = 92;
      this._lastWeather = null;
      this.windCompassBounds = { cx: 56, cy: 56, r: 36 };
      this._initWindParticles();

      if (this.canvas) {
        this.resize();
      }
    }

    /**
     * Initializes the pool of ~90 lightweight wind streamline particles
     */
    _initWindParticles() {
      this.windParticles = [];
      for (let i = 0; i < this.maxWindParticles; i++) {
        this.windParticles.push({
          u: Math.random(),
          v: Math.random(),
          speedMul: 0.72 + Math.random() * 0.62,
          lenMul: 0.7 + Math.random() * 0.65,
          alphaBase: 0.22 + Math.random() * 0.42,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    /**
     * Hit-test helper: returns true if screen (CSS px) point is inside the top-left Wind Compass HUD
     */
    isPointInWindCompass(screenX, screenY) {
      const { cx, cy, r } = this.windCompassBounds || { cx: 56, cy: 56, r: 36 };
      return Math.hypot(screenX - cx, screenY - cy) <= r + 10;
    }

    /**
     * Computes wind direction angle in degrees [0, 360) from a screen point relative to the Wind Compass center
     */
    getWindAngleFromCompass(screenX, screenY) {
      const { cx, cy } = this.windCompassBounds || { cx: 56, cy: 56, r: 36 };
      const rad = Math.atan2(screenY - cy, screenX - cx);
      const deg = (rad * 180) / Math.PI;
      return ((deg % 360) + 360) % 360;
    }

    /**
     * Cloud hit-testing helper in world coordinates (meters).
     * Returns metadata for the closest cloud containing (worldX, worldY), or null if none.
     */
    getClosestCloud(worldX, worldY, cloudsOrWeather = null, maxDistMeters = null) {
      const clouds = Array.isArray(cloudsOrWeather)
        ? cloudsOrWeather
        : cloudsOrWeather && Array.isArray(cloudsOrWeather.clouds)
        ? cloudsOrWeather.clouds
        : this._lastWeather && Array.isArray(this._lastWeather.clouds)
        ? this._lastWeather.clouds
        : [];

      if (!clouds.length) return null;

      let bestIdx = -1;
      let bestDist = Infinity;
      const handleRadius = Math.max(18, 16 / this.zoom);

      // First pass: check center handles so overlapping clouds can always be grabbed by center
      for (let i = clouds.length - 1; i >= 0; i--) {
        const c = clouds[i];
        if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') continue;
        const d = Math.hypot(worldX - c.x, worldY - c.y);
        if (d <= handleRadius && d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      // Second pass: check full cloud radius
      if (bestIdx === -1) {
        for (let i = clouds.length - 1; i >= 0; i--) {
          const c = clouds[i];
          if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') continue;
          const r = Math.max(20, Number(c.radius) || 180);
          const hitLimit =
            maxDistMeters !== null
              ? maxDistMeters
              : r + Math.max(12, 14 / this.zoom);
          const d = Math.hypot(worldX - c.x, worldY - c.y);
          if (d <= hitLimit && d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
      }

      if (bestIdx === -1) return null;

      const bestCloud = clouds[bestIdx];
      const r = Math.max(20, Number(bestCloud.radius) || 180);
      return {
        index: bestIdx,
        cloud: bestCloud,
        id: bestCloud.id,
        x: bestCloud.x,
        y: bestCloud.y,
        radius: r,
        density: bestCloud.density !== undefined ? bestCloud.density : 0.75,
        distance: bestDist,
        isCenter: bestDist <= handleRadius,
        isRim: Math.abs(bestDist - r) <= Math.max(15, 14 / this.zoom),
        valueOf() {
          return bestIdx;
        }
      };
    }

    /**
     * Wet Zone hit-testing helper in world coordinates (meters).
     * Returns metadata for the closest wet zone containing (worldX, worldY), or null if none.
     */
    getClosestWetZone(worldX, worldY, wetZonesOrWeather = null, maxDistMeters = null) {
      const wetZones = Array.isArray(wetZonesOrWeather)
        ? wetZonesOrWeather
        : wetZonesOrWeather && Array.isArray(wetZonesOrWeather.wetZones)
        ? wetZonesOrWeather.wetZones
        : this._lastWeather && Array.isArray(this._lastWeather.wetZones)
        ? this._lastWeather.wetZones
        : [];

      if (!wetZones.length) return null;

      let bestIdx = -1;
      let bestDist = Infinity;
      const handleRadius = Math.max(18, 16 / this.zoom);

      // First pass: check center handles so overlapping wet zones can always be grabbed by center
      for (let i = wetZones.length - 1; i >= 0; i--) {
        const wz = wetZones[i];
        if (!wz || typeof wz.x !== 'number' || typeof wz.y !== 'number') continue;
        const d = Math.hypot(worldX - wz.x, worldY - wz.y);
        if (d <= handleRadius && d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      // Second pass: check full wet zone radius
      if (bestIdx === -1) {
        for (let i = wetZones.length - 1; i >= 0; i--) {
          const wz = wetZones[i];
          if (!wz || typeof wz.x !== 'number' || typeof wz.y !== 'number') continue;
          const r = Math.max(15, Number(wz.radius) || 140);
          const hitLimit =
            maxDistMeters !== null
              ? maxDistMeters
              : r + Math.max(12, 14 / this.zoom);
          const d = Math.hypot(worldX - wz.x, worldY - wz.y);
          if (d <= hitLimit && d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
      }

      if (bestIdx === -1) return null;

      const bestZone = wetZones[bestIdx];
      const r = Math.max(15, Number(bestZone.radius) || 140);
      const intensity = clamp(
        bestZone.intensity !== undefined
          ? Number(bestZone.intensity)
          : bestZone.wetness !== undefined
          ? Number(bestZone.wetness)
          : 0.85,
        0.05,
        1.0
      );
      return {
        index: bestIdx,
        wetZone: bestZone,
        id: bestZone.id,
        x: bestZone.x,
        y: bestZone.y,
        radius: r,
        intensity: intensity,
        distance: bestDist,
        isCenter: bestDist <= handleRadius,
        isRim: Math.abs(bestDist - r) <= Math.max(15, 14 / this.zoom),
        valueOf() {
          return bestIdx;
        }
      };
    }

    /**
     * Updates canvas width/height with window.devicePixelRatio
     */
    resize() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;
      const cssW = Math.max(1, rect.width || this.canvas.clientWidth || 800);
      const cssH = Math.max(1, rect.height || this.canvas.clientHeight || 600);

      this.width = cssW;
      this.height = cssH;

      const targetW = Math.round(cssW * this.dpr);
      const targetH = Math.round(cssH * this.dpr);

      if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
      }
    }

    /**
     * World (meters) -> Screen (CSS pixels)
     */
    worldToScreen(wx, wy) {
      const dx = (wx - this.camX) * this.zoom;
      const dy = (wy - this.camY) * this.zoom;
      if (this.followCar && this.rotateWithCar && this.camRotation !== 0) {
        const c = Math.cos(this.camRotation);
        const s = Math.sin(this.camRotation);
        return {
          x: this.width * 0.5 + (dx * c - dy * s),
          y: this.height * 0.5 + (dx * s + dy * c)
        };
      }
      return {
        x: this.width * 0.5 + dx,
        y: this.height * 0.5 + dy
      };
    }

    /**
     * Screen (CSS pixels) -> World (meters)
     */
    screenToWorld(sx, sy) {
      let dx = sx - this.width * 0.5;
      let dy = sy - this.height * 0.5;
      if (this.followCar && this.rotateWithCar && this.camRotation !== 0) {
        const c = Math.cos(-this.camRotation);
        const s = Math.sin(-this.camRotation);
        const rx = dx * c - dy * s;
        const ry = dx * s + dy * c;
        dx = rx;
        dy = ry;
      }
      return {
        x: this.camX + dx / this.zoom,
        y: this.camY + dy / this.zoom
      };
    }

    /**
     * Centers and zooms camera to frame the entire circuit cleanly.
     */
    fitToTrack(track, paddingPx = 80) {
      if (!track) return;
      this.resize();
      const samples = getNormalizedTrackSamples(track);
      const pts =
        samples.length > 0
          ? samples
          : track.nodes || track.controlPoints || [];
      if (!pts.length) return;

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const pad = p.halfWidth || (p.width ? p.width * 0.5 : 10);
        if (p.x - pad < minX) minX = p.x - pad;
        if (p.x + pad > maxX) maxX = p.x + pad;
        if (p.y - pad < minY) minY = p.y - pad;
        if (p.y + pad > maxY) maxY = p.y + pad;
      }

      const spanX = Math.max(40, maxX - minX);
      const spanY = Math.max(40, maxY - minY);

      this.camX = (minX + maxX) * 0.5;
      this.camY = (minY + maxY) * 0.5;

      const availW = Math.max(120, this.width - paddingPx * 2);
      const availH = Math.max(120, this.height - paddingPx * 2);

      const targetZoom = Math.min(availW / spanX, availH / spanY);
      this.zoom = clamp(targetZoom, this.minZoom, this.maxZoom);
      this.camRotation = 0;
    }

    /**
     * Zooms toward a specific screen point (cursor zoom)
     */
    zoomAt(screenX, screenY, zoomFactor) {
      const before = this.screenToWorld(screenX, screenY);
      this.zoom = clamp(this.zoom * zoomFactor, this.minZoom, this.maxZoom);
      const after = this.screenToWorld(screenX, screenY);
      this.camX += before.x - after.x;
      this.camY += before.y - after.y;
    }

    /**
     * Pans camera by screen delta
     */
    panByScreenDelta(dxPx, dyPx) {
      if (this.followCar && this.rotateWithCar && this.camRotation !== 0) {
        const c = Math.cos(-this.camRotation);
        const s = Math.sin(-this.camRotation);
        const rx = dxPx * c - dyPx * s;
        const ry = dxPx * s + dyPx * c;
        this.camX -= rx / this.zoom;
        this.camY -= ry / this.zoom;
      } else {
        this.camX -= dxPx / this.zoom;
        this.camY -= dyPx / this.zoom;
      }
    }

    /**
     * Clears accumulated skid marks, smoke particles, and water spray particles
     */
    clearTrails() {
      this.skidMarks.length = 0;
      this.smokeParticles.length = 0;
      this.sprayParticles.length = 0;
      this._lastCarPos = null;
    }

    /**
     * Main Render Pipeline
     */
    render(state = {}) {
      if (!this.canvas || !this.ctx) return;

      // Ensure crisp sizing if container changed
      const rect = this.canvas.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        (Math.abs(rect.width - this.width) > 1 ||
          Math.abs(rect.height - this.height) > 1 ||
          this.dpr !== (window.devicePixelRatio || 1))
      ) {
        this.resize();
      }

      const ctx = this.ctx;
      const {
        track,
        optimalResult,
        dryReferenceResult,
        ghostResult,
        centerlineResult,
        simState = {},
        editorState = {},
        viewOptions = {}
      } = state;

      this._pulsePhase = (this._pulsePhase + 0.065) % (Math.PI * 2);

      // Update camera follow if enabled
      const followActive =
        viewOptions.followCar !== undefined
          ? viewOptions.followCar
          : this.followCar;
      this.followCar = Boolean(followActive);
      this.rotateWithCar = Boolean(viewOptions.rotateWithCar);

      const primaryCar = simState.primaryCar || simState.car || null;
      if (this.followCar && primaryCar && typeof primaryCar.x === 'number') {
        this.camX = lerp(this.camX, primaryCar.x, 0.22);
        this.camY = lerp(this.camY, primaryCar.y, 0.22);
        if (this.rotateWithCar && typeof primaryCar.heading === 'number') {
          const targetRot = -primaryCar.heading - Math.PI * 0.5;
          // shortest angle interpolation
          const diff = Math.atan2(
            Math.sin(targetRot - this.camRotation),
            Math.cos(targetRot - this.camRotation)
          );
          this.camRotation += diff * 0.15;
        } else {
          this.camRotation = 0;
        }
      } else {
        this.camRotation = 0;
      }

      const samples = getNormalizedTrackSamples(track);
      const normOptimal = normalizeSolverResult(optimalResult, track);
      const normDryRef = normalizeSolverResult(dryReferenceResult, track);
      const normGhost = normalizeSolverResult(ghostResult, track);
      const normCenter = normalizeSolverResult(centerlineResult, track);

      const weather =
        state.weather ||
        (viewOptions && viewOptions.weather) ||
        (track && track.weather) ||
        (editorState && editorState.weather) ||
        null;
      this._lastWeather = weather;
      this._lastCarSpec =
        state.car ||
        state.carParams ||
        (optimalResult && optimalResult.car) ||
        null;

      // Ensure stations have local wetness populated if weather.wetZones are active
      if (
        normOptimal &&
        weather &&
        Array.isArray(weather.wetZones) &&
        weather.wetZones.length > 0
      ) {
        const wzList = weather.wetZones;
        for (let i = 0; i < normOptimal.stations.length; i++) {
          const st = normOptimal.stations[i];
          if (!st.wetness || st.wetness <= 0) {
            let wSum = 0;
            for (let z = 0; z < wzList.length; z++) {
              const wz = wzList[z];
              if (!wz || typeof wz.x !== 'number') continue;
              const r = Math.max(15, Number(wz.radius) || 140);
              const dx = st.x - wz.x;
              const dy = st.y - wz.y;
              const dSq = dx * dx + dy * dy;
              if (dSq < r * r) {
                const u = 1.0 - dSq / (r * r);
                const inten = clamp(
                  wz.intensity !== undefined ? Number(wz.intensity) : 0.85,
                  0.05,
                  1.0
                );
                wSum += u * u * inten;
              }
            }
            st.wetness = clamp(wSum, 0, 1);
          }
        }
      }

      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // LAYER 1: Blueprint / Telemetry Grid Background
      this._renderBackgroundGrid(ctx, viewOptions);

      // Apply World-to-Screen transform for world-space layers
      ctx.save();
      ctx.translate(this.width * 0.5, this.height * 0.5);
      if (this.followCar && this.rotateWithCar && this.camRotation !== 0) {
        ctx.rotate(this.camRotation);
      }
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.camX, -this.camY);

      // LAYER 2: Track Surface, Grass/Runoff, FIA Kerbs & Sector Lines
      if (samples.length > 1) {
        this._renderTrackSurfaceAndKerbs(ctx, track, samples, viewOptions, editorState);
      }

      // LAYER 2.2: Localized Wet Track Zones & Standing Water Puddles
      this._renderWetZones(ctx, track, weather, editorState, viewOptions);

      // LAYER 2.5: Cloud Ground Shadows over Track Asphalt & Grass
      if (weather && Array.isArray(weather.clouds) && weather.clouds.length > 0) {
        this._renderCloudShadows(ctx, weather);
      }

      // LAYER 3: Reference / Dry Reference / Ghost Racing Lines
      this._renderReferenceAndGhostLines(
        ctx,
        samples,
        normCenter,
        normGhost,
        viewOptions,
        normDryRef,
        weather
      );

      // LAYER 4: AI Optimal Racing Line (Multi-Mode Heatmap)
      if (normOptimal && normOptimal.stations.length > 1) {
        this._renderOptimalRacingLine(ctx, normOptimal, viewOptions);
      }

      // LAYER 5: Corner Apex Markers & Braking Zone Callouts
      if (viewOptions.showApexes !== false && normOptimal) {
        this._renderCornerApexes(ctx, normOptimal, samples);
      }

      // LAYER 6: Track Editor Control Nodes & Interactive Gizmos
      if (viewOptions.showNodes || editorState.active) {
        this._renderEditorNodes(ctx, track, samples, editorState);
      }

      // LAYER 7: Animated Cars (Primary + Ghost), Water Rooster-Tail Spray & Skid/Drift Trails
      this._renderCarsAndTrails(ctx, simState, normOptimal, normGhost, weather);

      // LAYER 7.5: Volumetric Cloud Canopy, Cloud Gizmos & Animated Wind Streamlines
      if (weather) {
        this._renderClouds(ctx, weather, editorState, true);
        this._renderWindField(ctx, weather, samples);
      }

      // LAYER 8: Hover Inspection Crosshair
      this._renderInspectionCrosshair(ctx, simState, normOptimal, samples);

      ctx.restore(); // end world transform

      // Screen-space HUD overlays (Scale bar, Wind Compass HUD)
      this._renderScaleBar(ctx);
      if (weather || (viewOptions && viewOptions.showWindCompass)) {
        this._renderWindCompassHUD(
          ctx,
          weather || { windSpeedKmh: 0, windDirectionDeg: 0, clouds: [] }
        );
      }

      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // LAYER 1: Blueprint / Telemetry Grid Background
    // ------------------------------------------------------------------------
    _renderBackgroundGrid(ctx, viewOptions) {
      // Deep motorsport slate background
      ctx.fillStyle = '#070a0f';
      ctx.fillRect(0, 0, this.width, this.height);

      // Subtle radial vignette glow
      const grad = ctx.createRadialGradient(
        this.width * 0.5,
        this.height * 0.5,
        Math.min(this.width, this.height) * 0.1,
        this.width * 0.5,
        this.height * 0.5,
        Math.max(this.width, this.height) * 0.75
      );
      grad.addColorStop(0, 'rgba(15, 23, 42, 0.32)');
      grad.addColorStop(1, 'rgba(3, 6, 12, 0.75)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);

      if (viewOptions && viewOptions.showGrid === false) return;

      // Adaptive two-level metric grid (minor & major)
      let minorStep = 20;
      if (this.zoom > 5.5) minorStep = 5;
      else if (this.zoom > 2.2) minorStep = 10;
      else if (this.zoom < 0.65) minorStep = 50;
      const majorStep = minorStep * 5;

      const halfWWorld = (this.width * 0.5) / this.zoom;
      const halfHWorld = (this.height * 0.5) / this.zoom;
      const minWX = Math.floor((this.camX - halfWWorld) / minorStep) * minorStep;
      const maxWX = Math.ceil((this.camX + halfWWorld) / minorStep) * minorStep;
      const minWY = Math.floor((this.camY - halfHWorld) / minorStep) * minorStep;
      const maxWY = Math.ceil((this.camY + halfHWorld) / minorStep) * minorStep;

      // Minor grid lines
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
      ctx.beginPath();
      for (let wx = minWX; wx <= maxWX; wx += minorStep) {
        if (Math.abs(wx % majorStep) < 1e-4) continue;
        const sx = Math.round(this.width * 0.5 + (wx - this.camX) * this.zoom) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, this.height);
      }
      for (let wy = minWY; wy <= maxWY; wy += minorStep) {
        if (Math.abs(wy % majorStep) < 1e-4) continue;
        const sy = Math.round(this.height * 0.5 + (wy - this.camY) * this.zoom) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(this.width, sy);
      }
      ctx.stroke();

      // Major grid lines
      const minMajorX = Math.floor((this.camX - halfWWorld) / majorStep) * majorStep;
      const minMajorY = Math.floor((this.camY - halfHWorld) / majorStep) * majorStep;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.075)';
      ctx.beginPath();
      for (let wx = minMajorX; wx <= maxWX; wx += majorStep) {
        const sx = Math.round(this.width * 0.5 + (wx - this.camX) * this.zoom) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, this.height);
      }
      for (let wy = minMajorY; wy <= maxWY; wy += majorStep) {
        const sy = Math.round(this.height * 0.5 + (wy - this.camY) * this.zoom) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(this.width, sy);
      }
      ctx.stroke();

      // World Origin Crosshair (0m, 0m)
      const ox = this.width * 0.5 - this.camX * this.zoom;
      const oy = this.height * 0.5 - this.camY * this.zoom;
      if (ox >= 0 && ox <= this.width && oy >= 0 && oy <= this.height) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ox - 8, oy);
        ctx.lineTo(ox + 8, oy);
        ctx.moveTo(ox, oy - 8);
        ctx.lineTo(ox, oy + 8);
        ctx.stroke();
      }
    }

    // ------------------------------------------------------------------------
    // LAYER 2: Track Surface, Grass/Runoff, Kerbs & Sector Lines
    // ------------------------------------------------------------------------
    _renderTrackSurfaceAndKerbs(ctx, track, samples, viewOptions, editorState) {
      const n = samples.length;

      // Helper to build closed track ribbon path (left boundary forward, right boundary reverse)
      const traceRibbonPolygon = (expandMeters = 0) => {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const s = samples[i];
          const lx = s.leftX + s.nx * expandMeters;
          const ly = s.leftY + s.ny * expandMeters;
          if (i === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        ctx.closePath();

        // Inner cutout (right boundary wound in reverse)
        const last = samples[n - 1];
        ctx.moveTo(
          last.rightX - last.nx * expandMeters,
          last.rightY - last.ny * expandMeters
        );
        for (let i = n - 1; i >= 0; i--) {
          const s = samples[i];
          const rx = s.rightX - s.nx * expandMeters;
          const ry = s.rightY - s.ny * expandMeters;
          ctx.lineTo(rx, ry);
        }
        ctx.closePath();
      };

      // 1. Outer grass / runoff shadow border
      ctx.save();
      traceRibbonPolygon(3.2);
      ctx.fillStyle = 'rgba(16, 42, 32, 0.38)';
      ctx.fill('evenodd');

      traceRibbonPolygon(1.2);
      ctx.fillStyle = '#0f151e';
      ctx.fill('evenodd');

      // 2. Main Dark Asphalt Surface
      traceRibbonPolygon(0);
      ctx.fillStyle = '#181c24';
      ctx.fill('evenodd');
      ctx.restore();

      // 3. Subtle Centerline Dashed Stripe
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const s = samples[i];
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = Math.max(0.35, 1.0 / this.zoom);
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.restore();

      // 4. Authentic FIA Red & White Kerbs (Rumble Strips)
      if (viewOptions.showKerbs !== false) {
        this._renderFIAKerbs(ctx, samples);
      }

      // 5. Straight vs Spline Segment Indicators (only when explicitly requested)
      const showSegmentTypes = Boolean(viewOptions && viewOptions.showSegmentTypes);

      if (showSegmentTypes) {
        ctx.save();
        ctx.lineWidth = Math.max(0.8, 2.2 / this.zoom);
        for (let i = 0; i < n; i++) {
          const s0 = samples[i];
          const s1 = samples[(i + 1) % n];
          const isStraight = s0.segmentMode === 'straight';
          ctx.strokeStyle = isStraight
            ? 'rgba(6, 182, 212, 0.55)' // Cyan accent for straight segments
            : 'rgba(168, 85, 247, 0.45)'; // Purple accent for spline segments
          ctx.beginPath();
          ctx.moveTo(s0.leftX + s0.nx * 0.9, s0.leftY + s0.ny * 0.9);
          ctx.lineTo(s1.leftX + s1.nx * 0.9, s1.leftY + s1.ny * 0.9);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 6. Crisp White Track Boundary Lines
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.72)';
      ctx.lineWidth = Math.max(0.35, 1.35 / this.zoom);

      // Left boundary
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const s = samples[i];
        if (i === 0) ctx.moveTo(s.leftX, s.leftY);
        else ctx.lineTo(s.leftX, s.leftY);
      }
      ctx.closePath();
      ctx.stroke();

      // Right boundary
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const s = samples[i];
        if (i === 0) ctx.moveTo(s.rightX, s.rightY);
        else ctx.lineTo(s.rightX, s.rightY);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // 7. Sector Splits (S1 / S2 / S3)
      if (viewOptions.showSectors !== false) {
        this._renderSectorSplits(ctx, samples);
      }

      // 8. Start/Finish Checkered Line & Direction Arrow
      this._renderStartFinishLine(ctx, samples[0]);
    }

    _renderFIAKerbs(ctx, samples) {
      const n = samples.length;
      const kerbWidth = 1.25; // meters wide rumble strip

      ctx.save();
      let blockToggle = 0;
      let accumDist = 0;
      const blockLength = 2.2; // meters per red/white kerb block

      for (let i = 0; i < n; i++) {
        const s0 = samples[i];
        const s1 = samples[(i + 1) % n];
        const segLen = Math.hypot(s1.x - s0.x, s1.y - s0.y);
        accumDist += segLen;
        if (accumDist >= blockLength) {
          blockToggle = 1 - blockToggle;
          accumDist = 0;
        }

        if (!s0.kerbLeft && !s0.kerbRight) continue;

        const color = blockToggle === 0 ? '#ef4444' : '#f8fafc';
        ctx.fillStyle = color;

        if (s0.kerbLeft) {
          ctx.beginPath();
          ctx.moveTo(s0.leftX, s0.leftY);
          ctx.lineTo(s0.leftX + s0.nx * kerbWidth, s0.leftY + s0.ny * kerbWidth);
          ctx.lineTo(s1.leftX + s1.nx * kerbWidth, s1.leftY + s1.ny * kerbWidth);
          ctx.lineTo(s1.leftX, s1.leftY);
          ctx.closePath();
          ctx.fill();
        }

        if (s0.kerbRight) {
          ctx.beginPath();
          ctx.moveTo(s0.rightX, s0.rightY);
          ctx.lineTo(s0.rightX - s0.nx * kerbWidth, s0.rightY - s0.ny * kerbWidth);
          ctx.lineTo(s1.rightX - s1.nx * kerbWidth, s1.rightY - s1.ny * kerbWidth);
          ctx.lineTo(s1.rightX, s1.rightY);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }

    _renderSectorSplits(ctx, samples) {
      const n = samples.length;
      if (n < 9) return;

      const totalLen = samples[n - 1].s || n;
      const splits = [
        { label: 'S1', ratio: 0.0, color: '#38bdf8' },
        { label: 'S2', ratio: 1 / 3, color: '#a855f7' },
        { label: 'S3', ratio: 2 / 3, color: '#f59e0b' }
      ];

      ctx.save();
      splits.forEach((sp, idx) => {
        if (idx === 0) return; // S1 starts at Start/Finish line
        const targetS = totalLen * sp.ratio;
        let bestIdx = Math.floor(n * sp.ratio);
        for (let i = 0; i < n; i++) {
          if (samples[i].s >= targetS) {
            bestIdx = i;
            break;
          }
        }
        const s = samples[bestIdx];
        const ext = 2.0;

        // Perpendicular dashed sector line
        ctx.strokeStyle = sp.color;
        ctx.lineWidth = Math.max(0.5, 1.5 / this.zoom);
        ctx.setLineDash([1.5, 1.5]);
        ctx.beginPath();
        ctx.moveTo(s.leftX + s.nx * ext, s.leftY + s.ny * ext);
        ctx.lineTo(s.rightX - s.nx * ext, s.rightY - s.ny * ext);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pill badge Outside Left Boundary
        const badgeWorldX = s.leftX + s.nx * (ext + 5.5);
        const badgeWorldY = s.leftY + s.ny * (ext + 5.5);

        ctx.save();
        ctx.translate(badgeWorldX, badgeWorldY);
        const invScale = 1 / this.zoom;
        ctx.scale(invScale, invScale);

        roundRectPath(ctx, -14, -9, 28, 18, 5);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fill();
        ctx.strokeStyle = sp.color;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = sp.color;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sp.label, 0, 0.5);
        ctx.restore();
      });
      ctx.restore();
    }

    _renderStartFinishLine(ctx, s0) {
      if (!s0) return;
      ctx.save();
      ctx.translate(s0.x, s0.y);
      const angle = Math.atan2(s0.ty, s0.tx);
      ctx.rotate(angle);

      const halfW = s0.halfWidth || 6;
      const rows = 2;
      const cols = 10;
      const cellW = (halfW * 2) / cols;
      const cellL = 1.25;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#0f172a';
          ctx.fillRect(
            (r - 1) * cellL,
            -halfW + c * cellW,
            cellL,
            cellW
          );
        }
      }

      // Direction arrow ahead of start line
      const arrowDist = 7.5;
      ctx.fillStyle = 'rgba(248, 250, 252, 0.5)';
      ctx.beginPath();
      ctx.moveTo(arrowDist + 3.2, 0);
      ctx.lineTo(arrowDist - 1.4, -2.0);
      ctx.lineTo(arrowDist - 0.6, 0);
      ctx.lineTo(arrowDist - 1.4, 2.0);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // LAYER 2.2: Localized Wet Track Zones & Standing Water Puddles
    // ------------------------------------------------------------------------
    _renderWetZones(ctx, track, weather, editorState = {}, viewOptions = {}) {
      if (
        !weather ||
        !Array.isArray(weather.wetZones) ||
        weather.wetZones.length === 0
      ) {
        return;
      }

      const wetZones = weather.wetZones;
      const samples = getNormalizedTrackSamples(track);
      const invScale = 1 / this.zoom;

      // Helper to evaluate local wetness W_i at any world point (x, y)
      const evalWetnessAt = (x, y) => {
        let wSum = 0;
        for (let z = 0; z < wetZones.length; z++) {
          const wz = wetZones[z];
          if (!wz || typeof wz.x !== 'number' || typeof wz.y !== 'number') continue;
          const r = Math.max(15, Number(wz.radius) || 140);
          const dx = x - wz.x;
          const dy = y - wz.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < r * r) {
            const u = 1.0 - dSq / (r * r);
            const inten = clamp(
              wz.intensity !== undefined
                ? Number(wz.intensity)
                : wz.wetness !== undefined
                ? Number(wz.wetness)
                : 0.85,
              0.05,
              1.0
            );
            wSum += u * u * inten;
          }
        }
        return clamp(wSum, 0, 1);
      };

      ctx.save();

      // A) Wet Asphalt Sheen & Standing Water Glaze Along Wet Track Stations
      if (samples.length > 1) {
        const n = samples.length;
        for (let i = 0; i < n; i++) {
          const s0 = samples[i];
          const w0 =
            s0.wetness !== undefined && s0.wetness > 0
              ? s0.wetness
              : evalWetnessAt(s0.x, s0.y);
          if (w0 <= 0.08) continue;

          const s1 = samples[(i + 1) % n];

          // Full track-width wet asphalt specular reflection overlay
          ctx.fillStyle = `rgba(14, 165, 233, ${(0.28 * w0).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(s0.leftX, s0.leftY);
          ctx.lineTo(s1.leftX, s1.leftY);
          ctx.lineTo(s1.rightX, s1.rightY);
          ctx.lineTo(s0.rightX, s0.rightY);
          ctx.closePath();
          ctx.fill();

          // Standing-water core puddle along the rubbered-in middle / apex band
          const coreHalf0 = (s0.halfWidth || 6) * 0.56;
          const coreHalf1 = (s1.halfWidth || 6) * 0.56;
          ctx.fillStyle = `rgba(56, 189, 248, ${(0.35 * w0).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(s0.x + s0.nx * coreHalf0, s0.y + s0.ny * coreHalf0);
          ctx.lineTo(s1.x + s1.nx * coreHalf1, s1.y + s1.ny * coreHalf1);
          ctx.lineTo(s1.x - s1.nx * coreHalf1, s1.y - s1.ny * coreHalf1);
          ctx.lineTo(s0.x - s0.nx * coreHalf0, s0.y - s0.ny * coreHalf0);
          ctx.closePath();
          ctx.fill();

          // Subtle glistening edge highlights along track boundaries
          if (w0 > 0.22 && i % 2 === 0) {
            ctx.strokeStyle = `rgba(186, 230, 253, ${(0.45 * w0).toFixed(3)})`;
            ctx.lineWidth = Math.max(0.45, 1.3 / this.zoom);
            ctx.beginPath();
            ctx.moveTo(s0.leftX - s0.nx * 0.5, s0.leftY - s0.ny * 0.5);
            ctx.lineTo(s1.leftX - s1.nx * 0.5, s1.leftY - s1.ny * 0.5);
            ctx.moveTo(s0.rightX + s0.nx * 0.5, s0.rightY + s0.ny * 0.5);
            ctx.lineTo(s1.rightX + s1.nx * 0.5, s1.rightY + s1.ny * 0.5);
            ctx.stroke();
          }
        }
      }

      // B) Volumetric Wet Zone Field & Animated Rain Ripples + C) Interactive Selection / Drag Handles
      const toolMode =
        (editorState &&
          (editorState.activeTool || editorState.mode || editorState.tool)) ||
        '';
      const isPlaceWetMode =
        toolMode === 'place_wet' ||
        Boolean(weather.placeWetMode) ||
        Boolean(weather.wetToolActive);

      const selectedIdx =
        weather.selectedWetZoneIndex !== undefined
          ? weather.selectedWetZoneIndex
          : editorState && editorState.selectedWetZoneIndex !== undefined
          ? editorState.selectedWetZoneIndex
          : -1;
      const hoveredIdx =
        weather.hoveredWetZoneIndex !== undefined
          ? weather.hoveredWetZoneIndex
          : editorState && editorState.hoveredWetZoneIndex !== undefined
          ? editorState.hoveredWetZoneIndex
          : -1;

      const rippleSeeds = [
        { dx: -0.32, dy: -0.24, phase: 0.0 },
        { dx: 0.36, dy: -0.18, phase: 1.1 },
        { dx: -0.18, dy: 0.35, phase: 2.3 },
        { dx: 0.28, dy: 0.30, phase: 3.4 },
        { dx: 0.04, dy: -0.05, phase: 4.5 },
        { dx: -0.42, dy: 0.08, phase: 5.2 }
      ];

      for (let idx = 0; idx < wetZones.length; idx++) {
        const wz = wetZones[idx];
        if (!wz || typeof wz.x !== 'number' || typeof wz.y !== 'number') continue;

        const radius = Math.max(15, Number(wz.radius) || 140);
        const intensity = clamp(
          wz.intensity !== undefined
            ? Number(wz.intensity)
            : wz.wetness !== undefined
            ? Number(wz.wetness)
            : 0.85,
          0.05,
          1.0
        );

        // Soft radial wet ground aura
        const auraGrad = ctx.createRadialGradient(
          wz.x,
          wz.y,
          radius * 0.06,
          wz.x,
          wz.y,
          radius
        );
        auraGrad.addColorStop(
          0,
          `rgba(6, 182, 212, ${(0.16 * intensity).toFixed(3)})`
        );
        auraGrad.addColorStop(
          0.58,
          `rgba(14, 165, 233, ${(0.09 * intensity).toFixed(3)})`
        );
        auraGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');

        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(wz.x, wz.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // 6 animated expanding concentric raindrop ripple rings inside the wet zone radius
        ctx.lineWidth = Math.max(0.5, 1.15 * invScale);
        for (let rIdx = 0; rIdx < rippleSeeds.length; rIdx++) {
          const seed = rippleSeeds[rIdx];
          const rx = wz.x + seed.dx * radius;
          const ry = wz.y + seed.dy * radius;
          const prog =
            ((this._pulsePhase * 0.55 + seed.phase + idx * 0.7) % (Math.PI * 2)) /
            (Math.PI * 2);
          const ripR = (4 + prog * 24) * invScale + prog * radius * 0.14;
          const ripAlpha = (1 - prog) * 0.48 * intensity;

          ctx.strokeStyle = `rgba(125, 211, 252, ${ripAlpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(rx, ry, ripR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Diagonal animated rain streaks inside the wet zone
        ctx.strokeStyle = `rgba(186, 230, 253, ${(0.32 * intensity).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.45, 1.0 * invScale);
        ctx.beginPath();
        const streakLen = Math.max(8 * invScale, radius * 0.12);
        for (let sIdx = 0; sIdx < 7; sIdx++) {
          const fallProg =
            ((this._pulsePhase * 1.15 + sIdx * 0.91 + idx * 0.4) % (Math.PI * 2)) /
            (Math.PI * 2);
          const ang = sIdx * 0.89 + idx * 1.3;
          const dist = (0.18 + 0.55 * ((sIdx * 0.37) % 1)) * radius;
          const sx =
            wz.x + Math.cos(ang) * dist + (fallProg - 0.5) * streakLen * 0.9;
          const sy =
            wz.y + Math.sin(ang) * dist + (fallProg - 0.5) * streakLen * 1.6;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + streakLen * 0.45, sy + streakLen);
        }
        ctx.stroke();

        // C) Interactive Wet Zone Selection / Drag Handles
        const isSelected = idx === selectedIdx;
        const isHovered = idx === hoveredIdx;
        const showGizmo =
          isPlaceWetMode ||
          isSelected ||
          isHovered ||
          Boolean(viewOptions && viewOptions.showNodes);

        if (showGizmo) {
          ctx.beginPath();
          ctx.arc(wz.x, wz.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected
            ? 'rgba(56, 189, 248, 0.92)'
            : isHovered
            ? 'rgba(186, 230, 253, 0.85)'
            : 'rgba(6, 182, 212, 0.52)';
          ctx.lineWidth = (isSelected || isHovered ? 2.1 : 1.3) * invScale;
          ctx.setLineDash([6 * invScale, 4 * invScale]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Center interactive badge
          ctx.save();
          ctx.translate(wz.x, wz.y);
          ctx.scale(invScale, invScale);

          if (isSelected || isHovered) {
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.strokeStyle = isSelected ? '#38bdf8' : '#bae6fd';
            ctx.lineWidth = 1.8;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? '#0284c7' : '#0f172a';
          ctx.fill();
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 1.8;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#e0f2fe';
          ctx.fill();

          const badgeText = `💧 WET #${idx + 1} • ${Math.round(intensity * 100)}%`;
          const pillW = Math.max(118, badgeText.length * 6.5);
          const pillH = 20;
          roundRectPath(ctx, -pillW * 0.5, -34, pillW, pillH, 5);
          ctx.fillStyle = 'rgba(8, 20, 38, 0.92)';
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(6, 182, 212, 0.65)';
          ctx.lineWidth = 1.15;
          ctx.stroke();

          ctx.fillStyle = '#e0f2fe';
          ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, 0, -24);

          ctx.restore();
        }
      }

      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // LAYER 3: Reference / Dry Reference / Ghost Racing Lines
    // ------------------------------------------------------------------------
    _renderReferenceAndGhostLines(
      ctx,
      samples,
      normCenter,
      normGhost,
      viewOptions,
      normDryRef = null,
      weather = null
    ) {
      // 1. Geometric Centerline
      if (viewOptions && viewOptions.showCenterline && samples.length > 1) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = Math.max(0.6, 1.4 / this.zoom);
        ctx.setLineDash([3.5 / this.zoom, 3.5 / this.zoom]);
        ctx.stroke();
        ctx.restore();
      }

      // 2. Dry Reference Racing Line (when wet zones are active or showDryLine is enabled)
      const hasWetZones =
        weather && Array.isArray(weather.wetZones) && weather.wetZones.length > 0;
      const showDry =
        viewOptions && viewOptions.showDryLine !== undefined
          ? Boolean(viewOptions.showDryLine)
          : true;

      if (
        normDryRef &&
        normDryRef.stations &&
        normDryRef.stations.length > 1 &&
        hasWetZones &&
        showDry
      ) {
        const dPts = normDryRef.stations;
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < dPts.length; i++) {
          const p = dPts[i];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();

        // Subtle warm glow under the dry reference line
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.18)';
        ctx.lineWidth = Math.max(1.6, 4.2 / this.zoom);
        ctx.stroke();

        // Crisp dashed amber/white reference trajectory
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
        ctx.lineWidth = Math.max(0.85, 2.0 / this.zoom);
        ctx.setLineDash([4.5 / this.zoom, 3.5 / this.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Find the wettest corner / station along the dry reference line to place the "DRY LINE" callout badge
        let bestIdx = 0;
        let bestScore = -1;
        for (let i = 0; i < dPts.length; i++) {
          const pt = dPts[i];
          let wLocal = 0;
          for (let z = 0; z < weather.wetZones.length; z++) {
            const wz = weather.wetZones[z];
            if (!wz || typeof wz.x !== 'number') continue;
            const r = Math.max(15, Number(wz.radius) || 140);
            const dSq = (pt.x - wz.x) * (pt.x - wz.x) + (pt.y - wz.y) * (pt.y - wz.y);
            if (dSq < r * r) {
              const u = 1 - dSq / (r * r);
              wLocal += u * (Number(wz.intensity) || 0.85);
            }
          }
          const cornerWeight = 1 + Math.abs(pt.curvature || 0) * 60;
          const score = wLocal * cornerWeight;
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }

        if (bestScore > 0.05 && dPts[bestIdx]) {
          const anchor = dPts[bestIdx];
          const ts = samples[bestIdx] || { nx: 0, ny: -1 };
          const invScale = 1 / this.zoom;

          ctx.save();
          ctx.translate(anchor.x, anchor.y);
          ctx.scale(invScale, invScale);

          ctx.beginPath();
          ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#fbbf24';
          ctx.fill();

          const bx = -(ts.nx || 0.6) * 24;
          const by = -(ts.ny || -0.6) * 24;
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(bx, by);
          ctx.stroke();

          const pillW = 62;
          const pillH = 16;
          roundRectPath(ctx, bx - pillW * 0.5, by - pillH * 0.5, pillW, pillH, 4);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('DRY LINE', bx, by + 0.5);
          ctx.restore();
        }

        ctx.restore();
      }

      // 3. Ghost Car's Optimal Racing Line
      if (normGhost && normGhost.stations.length > 1) {
        const gPts = normGhost.stations;
        const ghostColor = normGhost.color || '#a855f7';

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < gPts.length; i++) {
          const p = gPts[i];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();

        // Outer subtle glow
        ctx.strokeStyle = ghostColor;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = Math.max(1.8, 5.0 / this.zoom);
        ctx.stroke();

        // Dashed core line
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = Math.max(0.9, 2.2 / this.zoom);
        ctx.setLineDash([5 / this.zoom, 3.5 / this.zoom]);
        ctx.stroke();
        ctx.restore();
      }
    }

    _renderReferenceLines(
      ctx,
      samples,
      normCenter,
      normGhost,
      viewOptions,
      normDryRef = null,
      weather = null
    ) {
      this._renderReferenceAndGhostLines(
        ctx,
        samples,
        normCenter,
        normGhost,
        viewOptions,
        normDryRef,
        weather
      );
    }

    _renderOptimalLine(ctx, normOptimal, viewOptions) {
      this._renderOptimalRacingLine(ctx, normOptimal, viewOptions);
    }

    // ------------------------------------------------------------------------
    // LAYER 4: AI Optimal Racing Line (Multi-Mode Heatmap)
    // ------------------------------------------------------------------------
    _renderOptimalRacingLine(ctx, normOptimal, viewOptions) {
      const pts = normOptimal.stations;
      const n = pts.length;
      if (n < 2) return;

      const colorMode = (viewOptions && viewOptions.colorMode) || 'brake_throttle';
      const screenWidthPx = Math.max(2.5, 3.2 * Math.sqrt(this.zoom));
      const worldLineWidth = screenWidthPx / this.zoom;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Subtle continuous under-glow path
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.16)';
      ctx.lineWidth = worldLineWidth * 2.2;
      ctx.stroke();

      // Per-segment multi-mode heatmap coloring
      ctx.lineWidth = worldLineWidth;
      for (let i = 0; i < n; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % n];

        ctx.strokeStyle = getStationColor(
          p0,
          colorMode,
          normOptimal.minSpeedKmh,
          normOptimal.maxSpeedKmh
        );
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // LAYER 5: Corner Apex Markers & Braking Zone Callouts
    // ------------------------------------------------------------------------
    _renderCornerApexes(ctx, normOptimal, samples) {
      const corners = normOptimal.corners || [];
      if (!corners.length) return;

      const pts = normOptimal.stations;
      const invScale = 1 / this.zoom;

      ctx.save();
      for (let i = 0; i < corners.length; i++) {
        const c = corners[i];
        const ts = samples[c.stationIndex] || { nx: 0, ny: 1 };

        // Optional heavy braking point marker ('B')
        if (typeof c.brakeStationIndex === 'number' && pts[c.brakeStationIndex]) {
          const bp = pts[c.brakeStationIndex];
          ctx.save();
          ctx.translate(bp.x, bp.y);
          ctx.scale(invScale, invScale);

          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fillStyle = '#ef4444';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('B', 0, 0.5);
          ctx.restore();
        }

        // Apex clipping diamond marker on the racing line
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(invScale, invScale);

        // Glowing apex point
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Offset leader line to sleek floating callout tag
        const dirX = ts.nx || 0.7;
        const dirY = ts.ny || -0.7;
        const tagX = dirX * 32;
        const tagY = dirY * 32;

        ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(tagX, tagY);
        ctx.stroke();

        // Floating callout pill: "T1 • 118 km/h • 3rd"
        const labelTitle = c.label || `T${c.number}`;
        const speedText = `${c.apexSpeedKmh} km/h`;
        const gearText = formatOrdinalGear(c.gear);
        const boxW = 92;
        const boxH = 28;

        roundRectPath(ctx, tagX - boxW * 0.5, tagY - boxH * 0.5, boxW, boxH, 5);
        ctx.fillStyle = 'rgba(10, 15, 25, 0.90)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelTitle, tagX - boxW * 0.5 + 6, tagY - 5);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '8.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(gearText, tagX + boxW * 0.5 - 6, tagY - 5);

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(speedText, tagX - boxW * 0.5 + 6, tagY + 6.5);

        ctx.restore();
      }
      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // LAYER 6: Track Editor Control Nodes & Interactive Gizmos
    // ------------------------------------------------------------------------
    _renderEditorNodes(ctx, track, samples, editorState = {}) {
      if (!track) return;
      const nodes = track.nodes || track.controlPoints || [];
      if (!nodes.length) return;

      const invScale = 1 / this.zoom;
      const selectedIdx =
        editorState.selectedNodeIndex !== undefined
          ? editorState.selectedNodeIndex
          : editorState.selectedNode;
      const hoveredIdx =
        editorState.hoveredNodeIndex !== undefined
          ? editorState.hoveredNodeIndex
          : editorState.hoveredNode;

      ctx.save();

      // Control polygon faint connector (only when hovering or dragging a node)
      if (selectedIdx >= 0 || hoveredIdx >= 0) {
        ctx.beginPath();
        for (let i = 0; i < nodes.length; i++) {
          const nd = nodes[i];
          if (i === 0) ctx.moveTo(nd.x, nd.y);
          else ctx.lineTo(nd.x, nd.y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
        ctx.lineWidth = 1.0 * invScale;
        ctx.setLineDash([4 * invScale, 4 * invScale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw each control node
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        const mode = (nd.mode || nd.type || 'spline').toLowerCase();
        const isStraight = mode === 'straight';
        const isSelected = i === selectedIdx;
        const isHovered = i === hoveredIdx;

        ctx.save();
        ctx.translate(nd.x, nd.y);
        ctx.scale(invScale, invScale);

        // Outer selection/hover ring
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(0, 0, isSelected ? 13 : 11, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? '#38bdf8' : '#f8fafc';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (isStraight) {
          // Diamond / Rotated Square badge for STRAIGHT nodes (Amber/Cyan)
          ctx.save();
          ctx.rotate(Math.PI * 0.25);
          ctx.fillStyle = isSelected ? '#06b6d4' : '#f59e0b';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.8;
          ctx.fillRect(-6, -6, 12, 12);
          ctx.strokeRect(-6, -6, 12, 12);
          ctx.restore();
        } else {
          // Circular handle for SPLINE nodes (Indigo/Cyan)
          ctx.beginPath();
          ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? '#38bdf8' : '#6366f1';
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }

        // Node index inside handle
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), 0, 0.5);

        // Detailed label on hover or selection
        if (isSelected || isHovered) {
          const wVal = Math.round(nd.width || track.defaultWidth || 12);
          const tag = `#${i + 1} ${isStraight ? 'STRAIGHT' : 'SPLINE'} (${wVal}m)`;
          const tagW = Math.max(106, tag.length * 6.2);
          roundRectPath(ctx, -tagW * 0.5, -32, tagW, 18, 4);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
          ctx.fill();
          ctx.strokeStyle = isStraight ? '#f59e0b' : '#38bdf8';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText(tag, 0, -23);
        }

        ctx.restore();
      }

      // Ghost preview node when hovering with "Insert Node" tool
      const ghostNode = editorState.ghostNode || editorState.previewNode;
      if (ghostNode && typeof ghostNode.x === 'number') {
        ctx.save();
        ctx.translate(ghostNode.x, ghostNode.y);
        ctx.scale(invScale, invScale);
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.55)';
        ctx.fill();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // LAYER 7: Animated Cars, Water Rooster-Tail Spray & Skid/Drift Trails
    // ------------------------------------------------------------------------
    _resolveTireVisuals(car) {
      const spec = (!car.isGhost && this._lastCarSpec) || {};
      const rawCompound = String(
        car.tireCompound ||
          spec.tireCompound ||
          car.compound ||
          spec.compound ||
          ''
      ).toUpperCase();

      let color = car.tireColor || spec.tireColor || null;
      let code = '';

      if (rawCompound.includes('WET') || rawCompound === 'W') {
        color = color || '#3b82f6';
        code = 'WET';
      } else if (rawCompound.includes('INT') || rawCompound === 'I') {
        color = color || '#22c55e';
        code = 'INT';
      } else if (rawCompound.includes('C1')) {
        color = color || '#f8fafc';
        code = 'C1';
      } else if (rawCompound.includes('C2') || rawCompound === 'HARD') {
        color = color || '#f8fafc';
        code = rawCompound === 'HARD' ? 'C2' : 'C2';
      } else if (rawCompound.includes('C3') || rawCompound === 'MEDIUM' || rawCompound === 'MED') {
        color = color || '#facc15';
        code = 'C3';
      } else if (rawCompound.includes('C4')) {
        color = color || '#ef4444';
        code = 'C4';
      } else if (rawCompound.includes('C5') || rawCompound === 'SOFT') {
        color = color || '#ef4444';
        code = rawCompound.includes('C5') ? 'C5' : 'C4';
      } else if (rawCompound) {
        code = rawCompound.slice(0, 4);
      }

      if (!color) {
        color = '#ef4444'; // Default Pirelli Soft Red
      }
      if (!code) {
        code = 'C4';
      }
      return { color, code };
    }

    _updateAndRenderParticles(ctx, simState, dt = 0.016, weather = null) {
      const primaryCar = (simState && (simState.primaryCar || simState.car)) || null;
      const wObj = weather || this._lastWeather;

      // 1. Update & Spawn Skid Marks, Drift Smoke, and Water Rooster-Tail Spray for Primary Car
      if (primaryCar && typeof primaryCar.x === 'number') {
        const slipDeg = Math.abs(
          primaryCar.slipAngleDeg !== undefined
            ? primaryCar.slipAngleDeg
            : (primaryCar.slipAngle || 0) * (180 / Math.PI)
        );
        const gripPct =
          primaryCar.gripUsage !== undefined
            ? primaryCar.gripUsage > 1.5
              ? primaryCar.gripUsage
              : primaryCar.gripUsage * 100
            : 0;

        // Evaluate local wetness at car position (from carState.wetness or weather.wetZones)
        let carWetness = Number(
          primaryCar.wetness !== undefined
            ? primaryCar.wetness
            : primaryCar.localWetness !== undefined
            ? primaryCar.localWetness
            : 0
        );
        if (
          carWetness <= 0.1 &&
          wObj &&
          Array.isArray(wObj.wetZones) &&
          wObj.wetZones.length > 0
        ) {
          let wSum = 0;
          for (let z = 0; z < wObj.wetZones.length; z++) {
            const wz = wObj.wetZones[z];
            if (!wz || typeof wz.x !== 'number' || typeof wz.y !== 'number') continue;
            const r = Math.max(15, Number(wz.radius) || 140);
            const dx = primaryCar.x - wz.x;
            const dy = primaryCar.y - wz.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < r * r) {
              const u = 1.0 - dSq / (r * r);
              const inten = clamp(
                wz.intensity !== undefined
                  ? Number(wz.intensity)
                  : wz.wetness !== undefined
                  ? Number(wz.wetness)
                  : 0.85,
                0.05,
                1.0
              );
              wSum += u * u * inten;
            }
          }
          carWetness = Math.max(carWetness, clamp(wSum, 0, 1));
        }

        const speedKmh =
          primaryCar.speedKmh !== undefined
            ? primaryCar.speedKmh
            : (primaryCar.speedMs || primaryCar.speed || primaryCar.v || 0) * 3.6;

        const heading = primaryCar.heading || 0;
        const cosH = Math.cos(heading);
        const sinH = Math.sin(heading);
        const nx = -sinH;
        const ny = cosH;
        const rearAxleOffset = -1.65;
        const trackHalf = 0.95;

        const rx = primaryCar.x + cosH * rearAxleOffset;
        const ry = primaryCar.y + sinH * rearAxleOffset;

        // Emit Water Rooster-Tail Spray Particles when in wet zone (carWetness > 0.10 & speedKmh > 40)
        if (carWetness > 0.10 && speedKmh > 40 && this._lastCarPos) {
          const movedDist = Math.hypot(
            primaryCar.x - this._lastCarPos.x,
            primaryCar.y - this._lastCarPos.y
          );
          if (movedDist > 0.05 && movedDist < 22) {
            const sprayCount = carWetness > 0.5 ? 4 : 2;
            const speedFactor = clamp((speedKmh - 40) / 240, 0.2, 1.25);
            for (let s = 0; s < sprayCount; s++) {
              if (this.sprayParticles.length >= this.maxSprayParticles) {
                this.sprayParticles.shift();
              }
              // Alternate between rear diffuser plume and left/right rear tire rooster tails
              const lane = s % 3 === 0 ? 0 : s % 3 === 1 ? -trackHalf : trackHalf;
              const backOffset = -2.35 - Math.random() * 1.1;
              const px =
                primaryCar.x +
                cosH * backOffset +
                nx * (lane + (Math.random() - 0.5) * 0.45);
              const py =
                primaryCar.y +
                sinH * backOffset +
                ny * (lane + (Math.random() - 0.5) * 0.45);

              const backwardSpeed = (0.45 + Math.random() * 0.65) * speedFactor;
              const lateralSpread =
                lane * 0.22 + (Math.random() - 0.5) * 0.38 * speedFactor;

              this.sprayParticles.push({
                x: px,
                y: py,
                vx: -cosH * backwardSpeed + nx * lateralSpread,
                vy: -sinH * backwardSpeed + ny * lateralSpread,
                radius: 0.75 + Math.random() * 0.95 + carWetness * 0.5,
                alpha: clamp(
                  (0.28 + Math.random() * 0.28) * carWetness * (0.55 + 0.45 * speedFactor),
                  0.16,
                  0.72
                )
              });
            }
          }
        }

        const isDriftingOrLimit = slipDeg > 8 || gripPct > 96;

        if (isDriftingOrLimit && this._lastCarPos) {
          const dist = Math.hypot(
            primaryCar.x - this._lastCarPos.x,
            primaryCar.y - this._lastCarPos.y
          );
          if (dist > 0.2 && dist < 18) {
            const prx =
              this._lastCarPos.x +
              Math.cos(this._lastCarPos.heading) * rearAxleOffset;
            const pry =
              this._lastCarPos.y +
              Math.sin(this._lastCarPos.heading) * rearAxleOffset;

            this.skidMarks.push({
              lx0: prx + nx * trackHalf,
              ly0: pry + ny * trackHalf,
              lx1: rx + nx * trackHalf,
              ly1: ry + ny * trackHalf,
              rx0: prx - nx * trackHalf,
              ry0: pry - ny * trackHalf,
              rx1: rx - nx * trackHalf,
              ry1: ry - ny * trackHalf,
              alpha: clamp((slipDeg - 6) / 18 + (gripPct - 92) / 15, 0.25, 0.75)
            });

            if (this.skidMarks.length > this.maxSkidMarks) {
              this.skidMarks.shift();
            }

            // Spawn drift smoke particles when slip angle is pronounced (and surface is mostly dry)
            if (
              slipDeg > 8 &&
              carWetness < 0.25 &&
              this.smokeParticles.length < this.maxSmokeParticles
            ) {
              this.smokeParticles.push({
                x: rx + (Math.random() - 0.5) * 1.5,
                y: ry + (Math.random() - 0.5) * 1.5,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                radius: 0.9 + Math.random() * 1.1,
                alpha: clamp((slipDeg - 7) / 22, 0.22, 0.65)
              });
            }
          }
        }

        this._lastCarPos = {
          x: primaryCar.x,
          y: primaryCar.y,
          heading: heading
        };
      }

      // 2. Draw rubber skid marks on asphalt
      if (this.skidMarks.length > 0) {
        ctx.save();
        ctx.lineWidth = Math.max(0.32, 0.9 / this.zoom);
        for (let i = 0; i < this.skidMarks.length; i++) {
          const m = this.skidMarks[i];
          ctx.strokeStyle = `rgba(10, 12, 16, ${m.alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(m.lx0, m.ly0);
          ctx.lineTo(m.lx1, m.ly1);
          ctx.moveTo(m.rx0, m.ry0);
          ctx.lineTo(m.rx1, m.ry1);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 3. Update & draw tire smoke particles
      if (this.smokeParticles.length > 0) {
        ctx.save();
        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
          const p = this.smokeParticles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.radius += 0.08;
          p.alpha *= 0.94;
          if (p.alpha < 0.03) {
            this.smokeParticles.splice(i, 1);
            continue;
          }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(226, 232, 240, ${p.alpha.toFixed(2)})`;
          ctx.fill();
        }
        ctx.restore();
      }

      // 4. Update & draw cyan/white water rooster-tail spray mist particles
      if (this.sprayParticles.length > 0) {
        ctx.save();
        for (let i = this.sprayParticles.length - 1; i >= 0; i--) {
          const sp = this.sprayParticles[i];
          sp.x += sp.vx;
          sp.y += sp.vy;
          sp.radius += 0.14;
          sp.alpha *= 0.91;
          if (sp.alpha < 0.025) {
            this.sprayParticles.splice(i, 1);
            continue;
          }
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(186, 230, 253, ${sp.alpha.toFixed(3)})`;
          ctx.fill();
        }
        ctx.restore();
      }
    }

    _renderCarsAndTrails(ctx, simState, normOptimal, normGhost, weather = null) {
      const primaryCar = simState.primaryCar || simState.car || null;
      const ghostCar = simState.ghostCar || null;

      // Update & render skid marks, smoke, and wet rooster-tail spray particles
      this._updateAndRenderParticles(ctx, simState, 0.016, weather);

      // Render Ghost Car first (underneath Primary Car)
      if (ghostCar && typeof ghostCar.x === 'number') {
        this._renderSingleCar(ctx, ghostCar, true);
      }

      // Render Primary Car + Floating Telemetry Pill (includes Pirelli compound badge)
      if (primaryCar && typeof primaryCar.x === 'number') {
        this._renderSingleCar(ctx, primaryCar, false);
        this._drawCarTelemetryPill(ctx, primaryCar, ghostCar);
      }
    }

    _renderCar(ctx, simState, normOptimal, normGhost, weather = null) {
      this._renderCarsAndTrails(ctx, simState, normOptimal, normGhost, weather);
    }

    _renderSingleCar(ctx, car, isGhost) {
      this._drawTopDownRaceCar(ctx, car, isGhost);
    }

    _drawTopDownRaceCar(ctx, car, isGhost) {
      ctx.save();
      ctx.translate(car.x, car.y);

      // Ensure car is always clearly visible even when zoomed far out
      const minScreenLenPx = 22;
      const worldLen = 4.8;
      const scaleBoost = Math.max(1, minScreenLenPx / (worldLen * this.zoom));
      ctx.scale(scaleBoost, scaleBoost);

      // Orient to vehicle heading (includes slip angle for drift cars!)
      const slipRad =
        car.slipAngle !== undefined
          ? car.slipAngle
          : ((car.slipAngleDeg || 0) * Math.PI) / 180;
      const visualHeading =
        car.bodyHeading !== undefined
          ? car.bodyHeading
          : (car.heading || 0) + slipRad;

      ctx.rotate(visualHeading);
      ctx.globalAlpha = isGhost ? 0.58 : 1.0;

      const bodyColor =
        car.color || (isGhost ? '#a855f7' : '#06b6d4');
      const brake = clamp(car.brake || 0, 0, 1);
      const throttle = clamp(car.throttle || 0, 0, 1);
      const tireInfo = this._resolveTireVisuals(car);

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      roundRectPath(ctx, -2.55, -1.15, 5.1, 2.3, 0.5);
      ctx.fill();

      // 4 Wheels + Pirelli Tire Compound Sidewall Color Rings
      const wheels = [
        { x: 1.45, y: -1.08, w: 0.85, h: 0.36 },  // FL
        { x: 1.45, y: 0.72, w: 0.85, h: 0.36 },   // FR
        { x: -1.65, y: -1.12, w: 0.92, h: 0.42 }, // RL
        { x: -1.65, y: 0.70, w: 0.92, h: 0.42 }   // RR
      ];
      wheels.forEach((w) => {
        ctx.fillStyle = '#090d16';
        roundRectPath(ctx, w.x - w.w * 0.5, w.y, w.w, w.h, 0.1);
        ctx.fill();

        // Crisp Pirelli colored sidewall stripe/ring on each tire
        ctx.strokeStyle = tireInfo.color;
        ctx.lineWidth = 0.085;
        roundRectPath(
          ctx,
          w.x - w.w * 0.5 + 0.06,
          w.y + 0.05,
          w.w - 0.12,
          w.h - 0.10,
          0.06
        );
        ctx.stroke();
      });

      // Brake disc glow when braking > 0.2
      if (brake > 0.2 && !isGhost) {
        const glowAlpha = clamp((brake - 0.2) / 0.8, 0.2, 0.95);
        ctx.fillStyle = `rgba(239, 68, 68, ${glowAlpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(1.45, -0.9, 0.38, 0, Math.PI * 2);
        ctx.arc(1.45, 0.9, 0.38, 0, Math.PI * 2);
        ctx.arc(-1.65, -0.9, 0.35, 0, Math.PI * 2);
        ctx.arc(-1.65, 0.9, 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // Exhaust / Throttle diffuser flame glow
      if (throttle > 0.75 && !isGhost) {
        const tAlpha = clamp((throttle - 0.75) * 3.2, 0.15, 0.75);
        ctx.fillStyle = `rgba(56, 189, 248, ${tAlpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(-2.45, -0.28);
        ctx.lineTo(-3.35 - Math.random() * 0.4, 0);
        ctx.lineTo(-2.45, 0.28);
        ctx.closePath();
        ctx.fill();
      }

      // Rear Wing
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 0.12;
      roundRectPath(ctx, -2.55, -1.02, 0.52, 2.04, 0.1);
      ctx.fill();
      ctx.stroke();

      // Sculpted Aero Body / Sidepods + Nosecone
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.moveTo(2.55, 0); // Nose tip
      ctx.lineTo(1.75, -0.42);
      ctx.lineTo(0.65, -0.92); // Sidepod leading edge
      ctx.lineTo(-1.85, -0.82);
      ctx.lineTo(-2.25, -0.45);
      ctx.lineTo(-2.25, 0.45);
      ctx.lineTo(-1.85, 0.82);
      ctx.lineTo(0.65, 0.92);
      ctx.lineTo(1.75, 0.42);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 0.09;
      ctx.stroke();

      // Front Wing
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 0.1;
      roundRectPath(ctx, 2.05, -1.04, 0.45, 2.08, 0.08);
      ctx.fill();
      ctx.stroke();

      // Cockpit & Driver Helmet
      ctx.fillStyle = '#090d16';
      roundRectPath(ctx, -0.55, -0.34, 1.05, 0.68, 0.28);
      ctx.fill();

      ctx.fillStyle = isGhost ? '#e2e8f0' : '#facc15';
      ctx.beginPath();
      ctx.arc(-0.08, 0, 0.22, 0, Math.PI * 2);
      ctx.fill();

      // Rear Brake Rain Light (also flashes in wet zones)
      const isWetCar = (car.wetness || car.localWetness || 0) > 0.12;
      if (brake > 0.1 || (isWetCar && Math.sin(this._pulsePhase * 4) > 0)) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(-2.45, 0, 0.18, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    _drawCarTelemetryPill(ctx, car, ghostCar) {
      ctx.save();
      ctx.translate(car.x, car.y);
      const invScale = 1 / this.zoom;
      ctx.scale(invScale, invScale);

      const speedKmh = Math.round(
        car.speedKmh !== undefined
          ? car.speedKmh
          : (car.speed || car.v || 0) * 3.6
      );
      const gear = car.gear || Math.max(1, Math.min(8, Math.floor(speedKmh / 38) + 1));
      const tireInfo = this._resolveTireVisuals(car);
      const compoundBadge = `[${tireInfo.code}]`;

      let deltaStr = '';
      let deltaColor = '#94a3b8';
      if (typeof car.deltaTime === 'number') {
        const sign = car.deltaTime > 0 ? '+' : '';
        deltaStr = `${sign}${car.deltaTime.toFixed(2)}s`;
        deltaColor = car.deltaTime <= 0 ? '#10b981' : '#ef4444';
      }

      const pillW = deltaStr ? 168 : 124;
      const pillH = 22;
      const pillY = -36;

      roundRectPath(ctx, -pillW * 0.5, pillY, pillW, pillH, 6);
      ctx.fillStyle = 'rgba(10, 15, 25, 0.92)';
      ctx.fill();
      ctx.strokeStyle = car.color || '#06b6d4';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`${speedKmh} km/h`, -pillW * 0.5 + 7, pillY + pillH * 0.5);

      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`G${gear}`, -pillW * 0.5 + 64, pillY + pillH * 0.5);

      // Pirelli compound code badge (e.g. [C4], [INT], [WET])
      ctx.fillStyle = tireInfo.color;
      ctx.fillText(compoundBadge, -pillW * 0.5 + 86, pillY + pillH * 0.5);

      if (deltaStr) {
        ctx.textAlign = 'right';
        ctx.fillStyle = deltaColor;
        ctx.fillText(deltaStr, pillW * 0.5 - 7, pillY + pillH * 0.5);
      }

      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // LAYER 8: Hover Inspection Crosshair
    // ------------------------------------------------------------------------
    _renderInspectionCrosshair(ctx, simState, normOptimal, samples) {
      if (!simState || simState.inspectedStation === undefined || simState.inspectedStation === null) {
        return;
      }

      const idx =
        typeof simState.inspectedStation === 'object'
          ? simState.inspectedStation.index
          : simState.inspectedStation;

      const pts = (normOptimal && normOptimal.stations) || samples;
      if (!pts || !pts.length) return;

      const st = pts[clamp(idx, 0, pts.length - 1)];
      if (!st) return;

      const invScale = 1 / this.zoom;
      const pulse = 1 + 0.22 * Math.sin(this._pulsePhase * 2);

      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.scale(invScale, invScale);

      // Pulsing outer reticle ring
      ctx.beginPath();
      ctx.arc(0, 0, 11 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Crosshair ticks
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(-6, 0);
      ctx.moveTo(6, 0);
      ctx.lineTo(16, 0);
      ctx.moveTo(0, -16);
      ctx.lineTo(0, -6);
      ctx.moveTo(0, 6);
      ctx.lineTo(0, 16);
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();

      // Tooltip card
      if (st.speedKmh !== undefined) {
        const boxW = 128;
        const boxH = 42;
        roundRectPath(ctx, 14, -boxH - 8, boxW, boxH, 6);
        ctx.fillStyle = 'rgba(10, 15, 25, 0.94)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.1;
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`s = ${Math.round(st.s)}m`, 21, -boxH + 6);

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(
          `${Math.round(st.speedKmh)} km/h • G${st.gear || 1}`,
          21,
          -boxH + 20
        );

        const thr = Math.round((st.throttle || 0) * 100);
        const brk = Math.round((st.brake || 0) * 100);
        ctx.fillStyle = brk > 5 ? '#ef4444' : '#10b981';
        ctx.font = '8.5px "JetBrains Mono", monospace';
        ctx.fillText(`THR ${thr}%  BRK ${brk}%`, 21, -boxH + 33);
      }

      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // Screen-Space Scale Bar
    // ------------------------------------------------------------------------
    _renderScaleBar(ctx) {
      // Pick nice metric distance that renders between 55px and 140px
      const candidates = [5, 10, 20, 50, 100, 200, 500];
      let chosenMeters = 100;
      for (let i = 0; i < candidates.length; i++) {
        const px = candidates[i] * this.zoom;
        if (px >= 50 && px <= 150) {
          chosenMeters = candidates[i];
          break;
        }
      }
      const barPx = chosenMeters * this.zoom;
      const x0 = 18;
      const y0 = this.height - 18;

      ctx.save();
      roundRectPath(ctx, x0 - 8, y0 - 22, barPx + 16, 28, 5);
      ctx.fillStyle = 'rgba(10, 15, 25, 0.78)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0 - 5);
      ctx.lineTo(x0, y0);
      ctx.lineTo(x0 + barPx, y0);
      ctx.lineTo(x0 + barPx, y0 - 5);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${chosenMeters}m`, x0 + barPx * 0.5, y0 - 9);
      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // Weather Layer 1: Cloud Ground Shadows on Track & Grass
    // ------------------------------------------------------------------------
    _renderCloudShadows(ctx, weather) {
      if (!weather || !Array.isArray(weather.clouds) || !weather.clouds.length) {
        return;
      }

      ctx.save();
      for (let i = 0; i < weather.clouds.length; i++) {
        const c = weather.clouds[i];
        if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') continue;

        const radius = Math.max(20, Number(c.radius) || 180);
        const density = clamp(
          c.density !== undefined ? Number(c.density) : 0.75,
          0.05,
          1.0
        );

        // Offset slightly opposite the sun angle (south-east ground shadow)
        const shadowOffsetX = radius * 0.14 + 12;
        const shadowOffsetY = radius * 0.18 + 15;
        const sx = c.x + shadowOffsetX;
        const sy = c.y + shadowOffsetY;
        const shadowR = radius * 1.06;

        const shadowGrad = ctx.createRadialGradient(
          sx,
          sy,
          shadowR * 0.08,
          sx,
          sy,
          shadowR
        );
        shadowGrad.addColorStop(0, `rgba(2, 6, 23, ${(0.42 * density).toFixed(3)})`);
        shadowGrad.addColorStop(
          0.62,
          `rgba(2, 6, 23, ${(0.24 * density).toFixed(3)})`
        );
        shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');

        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, shadowR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // Weather Layer 2: Interactive Volumetric Cloud Layer & Gizmos
    // ------------------------------------------------------------------------
    _renderClouds(ctx, weather, editorState = {}, shadowAlreadyDrawn = false) {
      if (!weather || !Array.isArray(weather.clouds) || !weather.clouds.length) {
        return;
      }

      // Step 1: Ground Shadow on Track (if not already rendered in Layer 2.5)
      if (!shadowAlreadyDrawn) {
        this._renderCloudShadows(ctx, weather);
      }

      const invScale = 1 / this.zoom;
      const toolMode =
        (editorState &&
          (editorState.mode || editorState.tool || editorState.activeTool)) ||
        '';
      const isPlaceCloudMode =
        toolMode === 'place_cloud' ||
        Boolean(weather.placeCloudMode) ||
        Boolean(weather.cloudToolActive);

      const selectedIdx =
        weather.selectedCloudIndex !== undefined
          ? weather.selectedCloudIndex
          : editorState && editorState.selectedCloudIndex !== undefined
          ? editorState.selectedCloudIndex
          : -1;
      const hoveredIdx =
        weather.hoveredCloudIndex !== undefined
          ? weather.hoveredCloudIndex
          : editorState && editorState.hoveredCloudIndex !== undefined
          ? editorState.hoveredCloudIndex
          : -1;

      // Procedural puff lobe templates (angleRad, distFactor, radiusFactor)
      const puffLobes = [
        { ang: 0.35, dist: 0.36, rad: 0.62 },
        { ang: 1.62, dist: 0.38, rad: 0.58 },
        { ang: 2.85, dist: 0.34, rad: 0.65 },
        { ang: 4.12, dist: 0.40, rad: 0.56 },
        { ang: 5.38, dist: 0.32, rad: 0.60 }
      ];

      ctx.save();

      for (let i = 0; i < weather.clouds.length; i++) {
        const c = weather.clouds[i];
        if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') continue;

        const radius = Math.max(20, Number(c.radius) || 180);
        const density = clamp(
          c.density !== undefined ? Number(c.density) : 0.75,
          0.05,
          1.0
        );
        const isSelected = i === selectedIdx;
        const isHovered = i === hoveredIdx;

        // Step 2: Translucent Volumetric Cloud Canopy (cars drive underneath!)
        // Core meteorological cooling cell gradient
        const coreGrad = ctx.createRadialGradient(
          c.x - radius * 0.1,
          c.y - radius * 0.1,
          radius * 0.05,
          c.x,
          c.y,
          radius
        );
        coreGrad.addColorStop(
          0,
          `rgba(226, 232, 240, ${(0.18 * density).toFixed(3)})`
        );
        coreGrad.addColorStop(
          0.55,
          `rgba(203, 213, 225, ${(0.12 * density).toFixed(3)})`
        );
        coreGrad.addColorStop(
          0.82,
          `rgba(148, 163, 184, ${(0.05 * density).toFixed(3)})`
        );
        coreGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');

        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // 5 procedural puff lobes around center for volumetric cloud texture
        const seedOffset = (i + 1) * 1.17;
        for (let k = 0; k < puffLobes.length; k++) {
          const lobe = puffLobes[k];
          const breathe =
            0.03 * Math.sin(this._pulsePhase * 0.5 + seedOffset + k * 1.3);
          const ang = lobe.ang + seedOffset;
          const dist = radius * (lobe.dist + breathe);
          const lx = c.x + Math.cos(ang) * dist;
          const ly = c.y + Math.sin(ang) * dist;
          const lr = radius * lobe.rad;

          const puffGrad = ctx.createRadialGradient(
            lx - lr * 0.18,
            ly - lr * 0.18,
            lr * 0.06,
            lx,
            ly,
            lr
          );
          puffGrad.addColorStop(
            0,
            `rgba(248, 250, 252, ${(0.15 * density).toFixed(3)})`
          );
          puffGrad.addColorStop(
            0.5,
            `rgba(226, 232, 240, ${(0.09 * density).toFixed(3)})`
          );
          puffGrad.addColorStop(1, 'rgba(203, 213, 225, 0)');

          ctx.fillStyle = puffGrad;
          ctx.beginPath();
          ctx.arc(lx, ly, lr, 0, Math.PI * 2);
          ctx.fill();
        }

        // Subtle meteorological radar cooling footprint ring
        ctx.beginPath();
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle =
          isSelected || isHovered
            ? isSelected
              ? 'rgba(56, 189, 248, 0.85)'
              : 'rgba(248, 250, 252, 0.72)'
            : isPlaceCloudMode
            ? 'rgba(56, 189, 248, 0.42)'
            : 'rgba(148, 163, 184, 0.16)';
        ctx.lineWidth = (isSelected || isHovered ? 2.0 : 1.1) * invScale;
        ctx.setLineDash([6 * invScale, 5 * invScale]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Step 3: Interactive Ring, Center Handle & Callout Pill when in place_cloud mode or hovered/selected
        if (isPlaceCloudMode || isSelected || isHovered) {
          // 4 perimeter resize ticks on the cloud boundary ring
          const tickLen = 6 * invScale;
          ctx.strokeStyle = isSelected ? '#38bdf8' : '#cbd5e1';
          ctx.lineWidth = 1.6 * invScale;
          ctx.beginPath();
          ctx.moveTo(c.x + radius - tickLen, c.y);
          ctx.lineTo(c.x + radius + tickLen, c.y);
          ctx.moveTo(c.x - radius - tickLen, c.y);
          ctx.lineTo(c.x - radius + tickLen, c.y);
          ctx.moveTo(c.x, c.y + radius - tickLen);
          ctx.lineTo(c.x, c.y + radius + tickLen);
          ctx.moveTo(c.x, c.y - radius - tickLen);
          ctx.lineTo(c.x, c.y - radius + tickLen);
          ctx.stroke();

          // Center draggable handle & label in screen-constant scale
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.scale(invScale, invScale);

          if (isSelected || isHovered) {
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.strokeStyle = isSelected
              ? 'rgba(56, 189, 248, 0.9)'
              : 'rgba(248, 250, 252, 0.75)';
            ctx.lineWidth = 1.8;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? '#0284c7' : '#1e293b';
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.8;
          ctx.stroke();

          // Inner cloud dot / crosshair
          ctx.beginPath();
          ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#f8fafc';
          ctx.fill();

          // Floating callout pill: "☁ Cloud #1 • R=220m"
          const labelText = `☁ Cloud #${i + 1} • R=${Math.round(radius)}m`;
          const pillW = Math.max(122, labelText.length * 6.4);
          const pillH = 20;
          roundRectPath(ctx, -pillW * 0.5, -34, pillW, pillH, 5);
          ctx.fillStyle = 'rgba(10, 15, 25, 0.92)';
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.55)';
          ctx.lineWidth = 1.1;
          ctx.stroke();

          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, 0, -24);

          ctx.restore();
        }
      }

      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // Weather Layer 3: Animated Wind Streamlines & Track-Edge Wind Chevrons
    // ------------------------------------------------------------------------
    _renderWindField(ctx, weather, samples) {
      if (!weather || !(weather.windSpeedKmh > 0.5)) return;

      const windSpeed = Number(weather.windSpeedKmh) || 0;
      const windDirDeg = Number(weather.windDirectionDeg) || 0;
      const rad = (windDirDeg * Math.PI) / 180;
      const wx = Math.cos(rad);
      const wy = Math.sin(rad);
      const invScale = 1 / this.zoom;

      if (!this.windParticles || this.windParticles.length === 0) {
        this._initWindParticles();
      }

      // 1. Streamline Color Palette: cyan/sky-blue for moderate wind, shifting toward amber/rose for >55 km/h gale-force winds
      let rCol = 56;
      let gCol = 189;
      let bCol = 248;
      if (windSpeed > 55) {
        const galeT = clamp((windSpeed - 55) / 35, 0, 1);
        rCol = Math.round(lerp(245, 244, galeT));
        gCol = Math.round(lerp(158, 63, galeT));
        bCol = Math.round(lerp(11, 94, galeT));
      } else if (windSpeed > 35) {
        const modT = clamp((windSpeed - 35) / 20, 0, 1);
        rCol = Math.round(lerp(56, 245, modT));
        gCol = Math.round(lerp(189, 158, modT));
        bCol = Math.round(lerp(248, 11, modT));
      }

      // 2. Render ~90 Animated Wind Streamline Particles across the circuit
      const worldSpanX = (this.width / this.zoom) * 1.18;
      const worldSpanY = (this.height / this.zoom) * 1.18;
      const speedPxPerFrame = 0.85 + windSpeed * 0.095;
      const baseStreakWorldLen = (18 + Math.min(52, windSpeed * 0.65)) * invScale;

      ctx.save();
      ctx.lineCap = 'round';

      for (let i = 0; i < this.windParticles.length; i++) {
        const p = this.windParticles[i];
        const stepPx = speedPxPerFrame * p.speedMul;

        p.u = (p.u + (wx * stepPx) / Math.max(320, this.width) + 10) % 1;
        p.v = (p.v + (wy * stepPx) / Math.max(320, this.height) + 10) % 1;

        const headX = this.camX + (p.u - 0.5) * worldSpanX;
        const headY = this.camY + (p.v - 0.5) * worldSpanY;
        const streakLen = baseStreakWorldLen * p.lenMul;
        const tailX = headX - wx * streakLen;
        const tailY = headY - wy * streakLen;
        const midX = headX - wx * (streakLen * 0.42);
        const midY = headY - wy * (streakLen * 0.42);

        const pulseAlpha =
          p.alphaBase *
          (0.78 + 0.22 * Math.sin(this._pulsePhase + p.phase)) *
          clamp(windSpeed / 18, 0.35, 1.0);

        // Tapered outer tail
        ctx.strokeStyle = `rgba(${rCol}, ${gCol}, ${bCol}, ${(pulseAlpha * 0.38).toFixed(3)})`;
        ctx.lineWidth = 1.1 * invScale;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        // Brighter leading core streak
        ctx.strokeStyle = `rgba(${rCol}, ${gCol}, ${bCol}, ${(pulseAlpha * 0.85).toFixed(3)})`;
        ctx.lineWidth = 2.0 * invScale;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(headX, headY);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Subtle Wind-Direction Chevrons along Track Edges (Headwind / Tailwind / Crosswind)
      if (weather.showWindArrows !== false && samples && samples.length > 12) {
        const arrowCount = 16;
        const step = Math.max(1, Math.floor(samples.length / arrowCount));

        ctx.save();
        for (let idx = 0, count = 0; idx < samples.length; idx += step, count++) {
          const s = samples[idx];
          // Dot product between track travel tangent (tx, ty) and wind vector (wx, wy):
          // dot < -0.35 => Headwind (wind opposes car travel, boosts aero downforce/drag)
          // dot > +0.35 => Tailwind (wind pushes from behind, reduces relative airspeed & grip)
          // |dot| <= 0.35 => Crosswind
          const dot = s.tx * wx + s.ty * wy;

          let arrowColor = '#38bdf8'; // Crosswind (sky-blue)
          let modeLabel = 'XWD';
          if (dot < -0.35) {
            arrowColor = '#10b981'; // Headwind (emerald/cyan)
            modeLabel = 'HDW';
          } else if (dot > 0.35) {
            arrowColor = '#f43f5e'; // Tailwind (red/amber warning)
            modeLabel = 'TLW';
          }

          const offsetDist = (s.halfWidth || 6) + 12 * invScale;
          const ax = s.x + s.nx * offsetDist;
          const ay = s.y + s.ny * offsetDist;

          ctx.save();
          ctx.translate(ax, ay);
          ctx.scale(invScale, invScale);

          // Rotate chevron to wind direction
          ctx.save();
          ctx.rotate(rad);

          ctx.strokeStyle = arrowColor;
          ctx.fillStyle = arrowColor;
          ctx.globalAlpha = 0.82;
          ctx.lineWidth = 1.6;

          // Sleek aerodynamic wind arrow + double chevron
          ctx.beginPath();
          ctx.moveTo(-7, 0);
          ctx.lineTo(6, 0);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(2.5, -3.5);
          ctx.lineTo(4, 0);
          ctx.lineTo(2.5, 3.5);
          ctx.closePath();
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(-3, -3);
          ctx.lineTo(0.5, 0);
          ctx.lineTo(-3, 3);
          ctx.stroke();
          ctx.restore();

          // Show compact Headwind / Tailwind / Crosswind tag on every 4th marker when wind >= 10 km/h
          if (count % 4 === 0 && windSpeed >= 10) {
            ctx.globalAlpha = 0.86;
            ctx.fillStyle = arrowColor;
            ctx.font = 'bold 8px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(modeLabel, 0, -11);
          }

          ctx.restore();
        }
        ctx.restore();
      }
    }

    // ------------------------------------------------------------------------
    // Weather Layer 4: On-Canvas Interactive Wind Rose / Compass HUD
    // ------------------------------------------------------------------------
    _renderWindCompassHUD(ctx, weather) {
      const cx = 56;
      const cy = 56;
      const r = 36;
      this.windCompassBounds = { cx, cy, r };

      const windSpeed = Math.max(0, Number(weather && weather.windSpeedKmh) || 0);
      const windDeg =
        (((Number(weather && weather.windDirectionDeg) || 0) % 360) + 360) % 360;
      const rad = (windDeg * Math.PI) / 180;

      const isGale = windSpeed > 55;
      const accentColor = isGale
        ? '#f43f5e'
        : windSpeed > 35
        ? '#f59e0b'
        : '#38bdf8';

      ctx.save();

      // 1. Outer glassmorphic compass bezel
      ctx.beginPath();
      ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 15, 25, 0.86)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 2. Inner compass dial ring
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. Azimuth degree ticks every 30°
      for (let deg = 0; deg < 360; deg += 30) {
        if (deg % 90 === 0) continue; // cardinal positions reserved for N/E/S/W letters
        const a = (deg * Math.PI) / 180;
        const innerR = r - 4;
        const outerR = r;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
        ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
        ctx.stroke();
      }

      // 4. Cardinal labels (N / E / S / W)
      ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = '#38bdf8';
      ctx.fillText('N', cx, cy - r + 6.5);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('E', cx + r - 6.5, cy + 0.5);
      ctx.fillText('S', cx, cy + r - 6.5);
      ctx.fillText('W', cx - r + 6.5, cy + 0.5);

      // 5. Rotated Directional Wind Vane & Arrowhead
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rad);

      // Vane shaft
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-r + 10, 0);
      ctx.lineTo(r - 5, 0);
      ctx.stroke();

      // Tail stabilizer fins
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-r + 14, 0);
      ctx.lineTo(-r + 9, -4.5);
      ctx.moveTo(-r + 14, 0);
      ctx.lineTo(-r + 9, 4.5);
      ctx.stroke();

      // Glowing directional pointer tip on the compass rim
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(r + 1, 0);
      ctx.lineTo(r - 9, -5);
      ctx.lineTo(r - 6.5, 0);
      ctx.lineTo(r - 9, 5);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      // 6. Center readout core ("42 km/h" + degree sub-label)
      ctx.beginPath();
      ctx.arc(cx, cy, 17, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fill();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(windSpeed)}`, cx, cy - 3.5);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '7.5px "JetBrains Mono", monospace';
      ctx.fillText('km/h', cx, cy + 6.5);

      // Bottom micro-pill for wind bearing angle
      roundRectPath(ctx, cx - 22, cy + r + 3, 44, 13, 4);
      ctx.fillStyle = 'rgba(10, 15, 25, 0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.fillStyle = accentColor;
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.fillText(`WIND ${Math.round(windDeg)}°`, cx, cy + r + 9.5);

      ctx.restore();
    }
  }

  // ============================================================================
  // PART 2: TelemetryRenderer (#telemetry-canvas & #gg-canvas)
  // ============================================================================

  class TelemetryRenderer {
    constructor(telemetryCanvasOrId, ggCanvasOrId, options = {}) {
      this.telemetryCanvas = resolveCanvas(
        telemetryCanvasOrId,
        'telemetry-canvas'
      );
      this.ggCanvas = resolveCanvas(ggCanvasOrId, 'gg-canvas');

      this.tCtx = this.telemetryCanvas
        ? this.telemetryCanvas.getContext('2d')
        : null;
      this.gCtx = this.ggCanvas ? this.ggCanvas.getContext('2d') : null;

      this.dpr = window.devicePixelRatio || 1;
      this.tWidth = 600;
      this.tHeight = 200;
      this.gWidth = 220;
      this.gHeight = 200;

      // Extra overlay mode: 'gforce' | 'downforce' | 'none'
      this.overlayChannel = options.overlayChannel || 'gforce';
      this.onHoverStation = options.onHoverStation || null;
      this._hoveredStationIndex = null;
      this._lastRenderedState = null;

      this.resize();
      this._bindInteractiveScrub();
    }

    setHoverCallback(fn) {
      this.onHoverStation = fn;
    }

    setOverlayChannel(channel) {
      this.overlayChannel = channel;
      if (this._lastRenderedState) {
        this.render(this._lastRenderedState);
      }
    }

    resize() {
      this.dpr = window.devicePixelRatio || 1;

      if (this.telemetryCanvas) {
        const r = this.telemetryCanvas.getBoundingClientRect();
        this.tWidth = Math.max(1, r.width || this.telemetryCanvas.clientWidth || 600);
        this.tHeight = Math.max(1, r.height || this.telemetryCanvas.clientHeight || 200);
        const tw = Math.round(this.tWidth * this.dpr);
        const th = Math.round(this.tHeight * this.dpr);
        if (this.telemetryCanvas.width !== tw || this.telemetryCanvas.height !== th) {
          this.telemetryCanvas.width = tw;
          this.telemetryCanvas.height = th;
        }
      }

      if (this.ggCanvas) {
        const r = this.ggCanvas.getBoundingClientRect();
        this.gWidth = Math.max(1, r.width || this.ggCanvas.clientWidth || 220);
        this.gHeight = Math.max(1, r.height || this.ggCanvas.clientHeight || 200);
        const gw = Math.round(this.gWidth * this.dpr);
        const gh = Math.round(this.gHeight * this.dpr);
        if (this.ggCanvas.width !== gw || this.ggCanvas.height !== gh) {
          this.ggCanvas.width = gw;
          this.ggCanvas.height = gh;
        }
      }
    }

    _bindInteractiveScrub() {
      if (!this.telemetryCanvas) return;

      const handlePointer = (e) => {
        if (!this._lastRenderedState) return;
        const rect = this.telemetryCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const padLeft = 44;
        const padRight = 16;
        const plotW = Math.max(10, this.tWidth - padLeft - padRight);
        const ratio = clamp((mx - padLeft) / plotW, 0, 1);

        const normOpt = normalizeSolverResult(
          this._lastRenderedState.optimalResult,
          this._lastRenderedState.track
        );
        if (normOpt && normOpt.stations.length > 0) {
          const targetS = ratio * normOpt.totalLength;
          let bestIdx = 0;
          let bestDiff = Infinity;
          for (let i = 0; i < normOpt.stations.length; i++) {
            const d = Math.abs(normOpt.stations[i].s - targetS);
            if (d < bestDiff) {
              bestDiff = d;
              bestIdx = i;
            }
          }
          this._hoveredStationIndex = bestIdx;
          if (typeof this.onHoverStation === 'function') {
            this.onHoverStation(bestIdx, normOpt.stations[bestIdx]);
          }
        }
      };

      this.telemetryCanvas.addEventListener('mousemove', handlePointer);
      this.telemetryCanvas.addEventListener('mouseleave', () => {
        this._hoveredStationIndex = null;
        if (typeof this.onHoverStation === 'function') {
          this.onHoverStation(null, null);
        }
      });
    }

    render(state = {}) {
      this._lastRenderedState = state;

      // Auto-check resize
      if (this.telemetryCanvas) {
        const r = this.telemetryCanvas.getBoundingClientRect();
        if (r.width > 0 && Math.abs(r.width - this.tWidth) > 1) {
          this.resize();
        }
      }
      if (this.ggCanvas) {
        const r = this.ggCanvas.getBoundingClientRect();
        if (r.width > 0 && Math.abs(r.width - this.gWidth) > 1) {
          this.resize();
        }
      }

      const normOptimal = normalizeSolverResult(state.optimalResult, state.track);
      const normGhost = normalizeSolverResult(state.ghostResult, state.track);
      const normCenter = normalizeSolverResult(state.centerlineResult, state.track);

      if (this.tCtx) {
        this._renderStripChart(
          this.tCtx,
          normOptimal,
          normGhost || normCenter,
          state.simState || {},
          state.viewOptions || {}
        );
      }

      if (this.gCtx) {
        this._renderGGDiagram(
          this.gCtx,
          normOptimal,
          state.simState || {},
          state.car || (state.optimalResult && state.optimalResult.car) || null
        );
      }
    }

    // ------------------------------------------------------------------------
    // 1. Telemetry Strip Chart (#telemetry-canvas)
    // ------------------------------------------------------------------------
    _renderStripChart(ctx, normOptimal, normCompare, simState, viewOptions) {
      const W = this.tWidth;
      const H = this.tHeight;

      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Dark panel background
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, W, H);

      const padLeft = 44;
      const padRight = 16;
      const padTop = 22;
      const padBottom = 18;
      const plotW = Math.max(20, W - padLeft - padRight);
      const plotH = Math.max(20, H - padTop - padBottom);

      // Split into Upper 64% (Speed + G/Downforce overlay) and Lower 32% (Throttle & Brake)
      const speedH = Math.round(plotH * 0.63);
      const gapH = Math.round(plotH * 0.05);
      const pedalTop = padTop + speedH + gapH;
      const pedalH = Math.max(16, plotH - speedH - gapH);

      if (!normOptimal || !normOptimal.stations.length) {
        ctx.fillStyle = '#64748b';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Awaiting telemetry data...', W * 0.5, H * 0.5);
        ctx.restore();
        return;
      }

      const pts = normOptimal.stations;
      const totalLen = Math.max(1, normOptimal.totalLength);
      const maxSpd = Math.ceil(Math.max(240, normOptimal.maxSpeedKmh * 1.08) / 50) * 50;
      const minSpd = 0;

      const xForS = (s) => padLeft + clamp(s / totalLen, 0, 1) * plotW;
      const yForSpeed = (kmh) =>
        padTop + speedH - clamp((kmh - minSpd) / (maxSpd - minSpd), 0, 1) * speedH;

      // Horizontal speed grid lines & axis labels
      ctx.lineWidth = 1;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      const speedSteps = 4;
      for (let i = 0; i <= speedSteps; i++) {
        const val = Math.round((maxSpd / speedSteps) * i);
        const y = Math.round(yForSpeed(val)) + 0.5;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + plotW, y);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.fillText(`${val}`, padLeft - 6, y);
      }

      // Pedal frame background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.fillRect(padLeft, pedalTop, plotW, pedalH);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
      ctx.strokeRect(padLeft, pedalTop, plotW, pedalH);

      ctx.fillStyle = '#64748b';
      ctx.fillText('100%', padLeft - 6, pedalTop + 5);
      ctx.fillText('0%', padLeft - 6, pedalTop + pedalH - 3);

      // Sector vertical dividers (S1, S2, S3)
      const sectorRatios = [0, 1 / 3, 2 / 3];
      const sectorNames = ['S1', 'S2', 'S3'];
      for (let s = 0; s < 3; s++) {
        const sx = Math.round(padLeft + sectorRatios[s] * plotW) + 0.5;
        if (s > 0) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(sx, padTop);
          ctx.lineTo(sx, pedalTop + pedalH);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText(sectorNames[s], sx + 4, padTop - 9);
      }

      // Turn numbers (T1, T2...) along the top axis
      const corners = normOptimal.corners || [];
      ctx.textAlign = 'center';
      ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
      for (let i = 0; i < corners.length; i++) {
        const c = corners[i];
        const cx = xForS(c.s);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
        ctx.beginPath();
        ctx.moveTo(cx, padTop);
        ctx.lineTo(cx, padTop + speedH);
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.fillText(c.label || `T${c.number}`, cx, padTop - 9);
      }

      // Comparison Ghost / Centerline Speed Trace (Dashed)
      if (normCompare && normCompare.stations.length > 1) {
        const cPts = normCompare.stations;
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < cPts.length; i++) {
          const x = xForS(cPts[i].s);
          const y = yForSpeed(cPts[i].speedKmh);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = normCompare.color || 'rgba(168, 85, 247, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.restore();
      }

      // Primary Speed Trace with area gradient fill
      const primaryColor = normOptimal.color || '#06b6d4';
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = xForS(pts[i].s);
        const y = yForSpeed(pts[i].speedKmh);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // Subtle gradient fill under primary speed trace
      ctx.lineTo(padLeft + plotW, padTop + speedH);
      ctx.lineTo(padLeft, padTop + speedH);
      ctx.closePath();
      const spdGrad = ctx.createLinearGradient(0, padTop, 0, padTop + speedH);
      spdGrad.addColorStop(0, 'rgba(6, 182, 212, 0.22)');
      spdGrad.addColorStop(1, 'rgba(6, 182, 212, 0.01)');
      ctx.fillStyle = spdGrad;
      ctx.fill();
      ctx.restore();

      // Optional Lateral G or Downforce overlay on upper chart
      const overlayMode =
        (viewOptions && viewOptions.telemetryOverlay) || this.overlayChannel;
      if (overlayMode === 'gforce') {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const x = xForS(pts[i].s);
          const gMag = Math.abs(pts[i].latG || 0);
          const y =
            padTop + speedH - clamp(gMag / 4.0, 0, 1) * (speedH * 0.75);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.48)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.restore();
      } else if (overlayMode === 'downforce') {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const x = xForS(pts[i].s);
          const df = pts[i].downforce || 0;
          const y =
            padTop + speedH - clamp(df / 1500, 0, 1) * (speedH * 0.75);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.restore();
      }

      // Lower Strip: Throttle (%, green) & Brake (%, red)
      const yForPedal = (val01) =>
        pedalTop + pedalH - clamp(val01, 0, 1) * (pedalH - 2) - 1;

      // Throttle trace + fill
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = xForS(pts[i].s);
        const y = yForPedal(pts[i].throttle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineTo(padLeft + plotW, pedalTop + pedalH);
      ctx.lineTo(padLeft, pedalTop + pedalH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
      ctx.fill();
      ctx.restore();

      // Brake trace + fill
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = xForS(pts[i].s);
        const y = yForPedal(pts[i].brake);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineTo(padLeft + plotW, pedalTop + pedalH);
      ctx.lineTo(padLeft, pedalTop + pedalH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.fill();
      ctx.restore();

      // Distance X-axis labels at bottom
      ctx.fillStyle = '#64748b';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      const distTicks = 5;
      for (let i = 0; i <= distTicks; i++) {
        const d = Math.round((totalLen / distTicks) * i);
        const x = padLeft + (i / distTicks) * plotW;
        ctx.fillText(`${d}m`, x, H - 6);
      }

      // Live Playhead Line (Simulated Car's current s)
      const primaryCar = simState.primaryCar || simState.car;
      if (primaryCar && typeof primaryCar.s === 'number') {
        const px = xForS(primaryCar.s);
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, padTop);
        ctx.lineTo(px, pedalTop + pedalH);
        ctx.stroke();

        // Playhead triangle cap
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(px - 4, padTop);
        ctx.lineTo(px + 4, padTop);
        ctx.lineTo(px, padTop + 6);
        ctx.closePath();
        ctx.fill();
      }

      // Interactive Hover / Scrub Playhead
      const inspectIdx =
        this._hoveredStationIndex !== null
          ? this._hoveredStationIndex
          : simState.inspectedStation !== undefined &&
            simState.inspectedStation !== null
          ? typeof simState.inspectedStation === 'object'
            ? simState.inspectedStation.index
            : simState.inspectedStation
          : null;

      if (inspectIdx !== null && pts[inspectIdx]) {
        const st = pts[inspectIdx];
        const hx = xForS(st.s);
        const hy = yForSpeed(st.speedKmh);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(hx, padTop);
        ctx.lineTo(hx, pedalTop + pedalH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();

        // Compact readout badge on chart
        const badgeW = 148;
        const badgeH = 20;
        const bx = clamp(hx - badgeW * 0.5, padLeft + 2, padLeft + plotW - badgeW - 2);
        roundRectPath(ctx, bx, padTop + 4, badgeW, badgeH, 4);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          `${Math.round(st.s)}m | ${Math.round(st.speedKmh)} km/h | G${st.gear}`,
          bx + badgeW * 0.5,
          padTop + 14
        );
      }

      ctx.restore();
    }

    // ------------------------------------------------------------------------
    // 2. G-G Diagram & Live Dashboard Gauges (#gg-canvas)
    // ------------------------------------------------------------------------
    _renderGGDiagram(ctx, normOptimal, simState, carSpec) {
      const W = this.gWidth;
      const H = this.gHeight;

      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Background
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, W, H);

      const cx = W * 0.5;
      const cy = H * 0.46;
      const maxScaleG = 3.5; // 3.5G outer radius
      const radius = Math.max(36, Math.min(W * 0.40, H * 0.36));
      const pxPerG = radius / maxScaleG;

      // Concentric reference rings: 1G, 2G, 3G
      ctx.lineWidth = 1;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';

      for (let g = 1; g <= 3; g++) {
        const r = g * pxPerG;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.fillText(`${g}G`, cx + 3, cy - r - 1);
      }

      // Crosshair axes
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.beginPath();
      ctx.moveTo(cx - radius - 6, cy);
      ctx.lineTo(cx + radius + 6, cy);
      ctx.moveTo(cx, cy - radius - 6);
      ctx.lineTo(cx, cy + radius + 6);
      ctx.stroke();

      // Historical trail of G-points around the lap
      if (normOptimal && normOptimal.stations.length > 1) {
        const pts = normOptimal.stations;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          const gx = cx + clamp(pts[i].latG || 0, -maxScaleG, maxScaleG) * pxPerG;
          const gy = cy - clamp(pts[i].longG || 0, -maxScaleG, maxScaleG) * pxPerG;
          if (i === 0) ctx.moveTo(gx, gy);
          else ctx.lineTo(gx, gy);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.26)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }

      // Live car instantaneous (latG, longG) vector & speed-dependent aero grip envelope
      const primaryCar = simState.primaryCar || simState.car || null;
      const latG = primaryCar ? primaryCar.latG || 0 : 0;
      const longG = primaryCar ? primaryCar.longG || 0 : 0;
      const totalG = Math.hypot(latG, longG);

      // Compute current speed-dependent aero grip envelope radius
      let envelopeG =
        (primaryCar && primaryCar.maxGripG) ||
        (carSpec && carSpec.baseGripG) ||
        1.65;
      if (primaryCar && !primaryCar.maxGripG) {
        const spdMs =
          primaryCar.speedMs !== undefined
            ? primaryCar.speedMs
            : (primaryCar.speedKmh || 140) / 3.6;
        envelopeG = clamp(1.25 + (spdMs * spdMs) * 0.00032, 1.0, 3.4);
      }

      ctx.save();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, clamp(envelopeG, 0.5, maxScaleG) * pxPerG, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Live vector line & glowing dot
      const dotX = cx + clamp(latG, -maxScaleG, maxScaleG) * pxPerG;
      const dotY = cy - clamp(longG, -maxScaleG, maxScaleG) * pxPerG;

      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(dotX, dotY);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(dotX, dotY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#f43f5e';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Live Steering & Slip Angle Indicator Bar at the bottom of #gg-canvas
      const barW = Math.min(W - 24, 150);
      const barH = 7;
      const barX = (W - barW) * 0.5;
      const barY = H - 24;

      roundRectPath(ctx, barX, barY, barW, barH, 3);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      ctx.fill();

      const slipDeg = primaryCar
        ? primaryCar.slipAngleDeg !== undefined
          ? primaryCar.slipAngleDeg
          : (primaryCar.slipAngle || 0) * (180 / Math.PI)
        : 0;

      const slipNorm = clamp(slipDeg / 20, -1, 1);
      const indicatorX = cx + slipNorm * (barW * 0.46);

      ctx.fillStyle = Math.abs(slipDeg) > 8 ? '#f59e0b' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(indicatorX, barY + barH * 0.5, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Bottom telemetry text summary
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${totalG.toFixed(2)}G  |  SLIP ${slipDeg >= 0 ? '+' : ''}${slipDeg.toFixed(1)}°`,
        cx,
        H - 6
      );

      ctx.restore();
    }
  }

  // Expose on window.App namespace
  window.App.TrackRenderer = TrackRenderer;
  window.App.TelemetryRenderer = TelemetryRenderer;
})();
