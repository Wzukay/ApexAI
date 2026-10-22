/**
 * F1Shi — AI Optimal Racing Line & Quasi-Steady-State (QSS) Vehicle Dynamics Optimizer
 * Exposes window.App.PhysicsEngine and window.App.RacingLineOptimizer
 */
(function () {
  'use strict';

  window.App = window.App || {};

  // Physical constants
  const AIR_DENSITY = 1.225; // kg/m^3 at sea level (20°C / 293.15K reference)
  const GRAVITY = 9.81;      // m/s^2
  const DEFAULT_CRR = 0.014; // Rolling resistance coefficient
  const TWO_PI = Math.PI * 2;

  // Built-in Pirelli F1 & Custom Tire Compound Fallback Table
  const DEFAULT_TIRE_PRESETS = {
    c1: {
      id: 'c1',
      code: 'C1',
      name: 'Pirelli P Zero White Hard (C1)',
      shortName: 'C1 Hard',
      color: '#f8fafc',
      softness: 0.10,
      treadDepthMm: 0.0,
      defaultPressurePsi: 23.0
    },
    c2: {
      id: 'c2',
      code: 'C2',
      name: 'Pirelli P Zero White Med-Hard (C2)',
      shortName: 'C2 Med-Hard',
      color: '#e2e8f0',
      softness: 0.30,
      treadDepthMm: 0.0,
      defaultPressurePsi: 22.5
    },
    c3: {
      id: 'c3',
      code: 'C3',
      name: 'Pirelli P Zero Yellow Medium (C3)',
      shortName: 'C3 Medium',
      color: '#facc15',
      softness: 0.50,
      treadDepthMm: 0.0,
      defaultPressurePsi: 22.0
    },
    c4: {
      id: 'c4',
      code: 'C4',
      name: 'Pirelli P Zero Red Soft (C4)',
      shortName: 'C4 Soft',
      color: '#ef4444',
      softness: 0.78,
      treadDepthMm: 0.0,
      defaultPressurePsi: 21.5
    },
    c5: {
      id: 'c5',
      code: 'C5',
      name: 'Pirelli P Zero Red Qualifying (C5)',
      shortName: 'C5 Quali Soft',
      color: '#dc2626',
      softness: 1.00,
      treadDepthMm: 0.0,
      defaultPressurePsi: 21.0
    },
    inter: {
      id: 'inter',
      code: 'INT',
      name: 'Pirelli Cinturato Green Intermediate',
      shortName: 'Intermediate',
      color: '#22c55e',
      softness: 0.65,
      treadDepthMm: 4.5,
      defaultPressurePsi: 20.5
    },
    wet: {
      id: 'wet',
      code: 'WET',
      name: 'Pirelli Cinturato Blue Full Wet',
      shortName: 'Full Wet',
      color: '#3b82f6',
      softness: 0.75,
      treadDepthMm: 7.5,
      defaultPressurePsi: 19.5
    }
  };

  /**
   * Look up a tire preset by compound ID from window.App.TIRE_PRESETS or DEFAULT_TIRE_PRESETS.
   * @param {string} compoundId
   * @returns {Object}
   */
  function lookupTirePreset(compoundId) {
    const key = String(compoundId || 'c3').toLowerCase().trim();
    const externalPresets = window.App && window.App.TIRE_PRESETS;
    if (externalPresets) {
      if (Array.isArray(externalPresets)) {
        const found = externalPresets.find(
          t => t && (String(t.id || '').toLowerCase() === key || String(t.code || '').toLowerCase() === key)
        );
        if (found) return { ...(DEFAULT_TIRE_PRESETS[key] || DEFAULT_TIRE_PRESETS.c3), ...found };
      } else if (typeof externalPresets === 'object' && externalPresets[key]) {
        return { ...(DEFAULT_TIRE_PRESETS[key] || DEFAULT_TIRE_PRESETS.c3), ...externalPresets[key] };
      }
    }
    if (key === 'int' || key === 'intermediate') return DEFAULT_TIRE_PRESETS.inter;
    if (key === 'fullwet' || key === 'full_wet') return DEFAULT_TIRE_PRESETS.wet;
    return DEFAULT_TIRE_PRESETS[key] || DEFAULT_TIRE_PRESETS.c3;
  }

  /**
   * Normalize and sanitize weather, cloud cover & localized wet zone parameters with physically sound defaults.
   * Wind direction convention: 0° = blowing toward East (+X), 90° = blowing toward South (+Y).
   * @param {Object} [rawWeather]
   * @returns {Object}
   */
  function normalizeWeather(rawWeather) {
    const w = rawWeather || {};

    const windSpeedKmh = clamp(Number(w.windSpeedKmh ?? w.windSpeed ?? 0), 0, 120);
    const windSpeedMs = windSpeedKmh / 3.6;

    const rawDir = Number(w.windDirectionDeg ?? w.windDir ?? 0);
    const windDirectionDeg = Number.isFinite(rawDir) ? (((rawDir % 360) + 360) % 360) : 0;
    const windDirectionRad = (windDirectionDeg * Math.PI) / 180.0;

    // Wind velocity vector W = (Wx, Wy) in world coordinates
    const wx = windSpeedMs * Math.cos(windDirectionRad);
    const wy = windSpeedMs * Math.sin(windDirectionRad);

    const gustIntensity = clamp(Number(w.gustIntensity ?? 0.15), 0, 1);
    const ambientTempC = clamp(Number(w.ambientTempC ?? w.ambientTemp ?? 22), 5, 45);

    // Ideal gas law air density: rho = 1.225 * (293.15 / (273.15 + T_C))
    const airDensity = AIR_DENSITY * (293.15 / (273.15 + ambientTempC));

    const rawClouds = Array.isArray(w.clouds) ? w.clouds : [];
    const clouds = rawClouds
      .filter(c => c && Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y)))
      .map((c, idx) => ({
        id: String(c.id ?? `cloud-${idx + 1}`),
        x: Number(c.x),
        y: Number(c.y),
        radius: clamp(Number(c.radius ?? 220), 25, 1500),
        density: clamp(Number(c.density ?? 0.75), 0.15, 1.0),
        name: c.name || c.label || `Cell ${idx + 1}`
      }));

    // Localized wet zones on the circuit [{ id, x, y, radius, intensity, name }]
    const rawWetZones = Array.isArray(w.wetZones) ? w.wetZones : [];
    const wetZones = rawWetZones
      .filter(wz => wz && Number.isFinite(Number(wz.x)) && Number.isFinite(Number(wz.y)))
      .map((wz, idx) => ({
        id: String(wz.id ?? `wet-${idx + 1}`),
        x: Number(wz.x),
        y: Number(wz.y),
        radius: clamp(Number(wz.radius ?? 190), 25, 1500),
        intensity: clamp(Number(wz.intensity ?? wz.wetness ?? 0.75), 0.05, 1.0),
        name: wz.name || wz.label || `Wet Zone ${idx + 1}`
      }));

    const globalWetness = clamp(Number(w.globalWetness ?? 0), 0, 1);

    return {
      windSpeedKmh,
      windSpeedMs,
      windDirectionDeg,
      windDirectionRad,
      wx,
      wy,
      gustIntensity,
      ambientTempC,
      airDensity,
      clouds,
      wetZones,
      globalWetness,
      presetName: w.presetName || 'custom'
    };
  }

  /**
   * Resolve weather object from options.weather, carParams.weather, or track.weather.
   * @param {Object} [track]
   * @param {Object} [carParams]
   * @param {Object} [options]
   * @returns {Object}
   */
  function resolveWeather(track, carParams, options) {
    const raw =
      (options && options.weather) ||
      (carParams && carParams.weather) ||
      (track && track.weather) ||
      null;
    return normalizeWeather(raw);
  }

  /**
   * Compute local cloud shadow, surface wetness, water film depth, and wind components
   * at world point (x, y) with unit path tangent (tx, ty) and unit normal (nx, ny).
   * @param {number} x
   * @param {number} y
   * @param {number} tx
   * @param {number} ty
   * @param {number} nx
   * @param {number} ny
   * @param {Object} weather Normalized weather object
   * @returns {{
   *   cloudCover: number,
   *   localAirDensity: number,
   *   deltaMuCloud: number,
   *   wParallel: number,
   *   wPerp: number,
   *   gustMultiplier: number,
   *   wetness: number,
   *   waterDepthMm: number
   * }}
   */
  function evaluateLocalWeatherAtPoint(x, y, tx, ty, nx, ny, weather) {
    const w = weather || normalizeWeather(null);
    const clouds = w.clouds;
    let cloudSum = 0;

    for (let cIdx = 0; cIdx < clouds.length; cIdx++) {
      const c = clouds[cIdx];
      const dx = x - c.x;
      const dy = y - c.y;
      const distSq = dx * dx + dy * dy;
      const rSq = c.radius * c.radius;
      if (distSq < rSq) {
        const u = 1.0 - distSq / rSq;
        cloudSum += (u * u) * (c.density ?? 0.8);
      }
    }

    const cloudCover = clamp(cloudSum, 0.0, 1.0);

    // Compute local surface wetness W_i in [0, 1] from weather.wetZones and globalWetness
    const wetZones = w.wetZones || [];
    let dryProd = 1.0;
    for (let zIdx = 0; zIdx < wetZones.length; zIdx++) {
      const z = wetZones[zIdx];
      const dx = x - z.x;
      const dy = y - z.y;
      const distSq = dx * dx + dy * dy;
      const rSq = z.radius * z.radius;
      if (distSq < rSq) {
        const u = 1.0 - distSq / rSq;
        const sz = Math.pow(u, 1.6) * (z.intensity ?? 0.75);
        dryProd *= (1.0 - clamp(sz, 0.0, 1.0));
      }
    }
    const wetness = clamp((1.0 - dryProd) + (w.globalWetness || 0), 0.0, 1.0);
    const waterDepthMm = wetness > 0 ? 4.5 * Math.pow(wetness, 1.25) : 0.0;

    // Cloud shadow drops local asphalt temperature by up to 10°C -> deltaMu = -0.045 * C_cloud
    // and increases local air density by +1.8% * C_cloud
    const deltaMuCloud = -0.045 * cloudCover;
    const localAirDensity = w.airDensity * (1.0 + 0.018 * cloudCover);

    // Spatial gust & cloud-amplified turbulence around the circuit
    let gustMultiplier = 1.0;
    if (w.windSpeedMs > 0.01 && w.gustIntensity > 0.001) {
      const spatialWave =
        0.60 * Math.sin(0.0085 * x + 0.0065 * y) +
        0.40 * Math.cos(0.0145 * x - 0.0115 * y);
      const cloudGustAmp = 1.0 + 0.20 * cloudCover;
      gustMultiplier = Math.max(0.65, 1.0 + 0.18 * w.gustIntensity * cloudGustAmp * spatialWave);
    }

    const wxLocal = w.wx * gustMultiplier;
    const wyLocal = w.wy * gustMultiplier;

    // Tail/Headwind component along car tangent: >0 = Tailwind, <0 = Headwind
    const wParallel = wxLocal * tx + wyLocal * ty;
    // Crosswind component along normal vector n_i = (-ty, tx)
    const wPerp = wxLocal * nx + wyLocal * ny;

    return {
      cloudCover,
      localAirDensity,
      deltaMuCloud,
      wParallel,
      wPerp,
      gustMultiplier,
      wetness,
      waterDepthMm
    };
  }

  /**
   * Populate station-level weather fields on extracted track stations.
   * @param {Array<Object>} stations
   * @param {Object} weather
   */
  function attachStationWeather(stations, weather) {
    const w = normalizeWeather(weather);
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      const loc = evaluateLocalWeatherAtPoint(st.x, st.y, st.tx, st.ty, st.nx, st.ny, w);
      st.cloudCover = loc.cloudCover;
      st.localAirDensity = loc.localAirDensity;
      st.deltaMuCloud = loc.deltaMuCloud;
      st.wParallel = loc.wParallel;
      st.wPerp = loc.wPerp;
      st.gustMultiplier = loc.gustMultiplier;
      st.wetness = loc.wetness;
      st.waterDepthMm = loc.waterDepthMm;
    }
  }

  /**
   * Utility: Clamp number between min and max
   */
  function clamp(val, min, max) {
    return val < min ? min : (val > max ? max : val);
  }

  /**
   * Utility: Linear interpolation
   */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * Utility: Interpolate angle in radians (shortest arc)
   */
  function lerpAngle(a, b, t) {
    let diff = ((b - a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    return a + diff * t;
  }

  /**
   * Format lap or sector time in seconds to M:SS.mmm or SS.mmm
   * @param {number} seconds
   * @param {boolean} [forceMinutes=true]
   * @returns {string}
   */
  function formatLapTime(seconds, forceMinutes = true) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00.000';
    const totalMs = Math.round(seconds * 1000);
    const mins = Math.floor(totalMs / 60000);
    const remMs = totalMs % 60000;
    const secs = Math.floor(remMs / 1000);
    const ms = remMs % 1000;

    const msStr = String(ms).padStart(3, '0');
    if (mins > 0 || forceMinutes) {
      const secStr = String(secs).padStart(2, '0');
      return `${mins}:${secStr}.${msStr}`;
    }
    return `${secs}.${msStr}`;
  }

  /**
   * Normalize and sanitize car & tire parameters with physically sound defaults
   * so all presets and user slider adjustments behave consistently.
   * @param {Object} rawParams
   * @returns {Object}
   */
  function normalizeCarParams(rawParams) {
    const p = rawParams || {};

    const mass = clamp(Number(p.mass ?? p.weight ?? 798), 120, 3500);
    const powerKW = clamp(
      Number(p.powerKW ?? p.powerKw ?? (p.powerHP ? p.powerHP * 0.7457 : 735)),
      15,
      2000
    );
    const powerWatts = powerKW * 1000;

    // Pirelli Tire Compound & Custom Tire Hydro-Thermodynamics Normalization
    const tireCompound = String(p.tireCompound || 'c3').toLowerCase().trim();
    const presetTire = lookupTirePreset(tireCompound);

    const compoundSoftness = clamp(
      Number(p.compoundSoftness ?? presetTire.softness ?? 0.50),
      0.0,
      1.0
    );
    const treadDepthMm = clamp(
      Number(p.treadDepthMm ?? presetTire.treadDepthMm ?? 0.0),
      0.0,
      8.5
    );
    const tirePressurePsi = clamp(
      Number(p.tirePressurePsi ?? presetTire.defaultPressurePsi ?? presetTire.tirePressurePsi ?? 22.0),
      16.0,
      30.0
    );

    // Effective Tread Groove Ratio: 0 = pure slick, 0.60 = Inter (4.5 mm), 1.0 = Full Wet (7.5 mm)
    const treadGrooveRatio = clamp(treadDepthMm / 7.5, 0.0, 1.0);

    // Dry Tarmac Grip Multiplier (tireDryGripMul):
    // 1. Softness boosts dry mechanical adhesion (0.935 + 0.145 * compoundSoftness)
    const softnessDryBoost = 0.935 + 0.145 * compoundSoftness;
    // 2. Tread grooves cause tread block squirm and thermal overheating on dry asphalt
    const squirmPenalty = 1.0 - 0.22 * treadGrooveRatio - 0.06 * treadGrooveRatio * treadGrooveRatio;
    // 3. Tire pressure deviation from optimal dry pressure (22.0 PSI)
    const etaPressDry = 1.0 - 0.0035 * Math.pow(tirePressurePsi - 22.0, 2);
    const tireDryGripMul = clamp(softnessDryBoost * squirmPenalty * etaPressDry, 0.50, 1.25);

    // Critical dynamic hydroplaning speed (km/h and m/s)
    const vHydroKmh = 150.0 + 135.0 * Math.pow(treadGrooveRatio, 0.85) + 1.8 * (tirePressurePsi - 20.0);
    const vHydroMs = vHydroKmh / 3.6;

    // Base tire friction coefficient mu
    const baseMu = clamp(Number(p.mu ?? p.tireGrip ?? 1.8), 0.5, 4.0);
    const tireGripFront = Number(p.tireGripFront ?? baseMu);
    const tireGripRear = Number(p.tireGripRear ?? baseMu);

    // Front/rear grip balance effect:
    // If front & rear grip sliders are adjusted independently, effective grip reflects
    // both the mean grip level and any understeer/oversteer imbalance penalty.
    const avgAxleGrip = 0.5 * (tireGripFront + tireGripRear);
    const minAxleGrip = Math.min(tireGripFront, tireGripRear);
    const balanceRatio = avgAxleGrip > 0.01 ? (minAxleGrip / avgAxleGrip) : 1.0;
    // Combine overall mu slider with front/rear axle balance
    let effectiveBaseMu = baseMu;
    if (p.tireGripFront !== undefined || p.tireGripRear !== undefined) {
      // Scale smoothly if user adjusted front/rear grip or preset specifies them
      const presetRef = avgAxleGrip > 0.1 ? avgAxleGrip : baseMu;
      const ratioToBase = clamp(presetRef / Math.max(0.1, baseMu), 0.75, 1.25);
      effectiveBaseMu = baseMu * (0.65 + 0.35 * ratioToBase) * (0.45 + 0.55 * balanceRatio);
    }

    const Cl = clamp(Number(p.Cl ?? p.cl ?? p.downforceCoeff ?? 3.2), 0.0, 6.5);
    const Cd = clamp(Number(p.Cd ?? p.cd ?? p.dragCoeff ?? 0.88), 0.15, 2.5);
    const frontalArea = clamp(Number(p.frontalArea ?? p.area ?? p.A ?? 1.55), 0.6, 3.2);

    const topSpeedKmh = clamp(Number(p.topSpeedKmh ?? p.topSpeed ?? 345), 80, 480);
    const topSpeedMs = topSpeedKmh / 3.6;

    const maxBrakeForce = clamp(Number(p.maxBrakeForce ?? (mass * GRAVITY * effectiveBaseMu * 1.35)), 1500, 65000);
    const brakeBias = clamp(Number(p.brakeBias ?? 0.58), 0.40, 0.80);
    const cgHeight = clamp(Number(p.cgHeight ?? 0.30), 0.14, 0.85);
    const wheelbase = clamp(Number(p.wheelbase ?? 2.85), 0.90, 4.20);
    const maxSteerAngle = clamp(Number(p.maxSteerAngle ?? 28), 14, 65);
    const maxSteerRad = (maxSteerAngle * Math.PI) / 180.0;
    const minTurnRadius = wheelbase / Math.max(0.1, Math.tan(maxSteerRad));
    const maxCurvature = Math.tan(maxSteerRad) / wheelbase;
    const trackWidth = clamp(Number(p.trackWidth ?? p.carWidth ?? 1.75), 1.10, 2.30);
    const carWidth = clamp(Number(p.carWidth ?? trackWidth), 1.10, 2.30);

    // Corner kerb aggression (0 = cautious, 1 = aggressive kerb usage)
    const cornerAggression = clamp(
      Number(p.cornerAggression ?? p.cornerWeightPenalty ?? 0.65),
      0.0,
      1.0
    );
    const carMargin = clamp(
      Number(p.carMargin ?? (carWidth * 0.40 + (1.0 - cornerAggression) * 0.45)),
      0.48,
      1.65
    );

    // Compromise factor: 0 = pure minimum-curvature momentum line, 1 = aggressive late-apex exit-speed line
    const powerToWeight = powerKW / (mass / 1000); // kW per ton
    const aeroToWeight = (Cl * frontalArea) / (mass / 1000);
    const defaultCompromise = clamp(0.28 + 0.00045 * powerToWeight - 0.045 * aeroToWeight, 0.12, 0.78);
    const compromiseFactor = clamp(
      Number(p.compromiseFactor ?? p.lateApexBias ?? p.exitBias ?? defaultCompromise),
      0.0,
      1.0
    );

    const category = String(p.category || p.name || p.id || '');
    const isDrift = Boolean(
      p.driftMode ||
      p.isDrift ||
      category.toLowerCase().includes('drift')
    );

    // Drivetrain & gear-shift efficiency
    const drivetrain = String(p.drivetrain || 'RWD').toUpperCase();
    const drivetrainEfficiency = drivetrain === 'AWD' ? 0.97 : (drivetrain === 'FWD' ? 0.85 : 0.91);
    const shiftTimeMs = clamp(Number(p.shiftTimeMs ?? 35), 5, 350);
    const shiftEta = 1.0 / (1.0 + (shiftTimeMs / 1000.0) / 2.4);
    const wheelPowerEta = (drivetrain === 'AWD' ? 0.90 : 0.92) * shiftEta;

    const gears = clamp(Math.round(Number(p.gears ?? 8)), 1, 9);
    const redlineRpm = clamp(Number(p.redlineRpm ?? p.maxRpm ?? 11500), 5500, 18000);
    const idleRpm = clamp(Number(p.idleRpm ?? Math.round(redlineRpm * 0.30)), 1200, 5000);
    const crr = clamp(Number(p.crr ?? p.rollingResistance ?? DEFAULT_CRR), 0.006, 0.035);

    // Load transfer penalty from CG height and track width
    const loadTransferEta = clamp(1.0 - 0.18 * (cgHeight / trackWidth), 0.72, 0.98);
    const muEff = effectiveBaseMu * loadTransferEta;

    // Tire load sensitivity exponent epsilon: mu(Fz) = muEff * (Fz / (m*g))^(-epsilon)
    const loadSensitivityExp = clamp(Number(p.loadSensitivityExp ?? 0.20), 0.08, 0.32);

    // Peak tire slip angle & dynamic understeer gradient (Ackermann + slip angle compliance)
    const peakSlipAngleDeg = isDrift ? 28.0 : clamp(6.6 - 1.35 * baseMu, 3.2, 6.6);
    const peakSlipAngleRad = (peakSlipAngleDeg * Math.PI) / 180.0;
    const understeerGradientDegPerG = clamp(
      0.55 + 3.2 * ((tireGripRear - tireGripFront) / Math.max(0.5, avgAxleGrip)),
      -1.5,
      3.5
    );
    const understeerGradientRadPerG = (understeerGradientDegPerG * Math.PI) / 180.0;

    // Maximum road-wheel steering rate (rad/s) for chicane transition limits
    const maxSteerRateRadPerSec = ((isDrift ? 95.0 : 58.0) * Math.PI) / 180.0;

    // Brake bias efficiency: optimal around 0.58
    const brakeBiasEta = clamp(1.0 - 1.8 * Math.pow(brakeBias - 0.58, 2), 0.65, 1.0);

    // Understeer / oversteer balance indicator (-1 = understeer, 0 = neutral, +1 = oversteer)
    const aeroBalance = clamp(Number(p.aeroBalance ?? 0.50), 0.30, 0.70);
    const gripBalanceDelta = (tireGripFront - tireGripRear) / Math.max(0.5, avgAxleGrip) + (aeroBalance - 0.50) * 0.5;
    const weather = p.weather ? normalizeWeather(p.weather) : null;

    return {
      mass,
      powerKW,
      powerWatts,
      mu: baseMu,
      tireGripFront,
      tireGripRear,
      muEff,
      loadTransferEta,
      loadSensitivityExp,
      tireCompound: presetTire.id || tireCompound,
      tireCompoundCode: presetTire.code || tireCompound.toUpperCase(),
      tireCompoundName: presetTire.name || 'Pirelli P Zero',
      tireCompoundColor: presetTire.color || '#facc15',
      compoundSoftness,
      treadDepthMm,
      tirePressurePsi,
      treadGrooveRatio,
      tireDryGripMul,
      vHydroKmh,
      vHydroMs,
      Cl,
      Cd,
      frontalArea,
      topSpeedKmh,
      topSpeedMs,
      maxBrakeForce,
      brakeBias,
      brakeBiasEta,
      cgHeight,
      wheelbase,
      maxSteerAngle,
      maxSteerRad,
      minTurnRadius,
      maxCurvature,
      peakSlipAngleDeg,
      peakSlipAngleRad,
      understeerGradientDegPerG,
      understeerGradientRadPerG,
      maxSteerRateRadPerSec,
      trackWidth,
      carWidth,
      carMargin,
      cornerAggression,
      compromiseFactor,
      drivetrain,
      drivetrainEfficiency,
      shiftTimeMs,
      shiftEta,
      wheelPowerEta,
      gears,
      redlineRpm,
      idleRpm,
      crr,
      category,
      isDrift,
      aeroBalance,
      gripBalanceDelta,
      weather
    };
  }

  /**
   * Compute station-level tire grip multiplier, dynamic hydroplaning factor,
   * cross-track wet rubbered-line penalty/bonus, and water displacement drag.
   *
   * @param {Object} car Normalized car parameters
   * @param {number} wetness Local surface wetness W_i in [0, 1]
   * @param {number} speedMs Ground speed v (m/s)
   * @param {number} [alpha=0] Lateral offset from centerline (m)
   * @param {number} [bound=5] Half-width excursion bound b_i (m)
   * @param {number} [centerKappa=0] Signed centerline curvature kappa_center,i (1/m)
   * @returns {{
   *   baseTireMul: number,
   *   etaHydro: number,
   *   etaWetLine: number,
   *   tireGripMultiplier: number,
   *   isHydroplaning: boolean,
   *   waterDragForce: number
   * }}
   */
  function computeStationTireGrip(car, wetness, speedMs, alpha = 0, bound = 5.0, centerKappa = 0) {
    const W = clamp(Number(wetness) || 0, 0.0, 1.0);
    const v = Math.max(0.0, Number(speedMs) || 0);
    const g = car.treadGrooveRatio ?? 0.0;
    const dryMul = car.tireDryGripMul ?? 1.0;

    // 1. Water Evacuation vs. Water Film Thickness
    let baseTireMul = dryMul;
    if (W > 0.005) {
      // Slick tire water film curve (zero or negligible grooves)
      const muWaterSlick = dryMul * (0.27 + 0.73 * Math.pow(1.0 - W, 2.3));

      if (g < 0.001) {
        baseTireMul = muWaterSlick;
      } else {
        // Grooved tire (Intermediate g ~ 0.60, Full Wet g ~ 1.0, or custom tread depth)
        const etaSoftWet = 0.95 + 0.08 * ((car.compoundSoftness ?? 0.50) - 0.50);
        const etaPressWet = 1.0 - 0.0025 * Math.pow((car.tirePressurePsi ?? 20.5) - 20.5, 2);

        // Water cools grooved tread blocks into optimal 50-65°C window, eliminating dry overheating squirm
        const muCooled = etaSoftWet * etaPressWet * (1.015 - 0.115 * g * g);
        const cCool = 1.0 - Math.pow(1.0 - W, 4.5 - 1.7 * g);
        const dampSynergy = 0.032 * Math.sin(Math.PI * Math.min(1.0, W / 0.65)) * g * (1.30 - g);

        // Channel drainage saturation in heavy standing water when W exceeds groove depth capacity
        const satPenalty = Math.pow(W, 2.1) * (0.89 * Math.pow(1.0 - g, 1.35) + 0.015 * g);

        const muWaterGrooved = clamp(
          dryMul + cCool * (muCooled - dryMul) + dampSynergy - satPenalty,
          0.25,
          1.12
        );

        if (g < 0.08) {
          // Smooth transition for ultra-shallow custom grooves (g in 0..0.08)
          const blend = clamp(g / 0.08, 0.0, 1.0);
          baseTireMul = lerp(muWaterSlick, muWaterGrooved, blend * blend);
        } else {
          baseTireMul = muWaterGrooved;
        }
      }
    }

    // 2. Dynamic Hydroplaning at High Speed in Wet Zones
    const vHydro = car.vHydroMs || 42.2;
    let etaHydro = 1.0;
    if (W > 0.20 && v > 0.72 * vHydro) {
      const excessRatio = Math.max(0.0, v / vHydro - 0.72);
      etaHydro = Math.max(
        0.22,
        1.0 / (1.0 + 0.65 * Math.pow(W, 1.4) * excessRatio * excessRatio)
      );
    }
    const isHydroplaning = Boolean(W > 0.35 && v > vHydro);

    // 3. Cross-Track Grip Profile in Wet Corners (rubbered inside dry apex vs unpolished outside wet line)
    let etaWetLine = 1.0;
    const absCenterK = Math.abs(centerKappa || 0);
    if (W > 0.12 && absCenterK > 0.0038 && bound > 0.1) {
      const sign = centerKappa >= 0 ? 1 : -1;
      const alphaDryApex = sign * 0.82 * bound;
      const dOffRubber = clamp(Math.abs(alpha - alphaDryApex) / (1.1 * bound), 0.0, 1.0);
      etaWetLine = 1.0 + W * (-0.12 + 0.20 * dOffRubber);
    }

    const tireGripMultiplier = clamp(baseTireMul * etaHydro * etaWetLine, 0.12, 1.25);

    // 4. Wet Rolling Resistance / Puddle Hydrodynamic Displacement Drag
    const waterDragForce = W > 0.001
      ? 0.5 * Math.pow(W, 1.3) * (0.018 * car.mass * GRAVITY + 0.14 * v * v)
      : 0.0;

    return {
      baseTireMul,
      etaHydro,
      etaWetLine,
      tireGripMultiplier,
      isHydroplaning,
      waterDragForce
    };
  }

  /**
   * Compute aerodynamic downforce (with high-speed ride-height diffuser stall compression),
   * yaw/crosswind downforce retention, and tire load-sensitive friction coefficient
   * mu(Fz) = muEff * (Fz / (m*g))^(-epsilon).
   * Eliminates the constant-mu aero singularity and matches real F1/WEC high-speed G limits.
   *
   * @param {Object} car Normalized car parameters
   * @param {number} vAirSq Relative airspeed squared (m^2/s^2)
   * @param {number} aeroLiftFactor 0.5 * rho * A * Cl
   * @param {Object} [weatherMod] Optional local weather modifiers { yawAeroEta, balanceEta, muFactor }
   * @returns {{ downforceN: number, normalForce: number, muLoad: number, maxLatForce: number }}
   */
  function computeTireAndAeroState(car, vAirSq, aeroLiftFactor, weatherMod) {
    const staticWeight = car.mass * GRAVITY;
    // Soft ground-effect ride-height compression / diffuser stall saturation above ~295 km/h (82 m/s)
    const vSatSq = 6724.0; // 82^2 m^2/s^2
    const satRatio = vAirSq / vSatSq;
    const effAeroVSq = vAirSq / (1.0 + 0.16 * satRatio * satRatio);

    const yawAeroEta = weatherMod ? (weatherMod.yawAeroEta ?? 1.0) : 1.0;
    const balanceEta = weatherMod ? (weatherMod.balanceEta ?? 1.0) : 1.0;
    const muFactor = weatherMod ? (weatherMod.muFactor ?? 1.0) : 1.0;

    const downforceN = aeroLiftFactor * effAeroVSq * yawAeroEta;
    const normalForce = staticWeight + downforceN;
    const loadRatio = Math.max(1.0, normalForce / staticWeight);
    const muLoad = (car.muEff * muFactor * balanceEta) * Math.pow(loadRatio, -car.loadSensitivityExp);
    const maxLatForce = muLoad * normalForce;

    return { downforceN, normalForce, muLoad, maxLatForce };
  }

  /**
   * Compute full wind, cloud & wet-surface aerodynamic/tire state at a station given ground speed vGround.
   * Implements:
   * - Relative airspeed v_air = max(0, v - w_parallel)
   * - Aerodynamic yaw angle beta_wind = arctan(|w_perp| / max(12, v_air))
   * - Yaw-induced underbody diffuser & endplate stall eta_yaw,aero
   * - Crosswind CoP aero balance instability eta_balance,wind
   * - Aerodynamic side force F_y,wind
   * - Cloud shadow & ambient temperature surface grip and engine density effects
   * - Pirelli compound + custom tire wetness, hydroplaning, and cross-track rubbered line physics
   *
   * @param {Object} car
   * @param {number} vGround Ground speed (m/s)
   * @param {Object} st Station with { wParallel, wPerp, cloudCover, localAirDensity, deltaMuCloud, wetness }
   * @param {Object} weather Normalized weather object
   * @param {number} [alpha=0] Lateral offset from centerline (m)
   * @param {number} [bound=5] Station half-width bound (m)
   * @param {number} [centerKappa=0] Centerline curvature at station (1/m)
   * @returns {Object}
   */
  function computeStationWindAero(car, vGround, st, weather, alpha = 0, bound = 5.0, centerKappa = 0) {
    const wParallel = st.wParallel || 0;
    const wPerp = st.wPerp || 0;
    const cloudCover = st.cloudCover || 0;
    const wetness = st.wetness || 0;
    const rho = st.localAirDensity || (weather ? weather.airDensity : AIR_DENSITY);
    const deltaMuCloud = st.deltaMuCloud || 0;

    // 1. Relative airspeed (headwind wParallel < 0 increases vAir; tailwind wParallel > 0 decreases vAir)
    const vAir = Math.max(0.0, vGround - wParallel);
    const vAirSq = vAir * vAir;

    // 2. Aerodynamic yaw angle from crosswind
    const absWPerp = Math.abs(wPerp);
    const betaWind = Math.atan(absWPerp / Math.max(12.0, vAir));
    const sinBeta = Math.sin(betaWind);
    const sinBetaSq = sinBeta * sinBeta;

    // 3. Yaw-induced downforce retention eta_yaw,aero
    const rawYawAeroEta = Math.max(
      0.55,
      1.0 - 1.65 * sinBetaSq - 0.18 * (absWPerp / 20.0)
    );
    // Below ~15 km/h crosswind (4.2 m/s) with low gusts, vortex sealing stays well attached
    const gustIntensity = weather ? weather.gustIntensity : 0.15;
    const yawStallOnset = clamp((absWPerp - 2.2) / 5.5, 0.20, 1.0) * clamp(0.65 + 0.55 * gustIntensity, 0.65, 1.15);
    const yawAeroEta = clamp(1.0 - (1.0 - rawYawAeroEta) * yawStallOnset, 0.55, 1.0);

    // 4. Crosswind Center-of-Pressure (Aero Balance) instability eta_balance,wind
    const rawBalanceEta = Math.max(
      0.75,
      1.0 - 0.32 * (absWPerp / 25.0) * (0.4 + 0.6 * (car.Cl / 3.5))
    );
    const balanceOnset = clamp((absWPerp - 2.8) / 6.5, 0.12, 1.0) * clamp(0.55 + 0.70 * gustIntensity * (1.0 + 0.20 * cloudCover), 0.55, 1.25);
    const balanceEta = clamp(1.0 - (1.0 - rawBalanceEta) * balanceOnset, 0.75, 1.0);

    // 5. Ambient temperature & cloud shadow effect on tire mechanical grip and engine breathing
    const ambientTempC = weather ? weather.ambientTempC : 22;
    // Optimal track/ambient window around 15-20°C; hot (>26°C) causes thermal greasy degradation
    let tempMuDelta = 0;
    if (ambientTempC < 22) {
      tempMuDelta = 0.0045 * (22 - ambientTempC); // up to +0.027 mu in crisp 16°C air
    } else if (ambientTempC > 24) {
      tempMuDelta = -0.0055 * (ambientTempC - 24); // thermal degradation in 38°C heat
    }
    const effectiveEnvMu = Math.max(0.45, car.mu + deltaMuCloud + tempMuDelta);
    const envMuFactor = effectiveEnvMu / Math.max(0.5, car.mu);

    // 6. Pirelli Tire Compound, Surface Wetness, Hydroplaning & Wet Racing Line Grip Multiplier
    const tireState = computeStationTireGrip(car, wetness, vGround, alpha, bound, centerKappa);
    const muFactor = envMuFactor * tireState.tireGripMultiplier;

    // Engine power scales with cool intake air density and turbo intercooler efficiency
    const engineAirEta = clamp(Math.pow(rho / AIR_DENSITY, 0.85), 0.90, 1.06);

    // 7. Local aerodynamic lift, drag, and crosswind side force
    const halfRhoA = 0.5 * rho * car.frontalArea;
    const aeroLiftFactor = halfRhoA * car.Cl;
    // Yaw drag penalty when car is crabbing against crosswind
    const yawDragMultiplier = 1.0 + 0.42 * sinBetaSq;
    const aeroDragFactor = halfRhoA * car.Cd * yawDragMultiplier;

    // Aerodynamic Side Force:
    // F_y,wind = 0.5 * rho * A_side * C_Y * |w_perp| * w_perp + 0.5 * rho * A * C_{Y,beta} * v_air * w_perp
    const aSide = 1.85 * car.frontalArea;
    const cY = 0.65;
    const cYBeta = 0.22 * (1.0 + 0.25 * car.Cl);
    const fyWind =
      0.5 * rho * aSide * cY * absWPerp * wPerp +
      halfRhoA * cYBeta * vAir * wPerp;

    const tireAero = computeTireAndAeroState(car, vAirSq, aeroLiftFactor, {
      yawAeroEta,
      balanceEta,
      muFactor
    });

    return {
      vAir,
      vAirSq,
      betaWind,
      aeroYawDeg: (betaWind * 180.0) / Math.PI,
      yawAeroEta,
      rawYawAeroEta,
      balanceEta,
      rawBalanceEta,
      muFactor,
      tireGripMultiplier: tireState.tireGripMultiplier,
      etaHydro: tireState.etaHydro,
      etaWetLine: tireState.etaWetLine,
      isHydroplaning: tireState.isHydroplaning,
      waterDragForce: tireState.waterDragForce,
      engineAirEta,
      aeroLiftFactor,
      aeroDragFactor,
      fyWind,
      downforceN: tireAero.downforceN,
      normalForce: tireAero.normalForce,
      muLoad: tireAero.muLoad,
      maxLatForce: tireAero.maxLatForce
    };
  }

  /**
   * Extract and validate discretized centerline samples from a Track instance.
   * Ensures every station i has (x, y, nx, ny, tx, ty, width, s, bound, centerKappa).
   * @param {Object} track
   * @param {Object} car
   * @returns {Array<Object>}
   */
  function extractTrackStations(track, car) {
    const rawSamples = (track && Array.isArray(track.samples) && track.samples.length >= 4)
      ? track.samples
      : (Array.isArray(track) ? track : []);

    const N = rawSamples.length;
    if (N < 4) {
      return [];
    }

    const defaultWidth = Number(track.defaultWidth ?? track.width ?? 12);
    const stations = new Array(N);

    for (let i = 0; i < N; i++) {
      const s = rawSamples[i];
      const x = Number(s.x) || 0;
      const y = Number(s.y) || 0;
      const width = clamp(Number(s.width ?? defaultWidth), 4.0, 40.0);
      const halfWidth = width * 0.5;
      const bound = Math.max(1.0, Math.min(halfWidth - 0.35, halfWidth - car.carMargin));

      stations[i] = {
        x,
        y,
        width,
        halfWidth,
        bound: Math.min(halfWidth - 0.25, bound),
        nx: Number(s.nx),
        ny: Number(s.ny),
        tx: Number(s.tx),
        ty: Number(s.ty),
        trackS: Number(s.s ?? 0),
        centerKappa: 0
      };
    }

    // Ensure valid unit tangents, normals, and cumulative centerline arc length
    let accumS = 0;
    for (let i = 0; i < N; i++) {
      const prev = stations[(i - 1 + N) % N];
      const curr = stations[i];
      const next = stations[(i + 1) % N];

      if (i > 0 && (!Number.isFinite(curr.trackS) || curr.trackS <= prev.trackS)) {
        const dxSeg = curr.x - prev.x;
        const dySeg = curr.y - prev.y;
        accumS += Math.hypot(dxSeg, dySeg);
        curr.trackS = accumS;
      } else {
        accumS = curr.trackS;
      }

      if (!Number.isFinite(curr.nx) || !Number.isFinite(curr.ny) || (curr.nx === 0 && curr.ny === 0)) {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const tx = dx / len;
        const ty = dy / len;
        curr.tx = tx;
        curr.ty = ty;
        // Normal pointing to the right/left consistently (-ty, tx)
        curr.nx = -ty;
        curr.ny = tx;
      } else {
        const nLen = Math.hypot(curr.nx, curr.ny) || 1;
        curr.nx /= nLen;
        curr.ny /= nLen;
        if (!Number.isFinite(curr.tx) || !Number.isFinite(curr.ty)) {
          curr.tx = curr.ny;
          curr.ty = -curr.nx;
        }
      }
    }

    // Precompute centerline curvature on each station for cross-track wet line physics
    const centerGeom = computePathGeometry(stations, null);
    for (let i = 0; i < N; i++) {
      stations[i].centerKappa = centerGeom.kappa[i];
    }

    attachStationWeather(stations, (car && car.weather) || (track && track.weather) || null);
    return stations;
  }

  /**
   * Compute 2D positions, segment lengths, cumulative arc length, and smoothed
   * signed discrete curvature along a path defined by lateral offsets alpha[0..N-1].
   * @param {Array<Object>} stations
   * @param {Float64Array|Array<number>} alphaArray
   * @returns {Object}
   */
  function computePathGeometry(stations, alphaArray) {
    const N = stations.length;
    const X = new Float64Array(N);
    const Y = new Float64Array(N);
    const ds = new Float64Array(N);
    const s = new Float64Array(N);
    const rawKappa = new Float64Array(N);
    const kappa = new Float64Array(N);

    // 1. World positions P_i = C_i + alpha_i * n_i
    for (let i = 0; i < N; i++) {
      const st = stations[i];
      const a = alphaArray ? alphaArray[i] : 0;
      X[i] = st.x + a * st.nx;
      Y[i] = st.y + a * st.ny;
    }

    // 2. Segment lengths ds_i = ||P_{i+1} - P_i|| and cumulative s_i
    let totalLength = 0;
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const dx = X[next] - X[i];
      const dy = Y[next] - Y[i];
      const segLen = Math.max(0.05, Math.hypot(dx, dy));
      ds[i] = segLen;
      s[i] = totalLength;
      totalLength += segLen;
    }

    // 3. Discrete 3-point circumcircle curvature at each point P_i
    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;

      const x0 = X[prev], y0 = Y[prev];
      const x1 = X[i],    y1 = Y[i];
      const x2 = X[next], y2 = Y[next];

      const dx1 = x1 - x0, dy1 = y1 - y0;
      const dx2 = x2 - x1, dy2 = y2 - y1;
      const dx3 = x2 - x0, dy3 = y2 - y0;

      const a = Math.hypot(dx1, dy1);
      const b = Math.hypot(dx2, dy2);
      const c = Math.hypot(dx3, dy3);

      const denom = a * b * c;
      if (denom > 1e-6) {
        const cross = dx1 * dy2 - dy1 * dx2;
        rawKappa[i] = clamp((2.0 * cross) / denom, -0.35, 0.35);
      } else {
        rawKappa[i] = 0;
      }
    }

    // 4. Light 3-point circular smoothing filter on kappa_i to eliminate numerical noise
    const tempKappa = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;
      tempKappa[i] = 0.25 * rawKappa[prev] + 0.50 * rawKappa[i] + 0.25 * rawKappa[next];
    }
    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;
      kappa[i] = 0.20 * tempKappa[prev] + 0.60 * tempKappa[i] + 0.20 * tempKappa[next];
    }

    return { X, Y, ds, s, kappa, totalLength };
  }

  /**
   * Precompute corner exit weighting factors (beta_exit) for late-apex path shaping.
   * Stations where curvature is transitioning into a straightaway receive higher forward
   * neighbor weighting so the optimizer naturally produces late apexes that maximize exit speed.
   * Also incorporates wind-induced late-apex stabilization and wet-corner exit squaring-off.
   * @param {Array<Object>} stations
   * @param {Object} car
   * @returns {Object}
   */
  function computeExitBiasWeights(stations, car) {
    const N = stations.length;
    const centerZero = new Float64Array(N);
    const centerGeom = computePathGeometry(stations, centerZero);
    const k = centerGeom.kappa;

    // Smooth absolute curvature to detect corners vs straights
    const absK = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let d = -3; d <= 3; d++) {
        sum += Math.abs(k[(i + d + N) % N]);
      }
      absK[i] = sum / 7;
    }

    const betaExit = new Float64Array(N);
    // Max forward bias scaled by car's compromiseFactor
    const maxBeta = 0.085 * (0.35 + 0.65 * car.compromiseFactor);

    for (let i = 0; i < N; i++) {
      const kHere = absK[i];
      // Look ahead ~8 to 20 stations to see if track straightens out into a fast zone
      const kAheadNear = absK[(i + 6) % N];
      const kAheadFar = absK[(i + 14) % N];

      if (kHere > 0.003) {
        // Curvature drop ratio (positive when exiting a corner onto a straight)
        const dropRatio = clamp((kHere - 0.5 * (kAheadNear + kAheadFar)) / (kHere + 0.004), -0.3, 1.0);
        if (dropRatio > 0) {
          const st = stations[i];
          const sign = k[i] >= 0 ? 1 : -1;
          const outwardCrossMs = Math.max(0, -sign * (st.wPerp || 0));
          const tailwindMs = Math.max(0, st.wParallel || 0);
          const wetness = st.wetness || 0;
          const windExitBoost =
            1.0 +
            clamp(
              Math.max(0, outwardCrossMs - 3.5) / 22.0 * 0.42 +
              Math.max(0, tailwindMs - 4.0) / 26.0 * 0.30 +
              (wetness > 0.12 ? wetness * 0.42 : 0.0),
              0.0,
              0.85
            );
          betaExit[i] = clamp(maxBeta * dropRatio * windExitBoost, 0.0, 0.15);
        }
      }
    }

    return { betaExit, centerKappa: k, centerGeometry: centerGeom };
  }

  /**
   * Perform a single relaxation + smoothing step on lateral offsets alpha.
   * Uses a multi-scale stencil (k=1, k=4, k=wide) with normal-projection, late-apex weighting,
   * aerodynamic crosswind/tailwind safety margin, and Authentic Wet Racing Line Physics
   * (staying off slippery painted kerbs and rubbered inside apexes in wet zones).
   * @param {Array<Object>} stations
   * @param {Float64Array} alpha
   * @param {Float64Array} scratchAlpha
   * @param {Float64Array} X
   * @param {Float64Array} Y
   * @param {Float64Array} betaExit
   * @param {Float64Array} centerKappa
   * @param {Object} car
   * @param {number} iterRatio (0..1 progress through iterations)
   */
  function performRelaxationStep(stations, alpha, scratchAlpha, X, Y, betaExit, centerKappa, car, iterRatio) {
    const N = stations.length;
    if (N < 6) return;

    // Update current world positions P_i
    for (let i = 0; i < N; i++) {
      const st = stations[i];
      const a = alpha[i];
      X[i] = st.x + a * st.nx;
      Y[i] = st.y + a * st.ny;
    }

    // Multi-scale stencil (k1=1, k2=4, k3=wide ~30m) so the racing line converges globally
    // across full-width entry, apex clipping, and full-width track-out on N=400..1600 tracks.
    const kMed = N >= 40 ? 4 : 2;
    const kWide = N >= 80 ? clamp(Math.round(N / 115), 7, 14) : kMed;

    const wWideBase = 0.36 * (1.0 - 0.50 * iterRatio);
    const wMedBase = 0.34 * (1.0 - 0.25 * iterRatio);
    const omega = 0.80;

    for (let i = 0; i < N; i++) {
      const st = stations[i];
      const wetness = st.wetness || 0;
      // Wet Kerb Margin: reduce allowable lateral excursion bound so car stays off slippery painted kerbs
      const bEff = Math.max(1.0, st.bound - 1.35 * wetness);

      const iPrev1 = (i - 1 + N) % N;
      const iNext1 = (i + 1) % N;
      const iPrevM = (i - kMed + N) % N;
      const iNextM = (i + kMed) % N;
      const iPrevW = (i - kWide + N) % N;
      const iNextW = (i + kWide) % N;

      // Correct advection sign (Prof. Vance derivation):
      // To advect the apex forward (+s, late apex), upstream neighbor P_{i-k} carries (0.5 + beta)
      // and downstream neighbor P_{i+k} carries (0.5 - beta).
      // In wet corners (wetness > 0.12), increase late-apex straightening bias on exit.
      let beta = betaExit[i];
      if (wetness > 0.12 && beta > 0.004) {
        beta = clamp(beta * (1.0 + 0.35 * wetness), 0.0, 0.16);
      }

      const wBwd1 = 0.5 + beta;
      const wFwd1 = 0.5 - beta;

      const wBwdM = 0.5 + beta * 1.15;
      const wFwdM = 0.5 - beta * 1.15;

      const wBwdW = 0.5 + beta * 1.25;
      const wFwdW = 0.5 - beta * 1.25;

      // Scale 1: Local midpoint M^{(1)}_i
      const m1x = wBwd1 * X[iPrev1] + wFwd1 * X[iNext1];
      const m1y = wBwd1 * Y[iPrev1] + wFwd1 * Y[iNext1];

      // Scale 2: Medium stencil midpoint M^{(m)}_i
      const mMx = wBwdM * X[iPrevM] + wFwdM * X[iNextM];
      const mMy = wBwdM * Y[iPrevM] + wFwdM * Y[iNextM];

      // Scale 3: Wide stencil midpoint M^{(w)}_i
      const mWx = wBwdW * X[iPrevW] + wFwdW * X[iNextW];
      const mWy = wBwdW * Y[iPrevW] + wFwdW * Y[iNextW];

      // Project (M - C_i) onto normal vector n_i
      const alphaTarget1 = (m1x - st.x) * st.nx + (m1y - st.y) * st.ny;
      const alphaTargetM = (mMx - st.x) * st.nx + (mMy - st.y) * st.ny;
      const alphaTargetW = (mWx - st.x) * st.nx + (mWy - st.y) * st.ny;

      // Guard against tight hairpin chord-cutting on medium/wide stencils via normal cosine
      const nDotM = Math.max(
        0.20,
        0.5 * (
          stations[iPrevM].nx * st.nx + stations[iPrevM].ny * st.ny +
          stations[iNextM].nx * st.nx + stations[iNextM].ny * st.ny
        )
      );
      const nDotW = Math.max(
        0.12,
        0.5 * (
          stations[iPrevW].nx * st.nx + stations[iPrevW].ny * st.ny +
          stations[iNextW].nx * st.nx + stations[iNextW].ny * st.ny
        )
      );

      const effW = wWideBase * nDotW;
      const effM = wMedBase * nDotM;
      const eff1 = Math.max(0.20, 1.0 - effW - effM);

      let alphaTarget = eff1 * alphaTarget1 + effM * alphaTargetM + effW * alphaTargetW;

      // Late-apex entry/exit shaping, aerodynamic wind line & Authentic Wet Racing Line adaptation
      const kCurr = centerKappa[i];
      const absKCurr = Math.abs(kCurr);
      let minAlpha = -bEff;
      let maxAlpha = bEff;

      if (absKCurr > 0.0038) {
        const sign = kCurr >= 0 ? 1 : -1;
        const kAhead = Math.abs(centerKappa[iNextM]);
        const kBehind = Math.abs(centerKappa[iPrevM]);

        const outwardCrossMs = Math.max(0, -sign * (st.wPerp || 0));
        const tailwindMs = Math.max(0, st.wParallel || 0);

        // Extra safety margin from outside exit kerb when strong crosswind pushes outward
        // or strong tailwind stalls turn-in/exit downforce
        const outsideSafetyMargin = clamp(
          Math.max(0, outwardCrossMs - 3.5) / 22.0 * 0.55 +
          Math.max(0, tailwindMs - 4.0) / 26.0 * 0.35 +
          (st.cloudCover || 0) * 0.12,
          0.0,
          Math.min(0.95, bEff * 0.28)
        );
        if (outsideSafetyMargin > 0.01) {
          if (sign > 0) {
            minAlpha = -bEff + outsideSafetyMargin;
          } else {
            maxAlpha = bEff - outsideSafetyMargin;
          }
        }

        if (wetness > 0.12) {
          // Authentic Wet Racing Line Trajectory Target:
          // Stay off the polished rubbered inside dry apex (+sign * b) and rim-ride the
          // grippier unpolished outside/mid-outside arc alpha_wet,arc = sign * (0.18 - 0.62 * W_i) * b_eff,i
          const alphaWetArc = sign * (0.18 - 0.62 * wetness) * bEff;
          if (beta > 0.004 && kAhead < kBehind * 0.92) {
            // Corner exit in wet zone: square off the exit early toward a wider late apex to avoid wheelspin
            const wetExitArc = lerp(alphaWetArc, sign * (0.35 - 0.30 * wetness) * bEff, 0.35);
            alphaTarget = lerp(alphaTarget, wetExitArc, 0.28 * wetness);
          } else {
            // Corner entry & mid-corner: blend toward wide un-rubbered Wet Line with weight 0.32 * W_i
            alphaTarget = lerp(alphaTarget, alphaWetArc, 0.32 * wetness);
          }
        } else if (car.isDrift && kAhead > kBehind * 1.06) {
          // Formula Drift wide initiation entry blend (bounded, no runaway accumulation)
          alphaTarget = lerp(alphaTarget, -sign * 0.65 * bEff, 0.08);
        } else if (beta > 0.005) {
          // Dry Late-apex exit clip toward inside apex kerb (+sign * bEff), amplified under destabilizing wind
          const windApexShift = clamp(
            Math.max(0, outwardCrossMs - 3.5) / 22.0 * 0.35 +
            Math.max(0, tailwindMs - 4.0) / 26.0 * 0.25,
            0.0,
            0.40
          );
          alphaTarget = lerp(alphaTarget, sign * 0.92 * bEff, beta * (0.45 + windApexShift));
        }
      }

      const updated = (1.0 - omega) * alpha[i] + omega * alphaTarget;
      scratchAlpha[i] = clamp(updated, minAlpha, maxAlpha);
    }

    // Minimal Nyquist-noise smoothing (0.025) so C^2 smoothness is preserved without pulling alpha back to 0
    const smoothWeight = 0.025;
    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;
      const avg = 0.5 * (scratchAlpha[prev] + scratchAlpha[next]);
      const smoothed = (1.0 - smoothWeight) * scratchAlpha[i] + smoothWeight * avg;
      const bEff = Math.max(1.0, stations[i].bound - 1.35 * (stations[i].wetness || 0));
      alpha[i] = clamp(smoothed, -bEff, bEff);
    }
  }

  /**
   * Detect distinct corners along the evaluated path for Corner-by-Corner Apex & Braking Analysis.
   * Finds local speed minima / curvature peaks separated by at least ~40m, plus turn-in,
   * braking points, and throttle application points.
   * @param {Array<Object>} telemetry
   * @param {number} totalLength
   * @returns {Array<Object>}
   */
  function detectCorners(telemetry, totalLength) {
    const N = telemetry.length;
    if (N < 8) return [];

    const candidates = [];
    const avgDs = totalLength / N;
    const minWindow = Math.max(2, Math.round(12 / Math.max(0.5, avgDs)));

    for (let i = 0; i < N; i++) {
      const curr = telemetry[i];
      const absK = Math.abs(curr.curvature);

      // Must have meaningful curvature or lateral load to qualify as a corner
      if (absK < 0.0045 && Math.abs(curr.latG) < 0.35) continue;

      // Check if local minimum in speed (or local maximum in |curvature| for flat-out kinks)
      let isSpeedMin = true;
      let isCurvMax = true;
      for (let d = -minWindow; d <= minWindow; d++) {
        if (d === 0) continue;
        const nb = telemetry[(i + d + N) % N];
        if (nb.speedKmh < curr.speedKmh - 0.15) {
          isSpeedMin = false;
        }
        if (Math.abs(nb.curvature) > absK + 1e-5) {
          isCurvMax = false;
        }
      }

      if (isSpeedMin || (isCurvMax && absK >= 0.008)) {
        candidates.push({
          stationIndex: i,
          s: curr.s,
          absK,
          speedKmh: curr.speedKmh
        });
      }
    }

    // Merge candidates within 42 meters of each other, keeping the slowest / sharpest apex
    const minCornerSpacing = 42.0;
    const filtered = [];

    for (let c = 0; c < candidates.length; c++) {
      const cand = candidates[c];
      if (filtered.length === 0) {
        filtered.push(cand);
        continue;
      }

      const prev = filtered[filtered.length - 1];
      const dist = Math.min(
        Math.abs(cand.s - prev.s),
        totalLength - Math.abs(cand.s - prev.s)
      );

      if (dist < minCornerSpacing) {
        // Keep the one with lower apex speed (or higher curvature if speeds are nearly identical)
        if (
          cand.speedKmh < prev.speedKmh - 1.0 ||
          (Math.abs(cand.speedKmh - prev.speedKmh) <= 1.0 && cand.absK > prev.absK)
        ) {
          filtered[filtered.length - 1] = cand;
        }
      } else {
        filtered.push(cand);
      }
    }

    // Also check wrap-around between first and last corner
    if (filtered.length >= 2) {
      const first = filtered[0];
      const last = filtered[filtered.length - 1];
      const wrapDist = totalLength - Math.abs(last.s - first.s);
      if (wrapDist < minCornerSpacing) {
        if (last.speedKmh < first.speedKmh) {
          filtered[0] = last;
        }
        filtered.pop();
      }
    }

    // Sort by distance s along lap and trace braking / turn-in / exit points
    filtered.sort((a, b) => a.s - b.s);

    const lookbackSteps = Math.min(Math.floor(N * 0.25), Math.max(8, Math.round(140 / Math.max(0.5, avgDs))));
    const lookaheadSteps = Math.min(Math.floor(N * 0.20), Math.max(6, Math.round(90 / Math.max(0.5, avgDs))));

    return filtered.map((cand, idx) => {
      const apexIdx = cand.stationIndex;
      const apex = telemetry[apexIdx];

      // Trace backward from apex to find the start of the braking zone and turn-in point
      let brakeIdx = apexIdx;
      let turnInIdx = apexIdx;
      let foundBraking = false;

      for (let step = 1; step <= lookbackSteps; step++) {
        const j = (apexIdx - step + N) % N;
        const pt = telemetry[j];

        if (Math.abs(pt.curvature) >= 0.0035 && turnInIdx === apexIdx) {
          turnInIdx = j;
        }
        if (pt.brake > 0.08) {
          brakeIdx = j;
          foundBraking = true;
        } else if (foundBraking && pt.brake <= 0.03) {
          break;
        }
      }

      // Trace forward from apex to find full throttle application point
      let throttleIdx = apexIdx;
      for (let step = 1; step <= lookaheadSteps; step++) {
        const j = (apexIdx + step) % N;
        const pt = telemetry[j];
        if (pt.throttle >= 0.85) {
          throttleIdx = j;
          break;
        }
      }

      const brakePt = telemetry[brakeIdx];
      const turnInPt = telemetry[turnInIdx];
      const throttlePt = telemetry[throttleIdx];

      return {
        index: apexIdx,
        number: idx + 1,
        name: `T${idx + 1}`,
        s: apex.s,
        x: apex.x,
        y: apex.y,
        alpha: apex.alpha,
        curvature: apex.curvature,
        direction: apex.curvature >= 0 ? 'R' : 'L',
        apexSpeedKmh: apex.speedKmh,
        entrySpeedKmh: brakePt.speedKmh,
        minGear: apex.gear,
        latG: Math.abs(apex.latG),
        headwindKmh: apex.headwindKmh ?? 0,
        crosswindKmh: apex.crosswindKmh ?? 0,
        airSpeedKmh: apex.airSpeedKmh ?? apex.speedKmh,
        aeroYawDeg: apex.aeroYawDeg ?? 0,
        cloudCover: apex.cloudCover ?? 0,
        wetness: apex.wetness ?? 0,
        waterDepthMm: apex.waterDepthMm ?? 0,
        tireGripMultiplier: apex.tireGripMultiplier ?? 1,
        isHydroplaning: Boolean(apex.isHydroplaning),
        windDownforceRetention: apex.windDownforceRetention ?? 100,
        hasBrakingZone: foundBraking,
        brakePointIndex: brakeIdx,
        brakePointX: brakePt.x,
        brakePointY: brakePt.y,
        brakePointS: brakePt.s,
        turnInPointX: turnInPt.x,
        turnInPointY: turnInPt.y,
        throttlePointX: throttlePt.x,
        throttlePointY: throttlePt.y
      };
    });
  }

  /**
   * Build a fast binary-search time sampler sampleAtTime(t) for 60fps silky-smooth car animation.
   * @param {Array<Object>} telemetry
   * @param {number} lapTime
   * @param {number} totalLength
   * @returns {Function}
   */
  function createTimeSampler(telemetry, lapTime, totalLength) {
    const N = telemetry.length;
    if (N === 0 || lapTime <= 0) {
      return function () {
        return {
          x: 0, y: 0, speed: 0, speedKmh: 0,
          longG: 0, latG: 0, totalG: 0,
          throttle: 0, brake: 0, gear: 1, rpm: 3500,
          downforceKg: 0, gripUsage: 0,
          headwindKmh: 0, crosswindKmh: 0, airSpeedKmh: 0,
          aeroYawDeg: 0, cloudCover: 0, windDownforceRetention: 100,
          wetness: 0, waterDepthMm: 0, tireGripMultiplier: 1.0, isHydroplaning: false,
          heading: 0, tangentAngle: 0, slipAngleDeg: 0,
          s: 0, stationIndex: 0, time: 0
        };
      };
    }

    return function sampleAtTime(t) {
      // Wrap time periodically into [0, lapTime)
      let wrappedT = Number(t) || 0;
      wrappedT = ((wrappedT % lapTime) + lapTime) % lapTime;

      // Binary search for station i where telemetry[i].time <= wrappedT < telemetry[i+1].time
      let lo = 0;
      let hi = N - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (telemetry[mid].time <= wrappedT) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }

      const i0 = lo;
      const i1 = (i0 + 1) % N;
      const p0 = telemetry[i0];
      const p1 = telemetry[i1];

      const t0 = p0.time;
      const t1 = i1 === 0 ? lapTime : p1.time;
      const dt = Math.max(1e-6, t1 - t0);
      const frac = clamp((wrappedT - t0) / dt, 0.0, 1.0);

      const s0 = p0.s;
      const s1 = i1 === 0 ? totalLength : p1.s;

      return {
        x: lerp(p0.x, p1.x, frac),
        y: lerp(p0.y, p1.y, frac),
        s: lerp(s0, s1, frac) % totalLength,
        trackS: lerp(p0.trackS, i1 === 0 ? totalLength : p1.trackS, frac),
        alpha: lerp(p0.alpha, p1.alpha, frac),
        curvature: lerp(p0.curvature, p1.curvature, frac),
        speed: lerp(p0.speed, p1.speed, frac),
        speedKmh: lerp(p0.speedKmh, p1.speedKmh, frac),
        longG: lerp(p0.longG, p1.longG, frac),
        latG: lerp(p0.latG, p1.latG, frac),
        totalG: lerp(p0.totalG, p1.totalG, frac),
        throttle: clamp(lerp(p0.throttle, p1.throttle, frac), 0, 1),
        brake: clamp(lerp(p0.brake, p1.brake, frac), 0, 1),
        gear: frac < 0.5 ? p0.gear : p1.gear,
        rpm: Math.round(lerp(p0.rpm, p1.rpm, frac)),
        downforceKg: lerp(p0.downforceKg, p1.downforceKg, frac),
        gripUsage: lerp(p0.gripUsage, p1.gripUsage, frac),
        headwindKmh: lerp(p0.headwindKmh || 0, p1.headwindKmh || 0, frac),
        crosswindKmh: lerp(p0.crosswindKmh || 0, p1.crosswindKmh || 0, frac),
        airSpeedKmh: lerp(p0.airSpeedKmh || 0, p1.airSpeedKmh || 0, frac),
        aeroYawDeg: lerp(p0.aeroYawDeg || 0, p1.aeroYawDeg || 0, frac),
        cloudCover: lerp(p0.cloudCover || 0, p1.cloudCover || 0, frac),
        windDownforceRetention: lerp(p0.windDownforceRetention ?? 100, p1.windDownforceRetention ?? 100, frac),
        wetness: lerp(p0.wetness || 0, p1.wetness || 0, frac),
        waterDepthMm: lerp(p0.waterDepthMm || 0, p1.waterDepthMm || 0, frac),
        tireGripMultiplier: lerp(p0.tireGripMultiplier ?? 1.0, p1.tireGripMultiplier ?? 1.0, frac),
        isHydroplaning: frac < 0.5 ? Boolean(p0.isHydroplaning) : Boolean(p1.isHydroplaning),
        ackermannAngleDeg: lerp(p0.ackermannAngleDeg || 0, p1.ackermannAngleDeg || 0, frac),
        steerAngleDeg: lerp(p0.steerAngleDeg || 0, p1.steerAngleDeg || 0, frac),
        steerUsagePct: lerp(p0.steerUsagePct || 0, p1.steerUsagePct || 0, frac),
        slipAngleDeg: lerp(p0.slipAngleDeg, p1.slipAngleDeg, frac),
        tangentAngle: lerpAngle(p0.tangentAngle, p1.tangentAngle, frac),
        heading: lerpAngle(p0.heading, p1.heading, frac),
        stationIndex: i0,
        fraction: frac,
        time: wrappedT
      };
    };
  }

  /**
   * Build a distance sampler sampleAtDistance(distMeters) for telemetry cursor / scrubbers.
   * @param {Array<Object>} telemetry
   * @param {number} totalLength
   * @returns {Function}
   */
  function createDistanceSampler(telemetry, totalLength) {
    const N = telemetry.length;
    if (N === 0 || totalLength <= 0) {
      return function () { return telemetry[0] || null; };
    }

    return function sampleAtDistance(dist) {
      let wrappedS = Number(dist) || 0;
      wrappedS = ((wrappedS % totalLength) + totalLength) % totalLength;

      let lo = 0;
      let hi = N - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (telemetry[mid].s <= wrappedS) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }

      const i0 = lo;
      const i1 = (i0 + 1) % N;
      const p0 = telemetry[i0];
      const p1 = telemetry[i1];
      const s0 = p0.s;
      const s1 = i1 === 0 ? totalLength : p1.s;
      const ds = Math.max(1e-6, s1 - s0);
      const frac = clamp((wrappedS - s0) / ds, 0.0, 1.0);

      return {
        x: lerp(p0.x, p1.x, frac),
        y: lerp(p0.y, p1.y, frac),
        s: wrappedS,
        alpha: lerp(p0.alpha, p1.alpha, frac),
        curvature: lerp(p0.curvature, p1.curvature, frac),
        speed: lerp(p0.speed, p1.speed, frac),
        speedKmh: lerp(p0.speedKmh, p1.speedKmh, frac),
        longG: lerp(p0.longG, p1.longG, frac),
        latG: lerp(p0.latG, p1.latG, frac),
        totalG: lerp(p0.totalG, p1.totalG, frac),
        throttle: clamp(lerp(p0.throttle, p1.throttle, frac), 0, 1),
        brake: clamp(lerp(p0.brake, p1.brake, frac), 0, 1),
        gear: frac < 0.5 ? p0.gear : p1.gear,
        rpm: Math.round(lerp(p0.rpm, p1.rpm, frac)),
        downforceKg: lerp(p0.downforceKg, p1.downforceKg, frac),
        gripUsage: lerp(p0.gripUsage, p1.gripUsage, frac),
        headwindKmh: lerp(p0.headwindKmh || 0, p1.headwindKmh || 0, frac),
        crosswindKmh: lerp(p0.crosswindKmh || 0, p1.crosswindKmh || 0, frac),
        airSpeedKmh: lerp(p0.airSpeedKmh || 0, p1.airSpeedKmh || 0, frac),
        aeroYawDeg: lerp(p0.aeroYawDeg || 0, p1.aeroYawDeg || 0, frac),
        cloudCover: lerp(p0.cloudCover || 0, p1.cloudCover || 0, frac),
        windDownforceRetention: lerp(p0.windDownforceRetention ?? 100, p1.windDownforceRetention ?? 100, frac),
        wetness: lerp(p0.wetness || 0, p1.wetness || 0, frac),
        waterDepthMm: lerp(p0.waterDepthMm || 0, p1.waterDepthMm || 0, frac),
        tireGripMultiplier: lerp(p0.tireGripMultiplier ?? 1.0, p1.tireGripMultiplier ?? 1.0, frac),
        isHydroplaning: frac < 0.5 ? Boolean(p0.isHydroplaning) : Boolean(p1.isHydroplaning),
        ackermannAngleDeg: lerp(p0.ackermannAngleDeg || 0, p1.ackermannAngleDeg || 0, frac),
        steerAngleDeg: lerp(p0.steerAngleDeg || 0, p1.steerAngleDeg || 0, frac),
        steerUsagePct: lerp(p0.steerUsagePct || 0, p1.steerUsagePct || 0, frac),
        slipAngleDeg: lerp(p0.slipAngleDeg, p1.slipAngleDeg, frac),
        tangentAngle: lerpAngle(p0.tangentAngle, p1.tangentAngle, frac),
        heading: lerpAngle(p0.heading, p1.heading, frac),
        stationIndex: i0,
        time: lerp(p0.time, i1 === 0 ? p0.time + ds / Math.max(1, p0.speed) : p1.time, frac)
      };
    };
  }

  /**
   * AI Race Engineer Tire Compound Recommendation based on circuit wet-zone coverage,
   * standing water intensity, and ambient temperature.
   *
   * @param {Object} track
   * @param {Object} [rawWeather]
   * @returns {{
   *   compoundId: string,
   *   code: string,
   *   name: string,
   *   reason: string,
   *   wetTrackPct: number,
   *   maxWetness: number,
   *   avgWetZoneIntensity: number
   * }}
   */
  function recommendTireCompound(track, rawWeather) {
    const weather = normalizeWeather(rawWeather || (track && track.weather) || null);
    const rawSamples = (track && Array.isArray(track.samples) && track.samples.length >= 4)
      ? track.samples
      : (Array.isArray(track) ? track : []);
    const N = rawSamples.length;

    let wetStations = 0;
    let sumWetIntensity = 0;
    let maxWetness = weather.globalWetness || 0;

    if (N >= 4) {
      for (let i = 0; i < N; i++) {
        const s = rawSamples[i];
        const loc = evaluateLocalWeatherAtPoint(
          Number(s.x) || 0,
          Number(s.y) || 0,
          Number(s.tx) || 1,
          Number(s.ty) || 0,
          Number(s.nx) || 0,
          Number(s.ny) || 1,
          weather
        );
        const wVal = loc.wetness || 0;
        if (wVal > maxWetness) maxWetness = wVal;
        if (wVal > 0.10) {
          wetStations++;
          sumWetIntensity += wVal;
        }
      }
    } else if (weather.wetZones.length > 0) {
      wetStations = Math.min(10, weather.wetZones.length * 2);
      for (let z = 0; z < weather.wetZones.length; z++) {
        const zInt = weather.wetZones[z].intensity || 0.75;
        if (zInt > maxWetness) maxWetness = zInt;
        sumWetIntensity += zInt;
      }
    }

    const wetTrackPct = N >= 4
      ? (wetStations / N) * 100.0
      : clamp(weather.wetZones.length * 14.0 + weather.globalWetness * 100.0, 0, 100);

    let avgZoneSpecified = 0;
    if (weather.wetZones.length > 0) {
      let sZ = 0;
      for (let z = 0; z < weather.wetZones.length; z++) {
        sZ += weather.wetZones[z].intensity || 0.75;
      }
      avgZoneSpecified = sZ / weather.wetZones.length;
    }
    const avgStationWetness = wetStations > 0 ? (sumWetIntensity / wetStations) : 0;
    const avgWetZoneIntensity = Math.max(avgStationWetness, avgZoneSpecified * 0.92, weather.globalWetness || 0);

    // 1. Heavy standing water covering much of the track -> Full Wet Blue
    if (
      (wetTrackPct > 45.0 && avgWetZoneIntensity > 0.68) ||
      (wetTrackPct > 60.0 && maxWetness > 0.78) ||
      weather.globalWetness > 0.68
    ) {
      return {
        compoundId: 'wet',
        code: 'WET',
        name: DEFAULT_TIRE_PRESETS.wet.name,
        reason: 'Heavy Standing Water — Full Wet Blue Required',
        wetTrackPct,
        maxWetness,
        avgWetZoneIntensity
      };
    }

    // 2. Mixed / Damp zones (6%..45% wet track or moderate wetness >= 0.20) -> Intermediate Green
    if (wetTrackPct >= 6.0 || maxWetness >= 0.20) {
      return {
        compoundId: 'inter',
        code: 'INT',
        name: DEFAULT_TIRE_PRESETS.inter.name,
        reason: 'Mixed / Damp Zones — Cinturato Green Crossover',
        wetTrackPct,
        maxWetness,
        avgWetZoneIntensity
      };
    }

    // 3. Dry Track (< 6% wet and maxWetness < 0.20) -> Qualifying Soft C5 (or C4/C3 in extreme heat)
    if (weather.ambientTempC >= 36) {
      return {
        compoundId: 'c4',
        code: 'C4',
        name: DEFAULT_TIRE_PRESETS.c4.name,
        reason: 'Hot Dry Track — Soft C4 Optimal Grip & Thermal Control',
        wetTrackPct,
        maxWetness,
        avgWetZoneIntensity
      };
    }

    return {
      compoundId: 'c5',
      code: 'C5',
      name: DEFAULT_TIRE_PRESETS.c5.name,
      reason: 'Dry Track — Qualifying Soft Optimal',
      wetTrackPct,
      maxWetness,
      avgWetZoneIntensity
    };
  }

  /**
   * Core QSS Vehicle Dynamics & Velocity Profile Solver (with Wind, Cloud & Wet Hydro-Thermodynamics).
   * Evaluates a given lateral offset array alpha[0..N-1] on `track` with `carParams` and `weather`.
   *
   * Performs:
   * - Step A: Maximum Cornering Speed Pass (Load-Sensitive Tire Equilibrium + Relative-Airspeed Downforce
   *           + Crosswind Side Force & Yaw Diffuser Stall + Pirelli Wet/Hydroplaning/Rubbered-Line Grip
   *           + Kinematic/Dynamic Ackermann Lock + Chicane Rate Limit)
   * - Step B: 2-Loop Backward Braking Pass (GG Friction Circle + Tailwind/Headwind Aero Braking + Puddle Drag)
   * - Step C: 2-Loop Forward Traction & Power Pass (GG Friction Circle + Relative Airspeed Drag + Puddle Drag)
   * - Step D: Full Telemetry, Wind/Cloud/Wetness Channels, Sector Splits, Corner Analysis, and 60fps Time Interpolator
   *
   * @param {Object} track
   * @param {Float64Array|Array<number>|null} alphaArray
   * @param {Object} rawCarParams
   * @param {Object} [options]
   * @returns {Object}
   */
  function evaluatePath(track, alphaArray, rawCarParams, options = {}) {
    const car = normalizeCarParams(rawCarParams);
    const weather = resolveWeather(track, rawCarParams, options);
    const stations = options._stations || extractTrackStations(track, car);
    const N = stations.length;

    if (N < 4) {
      const recTire = recommendTireCompound(track, weather);
      return {
        telemetry: [],
        points: [],
        alpha: new Float64Array(0),
        lapTime: 0,
        formattedLapTime: '0:00.000',
        sectorTimes: [0, 0, 0],
        formattedSectorTimes: ['0.000', '0.000', '0.000'],
        topSpeedKmh: 0,
        minSpeedKmh: 0,
        avgSpeedKmh: 0,
        maxLatG: 0,
        maxBrakeG: 0,
        maxAccelG: 0,
        maxDownforceKg: 0,
        maxSteerDeg: 0,
        fullThrottlePct: 0,
        brakingPct: 0,
        centerlineLapTime: 0,
        timeSaved: 0,
        totalLength: 0,
        corners: [],
        weather,
        weatherSummary: {
          windSpeedKmh: weather.windSpeedKmh,
          windDirectionDeg: weather.windDirectionDeg,
          ambientTempC: weather.ambientTempC,
          gustIntensity: weather.gustIntensity,
          airDensity: weather.airDensity,
          maxHeadwindKmh: 0,
          maxTailwindKmh: 0,
          maxCrosswindKmh: 0,
          avgBalancePenaltyPct: 0,
          avgCloudCoverPct: 0,
          cloudCount: weather.clouds.length,
          wetZoneCount: weather.wetZones.length,
          wetTrackPct: 0,
          maxWaterDepthMm: 0,
          recommendedTire: recTire
        },
        sampleAtTime: () => null,
        sampleAtDistance: () => null
      };
    }

    const alpha = new Float64Array(N);
    if (alphaArray && alphaArray.length === N) {
      for (let i = 0; i < N; i++) {
        alpha[i] = clamp(Number(alphaArray[i]) || 0, -stations[i].bound, stations[i].bound);
      }
    }

    const geom = computePathGeometry(stations, alpha);
    const { X, Y, ds, s, kappa, totalLength } = geom;

    // Precompute local weather (wind decomposition along actual path tangent/normal + cloud shadow + wet zones) at each station i
    const pathWeather = new Array(N);
    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;
      const dx = X[next] - X[prev];
      const dy = Y[next] - Y[prev];
      const len = Math.hypot(dx, dy) || 1.0;
      const tx = dx / len;
      const ty = dy / len;
      // Unit normal n_i = (-ty, tx) consistent with station normal & signed curvature
      let nx = -ty;
      let ny = tx;
      if (nx * stations[i].nx + ny * stations[i].ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      pathWeather[i] = evaluateLocalWeatherAtPoint(X[i], Y[i], tx, ty, nx, ny, weather);
    }

    const m = car.mass;
    const muEff = car.muEff;
    const vTop = car.topSpeedMs;
    const rollingResForce = car.crr * m * GRAVITY;

    const vMax = new Float64Array(N);
    const v = new Float64Array(N);

    // -------------------------------------------------------------------------
    // Step A: Maximum Cornering Speed Pass
    // Solves load-sensitive tire equilibrium with relative airspeed v_air = max(0, v - w_parallel),
    // crosswind side force F_y,wind, yaw diffuser stall, cloud/temp grip modifiers,
    // and Pirelli compound + wetness + hydroplaning + cross-track wet line grip.
    // -------------------------------------------------------------------------
    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;
      const absK = Math.abs(kappa[i]);
      const pw = pathWeather[i];
      const st = stations[i];

      // Straight-line top speed ceiling responds to tailwind (+wParallel) vs headwind (-wParallel)
      const vTopLocal = clamp(vTop + pw.wParallel * 0.38, vTop * 0.88, vTop * 1.07);

      // 1. Chicane steering-rate & lateral-jerk limit based on |d(kappa)/ds|
      const dkds = Math.abs(kappa[next] - kappa[prev]) / Math.max(0.5, ds[prev] + ds[i]);
      let vChicaneMax = vTopLocal;
      if (dkds > 1e-4) {
        const chicaneTire = computeStationTireGrip(
          car,
          pw.wetness || 0,
          vTopLocal * 0.55,
          alpha[i],
          st.bound,
          st.centerKappa
        );
        const localMuEff = Math.max(
          0.25,
          muEff * (1.0 + pw.deltaMuCloud / Math.max(0.5, car.mu)) * chicaneTire.tireGripMultiplier
        );
        const vSteerRate = car.maxSteerRateRadPerSec / (car.wheelbase * dkds);
        const vLatJerk = Math.cbrt((3.4 * GRAVITY * localMuEff) / dkds);
        vChicaneMax = Math.min(vTopLocal, vSteerRate, vLatJerk);
      }

      if (absK < 1e-5) {
        vMax[i] = vChicaneMax;
      } else {
        const cornerSign = kappa[i] >= 0 ? 1 : -1;

        // 2. Kinematic steering lock penalty if path curvature exceeds tan(delta_max)/L
        let effK = absK;
        if (absK > car.maxCurvature) {
          effK = absK * (1.0 + 2.5 * (absK / car.maxCurvature - 1.0));
        }

        // 3. Solve m * v^2 * effK + F_y,wind,out = maxLatForce(v_air, wetness, alpha) via fixed-point iteration
        let x = Math.min(vTopLocal * vTopLocal, (muEff * car.tireDryGripMul * GRAVITY) / effK);
        for (let iter = 0; iter < 5; iter++) {
          const vEst = Math.sqrt(Math.max(1.0, x));
          const wa = computeStationWindAero(car, vEst, pw, weather, alpha[i], st.bound, st.centerKappa);
          // Outward crosswind component (positive when pushing car toward outside of corner)
          const fyWindOut = -cornerSign * wa.fyWind;
          const windLatPenalty = fyWindOut >= 0 ? fyWindOut : (0.30 * fyWindOut);
          const netLatForce = Math.max(120.0, wa.maxLatForce - windLatPenalty);
          const targetX = netLatForce / (m * effK);
          x = 0.35 * x + 0.65 * Math.min(vTopLocal * vTopLocal * 1.25, targetX);
        }
        let vCorner = Math.min(vTopLocal, Math.sqrt(Math.max(1.0, x)));

        // 4. Dynamic understeer + Ackermann steering lock ceiling at speed
        const ackRad = Math.atan(car.wheelbase * absK);
        if (car.understeerGradientRadPerG > 0.001 && ackRad < car.maxSteerRad) {
          const maxAyFromSteer = ((car.maxSteerRad - ackRad) / car.understeerGradientRadPerG) * GRAVITY;
          const vSteerLock = Math.sqrt(Math.max(4.0, maxAyFromSteer / absK));
          vCorner = Math.min(vCorner, vSteerLock);
        }

        vMax[i] = Math.min(vChicaneMax, vCorner);
      }
      v[i] = vMax[i];
    }

    // -------------------------------------------------------------------------
    // Step B: Backward Pass (Braking Limit via GG Friction Circle + Relative Airspeed Aero + Puddle Drag)
    // Run 2 full loops backward (N-1 down to 0) for periodic start/finish wrap
    // -------------------------------------------------------------------------
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const next = (i + 1) % N;
        const vNext = v[next];
        const vNextSq = vNext * vNext;
        // Effective segment curvature considers both endpoints for accurate trail-braking
        const absKSeg = Math.max(Math.abs(kappa[next]), 0.65 * Math.abs(kappa[i]) + 0.35 * Math.abs(kappa[next]));
        const cornerSign = kappa[next] >= 0 ? 1 : -1;

        const stNext = stations[next];
        const waNext = computeStationWindAero(
          car,
          vNext,
          pathWeather[next],
          weather,
          alpha[next],
          stNext.bound,
          stNext.centerKappa
        );
        const fyWindOut = -cornerSign * waNext.fyWind;
        const fyCentrifugal = m * vNextSq * absKSeg;
        const fyDemand = Math.max(
          0.0,
          fyCentrifugal + (absKSeg > 1e-4 ? (fyWindOut >= 0 ? fyWindOut : 0.30 * fyWindOut) : Math.abs(waNext.fyWind))
        );

        const uy = Math.min(0.985, fyDemand / Math.max(100.0, waNext.maxLatForce));
        const longCircleFactor = Math.sqrt(Math.max(0.02, 1.0 - uy * uy));

        const tireBrakeLimit = waNext.maxLatForce;
        const fBrakeAvail = Math.min(car.maxBrakeForce, tireBrakeLimit) * car.brakeBiasEta * longCircleFactor;
        const fScrubAssist = 0.30 * fyCentrifugal * Math.sin(car.peakSlipAngleRad * uy);
        // Aero drag during braking depends on relative airspeed v_air^2 plus wet puddle displacement drag!
        const fDrag = waNext.aeroDragFactor * waNext.vAirSq + rollingResForce + fScrubAssist + waNext.waterDragForce;

        const aDec = Math.max(0.05, (fBrakeAvail + fDrag) / m);
        const vEntryMax = Math.sqrt(vNextSq + 2.0 * aDec * ds[i]);

        if (vEntryMax < v[i]) {
          v[i] = vEntryMax;
        }
      }
    }

    // -------------------------------------------------------------------------
    // Step C: Forward Pass (Traction, Power & Relative-Airspeed Drag + Puddle Drag via GG Friction Circle)
    // Run 2 full loops forward (0 to N-1) for periodic start/finish wrap
    // -------------------------------------------------------------------------
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) {
        const next = (i + 1) % N;
        const vCurr = v[i];
        const vCurrSq = vCurr * vCurr;
        const absK = Math.abs(kappa[i]);
        const cornerSign = kappa[i] >= 0 ? 1 : -1;

        const stCurr = stations[i];
        const waCurr = computeStationWindAero(
          car,
          vCurr,
          pathWeather[i],
          weather,
          alpha[i],
          stCurr.bound,
          stCurr.centerKappa
        );
        const fyWindOut = -cornerSign * waCurr.fyWind;
        const fyCentrifugal = m * vCurrSq * absK;
        const fyDemand = Math.max(
          0.0,
          fyCentrifugal + (absK > 1e-4 ? (fyWindOut >= 0 ? fyWindOut : 0.30 * fyWindOut) : Math.abs(waCurr.fyWind))
        );

        const uy = Math.min(0.985, fyDemand / Math.max(100.0, waCurr.maxLatForce));
        const longCircleFactor = Math.sqrt(Math.max(0.02, 1.0 - uy * uy));

        // Low-speed RWD traction factor transitions smoothly toward full aero grip at speed
        const speedRatio = clamp(vCurr / 45.0, 0.0, 1.0);
        const effDrivetrain = lerp(car.drivetrainEfficiency, Math.min(1.0, car.drivetrainEfficiency + 0.05), speedRatio);

        const fTireTrac = waCurr.maxLatForce * effDrivetrain * longCircleFactor;
        const fEngine = (car.powerWatts * car.wheelPowerEta * waCurr.engineAirEta) / Math.max(vCurr, 12.0);
        // Cornering-induced tire scrub drag: F_x,scrub = F_y * sin(alpha_slip)
        const fScrubDrag = fyCentrifugal * Math.sin(car.peakSlipAngleRad * uy);
        // Aerodynamic drag depends on relative airspeed squared v_air^2 plus wet puddle displacement drag!
        const fDrag = waCurr.aeroDragFactor * waCurr.vAirSq + rollingResForce + fScrubDrag + waCurr.waterDragForce;

        const fNet = Math.min(fTireTrac, fEngine) - fDrag;
        const aAcc = Math.max(0.0, fNet / m);

        const vExitMax = Math.min(vMax[next], Math.sqrt(vCurrSq + 2.0 * aAcc * ds[i]));
        if (vExitMax < v[next]) {
          v[next] = vExitMax;
        }
      }
    }

    // Fast mode used internally if only lapTime is needed
    if (options.fastTimeOnly) {
      let totalTime = 0;
      for (let i = 0; i < N; i++) {
        const next = (i + 1) % N;
        const avgV = Math.max(1.0, 0.5 * (v[i] + v[next]));
        totalTime += ds[i] / avgV;
      }
      return { lapTime: totalTime, totalLength, alpha, weather };
    }

    // -------------------------------------------------------------------------
    // Step D: Full Telemetry, Steering Angles, Sector Splits & Weather Summary
    // -------------------------------------------------------------------------
    const telemetry = new Array(N);
    const points = new Array(N);

    let elapsedTime = 0;
    let topSpeedKmh = 0;
    let minSpeedKmh = Infinity;
    let maxLatG = 0;
    let maxBrakeG = 0;
    let maxAccelG = 0;
    let maxDownforceKg = 0;
    let maxSteerDeg = 0;
    let fullThrottleTime = 0;
    let brakingTime = 0;

    // Weather & Wet-surface summary accumulators
    let maxHeadwindKmh = 0;
    let maxTailwindKmh = 0;
    let maxCrosswindKmh = 0;
    let sumBalancePenaltyPct = 0;
    let sumCloudCover = 0;
    let wetLengthMeters = 0;
    let maxWaterDepthMm = 0;

    // Sector boundaries at 1/3 and 2/3 of track length
    const s1Boundary = totalLength / 3.0;
    const s2Boundary = (totalLength * 2.0) / 3.0;
    let s1EndTime = 0;
    let s2EndTime = 0;

    // Reference aero drag factor for gearbox ratios
    const refHalfRhoA = 0.5 * weather.airDensity * car.frontalArea;
    const refAeroDragFactor = refHalfRhoA * car.Cd;
    const estAeroTerminalMs = refAeroDragFactor > 1e-4
      ? Math.cbrt((car.powerWatts * car.wheelPowerEta) / refAeroDragFactor)
      : vTop;
    const gearRefSpeedMs = Math.max(15.0, Math.min(vTop, estAeroTerminalMs * 0.985));

    // Gear speed thresholds (realistic progressive racing gearbox spacing)
    const numGears = car.gears;
    const gearMaxRatios = new Float64Array(numGears);
    for (let g = 0; g < numGears; g++) {
      const frac = g / Math.max(1, numGears - 1);
      gearMaxRatios[g] = numGears === 1 ? 1.0 : (0.27 + 0.73 * Math.pow(frac, 0.88));
    }

    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;

      const vCurr = v[i];
      const vNext = v[next];
      const vCurrSq = vCurr * vCurr;
      const speedKmh = vCurr * 3.6;
      const pw = pathWeather[i];
      const st = stations[i];

      // Segment time dt_i = ds_i / v_avg
      const avgV = Math.max(1.0, 0.5 * (vCurr + vNext));
      const dt = ds[i] / avgV;
      const stationTime = elapsedTime;

      // Track sector split crossings accurately using linear interpolation
      const sCurr = s[i];
      const sNext = sCurr + ds[i];
      if (sCurr <= s1Boundary && sNext >= s1Boundary) {
        const frac = (s1Boundary - sCurr) / Math.max(1e-5, ds[i]);
        s1EndTime = stationTime + frac * dt;
      }
      if (sCurr <= s2Boundary && sNext >= s2Boundary) {
        const frac = (s2Boundary - sCurr) / Math.max(1e-5, ds[i]);
        s2EndTime = stationTime + frac * dt;
      }

      elapsedTime += dt;

      // Longitudinal acceleration ax = (v_{i+1}^2 - v_i^2) / (2 * ds_i)
      const ax = (vNext * vNext - vCurrSq) / (2.0 * ds[i]);
      const longG = ax / GRAVITY;

      // Signed lateral acceleration ay = v_i^2 * kappa_i
      const aySigned = vCurrSq * kappa[i];
      const latG = aySigned / GRAVITY;
      const absLatG = Math.abs(latG);
      const totalG = Math.hypot(longG, absLatG);

      // Load-sensitive tire, downforce, wind & wet-surface state at station i
      const wa = computeStationWindAero(car, vCurr, pw, weather, alpha[i], st.bound, st.centerKappa);
      const downforceN = wa.downforceN;
      const downforceKg = downforceN / GRAVITY;
      const maxLatForce = wa.maxLatForce;
      const fDrag = wa.aeroDragFactor * wa.vAirSq + rollingResForce + wa.waterDragForce;

      const maxBrakeAvail = Math.min(car.maxBrakeForce, maxLatForce) * car.brakeBiasEta;
      const maxDecelPossible = (maxBrakeAvail + fDrag) / m;

      const maxTireTrac = maxLatForce * car.drivetrainEfficiency;
      const maxEngineTrac = (car.powerWatts * car.wheelPowerEta * wa.engineAirEta) / Math.max(vCurr, 12.0);
      const maxPropulsive = Math.min(maxTireTrac, maxEngineTrac);

      // Compute realistic throttle (0..1) and brake (0..1) pedal inputs
      let throttle = 0;
      let brake = 0;

      if (ax >= -0.15) {
        const reqTractive = Math.max(0, m * ax + fDrag);
        throttle = clamp(reqTractive / Math.max(100, maxPropulsive), 0.0, 1.0);
        if (vCurr >= gearRefSpeedMs * 0.97 && ax >= -0.05) {
          throttle = 1.0;
        }
      } else {
        const reqBrakingForce = Math.max(0, -m * ax - fDrag * 0.65);
        brake = clamp(reqBrakingForce / Math.max(200, maxBrakeAvail * 0.85), 0.0, 1.0);
        throttle = 0;
      }

      if (throttle >= 0.90) {
        fullThrottleTime += dt;
      }
      if (brake >= 0.05) {
        brakingTime += dt;
      }

      // Grip usage percentage (0..100%) on the GG friction circle (including crosswind side force)
      const cornerSign = kappa[i] >= 0 ? 1 : -1;
      const fyWindOut = -cornerSign * wa.fyWind;
      const totalLatTireForce = Math.abs(m * aySigned + (Math.abs(kappa[i]) > 1e-4 ? fyWindOut : wa.fyWind));
      const latRatio = totalLatTireForce / Math.max(100, maxLatForce);
      const longRatio = ax < 0
        ? (-ax / Math.max(0.5, maxDecelPossible))
        : ((m * ax + Math.max(0, fDrag * 0.35)) / Math.max(100, maxLatForce * car.drivetrainEfficiency));
      const gripUsage = clamp(Math.hypot(latRatio, longRatio) * 100.0, 0.0, 100.0);

      // Gear & simulated RPM calculation referenced to achievable top speed
      const vRatio = clamp(vCurr / gearRefSpeedMs, 0.0, 1.05);
      let gear = numGears;
      for (let g = 0; g < numGears; g++) {
        if (vRatio <= gearMaxRatios[g]) {
          gear = g + 1;
          break;
        }
      }
      const lowerRatio = gear === 1 ? 0.0 : gearMaxRatios[gear - 2] * 0.74;
      const upperRatio = gearMaxRatios[gear - 1];
      const gearFrac = clamp((vRatio - lowerRatio) / Math.max(0.05, upperRatio - lowerRatio), 0.0, 1.0);
      const rpm = Math.round(lerp(car.idleRpm + (gear > 1 ? 2200 : 0), car.redlineRpm, gearFrac));

      // Kinematic Ackermann, Dynamic Road-Wheel Steering Angle & Crosswind Counter-Steering Correction (deg)
      const ackermannRad = Math.atan(car.wheelbase * Math.abs(kappa[i]));
      const ackermannAngleDeg = cornerSign * ((ackermannRad * 180.0) / Math.PI);
      const dynamicSteerMagDeg = Math.abs(ackermannAngleDeg) + car.understeerGradientDegPerG * absLatG;
      const windCounterSteerDeg = clamp(
        (-wa.fyWind / Math.max(1500.0, maxLatForce)) * car.peakSlipAngleDeg * 0.90,
        -8.5,
        8.5
      );
      const steerAngleDeg = clamp(
        cornerSign * dynamicSteerMagDeg + windCounterSteerDeg,
        -car.maxSteerAngle,
        car.maxSteerAngle
      );
      const steerUsagePct = clamp((Math.abs(steerAngleDeg) / car.maxSteerAngle) * 100.0, 0.0, 100.0);

      // Vehicle slip / drift angle in degrees & heading angle in radians
      const tangentAngle = Math.atan2(Y[next] - Y[prev], X[next] - X[prev]);
      let slipAngleDeg = 0;
      const wetness = pw.wetness || 0;
      const waterDepthMm = pw.waterDepthMm || 0;
      const tireGripMultiplier = wa.tireGripMultiplier;
      const isHydroplaning = wa.isHydroplaning;

      if (car.isDrift) {
        const curvatureIntensity = clamp(Math.abs(kappa[i]) / 0.032, 0.0, 1.25);
        const gIntensity = clamp(absLatG / Math.max(0.5, car.muEff * 0.95), 0.0, 1.2);
        const driftMag = Math.max(curvatureIntensity * 34.0, gIntensity * 29.0);
        if (driftMag > 2.5) {
          slipAngleDeg = cornerSign * clamp(driftMag * (0.75 + 0.25 * throttle), 0.0, 41.0);
        }
      } else {
        const limitFrac = clamp(latRatio, 0.0, 1.0);
        const wetSlipBoost = 1.0 + wetness * (1.0 - 0.55 * car.treadGrooveRatio) * 0.45;
        const oversteerFactor = clamp(
          (1.0 - car.gripBalanceDelta * 0.4 + (1.0 - wa.rawBalanceEta) * 0.85) * wetSlipBoost,
          0.7,
          2.1
        );
        const crosswindSlipDeg = (-wa.fyWind / Math.max(1800.0, maxLatForce)) * car.peakSlipAngleDeg * 0.55;
        slipAngleDeg = cornerSign * (limitFrac * limitFrac * car.peakSlipAngleDeg * 0.78 * oversteerFactor) + crosswindSlipDeg;
      }

      const slipAngleRad = (slipAngleDeg * Math.PI) / 180.0;
      const heading = tangentAngle + slipAngleRad;

      // Station weather telemetry channels
      const headwindKmh = -pw.wParallel * 3.6; // positive = headwind, negative = tailwind
      const crosswindKmh = pw.wPerp * 3.6;
      const airSpeedKmh = wa.vAir * 3.6;
      const aeroYawDeg = wa.aeroYawDeg;
      const cloudCover = pw.cloudCover;
      const windDownforceRetention = wa.rawYawAeroEta * 100.0;

      if (headwindKmh > maxHeadwindKmh) maxHeadwindKmh = headwindKmh;
      if (-headwindKmh > maxTailwindKmh) maxTailwindKmh = -headwindKmh;
      if (Math.abs(crosswindKmh) > maxCrosswindKmh) maxCrosswindKmh = Math.abs(crosswindKmh);
      sumBalancePenaltyPct += (1.0 - wa.rawBalanceEta) * 100.0;
      sumCloudCover += cloudCover;
      if (wetness > 0.10) {
        wetLengthMeters += ds[i];
      }
      if (waterDepthMm > maxWaterDepthMm) {
        maxWaterDepthMm = waterDepthMm;
      }

      // Update summary peaks
      if (speedKmh > topSpeedKmh) topSpeedKmh = speedKmh;
      if (speedKmh < minSpeedKmh) minSpeedKmh = speedKmh;
      if (absLatG > maxLatG) maxLatG = absLatG;
      if (longG < 0 && -longG > maxBrakeG) maxBrakeG = -longG;
      if (longG > maxAccelG) maxAccelG = longG;
      if (downforceKg > maxDownforceKg) maxDownforceKg = downforceKg;
      if (Math.abs(steerAngleDeg) > maxSteerDeg) maxSteerDeg = Math.abs(steerAngleDeg);

      const samplePoint = {
        index: i,
        x: X[i],
        y: Y[i],
        s: sCurr,
        ds: ds[i],
        trackS: st.trackS,
        alpha: alpha[i],
        bound: st.bound,
        curvature: kappa[i],
        speed: vCurr,
        speedKmh,
        maxCornerSpeedKmh: vMax[i] * 3.6,
        longG,
        latG,
        totalG,
        throttle,
        brake,
        gear,
        rpm,
        downforceKg,
        gripUsage,
        headwindKmh,
        crosswindKmh,
        airSpeedKmh,
        aeroYawDeg,
        cloudCover,
        windDownforceRetention,
        wetness,
        waterDepthMm,
        tireGripMultiplier,
        isHydroplaning,
        ackermannAngleDeg,
        steerAngleDeg,
        steerUsagePct,
        slipAngleDeg,
        tangentAngle,
        heading,
        time: stationTime,
        dt
      };

      telemetry[i] = samplePoint;
      points[i] = {
        x: X[i],
        y: Y[i],
        speedKmh,
        throttle,
        brake,
        s: sCurr,
        alpha: alpha[i],
        headwindKmh,
        crosswindKmh,
        airSpeedKmh,
        cloudCover,
        wetness,
        waterDepthMm,
        tireGripMultiplier,
        isHydroplaning
      };
    }

    const lapTime = elapsedTime;
    const s1 = s1EndTime > 0 ? s1EndTime : lapTime / 3.0;
    const s2 = s2EndTime > s1 ? (s2EndTime - s1) : lapTime / 3.0;
    const s3 = Math.max(0.001, lapTime - s1 - s2);
    const sectorTimes = [s1, s2, s3];

    const avgSpeedKmh = lapTime > 0 ? ((totalLength / lapTime) * 3.6) : 0;
    const fullThrottlePct = lapTime > 0 ? clamp((fullThrottleTime / lapTime) * 100.0, 0, 100) : 0;
    const brakingPct = lapTime > 0 ? clamp((brakingTime / lapTime) * 100.0, 0, 100) : 0;

    // Reference centerline comparison (unless we are already computing the centerline)
    let centerlineLapTime = lapTime;
    let timeSaved = 0;
    if (!options.skipCenterlineComparison) {
      if (Number.isFinite(options.centerlineLapTime) && options.centerlineLapTime > 0) {
        centerlineLapTime = options.centerlineLapTime;
      } else {
        const zeroAlpha = new Float64Array(N);
        const centerEval = evaluatePath(track, zeroAlpha, car, {
          _stations: stations,
          weather,
          fastTimeOnly: true,
          skipCenterlineComparison: true
        });
        centerlineLapTime = centerEval.lapTime;
      }
      timeSaved = Math.max(0, centerlineLapTime - lapTime);
    }

    const corners = detectCorners(telemetry, totalLength);
    const sampleAtTime = createTimeSampler(telemetry, lapTime, totalLength);
    const sampleAtDistance = createDistanceSampler(telemetry, totalLength);

    const wetTrackPct = totalLength > 0 ? clamp((wetLengthMeters / totalLength) * 100.0, 0.0, 100.0) : 0;
    const recommendedTire = recommendTireCompound(track, weather);

    const weatherSummary = {
      windSpeedKmh: weather.windSpeedKmh,
      windDirectionDeg: weather.windDirectionDeg,
      ambientTempC: weather.ambientTempC,
      gustIntensity: weather.gustIntensity,
      airDensity: weather.airDensity,
      maxHeadwindKmh,
      maxTailwindKmh,
      maxCrosswindKmh,
      avgBalancePenaltyPct: N > 0 ? (sumBalancePenaltyPct / N) : 0,
      avgCloudCoverPct: N > 0 ? ((sumCloudCover / N) * 100.0) : 0,
      cloudCount: weather.clouds.length,
      wetZoneCount: weather.wetZones.length,
      wetTrackPct,
      maxWaterDepthMm,
      recommendedTire
    };

    return {
      telemetry,
      points,
      alpha,
      lapTime,
      formattedLapTime: formatLapTime(lapTime, true),
      sectorTimes,
      formattedSectorTimes: sectorTimes.map(t => formatLapTime(t, false)),
      topSpeedKmh,
      minSpeedKmh: Number.isFinite(minSpeedKmh) ? minSpeedKmh : 0,
      avgSpeedKmh,
      maxLatG,
      maxBrakeG,
      maxAccelG,
      maxDownforceKg,
      maxSteerDeg,
      fullThrottlePct,
      brakingPct,
      centerlineLapTime,
      formattedCenterlineLapTime: formatLapTime(centerlineLapTime, true),
      timeSaved,
      totalLength,
      corners,
      carParams: car,
      weather,
      weatherSummary,
      sampleAtTime,
      sampleAtDistance
    };
  }

  /**
   * Compute a fast Dry Reference Racing Line (alpha & points) for visual comparison
   * when localized wet zones or standing water are active on the circuit.
   * @param {Array<Object>} stations
   * @param {Object} car
   * @param {Object} weather
   * @param {number} iterations
   * @returns {{ dryReferenceAlpha: Float64Array, dryReferencePoints: Array<Object> }}
   */
  function computeDryReferenceLine(stations, car, weather, iterations) {
    const N = stations.length;
    const dryStations = new Array(N);
    for (let i = 0; i < N; i++) {
      dryStations[i] = { ...stations[i], wetness: 0, waterDepthMm: 0 };
    }
    const { betaExit, centerKappa } = computeExitBiasWeights(dryStations, car);
    const dryAlpha = new Float64Array(N);
    const scratch = new Float64Array(N);
    const dX = new Float64Array(N);
    const dY = new Float64Array(N);

    const steps = clamp(Math.round(iterations * 0.85), 60, 220);
    for (let iter = 0; iter < steps; iter++) {
      performRelaxationStep(
        dryStations,
        dryAlpha,
        scratch,
        dX,
        dY,
        betaExit,
        centerKappa,
        car,
        iter / steps
      );
    }

    const dryReferencePoints = new Array(N);
    for (let i = 0; i < N; i++) {
      const st = dryStations[i];
      dryReferencePoints[i] = {
        x: st.x + dryAlpha[i] * st.nx,
        y: st.y + dryAlpha[i] * st.ny,
        alpha: dryAlpha[i],
        s: st.trackS
      };
    }

    return { dryReferenceAlpha: dryAlpha, dryReferencePoints };
  }

  /**
   * Instant Synchronous Optimal Racing Line Solver.
   * Runs ~220-250 multi-scale Euler-Bellman relaxation iterations in ~10-25ms
   * and returns the complete evaluated QSS telemetry & lap time profile.
   *
   * @param {Object} track
   * @param {Object} carParams
   * @param {Object} [options]
   * @returns {Object}
   */
  function solveInstant(track, carParams, options = {}) {
    const car = normalizeCarParams(carParams);
    const weather = resolveWeather(track, carParams, options);
    const stations = extractTrackStations(track, car);
    attachStationWeather(stations, weather);
    const N = stations.length;

    if (N < 4) {
      return evaluatePath(track, null, car, { _stations: stations, weather });
    }

    const iterations = clamp(Number(options.iterations ?? 240), 20, 600);
    const alpha = new Float64Array(N);
    const scratchAlpha = new Float64Array(N);
    const X = new Float64Array(N);
    const Y = new Float64Array(N);

    // Optional warm start from previous alpha array
    if (options.initialAlpha && options.initialAlpha.length === N) {
      for (let i = 0; i < N; i++) {
        alpha[i] = clamp(Number(options.initialAlpha[i]) || 0, -stations[i].bound, stations[i].bound);
      }
    }

    const { betaExit, centerKappa } = computeExitBiasWeights(stations, car);

    // Compute baseline centerline lap time once
    const zeroAlpha = new Float64Array(N);
    const centerResult = evaluatePath(track, zeroAlpha, car, {
      _stations: stations,
      weather,
      fastTimeOnly: true,
      skipCenterlineComparison: true
    });

    // Run projected relaxation iterations
    for (let iter = 0; iter < iterations; iter++) {
      const iterRatio = iter / iterations;
      performRelaxationStep(
        stations,
        alpha,
        scratchAlpha,
        X,
        Y,
        betaExit,
        centerKappa,
        car,
        iterRatio
      );
    }

    const result = evaluatePath(track, alpha, car, {
      _stations: stations,
      weather,
      centerlineLapTime: centerResult.lapTime
    });

    // If wet zones or global wetness are active, also attach the Dry Reference Line for comparison
    if (weather.wetZones.length > 0 || weather.globalWetness > 0.05) {
      const dryRef = computeDryReferenceLine(stations, car, weather, iterations);
      result.dryReferenceAlpha = dryRef.dryReferenceAlpha;
      result.dryReferencePoints = dryRef.dryReferencePoints;
    } else {
      result.dryReferenceAlpha = result.alpha;
      result.dryReferencePoints = result.points;
    }

    result.iterations = iterations;
    result.isConverged = true;
    return result;
  }

  /**
   * Create an interactive / progressive AI optimization session so the UI can animate
   * the AI morphing the racing line from the centerline to the optimal apex-clipping path
   * step-by-step over frames while showing the lap time dropping in real time.
   *
   * @param {Object} track
   * @param {Object} carParams
   * @param {Object} [options]
   * @returns {Object} Session controller { step(iterationsPerFrame), getCurrentResult(), solveToEnd(), isDone(), getProgress() }
   */
  function createOptimizationSession(track, carParams, options = {}) {
    const car = normalizeCarParams(carParams);
    let weather = resolveWeather(track, carParams, options);
    const stations = extractTrackStations(track, car);
    attachStationWeather(stations, weather);
    const N = stations.length;
    const totalIterations = clamp(Number(options.totalIterations ?? 250), 30, 800);

    const alpha = new Float64Array(N);
    const scratchAlpha = new Float64Array(N);
    const X = new Float64Array(N);
    const Y = new Float64Array(N);

    if (options.initialAlpha && options.initialAlpha.length === N) {
      for (let i = 0; i < N; i++) {
        alpha[i] = clamp(Number(options.initialAlpha[i]) || 0, -stations[i].bound, stations[i].bound);
      }
    }

    let { betaExit, centerKappa } = N >= 4
      ? computeExitBiasWeights(stations, car)
      : { betaExit: new Float64Array(0), centerKappa: new Float64Array(0) };

    const zeroAlpha = new Float64Array(N);
    let centerEval = N >= 4
      ? evaluatePath(track, zeroAlpha, car, {
          _stations: stations,
          weather,
          fastTimeOnly: true,
          skipCenterlineComparison: true
        })
      : { lapTime: 0 };

    let dryRefCache = (N >= 4 && (weather.wetZones.length > 0 || weather.globalWetness > 0.05))
      ? computeDryReferenceLine(stations, car, weather, totalIterations)
      : null;

    let currentIteration = 0;
    let latestResult = null;
    const history = [];

    function computeSnapshot() {
      latestResult = evaluatePath(track, alpha, car, {
        _stations: stations,
        weather,
        centerlineLapTime: centerEval.lapTime
      });
      if (dryRefCache) {
        latestResult.dryReferenceAlpha = dryRefCache.dryReferenceAlpha;
        latestResult.dryReferencePoints = dryRefCache.dryReferencePoints;
      } else {
        latestResult.dryReferenceAlpha = latestResult.alpha;
        latestResult.dryReferencePoints = latestResult.points;
      }
      latestResult.iteration = currentIteration;
      latestResult.totalIterations = totalIterations;
      latestResult.progress = clamp(currentIteration / totalIterations, 0, 1);
      latestResult.isConverged = currentIteration >= totalIterations;
      history.push({
        iteration: currentIteration,
        lapTime: latestResult.lapTime,
        timeSaved: latestResult.timeSaved
      });
      return latestResult;
    }

    // Initial snapshot (iteration 0 = centerline)
    computeSnapshot();

    return {
      /**
       * Advance optimization by `numSteps` relaxation iterations and return updated evaluation.
       * @param {number} [numSteps=10]
       * @returns {Object}
       */
      step(numSteps = 10) {
        if (N < 4 || currentIteration >= totalIterations) {
          return latestResult;
        }
        const stepsToRun = Math.min(numSteps, totalIterations - currentIteration);
        for (let k = 0; k < stepsToRun; k++) {
          const iterRatio = currentIteration / totalIterations;
          performRelaxationStep(
            stations,
            alpha,
            scratchAlpha,
            X,
            Y,
            betaExit,
            centerKappa,
            car,
            iterRatio
          );
          currentIteration++;
        }
        return computeSnapshot();
      },

      /**
       * Immediately finish all remaining iterations and return the final optimal result.
       * @returns {Object}
       */
      solveToEnd() {
        if (currentIteration < totalIterations) {
          return this.step(totalIterations - currentIteration);
        }
        return latestResult;
      },

      /**
       * Update weather dynamically during or after session and recompute snapshot.
       * @param {Object} newWeather
       */
      setWeather(newWeather) {
        weather = normalizeWeather(newWeather);
        attachStationWeather(stations, weather);
        if (N >= 4) {
          const updatedWeights = computeExitBiasWeights(stations, car);
          betaExit = updatedWeights.betaExit;
          centerKappa = updatedWeights.centerKappa;
          centerEval = evaluatePath(track, zeroAlpha, car, {
            _stations: stations,
            weather,
            fastTimeOnly: true,
            skipCenterlineComparison: true
          });
          dryRefCache = (weather.wetZones.length > 0 || weather.globalWetness > 0.05)
            ? computeDryReferenceLine(stations, car, weather, totalIterations)
            : null;
        }
        return computeSnapshot();
      },

      /**
       * Reset session back to centerline (alpha = 0).
       */
      reset() {
        alpha.fill(0);
        currentIteration = 0;
        history.length = 0;
        return computeSnapshot();
      },

      getCurrentResult() {
        return latestResult;
      },

      getHistory() {
        return history;
      },

      getProgress() {
        return clamp(currentIteration / totalIterations, 0, 1);
      },

      isDone() {
        return currentIteration >= totalIterations;
      }
    };
  }

  /**
   * Compute both Centerline and Optimal AI Racing Line full evaluations for side-by-side comparison.
   * @param {Object} track
   * @param {Object} carParams
   * @param {Object} [options]
   * @returns {{ optimal: Object, centerline: Object, timeSaved: number }}
   */
  function compareWithCenterline(track, carParams, options = {}) {
    const car = normalizeCarParams(carParams);
    const weather = resolveWeather(track, carParams, options);
    const stations = extractTrackStations(track, car);
    attachStationWeather(stations, weather);
    const zeroAlpha = new Float64Array(stations.length);

    const centerline = evaluatePath(track, zeroAlpha, car, {
      _stations: stations,
      weather,
      skipCenterlineComparison: true
    });

    const optimal = solveInstant(track, car, {
      ...options,
      weather
    });

    return {
      optimal,
      centerline,
      timeSaved: Math.max(0, centerline.lapTime - optimal.lapTime)
    };
  }

  /**
   * Generate "Calm Baseline" Weather Preset (0 km/h wind, 22°C, 0 clouds, 0 wetZones).
   * @returns {Object}
   */
  function getCalmWeatherPreset() {
    return normalizeWeather({
      windSpeedKmh: 0,
      windDirectionDeg: 0,
      gustIntensity: 0.10,
      ambientTempC: 22,
      clouds: [],
      wetZones: [],
      globalWetness: 0,
      presetName: 'calm'
    });
  }

  /**
   * Generate "Best Conditions" Weather Preset for a given track and car.
   * Automatically analyzes the track's corners vs. longest straight to find the Optimal Wind Direction
   * (where dominant high-speed corners get a helpful headwind for maximum downforce while the longest
   * straight gets a quartering tailwind) at a crisp cool ambient temperature (16°C for dense air
   * rho = 1.250 kg/m^3), windSpeedKmh: 22, zero cloud cover, dry track — producing a FASTER lap time than calm baseline!
   *
   * @param {Object} track
   * @param {Object} [carParams]
   * @returns {Object}
   */
  function getBestWeatherPreset(track, carParams) {
    const car = normalizeCarParams(carParams);
    const stations = extractTrackStations(track, car);
    const N = stations.length;

    if (N < 4) {
      return normalizeWeather({
        windSpeedKmh: 22,
        windDirectionDeg: 0,
        gustIntensity: 0.05,
        ambientTempC: 16,
        clouds: [],
        wetZones: [],
        globalWetness: 0,
        presetName: 'best'
      });
    }

    const zeroAlpha = new Float64Array(N);
    const geom = computePathGeometry(stations, zeroAlpha);
    const { kappa, ds } = geom;

    // 1. Analytical estimate of dominant corner tangent vs straight tangent
    let cornerTx = 0;
    let cornerTy = 0;
    let straightTx = 0;
    let straightTy = 0;
    for (let i = 0; i < N; i++) {
      const absK = Math.abs(kappa[i]);
      const st = stations[i];
      if (absK > 0.005) {
        const w = absK * ds[i];
        cornerTx += st.tx * w;
        cornerTy += st.ty * w;
      } else if (absK < 0.0018) {
        straightTx += st.tx * ds[i];
        straightTy += st.ty * ds[i];
      }
    }

    // Wind blowing against dominant corner direction (-cornerT) and with straight (+straightT)
    const prefWx = straightTx - 1.8 * cornerTx;
    const prefWy = straightTy - 1.8 * cornerTy;
    let analyticalDirDeg = 0;
    if (Math.hypot(prefWx, prefWy) > 1e-3) {
      analyticalDirDeg = (((Math.atan2(prefWy, prefWx) * 180.0) / Math.PI) % 360 + 360) % 360;
    }

    // 2. Evaluate 16 candidate wind directions (+ analytical candidate) to guarantee fastest lap time
    const candidates = [analyticalDirDeg];
    for (let d = 0; d < 360; d += 22.5) {
      candidates.push(d);
    }

    let bestDirDeg = analyticalDirDeg;
    let bestLapTime = Infinity;

    for (let c = 0; c < candidates.length; c++) {
      const dirDeg = candidates[c];
      const candWeather = normalizeWeather({
        windSpeedKmh: 22,
        windDirectionDeg: dirDeg,
        gustIntensity: 0.05,
        ambientTempC: 16,
        clouds: [],
        wetZones: [],
        globalWetness: 0,
        presetName: 'best'
      });
      const res = evaluatePath(track, zeroAlpha, car, {
        _stations: stations,
        weather: candWeather,
        fastTimeOnly: true,
        skipCenterlineComparison: true
      });
      if (res.lapTime < bestLapTime) {
        bestLapTime = res.lapTime;
        bestDirDeg = dirDeg;
      }
    }

    return normalizeWeather({
      windSpeedKmh: 22,
      windDirectionDeg: Math.round(bestDirDeg) % 360,
      gustIntensity: 0.05,
      ambientTempC: 16,
      clouds: [],
      wetZones: [],
      globalWetness: 0,
      presetName: 'best'
    });
  }

  /**
   * Generate "Worst Conditions" Weather Preset for a given track and car.
   * Sets a punishing stormy gale crosswind/tailwind (windSpeedKmh: 78, direction aligned to give a
   * tailwind into the heaviest braking/cornering zones and destabilizing crosswinds through the
   * technical sector), hot thin air (38°C), high gusts (gustIntensity: 0.65), positions
   * 4 dense storm clouds directly over the key corner complexes of the track, and populates
   * 3 localized Wet Zones right under the primary storm clouds!
   *
   * @param {Object} track
   * @param {Object} [carParams]
   * @returns {Object}
   */
  function getWorstWeatherPreset(track, carParams) {
    const car = normalizeCarParams(carParams);
    const stations = extractTrackStations(track, car);
    const N = stations.length;

    if (N < 4) {
      return normalizeWeather({
        windSpeedKmh: 78,
        windDirectionDeg: 135,
        gustIntensity: 0.65,
        ambientTempC: 38,
        clouds: [],
        wetZones: [],
        globalWetness: 0,
        presetName: 'worst'
      });
    }

    const zeroAlpha = new Float64Array(N);
    const geom = computePathGeometry(stations, zeroAlpha);
    const { X, Y, s, kappa, totalLength } = geom;

    // 1. Identify the 4 most demanding corner complexes around the track to position storm clouds
    const scored = [];
    for (let i = 0; i < N; i++) {
      let kSum = 0;
      for (let d = -4; d <= 4; d++) {
        kSum += Math.abs(kappa[(i + d + N) % N]);
      }
      scored.push({
        index: i,
        x: X[i],
        y: Y[i],
        s: s[i],
        score: kSum / 9.0
      });
    }
    scored.sort((a, b) => b.score - a.score);

    const minCloudSpacing = Math.max(80.0, totalLength * 0.16);
    const selectedComplexes = [];
    for (let i = 0; i < scored.length && selectedComplexes.length < 4; i++) {
      const cand = scored[i];
      let tooClose = false;
      for (let j = 0; j < selectedComplexes.length; j++) {
        const existing = selectedComplexes[j];
        const dsWrap = Math.min(
          Math.abs(cand.s - existing.s),
          totalLength - Math.abs(cand.s - existing.s)
        );
        if (dsWrap < minCloudSpacing) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        selectedComplexes.push(cand);
      }
    }

    // Fallback if track has fewer than 4 separated peaks
    while (selectedComplexes.length < 4) {
      const idx = Math.floor((selectedComplexes.length * N) / 4) % N;
      selectedComplexes.push({
        index: idx,
        x: X[idx],
        y: Y[idx],
        s: s[idx],
        score: 0.01
      });
    }

    selectedComplexes.sort((a, b) => a.s - b.s);
    const cloudRadius = clamp(Math.round(totalLength * 0.048), 160, 260);
    const stormClouds = selectedComplexes.map((cplx, idx) => ({
      id: `storm-cloud-${idx + 1}`,
      x: Math.round(cplx.x * 10) / 10,
      y: Math.round(cplx.y * 10) / 10,
      radius: cloudRadius,
      density: clamp(0.92 - idx * 0.04, 0.78, 0.95),
      name: `Storm Cell ${idx + 1}`
    }));

    // 3 localized Wet Zones right under the primary storm clouds (radius ~210m, intensity 0.72..0.88)
    const wetRadius = clamp(Math.round(totalLength * 0.046), 175, 235);
    const stormWetZones = selectedComplexes.slice(0, 3).map((cplx, idx) => ({
      id: `storm-wet-${idx + 1}`,
      x: Math.round(cplx.x * 10) / 10,
      y: Math.round(cplx.y * 10) / 10,
      radius: wetRadius,
      intensity: clamp(0.88 - idx * 0.08, 0.72, 0.88),
      name: `Flooded Zone ${idx + 1}`
    }));

    // 2. Find the wind direction at 78 km/h that maximally penalizes braking & cornering
    let worstDirDeg = 135;
    let worstLapTime = -Infinity;

    for (let dirDeg = 0; dirDeg < 360; dirDeg += 22.5) {
      const candWeather = normalizeWeather({
        windSpeedKmh: 78,
        windDirectionDeg: dirDeg,
        gustIntensity: 0.65,
        ambientTempC: 38,
        clouds: stormClouds,
        wetZones: stormWetZones,
        globalWetness: 0,
        presetName: 'worst'
      });
      const res = evaluatePath(track, zeroAlpha, car, {
        _stations: stations,
        weather: candWeather,
        fastTimeOnly: true,
        skipCenterlineComparison: true
      });
      if (res.lapTime > worstLapTime) {
        worstLapTime = res.lapTime;
        worstDirDeg = dirDeg;
      }
    }

    return normalizeWeather({
      windSpeedKmh: 78,
      windDirectionDeg: Math.round(worstDirDeg) % 360,
      gustIntensity: 0.65,
      ambientTempC: 38,
      clouds: stormClouds,
      wetZones: stormWetZones,
      globalWetness: 0,
      presetName: 'worst'
    });
  }

  // ---------------------------------------------------------------------------
  // Public Classes & Namespace Exports
  // ---------------------------------------------------------------------------

  class PhysicsEngine {
    constructor(carParams) {
      this.carParams = normalizeCarParams(carParams);
    }

    setCarParams(carParams) {
      this.carParams = normalizeCarParams(carParams);
      return this.carParams;
    }

    evaluatePath(track, alphaArray, carParamsOverride, options) {
      return evaluatePath(track, alphaArray, carParamsOverride || this.carParams, options);
    }

    normalizeWeather(rawWeather) {
      return normalizeWeather(rawWeather);
    }

    recommendTireCompound(track, weather) {
      return recommendTireCompound(track, weather);
    }

    computeStationTireGrip(car, wetness, speedMs, alpha, bound, centerKappa) {
      return computeStationTireGrip(car || this.carParams, wetness, speedMs, alpha, bound, centerKappa);
    }

    getBestWeatherPreset(track, carParamsOverride) {
      return getBestWeatherPreset(track, carParamsOverride || this.carParams);
    }

    getWorstWeatherPreset(track, carParamsOverride) {
      return getWorstWeatherPreset(track, carParamsOverride || this.carParams);
    }

    getCalmWeatherPreset() {
      return getCalmWeatherPreset();
    }

    static normalizeCarParams(carParams) {
      return normalizeCarParams(carParams);
    }

    static normalizeWeather(rawWeather) {
      return normalizeWeather(rawWeather);
    }

    static recommendTireCompound(track, weather) {
      return recommendTireCompound(track, weather);
    }

    static computeStationTireGrip(car, wetness, speedMs, alpha, bound, centerKappa) {
      return computeStationTireGrip(normalizeCarParams(car), wetness, speedMs, alpha, bound, centerKappa);
    }

    static getBestWeatherPreset(track, carParams) {
      return getBestWeatherPreset(track, carParams);
    }

    static getWorstWeatherPreset(track, carParams) {
      return getWorstWeatherPreset(track, carParams);
    }

    static getCalmWeatherPreset() {
      return getCalmWeatherPreset();
    }

    static evaluatePath(track, alphaArray, carParams, options) {
      return evaluatePath(track, alphaArray, carParams, options);
    }

    static computePathGeometry(stations, alphaArray) {
      return computePathGeometry(stations, alphaArray);
    }

    static formatLapTime(seconds, forceMinutes) {
      return formatLapTime(seconds, forceMinutes);
    }
  }

  class RacingLineOptimizer {
    constructor(options = {}) {
      this.defaultIterations = options.iterations || 240;
      this.lastSession = null;
      this.lastResult = null;
    }

    solveInstant(track, carParams, options = {}) {
      const res = solveInstant(track, carParams, {
        iterations: this.defaultIterations,
        ...options
      });
      this.lastResult = res;
      return res;
    }

    solve(track, carParams, options = {}) {
      return this.solveInstant(track, carParams, options);
    }

    evaluatePath(track, alphaArray, carParams, options = {}) {
      return evaluatePath(track, alphaArray, carParams, options);
    }

    createOptimizationSession(track, carParams, options = {}) {
      this.lastSession = createOptimizationSession(track, carParams, {
        totalIterations: this.defaultIterations,
        ...options
      });
      return this.lastSession;
    }

    compareWithCenterline(track, carParams, options = {}) {
      return compareWithCenterline(track, carParams, options);
    }

    normalizeWeather(rawWeather) {
      return normalizeWeather(rawWeather);
    }

    recommendTireCompound(track, weather) {
      return recommendTireCompound(track, weather);
    }

    getBestWeatherPreset(track, carParams) {
      return getBestWeatherPreset(track, carParams);
    }

    getWorstWeatherPreset(track, carParams) {
      return getWorstWeatherPreset(track, carParams);
    }

    getCalmWeatherPreset() {
      return getCalmWeatherPreset();
    }

    formatLapTime(seconds, forceMinutes) {
      return formatLapTime(seconds, forceMinutes);
    }

    // Static convenience methods so callers can use either instance or class methods
    static solveInstant(track, carParams, options) {
      return solveInstant(track, carParams, options);
    }

    static solve(track, carParams, options) {
      return solveInstant(track, carParams, options);
    }

    static evaluatePath(track, alphaArray, carParams, options) {
      return evaluatePath(track, alphaArray, carParams, options);
    }

    static createOptimizationSession(track, carParams, options) {
      return createOptimizationSession(track, carParams, options);
    }

    static compareWithCenterline(track, carParams, options) {
      return compareWithCenterline(track, carParams, options);
    }

    static normalizeCarParams(carParams) {
      return normalizeCarParams(carParams);
    }

    static normalizeWeather(rawWeather) {
      return normalizeWeather(rawWeather);
    }

    static recommendTireCompound(track, weather) {
      return recommendTireCompound(track, weather);
    }

    static computeStationTireGrip(car, wetness, speedMs, alpha, bound, centerKappa) {
      return computeStationTireGrip(normalizeCarParams(car), wetness, speedMs, alpha, bound, centerKappa);
    }

    static getBestWeatherPreset(track, carParams) {
      return getBestWeatherPreset(track, carParams);
    }

    static getWorstWeatherPreset(track, carParams) {
      return getWorstWeatherPreset(track, carParams);
    }

    static getCalmWeatherPreset() {
      return getCalmWeatherPreset();
    }

    static formatLapTime(seconds, forceMinutes) {
      return formatLapTime(seconds, forceMinutes);
    }
  }

  window.App.DEFAULT_TIRE_PRESETS = DEFAULT_TIRE_PRESETS;
  window.App.PhysicsEngine = PhysicsEngine;
  window.App.RacingLineOptimizer = RacingLineOptimizer;
  window.App.formatLapTime = formatLapTime;
})();
