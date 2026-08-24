/* =========================================================
   EsquerrApp — the 3D tactical board (premium)

   WEB ONLY, and lazily loaded. Nothing here is fetched until a coach
   opens the 3D view: three.js is 733 KB, the toggle is hidden when
   WebGL is unavailable, and scripts/build-www.js keeps both this file
   and vendor/ out of the APK.

   THE THING TO UNDERSTAND BEFORE EDITING: this is a second VIEW over
   the same state, not a second board. It reads and writes the very
   same `fa_tactic_*` localStorage keys the 2D editor uses, through the
   same js/board-state.js setters, so `buildBoardEntry` produces a
   byte-identical payload whichever view drew it. A board can be
   started in 2D, edited in 3D and saved with no conversion anywhere.

   That is why there is no 3D-specific data anywhere in this file. A
   camera angle is not saved; a player position is a percentage of the
   pitch, exactly as it has always been. Everything visual is derived:

     percentages ---- BG.toWorld ----> metres in the scene
     metres      ---- BG.toPercent --> percentages, on drop

   Coordinate convention: three.js is Y-up, so the pitch lies in the
   XZ plane. BG.toWorld returns {x, z} and Y is height above the turf —
   which is only ever non-zero for the ball, the goals and anything
   billboarded.

   Loaded as an ES module via dynamic import() from app.js.
   ========================================================= */
import * as THREE from '../vendor/three.module.min.js';

/* Colours picked to match the 2D board rather than to look good in
   isolation: a coach switching views should recognise the same pitch.
   #2e7d32 is .tb-field's background. */
const TURF = 0x2e7d32;
const TURF_DARK = 0x27682b;      // the mown stripe
const LINE = 0xffffff;
const GK_COLOR = '#f5c842';      // same gold the 2D board uses

/* One metre of pitch is one unit of world. Nothing rescales this, so
   every distance in the file can be read as metres. */
const PLAYER_R = 0.9;            // a disc a bit wider than a person
const PLAYER_H = 0.35;
const BALL_R = 0.45;             // oversized; a real ball is invisible here
const CONE_R = 0.35;
const CONE_H = 0.7;

export function createBoard3D(opts) {
  const {
    container,          // the element to mount into
    getPitch,           // () => [L, W] or null
    getBoardType,       // () => 'full' | 'half' | 'area'
    getState,           // () => the current scratch state, plain data
    onMove,             // (kind, index, [leftPct, topPct]) => void
    onSelect,           // (kind, index) => void  (null when deselecting)
    BG,                 // board-geom, injected so this file imports nothing app-side
    fillCss,            // the striped-kit renderer from utils.js
    parseFill,
    readOnly            // true for playback-only surfaces
  } = opts;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2410);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1000);
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  /* ── Lighting ────────────────────────────────────────────────
     A hemisphere for ambient sky/ground bounce plus one directional
     key. No shadow maps: eleven discs casting shadows costs a shadow
     pass every frame and buys nothing a coach is looking for. */
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x2a3a1a, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(30, 60, 20);
  scene.add(key);

  /* ── The pitch ───────────────────────────────────────────────
     Markings are drawn into a CanvasTexture rather than built as
     meshes. Thirty thin boxes fighting the turf for depth is how you
     get z-fighting on the lines; one texture cannot z-fight at all,
     redraws instantly on resize, and costs one draw call. */
  let pitchMesh = null;
  let goals = [];

  function markingsTexture(pitch, boardType) {
    const e = BG.extent(pitch, boardType, false);
    /* ~10 px per metre, capped: a 130 m pitch would otherwise ask for
       a 1300 px texture on an axis nobody is looking at closely. */
    const PPM = 10;
    const cw = Math.min(2048, Math.round(e.ax * PPM));
    const ch = Math.min(2048, Math.round(e.ay * PPM));
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    const sx = cw / e.ax, sy = ch / e.ay;

    // Turf, with mown stripes running along the pitch's length.
    g.fillStyle = '#' + TURF.toString(16).padStart(6, '0');
    g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#' + TURF_DARK.toString(16).padStart(6, '0');
    const stripes = 10;
    for (let i = 0; i < stripes; i += 2) {
      g.fillRect((i / stripes) * cw, 0, cw / stripes, ch);
    }

    g.strokeStyle = '#ffffff';
    g.lineWidth = Math.max(1.5, 0.12 * Math.min(sx, sy));
    g.globalAlpha = 0.85;

    const m = BG.markings(pitch, boardType, false);
    const rect = (r) => { if (r) g.strokeRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy); };
    const circ = (c, from, to) => {
      if (!c) return;
      g.beginPath();
      g.ellipse(c.cx * sx, c.cy * sy, c.r * sx, c.r * sy, 0, from || 0, to === undefined ? Math.PI * 2 : to);
      g.stroke();
    };
    const dot = (s) => {
      if (!s) return;
      g.beginPath();
      g.ellipse(s.cx * sx, s.cy * sy, 0.2 * sx, 0.2 * sy, 0, 0, Math.PI * 2);
      g.fillStyle = '#ffffff'; g.fill();
    };

    // Perimeter — the touchlines and goal lines, inset by half a
    // stroke so the line sits ON the boundary rather than outside it.
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, cw - g.lineWidth, ch - g.lineWidth);

    if (m.halfway) {
      g.beginPath();
      g.moveTo(m.halfway.x1 * sx, m.halfway.y1 * sy);
      g.lineTo(m.halfway.x2 * sx, m.halfway.y2 * sy);
      g.stroke();
    }
    circ(m.centerCircle);
    dot(m.centerSpot);
    rect(m.penaltyLeft); rect(m.penaltyRight);
    rect(m.goalAreaLeft); rect(m.goalAreaRight);
    dot(m.penaltySpotL); dot(m.penaltySpotR);
    /* The arcs, drawn as the part of the circle outside the box. In 2D
       this is a clip-path; on a canvas it is an arc range, which is
       both cheaper and easier to get right. */
    if (m.arcLeft) {
      const a = Math.acos(Math.min(1, Math.max(-1,
          (m.penaltyLeft.x + m.penaltyLeft.w - m.arcLeft.cx) / m.arcLeft.r)));
      circ(m.arcLeft, -a, a);
    }
    if (m.arcRight) {
      const a = Math.acos(Math.min(1, Math.max(-1,
          (m.arcRight.cx - m.penaltyRight.x) / m.arcRight.r)));
      circ(m.arcRight, Math.PI - a, Math.PI + a);
    }
    (m.corners || []).forEach((c) => {
      // A whole circle; the pitch edge crops it, same as the 2D board.
      g.beginPath();
      g.ellipse(c.cx * sx, c.cy * sy, m.cornerR * sx, m.cornerR * sy, 0, 0, Math.PI * 2);
      g.stroke();
    });

    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildPitch() {
    const pitch = getPitch();
    const bt = getBoardType();
    const e = BG.extent(pitch, bt, false);

    if (pitchMesh) {
      pitchMesh.geometry.dispose();
      pitchMesh.material.map.dispose();
      pitchMesh.material.dispose();
      scene.remove(pitchMesh);
    }
    pitchMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(e.ax, e.ay),
        new THREE.MeshLambertMaterial({map: markingsTexture(pitch, bt)}));
    pitchMesh.rotation.x = -Math.PI / 2;   // lie flat, Y-up
    scene.add(pitchMesh);

    // Goals: real geometry at regulation size, so they stay physically
    // sized while the pitch grows around them.
    goals.forEach((gg) => scene.remove(gg));
    goals = [];
    const m = BG.markings(pitch, bt, false);
    [m.goalLeft, m.goalRight].forEach((gl) => {
      if (!gl) return;
      const grp = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({color: 0xf2f2f2});
      const postR = 0.12;
      const post = () => new THREE.Mesh(
          new THREE.CylinderGeometry(postR, postR, gl.h, 8), mat);
      const a = post(), b = post();
      a.position.set(0, gl.h / 2, -gl.w / 2);
      b.position.set(0, gl.h / 2, gl.w / 2);
      const bar = new THREE.Mesh(
          new THREE.CylinderGeometry(postR, postR, gl.w, 8), mat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(0, gl.h, 0);
      grp.add(a, b, bar);
      // gl.x is the goal LINE; the mouth faces into the pitch.
      const w = BG.toWorld((gl.x / e.ax) * 100, ((gl.y + gl.h / 2) / e.ay) * 100, pitch, bt);
      grp.position.set(w.x, 0, 0);
      scene.add(grp);
      goals.push(grp);
    });
  }

  /* ── Objects ─────────────────────────────────────────────────
     Every movable thing is registered here with the kind and index the
     2D state uses, so a raycast hit maps straight back to
     `fa_tactic_positions[3]` with no lookup table. */
  const objects = [];        // {mesh, kind, index}
  let objectRoot = new THREE.Group();
  scene.add(objectRoot);

  /** A player disc, its number and kit painted into a canvas. */
  function playerTexture(fill, number) {
    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    /* Reuse the 2D fill helpers so a striped kit is the SAME striped
       kit — the encoding (`s|v|4|#a50044|#004d98`) is not something
       this file should learn to parse a second time. */
    const css = fillCss(fill);
    const p = parseFill(fill);
    /* `striped`, not `on`. parseFill returns {striped, dir, n, c1, c2};
       encodeFill takes `on` as its first ARGUMENT, and reading the
       parser's output as though it had the encoder's parameter name
       silently renders every striped kit solid — a wrong board that
       throws nothing. */
    if (p && p.striped) {
      const n = p.n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = (i % 2 === 0) ? p.c1 : p.c2;
        if (p.dir === 'h') g.fillRect(0, (i / n) * S, S, S / n);
        else g.fillRect((i / n) * S, 0, S / n, S);
      }
    } else {
      // Solid: parseFill puts the colour in c1 either way.
      g.fillStyle = p.c1 || '#ffffff';
      g.fillRect(0, 0, S, S);
    }
    if (number) {
      g.fillStyle = css.fg || '#000';
      g.font = 'bold ' + Math.round(S * 0.5) + 'px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(number), S / 2, S / 2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function addPlayer(kind, i, pct, fill, number) {
    const pitch = getPitch(), bt = getBoardType();
    const w = BG.toWorld(pct[0], pct[1], pitch, bt);
    const top = new THREE.MeshLambertMaterial({map: playerTexture(fill, number)});
    const side = new THREE.MeshLambertMaterial({color: 0x222222});
    // Cylinder materials are [side, top, bottom].
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(PLAYER_R, PLAYER_R, PLAYER_H, 24),
        [side, top, side]);
    mesh.position.set(w.x, PLAYER_H / 2, w.z);
    objectRoot.add(mesh);
    objects.push({mesh, kind, index: i});
    return mesh;
  }

  function addBall(i, pct) {
    const w = BG.toWorld(pct[0], pct[1], getPitch(), getBoardType());
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_R, 20, 14),
        new THREE.MeshLambertMaterial({color: 0xffffff}));
    mesh.position.set(w.x, BALL_R, w.z);
    objectRoot.add(mesh);
    objects.push({mesh, kind: 'balls', index: i});
  }

  function addCone(i, pct) {
    const w = BG.toWorld(pct[0], pct[1], getPitch(), getBoardType());
    const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(CONE_R, CONE_H, 12),
        new THREE.MeshLambertMaterial({color: 0xff8c00}));
    mesh.position.set(w.x, CONE_H / 2, w.z);
    objectRoot.add(mesh);
    objects.push({mesh, kind: 'cones', index: i});
  }

  /** Arrows: a flat shaft on the turf plus a cone head. */
  function addArrow(a) {
    const pitch = getPitch(), bt = getBoardType();
    const p1 = BG.toWorld(a[0], a[1], pitch, bt);
    const p2 = BG.toWorld(a[2], a[3], pitch, bt);
    const col = new THREE.Color(a[4] || '#ffffff');
    const from = new THREE.Vector3(p1.x, 0.06, p1.z);
    const to = new THREE.Vector3(p2.x, 0.06, p2.z);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.01) return;
    dir.normalize();

    const HEAD = Math.min(2.2, len * 0.3);
    const mat = new THREE.MeshBasicMaterial({color: col});
    const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, len - HEAD, 8), mat);
    // A cylinder is Y-aligned; point it along the arrow.
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    shaft.position.copy(from).addScaledVector(dir, (len - HEAD) / 2);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.45, HEAD, 12), mat);
    head.quaternion.copy(shaft.quaternion);
    head.position.copy(to).addScaledVector(dir, -HEAD / 2);
    objectRoot.add(shaft, head);
  }

  /** Zones: a translucent plane just above the turf. */
  function addRect(r) {
    const pitch = getPitch(), bt = getBoardType();
    const e = BG.extent(pitch, bt, false);
    const w = (r[2] / 100) * e.ax;
    const h = (r[3] / 100) * e.ay;
    if (w <= 0 || h <= 0) return;
    const c = BG.toWorld(r[0] + r[2] / 2, r[1] + r[3] / 2, pitch, bt);
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(r[4] || '#ffffff'),
          transparent: true,
          opacity: r[5] != null ? r[5] : 0.3,
          depthWrite: false,
          side: THREE.DoubleSide
        }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(c.x, 0.04, c.z);
    objectRoot.add(mesh);
  }

  /** Pen strokes: a line strip laid on the turf. */
  function addPenLine(p) {
    const pitch = getPitch(), bt = getBoardType();
    const pts = String(p[0] || '').trim().split(/\s+/).map((pair) => {
      const xy = pair.split(',');
      const w = BG.toWorld(parseFloat(xy[0]), parseFloat(xy[1]), pitch, bt);
      return new THREE.Vector3(w.x, 0.08, w.z);
    }).filter((v) => isFinite(v.x) && isFinite(v.z));
    if (pts.length < 2) return;
    objectRoot.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({color: new THREE.Color(p[1] || '#ffffff')})));
  }

  /** Text labels: a billboarded sprite that always faces the camera. */
  function addText(t) {
    const cv = document.createElement('canvas');
    const g0 = cv.getContext('2d');
    const FS = 48;
    g0.font = 'bold ' + FS + 'px system-ui, sans-serif';
    const text = String(t[2] || '');
    cv.width = Math.max(16, Math.ceil(g0.measureText(text).width) + 24);
    cv.height = FS + 20;
    const g = cv.getContext('2d');
    g.font = 'bold ' + FS + 'px system-ui, sans-serif';
    const bg = t[3] || '#000000';
    g.fillStyle = bg;
    g.globalAlpha = t[4] != null ? t[4] : 0.8;
    g.fillRect(0, 0, cv.width, cv.height);
    g.globalAlpha = 1;
    g.fillStyle = textColorFor(bg);
    g.textBaseline = 'middle';
    g.fillText(text, 12, cv.height / 2);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, depthTest: false}));
    const w = BG.toWorld(t[0], t[1], getPitch(), getBoardType());
    const scale = 6;
    spr.scale.set(scale, scale * (cv.height / cv.width), 1);
    spr.position.set(w.x, 2.2, w.z);
    objectRoot.add(spr);
  }

  // Local copy so this module needs nothing from app.js at import time.
  function textColorFor(hex) {
    const h = String(hex || '#000000').replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16),
        b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000000' : '#ffffff';
  }

  /* ── Rebuilding ──────────────────────────────────────────────
     Whole-scene rebuild rather than diffing. A board holds a few dozen
     objects; diffing them would be more code than it saves and is
     where a stale-object bug would live. */
  function rebuild() {
    objects.length = 0;
    scene.remove(objectRoot);
    disposeTree(objectRoot);
    objectRoot = new THREE.Group();
    scene.add(objectRoot);

    const s = getState();
    const teamFill = s.teamColor || '#ffffff';
    const oppFill = s.oppColor || '#e53935';

    (s.positions || []).forEach((p, i) => {
      if (!p) return;                       // null = a deleted slot
      const num = (s.numbers && s.numbers[i]) || '';
      const isGk = String(num) === '1';
      addPlayer('positions', i, p,
          isGk ? GK_COLOR : ((s.colors && s.colors[i]) || teamFill), num);
    });
    if (s.showOpp !== false) {
      (s.oppPositions || []).forEach((p, i) => {
        if (!p) return;
        const num = (s.oppNumbers && s.oppNumbers[i]) || '';
        const isGk = String(num) === '1';
        addPlayer('oppPositions', i, p,
            isGk ? GK_COLOR : ((s.oppColors && s.oppColors[i]) || oppFill), num);
      });
    }
    (s.balls || []).forEach((b, i) => { if (b) addBall(i, b); });
    (s.cones || []).forEach((c, i) => { if (c) addCone(i, c); });
    (s.rects || []).forEach(addRect);
    (s.arrows || []).forEach(addArrow);
    (s.penLines || []).forEach(addPenLine);
    (s.texts || []).forEach(addText);
  }

  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }

  /* ── Camera ──────────────────────────────────────────────────
     A small orbit controller rather than the OrbitControls addon: the
     addon is a large file of features this does not use, and the polar
     clamp — never let the camera go under the turf — is the only part
     that actually matters here. */
  const cam = {theta: -Math.PI / 2, phi: 1.02, dist: 100, target: new THREE.Vector3()};

  function applyCamera() {
    const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
    camera.position.set(
        cam.target.x + cam.dist * sp * Math.cos(cam.theta),
        cam.target.y + cam.dist * cp,
        cam.target.z + cam.dist * sp * Math.sin(cam.theta));
    camera.lookAt(cam.target);
  }

  function frameBoard() {
    const e = BG.extent(getPitch(), getBoardType(), false);
    // Far enough back that the long axis fits the vertical FOV.
    cam.dist = Math.max(e.ax, e.ay) * 1.15;
    cam.target.set(0, 0, 0);
    applyCamera();
  }

  /* ── Interaction ─────────────────────────────────────────────
     One pointerdown decides between orbiting and dragging: a ray at
     the objects first, and only if it misses does the pointer become a
     camera control. That ordering is what makes a drag feel direct
     rather than fighting the camera. */
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  let mode = null;            // 'orbit' | 'drag'
  let dragging = null;        // the picked {mesh, kind, index}
  let last = {x: 0, y: 0};

  function toNdc(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  function pick(ev) {
    toNdc(ev);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(objects.map((o) => o.mesh), false);
    if (!hits.length) return null;
    return objects.find((o) => o.mesh === hits[0].object) || null;
  }

  /** Where the pointer meets the turf, in world metres. */
  function groundPoint(ev) {
    toNdc(ev);
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(ground, hit) ? hit : null;
  }

  function onPointerDown(ev) {
    renderer.domElement.setPointerCapture(ev.pointerId);
    last = {x: ev.clientX, y: ev.clientY};
    const hit = readOnly ? null : pick(ev);
    if (hit) {
      mode = 'drag';
      dragging = hit;
      if (onSelect) onSelect(hit.kind, hit.index);
    } else {
      mode = 'orbit';
      if (onSelect) onSelect(null, null);
    }
  }

  function onPointerMove(ev) {
    if (!mode) return;
    if (mode === 'orbit') {
      cam.theta -= (ev.clientX - last.x) * 0.006;
      cam.phi -= (ev.clientY - last.y) * 0.006;
      /* Never under the turf, never exactly overhead: at phi = 0 the
         look-at basis degenerates and the view snaps through a right
         angle. */
      cam.phi = Math.max(0.12, Math.min(Math.PI / 2 - 0.02, cam.phi));
      last = {x: ev.clientX, y: ev.clientY};
      applyCamera();
      return;
    }
    const g = groundPoint(ev);
    if (!g || !dragging) return;
    const y = dragging.mesh.position.y;
    dragging.mesh.position.set(g.x, y, g.z);
  }

  function onPointerUp() {
    if (mode === 'drag' && dragging && onMove) {
      const p = dragging.mesh.position;
      const pct = BG.toPercent(p.x, p.z, getPitch(), getBoardType());
      /* Clamped to the board: a drag that leaves the pitch would
         otherwise store a percentage outside 0-100, which the 2D view
         renders off the edge of its box with no way to grab it back. */
      onMove(dragging.kind, dragging.index, [
        Math.max(0, Math.min(100, pct[0])),
        Math.max(0, Math.min(100, pct[1]))
      ]);
    }
    mode = null;
    dragging = null;
  }

  function onWheel(ev) {
    ev.preventDefault();
    cam.dist = Math.max(15, Math.min(400, cam.dist * (1 + Math.sign(ev.deltaY) * 0.1)));
    applyCamera();
  }

  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('wheel', onWheel, {passive: false});

  /* ── Render loop ─────────────────────────────────────────────
     Renders on demand, not on a permanent rAF: a static board is the
     usual state and spinning the GPU for it drains a laptop for no
     reason. Anything that changes the scene calls invalidate(). */
  let needsRender = true;
  let alive = true;
  function invalidate() { needsRender = true; }

  function resize() {
    const w = container.clientWidth || 800;
    const h = Math.max(320, Math.round(w * 0.6));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }

  function tick() {
    if (!alive) return;
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
    requestAnimationFrame(tick);
  }

  const ro = (typeof ResizeObserver !== 'undefined')
    ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container);

  // Any interaction changes the picture; keep it in one place.
  ['pointermove', 'pointerdown', 'pointerup', 'wheel'].forEach((n) =>
    el.addEventListener(n, invalidate));

  buildPitch();
  rebuild();
  frameBoard();
  resize();
  tick();

  return {
    /** Re-read the state and redraw. Call after any external edit. */
    refresh() { buildPitch(); rebuild(); invalidate(); },
    /** Re-read objects only — cheaper, and enough during playback. */
    refreshObjects() { rebuild(); invalidate(); },
    /** Move one object without a rebuild, for animation frames. */
    setPosition(kind, index, pct) {
      const o = objects.find((x) => x.kind === kind && x.index === index);
      if (!o) return;
      const w = BG.toWorld(pct[0], pct[1], getPitch(), getBoardType());
      o.mesh.position.set(w.x, o.mesh.position.y, w.z);
      invalidate();
    },
    resetCamera() { frameBoard(); invalidate(); },
    resize,
    invalidate,
    destroy() {
      alive = false;
      if (ro) ro.disconnect();
      disposeTree(scene);
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  };
}
