# APEX // AI (F1Shi)

Interactive 2D circuit designer and racing line optimizer running entirely in the browser. You can build custom tracks using splines and straights, load real circuits (Spa, Monza, Silverstone, Suzuka, Monaco, etc.), tweak car setups, and let the solver calculate minimum lap times, speed traces, and optimal braking/cornering lines.

Built with vanilla JavaScript, HTML5 Canvas, and CSS. No bundlers, external physics engines, or dependencies required.

---

## Getting Started

Because there are no dependencies or build steps, you can open `index.html` directly in your browser. 

If your browser restricts local file access for canvas operations, serve the root directory:

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then visit `http://localhost:8000`.

---

## How It Works

### Track Layout & Geometry (`js/track.js`, `js/presets.js`)
- Circuits are parameterized as closed loops sampled at uniform arc-length intervals (~2–3m).
- Control nodes support two modes:
  - **Spline**: Smooth Catmull-Rom interpolation across corners.
  - **Straight**: Linear segments with filleted entry and exit blends to maintain continuous curvature ($\kappa$).
- Real track layouts included: Spa-Francorchamps, Monza, Silverstone, Suzuka, Monaco, Bahrain, Red Bull Ring, and Interlagos (plus test GP, drift, and roval layouts).

### Racing Line Optimization (`js/optimizer.js`)
The solver computes the lateral offset $\alpha_i$ along the track normal at each sample point:
- **Path Relaxation**: Uses multi-scale iterative relaxation (local, medium, and wide stencils) to minimize curvature and maximize corner radius.
- **Late Apex Bias**: Biases exit trajectories toward straights for high-power, traction-limited cars, while keeping geometric minimum-curvature lines for momentum and high-downforce cars.

### Quasi-Steady-State (QSS) Vehicle Dynamics
- **Tire Load Sensitivity**: Normalizes grip as vertical load increases from downforce ($\mu(F_z) = \mu_0 \cdot (F_z / F_{z0})^{-\epsilon}$), preventing artificial infinite grip at high speeds.
- **Three-Pass Speed Solver**:
  1. *Cornering limit*: Newton-Raphson equilibrium balancing centripetal demand against load-sensitive tire grip, steering lock constraints, and chicane transition rates.
  2. *Backward pass*: Braking deceleration limits via the G-G friction circle, brake bias efficiency, and trail-braking scrub drag.
  3. *Forward pass*: Traction circle limits, drivetrain efficiency, engine power curves, and aerodynamic drag.
- **Telemetry**: Calculates station-by-station speed, longitudinal/lateral Gs, throttle/brake percentage, gear selection, engine RPM, and steering angle.

### Weather, Wind & Wet Zones
- **Wind Vector Simulation**: Wind speed (0–120 km/h) and direction (0–360°) alter relative airspeed ($v_{\text{air}} = v - w_{\parallel}$). Headwinds increase cornering downforce and straightaway drag; tailwinds increase straightaway top speed but reduce braking grip. Crosswinds introduce yaw-induced floor/diffuser stall and aero balance shifts.
- **Localized Wet Zones**: Instead of making the entire circuit wet, you can drop localized water puddles and rain zones on specific corners.
- **Wet Line vs. Dry Line**: Wet asphalt over the traditional rubbered-in apex becomes slick, so the optimizer automatically widens its radius onto the abrasive off-line aggregate (the "karting/wet line") and stays off wet kerbs.

### Pirelli Tire Model & Custom Tire Tuning
Includes presets for Pirelli compounds (`C1` through `C5` slicks, `INT` Intermediate, and `WET` Full Wet):
- Slicks offer high dry grip but suffer severe grip loss and hydroplaning above ~150 km/h in standing water.
- Intermediates and Full Wets clear water via tread channels (resisting hydroplaning up to ~228–285 km/h), but suffer tread squirm and thermal degradation on dry track.
- Custom sliders let you adjust compound softness, groove depth (0–8 mm), and tire pressure (16–30 PSI).

---

## Canvas Controls & Shortcuts

| Action | Control |
|---|---|
| Move track node / cloud / wet zone | Left Click + Drag |
| Toggle node between Spline and Straight | Shift + Click (or Double Click) |
| Pan view | Right Click + Drag / Middle Click + Drag |
| Zoom | Mouse Wheel |
| Delete selected node, cloud, or wet zone | `Delete` or `Backspace` |
| Rotate wind compass | Left Click + Drag on the canvas compass (top left) |
| Inspect station telemetry | Hover / Scrub the bottom telemetry chart |

---

## Source Tree

```
├── index.html          # Main application markup & controls
├── css/
│   └── styles.css      # Dark telemetry theme & layout styling
└── js/
    ├── presets.js      # Vehicle physics profiles, track nodes, and tire compounds
    ├── track.js        # Discretization, spline/straight interpolation, and track boundaries
    ├── optimizer.js    # Racing line solver, QSS dynamics, wind & wet tire physics
    ├── renderer.js     # Canvas renderer (track layers, cars, wind streaks, spray, HUD)
    └── app.js          # Event wiring, UI state, tool controllers, and main loop
```
