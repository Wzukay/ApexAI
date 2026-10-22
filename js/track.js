/**
 * track.js
 * Core Track geometry engine supporting hybrid Spline & Straight control nodes,
 * arc-length parameterization, continuous curvature estimation, boundary generation,
 * and automatic FIA kerb placement.
 */
window.App = window.App || {};

(function () {
  'use strict';

  let _nextNodeId = 1;

  /**
   * Clamp helper
   */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Cubic Hermite position interpolation
   * @param {number} p0 Start value
   * @param {number} p1 End value
   * @param {number} m0 Start tangent (scaled by segment parameter span)
   * @param {number} m1 End tangent (scaled by segment parameter span)
   * @param {number} t Parameter in [0, 1]
   */
  function hermite(p0, p1, m0, m1, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
  }

  /**
   * Cubic Bezier interpolation for smooth corner fillets
   */
  function cubicBezier(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const u2 = u * u;
    const u3 = u2 * u;
    const t2 = t * t;
    const t3 = t2 * t;
    return u3 * p0 + 3 * u2 * t * p1 + 3 * u * t2 * p2 + t3 * p3;
  }

  class Track {
    /**
     * @param {string} [presetKey='grand_prix'] Initial preset key to load
     */
    constructor(presetKey = 'grand_prix') {
      this.id = presetKey || 'custom';
      this.name = 'Custom Circuit';
      this.subtitle = 'User Designed Layout';
      this.defaultWidth = 14;
      this.closed = true;

      /** @type {Array<{id: number, x: number, y: number, width: number, mode: 'spline'|'straight', tension: number, camber: number, cornerRadius: number}>} */
      this.nodes = [];

      /** @type {Array<Object>} Arc-length parameterized track stations */
      this.samples = [];

      /** @type {number} Total centerline length in meters */
      this.totalLength = 0;

      /** @type {number} Average spacing between samples in meters */
      this.sampleSpacing = 2.0;

      if (presetKey && window.App.TRACK_PRESETS && window.App.TRACK_PRESETS[presetKey]) {
        this.loadPreset(presetKey);
      } else {
        this._initDefaultLoop();
        this.rebuild();
      }
    }

    /**
     * Fallback 4-node loop if no presets are loaded yet
     */
    _initDefaultLoop() {
      const pts = [
        { x: -200, y: 150, width: 14, mode: 'straight', tension: 0.5, cornerRadius: 30 },
        { x: 200, y: 150, width: 14, mode: 'spline', tension: 0.5, cornerRadius: 30 },
        { x: 200, y: -150, width: 14, mode: 'straight', tension: 0.5, cornerRadius: 30 },
        { x: -200, y: -150, width: 14, mode: 'spline', tension: 0.5, cornerRadius: 30 }
      ];
      this.nodes = pts.map((p) => this._normalizeNode(p));
    }

    /**
     * Normalize a node object with all required properties
     */
    _normalizeNode(raw) {
      return {
        id: raw.id || _nextNodeId++,
        x: Number(raw.x) || 0,
        y: Number(raw.y) || 0,
        width: clamp(Number(raw.width) || this.defaultWidth || 14, 6, 30),
        mode: raw.mode === 'straight' ? 'straight' : 'spline',
        tension: raw.tension !== undefined ? clamp(Number(raw.tension), 0, 1) : 0.5,
        camber: raw.camber !== undefined ? Number(raw.camber) : 0,
        cornerRadius: raw.cornerRadius !== undefined ? clamp(Number(raw.cornerRadius), 8, 80) : 25
      };
    }

    /**
     * Load a track preset by key from window.App.TRACK_PRESETS
     * @param {string} presetKey
     * @returns {boolean} True if loaded successfully
     */
    loadPreset(presetKey) {
      const presets = window.App.TRACK_PRESETS;
      if (!presets || !presets[presetKey]) {
        return false;
      }
      const preset = presets[presetKey];
      this.id = preset.id || presetKey;
      this.name = preset.name || presetKey;
      this.subtitle = preset.subtitle || '';
      this.defaultWidth = preset.defaultWidth || 14;
      this.closed = preset.closed !== undefined ? Boolean(preset.closed) : true;
      this.nodes = (preset.nodes || []).map((n) => this._normalizeNode(n));
      this.rebuild();
      return true;
    }

    /**
     * Add a node at (x, y). If track is closed and already has >= 3 nodes,
     * inserts the node on the closest segment; otherwise appends to the end.
     * @param {number} x
     * @param {number} y
     * @param {'spline'|'straight'} [mode='spline']
     * @param {number} [width=14]
     * @returns {number} Index of the newly added node
     */
    addNode(x, y, mode = 'spline', width = this.defaultWidth) {
      if (this.closed && this.nodes.length >= 3) {
        return this.insertNodeOnSegment(x, y, mode, width);
      }
      const node = this._normalizeNode({ x, y, mode, width });
      this.nodes.push(node);
      this.rebuild();
      return this.nodes.length - 1;
    }

    /**
     * Find the closest segment to (x, y) and insert a new control node there
     * @param {number} x
     * @param {number} y
     * @param {'spline'|'straight'} [mode='spline']
     * @param {number} [width]
     * @returns {number} Inserted node index
     */
    insertNodeOnSegment(x, y, mode = 'spline', width) {
      const n = this.nodes.length;
      if (n < 2) {
        const node = this._normalizeNode({ x, y, mode, width: width || this.defaultWidth });
        this.nodes.push(node);
        this.rebuild();
        return this.nodes.length - 1;
      }

      // If we have dense samples, find the closest sample to determine segmentIndex accurately
      let bestSegIndex = n - 1;
      let inheritedWidth = width || this.defaultWidth;

      if (this.samples && this.samples.length > 0) {
        const closest = this.getClosestSample(x, y);
        if (closest && closest.sample) {
          bestSegIndex = closest.sample.segmentIndex;
          if (!width) {
            inheritedWidth = closest.sample.width;
          }
        }
      } else {
        // Fallback: geometric distance to chord segments
        let bestDistSq = Infinity;
        for (let i = 0; i < n; i++) {
          const a = this.nodes[i];
          const b = this.nodes[(i + 1) % n];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const lenSq = dx * dx + dy * dy;
          let t = lenSq > 1e-6 ? ((x - a.x) * dx + (y - a.y) * dy) / lenSq : 0;
          t = clamp(t, 0, 1);
          const px = a.x + t * dx;
          const py = a.y + t * dy;
          const dSq = (x - px) * (x - px) + (y - py) * (y - py);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestSegIndex = i;
            if (!width) {
              inheritedWidth = a.width * (1 - t) + b.width * t;
            }
          }
        }
      }

      const newNode = this._normalizeNode({
        x,
        y,
        mode,
        width: inheritedWidth
      });

      const insertIdx = bestSegIndex + 1;
      this.nodes.splice(insertIdx, 0, newNode);
      this.rebuild();
      return insertIdx;
    }

    /**
     * Remove a control node at index (maintains at least 3 nodes for a valid closed loop)
     * @param {number} index
     * @returns {boolean} True if removed
     */
    removeNode(index) {
      if (this.nodes.length <= 3) {
        return false;
      }
      if (index < 0 || index >= this.nodes.length) {
        return false;
      }
      this.nodes.splice(index, 1);
      this.rebuild();
      return true;
    }

    /**
     * Toggle a node's interpolation mode between 'spline' and 'straight'
     * @param {number} index
     * @returns {string|null} New mode
     */
    toggleNodeMode(index) {
      if (index < 0 || index >= this.nodes.length) return null;
      const node = this.nodes[index];
      node.mode = node.mode === 'straight' ? 'spline' : 'straight';
      this.rebuild();
      return node.mode;
    }

    /**
     * Set track width at a given control node
     * @param {number} index
     * @param {number} width
     */
    setNodeWidth(index, width) {
      if (index < 0 || index >= this.nodes.length) return;
      this.nodes[index].width = clamp(Number(width) || 14, 6, 30);
      this.rebuild();
    }

    /**
     * Reverse track driving direction while keeping Start/Finish at node 0
     */
    reverseDirection() {
      if (this.nodes.length < 3) return;
      const first = this.nodes[0];
      const rest = this.nodes.slice(1).reverse();
      // Shift straight modes so the same geometric segments remain straight when reversed
      const oldModes = this.nodes.map((n) => n.mode);
      const n = this.nodes.length;
      this.nodes = [first, ...rest];
      for (let i = 0; i < n; i++) {
        const origSegmentIdx = (n - 1 - i) % n;
        this.nodes[i].mode = oldModes[origSegmentIdx];
      }
      this.rebuild();
    }

    /**
     * Find closest control node within maxDist meters
     * @param {number} x
     * @param {number} y
     * @param {number} [maxDist=20]
     * @returns {{node: Object, index: number, distance: number}|null}
     */
    getClosestNode(x, y, maxDist = 20) {
      let bestIdx = -1;
      let bestDist = maxDist;
      for (let i = 0; i < this.nodes.length; i++) {
        const nd = this.nodes[i];
        const d = Math.hypot(x - nd.x, y - nd.y);
        if (d <= bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) return null;
      return {
        node: this.nodes[bestIdx],
        index: bestIdx,
        distance: bestDist
      };
    }

    /**
     * Find closest discretized sample station to world point (x, y)
     * @param {number} x
     * @param {number} y
     * @returns {{sample: Object, index: number, distance: number}|null}
     */
    getClosestSample(x, y) {
      if (!this.samples || this.samples.length === 0) return null;
      let bestIdx = 0;
      let bestDistSq = Infinity;
      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        const dx = x - s.x;
        const dy = y - s.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
      return {
        sample: this.samples[bestIdx],
        index: bestIdx,
        distance: Math.sqrt(bestDistSq)
      };
    }

    /**
     * Compute bounding box of the track including track width margins
     */
    getTrackBounds() {
      if (!this.samples || this.samples.length === 0) {
        if (this.nodes.length === 0) {
          return { minX: -100, maxX: 100, minY: -100, maxY: 100, width: 200, height: 200, centerX: 0, centerY: 0 };
        }
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of this.nodes) {
          const hw = (n.width || 14) * 0.5;
          if (n.x - hw < minX) minX = n.x - hw;
          if (n.x + hw > maxX) maxX = n.x + hw;
          if (n.y - hw < minY) minY = n.y - hw;
          if (n.y + hw > maxY) maxY = n.y + hw;
        }
        return {
          minX,
          maxX,
          minY,
          maxY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          centerX: (minX + maxX) * 0.5,
          centerY: (minY + maxY) * 0.5
        };
      }

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        const hw = s.width * 0.5 + 2;
        if (s.x - hw < minX) minX = s.x - hw;
        if (s.x + hw > maxX) maxX = s.x + hw;
        if (s.y - hw < minY) minY = s.y - hw;
        if (s.y + hw > maxY) maxY = s.y + hw;
      }

      return {
        minX,
        maxX,
        minY,
        maxY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        centerX: (minX + maxX) * 0.5,
        centerY: (minY + maxY) * 0.5
      };
    }

    /**
     * Return cumulative arc-length distances for Sector 1, Sector 2, and Sector 3 splits
     * @returns {number[]} [s1End, s2End, totalLength]
     */
    getSectorSplits() {
      const L = this.totalLength || 1;
      return [L / 3, (2 * L) / 3, L];
    }

    /**
     * Interpolate track state at arbitrary arc-length distance s (wraps around totalLength)
     * @param {number} s Distance in meters
     */
    getPointAtDistance(s) {
      const N = this.samples.length;
      if (N === 0) return null;
      if (N === 1 || this.totalLength <= 0) return this.samples[0];

      let dist = s % this.totalLength;
      if (dist < 0) dist += this.totalLength;

      const exactIdx = (dist / this.totalLength) * N;
      const i0 = Math.floor(exactIdx) % N;
      const i1 = (i0 + 1) % N;
      const frac = exactIdx - Math.floor(exactIdx);

      const a = this.samples[i0];
      const b = this.samples[i1];

      const x = a.x + (b.x - a.x) * frac;
      const y = a.y + (b.y - a.y) * frac;
      let tx = a.tx + (b.tx - a.tx) * frac;
      let ty = a.ty + (b.ty - a.ty) * frac;
      const tLen = Math.hypot(tx, ty) || 1;
      tx /= tLen;
      ty /= tLen;

      return {
        s: dist,
        x,
        y,
        tx,
        ty,
        nx: -ty,
        ny: tx,
        width: a.width + (b.width - a.width) * frac,
        curvature: a.curvature + (b.curvature - a.curvature) * frac
      };
    }

    /**
     * Hybrid Spline & Straight discretization engine.
     * Builds a dense, arc-length parameterized sequence of stations with continuous
     * tangents, normals, boundaries, smoothed curvature, and automatic FIA kerb zones.
     *
     * @param {number} [targetSpacing=2.0] Target arc-length step in meters
     */
    rebuild(targetSpacing = 2.0) {
      const n = this.nodes.length;
      if (n < 3) {
        this.samples = [];
        this.totalLength = 0;
        return;
      }

      // 1. Precompute segment chords, lengths, and unit direction vectors
      const chords = new Array(n);
      for (let i = 0; i < n; i++) {
        const p0 = this.nodes[i];
        const p1 = this.nodes[(i + 1) % n];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.max(1e-3, Math.hypot(dx, dy));
        chords[i] = {
          dx,
          dy,
          len,
          ux: dx / len,
          uy: dy / len
        };
      }

      // 2. Compute corner fillet offsets for 'straight' segments and smooth node tangents
      // If segment i has mode === 'straight', its core is a pure linear segment along chord i,
      // while vertices where two straight segments meet (or straight meets spline) are smoothly
      // filleted so the straight itself never bows or curves in the middle.
      const filletTrimStart = new Array(n).fill(0);
      const filletTrimEnd = new Array(n).fill(0);
      const vertexFillet = new Array(n).fill(null);

      for (let i = 0; i < n; i++) {
        const prevIdx = (i - 1 + n) % n;
        const prevNode = this.nodes[prevIdx];
        const currNode = this.nodes[i];
        const cIn = chords[prevIdx];
        const cOut = chords[i];

        const prevIsStraight = prevNode.mode === 'straight';
        const currIsStraight = currNode.mode === 'straight';

        // If at least one adjacent segment at vertex i is straight, check if we should insert
        // a smooth corner fillet so the straight stays 100% linear up to the braking/turn-in zone.
        if (prevIsStraight && currIsStraight) {
          const radius = currNode.cornerRadius || 25;
          const trimIn = Math.min(cIn.len * 0.35, radius);
          const trimOut = Math.min(cOut.len * 0.35, radius);
          filletTrimEnd[prevIdx] = trimIn;
          filletTrimStart[i] = trimOut;

          const startX = currNode.x - cIn.ux * trimIn;
          const startY = currNode.y - cIn.uy * trimIn;
          const endX = currNode.x + cOut.ux * trimOut;
          const endY = currNode.y + cOut.uy * trimOut;

          // Control points positioned 0.55 of the way toward the corner vertex for near-circular G2 blend
          const cpScale = 0.58;
          vertexFillet[i] = {
            p0x: startX,
            p0y: startY,
            p1x: startX + cIn.ux * (trimIn * cpScale),
            p1y: startY + cIn.uy * (trimIn * cpScale),
            p2x: endX - cOut.ux * (trimOut * cpScale),
            p2y: endY - cOut.uy * (trimOut * cpScale),
            p3x: endX,
            p3y: endY,
            widthStart: prevNode.width + (currNode.width - prevNode.width) * (1 - trimIn / cIn.len),
            widthEnd: currNode.width + (this.nodes[(i + 1) % n].width - currNode.width) * (trimOut / cOut.len),
            segmentIndex: i
          };
        } else if (!prevIsStraight && currIsStraight) {
          // Spline entering a Straight: trim the start of the straight slightly and fillet
          // so the corner exit smoothly blends onto the straight line without bowing the straight!
          const radius = currNode.cornerRadius || 25;
          const trimOut = Math.min(cOut.len * 0.25, radius * 0.85);
          filletTrimStart[i] = trimOut;
        } else if (prevIsStraight && !currIsStraight) {
          // Straight entering a Spline corner: trim the end of the straight slightly
          // so turn-in starts smoothly into the spline
          const radius = currNode.cornerRadius || 25;
          const trimIn = Math.min(cIn.len * 0.22, radius * 0.75);
          filletTrimEnd[prevIdx] = trimIn;
        }
      }

      // 3. Compute effective start/end anchor points and unit tangents for each segment i
      const segAnchors = new Array(n);
      for (let i = 0; i < n; i++) {
        const p0 = this.nodes[i];
        const p1 = this.nodes[(i + 1) % n];
        const c = chords[i];
        const trimS = filletTrimStart[i];
        const trimE = filletTrimEnd[i];

        const sx = p0.x + c.ux * trimS;
        const sy = p0.y + c.uy * trimS;
        const ex = p1.x - c.ux * trimE;
        const ey = p1.y - c.uy * trimE;

        const w0 = p0.width + (p1.width - p0.width) * (trimS / c.len);
        const w1 = p0.width + (p1.width - p0.width) * (1 - trimE / c.len);

        segAnchors[i] = {
          sx,
          sy,
          ex,
          ey,
          w0,
          w1,
          len: Math.max(1e-3, Math.hypot(ex - sx, ey - sy)),
          isStraight: p0.mode === 'straight'
        };
      }

      // Compute unit tangents at each node for spline segments
      const nodeUnitTangents = new Array(n);
      for (let i = 0; i < n; i++) {
        const prevIdx = (i - 1 + n) % n;
        const cIn = chords[prevIdx];
        const cOut = chords[i];

        // Centripetal / chord-weighted Catmull-Rom tangent direction
        const wIn = cOut.len / (cIn.len + cOut.len);
        const wOut = cIn.len / (cIn.len + cOut.len);
        let tx = cIn.ux * wIn + cOut.ux * wOut;
        let ty = cIn.uy * wIn + cOut.uy * wOut;
        const tLen = Math.hypot(tx, ty);
        if (tLen < 1e-5) {
          tx = cOut.ux;
          ty = cOut.uy;
        } else {
          tx /= tLen;
          ty /= tLen;
        }
        nodeUnitTangents[i] = { tx, ty };
      }

      // 4. Generate high-resolution raw polyline points around the loop
      const rawPoints = [];
      const pushRaw = (x, y, width, segmentIndex, isStraight) => {
        if (rawPoints.length > 0) {
          const last = rawPoints[rawPoints.length - 1];
          if (Math.hypot(x - last.x, y - last.y) < 1e-4) {
            return;
          }
        }
        rawPoints.push({ x, y, width, segmentIndex, isStraight });
      };

      for (let i = 0; i < n; i++) {
        const prevIdx = (i - 1 + n) % n;
        const nextIdx = (i + 1) % n;
        const currNode = this.nodes[i];
        const nextNode = this.nodes[nextIdx];
        const anchor = segAnchors[i];

        // A. If vertex i has a straight-to-straight Bezier fillet, emit it first
        if (vertexFillet[i]) {
          const vf = vertexFillet[i];
          const filletSteps = 24;
          for (let k = 0; k < filletSteps; k++) {
            const t = k / filletSteps;
            const x = cubicBezier(vf.p0x, vf.p1x, vf.p2x, vf.p3x, t);
            const y = cubicBezier(vf.p0y, vf.p1y, vf.p2y, vf.p3y, t);
            const w = vf.widthStart + (vf.widthEnd - vf.widthStart) * t;
            pushRaw(x, y, w, vf.segmentIndex, false);
          }
        } else if (this.nodes[prevIdx].mode !== 'straight' && currNode.mode === 'straight') {
          // Smooth transition from spline node i onto the trimmed start of straight i
          const p0x = currNode.x;
          const p0y = currNode.y;
          const p1x = anchor.sx;
          const p1y = anchor.sy;
          const span = Math.hypot(p1x - p0x, p1y - p0y);
          if (span > 0.05) {
            const t0 = nodeUnitTangents[i];
            const t1 = { tx: chords[i].ux, ty: chords[i].uy };
            const steps = 16;
            for (let k = 0; k < steps; k++) {
              const t = k / steps;
              const x = hermite(p0x, p1x, t0.tx * span, t1.tx * span, t);
              const y = hermite(p0y, p1y, t0.ty * span, t1.ty * span, t);
              const w = currNode.width + (anchor.w0 - currNode.width) * t;
              pushRaw(x, y, w, i, false);
            }
          }
        }

        // B. Emit main segment i (either ruler-straight or smooth Hermite spline)
        if (currNode.mode === 'straight') {
          const steps = Math.max(8, Math.ceil(anchor.len / 2.0));
          for (let k = 0; k < steps; k++) {
            const t = k / steps;
            const x = anchor.sx + (anchor.ex - anchor.sx) * t;
            const y = anchor.sy + (anchor.ey - anchor.sy) * t;
            const w = anchor.w0 + (anchor.w1 - anchor.w0) * t;
            pushRaw(x, y, w, i, true);
          }

          // If transitioning from this straight into a spline at nextNode, emit the turn-in blend
          if (nextNode.mode !== 'straight' && filletTrimEnd[i] > 0.05) {
            const p0x = anchor.ex;
            const p0y = anchor.ey;
            const p1x = nextNode.x;
            const p1y = nextNode.y;
            const span = Math.hypot(p1x - p0x, p1y - p0y);
            const t0 = { tx: chords[i].ux, ty: chords[i].uy };
            const t1 = nodeUnitTangents[nextIdx];
            const stepsBlend = 16;
            for (let k = 0; k < stepsBlend; k++) {
              const t = k / stepsBlend;
              const x = hermite(p0x, p1x, t0.tx * span, t1.tx * span, t);
              const y = hermite(p0y, p1y, t0.ty * span, t1.ty * span, t);
              const w = anchor.w1 + (nextNode.width - anchor.w1) * t;
              pushRaw(x, y, w, i, false);
            }
          }
        } else {
          // Smooth Catmull-Rom / Hermite spline segment from currNode to nextNode
          const p0x = currNode.x;
          const p0y = currNode.y;
          const p1x = nextNode.x;
          const p1y = nextNode.y;
          const span = chords[i].len;

          const tension0 = 1 - (currNode.tension !== undefined ? currNode.tension : 0.5) * 0.35;
          const tension1 = 1 - (nextNode.tension !== undefined ? nextNode.tension : 0.5) * 0.35;

          const t0 = nodeUnitTangents[i];
          const t1 = nodeUnitTangents[nextIdx];

          const m0x = t0.tx * span * tension0;
          const m0y = t0.ty * span * tension0;
          const m1x = t1.tx * span * tension1;
          const m1y = t1.ty * span * tension1;

          const steps = Math.max(24, Math.ceil(span / 1.5));
          for (let k = 0; k < steps; k++) {
            const t = k / steps;
            const x = hermite(p0x, p1x, m0x, m1x, t);
            const y = hermite(p0y, p1y, m0y, m1y, t);
            // Smoothstep width interpolation
            const sw = t * t * (3 - 2 * t);
            const w = currNode.width + (nextNode.width - currNode.width) * sw;
            pushRaw(x, y, w, i, false);
          }
        }
      }

      const M = rawPoints.length;
      if (M < 3) {
        this.samples = [];
        this.totalLength = 0;
        return;
      }

      // 5. Compute cumulative arc length along the closed raw polygon
      const cumDist = new Float64Array(M + 1);
      cumDist[0] = 0;
      for (let i = 0; i < M; i++) {
        const a = rawPoints[i];
        const b = rawPoints[(i + 1) % M];
        cumDist[i + 1] = cumDist[i] + Math.hypot(b.x - a.x, b.y - a.y);
      }

      const totalLength = cumDist[M];
      this.totalLength = totalLength;

      // Determine sample count N (clamped between 400 and 1600 for fast, high-res physics)
      const desiredN = Math.round(totalLength / Math.max(0.5, targetSpacing));
      const N = clamp(desiredN, 400, 1600);
      const ds = totalLength / N;
      this.sampleSpacing = ds;

      // 6. Resample at uniform arc-length intervals
      const samples = new Array(N);
      let rawIdx = 0;

      for (let k = 0; k < N; k++) {
        const targetS = k * ds;
        while (rawIdx < M - 1 && cumDist[rawIdx + 1] < targetS) {
          rawIdx++;
        }
        const segLen = cumDist[rawIdx + 1] - cumDist[rawIdx];
        const frac = segLen > 1e-8 ? (targetS - cumDist[rawIdx]) / segLen : 0;
        const pA = rawPoints[rawIdx];
        const pB = rawPoints[(rawIdx + 1) % M];

        samples[k] = {
          s: targetS,
          x: pA.x + (pB.x - pA.x) * frac,
          y: pA.y + (pB.y - pA.y) * frac,
          tx: 1,
          ty: 0,
          nx: 0,
          ny: 1,
          width: pA.width + (pB.width - pA.width) * frac,
          leftX: 0,
          leftY: 0,
          rightX: 0,
          rightY: 0,
          curvature: 0,
          segmentIndex: pA.segmentIndex,
          isStraight: Boolean(pA.isStraight && pB.isStraight),
          kerbLeft: 0,
          kerbRight: 0
        };
      }

      // 7. Compute unit tangents, left-pointing normals (nx = -ty, ny = tx), boundaries, and raw curvature
      const rawCurvature = new Float64Array(N);
      for (let k = 0; k < N; k++) {
        const prev = samples[(k - 1 + N) % N];
        const curr = samples[k];
        const next = samples[(k + 1) % N];

        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const tx = dx / len;
        const ty = dy / len;
        // Normal pointing LEFT of track direction: (-ty, tx)
        const nx = -ty;
        const ny = tx;

        curr.tx = tx;
        curr.ty = ty;
        curr.nx = nx;
        curr.ny = ny;

        const hw = curr.width * 0.5;
        curr.leftX = curr.x + nx * hw;
        curr.leftY = curr.y + ny * hw;
        curr.rightX = curr.x - nx * hw;
        curr.rightY = curr.y - ny * hw;

        // Signed Menger / finite-difference curvature kappa
        const ddx = next.x - 2 * curr.x + prev.x;
        const ddy = next.y - 2 * curr.y + prev.y;
        const cross = dx * 0.5 * ddy - dy * 0.5 * ddx;
        const denom = Math.pow(len * 0.5, 3) || 1;
        rawCurvature[k] = curr.isStraight ? 0 : cross / denom;
      }

      // 8. Smooth curvature slightly with a 5-tap Gaussian filter to eliminate any discretization jitter
      for (let k = 0; k < N; k++) {
        if (samples[k].isStraight) {
          samples[k].curvature = 0;
          continue;
        }
        const km2 = rawCurvature[(k - 2 + N) % N];
        const km1 = rawCurvature[(k - 1 + N) % N];
        const k0 = rawCurvature[k];
        const kp1 = rawCurvature[(k + 1) % N];
        const kp2 = rawCurvature[(k + 2) % N];
        samples[k].curvature = 0.0625 * km2 + 0.25 * km1 + 0.375 * k0 + 0.25 * kp1 + 0.0625 * kp2;
      }

      // 9. Automatic FIA Kerb placement on inside apexes and outside corner exits
      // Note on normal convention (nx = -ty, ny = tx):
      // When curvature > 0, the track turns toward (nx, ny) (Left side = Inside apex, Right side = Outside exit).
      // When curvature < 0, the track turns toward (-nx, -ny) (Right side = Inside apex, Left side = Outside exit).
      const kerbThreshold = 0.011;
      const exitLookbackSteps = Math.max(4, Math.round(28 / ds));

      for (let k = 0; k < N; k++) {
        const curr = samples[k];
        const kappa = curr.curvature;
        const absK = Math.abs(kappa);

        // Inside apex kerbs where |curvature| > 0.011
        if (absK > kerbThreshold) {
          const intensity = clamp((absK - kerbThreshold) / 0.015, 0.25, 1.0);
          if (kappa > 0) {
            curr.kerbLeft = Math.max(curr.kerbLeft, intensity);
          } else {
            curr.kerbRight = Math.max(curr.kerbRight, intensity);
          }
        }

        // Outside exit kerbs just downstream of high-curvature corners
        const prevCorner = samples[(k - exitLookbackSteps + N) % N];
        const prevKappa = prevCorner.curvature;
        if (Math.abs(prevKappa) > kerbThreshold * 1.25 && absK < Math.abs(prevKappa) * 0.85) {
          const exitIntensity = clamp((Math.abs(prevKappa) - kerbThreshold) / 0.02, 0.3, 0.9);
          if (prevKappa > 0) {
            // Left turn exit -> kerb on Right (outside)
            curr.kerbRight = Math.max(curr.kerbRight, exitIntensity);
          } else {
            // Right turn exit -> kerb on Left (outside)
            curr.kerbLeft = Math.max(curr.kerbLeft, exitIntensity);
          }
        }
      }

      this.samples = samples;
    }

    /**
     * Serialize current track configuration to a plain JSON-compatible object
     */
    toJSON() {
      return {
        id: this.id,
        name: this.name,
        subtitle: this.subtitle,
        defaultWidth: this.defaultWidth,
        closed: this.closed,
        nodes: this.nodes.map((n) => ({
          x: Math.round(n.x * 100) / 100,
          y: Math.round(n.y * 100) / 100,
          width: Math.round(n.width * 100) / 100,
          mode: n.mode,
          tension: n.tension,
          camber: n.camber,
          cornerRadius: n.cornerRadius
        }))
      };
    }

    /**
     * Restore track state from a JSON object or JSON string
     * @param {Object|string} data
     * @returns {boolean}
     */
    fromJSON(data) {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (!parsed || !Array.isArray(parsed.nodes) || parsed.nodes.length < 3) {
          return false;
        }
        this.id = parsed.id || 'custom';
        this.name = parsed.name || 'Custom Circuit';
        this.subtitle = parsed.subtitle || 'Imported Layout';
        this.defaultWidth = Number(parsed.defaultWidth) || 14;
        this.closed = parsed.closed !== undefined ? Boolean(parsed.closed) : true;
        this.nodes = parsed.nodes.map((n) => this._normalizeNode(n));
        this.rebuild();
        return true;
      } catch (err) {
        console.error('Failed to import track JSON:', err);
        return false;
      }
    }
  }

  window.App.Track = Track;
})();
