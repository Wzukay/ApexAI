/**
 * presets.js
 * Vehicle physics presets and iconic circuit layouts for the Racing Line & Telemetry Simulator.
 */
window.App = window.App || {};

/**
 * Pirelli F1 Tire Compound Presets (Slicks C1–C5, Intermediate Green, Full Wet Blue)
 * Defines compound softness, tread depth, inflation pressure, dry/damp/wet grip multipliers,
 * hydroplaning threshold speed, water clearance capacity, rolling resistance, and optimal temperature.
 */
window.App.TIRE_PRESETS = {
  c1: {
    id: 'c1',
    code: 'C1',
    name: 'Pirelli P Zero C1 (Hard)',
    shortName: 'C1 Hard',
    type: 'slick',
    color: '#f8fafc',
    accentColor: '#cbd5e1',
    softness: 0.10,
    treadDepthMm: 0.0,
    defaultPressurePsi: 23.5,
    dryGripMul: 0.935,
    dampGripMul: 0.50,
    wetGripMul: 0.27,
    hydroplaneSpeedKmh: 155,
    waterClearanceLps: 0,
    rollingResistanceMul: 0.95,
    optimalTempC: 105,
    description: 'Hardest slick compound. Maximum thermal resistance for high-load fast circuits, lower peak mechanical grip.'
  },

  c2: {
    id: 'c2',
    code: 'C2',
    name: 'Pirelli P Zero C2 (Med-Hard)',
    shortName: 'C2 Med-Hard',
    type: 'slick',
    color: '#f1f5f9',
    accentColor: '#94a3b8',
    softness: 0.30,
    treadDepthMm: 0.0,
    defaultPressurePsi: 23.0,
    dryGripMul: 0.968,
    dampGripMul: 0.53,
    wetGripMul: 0.28,
    hydroplaneSpeedKmh: 155,
    waterClearanceLps: 0,
    rollingResistanceMul: 0.97,
    optimalTempC: 100,
    description: 'Versatile hard-spectrum slick for high-speed sweepers and warm track temperatures.'
  },

  c3: {
    id: 'c3',
    code: 'C3',
    name: 'Pirelli P Zero C3 (Medium)',
    shortName: 'C3 Medium',
    type: 'slick',
    color: '#facc15',
    accentColor: '#eab308',
    softness: 0.50,
    treadDepthMm: 0.0,
    defaultPressurePsi: 22.5,
    dryGripMul: 1.000,
    dampGripMul: 0.55,
    wetGripMul: 0.29,
    hydroplaneSpeedKmh: 155,
    waterClearanceLps: 0,
    rollingResistanceMul: 1.00,
    optimalTempC: 95,
    description: 'Balanced baseline medium slick. Ideal compromise between mechanical adhesion and lateral stiffness.'
  },

  c4: {
    id: 'c4',
    code: 'C4',
    name: 'Pirelli P Zero C4 (Soft)',
    shortName: 'C4 Soft',
    type: 'slick',
    color: '#ef4444',
    accentColor: '#dc2626',
    softness: 0.75,
    treadDepthMm: 0.0,
    defaultPressurePsi: 21.5,
    dryGripMul: 1.042,
    dampGripMul: 0.57,
    wetGripMul: 0.30,
    hydroplaneSpeedKmh: 152,
    waterClearanceLps: 0,
    rollingResistanceMul: 1.02,
    optimalTempC: 88,
    description: 'High-adhesion soft slick for traction-limited corners and sprint qualifying runs.'
  },

  c5: {
    id: 'c5',
    code: 'C5',
    name: 'Pirelli P Zero C5 (Quali Soft)',
    shortName: 'C5 Hypersoft',
    type: 'slick',
    color: '#f43f5e',
    accentColor: '#e11d48',
    softness: 1.00,
    treadDepthMm: 0.0,
    defaultPressurePsi: 21.0,
    dryGripMul: 1.080,
    dampGripMul: 0.58,
    wetGripMul: 0.30,
    hydroplaneSpeedKmh: 150,
    waterClearanceLps: 0,
    rollingResistanceMul: 1.04,
    optimalTempC: 82,
    description: 'Maximum-attack qualifying compound for street circuits and low-roughness tarmac. Peak dry grip.'
  },

  inter: {
    id: 'inter',
    code: 'INT',
    name: 'Pirelli Cinturato Green (Inter)',
    shortName: 'Inter (Green)',
    type: 'inter',
    color: '#22c55e',
    accentColor: '#16a34a',
    softness: 0.70,
    treadDepthMm: 4.5,
    defaultPressurePsi: 20.5,
    dryGripMul: 0.865,
    dampGripMul: 0.935,
    wetGripMul: 0.67,
    hydroplaneSpeedKmh: 228,
    waterClearanceLps: 35,
    rollingResistanceMul: 1.07,
    optimalTempC: 65,
    description: 'Channeled crossover tire evacuating 35 L/s. Dominates damp tracks and mixed wet/dry zones, but overheats on bone-dry tarmac.'
  },

  wet: {
    id: 'wet',
    code: 'WET',
    name: 'Pirelli Cinturato Blue (Full Wet)',
    shortName: 'Full Wet (Blue)',
    type: 'wet',
    color: '#3b82f6',
    accentColor: '#2563eb',
    softness: 0.85,
    treadDepthMm: 7.5,
    defaultPressurePsi: 19.5,
    dryGripMul: 0.745,
    dampGripMul: 0.860,
    wetGripMul: 0.865,
    hydroplaneSpeedKmh: 285,
    waterClearanceLps: 85,
    rollingResistanceMul: 1.16,
    optimalTempC: 48,
    description: 'Deep-grooved monsoon tire evacuating 85 L/s. Essential for heavy standing water and hydroplaning resistance, heavy squirm on dry asphalt.'
  }
};

/**
 * Detailed Vehicle Physics Presets
 * Includes mass, power, aerodynamics (Cl, Cd, frontalArea), tire friction (mu, front/rear grip),
 * geometry (wheelbase, trackWidth, cgHeight), braking, drivetrain, and visual styling.
 */
window.App.CAR_PRESETS = {
  street: {
    id: 'street',
    name: 'Stock Street Car',
    subtitle: 'Sports Coupe (375 hp)',
    category: 'Production',
    description: 'Balanced RWD production sports coupe on high-performance street tires. Moderate grip, minimal aero downforce, and noticeable weight transfer under braking.',
    color: '#3b82f6',
    mass: 1450,               // kg
    power: 280000,            // Watts (280 kW / ~375 hp)
    powerKw: 280,
    powerHp: 375,
    mu: 1.05,                 // Base mechanical tire friction coefficient at static weight
    Cl: 0.15,                 // Downforce coefficient
    Cd: 0.32,                 // Drag coefficient
    frontalArea: 2.10,        // m^2
    maxSteerAngle: 35,        // degrees road-wheel lock
    brakeBias: 0.63,          // Front brake proportion (0..1)
    cgHeight: 0.52,           // Center of gravity height (m)
    wheelbase: 2.70,          // m
    trackWidth: 1.58,         // m
    tireGripFront: 1.04,
    tireGripRear: 1.06,
    tireCompound: 'c3',
    defaultTireCompound: 'c3',
    maxBrakeForce: 15500,     // N
    topSpeedKmh: 265,         // km/h
    drivetrain: 'RWD',
    gears: 6,
    shiftTimeMs: 160,
    cornerAggression: 0.35,
    cornerWeightPenalty: 0.35
  },

  drift: {
    id: 'drift',
    name: 'Pro Drift Spec',
    subtitle: 'Formula Drift Chassis (870 hp)',
    category: 'Formula Drift',
    description: 'High-horsepower tube-frame drift machine with extreme 60° steering lock, front-biased grip, and intentionally loose rear traction for sustained high-angle slip.',
    color: '#ec4899',
    mass: 1250,
    power: 650000,            // Watts (650 kW / ~870 hp)
    powerKw: 650,
    powerHp: 870,
    mu: 1.15,
    Cl: 0.45,
    Cd: 0.44,
    frontalArea: 2.00,
    maxSteerAngle: 60,
    brakeBias: 0.68,
    cgHeight: 0.46,
    wheelbase: 2.65,
    trackWidth: 1.65,
    tireGripFront: 1.18,
    tireGripRear: 0.92,
    tireCompound: 'c3',
    defaultTireCompound: 'c3',
    maxBrakeForce: 14000,
    topSpeedKmh: 245,
    drivetrain: 'RWD',
    gears: 6,
    shiftTimeMs: 80,
    cornerAggression: 0.50,
    cornerWeightPenalty: 0.50
  },

  gt3: {
    id: 'gt3',
    name: 'GT3 Race Car',
    subtitle: 'FIA GT3 Spec (550 hp)',
    category: 'FIA GT3',
    description: 'Purpose-built FIA GT3 sprint & endurance racer featuring slick tires, swan-neck rear wing, front diffuser splitter, and high-efficiency carbon brakes.',
    color: '#10b981',
    mass: 1280,
    power: 410000,            // Watts (410 kW / ~550 hp)
    powerKw: 410,
    powerHp: 550,
    mu: 1.48,
    Cl: 1.40,
    Cd: 0.47,
    frontalArea: 1.98,
    maxSteerAngle: 30,
    brakeBias: 0.59,
    cgHeight: 0.38,
    wheelbase: 2.75,
    trackWidth: 1.68,
    tireGripFront: 1.48,
    tireGripRear: 1.50,
    tireCompound: 'c3',
    defaultTireCompound: 'c3',
    maxBrakeForce: 24000,
    topSpeedKmh: 295,
    drivetrain: 'RWD',
    gears: 6,
    shiftTimeMs: 40,
    cornerAggression: 0.75,
    cornerWeightPenalty: 0.75
  },

  lmp2: {
    id: 'lmp2',
    name: 'LMP2 Prototype',
    subtitle: 'Le Mans Prototype 2 (600 hp)',
    category: 'Le Mans Prototype',
    description: 'Lightweight closed-cockpit carbon monocoque prototype. Excels in medium- and high-speed sweeping corners thanks to strong underbody Venturi tunnels.',
    color: '#f59e0b',
    mass: 930,
    power: 450000,            // Watts (450 kW / ~600 hp)
    powerKw: 450,
    powerHp: 600,
    mu: 1.56,
    Cl: 2.25,
    Cd: 0.52,
    frontalArea: 1.72,
    maxSteerAngle: 26,
    brakeBias: 0.57,
    cgHeight: 0.31,
    wheelbase: 2.95,
    trackWidth: 1.65,
    tireGripFront: 1.56,
    tireGripRear: 1.58,
    tireCompound: 'c3',
    defaultTireCompound: 'c3',
    maxBrakeForce: 28000,
    topSpeedKmh: 330,
    drivetrain: 'RWD',
    gears: 6,
    shiftTimeMs: 30,
    cornerAggression: 0.65,
    cornerWeightPenalty: 0.65
  },

  wec: {
    id: 'wec',
    name: 'WEC Hypercar / LMH',
    subtitle: 'Le Mans Hypercar Hybrid (700 hp)',
    category: 'WEC Hypercar',
    description: 'Top-class FIA WEC endurance prototype combining AWD hybrid deployment, regulated ~4.6:1 L/D low-drag aero efficiency, and high-speed braking stability.',
    color: '#8b5cf6',
    mass: 1030,
    power: 520000,            // Watts (520 kW / ~700 hp)
    powerKw: 520,
    powerHp: 700,
    mu: 1.60,
    Cl: 2.45,
    Cd: 0.53,
    frontalArea: 1.75,
    maxSteerAngle: 25,
    brakeBias: 0.57,
    cgHeight: 0.30,
    wheelbase: 3.00,
    trackWidth: 1.70,
    tireGripFront: 1.60,
    tireGripRear: 1.62,
    tireCompound: 'c3',
    defaultTireCompound: 'c3',
    maxBrakeForce: 32000,
    topSpeedKmh: 345,
    drivetrain: 'AWD',
    gears: 7,
    shiftTimeMs: 22,
    cornerAggression: 0.65,
    cornerWeightPenalty: 0.65
  },

  f1: {
    id: 'f1',
    name: 'Formula 1 Car',
    subtitle: 'Modern Ground-Effect F1 (1000 hp)',
    category: 'FIA Formula 1',
    description: 'Pinnacle open-wheel single-seater. Generates ~5G in fast corners and 5.5G under initial braking via massive ground-effect downforce and Pirelli slicks.',
    color: '#ef4444',
    mass: 798,
    power: 745000,            // Watts (745 kW / ~1000 hp)
    powerKw: 745,
    powerHp: 1000,
    mu: 1.80,
    Cl: 3.55,
    Cd: 0.74,
    frontalArea: 1.50,
    maxSteerAngle: 22,
    brakeBias: 0.56,
    cgHeight: 0.25,
    wheelbase: 3.45,
    trackWidth: 1.80,
    tireGripFront: 1.80,
    tireGripRear: 1.84,
    tireCompound: 'c3',
    defaultTireCompound: 'c3',
    maxBrakeForce: 42000,
    topSpeedKmh: 360,
    drivetrain: 'RWD',
    gears: 8,
    shiftTimeMs: 12,
    cornerAggression: 0.55,
    cornerWeightPenalty: 0.55
  },

  kart: {
    id: 'kart',
    name: 'Shifter Kart KZ1',
    subtitle: '125cc 6-Speed KZ1 (48 hp)',
    category: 'KZ1 Karting',
    description: 'Featherweight 175 kg (with driver) 125cc 6-speed shifter kart. Pulls ~1.9G purely mechanically on soft kart slicks in tight hairpins, capped at 138 km/h on straights.',
    color: '#06b6d4',
    mass: 175,
    power: 35000,             // Watts (35 kW / ~48 hp)
    powerKw: 35,
    powerHp: 48,
    mu: 1.92,
    Cl: 0.00,
    Cd: 0.68,
    frontalArea: 0.72,
    maxSteerAngle: 35,
    brakeBias: 0.58,
    cgHeight: 0.24,
    wheelbase: 1.05,
    trackWidth: 1.20,
    tireGripFront: 1.90,
    tireGripRear: 1.94,
    tireCompound: 'c3',
    defaultTireCompound: 'c3',
    maxBrakeForce: 2800,
    topSpeedKmh: 138,
    drivetrain: 'RWD',
    gears: 6,
    shiftTimeMs: 45,
    cornerAggression: 0.85,
    cornerWeightPenalty: 0.85
  },

  timeattack: {
    id: 'timeattack',
    name: 'Unlimited Time Attack',
    subtitle: 'WTAC Pro-Class AWD (1050 hp)',
    category: 'WTAC Unlimited',
    description: 'Extreme aero monster built with zero rulebook restrictions. Massive triple-element front & rear wings coupled with 1050 hp AWD launch capability.',
    color: '#eab308',
    mass: 1050,
    power: 780000,            // Watts (780 kW / ~1050 hp)
    powerKw: 780,
    powerHp: 1050,
    mu: 1.70,
    Cl: 2.95,
    Cd: 0.72,
    frontalArea: 1.90,
    maxSteerAngle: 30,
    brakeBias: 0.58,
    cgHeight: 0.34,
    wheelbase: 2.72,
    trackWidth: 1.72,
    tireGripFront: 1.70,
    tireGripRear: 1.72,
    tireCompound: 'c3',
    defaultTireCompound: 'c3',
    maxBrakeForce: 34000,
    topSpeedKmh: 325,
    drivetrain: 'AWD',
    gears: 6,
    shiftTimeMs: 28,
    cornerAggression: 0.70,
    cornerWeightPenalty: 0.70
  }
};

/**
 * Iconic Circuit Layout Presets (in world meters, centered around (0, 0))
 * Each node defines:
 *   x, y: centerline control point in meters
 *   width: track width in meters (typically 10 - 16m)
 *   mode: 'spline' (smooth flowing curve) or 'straight' (linear straight section with filleted vertex transitions)
 *   tension: spline tension factor (default 0.5)
 *   cornerRadius: fillet radius in meters when transitioning into/out of straight nodes
 */
window.App.TRACK_PRESETS = {
  spa_francorchamps: {
    id: 'spa_francorchamps',
    name: 'Circuit de Spa-Francorchamps',
    subtitle: 'Belgian Grand Prix — Ardennes Rollercoaster (7.00 km)',
    country: 'Belgium',
    description: 'The legendary 7.00 km Ardennes forest circuit. Features the tight La Source hairpin, the flat-out Eau Rouge / Raidillon sequence onto the Kemmel Straight, Les Combes chicane, Bruxelles 180° sweeper, high-speed double-apex Pouhon, Stavelot, flat-out Blanchimont, and the tight Bus Stop chicane.',
    defaultWidth: 14,
    nodes: [
      // Pit Straight heading North-West towards La Source
      { x: -595, y:  335, width: 14.5, mode: 'straight', tension: 0.5, cornerRadius: 22 },
      { x: -950, y:   55, width: 14.5, mode: 'spline',   tension: 0.45, cornerRadius: 15 },
      // Turn 1: La Source Tight Right Hairpin
      { x: -955, y:  -80, width: 14.0, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      // Downhill run toward Eau Rouge creek
      { x: -620, y:   12, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 36 },
      // Turns 2-3-4: Eau Rouge & Raidillon High-Speed Left-Right-Left Uphill Sweep
      { x: -475, y:  -30, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 44 },
      { x: -365, y: -200, width: 14.0, mode: 'straight', tension: 0.5, cornerRadius: 48 },
      // Kemmel Straight (~980m full-throttle blast heading North-East)
      { x:  490, y: -680, width: 14.5, mode: 'spline',   tension: 0.45, cornerRadius: 20 },
      // Turns 5-6-7: Les Combes & Malmedy Right-Left-Right Chicane
      { x:  645, y: -685, width: 13.5, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      { x:  730, y: -560, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      { x:  895, y: -530, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 30 },
      // Turn 8: Bruxelles (Rivage) 180-degree downhill sweeping right-hander
      { x: 1000, y: -325, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 30 },
      { x:  775, y: -210, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 26 },
      // Turn 9 (Speaker's Corner left) & downhill approach to Pouhon
      { x:  555, y: -275, width: 13.5, mode: 'straight', tension: 0.5, cornerRadius: 28 },
      { x:  255, y:  -80, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 42 },
      // Turns 10-11: Pouhon Iconic High-Speed Double-Apex Left-Hander
      { x:  320, y:  175, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 44 },
      { x:  595, y:  260, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 32 },
      // Turns 12-13: Les Fagnes / Campus Right-Left Pif-Paf
      { x:  825, y:  210, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 26 },
      { x:  955, y:  380, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      // Turns 14-15: Stavelot & Paul Frere Curve launching onto back section
      { x:  840, y:  610, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 36 },
      { x:  530, y:  650, width: 14.0, mode: 'straight', tension: 0.5, cornerRadius: 48 },
      // Turns 16-17: Courbe Paul Frere & Blanchimont Flat-Out High-Speed Lefts
      { x:  -20, y:  585, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 55 },
      { x: -355, y:  520, width: 14.5, mode: 'spline',   tension: 0.45, cornerRadius: 20 },
      // Turns 18-19: Bus Stop Chicane (Heavy Braking Right-Left)
      { x: -510, y:  535, width: 13.0, mode: 'spline',   tension: 0.45, cornerRadius: 16 },
      { x: -500, y:  405, width: 13.5, mode: 'spline',   tension: 0.45, cornerRadius: 18 }
    ]
  },

  monza_temple: {
    id: 'monza_temple',
    name: 'Autodromo Nazionale Monza',
    subtitle: 'Italian Grand Prix — Temple of Speed (5.79 km)',
    country: 'Italy',
    description: 'The historic 5.79 km Temple of Speed in Royal Park Monza. Features the 1.1 km Rettifilo main straight into the tight Variante del Rettifilo chicane, flat-out Curva Grande, Variante della Roggia, double-right Lesmo corners, Serraglio straight, rapid Variante Ascari chicane, and iconic Curva Parabolica (Alboreto).',
    defaultWidth: 13.5,
    nodes: [
      // Main Rettifilo Tribune Straight (heading East, ~1.15 km)
      { x: -775, y:  575, width: 15.0, mode: 'straight', tension: 0.5, cornerRadius: 36 },
      { x:  725, y:  575, width: 14.0, mode: 'spline',   tension: 0.45, cornerRadius: 16 },
      // Turns 1-2: Variante del Rettifilo (Tight Right-Left Chicane)
      { x:  870, y:  495, width: 11.5, mode: 'spline',   tension: 0.45, cornerRadius: 14 },
      { x:  815, y:  365, width: 11.5, mode: 'spline',   tension: 0.45, cornerRadius: 22 },
      // Turn 3: Curva Grande (Biassono) Fast Sweeping Right-Hander
      { x: 1005, y:   35, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 54 },
      { x:  885, y: -340, width: 13.5, mode: 'spline',   tension: 0.45, cornerRadius: 22 },
      // Turns 4-5: Variante della Roggia (Left-Right Chicane)
      { x:  735, y: -445, width: 12.0, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      { x:  670, y: -590, width: 12.5, mode: 'spline',   tension: 0.5, cornerRadius: 26 },
      // Turns 6-7: Curva di Lesmo 1 & Lesmo 2 (Double Right-Handers)
      { x:  430, y: -675, width: 12.5, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      { x:  190, y: -485, width: 13.0, mode: 'straight', tension: 0.5, cornerRadius: 30 },
      // Curva del Serraglio Straight down to Ascari
      { x: -385, y: -155, width: 13.5, mode: 'spline',   tension: 0.45, cornerRadius: 26 },
      // Turns 8-9-10: Variante Ascari (Fast Flowing Left-Right-Left Sequence)
      { x: -550, y: -275, width: 12.5, mode: 'spline',   tension: 0.5, cornerRadius: 26 },
      { x: -735, y: -195, width: 13.5, mode: 'straight', tension: 0.5, cornerRadius: 32 },
      // Back Straight heading to Parabolica (~950m)
      { x: -1005, y: 260, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 40 },
      // Turn 11: Curva Parabolica / Alboreto (Opening-Radius 180° Right Sweeper)
      { x: -970, y:  495, width: 15.0, mode: 'spline',   tension: 0.5, cornerRadius: 48 }
    ]
  },

  silverstone_gp: {
    id: 'silverstone_gp',
    name: 'Silverstone Circuit',
    subtitle: 'British Grand Prix — High-Speed Aero Benchmark (5.89 km)',
    country: 'Great Britain',
    description: 'Home of the British Grand Prix (5.89 km). Combines the flat-out Abbey/Farm entry, technical Village/Loop complex, Wellington Straight, Brooklands/Luffield, high-G Copse corner, iconic Maggotts–Becketts–Chapel S-curves, Hangar Straight, Stowe, and Vale/Club chicane.',
    defaultWidth: 15,
    nodes: [
      // Hamilton Straight (heading North-East)
      { x: -380, y:  470, width: 15.5, mode: 'straight', tension: 0.5, cornerRadius: 32 },
      { x:   75, y:  285, width: 15.5, mode: 'spline',   tension: 0.5, cornerRadius: 38 },
      // Turn 1-2: Abbey (fast right) & Farm Curve (sweeping left)
      { x:  255, y:  315, width: 15.0, mode: 'spline',   tension: 0.5, cornerRadius: 32 },
      { x:  365, y:  175, width: 14.5, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      // Turn 3-4-5: Village (slow right), The Loop (tight left hairpin) & Aintree
      { x:  255, y:   45, width: 14.0, mode: 'spline',   tension: 0.45, cornerRadius: 16 },
      { x:  105, y:   95, width: 14.5, mode: 'straight', tension: 0.5, cornerRadius: 30 },
      // Wellington Straight (heading West-North-West into Brooklands)
      { x: -455, y:   15, width: 15.0, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      // Turn 6-7: Brooklands (left) & Luffield (long wrap-around right hairpin)
      { x: -645, y: -115, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      { x: -475, y: -225, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      // Turn 8: Woodcote (fast right past National Pits onto old pit straight)
      { x: -345, y: -335, width: 15.0, mode: 'straight', tension: 0.5, cornerRadius: 36 },
      { x: -115, y: -565, width: 15.0, mode: 'spline',   tension: 0.5, cornerRadius: 38 },
      // Turn 9: Copse (High-Speed 290 km/h Right-Hander)
      { x:  145, y: -575, width: 15.0, mode: 'spline',   tension: 0.5, cornerRadius: 36 },
      // Turns 10-14: Maggotts, Becketts & Chapel (Iconic High-Speed Left-Right-Left-Right Esses)
      { x:  310, y: -425, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      { x:  485, y: -455, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 26 },
      { x:  575, y: -285, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      { x:  725, y: -245, width: 15.0, mode: 'straight', tension: 0.5, cornerRadius: 38 },
      // Hangar Straight (~820m heading South)
      { x:  655, y:  435, width: 15.5, mode: 'spline',   tension: 0.5, cornerRadius: 34 },
      // Turn 15: Stowe (Fast Right-Hander)
      { x:  435, y:  575, width: 15.0, mode: 'straight', tension: 0.5, cornerRadius: 28 },
      // Approach to Vale Chicane
      { x:   45, y:  535, width: 14.5, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      // Turns 16-17-18: Vale & Club Corner onto Hamilton Straight
      { x: -115, y:  615, width: 14.0, mode: 'spline',   tension: 0.45, cornerRadius: 20 },
      { x: -285, y:  575, width: 15.0, mode: 'spline',   tension: 0.5, cornerRadius: 32 }
    ]
  },

  suzuka_figure: {
    id: 'suzuka_figure',
    name: 'Suzuka International Racing Course',
    subtitle: 'Japanese Grand Prix — Iconic Esses, Spoon & 130R (5.81 km)',
    country: 'Japan',
    description: 'Legendary 5.81 km Japanese Grand Prix drivers\' circuit. Combines a fast tightening Turn 1–2, relentless first-sector S-Curves (Turns 3–7), sweeping Dunlop curve, double-apex Degner corners, a sharp Turn 11 hairpin, long Spoon Curve, flat-out back straight through 130R, and the tight Casio Triangle chicane.',
    defaultWidth: 13,
    nodes: [
      // Start/Finish Straight (heading East)
      { x: -410, y:  410, width: 14.0, mode: 'straight', tension: 0.5, cornerRadius: 35 },
      { x:  455, y:  410, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 35 },
      // Turns 1 & 2: Tightening Double Right-Hander
      { x:  760, y:  305, width: 13.0, mode: 'spline',   tension: 0.5, cornerRadius: 26 },
      { x:  670, y:   90, width: 13.0, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      // Turns 3-7: Famous S-Curves (Rhythmic Left-Right-Left-Right)
      { x:  385, y:  125, width: 12.5, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      { x:  255, y:  -50, width: 12.5, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      { x:   30, y:   12, width: 12.5, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      { x: -105, y: -210, width: 13.0, mode: 'spline',   tension: 0.5, cornerRadius: 30 },
      // Turn 7-8-9: Dunlop Sweeper & Degner 1 & 2
      { x:  215, y: -385, width: 13.0, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      { x:  165, y: -580, width: 12.0, mode: 'spline',   tension: 0.5, cornerRadius: 20 },
      // Turn 11 Hairpin & 200R Overpass Approach
      { x: -230, y: -605, width: 13.0, mode: 'spline',   tension: 0.5, cornerRadius: 20 },
      { x: -325, y: -385, width: 12.0, mode: 'spline',   tension: 0.5, cornerRadius: 18 },
      { x: -580, y: -520, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 34 },
      // Turns 13-14: Spoon Curve (Double-Apex Long Left)
      { x: -840, y: -345, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 38 },
      { x: -780, y:  -65, width: 14.0, mode: 'straight', tension: 0.5, cornerRadius: 36 },
      // Long Back Straight & Turn 15 (130R Flat-Out Left Sweeper)
      { x: -365, y:  185, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 44 },
      // Turns 16-17-18: Casio Triangle Chicane
      { x: -560, y:  285, width: 12.0, mode: 'spline',   tension: 0.45, cornerRadius: 16 },
      { x: -620, y:  385, width: 13.0, mode: 'spline',   tension: 0.45, cornerRadius: 20 }
    ]
  },

  monaco_harbor: {
    id: 'monaco_harbor',
    name: 'Circuit de Monaco',
    subtitle: 'Monaco Grand Prix — Monte Carlo Street Circuit (3.34 km)',
    country: 'Monaco',
    description: 'The ultimate test of precision on the narrow 10m-wide streets of Monte Carlo (3.34 km). Features Sainte Dévote, the uphill Beau Rivage run to Massenet and Casino Square, the ultra-tight Fairmont (Loews) Hairpin, the curved Tunnel, Nouvelle Chicane, Tabac, Swimming Pool complex, and La Rascasse.',
    defaultWidth: 10.5,
    nodes: [
      // Boulevard Albert 1er Pit Straight (heading North-East)
      { x: -280, y:  125, width: 11.0, mode: 'straight', tension: 0.5, cornerRadius: 16 },
      { x:   65, y:  -55, width: 10.5, mode: 'spline',   tension: 0.45, cornerRadius: 14 },
      // Turn 1: Sainte Devote (Tight Right) & Turn 2: Beau Rivage Uphill Climb (Inland)
      { x:  115, y: -175, width: 10.5, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      { x:  195, y: -335, width: 10.5, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      // Turns 3-4: Massenet (Sweeping Left) & Casino Square
      { x:  345, y: -425, width: 10.5, mode: 'spline',   tension: 0.5, cornerRadius: 18 },
      { x:  435, y: -325, width: 10.0, mode: 'spline',   tension: 0.45, cornerRadius: 14 },
      // Turn 5: Mirabeau Haute (Tight Right)
      { x:  355, y: -215, width: 10.0, mode: 'spline',   tension: 0.4,  cornerRadius: 12 },
      // Turn 6: Fairmont (Loews) Hairpin — Slowest Corner in F1 (cornerRadius: 10)
      { x:  235, y: -185, width: 10.0, mode: 'spline',   tension: 0.35, cornerRadius: 10 },
      // Turns 7-8: Mirabeau Bas & Portier Right-Handers onto the Seafront
      { x:  355, y: -105, width: 10.0, mode: 'spline',   tension: 0.45, cornerRadius: 14 },
      { x:  485, y:  -45, width: 10.5, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      // Turn 9: The Tunnel (Fast Sweeping Right-Hander along Coast)
      { x:  495, y:  115, width: 11.0, mode: 'spline',   tension: 0.5, cornerRadius: 42 },
      { x:  265, y:  215, width: 10.5, mode: 'straight', tension: 0.5, cornerRadius: 16 },
      // Turns 10-11: Nouvelle Chicane (Harbor Braking Zone Left-Right)
      { x:   85, y:  245, width: 10.0, mode: 'spline',   tension: 0.4,  cornerRadius: 12 },
      { x:   20, y:  185, width: 10.5, mode: 'straight', tension: 0.5, cornerRadius: 18 },
      // Harbor Straight to Turn 12: Tabac (Fast 4th-Gear Left)
      { x: -185, y:  275, width: 10.5, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      // Turns 13-16: Louis Chiron & Swimming Pool (Piscine) Chicane Complex
      { x: -275, y:  365, width: 10.5, mode: 'spline',   tension: 0.45, cornerRadius: 16 },
      { x: -415, y:  355, width: 10.0, mode: 'spline',   tension: 0.45, cornerRadius: 14 },
      // Turns 18-19: La Rascasse Hairpin & Antony Noghes Final Corner
      { x: -505, y:  265, width: 10.0, mode: 'spline',   tension: 0.4,  cornerRadius: 12 },
      { x: -415, y:  195, width: 10.5, mode: 'spline',   tension: 0.45, cornerRadius: 14 }
    ]
  },

  bahrain_sakhir: {
    id: 'bahrain_sakhir',
    name: 'Bahrain International Circuit',
    subtitle: 'Bahrain Grand Prix — Sakhir Desert Night Circuit (5.41 km)',
    country: 'Bahrain',
    description: 'Modern 5.41 km Hermann Tilke desert masterpiece in Sakhir. Dominated by four long straights and heavy traction/braking zones: Turn 1 Michael Schumacher hairpin, uphill Turn 4, sweeping Turns 5–6–7 esses, Turn 8 hairpin, the notorious Turn 9–10 double-left lockup corner, fast Turn 12, and Turn 14–15.',
    defaultWidth: 15,
    nodes: [
      // Main Pit Straight (heading North, ~1.05 km)
      { x:  525, y:  520, width: 15.5, mode: 'straight', tension: 0.5, cornerRadius: 24 },
      { x:  525, y: -530, width: 15.5, mode: 'spline',   tension: 0.45, cornerRadius: 16 },
      // Turns 1-2-3: Heavy Braking Right Hairpin & Left-Right Acceleration Switchback
      { x:  400, y: -445, width: 14.5, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      { x:  335, y: -550, width: 15.0, mode: 'straight', tension: 0.5, cornerRadius: 22 },
      // Straight to Turn 4
      { x: -260, y: -570, width: 15.5, mode: 'spline',   tension: 0.45, cornerRadius: 20 },
      // Turn 4 (Wide Left-Hander) into Turns 5-6-7 Fast Esses
      { x: -370, y: -410, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      { x: -210, y: -260, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      { x: -155, y:  -90, width: 14.0, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      // Turn 8: Tight Right-Hand Hairpin
      { x: -345, y: -125, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      // Turns 9 & 10: Famous Tricky Double-Left Braking Zone onto Back Straight
      { x: -530, y: -250, width: 14.5, mode: 'spline',   tension: 0.45, cornerRadius: 22 },
      { x: -615, y: -100, width: 14.5, mode: 'straight', tension: 0.5, cornerRadius: 24 },
      // Back Straight (heading South)
      { x: -580, y:  445, width: 15.0, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      // Turns 11-12-13: Uphill Sweeping Left-Right-Right Complex
      { x: -370, y:  305, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 34 },
      { x: -175, y:   90, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      { x:  -25, y:  155, width: 14.5, mode: 'straight', tension: 0.5, cornerRadius: 26 },
      // Long Sakhir Back Straight down to Final Corner
      { x:  345, y:  595, width: 15.5, mode: 'spline',   tension: 0.45, cornerRadius: 20 },
      // Turns 14-15: Final Double-Apex Right onto Main Straight
      { x:  485, y:  625, width: 15.5, mode: 'spline',   tension: 0.45, cornerRadius: 22 }
    ]
  },

  red_bull_ring: {
    id: 'red_bull_ring',
    name: 'Red Bull Ring',
    subtitle: 'Austrian Grand Prix — High-Speed Alpine Power Circuit (4.32 km)',
    country: 'Austria',
    description: 'Fast, punchy 4.32 km Styrian mountain circuit in Spielberg. Three long DRS straights and uphill braking zones (Turn 1 Niki Lauda Kurve, Turn 3 Remus hairpin, and Turn 4 Rauch) lead into a flowing downhill infield featuring the double-left Turns 6–7 and rapid Rindt/Red Bull Mobile final corners.',
    defaultWidth: 14,
    nodes: [
      // Start/Finish Straight (heading East-North-East)
      { x: -410, y:  350, width: 14.5, mode: 'straight', tension: 0.5, cornerRadius: 22 },
      { x:  325, y:  275, width: 14.5, mode: 'straight', tension: 0.5, cornerRadius: 18 },
      // Turn 1 (Niki Lauda Kurve 90° Right) & Long Uphill Straight through Turn 2 Kink
      { x:  450, y: -100, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 42 },
      { x:  565, y: -480, width: 14.0, mode: 'spline',   tension: 0.45, cornerRadius: 16 },
      // Turn 3 (Remus) Tight Uphill Right-Hand Hairpin
      { x:  430, y: -510, width: 13.5, mode: 'straight', tension: 0.5, cornerRadius: 20 },
      // Straight heading West-South-West to Turn 4
      { x: -365, y: -285, width: 14.0, mode: 'spline',   tension: 0.45, cornerRadius: 20 },
      // Turn 4 (Rauch) Sweeping Downhill Right Hairpin
      { x: -480, y: -160, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      { x: -305, y:  -65, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 32 },
      // Turns 6 & 7: Fast Sweeping Infield Double-Left
      { x: -120, y:  -55, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 30 },
      { x:  -55, y:  120, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      // Turn 8 into Fast Straight Approach to Rindt
      { x: -255, y:  100, width: 14.0, mode: 'straight', tension: 0.5, cornerRadius: 26 },
      // Turns 9 & 10: Rindt & Red Bull Mobile Fast Right-Handers
      { x: -595, y:  140, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 26 },
      { x: -605, y:  305, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 24 }
    ]
  },

  interlagos_brazil: {
    id: 'interlagos_brazil',
    name: 'Autódromo José Carlos Pace (Interlagos)',
    subtitle: 'São Paulo Grand Prix — Counter-Clockwise Classic (4.31 km)',
    country: 'Brazil',
    description: 'Iconic 4.31 km counter-clockwise bowl in São Paulo. Plunges downhill through the famous Senna S (Turns 1–2) and sweeping Curva do Sol onto Reta Oposta, before diving through Descida do Lago and winding through the technical Ferradura, Laranja, Pinheirinho, Bico de Pato, and Juncão uphill blast.',
    defaultWidth: 14,
    nodes: [
      // Main Pit Straight (heading North-West along outer perimeter, counter-clockwise)
      { x:  215, y:  365, width: 15.0, mode: 'straight', tension: 0.5, cornerRadius: 30 },
      { x: -365, y:  175, width: 14.5, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      // Turns 1 & 2: Descida do Senna ("Senna S" Downhill Left-Right)
      { x: -465, y:  105, width: 13.5, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      { x: -420, y:   15, width: 14.0, mode: 'spline',   tension: 0.5, cornerRadius: 30 },
      // Turn 3: Curva do Sol (Sweeping Left-Hander)
      { x: -520, y: -115, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 36 },
      { x: -420, y: -280, width: 14.5, mode: 'straight', tension: 0.5, cornerRadius: 34 },
      // Reta Oposta (Long Back Straight heading North-East)
      { x:  135, y: -400, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      // Turns 4 & 5: Descida do Lago (Fast Double-Apex Left)
      { x:  365, y: -345, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 30 },
      { x:  420, y: -150, width: 14.0, mode: 'straight', tension: 0.5, cornerRadius: 28 },
      // Uphill Back Stretch to Ferradura (Infield entry)
      { x:  145, y: -190, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      // Turns 6 & 7: Ferradura (Sweeping Right-Hander into Infield)
      { x:   40, y: -125, width: 13.0, mode: 'spline',   tension: 0.45, cornerRadius: 20 },
      { x:   95, y:  -25, width: 12.5, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      // Turn 8: Curva da Laranja (Tight Right Hairpin)
      { x:  210, y:   25, width: 12.5, mode: 'spline',   tension: 0.45, cornerRadius: 16 },
      { x:  130, y:  110, width: 12.5, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      // Turn 9: Pinheirinho (Left Hairpin) & Turn 10: Bico de Pato
      { x: -140, y:   40, width: 12.5, mode: 'spline',   tension: 0.45, cornerRadius: 16 },
      { x: -180, y:  145, width: 13.0, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      // Turn 11: Mergulho (Downhill Left) into Turn 12: Juncao & Subida dos Boxes
      { x:   80, y:  200, width: 13.5, mode: 'spline',   tension: 0.5, cornerRadius: 26 },
      { x:  380, y:  245, width: 14.5, mode: 'spline',   tension: 0.5, cornerRadius: 30 }
    ]
  },

  grand_prix: {
    id: 'grand_prix',
    name: 'Apex Autodrome GP',
    subtitle: 'FIA Grade 1 Technical Grand Prix Circuit (5.2 km)',
    country: 'International',
    description: 'A full-scale 5.2 km FIA Grade 1 Grand Prix circuit featuring an 850m main straight, heavy-braking Turn 1 hairpin, high-speed Maggotts/Becketts-inspired esses, a technical stadium hairpin, double-apex sweeper, and back-straight chicane.',
    defaultWidth: 14,
    nodes: [
      // Main Start/Finish Straight (heading East, ~880m)
      { x: -390, y:  360, width: 15, mode: 'straight', tension: 0.5, cornerRadius: 34 },
      { x:  490, y:  360, width: 15, mode: 'straight', tension: 0.5, cornerRadius: 22 },
      // Turn 1-2 Hairpin Complex
      { x:  635, y:  305, width: 14, mode: 'spline',   tension: 0.5, cornerRadius: 20 },
      { x:  575, y:  155, width: 14, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      { x:  335, y:  175, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 26 },
      // High-Speed Esses (S-Curves heading North-East to North-West)
      { x:  230, y:   25, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 30 },
      { x:  395, y: -140, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 30 },
      { x:  270, y: -320, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 32 },
      { x:  430, y: -470, width: 14, mode: 'straight', tension: 0.5, cornerRadius: 32 },
      // Long Back Straight heading West (~630m)
      { x: -200, y: -470, width: 14, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      // Back Straight Chicane
      { x: -305, y: -380, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 18 },
      { x: -420, y: -455, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 26 },
      // Double-Apex Left Sweeper
      { x: -650, y: -320, width: 15, mode: 'spline',   tension: 0.5, cornerRadius: 42 },
      { x: -675, y:  -75, width: 15, mode: 'spline',   tension: 0.5, cornerRadius: 42 },
      // Stadium Section Infield & Final Corner onto Main Straight
      { x: -405, y:  -25, width: 14, mode: 'spline',   tension: 0.5, cornerRadius: 20 },
      { x: -370, y:  140, width: 14, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      { x: -585, y:  240, width: 15, mode: 'spline',   tension: 0.5, cornerRadius: 30 }
    ]
  },

  touge_drift: {
    id: 'touge_drift',
    name: 'Ebisu Drift Stadium',
    subtitle: 'Tight Technical Touge & Karting Arena (1.4 km)',
    country: 'Japan',
    description: 'Compact ~1.4 km technical layout designed for drift transitions, shifter karts, and high-downforce time attack. Features a wall-ride bank sweeper, switchback hairpins, and rapid flick entries.',
    defaultWidth: 12,
    nodes: [
      // Main Wall-Ride Straight
      { x: -140, y:  135, width: 13, mode: 'straight', tension: 0.5, cornerRadius: 22 },
      { x:  145, y:  135, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      // Big Bank Sweeper (Outer 180)
      { x:  235, y:   55, width: 14, mode: 'spline',   tension: 0.5, cornerRadius: 28 },
      { x:  180, y:  -45, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      // Infield Switchback Hairpin 1
      { x:   45, y:  -15, width: 12, mode: 'spline',   tension: 0.5, cornerRadius: 18 },
      { x:   20, y:  -95, width: 12, mode: 'spline',   tension: 0.5, cornerRadius: 18 },
      // Northern Touge Hairpin 2
      { x:  135, y: -155, width: 12, mode: 'spline',   tension: 0.5, cornerRadius: 20 },
      { x:   60, y: -220, width: 12, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      // Fast Downhill S-Transition
      { x:  -75, y: -175, width: 12, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      { x: -135, y:  -85, width: 12, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      { x: -235, y: -110, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      // Final Hairpin Clipping Point onto Main Straight
      { x: -255, y:   25, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 24 },
      { x: -215, y:  110, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 24 }
    ]
  },

  oval_roval: {
    id: 'oval_roval',
    name: 'Daytona Tri-Oval Roval',
    subtitle: '24-Hour Endurance Banking + Infield Road Course (5.7 km)',
    country: 'USA',
    description: 'Combines the flat-out speed of a superspeedway tri-oval and backstretch Bus Stop chicane with a demanding infield endurance road course section.',
    defaultWidth: 15,
    nodes: [
      // Tri-Oval Start/Finish Apex heading into Turn 1 Dive
      { x:    0, y:  450, width: 16, mode: 'spline',   tension: 0.5, cornerRadius: 48 },
      { x:  485, y:  360, width: 16, mode: 'straight', tension: 0.5, cornerRadius: 24 },
      // Turn 1 Dive into Infield Horseshoe
      { x:  515, y:  155, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 20 },
      { x:  270, y:   75, width: 12, mode: 'spline',   tension: 0.5, cornerRadius: 18 },
      // Infield Kink & International Horseshoe
      { x:  205, y:  220, width: 12, mode: 'spline',   tension: 0.5, cornerRadius: 18 },
      { x:  -75, y:  205, width: 13, mode: 'straight', tension: 0.5, cornerRadius: 20 },
      // Western Horseshoe rejoining Speedway Banking
      { x: -370, y:  220, width: 12, mode: 'spline',   tension: 0.5, cornerRadius: 18 },
      { x: -420, y:   55, width: 13, mode: 'spline',   tension: 0.5, cornerRadius: 22 },
      { x: -630, y:   90, width: 15, mode: 'spline',   tension: 0.5, cornerRadius: 42 },
      // Speedway West Banking (NASCAR Turns 1 & 2)
      { x: -680, y: -220, width: 16, mode: 'spline',   tension: 0.5, cornerRadius: 55 },
      { x: -470, y: -400, width: 16, mode: 'straight', tension: 0.5, cornerRadius: 45 },
      // Long Backstretch into Bus Stop Chicane
      { x:  125, y: -400, width: 15, mode: 'spline',   tension: 0.45, cornerRadius: 20 },
      { x:  220, y: -320, width: 12, mode: 'spline',   tension: 0.45, cornerRadius: 18 },
      { x:  335, y: -400, width: 15, mode: 'spline',   tension: 0.5, cornerRadius: 38 },
      // Speedway East Banking (NASCAR Turns 3 & 4)
      { x:  630, y: -305, width: 16, mode: 'spline',   tension: 0.5, cornerRadius: 55 },
      { x:  690, y:   55, width: 16, mode: 'spline',   tension: 0.5, cornerRadius: 55 },
      { x:  580, y:  350, width: 16, mode: 'spline',   tension: 0.5, cornerRadius: 48 }
    ]
  }
};
