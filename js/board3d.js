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
/* A real ball is 0.11 m and invisible at pitch scale, so this is
   still oversized — but 0.45 overcorrected and read as a boulder.
   The travelling dot below is kept well under it: the two must never
   be confusable. */
const BALL_R = 0.25;
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
    onPath,             // (kind, index, {bend}|{apex}) => void
    BG,                 // board-geom, injected so this file imports nothing app-side
    BS,                 // board-state: the curve maths the tween also uses
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
     key that CASTS SHADOWS.

     I argued against shadow maps first time round on cost grounds.
     That was over-cautious: this scene has about twenty-five casters
     and one extra pass over them is nothing, while a ball with no
     shadow is genuinely hard to place in depth — which is the whole
     point of showing the board in 3D.

     The light is deliberately ANGLED, not overhead. An overhead light
     puts every shadow directly under its object, which adds no depth
     information at all; an angled one separates them and the eye
     reads height immediately. The cost is that a lofted ball's shadow
     lands away from where the ball is over the pitch — which is why
     the ball ALSO gets a straight-down marker below. Two different
     questions: "where is the sun" and "where is the ball". */
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x2a3a1a, 1.2));
  /* The sun's DIRECTION is fixed; its distance is set from the pitch
     size in fitShadowCamera(), so a big pitch does not push its own
     corners behind the light. */
  const LIGHT_DIR = new THREE.Vector3(0.5, 0.85, 0.38).normalize();
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.copy(LIGHT_DIR).multiplyScalar(120);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);
  scene.add(key.target);          // the target must be in the scene to count

  /* The shadow camera has to be FITTED to the pitch. Its default
     frustum is a couple of units across, so almost the whole board
     would fall outside it and receive no shadow at all — and the
     pitch is resizable, so this is refitted whenever it is rebuilt. */
  function fitShadowCamera() {
    const e = BG.extent(getPitch(), getBoardType(), false);

    /* Fit the BOUNDING SPHERE, not the pitch's width.

       The shadow camera looks down the light's axis, so what has to
       fit inside its frustum is the pitch as seen FROM THE LIGHT —
       and a rectangle viewed off-axis projects up to its full
       diagonal, not its longest side. Sizing against `max(ax, ay)`
       covered the middle of the board and clipped the corners, which
       is invisible from directly overhead and obvious the moment you
       orbit. Plus headroom, because a lofted ball and the goal frames
       stand above the turf and cast from there. */
    const radius = Math.hypot(e.ax, e.ay) / 2 * 1.15 + 12;

    /* The light DISTANCE scales with the pitch too. It was a fixed
       (40, 70, 30) regardless of pitch size, so a large pitch pushed
       geometry behind the light and a small one wasted the whole
       depth range. */
    const dist = radius * 2.2;
    key.position.copy(LIGHT_DIR).multiplyScalar(dist);
    key.target.position.set(0, 0, 0);
    key.target.updateMatrixWorld();

    const c = key.shadow.camera;
    c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
    /* Near and far hug the scene. They were 1 and 400 over a scene
       about 60 deep — spreading the depth buffer over six times the
       range it needed, which is what forced the large bias below. */
    c.near = Math.max(1, dist - radius - 20);
    c.far = dist + radius + 20;
    c.updateProjectionMatrix();

    /* THIS is what made shadows vanish when you orbited.

       `bias` is a fraction of the shadow camera's DEPTH RANGE, so its
       real cost depends on near/far. At the old -0.0008 over a 1..400
       range it was 0.32 m of depth — and a player is a disc 0.35 m
       tall. The bias pushed almost the whole player's shadow through
       the turf, so there was nothing left to see. From directly
       overhead you cannot tell, because the shadow hides under the
       player that casts it; the moment you orbit, it is simply gone.

       Tight near/far plus half the bias is 0.08 m — under a quarter
       of a player's height — which leaves the shadow on the grass
       while still clearing the acne. */
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
  }

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
    pitchMesh.receiveShadow = true;
    scene.add(pitchMesh);
    fitShadowCamera();   // the pitch can be resized under it

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
      [a, b, bar].forEach((m) => { m.castShadow = true; });
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
    mesh.castShadow = true;
    objectRoot.add(mesh);
    objects.push({mesh, kind, index: i, trailColour: pathColour(fill).getHex()});
    return mesh;
  }

  function addBall(i, pct) {
    const w = BG.toWorld(pct[0], pct[1], getPitch(), getBoardType());
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_R, 20, 14),
        new THREE.MeshLambertMaterial({color: 0xffffff}));
    mesh.position.set(w.x, BALL_R, w.z);
    mesh.castShadow = true;
    objectRoot.add(mesh);
    objects.push({mesh, kind: 'balls', index: i});
  }

  function addCone(i, pct) {
    const w = BG.toWorld(pct[0], pct[1], getPitch(), getBoardType());
    const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(CONE_R, CONE_H, 12),
        new THREE.MeshLambertMaterial({color: 0xff8c00}));
    mesh.position.set(w.x, CONE_H / 2, w.z);
    mesh.castShadow = true;
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

  /* ── Trajectories ────────────────────────────────────────────
     A path is drawn for anything that MOVED between the previous
     frame and this one. It is the move made visible: the curve is
     what the object will follow during playback, not a decoration
     laid on top of it, so the same BS.pathPoint that drives the tween
     draws the line.

     Three parts, matching the reference tool:
       the curve itself
       a dot running end to end, on a loop, showing direction
       two handles — a ROUND one on the curve that bends it, and a
       DIAMOND above it that sets the arc's peak

     Both handles are registered as pickable objects so the ordinary
     raycast drag machinery moves them; `kind` says which. */
  const travellers = [];     // {mesh, p0, p1, path} — animated each frame

  /* Every drawn trajectory, keyed by what it belongs to.

     Without this the curve Lines were added anonymously, so a drag
     could only move the handle mesh and nothing could recompute the
     curve until the rebuild on release — which is exactly the
     "lines snap into place instead of following" report. Holding the
     meshes lets updatePath() rewrite them per pointermove. */
  const pathEntries = [];

  function findPath(owner, index) {
    return pathEntries.find((e) => e.kind === owner && e.index === index) || null;
  }

  /**
   * Redraw one trajectory from a provisional path, mid-drag.
   *
   * Rewrites the EXISTING position buffers rather than rebuilding
   * geometry: allocating a new buffer per pointermove is how a smooth
   * drag turns into a stuttering one.
   */
  /* An entry exists for every object with a previous position, but a
     trajectory only MEANS anything once the object has left it. Show
     the whole set or none of it — a handle floating with no curve
     under it is worse than nothing. */
  function setPathVisible(entry, on) {
    entry.visible = on;
    entry.meshes.forEach((m) => { m.visible = on; });
    // The traveller is animated from its own list, so it needs the
    // same treatment or a dot runs along an invisible line.
    if (entry.traveller) entry.traveller.visible = on;
  }

  function updatePath(entry, path) {
    if (!entry) return;
    const {p0, p1} = entry;
    entry.path = path;

    const should = moved(p0, p1);
    if (should !== entry.visible) setPathVisible(entry, should);
    if (!should) { invalidate(); return; }

    const writeCurve = (line, flat) => {
      if (!line) return;
      const attr = line.geometry.attributes.position;
      const n = attr.count;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const v = flat ? groundAt(p0, p1, path, t) : pathWorld(p0, p1, path, t);
        attr.setXYZ(i, v.x, v.y, v.z);
      }
      attr.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    };
    writeCurve(entry.curve, false);
    writeCurve(entry.ground, true);
    writeCurve(entry.pickLine, false);

    const mid = groundAt(p0, p1, path, 0.5);
    if (entry.bendMesh) entry.bendMesh.position.copy(mid);
    if (entry.apexMesh) {
      const y = Math.max(BS.pathHeight(path, 0.5), 1.5);
      entry.apexMesh.position.set(mid.x, y, mid.z);
    }
    if (entry.hairline) {
      const a = entry.hairline.geometry.attributes.position;
      a.setXYZ(0, mid.x, 0.05, mid.z);
      a.setXYZ(1, mid.x, entry.apexMesh ? entry.apexMesh.position.y : 1.5, mid.z);
      a.needsUpdate = true;
    }
    // The traveller shares the path object, so it follows for free.
    const tr = travellers.find((x) => x.mesh === entry.traveller);
    if (tr) tr.path = path;

    if (entry.kind === 'balls') restBallMarker();
    invalidate();
  }

  function pathWorld(p0, p1, path, t) {
    const pitch = getPitch(), bt = getBoardType();
    const pt = BS.pathPoint(p0, p1, path, t);
    const w = BG.toWorld(pt[0], pt[1], pitch, bt);
    return new THREE.Vector3(w.x, BS.pathHeight(path, t) + 0.12, w.z);
  }

  /** A point on the path, projected flat onto the turf. */
  function groundAt(p0, p1, path, t) {
    const pt = BS.pathPoint(p0, p1, path, t);
    const w = BG.toWorld(pt[0], pt[1], getPitch(), getBoardType());
    return new THREE.Vector3(w.x, 0.1, w.z);
  }

  /* A flat disc lying face-up.

     These were spheres, which read as balls half-sunk into the turf —
     confusing next to an actual ball, which is the one round thing on
     the pitch that IS a sphere. Flat and small: the game ball is 0.45 m
     across, so a 0.16 m marker cannot be mistaken for one.

     `depthWrite: false` and a few centimetres of lift keep them off
     the markings texture without z-fighting it. */
  function flatDot(radius, colour, opacity) {
    const m = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 20),
        new THREE.MeshBasicMaterial({
          color: colour,
          transparent: true,
          opacity: opacity === undefined ? 1 : opacity,
          depthWrite: false,
          side: THREE.DoubleSide
        }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  function addPath(kind, index, p0, p1, path, colour) {
    const col = new THREE.Color(colour || 0xffffff);
    const isBall = kind === 'balls';

    /* The curve. Continuous and hairline-thin: WebGL caps line width
       at 1 px almost everywhere, which is exactly the weight wanted. */
    const entry = {kind, index, p0, p1, path, meshes: []};
    pathEntries.push(entry);

    const pts = [];
    for (let i = 0; i <= 48; i++) pts.push(pathWorld(p0, p1, path, i / 48));
    entry.curve = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        // Quiet. A trajectory is a read-only mark; the HANDLES stay
        // bright because they are targets the coach has to hit.
        new THREE.LineBasicMaterial({color: col, transparent: true, opacity: 0.55}));
    objectRoot.add(entry.curve);
    entry.meshes.push(entry.curve);

    /* A lofted ball also gets its GROUND TRACK, so the plan-view path
       is readable when the arc is high — otherwise a chip looks like
       it lands somewhere it does not. */
    if (isBall && BS.pathHeight(path, 0.5) > 0.05) {
      const flat = [];
      for (let i = 0; i <= 48; i++) flat.push(groundAt(p0, p1, path, i / 48));
      entry.ground = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(flat),
          new THREE.LineBasicMaterial({color: col, transparent: true, opacity: 0.18}));
      objectRoot.add(entry.ground);
      entry.meshes.push(entry.ground);
    }

    /* The travelling dot. Registered rather than animated in place so
       one clock drives every dot on the board — separate phases would
       look like noise instead of like direction. */
    const dot = flatDot(0.12, col, 0.8);
    entry.traveller = dot;
    objectRoot.add(dot);
    entry.meshes.push(dot);
    travellers.push({mesh: dot, p0, p1, path});

    const mid = groundAt(p0, p1, path, 0.5);

    if (isBall) {
      /* THE BALL: one dot on the GROUND and one diamond above it.
         The dot is the curve's projection — where the ball passes
         OVER — so it stays on the grass however high the arc goes;
         the diamond owns the height. Two handles, two questions. */
      const active = handleMode(kind, index);   // 'bend' | 'apex'

      const bend = flatDot(0.5, col, active === 'bend' ? 1 : 0.25);
      entry.bendMesh = bend;
      entry.meshes.push(bend);
      bend.position.copy(mid);
      objectRoot.add(bend);
      // Only the ACTIVE handle is pickable, so a click from directly
      // overhead cannot land on the one underneath.
      if (active === 'bend') objects.push({mesh: bend, kind: 'pathBend', index, owner: kind});

      const apexY = Math.max(BS.pathHeight(path, 0.5), 1.5);
      /* Same size as a bend dot, so the two handles read as a pair.
         Flat shading plus dark EDGES: a single-colour octahedron in
         perspective is just a hexagon, and its faces are impossible
         to separate — the outline is what makes it read as a solid
         sitting above the turf rather than another mark on it. */
      const diaGeo = new THREE.OctahedronGeometry(0.5);
      const dia = new THREE.Mesh(
          diaGeo,
          new THREE.MeshLambertMaterial({
            color: 0x66d9ff, flatShading: true,
            transparent: true, opacity: active === 'apex' ? 1 : 0.25}));
      dia.add(new THREE.LineSegments(
          new THREE.EdgesGeometry(diaGeo),
          new THREE.LineBasicMaterial({
            color: 0x0b3d4d, transparent: true,
            opacity: active === 'apex' ? 0.9 : 0.25})));
      entry.apexMesh = dia;
      entry.meshes.push(dia);
      dia.position.set(mid.x, apexY, mid.z);
      objectRoot.add(dia);
      if (active === 'apex') objects.push({mesh: dia, kind: 'pathApex', index, owner: kind});

      // A hairline from the turf to the diamond, so the height reads.
      entry.hairline = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(mid.x, 0.05, mid.z), dia.position.clone()]),
          new THREE.LineBasicMaterial({color: 0x66d9ff, transparent: true, opacity: 0.5}));
      objectRoot.add(entry.hairline);
      entry.meshes.push(entry.hairline);
      return;
    }

    /* A PLAYER: no diamond — a run has no height — and as many bend
       dots as the coach has dropped. Right-clicking the line adds one,
       right-clicking a dot removes it. */
    BS.pointsOf(path).forEach((pt, di) => {
      const w = BG.toWorld(pt[0], pt[1], getPitch(), getBoardType());
      const h = flatDot(0.45, col);
      h.position.set(w.x, 0.12, w.z);
      objectRoot.add(h);
      entry.meshes.push(h);
      objects.push({mesh: h, kind: 'pathDot', index, owner: kind, dot: di});
    });

    /* The line itself is pickable, so a right-click on it can add a
       dot. Registered last so a dot already on the line wins the
       raycast when they overlap. */
    const pickLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({visible: false}));
    entry.pickLine = pickLine;
    objectRoot.add(pickLine);
    entry.meshes.push(pickLine);
    objects.push({mesh: pickLine, kind: 'pathLine', index, owner: kind, p0, p1});
  }

  /** Did this thing move between the two frames? */
  function moved(a, b) {
    return a && b && (Math.abs(a[0] - b[0]) > 0.5 || Math.abs(a[1] - b[1]) > 0.5);
  }

  /* The line takes the OBJECT's colour, so a run belongs visibly to
     the player who makes it. A striped kit cannot be one line colour,
     so the base colour is used — parseFill puts it in c1 either way. */
  function pathColour(fill) {
    const f = parseFill(fill);
    return new THREE.Color((f && f.c1) || '#ffffff');
  }

  function addPathsFor(s, kind) {
    const prev = (s.prev && s.prev[kind]) || null;
    const cur = s[kind] || [];
    if (!prev) return;
    const paths = (s.paths && s.paths[kind]) || {};
    const base = kind === 'oppPositions' ? (s.oppColor || '#e53935')
      : kind === 'balls' ? '#ffffff' : (s.teamColor || '#ffffff');
    const own = kind === 'oppPositions' ? s.oppColors : s.colors;
    const nums = kind === 'oppPositions' ? s.oppNumbers : s.numbers;
    cur.forEach((p, i) => {
      /* Built for everything that HAS a previous position, whether or
         not it has moved yet — and hidden until it has.

         It used to skip unmoved objects entirely, so at the moment a
         drag began there was no entry at all and movePathEnd() bailed.
         The curve only appeared after the release rebuild, which is
         the "works, but not on the first movement" report. A
         visibility toggle costs nothing; building meshes mid-gesture
         is what makes a drag stutter. */
      if (!prev[i] || !p) return;
      let fill = base;
      if (kind !== 'balls') {
        const isGk = String((nums && nums[i]) || '') === '1';
        fill = isGk ? GK_COLOR : ((own && own[i]) || base);
      }
      addPath(kind, i, prev[i], p, paths[i] || null, pathColour(fill));
      /* Set AFTER addPath, which registers meshes in two branches and
         returns early for the ball — doing it inside would miss some. */
      const e = pathEntries[pathEntries.length - 1];
      if (e) setPathVisible(e, moved(prev[i], p));
    });
  }

  /* ── Rebuilding ──────────────────────────────────────────────
     Whole-scene rebuild rather than diffing. A board holds a few dozen
     objects; diffing them would be more code than it saves and is
     where a stale-object bug would live. */
  function rebuild() {
    objects.length = 0;
    travellers.length = 0;
    pathEntries.length = 0;
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
    /* After the objects, so a handle sits on top of whatever it
       belongs to when the two overlap. */
    addPathsFor(s, 'positions');
    addPathsFor(s, 'oppPositions');
    addPathsFor(s, 'balls');
    /* A chip should read while it is being set up, not only on play. */
    restBallMarker();
  }

  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }

  /* ── Playback dressing ───────────────────────────────────────
     A ball shadow and player trails. Both exist only while the
     animation runs, and both are built once and hidden rather than
     created and destroyed per frame — allocating meshes at 60 fps is
     how a smooth board becomes a stuttering one. */

  /* The ball's ground marker: where the ball is OVER the pitch.

     Not the same thing as its shadow. The light is angled, so the
     real shadow lands off to one side — that answers "where is the
     sun". This answers "where is the ball", which is the tactical
     question, and so it is always straight down.

     A RING, not a filled disc: from overhead a filled dark circle is
     indistinguishable from the ball itself. The previous version was
     a 0.45-2 m disc at 6-30% opacity on a 105 m pitch — about 2% of
     the board's width in dark grey on mid-green, which is why it was
     invisible in practice. This one is white, holds its opacity, and
     grows enough to be found. */
  const ballShadow = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.28,
        depthWrite: false, side: THREE.DoubleSide}));
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.05;
  ballShadow.visible = false;
  scene.add(ballShadow);

  function setBallShadow(x, z, height) {
    if (!(height > 0.05)) { ballShadow.visible = false; invalidate(); return; }
    /* Grows with height — the cue that reads from directly overhead,
       the one angle where the arc itself is edge-on and invisible. */
    /* A hairline ring, not a target. It only has to say where the
       ball is over the pitch, not compete with the ball itself. */
    const r = BALL_R * 1.8 + height * 0.12;
    ballShadow.scale.set(r, r, 1);
    ballShadow.material.opacity = Math.max(0.12, 0.28 - height * 0.006);
    ballShadow.position.set(x, 0.05, z);
    ballShadow.visible = true;
    invalidate();
  }

  /* Show it for a ball sitting lofted in the CURRENT frame too, not
     only during playback — a chip should read while it is being set
     up, which is when the coach is looking hardest at it. */
  function restBallMarker() {
    if (playing) return;
    const s = getState();
    const prev = s.prev && s.prev.balls;
    const paths = (s.paths && s.paths.balls) || {};
    let best = null;
    (s.balls || []).forEach((b, i) => {
      if (!b || !prev || !prev[i]) return;
      const h = BS.pathHeight(paths[i] || null, 0.5);
      if (h > 0.05 && (!best || h > best.h)) {
        const mid = BS.pathPoint(prev[i], b, paths[i] || null, 0.5);
        const w = BG.toWorld(mid[0], mid[1], getPitch(), getBoardType());
        best = {h, x: w.x, z: w.z};
      }
    });
    if (best) setBallShadow(best.x, best.z, best.h);
    else { ballShadow.visible = false; }
  }

  /* Player trails. A short ribbon of recent positions, fading out
     behind each player.

     The fade is done with VERTEX COLOURS lerped toward the turf, not
     per-vertex alpha: LineBasicMaterial has only a uniform opacity,
     and a custom shader is a lot of machinery for an effect that is
     meant to be barely noticeable. */
  const TRAIL_LEN = 18;                 // ~0.3 s at 60 fps
  const trails = new Map();             // key -> {mesh, pts: []}
  const trailRoot = new THREE.Group();
  scene.add(trailRoot);

  /* Per-vertex ALPHA, which LineBasicMaterial cannot do — it has only
     a uniform opacity, so the first version faked the fade by lerping
     the colour toward a flat `TURF` green.

     That fake is visible. The turf as rendered is lit, mown-striped
     and shadowed, so a flat green line does not match it: over a dark
     stripe or inside a shadow it reads as a pale streak rather than
     disappearing. Hence "the trails fade to white".

     I called a custom shader "a lot of machinery for something barely
     noticeable" when I wrote the fake. That was wrong twice over — it
     IS noticeable, and the real thing is fifteen lines. */
  const TRAIL_MAT = () => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: [
      'attribute float alpha;',
      'attribute vec3 color;',
      'varying float vAlpha;',
      'varying vec3 vCol;',
      'void main() {',
      '  vAlpha = alpha;',
      '  vCol = color;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying float vAlpha;',
      'varying vec3 vCol;',
      'void main() {',
      '  gl_FragColor = vec4(vCol, vAlpha);',
      '}'
    ].join('\n')
  });

  function trailPush(key, colour, x, z) {
    let tr = trails.get(key);
    if (!tr) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
      geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN), 1));
      const mesh = new THREE.Line(geo, TRAIL_MAT());
      mesh.frustumCulled = false;
      trailRoot.add(mesh);
      tr = {mesh, pts: [], colour};
      trails.set(key, tr);
    }
    tr.pts.push([x, z]);
    if (tr.pts.length > TRAIL_LEN) tr.pts.shift();

    const pos = tr.mesh.geometry.attributes.position.array;
    const col = tr.mesh.geometry.attributes.color.array;
    const alpha = tr.mesh.geometry.attributes.alpha.array;
    const c = new THREE.Color(colour);
    for (let i = 0; i < TRAIL_LEN; i++) {
      // Short trails repeat their oldest point rather than collapsing
      // to the origin, which would draw a line to the centre spot.
      const src = tr.pts[Math.max(0, i - (TRAIL_LEN - tr.pts.length))] || tr.pts[0];
      pos[i * 3] = src[0];
      pos[i * 3 + 1] = 0.06;
      pos[i * 3 + 2] = src[1];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      /* 0 = oldest, 1 = newest. Squared so the tail thins out quickly
         and the trail stays subtle rather than becoming a streak. */
      const f = i / (TRAIL_LEN - 1);
      alpha[i] = f * f * 0.6;
    }
    tr.mesh.geometry.attributes.position.needsUpdate = true;
    tr.mesh.geometry.attributes.color.needsUpdate = true;
    tr.mesh.geometry.attributes.alpha.needsUpdate = true;
  }

  function clearTrails() {
    trails.forEach((tr) => {
      trailRoot.remove(tr.mesh);
      tr.mesh.geometry.dispose();
      tr.mesh.material.dispose();
    });
    trails.clear();
    ballShadow.visible = false;
    invalidate();
  }

  /* ── Camera ──────────────────────────────────────────────────
     A small orbit controller rather than the OrbitControls addon: the
     addon is a large file of features this does not use, and the polar
     clamp — never let the camera go under the turf — is the only part
     that actually matters here. */
  /* The STARTING view, and it has to obey the same rule the presets
     do: +PI/2 puts the camera on the touchline nearest the top of the
     2D board, so the pitch reads the same way round in both views.
     At -PI/2 it is mirrored — which is what the board loaded with
     after the presets were fixed and this was not. */
  const cam = {theta: Math.PI / 2, phi: 1.02, dist: 100, target: new THREE.Vector3()};
  /* Set once the coach orbits or zooms; see resize(). */
  let camTouched = false;

  function applyCamera() {
    const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
    camera.position.set(
        cam.target.x + cam.dist * sp * Math.cos(cam.theta),
        cam.target.y + cam.dist * cp,
        cam.target.z + cam.dist * sp * Math.sin(cam.theta));

    camera.up.copy(upFor(cam.phi, cam.theta));
    camera.lookAt(cam.target);
  }

  /**
   * The up vector for a given camera angle.
   *
   * A HARD SWITCH, back from the blend that replaced it. Straight
   * overhead, world-up is parallel to the view direction and lookAt
   * has no plane to build a basis in — so within a hair of vertical
   * the up vector goes horizontal instead.
   *
   * The blend was worse, and measurably so. Widening a band around
   * the singularity drags `up` TOWARD the view axis across the whole
   * band rather than only at the pole: through a Side→Top move,
   * `up · view` reached -1.00 at phi 0.139 and the frame whipped 172
   * degrees in one step. The hard switch is stable precisely because
   * nothing ever interpolates through that region — and now nothing
   * does, because transitions slerp the orientation instead of
   * rebuilding it from angles.
   */
  function upFor(phi, theta) {
    return phi < 0.02
      ? new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta))
      : new THREE.Vector3(0, 1, 0);
  }

  /** Where the camera sits for a given orbit angle. */
  function positionFor(theta, phi, dist, target) {
    const sp = Math.sin(phi), cp = Math.cos(phi);
    return new THREE.Vector3(
        target.x + dist * sp * Math.cos(theta),
        target.y + dist * cp,
        target.z + dist * sp * Math.sin(theta));
  }

  /* ── Easing between camera positions ─────────────────────────
     A preset used to assign the angles and apply them, which snaps.
     This interpolates from wherever the camera actually is. */
  let camTween = null;

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /* Scratch, reused rather than allocated per transition. */
  const orientMatrix = new THREE.Matrix4();

  /**
   * The quaternion the camera would have at a given orbit angle.
   *
   * Built from `Matrix4.lookAt`, NOT from a probe object's `lookAt`.
   *
   * Object3D.lookAt and Camera.lookAt are not the same operation:
   * three.js branches on `isCamera`, pointing +Z at the target for an
   * ordinary object and -Z for a camera. A plain Object3D probe
   * therefore yields an orientation rotated by exactly 180 degrees —
   * measured, not guessed — and slerping the camera into it turned a
   * flip on some transitions into a flip on every one.
   *
   * Matrix4.lookAt(eye, target, up) builds the camera basis with no
   * dependence on any object-type flag. Verified identical to a real
   * PerspectiveCamera across the full range of angles, including
   * overhead.
   */
  function quaternionFor(theta, phi, dist, target) {
    orientMatrix.lookAt(
        positionFor(theta, phi, dist, target), target, upFor(phi, theta));
    return new THREE.Quaternion().setFromRotationMatrix(orientMatrix);
  }

  function tweenCameraTo(to, ms) {
    /* Shortest way round, for the STORED angle. theta is an angle, so
       a preset on the far side of the pitch is reachable in two
       directions and the raw difference picks the long one about half
       the time. The camera itself no longer travels by angle, but
       cam.theta has to land somewhere sane for the orbit control to
       continue from. */
    let dTheta = to.theta - cam.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;

    camTween = {
      from: {
        theta: cam.theta, phi: cam.phi, dist: cam.dist, target: cam.target.clone(),
        pos: camera.position.clone(),
        quat: camera.quaternion.clone()
      },
      to: to,
      /* The DESTINATION orientation, computed with the same up rule
         applyCamera uses. If these disagreed, the camera would snap
         once as control handed back — the same bug in a different
         costume. */
      toPos: positionFor(to.theta, to.phi, to.dist, to.target),
      toQuat: quaternionFor(to.theta, to.phi, to.dist, to.target),
      dTheta: dTheta,
      start: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      ms: ms || 550
    };
    invalidate();
  }

  /**
   * Advance an in-flight camera move. Returns true while running.
   *
   * Interpolates POSITION and ORIENTATION, not the orbit angles.
   * Rebuilding the frame from angles each step meant passing through
   * the overhead singularity, where up and view go parallel and the
   * view flips. A quaternion slerp takes the shortest rotation
   * between two well-defined frames and cannot pass through a
   * degenerate basis, so a move to Top rolls into place.
   */
  function stepCameraTween(now) {
    if (!camTween) return false;
    const t = Math.min(1, (now - camTween.start) / camTween.ms);
    const e = easeInOut(t);
    const f = camTween.from, to = camTween.to;

    camera.position.lerpVectors(f.pos, camTween.toPos, e);
    camera.quaternion.slerpQuaternions(f.quat, camTween.toQuat, e);

    /* The orbit state is carried along so the controls resume from
       the right place, but it does NOT drive the camera here —
       applyCamera() must not run mid-flight or it would rebuild the
       frame from angles and reintroduce the flip. */
    cam.theta = f.theta + camTween.dTheta * e;
    cam.phi = f.phi + (to.phi - f.phi) * e;
    cam.dist = f.dist + (to.dist - f.dist) * e;
    cam.target.lerpVectors(f.target, to.target, e);

    if (t >= 1) {
      // Land exactly on the destination and hand control back.
      cam.theta = to.theta;
      cam.phi = to.phi;
      cam.dist = to.dist;
      cam.target.copy(to.target);
      applyCamera();
      camTween = null;
    }
    return true;
  }

  /** Any manual input takes the camera back, mid-move or not. */
  function cancelCameraTween() { camTween = null; }

  /* The presets. Angles are in the same spherical terms the orbit
     control uses, so a preset is a starting point the coach can then
     drag away from rather than a mode they have to leave.

     `dist` is left to frameBoard(), which already knows how to fit the
     pitch to the current viewport — a hardcoded distance would crop
     the pitch on a narrow window. */
  const PRESETS = {
    /* THE SIDE VIEWS SIT ON +Z, NOT -Z.

       Both were on the far touchline, which mirrors the pitch
       left-to-right against the 2D board: a player the coach sees on
       the left in 2D appeared on the right in 3D. Measured by
       projecting a known point — at theta -PI/2 the x=10% player
       lands at NDC x +0.45, at +PI/2 it lands at -0.45, and 2D puts
       it on the left.

       Dead on the touchline, too: broadcast used to carry a -0.35
       offset meant as "slightly off the halfway line", which only
       pushed the camera 34% off-axis and left the pitch off-centre.

       Top is already correct and stays where it is — its up vector is
       derived from its own theta, and -PI/2 happens to put screen-up
       along -Z, which is the top of the 2D board. Goal looks along the
       X axis, so left-right does not arise. */
    broadcast: {theta: Math.PI / 2, phi: 1.0},
    top:       {theta: -Math.PI / 2, phi: 0.001},
    goal:      {theta: Math.PI, phi: 1.32},
    side:      {theta: Math.PI / 2, phi: 1.38}
  };

  function setPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    followBall = false;
    camTouched = true;

    /* Work out the destination WITHOUT moving the camera, so the
       tween has somewhere to go. frameBoard() fits the distance to
       the viewport, and that fit depends on the angle — so compute it
       against the preset's phi rather than the current one. */
    const held = {theta: cam.theta, phi: cam.phi, dist: cam.dist, target: cam.target.clone()};
    cam.theta = p.theta;
    cam.phi = p.phi;
    cam.target.set(0, 0, 0);
    frameBoard();
    const to = {theta: p.theta, phi: p.phi, dist: cam.dist, target: cam.target.clone()};

    // Put it back, then glide there.
    cam.theta = held.theta;
    cam.phi = held.phi;
    cam.dist = held.dist;
    cam.target.copy(held.target);
    applyCamera();
    tweenCameraTo(to, 550);
  }

  /**
   * Pull back far enough that the whole pitch fits, in BOTH axes.
   *
   * The vertical field of view is fixed, so the horizontal one depends
   * on the aspect ratio: a wide short viewport runs out of height
   * first, a tall narrow one runs out of width. Taking the max of the
   * two required distances is what stops the pitch overflowing the
   * canvas on one axis while leaving a band of empty sky on the other.
   */
  function frameBoard() {
    const e = BG.extent(getPitch(), getBoardType(), false);
    const halfFov = (camera.fov * Math.PI / 180) / 2;
    const distV = (e.ay / 2) / Math.tan(halfFov);
    const distH = (e.ax / 2) / (Math.tan(halfFov) * Math.max(0.2, camera.aspect));
    cam.dist = Math.max(distV, distH) * 1.25;   // a little air around it
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
  let mode = null;            // 'orbit' | 'drag' | 'pan' | 'context'
  let pending = null;         // an armed right-click, awaiting release
  let followBall = false;     // camera target tracks the ball
  let playing = false;        // playback is running (trails + shadow)
  let dragging = null;        // the picked {mesh, kind, index}
  let last = {x: 0, y: 0};

  function toNdc(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  function pick(ev, includeLines) {
    toNdc(ev);
    ray.setFromCamera(ndc, camera);
    /* A hairline is essentially zero-width, so the default line
       threshold never hits one. In world units — the scene is in
       metres — under a metre is a forgiving but not sloppy target. */
    ray.params.Line.threshold = includeLines ? 0.8 : 0;
    const hits = ray.intersectObjects(
        objects.filter((o) => o.mesh.visible).map((o) => o.mesh), false);
    if (!hits.length) return null;
    return objects.find((o) => o.mesh === hits[0].object) || null;
  }

  /* Which of the ball's two handles is currently grabbable.

     They occupy the same spot on screen when the arc is flat or the
     camera is overhead, and no amount of offsetting fixes the
     top-down case — so rather than guess, one is active at a time and
     a right-click swaps them. The inactive one still renders, dimmed,
     so it is obvious the other exists. Per path, and per session:
     which handle you were last using is not something a board should
     remember. */
  const handleModes = new Map();
  const modeKey = (kind, index) => kind + ':' + index;
  function handleMode(kind, index) {
    return handleModes.get(modeKey(kind, index)) || 'bend';
  }

  /** Act on a right-click that stayed put. */
  function runContext(p) {
    const h = p.hit;
    if (h.kind === 'pathBend' || h.kind === 'pathApex') {
      const k = modeKey(h.owner, h.index);
      handleModes.set(k, handleModes.get(k) === 'apex' ? 'bend' : 'apex');
      rebuild();
      invalidate();
      return;
    }
    if (h.kind === 'pathDot') {
      // The inverse of adding one. Without it a misplaced dot is
      // permanent, which is worse than not being able to add one.
      if (onPath) onPath(h.owner, h.index, {removeDot: h.dot});
      return;
    }
    if (h.kind === 'pathLine' && p.at) {
      const pct = BG.toPercent(p.at.x, p.at.z, getPitch(), getBoardType());
      if (onPath) onPath(h.owner, h.index, {addDot: [pct[0], pct[1]]});
    }
  }

  /** Where the pointer meets the turf, in world metres. */
  function groundPoint(ev) {
    toNdc(ev);
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(ground, hit) ? hit : null;
  }

  function onPointerDown(ev) {
    /* Stop the browser starting its own gesture — text selection on
       desktop, pan/scroll on touch. touch-action:none covers the
       touch case, but a mouse drag that begins on a canvas can still
       turn into a selection drag that scrolls the page once it leaves
       the element. */
    ev.preventDefault();
    renderer.domElement.setPointerCapture(ev.pointerId);
    last = {x: ev.clientX, y: ev.clientY};
    /* RIGHT BUTTON means two things, and which one depends on what is
       under it. It used to mean only "pan", and returned before
       picking — so a right-click on a handle panned the camera.

       Order matters: pick first, and fall through to pan only when
       the ray hits nothing interesting. The action itself waits for
       the release and for the pointer to have barely moved, so a pan
       that happens to START on a handle is still a pan. */
    if (ev.button === 2 && !readOnly) {
      const hit = pick(ev, true);
      if (hit && (hit.kind === 'pathDot' || hit.kind === 'pathLine' ||
                  hit.kind === 'pathBend' || hit.kind === 'pathApex')) {
        mode = 'context';
        pending = {hit, at: groundPoint(ev), x: ev.clientX, y: ev.clientY};
        return;
      }
    }
    /* Right — or middle, or shift-drag — pans the camera TARGET
       across the turf. Without it the target is pinned to the centre
       spot, so zooming always converges there and a coach who wants a
       close look at a corner cannot get one. */
    if (ev.button === 2 || ev.button === 1 || ev.shiftKey) {
      mode = 'pan';
      camTouched = true;
      followBall = false;   // the coach is steering now
      cancelCameraTween();
      return;
    }
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

  /**
   * Move the look-at point across the ground plane.
   *
   * Scaled so the turf tracks the cursor roughly one-to-one: at
   * distance `d` a vertical FOV of `fov` covers `2 d tan(fov/2)` world
   * units over the canvas height, so that over the pixel height is the
   * world-units-per-pixel. Panning at a fixed rate instead feels
   * glued when zoomed out and frantic when zoomed in.
   */
  function panBy(dxPx, dyPx) {
    const h = renderer.domElement.clientHeight || 1;
    const perPx = (2 * cam.dist * Math.tan((camera.fov * Math.PI / 180) / 2)) / h;

    // Screen right and screen "forward", both flattened onto the turf.
    const right = new THREE.Vector3(-Math.sin(cam.theta), 0, Math.cos(cam.theta));
    const fwd = new THREE.Vector3(-Math.cos(cam.theta), 0, -Math.sin(cam.theta));

    cam.target.addScaledVector(right, -dxPx * perPx);
    cam.target.addScaledVector(fwd, -dyPx * perPx);

    /* Bounded to a pitch-and-a-half either way. Unbounded panning
       loses the board entirely, and "where did my pitch go" has no
       affordance to undo it short of the reset. */
    const e = BG.extent(getPitch(), getBoardType(), false);
    const lim = Math.max(e.ax, e.ay) * 0.75;
    cam.target.x = Math.max(-lim, Math.min(lim, cam.target.x));
    cam.target.z = Math.max(-lim, Math.min(lim, cam.target.z));
    applyCamera();
  }

  function onPointerMove(ev) {
    if (!mode) return;
    if (mode === 'pan') {
      panBy(ev.clientX - last.x, ev.clientY - last.y);
      last = {x: ev.clientX, y: ev.clientY};
      return;
    }
    if (mode === 'orbit') {
      cam.theta -= (ev.clientX - last.x) * 0.006;
      cam.phi -= (ev.clientY - last.y) * 0.006;
      /* Never under the turf, never exactly overhead: at phi = 0 the
         look-at basis degenerates and the view snaps through a right
         angle. */
      cam.phi = Math.max(0.12, Math.min(Math.PI / 2 - 0.02, cam.phi));
      camTouched = true;
      followBall = false;   // the coach is steering now
      cancelCameraTween();
      /* No up reset here — applyCamera() below derives it from the
         angle through upFor(), and the orbit clamp keeps phi out of
         the degenerate region anyway. Setting it by hand was a
         leftover from when the blend could leave it somewhere odd. */
      last = {x: ev.clientX, y: ev.clientY};
      applyCamera();
      return;
    }
    if (!dragging) return;
    /* The apex handle moves in HEIGHT, not across the turf — a
       diamond dragged sideways would mean nothing, and raycasting it
       onto the ground plane would send it to the horizon as the
       pointer approached eye level. Vertical pointer travel maps to
       metres through the same per-pixel scale the pan uses. */
    if (dragging.kind === 'pathApex') {
      const h = renderer.domElement.clientHeight || 1;
      const perPx = (2 * cam.dist * Math.tan((camera.fov * Math.PI / 180) / 2)) / h;
      const next = dragging.mesh.position.y - (ev.clientY - last.y) * perPx;
      const y = Math.max(0, Math.min(40, next));
      dragging.mesh.position.y = y;
      last = {x: ev.clientX, y: ev.clientY};
      // Redraw the arc as it is lifted, not on release.
      const e = findPath(dragging.owner, dragging.index);
      if (e) updatePath(e, Object.assign({}, e.path, {apex: BS.round2(y)}));
      return;
    }
    const g = groundPoint(ev);
    if (!g) return;

    /* Path handles redraw their curve every move. Without this the
       handle moved on its own and the line only caught up on release,
       which reads as the curve snapping into place. */
    if (dragging.kind === 'pathBend' || dragging.kind === 'pathDot') {
      const e = findPath(dragging.owner, dragging.index);
      if (!e) return;
      let pct = BG.toPercent(g.x, g.z, getPitch(), getBoardType());
      let next;
      if (dragging.kind === 'pathBend') {
        /* THE BALL'S HANDLE STAYS AT THE MIDDLE. Constrained here,
           during the drag, rather than on release — so the dot slides
           along the bisector under the cursor instead of jumping
           somewhere else when the button comes up. */
        pct = BS.constrainBend(e.p0, e.p1, pct);
        next = Object.assign({}, e.path, {bend: pct});
      } else {
        const pts = BS.pointsOf(e.path).slice();
        pts[dragging.dot] = [BS.round2(pct[0]), BS.round2(pct[1])];
        next = Object.assign({}, e.path, {pts});
        delete next.bend;
      }
      // Snap the handle to where the constraint actually put it.
      const w = BG.toWorld(pct[0], pct[1], getPitch(), getBoardType());
      dragging.mesh.position.set(w.x, dragging.mesh.position.y, w.z);
      updatePath(e, next);
      return;
    }

    const y = dragging.mesh.position.y;
    dragging.mesh.position.set(g.x, y, g.z);

    /* Dragging the OBJECT drags the end of its trajectory with it.
       The curve ends where the object is, so leaving it behind until
       the release rebuild is the same complaint as the handles: the
       line snaps into place instead of following. */
    movePathEnd(dragging.kind, dragging.index, g);
  }

  /** Re-point a trajectory's end at a dragged object, and redraw it. */
  function movePathEnd(kind, index, world) {
    const e = findPath(kind, index);
    if (!e) return;
    const pct = BG.toPercent(world.x, world.z, getPitch(), getBoardType());
    e.p1 = [BS.round2(pct[0]), BS.round2(pct[1])];
    /* The traveller holds its own copy of the endpoints, so it has to
       be re-pointed too or the dot keeps running to where the object
       used to be. */
    const tr = travellers.find((x) => x.mesh === e.traveller);
    if (tr) tr.p1 = e.p1;
    updatePath(e, e.path);
  }

  function onPointerUp(ev) {
    /* A right-press that stayed put is a click; one that travelled is
       a pan the coach happened to start on a handle. Four pixels is
       the usual slop for "did not mean to drag". */
    if (mode === 'context' && pending) {
      const moved = Math.hypot((ev ? ev.clientX : pending.x) - pending.x,
          (ev ? ev.clientY : pending.y) - pending.y);
      if (moved < 4) runContext(pending);
      mode = null;
      pending = null;
      return;
    }
    if (mode === 'drag' && dragging) {
      const p = dragging.mesh.position;
      if (dragging.kind === 'pathApex') {
        // Height in metres, straight off the handle.
        if (onPath) onPath(dragging.owner, dragging.index, {apex: Math.round(p.y * 100) / 100});
      } else if (dragging.kind === 'pathBend') {
        /* Constrained again on commit. The move handler already put
           the handle on the bisector, so this is the same number —
           but the stored value must not depend on the drag path
           having gone through that branch. */
        const e = findPath(dragging.owner, dragging.index);
        const raw = BG.toPercent(p.x, p.z, getPitch(), getBoardType());
        const pct = e ? BS.constrainBend(e.p0, e.p1, raw) : raw;
        if (onPath) onPath(dragging.owner, dragging.index, {bend: [pct[0], pct[1]]});
      } else if (dragging.kind === 'pathDot') {
        const pct = BG.toPercent(p.x, p.z, getPitch(), getBoardType());
        if (onPath) onPath(dragging.owner, dragging.index,
            {moveDot: dragging.dot, to: [pct[0], pct[1]]});
      } else if (dragging.kind === 'pathLine') {
        // The invisible pick line is not draggable; it only takes
        // right-clicks. Ignore a left drag that started on it.
      } else if (onMove) {
        const pct = BG.toPercent(p.x, p.z, getPitch(), getBoardType());
        /* Clamped to the board: a drag that leaves the pitch would
           otherwise store a percentage outside 0-100, which the 2D
           view renders off the edge of its box with no way to grab it
           back. The bend handle is NOT clamped — a curve may bulge
           past the touchline, which is what an outswinging cross
           does. */
        onMove(dragging.kind, dragging.index, [
          Math.max(0, Math.min(100, pct[0])),
          Math.max(0, Math.min(100, pct[1]))
        ]);
      }
    }
    mode = null;
    dragging = null;
  }

  function onWheel(ev) {
    ev.preventDefault();
    cam.dist = Math.max(15, Math.min(400, cam.dist * (1 + Math.sign(ev.deltaY) * 0.1)));
    camTouched = true;
    cancelCameraTween();
    applyCamera();
  }

  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.style.display = 'block';
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  /* Wheel on BOTH the canvas and its container, non-passive.
     `passive:false` is what makes preventDefault work at all — without
     it the browser scrolls the page as well as zooming the camera,
     which is the "the whole page moves while I orbit" symptom. The
     container copy catches the few pixels of border and any gap the
     canvas does not cover. */
  el.addEventListener('wheel', onWheel, {passive: false});
  container.addEventListener('wheel', onWheel, {passive: false});
  /* Right-drag pans, so the context menu must not open on top of it. */
  el.addEventListener('contextmenu', (ev) => ev.preventDefault());

  /* ── Render loop ─────────────────────────────────────────────
     Renders on demand, not on a permanent rAF: a static board is the
     usual state and spinning the GPU for it drains a laptop for no
     reason. Anything that changes the scene calls invalidate(). */
  let needsRender = true;
  let alive = true;
  function invalidate() { needsRender = true; }

  /* The container owns the size — CSS gives it a viewport-relative
     height so the 3D board can be much larger than the 2D one without
     hardcoding a number here. Falling back to a 0.6 ratio only for the
     case where the element has not been laid out yet. */
  function resize() {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || Math.round(w * 0.6);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    /* Re-frame only until the coach has touched the camera. After
       that a window resize must not throw away the angle they chose —
       re-framing on every ResizeObserver tick would snap the view back
       mid-session for no reason they asked for. */
    if (!camTouched) frameBoard();
    invalidate();
  }

  /* Render on demand, EXCEPT while a trajectory is on screen: the
     dot running along it is the direction cue, and a static frame
     cannot show direction. One clock drives every dot, so they move
     in step rather than looking like noise. A three-second loop is
     slow enough to read and fast enough not to feel stalled. */
  function tick(now) {
    if (!alive) return;
    // A tween renders every frame for its duration, or the move shows
    // one frame and stops — the loop is on demand by default.
    if (stepCameraTween(now || 0)) needsRender = true;
    if (travellers.length) {
      const t = ((now || 0) % 3000) / 3000;
      travellers.forEach((tr) => tr.mesh.position.copy(
          pathWorld(tr.p0, tr.p1, tr.path, t)));
      needsRender = true;
    }
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
    /**
     * Move one object without a rebuild, for animation frames.
     *
     * `height` is the ball's altitude in metres. It drives the mesh's
     * Y, its ground shadow and, when the camera is following, the
     * look-at point — all from the one call the playback loop already
     * makes, so there is no second place that has to agree about
     * where the ball is.
     */
    setPosition(kind, index, pct, height) {
      const o = objects.find((x) => x.kind === kind && x.index === index);
      if (!o) return;
      const w = BG.toWorld(pct[0], pct[1], getPitch(), getBoardType());
      const isBall = kind === 'balls';
      const y = isBall ? BALL_R + (height || 0) : o.mesh.position.y;
      o.mesh.position.set(w.x, y, w.z);

      if (playing) {
        if (isBall) {
          setBallShadow(w.x, w.z, height || 0);
          if (followBall) { cam.target.set(w.x, 0, w.z); applyCamera(); }
        } else {
          trailPush(kind + ':' + index, o.trailColour || 0xffffff, w.x, w.z);
        }
      }
      invalidate();
    },

    /** Playback started or stopped. */
    setPlaying(on) {
      playing = !!on;
      if (!playing) clearTrails();
      invalidate();
    },

    setPreset,
    /** Follow the ball. Cleared by any manual orbit or pan. */
    setFollowBall(on) {
      followBall = !!on;
      camTouched = true;
      invalidate();
    },
    isFollowingBall() { return followBall; },

    resetCamera() {
      followBall = false;
      const held = {theta: cam.theta, phi: cam.phi, dist: cam.dist, target: cam.target.clone()};
      camTouched = false;
      frameBoard();        // computes the fitted distance and centre
      const to = {theta: cam.theta, phi: cam.phi, dist: cam.dist, target: cam.target.clone()};
      cam.theta = held.theta; cam.phi = held.phi; cam.dist = held.dist;
      cam.target.copy(held.target);
      applyCamera();
      tweenCameraTo(to, 550);
    },
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
