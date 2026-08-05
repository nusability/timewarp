// The 3D spiral timeline view. Owns the Three.js scene: a helical band
// ("floating through space"), per-topic lanes with range strips and event
// markers, year ticks, picking and hover.

import * as THREE from 'three';
import { OrbitControls } from './vendor/controls/OrbitControls.js';
import { formatYear } from './time.js';

const BG = '#0b0e14';

export class SpiralView {
  constructor(canvas, { onPick, onHover } = {}) {
    this.canvas = canvas;
    this.onPick = onPick || (() => {});
    this.onHover = onHover || (() => {});

    // Geometry parameters of the spiral. The spiral is calendar-aligned:
    // one turn = one period (a power of ten years, auto-chosen from the
    // domain), so period boundaries always sit at the same angle.
    this.turns = 10;
    this.period = 10;  // years per turn
    this.R0 = 46;      // base radius
    this.Rg = 26;      // radius growth over the full domain (slightly conical)
    this.H = 110;      // total height
    this.bandW = 16;   // band width
    this.maxTurns = 24;

    this.domain = { t0: 1900, t1: 2000 };
    this.pickables = [];
    this.hovered = null;
    this.textureCache = new Map();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 900;
    // Spinning around the spiral's axis is clamped: the camera azimuth is
    // locked so the period boundary (Jan 1) stays fixed at the top of the
    // screen. Perspective changes remain — tilt, zoom, pan.
    this.controls.minAzimuthAngle = 0;
    this.controls.maxAzimuthAngle = 0;
    this.controls.minPolarAngle = 0.1;
    this.controls.maxPolarAngle = 1.45;
    // Touch: with rotation clamped, one finger is free to pan; perspective
    // (tilt + pinch zoom) moves to two fingers. Two-finger drags may go any
    // direction — the azimuth lock guarantees Jan 1 stays at the top.
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    this.staticG = new THREE.Group();  // band, ticks, stars — rebuilt on domain change
    this.dataG = new THREE.Group();    // topics — rebuilt on data/filter change
    this.scene.add(this.staticG, this.dataG);
    this.scene.add(this.makeStarfield());

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    canvas.addEventListener('pointerdown', (e) => { this.downAt = [e.clientX, e.clientY]; });
    canvas.addEventListener('click', (e) => this.handleClick(e));
    canvas.addEventListener('pointermove', (e) => { this.moveEvent = e; });
    canvas.addEventListener('pointerleave', () => { this.moveEvent = null; this.setHover(null); });

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.resetCamera();

    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ---- spiral math -------------------------------------------------------

  // Map (time, across-band offset u) -> world position. u in [-bandW/2, bandW/2].
  // t0 is snapped to a period boundary, so every multiple of the period lands
  // at the boundary angle: -Z, the far side of the coil from the locked
  // camera, which projects to the top of the screen.
  P(t, u = 0, lift = 0) {
    const { t0, t1 } = this.domain;
    const n = (t - t0) / (t1 - t0);
    const theta = -Math.PI / 2 + ((t - t0) / this.period) * Math.PI * 2;
    const r = this.R0 + this.Rg * n + u;
    return new THREE.Vector3(r * Math.cos(theta), (n - 0.5) * this.H + lift, r * Math.sin(theta));
  }

  clampT(t) {
    return Math.min(this.domain.t1, Math.max(this.domain.t0, t));
  }

  inDomain(a, b = a) {
    return b >= this.domain.t0 && a <= this.domain.t1;
  }

  // ---- scene building ----------------------------------------------------

  setDomain(t0, t1) {
    if (!(t1 > t0)) t1 = t0 + 1;
    // Period per turn: the smallest power of ten that keeps the turn count
    // manageable — year, decade, century, millennium, … up to billions.
    let period = 1;
    while ((t1 - t0) / period > this.maxTurns && period < 1e10) period *= 10;
    this.period = period;
    // Snap the domain to period boundaries so turns start and end "at the top".
    t0 = Math.floor(t0 / period) * period;
    t1 = Math.ceil(t1 / period) * period;
    if (t1 <= t0) t1 = t0 + period;
    this.turns = (t1 - t0) / period;
    this.H = Math.min(200, Math.max(56, this.turns * 14));
    this.domain = { t0, t1 };
    disposeGroup(this.staticG);
    this.staticG.add(this.makeBand(), ...this.makeTicks());
  }

  resetCamera() {
    const r = this.R0 + this.Rg + this.bandW;
    // Camera on the locked azimuth (+Z), elevated: the boundary at -Z is the
    // far side of every coil, i.e. the top of the screen.
    this.camera.position.set(0, this.H * 0.75, r * 2.4);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  makeBand() {
    const { t0, t1 } = this.domain;
    const steps = Math.max(64, Math.round(this.turns * 150));
    const w = this.bandW / 2;
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    for (let i = 0; i <= steps; i++) {
      const t = t0 + (i / steps) * (t1 - t0);
      const n = i / steps;
      const a = this.P(t, -w), b = this.P(t, w);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      // Colorful but muted: a slow sweep around the hue wheel, desaturated so
      // topic highlights always stand out against the band.
      c.setHSL((0.62 + n * 0.9) % 1, 0.42, 0.46);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < steps) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.28,
      depthWrite: false,
    });
    const band = new THREE.Mesh(g, m);

    // Brighter edge rails give the band definition.
    for (const u of [-w, w]) {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        pts.push(this.P(t0 + (i / steps) * (t1 - t0), u, 0.05));
      }
      const lg = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(lg, new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.22,
      }));
      band.add(line);
    }
    return band;
  }

  makeTicks() {
    const { t0, t1 } = this.domain;
    const w = this.bandW / 2;
    const objs = [];
    const segs = [], minorSegs = [];
    // Major ticks at every period boundary — they all share the same angle,
    // stacking into a visible "12 o'clock" line up the spiral.
    for (let y = t0; y <= t1; y += this.period) {
      const a = this.P(y, -w, 0.08), b = this.P(y, w, 0.08);
      segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const label = this.makeTextSprite(formatYear(y), {
        font: '600 30px system-ui, sans-serif', color: '#8fa3c4', pill: false, height: 2.6,
      });
      label.position.copy(this.P(y, w + 2.6, 0.4));
      objs.push(label);
    }
    // With few turns, subdivide each turn into tenths so the eye can still
    // read positions within a period.
    if (this.turns <= 6) {
      const sub = this.period / 10;
      for (let y = t0 + sub; y < t1; y += sub) {
        if (Math.abs(y / this.period - Math.round(y / this.period)) < 1e-9) continue;
        const a = this.P(y, w * 0.55, 0.06), b = this.P(y, w, 0.06);
        minorSegs.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    objs.push(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.4,
    })));
    if (minorSegs.length) {
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(minorSegs, 3));
      objs.push(new THREE.LineSegments(mg, new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.15,
      })));
    }
    return objs;
  }

  makeStarfield() {
    const n = 900, pos = [];
    for (let i = 0; i < n; i++) {
      const r = 280 + Math.random() * 320;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x9db4d0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.5,
    }));
  }

  // A ribbon strip along the band between times ta..tb at lane offsets u0..u1.
  makeStrip(ta, tb, u0, u1, color, opacity, lift) {
    ta = this.clampT(ta); tb = this.clampT(tb);
    if (!(tb > ta)) tb = Math.min(this.domain.t1, ta + (this.domain.t1 - this.domain.t0) * 0.002);
    const span = (tb - ta) / (this.domain.t1 - this.domain.t0);
    const steps = Math.max(6, Math.ceil(span * this.turns * 110));
    const pos = [], idx = [];
    for (let i = 0; i <= steps; i++) {
      const t = ta + (i / steps) * (tb - ta);
      const a = this.P(t, u0, lift), b = this.P(t, u1, lift);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (i < steps) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false,
    }));
  }

  // A thin arc line along the band at offset u — the subtle form of a range.
  makeArc(ta, tb, u, color, opacity, lift) {
    ta = this.clampT(ta); tb = this.clampT(tb);
    if (!(tb > ta)) tb = Math.min(this.domain.t1, ta + (this.domain.t1 - this.domain.t0) * 0.002);
    const span = (tb - ta) / (this.domain.t1 - this.domain.t0);
    const steps = Math.max(6, Math.ceil(span * this.turns * 110));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      pts.push(this.P(ta + (i / steps) * (tb - ta), u, lift));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  }

  // topics: [{ id, title, color, laneIndex, laneCount, selfEvent, events }]
  // Each event: { qid, title, cat, kind, ta, tb, tp, open, tier, thumb, whenText }
  setTopics(topics) {
    disposeGroup(this.dataG);
    this.pickables = [];
    this.setHover(null);

    for (const topic of topics) {
      const laneW = this.bandW / Math.max(1, topic.laneCount);
      const uc = -this.bandW / 2 + laneW * (topic.laneIndex + 0.5);
      const color = new THREE.Color(topic.color);

      // The topic's own span is the ONLY bold ribbon — "the war years in
      // pink" — framed by start/end walls across the full band with their
      // exact dates, so every event reads as before / during / after.
      const se = topic.selfEvent;
      if (se && se.ta != null && this.inDomain(se.ta, se.open ? this.domain.t1 : (se.tb ?? se.ta))) {
        const tb = se.open ? this.domain.t1 : (se.tb ?? se.ta);
        this.dataG.add(this.makeStrip(se.ta, tb, uc - laneW * 0.44, uc + laneW * 0.44, color, 0.7, 0.12));
        for (const edge of [-0.44, 0.44]) {
          this.dataG.add(this.makeArc(se.ta, tb, uc + laneW * edge, 0xffffff, 0.65, 0.16));
        }
        const dates = (se.whenText || '').split(' – ');
        const wallW = (this.domain.t1 - this.domain.t0) * 0.0012;
        const walls = [[se.ta, dates[0]]];
        if (!se.open) walls.push([tb, dates[1]]);
        for (const [t, dateText] of walls) {
          this.dataG.add(this.makeStrip(t - wallW, t + wallW, -this.bandW / 2, this.bandW / 2, color, 0.95, 0.3));
          if (dateText && dateText !== 'today') {
            const lbl = this.makeTextSprite(dateText, {
              font: '600 24px system-ui, sans-serif', color: '#ffffff', pill: true,
              border: topic.color, height: 2.1, maxChars: 20,
            });
            lbl.position.copy(this.P(t, -this.bandW / 2 - 3.2, 0.9));
            this.dataG.add(lbl);
          }
        }
      }

      for (const ev of topic.events) {
        const tMark = ev.kind === 'point' ? ev.tp : ev.ta ?? ev.tb;
        const jitter = (hash01(ev.qid) - 0.5) * laneW * 0.5;
        // Range threads only for major events — hundreds of minor ranges
        // otherwise smear the whole band with lines.
        if (!ev.isSelf && ev.kind !== 'point' && ev.ta != null && ev.tier <= 1) {
          const tb = ev.open ? this.domain.t1 : (ev.tb ?? ev.ta);
          if (this.inDomain(ev.ta, tb)) {
            this.dataG.add(this.makeArc(
              ev.ta, tb, uc + jitter,
              color, ev.open ? 0.15 : 0.45, 0.2 + topic.laneIndex * 0.03,
            ));
          }
        }
        if (tMark == null || !this.inDomain(tMark)) continue;

        const marker = this.makeMarker(ev, topic);
        marker.position.copy(this.P(tMark, uc + jitter, 1.1));
        marker.userData = { ev, topic };
        this.dataG.add(marker);
        this.pickables.push(marker);

        // Every event carries its title — minor ones in smaller type.
        const minor = ev.tier === 2;
        const label = this.makeTextSprite(ev.title, {
          font: ev.isSelf ? '700 34px system-ui, sans-serif'
            : minor ? '500 22px system-ui, sans-serif' : '500 26px system-ui, sans-serif',
          color: minor ? '#c3cfe6' : '#e9eefb', pill: true,
          border: ev.isSelf ? topic.color : null,
          height: ev.isSelf ? 3.4 : minor ? 1.8 : 2.5,
          maxChars: minor ? 24 : 34,
        });
        label.position.copy(marker.position);
        label.position.y += ev.isSelf ? 6 : ev.tier === 0 ? 4.6 : 2.1;
        // Labels are pickable too — a marker can be occluded by a nearer
        // coil while its always-on-top label remains visible.
        label.userData = { ev, topic };
        this.pickables.push(label);
        this.dataG.add(label);
      }
    }
  }

  makeMarker(ev, topic) {
    const size = ev.isSelf ? 7.5 : ev.tier === 0 ? 5.5 : ev.tier === 1 ? 2.4 : 1.8;
    // depthWrite must stay off: a sprite quad writing depth culls whatever
    // transparent geometry draws behind it, leaving a dark square.
    const mat = new THREE.SpriteMaterial({
      map: this.dotTexture(topic.color), depthTest: true, depthWrite: false, transparent: true,
    });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 5;
    s.scale.set(size, size, 1);
    // Top-tier events get their Wikipedia thumbnail as the marker face.
    if ((ev.tier === 0 || ev.isSelf) && ev.thumb) {
      makeThumbTexture(ev.thumb, topic.color).then((tex) => {
        if (tex && s.material) { s.material.map = tex; s.material.needsUpdate = true; }
      });
    }
    return s;
  }

  dotTexture(color) {
    const key = `dot:${color}`;
    if (this.textureCache.has(key)) return this.textureCache.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, color);
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = color;
    g.beginPath(); g.arc(32, 32, 17, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(32, 32, 17, 0, Math.PI * 2); g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textureCache.set(key, tex);
    return tex;
  }

  makeTextSprite(text, { font, color, pill, border, height, maxChars = 60 }) {
    if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = font;
    const tw = g.measureText(text).width;
    const padX = pill ? 18 : 4, padY = pill ? 10 : 2;
    c.width = Math.ceil(tw + padX * 2);
    c.height = Math.ceil(44 + padY * 2);
    const ctx = c.getContext('2d');
    if (pill) {
      ctx.fillStyle = 'rgba(9,13,22,0.82)';
      ctx.strokeStyle = border || 'rgba(255,255,255,0.16)';
      ctx.lineWidth = border ? 3 : 1.5;
      roundRect(ctx, 1.5, 1.5, c.width - 3, c.height - 3, 12);
      ctx.fill(); ctx.stroke();
    }
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, c.width / 2, c.height / 2 + 1);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(height * (c.width / c.height), height, 1);
    sp.renderOrder = 10;
    return sp;
  }

  // ---- interaction -------------------------------------------------------

  raycastEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    return hits.length ? hits[0].object : null;
  }

  handleClick(e) {
    if (this.downAt) {
      const dx = e.clientX - this.downAt[0], dy = e.clientY - this.downAt[1];
      if (dx * dx + dy * dy > 36) return; // it was a drag, not a click
    }
    const obj = this.raycastEvent(e);
    this.onPick(obj ? obj.userData.ev : null, obj ? obj.userData.topic : null);
  }

  setHover(obj, e) {
    if (this.hovered && this.hovered !== obj && this.hovered.userData.origScale) {
      this.hovered.scale.copy(this.hovered.userData.origScale);
    }
    this.hovered = obj;
    this.canvas.style.cursor = obj ? 'pointer' : 'grab';
    if (obj) {
      if (!obj.userData.origScale) obj.userData.origScale = obj.scale.clone();
      obj.scale.copy(obj.userData.origScale).multiplyScalar(1.25);
      this.onHover(obj.userData.ev, obj.userData.topic, e.clientX, e.clientY);
    } else {
      this.onHover(null);
    }
  }

  focusTime(t, u = 0) {
    const target = this.P(this.clampT(t), u, 0);
    const offset = this.camera.position.clone().sub(this.controls.target);
    const cap = (this.R0 + this.Rg + this.bandW) * 2.4;
    if (offset.length() > cap) offset.setLength(cap);
    this.controls.target.copy(target);
    this.camera.position.copy(target.clone().add(offset));
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    if (this.moveEvent) {
      this.setHover(this.raycastEvent(this.moveEvent), this.moveEvent);
      this.moveEvent = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// ---- helpers -------------------------------------------------------------

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const thumbCache = new Map();

function makeThumbTexture(url, borderColor) {
  const key = `${url}|${borderColor}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const S = 128, c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      roundRect(g, 2, 2, S - 4, S - 4, 20);
      g.save(); g.clip();
      const s = Math.max(S / img.width, S / img.height);
      g.drawImage(img, (S - img.width * s) / 2, (S - img.height * s) / 2, img.width * s, img.height * s);
      g.restore();
      g.strokeStyle = borderColor;
      g.lineWidth = 7;
      roundRect(g, 3.5, 3.5, S - 7, S - 7, 19);
      g.stroke();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      resolve(tex);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  thumbCache.set(key, p);
  return p;
}

function disposeGroup(group) {
  for (const child of [...group.children]) {
    child.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) m.dispose?.();
    });
    group.remove(child);
  }
}
