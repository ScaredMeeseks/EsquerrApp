/* Read-only board playback — the loop, and the 3D door out of it.
 *
 * Parking-lot item 16: a board with more than one frame renders a ▶ and
 * "does not play properly". Six defects, and the two that mattered were
 * invisible to every existing suite because playback is timers plus DOM:
 *
 *   - `interpolateRo` re-ran `scaleRoField(innerEl, innerEl.offsetWidth)`
 *     at the tail of EVERY tick — a synchronous layout flush plus twenty
 *     querySelectorAll sweeps rewriting the size of every object on the
 *     board, sixty times a second, to resize things a tween never
 *     resizes;
 *   - the RAF loop resolved `fieldEl` once at click time and guarded
 *     only on `fieldEl._roPlaying`. stdRefreshPlan() replaces
 *     #std-plan-panel with outerHTML on every exercise expand, so the
 *     element went away mid-play — and a detached node keeps its
 *     expando, so the guard never fired and the loop ran for ever
 *     against an orphan.
 *
 * None of that can be executed here: there is no jsdom in this suite and
 * no browser automation. These are SOURCE assertions, which is the same
 * coverage board3d-menu.test.js and board3d-gate.test.js settle for, and
 * they are worth having for exactly one reason — each pins a property
 * whose absence is silent. A leaked RAF throws nothing and logs nothing.
 *
 * Everything is checked against the COMMENT-STRIPPED source. The prose
 * above `bindRoBoardAnimations` names `_roPlaying`, `scaleRoField` and
 * `isConnected` at length; a raw search finds the explanation of the fix
 * and passes whether or not the fix is there. That mistake has been made
 * three times in this repo in one session.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, '');

/* Slice a function body out of the stripped source, bounded by the next
   declaration at the SAME indent. Lifted from board3d-menu.test.js,
   which learned the hard way that a fixed indent swallows half the
   editor when the target is nested inside bindTactics. */
function fn(name) {
  const i = bare.indexOf('function ' + name);
  assert.notStrictEqual(i, -1, name + ' not found in js/app.js');
  const lineStart = bare.lastIndexOf('\n', i) + 1;
  const indent = bare.slice(lineStart, i).match(/^\s*/)[0];
  const j = bare.indexOf('\n' + indent + 'function ', i + 10);
  return bare.slice(i, j === -1 ? bare.length : j);
}

describe('playback does not restyle the board on every tick', () => {
  it('interpolateRo scales only when it created something', () => {
    const body = fn('interpolateRo');
    assert.ok(/if\s*\(roMade\)\s*scaleRoField/.test(body),
        'the restyle must be conditional on something having been created');
  });

  it('every branch that creates a node raises the flag', () => {
    /* COUNTED, not merely present. The first version of this test
       asserted `roMade = true` appeared somewhere in the function and a
       mutation that stripped it from the circle branch survived: eight
       of nine sites is a board whose new players are drawn at the
       editor's 24px against a 300px miniature.

       Nine sites: home circle, opposition circle, ball, the svg itself,
       arrows, rects, a text label, pen lines, cones. Every one of them
       either appends an element or rebuilds a layer wholesale. */
    const body = fn('interpolateRo');
    const n = (body.match(/roMade\s*=\s*true/g) || []).length;
    assert.strictEqual(n, 9,
        'expected nine creation branches to raise roMade, found ' + n);
  });

  it('interpolateRo never measures the board itself', () => {
    const body = fn('interpolateRo');
    /* The measurement is the expensive half: reading offsetWidth right
       after writing styles forces a synchronous reflow. Width is taken
       once per playback and passed in. */
    assert.ok(!/offsetWidth/.test(body),
        'interpolateRo must not read offsetWidth — measure once per playback');
  });

  it('applyRoFrame takes the measured width rather than re-reading it', () => {
    const body = fn('applyRoFrame');
    assert.ok(/scaleRoField\(innerEl,\s*roW\)/.test(body),
        'applyRoFrame should scale against the hoisted roW');
    assert.ok(!/offsetWidth/.test(body),
        'applyRoFrame must not read offsetWidth either');
  });

  it('the width is hoisted into the click handler', () => {
    const body = fn('bindRoBoardAnimations');
    assert.ok(/const\s+roW\s*=\s*innerEl\.offsetWidth/.test(body),
        'roW must be measured once, in the handler');
  });
});

describe('playback stops when its board is replaced', () => {
  const body = fn('bindRoBoardAnimations');

  it('asks whether the field is still in the document', () => {
    assert.ok(/isConnected/.test(body),
        'the loop must check fieldEl.isConnected, not only _roPlaying');
    assert.ok(/function roDead\(\)/.test(body),
        'expected the check behind a named predicate');
  });

  it('both the frame loop and the step scheduler are guarded', () => {
    /* Two entry points, and guarding only one leaves the other running:
       `animate` is the per-tick RAF, `playNext` the per-frame scheduler. */
    const animate = body.slice(body.indexOf('function animate'));
    const playNext = body.slice(body.indexOf('function playNext'),
        body.indexOf('function animate'));
    assert.ok(/roDead\(\)/.test(animate), 'animate is not guarded');
    assert.ok(/roDead\(\)/.test(playNext), 'playNext is not guarded');
  });

  it('the detached path touches neither the board nor the button', () => {
    /* There is nothing to reset and no button left to un-light. Writing
       to them anyway is what kept a dead loop looking alive.

       EVERY branch, not "a branch". The first version of this test used
       one unanchored match, so a mutation that added
       `btn.classList.remove('playing')` to the RAF guard survived on
       the strength of the other two still being clean. */
    const guards = body.match(/if \(roDead\(\)\) \{[^}]*\}/g) || [];
    assert.ok(guards.length >= 3,
        'expected a roDead guard in playNext, animate and the end timer; found ' +
        guards.length);
    guards.forEach((g) => {
      assert.strictEqual(g, 'if (roDead()) { roCancel(); return; }',
          'a detached branch does more than cancel and return: ' + g);
    });
  });

  it('stopping actually cancels the pending frame and timers', () => {
    assert.ok(/cancelAnimationFrame\(roRaf\)/.test(body),
        '_roPlaying is a toggle, not a cancel — the RAF handle must be cleared');
    assert.ok(/clearTimeout\(roTimer\)/.test(body) &&
              /clearTimeout\(roEndTimer\)/.test(body),
        'both scheduled timeouts must be cleared');
    assert.ok(/roRaf\s*=\s*requestAnimationFrame\(animate\)/.test(body),
        'the RAF handle must be captured, or there is nothing to cancel');
  });
});

describe('a board linked to a session gets its animation', () => {
  /* THE ONE THAT MADE PLAYBACK LOOK BROKEN EVERYWHERE.
     tbSessionRef builds the fat inline copy with `delete fat.frames`
     (and `delete fat.penLines`) — sensible, an animation is the biggest
     thing a board carries and every session that links it would
     duplicate it. But tbResolveRef accepted that copy as the finished
     article, so the board drew complete and frameless: no ▶, and no
     placeholder either, so hydration never came back for it. Only a
     board whose payload some other screen had already cached ever
     offered the button at all. */

  it('the fat copy really is missing the frames', () => {
    /* Pinned so the assertion below keeps meaning something. If the
       deletes ever go, the hydration path stops being load-bearing and
       somebody should know that rather than discover it. */
    const body = fn('tbSessionRef');
    assert.ok(/delete fat\.frames;/.test(body),
        'this whole mechanism exists because the session copy drops frames');
  });

  it('a drawing that came from the fat copy is marked as abridged', () => {
    const body = fn('tbRefIsThin');
    assert.ok(/ref\.boardId/.test(body),
        'only worth hydrating when there is an id to hydrate from');
    assert.ok(/board === ref/.test(body),
        'thin means tbResolveRef fell through to the ref itself');
    const html = fn('tbRoBoardHtml');
    assert.ok(/tbRefIsThin\(ref, board\)/.test(html),
        'tbRoBoardHtml must ask, and pass the answer to the renderer');
  });

  it('the marker reaches the DOM', () => {
    const body = fn('renderReadOnlyBoard');
    assert.ok(/data-ro-thin="/.test(body), 'no data-ro-thin attribute emitted');
    /* Prefix and name travel with it, or the replacement loses the
       session's own naming — the payload owns the drawing, the session
       owns the name. */
    assert.ok(/thin\s*\?[\s\S]{0,240}data-ro-prefix/.test(body),
        'the prefix must ride along for the re-render');
  });

  it('hydration collects the abridged boards, not only the placeholders', () => {
    const body = fn('hydrateRoBoards');
    assert.ok(/querySelectorAll\('\[data-ro-thin\]'\)/.test(body),
        'hydrateRoBoards must look for abridged boards too');
    assert.ok(/querySelectorAll\('\.tb-ro-skeleton'\)/.test(body),
        'and still for the placeholders');
    assert.ok(/dataset\.roId \|\| n\.dataset\.roThin/.test(body),
        'both kinds must yield an id to warm');
  });
});

describe('the play button pauses rather than resetting', () => {
  const body = fn('bindRoBoardAnimations');

  it('a second press pauses where it stands', () => {
    assert.ok(/if \(fieldEl\._roPause\) fieldEl\._roPause\(\);/.test(body),
        'the running loop must leave a pause behind for the next click');
    /* The pause CANNOT be a branch in the click handler: fIdx and the
       frame's start time live in the closure of the click that started
       the run, and this is a different call. */
    assert.ok(/fieldEl\._roPause = function/.test(body),
        'the pause must be published by the running loop');
  });

  it('resuming winds the clock back instead of snapping to a frame', () => {
    assert.ok(/performance\.now\(\) - Math\.min\(resumeMs, dur\)/.test(body),
        'the frame start must be offset by however far the pause was in');
    assert.ok(/if \(!fIdx && !resumeMs\) applyRoFrame\(frames\[0\]\)/.test(body),
        'a resume must not re-apply frame 0 — that is the pause undone');
  });

  it('a run that ends clears the resume point', () => {
    /* Otherwise the next press picks up at the last frame of the
       previous run and appears to do nothing. */
    const stop = body.slice(body.indexOf('function roStop'),
        body.indexOf('function roDead'));
    assert.ok(/_roIdx = 0/.test(stop) && /_roElapsed = 0/.test(stop),
        'roStop must clear the paused position');
  });

  it('the editor board pauses too, and refuses to autosave while it does', () => {
    /* The editor's hazard, which the read-only boards do not have: a
       paused board sits PART-WAY THROUGH a tween, so what is on screen
       belongs to no frame. Capturing it would overwrite the frame the
       coach paused on with interpolated positions. */
    const save = fn('autoSaveFrame');
    assert.ok(/!framePlaying && !framePaused/.test(save),
        'autoSaveFrame must refuse while paused, not only while playing');
    assert.ok(/framePauseFn = function/.test(bare),
        'the editor loop must publish a pause');

    /* EACH of the three exits, located, not counted in the whole file.
       Asserting the guard appeared "somewhere in app.js" let a mutation
       that stripped it from playNext survive on the strength of the
       other two — and playNext is the one that matters most, because a
       timeout scheduled before the pause lands after it and runs the
       reset. Same weakness as the roMade and detached-branch tests. */
    /* The DECLARATION, not the first mention. `getElementById(
       'tb-frame-play')` appears earlier, in the hamburger rail — so
       slicing from that landed on the READ-ONLY loop, whose playNext
       has no framePaused guard and never should. The test then failed
       on correct code while every mutation "killed" it for free, which
       is the worst of both. */
    const anchor = "const playBtn = document.getElementById('tb-frame-play');";
    assert.strictEqual(bare.split(anchor).length - 1, 1,
        'the editor play button declaration should be unique');
    const editor = bare.slice(bare.indexOf(anchor));
    const iNext = editor.indexOf('function playNext()');
    const iAnim = editor.indexOf('function animate(now)');
    assert.ok(iNext !== -1 && iAnim !== -1, 'the editor play loop was not found');
    const playNext = editor.slice(iNext, iAnim);
    const animate = editor.slice(iAnim, editor.indexOf('function ', iAnim + 20));
    assert.ok(/if \(framePaused\) return;/.test(playNext),
        'playNext must stand down on a pause BEFORE its reset path');
    assert.ok(playNext.indexOf('if (framePaused) return;') <
              playNext.indexOf('setActiveFrame(0)'),
        'and the guard must come before the reset, not after it');
    assert.ok(/if \(framePaused\) return;/.test(animate),
        'the per-tick loop must stand down on a pause too');
  });

  it('the lit glyph is a pause, and draws BOTH bars', () => {
    /* A square promises a reset to the start; play now carries on from
       where it stopped, and the icon has to say so.

       ⚠ THE FIRST VERSION OF THIS DREW ONE BAR. It used
       `border-left`/`border-right` on a 3px-wide box — and line 2 of
       style.css puts every ::before in border-box, so 3px of borders
       either side left no content between them and the two merged into
       a single blob. Two background stripes are laid out inside the box
       whatever the sizing mode, which is why every one of these rules
       must use them and none may go back to borders. */
    ['.tb-ro-play.playing::before',
     '.tb-field-readonly .tb-ro-play.playing::before',
     '.tb-frame-play.playing::before',
     '.ro3d-play.playing::before'].forEach((sel) => {
      const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          '\\s*\\{([^}]*)\\}');
      const m = re.exec(cssBare);
      assert.ok(m, sel + ' has no rule');
      const body = m[1];
      /* Two stops in the image list, and two sizes — one stripe drawn
         twice is still one bar on screen. */
      assert.strictEqual((body.match(/linear-gradient\(/g) || []).length, 2,
          sel + ' should paint two stripes, found ' +
          (body.match(/linear-gradient\(/g) || []).length);
      assert.ok(/background-position:\s*left center,\s*right center/.test(body),
          sel + ' must place one stripe at each edge');
      assert.ok(!/border-left:\s*\d/.test(body) && !/border-right:\s*\d/.test(body),
          sel + ' must not go back to borders — they collapse in border-box');
    });
  });
});

describe('the stop button is beside the pause, not instead of it', () => {
  it('the read-only board renders one, and only with an animation', () => {
    const body = fn('renderReadOnlyBoard');
    assert.ok(/hasFrames \? '<button class="tb-ro-stop"/.test(body),
        'a stop belongs only to a board that has something to play');
    /* One strip, so the pucks lay out by flex. Per-button `right:`
       offsets cannot survive a button that comes and goes — the 3D puck
       would jump sideways on every play and pause. */
    assert.ok(/<div class="tb-ro-ctl">/.test(body), 'the controls need one strip');
  });

  it('it only shows while something is running or paused', () => {
    const bind = fn('bindRoBoardAnimations');
    assert.ok(/classList\.add\('tb-ro-live'\)/.test(bind),
        'starting playback must reveal the stop');
    /* BOUNDED on roStop. Running to the end of bindRoBoardAnimations
       swept up the stop BUTTON's own handler, which removes the same
       class — so a mutation that dropped it from roStop survived on the
       strength of the other one. */
    const iStop = bind.indexOf('function roStop');
    const stopFn = bind.slice(iStop, bind.indexOf('\n        }', iStop));
    assert.ok(/classList\.remove\('tb-ro-live'\)/.test(stopFn),
        'and finishing must hide it again');
    /* A PAUSED board keeps it: that is the only way back to the start
       without watching the rest of the animation. */
    const pause = bind.slice(bind.indexOf('fieldEl._roPause = function'),
        bind.indexOf('function animate'));
    assert.ok(!/tb-ro-live/.test(pause),
        'a pause must NOT hide the stop — it is most useful then');
    assert.ok(/^\.tb-ro-live \.tb-ro-stop \{/m.test(cssBare) ||
        /\.tb-ro-live \.tb-ro-stop\s*\{/.test(cssBare),
        'the field must be what reveals it; the button cannot see its board');
  });

  it('a paused board is redrawn, a running one resets itself', () => {
    const bind = fn('bindRoBoardAnimations');
    const handler = bind.slice(bind.indexOf(".tb-ro-stop').forEach"));
    assert.ok(/const wasPaused = !fieldEl\._roPlaying;/.test(handler),
        'the two cases differ and the handler must tell them apart');
    assert.ok(/if \(!wasPaused\) return;/.test(handler),
        'a running loop takes its own reset path on the next tick');
    assert.ok(/_roApply\(frames\[0\]\)/.test(handler),
        'a paused board has no tick coming and must be redrawn here');
  });

  it('the editor and the 3D overlay have one too', () => {
    assert.ok(/id="tb-frame-stop"/.test(bare), 'the editor needs a stop');
    assert.ok(/function frameStop\(\)/.test(bare), 'and a handler for it');
    /* WIRED, not merely declared. A handler nothing calls is a button
       that does nothing, and both of these survived a mutation that
       deleted only the listener. */
    assert.ok(/stopBtn\?\.addEventListener\('click', frameStop\)/.test(bare),
        "the editor's stop must actually be wired to it");
    assert.ok(/class="ro3d-stop"/.test(bare), 'the 3D overlay needs a stop');
    assert.ok(/stopBtn\.addEventListener\('click', \(\) => stopPlay\(\)\)/.test(bare),
        "the overlay's stop must be wired too");
    ['.tb-frame-stop', '.ro3d-stop', '.tb-ro-stop'].forEach((sel) => {
      const re = new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          '\\s*\\{([^}]*)\\}', 'm');
      const m = re.exec(cssBare);
      assert.ok(m, sel + ' has no rule');
      assert.ok(/display:none/.test(m[1]),
          sel + ' should start hidden — there is nothing to stop yet');
    });
  });
});

describe('playback survives the panel being rebuilt', () => {
  /* The other half of the detached-loop fix. The loop stands down when
     its field leaves the document — but on the staff training page it
     leaves the document on every exercise expand, every ⤢ open and
     close, and every material or duty edit, because stdRefreshPlan
     rebuilds #std-plan-panel with outerHTML. So an animation was lost
     to an action that had nothing to do with it. */

  it('boards on the plan panel carry a key that survives a re-render', () => {
    /* `_roBoardIdx` mints a fresh ro-board-N every time, so the element
       id cannot answer "is this the same board". The EXERCISE can. */
    const row = fn('_stpExRow');
    assert.ok(/tbRoBoardHtml\(ref, 'ro-stp-', 'stp:' \+ ex\.id\)/.test(row),
        'the inline board must be keyed by its exercise');
    const big = fn('_stpOverlayHtml');
    assert.ok(/tbRoBoardHtml\(ref, 'ro-big-', 'big:' \+ found\.id\)/.test(big),
        'the ⤢ board needs its OWN key — both can be on screen at once');
    const render = fn('renderReadOnlyBoard');
    /* The whole statement. `/data-ro-key="/` matched
       `const keyAttr = false ? ' data-ro-key="' ...` — the string stays
       put while the attribute never renders. Third time this exact
       short-circuit has slipped past a substring check in this file. */
    assert.ok(render.includes(
        "const keyAttr = key ? ' data-ro-key=\"' + sanitize(key) + '\"' : '';"),
        'the key attribute must be built from the key, unguarded');
    assert.ok(/framesAttr \+ keyAttr/.test(render),
        'and must actually be concatenated into the field element');
  });

  it('the key rides through hydration', () => {
    /* Hydration replaces the node first, so a key dropped there is a
       key that never survives anything. */
    const body = fn('hydrateRoBoards');
    assert.ok(/n\.dataset\.roKey/.test(body),
        'the replacement board must keep the key the old one had');
  });

  it('position and play state are saved before the swap', () => {
    const save = fn('_stpSavePlayback');
    assert.ok(/\[data-ro-key\]/.test(save), 'must collect keyed boards');
    assert.ok(/_roPlaying/.test(save) && /_roIdx/.test(save) && /_roElapsed/.test(save),
        'all three are needed to carry on from the same point');
    /* A board that never started, or finished and reset itself, has
       nothing to carry — and saving it would restart it. */
    assert.ok(/if \(!playing && !idx && !ms\) return;/.test(save),
        'an idle board must not be resurrected');
  });

  it('a playing board resumes through its own button', () => {
    const rest = fn('_stpRestorePlayback');
    assert.ok(/btn\.click\(\)/.test(rest),
        'resuming must go through the play button, not a second copy of the loop');
    /* A PAUSED board keeps its position and waits. Restarting it would
       be the opposite of what the coach asked for. */
    assert.ok(/if \(!s\.playing\) return;/.test(rest),
        'a paused board must stay paused');
    assert.ok(/if \(!f\) return;/.test(rest),
        'the exercise may have been collapsed by the very click that refreshed');
  });

  it('the restore happens after binding', () => {
    /* It presses a button, and an unbound button does nothing. */
    const body = fn('stdRefreshPlan');
    assert.ok(body.indexOf('bindRoBoardAnimations()') <
              body.indexOf('_stpRestorePlayback(_play)'),
        'restore must come after bindRoBoardAnimations');
    /* Before the panel is REPLACED, which is the moment the state is
       lost — not merely before the element is looked up. */
    assert.ok(body.indexOf('_stpSavePlayback()') <
              body.indexOf('panel.outerHTML = renderStdPlanPanel'),
        'and the save must come before the panel is replaced');
  });
});

describe('the static render and the animation agree', () => {
  const body = fn('renderReadOnlyBoard');

  it('opposition circles carry tb-circle-opp in the static markup too', () => {
    /* applyRoFrame and interpolateRo both key on
       `.tb-circle:not(.tb-circle-opp)`. The static render stamped a bare
       `tb-circle` on BOTH sides, so that selector matched all
       twenty-two and the two sides shared their data-idx values. */
    assert.ok(/buildCircles\(pos, nums, colors, baseColor, cls\)/.test(body),
        'buildCircles must take the class rather than hardcode it');
    assert.ok(/'tb-circle tb-circle-opp'/.test(body),
        'the opposition call must pass the opp class');
    assert.ok(!/class="tb-circle"/.test(body),
        'no hardcoded tb-circle class should remain in the builder');
  });

  it('cones fall back to the board, like every other layer', () => {
    /* Seven layers fell back to `b.*` and cones fell back to `[]`, so a
       board whose cones were drawn on the base rather than captured
       into each frame lost them the moment you pressed play. */
    assert.ok(/cones:\s*\('cones' in f\)\s*\?\s*f\.cones\s*:\s*\(b\.cones\s*\|\|\s*\[\]\)/
        .test(body), 'the frames merge must fall back to b.cones');
  });
});

describe('the 3D gate is one predicate', () => {
  it('tbCan3D exists and includes the native shell', () => {
    const body = fn('tbCan3D');
    assert.ok(/clubFeature\('board3d'\)/.test(body), 'entitlement not checked');
    assert.ok(/tbWebglOk\(\)/.test(body), 'WebGL not checked');
    assert.ok(/!tbNativeShell\(\)/.test(body),
        'the APK bundles no vendor/three and no board3d.js — it must be excluded');
  });

  it('nothing composes the old two-clause condition any more', () => {
    /* The hole this closes: an Android WebView passes tbWebglOk, so a
       premium club on the phone saw the toggle and got load_3d_failed.
       Every site goes through the one predicate or the fourth copy will
       be the one missing a clause. */
    const hits = bare.match(/clubFeature\('board3d'\)/g) || [];
    assert.strictEqual(hits.length, 1,
        'clubFeature(\'board3d\') should appear once, inside tbCan3D');
  });

  it('the read-only 3D button is gated on it', () => {
    const body = fn('renderReadOnlyBoard');
    assert.ok(/tbCan3D\(\)\s*\?\s*'<button class="tb-ro-3d"/.test(body),
        'the 3D button must render only when tbCan3D()');
  });
});

describe('the read-only 3D overlay', () => {
  const body = fn('tbRo3dOpen');

  it('refuses to open over a live editor instance', () => {
    /* `_tb3d` is module-scoped and there is exactly one. Mounting here
       over an open editor would destroy the editor's scene under it. */
    assert.ok(/if\s*\(_tb3d\s*\|\|\s*tbEditorOpen\(\)\)\s*return;/.test(body),
        'the overlay must refuse when a 3D instance already exists');
  });

  it('mounts under its own wrapper id', () => {
    /* tbEditorOpen() is literally "does #tb-3d-wrap exist". Borrowing
       that id would tell the training page it has a board editor on it,
       and tbFit2DBoard / tbSize3DWindow / tbBindViewGestures believe it. */
    assert.ok(/wrapId:\s*'tb-ro3d-wrap'/.test(body),
        'the overlay must not reuse #tb-3d-wrap');
    const mount = fn('tbMount3D');
    assert.ok(/P\.wrapId\s*\|\|\s*'tb-3d-wrap'/.test(mount),
        'tbMount3D must accept a wrapper id, defaulting to the editor\'s');
  });

  it('passes the readOnly option board3d.js has always accepted', () => {
    assert.ok(/readOnly:\s*true/.test(body), 'the overlay is playback-only');
    const mount = fn('tbMount3D');
    assert.ok(/readOnly:\s*!!P\.readOnly/.test(mount),
        'tbMount3D must forward readOnly to createBoard3D');
  });

  it('reads its state from the board, not from the editor scratch keys', () => {
    /* tb3dState() reads localStorage. A saved board's state has never
       been near localStorage — reading it there would show whatever the
       coach last had open in the editor. */
    assert.ok(/getState:\s*ro3dState/.test(body), 'overlay must inject its own state');
    assert.ok(!/BS\.KEYS/.test(body) && !/localStorage/.test(body),
        'the overlay must not read the editor scratch keys');
    const mount = fn('tbMount3D');
    assert.ok(/getState:\s*P\.getState\s*\|\|\s*tb3dState/.test(mount),
        'tbMount3D must default to the editor state, not hardcode it');
  });

  it('drives the scene through the shared tween, not tweenFrame', () => {
    /* BS.tweenFrame has no production caller and drops the `paths`
       argument — it would draw straight lines where the flat renderer
       curves, and the two views would disagree about a chipped ball.
       tb3dTween consumes the same BS.tweenTrack output 2D does. */
    assert.ok(/tb3dTween\('positions'/.test(body), 'positions not tweened');
    assert.ok(/tb3dTween\('oppPositions'/.test(body), 'opposition not tweened');
    assert.ok(/tb3dTween\('balls'/.test(body), 'ball not tweened');
    assert.ok(/BS\.tweenTrack\(/.test(body), 'must use the shared tween');
    assert.ok(!/tweenFrame/.test(body), 'must not use BS.tweenFrame');
  });

  it('releases the WebGL context and its listeners on close', () => {
    assert.ok(/tbDestroy3D\(\)/.test(body), 'the scene must be destroyed on close');
    assert.ok(/removeEventListener\('keydown'/.test(body),
        'the Escape listener must come off with the overlay');
    const destroy = fn('tbDestroy3D');
    assert.ok(/_tb3dCamAbort\.abort\(\)/.test(destroy),
        'the camera menu listeners must be revoked — one of them is on document');
  });
});

describe('the 3D button is styled and stays off the print sheet', () => {
  it('has a rule of its own', () => {
    assert.ok(/^\.tb-ro-3d\s*\{/m.test(cssBare), '.tb-ro-3d has no rule');
    assert.ok(/^\.ro3d-scrim\s*\{/m.test(cssBare), '.ro3d-scrim has no rule');
    /* board3d.js sizes its renderer from the container. A stage that is
       `auto` tall gets a 0px canvas and an invisible scene. */
    const stage = /^\.ro3d-stage\s*\{([^}]*)\}/m.exec(cssBare);
    assert.ok(stage, '.ro3d-stage has no rule');
    assert.ok(/height:/.test(stage[1]), '.ro3d-stage must have a real height');
  });

  it('scaleRoField sizes it alongside the play button', () => {
    /* The SIZES, not merely the lookup. Asserting the selector alone
       let `const view3d = null && inner.querySelector('.tb-ro-3d')`
       survive — the string was still there and nothing was ever sized.
       A 30px puck beside a scaled 14px one is the visible symptom. */
    const body = fn('scaleRoField');
    /* The lookup, WHOLE. `/querySelector\('\.tb-ro-3d'\)/` matched
       `const view3d = null && inner.querySelector('.tb-ro-3d')` — a
       mutation that short-circuits the whole block while leaving every
       string this test reads exactly where it was. A source scan cannot
       see a runtime short-circuit; it can see that the assignment is
       not the plain one. Pinning the statement is the honest fix. */
    assert.ok(body.includes(
        "const view3d = inner.querySelector('.tb-ro-3d');"),
        'the 3D puck lookup must be a plain query, unguarded');
    assert.ok(/view3d\.style\.width\s*=\s*playS/.test(body) &&
              /view3d\.style\.height\s*=\s*playS/.test(body),
        'the 3D puck must take the same scaled size as the play button');
    /* The stop scales with them, and the strip's gap with all three.
       No `right:` offsets any more — flex lays the row out, which is
       what lets the stop appear without moving the 3D puck. */
    /* The plain lookup, for the reason spelt out above: a `null &&`
       guard leaves every string this test reads exactly where it was. */
    assert.ok(body.includes("const stopBtn = inner.querySelector('.tb-ro-stop');"),
        'the stop puck lookup must be a plain query, unguarded');
    assert.ok(/stopBtn\.style\.width\s*=\s*playS/.test(body),
        'the stop puck must scale too');
    assert.ok(/--ctl-gap/.test(body), 'the strip gap must scale with the board');
    assert.ok(!/--ro3d-right/.test(body),
        'per-button offsets are gone; the flex strip positions them');
  });

  it('the print stylesheet hides it', () => {
    assert.ok(/\.prn-board-in \.tb-ro-3d/.test(bare),
        'the 3D button must not print');
  });
});
