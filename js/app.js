/**
 * app.js
 * Main Application Controller, Interactive Track Editor, Real-Time 60fps Lap Simulator,
 * and Vehicle Physics Engineering Lab for APEX//AI.
 */
(function () {
  'use strict';

  window.App = window.App || {};

  // ===========================================================================
  // UTILITY HELPERS
  // ===========================================================================

  function clamp(val, min, max) {
    return val < min ? min : (val > max ? max : val);
  }

  function formatLapTime(seconds, forceMinutes = true) {
    if (window.App.formatLapTime) {
      return window.App.formatLapTime(seconds, forceMinutes);
    }
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00.000';
    const totalMs = Math.round(seconds * 1000);
    const mins = Math.floor(totalMs / 60000);
    const remMs = totalMs % 60000;
    const secs = Math.floor(remMs / 1000);
    const ms = remMs % 1000;
    const msStr = String(ms).padStart(3, '0');
    if (mins > 0 || forceMinutes) {
      return `${mins}:${String(secs).padStart(2, '0')}.${msStr}`;
    }
    return `${secs}.${msStr}`;
  }

  function formatNumber(num, decimals = 0) {
    if (!Number.isFinite(num)) return '0';
    return Number(num).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  /**
   * Normalize result object from RacingLineOptimizer so all expected field aliases exist
   */
  function normalizeResult(res, carParams) {
    if (!res) return null;
    if (!res.samples && Array.isArray(res.telemetry)) {
      res.samples = res.telemetry;
    }
    if (!res.telemetry && Array.isArray(res.samples)) {
      res.telemetry = res.samples;
    }
    if (!res.points && Array.isArray(res.samples)) {
      res.points = res.samples;
    }
    if (carParams) {
      res.color = carParams.color || '#06b6d4';
      res.carName = carParams.name || 'Car';
      res.car = carParams;
    }
    // Clear cached normalization when result updates
    delete res._normalized;
    return res;
  }

  /**
   * Normalize return value from track.getClosestNode(wx, wy, maxDist)
   * which could be an integer index (-1 if none) or an object { index, dist, node }
   */
  function extractNodeIndex(hit) {
    if (typeof hit === 'number') {
      return hit >= 0 ? hit : -1;
    }
    if (hit && typeof hit === 'object') {
      if (typeof hit.index === 'number') return hit.index;
      if (typeof hit.nodeIndex === 'number') return hit.nodeIndex;
    }
    return -1;
  }

  /**
   * Format wind direction angle (0..360 deg, 0 = East/+X, 90 = South/+Y) with cardinal label
   */
  function formatWindDirection(deg) {
    const norm = ((Math.round(Number(deg) || 0) % 360) + 360) % 360;
    const cardinals = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    const idx = Math.round(norm / 45) % 8;
    return `${norm}° ${cardinals[idx]}`;
  }

  /**
   * Authentic Pirelli F1 Tire Compound Presets (fallback if presets.js hasn't registered them yet)
   */
  const DEFAULT_TIRE_PRESETS = {
    c1: {
      id: 'c1',
      code: 'C1',
      name: 'Pirelli P Zero C1 (Hard)',
      shortName: 'C1 HARD',
      color: '#f8fafc',
      softness: 0.15,
      treadDepthMm: 0.0,
      defaultPressurePsi: 23.5,
      description: 'Pirelli P Zero C1 (Hard) • Dry Slick (0.0 mm tread)'
    },
    c2: {
      id: 'c2',
      code: 'C2',
      name: 'Pirelli P Zero C2 (Med-Hard)',
      shortName: 'C2 MED-HARD',
      color: '#cbd5e1',
      softness: 0.32,
      treadDepthMm: 0.0,
      defaultPressurePsi: 23.0,
      description: 'Pirelli P Zero C2 (Med-Hard) • Dry Slick (0.0 mm tread)'
    },
    c3: {
      id: 'c3',
      code: 'C3',
      name: 'Pirelli P Zero C3 (Medium)',
      shortName: 'C3 MED',
      color: '#facc15',
      softness: 0.50,
      treadDepthMm: 0.0,
      defaultPressurePsi: 22.5,
      description: 'Pirelli P Zero C3 (Medium) • Dry Slick (0.0 mm tread)'
    },
    c4: {
      id: 'c4',
      code: 'C4',
      name: 'Pirelli P Zero C4 (Soft)',
      shortName: 'C4 SOFT',
      color: '#ef4444',
      softness: 0.75,
      treadDepthMm: 0.0,
      defaultPressurePsi: 22.0,
      description: 'Pirelli P Zero C4 (Soft) • Dry Slick (0.0 mm tread)'
    },
    c5: {
      id: 'c5',
      code: 'C5',
      name: 'Pirelli P Zero C5 (Quali Soft)',
      shortName: 'C5 SOFT',
      color: '#f43f5e',
      softness: 0.95,
      treadDepthMm: 0.0,
      defaultPressurePsi: 21.5,
      description: 'Pirelli P Zero C5 (Quali) • Dry Slick (0.0 mm tread)'
    },
    inter: {
      id: 'inter',
      code: 'INT',
      name: 'Pirelli Cinturato Intermediate',
      shortName: 'INT (GREEN)',
      color: '#22c55e',
      softness: 0.65,
      treadDepthMm: 3.0,
      defaultPressurePsi: 20.5,
      description: 'Pirelli Cinturato Green (Inter) • 3.0 mm tread (~35 L/s disp.)'
    },
    wet: {
      id: 'wet',
      code: 'WET',
      name: 'Pirelli Cinturato Full Wet',
      shortName: 'WET (BLUE)',
      color: '#3b82f6',
      softness: 0.80,
      treadDepthMm: 6.5,
      defaultPressurePsi: 19.5,
      description: 'Pirelli Cinturato Blue (Full Wet) • 6.5 mm tread (~85 L/s disp.)'
    }
  };

  window.App.TIRE_PRESETS = window.App.TIRE_PRESETS || DEFAULT_TIRE_PRESETS;

  function formatWetIntensityLabel(pct) {
    const p = Math.round(Number(pct) || 0);
    if (p < 35) return `${p}% (Damp)`;
    if (p <= 65) return `${p}% (Wet)`;
    if (p <= 85) return `${p}% (Heavy Wet)`;
    return `${p}% (Flooded)`;
  }

  function formatSoftnessLabel(pct) {
    const p = Math.round(Number(pct) || 0);
    if (p < 24) return `${p}% Hard`;
    if (p < 42) return `${p}% Med-Hard`;
    if (p < 62) return `${p}% Medium`;
    if (p < 84) return `${p}% Soft`;
    return `${p}% Quali`;
  }

  function formatTreadDepthLabel(mm) {
    const d = Number(mm) || 0;
    if (d <= 0.1) return `${d.toFixed(1)} mm (Slick)`;
    if (d <= 4.2) return `${d.toFixed(1)} mm (Inter)`;
    return `${d.toFixed(1)} mm (Full Wet)`;
  }

  // ===========================================================================
  // MAIN APPLICATION CONTROLLER
  // ===========================================================================

  class ApexSimulatorApp {
    constructor() {
      // Core instances
      this.track = null;
      this.optimizer = null;
      this.trackRenderer = null;
      this.telemetryRenderer = null;

      // Active presets & vehicle setup
      this.activeTrackKey = 'spa_francorchamps';
      this.activeCarKey = 'f1';
      this.activeGhostKey = 'none';
      this.carParams = {};
      this.ghostCarParams = null;

      // Weather & Wind Simulation Lab state
      this.weather = {
        windSpeedKmh: 0,
        windDirectionDeg: 0,
        gustIntensity: 0.15,
        ambientTempC: 20,
        clouds: [],
        selectedCloudIndex: -1,
        hoveredCloudIndex: -1,
        wetZones: [],
        globalWetness: 0,
        selectedWetZoneIndex: -1,
        hoveredWetZoneIndex: -1,
        defaultWetIntensity: 0.75
      };
      this.isDraggingCompass = false;
      this.draggingCloudIndex = -1;
      this.cloudDragOffset = { x: 0, y: 0 };
      this.draggingWetZoneIndex = -1;
      this.wetZoneDragOffset = { x: 0, y: 0 };
      this.recommendedTireId = 'c3';

      // Solver results
      this.optimalResult = null;
      this.centerlineResult = null;
      this.dryReferenceResult = null;
      this.ghostResult = null;
      this.progressiveSession = null;

      // Progressive AI animation state
      this.isOptimizing = false;
      this.optimizationProgress = 1.0;

      // Real-time simulation state
      this.isPlaying = true;
      this.simSpeed = 1.0;
      this.simTime = 0.0;
      this.lastFrameTime = performance.now();
      this.followCar = false;
      this.carTrail = [];

      // Editor & interaction state
      this.editorTool = 'select'; // 'select' | 'add_spline' | 'add_straight' | 'delete' | 'place_cloud' | 'place_wet'
      this.editorState = {
        activeTool: 'select'
      };
      this.isCustomDrawing = false;
      this.selectedNodeIndex = 0;
      this.hoveredNodeIndex = -1;
      this.draggingNodeIndex = -1;
      this.isPanning = false;
      this.spacePressed = false;
      this.panStartScreen = { x: 0, y: 0 };
      this.panStartCam = { x: 0, y: 0 };
      this.hoverSegmentPreview = null;
      this.hoveredStationIndex = null;
      this.hoverTelemetryDistance = null;

      // Layer visibility & color mode
      this.colorMode = 'pedals'; // 'pedals' | 'speed' | 'grip' | 'gforce' | 'wetness'
      this.showNodes = true;
      this.showApexes = false;
      this.showCenterline = false;
      this.showDryLine = true;
      this.showGhostLine = true;
      this.showVectors = false;
      this.showTelemetry = false;
      this.viewOptions = {
        showDryLine: true
      };

      // Throttle timer for heavy ghost recalculations during node drag
      this._dragGhostTimer = null;
    }

    init() {
      this.initModules();
      this.buildCarPresetCards();
      this.loadCarPreset(this.activeCarKey, false);
      this.loadTrackPreset(this.activeTrackKey);
      this.syncWeatherUI();
      this.bindUIEvents();
      this.bindCanvasEvents();
      this.bindKeyboardEvents();

      // Initial resize and camera fit
      this.handleResize();
      this.fitCameraToTrack();
      window.addEventListener('resize', () => this.handleResize());

      // Start 60fps main loop
      this.lastFrameTime = performance.now();
      requestAnimationFrame((ts) => this.tick(ts));
    }

    initModules() {
      // 1. Track instance
      if (typeof window.App.Track === 'function') {
        this.track = new window.App.Track(this.activeTrackKey);
      } else {
        console.error('window.App.Track not found.');
      }

      // 2. Optimizer instance
      if (typeof window.App.RacingLineOptimizer === 'function') {
        this.optimizer = new window.App.RacingLineOptimizer({ iterations: 240 });
      } else if (window.App.RacingLineOptimizer) {
        this.optimizer = window.App.RacingLineOptimizer;
      }

      // 3. TrackRenderer instance
      const trackCanvas = document.getElementById('track-canvas');
      if (typeof window.App.TrackRenderer === 'function' && trackCanvas) {
        this.trackRenderer = new window.App.TrackRenderer(trackCanvas);
      }

      // 4. TelemetryRenderer instance
      const telemetryCanvas = document.getElementById('telemetry-canvas');
      const ggCanvas = document.getElementById('gg-canvas');
      if (typeof window.App.TelemetryRenderer === 'function' && telemetryCanvas && ggCanvas) {
        this.telemetryRenderer = new window.App.TelemetryRenderer(
          telemetryCanvas,
          ggCanvas,
          {
            onHoverStation: (stationIdx, stationObj) => {
              this.handleTelemetryHover(stationIdx, stationObj);
            }
          }
        );

        // Allow clicking on telemetry chart to scrub vehicle simulation time
        telemetryCanvas.addEventListener('mousedown', () => {
          if (this.hoveredStationIndex !== null && this.optimalResult?.samples?.[this.hoveredStationIndex]) {
            const st = this.optimalResult.samples[this.hoveredStationIndex];
            if (Number.isFinite(st.time)) {
              this.simTime = st.time;
              this.trackRenderer?.clearTrails?.();
            }
          }
        });
      }
    }

    // =========================================================================
    // VEHICLE PRESETS & CUSTOM SLIDERS
    // =========================================================================

    buildCarPresetCards() {
      const grid = document.getElementById('car-preset-grid');
      if (!grid) return;
      const presets = window.App.CAR_PRESETS || {};
      const keys = Object.keys(presets);

      grid.innerHTML = '';
      keys.forEach((key) => {
        const car = presets[key];
        const kw = Math.round(car.powerKW || car.powerKw || (car.power ? car.power / 1000 : 300));
        const hp = Math.round(car.powerHp || kw * 1.341);
        const btn = document.createElement('button');
        btn.className = `car-preset-card ${key === this.activeCarKey ? 'active' : ''}`;
        btn.dataset.carKey = key;
        btn.style.setProperty('--car-color', car.color || '#ef4444');
        btn.title = car.description || car.subtitle || car.name;

        btn.innerHTML = `
          <div class="preset-card-top">
            <span class="preset-name">${car.name}</span>
          </div>
          <div class="preset-specs">${hp} HP • ${car.mass} kg • ${car.drivetrain || 'RWD'}</div>
        `;

        btn.addEventListener('click', () => {
          this.loadCarPreset(key, true);
        });

        grid.appendChild(btn);
      });
    }

    loadCarPreset(presetKey, solveNow = true) {
      const presets = window.App.CAR_PRESETS || {};
      const preset = presets[presetKey] || presets.f1 || Object.values(presets)[0];
      if (!preset) return;

      this.activeCarKey = presetKey;
      const kw = Math.round(preset.powerKW ?? preset.powerKw ?? (preset.power ? preset.power / 1000 : 500));
      const aggressionPct = preset.cornerAggression !== undefined
        ? Math.round(preset.cornerAggression * 100)
        : (preset.cornerWeightPenalty !== undefined ? Math.round(preset.cornerWeightPenalty * 100) : 70);

      this.carParams = {
        ...preset,
        powerKW: kw,
        powerKw: kw,
        power: kw * 1000,
        cornerAggression: aggressionPct / 100,
        cornerWeightPenalty: aggressionPct / 100
      };

      // Update active card styling
      document.querySelectorAll('.car-preset-card').forEach((card) => {
        card.classList.toggle('active', card.dataset.carKey === presetKey);
      });

      // Update category badge & HUD header
      const catBadge = document.getElementById('active-car-category');
      if (catBadge) catBadge.textContent = (preset.category || preset.drivetrain || 'SPEC').toUpperCase();

      const hudName = document.getElementById('hud-car-name');
      if (hudName) hudName.textContent = (preset.name || 'PRIMARY CAR').toUpperCase();

      const hudDot = document.getElementById('hud-car-dot');
      if (hudDot) {
        hudDot.style.background = preset.color || '#ef4444';
        hudDot.style.boxShadow = `0 0 8px ${preset.color || '#ef4444'}`;
      }

      this.trackRenderer?.clearTrails?.();
      const initialTire = preset.tireCompound || this.carParams.tireCompound || 'c3';
      this.selectTireCompound(initialTire, false);
      this.syncSlidersFromCarParams();
      if (solveNow) {
        this.runInstantOptimization();
      }
    }

    selectTireCompound(compoundId, solveNow = true) {
      const id = String(compoundId || 'c3').toLowerCase();
      const tireMap = window.App.TIRE_PRESETS || DEFAULT_TIRE_PRESETS;
      const preset = tireMap[id] || DEFAULT_TIRE_PRESETS[id] || DEFAULT_TIRE_PRESETS.c3;
      if (!preset) return;

      const rawSoftness = Number(preset.softness ?? 0.5);
      const softnessUnit = rawSoftness > 1.0 ? clamp(rawSoftness / 100, 0, 1) : clamp(rawSoftness, 0, 1);
      const softnessPct = Math.round(softnessUnit * 100);
      const treadMm = clamp(Number(preset.treadDepthMm ?? 0.0), 0.0, 8.0);
      const pressurePsi = clamp(Number(preset.defaultPressurePsi ?? preset.tirePressurePsi ?? 22.5), 16.0, 30.0);

      this.carParams.tireCompound = id;
      this.carParams.tireColor = preset.color || '#facc15';
      this.carParams.compoundSoftness = preset.softness !== undefined ? preset.softness : softnessUnit;
      this.carParams.treadDepthMm = treadMm;
      this.carParams.tirePressurePsi = pressurePsi;

      // Update active button in #tire-preset-strip
      document.querySelectorAll('#tire-preset-strip .tire-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tire === id);
      });

      // Update description line
      this.updateTireCompoundDescription(preset);

      // Sync custom tire sliders
      this.setSliderValue('param-tire-softness', softnessPct, formatSoftnessLabel(softnessPct), 'val-tire-softness');
      this.setSliderValue('param-tire-tread', treadMm, formatTreadDepthLabel(treadMm), 'val-tire-tread');
      this.setSliderValue('param-tire-pressure', pressurePsi, `${pressurePsi.toFixed(1)} PSI`, 'val-tire-pressure');

      if (solveNow) {
        this.runInstantOptimization(false);
      }
    }

    updateTireCompoundDescription(presetOverride = null) {
      const descEl = document.getElementById('tire-compound-desc');
      if (!descEl) return;

      const id = this.carParams.tireCompound || 'c3';
      const tireMap = window.App.TIRE_PRESETS || DEFAULT_TIRE_PRESETS;
      const preset = presetOverride || tireMap[id] || DEFAULT_TIRE_PRESETS[id] || DEFAULT_TIRE_PRESETS.c3;
      const tread = Number(this.carParams.treadDepthMm ?? preset?.treadDepthMm ?? 0);
      const name = preset?.name || 'Custom Pirelli Compound';

      if (tread <= 0.1) {
        descEl.textContent = `${name} • Dry Slick (${tread.toFixed(1)} mm tread)`;
      } else {
        const lps = preset?.waterClearanceLps && Math.abs(tread - (preset.treadDepthMm ?? 0)) < 0.2
          ? preset.waterClearanceLps
          : Math.round(tread * 10.5);
        descEl.textContent = `${name} • ${tread.toFixed(1)} mm tread (${lps} L/s disp.)`;
      }
      if (preset?.description) {
        descEl.title = preset.description;
      }
    }

    syncSlidersFromCarParams() {
      const p = this.carParams;
      const kw = Math.round(p.powerKW ?? p.powerKw ?? 500);
      const biasPct = (p.brakeBias <= 1 ? p.brakeBias * 100 : p.brakeBias);
      const aggrPct = p.cornerAggression !== undefined
        ? Math.round(p.cornerAggression * 100)
        : Math.round((p.cornerWeightPenalty ?? 0.65) * 100);

      this.setSliderValue('param-mass', p.mass, `${Math.round(p.mass)} kg`, 'val-mass');
      this.setSliderValue('param-power', kw, `${kw} kW (${Math.round(kw * 1.341)} HP)`, 'val-power');
      this.setSliderValue('param-topspeed', p.topSpeedKmh, `${Math.round(p.topSpeedKmh)} km/h`, 'val-topspeed');
      this.setSliderValue('param-mu', p.mu, `${Number(p.mu).toFixed(2)} μ`, 'val-mu');
      this.setSliderValue('param-cg', p.cgHeight, `${Number(p.cgHeight).toFixed(2)} m`, 'val-cg');
      this.setSliderValue('param-aggression', aggrPct, `${aggrPct}%`, 'val-aggression');
      this.setSliderValue('param-cl', p.Cl, Number(p.Cl).toFixed(2), 'val-cl');
      this.setSliderValue('param-cd', p.Cd, Number(p.Cd).toFixed(2), 'val-cd');
      this.setSliderValue('param-brake', p.maxBrakeForce, `${formatNumber(p.maxBrakeForce)} N`, 'val-brake');
      this.setSliderValue('param-bias', biasPct, `${Number(biasPct).toFixed(1)}%`, 'val-bias');

      // Sync custom tire sliders
      const rawSoft = Number(p.compoundSoftness ?? 0.5);
      const softPct = Math.round(rawSoft <= 1.0 ? rawSoft * 100 : rawSoft);
      const treadMm = Number(p.treadDepthMm ?? 0.0);
      const pressurePsi = Number(p.tirePressurePsi ?? 22.5);

      this.setSliderValue('param-tire-softness', softPct, formatSoftnessLabel(softPct), 'val-tire-softness');
      this.setSliderValue('param-tire-tread', treadMm, formatTreadDepthLabel(treadMm), 'val-tire-tread');
      this.setSliderValue('param-tire-pressure', pressurePsi, `${pressurePsi.toFixed(1)} PSI`, 'val-tire-pressure');
      this.updateTireCompoundDescription();
    }

    setSliderValue(sliderId, val, text, labelId) {
      const slider = document.getElementById(sliderId);
      if (slider && Number.isFinite(val)) {
        slider.value = val;
      }
      const label = document.getElementById(labelId);
      if (label) {
        label.textContent = text;
      }
    }

    readTireSliders(fastDragMode = true) {
      const softPct = clamp(parseFloat(document.getElementById('param-tire-softness')?.value ?? 50), 0, 100);
      const treadMm = clamp(parseFloat(document.getElementById('param-tire-tread')?.value ?? 0.0), 0.0, 8.0);
      const pressurePsi = clamp(parseFloat(document.getElementById('param-tire-pressure')?.value ?? 22.5), 16.0, 30.0);

      const tireMap = window.App.TIRE_PRESETS || DEFAULT_TIRE_PRESETS;
      const sampleSoft = tireMap.c3?.softness ?? 0.5;
      const usesUnitScale = sampleSoft <= 1.0;

      this.carParams.compoundSoftness = usesUnitScale ? (softPct / 100) : softPct;
      this.carParams.treadDepthMm = treadMm;
      this.carParams.tirePressurePsi = pressurePsi;

      this.setSliderValue('param-tire-softness', softPct, formatSoftnessLabel(softPct), 'val-tire-softness');
      this.setSliderValue('param-tire-tread', treadMm, formatTreadDepthLabel(treadMm), 'val-tire-tread');
      this.setSliderValue('param-tire-pressure', pressurePsi, `${pressurePsi.toFixed(1)} PSI`, 'val-tire-pressure');
      this.updateTireCompoundDescription();
      this.runInstantOptimization(fastDragMode);
    }

    readCarParamsFromSliders() {
      const mass = parseFloat(document.getElementById('param-mass')?.value || 798);
      const powerKW = parseFloat(document.getElementById('param-power')?.value || 745);
      const topSpeedKmh = parseFloat(document.getElementById('param-topspeed')?.value || 355);
      const mu = parseFloat(document.getElementById('param-mu')?.value || 2.0);
      const cgHeight = parseFloat(document.getElementById('param-cg')?.value || 0.28);
      const aggrPct = parseFloat(document.getElementById('param-aggression')?.value || 75);
      const Cl = parseFloat(document.getElementById('param-cl')?.value || 3.5);
      const Cd = parseFloat(document.getElementById('param-cd')?.value || 0.88);
      const maxBrakeForce = parseFloat(document.getElementById('param-brake')?.value || 32000);
      const biasPct = parseFloat(document.getElementById('param-bias')?.value || 58);

      // Update front/rear grip proportionally to base mu
      const baseRatioF = (this.carParams.tireGripFront && this.carParams.mu)
        ? (this.carParams.tireGripFront / this.carParams.mu)
        : 1.0;
      const baseRatioR = (this.carParams.tireGripRear && this.carParams.mu)
        ? (this.carParams.tireGripRear / this.carParams.mu)
        : 1.0;

      this.carParams = {
        ...this.carParams,
        mass,
        powerKW,
        powerKw: powerKW,
        power: powerKW * 1000,
        powerHp: Math.round(powerKW * 1.341),
        topSpeedKmh,
        mu,
        tireGripFront: mu * baseRatioF,
        tireGripRear: mu * baseRatioR,
        cgHeight,
        cornerAggression: clamp(aggrPct / 100, 0, 1),
        cornerWeightPenalty: clamp(aggrPct / 100, 0, 1),
        Cl,
        Cd,
        maxBrakeForce,
        brakeBias: biasPct / 100
      };

      this.syncSlidersFromCarParams();
      this.runInstantOptimization();
    }

    // =========================================================================
    // TRACK LOADING, EDITING & OPERATIONS
    // =========================================================================

    loadTrackPreset(presetKey) {
      if (!this.track) return;
      this.stopProgressiveOptimization();

      if (presetKey === 'custom_blank') {
        this.enterCustomDrawMode();
        return;
      }

      this.isCustomDrawing = false;
      const banner = document.getElementById('custom-draw-banner');
      if (banner) banner.classList.add('hidden');

      this.activeTrackKey = presetKey;
      const presetData = window.App.TRACK_PRESETS?.[presetKey];

      if (typeof this.track.loadPreset === 'function') {
        this.track.loadPreset(presetKey, presetData);
      } else if (presetData && typeof this.track.fromJSON === 'function') {
        this.track.fromJSON(presetData);
      }

      // Select first node by default
      this.selectedNodeIndex = (this.track.nodes && this.track.nodes.length > 0) ? 0 : -1;
      this.carTrail = [];
      this.simTime = 0;
      this.trackRenderer?.clearTrails?.();

      // Sync dropdown
      const sel = document.getElementById('track-preset-select');
      if (sel && sel.value !== presetKey) {
        sel.value = presetKey;
      }

      this.fitCameraToTrack();
      this.updateNodeInspectorUI();
      this.runInstantOptimization();
      const hadClouds = Array.isArray(this.weather?.clouds) && this.weather.clouds.length > 0;
      const hadWetZones = Array.isArray(this.weather?.wetZones) && this.weather.wetZones.length > 0;
      if (hadClouds || hadWetZones) {
        if (hadClouds) {
          this.weather.clouds = this.buildCornerStormClouds(this.weather.clouds.length);
          this.weather.selectedCloudIndex = -1;
          this.weather.hoveredCloudIndex = -1;
        }
        if (hadWetZones) {
          this.weather.wetZones = this.buildCornerWetZones(this.weather.wetZones.length);
          this.weather.selectedWetZoneIndex = -1;
          this.weather.hoveredWetZoneIndex = -1;
        }
        this.syncWeatherUI();
        this.runInstantOptimization();
      }
    }

    enterCustomDrawMode() {
      if (!this.track) return;
      this.stopProgressiveOptimization();
      this.isCustomDrawing = true;
      this.activeTrackKey = 'custom_blank';

      // Clear track nodes for custom drawing
      this.track.nodes = [];
      this.track.samples = [];
      this.track.totalLength = 0;
      this.trackRenderer?.clearTrails?.();

      this.selectedNodeIndex = -1;
      this.optimalResult = null;
      this.centerlineResult = null;
      this.ghostResult = null;
      this.carTrail = [];

      // Switch tool to add_spline automatically
      this.setEditorTool('add_spline');

      const banner = document.getElementById('custom-draw-banner');
      if (banner) banner.classList.remove('hidden');

      const sel = document.getElementById('track-preset-select');
      if (sel) sel.value = 'custom_blank';

      // Reset camera to origin with comfortable zoom
      if (this.trackRenderer) {
        this.trackRenderer.camX = 0;
        this.trackRenderer.camY = 0;
        this.trackRenderer.zoom = 1.1;
      }

      this.updateNodeInspectorUI();
      this.updateTrackStatsUI();
    }

    finishCustomDrawMode() {
      this.isCustomDrawing = false;
      const banner = document.getElementById('custom-draw-banner');
      if (banner) banner.classList.add('hidden');
      this.setEditorTool('select');
      if (this.track && this.track.nodes.length >= 3) {
        this.track.rebuild?.();
        this.fitCameraToTrack();
        this.runInstantOptimization();
      }
    }

    fitCameraToTrack() {
      if (this.trackRenderer && typeof this.trackRenderer.fitToTrack === 'function' && this.track) {
        this.trackRenderer.fitToTrack(this.track, 65);
      }
    }

    setEditorTool(toolName) {
      this.editorTool = toolName;
      if (!this.editorState) this.editorState = {};
      this.editorState.activeTool = toolName;

      document.querySelectorAll('.tool-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tool === toolName);
      });
      const placeCloudBtn = document.getElementById('btn-place-cloud');
      if (placeCloudBtn) {
        placeCloudBtn.classList.toggle('active', toolName === 'place_cloud');
      }
      const placeWetBtn = document.getElementById('btn-place-wet');
      if (placeWetBtn) {
        placeWetBtn.classList.toggle('active', toolName === 'place_wet');
      }

      const badge = document.getElementById('active-tool-badge');
      const hint = document.getElementById('hud-hint-text');
      const canvas = document.getElementById('track-canvas');

      const toolDescriptions = {
        select: {
          badge: 'SELECT / MOVE',
          hint: 'Drag nodes to reshape track • Shift+Click node to toggle Spline/Straight • Scroll to zoom, Right-drag to pan',
          cursor: 'grab'
        },
        add_spline: {
          badge: 'ADD CURVE NODE',
          hint: 'Click along track or canvas to insert a smooth Catmull-Rom spline control point • Right-drag to pan',
          cursor: 'crosshair'
        },
        add_straight: {
          badge: 'ADD STRAIGHT NODE',
          hint: 'Click along track or canvas to insert a linear straight-segment vertex • Right-drag to pan',
          cursor: 'crosshair'
        },
        delete: {
          badge: 'DELETE NODE',
          hint: 'Click any control node, wet zone, or cloud cell to delete it',
          cursor: 'pointer'
        },
        place_cloud: {
          badge: 'PLACE / MOVE CLOUDS',
          hint: 'Click canvas to place volumetric cloud cell • Drag existing cloud to move • Right-click or Delete to remove cloud',
          cursor: 'crosshair'
        },
        place_wet: {
          badge: 'PLACE / MOVE WET ZONES',
          hint: 'Click track to place a localized wet zone • Drag existing wet zone to move • Right-click or Delete to remove',
          cursor: 'crosshair'
        }
      };

      const info = toolDescriptions[toolName] || toolDescriptions.select;
      if (badge) badge.textContent = info.badge;
      if (hint) hint.textContent = info.hint;
      if (canvas) canvas.style.cursor = info.cursor;
    }

    updateNodeInspectorUI() {
      const countBadge = document.getElementById('node-count-badge');
      const nodeCount = this.track?.nodes?.length || 0;
      if (countBadge) {
        countBadge.textContent = `${nodeCount} NODES`;
      }

      const idBadge = document.getElementById('inspector-node-id');
      const btnSpline = document.getElementById('btn-node-spline');
      const btnStraight = document.getElementById('btn-node-straight');
      const widthSlider = document.getElementById('slider-node-width');
      const widthVal = document.getElementById('val-node-width');

      if (this.selectedNodeIndex < 0 || !this.track?.nodes?.[this.selectedNodeIndex]) {
        if (idBadge) idBadge.textContent = 'NONE';
        return;
      }

      const node = this.track.nodes[this.selectedNodeIndex];
      const mode = node.mode || 'spline';
      const w = Number(node.width || 14);

      if (idBadge) idBadge.textContent = `NODE #${this.selectedNodeIndex + 1}`;
      if (btnSpline) btnSpline.classList.toggle('active', mode === 'spline');
      if (btnStraight) btnStraight.classList.toggle('active', mode === 'straight');
      if (widthSlider) widthSlider.value = w;
      if (widthVal) widthVal.textContent = `${w.toFixed(1)} m`;
    }

    // =========================================================================
    // WEATHER & WIND SIMULATION LAB
    // =========================================================================

    syncWeatherUI() {
      this.syncWeatherControlsUI();
    }

    syncWeatherControlsUI() {
      const ws = Math.round(Number(this.weather.windSpeedKmh) || 0);
      const wd = ((Math.round(Number(this.weather.windDirectionDeg) || 0) % 360) + 360) % 360;
      this.weather.windSpeedKmh = ws;
      this.weather.windDirectionDeg = wd;

      this.setSliderValue('slider-wind-speed', ws, `${ws} km/h`, 'val-wind-speed');
      this.setSliderValue('slider-wind-dir', wd, formatWindDirection(wd), 'val-wind-dir');

      const cloudBadge = document.getElementById('cloud-count-badge');
      const cLen = Array.isArray(this.weather.clouds) ? this.weather.clouds.length : 0;
      if (cloudBadge) {
        cloudBadge.textContent = `${cLen} CLOUD${cLen === 1 ? '' : 'S'}`;
      }

      const wetZones = Array.isArray(this.weather.wetZones) ? this.weather.wetZones : [];
      const wetBadge = document.getElementById('wet-count-badge');
      if (wetBadge) {
        wetBadge.textContent = `${wetZones.length} WET ZONES`;
      }

      // Sync wet intensity slider with selected wet zone or defaultWetIntensity
      const selWetIdx = this.weather.selectedWetZoneIndex;
      const activeWetZone = (selWetIdx >= 0 && wetZones[selWetIdx]) ? wetZones[selWetIdx] : null;
      const rawIntensity = activeWetZone
        ? Number(activeWetZone.intensity ?? activeWetZone.wetness ?? this.weather.defaultWetIntensity ?? 0.75)
        : Number(this.weather.defaultWetIntensity ?? 0.75);
      const intensityPct = clamp(Math.round((rawIntensity <= 1.0 ? rawIntensity * 100 : rawIntensity) / 5) * 5, 10, 100);
      this.setSliderValue('slider-wet-intensity', intensityPct, formatWetIntensityLabel(intensityPct), 'val-wet-intensity');

      const chkDryLine = document.getElementById('chk-show-dry-line');
      if (chkDryLine) {
        chkDryLine.checked = Boolean(this.viewOptions?.showDryLine ?? this.showDryLine);
      }

      this.updateWeatherStatsUI();
    }

    updateRecommendedTireBadge() {
      const recBadge = document.getElementById('tire-rec-badge');
      if (!recBadge) return;

      const res = this.optimalResult;
      const wetZones = Array.isArray(this.weather?.wetZones) ? this.weather.wetZones : [];
      const globalWet = Number(this.weather?.globalWetness) || 0;
      const summaryRec = res?.weatherSummary?.recommendedTire || res?.weatherStats?.recommendedTire;

      let recId = 'c3';
      let recLabel = 'REC: C3 MED';

      if (summaryRec) {
        const sLower = String(summaryRec).toLowerCase();
        if (sLower.includes('wet') && !sLower.includes('inter')) {
          recId = 'wet';
          recLabel = 'REC: WET (BLUE)';
        } else if (sLower.includes('int')) {
          recId = 'inter';
          recLabel = 'REC: INT (GREEN)';
        } else if (sLower.includes('c5')) {
          recId = 'c5';
          recLabel = 'REC: C5 SOFT';
        } else if (sLower.includes('c4')) {
          recId = 'c4';
          recLabel = 'REC: C4 SOFT';
        } else if (sLower.includes('c2')) {
          recId = 'c2';
          recLabel = 'REC: C2 HARD';
        } else if (sLower.includes('c1')) {
          recId = 'c1';
          recLabel = 'REC: C1 HARD';
        } else {
          recId = 'c3';
          recLabel = 'REC: C3 MED';
        }
      } else if (wetZones.length > 0 || globalWet > 0.05) {
        let maxInt = globalWet;
        let sumInt = 0;
        for (let i = 0; i < wetZones.length; i++) {
          const zInt = Number(wetZones[i].intensity ?? wetZones[i].wetness ?? 0.75);
          if (zInt > maxInt) maxInt = zInt;
          sumInt += zInt;
        }
        const avgInt = wetZones.length > 0 ? sumInt / wetZones.length : globalWet;
        if (maxInt >= 0.80 && (wetZones.length >= 2 || avgInt >= 0.80 || globalWet >= 0.65)) {
          recId = 'wet';
          recLabel = 'REC: WET (BLUE)';
        } else {
          recId = 'inter';
          recLabel = 'REC: INT (GREEN)';
        }
      } else {
        const tempC = Number(this.weather?.ambientTempC ?? 20);
        if (tempC <= 18) {
          recId = 'c5';
          recLabel = 'REC: C5 SOFT';
        } else if (tempC <= 26) {
          recId = 'c4';
          recLabel = 'REC: C4 SOFT';
        } else {
          recId = 'c3';
          recLabel = 'REC: C3 MED';
        }
      }

      this.recommendedTireId = recId;
      recBadge.textContent = recLabel;
    }

    updateWeatherStatsUI() {
      this.updateRecommendedTireBadge();

      const elBalance = document.getElementById('stat-wind-balance');
      const elEffect = document.getElementById('stat-wind-effect');
      if (!elBalance && !elEffect) return;

      const ws = Number(this.weather.windSpeedKmh) || 0;
      const wd = Number(this.weather.windDirectionDeg) || 0;
      const clouds = Array.isArray(this.weather.clouds) ? this.weather.clouds : [];
      const wetZones = Array.isArray(this.weather.wetZones) ? this.weather.wetZones : [];
      const wStats = this.optimalResult?.weatherStats || this.optimalResult?.weatherSummary || this.optimalResult?.windSummary;

      if (ws <= 0.5 && clouds.length === 0 && wetZones.length === 0) {
        if (elBalance) {
          elBalance.textContent = '100% Stable';
          elBalance.className = 'stat-val stat-val-compact';
        }
        if (elEffect) {
          elEffect.textContent = 'Calm (0 km/h)';
        }
        return;
      }

      const wRad = (wd * Math.PI) / 180;
      const wxDir = Math.cos(wRad);
      const wyDir = Math.sin(wRad);
      const samples = this.optimalResult?.samples || this.track?.samples || [];

      let maxHead = ws;
      let maxTail = ws;
      let maxCross = ws;

      if (samples.length > 4 && ws > 0.5) {
        let peakH = 0;
        let peakT = 0;
        let peakC = 0;
        for (let i = 0; i < samples.length; i += 2) {
          const s = samples[i];
          const tx = s.tx ?? Math.cos(s.heading || 0);
          const ty = s.ty ?? Math.sin(s.heading || 0);
          // Projection of wind onto car travel direction: negative = headwind, positive = tailwind
          const proj = tx * wxDir + ty * wyDir;
          const cross = Math.abs(tx * wyDir - ty * wxDir);
          if (-proj * ws > peakH) peakH = -proj * ws;
          if (proj * ws > peakT) peakT = proj * ws;
          if (cross * ws > peakC) peakC = cross * ws;
        }
        maxHead = Math.round(peakH);
        maxTail = Math.round(peakT);
        maxCross = Math.round(peakC);
      }

      if (elBalance) {
        if (wStats && typeof wStats.balanceLabel === 'string') {
          elBalance.textContent = wStats.balanceLabel;
        } else if (wetZones.length > 0) {
          const avgWetPct = Math.round(
            (wetZones.reduce((acc, z) => acc + (Number(z.intensity) || 0.75), 0) / wetZones.length) * 100
          );
          elBalance.textContent = `Wet (${wetZones.length} Zone${wetZones.length === 1 ? '' : 's'} • ${avgWetPct}%)`;
          elBalance.className = 'stat-val stat-val-compact delta-bad';
        } else if (this.weather.ambientTempC <= 15 && clouds.length === 0 && ws > 0 && ws <= 45) {
          const boostPct = Math.max(3, Math.round(ws * 0.16 + (20 - this.weather.ambientTempC) * 0.4));
          elBalance.textContent = `+${boostPct}% Aero Grip`;
          elBalance.className = 'stat-val stat-val-compact delta-good';
        } else if (ws > 0.5) {
          const yawPenalty = Math.min(38, Math.max(1, Math.round(maxCross * 0.19 + clouds.length * 1.5)));
          elBalance.textContent = `-${yawPenalty}% Crosswind Yaw`;
          elBalance.className = `stat-val stat-val-compact ${yawPenalty >= 12 ? 'delta-bad' : ''}`;
        } else {
          elBalance.textContent = `${clouds.length} Cloud Zone${clouds.length === 1 ? '' : 's'}`;
          elBalance.className = 'stat-val stat-val-compact';
        }
      }

      if (elEffect) {
        if (wStats && typeof wStats.effectLabel === 'string') {
          elEffect.textContent = wStats.effectLabel;
        } else if (ws > 0.5) {
          elEffect.textContent = `+${maxHead} Head / -${maxTail} Tail`;
        } else if (wetZones.length > 0) {
          const wetDelta = (this.dryReferenceResult && this.optimalResult)
            ? Math.max(0, this.optimalResult.lapTime - this.dryReferenceResult.lapTime)
            : 0;
          elEffect.textContent = wetDelta > 0.02
            ? `+${wetDelta.toFixed(2)}s vs Dry Line`
            : `${wetZones.length} Puddle Zone${wetZones.length === 1 ? '' : 's'}`;
        } else {
          elEffect.textContent = `Cool Patches (${clouds.length})`;
        }
      }
    }

    getDominantCornerHeadwindDeg() {
      const samples = this.track?.samples || this.optimalResult?.samples || [];
      if (!samples.length) return 180;
      let sumTx = 0;
      let sumTy = 0;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const k = Math.abs(s.curvature ?? s.kappa ?? 0);
        if (k > 0.004) {
          const weight = k * 100;
          const tx = s.tx ?? Math.cos(s.heading || 0);
          const ty = s.ty ?? Math.sin(s.heading || 0);
          sumTx += tx * weight;
          sumTy += ty * weight;
        }
      }
      if (Math.hypot(sumTx, sumTy) < 1e-3) return 180;
      // Headwind blows opposite to dominant corner travel direction
      const angleRad = Math.atan2(-sumTy, -sumTx);
      return ((Math.round((angleRad * 180) / Math.PI) % 360) + 360) % 360;
    }

    buildCornerStormClouds(count = 4) {
      const corners = this.optimalResult?.corners || [];
      const samples = this.track?.samples || this.optimalResult?.samples || [];
      const clouds = [];

      if (corners.length >= count) {
        const step = corners.length / count;
        for (let i = 0; i < count; i++) {
          const c = corners[Math.floor(i * step)];
          clouds.push({
            id: Date.now() + i * 17,
            x: c.x ?? c.apexX ?? 0,
            y: c.y ?? c.apexY ?? 0,
            radius: 235,
            density: 0.9,
            tempDropC: 10,
            moisture: 0.6
          });
        }
        return clouds;
      }

      if (samples.length >= count) {
        const step = Math.floor(samples.length / count);
        for (let i = 0; i < count; i++) {
          const pt = samples[(i * step) % samples.length];
          clouds.push({
            id: Date.now() + i * 17,
            x: pt.x || 0,
            y: pt.y || 0,
            radius: 235,
            density: 0.9,
            tempDropC: 10,
            moisture: 0.6
          });
        }
      }
      return clouds;
    }

    buildCornerWetZones(count = 3) {
      const corners = this.optimalResult?.corners || [];
      const samples = this.track?.samples || this.optimalResult?.samples || [];
      const intensity = clamp(Number(this.weather?.defaultWetIntensity) || 0.75, 0.1, 1.0);
      const zones = [];

      if (corners.length >= count) {
        const step = corners.length / count;
        for (let i = 0; i < count; i++) {
          const c = corners[Math.floor(i * step)];
          zones.push({
            id: `wz-${Date.now()}-${i}`,
            x: c.x ?? c.apexX ?? 0,
            y: c.y ?? c.apexY ?? 0,
            radius: 195,
            intensity,
            label: c.label || `T${c.number || i + 1}`
          });
        }
        return zones;
      }

      if (samples.length >= count) {
        const step = Math.floor(samples.length / count);
        for (let i = 0; i < count; i++) {
          const pt = samples[(i * step) % samples.length];
          zones.push({
            id: `wz-${Date.now()}-${i}`,
            x: pt.x || 0,
            y: pt.y || 0,
            radius: 195,
            intensity,
            label: `Wet Zone ${i + 1}`
          });
        }
      }
      return zones;
    }

    applyBestWeatherPreset() {
      document.getElementById('btn-weather-best')?.classList.add('active');
      document.getElementById('btn-weather-worst')?.classList.remove('active');

      let preset = null;
      if (this.optimizer && typeof this.optimizer.getBestWeatherPreset === 'function') {
        preset = this.optimizer.getBestWeatherPreset(this.track, this.carParams);
      } else if (window.App.RacingLineOptimizer && typeof window.App.RacingLineOptimizer.getBestWeatherPreset === 'function') {
        preset = window.App.RacingLineOptimizer.getBestWeatherPreset(this.track, this.carParams);
      }

      const bestDir = preset?.windDirectionDeg !== undefined
        ? preset.windDirectionDeg
        : this.getDominantCornerHeadwindDeg();
      const bestSpeed = preset?.windSpeedKmh !== undefined ? preset.windSpeedKmh : 28;

      this.weather = {
        ...this.weather,
        ...(preset || {}),
        windSpeedKmh: bestSpeed,
        windDirectionDeg: ((Math.round(bestDir) % 360) + 360) % 360,
        gustIntensity: preset?.gustIntensity ?? 0.0,
        ambientTempC: preset?.ambientTempC ?? 12,
        clouds: [],
        selectedCloudIndex: -1,
        hoveredCloudIndex: -1,
        wetZones: [],
        globalWetness: 0,
        selectedWetZoneIndex: -1,
        hoveredWetZoneIndex: -1
      };

      this.syncWeatherUI();
      this.runInstantOptimization(false);
    }

    applyWorstWeatherPreset() {
      document.getElementById('btn-weather-worst')?.classList.add('active');
      document.getElementById('btn-weather-best')?.classList.remove('active');

      let preset = null;
      if (this.optimizer && typeof this.optimizer.getWorstWeatherPreset === 'function') {
        preset = this.optimizer.getWorstWeatherPreset(this.track, this.carParams);
      } else if (window.App.RacingLineOptimizer && typeof window.App.RacingLineOptimizer.getWorstWeatherPreset === 'function') {
        preset = window.App.RacingLineOptimizer.getWorstWeatherPreset(this.track, this.carParams);
      }

      const worstDir = preset?.windDirectionDeg !== undefined
        ? preset.windDirectionDeg
        : (this.getDominantCornerHeadwindDeg() + 180) % 360;
      const worstSpeed = preset?.windSpeedKmh !== undefined ? preset.windSpeedKmh : 78;
      const clouds = (preset && Array.isArray(preset.clouds) && preset.clouds.length > 0)
        ? preset.clouds
        : this.buildCornerStormClouds(4);
      const wetZones = (preset && Array.isArray(preset.wetZones) && preset.wetZones.length > 0)
        ? preset.wetZones
        : this.buildCornerWetZones(3);

      this.weather = {
        ...this.weather,
        ...(preset || {}),
        windSpeedKmh: worstSpeed,
        windDirectionDeg: ((Math.round(worstDir) % 360) + 360) % 360,
        gustIntensity: preset?.gustIntensity ?? 0.45,
        ambientTempC: preset?.ambientTempC ?? 34,
        clouds,
        selectedCloudIndex: -1,
        hoveredCloudIndex: -1,
        wetZones,
        selectedWetZoneIndex: -1,
        hoveredWetZoneIndex: -1
      };

      this.syncWeatherUI();
      this.runInstantOptimization(false);
    }

    resetCalmWeather() {
      document.getElementById('btn-weather-best')?.classList.remove('active');
      document.getElementById('btn-weather-worst')?.classList.remove('active');

      this.weather = {
        windSpeedKmh: 0,
        windDirectionDeg: 0,
        gustIntensity: 0.15,
        ambientTempC: 20,
        clouds: [],
        selectedCloudIndex: -1,
        hoveredCloudIndex: -1,
        wetZones: [],
        globalWetness: 0,
        selectedWetZoneIndex: -1,
        hoveredWetZoneIndex: -1,
        defaultWetIntensity: 0.75
      };

      this.syncWeatherUI();
      this.runInstantOptimization(false);
    }

    spawnWetZoneCell() {
      document.getElementById('btn-weather-best')?.classList.remove('active');
      if (!Array.isArray(this.weather.wetZones)) {
        this.weather.wetZones = [];
      }

      const corners = this.optimalResult?.corners || [];
      const samples = this.track?.samples || this.optimalResult?.samples || [];
      const existing = this.weather.wetZones;
      const idx = existing.length;

      let x = 0;
      let y = 0;
      let label = `Wet Zone ${idx + 1}`;

      if (corners.length > 0) {
        // Pick the first corner that does not already have a wet zone nearby, or cycle through corners
        let chosenCorner = corners[idx % corners.length];
        for (let i = 0; i < corners.length; i++) {
          const c = corners[i];
          const cx = c.x ?? c.apexX ?? 0;
          const cy = c.y ?? c.apexY ?? 0;
          const alreadyWet = existing.some((wz) => Math.hypot((wz.x || 0) - cx, (wz.y || 0) - cy) < 120);
          if (!alreadyWet) {
            chosenCorner = c;
            break;
          }
        }
        x = (chosenCorner.x ?? chosenCorner.apexX ?? 0) + (idx >= corners.length ? ((idx * 23) % 50) - 25 : 0);
        y = (chosenCorner.y ?? chosenCorner.apexY ?? 0) + (idx >= corners.length ? ((idx * 31) % 50) - 25 : 0);
        label = chosenCorner.label || `T${chosenCorner.number || (idx % corners.length) + 1}`;
      } else if (samples.length > 0) {
        const pt = samples[(idx * Math.max(1, Math.floor(samples.length / 6))) % samples.length];
        x = pt.x || 0;
        y = pt.y || 0;
      }

      const intensity = clamp(Number(this.weather.defaultWetIntensity) || 0.75, 0.1, 1.0);
      this.weather.wetZones.push({
        id: 'wz-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        x,
        y,
        radius: 195,
        intensity,
        label
      });
      this.weather.selectedWetZoneIndex = this.weather.wetZones.length - 1;
      this.syncWeatherUI();
      this.runInstantOptimization(false);
    }

    removeWetZoneAtIndex(index) {
      if (!Array.isArray(this.weather.wetZones) || index < 0 || index >= this.weather.wetZones.length) return;
      this.weather.wetZones.splice(index, 1);
      if (this.weather.selectedWetZoneIndex >= this.weather.wetZones.length) {
        this.weather.selectedWetZoneIndex = this.weather.wetZones.length - 1;
      }
      this.weather.hoveredWetZoneIndex = -1;
      this.syncWeatherUI();
      this.runInstantOptimization(false);
    }

    getClosestWetZoneIndex(wx, wy) {
      const wetZones = this.weather?.wetZones;
      if (!Array.isArray(wetZones) || wetZones.length === 0) return -1;

      if (this.trackRenderer && typeof this.trackRenderer.getClosestWetZone === 'function') {
        const hit = this.trackRenderer.getClosestWetZone(wx, wy, wetZones);
        if (hit !== null && hit !== undefined) {
          if (typeof hit === 'number' && hit >= 0) return hit;
          if (typeof hit === 'object' && typeof hit.index === 'number' && hit.index >= 0) return hit.index;
        }
      }

      const zoom = this.trackRenderer?.zoom || 1.0;
      const baseHit = Math.max(38 / zoom, 40);
      let bestIdx = -1;
      let bestDist = Infinity;

      for (let i = wetZones.length - 1; i >= 0; i--) {
        const wz = wetZones[i];
        if (!wz || typeof wz.x !== 'number' || typeof wz.y !== 'number') continue;
        const hitRadius = Math.max(baseHit, Math.min(90, (wz.radius || 195) * 0.42));
        const d = Math.hypot(wx - wz.x, wy - wz.y);
        if (d <= hitRadius && d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    }

    spawnCloudCellAtCorner() {
      document.getElementById('btn-weather-best')?.classList.remove('active');
      const corners = this.optimalResult?.corners || [];
      const samples = this.track?.samples || this.optimalResult?.samples || [];
      const idx = this.weather.clouds.length;

      let x = 0;
      let y = 0;
      if (corners.length > 0) {
        const c = corners[idx % corners.length];
        x = (c.x ?? c.apexX ?? 0) + (idx >= corners.length ? (idx * 25) % 60 - 30 : 0);
        y = (c.y ?? c.apexY ?? 0) + (idx >= corners.length ? (idx * 35) % 60 - 30 : 0);
      } else if (samples.length > 0) {
        const pt = samples[(idx * Math.floor(samples.length / 5)) % samples.length];
        x = pt.x || 0;
        y = pt.y || 0;
      }

      this.weather.clouds.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        x,
        y,
        radius: 220,
        density: 0.82,
        tempDropC: 8,
        moisture: 0.4
      });
      this.weather.selectedCloudIndex = this.weather.clouds.length - 1;
      this.syncWeatherUI();
      this.runInstantOptimization(false);
    }

    removeCloudAtIndex(index) {
      if (!Array.isArray(this.weather.clouds) || index < 0 || index >= this.weather.clouds.length) return;
      this.weather.clouds.splice(index, 1);
      if (this.weather.selectedCloudIndex >= this.weather.clouds.length) {
        this.weather.selectedCloudIndex = this.weather.clouds.length - 1;
      }
      this.weather.hoveredCloudIndex = -1;
      this.syncWeatherUI();
      this.runInstantOptimization(false);
    }

    getClosestCloudIndex(wx, wy) {
      const clouds = this.weather?.clouds;
      if (!Array.isArray(clouds) || clouds.length === 0) return -1;
      const zoom = this.trackRenderer?.zoom || 1.0;
      const baseHit = Math.max(35 / zoom, 42);
      let bestIdx = -1;
      let bestDist = Infinity;

      for (let i = clouds.length - 1; i >= 0; i--) {
        const c = clouds[i];
        const hitRadius = Math.max(baseHit, Math.min(95, (c.radius || 220) * 0.38));
        const d = Math.hypot(wx - c.x, wy - c.y);
        if (d <= hitRadius && d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    }

    // =========================================================================
    // AI RACING LINE OPTIMIZER & PROGRESSIVE VISUALIZATION
    // =========================================================================

    runInstantOptimization(fastDragMode = false) {
      if (!this.track || !this.optimizer || !this.track.nodes || this.track.nodes.length < 3) {
        this.updateTrackStatsUI();
        return;
      }

      // Ensure track geometry is up to date
      if (!this.track.samples || this.track.samples.length === 0) {
        if (typeof this.track.rebuild === 'function') {
          this.track.rebuild();
        }
      }

      // Attach weather state so all modules can access it
      this.carParams.weather = this.weather;
      this.track.weather = this.weather;

      const iters = fastDragMode ? 95 : 220;
      const optRes = this.optimizer.solveInstant(this.track, this.carParams, {
        iterations: iters,
        weather: this.weather
      });
      this.optimalResult = normalizeResult(optRes, this.carParams);

      // Compute Dry Reference Line when wet zones (or global wetness) are active and showDryLine is enabled
      const hasWetness =
        (Array.isArray(this.weather?.wetZones) && this.weather.wetZones.length > 0) ||
        (Number(this.weather?.globalWetness) > 0);
      const showDry = (this.viewOptions?.showDryLine !== false) && (this.showDryLine !== false);

      if (hasWetness && showDry) {
        const dryWeather = { ...this.weather, wetZones: [], globalWetness: 0 };
        const dryRes = this.optimizer.solveInstant(this.track, this.carParams, {
          iterations: fastDragMode ? 90 : 160,
          weather: dryWeather
        });
        this.dryReferenceResult = normalizeResult(dryRes, {
          ...this.carParams,
          color: '#94a3b8',
          name: 'Dry Reference Line'
        });
      } else {
        this.dryReferenceResult = null;
      }

      // Compute centerline reference path if needed
      if (!fastDragMode || this.showCenterline || this.activeGhostKey === 'centerline') {
        const N = this.optimalResult?.samples?.length || this.track.samples?.length || 0;
        const zeroAlpha = new Float64Array(N);
        const centerRes = this.optimizer.evaluatePath(this.track, zeroAlpha, this.carParams, {
          skipCenterlineComparison: true,
          weather: this.weather
        });
        this.centerlineResult = normalizeResult(centerRes, {
          ...this.carParams,
          color: '#94a3b8',
          name: 'Centerline'
        });
      }

      // Compute Ghost Comparison Car
      if (!fastDragMode) {
        this.computeGhostResult();
      } else {
        clearTimeout(this._dragGhostTimer);
        this._dragGhostTimer = setTimeout(() => {
          this.computeGhostResult();
          this.updateTelemetryUI();
        }, 120);
      }

      this.updateTelemetryUI();
      this.updateTrackStatsUI();
    }

    computeGhostResult() {
      if (!this.track || !this.optimizer || !this.track.nodes || this.track.nodes.length < 3) {
        this.ghostResult = null;
        this.ghostCarParams = null;
        return;
      }

      const ghostBadge = document.getElementById('ghost-status-badge');

      if (!this.activeGhostKey || this.activeGhostKey === 'none') {
        this.ghostResult = null;
        this.ghostCarParams = null;
        if (ghostBadge) ghostBadge.textContent = 'OFF';
        return;
      }

      if (this.activeGhostKey === 'centerline') {
        const N = this.optimalResult?.samples?.length || this.track.samples?.length || 0;
        const zeroAlpha = new Float64Array(N);
        const centerRes = this.optimizer.evaluatePath(this.track, zeroAlpha, this.carParams, {
          skipCenterlineComparison: true,
          weather: this.weather
        });
        this.ghostCarParams = {
          ...this.carParams,
          weather: this.weather,
          name: `${this.carParams.name || 'Car'} (Centerline)`,
          color: '#94a3b8'
        };
        this.ghostResult = normalizeResult(centerRes, this.ghostCarParams);
        if (ghostBadge) ghostBadge.textContent = 'CENTERLINE';
        return;
      }

      const presetGhost = window.App.CAR_PRESETS?.[this.activeGhostKey];
      if (presetGhost) {
        this.ghostCarParams = { ...presetGhost, weather: this.weather };
        const ghostRes = this.optimizer.solveInstant(this.track, this.ghostCarParams, {
          iterations: 180,
          weather: this.weather
        });
        this.ghostResult = normalizeResult(ghostRes, this.ghostCarParams);
        if (ghostBadge) ghostBadge.textContent = presetGhost.name.toUpperCase();
      }
    }

    startProgressiveOptimization() {
      if (!this.track || !this.optimizer || !this.track.nodes || this.track.nodes.length < 3) return;

      if (this.isOptimizing) {
        this.stopProgressiveOptimization();
        this.runInstantOptimization();
        return;
      }

      this.carParams.weather = this.weather;
      this.track.weather = this.weather;

      if (typeof this.optimizer.createOptimizationSession === 'function') {
        this.progressiveSession = this.optimizer.createOptimizationSession(this.track, this.carParams, {
          totalIterations: 240,
          weather: this.weather
        });
        this.isOptimizing = true;
        this.optimizationProgress = 0;

        // Initial snapshot is centerline (alpha = 0)
        const snap = this.progressiveSession.getCurrentResult
          ? this.progressiveSession.getCurrentResult()
          : this.progressiveSession.step(0);
        this.optimalResult = normalizeResult(snap, this.carParams);

        const btn = document.getElementById('btn-watch-ai');
        if (btn) {
          btn.classList.add('optimizing');
          const label = btn.querySelector('span:last-child');
          if (label) label.textContent = 'Optimizing Line...';
        }
      } else {
        this.runInstantOptimization();
      }
    }

    stopProgressiveOptimization() {
      this.isOptimizing = false;
      this.progressiveSession = null;
      this.optimizationProgress = 1.0;
      const btn = document.getElementById('btn-watch-ai');
      if (btn) {
        btn.classList.remove('optimizing');
        const label = btn.querySelector('span:last-child');
        if (label) label.textContent = 'Optimize Line';
      }
    }

    // =========================================================================
    // UI METRICS & TELEMETRY READOUT UPDATES
    // =========================================================================

    updateTelemetryUI() {
      const res = this.optimalResult;
      if (!res) return;

      this.updateWeatherStatsUI();

      // Top Header Banner
      const elLapTime = document.getElementById('header-lap-time');
      if (elLapTime) elLapTime.textContent = formatLapTime(res.lapTime, true);

      const sectors = res.sectorTimes || [0, 0, 0];
      const elS1 = document.getElementById('header-s1');
      const elS2 = document.getElementById('header-s2');
      const elS3 = document.getElementById('header-s3');
      if (elS1) elS1.textContent = `${sectors[0].toFixed(2)}s`;
      if (elS2) elS2.textContent = `${sectors[1].toFixed(2)}s`;
      if (elS3) elS3.textContent = `${sectors[2].toFixed(2)}s`;

      const elSaved = document.getElementById('header-ai-saved');
      if (elSaved) {
        const saved = Math.max(0, res.timeSaved || 0);
        elSaved.textContent = `-${saved.toFixed(2)}s`;
      }

      const elGhostDelta = document.getElementById('header-ghost-delta');
      const elGhostBlock = document.getElementById('ghost-delta-block');
      const elGhostDiv = document.getElementById('ghost-delta-divider');
      if (elGhostDelta) {
        if (this.ghostResult && this.ghostResult.lapTime > 0) {
          const diff = res.lapTime - this.ghostResult.lapTime;
          const sign = diff > 0 ? '+' : '';
          elGhostDelta.textContent = `${sign}${diff.toFixed(2)}s`;
          elGhostDelta.className = `metric-value ${diff <= 0 ? 'delta-good' : 'delta-bad'}`;
          if (elGhostBlock) elGhostBlock.style.display = 'flex';
          if (elGhostDiv) elGhostDiv.style.display = 'block';
        } else {
          elGhostDelta.textContent = '---';
          elGhostDelta.className = 'metric-value delta-neutral';
          if (elGhostBlock) elGhostBlock.style.display = 'none';
          if (elGhostDiv) elGhostDiv.style.display = 'none';
        }
      }

      // Right Sidebar Lap Performance Summary Table
      const setPerf = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setPerf('perf-top-speed', `${(res.topSpeedKmh || 0).toFixed(1)} km/h`);
      setPerf('perf-min-speed', `${(res.minSpeedKmh || 0).toFixed(1)} km/h`);
      setPerf('perf-avg-speed', `${(res.avgSpeedKmh || 0).toFixed(1)} km/h`);
      setPerf('perf-max-lat-g', `${(res.maxLatG || 0).toFixed(2)} G`);
      setPerf('perf-max-brk-g', `${(res.maxBrakeG || 0).toFixed(2)} G`);
      setPerf('perf-max-df', `${formatNumber(res.maxDownforceKg || 0, 0)} kg`);
      setPerf('perf-full-thr', `${(res.fullThrottlePct || 0).toFixed(1)}%`);
      setPerf('perf-brk-pct', `${(res.brakingPct || 0).toFixed(1)}%`);
      setPerf('perf-time-saved', `-${Math.max(0, res.timeSaved || 0).toFixed(3)} s`);

      const ggBadge = document.getElementById('gg-max-badge');
      if (ggBadge) {
        const peakG = Math.max(res.maxLatG || 0, res.maxBrakeG || 0);
        ggBadge.textContent = `PEAK ${peakG.toFixed(1)}G`;
      }
    }

    updateTrackStatsUI() {
      const nodes = this.track?.nodes || [];
      const samples = this.track?.samples || this.optimalResult?.samples || [];
      const totalLen = this.track?.totalLength || this.optimalResult?.totalLength || 0;
      const corners = this.optimalResult?.corners || [];

      // Compute average track width and longest low-curvature straight
      let avgWidth = 14.0;
      if (nodes.length > 0) {
        const sumW = nodes.reduce((acc, n) => acc + (Number(n.width) || 14), 0);
        avgWidth = sumW / nodes.length;
      }

      let longestStraight = 0;
      if (samples.length > 2) {
        let currentRun = 0;
        const N = samples.length;
        for (let i = 0; i < N * 2; i++) {
          const pt = samples[i % N];
          const k = Math.abs(pt.curvature ?? pt.kappa ?? 0);
          const ds = pt.ds || (totalLen / N);
          if (k < 0.0028) {
            currentRun += ds;
            if (currentRun > longestStraight) {
              longestStraight = Math.min(totalLen, currentRun);
            }
          } else {
            currentRun = 0;
          }
        }
      }

      const elLen = document.getElementById('stat-track-length');
      const elCorners = document.getElementById('stat-corner-count');
      const elStraight = document.getElementById('stat-longest-straight');
      const elWidth = document.getElementById('stat-avg-width');

      if (elLen) elLen.textContent = `${formatNumber(Math.round(totalLen))} m`;
      if (elCorners) elCorners.textContent = `${corners.length}`;
      if (elStraight) elStraight.textContent = `${formatNumber(Math.round(longestStraight))} m`;
      if (elWidth) elWidth.textContent = `${avgWidth.toFixed(1)} m`;
    }

    updateLiveCarHUD(sample) {
      if (!sample) return;

      const elLapTimer = document.getElementById('hud-current-lap-time');
      const elSpeed = document.getElementById('hud-speed-kmh');
      const elGear = document.getElementById('hud-gear');
      const elRpm = document.getElementById('hud-rpm-fill');
      const elThrBar = document.getElementById('hud-thr-bar');
      const elThrVal = document.getElementById('hud-thr-val');
      const elBrkBar = document.getElementById('hud-brk-bar');
      const elBrkVal = document.getElementById('hud-brk-val');
      const elLatG = document.getElementById('hud-lat-g');
      const elLonG = document.getElementById('hud-lon-g');
      const elDf = document.getElementById('hud-downforce');
      const elSlip = document.getElementById('hud-slip');

      const lapDuration = this.optimalResult?.lapTime || 1;
      const wrappedTime = ((this.simTime % lapDuration) + lapDuration) % lapDuration;

      if (elLapTimer) elLapTimer.textContent = formatLapTime(wrappedTime, true);
      if (elSpeed) elSpeed.textContent = Math.round(sample.speedKmh || 0);
      if (elGear) elGear.textContent = sample.gear || 1;

      if (elRpm) {
        const maxRpm = this.optimalResult?.carParams?.redlineRpm || 11500;
        const pct = clamp(((sample.rpm || 4000) / maxRpm) * 100, 8, 100);
        elRpm.style.width = `${pct.toFixed(1)}%`;
      }

      const thrPct = Math.round(clamp((sample.throttle || 0) * 100, 0, 100));
      const brkPct = Math.round(clamp((sample.brake || 0) * 100, 0, 100));

      if (elThrBar) elThrBar.style.width = `${thrPct}%`;
      if (elThrVal) elThrVal.textContent = `${thrPct}%`;
      if (elBrkBar) elBrkBar.style.width = `${brkPct}%`;
      if (elBrkVal) elBrkVal.textContent = `${brkPct}%`;

      if (elLatG) elLatG.textContent = `${Math.abs(sample.latG || 0).toFixed(1)}G`;
      if (elLonG) {
        const lg = sample.longG || 0;
        elLonG.textContent = `${lg >= 0 ? '+' : ''}${lg.toFixed(1)}G`;
      }
      if (elDf) elDf.textContent = `${Math.round(sample.downforceKg ?? sample.downforce ?? 0)}kg`;
      if (elSlip) elSlip.textContent = `${Math.abs(sample.slipAngleDeg || 0).toFixed(1)}°`;
    }

    // =========================================================================
    // UI EVENT BINDINGS
    // =========================================================================

    bindUIEvents() {
      // Circuit Preset Selector
      const trackSelect = document.getElementById('track-preset-select');
      if (trackSelect) {
        trackSelect.addEventListener('change', (e) => {
          this.loadTrackPreset(e.target.value);
        });
      }

      // Export / Import JSON
      document.getElementById('btn-export-json')?.addEventListener('click', () => this.exportTrackJSON());
      document.getElementById('btn-import-json')?.addEventListener('click', () => {
        document.getElementById('input-import-json')?.click();
      });
      document.getElementById('input-import-json')?.addEventListener('change', (e) => this.importTrackJSON(e));

      // Header Simulation & AI Controls
      document.getElementById('btn-watch-ai')?.addEventListener('click', () => {
        this.startProgressiveOptimization();
      });

      document.getElementById('btn-play-pause')?.addEventListener('click', () => {
        this.togglePlayPause();
      });

      document.querySelectorAll('.speed-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.simSpeed = parseFloat(btn.dataset.speed || 1);
          document.querySelectorAll('.speed-pill').forEach((b) => b.classList.toggle('active', b === btn));
        });
      });

      const btnFollow = document.getElementById('btn-follow-cam');
      btnFollow?.addEventListener('click', () => {
        this.followCar = !this.followCar;
        btnFollow.classList.toggle('active', this.followCar);
        if (this.trackRenderer) {
          this.trackRenderer.followCar = this.followCar;
          if (!this.followCar) {
            this.fitCameraToTrack();
          }
        }
      });

      const btnTelemetry = document.getElementById('btn-toggle-telemetry');
      btnTelemetry?.addEventListener('click', () => {
        this.showTelemetry = !this.showTelemetry;
        btnTelemetry.classList.toggle('active', this.showTelemetry);
        const dock = document.getElementById('telemetry-dock');
        if (dock) {
          dock.classList.toggle('collapsed', !this.showTelemetry);
        }
        // Resize canvases after layout change so track canvas expands/contracts cleanly
        requestAnimationFrame(() => {
          this.handleResize();
          if (!this.followCar) {
            this.fitCameraToTrack();
          }
        });
      });

      // Left Sidebar: Editor Mode Tools
      document.querySelectorAll('.tool-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.setEditorTool(btn.dataset.tool);
        });
      });

      // Left Sidebar: Weather & Wind Simulation Lab Controls
      document.getElementById('btn-weather-best')?.addEventListener('click', () => {
        this.applyBestWeatherPreset();
      });
      document.getElementById('btn-weather-worst')?.addEventListener('click', () => {
        this.applyWorstWeatherPreset();
      });
      document.getElementById('btn-weather-calm')?.addEventListener('click', () => {
        this.resetCalmWeather();
      });

      const windSpeedSlider = document.getElementById('slider-wind-speed');
      windSpeedSlider?.addEventListener('input', (e) => {
        document.getElementById('btn-weather-best')?.classList.remove('active');
        document.getElementById('btn-weather-worst')?.classList.remove('active');
        this.weather.windSpeedKmh = clamp(parseFloat(e.target.value) || 0, 0, 120);
        this.syncWeatherUI();
        this.runInstantOptimization(true);
      });
      windSpeedSlider?.addEventListener('change', () => {
        this.runInstantOptimization(false);
      });

      const windDirSlider = document.getElementById('slider-wind-dir');
      windDirSlider?.addEventListener('input', (e) => {
        document.getElementById('btn-weather-best')?.classList.remove('active');
        document.getElementById('btn-weather-worst')?.classList.remove('active');
        this.weather.windDirectionDeg = ((Math.round(parseFloat(e.target.value) || 0) % 360) + 360) % 360;
        this.syncWeatherUI();
        this.runInstantOptimization(true);
      });
      windDirSlider?.addEventListener('change', () => {
        this.runInstantOptimization(false);
      });

      document.getElementById('btn-place-cloud')?.addEventListener('click', () => {
        if (this.editorTool === 'place_cloud') {
          this.setEditorTool('select');
        } else {
          this.setEditorTool('place_cloud');
        }
      });

      document.getElementById('btn-auto-clouds')?.addEventListener('click', () => {
        this.spawnCloudCellAtCorner();
      });

      document.getElementById('btn-clear-clouds')?.addEventListener('click', () => {
        document.getElementById('btn-weather-worst')?.classList.remove('active');
        this.weather.clouds = [];
        this.weather.selectedCloudIndex = -1;
        this.weather.hoveredCloudIndex = -1;
        this.syncWeatherUI();
        this.runInstantOptimization(false);
      });

      // Left Sidebar: Localized Wet Zones Controls
      document.getElementById('btn-place-wet')?.addEventListener('click', () => {
        if (this.editorTool === 'place_wet') {
          this.setEditorTool('select');
        } else {
          this.setEditorTool('place_wet');
        }
      });

      document.getElementById('btn-auto-wet')?.addEventListener('click', () => {
        this.spawnWetZoneCell();
      });

      document.getElementById('btn-clear-wet')?.addEventListener('click', () => {
        document.getElementById('btn-weather-worst')?.classList.remove('active');
        this.weather.wetZones = [];
        this.weather.globalWetness = 0;
        this.weather.selectedWetZoneIndex = -1;
        this.weather.hoveredWetZoneIndex = -1;
        this.syncWeatherUI();
        this.runInstantOptimization(false);
      });

      const wetIntensitySlider = document.getElementById('slider-wet-intensity');
      wetIntensitySlider?.addEventListener('input', (e) => {
        const pct = clamp(parseFloat(e.target.value) || 75, 10, 100);
        const intensity = pct / 100;
        const prevDefault = this.weather.defaultWetIntensity ?? 0.75;
        this.weather.defaultWetIntensity = intensity;

        const wetZones = this.weather.wetZones;
        if (Array.isArray(wetZones) && wetZones.length > 0) {
          const selIdx = this.weather.selectedWetZoneIndex;
          if (selIdx >= 0 && wetZones[selIdx]) {
            wetZones[selIdx].intensity = intensity;
            // Also update other zones that were still at the previous default intensity
            wetZones.forEach((wz, idx) => {
              if (idx !== selIdx && Math.abs((wz.intensity ?? prevDefault) - prevDefault) < 0.03) {
                wz.intensity = intensity;
              }
            });
          } else {
            wetZones.forEach((wz) => {
              wz.intensity = intensity;
            });
          }
        }
        this.syncWeatherUI();
        this.runInstantOptimization(true);
      });
      wetIntensitySlider?.addEventListener('change', () => {
        this.runInstantOptimization(false);
      });

      document.getElementById('chk-show-dry-line')?.addEventListener('change', (e) => {
        const checked = Boolean(e.target.checked);
        this.showDryLine = checked;
        if (!this.viewOptions) this.viewOptions = {};
        this.viewOptions.showDryLine = checked;
        this.runInstantOptimization(false);
      });

      // Left Sidebar: Selected Node Inspector
      document.getElementById('btn-node-spline')?.addEventListener('click', () => this.setSelectedNodeMode('spline'));
      document.getElementById('btn-node-straight')?.addEventListener('click', () => this.setSelectedNodeMode('straight'));

      const widthSlider = document.getElementById('slider-node-width');
      widthSlider?.addEventListener('input', (e) => {
        const w = parseFloat(e.target.value);
        const label = document.getElementById('val-node-width');
        if (label) label.textContent = `${w.toFixed(1)} m`;
        if (this.selectedNodeIndex >= 0 && this.track?.nodes?.[this.selectedNodeIndex]) {
          if (typeof this.track.setNodeWidth === 'function') {
            this.track.setNodeWidth(this.selectedNodeIndex, w);
          } else {
            this.track.nodes[this.selectedNodeIndex].width = w;
            this.track.rebuild?.();
          }
          this.runInstantOptimization(true);
        }
      });

      document.getElementById('btn-apply-width-all')?.addEventListener('click', () => {
        const w = parseFloat(widthSlider?.value || 14);
        if (this.track?.nodes) {
          this.track.nodes.forEach((n) => { n.width = w; });
          this.track.rebuild?.();
          this.runInstantOptimization();
        }
      });

      document.getElementById('btn-delete-selected-node')?.addEventListener('click', () => {
        this.deleteNodeAtIndex(this.selectedNodeIndex);
      });

      // Left Sidebar: Circuit Operations
      document.getElementById('btn-reverse-track')?.addEventListener('click', () => {
        if (this.track) {
          if (typeof this.track.reverseDirection === 'function') {
            this.track.reverseDirection();
          } else if (Array.isArray(this.track.nodes)) {
            this.track.nodes.reverse();
            this.track.rebuild?.();
          }
          this.carTrail = [];
          this.trackRenderer?.clearTrails?.();
          this.runInstantOptimization();
        }
      });

      document.getElementById('btn-fit-camera')?.addEventListener('click', () => {
        this.followCar = false;
        document.getElementById('btn-follow-cam')?.classList.remove('active');
        if (this.trackRenderer) this.trackRenderer.followCar = false;
        this.fitCameraToTrack();
      });

      document.getElementById('btn-smooth-track')?.addEventListener('click', () => {
        this.smoothTrackNodes();
      });

      document.getElementById('btn-reset-track')?.addEventListener('click', () => {
        const key = this.activeTrackKey === 'custom_blank' ? 'grand_prix' : this.activeTrackKey;
        this.loadTrackPreset(key);
      });

      document.getElementById('btn-blank-track')?.addEventListener('click', () => {
        this.enterCustomDrawMode();
      });

      document.getElementById('btn-finish-draw')?.addEventListener('click', () => {
        this.finishCustomDrawMode();
      });

      // Left Sidebar: Visualization & Overlay Toggles
      document.getElementById('select-color-mode')?.addEventListener('change', (e) => {
        this.colorMode = e.target.value;
      });
      document.getElementById('chk-show-nodes')?.addEventListener('change', (e) => {
        this.showNodes = e.target.checked;
      });
      document.getElementById('chk-show-apexes')?.addEventListener('change', (e) => {
        this.showApexes = e.target.checked;
      });
      document.getElementById('chk-show-centerline')?.addEventListener('change', (e) => {
        this.showCenterline = e.target.checked;
        if (this.showCenterline && !this.centerlineResult) {
          this.runInstantOptimization();
        }
      });
      document.getElementById('chk-show-ghost-line')?.addEventListener('change', (e) => {
        this.showGhostLine = e.target.checked;
      });
      document.getElementById('chk-show-vectors')?.addEventListener('change', (e) => {
        this.showVectors = e.target.checked;
      });

      // Right Sidebar: Pirelli Tire Compound Selector & Custom Tire Lab
      document.querySelectorAll('#tire-preset-strip .tire-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const compoundId = btn.dataset.tire;
          if (compoundId) {
            this.selectTireCompound(compoundId, true);
          }
        });
      });

      document.getElementById('tire-rec-badge')?.addEventListener('click', () => {
        if (this.recommendedTireId) {
          this.selectTireCompound(this.recommendedTireId, true);
        }
      });

      const tireSliderIds = [
        'param-tire-softness',
        'param-tire-tread',
        'param-tire-pressure'
      ];
      tireSliderIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', () => this.readTireSliders(true));
          el.addEventListener('change', () => this.readTireSliders(false));
        }
      });

      // Right Sidebar: Ghost Comparison Selector
      document.getElementById('select-ghost-car')?.addEventListener('change', (e) => {
        this.activeGhostKey = e.target.value;
        this.computeGhostResult();
        this.updateTelemetryUI();
      });

      // Right Sidebar: Reset Car Button
      document.getElementById('btn-reset-car')?.addEventListener('click', () => {
        this.loadCarPreset(this.activeCarKey, true);
      });

      // Right Sidebar: Physics Sliders
      const sliderIds = [
        'param-mass',
        'param-power',
        'param-topspeed',
        'param-mu',
        'param-cg',
        'param-aggression',
        'param-cl',
        'param-cd',
        'param-brake',
        'param-bias'
      ];
      sliderIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', () => this.readCarParamsFromSliders());
        }
      });
    }

    setSelectedNodeMode(mode) {
      if (this.selectedNodeIndex < 0 || !this.track?.nodes?.[this.selectedNodeIndex]) return;
      const node = this.track.nodes[this.selectedNodeIndex];
      node.mode = mode;
      this.track.rebuild?.();
      this.updateNodeInspectorUI();
      this.runInstantOptimization();
    }

    deleteNodeAtIndex(index) {
      if (!this.track?.nodes || index < 0 || index >= this.track.nodes.length) return;
      if (!this.isCustomDrawing && this.track.nodes.length <= 3) {
        return; // Keep minimum 3 nodes for a valid closed loop
      }

      if (typeof this.track.removeNode === 'function') {
        this.track.removeNode(index);
      } else {
        this.track.nodes.splice(index, 1);
        this.track.rebuild?.();
      }

      this.selectedNodeIndex = Math.min(index, this.track.nodes.length - 1);
      this.updateNodeInspectorUI();
      this.runInstantOptimization();
    }

    smoothTrackNodes() {
      if (!this.track?.nodes || this.track.nodes.length < 4) return;
      const nodes = this.track.nodes;
      const N = nodes.length;
      const newCoords = nodes.map((n, i) => {
        const prev = nodes[(i - 1 + N) % N];
        const next = nodes[(i + 1) % N];
        return {
          x: n.x * 0.78 + (prev.x + next.x) * 0.11,
          y: n.y * 0.78 + (prev.y + next.y) * 0.11,
          w: (n.width || 14) * 0.6 + ((prev.width || 14) + (next.width || 14)) * 0.2
        };
      });
      nodes.forEach((n, i) => {
        n.x = newCoords[i].x;
        n.y = newCoords[i].y;
        n.width = newCoords[i].w;
      });
      this.track.rebuild?.();
      this.updateNodeInspectorUI();
      this.runInstantOptimization();
    }

    togglePlayPause() {
      this.isPlaying = !this.isPlaying;
      const btn = document.getElementById('btn-play-pause');
      const icon = document.getElementById('play-pause-icon');
      const label = document.getElementById('play-pause-label');
      if (btn) btn.classList.toggle('active', this.isPlaying);
      if (icon) icon.textContent = this.isPlaying ? '⏸' : '▶';
      if (label) label.textContent = this.isPlaying ? 'Pause' : 'Play';
    }

    // =========================================================================
    // CANVAS MOUSE / WHEEL / DRAG INTERACTION
    // =========================================================================

    bindCanvasEvents() {
      const canvas = document.getElementById('track-canvas');
      if (!canvas) return;

      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
      window.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
      window.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e));
      canvas.addEventListener('dblclick', (e) => this.onCanvasDoubleClick(e));
      canvas.addEventListener('wheel', (e) => this.onCanvasWheel(e), { passive: false });
    }

    getCanvasCoords(e) {
      const canvas = document.getElementById('track-canvas');
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      let world = { x: 0, y: 0 };
      if (this.trackRenderer && typeof this.trackRenderer.screenToWorld === 'function') {
        world = this.trackRenderer.screenToWorld(sx, sy);
      }
      return { sx, sy, wx: world.x, wy: world.y };
    }

    getHitRadiusWorld() {
      const zoom = this.trackRenderer?.zoom || 1.0;
      return Math.max(12, 18 / zoom);
    }

    isPointInCompass(sx, sy) {
      if (this.trackRenderer && typeof this.trackRenderer.isPointInWindCompass === 'function') {
        return Boolean(this.trackRenderer.isPointInWindCompass(sx, sy));
      }
      return sx >= 14 && sx <= 98 && sy >= 14 && sy <= 98;
    }

    updateCompassAngleFromScreen(sx, sy) {
      const center = this.trackRenderer?.windCompassCenter || { x: 56, y: 56 };
      const dx = sx - center.x;
      const dy = sy - center.y;
      if (Math.hypot(dx, dy) < 2) return;
      const deg = ((Math.round((Math.atan2(dy, dx) * 180) / Math.PI) % 360) + 360) % 360;
      this.weather.windDirectionDeg = deg;
      if ((this.weather.windSpeedKmh || 0) < 1) {
        this.weather.windSpeedKmh = 28;
      }
      document.getElementById('btn-weather-best')?.classList.remove('active');
      document.getElementById('btn-weather-worst')?.classList.remove('active');
      this.syncWeatherUI();
      this.runInstantOptimization(true);
    }

    onCanvasMouseDown(e) {
      const { sx, sy, wx, wy } = this.getCanvasCoords(e);

      // Right-click on an existing wet zone or cloud removes it cleanly
      if (e.button === 2) {
        const hitWetIdx = this.getClosestWetZoneIndex(wx, wy);
        if (hitWetIdx >= 0) {
          this.removeWetZoneAtIndex(hitWetIdx);
          return;
        }
        const hitCloudIdx = this.getClosestCloudIndex(wx, wy);
        if (hitCloudIdx >= 0 && (this.editorTool === 'place_cloud' || this.weather.selectedCloudIndex === hitCloudIdx)) {
          this.removeCloudAtIndex(hitCloudIdx);
          return;
        }
      }

      // Right-click, Middle-click, or Space+Left-click -> Camera Pan
      if (e.button === 2 || e.button === 1 || (e.button === 0 && this.spacePressed)) {
        this.isPanning = true;
        this.panStartScreen = { x: sx, y: sy };
        this.panStartCam = {
          x: this.trackRenderer?.camX || 0,
          y: this.trackRenderer?.camY || 0
        };
        if (this.followCar) {
          this.followCar = false;
          document.getElementById('btn-follow-cam')?.classList.remove('active');
          if (this.trackRenderer) this.trackRenderer.followCar = false;
        }
        return;
      }

      if (e.button !== 0 || !this.track) return;

      // 1. Check if user clicked inside top-left On-Canvas Wind Compass
      if (this.isPointInCompass(sx, sy)) {
        this.isDraggingCompass = true;
        this.updateCompassAngleFromScreen(sx, sy);
        return;
      }

      // 2. Check if user clicked on an existing wet zone, cloud cell, or track node
      const hitWetIdx = this.getClosestWetZoneIndex(wx, wy);
      const hitCloudIdx = this.getClosestCloudIndex(wx, wy);
      const hitRadius = this.getHitRadiusWorld();
      const hitNodeIdx = typeof this.track.getClosestNode === 'function'
        ? extractNodeIndex(this.track.getClosestNode(wx, wy, hitRadius))
        : -1;

      const activeTool = this.editorState?.activeTool || this.editorTool;

      if (activeTool === 'place_wet') {
        if (hitWetIdx >= 0) {
          this.weather.selectedWetZoneIndex = hitWetIdx;
          this.draggingWetZoneIndex = hitWetIdx;
          const wz = this.weather.wetZones[hitWetIdx];
          this.wetZoneDragOffset = { x: wx - wz.x, y: wy - wz.y };
          this.syncWeatherUI();
          return;
        }
        // Place a new localized wet zone at clicked world coordinate
        if (!Array.isArray(this.weather.wetZones)) {
          this.weather.wetZones = [];
        }
        const newWetZone = {
          id: 'wz-' + Date.now(),
          x: wx,
          y: wy,
          radius: 195,
          intensity: this.weather.defaultWetIntensity || 0.75
        };
        this.weather.wetZones.push(newWetZone);
        this.weather.selectedWetZoneIndex = this.weather.wetZones.length - 1;
        this.draggingWetZoneIndex = this.weather.selectedWetZoneIndex;
        this.wetZoneDragOffset = { x: 0, y: 0 };
        document.getElementById('btn-weather-best')?.classList.remove('active');
        this.syncWeatherUI();
        this.runInstantOptimization(false);
        return;
      }

      if (activeTool === 'place_cloud') {
        if (hitCloudIdx >= 0) {
          this.weather.selectedCloudIndex = hitCloudIdx;
          this.draggingCloudIndex = hitCloudIdx;
          const c = this.weather.clouds[hitCloudIdx];
          this.cloudDragOffset = { x: wx - c.x, y: wy - c.y };
          return;
        }
        // Add new volumetric cloud cell at clicked world coordinate
        const newCloud = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          x: wx,
          y: wy,
          radius: 220,
          density: 0.8,
          tempDropC: 8,
          moisture: 0.4
        };
        this.weather.clouds.push(newCloud);
        this.weather.selectedCloudIndex = this.weather.clouds.length - 1;
        this.draggingCloudIndex = this.weather.selectedCloudIndex;
        this.cloudDragOffset = { x: 0, y: 0 };
        document.getElementById('btn-weather-best')?.classList.remove('active');
        this.syncWeatherUI();
        this.runInstantOptimization(false);
        return;
      }

      if (hitWetIdx >= 0 && hitNodeIdx < 0) {
        if (activeTool === 'delete') {
          this.removeWetZoneAtIndex(hitWetIdx);
          return;
        }
        this.weather.selectedWetZoneIndex = hitWetIdx;
        this.draggingWetZoneIndex = hitWetIdx;
        const wz = this.weather.wetZones[hitWetIdx];
        this.wetZoneDragOffset = { x: wx - wz.x, y: wy - wz.y };
        this.syncWeatherUI();
        return;
      }

      if (hitCloudIdx >= 0 && hitNodeIdx < 0) {
        if (activeTool === 'delete') {
          this.removeCloudAtIndex(hitCloudIdx);
          return;
        }
        this.weather.selectedCloudIndex = hitCloudIdx;
        this.draggingCloudIndex = hitCloudIdx;
        const c = this.weather.clouds[hitCloudIdx];
        this.cloudDragOffset = { x: wx - c.x, y: wy - c.y };
        return;
      }

      // Custom Draw Blank Track Mode: clicking adds sequential nodes unless dragging an existing node
      if (this.isCustomDrawing) {
        if (hitNodeIdx >= 0 && e.shiftKey) {
          this.toggleNodeModeAtIndex(hitNodeIdx);
          return;
        }
        if (hitNodeIdx >= 0 && activeTool === 'select') {
          this.selectedNodeIndex = hitNodeIdx;
          this.draggingNodeIndex = hitNodeIdx;
          this.updateNodeInspectorUI();
          return;
        }
        const mode = (e.shiftKey || activeTool === 'add_straight') ? 'straight' : 'spline';
        this.addNodeToTrack(wx, wy, mode, 14);
        return;
      }

      // Shift+Click on any node toggles Spline <-> Straight immediately
      if (hitNodeIdx >= 0 && e.shiftKey) {
        this.toggleNodeModeAtIndex(hitNodeIdx);
        return;
      }

      // Tool-specific left-click behavior
      if (activeTool === 'delete') {
        if (hitNodeIdx >= 0) {
          this.deleteNodeAtIndex(hitNodeIdx);
        } else if (hitWetIdx >= 0) {
          this.removeWetZoneAtIndex(hitWetIdx);
        } else if (hitCloudIdx >= 0) {
          this.removeCloudAtIndex(hitCloudIdx);
        }
        return;
      }

      if (activeTool === 'add_spline' || activeTool === 'add_straight') {
        const mode = activeTool === 'add_straight' ? 'straight' : 'spline';
        if (hitNodeIdx >= 0) {
          this.selectedNodeIndex = hitNodeIdx;
          this.draggingNodeIndex = hitNodeIdx;
          this.updateNodeInspectorUI();
        } else {
          this.insertNodeAlongCircuit(wx, wy, mode);
        }
        return;
      }

      // Default 'select' tool
      if (hitNodeIdx >= 0) {
        this.selectedNodeIndex = hitNodeIdx;
        this.draggingNodeIndex = hitNodeIdx;
        this.weather.selectedCloudIndex = -1;
        this.weather.selectedWetZoneIndex = -1;
        this.updateNodeInspectorUI();
      } else {
        this.weather.selectedCloudIndex = -1;
        this.weather.selectedWetZoneIndex = -1;
        // Clicking empty space in 'select' mode starts camera pan
        this.isPanning = true;
        this.panStartScreen = { x: sx, y: sy };
        this.panStartCam = {
          x: this.trackRenderer?.camX || 0,
          y: this.trackRenderer?.camY || 0
        };
      }
    }

    onCanvasMouseMove(e) {
      const canvas = document.getElementById('track-canvas');
      if (!canvas) return;
      const { sx, sy, wx, wy } = this.getCanvasCoords(e);

      // 0. On-Canvas Wind Compass live rotation
      if (this.isDraggingCompass) {
        this.stopProgressiveOptimization();
        this.updateCompassAngleFromScreen(sx, sy);
        return;
      }

      // 1. Live Wet Zone dragging
      if (this.draggingWetZoneIndex >= 0 && this.weather.wetZones?.[this.draggingWetZoneIndex]) {
        this.stopProgressiveOptimization();
        const wz = this.weather.wetZones[this.draggingWetZoneIndex];
        wz.x = wx - (this.wetZoneDragOffset?.x || 0);
        wz.y = wy - (this.wetZoneDragOffset?.y || 0);
        this.runInstantOptimization(true);
        return;
      }

      // 1.5. Live Cloud Cell dragging
      if (this.draggingCloudIndex >= 0 && this.weather.clouds?.[this.draggingCloudIndex]) {
        this.stopProgressiveOptimization();
        const cloud = this.weather.clouds[this.draggingCloudIndex];
        cloud.x = wx - (this.cloudDragOffset?.x || 0);
        cloud.y = wy - (this.cloudDragOffset?.y || 0);
        this.runInstantOptimization(true);
        return;
      }

      // 2. Camera panning
      if (this.isPanning && this.trackRenderer) {
        const zoom = this.trackRenderer.zoom || 1.0;
        const dx = (sx - this.panStartScreen.x) / zoom;
        const dy = (sy - this.panStartScreen.y) / zoom;
        this.trackRenderer.camX = this.panStartCam.x - dx;
        this.trackRenderer.camY = this.panStartCam.y - dy;
        return;
      }

      // 3. Live node dragging -> real-time track rebuild & AI optimization
      if (this.draggingNodeIndex >= 0 && this.track?.nodes?.[this.draggingNodeIndex]) {
        this.stopProgressiveOptimization();
        const node = this.track.nodes[this.draggingNodeIndex];
        node.x = wx;
        node.y = wy;
        this.track.rebuild?.();
        this.runInstantOptimization(true);
        return;
      }

      // 4. Hover detection when not dragging
      const rect = canvas.getBoundingClientRect();
      const insideCanvas = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );

      if (!insideCanvas || !this.track) {
        this.hoveredNodeIndex = -1;
        this.weather.hoveredCloudIndex = -1;
        this.weather.hoveredWetZoneIndex = -1;
        this.hoverSegmentPreview = null;
        return;
      }

      this.weather.hoveredWetZoneIndex = this.getClosestWetZoneIndex(wx, wy);
      this.weather.hoveredCloudIndex = this.getClosestCloudIndex(wx, wy);

      const hitRadius = this.getHitRadiusWorld();
      this.hoveredNodeIndex = typeof this.track.getClosestNode === 'function'
        ? extractNodeIndex(this.track.getClosestNode(wx, wy, hitRadius))
        : -1;

      if ((this.editorTool === 'add_spline' || this.editorTool === 'add_straight') && this.hoveredNodeIndex < 0) {
        if (this.isCustomDrawing) {
          this.hoverSegmentPreview = {
            x: wx,
            y: wy,
            mode: this.editorTool === 'add_straight' ? 'straight' : 'spline'
          };
        } else if (typeof this.track.getClosestSample === 'function') {
          const closest = this.track.getClosestSample(wx, wy);
          if (closest && (closest.dist === undefined || closest.dist < 85)) {
            this.hoverSegmentPreview = {
              x: closest.x ?? (closest.sample ? closest.sample.x : wx),
              y: closest.y ?? (closest.sample ? closest.sample.y : wy),
              mode: this.editorTool === 'add_straight' ? 'straight' : 'spline'
            };
          } else {
            this.hoverSegmentPreview = null;
          }
        }
      } else {
        this.hoverSegmentPreview = null;
      }
    }

    onCanvasMouseUp() {
      if (this.isDraggingCompass) {
        this.isDraggingCompass = false;
        this.runInstantOptimization(false);
      }
      if (this.draggingWetZoneIndex >= 0) {
        this.draggingWetZoneIndex = -1;
        this.runInstantOptimization(false);
      }
      if (this.draggingCloudIndex >= 0) {
        this.draggingCloudIndex = -1;
        this.runInstantOptimization(false);
      }
      if (this.draggingNodeIndex >= 0) {
        this.draggingNodeIndex = -1;
        // Run full-precision optimization pass upon releasing node
        this.runInstantOptimization(false);
      }
      this.isPanning = false;
    }

    onCanvasDoubleClick(e) {
      if (!this.track) return;
      const { wx, wy } = this.getCanvasCoords(e);
      const hitRadius = this.getHitRadiusWorld();
      const hitNodeIdx = typeof this.track.getClosestNode === 'function'
        ? extractNodeIndex(this.track.getClosestNode(wx, wy, hitRadius))
        : -1;

      if (hitNodeIdx >= 0) {
        this.toggleNodeModeAtIndex(hitNodeIdx);
      } else if (!this.isCustomDrawing) {
        this.insertNodeAlongCircuit(wx, wy, e.shiftKey ? 'straight' : 'spline');
      }
    }

    onCanvasWheel(e) {
      e.preventDefault();
      if (!this.trackRenderer) return;

      const { sx, sy } = this.getCanvasCoords(e);
      const zoomFactor = e.deltaY < 0 ? 1.13 : (1 / 1.13);

      if (typeof this.trackRenderer.zoomAt === 'function' && !this.followCar) {
        this.trackRenderer.zoomAt(sx, sy, zoomFactor);
      } else {
        this.trackRenderer.zoom = clamp((this.trackRenderer.zoom || 1.0) * zoomFactor, 0.25, 20.0);
      }
    }

    toggleNodeModeAtIndex(index) {
      if (!this.track?.nodes?.[index]) return;
      if (typeof this.track.toggleNodeMode === 'function') {
        this.track.toggleNodeMode(index);
      } else {
        const node = this.track.nodes[index];
        node.mode = node.mode === 'straight' ? 'spline' : 'straight';
        this.track.rebuild?.();
      }
      this.selectedNodeIndex = index;
      this.updateNodeInspectorUI();
      this.runInstantOptimization();
    }

    addNodeToTrack(wx, wy, mode = 'spline', width = 14) {
      if (!this.track) return;
      if (typeof this.track.addNode === 'function') {
        this.track.addNode(wx, wy, mode, width);
      } else {
        this.track.nodes.push({ x: wx, y: wy, mode, width, tension: 0.5, cornerRadius: 28 });
        this.track.rebuild?.();
      }
      this.selectedNodeIndex = this.track.nodes.length - 1;
      this.updateNodeInspectorUI();
      if (this.track.nodes.length >= 3) {
        this.runInstantOptimization();
      } else {
        this.updateTrackStatsUI();
      }
    }

    insertNodeAlongCircuit(wx, wy, mode = 'spline') {
      if (!this.track) return;
      let insertedIdx = -1;
      if (typeof this.track.insertNodeOnSegment === 'function') {
        const res = this.track.insertNodeOnSegment(wx, wy, mode);
        insertedIdx = extractNodeIndex(res);
      } else {
        this.addNodeToTrack(wx, wy, mode, 14);
        insertedIdx = this.track.nodes.length - 1;
      }

      if (insertedIdx >= 0) {
        this.selectedNodeIndex = insertedIdx;
        this.draggingNodeIndex = insertedIdx;
      }
      this.updateNodeInspectorUI();
      this.runInstantOptimization();
    }

    // =========================================================================
    // TELEMETRY DECK HOVER / SCRUB CALLBACK
    // =========================================================================

    handleTelemetryHover(stationIdx, stationObj) {
      if (typeof stationIdx === 'number' && stationIdx >= 0) {
        this.hoveredStationIndex = stationIdx;
        this.hoverTelemetryDistance = stationObj ? stationObj.s : null;
      } else {
        this.hoveredStationIndex = null;
        this.hoverTelemetryDistance = null;
      }
    }

    // =========================================================================
    // KEYBOARD SHORTCUTS & JSON EXPORT/IMPORT
    // =========================================================================

    bindKeyboardEvents() {
      window.addEventListener('keydown', (e) => {
        if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

        if (e.code === 'Space') {
          this.spacePressed = true;
          if (!this.isPanning) {
            e.preventDefault();
            this.togglePlayPause();
          }
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          if (this.weather.selectedWetZoneIndex >= 0 && this.weather.wetZones?.[this.weather.selectedWetZoneIndex]) {
            this.removeWetZoneAtIndex(this.weather.selectedWetZoneIndex);
          } else if (this.weather.selectedCloudIndex >= 0 && this.weather.clouds?.[this.weather.selectedCloudIndex]) {
            this.removeCloudAtIndex(this.weather.selectedCloudIndex);
          } else if (this.selectedNodeIndex >= 0) {
            this.deleteNodeAtIndex(this.selectedNodeIndex);
          }
        } else if (e.key === 'f' || e.key === 'F') {
          this.fitCameraToTrack();
        } else if (e.key === '1') {
          this.setEditorTool('select');
        } else if (e.key === '2') {
          this.setEditorTool('add_spline');
        } else if (e.key === '3') {
          this.setEditorTool('add_straight');
        } else if (e.key === '4') {
          this.setEditorTool('delete');
        } else if (e.key === '5' || e.key === 'c' || e.key === 'C') {
          this.setEditorTool(this.editorTool === 'place_cloud' ? 'select' : 'place_cloud');
        } else if (e.key === '6' || e.key === 'w' || e.key === 'W') {
          this.setEditorTool(this.editorTool === 'place_wet' ? 'select' : 'place_wet');
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
          this.spacePressed = false;
        }
      });
    }

    exportTrackJSON() {
      if (!this.track) return;
      const trackData = typeof this.track.toJSON === 'function'
        ? this.track.toJSON()
        : { name: 'Custom Circuit', nodes: this.track.nodes };

      const payload = {
        app: 'APEX//AI Circuit & Telemetry Simulator',
        exportedAt: new Date().toISOString(),
        trackPreset: this.activeTrackKey,
        carPreset: this.activeCarKey,
        carParams: this.carParams,
        weather: this.weather,
        track: trackData
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apex-ai-circuit-${this.activeTrackKey}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    importTrackJSON(e) {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          const trackPayload = data.track || data;
          if (trackPayload && Array.isArray(trackPayload.nodes) && trackPayload.nodes.length >= 3) {
            if (typeof this.track.fromJSON === 'function') {
              this.track.fromJSON(trackPayload);
            } else {
              this.track.nodes = trackPayload.nodes;
              this.track.rebuild?.();
            }
            if (data.carParams) {
              this.carParams = { ...this.carParams, ...data.carParams };
              this.syncSlidersFromCarParams();
            }
            if (data.weather) {
              this.weather = { ...this.weather, ...data.weather };
              this.syncWeatherUI();
            }
            this.isCustomDrawing = false;
            document.getElementById('custom-draw-banner')?.classList.add('hidden');
            this.selectedNodeIndex = 0;
            this.fitCameraToTrack();
            this.updateNodeInspectorUI();
            this.runInstantOptimization();
          }
        } catch (err) {
          console.error('Failed to import circuit JSON:', err);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    }

    // =========================================================================
    // VIEWPORT RESIZE & 60FPS SIMULATION / RENDER LOOP
    // =========================================================================

    handleResize() {
      if (this.trackRenderer && typeof this.trackRenderer.resize === 'function') {
        this.trackRenderer.resize();
      }
      if (this.telemetryRenderer && typeof this.telemetryRenderer.resize === 'function') {
        this.telemetryRenderer.resize();
      }
    }

    tick(timestamp) {
      const dtMs = Math.min(100, Math.max(0, timestamp - this.lastFrameTime));
      this.lastFrameTime = timestamp;
      const dtSec = dtMs / 1000;

      // 1. Progressive AI Solver Step (if active)
      if (this.isOptimizing && this.progressiveSession) {
        const stepRes = this.progressiveSession.step(6);
        this.optimalResult = normalizeResult(stepRes, this.carParams);
        this.optimizationProgress = this.progressiveSession.getProgress
          ? this.progressiveSession.getProgress()
          : 0.5;
        this.updateTelemetryUI();

        if (this.progressiveSession.isDone && this.progressiveSession.isDone()) {
          this.stopProgressiveOptimization();
          this.computeGhostResult();
          this.updateTelemetryUI();
        }
      }

      // 2. Advance simulated vehicle clock
      if (this.isPlaying && this.optimalResult && this.optimalResult.lapTime > 0) {
        this.simTime += dtSec * this.simSpeed;
      }

      // 3. Sample primary car and ghost car positions
      let primarySample = null;
      let ghostSample = null;
      let hoverSample = null;

      if (this.optimalResult) {
        if (this.hoveredStationIndex !== null && this.optimalResult.samples?.[this.hoveredStationIndex]) {
          hoverSample = this.optimalResult.samples[this.hoveredStationIndex];
        }
        if (this.optimalResult.sampleAtTime) {
          primarySample = this.optimalResult.sampleAtTime(this.simTime);
        }
      }

      if (this.ghostResult && this.ghostResult.sampleAtTime) {
        ghostSample = this.ghostResult.sampleAtTime(this.simTime);
      }

      const activeDisplaySample = hoverSample || primarySample;
      if (activeDisplaySample) {
        this.updateLiveCarHUD(activeDisplaySample);
      }

      // Build formatted car state objects for TrackRenderer & TelemetryRenderer
      let primaryCarRenderObj = null;
      if (primarySample) {
        let deltaTime = undefined;
        if (this.ghostResult && this.ghostResult.sampleAtDistance) {
          const ghostAtSameDist = this.ghostResult.sampleAtDistance(primarySample.s);
          if (ghostAtSameDist && Number.isFinite(ghostAtSameDist.time)) {
            deltaTime = primarySample.time - ghostAtSameDist.time;
          }
        }
        primaryCarRenderObj = {
          ...primarySample,
          heading: primarySample.tangentAngle ?? primarySample.heading,
          bodyHeading: primarySample.heading,
          color: this.carParams.color || '#ef4444',
          deltaTime
        };
      }

      let ghostCarRenderObj = null;
      if (this.showGhostLine && ghostSample && this.ghostCarParams) {
        ghostCarRenderObj = {
          ...ghostSample,
          heading: ghostSample.tangentAngle ?? ghostSample.heading,
          bodyHeading: ghostSample.heading,
          color: this.ghostCarParams.color || '#a855f7'
        };
      }

      const rendererColorMode = this.colorMode === 'pedals' ? 'brake_throttle' : this.colorMode;

      const showDryLine = (this.viewOptions?.showDryLine !== false) && (this.showDryLine !== false);

      // 4. Build unified render state object matching TrackRenderer and TelemetryRenderer
      const renderState = {
        track: this.track,
        optimalResult: this.optimalResult,
        dryReferenceResult: showDryLine ? this.dryReferenceResult : null,
        centerlineResult: this.centerlineResult,
        ghostResult: this.showGhostLine ? this.ghostResult : null,
        car: this.carParams,
        weather: this.weather,

        simState: {
          primaryCar: primaryCarRenderObj,
          car: primaryCarRenderObj,
          ghostCar: ghostCarRenderObj,
          inspectedStation: this.hoveredStationIndex,
          simTime: this.simTime
        },

        editorState: {
          active: this.showNodes,
          mode: this.editorTool,
          activeTool: this.editorTool,
          selectedNodeIndex: this.selectedNodeIndex,
          hoveredNodeIndex: this.hoveredNodeIndex,
          selectedCloudIndex: this.weather.selectedCloudIndex,
          hoveredCloudIndex: this.weather.hoveredCloudIndex,
          selectedWetZoneIndex: this.weather.selectedWetZoneIndex,
          hoveredWetZoneIndex: this.weather.hoveredWetZoneIndex,
          ghostNode: this.hoverSegmentPreview,
          previewNode: this.hoverSegmentPreview
        },

        viewOptions: {
          colorMode: rendererColorMode,
          showNodes: this.showNodes,
          showApexes: this.showApexes,
          showCenterline: this.showCenterline,
          showDryLine: showDryLine,
          showGhostLine: this.showGhostLine,
          showVectors: this.showVectors,
          followCar: this.followCar
        }
      };

      // 5. Render 2D Circuit Viewport & Telemetry Deck
      if (this.trackRenderer && typeof this.trackRenderer.render === 'function') {
        this.trackRenderer.render(renderState);
      }
      if (this.telemetryRenderer && typeof this.telemetryRenderer.render === 'function') {
        this.telemetryRenderer.render(renderState);
      }

      requestAnimationFrame((ts) => this.tick(ts));
    }
  }

  // Initialize when DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    const app = new ApexSimulatorApp();
    window.App.instance = app;
    app.init();
  });
})();
