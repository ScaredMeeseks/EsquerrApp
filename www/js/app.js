/* =========================================================
   EsquerrApp — Pure client-side SPA
   Auth via localStorage · Role-based dashboards
   First registered user = admin
   ========================================================= */

(function () {
  'use strict';

  // #region Helpers, Cache & Fitness
  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let _usersCache = null, _usersCacheFrame = -1;
  function getUsers() {
    const f = _usersCacheFrame;
    if (_usersCache && f === _usersCacheFrame && f === (window._renderFrame || 0)) return _usersCache;
    _usersCache = JSON.parse(localStorage.getItem('fa_users') || '[]');
    _usersCacheFrame = window._renderFrame || 0;
    return _usersCache;
  }
  function invalidateUsersCache() { _usersCache = null; }
  function saveUsers(users) {
    localStorage.setItem('fa_users', JSON.stringify(users));
    invalidateUsersCache();
  }
  // localDateStr, DAYS_CA → utils.js

  /* Derive fitnessStatus from the chronological sequence of training answers.
     - Last answer is 'injured' → injured
     - Last answer is NOT injured but the previous one was → doubt ("Recovering from …")
     - Otherwise → fit
     Can be called without saving (for read-only queries). */
  function deriveFitnessStatus(playerId, saveResult) {
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const injNotes = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');

    // Collect all answered trainings for this player, sorted by date
    const answered = training
      .filter(t => t.date && availData[playerId + '_' + t.date])
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(t => availData[playerId + '_' + t.date]);

    const injNote = injNotes[playerId] || '';
    const last = answered.length ? answered[answered.length - 1] : null;
    const prev = answered.length >= 2 ? answered[answered.length - 2] : null;

    let status, note;
    if (last === 'injured') {
      status = 'injured';
      note = injNote || 'Injured';
    } else if (last && prev === 'injured') {
      status = 'doubt';
      note = 'Recovering from ' + (injNote || 'injury');
    } else {
      status = 'fit';
      note = '';
    }

    // Also check fa_injuries for staff-logged injuries
    const injuries = JSON.parse(localStorage.getItem('fa_injuries') || '[]');
    const playerInj = injuries.filter(inj => inj.playerId === playerId);
    const activeInj = playerInj.find(inj => inj.status === 'active');
    const recoveringInj = playerInj.find(inj => inj.status === 'recovering');
    if (activeInj) {
      status = 'injured';
      note = activeInj.muscleGroup + (activeInj.muscleSub ? ' (' + activeInj.muscleSub + ')' : '') + (activeInj.description ? ' – ' + activeInj.description : '');
    } else if (recoveringInj) {
      status = 'doubt';
      note = 'Recovering from ' + (recoveringInj.muscleGroup || 'injury');
    }

    if (saveResult !== false) {
      const users = getUsers();
      const u = users.find(x => x.id === playerId);
      if (u) { u.fitnessStatus = status; u.injuryNote = note; saveUsers(users); }
    }
    return { fitnessStatus: status, injuryNote: note };
  }

  // ---------- Injury helpers ----------
  function getInjuries() { return JSON.parse(localStorage.getItem('fa_injuries') || '[]'); }
  function saveInjuries(arr) { localStorage.setItem('fa_injuries', JSON.stringify(arr)); }
  function getActiveInjuries() { return getInjuries().filter(i => i.status === 'active'); }
  function getRecoveringInjuries() { return getInjuries().filter(i => i.status === 'recovering'); }
  function getPlayerInjuries(pid) { return getInjuries().filter(i => i.playerId === pid); }
  function addInjury(inj) {
    const injuries = getInjuries();
    inj.id = inj.id || String(Date.now()) + '_' + Math.random().toString(36).slice(2, 6);
    injuries.push(inj);
    saveInjuries(injuries);
    return inj;
  }
  function updateInjury(id, changes) {
    const injuries = getInjuries();
    const idx = injuries.findIndex(i => i.id === id);
    if (idx !== -1) { Object.assign(injuries[idx], changes); saveInjuries(injuries); }
  }
  function resolveInjury(id) {
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    updateInjury(id, { status: 'resolved', endDate: todayStr });
  }

  // ---------- Injury data migration ----------
  function migrateInjuryData() {
    if (localStorage.getItem('fa_injury_migration_done')) return;
    if (localStorage.getItem('fa_injuries')) {
      localStorage.setItem('fa_injury_migration_done', '1');
      return;
    }
    const users = getUsers();
    const players = users.filter(u => (u.roles || []).includes('player'));
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const injNotes = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
    const zoneMap = JSON.parse(localStorage.getItem('fa_injury_zone') || '{}');
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const seasonStart = seasonYear + '-08-15';
    const injuries = [];
    players.forEach(p => {
      let inWindow = false, windowStart = null, lastInjDate = null;
      const windows = [];
      training.forEach(t => {
        if (!t.date || t.date < seasonStart || t.date > todayStr) return;
        const val = availData[p.id + '_' + t.date];
        if (val === 'injured') {
          if (!inWindow) { windowStart = t.date; inWindow = true; }
          lastInjDate = t.date;
        } else {
          if (inWindow) { windows.push({ start: windowStart, end: lastInjDate }); inWindow = false; }
        }
      });
      if (inWindow) windows.push({ start: windowStart, end: lastInjDate, current: true });
      const noteRaw = injNotes[p.id] || '';
      const zIdx = zoneMap[p.id] != null ? zoneMap[p.id] : null;
      const zLabel = zIdx != null && BODY_ZONES[zIdx] ? BODY_ZONES[zIdx].label : '';
      // Parse note like "Hamstrings – pulled" or "Biceps Femoris (Hamstrings) – pulled"
      let muscleGroup = '', muscleSub = '', description = '';
      if (noteRaw) {
        const dashParts = noteRaw.split(' – ');
        const pathPart = dashParts[0].trim();
        description = dashParts.length > 1 ? dashParts.slice(1).join(' – ').trim() : '';
        const parenMatch = pathPart.match(/^(.+?)\s*\((.+?)\)$/);
        if (parenMatch) { muscleSub = parenMatch[1].trim(); muscleGroup = parenMatch[2].trim(); }
        else { muscleGroup = pathPart; }
      }
      windows.forEach((w, wi) => {
        const startD = new Date(w.start + 'T12:00:00');
        const endD = w.current ? now : new Date(w.end + 'T12:00:00');
        const days = Math.max(1, Math.floor((endD - startD) / 86400000) + 1);
        let severity = 'minor';
        if (days > 28) severity = 'severe';
        else if (days > 7) severity = 'moderate';
        injuries.push({
          id: p.id + '_mig_' + wi,
          playerId: p.id,
          bodyZone: zIdx,
          bodyZoneLabel: zLabel,
          muscleGroup: muscleGroup || zLabel || 'Unknown',
          muscleSub: muscleSub,
          description: description,
          severity: severity,
          status: w.current ? 'active' : 'resolved',
          startDate: w.start,
          expectedReturn: null,
          endDate: w.current ? null : w.end,
          createdBy: 'migration',
          notes: ''
        });
      });
    });
    localStorage.setItem('fa_injuries', JSON.stringify(injuries));
    localStorage.setItem('fa_injury_migration_done', '1');
  }

  // #endregion Helpers, Cache & Fitness

  // #region Session, Auth & Seed Data
  // ---------- Session (backed by Firebase Auth + Firestore) ----------
  let _currentSession = null;

  function getSession() {
    return _currentSession;
  }

  function setSession(user) {
    _currentSession = user;
    if (user && auth.currentUser) {
      // Persist profile to Firestore (strip password if present)
      const { password, ...profile } = user;
      db.collection('users').doc(auth.currentUser.uid).set(profile, { merge: true }).catch(console.error);
      // Also update localStorage for compat with roster/availability code
      let users = getUsers();
      // Remove any duplicates by same id OR same email
      const dominated = new Set();
      for (let i = 0; i < users.length; i++) {
        if (String(users[i].id) === String(user.id) || (users[i].email && users[i].email === user.email)) {
          dominated.add(i);
        }
      }
      users = users.filter((_, i) => !dominated.has(i));
      users.push(user);
      saveUsers(users);
    }
  }

  function clearSession() {
    _currentSession = null;
  }

  // ---------- View switching ----------
  function showView(id) {
    $$('.view').forEach(v => v.hidden = true);
    $(id).hidden = false;
  }

  // ---------- Seed data ----------
  function seedData() {
    // One-time migration: wipe corrupted data from earlier versions
    if (!localStorage.getItem('fa_v9_reset')) {
      localStorage.removeItem('fa_seeded');
      localStorage.removeItem('fa_demo_seeded');
      localStorage.removeItem('fa_responses_seeded');
      localStorage.removeItem('fa_v3_reset');
      localStorage.removeItem('fa_v4_reset');
      localStorage.removeItem('fa_v5_reset');
      localStorage.removeItem('fa_v6_reset');
      localStorage.removeItem('fa_v7_reset');
      localStorage.removeItem('fa_v8_reset');
      localStorage.removeItem('fa_users');
      localStorage.removeItem('fa_training');
      localStorage.removeItem('fa_matches');
      localStorage.removeItem('fa_matchday');
      localStorage.removeItem('fa_standings');
      localStorage.removeItem('fa_news');
      localStorage.removeItem('fa_player_stats');
      localStorage.removeItem('fa_player_rpe');
      localStorage.removeItem('fa_training_availability');
      localStorage.removeItem('fa_match_availability');
      localStorage.removeItem('fa_staff_notifications');
      sessionStorage.clear();
      localStorage.setItem('fa_v9_reset', '1');
    }

    // Re-seed responses (v3): realistic data with injuries, extras, etc.
    if (!localStorage.getItem('fa_responses_v3')) {
      localStorage.removeItem('fa_responses_seeded');
      localStorage.setItem('fa_responses_v3', '1');
    }

    // One-time fix: correct RPE dates that were stored as submission date instead of activity date
    if (!localStorage.getItem('fa_rpe_date_fix')) {
      const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
      const trn = JSON.parse(localStorage.getItem('fa_training') || '[]');
      const mtch = JSON.parse(localStorage.getItem('fa_matches') || '[]');
      let changed = false;
      Object.keys(rpeData).forEach(key => {
        const entry = rpeData[key];
        if (!entry) return;
        const tMatch = key.match(/^(\d+)_training_(\d{4}-\d{2}-\d{2})$/);
        if (tMatch) {
          const correctDate = tMatch[2];
          if (entry.date !== correctDate) { entry.date = correctDate; changed = true; }
          return;
        }
        const mMatch = key.match(/^(\d+)_match_(\d+)$/);
        if (mMatch) {
          const mObj = mtch.find(m => String(m.id) === mMatch[2]);
          if (mObj && mObj.date && entry.date !== mObj.date) { entry.date = mObj.date; changed = true; }
        }
      });
      if (changed) localStorage.setItem('fa_player_rpe', JSON.stringify(rpeData));
      localStorage.setItem('fa_rpe_date_fix', '1');
    }

    // Always seed demo players if missing
    seedDemoPlayers();

    if (localStorage.getItem('fa_seeded')) {
      // Seed responses after training/matches exist
      seedPlayerResponses();
      return;
    }

    // --- Generate training sessions (Tue/Thu) for ~7 months back + 2 weeks ahead ---
    const _ld = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const _now = new Date();
    const _todayStr = _ld(_now);
    const focusList = ['Tactical Drills', 'Fitness & Conditioning', 'Set Pieces', 'Match Simulation', 'Possession & Pressing', 'Finishing & Crossing'];
    const training = [];
    {
      const s = new Date(_now); s.setMonth(s.getMonth() - 7);
      const e = new Date(_now); e.setDate(e.getDate() + 14);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow === 2 || dow === 4) {
          const ds = _ld(d);
          const past = ds < _todayStr;
          training.push({ day: dow === 2 ? 'Tuesday' : 'Thursday', date: ds, time: dow === 2 ? '21:00 - 23:00' : '22:00 - 23:30', focus: focusList[Math.floor(Math.random() * focusList.length)], location: 'Escola Industrial', status: past ? 'past' : 'upcoming', ...(past ? { assistance: Math.floor(Math.random() * 40) + 55 } : {}) });
        }
      }
    }

    // --- Generate matches (~every 2 weeks on Saturday) ---
    const oppList = ['CF Gavà', 'UE Cornellà', 'CE Manresa', 'CF Igualada', 'CE Europa', 'FC Santboià', 'UE Sant Andreu', 'CF Damm', 'CE Júpiter', 'CE Hospitalet', 'FC Martinenc', 'UE Sants', 'FC Prat', 'AE Prat', 'CF Vilafranca', 'UE Figueres'];
    const awayLocs = ['Camp Municipal', 'Camp Igualada', 'Camp Santboià', 'Camp Europa', 'Camp Sant Andreu', 'Camp Damm', 'Camp Júpiter', 'Camp Hospitalet', 'Camp Martinenc', 'Camp Sants', 'Camp Prat', 'Camp AE Prat', 'Camp Vilafranca', 'Camp Figueres'];
    const scorePool = ['3-1', '1-2', '2-2', '0-1', '2-0', '1-1', '3-0', '0-0', '4-2', '1-3', '2-1', '0-2'];
    const matches = [];
    {
      let mId = 900001;
      const s = new Date(_now); s.setMonth(s.getMonth() - 7);
      while (s.getDay() !== 6) s.setDate(s.getDate() + 1);
      const e = new Date(_now); e.setDate(e.getDate() + 14);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 14)) {
        const ds = _ld(d);
        const isHome = matches.length % 2 === 0;
        const opp = oppList[matches.length % oppList.length];
        const past = ds < _todayStr;
        matches.push({ id: mId++, home: isHome ? 'Esquerra' : opp, away: isHome ? opp : 'Esquerra', date: ds, time: isHome ? '16:00' : '11:00', ...(past ? { score: scorePool[matches.length % scorePool.length] } : {}), status: past ? 'played' : 'upcoming', location: isHome ? 'Escola Industrial' : awayLocs[matches.length % awayLocs.length], team: 'A' });
      }
    }

    const standings = [
      { pos: 1, team: 'FC Barcelona', played: 30, won: 22, drawn: 5, lost: 3, gf: 68, ga: 21, pts: 71 },
      { pos: 2, team: 'Real Madrid', played: 30, won: 21, drawn: 4, lost: 5, gf: 65, ga: 28, pts: 67 },
      { pos: 3, team: 'Atlético Madrid', played: 30, won: 18, drawn: 7, lost: 5, gf: 52, ga: 25, pts: 61 },
      { pos: 4, team: 'Athletic Club', played: 30, won: 16, drawn: 6, lost: 8, gf: 45, ga: 30, pts: 54 },
      { pos: 5, team: 'Villarreal CF', played: 30, won: 14, drawn: 9, lost: 7, gf: 48, ga: 35, pts: 51 },
      { pos: 6, team: 'Real Betis', played: 30, won: 13, drawn: 8, lost: 9, gf: 40, ga: 34, pts: 47 },
      { pos: 7, team: 'Sevilla FC', played: 30, won: 12, drawn: 7, lost: 11, gf: 38, ga: 38, pts: 43 },
      { pos: 8, team: 'Valencia CF', played: 30, won: 11, drawn: 8, lost: 11, gf: 35, ga: 36, pts: 41 },
    ];
    const news = [
      { title: 'Transfer window opens next month', date: '2026-03-25', body: 'Clubs are preparing bids as the summer transfer window approaches. Several high-profile signings are expected.' },
      { title: 'New VAR rules announced for next season', date: '2026-03-23', body: 'The league has confirmed updated VAR protocols aimed at reducing delays and improving accuracy during matches.' },
      { title: 'Youth academy produces three new call-ups', date: '2026-03-20', body: 'Three young talents from the academy have been called up to the first team squad ahead of the crucial April fixtures.' },
    ];
    // training array was already generated programmatically above
    const playerStats = [
      { name: 'Carlos Pérez', pos: 'FW', goals: 14, assists: 8, matches: 28, rating: 7.8 },
      { name: 'Alejandro Torres', pos: 'MF', goals: 6, assists: 12, matches: 30, rating: 7.5 },
      { name: 'Diego Martín', pos: 'DF', goals: 2, assists: 3, matches: 29, rating: 7.2 },
      { name: 'Pablo Ruiz', pos: 'GK', goals: 0, assists: 0, matches: 30, rating: 7.4 },
      { name: 'Iker Navarro', pos: 'FW', goals: 10, assists: 5, matches: 26, rating: 7.3 },
      { name: 'Sergio López', pos: 'MF', goals: 4, assists: 9, matches: 27, rating: 7.1 },
    ];

    localStorage.setItem('fa_matches', JSON.stringify(matches));
    localStorage.setItem('fa_matchday', JSON.stringify(matches.map(m => ({ homeAway: m.home === 'Esquerra' ? 'home' : 'away', team: 'A', date: m.date, opponent: m.home === 'Esquerra' ? m.away : m.home, location: m.location, kickoff: m.time }))));
    localStorage.setItem('fa_standings', JSON.stringify(standings));
    localStorage.setItem('fa_news', JSON.stringify(news));
    localStorage.setItem('fa_training', JSON.stringify(training));
    localStorage.setItem('fa_player_stats', JSON.stringify(playerStats));

    // Seed demo player-users for roster display (merge with existing users)
    localStorage.setItem('fa_seeded', '1');

    // Seed player responses AFTER training/matches exist
    seedPlayerResponses();
  }

  function seedDemoPlayers() {
    if (localStorage.getItem('fa_demo_seeded')) return;
    const existingUsers = getUsers();
    const demoPlayers = [
      { id: 100001, name: 'Carlos Pérez', email: 'carlos@demo.local', password: '', roles: ['player'], isAdmin: false, position: 'FW', playerNumber: '9', profilePic: '', profileSetupDone: true, fitnessStatus: 'fit', injuryNote: '', matchesPlayed: 28, minutesPlayed: 2340, team: 'A' },
      { id: 100002, name: 'Alejandro Torres', email: 'alejandro@demo.local', password: '', roles: ['player'], isAdmin: false, position: 'MF', playerNumber: '8', profilePic: '', profileSetupDone: true, fitnessStatus: 'doubt', injuryNote: 'Minor hamstring tightness', matchesPlayed: 30, minutesPlayed: 2580, team: 'A' },
      { id: 100003, name: 'Diego Martín', email: 'diego@demo.local', password: '', roles: ['player'], isAdmin: false, position: 'DF', playerNumber: '4', profilePic: '', profileSetupDone: true, fitnessStatus: 'fit', injuryNote: '', matchesPlayed: 29, minutesPlayed: 2610, team: 'A' },
      { id: 100004, name: 'Pablo Ruiz', email: 'pablo@demo.local', password: '', roles: ['player'], isAdmin: false, position: 'GK', playerNumber: '1', profilePic: '', profileSetupDone: true, fitnessStatus: 'injured', injuryNote: 'Knee ligament sprain – 4 weeks', matchesPlayed: 30, minutesPlayed: 2700, team: 'A' },
      { id: 100005, name: 'Iker Navarro', email: 'iker@demo.local', password: '', roles: ['player'], isAdmin: false, position: 'FW', playerNumber: '11', profilePic: '', profileSetupDone: true, fitnessStatus: 'fit', injuryNote: '', matchesPlayed: 26, minutesPlayed: 1950, team: 'B' },
      { id: 100006, name: 'Sergio López', email: 'sergio@demo.local', password: '', roles: ['player'], isAdmin: false, position: 'MF', playerNumber: '6', profilePic: '', profileSetupDone: true, fitnessStatus: 'doubt', injuryNote: 'Ankle discomfort – assessment pending', matchesPlayed: 27, minutesPlayed: 2160, team: 'B' },
    ];
    demoPlayers.forEach(dp => {
      if (!existingUsers.find(u => u.email === dp.email)) {
        existingUsers.push(dp);
      }
    });
    saveUsers(existingUsers);
    localStorage.setItem('fa_demo_seeded', '1');
  }

  function seedPlayerResponses() {
    if (localStorage.getItem('fa_responses_seeded')) return;
    const users = getUsers().filter(u => (u.roles || []).includes('player'));
    if (!users.length) return;
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const matches  = JSON.parse(localStorage.getItem('fa_matches')  || '[]');
    const _ld2 = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const todayStr = _ld2(new Date());

    const rpeData        = JSON.parse(localStorage.getItem('fa_player_rpe')            || '{}');
    const availData      = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability')    || '{}');

    function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    const pastTrainings = training.filter(t => t.date && t.date < todayStr);
    const pastMatches   = matches.filter(m  => m.date && m.date < todayStr);
    const extraTypes    = ['Running', 'Cycling', 'Gym', 'Swimming'];

    users.forEach(u => {
      // Already has data? skip
      if (Object.keys(rpeData).some(k => k.startsWith(u.id + '_'))) return;

      // Generate 1-2 injury windows (each 5-18 days) spread across the season
      const injuryWindows = [];
      const numInj = rand(1, 2);
      for (let i = 0; i < numInj; i++) {
        if (pastTrainings.length < 6) break;
        const idx = rand(3, pastTrainings.length - 3);
        const startD = pastTrainings[idx].date;
        const dur = rand(5, 18);
        const endD = new Date(startD); endD.setDate(endD.getDate() + dur);
        injuryWindows.push({ s: startD, e: _ld2(endD) });
      }
      function isInjured(ds) { return injuryWindows.some(w => ds >= w.s && ds <= w.e); }

      const attendedDates = [];

      // Skip RPE for the last 3 past trainings so they appear as pending actions
      const recentSkipDates = new Set(pastTrainings.slice(-3).map(t => t.date));

      // --- Training RPE + availability ---
      pastTrainings.forEach(t => {
        const availKey = u.id + '_' + t.date;
        const rpeKey   = u.id + '_training_' + t.date;
        if (isInjured(t.date)) {
          availData[availKey] = 'injured';
          // NO RPE when injured
        } else if (rand(1, 100) <= 10) {
          availData[availKey] = 'no';
          // NO RPE when skipped
        } else {
          availData[availKey] = rand(1, 100) <= 12 ? 'late' : 'yes';
          // Leave recent trainings without RPE so they show as pending actions
          if (!recentSkipDates.has(t.date)) {
            const rpe = rand(4, 9);
            const minutes = rand(60, 120);
            rpeData[rpeKey] = { rpe, minutes, ua: rpe * minutes, tag: 'training', date: t.date };
          }
          attendedDates.push(t.date);
        }
      });

      // --- Match RPE + availability ---
      pastMatches.forEach(m => {
        const maKey  = u.id + '_' + m.id;
        const rpeKey = u.id + '_match_' + m.id;
        if (isInjured(m.date)) {
          matchAvailData[maKey] = 'no_disponible';
        } else if (rand(1, 100) <= 5) {
          matchAvailData[maKey] = 'no_disponible';
        } else {
          matchAvailData[maKey] = 'disponible';
          const rpe = rand(5, 10);
          const minutes = rand(45, 90);
          rpeData[rpeKey] = { rpe, minutes, ua: rpe * minutes, tag: 'match', date: m.date };
        }
      });

      // --- Extra sessions on ~25% of attended training days (creates blue dots) ---
      attendedDates.forEach(dateStr => {
        if (rand(1, 100) <= 25) {
          const tag = extraTypes[rand(0, extraTypes.length - 1)];
          const rpe = rand(3, 8);
          const minutes = rand(20, 60);
          const eKey = u.id + '_extra_' + dateStr + '_' + rand(1000, 9999);
          rpeData[eKey] = { rpe, minutes, ua: rpe * minutes, tag, date: dateStr };
        }
      });
    });

    localStorage.setItem('fa_player_rpe', JSON.stringify(rpeData));
    localStorage.setItem('fa_training_availability', JSON.stringify(availData));
    localStorage.setItem('fa_match_availability', JSON.stringify(matchAvailData));
    localStorage.setItem('fa_responses_seeded', '1');
  }

  // ---------- Auth (Firebase) ----------
  const ADMIN_EMAIL = 'marna96@gmail.com';

  // ---------- Category view filter ----------
  var _viewCategory = ''; // currently active category filter ('' = all)

  function getCurrentCategory() {
    if (_viewCategory) return _viewCategory;
    var s = getSession();
    return (s && s.category) ? s.category : '';
  }

  function canSeeAllCategories() {
    var s = getSession();
    return s && (s.isAdmin || s.isTeamLead || (s.roles && s.roles.includes('staff')));
  }

  function renderCategoryBar() {
    if (!canSeeAllCategories()) return '';
    var cats = getEnabledCategories();
    if (cats.length <= 1) return '';
    var cur = getCurrentCategory();
    var btns = '<button class="cat-bar-btn' + (!cur ? ' active' : '') + '" data-cat="">Totes</button>';
    cats.forEach(function (k) {
      btns += '<button class="cat-bar-btn' + (cur === k ? ' active' : '') + '" data-cat="' + k + '">' + CATEGORY_LABELS[k] + '</button>';
    });
    return '<div class="cat-bar">' + btns + '</div>';
  }

  // ---------- Club helpers ----------
  let _clubConfig = null;
  function getClubConfig() { return _clubConfig; }

  function generateClubCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async function createClub(name, leadEmail, badgeFile) {
    // Generate unique code
    let code, exists = true;
    while (exists) {
      code = generateClubCode();
      const snap = await db.collection('clubs').where('code', '==', code).get();
      exists = !snap.empty;
    }
    const clubRef = db.collection('clubs').doc();
    const clubId = clubRef.id;
    let badgeUrl = '';
    if (badgeFile) {
      const ext = badgeFile.name.split('.').pop().toLowerCase();
      const ref = storage.ref('clubBadges/' + clubId + '.' + ext);
      await ref.put(badgeFile);
      badgeUrl = await ref.getDownloadURL();
    }
    const clubData = {
      name: name,
      code: code,
      badgeUrl: badgeUrl,
      leadEmail: leadEmail.trim().toLowerCase(),
      categories: {
        amateur:  { enabled: false, letters: ['A', 'B'] },
        juvenil:  { enabled: false, letters: ['A', 'B'] },
        cadet:    { enabled: false, letters: ['A', 'B'] },
        infantil: { enabled: false, letters: ['A', 'B'] },
        alevi:    { enabled: false, letters: ['A', 'B'] },
        benjami:  { enabled: false, letters: ['A', 'B'] }
      },
      fcfLinks: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await clubRef.set(clubData);
    clubData.id = clubId;
    return clubData;
  }

  async function getClubByCode(code) {
    const snap = await db.collection('clubs').where('code', '==', code.toUpperCase().trim()).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return Object.assign({ id: doc.id }, doc.data());
  }

  async function getClub(clubId) {
    const doc = await db.collection('clubs').doc(clubId).get();
    if (!doc.exists) return null;
    return Object.assign({ id: doc.id }, doc.data());
  }

  async function updateClub(clubId, data) {
    await db.collection('clubs').doc(clubId).set(data, { merge: true });
  }

  async function loadClubConfig(clubId) {
    if (!clubId || clubId === 'default' || clubId === 'none') { _clubConfig = null; return null; }
    _clubConfig = await getClub(clubId);
    return _clubConfig;
  }

  // Get the club display name (for matching in stored data)
  function getClubName() {
    return (_clubConfig && _clubConfig.name) ? _clubConfig.name : 'Esquerra';
  }

  // Check if a team name in a match is "ours"
  function isOurTeam(name) {
    return name === getClubName();
  }

  // Return letters for a given category from the club config (fallback: ['A','B'])
  function getTeamLetters(category) {
    if (_clubConfig && _clubConfig.categories && category) {
      var cat = _clubConfig.categories[category];
      if (cat && cat.enabled && cat.letters && cat.letters.length) return cat.letters;
    }
    return ['A', 'B'];
  }

  // Return all enabled categories from club config
  function getEnabledCategories() {
    if (!_clubConfig || !_clubConfig.categories) return [];
    return CATEGORY_ORDER.filter(function (k) {
      var c = _clubConfig.categories[k];
      return c && c.enabled;
    });
  }

  async function handleRegister(e) {
    e.preventDefault();
    const name = $('#reg-name').value.trim();
    const email = $('#reg-email').value.trim().toLowerCase();
    const pw = $('#reg-password').value;
    const pw2 = $('#reg-password2').value;
    const codeInput = $('#reg-team-code');
    const teamCode = codeInput ? codeInput.value.trim().toUpperCase() : '';
    const errEl = $('#register-error');

    if (pw !== pw2) {
      errEl.textContent = 'Passwords do not match.';
      errEl.hidden = false;
      return;
    }

    try {
      // Create Firebase Auth account first (needed for Firestore access)
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      const uid = cred.user.uid;

      // Determine club: superuser skips, team leads auto-match by email, players use code
      let club = null;
      if (email === ADMIN_EMAIL) {
        // Superuser — no club needed at registration
      } else if (teamCode) {
        // Player provided a code — validate it
        club = await getClubByCode(teamCode);
        if (!club) {
          await cred.user.delete();
          errEl.textContent = 'Codi d\'equip no vàlid.';
          errEl.hidden = false;
          return;
        }
      } else {
        // No code — check if this email is a team lead for any club
        var leadSnap = await db.collection('clubs').where('leadEmail', '==', email).limit(1).get();
        if (!leadSnap.empty) {
          var leadDoc = leadSnap.docs[0];
          club = Object.assign({ id: leadDoc.id }, leadDoc.data());
        } else {
          // Not a superuser, not a team lead, and no code — require code
          await cred.user.delete();
          errEl.textContent = 'Has d\'introduir el codi d\'equip.';
          errEl.hidden = false;
          return;
        }
      }

      const isLead = club && club.leadEmail === email;
      const newUser = {
        id: uid,
        name,
        email,
        roles: [],
        isAdmin: email === ADMIN_EMAIL,
        isTeamLead: isLead || false,
        position: '',
        playerNumber: '',
        profilePic: '',
        dob: '',
        category: '',
        team: '',
        profileSetupDone: false,
        teamId: club ? club.id : 'none'
      };
      _currentSession = newUser;
      // Write to Firestore
      await db.collection('users').doc(uid).set(newUser);
      // Load club config
      if (club) await loadClubConfig(club.id);
      // Push to localStorage for compat with roster/availability code
      const users = getUsers();
      users.push(newUser);
      saveUsers(users);
      // Sync team data between localStorage and Firestore
      if (club) await DB.init(club.id);
      e.target.reset();
      errEl.hidden = true;
      navigate();
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use' ? 'An account with this email already exists.'
        : err.code === 'auth/weak-password' ? 'Password should be at least 6 characters.'
        : err.message;
      errEl.textContent = msg;
      errEl.hidden = false;
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = $('#login-email').value.trim().toLowerCase();
    const pw = $('#login-password').value;
    const errEl = $('#login-error');
    try {
      const cred = await auth.signInWithEmailAndPassword(email, pw);
      const uid = cred.user.uid;
      // Load profile from Firestore
      const doc = await db.collection('users').doc(uid).get();
      let user;
      if (doc.exists) {
        user = doc.data();
        user.id = uid;
      } else {
        // Fallback: create profile if missing
        user = { id: uid, name: '', email, roles: [], isAdmin: email === ADMIN_EMAIL, isTeamLead: false, position: '', playerNumber: '', profilePic: '', dob: '', category: '', team: '', profileSetupDone: false, teamId: 'none' };
        await db.collection('users').doc(uid).set(user);
      }
      // Ensure admin flag & fields
      user.isAdmin = user.email === ADMIN_EMAIL;
      if (user.isTeamLead === undefined) user.isTeamLead = false;
      if (!user.category) user.category = '';
      if (!user.teamId || user.teamId === 'default') {
        user.teamId = 'none';
        // Auto-match: check if any club has this email as leadEmail
        var leadSnap = await db.collection('clubs').where('leadEmail', '==', email).limit(1).get();
        if (!leadSnap.empty) {
          var leadDoc = leadSnap.docs[0];
          user.teamId = leadDoc.id;
          user.isTeamLead = true;
          await db.collection('users').doc(uid).set({ teamId: leadDoc.id, isTeamLead: true }, { merge: true });
        } else if (email !== ADMIN_EMAIL) {
          db.collection('users').doc(uid).set({ teamId: 'none' }, { merge: true }).catch(console.error);
        }
      }
      if (user.profileSetupDone === undefined) user.profileSetupDone = false;
      if (!user.position) user.position = '';
      if (!user.playerNumber) user.playerNumber = '';
      if (!user.profilePic) user.profilePic = '';
      // Update localStorage for compat
      let users = getUsers();
      users = users.filter(u => String(u.id) !== String(uid) && u.email !== email);
      users.push(user);
      saveUsers(users);
      _currentSession = user;
      // Load club config + sync team data
      if (user.teamId && user.teamId !== 'none') {
        await loadClubConfig(user.teamId);
        await DB.init(user.teamId);
      } else {
        // No team — flush stale localStorage so old data doesn't leak
        DB.flush();
      }
      e.target.reset();
      errEl.hidden = true;
      navigate();
    } catch (err) {
      const msg = (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')
        ? 'Invalid email or password.'
        : err.message;
      errEl.textContent = msg;
      errEl.hidden = false;
    }
  }

  // #endregion Session, Auth & Seed Data

  // #region Navigation, Team Setup & Profile
  // ---------- Navigation ----------
  function navigate() {
    window._renderFrame = (window._renderFrame || 0) + 1;
    invalidateUsersCache();
    const session = getSession();
    if (!session) { showView('#view-login'); return; }
    // Users without a club must join one first (superuser skips — manages clubs from admin settings)
    if (!session.isAdmin && (!session.teamId || session.teamId === 'none' || session.teamId === 'default')) {
      showView('#view-join-club');
      return;
    }
    // Profile setup for new users
    if (!session.profileSetupDone) {
      showProfileSetup(session);
      return;
    }
    // Team lead first-time setup (categories not yet configured)
    if (session.isTeamLead && _clubConfig && !_clubConfig._setupDone) {
      const cats = _clubConfig.categories || {};
      const anyEnabled = Object.values(cats).some(c => c && c.enabled);
      if (!anyEnabled) {
        showTeamSetup();
        return;
      }
    }
    if (!session.roles || session.roles.length === 0) {
      showRoleSelection(session);
      return;
    }
    showView('#view-dashboard');
    renderDashboard(session);
  }

  // ---------- Join Club ----------
  async function handleJoinClub(e) {
    e.preventDefault();
    const codeInput = $('#join-team-code');
    const code = codeInput.value.trim().toUpperCase();
    const errEl = $('#join-club-error');
    if (!code) {
      errEl.textContent = 'Introdueix un codi.';
      errEl.hidden = false;
      return;
    }
    const club = await getClubByCode(code);
    if (!club) {
      errEl.textContent = 'Codi no vàlid.';
      errEl.hidden = false;
      return;
    }
    const session = getSession();
    const isLead = club.leadEmail === session.email;
    session.teamId = club.id;
    if (isLead) session.isTeamLead = true;
    setSession(session);
    // Persist to Firestore
    var updateData = { teamId: club.id };
    if (isLead) updateData.isTeamLead = true;
    db.collection('users').doc(session.id).set(updateData, { merge: true }).catch(console.error);
    await loadClubConfig(club.id);
    await DB.init(club.id);
    // Add this user to the club's fa_users
    let users = getUsers();
    if (!users.find(u => String(u.id) === String(session.id))) {
      users.push(session);
      saveUsers(users);
    }
    errEl.hidden = true;
    e.target.reset();
    navigate();
  }

  // ---------- Team Setup (Team Lead config) ----------
  // CATEGORY_LABELS, CATEGORY_ORDER → utils.js

  function showTeamSetup() {
    showView('#view-team-setup');
    var cats = (_clubConfig && _clubConfig.categories) ? _clubConfig.categories : {};
    var container = document.getElementById('team-setup-categories');
    if (!container) return;
    var html = '';
    CATEGORY_ORDER.forEach(function (key) {
      var cat = cats[key] || { enabled: false, letters: ['A', 'B'] };
      var letters = cat.letters && cat.letters.length ? cat.letters : ['A', 'B'];
      var active = cat.enabled ? ' active' : '';
      var chips = letters.map(function (l) {
        return '<span class="ts-letter-chip" data-letter="' + l + '" data-cat="' + key + '">' + l + '</span>';
      }).join('');
      html += '<div class="ts-cat-row' + active + '" data-cat="' + key + '">' +
        '<label class="ts-cat-toggle"><input type="checkbox"' + (cat.enabled ? ' checked' : '') +
        ' data-cat="' + key + '"><span class="slider"></span></label>' +
        '<span class="ts-cat-name">' + CATEGORY_LABELS[key] + '</span>' +
        '<span class="ts-letters" data-cat="' + key + '">' + chips +
        '<button class="ts-letter-add" data-cat="' + key + '" title="Afegir equip">+</button>' +
        '</span></div>';
    });
    container.innerHTML = html;
    _refreshTeamSetupFcf();
    _refreshTeamSetupSchedules();
    _bindTeamSetupEvents(container);
  }

  function _refreshTeamSetupFcf() {
    var fcfSection = document.getElementById('team-setup-fcf');
    var fcfInputs = document.getElementById('team-setup-fcf-inputs');
    if (!fcfSection || !fcfInputs) return;
    var container = document.getElementById('team-setup-categories');
    if (!container) return;
    var rows = container.querySelectorAll('.ts-cat-row.active');
    if (!rows.length) { fcfSection.hidden = true; return; }
    fcfSection.hidden = false;
    var existingLinks = (_clubConfig && _clubConfig.fcfLinks) ? _clubConfig.fcfLinks : {};
    var html = '';
    rows.forEach(function (row) {
      var catKey = row.dataset.cat;
      row.querySelectorAll('.ts-letter-chip').forEach(function (chip) {
        var letter = chip.dataset.letter;
        var linkKey = catKey + '-' + letter;
        var val = existingLinks[linkKey] || '';
        html += '<div class="ts-fcf-row">' +
          '<span class="ts-fcf-label">' + CATEGORY_LABELS[catKey] + ' ' + letter + '</span>' +
          '<input type="url" placeholder="https://fcf.cat/classificacio/..." data-fcf-key="' + linkKey + '" value="' + sanitize(val) + '">' +
          '</div>';
      });
    });
    fcfInputs.innerHTML = html;
  }

  // DAY_LABELS, DAY_VALUES → utils.js

  function _refreshTeamSetupSchedules() {
    var section = document.getElementById('team-setup-schedules');
    var inputsEl = document.getElementById('team-setup-schedule-inputs');
    if (!section || !inputsEl) return;
    var container = document.getElementById('team-setup-categories');
    if (!container) return;
    var rows = container.querySelectorAll('.ts-cat-row.active');
    if (!rows.length) { section.hidden = true; return; }
    section.hidden = false;
    var existingSchedules = (_clubConfig && _clubConfig.schedules) ? _clubConfig.schedules : {};
    var dayOptions = DAY_VALUES.map(function (d, i) {
      return '<option value="' + d + '">' + DAY_LABELS[i] + '</option>';
    }).join('');

    var html = '';
    rows.forEach(function (row) {
      var catKey = row.dataset.cat;
      row.querySelectorAll('.ts-letter-chip').forEach(function (chip) {
        var letter = chip.dataset.letter;
        var schedKey = catKey + '-' + letter;
        var sched = existingSchedules[schedKey] || {};
        var trainings = sched.training || [{ day: '', time: '', location: '' }];
        var homeGame = sched.homeGame || { day: 'sat', time: '', location: '' };

        html += '<div class="ts-sched-block" data-sched-key="' + schedKey + '">';
        html += '<div class="ts-sched-title">' + CATEGORY_LABELS[catKey] + ' ' + letter + '</div>';

        // Training sessions
        html += '<div class="ts-sched-sub">Entrenaments</div>';
        html += '<div class="ts-training-list" data-sched-key="' + schedKey + '">';
        trainings.forEach(function (t, idx) {
          html += _buildTrainingRow(schedKey, idx, t, dayOptions);
        });
        html += '</div>';
        html += '<button class="btn btn-outline btn-small ts-add-training" data-sched-key="' + schedKey + '" style="margin:.4rem 0 .8rem;">+ Entrenament</button>';

        // Home game
        html += '<div class="ts-sched-sub">Partit a casa</div>';
        html += '<div class="ts-sched-row">';
        html += '<select data-home-day="' + schedKey + '">' + _selectedDayOptions(dayOptions, homeGame.day) + '</select>';
        html += '<input type="time" data-home-time="' + schedKey + '" value="' + (homeGame.time || '') + '" placeholder="Hora">';
        html += '<input type="text" data-home-location="' + schedKey + '" value="' + sanitize(homeGame.location || '') + '" placeholder="Ubicació">';
        html += '</div>';

        html += '</div>';
      });
    });
    inputsEl.innerHTML = html;
  }

  function _buildTrainingRow(schedKey, idx, t, dayOptions) {
    return '<div class="ts-sched-row" data-train-idx="' + idx + '">' +
      '<select data-train-day="' + schedKey + '-' + idx + '">' + _selectedDayOptions(dayOptions, t.day) + '</select>' +
      '<input type="time" data-train-time="' + schedKey + '-' + idx + '" value="' + (t.time || '') + '" placeholder="Hora">' +
      '<input type="text" data-train-location="' + schedKey + '-' + idx + '" value="' + sanitize(t.location || '') + '" placeholder="Ubicació">' +
      '<button class="btn btn-small ts-remove-training" data-sched-key="' + schedKey + '" data-train-idx="' + idx + '" title="Eliminar" style="padding:.2rem .5rem;min-width:0;">✕</button>' +
      '</div>';
  }

  function _selectedDayOptions(baseOptions, selected) {
    if (!selected) return '<option value="" selected>Dia…</option>' + baseOptions;
    return '<option value="">Dia…</option>' + baseOptions.replace(
      'value="' + selected + '"',
      'value="' + selected + '" selected'
    );
  }

  function _bindTeamSetupEvents(container) {
    // Toggle enable/disable
    container.addEventListener('change', function (e) {
      if (e.target.type === 'checkbox' && e.target.dataset.cat) {
        var row = e.target.closest('.ts-cat-row');
        if (e.target.checked) row.classList.add('active');
        else row.classList.remove('active');
        _refreshTeamSetupFcf();
        _refreshTeamSetupSchedules();
      }
    });
    // Add letter
    container.addEventListener('click', function (e) {
      var addBtn = e.target.closest('.ts-letter-add');
      if (addBtn) {
        var catKey = addBtn.dataset.cat;
        var lettersEl = container.querySelector('.ts-letters[data-cat="' + catKey + '"]');
        var existing = Array.from(lettersEl.querySelectorAll('.ts-letter-chip')).map(function (c) { return c.dataset.letter; });
        var next = _nextLetter(existing);
        if (!next) return;
        var chip = document.createElement('span');
        chip.className = 'ts-letter-chip';
        chip.dataset.letter = next;
        chip.dataset.cat = catKey;
        chip.textContent = next;
        lettersEl.insertBefore(chip, addBtn);
        _refreshTeamSetupFcf();
        _refreshTeamSetupSchedules();
        return;
      }
      // Remove letter by clicking on chip
      var clickedChip = e.target.closest('.ts-letter-chip');
      if (clickedChip) {
        var catKey2 = clickedChip.dataset.cat;
        var lettersEl2 = container.querySelector('.ts-letters[data-cat="' + catKey2 + '"]');
        var chips = lettersEl2.querySelectorAll('.ts-letter-chip');
        if (chips.length <= 1) return; // keep at least 1
        clickedChip.remove();
        _refreshTeamSetupFcf();
        _refreshTeamSetupSchedules();
      }
    });
    // Schedule section: add/remove training rows
    var schedSection = document.getElementById('team-setup-schedule-inputs');
    if (schedSection) {
      schedSection.addEventListener('click', function (e) {
        var addBtn = e.target.closest('.ts-add-training');
        if (addBtn) {
          var schedKey = addBtn.dataset.schedKey;
          var list = schedSection.querySelector('.ts-training-list[data-sched-key="' + schedKey + '"]');
          if (!list) return;
          var nextIdx = list.querySelectorAll('.ts-sched-row').length;
          var dayOptions = DAY_VALUES.map(function (d, i) {
            return '<option value="' + d + '">' + DAY_LABELS[i] + '</option>';
          }).join('');
          var rowHtml = _buildTrainingRow(schedKey, nextIdx, { day: '', time: '', location: '' }, dayOptions);
          list.insertAdjacentHTML('beforeend', rowHtml);
          return;
        }
        var removeBtn = e.target.closest('.ts-remove-training');
        if (removeBtn) {
          var row = removeBtn.closest('.ts-sched-row');
          var list2 = removeBtn.closest('.ts-training-list');
          if (list2 && list2.querySelectorAll('.ts-sched-row').length <= 1) return; // keep at least 1
          if (row) row.remove();
        }
      });
    }
    // Save button (remove previous listener to avoid duplicates when re-entering wizard)
    var saveBtn = document.getElementById('btn-save-team-setup');
    if (saveBtn) {
      saveBtn.removeEventListener('click', _handleSaveTeamSetup);
      saveBtn.addEventListener('click', _handleSaveTeamSetup);
    }
  }

  function _nextLetter(existing) {
    var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var i = 0; i < alpha.length; i++) {
      if (existing.indexOf(alpha[i]) === -1) return alpha[i];
    }
    return null;
  }

  async function _handleSaveTeamSetup() {
    var session = getSession();
    if (!session || !session.teamId) return;
    var container = document.getElementById('team-setup-categories');
    if (!container) return;
    var errEl = document.getElementById('team-setup-error');
    var saveBtn = document.getElementById('btn-save-team-setup');
    // Collect category config
    var categories = {};
    var anyEnabled = false;
    CATEGORY_ORDER.forEach(function (key) {
      var row = container.querySelector('.ts-cat-row[data-cat="' + key + '"]');
      if (!row) return;
      var enabled = row.querySelector('input[type="checkbox"]').checked;
      var letters = Array.from(row.querySelectorAll('.ts-letter-chip')).map(function (c) { return c.dataset.letter; });
      if (!letters.length) letters = ['A'];
      categories[key] = { enabled: enabled, letters: letters };
      if (enabled) anyEnabled = true;
    });
    if (!anyEnabled) {
      errEl.textContent = 'Has d\'activar almenys una categoria.';
      errEl.hidden = false;
      return;
    }
    // Collect FCF links
    var fcfLinks = {};
    document.querySelectorAll('#team-setup-fcf-inputs input[data-fcf-key]').forEach(function (inp) {
      var val = inp.value.trim();
      if (val) fcfLinks[inp.dataset.fcfKey] = val;
    });
    // Collect schedules
    var schedules = {};
    document.querySelectorAll('.ts-sched-block').forEach(function (block) {
      var schedKey = block.dataset.schedKey;
      // Training rows
      var training = [];
      var list = block.querySelector('.ts-training-list');
      if (list) {
        list.querySelectorAll('.ts-sched-row').forEach(function (row) {
          var daySel = row.querySelector('select');
          var timeInp = row.querySelector('input[type="time"]');
          var locInp = row.querySelector('input[type="text"]');
          var day = daySel ? daySel.value : '';
          var time = timeInp ? timeInp.value : '';
          var location = locInp ? locInp.value.trim() : '';
          if (day || time || location) training.push({ day: day, time: time, location: location });
        });
      }
      if (!training.length) training.push({ day: '', time: '', location: '' });
      // Home game
      var homeDaySel = block.querySelector('[data-home-day="' + schedKey + '"]');
      var homeTimeInp = block.querySelector('[data-home-time="' + schedKey + '"]');
      var homeLocInp = block.querySelector('[data-home-location="' + schedKey + '"]');
      var homeGame = {
        day: homeDaySel ? homeDaySel.value : '',
        time: homeTimeInp ? homeTimeInp.value : '',
        location: homeLocInp ? homeLocInp.value.trim() : ''
      };
      schedules[schedKey] = { training: training, homeGame: homeGame };
    });
    saveBtn.disabled = true;
    saveBtn.textContent = 'Desant…';
    try {
      await updateClub(session.teamId, { categories: categories, fcfLinks: fcfLinks, schedules: schedules });
      _clubConfig = await getClub(session.teamId);
      errEl.hidden = true;
      navigate();
    } catch (err) {
      errEl.textContent = 'Error: ' + err.message;
      errEl.hidden = false;
      console.error(err);
    }
    saveBtn.disabled = false;
    saveBtn.textContent = 'Desar i continuar';
  }

  // ---------- Profile Setup ----------
  function showProfileSetup(session) {
    showView('#view-profile-setup');
    $('#setup-name').value = session.name || '';
    const dobInput = $('#setup-dob');
    if (session.dob) {
      const parts = session.dob.split('-');
      dobInput.value = parts[2] + '/' + parts[1] + '/' + parts[0];
      dobInput.dataset.dateIso = session.dob;
    } else {
      dobInput.value = '';
      dobInput.dataset.dateIso = '';
    }
    const preview = $('#profile-pic-preview');
    if (session.profilePic) {
      preview.innerHTML = `<img src="${session.profilePic}" alt="Profile">`;
    } else {
      preview.innerHTML = '<span class="profile-pic-placeholder">📷</span>';
    }
  }

  function handleProfilePicChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2 MB.');
      return;
    }
    // Keep the raw File for upload in handleProfileSetup
    const preview = $('#profile-pic-preview');
    preview._pendingFile = file;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const dataUrl = ev.target.result;
      preview.innerHTML = `<img src="${dataUrl}" alt="Profile">`;
      preview.dataset.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function handleProfileSetup(e) {
    e.preventDefault();
    const session = getSession();
    if (!session) return;
    const name = $('#setup-name').value.trim();
    if (!name) return;
    const preview = $('#profile-pic-preview');
    let picSrc = session.profilePic || '';

    // Upload profile pic to Firebase Storage if a new file was selected
    if (preview._pendingFile && auth.currentUser) {
      try {
        const ext = preview._pendingFile.name.split('.').pop() || 'jpg';
        const ref = storage.ref('profilePics/' + auth.currentUser.uid + '.' + ext);
        await ref.put(preview._pendingFile);
        picSrc = await ref.getDownloadURL();
        preview._pendingFile = null;
      } catch (err) {
        console.error('Profile pic upload failed:', err);
        // Fall back to dataURL if upload fails
        picSrc = preview.dataset.src || picSrc;
      }
    } else if (preview.dataset.src) {
      picSrc = preview.dataset.src;
    }

    const dobInput = $('#setup-dob');
    const dob = dobInput.dataset.dateIso || dobInput.value || '';
    session.name = name;
    session.profilePic = picSrc;
    session.dob = dob;
    session.profileSetupDone = true;
    // Persist to Firestore + localStorage (handled by setSession)
    setSession(session);
    navigate();
  }

  function showRoleSelection(session) {
    showView('#view-roles');
    if (session.isAdmin) {
      $('#roles-pick-one').hidden = true;
      $('#roles-admin-pick').hidden = false;
      $('#roles-subtitle').textContent = 'As admin, you can enable one or both roles for yourself';
      $('#chk-player').checked = (session.roles || []).includes('player');
      $('#chk-staff').checked = (session.roles || []).includes('staff');
    } else {
      $('#roles-pick-one').hidden = false;
      $('#roles-admin-pick').hidden = true;
      $('#roles-subtitle').textContent = 'Select how you want to use EsquerrApp';
    }
  }

  // ---------- Role selection ----------
  function selectRole(role) {
    const session = getSession();
    if (!session) return;
    session.roles = [role];
    persistSessionRoles(session);
    currentPage = '';
    navigate();
  }

  function confirmAdminRoles() {
    const session = getSession();
    if (!session) return;
    const roles = [];
    if ($('#chk-player').checked) roles.push('player');
    if ($('#chk-staff').checked) roles.push('staff');
    if (roles.length === 0) {
      alert('Please select at least one role.');
      return;
    }
    session.roles = roles;
    persistSessionRoles(session);
    currentPage = '';
    navigate();
  }

  function persistSessionRoles(session) {
    // Persist to Firestore + localStorage (handled by setSession)
    setSession(session);
  }

  // #endregion Navigation, Team Setup & Profile

  // #region Dashboard & Page Router
  // ---------- Dashboard ----------
  let currentPage = '';
  let convSelectedMatchId = null;
  let detailMatchId = null;
  let detailMatchFrom = null;
  let detailTrainingDate = null;

  function buildSidebarItems(session) {
    const items = [];
    const roles = session.roles || [];

    if (roles.includes('player')) {
      items.push({ section: 'Player' });
      items.push({ id: 'player-home', icon: '🏠', label: 'Overview' });
      items.push({ id: 'training', icon: '🏋️', label: 'Training Schedule' });
      items.push({ id: 'my-stats', icon: '📊', label: 'My Stats' });
      items.push({ id: 'player-matchday', icon: '⚽', label: 'Matchday' });
      items.push({ id: 'player-actions', icon: '🔔', label: 'Actions' });
    }

    if (roles.includes('staff')) {
      items.push({ section: 'Staff' });
      items.push({ id: 'registrations', icon: '📝', label: 'Registrations' });
      items.push({ id: 'manage-roster', icon: '👥', label: 'Player Roster' });
      items.push({ id: 'staff-training', icon: '🏋️', label: 'Training Sessions' });
      items.push({ id: 'matchday', icon: '📅', label: 'Set Calendar' });
      items.push({ id: 'convocatoria', icon: '📋', label: 'Convocatòria' });
      items.push({ id: 'staff-matchday', icon: '⚽', label: 'Matchday' });
      items.push({ id: 'medical', icon: '🏥', label: 'Medical' });
      items.push({ id: 'tactics', icon: '📐', label: 'Tactical Board' });
      items.push({ id: 'staff-notifications', icon: '🔔', label: 'Notifications' });
    }

    if (session.isAdmin) {
      items.push({ section: 'Admin' });
      items.push({ id: 'users', icon: '⚙️', label: 'Manage Users' });
      items.push({ id: 'settings', icon: '🔧', label: 'Settings' });
    } else if (session.isTeamLead) {
      items.push({ section: 'Team Lead' });
      items.push({ id: 'settings', icon: '🔧', label: 'Settings' });
    }

    return items;
  }

  function renderDashboard(session) {
    migrateInjuryData();
    const navUserEl = $('#nav-user-name');
    if (session.profilePic) {
      navUserEl.innerHTML = `<img src="${session.profilePic}" class="nav-avatar" alt=""> ${sanitize(session.name)}`;
    } else {
      navUserEl.textContent = session.name;
    }

    // Dynamic badge / app name from club config
    var logoEl = document.querySelector('.topnav-logo');
    if (logoEl) {
      var badgeUrl = _clubConfig && _clubConfig.badgeUrl ? _clubConfig.badgeUrl : 'img/logo.png';
      var clubName = _clubConfig && _clubConfig.name ? _clubConfig.name : 'EsquerrApp';
      logoEl.innerHTML = '<img src="' + sanitize(badgeUrl) + '" alt="Logo" class="topnav-logo-img"> ' + sanitize(clubName);
    }

    const badges = [];
    if (session.isAdmin) badges.push('admin');
    (session.roles || []).forEach(r => badges.push(r));
    $('#nav-user-badges').innerHTML = badges.map(b =>
      `<span class="nav-badge">${sanitize(b)}</span>`
    ).join(' ');

    renderSidebar(session);
    renderPage(session);
  }

  function renderSidebar(session) {
    const items = buildSidebarItems(session);
    const pageIds = items.filter(i => !i.section).map(i => i.id);
    if (!pageIds.includes(currentPage)) {
      currentPage = pageIds[0] || '';
    }

    let html = '';
    items.forEach(item => {
      if (item.section) {
        html += `<div class="sidebar-section">${item.section}</div>`;
      } else {
        let badge = '';
        if (item.id === 'player-actions') {
          const pc = getPendingActionCount();
          if (pc > 0) badge = `<span class="sidebar-badge">${pc}</span>`;
        }
        if (item.id === 'staff-notifications') {
          const nc = getUnreadStaffNotifCount();
          if (nc > 0) badge = `<span class="sidebar-badge">${nc}</span>`;
        }
        html += `<div class="sidebar-item ${item.id === currentPage ? 'active' : ''}" data-page="${item.id}">
          <span class="sidebar-icon">${item.icon}</span><span>${item.label}</span>${badge}
        </div>`;
      }
    });
    $('#sidebar').innerHTML = html;

    $$('.sidebar-item').forEach(el => {
      el.addEventListener('click', () => {
        currentPage = el.dataset.page;
        // Close sidebar on mobile
        const sb = document.getElementById('sidebar');
        if (sb) sb.classList.remove('open');
        const ov = document.getElementById('sidebar-overlay');
        if (ov) ov.classList.remove('open');
        renderDashboard(getSession());
      });
    });
  }

  // ---------- Page renderers ----------
  function updateActionsBadge() {
    const pc = getPendingActionCount();
    const el = document.querySelector('.sidebar-item[data-page="player-actions"] .sidebar-badge');
    if (el) {
      if (pc > 0) { el.textContent = pc; }
      else { el.remove(); }
    } else if (pc > 0) {
      const item = document.querySelector('.sidebar-item[data-page="player-actions"]');
      if (item) item.insertAdjacentHTML('beforeend', `<span class="sidebar-badge">${pc}</span>`);
    }
  }

  // Pages that require a specific role
  const STAFF_PAGES = new Set([
    'staff-training', 'staff-training-detail', 'matchday',
    'convocatoria', 'staff-matchday', 'tactics',
    'manage-roster', 'registrations', 'staff-notifications',
    'staff-player-stats', 'medical', 'medical-detail'
  ]);
  const ADMIN_PAGES = new Set(['users']);
  const LEAD_PAGES  = new Set(['settings']);

  function renderPage(session) {
    const content = $('#dashboard-content');
    const roles = session.roles || [];

    // Enforce role access
    if (STAFF_PAGES.has(currentPage) && !roles.includes('staff')) {
      currentPage = 'player-home';
    }
    if (ADMIN_PAGES.has(currentPage) && !session.isAdmin) {
      currentPage = roles.includes('staff') ? 'registrations' : 'player-home';
    }
    if (LEAD_PAGES.has(currentPage) && !session.isAdmin && !session.isTeamLead) {
      currentPage = roles.includes('staff') ? 'registrations' : 'player-home';
    }

    const renderers = {
      'player-home': renderPlayerHome,
      'match-detail': renderMatchDetail,
      'training-detail': renderTrainingDetail,
      'training': renderTraining,
      'my-stats': renderPlayerStats,
      'player-actions': renderPlayerActions,
      'player-matchday': renderMatches,
      'staff-training': renderStaffTraining,
      'staff-training-detail': renderStaffTrainingDetail,
      'matchday': renderMatchday,
      'convocatoria': renderConvocatoria,
      'staff-matchday': renderMatches,
      'tactics': renderTactics,
      'manage-roster': renderStaffRoster,
      'staff-player-stats': renderStaffPlayerStats,
      'registrations': renderRegistrations,
      'staff-notifications': renderStaffNotifications,
      'medical': renderMedical,
      'medical-detail': renderMedicalDetail,
      'users': renderAdminUsers,
      'settings': renderAdminSettings,
    };

    const fn = renderers[currentPage];
    if (fn) {
      // Pages that benefit from category scoping
      var CATEGORY_PAGES = new Set(['registrations', 'staff-training', 'staff-training-detail', 'matchday', 'convocatoria', 'staff-matchday', 'manage-roster', 'player-matchday', 'training', 'player-home', 'player-actions', 'tactics']);
      var catBar = CATEGORY_PAGES.has(currentPage) ? renderCategoryBar() : '';
      content.innerHTML = catBar + fn(session);
    } else {
      content.innerHTML = '<div class="empty-state"><div class="empty-icon">🚧</div><p>Page not found</p></div>';
    }

    bindDynamicActions();

    // Auto-scroll league tables so Esquerra is vertically centered
    if (currentPage === 'player-home') {
      requestAnimationFrame(function() { requestAnimationFrame(function() {
        scrollLeagueToCentre();
      }); });
      // Live-refresh league data from FCF
      refreshLeagueTables();
    }

    // Injury description hover → body map popup + medical tab bindings
    if (currentPage === 'medical') bindMedical();
    if (currentPage === 'medical-detail') bindMedicalDetail();
    if (currentPage === 'my-stats') bindMyStatsInjuryPopup();

    // Scroll RPE and UA charts to the right (most recent) by default
    content.querySelectorAll('.rpe-chart-scroll').forEach(el => { el.scrollLeft = el.scrollWidth; });

    // Ensure RO board proportional scaling after layout
    requestAnimationFrame(() => requestAnimationFrame(() => scaleRoBoards()));
  }

  // #endregion Dashboard & Page Router

  // #region Player Pages & Actions
  // POS_COLORS, POS_ORDER, posRankGlobal, posCirclesHtmlGlobal → utils.js

  function getPendingActionCount() {
    const session = getSession();
    if (!session) return 0;
    const now = new Date();
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const staffOverrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const completedTraining = training.filter(t => {
      if (!t.date || !t.time) return false;
      const start = new Date(t.date + 'T' + t.time.split(' - ')[0] + ':00');
      return now >= new Date(start.getTime() + 90 * 60 * 1000);
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
    const pt = completedTraining.filter(t => {
      const eff = staffOverrides[session.id + '_' + t.date] || availData[session.id + '_' + t.date] || '';
      if (eff === 'no' || eff === 'injured') return false;
      return !rpeData[session.id + '_training_' + t.date];
    }).length;
    const pm = matches.filter(m => {
      if (!m.date || !m.time) return false;
      const start = new Date(m.date + 'T' + m.time + ':00');
      if (now < new Date(start.getTime() + 105 * 60 * 1000)) return false;
      return !rpeData[session.id + '_match_' + m.id];
    }).length;
    const todayStr = now.toISOString().slice(0, 10);
    const ta = training.filter(t => {
      if (!t.date || !t.time) return false;
      if (t.date < todayStr) return false;
      if (isTrainingLocked(t)) return false;
      return !availData[session.id + '_' + t.date];
    }).length;
    const ma = matches.filter(m => {
      if (!m.date) return false;
      if (m.date < todayStr) return false;
      if (sentData[m.id]) return false;
      return !matchAvailData[session.id + '_' + m.id];
    }).length;
    return pt + pm + ta + ma;
  }

  function renderPlayerActions() {
    const session = getSession();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const staffOverrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');

    // Pending training: last 5 completed sessions (1.5h / 90min after start)
    const completedTraining = training.filter(t => {
      if (!t.date || !t.time) return false;
      const start = new Date(t.date + 'T' + t.time.split(' - ')[0] + ':00');
      return now >= new Date(start.getTime() + 90 * 60 * 1000);
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

    const pendingTraining = completedTraining.filter(t => {
      const eff = staffOverrides[session.id + '_' + t.date] || availData[session.id + '_' + t.date] || '';
      if (eff === 'no' || eff === 'injured') return false;
      const key = session.id + '_training_' + t.date;
      return !rpeData[key];
    });

    // Pending matches: 1h45 (105min) after kickoff
    const pendingMatches = matches.filter(m => {
      if (!m.date || !m.time) return false;
      const start = new Date(m.date + 'T' + m.time + ':00');
      const readyAt = new Date(start.getTime() + 105 * 60 * 1000);
      if (now < readyAt) return false;
      const key = session.id + '_match_' + m.id;
      return !rpeData[key];
    });

    // Pending training availability: future, not locked, no answer yet
    const pendingTrainingAvail = training.filter(t => {
      if (!t.date || !t.time) return false;
      if (t.date < todayStr) return false;
      if (isTrainingLocked(t)) return false;
      return !availData[session.id + '_' + t.date];
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Pending match availability: future, conv not sent, no answer yet
    const pendingMatchAvail = matches.filter(m => {
      if (!m.date) return false;
      if (m.date < todayStr) return false;
      if (sentData[m.id]) return false;
      return !matchAvailData[session.id + '_' + m.id];
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Extra trainings already logged
    const extras = Object.keys(rpeData)
      .filter(k => k.startsWith(session.id + '_extra_'))
      .map(k => rpeData[k]);

    function fmtDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T12:00:00');
      return DAYS_CA[d.getDay()] + ' ' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
    }

    let pendingHtml = '';
    pendingTraining.forEach(t => {
      pendingHtml += `<div class="action-card" data-action-type="training" data-action-key="${session.id}_training_${t.date}">
        <div class="action-header"><span class="badge badge-green">Training</span><span class="action-date">${fmtDate(t.date)} · ${t.time}</span></div>
        <div class="action-label">${sanitize(t.focus || 'Training')}</div>
        <div class="action-form">
          <div class="action-field"><label data-tooltip="Rate of Perceived Exertion (0–10)">RPE</label><input type="text" inputmode="numeric" class="reg-input action-rpe" maxlength="2"></div>
          <div class="action-field"><label>Minutes</label><input type="text" inputmode="numeric" class="reg-input action-minutes" maxlength="3"></div>
          <button class="btn btn-primary btn-small action-submit">Submit</button>
        </div>
      </div>`;
    });
    pendingMatches.forEach(m => {
      pendingHtml += `<div class="action-card" data-action-type="match" data-action-key="${session.id}_match_${m.id}">
        <div class="action-header"><span class="badge badge-yellow">Match</span><span class="action-date">${fmtDate(m.date)} · ${m.time}</span></div>
        <div class="action-label">${matchLabel(m)}</div>
        <div class="action-form">
          <div class="action-field"><label data-tooltip="Rate of Perceived Exertion (0–10)">RPE</label><input type="text" inputmode="numeric" class="reg-input action-rpe" maxlength="2"></div>
          <div class="action-field"><label>Minutes</label><input type="text" inputmode="numeric" class="reg-input action-minutes" maxlength="3"></div>
          <button class="btn btn-primary btn-small action-submit">Submit</button>
        </div>
      </div>`;
    });

    // Availability cards for training
    pendingTrainingAvail.forEach(t => {
      pendingHtml += `<div class="action-card action-avail-card" data-avail-type="training" data-avail-date="${t.date}">
        <div class="action-header"><span class="badge badge-green">Training</span><span class="action-date">${fmtDate(t.date)} · ${t.time}</span></div>
        <div class="action-label">${sanitize(t.focus || 'Training')}</div>
        <div class="action-avail-prompt">Attendance?</div>
        <div class="avail-btns" data-avail-date="${t.date}">
          <button class="avail-btn avail-yes" data-avail="yes">Yes</button>
          <button class="avail-btn avail-late" data-avail="late">Late</button>
          <button class="avail-btn avail-no" data-avail="no">No</button>
          <button class="avail-btn avail-injured" data-avail="injured">Injured</button>
        </div>
      </div>`;
    });

    // Availability cards for matches
    pendingMatchAvail.forEach(m => {
      pendingHtml += `<div class="action-card action-avail-card" data-avail-type="match" data-mavail-match="${m.id}">
        <div class="action-header"><span class="badge badge-yellow">Match</span><span class="action-date">${fmtDate(m.date)} · ${m.time || ''}</span></div>
        <div class="action-label">${matchLabel(m)}</div>
        <div class="action-avail-prompt">Availability?</div>
        <div class="mavail-btns" data-mavail-match="${m.id}">
          <button class="mavail-btn mavail-disp" data-mavail="disponible">Disponible</button>
          <button class="mavail-btn mavail-nodisp" data-mavail="no_disponible">No Disponible</button>
        </div>
      </div>`;
    });

    if (!pendingHtml) pendingHtml = '<p style="color:var(--text-secondary)">No pending actions.</p>';
    const pendingCount = pendingTraining.length + pendingMatches.length + pendingTrainingAvail.length + pendingMatchAvail.length;

    return `
      <h2 class="page-title">Actions</h2>
      <div class="card">
        <div class="card-title">Pending${pendingCount ? ' (' + pendingCount + ')' : ''}</div>
        ${pendingHtml}
      </div>
      <div class="card">
        <div class="card-title">Extra Training</div>
        <div id="extra-training-list"></div>
        <button class="btn btn-outline btn-small" id="btn-add-extra" style="margin-top:.75rem;">+ Add Extra Training</button>
      </div>`;
  }

  // #endregion Player Pages & Actions

  // #region FCF League Scraper
  /* ---------- Live FCF league scraper ---------- */
  var FCF_LEAGUES_DEFAULT = [
    { id: 'league-a', title: 'A Team — Tercera Catalana', url: 'https://www.fcf.cat/classificacio/2526/futbol-11/tercera-catalana/grup-10' },
    { id: 'league-b', title: 'B Team — Quarta Catalana',  url: 'https://www.fcf.cat/classificacio/2526/futbol-11/quarta-catalana/grup-22' }
  ];
  var ESQUERRA_NEEDLE_DEFAULT = "esquerra";

  function getActiveFcfLeagues() {
    if (!_clubConfig) return FCF_LEAGUES_DEFAULT;
    if (!_clubConfig.fcfLinks || !Object.keys(_clubConfig.fcfLinks).length) return [];
    var links = _clubConfig.fcfLinks;
    var cats = _clubConfig.categories || {};
    var keys = Object.keys(links);
    var curCat = getCurrentCategory();
    var leagues = [];
    keys.forEach(function (key) {
      // key format: "amateur-A"
      var parts = key.split('-');
      var cat = parts[0] || '';
      var letter = parts.slice(1).join('-') || '';
      if (curCat && cat !== curCat) return;
      // Only include if this category+letter is actually enabled in club config
      var catCfg = cats[cat];
      if (!catCfg || !catCfg.enabled) return;
      if (catCfg.letters && catCfg.letters.indexOf(letter) === -1) return;
      var label = (CATEGORY_LABELS[cat] || cat) + ' ' + letter;
      leagues.push({ id: 'league-' + key, title: label, url: links[key] });
    });
    // Sort alphabetically by title
    leagues.sort(function (a, b) { return a.title.localeCompare(b.title); });
    return leagues;
  }

  function getClubNeedle() {
    if (_clubConfig && _clubConfig.name) return _clubConfig.name.toLowerCase();
    return ESQUERRA_NEEDLE_DEFAULT;
  }

  function scrollLeagueToCentre() {
    document.querySelectorAll('.league-scroll').forEach(function(el) {
      var row = el.querySelector('.league-ours');
      if (!row) return;
      var thead = el.querySelector('thead');
      var headerH = thead ? thead.getBoundingClientRect().height : 0;
      var cRect = el.getBoundingClientRect();
      var rRect = row.getBoundingClientRect();
      var visibleH = cRect.height - headerH;
      var scrollOffset = rRect.top - cRect.top + el.scrollTop - headerH;
      el.scrollTop = Math.max(0, scrollOffset - (visibleH / 2) + (rRect.height / 2));
    });
  }

  function parseFcfHtml(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var trs = doc.querySelectorAll('table.fcftable-e tbody tr');
    var rows = [];
    trs.forEach(function(tr) {
      var allTds = tr.querySelectorAll('td');
      if (allTds.length < 10) return;
      // Filter to visible-only cells (exclude detallada / display:none)
      var vis = [];
      allTds.forEach(function(td) {
        if (td.style.display === 'none') return;
        if (td.classList.contains('detallada')) return;
        vis.push(td);
      });
      if (vis.length < 8) return;
      // vis[0]=Pos  vis[1]=Badge  vis[2]=Club  vis[3]=Pts  ...  vis[end-4]=F  vis[end-3]=C
      var posCell = vis[0];
      var zone = '';
      var ascSpan = posCell.querySelector('span.ascens');
      if (ascSpan && ascSpan.style.backgroundColor) zone = ascSpan.style.backgroundColor;
      var pos = parseInt(posCell.textContent.trim(), 10) || 0;
      // badge
      var img = vis[1].querySelector('img');
      var badge = img ? img.getAttribute('src') : '';
      if (badge && badge.indexOf('escutbase') !== -1) badge = '';
      // club name from resumida cell
      var clubTd = vis[2];
      var anchor = clubTd.querySelector('a');
      var club = anchor ? anchor.textContent.trim() : clubTd.textContent.trim();
      // pts
      var pts = parseInt(vis[3].textContent.trim(), 10) || 0;
      // F and C are always 4th and 3rd from end of visible cells (before Últims + Sanció)
      var gf = parseInt(vis[vis.length - 4].textContent.trim(), 10) || 0;
      var gc = parseInt(vis[vis.length - 3].textContent.trim(), 10) || 0;
      // J: first resumida numeric cell after pts (skip Coef/Provisional if present)
      var j = 0;
      for (var k = 4; k < vis.length - 4; k++) {
        var val = parseInt(vis[k].textContent.trim(), 10);
        if (!isNaN(val) && vis[k].classList.contains('resumida')) { j = val; break; }
      }
      var ours = club.toLowerCase().indexOf(getClubNeedle()) !== -1;
      rows.push({ pos: pos, club: club, pts: pts, j: j, f: gf, c: gc, badge: badge, zone: zone, ours: ours });
    });
    return rows;
  }

  var _leagueLastFetch = 0;
  var LEAGUE_CACHE_MS = 5 * 60 * 1000; // 5 minutes
  var _leagueCache = JSON.parse(localStorage.getItem('fa_league_cache') || '{}');
  var _leagueCacheTime = parseInt(localStorage.getItem('fa_league_cache_t') || '0', 10);
  var FCF_PROXY_BASE = 'https://fcfclassificacio-674dkdzfja-uc.a.run.app?url=';

  function fetchFcfPage(url) {
    return fetch(FCF_PROXY_BASE + encodeURIComponent(url))
      .then(function(r) { if (!r.ok) throw new Error(r.status); return r.text(); });
  }

  function applyLeagueRows(container, rows) {
    if (rows.length === 0) return;
    var tbody = '';
    rows.forEach(function(r) {
      var cls = r.ours ? ' class="league-ours"' : '';
      var badgeHtml = r.badge ? '<img src="' + r.badge + '" class="league-badge" onerror="this.style.display=\'none\'">' : '';
      var zoneBar = r.zone ? '<span class="league-zone" style="background:' + r.zone + '"></span>' : '';
      tbody += '<tr' + cls + '><td class="league-pos-cell">' + zoneBar + r.pos + '</td><td class="league-badge-cell">' + badgeHtml + '</td><td class="league-club">' + sanitize(r.club) + '</td><td><strong>' + r.pts + '</strong></td><td>' + r.j + '</td><td>' + r.f + '</td><td>' + r.c + '</td></tr>';
    });
    container.querySelector('tbody').innerHTML = tbody;
    requestAnimationFrame(function() { scrollLeagueToCentre(); });
  }

  function refreshLeagueTables() {
    var now = Date.now();
    var needsFetch = now - _leagueCacheTime >= LEAGUE_CACHE_MS;
    getActiveFcfLeagues().forEach(function(league) {
      var container = document.getElementById(league.id);
      if (!container) return;
      // Apply cached rows immediately
      if (_leagueCache[league.id]) {
        applyLeagueRows(container, _leagueCache[league.id]);
      }
      if (!needsFetch) return;
      fetchFcfPage(league.url)
        .then(function(html) {
          var rows = parseFcfHtml(html);
          if (rows.length === 0) return;
          _leagueCache[league.id] = rows;
          try { localStorage.setItem('fa_league_cache', JSON.stringify(_leagueCache)); } catch(e) {}
          applyLeagueRows(container, rows);
        })
        .catch(function() { /* keep current data on error */ });
    });
    if (needsFetch) {
      _leagueCacheTime = now;
      try { localStorage.setItem('fa_league_cache_t', String(now)); } catch(e) {}
    }
  }

  function buildLeagueSnippet(title, rows, snippetId) {
    // Use cached live data if available, otherwise fall back to hardcoded rows
    var useRows = _leagueCache[snippetId] || rows;
    var hidden = _getHiddenLeagues();
    var isHidden = hidden.indexOf(snippetId) !== -1;
    var eyeIcon = isHidden ? '👁️‍🗨️' : '👁️';
    var eyeTitle = isHidden ? 'Mostrar classificació' : 'Amagar classificació';
    var html = '<div class="league-snippet card' + (isHidden ? ' league-hidden' : '') + '">';
    html += '<div class="card-title" style="font-size:.82rem;margin-bottom:.5rem;display:flex;align-items:center;justify-content:space-between;">⚽ ' + sanitize(title) + '<button class="league-toggle-btn" data-league-id="' + snippetId + '" title="' + eyeTitle + '" style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0 .2rem;opacity:.5;">' + eyeIcon + '</button></div>';
    if (!isHidden) {
      html += '<div class="league-scroll" id="' + snippetId + '"><table class="league-tbl"><thead><tr><th>P</th><th></th><th>Club</th><th>Pts</th><th>J</th><th>F</th><th>C</th></tr></thead><tbody>';
      useRows.forEach(function(r) {
        var cls = r.ours ? ' class="league-ours"' : '';
        var badge = r.badge ? '<img src="' + r.badge + '" class="league-badge" onerror="this.style.display=\'none\'">' : '';
        var zoneBar = r.zone ? '<span class="league-zone" style="background:' + r.zone + '"></span>' : '';
        html += '<tr' + cls + '><td class="league-pos-cell">' + zoneBar + r.pos + '</td><td class="league-badge-cell">' + badge + '</td><td class="league-club">' + sanitize(r.club) + '</td><td><strong>' + r.pts + '</strong></td><td>' + r.j + '</td><td>' + r.f + '</td><td>' + r.c + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
    return html;
  }

  function _getHiddenLeagues() {
    try { return JSON.parse(localStorage.getItem('fa_hidden_leagues') || '[]'); } catch (e) { return []; }
  }
  function _setHiddenLeagues(arr) {
    localStorage.setItem('fa_hidden_leagues', JSON.stringify(arr));
  }

  function renderPlayerHome() {
    const session = getSession();
    const stats = JSON.parse(localStorage.getItem('fa_player_stats') || '[]');
    const me = stats[0] || { goals: 0, assists: 0, matches: 0, rating: '-' };
    const picHtml = session.profilePic
      ? `<img src="${session.profilePic}" alt="Profile" class="player-overview-pic">`
      : `<div class="player-overview-pic player-overview-pic-placeholder">${sanitize(session.name).charAt(0).toUpperCase()}</div>`;

    const users = getUsers();
    const userRecord = users.find(u => u.id === session.id);
    const team = (userRecord && userRecord.team) || session.team || '';
    const teamBadge = team
      ? `<span class="po-team-badge">${sanitize(team)}</span>`
      : '';

    const positions = ((userRecord && userRecord.position) || session.position || '').split(',').map(s => s.trim()).filter(Boolean);
    const layoutCls = positions.length === 3 ? 'po-pos-tri' : positions.length === 2 ? 'po-pos-duo' : 'po-pos-one';
    const posCircles = positions.map(p => {
      const bg = POS_COLORS[p] || '#9e9e9e';
      return `<span class="po-pos-circle" style="background:${bg}">${sanitize(p)}</span>`;
    }).join('');

    const number = session.playerNumber || '—';
    const dob = (userRecord && userRecord.dob) || session.dob || '';
    let ageLabel = '';
    if (dob) {
      const bd = new Date(dob + 'T12:00:00');
      const today = new Date();
      let age = today.getFullYear() - bd.getFullYear();
      if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
      ageLabel = ` <span style="color:var(--text-secondary);font-weight:400;font-size:.85em;">(${age} anys)</span>`;
    }

    // Build per-player attendance donut
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
    let pYes = 0, pLate = 0, pNo = 0, pInj = 0, pNa = 0;
    training.forEach(t => {
      if (!t.date) return;
      const locked = isTrainingLocked(t);
      const v = getEffectiveAnswer(session.id, t.date, locked);
      if (v === 'yes') pYes++;
      else if (v === 'late') pLate++;
      else if (v === 'no') pNo++;
      else if (v === 'injured') pInj++;
      else pNa++;
    });
    const pTotal = pYes + pLate + pNo + pInj + pNa;
    let attendDonutHtml = '';
    if (pTotal > 0) {
      const dSize = 130, dStroke = 20, dRadius = (dSize - dStroke) / 2;
      const dCirc = 2 * Math.PI * dRadius;
      const dSegs = [
        { count: pYes, color: '#66bb6a', label: 'Yes' },
        { count: pLate, color: '#ffa726', label: 'Late' },
        { count: pNo, color: '#78909c', label: 'No' },
        { count: pInj, color: '#ef5350', label: 'Injured' },
        { count: pNa, color: '#d0d0d0', label: 'N/A' }
      ];
      let dArcs = '', dOff = 0;
      dSegs.forEach(s => {
        if (s.count > 0) {
          const len = (s.count / pTotal) * dCirc;
          const sPct = Math.round((s.count / pTotal) * 100);
          dArcs += `<circle cx="${dSize/2}" cy="${dSize/2}" r="${dRadius}" fill="none" stroke="${s.color}" stroke-width="${dStroke}"
            stroke-dasharray="${len} ${dCirc - len}" stroke-dashoffset="${-dOff}"
            style="--circ:${dCirc};cursor:pointer;pointer-events:stroke" transform="rotate(-90 ${dSize/2} ${dSize/2})" data-tooltip="${s.label}: ${sPct}%"><title>${s.label}: ${sPct}%</title></circle>`;
          dOff += len;
        }
      });
      const attendPct = Math.round(((pYes + pLate) / pTotal) * 100);
      attendDonutHtml = `<div class="po-attendance">
        <div class="assistance-circle" style="width:${dSize}px;height:${dSize}px;">
          <svg width="${dSize}" height="${dSize}" viewBox="0 0 ${dSize} ${dSize}">
            <circle cx="${dSize/2}" cy="${dSize/2}" r="${dRadius}" fill="none" stroke="var(--border)" stroke-width="${dStroke}"/>
            ${dArcs}
          </svg>
          <span class="assistance-pct po-pct-counter" data-target="${attendPct}" style="font-size:1.3rem;font-weight:800;">0%</span>
        </div>
        <span class="po-attendance-label">Attendance</span>
      </div>`;
    }

    return `
      <h2 class="page-title">${sanitize(session.name)} <span style="color:var(--text-secondary);font-weight:600;">#${sanitize(String(number))}</span>${ageLabel}</h2>
      <div class="player-overview-card">
        <div class="player-overview-left">
          <div class="po-pic-wrap">
            ${picHtml}
            ${teamBadge}
          </div>
          <div class="po-pos-wrap ${layoutCls}">${posCircles}</div>
        </div>
        ${attendDonutHtml}
      </div>
      <div class="league-tables-row">
        ${getActiveFcfLeagues().map(function(league) {
          var cached = _leagueCache[league.id] || [];
          return buildLeagueSnippet(league.title, cached, league.id);
        }).join('')}
      </div>
      <div class="card">
        <div class="card-title">This Week</div>
        ${renderWeekActivities(0)}
      </div>
      <div class="card">
        <div class="card-title">Next Week</div>
        ${renderWeekActivities(1)}
      </div>`;
  }

  // #endregion FCF League Scraper

  // #region Tactical Board Rendering
  // ---- Arrowhead helper — computes polygon arrowheads in pixel space for correct perpendicularity ----
  function refreshArrowheads(svg) {
    if (!svg) return;
    svg.querySelectorAll('.tb-arrowhead').forEach(p => p.remove());
    const rect = svg.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w < 1 || h < 1) return;
    const isRo = !!svg.closest('.tb-field-readonly');
    svg.querySelectorAll('.tb-arrow').forEach(line => {
      // Preserve original endpoints so repeated calls don't accumulate shortening
      if (!line.dataset.origX2) {
        line.dataset.origX2 = line.getAttribute('x2');
        line.dataset.origY2 = line.getAttribute('y2');
      }
      const x1 = parseFloat(line.getAttribute('x1'));
      const y1 = parseFloat(line.getAttribute('y1'));
      const x2 = parseFloat(line.dataset.origX2);
      const y2 = parseFloat(line.dataset.origY2);
      if (isRo) {
        // Pixel-space arrowhead for RO boards — same approach as editor but scaled
        const px1 = x1 * w / 100, py1 = y1 * h / 100;
        const px2 = x2 * w / 100, py2 = y2 * h / 100;
        const dx = px2 - px1, dy = py2 - py1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 2) return;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const scaleFactor = w / 814;
        const aLen = 12 * scaleFactor, aHW = 5 * scaleFactor;
        const bx = px2 - ux * aLen, by = py2 - uy * aLen;
        const lx = bx + nx * aHW, ly = by + ny * aHW;
        const rx = bx - nx * aHW, ry = by - ny * aHW;
        line.setAttribute('x2', (bx * 100 / w) + '%');
        line.setAttribute('y2', (by * 100 / h) + '%');
        const pts = (px2 * 100 / w) + ',' + (py2 * 100 / h) + ' ' +
                    (lx * 100 / w) + ',' + (ly * 100 / h) + ' ' +
                    (rx * 100 / w) + ',' + (ry * 100 / h);
        const color = line.dataset.color || line.getAttribute('stroke') || '#ffffff';
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('class', 'tb-arrowhead');
        poly.setAttribute('points', pts);
        poly.setAttribute('fill', color);
        svg.appendChild(poly);
      } else {
        // Pixel-space arrowhead (editor board)
        const px1 = x1 * w / 100, py1 = y1 * h / 100;
        const px2 = x2 * w / 100, py2 = y2 * h / 100;
        const dx = px2 - px1, dy = py2 - py1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 2) return;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const aLen = 12, aHW = 5;
        const bx = px2 - ux * aLen, by = py2 - uy * aLen;
        const lx = bx + nx * aHW, ly = by + ny * aHW;
        const rx = bx - nx * aHW, ry = by - ny * aHW;
        // Shorten the line so it ends at the arrowhead base (doesn't poke through)
        line.setAttribute('x2', (bx * 100 / w) + '%');
        line.setAttribute('y2', (by * 100 / h) + '%');
        const pts = (px2 * 100 / w) + ',' + (py2 * 100 / h) + ' ' +
                    (lx * 100 / w) + ',' + (ly * 100 / h) + ' ' +
                    (rx * 100 / w) + ',' + (ry * 100 / h);
        const color = line.dataset.color || line.getAttribute('stroke') || '#ffffff';
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('class', 'tb-arrowhead');
        poly.setAttribute('points', pts);
        poly.setAttribute('fill', color);
        svg.appendChild(poly);
      }
    });
  }

  // ---- Read-only board helper (shared by match-detail & convocatòria) ----
  let _roBoardIdx = 0;
  function renderReadOnlyBoard(b, prefix) {
    const bid = 'ro-board-' + (++_roBoardIdx);
    let fCls = 'tb-field tb-field-readonly';
    if (b.boardType === 'half') fCls += ' tb-half';
    else if (b.boardType === 'area') fCls += ' tb-area';
    const tc = b.teamColor || '#ffffff';
    const oc = b.oppColor || '#e53935';
    const hasFrames = b.frames && b.frames.length > 1;
    // Use first frame's state for positions if available, otherwise base board data
    const src = hasFrames ? b.frames[0] : b;

    function buildCircles(pos, nums, colors, baseColor) {
      const GK_C = '#f5c842';
      return (pos || []).map((p, i) => {
        if (!p) return ''; // null = deleted circle slot
        const num = String((nums && nums[i]) || '');
        const isGk = num === '1';
        const cc = isGk ? GK_C : ((colors && colors[i]) || baseColor);
        const fg = textColorFor(cc);
        return '<div class="tb-circle" data-idx="' + i + '" style="left:' + p[0] + '%;top:' + p[1] + '%;pointer-events:none;background:' + cc + ';border-color:' + darkenHex(cc, 50) + ';">' +
          '<span class="tb-num" style="pointer-events:none;display:flex;align-items:center;justify-content:center;color:' + fg + ';">' + sanitize(num) + '</span></div>';
      }).join('');
    }
    const hasRealNums = function(arr) { return arr && arr.some(function(n) { return n; }); };
    const circles = buildCircles(src.positions, (hasRealNums(b.numbers) ? b.numbers : src.numbers), src.colors, tc);
    const oppCircles = (b.showOpp !== false && src.oppPositions) ? buildCircles(src.oppPositions, (hasRealNums(b.oppNumbers) ? b.oppNumbers : src.oppNumbers), null, oc) : '';
    const srcBalls = src.balls || (src.ballPos ? [src.ballPos] : []);
    const ballHtml = srcBalls.map((bp,bi) => { if (!bp) return ''; return '<div class="tb-ball" data-idx="' + bi + '" style="left:' + bp[0] + '%;top:' + bp[1] + '%;pointer-events:none;"></div>'; }).join('');
    function buildSvgContent(arrows, rects, penLines, pfx) {
      const rectsH = (rects && rects.length) ? rects.map(r => '<rect class="tb-rect" x="' + r[0] + '%" y="' + r[1] + '%" width="' + r[2] + '%" height="' + r[3] + '%" style="pointer-events:none;fill:' + (r[4]||'#ffffff') + ';fill-opacity:' + (r[5]!=null?r[5]:0.3) + ';stroke:' + (r[4]||'#ffffff') + ';" />').join('') : '';
      const arrowsH = (arrows && arrows.length) ? (arrows.map(a => { const ac = a[4] || '#ffffff'; const ad = a[5] ? ' stroke-dasharray="6 4"' : ''; return '<line class="tb-arrow" x1="' + a[0] + '%" y1="' + a[1] + '%" x2="' + a[2] + '%" y2="' + a[3] + '%" data-color="' + ac + '" style="pointer-events:none;stroke:' + ac + ';"' + ad + ' />'; }).join('')) : '';
      const penH = (penLines && penLines.length) ? penLines.map(p => '<polyline class="tb-pen-line" points="' + p[0] + '" style="pointer-events:none;fill:none;stroke:' + (p[1]||'#ffffff') + ';stroke-width:2.5;"' + (p[2] ? ' stroke-dasharray="6 4"' : '') + ' />').join('') : '';
      return (rectsH || arrowsH || penH) ? '<svg class="tb-arrows-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' + rectsH + arrowsH + penH + '</svg>' : '';
    }
    // Use base board data for arrows/rects/penLines in static view (always up-to-date at save time)
    const staticArrows = ('arrows' in b) ? b.arrows : (src.arrows || []);
    const staticRects = ('rects' in b) ? b.rects : (src.rects || []);
    const staticPenLines = ('penLines' in b) ? b.penLines : (src.penLines || []);
    const svgHtml = buildSvgContent(staticArrows, staticRects, staticPenLines, prefix + bid + '-');
    const staticTexts = ('texts' in b) ? b.texts : (src.texts || []);
    const textsHtml = staticTexts.map(t => { const c=t[3]||'#000000'; const o=t[4]!=null?t[4]:0.8; const w=t[5]?'width:'+t[5]+'px;':''; const h=t[6]?'height:'+t[6]+'px;':''; const fs=t[7]?'font-size:'+t[7]+'px;':''; return '<div class="tb-text-label" style="left:'+t[0]+'%;top:'+t[1]+'%;pointer-events:none;background:rgba('+parseInt(c.slice(1,3),16)+','+parseInt(c.slice(3,5),16)+','+parseInt(c.slice(5,7),16)+','+o+');color:'+textColorFor(c)+';'+w+h+fs+'">'+sanitize(t[2])+'</div>'; }).join('');
    const playBtnH = hasFrames ? '<button class="tb-ro-play" data-ro-board="' + bid + '" title="Play animation"></button>' : '';
    // Merge base board rects/arrows/numbers into frames that lack them so shapes & numbers persist during animation
    // Numbers are shared across all frames — always prefer base board numbers (b.numbers)
    const baseNums = hasRealNums(b.numbers) ? b.numbers : null;
    const baseOppNums = hasRealNums(b.oppNumbers) ? b.oppNumbers : null;
    const framesForAnim = hasFrames ? b.frames.map(f => ({
      ...f,
      positions: f.positions || b.positions || [],
      oppPositions: ('oppPositions' in f) ? f.oppPositions : (b.oppPositions || null),
      balls: ('balls' in f) ? f.balls : (f.ballPos ? [f.ballPos] : (b.balls || (b.ballPos ? [b.ballPos] : []))),
      colors: ('colors' in f) ? f.colors : (b.colors || null),
      numbers: baseNums || (hasRealNums(f.numbers) ? f.numbers : []),
      oppNumbers: baseOppNums || (hasRealNums(f.oppNumbers) ? f.oppNumbers : []),
      rects: ('rects' in f) ? f.rects : (b.rects || []),
      arrows: ('arrows' in f) ? f.arrows : (b.arrows || []),
      texts: ('texts' in f) ? f.texts : (b.texts || []),
      penLines: ('penLines' in f) ? f.penLines : (b.penLines || []),
      cones: ('cones' in f) ? f.cones : []
    })) : [];
    const framesAttr = hasFrames ? " data-frames='" + sanitize(JSON.stringify(framesForAnim)).replace(/'/g, '&#39;') + "'" : '';
    return '<div style="margin-bottom:1rem;"><div style="font-weight:600;font-size:.92rem;margin-bottom:.4rem;">' + sanitize(b.name) + (b.formation ? ' <span style="color:var(--text-secondary);font-weight:400;">(' + sanitize(b.formation) + ')</span>' : '') + '</div>' +
      '<div class="' + fCls + '" id="' + bid + '"' + framesAttr + ' data-tc="' + tc + '" data-oc="' + oc + '" data-prefix="' + prefix + bid + '-"><div class="tb-field-inner">' +
      '<div class="tb-halfway"></div><div class="tb-center-circle"></div><div class="tb-center-spot"></div>' +
      '<div class="tb-penalty-left"></div><div class="tb-penalty-right"></div>' +
      '<div class="tb-goal-left"></div><div class="tb-goal-right"></div>' +
      '<div class="tb-penalty-arc-left"></div><div class="tb-penalty-arc-right"></div>' +
      '<div class="tb-penalty-spot-left"></div><div class="tb-penalty-spot-right"></div>' +
      circles + oppCircles + ballHtml + svgHtml + textsHtml + playBtnH +
      ((src.cones && src.cones.length) ? src.cones.map(c => '<div class="tb-cone" style="left:' + c[0] + '%;top:' + c[1] + '%;pointer-events:none;"></div>').join('') : '') +
      (b.silhouette ? '<img class="tb-silhouette" src="img/sil-' + b.silhouette + '.png" alt="" style="display:block;pointer-events:none;">' : '') +
      '</div></div></div>';
  }

  function bindRoBoardAnimations() {
    // Compute polygon arrowheads for all read-only boards now that they're in the DOM
    document.querySelectorAll('.tb-field-readonly .tb-arrows-svg').forEach(svg => refreshArrowheads(svg));
    document.querySelectorAll('.tb-ro-play').forEach(btn => {
      btn.addEventListener('click', () => {
        const bid = btn.dataset.roBoard;
        const fieldEl = document.getElementById(bid);
        if (!fieldEl) return;
        const innerEl = fieldEl.querySelector('.tb-field-inner');
        if (!innerEl) return;
        let frames;
        try { frames = JSON.parse(fieldEl.dataset.frames || '[]'); } catch(e) { return; }
        if (frames.length < 2) return;
        const tc = fieldEl.dataset.tc || '#ffffff';
        const oc = fieldEl.dataset.oc || '#e53935';
        const prefix = fieldEl.dataset.prefix || '';

        // If already playing, stop
        if (fieldEl._roPlaying) { fieldEl._roPlaying = false; btn.classList.remove('playing'); return; }
        fieldEl._roPlaying = true;
        btn.classList.add('playing');

        // Apply a frame state to the read-only board
        function applyRoFrame(f) {
          const GK_C = '#f5c842';
          // Circles
          innerEl.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => c.remove());
          (f.positions || []).forEach((p, i) => {
            if (!p) return; // null = deleted circle slot
            const num = String((f.numbers && f.numbers[i]) || '');
            const isGk = num === '1';
            const cc = isGk ? GK_C : ((f.colors && f.colors[i]) || tc);
            const div = document.createElement('div');
            div.className = 'tb-circle';
            div.setAttribute('data-idx', i);
            div.style.cssText = 'left:' + p[0] + '%;top:' + p[1] + '%;pointer-events:none;background:' + cc + ';border-color:' + darkenHex(cc, 50) + ';';
            const span = document.createElement('span');
            span.className = 'tb-num';
            span.style.cssText = 'pointer-events:none;display:flex;align-items:center;justify-content:center;color:' + textColorFor(cc) + ';';
            span.textContent = num;
            div.appendChild(span);
            innerEl.appendChild(div);
          });
          // Opp circles
          innerEl.querySelectorAll('.tb-circle-opp').forEach(c => c.remove());
          (f.oppPositions || []).forEach((p, i) => {
            if (!p) return; // null = deleted circle slot
            const num = String((f.oppNumbers && f.oppNumbers[i]) || '');
            const isGk = num === '1';
            const oppBg = isGk ? GK_C : oc;
            const div = document.createElement('div');
            div.className = 'tb-circle tb-circle-opp';
            div.setAttribute('data-idx', i);
            div.style.cssText = 'left:' + p[0] + '%;top:' + p[1] + '%;pointer-events:none;background:' + oppBg + ';border-color:' + darkenHex(oppBg, 50) + ';';
            const span = document.createElement('span');
            span.className = 'tb-num';
            span.style.cssText = 'pointer-events:none;display:flex;align-items:center;justify-content:center;color:' + textColorFor(oppBg) + ';';
            span.textContent = num;
            div.appendChild(span);
            innerEl.appendChild(div);
          });
          // Balls
          innerEl.querySelectorAll('.tb-ball').forEach(b => b.remove());
          const fBalls = f.balls || (f.ballPos ? [f.ballPos] : []);
          fBalls.forEach((bp, bi) => {
            if (!bp) return; // null = deleted ball
            const div = document.createElement('div');
            div.className = 'tb-ball';
            div.setAttribute('data-idx', bi);
            div.style.cssText = 'left:' + bp[0] + '%;top:' + bp[1] + '%;pointer-events:none;';
            innerEl.appendChild(div);
          });
          // Text labels
          innerEl.querySelectorAll('.tb-text-label').forEach(t => t.remove());
          (f.texts || []).forEach(t => {
            const div = document.createElement('div');
            div.className = 'tb-text-label';
            const tc=t[3]||'#000000'; const to2=t[4]!=null?t[4]:0.8;
            div.style.cssText = 'left:'+t[0]+'%;top:'+t[1]+'%;pointer-events:none;background:'+hexToRgba(tc,to2)+';color:'+textColorFor(tc)+';'+(t[5]?'width:'+t[5]+'px;':'')+(t[6]?'height:'+t[6]+'px;':'')+(t[7]?'font-size:'+t[7]+'px;':'');
            div.textContent = t[2];
            innerEl.appendChild(div);
          });
          // SVG
          let svg = innerEl.querySelector('.tb-arrows-svg');
          if (svg) svg.remove();
          const arrows = f.arrows || [];
          const rects = f.rects || [];
          const penLines = f.penLines || [];
          if (arrows.length || rects.length || penLines.length) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'tb-arrows-svg');
            svg.setAttribute('viewBox', '0 0 100 100');
            svg.setAttribute('preserveAspectRatio', 'none');
            // Rects
            rects.forEach(r => {
              const re = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              re.setAttribute('class', 'tb-rect');
              re.setAttribute('x', r[0] + '%'); re.setAttribute('y', r[1] + '%');
              re.setAttribute('width', r[2] + '%'); re.setAttribute('height', r[3] + '%');
              re.style.cssText = 'pointer-events:none;fill:' + (r[4]||'#fff') + ';fill-opacity:' + (r[5]!=null?r[5]:0.3) + ';stroke:' + (r[4]||'#fff') + ';';
              svg.appendChild(re);
            });
            // Arrow lines
            if (arrows.length) {
              arrows.forEach(a => {
                const ac = a[4]||'#ffffff';
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('class', 'tb-arrow');
                line.setAttribute('x1', a[0]+'%'); line.setAttribute('y1', a[1]+'%');
                line.setAttribute('x2', a[2]+'%'); line.setAttribute('y2', a[3]+'%');
                line.dataset.color = ac;
                line.style.cssText = 'pointer-events:none;stroke:' + ac;
                if (a[5]) line.setAttribute('stroke-dasharray', '6 4');
                svg.appendChild(line);
              });
            }
            // Pen lines
            penLines.forEach(p => {
              const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
              pl.setAttribute('class', 'tb-pen-line');
              pl.setAttribute('points', p[0]);
              pl.style.cssText = 'pointer-events:none;fill:none;stroke:' + (p[1]||'#ffffff') + ';stroke-width:2.5;';
              if (p[2]) pl.setAttribute('stroke-dasharray', '6 4');
              svg.appendChild(pl);
            });
            innerEl.appendChild(svg);
            refreshArrowheads(svg);
          }
          // Cones
          innerEl.querySelectorAll('.tb-cone').forEach(c => c.remove());
          (f.cones || []).forEach(c => {
            const div = document.createElement('div');
            div.className = 'tb-cone';
            div.style.cssText = 'left:' + c[0] + '%;top:' + c[1] + '%;pointer-events:none;';
            innerEl.appendChild(div);
          });
          // Re-apply proportional sizing to new elements
          scaleRoField(innerEl, innerEl.offsetWidth);
        }

        function lerp(a, b, t) { return a + (b - a) * t; }

        function interpolateRo(from, to, t) {
          const GK_C = '#f5c842';

          // --- Team circles: match by stable array index ---
          const fromPos = from.positions || [];
          const toPos = to.positions || [];
          const toNums = to.numbers || [];
          const maxLen = Math.max(fromPos.length, toPos.length);

          // Build a map of existing DOM circles by data-idx
          let circleMap = {};
          innerEl.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => {
            circleMap[Number(c.dataset.idx || c.getAttribute('data-idx') || 0)] = c;
          });

          for (let i = 0; i < maxLen; i++) {
            const fP = fromPos[i];
            const tP = toPos[i];
            const circle = circleMap[i];

            if (!tP) {
              if (circle) { circle.remove(); delete circleMap[i]; }
              continue;
            }

            if (!circle) {
              const num = String(toNums[i] || '');
              const isGk = num === '1';
              const cc = isGk ? GK_C : ((to.colors && to.colors[i]) || tc);
              const div = document.createElement('div');
              div.className = 'tb-circle';
              div.setAttribute('data-idx', i);
              div.style.cssText = 'left:' + tP[0] + '%;top:' + tP[1] + '%;pointer-events:none;background:' + cc + ';border-color:' + darkenHex(cc, 50) + ';';
              const span = document.createElement('span');
              span.className = 'tb-num';
              span.style.cssText = 'pointer-events:none;display:flex;align-items:center;justify-content:center;color:' + textColorFor(cc) + ';';
              span.textContent = num;
              div.appendChild(span);
              innerEl.appendChild(div);
              circleMap[i] = div;
              continue;
            }

            if (fP && tP) {
              circle.style.left = lerp(fP[0], tP[0], t) + '%';
              circle.style.top = lerp(fP[1], tP[1], t) + '%';
            } else if (!fP && tP) {
              circle.style.left = tP[0] + '%';
              circle.style.top = tP[1] + '%';
            }
          }

          // --- Opp circles: same stable-index matching ---
          const fromOpp = from.oppPositions || [];
          const toOpp = to.oppPositions || [];
          const toOppNums = to.oppNumbers || [];
          const maxOppLen = Math.max(fromOpp.length, toOpp.length);

          let oppMap = {};
          innerEl.querySelectorAll('.tb-circle-opp').forEach(c => {
            oppMap[Number(c.dataset.idx || c.getAttribute('data-idx') || 0)] = c;
          });

          for (let i = 0; i < maxOppLen; i++) {
            const fP = fromOpp[i];
            const tP = toOpp[i];
            const circle = oppMap[i];

            if (!tP) {
              if (circle) { circle.remove(); delete oppMap[i]; }
              continue;
            }

            if (!circle) {
              const num = String(toOppNums[i] || '');
              const isGk = num === '1';
              const oppBg = isGk ? GK_C : oc;
              const div = document.createElement('div');
              div.className = 'tb-circle tb-circle-opp';
              div.setAttribute('data-idx', i);
              div.style.cssText = 'left:' + tP[0] + '%;top:' + tP[1] + '%;pointer-events:none;background:' + oppBg + ';border-color:' + darkenHex(oppBg, 50) + ';';
              const span = document.createElement('span');
              span.className = 'tb-num';
              span.style.cssText = 'pointer-events:none;display:flex;align-items:center;justify-content:center;color:' + textColorFor(oppBg) + ';';
              span.textContent = num;
              div.appendChild(span);
              innerEl.appendChild(div);
              oppMap[i] = div;
              continue;
            }

            if (fP && tP) {
              circle.style.left = lerp(fP[0], tP[0], t) + '%';
              circle.style.top = lerp(fP[1], tP[1], t) + '%';
            } else if (!fP && tP) {
              circle.style.left = tP[0] + '%';
              circle.style.top = tP[1] + '%';
            }
          }

          // Balls
          const fromBalls = from.balls || [];
          const toBalls = to.balls || [];
          const maxBalls = Math.max(fromBalls.length, toBalls.length);
          let roBallMap = {};
          innerEl.querySelectorAll('.tb-ball').forEach(b => { roBallMap[Number(b.dataset.idx || b.getAttribute('data-idx') || 0)] = b; });
          for (let bi = 0; bi < maxBalls; bi++) {
            const fB = fromBalls[bi];
            const tB = toBalls[bi];
            let ball = roBallMap[bi];
            if (!tB) { if (ball) { ball.remove(); } continue; }
            if (!ball) {
              ball = document.createElement('div');
              ball.className = 'tb-ball';
              ball.setAttribute('data-idx', bi);
              ball.style.cssText = 'left:' + tB[0] + '%;top:' + tB[1] + '%;pointer-events:none;';
              innerEl.appendChild(ball);
              roBallMap[bi] = ball;
              continue;
            }
            if (fB && tB) {
              ball.style.left = lerp(fB[0], tB[0], t) + '%';
              ball.style.top = lerp(fB[1], tB[1], t) + '%';
            } else if (!fB && tB) {
              ball.style.left = tB[0] + '%';
              ball.style.top = tB[1] + '%';
            }
          }
          // Arrows — snap to target frame at t=0
          const tArr = to.arrows || [];
          let svg = innerEl.querySelector('.tb-arrows-svg');
          if (!svg && tArr.length) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'tb-arrows-svg');
            svg.setAttribute('viewBox', '0 0 100 100');
            svg.setAttribute('preserveAspectRatio', 'none');
            innerEl.appendChild(svg);
          }
          if (svg) {
            const curArrows = svg.querySelectorAll('.tb-arrow');
            const arrKey = tArr.map(a => a.join(',')).join('|');
            const curArrKey = Array.from(curArrows).map(a => [a.getAttribute('x1'),a.getAttribute('y1'),a.getAttribute('x2'),a.getAttribute('y2')].join(',')).join('|');
            if (arrKey !== curArrKey) {
              curArrows.forEach(a => a.remove());
              svg.querySelectorAll('.tb-arrowhead').forEach(p => p.remove());
              tArr.forEach(a => {
                const ac = a[4] || '#ffffff';
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('class', 'tb-arrow');
                line.setAttribute('x1', a[0] + '%'); line.setAttribute('y1', a[1] + '%');
                line.setAttribute('x2', a[2] + '%'); line.setAttribute('y2', a[3] + '%');
                line.dataset.color = ac;
                line.style.cssText = 'pointer-events:none;stroke:' + ac + ';vector-effect:non-scaling-stroke;';
                if (a[5]) line.setAttribute('stroke-dasharray', '6 4');
                svg.appendChild(line);
              });
              refreshArrowheads(svg);
            }
            // Rects — snap to target frame at t=0
            const tR = to.rects || [];
            const curRects = svg.querySelectorAll('.tb-rect');
            const recKey = tR.map(r => r.join(',')).join('|');
            const curRecKey = Array.from(curRects).map(r => [r.getAttribute('x'),r.getAttribute('y'),r.getAttribute('width'),r.getAttribute('height')].join(',')).join('|');
            if (recKey !== curRecKey) {
              curRects.forEach(r => r.remove());
              tR.forEach(r => {
                const col = r[4] || '#ffffff';
                const op = r[5] != null ? r[5] : 0.3;
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('class', 'tb-rect');
                rect.setAttribute('x', r[0] + '%'); rect.setAttribute('y', r[1] + '%');
                rect.setAttribute('width', r[2] + '%'); rect.setAttribute('height', r[3] + '%');
                rect.setAttribute('fill', col); rect.setAttribute('fill-opacity', op);
                rect.setAttribute('stroke', col);
                rect.style.cssText = 'pointer-events:none;vector-effect:non-scaling-stroke;';
                svg.appendChild(rect);
              });
            }
          }
          // Text labels — snap content to target at t=0, interpolate position
          const tT = to.texts || [];
          const fT = from.texts || [];
          const maxT = Math.max(fT.length, tT.length);
          let textEls = Array.from(innerEl.querySelectorAll('.tb-text-label'));
          for (let i = textEls.length - 1; i >= tT.length; i--) textEls[i].remove();
          for (let i = 0; i < tT.length; i++) {
            const ft = fT[i] || tT[i], tt = tT[i];
            let lbl = innerEl.querySelectorAll('.tb-text-label')[i];
            if (!lbl) {
              lbl = document.createElement('div');
              lbl.className = 'tb-text-label';
              lbl.style.pointerEvents = 'none';
              innerEl.appendChild(lbl);
            }
            lbl.style.left = lerp(ft[0], tt[0], t) + '%';
            lbl.style.top = lerp(ft[1], tt[1], t) + '%';
            lbl.textContent = tt[2];
            const ic = tt[3]||'#000000';
            const ia = tt[4]!=null?tt[4]:0.8;
            lbl.style.background = hexToRgba(ic, ia);
            lbl.style.color = textColorFor(ic);
          }
          // Pen lines — snap to target frame at t=0
          if (svg) {
            const tPen = to.penLines || [];
            const curPen = svg.querySelectorAll('.tb-pen-line');
            const penKey = tPen.map(p => p[0]).join('|');
            const curKey = Array.from(curPen).map(p => p.getAttribute('points')).join('|');
            if (penKey !== curKey) {
              curPen.forEach(p => p.remove());
              tPen.forEach(p => {
                const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                pl.setAttribute('class', 'tb-pen-line');
                pl.setAttribute('points', p[0]);
                pl.style.cssText = 'pointer-events:none;fill:none;stroke:' + (p[1]||'#ffffff') + ';vector-effect:non-scaling-stroke;';
                if (p[2]) pl.setAttribute('stroke-dasharray', '6 4');
                svg.appendChild(pl);
              });
            }
          }
          // Cones — snap to target frame at t=0
          const tCones = to.cones || [];
          const curCones = innerEl.querySelectorAll('.tb-cone');
          const coneKey = tCones.map(c => c[0] + ',' + c[1]).join('|');
          const curConeKey = Array.from(curCones).map(c => parseFloat(c.style.left) + ',' + parseFloat(c.style.top)).join('|');
          if (coneKey !== curConeKey) {
            curCones.forEach(c => c.remove());
            tCones.forEach(c => {
              const div = document.createElement('div');
              div.className = 'tb-cone';
              div.style.cssText = 'left:' + c[0] + '%;top:' + c[1] + '%;pointer-events:none;';
              innerEl.appendChild(div);
            });
          }
          // Re-scale newly created elements
          scaleRoField(innerEl, innerEl.offsetWidth);
        }

        // Apply frame 0
        applyRoFrame(frames[0]);
        let fIdx = 0;
        function playNext() {
          if (!fieldEl._roPlaying || fIdx >= frames.length - 1) {
            applyRoFrame(frames[0]);
            fieldEl._roPlaying = false;
            btn.classList.remove('playing');
            return;
          }
          const from = frames[fIdx];
          const to = frames[fIdx + 1];
          const dur = to.duration || 1000;
          const startT = performance.now();
          function animate(now) {
            if (!fieldEl._roPlaying) { applyRoFrame(frames[0]); btn.classList.remove('playing'); return; }
            const t = Math.min((now - startT) / dur, 1);
            interpolateRo(from, to, t);
            if (t < 1) {
              requestAnimationFrame(animate);
            } else {
              fIdx++;
              if (fIdx < frames.length - 1) {
                applyRoFrame(frames[fIdx]);
                setTimeout(playNext, 0);
              } else {
                setTimeout(() => {
                  applyRoFrame(frames[0]);
                  fieldEl._roPlaying = false;
                  btn.classList.remove('playing');
                }, 1000);
              }
            }
          }
          requestAnimationFrame(animate);
        }
        setTimeout(playNext, 200);
      });
    });
    // Proportional scaling for RO boards (defer to ensure layout is computed)
    requestAnimationFrame(() => requestAnimationFrame(() => scaleRoBoards()));
  }

  /* Scale circles, ball, cones, text-labels, nums, play-btn, pitch markings
     proportionally based on the actual rendered field width.
     Reference sizes are the editor board at 600px (max-width of RO boards). */
  function scaleRoBoards() {
    document.querySelectorAll('.tb-field-readonly').forEach(field => {
      const inner = field.querySelector('.tb-field-inner');
      if (!inner) return;
      const w = inner.offsetWidth;
      if (!w) return;
      scaleRoField(inner, w);
      // Observe future resizes
      if (!inner._roResObs) {
        inner._roResObs = new ResizeObserver(entries => {
          for (const e of entries) {
            const nw = e.contentRect.width;
            if (nw > 0) scaleRoField(e.target, nw);
          }
        });
        inner._roResObs.observe(inner);
      }
    });
  }
  function scaleRoField(inner, w) {
    // Reference: editor board is 820px wide (814px inner after 3px border) with 24px circles, 16px ball, etc.
    // Scale so RO boards are a proportional miniature of the editor.
    const REF = 814; // editor inner width (820 - 2*3px border)
    const s = w / REF; // scale factor
    const circle = Math.max(10, 24 * s);
    const ballSz = Math.max(8, 16 * s);
    const bdr = Math.max(1, 2 * s);
    const fs = Math.max(6, 13 * s);
    const coneSide = Math.max(3, 7 * s);
    const coneBot = Math.max(6, 14 * s);
    const txtFs = Math.max(5, 14 * s);
    const playS = Math.max(16, 30 * s);
    const playTriTB = Math.max(3, 6 * s);
    const playTriL = Math.max(5, 10 * s);
    const playTriML = Math.max(1, 2 * s);
    const pitchBdr = Math.max(1, 3 * s);
    const spotSz = Math.max(3, 6 * s);
    const ballFs = Math.max(6, 14 * s);

    inner.querySelectorAll('.tb-circle').forEach(c => {
      c.style.width = circle + 'px';
      c.style.height = circle + 'px';
      c.style.borderWidth = bdr + 'px';
    });
    inner.querySelectorAll('.tb-num').forEach(n => {
      n.style.fontSize = fs + 'px';
    });
    inner.querySelectorAll('.tb-ball').forEach(b => {
      b.style.width = ballSz + 'px';
      b.style.height = ballSz + 'px';
      b.style.setProperty('--ball-fs', ballFs + 'px');
    });
    inner.querySelectorAll('.tb-cone').forEach(cone => {
      cone.style.borderLeftWidth = coneSide + 'px';
      cone.style.borderRightWidth = coneSide + 'px';
      cone.style.borderBottomWidth = coneBot + 'px';
    });
    inner.querySelectorAll('.tb-text-label').forEach(t => {
      t.style.fontSize = txtFs + 'px';
    });
    const play = inner.querySelector('.tb-ro-play');
    if (play) {
      play.style.width = playS + 'px';
      play.style.height = playS + 'px';
      play.style.setProperty('--play-tri-tb', playTriTB + 'px');
      play.style.setProperty('--play-tri-l', playTriL + 'px');
      play.style.setProperty('--play-tri-ml', playTriML + 'px');
    }
    // Pitch markings — set individual sides to preserve 'none' sides from CSS
    const pw = pitchBdr + 'px';
    inner.querySelectorAll('.tb-halfway').forEach(e => { e.style.borderLeftWidth = pw; });
    inner.querySelectorAll('.tb-center-circle').forEach(e => { e.style.borderWidth = pw; });
    inner.querySelectorAll('.tb-penalty-left').forEach(e => { e.style.borderTopWidth = pw; e.style.borderRightWidth = pw; e.style.borderBottomWidth = pw; });
    inner.querySelectorAll('.tb-penalty-right').forEach(e => { e.style.borderTopWidth = pw; e.style.borderLeftWidth = pw; e.style.borderBottomWidth = pw; });
    inner.querySelectorAll('.tb-goal-left').forEach(e => { e.style.borderTopWidth = pw; e.style.borderRightWidth = pw; e.style.borderBottomWidth = pw; });
    inner.querySelectorAll('.tb-goal-right').forEach(e => { e.style.borderTopWidth = pw; e.style.borderLeftWidth = pw; e.style.borderBottomWidth = pw; });
    inner.querySelectorAll('.tb-penalty-arc-left, .tb-penalty-arc-right').forEach(e => { e.style.borderWidth = pw; });
    inner.querySelectorAll('.tb-center-spot, .tb-penalty-spot-left, .tb-penalty-spot-right').forEach(s => {
      s.style.width = spotSz + 'px'; s.style.height = spotSz + 'px';
    });
    // SVG stroke scaling — use non-scaling-stroke with pixel values scaled to board
    const svgStroke = Math.max(1.5, 2.5 * s);
    const svgStrokeThin = Math.max(1, 1.5 * s);
    inner.querySelectorAll('.tb-arrow').forEach(a => { a.style.strokeWidth = svgStroke + 'px'; a.style.vectorEffect = 'non-scaling-stroke'; });
    inner.querySelectorAll('.tb-rect').forEach(r => { r.style.strokeWidth = svgStrokeThin + 'px'; r.style.vectorEffect = 'non-scaling-stroke'; });
    inner.querySelectorAll('.tb-pen-line').forEach(p => { p.style.setProperty('stroke-width', svgStroke + 'px', 'important'); p.style.setProperty('vector-effect', 'non-scaling-stroke', 'important'); });
    // Recompute arrowheads with correct board dimensions
    const svg = inner.querySelector('.tb-arrows-svg');
    if (svg) refreshArrowheads(svg);
  }

  function renderMatchDetail() {
    const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const m = matches.find(x => x.id === detailMatchId);
    if (!m) return '<div class="empty-state"><div class="empty-icon">⚽</div><p>Match not found</p></div>';
    const session = getSession();
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const sentEntry = sentData[m.id];
    const sentPlayers = sentEntry ? (Array.isArray(sentEntry) ? sentEntry : (sentEntry.players || [])) : [];
    const convSent = sentPlayers.length > 0;
    const convIncluded = convSent && sentPlayers.some(id => String(id) === String(session.id));
    const sentJersey = sentEntry && !Array.isArray(sentEntry) ? sentEntry.jersey : null;
    const sentSocks = sentEntry && !Array.isArray(sentEntry) ? sentEntry.socks : null;
    let convHtml = '';
    if (convSent) {
      const uniformIcons = (sentJersey || sentSocks) ? `<span class="detail-uniform-inline">${jerseySvg(sentJersey || 'white')}${sockSvg(sentSocks || 'striped')}</span>` : '';
      convHtml = convIncluded
        ? `<div class="detail-conv detail-conv-yes"><span class="conv-blink-dot"></span> Convocatòria disponible ${uniformIcons}</div>`
        : '<div class="detail-conv detail-conv-no"><span class="conv-grey-dot"></span> No convocat</div>';
    }
    const dateFormatted = m.date ? new Date(m.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const locationHtml = m.mapLink
      ? `<a href="${sanitize(m.mapLink)}" target="_blank" rel="noopener" class="detail-map-link">📍 ${sanitize(m.location || '—')}</a>`
      : `📍 ${sanitize(m.location || '—')}`;

    // Build called-up player list
    let calledHtml = '';
    if (convSent) {
      const users = getUsers();
      const calledPlayers = sentPlayers.map(id => users.find(u => String(u.id) === String(id))).filter(Boolean)
        .sort((a, b) => posRankGlobal(a) - posRankGlobal(b));
      if (calledPlayers.length) {
        const rows = calledPlayers.map(p =>
          `<div class="detail-player"><span class="conv-pos-circles">${posCirclesHtmlGlobal(p)}</span><span class="detail-player-name">${sanitize(p.name)}</span><span class="detail-player-num">#${sanitize(p.playerNumber || '—')}</span></div>`
        ).join('');
        calledHtml = `<div class="detail-callup-panel"><div class="detail-callup-header">Called Up <span class="conv-count">${calledPlayers.length}</span></div>${rows}</div>`;
      }
    }

    const convCallupData = JSON.parse(localStorage.getItem('fa_convocatoria_callup') || '{}');
    const callupTime = convCallupData[m.id] || m.callupTime || '—';

    const backPage = detailMatchFrom || 'player-matchday';

    // Past match: score & goals (staff context only)
    const isStaff = detailMatchFrom === 'staff-matchday' && (session.roles || []).includes('staff');
    const isPast = m.date && m.time && new Date(m.date + 'T' + m.time + ':00') <= new Date();
    let scoreHtml = '';
    let goalsHtml = '';
    if (isPast) {
      const scoreParts = (m.score || '').split('-').map(s => s.trim());
      const homeScore = scoreParts[0] || '';
      const awayScore = scoreParts[1] || '';
      if (isStaff) {
        scoreHtml = `<div class="card">
          <div class="card-title">Resultat</div>
          <div class="match-score-edit">
            <span class="match-score-team">${sanitize(m.home)}</span>
            <input type="text" inputmode="numeric" class="reg-input match-score-input" id="score-home" value="${sanitize(homeScore)}" maxlength="2" style="width:45px;text-align:center;">
            <span style="font-weight:700;font-size:1.1rem;"> – </span>
            <input type="text" inputmode="numeric" class="reg-input match-score-input" id="score-away" value="${sanitize(awayScore)}" maxlength="2" style="width:45px;text-align:center;">
            <span class="match-score-team">${sanitize(m.away)}</span>
            <button class="btn btn-primary btn-small" id="btn-save-score" style="margin-left:.8rem;">Desar</button>
          </div>
        </div>`;

        // Goal scorers
        const goalsData = JSON.parse(localStorage.getItem('fa_match_goals') || '{}');
        const matchGoals = goalsData[m.id] || [];
        const users = getUsers();
        const calledIds = convSent ? sentPlayers : [];
        const calledUsers = calledIds.map(id => users.find(u => u.id === id)).filter(Boolean)
          .sort((a, b) => posRankGlobal(a) - posRankGlobal(b));
        const opts = calledUsers.map(p => `<option value="${p.id}">${sanitize(p.name)} #${sanitize(p.playerNumber || '—')}</option>`).join('');
        const goalRows = matchGoals.map((g, i) => {
          const player = g.playerId === 'og' ? 'Gol en pròpia' : (() => { const p = users.find(u => String(u.id) === String(g.playerId)); return p ? sanitize(p.name) : 'Desconegut'; })();
          return `<div class="goal-row"><span class="goal-player">⚽ ${player}${g.minute ? " (" + sanitize(String(g.minute)) + "')" : ''}</span><button class="btn btn-outline btn-small goal-remove" data-goal-idx="${i}" style="padding:.15rem .4rem;font-size:.7rem;">✕</button></div>`;
        }).join('');
        goalsHtml = `<div class="card">
          <div class="card-title">Gols</div>
          <div id="goals-list">${goalRows || '<p style="color:var(--text-secondary)">Cap gol afegit.</p>'}</div>
          <div class="goal-add-form" style="margin-top:.75rem;">
            <select class="reg-input" id="goal-player-select" style="width:auto;">
              <option value="">Selecciona jugador…</option>
              ${opts}
              <option value="og">Gol en pròpia</option>
            </select>
            <input type="text" inputmode="numeric" class="reg-input" id="goal-minute" placeholder="Min" maxlength="3" style="width:55px;text-align:center;">
            <button class="btn btn-primary btn-small" id="btn-add-goal">Afegir</button>
          </div>
        </div>`;
      } else {
        // Players see read-only score
        if (m.score) {
          scoreHtml = `<div class="card">
            <div class="card-title">Resultat</div>
            <div class="match-score-display">${sanitize(m.home)} <strong>${sanitize(m.score)}</strong> ${sanitize(m.away)}</div>
          </div>`;
        }
        const goalsData = JSON.parse(localStorage.getItem('fa_match_goals') || '{}');
        const matchGoals = goalsData[m.id] || [];
        if (matchGoals.length) {
          const usrs = getUsers();
          const goalRows = matchGoals.map(g => {
            const player = g.playerId === 'og' ? 'Gol en pròpia' : (() => { const p = usrs.find(u => String(u.id) === String(g.playerId)); return p ? sanitize(p.name) : 'Desconegut'; })();
            return `<div class="goal-row"><span class="goal-player">⚽ ${player}${g.minute ? " (" + sanitize(String(g.minute)) + "')" : ''}</span></div>`;
          }).join('');
          goalsHtml = `<div class="card">
            <div class="card-title">Gols</div>
            ${goalRows}
          </div>`;
        }
      }
    }

    return `
      <button class="btn btn-outline btn-small detail-back" data-back="${backPage}">← Back</button>
      <div class="detail-hero detail-hero-match">
        <div class="detail-hero-badge"><span class="badge badge-yellow" style="font-size:.9rem;padding:.3rem .8rem;">Match</span></div>
        <h2 class="detail-title">${matchLabel(m)}</h2>
        <div class="detail-subtitle">${dateFormatted}</div>
        <div class="detail-meta">
          ${convSent ? `<span>🕐 Call-up ${callupTime}</span>` : ''}
          <span><img src="img/whistle.png" class="kickoff-icon" alt=""> Kick-off ${m.time || '—'}</span>
          <span>${locationHtml}</span>
        </div>
        ${convHtml}
      </div>
      ${scoreHtml}
      ${goalsHtml}
      ${(() => {
        if (!convSent) return calledHtml;
        const matchBoards = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
        const boards = matchBoards[m.id] || [];
        // Group boards by tag
        const tagOrder = ['Presión', 'Salida', 'Estrategia'];
        const grouped = {};
        boards.forEach(b => {
          const t = b.tag || '';
          if (!grouped[t]) grouped[t] = [];
          grouped[t].push(b);
        });
        // Build ordered tag keys: specified order first, then remaining
        const orderedTags = [];
        tagOrder.forEach(t => { if (grouped[t]) orderedTags.push(t); });
        Object.keys(grouped).forEach(t => { if (!orderedTags.includes(t)) orderedTags.push(t); });

        // Video links + per-video comments section
        const sentVids = sentEntry && sentEntry.videos ? sentEntry.videos : [];
        let videosGroupHtml = '';
        if (sentVids.length) {
          const vidItems = sentVids.map(v => {
            const commentHtml = v.comment ? '<div class="detail-comments">' + sanitize(v.comment).replace(/\n/g, '<br>') + '</div>' : '';
            return '<div class="detail-video-item"><a href="#" class="detail-video-link" data-video-url="' + sanitize(v.url) + '">' + sanitize(v.title || 'Video') + '</a>' + commentHtml + '</div>';
          }).join('');
          videosGroupHtml = '<div class="detail-board-group"><div class="detail-board-group-title">🎬 Videos</div>' + vidItems + '</div>';
        }

        let boardsHtml = '';
        if (boards.length || sentVids.length) {
          boardsHtml = '<div class="detail-boards-panel">' + videosGroupHtml +
            orderedTags.map(tag => {
              const tagTitle = tag || 'General';
              return '<div class="detail-board-group"><div class="detail-board-group-title">' + sanitize(tagTitle) + '</div>' +
                grouped[tag].map(b => renderReadOnlyBoard(b, 'ro1-')).join('') + '</div>';
            }).join('') + '</div>';
        }

        if (!calledHtml && !boardsHtml) return '';
        return '<div class="detail-match-layout">' + calledHtml + boardsHtml + '</div>';
      })()}`;
  }

  function renderTrainingDetail() {
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const t = training.find(x => x.date === detailTrainingDate);
    if (!t) return '<div class="empty-state"><div class="empty-icon">🏋️</div><p>Training not found</p></div>';
    const dateFormatted = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const assistHtml = t.assistance != null ? buildAssistanceCircle(t.assistance) : '';
    return `
      <button class="btn btn-outline btn-small detail-back" data-back="player-home">← Back</button>
      <div class="detail-hero detail-hero-training">
        <div class="detail-hero-badge"><span class="badge badge-green" style="font-size:.9rem;padding:.3rem .8rem;">Training</span></div>
        <h2 class="detail-title">${sanitize(t.focus)}</h2>
        <div class="detail-subtitle">${dateFormatted}</div>
      </div>
      <div class="detail-grid">
        <div class="detail-card"><div class="detail-card-label">Time</div><div class="detail-card-value">${sanitize(t.time || '—')}</div></div>
        <div class="detail-card"><div class="detail-card-label">Day</div><div class="detail-card-value">${sanitize(t.day || '—')}</div></div>
        <div class="detail-card"><div class="detail-card-label">Location</div><div class="detail-card-value">${sanitize(t.location || '—')}</div></div>
        <div class="detail-card"><div class="detail-card-label">Attendance</div><div class="detail-card-value">${assistHtml || '—'}</div></div>
      </div>
      ${(() => {
        const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
        const boards = trainingBoards[t.date] || [];
        if (!boards.length) return '';
        const tagOrder = ['Presión', 'Salida', 'Estrategia'];
        const grouped = {};
        boards.forEach(b => { const tg = b.tag || ''; if (!grouped[tg]) grouped[tg] = []; grouped[tg].push(b); });
        const orderedTags = [];
        tagOrder.forEach(tg => { if (grouped[tg]) orderedTags.push(tg); });
        Object.keys(grouped).forEach(tg => { if (!orderedTags.includes(tg)) orderedTags.push(tg); });
        return '<div class="card"><div class="card-title">Tactical Boards</div><div class="detail-boards-panel">' +
          orderedTags.map(tag => {
            const tagTitle = tag || 'General';
            return '<div class="detail-board-group"><div class="detail-board-group-title">' + sanitize(tagTitle) + '</div>' +
              grouped[tag].map(b => {
                const boardHtml = renderReadOnlyBoard(b, 'ro-ptd-');
                let teamsBlock = '';
                if (b.linkedTeams && b.linkedTeams.length) {
                  teamsBlock = '<div class="tb-linked-teams">' +
                    b.linkedTeams.map((tm, ti) => {
                      const rows = tm.players.map(p => {
                        const posArr = (p.position || '').split(',').map(s => s.trim()).filter(Boolean);
                        const posHtml = posArr.length ? posArr.map(pos => '<span class="pos-circle pos-' + pos + '">' + pos + '</span>').join('') : '';
                        const teamC = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
                        return '<div class="tb-lt-player">' + posHtml + ' <span>' + sanitize(p.name) + '</span>' + teamC + '</div>';
                      }).join('');
                      return '<div class="tb-lt-team"><div class="tb-lt-team-title">Equip ' + (ti + 1) + ' <span class="tg-team-count">' + tm.players.length + '</span></div>' + rows + '</div>';
                    }).join('') + '</div>';
                }
                return boardHtml + teamsBlock;
              }).join('') + '</div>';
          }).join('') + '</div></div>';
      })()}`;
  }

  // getSeasonWeek → utils.js

  // #endregion Tactical Board Rendering

  // #region Readiness Engine & Charts
  // ===== Readiness Score Engine =====
  let _readinessDataCache = null, _readinessDataFrame = -1;
  function getReadinessData() {
    const f = window._renderFrame || 0;
    if (_readinessDataCache && _readinessDataFrame === f) return _readinessDataCache;
    _readinessDataCache = {
      rpeData: JSON.parse(localStorage.getItem('fa_player_rpe') || '{}'),
      trainingList: JSON.parse(localStorage.getItem('fa_training') || '[]'),
      matchesList: JSON.parse(localStorage.getItem('fa_matches') || '[]'),
      availData: JSON.parse(localStorage.getItem('fa_training_availability') || '{}'),
      staffOverrides: JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}'),
      matchAvailData: JSON.parse(localStorage.getItem('fa_match_availability') || '{}')
    };
    _readinessDataFrame = f;
    return _readinessDataCache;
  }

  function computeReadiness(playerId) {
    const { rpeData, trainingList, matchesList, availData, staffOverrides, matchAvailData } = getReadinessData();
    const uid = playerId;
    const now = new Date();
    const todayStr = localDateStr(now);
    const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const seasonStart = seasonYear + '-08-15';

    // Build sessions
    const sessions = [];
    trainingList.forEach(t => {
      if (!t.date || t.date < seasonStart || t.date > todayStr) return;
      const rpeKey = uid + '_training_' + t.date;
      const availKey = uid + '_' + t.date;
      const avail = staffOverrides[availKey] || availData[availKey] || '';
      const excluded = avail === 'no' || avail === 'injured';
      const entry = excluded ? null : rpeData[rpeKey];
      sessions.push({ date: t.date, type: 'training', rpe: entry ? entry.rpe : null, minutes: entry ? entry.minutes : null });
    });
    matchesList.forEach(m => {
      if (!m.date || m.date < seasonStart || m.date > todayStr) return;
      const rpeKey = uid + '_match_' + m.id;
      const entry = rpeData[rpeKey];
      sessions.push({ date: m.date, type: 'match', rpe: entry ? entry.rpe : null, minutes: entry ? entry.minutes : null, matchId: m.id });
    });
    Object.keys(rpeData).forEach(key => {
      if (!key.startsWith(uid + '_extra_')) return;
      const entry = rpeData[key];
      if (!entry || !entry.date || entry.date < seasonStart || entry.date > todayStr) return;
      sessions.push({ date: entry.date, type: 'extra', rpe: entry.rpe, minutes: entry.minutes });
    });
    sessions.sort((a, b) => a.date.localeCompare(b.date));

    // --- 1. ACWR (Load Ratio Score) ---
    const weekUA = {};
    sessions.forEach(s => {
      if (s.rpe == null || s.minutes == null) return;
      const wk = getSeasonWeek(s.date);
      if (!weekUA[wk]) weekUA[wk] = 0;
      weekUA[wk] += s.rpe * s.minutes;
    });
    const weekNums = Object.keys(weekUA).map(Number).sort((a, b) => a - b);
    const allWeeks = [];
    if (weekNums.length) { for (let w = weekNums[0]; w <= weekNums[weekNums.length - 1]; w++) allWeeks.push(w); }
    let acwr = 0;
    let prevWeekUA = 0;
    let curWeekUA = 0;
    if (allWeeks.length >= 2) {
      const lastIdx = allWeeks.length - 1;
      const acute = weekUA[allWeeks[lastIdx]] || 0;
      let sum4 = 0, cnt4 = 0;
      for (let j = lastIdx; j >= Math.max(0, lastIdx - 3); j--) {
        sum4 += weekUA[allWeeks[j]] || 0;
        cnt4++;
      }
      const chronic = cnt4 ? sum4 / cnt4 : 0;
      acwr = chronic > 0 ? +(acute / chronic).toFixed(2) : 0;
      curWeekUA = acute;
      prevWeekUA = weekUA[allWeeks[lastIdx - 1]] || 0;
    }

    let loadRatioScore;
    if (acwr < 0.8) loadRatioScore = 60;
    else if (acwr <= 1.3) loadRatioScore = 100;
    else if (acwr <= 1.5) loadRatioScore = 70;
    else loadRatioScore = 30;

    // --- 2. Match Fatigue Score ---
    const matchSessions = sessions.filter(s => s.type === 'match' && s.minutes != null && s.minutes > 0);
    const lastMatch = matchSessions.length ? matchSessions[matchSessions.length - 1] : null;
    let matchFatigueScore = 100;
    if (lastMatch) {
      const mins = lastMatch.minutes;
      if (mins > 80) matchFatigueScore = 40;
      else if (mins >= 60) matchFatigueScore = 60;
      else if (mins >= 30) matchFatigueScore = 80;
      else matchFatigueScore = 100;

      const matchDate = new Date(lastMatch.date + 'T12:00:00');
      const daysSince = Math.round((now - matchDate) / 86400000);
      if (daysSince < 3) matchFatigueScore -= 10;

      // 2 matches in last 5 days
      const fiveDaysAgo = localDateStr(new Date(now.getTime() - 5 * 86400000));
      const recentMatches = matchSessions.filter(s => s.date >= fiveDaysAgo);
      if (recentMatches.length >= 2) matchFatigueScore -= 15;

      matchFatigueScore = Math.max(0, matchFatigueScore);
    }

    // --- 3. Recent Load Spike ---
    let loadSpikeScore = 100;
    if (prevWeekUA > 0) {
      const pctChange = ((curWeekUA - prevWeekUA) / prevWeekUA) * 100;
      if (pctChange > 30) loadSpikeScore = 30;
      else if (pctChange > 10) loadSpikeScore = 60;
      else if (pctChange >= -10) loadSpikeScore = 100;
      else loadSpikeScore = 80;
    }

    // --- 4. RPE Trend (last 28 days) ---
    const d28ago = localDateStr(new Date(now.getTime() - 28 * 86400000));
    const recentRPE = sessions.filter(s => s.date >= d28ago && s.rpe != null);
    let rpeTrendScore = 80;
    if (recentRPE.length >= 4) {
      const half = Math.floor(recentRPE.length / 2);
      const firstHalfAvg = recentRPE.slice(0, half).reduce((s, e) => s + e.rpe, 0) / half;
      const secondHalfAvg = recentRPE.slice(half).reduce((s, e) => s + e.rpe, 0) / (recentRPE.length - half);
      const diff = secondHalfAvg - firstHalfAvg;
      if (diff > 1.5) rpeTrendScore = 40;        // sharp increase
      else if (diff > 0.5) rpeTrendScore = 60;    // mild increase
      else if (diff >= -0.5) rpeTrendScore = 80;   // stable
      else rpeTrendScore = 100;                     // decreasing
    }

    // --- Final weighted score ---
    const score = Math.round(
      0.4 * loadRatioScore +
      0.25 * matchFatigueScore +
      0.2 * loadSpikeScore +
      0.15 * rpeTrendScore
    );

    // --- Color classification ---
    let color = 'green';
    let riskFlags = 0;
    if (acwr > 1.5) riskFlags++;
    if (loadSpikeScore <= 30) riskFlags++;
    if (rpeTrendScore <= 40) riskFlags++;
    if (matchFatigueScore <= 25) riskFlags++;

    if (score >= 75 && acwr >= 0.8 && acwr <= 1.3 && riskFlags === 0) {
      color = 'green';
    } else if (score < 55 || acwr > 1.5 || riskFlags >= 2) {
      color = 'red';
    } else {
      color = 'orange';
    }

    // --- Force overrides ---
    const fourDaysAgo = localDateStr(new Date(now.getTime() - 4 * 86400000));
    const recentHeavyMatches = matchSessions.filter(s => s.date >= fourDaysAgo && s.minutes >= 70);
    const last2Sessions = recentRPE.slice(-2);
    const last2HighRPE = last2Sessions.length === 2 && last2Sessions.every(s => s.rpe >= 9);

    if (acwr > 1.7 || (recentHeavyMatches.length >= 2) || last2HighRPE) {
      color = 'red';
    }

    const fiveDaysAgo = localDateStr(new Date(now.getTime() - 5 * 86400000));
    const noRecentMatch = !matchSessions.some(s => s.date >= fiveDaysAgo);
    if (noRecentMatch && acwr >= 0.9 && acwr <= 1.1 && rpeTrendScore >= 80) {
      color = 'green';
    }

    // Check if there's enough real data (need at least 2 weeks with RPE entries)
    var sessionsWithRPE = sessions.filter(function(s) { return s.rpe != null && s.minutes != null; });
    var hasData = allWeeks.length >= 2 && sessionsWithRPE.length >= 3;

    return { score, color, acwr, loadRatioScore, matchFatigueScore, loadSpikeScore, rpeTrendScore, hasData: hasData };
  }

  // crSplinePath → utils.js

  function buildChartsHtml(sessions, opts) {
    opts = opts || {};
    // --- RPE per Session chart ---
    let chartHtml = '';
    const yAxisW = window.innerWidth < 600 ? 30 : 46;
    const sessionsByDate = {};
    sessions.forEach(s => {
      if (!sessionsByDate[s.date]) sessionsByDate[s.date] = [];
      sessionsByDate[s.date].push(s);
    });
    const uniqueDates = Object.keys(sessionsByDate).sort();
    const yMax = 10;
    const count = uniqueDates.length;
    const isMobile = window.innerWidth < 600;
    const chartW = Math.max(count * (isMobile ? 28 : 40), isMobile ? 200 : 400);

    if (count) {
      const chartH = 200;
      const padL = isMobile ? 4 : 8, padR = isMobile ? 14 : 12, padT = 16, padB = 4;
      const plotW = chartW - padL - padR;
      const plotH = chartH - padT - padB;

      function sx(i) { return padL + (count === 1 ? plotW / 2 : (i / (count - 1)) * plotW); }
      function sy(rpe) { return padT + plotH - (rpe / yMax) * plotH; }

      let yAxisSvg = '';
      for (let v = 0; v <= 10; v += 2) {
        const y = sy(v);
        yAxisSvg += '<text x="' + (yAxisW - 4) + '" y="' + (y + 4) + '" text-anchor="end" class="rpe-y-text">' + v + '</text>';
      }

      let colsSvg = '';
      const colW = count === 1 ? plotW : plotW / (count - 1);
      const halfCol = colW / 2;
      // Merge consecutive columns of the same type into single rects to avoid gaps
      let runType = null, runStart = -1;
      function flushRun(endIdx) {
        if (runType === null) return;
        const x1 = runStart === 0 ? sx(0) : sx(runStart) - halfCol;
        const x2 = endIdx === count - 1 ? sx(count - 1) : sx(endIdx) + halfCol;
        const cls = runType === 'injured' ? 'rpe-col-injured' : 'rpe-col-skipped';
        colsSvg += '<rect x="' + x1 + '" y="' + padT + '" width="' + (x2 - x1) + '" height="' + plotH + '" class="' + cls + '"/>';
        runType = null;
      }
      uniqueDates.forEach((date, i) => {
        const group = sessionsByDate[date];
        const anyInjured = group.some(s => s.injured);
        const anySkipped = group.some(s => s.skipped);
        const t = anyInjured ? 'injured' : anySkipped ? 'skipped' : null;
        if (t !== runType) { flushRun(i - 1); runType = t; runStart = i; }
      });
      flushRun(count - 1);

      // Build line segments, breaking at skipped/injured dates
      const lineSegments = [];
      let currentSeg = [];
      uniqueDates.forEach((date, i) => {
        const group = sessionsByDate[date];
        const anyInjured = group.some(s => s.injured);
        const anySkipped = group.some(s => s.skipped);
        if (anyInjured || anySkipped) {
          if (currentSeg.length) { lineSegments.push(currentSeg); currentSeg = []; }
          return;
        }
        const withRpe = group.filter(s => s.rpe != null);
        if (withRpe.length) {
          const totalMin = withRpe.reduce((s, x) => s + (x.minutes || 1), 0);
          const avgRpe = withRpe.reduce((s, x) => s + x.rpe * (x.minutes || 1), 0) / totalMin;
          currentSeg.push({ x: sx(i), y: sy(avgRpe) });
        }
      });
      if (currentSeg.length) lineSegments.push(currentSeg);

      let lineSvg = '';
      lineSegments.forEach(seg => {
        if (seg.length < 2) return;
        lineSvg += '<path d="' + crSplinePath(seg) + '" class="rpe-line"/>';
      });

      let dotsSvg = '';
      uniqueDates.forEach((date, i) => {
        const group = sessionsByDate[date];
        const withRpe = group.filter(s => s.rpe != null);
        if (!withRpe.length) return;
        const totalMin = withRpe.reduce((s, x) => s + (x.minutes || 1), 0);
        const avgRpe = withRpe.reduce((s, x) => s + x.rpe * (x.minutes || 1), 0) / totalMin;
        const cx = sx(i), cy = sy(avgRpe);
        var cls;
        if (opts.teamView) {
          cls = withRpe.some(s => s.type === 'match') ? 'rpe-dot-match' : 'rpe-dot-training';
        } else {
          const isMulti = withRpe.length > 1;
          cls = isMulti ? 'rpe-dot-multi' : (withRpe[0].type === 'match' ? 'rpe-dot-match' : 'rpe-dot-training');
        }
        const tipLines = withRpe.map(s => sanitize(s.label) + ' — RPE ' + s.rpe + ' · ' + (s.minutes || '?') + ' min').join('<br>');
        dotsSvg += '<circle cx="' + cx + '" cy="' + cy + '" r="5" class="rpe-dot ' + cls + '" data-ua-tip="' + tipLines.replace(/"/g, '&quot;') + '"/>';
      });

      let xLabelsSvg = '';
      uniqueDates.forEach((date, i) => {
        const x = sx(i);
        const dt = new Date(date + 'T12:00:00');
        const dayName = DAYS_CA[dt.getDay()];
        const yLabel = chartH + 12;
        xLabelsSvg += '<text x="' + x + '" y="' + yLabel + '" text-anchor="middle" class="rpe-x-text">' + dayName + '</text>';
      });

      const weekGroups = [];
      let curWk = null, wkStart = 0, wkCount = 0;
      const weekColors = ['#9fa8da','#80cbc4','#ef9a9a','#ce93d8','#90caf9','#ffab91','#a5d6a7','#f48fb1'];
      uniqueDates.forEach((date, i) => {
        const wk = getSeasonWeek(date);
        if (wk === curWk) { wkCount++; }
        else {
          if (curWk !== null) weekGroups.push({ wk: curWk, start: wkStart, count: wkCount });
          curWk = wk; wkStart = i; wkCount = 1;
        }
      });
      if (curWk !== null) weekGroups.push({ wk: curWk, start: wkStart, count: wkCount });

      let weekBadgesSvg = '';
      weekGroups.forEach((g, gi) => {
        const x1 = sx(g.start);
        const x2 = sx(g.start + g.count - 1);
        const cx = (x1 + x2) / 2;
        const yBadge = chartH + 22;
        const bg = weekColors[gi % weekColors.length];
        const bw = Math.max(x2 - x1 + 20, 24);
        weekBadgesSvg += '<rect x="' + (cx - bw/2) + '" y="' + yBadge + '" width="' + bw + '" height="16" rx="4" fill="' + bg + '"/>';
        weekBadgesSvg += '<text x="' + cx + '" y="' + (yBadge + 12) + '" text-anchor="middle" class="rpe-week-text">W' + g.wk + '</text>';
      });

      const svgH = chartH + 42;
      var legendItems = '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#81c784"></span>Training</span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#f57f17"></span>Match</span>';
      if (!opts.teamView) {
        legendItems += '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#64b5f6"></span>Multiple</span>'
          + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#90a4ae"></span>Skipped</span>'
          + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#e53935"></span>Injured</span>';
      }
      chartHtml = '<div class="card">'
        + '<div class="card-title">RPE per Session</div>'
        + '<div class="rpe-legend">' + legendItems + '</div>'
        + '<div class="rpe-chart-wrap">'
        + '<svg class="rpe-y-axis-svg" width="' + yAxisW + '" height="' + svgH + '" viewBox="0 0 ' + yAxisW + ' ' + svgH + '">' + yAxisSvg + '</svg>'
        + '<div class="rpe-chart-scroll">'
        + '<svg class="rpe-chart-svg" width="' + chartW + '" height="' + svgH + '" viewBox="0 0 ' + chartW + ' ' + svgH + '">'
        + colsSvg + lineSvg + dotsSvg + xLabelsSvg + weekBadgesSvg
        + '</svg></div></div></div>';
    } else {
      chartHtml = '<div class="card"><div class="card-title">RPE per Session</div>'
        + '<p style="color:var(--text-secondary);">No sessions recorded yet.</p></div>';
    }

    // --- UA per Week data (shared with ACWR) ---
    const weekUA = {};
    const allWeeks = [];
    sessions.forEach(s => {
      if (s.rpe == null || s.minutes == null) return;
      const wk = getSeasonWeek(s.date);
      if (!weekUA[wk]) weekUA[wk] = { ua: 0, details: [] };
      weekUA[wk].ua += s.rpe * s.minutes;
      weekUA[wk].details.push(s);
    });
    {
      const weekNums = Object.keys(weekUA).map(Number).sort((a, b) => a - b);
      if (weekNums.length) {
        for (let w = weekNums[0]; w <= weekNums[weekNums.length - 1]; w++) allWeeks.push(w);
      }
    }

    // --- UA per Week chart ---
    let uaWeekHtml = '';
    if (allWeeks.length) {
      const wCount = allWeeks.length;
      const uaValues = allWeeks.map(w => weekUA[w] ? weekUA[w].ua : 0);
      const uaMax = Math.max(...uaValues, 100);
      const uaCeil = Math.ceil(uaMax / 200) * 200;

      const wMobile = window.innerWidth < 600;
      const wYAxisW = wMobile ? 30 : 46;
      const wChartW = wMobile ? Math.max(wCount * 48, 200) : Math.max(wCount * 52, 400);
      const wChartH = 200;
      const wPadL = wMobile ? 4 : 8, wPadR = wMobile ? 14 : 12, wPadT = 16, wPadB = 4;
      const wPlotW = wChartW - wPadL - wPadR;
      const wPlotH = wChartH - wPadT - wPadB;

      function wsx(i) { return wPadL + (wCount === 1 ? wPlotW / 2 : (i / (wCount - 1)) * wPlotW); }
      function wsy(v) { return wPadT + wPlotH - (v / uaCeil) * wPlotH; }

      let wYAxisSvg = '';
      const yStep = uaCeil <= 600 ? 100 : uaCeil <= 1500 ? 200 : 500;
      for (let v = 0; v <= uaCeil; v += yStep) {
        const y = wsy(v);
        wYAxisSvg += '<text x="' + (wYAxisW - 4) + '" y="' + (y + 4) + '" text-anchor="end" class="rpe-y-text">' + v + '</text>';
      }

      const wLinePoints = [];
      allWeeks.forEach((w, i) => {
        wLinePoints.push({ x: wsx(i), y: wsy(uaValues[i]) });
      });

      let wLineSvg = '';
      if (wLinePoints.length > 1) {
        wLineSvg = '<path d="' + crSplinePath(wLinePoints) + '" class="rpe-line" style="stroke:#fb8c00"/>';
      }

      let wDotsSvg = '';
      allWeeks.forEach((w, i) => {
        const cx = wsx(i), cy = wsy(uaValues[i]);
        const wData = weekUA[w];
        let tip = 'UA ' + uaValues[i];
        if (wData && wData.details.length) {
          tip = wData.details.map(s => sanitize(s.label) + ' — RPE ' + s.rpe + ' × ' + (s.minutes || '?') + 'min').join('<br>');
          tip += '<br><b>Total UA: ' + uaValues[i] + '</b>';
        }
        const dotCls = uaValues[i] === 0 ? 'rpe-dot' : 'rpe-dot rpe-dot-ua';
        wDotsSvg += '<circle cx="' + cx + '" cy="' + cy + '" r="5" class="' + dotCls + '" data-ua-tip="' + tip.replace(/"/g, '&quot;') + '"/>';
      });

      let wXLabelsSvg = '';
      allWeeks.forEach((w, i) => {
        const x = wsx(i);
        wXLabelsSvg += '<text x="' + x + '" y="' + (wChartH + 14) + '" text-anchor="middle" class="rpe-x-text">W' + w + '</text>';
      });

      const wSvgH = wChartH + 22;
      uaWeekHtml = '<div class="card">'
        + '<div class="card-title">UA per Week</div>'
        + '<div class="rpe-chart-wrap">'
        + '<svg class="rpe-y-axis-svg" width="' + wYAxisW + '" height="' + wSvgH + '" viewBox="0 0 ' + wYAxisW + ' ' + wSvgH + '">' + wYAxisSvg + '</svg>'
        + '<div class="rpe-chart-scroll">'
        + '<svg class="rpe-chart-svg" width="' + wChartW + '" height="' + wSvgH + '" viewBox="0 0 ' + wChartW + ' ' + wSvgH + '">'
        + wLineSvg + wDotsSvg + wXLabelsSvg
        + '</svg></div></div></div>';
    }

    // --- ACWR chart ---
    let acwrHtml = '';
    if (allWeeks.length >= 2) {
      const acuteArr = [];
      const chronicArr = [];
      const ratioArr = [];
      allWeeks.forEach((w, i) => {
        const acute = weekUA[w] ? weekUA[w].ua : 0;
        let sum4 = 0, cnt4 = 0;
        for (let j = i; j >= Math.max(0, i - 3); j--) {
          sum4 += weekUA[allWeeks[j]] ? weekUA[allWeeks[j]].ua : 0;
          cnt4++;
        }
        const chronic = cnt4 ? sum4 / cnt4 : 0;
        acuteArr.push(acute);
        chronicArr.push(chronic);
        ratioArr.push(chronic > 0 ? +(acute / chronic).toFixed(2) : 0);
      });

      const acwrCount = allWeeks.length;
      const acwrMobile = window.innerWidth < 600;
      const acwrYAxisW = acwrMobile ? 30 : 46;
      const acwrRAxisW = acwrMobile ? 28 : 40;
      const acwrChartW = acwrCount <= 1 ? 80 : acwrCount * (acwrMobile ? 42 : 60);
      const acwrChartH = 220;
      const acwrPadL = acwrMobile ? 8 : 24, acwrPadR = acwrMobile ? 14 : 30, acwrPadT = 16, acwrPadB = 4;
      const acwrPlotW = acwrChartW - acwrPadL - acwrPadR;
      const acwrPlotH = acwrChartH - acwrPadT - acwrPadB;

      const uaMaxAcwr = Math.max(...acuteArr, ...chronicArr, 100);
      const uaCeilAcwr = Math.ceil(uaMaxAcwr / 200) * 200;
      const ratioMax = Math.max(...ratioArr, 2);
      const ratioCeil = Math.ceil(ratioMax * 2) / 2;

      function acwrSx(i) { return acwrPadL + (acwrCount === 1 ? acwrPlotW / 2 : (i / (acwrCount - 1)) * acwrPlotW); }
      function acwrSy(v) { return acwrPadT + acwrPlotH - (v / uaCeilAcwr) * acwrPlotH; }
      function ratioSy(v) { return acwrPadT + acwrPlotH - (v / ratioCeil) * acwrPlotH; }

      let acwrYAxisSvg = '';
      const acwrYStep = uaCeilAcwr <= 600 ? 100 : uaCeilAcwr <= 1500 ? 200 : 500;
      for (let v = 0; v <= uaCeilAcwr; v += acwrYStep) {
        acwrYAxisSvg += '<text x="' + (acwrYAxisW - 4) + '" y="' + (acwrSy(v) + 4) + '" text-anchor="end" class="rpe-y-text">' + v + '</text>';
      }

      let acwrRAxisSvg = '';
      for (let v = 0; v <= ratioCeil; v += 1) {
        const y = ratioSy(v);
        acwrRAxisSvg += '<text x="' + (acwrRAxisW - 10) + '" y="' + (y + 4) + '" text-anchor="end" class="rpe-y-text">' + v.toFixed(1) + '</text>';
      }

      const zoneTop = ratioSy(Math.min(1.3, ratioCeil));
      const zoneBot = ratioSy(0.8);
      const zoneH = Math.max(zoneBot - zoneTop, 0);
      const orangeTopTop = ratioSy(Math.min(1.5, ratioCeil));
      const orangeTopBot = ratioSy(Math.min(1.3, ratioCeil));
      const orangeTopH = Math.max(orangeTopBot - orangeTopTop, 0);
      const orangeBotTop = ratioSy(0.8);
      const orangeBotBot = ratioSy(0.7);
      const orangeBotH = Math.max(orangeBotBot - orangeBotTop, 0);
      const redTopTop = ratioSy(ratioCeil);
      const redTopBot = ratioSy(Math.min(1.5, ratioCeil));
      const redTopH = Math.max(redTopBot - redTopTop, 0);
      const redBotTop = ratioSy(0.7);
      const redBotBot = ratioSy(0);
      const redBotH = Math.max(redBotBot - redBotTop, 0);
      const zoneSvg = '<rect x="0" y="' + redTopTop + '" width="' + acwrChartW + '" height="' + redTopH + '" fill="#e53935" opacity=".14"/>'
        + '<rect x="0" y="' + redBotTop + '" width="' + acwrChartW + '" height="' + redBotH + '" fill="#e53935" opacity=".14"/>'
        + '<rect x="0" y="' + zoneTop + '" width="' + acwrChartW + '" height="' + zoneH + '" fill="#81c784" opacity=".22"/>'
        + '<line x1="0" y1="' + zoneTop + '" x2="' + acwrChartW + '" y2="' + zoneTop + '" stroke="#4caf50" stroke-width="1" opacity=".5"/>'
        + '<line x1="0" y1="' + zoneBot + '" x2="' + acwrChartW + '" y2="' + zoneBot + '" stroke="#4caf50" stroke-width="1" opacity=".5"/>'
        + '<rect x="0" y="' + orangeTopTop + '" width="' + acwrChartW + '" height="' + orangeTopH + '" fill="#ff9800" opacity=".15"/>'
        + '<line x1="0" y1="' + orangeTopTop + '" x2="' + acwrChartW + '" y2="' + orangeTopTop + '" stroke="#ff9800" stroke-width="1" opacity=".45"/>'
        + '<rect x="0" y="' + orangeBotTop + '" width="' + acwrChartW + '" height="' + orangeBotH + '" fill="#ff9800" opacity=".15"/>'
        + '<line x1="0" y1="' + orangeBotBot + '" x2="' + acwrChartW + '" y2="' + orangeBotBot + '" stroke="#ff9800" stroke-width="1" opacity=".45"/>';
      const zoneLineR = '<line x1="0" y1="' + zoneTop + '" x2="' + (acwrRAxisW * 0.25) + '" y2="' + zoneTop + '" stroke="#4caf50" stroke-width="1" opacity=".5"/>'
        + '<line x1="0" y1="' + zoneBot + '" x2="' + (acwrRAxisW * 0.25) + '" y2="' + zoneBot + '" stroke="#4caf50" stroke-width="1" opacity=".5"/>'
        + '<line x1="0" y1="' + orangeTopTop + '" x2="' + (acwrRAxisW * 0.25) + '" y2="' + orangeTopTop + '" stroke="#ff9800" stroke-width="1" opacity=".45"/>'
        + '<line x1="0" y1="' + orangeBotBot + '" x2="' + (acwrRAxisW * 0.25) + '" y2="' + orangeBotBot + '" stroke="#ff9800" stroke-width="1" opacity=".45"/>';

      acwrRAxisSvg += '<text x="12" y="' + (zoneTop + 4) + '" text-anchor="start" class="rpe-y-text" style="fill:#4caf50;font-weight:600;font-size:9px">1.3</text>';
      acwrRAxisSvg += '<text x="12" y="' + (zoneBot + 4) + '" text-anchor="start" class="rpe-y-text" style="fill:#4caf50;font-weight:600;font-size:9px">0.8</text>';
      acwrRAxisSvg += '<text x="12" y="' + (orangeTopTop + 4) + '" text-anchor="start" class="rpe-y-text" style="fill:#ff9800;font-weight:600;font-size:9px">1.5</text>';
      acwrRAxisSvg += '<text x="12" y="' + (orangeBotBot + 4) + '" text-anchor="start" class="rpe-y-text" style="fill:#ff9800;font-weight:600;font-size:9px">0.7</text>';

      const barW = Math.max(acwrPlotW / acwrCount * 0.28, 6);
      let colsSvgAcwr = '';
      allWeeks.forEach((w, i) => {
        const x = acwrSx(i);
        const acuteH = (acuteArr[i] / uaCeilAcwr) * acwrPlotH;
        const chronicH = (chronicArr[i] / uaCeilAcwr) * acwrPlotH;
        const acuteY = acwrPadT + acwrPlotH - acuteH;
        const chronicY = acwrPadT + acwrPlotH - chronicH;
        colsSvgAcwr += '<rect x="' + (x - barW - 1) + '" y="' + acuteY + '" width="' + barW + '" height="' + acuteH + '" rx="2" class="acwr-bar-acute" data-ua-tip="Acute: ' + Math.round(acuteArr[i]) + '"/>';
        colsSvgAcwr += '<rect x="' + (x + 1) + '" y="' + chronicY + '" width="' + barW + '" height="' + chronicH + '" rx="2" class="acwr-bar-chronic" data-ua-tip="Chronic: ' + Math.round(chronicArr[i]) + '"/>';
      });

      const ratioPoints = allWeeks.map((w, i) => ({ x: acwrSx(i), y: ratioSy(ratioArr[i]) }));
      let ratioLineSvg = '';
      if (ratioPoints.length > 1) {
        ratioLineSvg = '<path d="' + crSplinePath(ratioPoints) + '" class="rpe-line" style="stroke:#fb8c00"/>';
      }

      let ratioDotsSvg = '';
      allWeeks.forEach((w, i) => {
        const cx = acwrSx(i), cy = ratioSy(ratioArr[i]);
        const tip = 'Acute: ' + Math.round(acuteArr[i]) + ' · Chronic: ' + Math.round(chronicArr[i]) + ' · Ratio: ' + ratioArr[i].toFixed(2);
        ratioDotsSvg += '<circle cx="' + cx + '" cy="' + cy + '" r="5" class="rpe-dot rpe-dot-ua" data-ua-tip="' + sanitize(tip).replace(/"/g, '&quot;') + '"/>';
      });

      let acwrXSvg = '';
      allWeeks.forEach((w, i) => {
        acwrXSvg += '<text x="' + acwrSx(i) + '" y="' + (acwrChartH + 14) + '" text-anchor="middle" class="rpe-x-text">W' + w + '</text>';
      });

      const acwrSvgH = acwrChartH + 22;
      acwrHtml = '<div class="card">'
        + '<div class="card-title">Acute/Chronic Workload Ratio</div>'
        + '<div class="rpe-legend">'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#ef9a9a"></span>Acute</span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#90caf9"></span>Chronic</span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#fb8c00;border-radius:50%"></span>Ratio</span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#c8e6c9"></span>Optimal<span class="legend-range"> (0.8–1.3)</span></span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#ffe0b2"></span>Caution<span class="legend-range"> (0.7–0.8 / 1.3–1.5)</span></span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#ffcdd2"></span>Danger<span class="legend-range"> (&lt;0.7 / &gt;1.5)</span></span>'
        + '</div>'
        + '<div class="rpe-chart-wrap">'
        + '<svg class="rpe-y-axis-svg" width="' + acwrYAxisW + '" height="' + acwrSvgH + '" viewBox="0 0 ' + acwrYAxisW + ' ' + acwrSvgH + '">' + acwrYAxisSvg + '</svg>'
        + '<div class="rpe-chart-scroll" style="flex:0 1 ' + acwrChartW + 'px">'
        + '<svg class="rpe-chart-svg" width="' + acwrChartW + '" height="' + acwrSvgH + '" viewBox="0 0 ' + acwrChartW + ' ' + acwrSvgH + '">'
        + zoneSvg + colsSvgAcwr + ratioLineSvg + ratioDotsSvg + acwrXSvg
        + '</svg></div>'
        + '<svg class="rpe-y-axis-svg" width="' + acwrRAxisW + '" height="' + acwrSvgH + '" viewBox="0 0 ' + acwrRAxisW + ' ' + acwrSvgH + '"><rect x="0" y="' + redTopTop + '" width="' + (acwrRAxisW * 0.25) + '" height="' + redTopH + '" fill="#e53935" opacity=".14"/><rect x="0" y="' + redBotTop + '" width="' + (acwrRAxisW * 0.25) + '" height="' + redBotH + '" fill="#e53935" opacity=".14"/><rect x="0" y="' + zoneTop + '" width="' + (acwrRAxisW * 0.25) + '" height="' + zoneH + '" fill="#81c784" opacity=".22"/><rect x="0" y="' + orangeTopTop + '" width="' + (acwrRAxisW * 0.25) + '" height="' + orangeTopH + '" fill="#ff9800" opacity=".15"/><rect x="0" y="' + orangeBotTop + '" width="' + (acwrRAxisW * 0.25) + '" height="' + orangeBotH + '" fill="#ff9800" opacity=".15"/>' + zoneLineR + acwrRAxisSvg + '</svg>'
        + '</div></div>';
    }

    return { rpe: chartHtml, uaWeek: uaWeekHtml, acwr: acwrHtml };
  }

  function buildReadinessCard(rd) {
    if (!rd.hasData) {
      return `<div class="card">
        <div class="card-title">Readiness</div>
        <p style="color:var(--text-secondary);text-align:center;padding:1.5rem 0;">Encara no hi ha prou dades</p>
      </div>`;
    }
    const colorLabel = rd.color === 'green' ? 'Good' : rd.color === 'orange' ? 'Moderate' : 'Low';
    const colorHex = rd.color === 'green' ? '#4caf50' : rd.color === 'orange' ? '#ff9800' : '#e53935';
    function bar(val) {
      const bg = val >= 75 ? '#4caf50' : val >= 55 ? '#ff9800' : '#e53935';
      return `<div class="rd-bar-track"><div class="rd-bar-fill" style="width:${val}%;background:${bg}"></div></div>`;
    }
    return `<div class="card">
      <div class="card-title">Readiness</div>
      <div class="rd-header">
        <span class="readiness-dot readiness-${rd.color}"></span>
        <span class="rd-score" style="color:${colorHex}">${rd.score}</span>
        <span class="rd-label" style="color:${colorHex}">${colorLabel}</span>
        <span class="rd-acwr">ACWR ${rd.acwr.toFixed(2)}</span>
      </div>
      <div class="rd-metrics">
        <div class="rd-metric"><span class="rd-metric-label" data-tooltip="Based on ACWR: 0.8–1.3 = 100, &lt;0.8 = 60, 1.3–1.5 = 70, &gt;1.5 = 30">Load Ratio</span><span class="rd-metric-val">${rd.loadRatioScore}</span>${bar(rd.loadRatioScore)}</div>
        <div class="rd-metric"><span class="rd-metric-label" data-tooltip="Minutes in last match + recency penalty. &gt;80 min = 40, 60–80 = 60, 30–60 = 80, &lt;30 = 100">Match Fatigue</span><span class="rd-metric-val">${rd.matchFatigueScore}</span>${bar(rd.matchFatigueScore)}</div>
        <div class="rd-metric"><span class="rd-metric-label" data-tooltip="Week-over-week load change. &gt;+30% = 30, +10–30% = 60, ±10% = 100, &lt;-10% = 80">Load Spike</span><span class="rd-metric-val">${rd.loadSpikeScore}</span>${bar(rd.loadSpikeScore)}</div>
        <div class="rd-metric"><span class="rd-metric-label" data-tooltip="RPE trend over last 28 days. Sharp increase = 40, mild = 60, stable = 80, decreasing = 100">RPE Trend</span><span class="rd-metric-val">${rd.rpeTrendScore}</span>${bar(rd.rpeTrendScore)}</div>
      </div>
    </div>`;
  }

  function renderPlayerStats() {
    const session = getSession();
    const stats = JSON.parse(localStorage.getItem('fa_player_stats') || '[]');
    const me = stats[0] || {};

    // --- RPE line chart (since season start) ---
    const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
    const uid = session ? session.id : '';
    const now = new Date();
    const trainingList = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const matchesList = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const staffOverrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');

    const todayStr = localDateStr(now);

    // Season start: Aug 15 of current season year
    const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const seasonStart = seasonYear + '-08-15';

    // Collect all sessions (training + matches) since season start, sorted by date
    const sessions = [];
    trainingList.forEach(t => {
      if (!t.date || t.date < seasonStart || t.date > todayStr) return;
      const rpeKey = uid + '_training_' + t.date;
      const availKey = uid + '_' + t.date;
      const avail = staffOverrides[availKey] || availData[availKey] || '';
      const excluded = avail === 'no' || avail === 'injured';
      const entry = excluded ? null : rpeData[rpeKey];
      sessions.push({
        date: t.date,
        type: 'training',
        label: t.focus || 'Training',
        rpe: entry ? entry.rpe : null,
        minutes: entry ? entry.minutes : null,
        skipped: avail === 'no',
        injured: avail === 'injured'
      });
    });
    matchesList.forEach(m => {
      if (!m.date || m.date < seasonStart || m.date > todayStr) return;
      const rpeKey = uid + '_match_' + m.id;
      const maKey = uid + '_' + m.id;
      const avail = matchAvailData[maKey] || '';
      const entry = rpeData[rpeKey];
      sessions.push({
        date: m.date,
        type: 'match',
        label: (m.home || '') + ' vs ' + (m.away || ''),
        rpe: entry ? entry.rpe : null,
        minutes: entry ? entry.minutes : null,
        skipped: avail === 'no_disponible',
        injured: false
      });
    });
    // Extra training sessions
    Object.keys(rpeData).forEach(key => {
      if (!key.startsWith(uid + '_extra_')) return;
      const entry = rpeData[key];
      if (!entry || !entry.date || entry.date < seasonStart || entry.date > todayStr) return;
      sessions.push({
        date: entry.date,
        type: 'extra',
        label: entry.tag || 'Extra',
        rpe: entry.rpe,
        minutes: entry.minutes,
        skipped: false,
        injured: false
      });
    });
    sessions.sort((a, b) => a.date.localeCompare(b.date));

    const charts = buildChartsHtml(sessions);
    const acwrHtml = charts.acwr, chartHtml = charts.rpe, uaWeekHtml = charts.uaWeek;
    const rd = computeReadiness(uid);
    const readinessHtml = buildReadinessCard(rd);

    // Position circles
    const users = getUsers();
    const myUser = users.find(u => u.id === uid);
    const posHtml = myUser ? posCirclesHtmlGlobal(myUser) : '';

    // Attendance donut (reuse same logic as Player Overview)
    let pYes = 0, pLate = 0, pNo = 0, pInj = 0, pNa = 0;
    trainingList.forEach(t => {
      if (!t.date) return;
      const locked = isTrainingLocked(t);
      const v = getEffectiveAnswer(uid, t.date, locked);
      if (v === 'yes') pYes++;
      else if (v === 'late') pLate++;
      else if (v === 'no') pNo++;
      else if (v === 'injured') pInj++;
      else pNa++;
    });
    const pTotal = pYes + pLate + pNo + pInj + pNa;
    let attendDonutHtml = '';
    if (pTotal > 0) {
      const dSize = 100, dStroke = 16, dRadius = (dSize - dStroke) / 2;
      const dCirc = 2 * Math.PI * dRadius;
      const dSegs = [
        { count: pYes, color: '#66bb6a', label: 'Yes' },
        { count: pLate, color: '#ffa726', label: 'Late' },
        { count: pNo, color: '#78909c', label: 'No' },
        { count: pInj, color: '#ef5350', label: 'Injured' },
        { count: pNa, color: '#d0d0d0', label: 'N/A' }
      ];
      let dArcs = '', dOff = 0;
      dSegs.forEach(s => {
        if (s.count > 0) {
          const len = (s.count / pTotal) * dCirc;
          const sPct = Math.round((s.count / pTotal) * 100);
          dArcs += `<circle cx="${dSize/2}" cy="${dSize/2}" r="${dRadius}" fill="none" stroke="${s.color}" stroke-width="${dStroke}"
            stroke-dasharray="${len} ${dCirc - len}" stroke-dashoffset="${-dOff}"
            style="--circ:${dCirc};cursor:pointer;pointer-events:stroke" transform="rotate(-90 ${dSize/2} ${dSize/2})" data-tooltip="${s.label}: ${sPct}%"><title>${s.label}: ${sPct}%</title></circle>`;
          dOff += len;
        }
      });
      const attendPct = Math.round(((pYes + pLate) / pTotal) * 100);
      attendDonutHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:.3rem;">
        <div class="assistance-circle" style="width:${dSize}px;height:${dSize}px;">
          <svg width="${dSize}" height="${dSize}" viewBox="0 0 ${dSize} ${dSize}">
            <circle cx="${dSize/2}" cy="${dSize/2}" r="${dRadius}" fill="none" stroke="var(--border)" stroke-width="${dStroke}"/>
            ${dArcs}
          </svg>
          <span class="assistance-pct po-pct-counter" data-target="${attendPct}" style="font-size:1.1rem;font-weight:800;">0%</span>
        </div>
        <span style="font-size:.65rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.03em;">Attendance</span>
      </div>`;
    }

    // Injury history (from fa_injuries)
    const playerInjuries = getPlayerInjuries(uid).sort((a, b) => b.startDate.localeCompare(a.startDate));

    let injuryListHtml = '';
    if (playerInjuries.length === 0) {
      injuryListHtml = '<div style="padding:.8rem;color:var(--text-secondary);font-size:.85rem;">No injuries this season 💪</div>';
    } else {
      injuryListHtml = playerInjuries.map(inj => {
        const startD = new Date(inj.startDate + 'T12:00:00');
        const endD = inj.endDate ? new Date(inj.endDate + 'T12:00:00') : now;
        const days = Math.max(1, Math.floor((endD - startD) / 86400000) + 1);
        const startStr = startD.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const endStr = inj.status === 'resolved' ? (inj.endDate ? new Date(inj.endDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?') : 'Present';
        const durationStr = inj.status !== 'resolved' ? (days + ' days so far') : (days === 1 ? '1 day' : days + ' days');
        const note = inj.muscleGroup ? (inj.muscleGroup + (inj.muscleSub ? ' (' + inj.muscleSub + ')' : '')) : 'Injury';
        const sevColors = { minor: '#43a047', moderate: '#f9a825', severe: '#e53935' };
        const statusColors = { active: '#ef5350', recovering: '#f9a825', resolved: '#66bb6a' };
        const statusDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (statusColors[inj.status] || '#999') + ';margin-right:6px;"></span>';
        const sevDot = '<span class="med-severity-badge med-severity-sm" style="background:' + (sevColors[inj.severity] || '#999') + ';margin-left:6px;">' + (inj.severity || '') + '</span>';
        return `<div class="mystats-inj-row" data-zone-idx="${inj.bodyZone != null ? inj.bodyZone : ''}" style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border);font-size:.82rem;cursor:help;">
          <div style="display:flex;align-items:center;">${statusDot}<span>${sanitize(note)}</span>${sevDot}</div>
          <div style="text-align:right;color:var(--text-secondary);font-size:.75rem;">${startStr} – ${endStr}<br><strong>${durationStr}</strong></div>
        </div>`;
      }).join('');
    }

    // Build body map SVG with blinking dot on current injury zone
    const activePlayerInj = playerInjuries.find(inj => inj.status === 'active');
    const currentZoneIdx = activePlayerInj ? activePlayerInj.bodyZone : null;
    let bodyMapHtml = '';
    if (activePlayerInj && currentZoneIdx != null && BODY_ZONES[currentZoneIdx]) {
      const zone = BODY_ZONES[currentZoneIdx];
      // Compute centroid of the polygon
      const pairs = zone.pts.split(/\s+/).map(p => p.split(',').map(Number));
      let cx = 0, cy = 0;
      pairs.forEach(([x, y]) => { cx += x; cy += y; });
      cx = (cx / pairs.length).toFixed(1);
      cy = (cy / pairs.length).toFixed(1);
      bodyMapHtml = `<div class="mystats-body-map">
        <div style="position:relative;display:inline-block;line-height:0;">
          <img src="img/cuerpos.png" style="display:block;height:180px;pointer-events:none;" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:100%;">
            <polygon points="${zone.pts}" fill="rgba(239,83,80,.25)" stroke="#ef5350" stroke-width=".5"/>
            <circle cx="${cx}" cy="${cy}" r="1.8" class="mystats-injury-dot"/>
          </svg>
        </div>
      </div>`;
    }

    return `
      <h2 class="page-title">My Stats</h2>
      <div class="card mystats-summary">
        <div class="mystats-summary-left">
          <div class="mystats-pos-row"><span class="conv-pos-circles">${posHtml}</span></div>
          <div class="mystats-nums">
            <div class="mystats-num"><span class="mystats-num-val">${me.goals ?? 0}</span><span class="mystats-num-lbl">Goals</span></div>
            <div class="mystats-num"><span class="mystats-num-val">${me.assists ?? 0}</span><span class="mystats-num-lbl">Assists</span></div>
            <div class="mystats-num"><span class="mystats-num-val">${me.matches ?? 0}</span><span class="mystats-num-lbl">Matches</span></div>
          </div>
        </div>
        ${attendDonutHtml}
      </div>
      <div class="mystats-injury-row" style="margin-top:1rem;">
        <div class="card mystats-injury-card">
          <div class="card-title" style="margin-bottom:.4rem;font-size:.85rem;">🏥 Injury History</div>
          ${injuryListHtml}
        </div>
        ${bodyMapHtml}
      </div>
      ${readinessHtml}
      ${acwrHtml}
      ${chartHtml}
      ${uaWeekHtml}`;
  }

  function renderStaffPlayerStats() {
    const users = getUsers();
    const u = users.find(x => String(x.id) === String(staffViewPlayerId));
    if (!u) return '<div class="empty-state"><p>Player not found</p></div>';
    const uid = u.id;

    const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
    const now = new Date();
    const trainingList = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const matchesList = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const staffOverrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');

    const todayStr = localDateStr(now);
    const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const seasonStart = seasonYear + '-08-15';

    const sessions = [];
    trainingList.forEach(t => {
      if (!t.date || t.date < seasonStart || t.date > todayStr) return;
      const rpeKey = uid + '_training_' + t.date;
      const availKey = uid + '_' + t.date;
      const avail = staffOverrides[availKey] || availData[availKey] || '';
      const excluded = avail === 'no' || avail === 'injured';
      const entry = excluded ? null : rpeData[rpeKey];
      sessions.push({
        date: t.date, type: 'training', label: t.focus || 'Training',
        rpe: entry ? entry.rpe : null, minutes: entry ? entry.minutes : null,
        skipped: avail === 'no', injured: avail === 'injured'
      });
    });
    matchesList.forEach(m => {
      if (!m.date || m.date < seasonStart || m.date > todayStr) return;
      const rpeKey = uid + '_match_' + m.id;
      const maKey = uid + '_' + m.id;
      const avail = matchAvailData[maKey] || '';
      const entry = rpeData[rpeKey];
      sessions.push({
        date: m.date, type: 'match', label: (m.home || '') + ' vs ' + (m.away || ''),
        rpe: entry ? entry.rpe : null, minutes: entry ? entry.minutes : null,
        skipped: avail === 'no_disponible', injured: false
      });
    });
    Object.keys(rpeData).forEach(key => {
      if (!key.startsWith(uid + '_extra_')) return;
      const entry = rpeData[key];
      if (!entry || !entry.date || entry.date < seasonStart || entry.date > todayStr) return;
      sessions.push({
        date: entry.date, type: 'extra', label: entry.tag || 'Extra',
        rpe: entry.rpe, minutes: entry.minutes, skipped: false, injured: false
      });
    });
    sessions.sort((a, b) => a.date.localeCompare(b.date));

    const charts = buildChartsHtml(sessions);
    const rd = computeReadiness(uid);
    const readinessHtml = buildReadinessCard(rd);

    // Player profile header (same as player overview)
    const picHtml = u.profilePic
      ? `<img src="${u.profilePic}" alt="Profile" class="player-overview-pic">`
      : `<div class="player-overview-pic player-overview-pic-placeholder">${sanitize(u.name).charAt(0).toUpperCase()}</div>`;
    const team = u.team || '';
    const teamBadge = team
      ? `<span class="po-team-badge">${sanitize(team)}</span>`
      : '';
    const positions = (u.position || '').split(',').map(s => s.trim()).filter(Boolean);
    const layoutCls = positions.length === 3 ? 'po-pos-tri' : positions.length === 2 ? 'po-pos-duo' : 'po-pos-one';
    const posCircles = positions.map(p => {
      const bg = POS_COLORS[p] || '#9e9e9e';
      return `<span class="po-pos-circle" style="background:${bg}">${sanitize(p)}</span>`;
    }).join('');
    const number = u.playerNumber || '—';
    const dob = u.dob || '';
    let ageLabel = '';
    if (dob) {
      const bd = new Date(dob + 'T12:00:00');
      const today = new Date();
      let age = today.getFullYear() - bd.getFullYear();
      if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
      ageLabel = ` <span style="color:var(--text-secondary);font-weight:400;font-size:.85em;">(${age} anys)</span>`;
    }

    return `
      <button class="btn btn-outline btn-small detail-back" data-back="manage-roster">← Back</button>
      <h2 class="page-title">${sanitize(u.name)} <span style="color:var(--text-secondary);font-weight:600;">#${sanitize(String(number))}</span>${ageLabel}</h2>
      <div class="player-overview-card">
        <div class="player-overview-left">
          <div class="po-pic-wrap">
            ${picHtml}
            ${teamBadge}
          </div>
          <div class="po-pos-wrap ${layoutCls}">${posCircles}</div>
        </div>
      </div>
      ${readinessHtml}
      ${charts.acwr}
      ${charts.rpe}
      ${charts.uaWeek}`;
  }

  // lightenHex, darkenHex, hexToRgba, textColorFor → utils.js

  // One-time cleanup: remove match-linked boards that no longer exist in saved boards
  if (!localStorage.getItem('fa_cleanup_orphan_match_boards')) {
    const saved = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
    const savedNames = new Set(saved.map(b => b.name));
    const mb = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
    let changed = false;
    for (const mid of Object.keys(mb)) {
      const before = mb[mid].length;
      mb[mid] = mb[mid].filter(b => savedNames.has(b.name));
      if (mb[mid].length !== before) changed = true;
      if (!mb[mid].length) { delete mb[mid]; changed = true; }
    }
    if (changed) localStorage.setItem('fa_tactic_match_boards', JSON.stringify(mb));
    // Also clean training-linked boards
    const tb = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
    let tbChanged = false;
    for (const tdate of Object.keys(tb)) {
      const before = tb[tdate].length;
      tb[tdate] = tb[tdate].filter(b => savedNames.has(b.name));
      if (tb[tdate].length !== before) tbChanged = true;
      if (!tb[tdate].length) { delete tb[tdate]; tbChanged = true; }
    }
    if (tbChanged) localStorage.setItem('fa_tactic_training_boards', JSON.stringify(tb));
    localStorage.setItem('fa_cleanup_orphan_match_boards', '1');
  }

  function renderTactics() {
    const formations = TACTIC_FORMATIONS;

    const boardType = localStorage.getItem('fa_tactic_board_type') || '';

    // If no board type chosen, show picker
    if (!boardType) {
      // Saved boards list (show even on picker screen)
      const savedBoards = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
      const loadedIdx = localStorage.getItem('fa_tactic_loaded_idx');
      const savedListHtml = savedBoards.map((b, i) =>
        `<div class="tb-saved-item${loadedIdx == i ? ' tb-saved-active' : ''}" data-board-idx="${i}">` +
        `<span>${sanitize(b.name || 'Board ' + (i+1))}</span>` +
        `<button class="tb-delete-board" data-del-idx="${i}">✕</button>` +
        `</div>`
      ).join('');
      return `
        <h2 class="page-title">Tactical Board</h2>
        <div class="card">
          <div class="tb-type-picker" id="tb-type-picker">
            <div class="tb-type-card" data-board-type="full">
              <div class="tb-type-preview">
                <div class="tbp-halfway"></div>
                <div class="tbp-center-circle"></div>
                <div class="tbp-penalty-l"></div>
                <div class="tbp-penalty-r"></div>
                <div class="tbp-goal-l"></div>
                <div class="tbp-goal-r"></div>
              </div>
            </div>
            <div class="tb-type-card" data-board-type="half">
              <div class="tb-type-preview half">
                <div class="tbp-half-line"></div>
                <div class="tbp-half-circle"></div>
                <div class="tbp-half-penalty"></div>
                <div class="tbp-half-goal"></div>
                <div class="tbp-half-arc"></div>
              </div>
            </div>
            <div class="tb-type-card" data-board-type="area">
              <div class="tb-type-preview area">
                <div class="tbp-area-box"></div>
                <div class="tbp-area-goal"></div>
                <div class="tbp-area-arc"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="tb-saved-title">Saved Boards</div>
          <div class="tb-saved-list" id="tb-saved-list">${savedListHtml}</div>
        </div>`;
    }

    const isVertical = localStorage.getItem('fa_tactic_orient') === 'vertical';
    const savedFormation = localStorage.getItem('fa_tactic_formation') || '';
    const savedPositions = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
    const savedNumbers = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
    const savedColors = JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null');
    const savedName = localStorage.getItem('fa_tactic_name') || '';
    const teamColor = localStorage.getItem('fa_tactic_team_color') || '#ffffff';
    const oppColor = localStorage.getItem('fa_tactic_opp_color') || '#e53935';
    const showOpp = localStorage.getItem('fa_tactic_show_opp') === 'true';
    let savedBalls = JSON.parse(localStorage.getItem('fa_tactic_balls') || 'null');
    if (!savedBalls) { const _bp = JSON.parse(localStorage.getItem('fa_tactic_ball_pos') || 'null'); savedBalls = _bp ? [_bp] : [[50, 50]]; }
    const savedArrows = JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]');
    const savedRects = JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]');
    const savedTexts = JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]');
    const savedSilhouette = localStorage.getItem('fa_tactic_silhouette') || '';
    const savedCones = JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]');
    const GK_COLOR = '#f5c842';

    let circlesHtml = '';
    if (savedFormation && formations[savedFormation]) {
      let pos;
      if (savedPositions) {
        pos = savedPositions;
      } else if (boardType !== 'full') {
        // Adapt default formation for half/area
        pos = formations[savedFormation].map(([hLeft, hTop]) => {
          let newLeft = hTop;
          let newTop = hLeft;
          if (boardType === 'half') { newTop = Math.min(98, Math.max(2, newTop * 1.3)); }
          else if (boardType === 'area') { newTop = Math.min(98, Math.max(2, newTop * 1.7)); }
          return [Math.min(98, Math.max(2, newLeft)), newTop];
        });
      } else {
        pos = formations[savedFormation];
      }
      const nums = savedNumbers || new Array(11).fill('');
      const clrs = savedColors || [];
      circlesHtml = pos.map((p, i) => {
        if (!p) return ''; // null = deleted circle slot
        let dl = p[0], dt = p[1];
        if (isVertical && boardType === 'full') { dl = p[1]; dt = 100 - p[0]; }
        const num = String(nums[i] || '');
        const isGk = num === '1';
        const bg = isGk ? GK_COLOR : (clrs[i] || teamColor);
        const fg = textColorFor(bg);
        const bc = darkenHex(bg, 50);
        const dc = clrs[i] ? ` data-color="${clrs[i]}"` : '';
        return `<div class="tb-circle" data-idx="${i}"${dc} style="left:${dl}%;top:${dt}%;background:${bg};border-color:${bc};">` +
          `<input class="tb-num" maxlength="2" value="${sanitize(num)}" placeholder="" style="color:${fg};">` +
          `</div>`;
      }).join('');
    }

    let oppCirclesHtml = '';
    if (showOpp && savedFormation && formations[savedFormation]) {
      const savedOppPos = JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null');
      const savedOppNums = JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null');
      let oppPos;
      if (savedOppPos) {
        oppPos = savedOppPos;
      } else {
        const mirrored = formations[savedFormation].map(([l,t]) => [100 - l, t]);
        if (boardType !== 'full') {
          oppPos = mirrored.map(([hLeft, hTop]) => {
            let newLeft = hTop;
            let newTop = hLeft;
            if (boardType === 'half') { newTop = Math.min(98, Math.max(2, newTop * 1.3)); }
            else if (boardType === 'area') { newTop = Math.min(98, Math.max(2, newTop * 1.7)); }
            return [Math.min(98, Math.max(2, newLeft)), newTop];
          });
        } else {
          oppPos = mirrored;
        }
      }
      const oppNums = savedOppNums || new Array(11).fill('');
      oppCirclesHtml = oppPos.map((p, i) => {
        if (!p) return ''; // null = deleted circle slot
        let dl = p[0], dt = p[1];
        if (isVertical && boardType === 'full') { dl = p[1]; dt = 100 - p[0]; }
        const num = String(oppNums[i] || '');
        const isGk = num === '1';
        const bg = isGk ? GK_COLOR : oppColor;
        const fg = textColorFor(bg);
        const bc = darkenHex(bg, 50);
        return `<div class="tb-circle tb-circle-opp" data-idx="${i}" style="left:${dl}%;top:${dt}%;background:${bg};border-color:${bc};">` +
          `<input class="tb-num" maxlength="2" value="${sanitize(String(oppNums[i] || ''))}" placeholder="" style="color:${fg};">` +
          `</div>`;
      }).join('');
    }

    // Saved boards list
    const savedBoards = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
    const loadedIdx = localStorage.getItem('fa_tactic_loaded_idx');
    const savedListHtml = savedBoards.map((b, i) =>
      `<div class="tb-saved-item${loadedIdx == i ? ' tb-saved-active' : ''}" data-board-idx="${i}">` +
      `<span>${sanitize(b.name || 'Board ' + (i+1))}</span>` +
      `<button class="tb-delete-board" data-del-idx="${i}">✕</button>` +
      `</div>`
    ).join('');

    let fieldCls = 'tb-field';
    if (isVertical) fieldCls += ' tb-vertical';
    if (boardType === 'half') fieldCls += ' tb-half';
    else if (boardType === 'area') fieldCls += ' tb-area';

    return `
      <h2 class="page-title">Tactical Board</h2>
      <div class="card">
        <div class="tb-controls">
          <label class="tb-label">Formation</label>
          <div class="tb-formation-wrap" id="tb-formation-wrap">
            <div class="tb-formation-toggle" id="tb-formation-toggle">${savedFormation || '— Select —'}</div>
            <div class="tb-formation-list" id="tb-formation-list">
              <div class="tb-formation-option" data-val="">— Select —</div>
              ${Object.keys(formations).map(f => `<div class="tb-formation-option${f === savedFormation ? ' active' : ''}" data-val="${f}">${f}</div>`).join('')}
            </div>
          </div>
          <button class="tb-orient-btn" id="tb-orient" data-tooltip="Toggle orientation"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
          <input type="color" class="tb-color-pick" id="tb-team-color" value="${teamColor}" data-tooltip="Team color">
          <label class="tb-opp-toggle"><input type="checkbox" id="tb-show-opp" ${showOpp ? 'checked' : ''}> Opp</label>
          <input type="color" class="tb-color-pick" id="tb-opp-color" value="${oppColor}" data-tooltip="Opponent color" ${showOpp ? '' : 'style="display:none"'}>
          <span class="tb-sep"></span>
          <button class="tb-arrow-tool" id="tb-arrow-tool" data-tooltip="Draw arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
          <input type="color" class="tb-color-pick tb-arrow-color-pick" id="tb-arrow-color" value="${localStorage.getItem('fa_tactic_arrow_color') || '#ffffff'}" data-tooltip="Arrow color">
          <label class="tb-opp-toggle tb-arrow-dash-label"><input type="checkbox" id="tb-arrow-dash" ${localStorage.getItem('fa_tactic_arrow_dash') === 'true' ? 'checked' : ''}> Dash</label>
          <span class="tb-sep"></span>
          <button class="tb-rect-tool" id="tb-rect-tool" data-tooltip="Draw rectangle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/></svg></button>
          <input type="color" class="tb-color-pick" id="tb-rect-color" value="${localStorage.getItem('fa_tactic_rect_color') || '#ffffff'}" data-tooltip="Rectangle color">
          <input type="range" class="tb-opacity-range" id="tb-rect-opacity" min="0" max="100" value="${localStorage.getItem('fa_tactic_rect_opacity') || '30'}" data-tooltip="Fill opacity">
          <span class="tb-sep"></span>
          <button class="tb-text-tool" id="tb-text-tool" data-tooltip="Add text label">T</button>
          <input type="color" class="tb-color-pick" id="tb-text-color" value="${localStorage.getItem('fa_tactic_text_color') || '#000000'}" data-tooltip="Text background color">
          <input type="range" class="tb-opacity-range" id="tb-text-opacity" min="0" max="100" value="${localStorage.getItem('fa_tactic_text_opacity') || '80'}" data-tooltip="Background opacity">
          <span class="tb-size-label tb-size-label-sm">A</span><input type="range" class="tb-size-range" id="tb-text-size" min="8" max="28" value="${localStorage.getItem('fa_tactic_text_size') || '12'}" data-tooltip="Font size"><span class="tb-size-label tb-size-label-lg">A</span>
          <span class="tb-sep"></span>
          <button class="tb-pen-tool" id="tb-pen-tool" data-tooltip="Freehand pen"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg></button>
          <input type="color" class="tb-color-pick" id="tb-pen-color" value="${localStorage.getItem('fa_tactic_pen_color') || '#ffffff'}" data-tooltip="Pen color">
          <label class="tb-opp-toggle tb-arrow-dash-label"><input type="checkbox" id="tb-pen-dash" ${localStorage.getItem('fa_tactic_pen_dash') === 'true' ? 'checked' : ''}> Dash</label>
          <span class="tb-sep"></span>
          <div class="tb-sil-wrap" id="tb-sil-wrap">
            <button class="tb-sil-btn" id="tb-sil-btn" data-tooltip="Silhouette">
              <img src="img/sil-one-arm-up.png" alt="" style="width:22px;height:22px;object-fit:contain;display:block;margin:auto;">
            </button>
            <div class="tb-sil-menu" id="tb-sil-menu">
              <div class="tb-sil-opt${savedSilhouette === '' ? ' tb-sil-active' : ''}" data-sil="">None</div>
              <div class="tb-sil-opt${savedSilhouette === 'both-arms-up' ? ' tb-sil-active' : ''}" data-sil="both-arms-up"><img src="img/sil-both-arms-up.png" alt="">Both arms up</div>
              <div class="tb-sil-opt${savedSilhouette === 'one-arm-up' ? ' tb-sil-active' : ''}" data-sil="one-arm-up"><img src="img/sil-one-arm-up.png" alt="">One arm up</div>
              <div class="tb-sil-opt${savedSilhouette === 'arms-crossed' ? ' tb-sil-active' : ''}" data-sil="arms-crossed"><img src="img/sil-arms-crossed.png" alt="">Arms crossed</div>
              <div class="tb-sil-opt${savedSilhouette === 'arms-side' ? ' tb-sil-active' : ''}" data-sil="arms-side"><img src="img/sil-arms-side.png" alt="">Arms to side</div>
            </div>
          </div>
          <span class="tb-sep"></span>
          <button class="tb-cone-tool" id="tb-cone-tool" data-tooltip="Place cone"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="12,2 4,22 20,22" fill="#ff8c00" stroke="#cc7000" stroke-width="1.5" stroke-linejoin="round"/></svg></button>
          <button class="tb-ball-tool" id="tb-ball-tool" data-tooltip="Add ball"><span class="tb-ball-icon">⚽</span></button>
        </div>
        <div class="tb-btn-row">
          <button class="btn btn-small btn-tb-new" id="tb-new-board">New Board</button>
        </div>
        <input class="tb-board-name" id="tb-board-name" placeholder="Board name…" value="${sanitize(savedName)}">
        <div class="${fieldCls}" id="tb-field">
          <div class="tb-field-inner">
            <div class="tb-halfway"></div>
            <div class="tb-center-circle"></div>
            <div class="tb-center-spot"></div>
            <div class="tb-penalty-left"></div>
            <div class="tb-penalty-right"></div>
            <div class="tb-goal-left"></div>
            <div class="tb-goal-right"></div>
            <div class="tb-penalty-arc-left"></div>
            <div class="tb-penalty-arc-right"></div>
            <div class="tb-penalty-spot-left"></div>
            <div class="tb-penalty-spot-right"></div>
            ${circlesHtml}
            ${oppCirclesHtml}
            ${savedBalls.map((bp,bi) => { if(!bp) return ''; let bx=bp[0],by=bp[1]; if(isVertical&&boardType==='full'){bx=bp[1];by=100-bp[0];} return '<div class="tb-ball" data-idx="'+bi+'" style="left:'+bx+'%;top:'+by+'%;">' + '</div>'; }).join('')}
            ${savedCones.map((c,i) => {
              let cx=c[0], cy=c[1];
              if (isVertical && boardType === 'full') { cx=c[1]; cy=100-c[0]; }
              return '<div class="tb-cone" data-idx="'+i+'" style="left:'+cx+'%;top:'+cy+'%;"></div>';
            }).join('')}
            <img class="tb-silhouette" id="tb-silhouette" src="${savedSilhouette ? 'img/sil-' + savedSilhouette + '.png' : ''}" alt="" style="display:${savedSilhouette ? 'block' : 'none'};">
            <svg class="tb-arrows-svg" id="tb-arrows-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs id="tb-arrow-defs"></defs>
              ${savedRects.map((r,i) => {
                let rx=r[0],ry=r[1],rw=r[2],rh=r[3];
                const rColor = r[4] || '#ffffff';
                const rOp = r[5] != null ? r[5] : 0.3;
                if (isVertical && boardType === 'full') { rx=r[1]; ry=100-r[0]-r[2]; const tmp=rw; rw=rh; rh=tmp; }
                return '<rect class="tb-rect" data-idx="'+i+'" x="'+rx+'%" y="'+ry+'%" width="'+rw+'%" height="'+rh+'%" data-color="'+rColor+'" data-opacity="'+rOp+'" style="fill:'+rColor+';fill-opacity:'+rOp+';stroke:'+rColor+';" />';
              }).join('')}
              ${savedArrows.map((a,i) => {
                let x1=a[0],y1=a[1],x2=a[2],y2=a[3];
                const aColor = a[4] || '#ffffff';
                const aDash = a[5] ? ' stroke-dasharray="6 4"' : '';
                if (isVertical && boardType === 'full') { x1=a[1]; y1=100-a[0]; x2=a[3]; y2=100-a[2]; }
                return '<line class="tb-arrow" data-idx="'+i+'" data-color="'+aColor+'" data-dash="'+(a[5]?'1':'')+'" x1="'+x1+'%" y1="'+y1+'%" x2="'+x2+'%" y2="'+y2+'%" style="stroke:'+aColor+';"'+aDash+' />';
              }).join('')}
            </svg>
            ${savedTexts.map((t,i) => {
              let tx=t[0], ty=t[1];
              if (isVertical && boardType === 'full') { tx=t[1]; ty=100-t[0]; }
              const tColor = t[3] || '#000000';
              const tOp = t[4] != null ? t[4] : 0.8;
              const fg = textColorFor(tColor);
              const tW = t[5] ? 'width:'+t[5]+'px;' : '';
              const tH = t[6] ? 'height:'+t[6]+'px;' : '';
              const tFs = t[7] ? 'font-size:'+t[7]+'px;' : '';
              return '<div class="tb-text-label" data-idx="'+i+'" data-color="'+tColor+'" data-opacity="'+tOp+'" style="left:'+tx+'%;top:'+ty+'%;background:rgba('+parseInt(tColor.slice(1,3),16)+','+parseInt(tColor.slice(3,5),16)+','+parseInt(tColor.slice(5,7),16)+','+tOp+');color:'+fg+';'+tW+tH+tFs+'">'+sanitize(t[2])+'</div>';
            }).join('')}
          </div>
        </div>
        <div class="tb-frames-section">
          <div class="tb-frames-header">
            <span class="tb-frames-title">Frames</span>
            <button class="btn btn-small tb-frame-play" id="tb-frame-play" title="Play animation"></button>
          </div>
          <div class="tb-frames-strip" id="tb-frames-strip">
            <button class="tb-frame-add" id="tb-frame-add" title="Add frame">+</button>
          </div>
        </div>
        <div class="tb-tag-section">
          <div class="tb-tag-label">Tag</div>
          <div class="tb-tag-select-wrap" id="tb-tag-select-wrap">
            <div class="tb-tag-toggle${localStorage.getItem('fa_tactic_tag') ? ' has-tag' : ''}" id="tb-tag-toggle">${sanitize(localStorage.getItem('fa_tactic_tag') || '') || '— None —'}</div>
            <div class="tb-tag-list" id="tb-tag-list"></div>
          </div>
          <div class="tb-tag-add-row">
            <input class="tb-tag-add-input" id="tb-tag-add-input" type="text" placeholder="New tag...">
            <button class="btn btn-small btn-orange" id="tb-tag-add-btn">Add</button>
          </div>
        </div>
        <div class="tb-match-section">
          <div class="tb-match-label">Add to Match</div>
          <div class="tb-match-row">
            <div class="tb-match-wrap" id="tb-match-wrap">
              <div class="tb-match-toggle" id="tb-match-toggle">None</div>
              <div class="tb-match-list" id="tb-match-list">
                <div class="tb-match-option" data-val="">None</div>
                ${(() => {
                  const allMatches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
                  const now = new Date();
                  return allMatches.filter(m => {
                    if (!m.date || !m.time) return true;
                    return new Date(m.date + 'T' + m.time + ':00') > now;
                  }).map(m => {
                    const teamLetter = m.team ? ' (' + sanitize(m.team) + ')' : '';
                    const home = isOurTeam(m.home) ? getClubName() + teamLetter : sanitize(m.home);
                    const away = isOurTeam(m.away) ? getClubName() + teamLetter : sanitize(m.away);
                    const d = m.date ? new Date(m.date + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '';
                    return '<div class="tb-match-option" data-val="' + m.id + '">' + home + ' vs ' + away + (d ? '<span style="font-weight:400;"> — ' + d + '</span>' : '') + '</div>';
                  }).join('');
                })()}
              </div>
            </div>
            <button class="btn btn-small btn-orange" id="tb-add-to-match">Add</button>
          </div>
          <div class="tb-match-linked" id="tb-match-linked"></div>
        </div>
        <div class="tb-match-section">
          <div class="tb-match-label">Add to Training</div>
          <div class="tb-match-row">
            <div class="tb-match-wrap" id="tb-training-wrap">
              <div class="tb-match-toggle" id="tb-training-toggle">None</div>
              <div class="tb-match-list" id="tb-training-list">
                <div class="tb-match-option" data-val="">None</div>
                ${(() => {
                  const allTraining = JSON.parse(localStorage.getItem('fa_training') || '[]');
                  const todayStr = new Date().toISOString().slice(0, 10);
                  return allTraining.filter(t => t.date && t.date >= todayStr).map(t => {
                    const d = new Date(t.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
                    return '<div class="tb-match-option" data-val="' + sanitize(t.date) + '">' + sanitize(t.focus || 'Training') + '<span style="font-weight:400;"> — ' + d + '</span></div>';
                  }).join('');
                })()}
              </div>
            </div>
            <button class="btn btn-small btn-orange" id="tb-add-to-training">Add</button>
          </div>
          <div class="tb-match-linked" id="tb-training-linked"></div>
        </div>
        <div class="tb-btn-row">
          <button class="btn btn-small btn-primary" id="tb-save">Save</button>
          <button class="btn btn-small btn-tb-saveas" id="tb-save-as">Save As</button>
        </div>
        <div class="tb-saved-title">Saved Boards</div>
        <div class="tb-saved-list" id="tb-saved-list">${savedListHtml}</div>
      </div>`;
  }

  // #endregion Readiness Engine & Charts

  // #region Tactical Board Editor
  // ---------- Tactical Board bindings ----------
  function bindTactics() {
    const GK_COLOR = '#f5c842';
    // Board type picker
    const picker = document.getElementById('tb-type-picker');
    if (picker) {
      picker.querySelectorAll('.tb-type-card').forEach(card => {
        card.addEventListener('click', () => {
          localStorage.setItem('fa_tactic_board_type', card.dataset.boardType);
          navigate('tactics');
        });
      });
      // Still bind saved list on picker screen
      bindTacticsSavedList();
      return;
    }

    const field = document.getElementById('tb-field');
    if (!field) return;
    const inner = field.querySelector('.tb-field-inner');
    const nameInput = document.getElementById('tb-board-name');

    const formations = TACTIC_FORMATIONS;

    const isVertical = () => localStorage.getItem('fa_tactic_orient') === 'vertical';
    const useJsSwap = () => isVertical() && (localStorage.getItem('fa_tactic_board_type') || 'full') === 'full';
    const curBoardType = () => localStorage.getItem('fa_tactic_board_type') || 'full';

    // Remap default formation positions for half/area board types
    // Formations are authored for horizontal full field: [left%, top%]
    // Half field: goal at top, halfway at bottom. Remap left→top (attacking direction), top→left (sideline)
    // Area: same as half but more zoomed in
    function adaptFormation(posArr) {
      const bt = curBoardType();
      if (bt === 'full') return posArr;
      // For half/area: swap axes — horizontal left% becomes top%, horizontal top% becomes left%
      // Then scale top to fill the visible area
      return posArr.map(([hLeft, hTop]) => {
        // hLeft: 0=GK side, 100=attack → map to top: 100=bottom(halfway), 0=top(goal)
        // hTop: 0=top sideline, 100=bottom sideline → map to left: 0=left, 100=right
        let newLeft = hTop;
        let newTop = hLeft;
        // Scale to use more of the visible field
        if (bt === 'half') {
          newTop = newTop * 1.3;  // stretch to fill 77% height field
          newTop = Math.min(98, Math.max(2, newTop));
        } else if (bt === 'area') {
          newTop = newTop * 1.7;  // stretch to fill 58% height field
          newTop = Math.min(98, Math.max(2, newTop));
        }
        newLeft = Math.min(98, Math.max(2, newLeft));
        return [newLeft, newTop];
      });
    }

    function toDisplay(hLeft, hTop) {
      if (useJsSwap()) return [hTop, 100 - hLeft];
      return [hLeft, hTop];
    }
    function toHorizontal(dLeft, dTop) {
      if (useJsSwap()) return [100 - dTop, dLeft];
      return [dLeft, dTop];
    }

    function saveState() {
      const tc = document.getElementById('tb-team-color')?.value || '#ffffff';
      const oc = document.getElementById('tb-opp-color')?.value || '#e53935';
      const circles = inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)');
      // Use dataset.idx as the stable array index; fill gaps with null
      // Preserve existing numbers for deleted slots so they aren't lost
      const existingNums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || '[]');
      const existingOppNums = JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || '[]');
      const existingColors = JSON.parse(localStorage.getItem('fa_tactic_colors') || '[]');
      let maxIdx = -1;
      circles.forEach(c => { const idx = Number(c.dataset.idx); if (idx > maxIdx) maxIdx = idx; });
      maxIdx = Math.max(maxIdx, existingNums.length - 1);
      const pos = new Array(maxIdx + 1).fill(null);
      const nums = new Array(maxIdx + 1).fill('');
      const colors = new Array(maxIdx + 1).fill('');
      // Carry forward numbers and colors for deleted slots
      for (let i = 0; i < existingNums.length; i++) {
        if (existingNums[i]) nums[i] = existingNums[i];
      }
      for (let i = 0; i < existingColors.length; i++) {
        if (existingColors[i]) colors[i] = existingColors[i];
      }
      circles.forEach(c => {
        const idx = Number(c.dataset.idx);
        const dL = parseFloat(c.style.left);
        const dT = parseFloat(c.style.top);
        const h = toHorizontal(dL, dT);
        pos[idx] = [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100];
        const inp = c.querySelector('.tb-num');
        const num = inp.value;
        nums[idx] = num;
        colors[idx] = c.dataset.color || '';
        // GK recolor: number "1" gets gold
        const isGk = num.trim() === '1';
        if (isGk) {
          c.style.background = GK_COLOR; c.style.borderColor = darkenHex(GK_COLOR, 50);
          inp.style.color = textColorFor(GK_COLOR);
        } else if (!c.dataset.color) {
          c.style.background = tc; c.style.borderColor = darkenHex(tc, 50);
          inp.style.color = textColorFor(tc);
        }
      });
      localStorage.setItem('fa_tactic_positions', JSON.stringify(pos));
      localStorage.setItem('fa_tactic_numbers', JSON.stringify(nums));
      localStorage.setItem('fa_tactic_colors', JSON.stringify(colors));
      const oppCircles = inner.querySelectorAll('.tb-circle-opp');
      let maxOppIdx = -1;
      oppCircles.forEach(c => { const idx = Number(c.dataset.idx); if (idx > maxOppIdx) maxOppIdx = idx; });
      maxOppIdx = Math.max(maxOppIdx, existingOppNums.length - 1);
      if (oppCircles.length) {
        const oppPos = new Array(maxOppIdx + 1).fill(null);
        const oppNums = new Array(maxOppIdx + 1).fill('');
        // Carry forward numbers for deleted opp slots
        for (let i = 0; i < existingOppNums.length; i++) {
          if (existingOppNums[i]) oppNums[i] = existingOppNums[i];
        }
        oppCircles.forEach(c => {
          const idx = Number(c.dataset.idx);
          const dL = parseFloat(c.style.left);
          const dT = parseFloat(c.style.top);
          const h = toHorizontal(dL, dT);
          oppPos[idx] = [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100];
          const inp = c.querySelector('.tb-num');
          const num = inp.value;
          oppNums[idx] = num;
          // GK recolor for opp
          if (num.trim() === '1') {
            c.style.background = GK_COLOR; c.style.borderColor = darkenHex(GK_COLOR, 50);
            inp.style.color = textColorFor(GK_COLOR);
          } else {
            c.style.background = oc; c.style.borderColor = darkenHex(oc, 50);
            inp.style.color = textColorFor(oc);
          }
        });
        localStorage.setItem('fa_tactic_opp_positions', JSON.stringify(oppPos));
        localStorage.setItem('fa_tactic_opp_numbers', JSON.stringify(oppNums));
      }
      if (nameInput) localStorage.setItem('fa_tactic_name', nameInput.value);
      // Save ball positions
      saveBalls();
    }

    function spawnCircles(posArr, nums) {
      inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => c.remove());
      const tc = '#ffffff';
      posArr.forEach((p, i) => {
        if (!p) return; // null = deleted circle slot
        const d = toDisplay(p[0], p[1]);
        const num = (nums && nums[i]) || '';
        const isGk = String(num) === '1';
        const bg = isGk ? GK_COLOR : tc;
        const bc = darkenHex(bg, 50);
        const div = document.createElement('div');
        div.className = 'tb-circle';
        div.dataset.idx = i;
        div.style.left = d[0] + '%';
        div.style.top = d[1] + '%';
        div.style.background = bg;
        div.style.borderColor = bc;
        const inp = document.createElement('input');
        inp.className = 'tb-num';
        inp.maxLength = 2;
        inp.value = num;
        inp.style.color = textColorFor(bg);
        inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); });
        div.appendChild(inp);
        makeDraggable(div);
        inner.appendChild(div);
      });
      saveState();
    }

    function spawnOppCircles() {
      inner.querySelectorAll('.tb-circle-opp').forEach(c => c.remove());
      const f = localStorage.getItem('fa_tactic_formation');
      if (!f || !formations[f]) return;
      const mirrored = formations[f].map(([l,t]) => [100 - l, t]);
      const adapted = adaptFormation(mirrored);
      const oc = document.getElementById('tb-opp-color')?.value || '#e53935';
      const obc = darkenHex(oc, 50);
      adapted.forEach((p, i) => {
        const d = toDisplay(p[0], p[1]);
        const div = document.createElement('div');
        div.className = 'tb-circle tb-circle-opp';
        div.dataset.idx = i;
        div.style.left = d[0] + '%';
        div.style.top = d[1] + '%';
        div.style.background = oc;
        div.style.borderColor = obc;
        const inp = document.createElement('input');
        inp.className = 'tb-num';
        inp.maxLength = 2;
        inp.style.color = textColorFor(oc);
        inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); });
        div.appendChild(inp);
        makeDraggable(div);
        inner.appendChild(div);
      });
      saveState();
    }

    function updateCircleColors() {
      const tc = document.getElementById('tb-team-color')?.value || '#ffffff';
      const oc = document.getElementById('tb-opp-color')?.value || '#e53935';
      localStorage.setItem('fa_tactic_team_color', tc);
      localStorage.setItem('fa_tactic_opp_color', oc);
      inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => {
        const num = c.querySelector('.tb-num')?.value || '';
        if (num === '1') return;
        if (c.dataset.color) return;
        c.style.background = tc; c.style.borderColor = darkenHex(tc, 50);
        c.querySelector('.tb-num').style.color = textColorFor(tc);
      });
      inner.querySelectorAll('.tb-circle-opp').forEach(c => {
        const num = c.querySelector('.tb-num')?.value || '';
        if (num === '1') return;
        c.style.background = oc; c.style.borderColor = darkenHex(oc, 50);
        c.querySelector('.tb-num').style.color = textColorFor(oc);
      });
    }

    // --- Undo stack ---
    const undoStack = [];
    function pushUndo() {
      undoStack.push({
        positions: localStorage.getItem('fa_tactic_positions'),
        numbers: localStorage.getItem('fa_tactic_numbers'),
        colors: localStorage.getItem('fa_tactic_colors'),
        oppPositions: localStorage.getItem('fa_tactic_opp_positions'),
        oppNumbers: localStorage.getItem('fa_tactic_opp_numbers'),
        balls: localStorage.getItem('fa_tactic_balls'),
        arrows: localStorage.getItem('fa_tactic_arrows'),
        rects: localStorage.getItem('fa_tactic_rects'),
        texts: localStorage.getItem('fa_tactic_texts'),
        penLines: localStorage.getItem('fa_tactic_pen_lines'),
        silhouette: localStorage.getItem('fa_tactic_silhouette'),
        cones: localStorage.getItem('fa_tactic_cones')
      });
      if (undoStack.length > 50) undoStack.shift();
    }
    function popUndo() {
      if (!undoStack.length) return;
      const s = undoStack.pop();
      const keys = ['positions','numbers','colors','oppPositions','oppNumbers','balls','arrows','rects','texts','penLines','silhouette','cones'];
      const lsKeys = ['fa_tactic_positions','fa_tactic_numbers','fa_tactic_colors',
        'fa_tactic_opp_positions','fa_tactic_opp_numbers','fa_tactic_balls',
        'fa_tactic_arrows','fa_tactic_rects','fa_tactic_texts',
        'fa_tactic_pen_lines','fa_tactic_silhouette','fa_tactic_cones'];
      keys.forEach((k, i) => {
        if (s[k] !== null) localStorage.setItem(lsKeys[i], s[k]);
        else localStorage.removeItem(lsKeys[i]);
      });
      // Rebuild DOM from restored state
      const f = {
        positions: JSON.parse(s.positions || 'null'),
        numbers: JSON.parse(s.numbers || 'null'),
        colors: JSON.parse(s.colors || 'null'),
        oppPositions: JSON.parse(s.oppPositions || 'null'),
        oppNumbers: JSON.parse(s.oppNumbers || 'null'),
        balls: JSON.parse(s.balls || '[]'),
        arrows: JSON.parse(s.arrows || '[]'),
        rects: JSON.parse(s.rects || '[]'),
        texts: JSON.parse(s.texts || '[]'),
        penLines: JSON.parse(s.penLines || '[]'),
        silhouette: s.silhouette || '',
        cones: JSON.parse(s.cones || '[]')
      };
      applyFrameState(f);
      refreshArrowheads(arrowsSvg);
      if (activeFrameIdx >= 0) autoSaveFrame();
    }

    // --- Multi-select state ---
    const selected = new Set();
    function clearSelection() {
      selected.forEach(el => el.classList.remove('tb-selected'));
      selected.clear();
    }
    function toggleSelect(el) {
      if (selected.has(el)) {
        selected.delete(el);
        el.classList.remove('tb-selected');
      } else {
        selected.add(el);
        el.classList.add('tb-selected');
      }
    }

    // Helpers to read/write display positions for any element type
    function getElPos(el) {
      if (el.classList.contains('tb-circle') || el.classList.contains('tb-ball')) {
        return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
      }
      if (el.classList.contains('tb-arrow')) {
        return { x1: parseFloat(el.getAttribute('x1')), y1: parseFloat(el.getAttribute('y1')),
                 x2: parseFloat(el.getAttribute('x2')), y2: parseFloat(el.getAttribute('y2')) };
      }
      if (el.classList.contains('tb-rect')) {
        return { x: parseFloat(el.getAttribute('x')), y: parseFloat(el.getAttribute('y')),
                 w: parseFloat(el.getAttribute('width')), h: parseFloat(el.getAttribute('height')) };
      }
      if (el.classList.contains('tb-pen-line')) {
        return { pts: el.getAttribute('points') || '' };
      }
      return {};
    }
    function moveEl(el, start, dx, dy) {
      if (el.classList.contains('tb-circle') || el.classList.contains('tb-ball')) {
        el.style.left = Math.max(0, Math.min(100, start.left + dx)) + '%';
        el.style.top = Math.max(0, Math.min(100, start.top + dy)) + '%';
      } else if (el.classList.contains('tb-arrow')) {
        el.setAttribute('x1', (start.x1 + dx) + '%');
        el.setAttribute('y1', (start.y1 + dy) + '%');
        el.setAttribute('x2', (start.x2 + dx) + '%');
        el.setAttribute('y2', (start.y2 + dy) + '%');
      } else if (el.classList.contains('tb-rect')) {
        el.setAttribute('x', (start.x + dx) + '%');
        el.setAttribute('y', (start.y + dy) + '%');
      } else if (el.classList.contains('tb-pen-line')) {
        const shifted = start.pts.split(/\s+/).map(pair => {
          const [x, y] = pair.split(',').map(Number);
          return (x + dx) + ',' + (y + dy);
        }).join(' ');
        el.setAttribute('points', shifted);
      }
    }
    function computeDelta(e, startClientX, startClientY) {
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let dx, dy;
      if (isCssRotated && vert) {
        dx = -((e.clientY - startClientY) / rect.height) * 100;
        dy = ((e.clientX - startClientX) / rect.width) * 100;
      } else {
        dx = ((e.clientX - startClientX) / rect.width) * 100;
        dy = ((e.clientY - startClientY) / rect.height) * 100;
      }
      return { dx, dy };
    }
    function buildGroupStarts(excludeEl) {
      const starts = [];
      selected.forEach(el => {
        if (el !== excludeEl) starts.push({ el, pos: getElPos(el) });
      });
      return starts;
    }
    function saveAll() {
      saveState();
      saveArrows();
      saveRects();
      saveTexts();
      savePenLines();
      saveCones();
    }

    // --- Context menu ---
    let ctxMenu = null;
    function closeCtxMenu() {
      if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
    }
    document.addEventListener('click', closeCtxMenu);
    document.addEventListener('pointerdown', e => {
      if (ctxMenu && !ctxMenu.contains(e.target)) closeCtxMenu();
    });

    function showCtxMenu(x, y, items) {
      closeCtxMenu();
      ctxMenu = document.createElement('div');
      ctxMenu.className = 'tb-ctx-menu';
      items.forEach(it => {
        if (it.type === 'color') {
          const row = document.createElement('label');
          row.className = 'tb-ctx-item tb-ctx-color-row';
          row.innerHTML = '<span>Color</span>';
          const picker = document.createElement('input');
          picker.type = 'color';
          picker.className = 'tb-ctx-color-pick';
          picker.value = it.value || '#ffffff';
          picker.addEventListener('input', () => { it.action(picker.value); });
          row.appendChild(picker);
          ctxMenu.appendChild(row);
        } else if (it.type === 'range') {
          const row = document.createElement('label');
          row.className = 'tb-ctx-item tb-ctx-color-row';
          row.innerHTML = '<span>' + (it.label || 'Size') + '</span>';
          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = it.min || 8;
          slider.max = it.max || 28;
          slider.value = it.value || 12;
          slider.style.cssText = 'width:70px;cursor:pointer;';
          slider.addEventListener('input', () => { it.action(Number(slider.value)); });
          row.appendChild(slider);
          ctxMenu.appendChild(row);
        } else {
          const btn = document.createElement('div');
          btn.className = 'tb-ctx-item' + (it.danger ? ' tb-ctx-danger' : '');
          btn.textContent = it.label;
          btn.addEventListener('click', () => { closeCtxMenu(); it.action(); });
          ctxMenu.appendChild(btn);
        }
      });
      // Position
      const mainContent = document.getElementById('main-content') || document.body;
      const mr = mainContent.getBoundingClientRect();
      ctxMenu.style.left = (x - mr.left) + 'px';
      ctxMenu.style.top = (y - mr.top) + 'px';
      mainContent.appendChild(ctxMenu);
      // Keep on screen
      const cr = ctxMenu.getBoundingClientRect();
      if (cr.right > window.innerWidth) ctxMenu.style.left = (parseFloat(ctxMenu.style.left) - (cr.right - window.innerWidth) - 8) + 'px';
      if (cr.bottom > window.innerHeight) ctxMenu.style.top = (parseFloat(ctxMenu.style.top) - (cr.bottom - window.innerHeight) - 8) + 'px';
    }

    function applyColorToCircle(circle, color) {
      circle.dataset.color = color;
      circle.style.background = color;
      circle.style.borderColor = darkenHex(color, 50);
      circle.querySelector('.tb-num').style.color = textColorFor(color);
      saveState();
      syncColorsAcrossFrames();
      autoSaveFrame();
    }

    function addCircleAt(dispLeft, dispTop, isOpp) {
      const tc = isOpp
        ? (document.getElementById('tb-opp-color')?.value || '#e53935')
        : (document.getElementById('tb-team-color')?.value || '#ffffff');
      // Compute next stable idx — must exceed both DOM indices and stored array length
      // so we never reuse a deleted slot's index
      const selector = isOpp ? '.tb-circle-opp' : '.tb-circle:not(.tb-circle-opp)';
      const storageKey = isOpp ? 'fa_tactic_opp_positions' : 'fa_tactic_positions';
      const storedArr = JSON.parse(localStorage.getItem(storageKey) || '[]');
      let maxIdx = storedArr.length - 1;
      inner.querySelectorAll(selector).forEach(c => {
        const idx = Number(c.dataset.idx);
        if (idx > maxIdx) maxIdx = idx;
      });
      const div = document.createElement('div');
      div.className = 'tb-circle' + (isOpp ? ' tb-circle-opp' : '');
      div.dataset.idx = maxIdx + 1;
      div.style.left = dispLeft + '%';
      div.style.top = dispTop + '%';
      div.style.background = tc;
      div.style.borderColor = darkenHex(tc, 50);
      const inp = document.createElement('input');
      inp.className = 'tb-num';
      inp.maxLength = 2;
      inp.style.color = textColorFor(tc);
      inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); });
      div.appendChild(inp);
      makeDraggable(div);
      inner.appendChild(div);
      pushUndo();
      saveState();
      autoSaveFrame();
      // Add this circle to all future frames at the same position
      const newIdx = maxIdx + 1;
      const h = toHorizontal(dispLeft, dispTop);
      const hPos = [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100];
      const posKey = isOpp ? 'oppPositions' : 'positions';
      for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
        if (!frames[fi][posKey]) frames[fi][posKey] = [];
        while (frames[fi][posKey].length <= newIdx) frames[fi][posKey].push(null);
        frames[fi][posKey][newIdx] = hPos;
      }
      saveFrames();
    }

    function deleteCircle(circle) {
      const isOpp = circle.classList.contains('tb-circle-opp');
      const idx = Number(circle.dataset.idx);
      circle.remove();
      selected.delete(circle);
      saveState();
      autoSaveFrame();
      // Remove this circle from all future frames
      for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
        const key = isOpp ? 'oppPositions' : 'positions';
        if (frames[fi][key] && idx < frames[fi][key].length) {
          frames[fi][key][idx] = null;
        }
      }
      saveFrames();
    }

    function makeDraggable(circle) {
      let dragging = false, startX, startY, startLeft, startTop;
      let groupStarts = [];
      const inp = circle.querySelector('.tb-num');

      function onPointerDown(e) {
        if (e.button === 2) return; // right-click handled separately
        e.preventDefault();

        // Ctrl+Click: toggle selection
        if (e.ctrlKey || e.metaKey) {
          toggleSelect(circle);
          return;
        }

        pushUndo();
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseFloat(circle.style.left);
        startTop = parseFloat(circle.style.top);
        circle.classList.add('tb-dragging');
        circle.setPointerCapture(e.pointerId);

        // If dragging a selected item, prepare group drag (includes arrows/rects)
        if (selected.has(circle) && selected.size > 1) {
          groupStarts = buildGroupStarts(circle);
        } else {
          groupStarts = [];
        }
      }
      function onPointerMove(e) {
        if (!dragging) return;
        const { dx, dy } = computeDelta(e, startX, startY);
        circle.style.left = Math.max(0, Math.min(100, startLeft + dx)) + '%';
        circle.style.top = Math.max(0, Math.min(100, startTop + dy)) + '%';
        groupStarts.forEach(g => moveEl(g.el, g.pos, dx, dy));
      }
      function onPointerUp() {
        if (!dragging) return;
        dragging = false;
        circle.classList.remove('tb-dragging');
        if (groupStarts.length) saveAll(); else saveState();
        groupStarts = [];
      }

      circle.addEventListener('pointerdown', onPointerDown);
      circle.addEventListener('pointermove', onPointerMove);
      circle.addEventListener('pointerup', onPointerUp);
      circle.addEventListener('pointercancel', onPointerUp);

      // Right-click context menu
      circle.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        const currentColor = circle.dataset.color || circle.style.backgroundColor || '#ffffff';
        const hexColor = currentColor.startsWith('#') ? currentColor : rgbToHex(currentColor);
        const items = [];

        // If multi-selected, offer group color + delete
        if (selected.has(circle) && selected.size > 1) {
          items.push({
            type: 'color', value: hexColor,
            action: (col) => { pushUndo(); selected.forEach(c => applyColorToCircle(c, col)); }
          });
          items.push({
            label: 'Delete selected (' + selected.size + ')', danger: true,
            action: () => { pushUndo(); const toDelete = [...selected]; toDelete.forEach(c => deleteCircle(c)); }
          });
        } else {
          items.push({
            type: 'color', value: hexColor,
            action: (col) => { pushUndo(); applyColorToCircle(circle, col); }
          });
          items.push({
            label: 'Delete', danger: true,
            action: () => { pushUndo(); deleteCircle(circle); }
          });
        }
        showCtxMenu(e.clientX, e.clientY, items);
      });

      circle.addEventListener('dblclick', () => {
        pushUndo();
        inp.style.pointerEvents = 'auto';
        inp.focus();
        inp.select();
      });
      inp.addEventListener('blur', () => {
        inp.style.pointerEvents = 'none';
        saveState();
      });
    }

    // Right-click on field to add player
    inner.addEventListener('contextmenu', e => {
      if (e.target.closest('.tb-circle') || e.target.closest('.tb-ball') || e.target.closest('.tb-silhouette')) return;
      e.preventDefault();
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctLeft, pctTop;
      if (isCssRotated && vert) {
        pctLeft = ((rect.bottom - e.clientY) / rect.height) * 100;
        pctTop = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        pctLeft = ((e.clientX - rect.left) / rect.width) * 100;
        pctTop = ((e.clientY - rect.top) / rect.height) * 100;
      }
      const items = [
        { label: 'Add player', action: () => addCircleAt(pctLeft, pctTop, false) }
      ];
      if (document.getElementById('tb-show-opp')?.checked) {
        items.push({ label: 'Add opponent', action: () => addCircleAt(pctLeft, pctTop, true) });
      }
      items.push({ label: 'Add ball', action: () => {
        pushUndo();
        spawnBall(pctLeft, pctTop);
        saveBalls(); autoSaveFrame();
        const ballsArr = JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]');
        const newBall = ballsArr[ballsArr.length - 1];
        if (newBall) {
          for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
            frames[fi].balls = (frames[fi].balls || []).concat([newBall]);
          }
          saveFrames();
        }
      } });
      showCtxMenu(e.clientX, e.clientY, items);
    });

    // Click on field background clears selection
    inner.addEventListener('pointerdown', e => {
      if (!e.ctrlKey && !e.metaKey && !e.target.closest('.tb-circle') && !e.target.closest('.tb-ball') && !e.target.closest('.tb-arrow') && !e.target.closest('.tb-rect') && !e.target.closest('.tb-text-label') && !e.target.closest('.tb-cone')) {
        clearSelection();
        deselectAll();
      }
    });

    // Ctrl+Z undo
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (document.querySelector('.tb-field') && undoStack.length) {
          e.preventDefault();
          popUndo();
        }
      }
    });

    // --- Ctrl+C / Ctrl+V copy-paste (selected elements only) ---
    let tbClipboard = null;
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || !document.querySelector('.tb-field')) return;

      if (e.key === 'c' && !e.shiftKey) {
        if (selected.size === 0) return; // nothing selected
        e.preventDefault();
        const circles = [];
        const oppCircles = [];
        const arrows = [];
        const penLines = [];
        const rects = [];
        const texts = [];
        const cones = [];
        const balls = [];

        selected.forEach(el => {
          if (el.classList.contains('tb-ball')) {
            balls.push({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) });
          } else if (el.classList.contains('tb-circle') && !el.classList.contains('tb-circle-opp')) {
            circles.push({
              left: parseFloat(el.style.left),
              top: parseFloat(el.style.top),
              num: el.querySelector('.tb-num')?.value || '',
              color: el.dataset.color || ''
            });
          } else if (el.classList.contains('tb-circle-opp')) {
            oppCircles.push({
              left: parseFloat(el.style.left),
              top: parseFloat(el.style.top),
              num: el.querySelector('.tb-num')?.value || '',
              color: ''
            });
          } else if (el.classList.contains('tb-arrow')) {
            arrows.push({
              x1: parseFloat(el.getAttribute('x1')),
              y1: parseFloat(el.getAttribute('y1')),
              x2: parseFloat(el.getAttribute('x2')),
              y2: parseFloat(el.getAttribute('y2')),
              color: el.dataset.color || '#ffffff',
              dash: el.dataset.dash === '1'
            });
          } else if (el.classList.contains('tb-pen-line')) {
            penLines.push({
              points: el.getAttribute('points') || '',
              color: el.dataset.color || '#ffffff',
              dash: el.dataset.dash === '1'
            });
          } else if (el.classList.contains('tb-rect')) {
            rects.push({
              x: parseFloat(el.getAttribute('x')),
              y: parseFloat(el.getAttribute('y')),
              w: parseFloat(el.getAttribute('width')),
              h: parseFloat(el.getAttribute('height')),
              color: el.dataset.color || '#ffffff',
              opacity: parseFloat(el.dataset.opacity) || 0.3
            });
          } else if (el.classList.contains('tb-text-label')) {
            texts.push({
              left: parseFloat(el.style.left),
              top: parseFloat(el.style.top),
              text: el.textContent,
              color: el.dataset.color || '#000000',
              opacity: parseFloat(el.dataset.opacity) || 0.8,
              w: el.style.width ? parseFloat(el.style.width) : null,
              h: el.style.height ? parseFloat(el.style.height) : null,
              fontSize: el.style.fontSize ? parseFloat(el.style.fontSize) : null
            });
          } else if (el.classList.contains('tb-cone')) {
            cones.push({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) });
          }
        });

        tbClipboard = { circles, oppCircles, arrows, penLines, rects, texts, cones, balls };
      }

      if (e.key === 'v' && !e.shiftKey && tbClipboard) {
        e.preventDefault();
        pushUndo();
        const OFFSET = 3; // % offset so pasted items are visually distinct

        // Paste team circles — each gets a fresh stable index
        tbClipboard.circles.forEach(c => {
          const tc = document.getElementById('tb-team-color')?.value || '#ffffff';
          const selector = '.tb-circle:not(.tb-circle-opp)';
          const storageKey = 'fa_tactic_positions';
          const storedArr = JSON.parse(localStorage.getItem(storageKey) || '[]');
          let maxIdx = storedArr.length - 1;
          inner.querySelectorAll(selector).forEach(el => {
            const idx = Number(el.dataset.idx);
            if (idx > maxIdx) maxIdx = idx;
          });
          const newIdx = maxIdx + 1;
          const pasteLeft = Math.min(98, c.left + OFFSET);
          const pasteTop = Math.min(98, c.top + OFFSET);
          const bg = c.color || tc;
          const isGk = c.num === '1';
          const finalBg = isGk ? GK_COLOR : bg;
          const div = document.createElement('div');
          div.className = 'tb-circle';
          div.dataset.idx = newIdx;
          if (c.color) div.dataset.color = c.color;
          div.style.left = pasteLeft + '%';
          div.style.top = pasteTop + '%';
          div.style.background = finalBg;
          div.style.borderColor = darkenHex(finalBg, 50);
          const inp = document.createElement('input');
          inp.className = 'tb-num'; inp.maxLength = 2;
          inp.value = c.num;
          inp.style.color = textColorFor(finalBg);
          inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); });
          div.appendChild(inp);
          makeDraggable(div);
          inner.appendChild(div);
          saveState();
          // Propagate to future frames
          const h = toHorizontal(pasteLeft, pasteTop);
          const hPos = [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100];
          for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
            if (!frames[fi].positions) frames[fi].positions = [];
            while (frames[fi].positions.length <= newIdx) frames[fi].positions.push(null);
            frames[fi].positions[newIdx] = hPos;
          }
        });

        // Paste opp circles
        tbClipboard.oppCircles.forEach(c => {
          const oc = document.getElementById('tb-opp-color')?.value || '#e53935';
          const selector = '.tb-circle-opp';
          const storageKey = 'fa_tactic_opp_positions';
          const storedArr = JSON.parse(localStorage.getItem(storageKey) || '[]');
          let maxIdx = storedArr.length - 1;
          inner.querySelectorAll(selector).forEach(el => {
            const idx = Number(el.dataset.idx);
            if (idx > maxIdx) maxIdx = idx;
          });
          const newIdx = maxIdx + 1;
          const pasteLeft = Math.min(98, c.left + OFFSET);
          const pasteTop = Math.min(98, c.top + OFFSET);
          const isGk = c.num === '1';
          const finalBg = isGk ? GK_COLOR : oc;
          const div = document.createElement('div');
          div.className = 'tb-circle tb-circle-opp';
          div.dataset.idx = newIdx;
          div.style.left = pasteLeft + '%';
          div.style.top = pasteTop + '%';
          div.style.background = finalBg;
          div.style.borderColor = darkenHex(finalBg, 50);
          const inp = document.createElement('input');
          inp.className = 'tb-num'; inp.maxLength = 2;
          inp.value = c.num;
          inp.style.color = textColorFor(finalBg);
          inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); });
          div.appendChild(inp);
          makeDraggable(div);
          inner.appendChild(div);
          saveState();
          // Propagate to future frames
          const h = toHorizontal(pasteLeft, pasteTop);
          const hPos = [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100];
          for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
            if (!frames[fi].oppPositions) frames[fi].oppPositions = [];
            while (frames[fi].oppPositions.length <= newIdx) frames[fi].oppPositions.push(null);
            frames[fi].oppPositions[newIdx] = hPos;
          }
        });

        // Paste arrows
        tbClipboard.arrows.forEach(a => {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.classList.add('tb-arrow');
          line.setAttribute('x1', Math.min(98, a.x1 + OFFSET) + '%');
          line.setAttribute('y1', Math.min(98, a.y1 + OFFSET) + '%');
          line.setAttribute('x2', Math.min(98, a.x2 + OFFSET) + '%');
          line.setAttribute('y2', Math.min(98, a.y2 + OFFSET) + '%');
          line.dataset.color = a.color;
          line.style.stroke = a.color;
          line.setAttribute('stroke', a.color);
          if (a.dash) { line.dataset.dash = '1'; line.setAttribute('stroke-dasharray', '6 4'); }
          arrowsSvg.appendChild(line);
        });
        if (tbClipboard.arrows.length) { reindexArrows(); saveArrows(); refreshArrowheads(arrowsSvg); }

        // Paste pen lines — offset each point
        tbClipboard.penLines.forEach(p => {
          const offsetPts = p.points.split(' ').map(pair => {
            const [x, y] = pair.split(',').map(Number);
            return Math.min(98, x + OFFSET) + ',' + Math.min(98, y + OFFSET);
          }).join(' ');
          spawnPenLine(offsetPts, p.color, p.dash);
        });
        if (tbClipboard.penLines.length) savePenLines();

        // Paste rects
        tbClipboard.rects.forEach(r => {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.classList.add('tb-rect');
          rect.setAttribute('x', Math.min(98, r.x + OFFSET) + '%');
          rect.setAttribute('y', Math.min(98, r.y + OFFSET) + '%');
          rect.setAttribute('width', r.w + '%');
          rect.setAttribute('height', r.h + '%');
          rect.dataset.color = r.color;
          rect.dataset.opacity = r.opacity;
          rect.style.fill = r.color;
          rect.style.fillOpacity = r.opacity;
          rect.style.stroke = r.color;
          arrowsSvg.appendChild(rect);
        });
        if (tbClipboard.rects.length) { reindexRects(); saveRects(); }

        // Paste texts
        tbClipboard.texts.forEach(t => {
          createTextLabel(
            Math.min(98, t.left + OFFSET),
            Math.min(98, t.top + OFFSET),
            t.text, t.color, t.opacity, t.w, t.h, t.fontSize
          );
        });
        if (tbClipboard.texts.length) saveTexts();

        // Paste cones
        tbClipboard.cones.forEach(c => {
          spawnCone(Math.min(98, c.left + OFFSET), Math.min(98, c.top + OFFSET));
        });
        if (tbClipboard.cones.length) saveCones();

        // Paste balls
        tbClipboard.balls.forEach(b => {
          spawnBall(Math.min(98, b.left + OFFSET), Math.min(98, b.top + OFFSET));
        });
        if (tbClipboard.balls.length) saveBalls();

        if (tbClipboard.circles.length || tbClipboard.oppCircles.length) {
          syncNumbersAcrossFrames();
          syncColorsAcrossFrames();
        }

        // Save current frame first so all pasted elements are captured
        autoSaveFrame();

        // Propagate pasted non-circle elements to future frames
        // Build horizontal-coord versions of newly pasted items
        const pastedArrowsH = tbClipboard.arrows.map(a => {
          const h1 = toHorizontal(Math.min(98, a.x1 + OFFSET), Math.min(98, a.y1 + OFFSET));
          const h2 = toHorizontal(Math.min(98, a.x2 + OFFSET), Math.min(98, a.y2 + OFFSET));
          return [Math.round(h1[0]*100)/100, Math.round(h1[1]*100)/100,
                  Math.round(h2[0]*100)/100, Math.round(h2[1]*100)/100, a.color, a.dash];
        });
        const pastedRectsH = tbClipboard.rects.map(r => {
          const ox = Math.min(98, r.x + OFFSET), oy = Math.min(98, r.y + OFFSET);
          const tl = toHorizontal(ox, oy);
          const br = toHorizontal(ox + r.w, oy + r.h);
          const hx = Math.min(tl[0], br[0]), hy = Math.min(tl[1], br[1]);
          const hw = Math.abs(br[0] - tl[0]), hh = Math.abs(br[1] - tl[1]);
          return [Math.round(hx*100)/100, Math.round(hy*100)/100,
                  Math.round(hw*100)/100, Math.round(hh*100)/100, r.color, r.opacity];
        });
        const pastedTextsH = tbClipboard.texts.map(t => {
          const h = toHorizontal(Math.min(98, t.left + OFFSET), Math.min(98, t.top + OFFSET));
          return [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100,
                  t.text, t.color, t.opacity, t.w, t.h, t.fontSize];
        });
        const pastedPenLinesH = tbClipboard.penLines.map(p => {
          const offsetPts = p.points.split(' ').map(pair => {
            const [x, y] = pair.split(',').map(Number);
            return Math.min(98, x + OFFSET) + ',' + Math.min(98, y + OFFSET);
          }).join(' ');
          return [offsetPts, p.color, p.dash];
        });
        const pastedConesH = tbClipboard.cones.map(c => {
          const h = toHorizontal(Math.min(98, c.left + OFFSET), Math.min(98, c.top + OFFSET));
          return [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100];
        });
        const pastedBallsH = tbClipboard.balls.map(b => {
          const h = toHorizontal(Math.min(98, b.left + OFFSET), Math.min(98, b.top + OFFSET));
          return [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100];
        });

        for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
          if (pastedArrowsH.length) frames[fi].arrows = (frames[fi].arrows || []).concat(pastedArrowsH);
          if (pastedRectsH.length) frames[fi].rects = (frames[fi].rects || []).concat(pastedRectsH);
          if (pastedTextsH.length) frames[fi].texts = (frames[fi].texts || []).concat(pastedTextsH);
          if (pastedPenLinesH.length) frames[fi].penLines = (frames[fi].penLines || []).concat(pastedPenLinesH);
          if (pastedConesH.length) frames[fi].cones = (frames[fi].cones || []).concat(pastedConesH);
          if (pastedBallsH.length) frames[fi].balls = (frames[fi].balls || []).concat(pastedBallsH);
        }
        saveFrames();
      }
    });

    // RGB string to hex helper
    function rgbToHex(rgb) {
      const m = rgb.match(/\d+/g);
      if (!m || m.length < 3) return '#ffffff';
      return '#' + m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
    }

    // --- Arrows ---
    const arrowsSvg = document.getElementById('tb-arrows-svg');
    const arrowDefs = document.getElementById('tb-arrow-defs');
    let arrowMode = false;
    let rectMode = false;
    let textMode = false;
    let penMode = false;
    const arrowToolBtn = document.getElementById('tb-arrow-tool');
    const arrowColorInput = document.getElementById('tb-arrow-color');
    const arrowDashInput = document.getElementById('tb-arrow-dash');
    const rectToolBtn = document.getElementById('tb-rect-tool');
    const rectColorInput = document.getElementById('tb-rect-color');
    const rectOpacityInput = document.getElementById('tb-rect-opacity');
    const textToolBtn = document.getElementById('tb-text-tool');
    const textColorInput = document.getElementById('tb-text-color');
    const textOpacityInput = document.getElementById('tb-text-opacity');
    const textSizeInput = document.getElementById('tb-text-size');
    const penToolBtn = document.getElementById('tb-pen-tool');
    const penColorInput = document.getElementById('tb-pen-color');
    const penDashInput = document.getElementById('tb-pen-dash');
    let selectedPenLine = null;
    let selectedTextLabel = null;
    let selectedArrow = null;
    let selectedRect = null;

    function selectTextLabel(el) {
      if (selectedTextLabel) selectedTextLabel.classList.remove('tb-text-selected');
      selectedTextLabel = el;
      if (el) {
        el.classList.add('tb-text-selected');
        if (textColorInput) textColorInput.value = el.dataset.color || '#000000';
        if (textOpacityInput) textOpacityInput.value = Math.round((parseFloat(el.dataset.opacity) || 0.8) * 100);
        if (textSizeInput) textSizeInput.value = parseFloat(el.style.fontSize) || 12;
      }
    }
    function selectArrow(el) {
      if (selectedArrow) selectedArrow.classList.remove('tb-arrow-selected');
      selectedArrow = el;
      if (el) {
        el.classList.add('tb-arrow-selected');
        if (arrowColorInput) arrowColorInput.value = el.dataset.color || '#ffffff';
        if (arrowDashInput) arrowDashInput.checked = el.dataset.dash === '1';
      }
    }
    function selectRect(el) {
      if (selectedRect) selectedRect.classList.remove('tb-rect-selected');
      selectedRect = el;
      if (el) {
        el.classList.add('tb-rect-selected');
        if (rectColorInput) rectColorInput.value = el.dataset.color || '#ffffff';
        if (rectOpacityInput) rectOpacityInput.value = Math.round((parseFloat(el.dataset.opacity) || 0.3) * 100);
      }
    }
    function selectPenLine(el) {
      if (selectedPenLine) selectedPenLine.classList.remove('tb-pen-selected');
      selectedPenLine = el;
      if (el) {
        el.classList.add('tb-pen-selected');
        if (penColorInput) penColorInput.value = el.dataset.color || '#ffffff';
        if (penDashInput) penDashInput.checked = el.dataset.dash === '1';
      }
    }
    function deselectAll() {
      selectTextLabel(null);
      selectArrow(null);
      selectRect(null);
      selectPenLine(null);
    }

    function deactivateDrawTools() {
      arrowMode = false;
      rectMode = false;
      textMode = false;
      penMode = false;
      coneMode = false;
      if (arrowToolBtn) arrowToolBtn.classList.remove('tb-arrow-tool-active');
      if (rectToolBtn) rectToolBtn.classList.remove('tb-rect-tool-active');
      if (textToolBtn) textToolBtn.classList.remove('tb-text-tool-active');
      if (penToolBtn) penToolBtn.classList.remove('tb-pen-tool-active');
      if (coneToolBtn) coneToolBtn.classList.remove('tb-cone-tool-active');
      inner.style.cursor = '';
    }

    if (arrowToolBtn) {
      arrowToolBtn.addEventListener('click', () => {
        const wasActive = arrowMode;
        deactivateDrawTools();
        if (!wasActive) {
          arrowMode = true;
          arrowToolBtn.classList.add('tb-arrow-tool-active');
          inner.style.cursor = 'crosshair';
        }
      });
    }
    if (arrowColorInput) {
      let arrowColorUndoPushed = false;
      arrowColorInput.addEventListener('pointerdown', () => { arrowColorUndoPushed = false; });
      arrowColorInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_arrow_color', arrowColorInput.value);
        if (selectedArrow) {
          if (!arrowColorUndoPushed) { pushUndo(); arrowColorUndoPushed = true; }
          const col = arrowColorInput.value;
          selectedArrow.dataset.color = col;
          selectedArrow.style.stroke = col;
          selectedArrow.setAttribute('stroke', col);
          saveArrows(); refreshArrowheads(arrowsSvg); autoSaveFrame();
        }
      });
    }
    if (arrowDashInput) {
      arrowDashInput.addEventListener('change', () => {
        localStorage.setItem('fa_tactic_arrow_dash', arrowDashInput.checked ? 'true' : 'false');
        if (selectedArrow) {
          pushUndo();
          selectedArrow.dataset.dash = arrowDashInput.checked ? '1' : '';
          if (arrowDashInput.checked) selectedArrow.setAttribute('stroke-dasharray', '6 4');
          else selectedArrow.removeAttribute('stroke-dasharray');
          saveArrows(); autoSaveFrame();
        }
      });
    }
    if (rectToolBtn) {
      rectToolBtn.addEventListener('click', () => {
        const wasActive = rectMode;
        deactivateDrawTools();
        if (!wasActive) {
          rectMode = true;
          rectToolBtn.classList.add('tb-rect-tool-active');
          inner.style.cursor = 'crosshair';
        }
      });
    }
    if (rectColorInput) {
      rectColorInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_rect_color', rectColorInput.value);
        if (selectedRect) {
          pushUndo();
          const col = rectColorInput.value;
          selectedRect.dataset.color = col;
          selectedRect.style.fill = col;
          selectedRect.style.stroke = col;
          saveRects(); autoSaveFrame();
        }
      });
    }
    if (rectOpacityInput) {
      rectOpacityInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_rect_opacity', rectOpacityInput.value);
        if (selectedRect) {
          const op = Number(rectOpacityInput.value) / 100;
          selectedRect.dataset.opacity = op;
          selectedRect.style.fillOpacity = op;
          saveRects(); autoSaveFrame();
        }
      });
      rectOpacityInput.addEventListener('pointerdown', () => { if (selectedRect) pushUndo(); });
    }
    if (textToolBtn) {
      textToolBtn.addEventListener('click', () => {
        const wasActive = textMode;
        deactivateDrawTools();
        if (!wasActive) {
          textMode = true;
          textToolBtn.classList.add('tb-text-tool-active');
          inner.style.cursor = 'crosshair';
        }
      });
    }
    if (textColorInput) {
      textColorInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_text_color', textColorInput.value);
        if (selectedTextLabel) {
          pushUndo();
          selectedTextLabel.dataset.color = textColorInput.value;
          selectedTextLabel.style.background = hexToRgba(textColorInput.value, parseFloat(selectedTextLabel.dataset.opacity) || 0.8);
          selectedTextLabel.style.color = textColorFor(textColorInput.value);
          saveTexts(); autoSaveFrame();
        }
      });
    }
    if (textOpacityInput) {
      textOpacityInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_text_opacity', textOpacityInput.value);
        if (selectedTextLabel) {
          const op = Number(textOpacityInput.value) / 100;
          selectedTextLabel.dataset.opacity = op;
          selectedTextLabel.style.background = hexToRgba(selectedTextLabel.dataset.color || '#000000', op);
          saveTexts(); autoSaveFrame();
        }
      });
      textOpacityInput.addEventListener('pointerdown', () => { if (selectedTextLabel) pushUndo(); });
    }
    if (textSizeInput) {
      textSizeInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_text_size', textSizeInput.value);
        if (selectedTextLabel) {
          selectedTextLabel.style.fontSize = textSizeInput.value + 'px';
          saveTexts(); autoSaveFrame();
        }
      });
      textSizeInput.addEventListener('pointerdown', () => { if (selectedTextLabel) pushUndo(); });
    }

    function saveArrows() {
      const lines = arrowsSvg.querySelectorAll('.tb-arrow');
      const arrows = [];
      lines.forEach(l => {
        const x1 = parseFloat(l.getAttribute('x1'));
        const y1 = parseFloat(l.getAttribute('y1'));
        const x2 = parseFloat(l.getAttribute('x2'));
        const y2 = parseFloat(l.getAttribute('y2'));
        const h1 = toHorizontal(x1, y1);
        const h2 = toHorizontal(x2, y2);
        arrows.push([Math.round(h1[0]*100)/100, Math.round(h1[1]*100)/100,
                      Math.round(h2[0]*100)/100, Math.round(h2[1]*100)/100,
                      l.dataset.color || '#ffffff',
                      l.dataset.dash === '1']);
      });
      localStorage.setItem('fa_tactic_arrows', JSON.stringify(arrows));
    }

    function deleteArrow(lineEl) {
      lineEl.remove();
      reindexArrows();
      saveArrows();
      refreshArrowheads(arrowsSvg);
      autoSaveFrame();
    }

    function reindexArrows() {
      arrowsSvg.querySelectorAll('.tb-arrow').forEach((l, i) => l.dataset.idx = i);
    }

    // Arrow right-click
    arrowsSvg.addEventListener('contextmenu', e => {
      const line = e.target.closest('.tb-arrow');
      const pen = e.target.closest('.tb-pen-line');
      if (line) {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Delete arrow', danger: true, action: () => { pushUndo(); deleteArrow(line); } }
        ]);
      } else if (pen) {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Delete pen line', danger: true, action: () => { pushUndo(); pen.remove(); savePenLines(); autoSaveFrame(); } }
        ]);
      }
    });

    // --- Pen tool ---
    function savePenLines() {
      const lines = arrowsSvg.querySelectorAll('.tb-pen-line');
      const arr = [];
      lines.forEach(pl => {
        const pts = pl.getAttribute('points') || '';
        // Store raw display points + color + dash
        arr.push([pts, pl.dataset.color || '#ffffff', pl.dataset.dash === '1']);
      });
      localStorage.setItem('fa_tactic_pen_lines', JSON.stringify(arr));
    }

    function spawnPenLine(pointsStr, color, dash) {
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.classList.add('tb-pen-line');
      pl.setAttribute('points', pointsStr);
      pl.style.stroke = color;
      pl.dataset.color = color;
      pl.dataset.dash = dash ? '1' : '';
      if (dash) pl.setAttribute('stroke-dasharray', '6 4');
      arrowsSvg.appendChild(pl);
      return pl;
    }

    // Restore saved pen lines
    const savedPenLines = JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]');
    savedPenLines.forEach(p => spawnPenLine(p[0], p[1], p[2]));

    if (penToolBtn) {
      penToolBtn.addEventListener('click', () => {
        const wasActive = penMode;
        deactivateDrawTools();
        if (!wasActive) {
          penMode = true;
          penToolBtn.classList.add('tb-pen-tool-active');
          inner.style.cursor = 'crosshair';
        }
      });
    }
    if (penColorInput) {
      penColorInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_pen_color', penColorInput.value);
        if (selectedPenLine) {
          pushUndo();
          const col = penColorInput.value;
          selectedPenLine.style.stroke = col;
          selectedPenLine.dataset.color = col;
          savePenLines();
          autoSaveFrame();
        }
      });
    }
    if (penDashInput) {
      penDashInput.addEventListener('change', () => {
        localStorage.setItem('fa_tactic_pen_dash', penDashInput.checked);
        if (selectedPenLine) {
          pushUndo();
          selectedPenLine.dataset.dash = penDashInput.checked ? '1' : '';
          if (penDashInput.checked) selectedPenLine.setAttribute('stroke-dasharray', '6 4');
          else selectedPenLine.removeAttribute('stroke-dasharray');
          savePenLines();
          autoSaveFrame();
        }
      });
    }

    // Pen freehand draw handlers
    let penDraw = null;
    inner.addEventListener('pointerdown', e => {
      if (!penMode) return;
      if (e.target.closest('.tb-circle') || e.target.closest('.tb-ball')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      function toPct(ev) {
        let px, py;
        if (isCssRotated && vert) {
          px = ((rect.bottom - ev.clientY) / rect.height) * 100;
          py = ((ev.clientX - rect.left) / rect.width) * 100;
        } else {
          px = ((ev.clientX - rect.left) / rect.width) * 100;
          py = ((ev.clientY - rect.top) / rect.height) * 100;
        }
        return [Math.max(0, Math.min(100, px)), Math.max(0, Math.min(100, py))];
      }
      const [sx, sy] = toPct(e);
      const pColor = penColorInput ? penColorInput.value : '#ffffff';
      const pDash = penDashInput ? penDashInput.checked : false;
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.classList.add('tb-pen-line', 'tb-pen-drawing');
      pl.style.stroke = pColor;
      pl.dataset.color = pColor;
      pl.dataset.dash = pDash ? '1' : '';
      if (pDash) pl.setAttribute('stroke-dasharray', '6 4');
      pl.setAttribute('points', sx + ',' + sy);
      arrowsSvg.appendChild(pl);
      penDraw = { el: pl, toPct, points: [[sx, sy]] };
      inner.setPointerCapture(e.pointerId);
    });
    inner.addEventListener('pointermove', e => {
      if (!penDraw) return;
      const [px, py] = penDraw.toPct(e);
      penDraw.points.push([px, py]);
      // Downsample: skip if very close to last recorded point
      const pts = penDraw.points;
      const last = pts[pts.length - 2];
      if (last && Math.abs(px - last[0]) < 0.5 && Math.abs(py - last[1]) < 0.5) {
        penDraw.points.pop();
        return;
      }
      penDraw.el.setAttribute('points', penDraw.points.map(p => p[0]+','+p[1]).join(' '));
    });
    inner.addEventListener('pointerup', e => {
      if (!penDraw) return;
      penDraw.el.classList.remove('tb-pen-drawing');
      // If too short (fewer than 3 points), discard
      if (penDraw.points.length < 3) {
        penDraw.el.remove();
      } else {
        pushUndo();
        savePenLines();
        autoSaveFrame();
      }
      penDraw = null;
    });

    // --- Drag arrows, rects & pen lines ---
    let svgDrag = null;
    arrowsSvg.addEventListener('pointerdown', e => {
      if (arrowMode || rectMode || penMode) return; // in draw mode, don't drag
      const target = e.target.closest('.tb-arrow') || e.target.closest('.tb-rect') || e.target.closest('.tb-pen-line');
      if (!target) return;
      if (e.button === 2) return; // right-click
      e.preventDefault();
      e.stopPropagation();

      // Select the element for toolbar editing
      if (target.classList.contains('tb-arrow')) {
        deselectAll();
        selectArrow(target);
      } else if (target.classList.contains('tb-rect')) {
        deselectAll();
        selectRect(target);
      } else if (target.classList.contains('tb-pen-line')) {
        deselectAll();
        selectPenLine(target);
      }

      // Ctrl+Click: toggle selection
      if (e.ctrlKey || e.metaKey) {
        toggleSelect(target);
        return;
      }

      const startPos = getElPos(target);
      svgDrag = {
        el: target,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPos,
        groupStarts: (selected.has(target) && selected.size > 1) ? buildGroupStarts(target) : []
      };
      target.setPointerCapture(e.pointerId);
    });
    arrowsSvg.addEventListener('pointermove', e => {
      if (!svgDrag) return;
      const { dx, dy } = computeDelta(e, svgDrag.startClientX, svgDrag.startClientY);
      moveEl(svgDrag.el, svgDrag.startPos, dx, dy);
      svgDrag.groupStarts.forEach(g => moveEl(g.el, g.pos, dx, dy));
    });
    arrowsSvg.addEventListener('pointerup', e => {
      if (!svgDrag) return;
      pushUndo();
      if (svgDrag.groupStarts.length) saveAll();
      else {
        if (svgDrag.el.classList.contains('tb-arrow')) saveArrows();
        else if (svgDrag.el.classList.contains('tb-pen-line')) savePenLines();
        else saveRects();
      }
      refreshArrowheads(arrowsSvg);
      autoSaveFrame();
      svgDrag = null;
    });
    arrowsSvg.addEventListener('pointercancel', () => { svgDrag = null; });

    // Draw arrows: click-drag when arrow tool is active
    let arrowDraw = null;
    inner.addEventListener('pointerdown', e => {
      if (!arrowMode) return;
      if (e.target.closest('.tb-circle') || e.target.closest('.tb-ball')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((rect.bottom - e.clientY) / rect.height) * 100;
        pctY = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        pctX = ((e.clientX - rect.left) / rect.width) * 100;
        pctY = ((e.clientY - rect.top) / rect.height) * 100;
      }
      const aColor = arrowColorInput ? arrowColorInput.value : '#ffffff';
      const aDash = arrowDashInput ? arrowDashInput.checked : false;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.classList.add('tb-arrow', 'tb-arrow-drawing');
      line.setAttribute('x1', pctX + '%');
      line.setAttribute('y1', pctY + '%');
      line.setAttribute('x2', pctX + '%');
      line.setAttribute('y2', pctY + '%');
      line.style.stroke = aColor;
      line.setAttribute('stroke', aColor);
      line.dataset.color = aColor;
      line.dataset.dash = aDash ? '1' : '';
      if (aDash) line.setAttribute('stroke-dasharray', '6 4');
      arrowsSvg.appendChild(line);
      arrowDraw = { line };
      inner.setPointerCapture(e.pointerId);
    });
    inner.addEventListener('pointermove', e => {
      if (!arrowDraw) return;
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((rect.bottom - e.clientY) / rect.height) * 100;
        pctY = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        pctX = ((e.clientX - rect.left) / rect.width) * 100;
        pctY = ((e.clientY - rect.top) / rect.height) * 100;
      }
      pctX = Math.max(0, Math.min(100, pctX));
      pctY = Math.max(0, Math.min(100, pctY));
      arrowDraw.line.setAttribute('x2', pctX + '%');
      arrowDraw.line.setAttribute('y2', pctY + '%');
    });
    inner.addEventListener('pointerup', e => {
      if (!arrowDraw) return;
      const line = arrowDraw.line;
      line.classList.remove('tb-arrow-drawing');
      // If too short, remove
      const dx = parseFloat(line.getAttribute('x2')) - parseFloat(line.getAttribute('x1'));
      const dy = parseFloat(line.getAttribute('y2')) - parseFloat(line.getAttribute('y1'));
      if (Math.sqrt(dx*dx + dy*dy) < 2) {
        line.remove();
      } else {
        reindexArrows();
        pushUndo();
        saveArrows();
        refreshArrowheads(arrowsSvg);
      }
      arrowDraw = null;
    });

    // --- Rectangles ---
    function saveRects() {
      const rects = arrowsSvg.querySelectorAll('.tb-rect');
      const arr = [];
      rects.forEach(r => {
        const x = parseFloat(r.getAttribute('x'));
        const y = parseFloat(r.getAttribute('y'));
        const w = parseFloat(r.getAttribute('width'));
        const h = parseFloat(r.getAttribute('height'));
        const tl = toHorizontal(x, y);
        const br = toHorizontal(x + w, y + h);
        const hx = Math.min(tl[0], br[0]);
        const hy = Math.min(tl[1], br[1]);
        const hw = Math.abs(br[0] - tl[0]);
        const hh = Math.abs(br[1] - tl[1]);
        arr.push([Math.round(hx*100)/100, Math.round(hy*100)/100,
                   Math.round(hw*100)/100, Math.round(hh*100)/100,
                   r.dataset.color || '#ffffff',
                   parseFloat(r.dataset.opacity) || 0.3]);
      });
      localStorage.setItem('fa_tactic_rects', JSON.stringify(arr));
    }

    function deleteRect(rectEl) {
      rectEl.remove();
      reindexRects();
      saveRects();
    }

    function reindexRects() {
      arrowsSvg.querySelectorAll('.tb-rect').forEach((r, i) => r.dataset.idx = i);
    }

    // Rect right-click
    arrowsSvg.addEventListener('contextmenu', e => {
      const rectEl = e.target.closest('.tb-rect');
      if (!rectEl) return;
      e.preventDefault();
      e.stopPropagation();
      showCtxMenu(e.clientX, e.clientY, [
        { label: 'Delete rectangle', danger: true, action: () => { pushUndo(); deleteRect(rectEl); } }
      ]);
    });

    // Draw rects: click-drag when rect tool is active
    let rectDraw = null;
    inner.addEventListener('pointerdown', e => {
      if (!rectMode) return;
      if (e.target.closest('.tb-circle') || e.target.closest('.tb-ball')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      const bounds = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((bounds.bottom - e.clientY) / bounds.height) * 100;
        pctY = ((e.clientX - bounds.left) / bounds.width) * 100;
      } else {
        pctX = ((e.clientX - bounds.left) / bounds.width) * 100;
        pctY = ((e.clientY - bounds.top) / bounds.height) * 100;
      }
      const rColor = rectColorInput ? rectColorInput.value : '#ffffff';
      const rOp = rectOpacityInput ? (parseInt(rectOpacityInput.value, 10) / 100) : 0.3;
      const svgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      svgRect.classList.add('tb-rect', 'tb-rect-drawing');
      svgRect.setAttribute('x', pctX + '%');
      svgRect.setAttribute('y', pctY + '%');
      svgRect.setAttribute('width', '0%');
      svgRect.setAttribute('height', '0%');
      svgRect.style.fill = rColor;
      svgRect.style.fillOpacity = rOp;
      svgRect.style.stroke = rColor;
      svgRect.dataset.color = rColor;
      svgRect.dataset.opacity = rOp;
      // Insert rects before arrows so arrows render on top
      const firstArrow = arrowsSvg.querySelector('.tb-arrow');
      if (firstArrow) arrowsSvg.insertBefore(svgRect, firstArrow);
      else arrowsSvg.appendChild(svgRect);
      rectDraw = { el: svgRect, startX: pctX, startY: pctY };
      inner.setPointerCapture(e.pointerId);
    });
    inner.addEventListener('pointermove', e => {
      if (!rectDraw) return;
      const bounds = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((bounds.bottom - e.clientY) / bounds.height) * 100;
        pctY = ((e.clientX - bounds.left) / bounds.width) * 100;
      } else {
        pctX = ((e.clientX - bounds.left) / bounds.width) * 100;
        pctY = ((e.clientY - bounds.top) / bounds.height) * 100;
      }
      pctX = Math.max(0, Math.min(100, pctX));
      pctY = Math.max(0, Math.min(100, pctY));
      const x = Math.min(rectDraw.startX, pctX);
      const y = Math.min(rectDraw.startY, pctY);
      const w = Math.abs(pctX - rectDraw.startX);
      const h = Math.abs(pctY - rectDraw.startY);
      rectDraw.el.setAttribute('x', x + '%');
      rectDraw.el.setAttribute('y', y + '%');
      rectDraw.el.setAttribute('width', w + '%');
      rectDraw.el.setAttribute('height', h + '%');
    });
    inner.addEventListener('pointerup', e => {
      if (!rectDraw) return;
      const el = rectDraw.el;
      el.classList.remove('tb-rect-drawing');
      const w = parseFloat(el.getAttribute('width'));
      const h = parseFloat(el.getAttribute('height'));
      if (w < 1 && h < 1) {
        el.remove();
      } else {
        reindexRects();
        pushUndo();
        saveRects();
      }
      rectDraw = null;
    });

    // --- Text labels ---
    function saveTexts() {
      const labels = inner.querySelectorAll('.tb-text-label');
      const arr = [];
      labels.forEach(el => {
        const dL = parseFloat(el.style.left);
        const dT = parseFloat(el.style.top);
        const h = toHorizontal(dL, dT);
        const elW = el.style.width ? parseFloat(el.style.width) : null;
        const elH = el.style.height ? parseFloat(el.style.height) : null;
        const elFs = el.style.fontSize ? parseFloat(el.style.fontSize) : null;
        arr.push([Math.round(h[0]*100)/100, Math.round(h[1]*100)/100,
                   el.textContent,
                   el.dataset.color || '#000000',
                   parseFloat(el.dataset.opacity) || 0.8,
                   elW, elH, elFs]);
      });
      localStorage.setItem('fa_tactic_texts', JSON.stringify(arr));
    }

    function reindexTexts() {
      inner.querySelectorAll('.tb-text-label').forEach((el, i) => el.dataset.idx = i);
    }

    function deleteTextLabel(el) {
      el.remove();
      reindexTexts();
      saveTexts();
    }

    function createTextLabel(pctLeft, pctTop, text, color, opacity, w, h, fontSize) {
      const div = document.createElement('div');
      div.className = 'tb-text-label';
      div.style.left = pctLeft + '%';
      div.style.top = pctTop + '%';
      div.style.background = hexToRgba(color, opacity);
      div.style.color = textColorFor(color);
      div.dataset.color = color;
      div.dataset.opacity = opacity;
      if (w) div.style.width = w + 'px';
      if (h) div.style.height = h + 'px';
      if (fontSize) div.style.fontSize = fontSize + 'px';
      div.textContent = text;
      makeTextDraggable(div);
      inner.appendChild(div);
      reindexTexts();
      return div;
    }

    function makeTextDraggable(el) {
      let dragging = false, startX, startY, startLeft, startTop;
      el.addEventListener('pointerdown', e => {
        if (e.button === 2) return;
        // Allow native resize when clicking near bottom-right corner
        const r = el.getBoundingClientRect();
        if (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) return;
        e.preventDefault();
        e.stopPropagation();
        // Ctrl+Click: toggle selection
        if (e.ctrlKey || e.metaKey) {
          toggleSelect(el);
          return;
        }
        deselectAll();
        selectTextLabel(el);
        pushUndo();
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        startLeft = parseFloat(el.style.left);
        startTop = parseFloat(el.style.top);
        el.classList.add('tb-dragging');
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', e => {
        if (!dragging) return;
        const rect = inner.getBoundingClientRect();
        const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
        const vert = field.classList.contains('tb-vertical');
        let dx, dy;
        if (isCssRotated && vert) {
          dx = -((e.clientY - startY) / rect.height) * 100;
          dy = ((e.clientX - startX) / rect.width) * 100;
        } else {
          dx = ((e.clientX - startX) / rect.width) * 100;
          dy = ((e.clientY - startY) / rect.height) * 100;
        }
        el.style.left = Math.max(0, Math.min(100, startLeft + dx)) + '%';
        el.style.top = Math.max(0, Math.min(100, startTop + dy)) + '%';
      });
      el.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('tb-dragging');
        saveTexts();
        autoSaveFrame();
      });
      el.addEventListener('pointercancel', () => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('tb-dragging');
        saveTexts();
      });
      // Save after native resize
      let resizeTimer = null;
      new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { saveTexts(); autoSaveFrame(); }, 300);
      }).observe(el);
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        const curColor = el.dataset.color || '#000000';
        const items = [
          { type: 'color', value: curColor, action: (col) => {
            pushUndo();
            el.dataset.color = col;
            el.style.background = hexToRgba(col, parseFloat(el.dataset.opacity) || 0.8);
            el.style.color = textColorFor(col);
            saveTexts();
            autoSaveFrame();
          }},
          { label: 'Edit text', action: () => {
            const oldText = el.textContent;
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'tb-text-inline-input';
            inp.style.left = el.style.left;
            inp.style.top = el.style.top;
            inp.value = oldText;
            el.style.visibility = 'hidden';
            inner.appendChild(inp);
            inp.focus();
            inp.select();
            function commitEdit() {
              const txt = inp.value.trim();
              inp.remove();
              el.style.visibility = '';
              if (txt && txt !== oldText) {
                pushUndo();
                el.textContent = txt;
                saveTexts();
                autoSaveFrame();
              }
            }
            inp.addEventListener('keydown', ev => {
              if (ev.key === 'Enter') { ev.preventDefault(); commitEdit(); }
              if (ev.key === 'Escape') { inp.remove(); el.style.visibility = ''; }
            });
            inp.addEventListener('blur', () => { commitEdit(); });
          }},
          { type: 'range', label: 'Size', min: 8, max: 28, value: parseFloat(el.style.fontSize) || 12, action: (val) => {
            pushUndo();
            el.style.fontSize = val + 'px';
            saveTexts();
            autoSaveFrame();
          }},
          { label: 'Delete', danger: true, action: () => {
            pushUndo();
            deleteTextLabel(el);
            autoSaveFrame();
          }}
        ];
        showCtxMenu(e.clientX, e.clientY, items);
      });
    }

    // Bind existing text labels
    inner.querySelectorAll('.tb-text-label').forEach(el => makeTextDraggable(el));

    // Click to place text when text tool is active
    function placeTextAt(pctX, pctY) {
      // Create inline input at position
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'tb-text-inline-input';
      inp.style.left = pctX + '%';
      inp.style.top = pctY + '%';
      inp.placeholder = 'Type text…';
      inner.appendChild(inp);
      inp.focus();
      function commit() {
        const text = inp.value.trim();
        inp.remove();
        if (!text) return;
        const color = textColorInput ? textColorInput.value : '#000000';
        const opacity = textOpacityInput ? (Number(textOpacityInput.value) / 100) : 0.8;
        const fontSize = textSizeInput ? Number(textSizeInput.value) : 12;
        pushUndo();
        createTextLabel(pctX, pctY, text, color, opacity, null, null, fontSize);
        saveTexts();
        autoSaveFrame();
      }
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { inp.remove(); }
      });
      inp.addEventListener('blur', () => { commit(); });
    }
    inner.addEventListener('pointerdown', e => {
      if (!textMode) return;
      if (e.target.closest('.tb-text-label') || e.target.closest('.tb-circle') || e.target.closest('.tb-ball') || e.target.closest('.tb-text-inline-input')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const bounds = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((bounds.bottom - e.clientY) / bounds.height) * 100;
        pctY = ((e.clientX - bounds.left) / bounds.width) * 100;
      } else {
        pctX = ((e.clientX - bounds.left) / bounds.width) * 100;
        pctY = ((e.clientY - bounds.top) / bounds.height) * 100;
      }
      // Remove any existing inline input
      inner.querySelectorAll('.tb-text-inline-input').forEach(i => i.remove());
      placeTextAt(pctX, pctY);
    });

    function saveBalls() {
      const balls = inner.querySelectorAll('.tb-ball');
      const arr = [];
      balls.forEach((b, i) => {
        b.dataset.idx = i;
        const bL = parseFloat(b.style.left), bT = parseFloat(b.style.top);
        const bH = toHorizontal(bL, bT);
        arr.push([Math.round(bH[0]*100)/100, Math.round(bH[1]*100)/100]);
      });
      localStorage.setItem('fa_tactic_balls', JSON.stringify(arr));
    }

    function spawnBall(pctX, pctY) {
      const existing = inner.querySelectorAll('.tb-ball');
      const idx = existing.length;
      const div = document.createElement('div');
      div.className = 'tb-ball';
      div.dataset.idx = idx;
      div.style.left = pctX + '%';
      div.style.top = pctY + '%';
      makeBallDraggable(div);
      inner.appendChild(div);
      return div;
    }

    // Make ball draggable
    function makeBallDraggable(ball) {
      let dragging = false, startX, startY, startLeft, startTop;
      ball.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        // Ctrl+Click: toggle selection
        if (e.ctrlKey || e.metaKey) {
          toggleSelect(ball);
          return;
        }
        pushUndo();
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        startLeft = parseFloat(ball.style.left);
        startTop = parseFloat(ball.style.top);
        ball.classList.add('tb-dragging');
        ball.setPointerCapture(e.pointerId);
      });
      ball.addEventListener('pointermove', e => {
        if (!dragging) return;
        const rect = inner.getBoundingClientRect();
        const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
        const vert = field.classList.contains('tb-vertical');
        let dx, dy;
        if (isCssRotated && vert) {
          dx = -((e.clientY - startY) / rect.height) * 100;
          dy = ((e.clientX - startX) / rect.width) * 100;
        } else {
          dx = ((e.clientX - startX) / rect.width) * 100;
          dy = ((e.clientY - startY) / rect.height) * 100;
        }
        ball.style.left = Math.max(0, Math.min(100, startLeft + dx)) + '%';
        ball.style.top = Math.max(0, Math.min(100, startTop + dy)) + '%';
      });
      ball.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        ball.classList.remove('tb-dragging');
        saveBalls(); autoSaveFrame();
      });
      ball.addEventListener('pointercancel', () => {
        if (!dragging) return;
        dragging = false;
        ball.classList.remove('tb-dragging');
        saveBalls(); autoSaveFrame();
      });
      ball.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Delete ball', danger: true, action: () => { pushUndo(); deleteBall(ball); } }
        ]);
      });
    }

    function deleteBall(ball) {
      const idx = Number(ball.dataset.idx);
      ball.remove();
      selected.delete(ball);
      saveBalls();
      autoSaveFrame();
      // Null out this ball in all future frames
      for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
        const arr = frames[fi].balls || [];
        if (idx < arr.length) {
          arr[idx] = null;
          frames[fi].balls = arr;
        }
      }
      saveFrames();
    }

    inner.querySelectorAll('.tb-ball').forEach(b => makeBallDraggable(b));

    // Ball tool — add ball on click
    const ballToolBtn = document.getElementById('tb-ball-tool');
    if (ballToolBtn) {
      ballToolBtn.addEventListener('click', () => {
        pushUndo();
        spawnBall(50, 50);
        saveBalls();
        autoSaveFrame();
        // Propagate new ball to future frames
        const ballsArr = JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]');
        const newBall = ballsArr[ballsArr.length - 1];
        if (newBall) {
          for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
            frames[fi].balls = (frames[fi].balls || []).concat([newBall]);
          }
          saveFrames();
        }
      });
    }

    // --- Cones ---
    let coneMode = false;
    const coneToolBtn = document.getElementById('tb-cone-tool');

    function saveCones() {
      const cones = inner.querySelectorAll('.tb-cone');
      const arr = [];
      cones.forEach(c => {
        const cL = parseFloat(c.style.left), cT = parseFloat(c.style.top);
        const cH = toHorizontal(cL, cT);
        arr.push([Math.round(cH[0]*100)/100, Math.round(cH[1]*100)/100]);
      });
      localStorage.setItem('fa_tactic_cones', JSON.stringify(arr));
    }

    function spawnCone(pctX, pctY) {
      const div = document.createElement('div');
      div.className = 'tb-cone';
      div.style.left = pctX + '%';
      div.style.top = pctY + '%';
      makeConeDraggable(div);
      inner.appendChild(div);
      return div;
    }

    function makeConeDraggable(cone) {
      let dragging = false, startX, startY, startLeft, startTop;
      cone.addEventListener('pointerdown', e => {
        if (coneMode) return;
        e.preventDefault(); e.stopPropagation();
        // Ctrl+Click: toggle selection
        if (e.ctrlKey || e.metaKey) {
          toggleSelect(cone);
          return;
        }
        pushUndo();
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        startLeft = parseFloat(cone.style.left);
        startTop = parseFloat(cone.style.top);
        cone.classList.add('tb-dragging');
        cone.setPointerCapture(e.pointerId);
      });
      cone.addEventListener('pointermove', e => {
        if (!dragging) return;
        const rect = inner.getBoundingClientRect();
        const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
        const vert = field.classList.contains('tb-vertical');
        let dx, dy;
        if (isCssRotated && vert) {
          dx = -((e.clientY - startY) / rect.height) * 100;
          dy = ((e.clientX - startX) / rect.width) * 100;
        } else {
          dx = ((e.clientX - startX) / rect.width) * 100;
          dy = ((e.clientY - startY) / rect.height) * 100;
        }
        cone.style.left = Math.max(0, Math.min(100, startLeft + dx)) + '%';
        cone.style.top = Math.max(0, Math.min(100, startTop + dy)) + '%';
      });
      cone.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        cone.classList.remove('tb-dragging');
        saveCones(); autoSaveFrame();
      });
      cone.addEventListener('pointercancel', () => {
        if (!dragging) return;
        dragging = false;
        cone.classList.remove('tb-dragging');
        saveCones(); autoSaveFrame();
      });
      cone.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Delete cone', danger: true, action: () => { pushUndo(); cone.remove(); saveCones(); autoSaveFrame(); } }
        ]);
      });
    }

    // Init existing cones
    inner.querySelectorAll('.tb-cone').forEach(c => makeConeDraggable(c));

    // Cone tool toggle
    if (coneToolBtn) {
      coneToolBtn.addEventListener('click', () => {
        const wasActive = coneMode;
        deactivateDrawTools();
        if (!wasActive) {
          coneMode = true;
          coneToolBtn.classList.add('tb-cone-tool-active');
          inner.style.cursor = 'crosshair';
        }
      });
    }

    // Place cone on click
    inner.addEventListener('click', e => {
      if (!coneMode) return;
      if (e.target.closest('.tb-cone') || e.target.closest('.tb-circle') || e.target.closest('.tb-ball')) return;
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((rect.bottom - e.clientY) / rect.height) * 100;
        pctY = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        pctX = ((e.clientX - rect.left) / rect.width) * 100;
        pctY = ((e.clientY - rect.top) / rect.height) * 100;
      }
      pushUndo();
      spawnCone(pctX, pctY);
      saveCones(); autoSaveFrame();
    });

    // Attach drag to existing circles
    inner.querySelectorAll('.tb-circle').forEach(c => {
      makeDraggable(c);
      c.querySelector('.tb-num').addEventListener('input', saveState);
    });

    // Name input
    if (nameInput) nameInput.addEventListener('input', saveState);

    // Color pickers
    document.getElementById('tb-team-color')?.addEventListener('input', updateCircleColors);
    document.getElementById('tb-opp-color')?.addEventListener('input', updateCircleColors);

    // Opponent toggle
    const showOppCheck = document.getElementById('tb-show-opp');
    const oppColorPick = document.getElementById('tb-opp-color');
    showOppCheck?.addEventListener('change', () => {
      localStorage.setItem('fa_tactic_show_opp', showOppCheck.checked);
      if (oppColorPick) oppColorPick.style.display = showOppCheck.checked ? '' : 'none';
      if (showOppCheck.checked) {
        spawnOppCircles();
      } else {
        inner.querySelectorAll('.tb-circle-opp').forEach(c => c.remove());
        localStorage.removeItem('fa_tactic_opp_positions');
        localStorage.removeItem('fa_tactic_opp_numbers');
      }
    });

    // Custom formation dropdown
    const toggle = document.getElementById('tb-formation-toggle');
    const list = document.getElementById('tb-formation-list');
    if (toggle && list) {
      toggle.addEventListener('click', () => list.classList.toggle('open'));
      document.addEventListener('click', e => {
        if (!e.target.closest('#tb-formation-wrap')) list.classList.remove('open');
      });
      list.querySelectorAll('.tb-formation-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const f = opt.dataset.val;
          toggle.textContent = f || '— Select —';
          list.querySelectorAll('.tb-formation-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          list.classList.remove('open');
          localStorage.setItem('fa_tactic_formation', f);
          if (f && formations[f]) {
            localStorage.removeItem('fa_tactic_positions');
            localStorage.removeItem('fa_tactic_numbers');
            localStorage.removeItem('fa_tactic_opp_positions');
            localStorage.removeItem('fa_tactic_opp_numbers');
            spawnCircles(adaptFormation(formations[f]), null);
            if (document.getElementById('tb-show-opp')?.checked) spawnOppCircles();
          } else {
            inner.querySelectorAll('.tb-circle').forEach(c => c.remove());
            localStorage.removeItem('fa_tactic_positions');
            localStorage.removeItem('fa_tactic_numbers');
            localStorage.removeItem('fa_tactic_formation');
            localStorage.removeItem('fa_tactic_opp_positions');
            localStorage.removeItem('fa_tactic_opp_numbers');
          }
        });
      });
    }

    // Orientation toggle
    const orientBtn = document.getElementById('tb-orient');
    if (orientBtn) {
      orientBtn.addEventListener('click', () => {
        orientBtn.classList.add('tb-spinning');
        const cur = isVertical() ? 'horizontal' : 'vertical';
        localStorage.setItem('fa_tactic_orient', cur);
        setTimeout(() => { navigate('tactics'); }, 300);
      });
    }

    // --- Silhouette picker ---
    const silBtn = document.getElementById('tb-sil-btn');
    const silMenu = document.getElementById('tb-sil-menu');
    const silImg = document.getElementById('tb-silhouette');
    if (silImg) {
      silImg.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [{
          label: 'Remove silhouette', danger: true,
          action: () => {
            silImg.src = ''; silImg.style.display = 'none';
            localStorage.setItem('fa_tactic_silhouette', '');
            if (silMenu) silMenu.querySelectorAll('.tb-sil-opt').forEach(o => o.classList.toggle('tb-sil-active', !o.dataset.sil));
            autoSaveFrame();
          }
        }]);
      });
    }
    if (silBtn && silMenu) {
      silBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        silMenu.classList.toggle('tb-sil-menu-open');
      });
      document.addEventListener('click', () => silMenu.classList.remove('tb-sil-menu-open'), { once: false });
      silMenu.addEventListener('click', (e) => e.stopPropagation());
      silMenu.querySelectorAll('.tb-sil-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          const val = opt.dataset.sil || '';
          localStorage.setItem('fa_tactic_silhouette', val);
          silMenu.querySelectorAll('.tb-sil-opt').forEach(o => o.classList.remove('tb-sil-active'));
          opt.classList.add('tb-sil-active');
          silMenu.classList.remove('tb-sil-menu-open');
          const silImg = document.getElementById('tb-silhouette');
          if (silImg) {
            if (val) { silImg.src = 'img/sil-' + val + '.png'; silImg.style.display = 'block'; }
            else { silImg.src = ''; silImg.style.display = 'none'; }
          }
          autoSaveFrame();
        });
      });
    }

    // --- Save / Load / Delete boards ---
    function hasUnsavedChanges() {
      return hasTacticUnsavedChanges();
    }

    function refreshSavedList() {
      const listEl = document.getElementById('tb-saved-list');
      if (!listEl) return;
      const boards = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
      const li = localStorage.getItem('fa_tactic_loaded_idx');
      listEl.innerHTML = boards.map((b, i) =>
        `<div class="tb-saved-item${li == i ? ' tb-saved-active' : ''}" data-board-idx="${i}">` +
        `<span>${sanitize(b.name || 'Board ' + (i+1))}</span>` +
        `<button class="tb-delete-board" data-del-idx="${i}">✕</button>` +
        `</div>`
      ).join('');
      bindTacticsSavedList();
    }

    bindTacticsSavedList();

    // Bind styled tooltips for toolbar controls
    (function bindToolbarTooltips() {
      let tooltipEl = document.getElementById('roster-tooltip');
      if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'roster-tooltip';
        tooltipEl.className = 'roster-tooltip';
        document.body.appendChild(tooltipEl);
      }
      document.querySelectorAll('.tb-controls [data-tooltip]').forEach(el => {
        el.addEventListener('mouseenter', () => {
          tooltipEl.textContent = el.getAttribute('data-tooltip');
          tooltipEl.classList.add('visible');
          const r = el.getBoundingClientRect();
          tooltipEl.style.left = r.left + r.width / 2 - tooltipEl.offsetWidth / 2 + 'px';
          tooltipEl.style.top = r.top - tooltipEl.offsetHeight - 10 + window.scrollY + 'px';
        });
        el.addEventListener('mouseleave', () => {
          tooltipEl.classList.remove('visible');
        });
      });
    })();

    // Save button (overwrites loaded board, or creates new if nothing loaded)
    const saveBtn = document.getElementById('tb-save');
    saveBtn?.addEventListener('click', () => {
      const f = localStorage.getItem('fa_tactic_formation') || '';
      saveState();
      if (typeof autoSaveFrame === 'function') autoSaveFrame();
      const pos = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
      const nums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
      const bt = localStorage.getItem('fa_tactic_board_type') || 'full';
      const name = (nameInput ? nameInput.value : '').trim() || 'Board';
      const boards = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
      const loadedIdx = localStorage.getItem('fa_tactic_loaded_idx');
      const entry = { name, formation: f, positions: pos, numbers: nums, boardType: bt,
        teamColor: localStorage.getItem('fa_tactic_team_color') || '#ffffff',
        oppColor: localStorage.getItem('fa_tactic_opp_color') || '#e53935',
        showOpp: localStorage.getItem('fa_tactic_show_opp') === 'true',
        oppPositions: JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null'),
        oppNumbers: JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null'),
        balls: JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]'),
        colors: JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null'),
        arrows: JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]'),
        rects: JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]'),
        texts: JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]'),
        penLines: JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]'),
        frames: JSON.parse(localStorage.getItem('fa_tactic_frames') || '[]'),
        tag: localStorage.getItem('fa_tactic_tag') || '',
        silhouette: localStorage.getItem('fa_tactic_silhouette') || '',
        cones: JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]')
      };

      if (loadedIdx !== null && boards[loadedIdx]) {
        // Overwrite — check duplicate name (excluding self)
        const dup = boards.some((b, i) => i !== Number(loadedIdx) && b.name.toLowerCase() === name.toLowerCase());
        if (dup) { alert('A board with this name already exists.'); return; }
        boards[loadedIdx] = entry;
      } else {
        // New save — check duplicate name
        const dup = boards.some(b => b.name.toLowerCase() === name.toLowerCase());
        if (dup) { alert('A board with this name already exists.'); return; }
        boards.push(entry);
        localStorage.setItem('fa_tactic_loaded_idx', boards.length - 1);
      }
      localStorage.setItem('fa_tactic_saved', JSON.stringify(boards));
      // Also update any linked match boards with the same name
      const matchBoards = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
      let mbChanged = false;
      for (const mid of Object.keys(matchBoards)) {
        const arr = matchBoards[mid];
        for (let j = 0; j < arr.length; j++) {
          if (arr[j].name === entry.name) {
            arr[j] = entry;
            mbChanged = true;
          }
        }
      }
      if (mbChanged) localStorage.setItem('fa_tactic_match_boards', JSON.stringify(matchBoards));
      // Also update any linked training boards with the same name
      const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
      let tbChanged = false;
      for (const tdate of Object.keys(trainingBoards)) {
        const arr = trainingBoards[tdate];
        for (let j = 0; j < arr.length; j++) {
          if (arr[j].name === entry.name) {
            arr[j] = entry;
            tbChanged = true;
          }
        }
      }
      if (tbChanged) localStorage.setItem('fa_tactic_training_boards', JSON.stringify(trainingBoards));
      refreshSavedList();
      // Visual feedback
      if (saveBtn) {
        const orig = saveBtn.textContent;
        saveBtn.textContent = 'Saved ✓';
        saveBtn.style.background = '#2e7d32';
        setTimeout(() => { saveBtn.textContent = orig; saveBtn.style.background = ''; }, 1200);
      }
    });

    // Save As button
    document.getElementById('tb-save-as')?.addEventListener('click', () => {
      const f = localStorage.getItem('fa_tactic_formation') || '';
      saveState();
      if (typeof autoSaveFrame === 'function') autoSaveFrame();
      const pos = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
      const nums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
      const suggested = (nameInput ? nameInput.value : '').trim() || 'Board';
      const name = prompt('Board name:', suggested);
      if (!name) return;
      const boards = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
      const bt = localStorage.getItem('fa_tactic_board_type') || 'full';
      const dup = boards.some(b => b.name.toLowerCase() === name.trim().toLowerCase());
      if (dup) { alert('A board with this name already exists.'); return; }
      boards.push({ name: name.trim(), formation: f, positions: pos, numbers: nums, boardType: bt,
        teamColor: localStorage.getItem('fa_tactic_team_color') || '#ffffff',
        oppColor: localStorage.getItem('fa_tactic_opp_color') || '#e53935',
        showOpp: localStorage.getItem('fa_tactic_show_opp') === 'true',
        oppPositions: JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null'),
        oppNumbers: JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null'),
        balls: JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]'),
        colors: JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null'),
        arrows: JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]'),
        rects: JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]'),
        texts: JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]'),
        penLines: JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]'),
        frames: JSON.parse(localStorage.getItem('fa_tactic_frames') || '[]'),
        tag: localStorage.getItem('fa_tactic_tag') || '',
        silhouette: localStorage.getItem('fa_tactic_silhouette') || '',
        cones: JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]')
      });
      localStorage.setItem('fa_tactic_saved', JSON.stringify(boards));
      localStorage.setItem('fa_tactic_loaded_idx', boards.length - 1);
      if (nameInput) { nameInput.value = name.trim(); localStorage.setItem('fa_tactic_name', name.trim()); }
      refreshSavedList();
    });

    // New Board button
    document.getElementById('tb-new-board')?.addEventListener('click', () => {
      const doNew = () => {
        localStorage.removeItem('fa_tactic_formation');
        localStorage.removeItem('fa_tactic_positions');
        localStorage.removeItem('fa_tactic_numbers');
        localStorage.removeItem('fa_tactic_colors');
        localStorage.removeItem('fa_tactic_name');
        localStorage.removeItem('fa_tactic_loaded_idx');
        localStorage.removeItem('fa_tactic_board_type');
        localStorage.removeItem('fa_tactic_opp_positions');
        localStorage.removeItem('fa_tactic_opp_numbers');
        localStorage.removeItem('fa_tactic_show_opp');
        localStorage.removeItem('fa_tactic_balls');
        localStorage.removeItem('fa_tactic_arrows');
        localStorage.removeItem('fa_tactic_rects');
        localStorage.removeItem('fa_tactic_texts');
        localStorage.removeItem('fa_tactic_pen_lines');
        localStorage.removeItem('fa_tactic_frames');
        localStorage.removeItem('fa_tactic_frame_idx');
        localStorage.removeItem('fa_tactic_tag');
        localStorage.removeItem('fa_tactic_silhouette');
        localStorage.removeItem('fa_tactic_cones');
        navigate('tactics');
      };
      if (hasUnsavedChanges()) {
        showTbConfirm('New Board', 'You have unsaved changes. Start a new board?', doNew);
      } else {
        doNew();
      }
    });

    // --- Tag ---
    const tagToggle = document.getElementById('tb-tag-toggle');
    const tagList = document.getElementById('tb-tag-list');
    const tagAddInput = document.getElementById('tb-tag-add-input');
    const tagAddBtn = document.getElementById('tb-tag-add-btn');
    const DEFAULT_TAGS = ['Presión', 'Salida', 'Estrategia'];
    function getTagList() {
      const custom = JSON.parse(localStorage.getItem('fa_tactic_tags') || '[]');
      // Merge defaults + custom, preserving order: defaults first, then custom
      const all = [...DEFAULT_TAGS];
      custom.forEach(t => { if (!all.includes(t)) all.push(t); });
      return all;
    }
    function saveTagList(list) {
      // Only persist custom tags (non-defaults)
      localStorage.setItem('fa_tactic_tags', JSON.stringify(list.filter(t => !DEFAULT_TAGS.includes(t))));
    }
    function renderTagList() {
      if (!tagList) return;
      const tags = getTagList();
      const current = localStorage.getItem('fa_tactic_tag') || '';
      let html = '<div class="tb-tag-option' + (!current ? ' active' : '') + '" data-tag=""><span>— None —</span></div>';
      html += tags.map(t => {
        const isDefault = DEFAULT_TAGS.includes(t);
        return '<div class="tb-tag-option' + (t === current ? ' active' : '') + '" data-tag="' + sanitize(t) + '">' +
          '<span>' + sanitize(t) + '</span>' +
          (isDefault ? '' : '<button class="tb-tag-option-del" data-del-tag="' + sanitize(t) + '" title="Remove tag">✕</button>') +
        '</div>';
      }).join('');
      tagList.innerHTML = html;
      tagList.querySelectorAll('.tb-tag-option').forEach(opt => {
        opt.addEventListener('click', e => {
          if (e.target.closest('.tb-tag-option-del')) return;
          const val = opt.dataset.tag;
          localStorage.setItem('fa_tactic_tag', val);
          tagToggle.textContent = val || '— None —';
          tagToggle.classList.toggle('has-tag', !!val);
          tagList.classList.remove('open');
          renderTagList();
        });
      });
      tagList.querySelectorAll('.tb-tag-option-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const del = btn.dataset.delTag;
          const list = getTagList().filter(t => t !== del);
          saveTagList(list);
          if ((localStorage.getItem('fa_tactic_tag') || '') === del) {
            localStorage.setItem('fa_tactic_tag', '');
            tagToggle.textContent = '— None —';
            tagToggle.classList.remove('has-tag');
          }
          renderTagList();
        });
      });
    }
    if (tagToggle && tagList) {
      tagToggle.addEventListener('click', () => {
        renderTagList();
        tagList.classList.toggle('open');
      });
      document.addEventListener('click', e => {
        if (!e.target.closest('#tb-tag-select-wrap')) tagList.classList.remove('open');
      });
    }
    if (tagAddBtn && tagAddInput) {
      const doAddTag = () => {
        const val = tagAddInput.value.trim();
        if (!val) return;
        const list = getTagList();
        if (!list.includes(val)) { list.push(val); saveTagList(list); }
        localStorage.setItem('fa_tactic_tag', val);
        tagToggle.textContent = val;
        tagToggle.classList.add('has-tag');
        tagAddInput.value = '';
        renderTagList();
      };
      tagAddBtn.addEventListener('click', doAddTag);
      tagAddInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doAddTag(); }
      });
    }

    // Add to Match
    function refreshMatchLinked() {
      const el = document.getElementById('tb-match-linked');
      if (!el) return;
      const matchBoards = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
      const allMatches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
      const curName = (nameInput ? nameInput.value : localStorage.getItem('fa_tactic_name') || '').trim();
      // Show which matches this board is linked to
      const linked = [];
      for (const [mid, boards] of Object.entries(matchBoards)) {
        if (boards.some(b => b.name === curName)) {
          const m = allMatches.find(x => x.id === Number(mid));
          if (m) {
            const teamLetter = m.team ? ' (' + sanitize(m.team) + ')' : '';
            const home = isOurTeam(m.home) ? getClubName() + teamLetter : sanitize(m.home);
            const away = isOurTeam(m.away) ? getClubName() + teamLetter : sanitize(m.away);
            linked.push({ mid, label: home + ' vs ' + away });
          }
        }
      }
      if (!linked.length) { el.innerHTML = ''; return; }
      el.innerHTML = '<div class="tb-match-linked-title">Linked to:</div>' +
        linked.map(l => `<div class="tb-match-linked-item"><span>${l.label}</span><button class="tb-match-unlink" data-mid="${l.mid}" title="Remove">✕</button></div>`).join('');
      el.querySelectorAll('.tb-match-unlink').forEach(btn => {
        btn.addEventListener('click', () => {
          const mid = btn.dataset.mid;
          const mb = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
          if (mb[mid]) {
            mb[mid] = mb[mid].filter(b => b.name !== curName);
            if (!mb[mid].length) delete mb[mid];
            localStorage.setItem('fa_tactic_match_boards', JSON.stringify(mb));
          }
          refreshMatchLinked();
        });
      });
    }
    refreshMatchLinked();

    // Add to Training
    function refreshTrainingLinked() {
      const el = document.getElementById('tb-training-linked');
      if (!el) return;
      const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
      const allTraining = JSON.parse(localStorage.getItem('fa_training') || '[]');
      const curName = (nameInput ? nameInput.value : localStorage.getItem('fa_tactic_name') || '').trim();
      const linked = [];
      for (const [tdate, boards] of Object.entries(trainingBoards)) {
        if (boards.some(b => b.name === curName)) {
          const t = allTraining.find(x => x.date === tdate);
          const label = t ? (sanitize(t.focus || 'Training') + ' — ' + new Date(tdate + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' })) : tdate;
          linked.push({ tdate, label });
        }
      }
      if (!linked.length) { el.innerHTML = ''; return; }
      el.innerHTML = '<div class="tb-match-linked-title">Linked to:</div>' +
        linked.map(l => `<div class="tb-match-linked-item"><span>${l.label}</span><button class="tb-match-unlink" data-tdate="${l.tdate}" title="Remove">✕</button></div>`).join('');
      el.querySelectorAll('.tb-match-unlink').forEach(btn => {
        btn.addEventListener('click', () => {
          const tdate = btn.dataset.tdate;
          const tb = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
          if (tb[tdate]) {
            tb[tdate] = tb[tdate].filter(b => b.name !== curName);
            if (!tb[tdate].length) delete tb[tdate];
            localStorage.setItem('fa_tactic_training_boards', JSON.stringify(tb));
          }
          refreshTrainingLinked();
        });
      });
    }
    refreshTrainingLinked();

    // Training dropdown (custom)
    let selectedTrainingVal = '';
    const trainingToggle = document.getElementById('tb-training-toggle');
    const trainingList = document.getElementById('tb-training-list');
    if (trainingToggle && trainingList) {
      trainingToggle.addEventListener('click', () => trainingList.classList.toggle('open'));
      document.addEventListener('click', e => {
        if (!e.target.closest('#tb-training-wrap')) trainingList.classList.remove('open');
      });
      trainingList.querySelectorAll('.tb-match-option').forEach(opt => {
        opt.addEventListener('click', () => {
          selectedTrainingVal = opt.dataset.val || '';
          trainingToggle.textContent = opt.textContent;
          trainingList.querySelectorAll('.tb-match-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          trainingList.classList.remove('open');
        });
      });
    }

    const addToTrainingBtn = document.getElementById('tb-add-to-training');
    addToTrainingBtn?.addEventListener('click', () => {
      if (!selectedTrainingVal) { alert('Please select a training.'); return; }
      const f = localStorage.getItem('fa_tactic_formation') || '';
      saveState();
      if (typeof autoSaveFrame === 'function') autoSaveFrame();
      const pos = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
      const nums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
      const bt = localStorage.getItem('fa_tactic_board_type') || 'full';
      const bName = (nameInput ? nameInput.value : '').trim() || 'Board';
      const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
      const tdate = selectedTrainingVal;
      if (!trainingBoards[tdate]) trainingBoards[tdate] = [];
      const idx = trainingBoards[tdate].findIndex(b => b.name === bName);
      const entry = { name: bName, formation: f, positions: pos, numbers: nums, boardType: bt,
        teamColor: localStorage.getItem('fa_tactic_team_color') || '#ffffff',
        oppColor: localStorage.getItem('fa_tactic_opp_color') || '#e53935',
        showOpp: localStorage.getItem('fa_tactic_show_opp') === 'true',
        oppPositions: JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null'),
        oppNumbers: JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null'),
        balls: JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]'),
        colors: JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null'),
        arrows: JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]'),
        rects: JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]'),
        texts: JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]'),
        penLines: JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]'),
        frames: JSON.parse(localStorage.getItem('fa_tactic_frames') || '[]'),
        tag: localStorage.getItem('fa_tactic_tag') || '',
        silhouette: localStorage.getItem('fa_tactic_silhouette') || '',
        cones: JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]')
      };
      if (idx !== -1) trainingBoards[tdate][idx] = entry;
      else trainingBoards[tdate].push(entry);
      localStorage.setItem('fa_tactic_training_boards', JSON.stringify(trainingBoards));
      const orig = addToTrainingBtn.textContent;
      addToTrainingBtn.textContent = 'Added ✓';
      addToTrainingBtn.style.background = '#2e7d32';
      setTimeout(() => { addToTrainingBtn.textContent = orig; addToTrainingBtn.style.background = ''; }, 1200);
      refreshTrainingLinked();
    });

    // Match dropdown (custom)
    let selectedMatchVal = '';
    const matchToggle = document.getElementById('tb-match-toggle');
    const matchList = document.getElementById('tb-match-list');
    if (matchToggle && matchList) {
      matchToggle.addEventListener('click', () => matchList.classList.toggle('open'));
      document.addEventListener('click', e => {
        if (!e.target.closest('#tb-match-wrap')) matchList.classList.remove('open');
      });
      matchList.querySelectorAll('.tb-match-option').forEach(opt => {
        opt.addEventListener('click', () => {
          selectedMatchVal = opt.dataset.val || '';
          matchToggle.textContent = opt.textContent;
          matchList.querySelectorAll('.tb-match-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          matchList.classList.remove('open');
        });
      });
    }

    const addToMatchBtn = document.getElementById('tb-add-to-match');
    addToMatchBtn?.addEventListener('click', () => {
      if (!selectedMatchVal) { alert('Please select a match.'); return; }
      const f = localStorage.getItem('fa_tactic_formation') || '';
      saveState();
      if (typeof autoSaveFrame === 'function') autoSaveFrame();
      const pos = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
      const nums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
      const bt = localStorage.getItem('fa_tactic_board_type') || 'full';
      const bName = (nameInput ? nameInput.value : '').trim() || 'Board';
      const matchBoards = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
      const mid = selectedMatchVal;
      if (!matchBoards[mid]) matchBoards[mid] = [];
      // Replace if same name already linked to this match, otherwise add
      const idx = matchBoards[mid].findIndex(b => b.name === bName);
      const entry = { name: bName, formation: f, positions: pos, numbers: nums, boardType: bt,
        teamColor: localStorage.getItem('fa_tactic_team_color') || '#ffffff',
        oppColor: localStorage.getItem('fa_tactic_opp_color') || '#e53935',
        showOpp: localStorage.getItem('fa_tactic_show_opp') === 'true',
        oppPositions: JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null'),
        oppNumbers: JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null'),
        balls: JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]'),
        colors: JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null'),
        arrows: JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]'),
        rects: JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]'),
        texts: JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]'),
        penLines: JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]'),
        frames: JSON.parse(localStorage.getItem('fa_tactic_frames') || '[]'),
        tag: localStorage.getItem('fa_tactic_tag') || '',
        silhouette: localStorage.getItem('fa_tactic_silhouette') || '',
        cones: JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]')
      };
      if (idx !== -1) matchBoards[mid][idx] = entry;
      else matchBoards[mid].push(entry);
      localStorage.setItem('fa_tactic_match_boards', JSON.stringify(matchBoards));
      // Visual feedback
      const orig = addToMatchBtn.textContent;
      addToMatchBtn.textContent = 'Added ✓';
      addToMatchBtn.style.background = '#2e7d32';
      setTimeout(() => { addToMatchBtn.textContent = orig; addToMatchBtn.style.background = ''; }, 1200);
      refreshMatchLinked();
    });

    // ===== Frames (animation keyframes) =====
    let frames = JSON.parse(localStorage.getItem('fa_tactic_frames') || '[]');
    let activeFrameIdx = frames.length ? Math.min(Number(localStorage.getItem('fa_tactic_frame_idx') || 0), frames.length - 1) : -1;
    let framePlaying = false;

    function syncNumbersAcrossFrames() {
      const nums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || '[]');
      const oppNums = JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || '[]');
      frames.forEach(f => {
        if (f.numbers) f.numbers = JSON.parse(JSON.stringify(nums));
        if (f.oppNumbers) f.oppNumbers = JSON.parse(JSON.stringify(oppNums));
      });
      saveFrames();
    }

    function syncColorsAcrossFrames() {
      const clrs = JSON.parse(localStorage.getItem('fa_tactic_colors') || '[]');
      frames.forEach(f => {
        f.colors = JSON.parse(JSON.stringify(clrs));
      });
      saveFrames();
    }

    function captureFrameState() {
      saveState(); saveArrows(); saveRects(); saveTexts(); savePenLines(); saveCones();
      return {
        positions: JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null'),
        numbers: JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null'),
        colors: JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null'),
        oppPositions: JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null'),
        oppNumbers: JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null'),
        balls: JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]'),
        arrows: JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]'),
        rects: JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]'),
        texts: JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]'),
        penLines: JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]'),
        silhouette: localStorage.getItem('fa_tactic_silhouette') || '',
        cones: JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]'),
        duration: 1000
      };
    }

    function applyFrameState(f) {
      // Merge numbers: for each index, prefer non-empty from either current or frame
      const currentNumbers = JSON.parse(localStorage.getItem('fa_tactic_numbers') || '[]');
      const currentOppNumbers = JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || '[]');
      const fNums = f.numbers || [];
      const fOppNums = f.oppNumbers || [];
      const mergedNums = [];
      const maxNumLen = Math.max(currentNumbers.length, fNums.length);
      for (let i = 0; i < maxNumLen; i++) {
        mergedNums[i] = currentNumbers[i] || fNums[i] || '';
      }
      const mergedOppNums = [];
      const maxOppNumLen = Math.max(currentOppNumbers.length, fOppNums.length);
      for (let i = 0; i < maxOppNumLen; i++) {
        mergedOppNums[i] = currentOppNumbers[i] || fOppNums[i] || '';
      }
      // Positions + numbers + colors
      if (f.positions) localStorage.setItem('fa_tactic_positions', JSON.stringify(f.positions));
      localStorage.setItem('fa_tactic_numbers', JSON.stringify(mergedNums));
      // Merge colors: preserve per-circle colors across frames
      const currentColors = JSON.parse(localStorage.getItem('fa_tactic_colors') || '[]');
      const fColors = f.colors || [];
      const mergedColors = [];
      const maxColorLen = Math.max(currentColors.length, fColors.length);
      for (let i = 0; i < maxColorLen; i++) {
        mergedColors[i] = currentColors[i] || fColors[i] || '';
      }
      localStorage.setItem('fa_tactic_colors', JSON.stringify(mergedColors));
      if (f.oppPositions) localStorage.setItem('fa_tactic_opp_positions', JSON.stringify(f.oppPositions));
      else localStorage.removeItem('fa_tactic_opp_positions');
      localStorage.setItem('fa_tactic_opp_numbers', JSON.stringify(mergedOppNums));
      localStorage.setItem('fa_tactic_balls', JSON.stringify(f.balls || []));
      localStorage.setItem('fa_tactic_arrows', JSON.stringify(f.arrows || []));
      localStorage.setItem('fa_tactic_rects', JSON.stringify(f.rects || []));
      localStorage.setItem('fa_tactic_texts', JSON.stringify(f.texts || []));
      localStorage.setItem('fa_tactic_pen_lines', JSON.stringify(f.penLines || []));

      // Use merged numbers and colors for display
      const numsToUse = mergedNums;
      const oppNumsToUse = mergedOppNums;

      // Rebuild circles (skip null entries = deleted circles)
      const teamColor = document.getElementById('tb-team-color')?.value || '#ffffff';
      const clrs = mergedColors;
      inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => c.remove());
      (f.positions || []).forEach((p, i) => {
          if (!p) return; // null = deleted circle slot
          const d = toDisplay(p[0], p[1]);
          const num = (numsToUse && numsToUse[i]) || '';
          const isGk = String(num) === '1';
          const bg = isGk ? GK_COLOR : (clrs[i] || teamColor);
          const div = document.createElement('div');
          div.className = 'tb-circle';
          div.dataset.idx = i;
          if (clrs[i]) div.dataset.color = clrs[i];
          div.style.left = d[0] + '%'; div.style.top = d[1] + '%';
          div.style.background = bg; div.style.borderColor = darkenHex(bg, 50);
          const inp = document.createElement('input');
          inp.className = 'tb-num'; inp.maxLength = 2;
          inp.value = (numsToUse && numsToUse[i]) || '';
          inp.style.color = textColorFor(bg);
          inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); autoSaveFrame(); });
          div.appendChild(inp);
          makeDraggable(div);
          inner.appendChild(div);
        });
      // Rebuild opp circles (skip null entries)
      inner.querySelectorAll('.tb-circle-opp').forEach(c => c.remove());
      const oc = document.getElementById('tb-opp-color')?.value || '#e53935';
      const obc = darkenHex(oc, 50);
      (f.oppPositions || []).forEach((p, i) => {
          if (!p) return; // null = deleted circle slot
          const d = toDisplay(p[0], p[1]);
          const num = (oppNumsToUse && oppNumsToUse[i]) || '';
          const isGk = String(num) === '1';
          const oppBg = isGk ? GK_COLOR : oc;
          const div = document.createElement('div');
          div.className = 'tb-circle tb-circle-opp';
          div.dataset.idx = i;
          div.style.left = d[0] + '%'; div.style.top = d[1] + '%';
          div.style.background = oppBg; div.style.borderColor = darkenHex(oppBg, 50);
          const inp = document.createElement('input');
          inp.className = 'tb-num'; inp.maxLength = 2;
          inp.value = (oppNumsToUse && oppNumsToUse[i]) || '';
          inp.style.color = textColorFor(oc);
          inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); autoSaveFrame(); });
          div.appendChild(inp);
          makeDraggable(div);
          inner.appendChild(div);
        });
      // Balls
      inner.querySelectorAll('.tb-ball').forEach(b => b.remove());
      (f.balls || []).forEach((b, i) => {
        if (!b) return; // null = deleted ball
        const bd = toDisplay(b[0], b[1]);
        spawnBall(bd[0], bd[1]);
      });
      // Arrows
      arrowsSvg.querySelectorAll('.tb-arrow').forEach(a => a.remove());
      (f.arrows || []).forEach((a, idx) => {
        const d1 = toDisplay(a[0], a[1]);
        const d2 = toDisplay(a[2], a[3]);
        const col = a[4] || '#ffffff';
        const dashed = a[5];
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('tb-arrow');
        line.setAttribute('x1', d1[0] + '%'); line.setAttribute('y1', d1[1] + '%');
        line.setAttribute('x2', d2[0] + '%'); line.setAttribute('y2', d2[1] + '%');
        line.setAttribute('stroke', col);
        line.style.stroke = col;
        line.dataset.color = col;
        line.dataset.idx = idx;
        if (dashed) { line.setAttribute('stroke-dasharray', '4 3'); line.dataset.dash = '1'; }
        arrowsSvg.appendChild(line);
      });
      refreshArrowheads(arrowsSvg);
      // Rects
      arrowsSvg.querySelectorAll('.tb-rect').forEach(r => r.remove());
      const defs = arrowsSvg.querySelector('defs');
      (f.rects || []).forEach((r, idx) => {
        const tl = toDisplay(r[0], r[1]);
        const br = toDisplay(r[0] + r[2], r[1] + r[3]);
        const dx = Math.min(tl[0], br[0]);
        const dy = Math.min(tl[1], br[1]);
        const dw = Math.abs(br[0] - tl[0]);
        const dh = Math.abs(br[1] - tl[1]);
        const col = r[4] || '#ffffff';
        const op = r[5] != null ? r[5] : 0.3;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.classList.add('tb-rect');
        rect.setAttribute('x', dx + '%'); rect.setAttribute('y', dy + '%');
        rect.setAttribute('width', dw + '%'); rect.setAttribute('height', dh + '%');
        rect.setAttribute('fill', col);
        rect.setAttribute('fill-opacity', op);
        rect.setAttribute('stroke', col);
        rect.dataset.color = col; rect.dataset.opacity = op; rect.dataset.idx = idx;
        defs.insertAdjacentElement('afterend', rect);
      });
      // Text labels
      inner.querySelectorAll('.tb-text-label').forEach(el => el.remove());
      (f.texts || []).forEach((t, idx) => {
        const d = toDisplay(t[0], t[1]);
        createTextLabel(d[0], d[1], t[2], t[3] || '#000000', t[4] != null ? t[4] : 0.8, t[5] || null, t[6] || null, t[7] || null);
      });
      // Pen lines
      arrowsSvg.querySelectorAll('.tb-pen-line').forEach(p => p.remove());
      (f.penLines || []).forEach(p => spawnPenLine(p[0], p[1], p[2]));
      // Silhouette
      const silVal = f.silhouette || '';
      localStorage.setItem('fa_tactic_silhouette', silVal);
      const silImg = document.getElementById('tb-silhouette');
      if (silImg) {
        if (silVal) { silImg.src = 'img/sil-' + silVal + '.png'; silImg.style.display = 'block'; }
        else { silImg.src = ''; silImg.style.display = 'none'; }
      }
      // Update picker active state
      document.querySelectorAll('.tb-sil-opt').forEach(o => o.classList.toggle('tb-sil-active', (o.dataset.sil || '') === silVal));
      // Cones
      localStorage.setItem('fa_tactic_cones', JSON.stringify(f.cones || []));
      inner.querySelectorAll('.tb-cone').forEach(c => c.remove());
      (f.cones || []).forEach(c => spawnCone(c[0], c[1]));
      clearSelection();
    }

    function saveFrames() {
      localStorage.setItem('fa_tactic_frames', JSON.stringify(frames));
      localStorage.setItem('fa_tactic_frame_idx', activeFrameIdx);
    }

    function autoSaveFrame() {
      if (activeFrameIdx >= 0 && activeFrameIdx < frames.length && !framePlaying) {
        const existingDur = frames[activeFrameIdx].duration || 1000;
        frames[activeFrameIdx] = captureFrameState();
        frames[activeFrameIdx].duration = existingDur;
        saveFrames();
      }
    }

    function renderFrameStrip() {
      const strip = document.getElementById('tb-frames-strip');
      if (!strip) return;
      let html = '';
      frames.forEach((f, i) => {
        if (i > 0) {
          html += `<div class="tb-frame-gap">` +
            `<input class="tb-frame-dur" type="text" inputmode="decimal" value="${((f.duration || 1000) / 1000).toFixed(1)}s" data-frame-idx="${i}" title="Transition time (s)">` +
            `</div>`;
        }
        html += `<div class="tb-frame-item${i === activeFrameIdx ? ' tb-frame-active' : ''}" data-frame-idx="${i}">` +
          `<button class="tb-frame-del" data-del-idx="${i}" title="Delete frame">✕</button>` +
          `<div class="tb-frame-thumb" data-frame-idx="${i}">${i + 1}</div>` +
          `</div>`;
      });
      html += `<button class="tb-frame-add" id="tb-frame-add" title="Add frame">+</button>`;
      strip.innerHTML = html;
      // Re-bind
      strip.querySelector('#tb-frame-add')?.addEventListener('click', addFrame);
      strip.querySelectorAll('.tb-frame-thumb').forEach(th => {
        th.addEventListener('click', () => {
          const idx = Number(th.dataset.frameIdx);
          if (idx === activeFrameIdx) return;
          activeFrameIdx = idx;
          applyFrameState(frames[idx]);
          saveFrames();
          renderFrameStrip();
        });
      });
      strip.querySelectorAll('.tb-frame-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const idx = Number(btn.dataset.delIdx);
          frames.splice(idx, 1);
          if (frames.length === 0) { activeFrameIdx = -1; }
          else if (activeFrameIdx >= frames.length) { activeFrameIdx = frames.length - 1; applyFrameState(frames[activeFrameIdx]); }
          else if (idx === activeFrameIdx) { activeFrameIdx = Math.min(idx, frames.length - 1); applyFrameState(frames[activeFrameIdx]); }
          else if (idx < activeFrameIdx) { activeFrameIdx--; }
          saveFrames();
          renderFrameStrip();
        });
      });
      strip.querySelectorAll('.tb-frame-dur').forEach(inp => {
        inp.addEventListener('change', () => {
          const idx = Number(inp.dataset.frameIdx);
          if (frames[idx]) {
            const num = parseFloat(inp.value.replace(/s$/i, '')) || 1;
            frames[idx].duration = Math.max(100, Math.round(num * 1000));
            inp.value = (frames[idx].duration / 1000).toFixed(1) + 's';
            saveFrames();
          }
        });
      });
    }

    function addFrame() {
      autoSaveFrame();
      // Duplicate the last frame (regardless of which frame is selected)
      const lastFrame = frames.length > 0 ? JSON.parse(JSON.stringify(frames[frames.length - 1])) : captureFrameState();
      lastFrame.duration = 1000;
      frames.push(lastFrame);
      activeFrameIdx = frames.length - 1;
      applyFrameState(lastFrame);
      saveFrames();
      renderFrameStrip();
    }

    // Play animation: interpolates positions between frames
    const playBtn = document.getElementById('tb-frame-play');
    playBtn?.addEventListener('click', () => {
      if (framePlaying) { framePlaying = false; playBtn.classList.remove('playing'); return; }
      if (frames.length < 2) return;
      autoSaveFrame();
      framePlaying = true;
      playBtn.classList.add('playing');
      deactivateDrawTools();
      clearSelection();
      let fIdx = 0;
      applyFrameState(frames[0]);
      activeFrameIdx = 0;
      renderFrameStrip();

      function playNext() {
        if (!framePlaying || fIdx >= frames.length - 1) {
          applyFrameState(frames[0]);
          refreshArrowheads(arrowsSvg);
          activeFrameIdx = 0;
          renderFrameStrip();
          framePlaying = false;
          playBtn.classList.remove('playing');
          return;
        }
        const from = frames[fIdx];
        const to = frames[fIdx + 1];
        const dur = to.duration || 1000;
        const startT = performance.now();

        function animate(now) {
          if (!framePlaying) { applyFrameState(frames[0]); refreshArrowheads(arrowsSvg); activeFrameIdx = 0; renderFrameStrip(); playBtn.classList.remove('playing'); return; }
          const t = Math.min((now - startT) / dur, 1);
          interpolateAndApply(from, to, t);
          if (t < 1) {
            requestAnimationFrame(animate);
          } else {
            fIdx++;
            activeFrameIdx = fIdx;
            applyFrameState(frames[fIdx]);
            refreshArrowheads(arrowsSvg);
            renderFrameStrip();
            if (fIdx < frames.length - 1) {
              setTimeout(playNext, 0);
            } else {
              setTimeout(() => {
                applyFrameState(frames[0]);
                refreshArrowheads(arrowsSvg);
                activeFrameIdx = 0;
                renderFrameStrip();
                framePlaying = false;
                playBtn.classList.remove('playing');
              }, 1000);
            }
          }
        }
        requestAnimationFrame(animate);
      }
      setTimeout(playNext, 200);
    });
    function lerp(a, b, t) { return a + (b - a) * t; }

    function interpolateAndApply(from, to, t) {
      const teamColor = document.getElementById('tb-team-color')?.value || '#ffffff';
      const oppColor = document.getElementById('tb-opp-color')?.value || '#e53935';
      const currentNumbers = JSON.parse(localStorage.getItem('fa_tactic_numbers') || '[]');
      const currentOppNumbers = JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || '[]');
      const currentColors = JSON.parse(localStorage.getItem('fa_tactic_colors') || '[]');

      // --- Team circles: match by stable array index ---
      const fromPos = from.positions || [];
      const toPos = to.positions || [];
      const maxLen = Math.max(fromPos.length, toPos.length);

      // Build a map of existing DOM circles by dataset.idx
      let circleMap = {};
      inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => {
        circleMap[Number(c.dataset.idx)] = c;
      });

      // Merge colors: prefer current (synced) over frame-local
      const fClrs = to.colors || [];
      const clrs = [];
      const maxClrLen = Math.max(currentColors.length, fClrs.length);
      for (let ci = 0; ci < maxClrLen; ci++) {
        clrs[ci] = currentColors[ci] || fClrs[ci] || '';
      }
      for (let i = 0; i < maxLen; i++) {
        const fP = fromPos[i]; // from-frame position (or null if deleted/absent)
        const tP = toPos[i];   // to-frame position (or null if deleted/absent)
        const circle = circleMap[i];

        if (!tP) {
          // Circle deleted in target frame — remove from DOM
          if (circle) { circle.remove(); delete circleMap[i]; }
          continue;
        }

        if (!circle) {
          // Circle new in target frame — create at target position
          const num = currentNumbers[i] || '';
          const isGk = String(num) === '1';
          const bg = isGk ? GK_COLOR : (clrs[i] || teamColor);
          const d = toDisplay(tP[0], tP[1]);
          const div = document.createElement('div');
          div.className = 'tb-circle';
          div.dataset.idx = i;
          if (clrs[i]) div.dataset.color = clrs[i];
          div.style.left = d[0] + '%'; div.style.top = d[1] + '%';
          div.style.background = bg; div.style.borderColor = darkenHex(bg, 50);
          const inp = document.createElement('input');
          inp.className = 'tb-num'; inp.maxLength = 2;
          inp.value = num;
          inp.style.color = textColorFor(bg);
          div.appendChild(inp);
          inner.appendChild(div);
          circleMap[i] = div;
          continue;
        }

        // Circle exists in both frames — interpolate position
        if (fP && tP) {
          const hL = lerp(fP[0], tP[0], t);
          const hT = lerp(fP[1], tP[1], t);
          const d = toDisplay(hL, hT);
          circle.style.left = d[0] + '%'; circle.style.top = d[1] + '%';
        } else if (!fP && tP) {
          // Snap: circle new in target frame, already in DOM from prior tick
          const d = toDisplay(tP[0], tP[1]);
          circle.style.left = d[0] + '%'; circle.style.top = d[1] + '%';
        }
      }

      // --- Opp circles: same stable-index matching ---
      const fromOpp = from.oppPositions || [];
      const toOpp = to.oppPositions || [];
      const maxOppLen = Math.max(fromOpp.length, toOpp.length);

      let oppMap = {};
      inner.querySelectorAll('.tb-circle-opp').forEach(c => {
        oppMap[Number(c.dataset.idx)] = c;
      });

      for (let i = 0; i < maxOppLen; i++) {
        const fP = fromOpp[i];
        const tP = toOpp[i];
        const circle = oppMap[i];

        if (!tP) {
          if (circle) { circle.remove(); delete oppMap[i]; }
          continue;
        }

        if (!circle) {
          const num = currentOppNumbers[i] || '';
          const isGk = String(num) === '1';
          const oppBg = isGk ? GK_COLOR : oppColor;
          const d = toDisplay(tP[0], tP[1]);
          const div = document.createElement('div');
          div.className = 'tb-circle tb-circle-opp';
          div.dataset.idx = i;
          div.style.left = d[0] + '%'; div.style.top = d[1] + '%';
          div.style.background = oppBg; div.style.borderColor = darkenHex(oppBg, 50);
          const inp = document.createElement('input');
          inp.className = 'tb-num'; inp.maxLength = 2;
          inp.value = num;
          inp.style.color = textColorFor(oppBg);
          div.appendChild(inp);
          inner.appendChild(div);
          oppMap[i] = div;
          continue;
        }

        if (fP && tP) {
          const hL = lerp(fP[0], tP[0], t);
          const hT = lerp(fP[1], tP[1], t);
          const d = toDisplay(hL, hT);
          circle.style.left = d[0] + '%'; circle.style.top = d[1] + '%';
        } else if (!fP && tP) {
          const d = toDisplay(tP[0], tP[1]);
          circle.style.left = d[0] + '%'; circle.style.top = d[1] + '%';
        }
      }

      // Balls
      const fromBalls = from.balls || [];
      const toBalls = to.balls || [];
      const maxBalls = Math.max(fromBalls.length, toBalls.length);
      let ballMap = {};
      inner.querySelectorAll('.tb-ball').forEach(b => { ballMap[Number(b.dataset.idx || 0)] = b; });
      for (let bi = 0; bi < maxBalls; bi++) {
        const fB = fromBalls[bi];
        const tB = toBalls[bi];
        let ball = ballMap[bi];
        if (!tB) { if (ball) { ball.remove(); } continue; }
        if (!ball) {
          const d = toDisplay(tB[0], tB[1]);
          ball = document.createElement('div');
          ball.className = 'tb-ball'; ball.dataset.idx = bi;
          ball.style.left = d[0] + '%'; ball.style.top = d[1] + '%';
          inner.appendChild(ball);
          continue;
        }
        if (fB && tB) {
          const bL = lerp(fB[0], tB[0], t);
          const bT = lerp(fB[1], tB[1], t);
          const bd = toDisplay(bL, bT);
          ball.style.left = bd[0] + '%'; ball.style.top = bd[1] + '%';
        } else if (!fB && tB) {
          const d = toDisplay(tB[0], tB[1]);
          ball.style.left = d[0] + '%'; ball.style.top = d[1] + '%';
        }
      }
      // Arrows — snap to target frame at t=0
      const tArr = to.arrows || [];
      const curArrows = arrowsSvg.querySelectorAll('.tb-arrow');
      const arrKey = tArr.map(a => a.join(',')).join('|');
      const curArrKey = Array.from(curArrows).map(a => [a.getAttribute('x1'),a.getAttribute('y1'),a.getAttribute('x2'),a.getAttribute('y2'),a.dataset.color||'',a.dataset.dash||''].join(',')).join('|');
      if (arrKey !== curArrKey) {
        curArrows.forEach(a => a.remove());
        tArr.forEach((a, idx) => {
          const d1 = toDisplay(a[0], a[1]);
          const d2 = toDisplay(a[2], a[3]);
          const col = a[4] || '#ffffff';
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.classList.add('tb-arrow');
          line.setAttribute('x1', d1[0] + '%'); line.setAttribute('y1', d1[1] + '%');
          line.setAttribute('x2', d2[0] + '%'); line.setAttribute('y2', d2[1] + '%');
          line.setAttribute('stroke', col);
          line.style.stroke = col;
          line.dataset.color = col; line.dataset.idx = idx;
          if (a[5]) { line.setAttribute('stroke-dasharray', '4 3'); line.dataset.dash = '1'; }
          arrowsSvg.appendChild(line);
        });
        refreshArrowheads(arrowsSvg);
      }
      // Rects — snap to target frame at t=0
      const tRects = to.rects || [];
      const curRects = arrowsSvg.querySelectorAll('.tb-rect');
      const recKey = tRects.map(r => r.join(',')).join('|');
      const curRecKey = Array.from(curRects).map(r => [r.getAttribute('x'),r.getAttribute('y'),r.getAttribute('width'),r.getAttribute('height'),r.dataset.color||'',r.dataset.opacity||''].join(',')).join('|');
      if (recKey !== curRecKey) {
        curRects.forEach(r => r.remove());
        const defs = arrowsSvg.querySelector('defs');
        tRects.forEach((r, idx) => {
          const tl = toDisplay(r[0], r[1]);
          const br = toDisplay(r[0] + r[2], r[1] + r[3]);
          const dx = Math.min(tl[0], br[0]), dy = Math.min(tl[1], br[1]);
          const dw = Math.abs(br[0] - tl[0]), dh = Math.abs(br[1] - tl[1]);
          const col = r[4] || '#ffffff';
          const op = r[5] != null ? r[5] : 0.3;
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.classList.add('tb-rect');
          rect.setAttribute('x', dx + '%'); rect.setAttribute('y', dy + '%');
          rect.setAttribute('width', dw + '%'); rect.setAttribute('height', dh + '%');
          rect.setAttribute('fill', col); rect.setAttribute('fill-opacity', op);
          rect.setAttribute('stroke', col);
          rect.dataset.color = col; rect.dataset.opacity = op; rect.dataset.idx = idx;
          if (defs) defs.insertAdjacentElement('afterend', rect);
          else arrowsSvg.appendChild(rect);
        });
      }
      // Pen lines — snap to target frame at t=0
      const tPen = to.penLines || [];
      const curPen = arrowsSvg.querySelectorAll('.tb-pen-line');
      const penKey = tPen.map(p => p[0]).join('|');
      const curKey = Array.from(curPen).map(p => p.getAttribute('points')).join('|');
      if (penKey !== curKey) {
        curPen.forEach(p => p.remove());
        tPen.forEach(p => {
          const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          pl.setAttribute('class', 'tb-pen-line');
          pl.setAttribute('points', p[0]);
          pl.style.cssText = 'pointer-events:none;fill:none;stroke:' + (p[1]||'#ffffff') + ';stroke-width:2.5;vector-effect:non-scaling-stroke;';
          if (p[2]) pl.setAttribute('stroke-dasharray', '6 4');
          arrowsSvg.appendChild(pl);
        });
      }
      // Cones — snap to target frame at t=0
      const tCones = to.cones || [];
      const curCones = inner.querySelectorAll('.tb-cone');
      const coneKey = tCones.map(c => c[0] + ',' + c[1]).join('|');
      const curConeKey = Array.from(curCones).map(c => parseFloat(c.style.left) + ',' + parseFloat(c.style.top)).join('|');
      if (coneKey !== curConeKey) {
        curCones.forEach(c => c.remove());
        tCones.forEach(c => spawnCone(c[0], c[1]));
      }
    }

    // Patch makeDraggable's pointerup and SVG drag to auto-save frames
    inner.addEventListener('pointerup', () => { if (activeFrameIdx >= 0) setTimeout(autoSaveFrame, 50); }, true);
    arrowsSvg.addEventListener('pointerup', () => { if (activeFrameIdx >= 0) setTimeout(autoSaveFrame, 80); }, true);

    // Init
    renderFrameStrip();
    // Compute polygon arrowheads after layout is ready
    requestAnimationFrame(() => refreshArrowheads(arrowsSvg));
    // Update arrowheads on resize
    let _ahResizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_ahResizeTimer);
      _ahResizeTimer = setTimeout(() => {
        refreshArrowheads(arrowsSvg);
        document.querySelectorAll('.tb-field-readonly .tb-arrows-svg').forEach(svg => refreshArrowheads(svg));
      }, 150);
    });
  }

  // TACTIC_FORMATIONS → utils.js

  function hasTacticUnsavedChanges() {
    const curFormation = localStorage.getItem('fa_tactic_formation') || '';
    const curPositions = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
    const curNumbers = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
    const curName = localStorage.getItem('fa_tactic_name') || '';
    if (!curFormation) return false;
    const loadedIdx = localStorage.getItem('fa_tactic_loaded_idx');
    if (loadedIdx === null) {
      if (curName) return true;
      if (curNumbers && curNumbers.some(n => n && n !== '')) return true;
      if (curPositions && TACTIC_FORMATIONS[curFormation]) {
        const def = TACTIC_FORMATIONS[curFormation];
        for (let i = 0; i < curPositions.length; i++) {
          if (Math.round(curPositions[i][0]*100) !== Math.round(def[i][0]*100) ||
              Math.round(curPositions[i][1]*100) !== Math.round(def[i][1]*100)) return true;
        }
      }
      return false;
    }
    const saved = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
    const board = saved[loadedIdx];
    if (!board) return true;
    if (curFormation !== board.formation) return true;
    if (curName !== (board.name || '')) return true;
    if (JSON.stringify(curPositions) !== JSON.stringify(board.positions)) return true;
    if (JSON.stringify(curNumbers) !== JSON.stringify(board.numbers)) return true;
    return false;
  }

  function bindTacticsSavedList() {
    document.querySelectorAll('.tb-saved-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.tb-delete-board')) return;
        const idx = item.dataset.boardIdx;
        const boards = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
        const board = boards[idx];
        if (!board) return;
        const doLoad = () => {
          localStorage.setItem('fa_tactic_formation', board.formation || '');
          localStorage.setItem('fa_tactic_positions', JSON.stringify(board.positions));
          localStorage.setItem('fa_tactic_numbers', JSON.stringify(board.numbers));
          localStorage.setItem('fa_tactic_name', board.name || '');
          localStorage.setItem('fa_tactic_board_type', board.boardType || 'full');
          localStorage.setItem('fa_tactic_loaded_idx', idx);
          localStorage.setItem('fa_tactic_team_color', board.teamColor || '#ffffff');
          localStorage.setItem('fa_tactic_opp_color', board.oppColor || '#e53935');
          localStorage.setItem('fa_tactic_show_opp', board.showOpp ? 'true' : 'false');
          if (board.oppPositions) localStorage.setItem('fa_tactic_opp_positions', JSON.stringify(board.oppPositions));
          else localStorage.removeItem('fa_tactic_opp_positions');
          if (board.oppNumbers) localStorage.setItem('fa_tactic_opp_numbers', JSON.stringify(board.oppNumbers));
          else localStorage.removeItem('fa_tactic_opp_numbers');
          const _boardBalls = board.balls || (board.ballPos ? [board.ballPos] : []);
          localStorage.setItem('fa_tactic_balls', JSON.stringify(_boardBalls));
          if (board.colors) localStorage.setItem('fa_tactic_colors', JSON.stringify(board.colors));
          else localStorage.removeItem('fa_tactic_colors');
          if (board.arrows && board.arrows.length) localStorage.setItem('fa_tactic_arrows', JSON.stringify(board.arrows));
          else localStorage.removeItem('fa_tactic_arrows');
          if (board.rects && board.rects.length) localStorage.setItem('fa_tactic_rects', JSON.stringify(board.rects));
          else localStorage.removeItem('fa_tactic_rects');
          if (board.texts && board.texts.length) localStorage.setItem('fa_tactic_texts', JSON.stringify(board.texts));
          else localStorage.removeItem('fa_tactic_texts');
          if (board.penLines && board.penLines.length) localStorage.setItem('fa_tactic_pen_lines', JSON.stringify(board.penLines));
          else localStorage.removeItem('fa_tactic_pen_lines');
          if (board.frames && board.frames.length) localStorage.setItem('fa_tactic_frames', JSON.stringify(board.frames));
          else localStorage.removeItem('fa_tactic_frames');
          if (board.tag) localStorage.setItem('fa_tactic_tag', board.tag);
          else localStorage.removeItem('fa_tactic_tag');
          if (board.silhouette) localStorage.setItem('fa_tactic_silhouette', board.silhouette);
          else localStorage.removeItem('fa_tactic_silhouette');
          if (board.cones && board.cones.length) localStorage.setItem('fa_tactic_cones', JSON.stringify(board.cones));
          else localStorage.removeItem('fa_tactic_cones');
          localStorage.removeItem('fa_tactic_frame_idx');
          navigate('tactics');
        };
        if (hasTacticUnsavedChanges()) {
          showTbConfirm('Load Board', 'You have unsaved changes. Discard them and load this board?', doLoad);
        } else {
          doLoad();
        }
      });
    });
    document.querySelectorAll('.tb-delete-board').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.delIdx);
        showTbConfirm('Delete Board', 'Remove this saved board?', () => {
          const boards = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
          const deletedName = boards[idx] ? boards[idx].name : null;
          boards.splice(idx, 1);
          localStorage.setItem('fa_tactic_saved', JSON.stringify(boards));
          // Also remove from match-linked boards
          if (deletedName) {
            const mb = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
            let mbChanged = false;
            for (const mid of Object.keys(mb)) {
              const before = mb[mid].length;
              mb[mid] = mb[mid].filter(b => b.name !== deletedName);
              if (mb[mid].length !== before) mbChanged = true;
              if (!mb[mid].length) { delete mb[mid]; mbChanged = true; }
            }
            if (mbChanged) localStorage.setItem('fa_tactic_match_boards', JSON.stringify(mb));
          }
          const li = localStorage.getItem('fa_tactic_loaded_idx');
          if (li !== null) {
            if (Number(li) === idx) localStorage.removeItem('fa_tactic_loaded_idx');
            else if (Number(li) > idx) localStorage.setItem('fa_tactic_loaded_idx', Number(li) - 1);
          }
          const listEl = document.getElementById('tb-saved-list');
          if (listEl) {
            const updatedBoards = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
            const updLi = localStorage.getItem('fa_tactic_loaded_idx');
            listEl.innerHTML = updatedBoards.map((b, i) =>
              `<div class="tb-saved-item${updLi == i ? ' tb-saved-active' : ''}" data-board-idx="${i}">` +
              `<span>${sanitize(b.name || 'Board ' + (i+1))}</span>` +
              `<button class="tb-delete-board" data-del-idx="${i}">✕</button>` +
              `</div>`
            ).join('');
            bindTacticsSavedList();
          }
        });
      });
    });
  }

  function showTbConfirm(title, message, onConfirm) {
    const existing = document.querySelector('.tb-confirm-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tb-confirm-overlay';
    overlay.innerHTML = `<div class="tb-confirm-card">
      <div class="tb-confirm-title">${sanitize(title)}</div>
      <p class="tb-confirm-msg">${sanitize(message)}</p>
      <div class="tb-confirm-actions">
        <button class="btn btn-small btn-outline" id="tbc-cancel">Cancel</button>
        <button class="btn btn-small btn-primary" id="tbc-yes">Yes, continue</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    const close = () => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); };
    overlay.querySelector('#tbc-cancel').addEventListener('click', close);
    overlay.querySelector('#tbc-yes').addEventListener('click', () => { close(); onConfirm(); });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }

  // #endregion Tactical Board Editor

  // #region Training & Staff Views
  // ----- Shared pages -----
  function renderTraining() {
    var allTraining = JSON.parse(localStorage.getItem('fa_training') || '[]');
    var curCat = getCurrentCategory();
    var training = curCat ? allTraining.filter(function(t) { return !t.category || t.category === curCat; }) : allTraining;
    let rows = training.map(t => {
      const dateStr = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
      const assistanceCell = (t.status === 'past' && t.assistance != null)
        ? buildAssistanceCircle(t.assistance)
        : '<span style="color:var(--text-secondary)">—</span>';
      return `<tr>
        <td><strong>${sanitize(t.day)}</strong></td><td>${dateStr}</td><td>${sanitize(t.time)}</td><td>${sanitize(t.focus)}</td><td>${sanitize(t.location)}</td><td class="center-cell">${assistanceCell}</td>
      </tr>`;
    }).join('');
    return `
      <h2 class="page-title">Training Schedule</h2>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Day</th><th>Date</th><th>Time</th><th>Focus</th><th>Location</th><th class="center-cell">Assistance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
  }

  function renderStaffTraining() {
    var allTraining = JSON.parse(localStorage.getItem('fa_training') || '[]');
    // Sort the full list (not just filtered) and persist
    allTraining.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    localStorage.setItem('fa_training', JSON.stringify(allTraining));
    var curCat = getCurrentCategory();
    var training = curCat ? allTraining.filter(function(t) { return !t.category || t.category === curCat; }) : allTraining;
    const DEFAULT_LOC = 'Escola Industrial';
    const DEFAULT_MAP = 'https://share.google/pfbMOc661aRSNlynk';
    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    function computeStatus(t) {
      if (!t.date || !t.time) return { label: 'Upcoming', cls: 'badge-green', key: 'upcoming' };
      const start = new Date(t.date + 'T' + t.time.split(' - ')[0] + ':00');
      const now = new Date();
      const endWindow = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      if (now >= endWindow) return { label: 'Completed', cls: 'badge-grey', key: 'completed' };
      if (now >= start) return { label: 'In progress', cls: 'badge-yellow', key: 'inprogress' };
      return { label: 'Upcoming', cls: 'badge-green', key: 'upcoming' };
    }

    function fmtDate(dateStr) {
      if (!dateStr) return '';
      const [y, m, d] = dateStr.split('-');
      return d + '/' + m + '/' + y;
    }

    let rows = training.map((t, i) => {
      const dayName = t.date ? DAYS[new Date(t.date + 'T12:00:00').getDay()] : (t.day || '\u2014');
      const locVal = t.location || DEFAULT_LOC;
      const linkVal = t.mapLink || (locVal === DEFAULT_LOC ? DEFAULT_MAP : '');
      const st = computeStatus(t);
      const locked = st.key !== 'upcoming';
      const dis = locked ? ' disabled' : '';
      const assistanceCell = t.date
        ? buildAvailDonut(t.date)
        : '<span style="color:var(--text-secondary)">\u2014</span>';
      if (locked) {
        return `<tr data-tidx="${i}" class="st-locked">
      <td style="white-space:nowrap">
        <span>${fmtDate(t.date)}</span>
        <span class="st-day-label">${sanitize(dayName)}</span>
      </td>
      <td>${sanitize(t.time || '\u2014')}</td>
      <td>${sanitize(t.focus || '\u2014')}</td>
      <td>${sanitize(locVal)}</td>
      <td>${linkVal ? '<a href="' + sanitize(linkVal) + '" target="_blank" rel="noopener" class="detail-map-link">\ud83d\udccd</a>' : '\u2014'}</td>
      <td class="center-cell"><span class="badge ${st.cls}">${st.label}</span></td>
      <td class="center-cell">${assistanceCell}</td>
      <td></td>
    </tr>`;
      }
      const dmyVal = t.date ? fmtDate(t.date) : '';
      return `<tr data-tidx="${i}">
      <td style="white-space:nowrap">
        <input type="text" class="reg-input st-date md-datepicker" data-display-dmy data-idx="${i}" data-date-iso="${sanitize(t.date || '')}" value="${sanitize(dmyVal)}" placeholder="dd/mm/yyyy" readonly style="width:135px;cursor:pointer;">
        <span class="st-day-label">${sanitize(dayName)}</span>
      </td>
      <td><select class="reg-input st-time" data-idx="${i}" style="width:95px;">${buildTimeOptions((t.time || '').split(' - ')[0])}</select></td>
      <td><input class="reg-input st-focus" data-idx="${i}" value="${sanitize(t.focus || '')}" placeholder="Focus *" style="width:130px;"></td>
      <td><input class="reg-input st-location" data-idx="${i}" value="${sanitize(locVal)}" placeholder="Location" style="width:130px;"></td>
      <td><input class="reg-input st-link" data-idx="${i}" value="${sanitize(linkVal)}" placeholder="Map link" style="width:160px;"></td>
      <td class="center-cell"><span class="badge ${st.cls}">${st.label}</span></td>
      <td class="center-cell">${assistanceCell}</td>
      <td><button class="md-remove-btn st-remove" data-idx="${i}" title="Remove">&times;</button></td>
    </tr>`;
    }).join('');
    // Overall season attendance donut
    const allPlayers = getUsers().filter(u => (u.roles || []).includes('player'));
    const totalPlayers = allPlayers.length;
    const sessionCount = training.filter(t => t.date).length;
    let seasonYes = 0, seasonLate = 0, seasonNo = 0, seasonInjured = 0, seasonNa = 0;
    const playerAttend = {};
    const playerAbsent = {};
    if (totalPlayers) {
      allPlayers.forEach(p => { playerAttend[p.id] = 0; playerAbsent[p.id] = 0; });
      training.forEach(t => {
        if (!t.date) return;
        const tLocked = isTrainingLocked(t);
        allPlayers.forEach(p => {
          const v = getEffectiveAnswer(p.id, t.date, tLocked);
          if (v === 'yes') { seasonYes++; playerAttend[p.id]++; }
          else if (v === 'late') { seasonLate++; playerAttend[p.id]++; }
          else if (v === 'no') { seasonNo++; playerAbsent[p.id]++; }
          else if (v === 'injured') { seasonInjured++; playerAbsent[p.id]++; }
          else { seasonNa++; }
        });
      });
    }
    const seasonTotal = seasonYes + seasonLate + seasonNo + seasonInjured + seasonNa;
    const seasonAttending = seasonYes + seasonLate;
    let seasonDonutHtml = '';
    if (seasonTotal > 0) {
      const size = 130, stroke = 18, radius = (size - stroke) / 2;
      const circ = 2 * Math.PI * radius;
      const segs = [
        { count: seasonYes, color: '#66bb6a', label: 'Yes' },
        { count: seasonLate, color: '#ffa726', label: 'Late' },
        { count: seasonNo, color: '#78909c', label: 'No' },
        { count: seasonInjured, color: '#ef5350', label: 'Injured' },
        { count: seasonNa, color: '#d0d0d0', label: 'N/A' }
      ];
      let arcs = '', off = 0;
      segs.forEach(s => {
        if (s.count > 0) {
          const len = (s.count / seasonTotal) * circ;
          const sPct = Math.round((s.count / seasonTotal) * 100);
          arcs += `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
            stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}"
            style="--circ:${circ};cursor:pointer;pointer-events:stroke" transform="rotate(-90 ${size/2} ${size/2})" data-tooltip="${s.label}: ${sPct}%"><title>${s.label}: ${sPct}%</title></circle>`;
          off += len;
        }
      });
      const pct = Math.round((seasonAttending / seasonTotal) * 100);
      const avgYes = Math.round(seasonYes / sessionCount);
      const avgLate = Math.round(seasonLate / sessionCount);
      const avgNo = Math.round(seasonNo / sessionCount);
      const avgInj = Math.round(seasonInjured / sessionCount);
      const avgNa = Math.round(seasonNa / sessionCount);

      // Top 3 attending / not attending
      const sortedAttend = allPlayers.map(p => ({ name: p.name, count: playerAttend[p.id] || 0 })).sort((a, b) => b.count - a.count).slice(0, 3);
      const sortedAbsent = allPlayers.map(p => ({ name: p.name, count: playerAbsent[p.id] || 0 })).sort((a, b) => b.count - a.count).slice(0, 3);
      const top3AttendHtml = sortedAttend.map((p, i) => `<div class="std-top-row"><span class="std-top-rank">${i + 1}.</span><span class="std-top-name">${sanitize(p.name)}</span><span class="std-top-count" style="color:#66bb6a">${p.count}</span></div>`).join('');
      const top3AbsentHtml = sortedAbsent.map((p, i) => `<div class="std-top-row"><span class="std-top-rank">${i + 1}.</span><span class="std-top-name">${sanitize(p.name)}</span><span class="std-top-count" style="color:#ef5350">${p.count}</span></div>`).join('');

      // Currently injured players
      const availAllData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
      const sortedDates = training.filter(t => t.date).map(t => t.date).sort();
      const injuredPlayers = allPlayers.filter(p => {
        // Find their most recent answer across all training sessions
        for (let d = sortedDates.length - 1; d >= 0; d--) {
          const v = availAllData[p.id + '_' + sortedDates[d]];
          if (v) return v === 'injured';
        }
        return (p.fitnessStatus || 'fit') === 'injured';
      });
      const injuredHtml = injuredPlayers.map(p => {
        const injury = p.injuryNote || 'Injured';
        // Count consecutive weeks injured from most recent backwards
        let weeks = 0;
        for (let d = sortedDates.length - 1; d >= 0; d--) {
          const v = availAllData[p.id + '_' + sortedDates[d]];
          if (v === 'injured') weeks++;
          else if (v) break;
        }
        if (weeks === 0) weeks = 1;
        const weekLabel = weeks === 1 ? '1 week' : weeks + ' weeks';
        return `<div class="std-top-row"><span class="std-top-name" title="${sanitize(injury)}">${sanitize(p.name)}</span><span class="std-top-count" style="color:#ef5350">${weekLabel}</span></div>`;
      }).join('') || '<div class="std-top-row" style="color:var(--text-secondary)">None</div>';

      seasonDonutHtml = `<div class="card" style="margin-bottom:1.5rem;">
        <div class="card-title">Season Attendance</div>
        <div class="std-donut-wrap">
          <div class="std-donut">
            <svg viewBox="0 0 ${size} ${size}">
              <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
              ${arcs}
            </svg>
            <span class="std-donut-label">${pct}%</span>
          </div>
          <div>
            <div class="std-donut-legend">
              <span class="std-legend-item"><span class="std-legend-dot" style="background:#66bb6a"></span>Yes (${avgYes})</span>
              <span class="std-legend-item"><span class="std-legend-dot" style="background:#ffa726"></span>Late (${avgLate})</span>
              <span class="std-legend-item"><span class="std-legend-dot" style="background:#78909c"></span>No (${avgNo})</span>
              <span class="std-legend-item"><span class="std-legend-dot" style="background:#ef5350"></span>Injured (${avgInj})</span>
              ${avgNa ? `<span class="std-legend-item"><span class="std-legend-dot" style="background:#d0d0d0"></span>N/A (${avgNa})</span>` : ''}
            </div>
            <div class="std-season-stat">Total Sessions: <strong>${sessionCount}</strong></div>
          </div>
          <div class="std-top-lists">
            <div class="std-top-card">
              <div class="std-top-title">🏆 Top Attendance</div>
              ${top3AttendHtml}
            </div>
            <div class="std-top-card">
              <div class="std-top-title">⚠️ Most Absent</div>
              ${top3AbsentHtml}
            </div>
            <div class="std-top-card">
              <div class="std-top-title">❌ Currently Injured</div>
              <div class="std-top-scroll">${injuredHtml}</div>
            </div>
          </div>
        </div>
      </div>`;
    }

    return `
      <h2 class="page-title">Training Sessions</h2>
      ${seasonDonutHtml}
      <div class="card">
        <div style="display:flex;justify-content:flex-end;margin-bottom:.5rem;">
          <button class="btn btn-outline btn-small matchday-add" id="btn-training-add-top">+ Add Training</button>
        </div>
        <div class="table-wrap"><table class="matchday-table">
        <thead><tr><th>Date</th><th>Time</th><th>Focus</th><th>Location</th><th>Link</th><th class="center-cell">Status</th><th class="center-cell">Attendance</th><th></th></tr></thead>
        <tbody id="staff-training-body">${rows}</tbody>
      </table></div>
      </div>`;
  }

  function seedMockAvailability(trainingDate, players) {
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const choices = ['yes', 'late', 'no', 'injured'];
    let seeded = false;
    players.forEach(p => {
      const key = p.id + '_' + trainingDate;
      if (!availData[key]) {
        availData[key] = choices[Math.floor(Math.random() * choices.length)];
        seeded = true;
      }
    });
    if (seeded) localStorage.setItem('fa_training_availability', JSON.stringify(availData));
  }

  function isTrainingLocked(t) {
    if (!t.date || !t.time) return false;
    const start = new Date(t.date + 'T' + t.time.split(' - ')[0] + ':00');
    return new Date() >= new Date(start.getTime() - 60 * 60 * 1000);
  }

  function getEffectiveAnswer(playerId, trainingDate, locked) {
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const overrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const key = playerId + '_' + trainingDate;
    const staffVal = overrides[key];
    if (staffVal) return staffVal;
    const playerVal = availData[key];
    if (playerVal) return playerVal;
    return locked ? 'na' : null;
  }

  function buildDetailDonut(trainingDate, players, locked) {
    const total = players.length;
    if (!total) return '';
    let yes = 0, late = 0, no = 0, injured = 0, na = 0;
    players.forEach(p => {
      const v = getEffectiveAnswer(p.id, trainingDate, locked);
      if (v === 'yes') yes++;
      else if (v === 'late') late++;
      else if (v === 'no') no++;
      else if (v === 'injured') injured++;
      else na++;
    });
    const attending = yes + late;
    const size = 100;
    const stroke = 12;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const segments = [
      { count: yes, color: '#66bb6a', label: 'Yes' },
      { count: late, color: '#ffa726', label: 'Late' },
      { count: no, color: '#78909c', label: 'No' },
      { count: injured, color: '#ef5350', label: 'Injured' },
      { count: na, color: '#d0d0d0', label: 'N/A' }
    ];
    let arcs = '';
    let offset = 0;
    segments.forEach(s => {
      if (s.count > 0) {
        const len = (s.count / total) * circumference;
        const sPct = Math.round((s.count / total) * 100);
        arcs += `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
          stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}"
          style="--circ:${circumference};cursor:pointer;pointer-events:stroke" transform="rotate(-90 ${size/2} ${size/2})" data-tooltip="${s.label}: ${sPct}%"><title>${s.label}: ${sPct}%</title></circle>`;
        offset += len;
      }
    });
    return `<div class="std-donut" style="width:${size}px;height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
        ${arcs}
      </svg>
      <span class="std-donut-label">${attending}/${total}</span>
    </div>
    <div class="std-donut-legend">
      <span class="std-legend-item"><span class="std-legend-dot" style="background:#66bb6a"></span>Yes (${yes})</span>
      <span class="std-legend-item"><span class="std-legend-dot" style="background:#ffa726"></span>Late (${late})</span>
      <span class="std-legend-item"><span class="std-legend-dot" style="background:#78909c"></span>No (${no})</span>
      <span class="std-legend-item"><span class="std-legend-dot" style="background:#ef5350"></span>Injured (${injured})</span>
      ${na ? `<span class="std-legend-item"><span class="std-legend-dot" style="background:#d0d0d0"></span>N/A (${na})</span>` : ''}
    </div>`;
  }

  // ── Auto-generate teams state (ephemeral, not persisted) ──
  let _generatedTeams = null;
  let _generatedTeamsDate = null;

  // ── Render tactical boards section for staff training detail ──
  function renderStdBoardsSection(tdate) {
    const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
    const boards = trainingBoards[tdate] || [];
    if (!boards.length) return '';
    const hasTeams = _generatedTeams && _generatedTeamsDate === tdate;
    const tagOrder = ['Presión', 'Salida', 'Estrategia'];
    const grouped = {};
    boards.forEach(b => { const tg = b.tag || ''; if (!grouped[tg]) grouped[tg] = []; grouped[tg].push(b); });
    const orderedTags = [];
    tagOrder.forEach(tg => { if (grouped[tg]) orderedTags.push(tg); });
    Object.keys(grouped).forEach(tg => { if (!orderedTags.includes(tg)) orderedTags.push(tg); });
    return '<div class="card"><div class="card-title">Tactical Boards</div><div class="detail-boards-panel">' +
      orderedTags.map(tag => {
        const tagTitle = tag || 'General';
        return '<div class="detail-board-group"><div class="detail-board-group-title">' + sanitize(tagTitle) + '</div>' +
          grouped[tag].map(b => {
            const boardHtml = renderReadOnlyBoard(b, 'ro-std-');
            let teamsBlock = '';
            if (b.linkedTeams && b.linkedTeams.length) {
              teamsBlock = '<div class="tb-linked-teams">' +
                b.linkedTeams.map((tm, ti) => {
                  const rows = tm.players.map(p => {
                    const posArr = (p.position || '').split(',').map(s => s.trim()).filter(Boolean);
                    const posHtml = posArr.length ? posArr.map(pos => '<span class="pos-circle pos-' + pos + '">' + pos + '</span>').join('') : '';
                    const teamC = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
                    return '<div class="tb-lt-player">' + posHtml + ' <span>' + sanitize(p.name) + '</span>' + teamC + '</div>';
                  }).join('');
                  return '<div class="tb-lt-team"><div class="tb-lt-team-title">Equip ' + (ti + 1) + ' <span class="tg-team-count">' + tm.players.length + '</span></div>' + rows + '</div>';
                }).join('') +
                '<button class="tb-unlink-teams" data-board-name="' + sanitize(b.name).replace(/"/g, '&quot;') + '" data-tdate="' + tdate + '" title="Remove teams">&times;</button></div>';
            } else if (hasTeams) {
              teamsBlock = '<div class="tb-linked-teams-action"><button class="btn btn-small btn-orange tb-link-teams" data-board-name="' + sanitize(b.name).replace(/"/g, '&quot;') + '" data-tdate="' + tdate + '">📋 Afegir equips</button></div>';
            }
            return boardHtml + teamsBlock;
          }).join('') + '</div>';
      }).join('') + '</div></div>';
  }

  function renderStaffTrainingDetail() {
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const t = training.find(x => x.date === detailTrainingDate);
    if (!t) return '<div class="empty-state"><div class="empty-icon">🏋️</div><p>Training not found</p></div>';
    var curCat = getCurrentCategory();
    var catPlayers = getUsers().filter(u => (u.roles || []).includes('player'));
    if (curCat) catPlayers = catPlayers.filter(p => !p.category || p.category === curCat);
    const players = !stdTeamFilter ? catPlayers : catPlayers.filter(p => stdTeamFilter.has(p.team || ''));

    // Determine which team letters share this training slot
    const _dayMap = {0:'sun',1:'mon',2:'tue',3:'wed',4:'thu',5:'fri',6:'sat'};
    const _tDate = t.date ? new Date(t.date + 'T12:00:00') : null;
    const _tDayVal = _tDate ? _dayMap[_tDate.getDay()] : '';
    const _tStartTime = (t.time || '').split(' - ')[0].trim();
    const _allLetters = getTeamLetters(curCat);
    const _schedules = (_clubConfig && _clubConfig.schedules) ? _clubConfig.schedules : {};
    const _trainingLetters = _allLetters.filter(letter => {
      const key = (curCat || '') + '-' + letter;
      const sched = _schedules[key];
      if (!sched || !sched.training) return false;
      return sched.training.some(tr => tr.day === _tDayVal && tr.time === _tStartTime);
    });
    // Fallback: if no schedule match, show all letters
    const stdLettersForSlot = _trainingLetters.length ? _trainingLetters : _allLetters;
    const locked = isTrainingLocked(t);
    // Seed mock data only for demo/seeded environments
    if (localStorage.getItem('fa_seeded')) seedMockAvailability(t.date, players);
    const dateFormatted = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const overrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');

    const labels = { yes: 'Yes', late: 'Late', no: 'No', injured: 'Injured', na: 'N/A' };
    const cls = { yes: 'avail-yes', late: 'avail-late', no: 'avail-no', injured: 'avail-injured', na: 'avail-na' };
    const allOptions = ['yes', 'late', 'no', 'injured', 'na'];

    const playerRows = players.map(p => {
      const key = p.id + '_' + t.date;
      const playerAnswer = availData[key] || (locked ? 'na' : null);
      const staffAnswer = overrides[key] || null;
      const effective = staffAnswer || playerAnswer;
      const playerLabel = playerAnswer ? labels[playerAnswer] : '—';
      const playerCls = playerAnswer ? cls[playerAnswer] : '';
      const effectiveLabel = effective ? labels[effective] : '—';
      const effectiveCls = effective ? cls[effective] : '';
      const dropdown = allOptions.map(o =>
        `<option value="${o}" ${effective === o ? 'selected' : ''}>${labels[o]}</option>`
      ).join('');
      const teamCircle = p.team ? `<span class="conv-team-circle">${sanitize(p.team)}</span>` : '';

      const derived = deriveFitnessStatus(p.id, false);
      const fStatus = derived.fitnessStatus;
      const injNote = derived.injuryNote || (fStatus === 'doubt' ? 'Doubt' : fStatus === 'injured' ? 'Injury' : '');
      let statusIcon = '';
      if (fStatus === 'fit') statusIcon = '<span class="roster-status-icon roster-status-fit">✓</span>';
      else if (fStatus === 'doubt') statusIcon = `<span class="roster-status-icon roster-status-doubt" data-tooltip="${sanitize(injNote)}">?</span>`;
      else statusIcon = `<span class="roster-status-icon roster-status-injured" data-tooltip="${sanitize(injNote)}">✕</span>`;
      const rd = computeReadiness(p.id);
      const rdColor = rd.hasData ? rd.color : 'green';
      const rdScore = rd.hasData ? rd.score : '—';
      const acwrVal = rd.hasData ? (rd.acwr || 0) : 0;
      const acwrColor = !rd.hasData ? '#4caf50' : (acwrVal >= 0.8 && acwrVal <= 1.3) ? '#4caf50' : (acwrVal > 1.5 || acwrVal < 0.7) ? '#e53935' : '#ff9800';

      return `<tr>
        <td><span class="conv-pos-circles">${posCirclesHtmlGlobal(p)}</span></td>
        <td><span class="roster-name-wrap">${sanitize(p.name)}${teamCircle}</span></td>
        <td class="center-cell">${statusIcon}</td>
        <td class="center-cell"><span class="readiness-dot readiness-${rdColor}" data-tooltip="${rdScore}"></span></td>
        <td class="center-cell" style="font-weight:600;font-size:.82rem;color:${acwrColor}">${rd.hasData ? acwrVal.toFixed(2) : '—'}</td>
        <td class="center-cell"><span class="std-player-answer ${playerCls}">${playerLabel}</span></td>
        <td class="center-cell">
          <select class="std-staff-select ${effectiveCls}" data-player="${p.id}" data-date="${t.date}">
            ${dropdown}
          </select>
        </td>
      </tr>`;
    }).join('');

    const donutHtml = buildDetailDonut(t.date, players, locked);

    // Count present players for default config
    const presentPlayers = players.filter(p => {
      const eff = getEffectiveAnswer(p.id, t.date, locked);
      return eff === 'yes' || eff === 'late';
    });
    const presentCount = presentPlayers.length;
    const defaultPerTeam = Math.floor(presentCount / 2) || 1;

    // Render previously generated teams if they exist for this date
    let teamsHtml = '';
    if (_generatedTeams && _generatedTeamsDate === t.date) {
      teamsHtml = renderGeneratedTeams(_generatedTeams, players, t.date, locked);
    }

    return `
      <button class="btn btn-outline btn-small detail-back" data-back="staff-training">← Back</button>
      <div class="detail-hero detail-hero-training">
        <div class="detail-hero-badge"><span class="badge badge-green" style="font-size:.9rem;padding:.3rem .8rem;">Training</span></div>
        <h2 class="detail-title">${sanitize(t.focus)}</h2>
        <div class="detail-subtitle">${dateFormatted} · ${sanitize(t.time || '—')} · ${sanitize(t.location || '—')}</div>
      </div>
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="card-title">Attendance Overview</div>
        <div class="std-donut-wrap">${donutHtml}</div>
      </div>
      <div class="std-attendance-row">
      <div class="card" style="flex:1;min-width:0;">
        <div class="card-title">Player Attendance</div>
        ${(() => {
          if (stdLettersForSlot.length <= 1) return '';
          const btnAll = !stdTeamFilter ? ' roster-team-btn-active' : '';
          const letterBtns = stdLettersForSlot.map(l => {
            const ac = stdTeamFilter && stdTeamFilter.has(l) ? ' roster-team-btn-active' : '';
            return '<button class="roster-team-btn std-team-btn' + ac + '" data-std-team="' + l + '">' + l + '</button>';
          }).join('');
          return '<div class="roster-team-filter"><button class="roster-team-btn std-team-btn' + btnAll + '" data-std-team="all">All</button>' + letterBtns + '</div>';
        })()}
        <div class="table-wrap"><table class="matchday-table std-attendance-table">
          <thead><tr><th>Pos</th><th>Player</th><th class="center-cell">Status</th><th class="center-cell">Ready</th><th class="center-cell">A/C Ratio</th><th class="center-cell">Player Answer</th><th class="center-cell">Staff (editable)</th></tr></thead>
          <tbody>${playerRows}</tbody>
        </table></div>
      </div>
      ${(() => {
        const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
        const boards = trainingBoards[t.date] || [];
        if (!boards.length) return '';
        const tagOrder = ['Presión', 'Salida', 'Estrategia'];
        const grouped = {};
        boards.forEach(b => { const tg = b.tag || ''; if (!grouped[tg]) grouped[tg] = []; grouped[tg].push(b); });
        const orderedTags = [];
        tagOrder.forEach(tg => { if (grouped[tg]) orderedTags.push(tg); });
        Object.keys(grouped).forEach(tg => { if (!orderedTags.includes(tg)) orderedTags.push(tg); });
        return '<div class="card std-boards-summary"><div class="card-title">Planning Entrenament</div>' +
          orderedTags.map(tag => {
            const tagTitle = tag || 'General';
            return '<div class="std-bs-tag">' + sanitize(tagTitle) + '</div>' +
              '<ul class="std-bs-list">' + grouped[tag].map(b => '<li>' + sanitize(b.name) + '</li>').join('') + '</ul>';
          }).join('') + '</div>';
      })()}
      </div>
      <div class="card">
        <div class="tg-header">
          <div class="card-title" style="margin-bottom:0;">Auto Generate Teams</div>
          <button class="btn btn-outline btn-small" id="btn-tg-toggle">⚙️ Configure</button>
        </div>
        <div class="tg-config-panel" id="tg-config" hidden>
          <div class="tg-config-row">
            <div class="tg-config-field">
              <label>Number of Teams</label>
              <input type="number" class="reg-input" id="tg-num-teams" value="2" min="2" max="10" style="width:70px;text-align:center;">
            </div>
            <div class="tg-config-field">
              <label>Players per Team</label>
              <input type="number" class="reg-input" id="tg-per-team" value="${defaultPerTeam}" min="1" max="20" style="width:70px;text-align:center;">
            </div>
            <div class="tg-config-field">
              <label>Include GK</label>
              <label class="tg-toggle-label"><input type="checkbox" id="tg-include-gk" checked> <span class="tg-toggle-text">Yes</span></label>
            </div>
            <div class="tg-config-field">
              <label>Team Filter</label>
              <div class="tg-btn-group">
                <button class="tg-btn tg-btn-active" data-tg-team="all">All</button>
                ${getTeamLetters(_currentSession && _currentSession.category || '').map(function(l) {
                  return '<button class="tg-btn" data-tg-team="' + l + '">' + l + '</button>';
                }).join('')}
              </div>
            </div>
            <div class="tg-config-field">
              <label>Distribution</label>
              <div class="tg-btn-group">
                <button class="tg-btn tg-btn-active" data-tg-mode="mix">Mix</button>
                <button class="tg-btn" data-tg-mode="equal">Equal</button>
              </div>
            </div>
          </div>
          <div style="margin-top:.8rem;text-align:right;">
            <button class="btn btn-primary btn-small" id="btn-tg-generate">Generar Equips</button>
          </div>
        </div>
        <div id="tg-teams-container">${teamsHtml}</div>
      </div>
      ${(() => {
        return '<div id="std-boards-section">' + renderStdBoardsSection(t.date) + '</div>';
      })()}`;
  }

  // ── Team generation algorithm ──
  function generateTrainingTeams(allPlayers, trainingDate, locked, numTeams, perTeam, includeGK, teamFilter, mode) {
    // 1. Filter to present players
    let pool = allPlayers.filter(p => {
      const eff = getEffectiveAnswer(p.id, trainingDate, locked);
      return eff === 'yes' || eff === 'late';
    });
    // 2. Apply club team filter
    if (teamFilter && teamFilter !== 'all') pool = pool.filter(p => p.team === teamFilter);
    // 3. Exclude GKs if toggled off
    if (!includeGK) pool = pool.filter(p => {
      const positions = (p.position || '').split(',').map(s => s.trim()).filter(Boolean);
      return !positions.every(pos => pos === 'GK');
    });

    // 4. Categorize by position group
    function posGroup(player) {
      const positions = (player.position || '').split(',').map(s => s.trim()).filter(Boolean);
      const first = positions[0] || '';
      if (first === 'GK') return 'GK';
      if (first === 'CB') return 'DEF_CB';
      if (['LB', 'RB'].includes(first)) return 'DEF_WB';
      if (first === 'DM') return 'MID_DM';
      if (first === 'OM') return 'MID_OM';
      if (['LW', 'RW', 'ST'].includes(first)) return 'FWD';
      return 'MID_OM'; // fallback
    }
    function posCategory(pg) {
      if (pg === 'GK') return 'GK';
      if (pg === 'DEF_CB' || pg === 'DEF_WB') return 'DEF';
      if (pg === 'MID_DM' || pg === 'MID_OM') return 'MID';
      return pg;
    }

    // Shuffle helper
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    const teams = Array.from({ length: numTeams }, () => []);

    if (mode === 'mix') {
      // Separate GKs and distribute one per team first
      const gks = shuffle(pool.filter(p => posCategory(posGroup(p)) === 'GK'));
      const nonGks = shuffle(pool.filter(p => posCategory(posGroup(p)) !== 'GK'));
      gks.forEach((gk, i) => { if (i < numTeams) teams[i].push(gk); });
      // Remaining GKs go to smallest teams
      for (let i = numTeams; i < gks.length; i++) {
        teams.sort((a, b) => a.length - b.length);
        teams[0].push(gks[i]);
      }
      // Group non-GKs by position category and round-robin
      const groups = { DEF: [], MID: [], FWD: [] };
      nonGks.forEach(p => {
        const cat = posCategory(posGroup(p));
        if (groups[cat]) groups[cat].push(p);
        else groups['MID'].push(p); // fallback
      });
      shuffle(groups.DEF); shuffle(groups.MID); shuffle(groups.FWD);
      // Round-robin each group across teams
      ['DEF', 'MID', 'FWD'].forEach(g => {
        groups[g].forEach((p, i) => {
          // Find team with fewest players, preferring round-robin order
          teams.sort((a, b) => a.length - b.length);
          teams[0].push(p);
        });
      });
    } else {
      // Equal mode: sort by detailed position rank, then chunk sequentially
      const posOrder = { GK: 0, DEF_CB: 1, DEF_WB: 2, MID_DM: 3, MID_OM: 4, FWD: 5 };
      const sorted = pool.slice().sort((a, b) => {
        const ga = posGroup(a), gb = posGroup(b);
        return (posOrder[ga] ?? 3) - (posOrder[gb] ?? 3);
      });
      sorted.forEach((p, i) => {
        teams[i % numTeams].push(p);
      });
    }

    // Trim to perTeam if specified and smaller than what we distributed
    teams.forEach(team => {
      while (team.length > perTeam) team.pop();
    });

    return teams;
  }

  // ── Render generated teams ──
  function renderGeneratedTeams(teams, allPlayers, trainingDate, locked) {
    // Build set of all assigned player IDs
    const assignedIds = new Set();
    teams.forEach(team => team.forEach(p => assignedIds.add(String(p.id))));
    // Get present but unassigned players for the "+ Jugador" dropdown
    const presentPool = allPlayers.filter(p => {
      const eff = getEffectiveAnswer(p.id, trainingDate, locked);
      return (eff === 'yes' || eff === 'late') && !assignedIds.has(String(p.id));
    });

    const teamCards = teams.map((team, ti) => {
      const playerRows = team.map(p => {
        const teamCircle = p.team ? `<span class="conv-team-circle">${sanitize(p.team)}</span>` : '';
        return `<div class="tg-player-row" draggable="true" data-player-id="${p.id}">
          <span class="conv-pos-circles">${posCirclesHtmlGlobal(p)}</span>
          <span class="tg-player-name"><span class="tg-player-name-text">${sanitize(p.name)}</span>${teamCircle}</span>
          <span class="tg-player-num">#${sanitize(p.playerNumber || '—')}</span>
          <button class="tg-remove-player" data-team-idx="${ti}" data-player-id="${p.id}" title="Remove">&times;</button>
        </div>`;
      }).join('');

      const poolOptions = presentPool.map(p => {
        const tc = p.team ? `<span class="conv-team-circle">${sanitize(p.team)}</span>` : '';
        return `<div class="tg-dd-option" data-pid="${p.id}">
          <span class="conv-pos-circles">${posCirclesHtmlGlobal(p)}</span>
          <span class="tg-player-name"><span class="tg-player-name-text">${sanitize(p.name)}</span>${tc}</span>
          <span class="tg-player-num">${sanitize(p.position || '—')}</span>
        </div>`;
      }).join('');

      return `<div class="tg-team-card" data-team-idx="${ti}">
        <div class="tg-team-title">Equip ${ti + 1} <span class="tg-team-count">${team.length}</span></div>
        <div class="tg-team-players" data-team-idx="${ti}">
          ${playerRows || '<p class="tg-empty-hint">No players</p>'}
        </div>
        <div class="tg-add-wrap">
          <div class="tg-dd" data-team-idx="${ti}">
            <input class="tg-dd-input" placeholder="+ Jugador" autocomplete="off">
            <div class="tg-dd-list" hidden>${poolOptions}</div>
          </div>
        </div>
      </div>`;
    }).join('');

    // "No inclosos" section
    let notIncludedHtml = '';
    if (presentPool.length > 0) {
      const niRows = presentPool.map(p => {
        const teamCircle = p.team ? `<span class="conv-team-circle">${sanitize(p.team)}</span>` : '';
        return `<span class="tg-ni-player" draggable="true" data-player-id="${p.id}">
          <span class="conv-pos-circles">${posCirclesHtmlGlobal(p)}</span>
          <span class="tg-player-name"><span class="tg-player-name-text">${sanitize(p.name)}</span>${teamCircle}</span>
        </span>`;
      }).join('');
      notIncludedHtml = `<div class="tg-not-included">
        <div class="tg-ni-title">No inclosos: <span class="tg-team-count">${presentPool.length}</span></div>
        <div class="tg-ni-list">${niRows}</div>
      </div>`;
    }

    return `<div class="tg-teams-wrap">${teamCards}</div>${notIncludedHtml}`;
  }

  let rosterTeamFilter = 'all';
  let stdTeamFilter = null; // null = all, Set of letters = multi-select
  let staffViewPlayerId = null;
  let medicalDetailPlayerId = null;
  let medicalFilter = 'all';
  let medicalPastExpanded = false;

  function renderStaffRoster() {
    const users = getUsers();
    var curCat = getCurrentCategory();
    const players = users.filter(u => (u.roles || []).includes('player'))
      .filter(u => !curCat || !u.category || u.category === curCat)
      .filter(u => rosterTeamFilter === 'all' || (u.team || '') === rosterTeamFilter)
      .sort((a, b) => posRankGlobal(a) - posRankGlobal(b));
    let rows = players.map(u => {
      const derived = deriveFitnessStatus(u.id, false);
      const status = derived.fitnessStatus;
      const injuryNote = derived.injuryNote || (status === 'doubt' ? 'Doubt' : status === 'injured' ? 'Injury' : '');
      const matches = u.matchesPlayed || 0;
      const minutes = u.minutesPlayed || (matches * 90);
      const rd = computeReadiness(u.id);
      const readiness = rd.hasData ? rd.color : 'green';
      const rdTooltip = rd.hasData ? rd.score : '—';

      let statusIcon = '';
      if (status === 'fit') {
        statusIcon = '<span class="roster-status-icon roster-status-fit">✓</span>';
      } else if (status === 'doubt') {
        statusIcon = `<span class="roster-status-icon roster-status-doubt" data-tooltip="${sanitize(injuryNote)}">?</span>`;
      } else {
        statusIcon = `<span class="roster-status-icon roster-status-injured" data-tooltip="${sanitize(injuryNote)}">✕</span>`;
      }

      const pTeam = u.team || '';
      const teamCircle = pTeam ? `<span class="conv-team-circle">${sanitize(pTeam)}</span>` : '';

      return `<tr>
        <td><span class="conv-pos-circles">${posCirclesHtmlGlobal(u)}</span></td>
        <td><a href="#" class="roster-player-link" data-player-id="${u.id}"><span class="roster-name-wrap">${sanitize(u.name)}${teamCircle}</span></a></td>
        <td class="center-cell">${statusIcon}</td>
        <td class="center-cell"><span class="readiness-dot readiness-${readiness}" data-tooltip="${rdTooltip}"></span></td>
        <td class="center-cell roster-num">${matches}</td>
        <td class="center-cell roster-num">${minutes}</td>
      </tr>`;
    }).join('');

    if (players.length === 0) {
      rows = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:2rem;">No players registered yet.</td></tr>';
    }

    const btnAll = rosterTeamFilter === 'all' ? ' roster-team-btn-active' : '';
    var _rosterLetters = getTeamLetters(getCurrentCategory());
    var rosterLetterBtns = _rosterLetters.map(function(l) {
      var cls = rosterTeamFilter === l ? ' roster-team-btn-active' : '';
      return '<button class="roster-team-btn' + cls + '" data-roster-filter="' + l + '">' + l + '</button>';
    }).join('');

    // --- Team aggregate charts ---
    const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
    const trainingList = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const matchesList = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const staffOverrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const seasonStart = seasonYear + '-08-15';
    const playerUids = players.map(u => u.id);

    const dateAgg = {};
    playerUids.forEach(uid => {
      trainingList.forEach(t => {
        if (!t.date || t.date < seasonStart || t.date > todayStr) return;
        const entry = rpeData[uid + '_training_' + t.date];
        const oKey = uid + '_' + t.date;
        const avail = staffOverrides[oKey] || availData[oKey] || '';
        const key = t.date + '|training|' + (t.focus || 'Training');
        if (!dateAgg[key]) dateAgg[key] = { date: t.date, type: 'training', label: t.focus || 'Training', rpes: [], mins: [], skips: 0, injuries: 0, total: 0 };
        dateAgg[key].total++;
        if (avail === 'no') dateAgg[key].skips++;
        if (avail === 'injured') dateAgg[key].injuries++;
        if (entry && avail !== 'no' && avail !== 'injured') { dateAgg[key].rpes.push(entry.rpe); dateAgg[key].mins.push(entry.minutes); }
      });
      matchesList.forEach(m => {
        if (!m.date || m.date < seasonStart || m.date > todayStr) return;
        const entry = rpeData[uid + '_match_' + m.id];
        const avail = matchAvailData[uid + '_' + m.id] || '';
        const label = (m.home || '') + ' vs ' + (m.away || '');
        const key = m.date + '|match|' + label;
        if (!dateAgg[key]) dateAgg[key] = { date: m.date, type: 'match', label: label, rpes: [], mins: [], skips: 0, injuries: 0, total: 0 };
        dateAgg[key].total++;
        if (avail === 'no_disponible') dateAgg[key].skips++;
        if (entry) { dateAgg[key].rpes.push(entry.rpe); dateAgg[key].mins.push(entry.minutes); }
      });
      Object.keys(rpeData).forEach(rkey => {
        if (!rkey.startsWith(uid + '_extra_')) return;
        const entry = rpeData[rkey];
        if (!entry || !entry.date || entry.date < seasonStart || entry.date > todayStr) return;
        const key = entry.date + '|extra|' + (entry.tag || 'Extra');
        if (!dateAgg[key]) dateAgg[key] = { date: entry.date, type: 'extra', label: entry.tag || 'Extra', rpes: [], mins: [], skips: 0, injuries: 0, total: 0 };
        dateAgg[key].total++;
        if (entry.rpe != null) { dateAgg[key].rpes.push(entry.rpe); dateAgg[key].mins.push(entry.minutes); }
      });
    });
    const teamSessions = Object.values(dateAgg).map(agg => {
      const hasRpe = agg.rpes.length > 0;
      const avgRpe = hasRpe ? agg.rpes.reduce((a, b) => a + b, 0) / agg.rpes.length : null;
      const avgMin = hasRpe ? agg.mins.reduce((a, b) => a + b, 0) / agg.mins.length : null;
      return {
        date: agg.date, type: agg.type, label: agg.label,
        rpe: avgRpe != null ? +avgRpe.toFixed(1) : null,
        minutes: avgMin != null ? Math.round(avgMin) : null,
        skipped: agg.skips > agg.total / 2,
        injured: agg.injuries > agg.total / 2
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    const teamCharts = buildChartsHtml(teamSessions, { teamView: true });

    return `
      <h2 class="page-title">Player Roster</h2>
      <div class="roster-team-filter">
        <button class="roster-team-btn${btnAll}" data-roster-filter="all">All</button>
        ${rosterLetterBtns}
      </div>
      <div class="roster-layout">
        <div class="roster-left">
          <div class="card">
            <div class="table-wrap"><table class="roster-table">
              <thead><tr><th>Position</th><th>Name</th><th class="center-cell">Status</th><th class="center-cell">Readiness</th><th class="center-cell">Matches</th><th class="center-cell">Minutes</th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>
          </div>
        </div>
        <div class="roster-right">
          ${teamCharts.acwr}
          ${teamCharts.rpe}
          ${teamCharts.uaWeek}
        </div>
      </div>`;
  }

  function renderMatchday() {
    const now = new Date();
    const games = JSON.parse(localStorage.getItem('fa_matchday') || '[]').filter(g => {
      if (!g.date || !g.time) return true;
      return new Date(g.date + 'T' + g.time + ':00') > now;
    });
    const rows = games.map((g, i) => matchdayRowHtml(g, i)).join('');
    return `
      <h2 class="page-title">Set Calendar</h2>
      <div class="card">
        <div class="table-wrap"><table class="matchday-table">
          <thead><tr>
            <th>Home / Away</th><th>Team</th><th>Date</th><th>Opponent</th><th>Location</th><th>Map</th><th>Kick-off</th><th></th>
          </tr></thead>
          <tbody id="matchday-body">${rows}</tbody>
        </table></div>
        <div class="matchday-bottom-actions">
          <button class="btn btn-outline btn-small matchday-add" id="btn-matchday-add" title="Add game">+ Add Game</button>
          <button class="btn btn-primary btn-small" id="btn-matchday-save">Save</button>
        </div>
      </div>`;
  }

  function buildTimeOptions(selected) {
    let opts = '<option value="">--:--</option>';
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const val = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        const sel = val === selected ? ' selected' : '';
        opts += `<option value="${val}"${sel}>${val}</option>`;
      }
    }
    return opts;
  }

  function jerseySvg(variant) {
    const fill = variant === 'yellow' ? '#FFD662' : '#FFFFFF';
    const collar = variant === 'yellow' ? '#e6b800' : '#CCCCCC';
    return `<svg viewBox="0 0 64 64" width="34" height="34" style="display:block">
      <path d="M22 6 L14 10 L6 18 L12 24 L16 20 L16 56 L48 56 L48 20 L52 24 L58 18 L50 10 L42 6" fill="${fill}" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M22 6 Q28 12 32 12 Q36 12 42 6" fill="none" stroke="${collar}" stroke-width="2"/>
      <line x1="16" y1="20" x2="48" y2="20" stroke="${collar}" stroke-width="1" opacity=".5"/>
      <image href="img/logo.png" x="33" y="18" width="10" height="10" opacity=".7"/>
    </svg>`;
  }
  function sockSvg(variant) {
    if (variant === 'yellow') {
      return `<svg viewBox="0 0 32 64" width="22" height="34" style="display:block">
        <path d="M8 2 L8 36 Q8 48 14 52 L22 56 Q28 58 28 50 L28 42 Q28 36 22 34 L22 2 Z" fill="#FFD662" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
        <rect x="8" y="2" width="14" height="6" rx="1" fill="#222" stroke="none"/>
        <path d="M8 36 Q8 48 14 52 L22 56 Q28 58 28 50 L28 42 Q28 36 22 34 Z" fill="#222" opacity=".15"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 32 64" width="22" height="34" style="display:block">
      <path d="M8 2 L8 36 Q8 48 14 52 L22 56 Q28 58 28 50 L28 42 Q28 36 22 34 L22 2 Z" fill="#fff" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="8" y="2" width="14" height="6" rx="1" fill="#222" stroke="none"/>
      <rect x="8" y="12" width="14" height="4" fill="#222" stroke="none"/>
      <rect x="8" y="20" width="14" height="4" fill="#222" stroke="none"/>
      <rect x="8" y="28" width="14" height="4" fill="#222" stroke="none"/>
      <path d="M8 36 Q8 48 14 52 L22 56 Q28 58 28 50 L28 42 Q28 36 22 34 Z" fill="#222" stroke="none"/>
    </svg>`;
  }

  function matchdayRowHtml(g, i) {
    const homeChecked = g.homeAway === 'home' ? 'checked' : '';
    const awayChecked = g.homeAway === 'away' ? 'checked' : '';
    return `<tr data-idx="${i}" data-category="${sanitize(g.category || '')}">
      <td>
        <label class="md-radio"><input type="radio" name="ha-${i}" value="home" ${homeChecked} class="md-ha"> Home</label>
        <label class="md-radio"><input type="radio" name="ha-${i}" value="away" ${awayChecked} class="md-ha"> Away</label>
      </td>
      <td class="md-team-cell">
        ${getTeamLetters(_currentSession && _currentSession.category || '').map(function(l) {
          return '<span class="md-team-circle' + (g.team === l ? ' active' : '') + '" data-team="' + l + '">' + l + '</span>';
        }).join('')}
      </td>
      <td><input type="text" class="reg-input md-date md-datepicker" value="${sanitize(g.date || '')}" placeholder="YYYY-MM-DD" readonly style="width:140px;cursor:pointer;"></td>
      <td><input class="reg-input md-opponent" value="${sanitize(g.opponent || '')}" placeholder="Opponent name" style="width:140px;"></td>
      <td><input class="reg-input md-location" value="${sanitize(g.location || '')}" placeholder="Location" style="width:150px;"></td>
      <td><input class="reg-input md-maplink" value="${sanitize(g.mapLink || '')}" placeholder="Google Maps link" style="width:150px;"></td>
      <td><input type="text" class="reg-input md-kickoff" value="${sanitize(g.kickoff || '')}" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" style="width:80px;text-align:center;"></td>
      <td><button class="md-remove-btn md-remove" data-idx="${i}" title="Remove">&times;</button></td>
    </tr>`;
  }

  function renderConvocatoria() {
    var allMatches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    var curCat = getCurrentCategory();
    var matches = curCat ? allMatches.filter(function(m) { return !m.category || m.category === curCat; }) : allMatches;
    const upcoming = matches.filter(m => m.status === 'upcoming');
    if (convSelectedMatchId === null && upcoming.length) convSelectedMatchId = upcoming[0].id;
    const selected = matches.find(m => m.id === convSelectedMatchId) || null;
    const users = getUsers();
    var playersAll = users.filter(u => (u.roles || []).includes('player'));
    var players = curCat ? playersAll.filter(function(p) { return !p.category || p.category === curCat; }) : playersAll;
    const allConvRaw = JSON.parse(localStorage.getItem('fa_convocatoria') || '{}');
    const allConv = Array.isArray(allConvRaw) ? {} : allConvRaw;
    const saved = convSelectedMatchId ? (allConv[convSelectedMatchId] || []) : [];
    function playerStatusHtml(p) {
      const derived = deriveFitnessStatus(p.id, false);
      const status = derived.fitnessStatus;
      const injuryNote = derived.injuryNote || (status === 'doubt' ? 'Doubt' : status === 'injured' ? 'Injury' : '');
      const rd = computeReadiness(p.id);
      const readiness = rd.hasData ? rd.color : 'green';
      const rdTooltip = rd.hasData ? rd.score : '—';
      let icon = '';
      if (status === 'fit') icon = '<span class="roster-status-icon roster-status-fit">✓</span>';
      else if (status === 'doubt') icon = `<span class="roster-status-icon roster-status-doubt" data-tooltip="${sanitize(injuryNote)}">?</span>`;
      else icon = `<span class="roster-status-icon roster-status-injured" data-tooltip="${sanitize(injuryNote)}">✕</span>`;
      return `${icon}<span class="readiness-dot readiness-${readiness}" data-tooltip="${rdTooltip}"></span>`;
    }

    const POS_ORDER = ['GK','CB','LB','RB','DM','OM','LW','RW','ST'];
    function posRank(p) {
      return posRankGlobal(p);
    }
    function posCirclesHtml(p) {
      return posCirclesHtmlGlobal(p);
    }

    const matchOptions = upcoming.length
      ? upcoming.map(m => {
          const active = m.id === convSelectedMatchId ? ' conv-match-option-active' : '';
          const teamLetter = m.team ? ` (${sanitize(m.team)})` : '';
          const homeName = isOurTeam(m.home) ? getClubName() + teamLetter : sanitize(m.home);
          const awayName = isOurTeam(m.away) ? getClubName() + teamLetter : sanitize(m.away);
          const dateObj = m.date ? new Date(m.date + 'T12:00:00') : null;
          const dateFmt = dateObj ? dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
          return `<div class="conv-match-option${active}" data-mid="${m.id}"><div class="conv-match-teams">${homeName} vs ${awayName}</div><div class="conv-match-date">${dateFmt}<span class="conv-match-time">${m.time || ''}</span></div></div>`;
        }).join('')
      : '<div class="conv-match-empty">No upcoming matches</div>';

    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const sentEntry = convSelectedMatchId && sentData[convSelectedMatchId] ? sentData[convSelectedMatchId] : null;
    const sentPlayers = sentEntry ? (Array.isArray(sentEntry) ? sentEntry : (sentEntry.players || [])) : null;
    const isSent = !!sentPlayers;
    const hasChanges = isSent && JSON.stringify(saved) !== JSON.stringify(sentPlayers);

    const calledIds = new Set(saved.map(String));
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
    const available = players.filter(p => !calledIds.has(String(p.id))).sort((a, b) => posRank(a) - posRank(b));
    const called = saved.map(id => players.find(p => String(p.id) === String(id))).filter(Boolean).sort((a, b) => posRank(a) - posRank(b));

    const availableHtml = available.length
      ? available.map(p => {
          const maKey = p.id + '_' + convSelectedMatchId;
          const maStatus = matchAvailData[maKey] || null;
          const isNoDisp = maStatus === 'no_disponible';
          const dragAttr = isNoDisp ? 'draggable="false"' : 'draggable="true"';
          const greyClass = isNoDisp ? ' conv-player-unavailable' : '';
          const maTag = maStatus === 'disponible' ? '<span class="conv-ma-tag conv-ma-disp">Disponible</span>'
            : maStatus === 'no_disponible' ? '<span class="conv-ma-tag conv-ma-nodisp">No Disponible</span>'
            : '<span class="conv-ma-tag conv-ma-pending">—</span>';
          const pTeam = p.team || '';
          return `<div class="conv-player${greyClass}" ${dragAttr} data-id="${p.id}"><span class="conv-pos-circles">${posCirclesHtml(p)}</span><span class="conv-name-wrap"><span class="conv-name">${sanitize(p.name)}</span>${pTeam ? `<span class="conv-team-circle">${sanitize(pTeam)}</span>` : ''}</span><span class="conv-num">#${sanitize(p.playerNumber || '—')}</span>${maTag}<span class="conv-status">${playerStatusHtml(p)}</span></div>`;
        }).join('')
      : '<p class="conv-empty-hint">No players available</p>';

    const calledHtml = called.length
      ? called.map(p => { const pTeam = p.team || ''; return `<div class="conv-player conv-called" draggable="true" data-id="${p.id}"><span class="conv-pos-circles">${posCirclesHtml(p)}</span><span class="conv-name-wrap"><span class="conv-name">${sanitize(p.name)}</span>${pTeam ? `<span class="conv-team-circle">${sanitize(pTeam)}</span>` : ''}</span><span class="conv-num">#${sanitize(p.playerNumber || '—')}</span><span class="conv-status">${playerStatusHtml(p)}</span><button class="conv-remove" data-id="${p.id}" title="Remove">&times;</button></div>`; }).join('')
      : '<p class="conv-drop-hint">Drag players here</p>';

    // Uniform: auto-default for home games
    const uniformData = JSON.parse(localStorage.getItem('fa_convocatoria_uniform') || '{}');
    let curJersey = 'white';
    let curSocks = 'striped';
    if (convSelectedMatchId && uniformData[convSelectedMatchId]) {
      curJersey = uniformData[convSelectedMatchId].jersey || 'white';
      curSocks = uniformData[convSelectedMatchId].socks || 'striped';
    } else if (selected && isOurTeam(selected.home)) {
      curJersey = 'white'; curSocks = 'striped';
    }
    const jWhite = curJersey === 'white' ? ' uniform-opt-active' : '';
    const jYellow = curJersey === 'yellow' ? ' uniform-opt-active' : '';
    const sStriped = curSocks === 'striped' ? ' uniform-opt-active' : '';
    const sYellow = curSocks === 'yellow' ? ' uniform-opt-active' : '';

    // Default callup: 1h30 before kickoff, rounded down to 15min
    const convCallupData = JSON.parse(localStorage.getItem('fa_convocatoria_callup') || '{}');
    let callupDefault = '';
    if (selected) {
      const savedCallup = convSelectedMatchId ? convCallupData[convSelectedMatchId] : null;
      if (savedCallup) {
        callupDefault = savedCallup;
      } else if (selected.time) {
        const parts = selected.time.split(':');
        let totalMin = Number(parts[0]) * 60 + Number(parts[1]) - 90;
        if (totalMin < 0) totalMin += 24 * 60;
        totalMin = Math.floor(totalMin / 15) * 15;
        const ch = Math.floor(totalMin / 60) % 24;
        const cm = totalMin % 60;
        callupDefault = String(ch).padStart(2, '0') + ':' + String(cm).padStart(2, '0');
        // Persist the computed default
        if (convSelectedMatchId) {
          convCallupData[convSelectedMatchId] = callupDefault;
          localStorage.setItem('fa_convocatoria_callup', JSON.stringify(convCallupData));
        }
      }
    }

    return `
      <h2 class="page-title">Convocatòria</h2>
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="conv-top-row">
          <div class="conv-top-group">
            <div class="card-title" style="margin-bottom:.5rem;">Choose Match</div>
            <div class="conv-match-selector" id="conv-match-selector">
              <div class="conv-match-toggle" id="conv-match-toggle">
                ${selected ? `<div class="conv-match-toggle-info"><div class="conv-match-teams">${sanitize(selected.home)}${selected.team && isOurTeam(selected.home) ? ' (' + sanitize(selected.team) + ')' : ''} vs ${sanitize(selected.away)}${selected.team && isOurTeam(selected.away) ? ' (' + sanitize(selected.team) + ')' : ''}</div><div class="conv-match-date">${selected.date ? new Date(selected.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}<span class="conv-match-time">${selected.time || ''}</span></div></div>` : '<span style="color:var(--text-secondary)">Select a match…</span>'}
                <span class="conv-match-chevron"></span>
              </div>
              <div class="conv-match-dropdown" id="conv-match-dropdown" hidden>${matchOptions}</div>
            </div>
          </div>
          ${selected ? `<div class="conv-top-group">
            <div class="card-title" style="margin-bottom:.5rem;">Call-up Time</div>
            <select class="conv-callup-select" id="conv-callup-time">${buildTimeOptions(callupDefault)}</select>
          </div>
          <div class="conv-top-group">
            <div class="card-title" style="margin-bottom:.5rem;text-align:center;">Uniform</div>
            <div class="conv-uniform-row">
              <div class="conv-uniform-group">
                <span class="conv-uniform-label">Jersey</span>
                <div class="uniform-toggle" id="conv-jersey-toggle">
                  <button type="button" class="uniform-opt conv-jersey-opt${jWhite}" data-val="white" title="White">${jerseySvg('white')}</button>
                  <button type="button" class="uniform-opt conv-jersey-opt${jYellow}" data-val="yellow" title="Yellow">${jerseySvg('yellow')}</button>
                </div>
              </div>
              <div class="conv-uniform-group">
                <span class="conv-uniform-label">Socks</span>
                <div class="uniform-toggle" id="conv-socks-toggle">
                  <button type="button" class="uniform-opt conv-socks-opt${sStriped}" data-val="striped" title="Black & White">${sockSvg('striped')}</button>
                  <button type="button" class="uniform-opt conv-socks-opt${sYellow}" data-val="yellow" title="Yellow">${sockSvg('yellow')}</button>
                </div>
              </div>
            </div>
          </div>` : ''}
        </div>
      </div>
      <div class="conv-layout">
        <div class="conv-panel">
          <div class="conv-panel-header">Available Players <span class="conv-count" id="conv-avail-count">${available.length}</span></div>
          <div class="conv-list" id="conv-available">${availableHtml}</div>
        </div>
        <div class="conv-panel conv-panel-called">
          <div class="conv-panel-header">Called Up <span class="conv-count" id="conv-called-count">${called.length}</span></div>
          <div class="conv-list conv-drop-zone" id="conv-called">${calledHtml}</div>
          <div class="conv-actions">
            <button class="btn btn-small" id="btn-conv-clear" style="background:#9e9e9e;color:#fff;border:none;">Clear All</button>
            <button class="btn btn-outline btn-small" id="btn-conv-save">Save</button>
            <button class="btn ${isSent && !hasChanges ? 'btn-danger' : 'btn-primary'} btn-small" id="btn-conv-send">${isSent && !hasChanges ? 'Unsend' : 'Send'}</button>
          </div>
        </div>
      </div>
      ${(() => {
        if (!convSelectedMatchId) return '';
        const matchBoards = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
        const boards = matchBoards[convSelectedMatchId] || [];
        if (!boards.length) return '';
        return '<div class="card"><div class="card-title">Tactical Board</div>' +
          boards.map(b => renderReadOnlyBoard(b, 'ro2-')).join('') + '</div>';
      })()}
      ${(() => {
        if (!convSelectedMatchId) return '';
        const vData = JSON.parse(localStorage.getItem('fa_convocatoria_videos') || '{}');
        const videos = vData[convSelectedMatchId] || [];
        const rows = videos.map((v, i) => '<div class="conv-video-row" data-video-idx="' + i + '">' +
          '<input type="text" class="reg-input conv-video-title" value="' + sanitize(v.title) + '" placeholder="Title" style="flex:1;min-width:80px;">' +
          '<input type="text" class="reg-input conv-video-url" value="' + sanitize(v.url) + '" placeholder="Paste URL" style="flex:2;min-width:140px;">' +
          '<button class="btn btn-small conv-video-remove" style="background:#c62828;color:#fff;border:none;padding:.2rem .5rem;">✕</button></div>' +
          (v.title ? '<textarea class="reg-input conv-video-comment" data-video-idx="' + i + '" rows="2" placeholder="Comments for this video..." style="width:100%;resize:vertical;min-height:40px;margin-bottom:.6rem;">' + sanitize(v.comment || '') + '</textarea>' : '')).join('');
        return '<div class="card">' +
          '<div class="card-title">Video Links</div>' +
          '<div id="conv-video-list">' + rows + '</div>' +
          '<button class="btn btn-outline btn-small" id="btn-conv-add-video" style="margin-top:.5rem;">+ Add Video Link</button>' +
          '</div>';
      })()}`;
  }

  function renderMatches() {
    var allMatches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    var curCat = getCurrentCategory();
    var matches = curCat ? allMatches.filter(function(m) { return !m.category || m.category === curCat; }) : allMatches;
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const now = new Date();
    const upcoming = matches.filter(m => {
      if (!m.date || !m.time) return true;
      return new Date(m.date + 'T' + m.time + ':00') > now;
    });
    const past = matches.filter(m => {
      if (!m.date || !m.time) return false;
      return new Date(m.date + 'T' + m.time + ':00') <= now;
    }).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const DAYS_CA = ['Diumenge','Dilluns','Dimarts','Dimecres','Dijous','Divendres','Dissabte'];
    function buildCard(m, clickable) {
      const teamLetter = m.team || '';
      const homeName = isOurTeam(m.home) && teamLetter ? getClubName() + ' <span class="conv-team-circle">' + sanitize(teamLetter) + '</span>' : sanitize(m.home);
      const awayName = isOurTeam(m.away) && teamLetter ? getClubName() + ' <span class="conv-team-circle">' + sanitize(teamLetter) + '</span>' : sanitize(m.away);
      let dateFmt = '—';
      if (m.date) {
        const d = new Date(m.date + 'T12:00:00');
        const dayName = DAYS_CA[d.getDay()];
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        dateFmt = dayName + ' ' + dd + '/' + mm + '/' + yyyy;
      }
      const locationHtml = m.mapLink
        ? `<a href="${sanitize(m.mapLink)}" target="_blank" rel="noopener" class="md-card-map" onclick="event.stopPropagation()">📍 ${sanitize(m.location || '—')}</a>`
        : `<span>📍 ${sanitize(m.location || '—')}</span>`;
      const sentEntry = sentData[m.id];
      const sentPlayers = sentEntry ? (Array.isArray(sentEntry) ? sentEntry : (sentEntry.players || [])) : [];
      const convHtml = sentPlayers.length
        ? `<span class="md-conv-sent"><span class="conv-blink-dot"></span> Convocatòria enviada<span class="md-conv-count">${sentPlayers.length} players</span></span>`
        : '';
      const clickAttr = clickable ? ` data-go-staff-match="${m.id}"` : '';
      return `<div class="md-match-card${clickable ? '' : ' md-match-card-past'}"${clickAttr}>
        <div class="md-match-left">
          <div class="md-match-teams">${homeName} vs ${awayName}</div>
          <div class="md-match-info"><span>🗓 ${dateFmt}</span><span><img src="img/whistle.png" class="kickoff-icon" alt=""> ${m.time || '—'}</span>${locationHtml}</div>
        </div>
        ${convHtml}
      </div>`;
    }
    const upcomingCards = upcoming.length
      ? upcoming.map(m => buildCard(m, true)).join('')
      : '<p style="color:var(--text-secondary)">No upcoming matches.</p>';
    const pastCards = past.length
      ? past.map(m => buildCard(m, true)).join('')
      : '<p style="color:var(--text-secondary)">No previous matches.</p>';

    return `
      <h2 class="page-title">Matchday</h2>
      <div class="card">
        <div class="card-title">Upcoming Matches</div>
        <div class="md-match-list">${upcomingCards}</div>
      </div>
      <div class="card">
        <div class="card-title">Previous Matches</div>
        <div class="md-match-list">${pastCards}</div>
      </div>`;
  }


  function renderAdminUsers() {
    const users = getUsers();
    const session = getSession();
    let rows = users.map(u => {
      const hasPlayer = (u.roles || []).includes('player');
      const hasStaff = (u.roles || []).includes('staff');
      const rolesDisplay = (u.roles || []).length
        ? (u.roles || []).map(r => `<span class="badge badge-green">${r}</span>`).join(' ')
        : '<span class="badge badge-yellow">none</span>';

      return `<tr>
        <td>${sanitize(u.name)}${u.isAdmin ? ' <span class="badge badge-red">admin</span>' : ''}</td>
        <td>${sanitize(u.email)}</td>
        <td>${rolesDisplay}</td>
        <td class="user-actions">
          <button class="btn btn-small ${hasPlayer ? 'btn-primary' : 'btn-outline'} btn-toggle-role" data-uid="${u.id}" data-role="player">
            ${hasPlayer ? '✓ Player' : '+ Player'}
          </button>
          <button class="btn btn-small ${hasStaff ? 'btn-primary' : 'btn-outline'} btn-toggle-role" data-uid="${u.id}" data-role="staff">
            ${hasStaff ? '✓ Staff' : '+ Staff'}
          </button>
          ${u.id !== session.id ? `<button class="btn btn-small btn-danger btn-delete-user" data-uid="${u.id}">Delete</button>` : ''}
        </td>
      </tr>`;
    }).join('');
    return `
      <h2 class="page-title">Manage Users</h2>
      <div class="card">
        <div class="card-title">All Users</div>
        <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem;">Click the role buttons to toggle Player / Staff for any user.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }

  function renderRegistrations() {
    const users = getUsers();
    const curCat = getCurrentCategory();
    const enabledCats = getEnabledCategories();
    const filtered = curCat ? users.filter(u => (u.category || '') === curCat) : users;
    let rows = filtered.map(u => {
      const roles = u.roles || [];
      let status = 'none';
      if (roles.includes('player') && roles.includes('staff')) status = 'both';
      else if (roles.includes('player')) status = 'player';
      else if (roles.includes('staff')) status = 'staff';

      const picHtml = u.profilePic
        ? `<img src="${u.profilePic}" class="reg-avatar" alt="">`
        : `<span class="reg-avatar reg-avatar-placeholder">${sanitize(u.name).charAt(0).toUpperCase()}</span>`;

      const positions = (u.position || '').split(',').map(s => s.trim()).filter(Boolean);
      const posOptions = ['GK','CB','LB','RB','DM','OM','LW','RW','ST'];
      const posChips = posOptions.map(p => `<span class="reg-pos-chip${positions.includes(p) ? ' active' : ''}" data-pos="${p}">${p}</span>`).join('');

      const team = u.team || '';
      const uCat = u.category || '';
      const catOptions = enabledCats.length
        ? enabledCats.map(function (k) { return '<option value="' + k + '"' + (uCat === k ? ' selected' : '') + '>' + CATEGORY_LABELS[k] + '</option>'; }).join('')
        : '';
      const catSelect = enabledCats.length
        ? '<select class="reg-cat-select" data-uid="' + u.id + '"><option value=""' + (!uCat ? ' selected' : '') + '>—</option>' + catOptions + '</select>'
        : '';

      return `<tr data-uid="${u.id}">
        <td class="reg-name-cell">${picHtml} <span>${sanitize(u.name)}${u.isAdmin ? ' <span class="badge badge-red">admin</span>' : ''}</span></td>
        <td>
          <select class="reg-status-select" data-uid="${u.id}">
            <option value="none" ${status === 'none' ? 'selected' : ''}>None</option>
            <option value="player" ${status === 'player' ? 'selected' : ''}>Player</option>
            <option value="staff" ${status === 'staff' ? 'selected' : ''}>Staff</option>
            <option value="both" ${status === 'both' ? 'selected' : ''}>Both</option>
          </select>
        </td>
        <td>${catSelect}</td>
        <td class="reg-team-cell">
          ${getTeamLetters(u.category || '').map(function(l) {
            return '<span class="reg-team-circle' + (team === l ? ' active' : '') + '" data-uid="' + u.id + '" data-team="' + l + '">' + l + '</span>';
          }).join('')}
        </td>
        <td class="reg-pos-cell">${posChips}</td>
        <td><input type="text" inputmode="numeric" class="reg-input reg-number" data-uid="${u.id}" value="${u.playerNumber || ''}" placeholder="#" maxlength="2"></td>
        <td class="reg-actions">
          <button class="btn btn-small btn-danger btn-remove-reg" data-uid="${u.id}">Remove</button>
        </td>
      </tr>`;
    }).join('');

    return `
      <h2 class="page-title">Registrations</h2>
      <div class="card">
        <div class="card-title">All Registered Members</div>
        <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem;">
          Edit each member's status, position, and player number. Changes are saved automatically.
        </p>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Status</th><th>Category</th><th style="text-align:center">Team</th><th>Position</th><th>Number</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }

  function renderAdminSettings() {
    const session = getSession();
    let html = '<h2 class="page-title">Settings</h2>';

    // ---------- Team Lead: Category Config ----------
    if (session && (session.isTeamLead || session.isAdmin)) {
      var hasCfg = !!_clubConfig;
      html += `
      <div class="card">
        <div class="card-title">Configuració de Categories</div>
        ${hasCfg
          ? '<p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:.8rem;">Modifica les categories, equips i enllaços classificació FCF del club.</p><button class="btn btn-primary" id="btn-edit-categories">Editar categories</button>'
          : '<p style="color:var(--text-secondary);font-size:.9rem;">No estàs vinculat a cap club. Contacta l\'administrador.</p>'
        }
      </div>`;
    }

    // ---------- Admin: Club Management ----------
    if (session && session.isAdmin) {
      html += `
      <div class="card">
        <div class="card-title">Gestió de Clubs</div>
        <div id="club-list" style="margin-bottom:1.2rem;">
          <p style="color:var(--text-secondary);font-size:.9rem;">Carregant clubs…</p>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:1rem;">
          <div class="card-title" style="font-size:.95rem;">Crear nou club</div>
          <div class="form-group" style="margin-bottom:.6rem;">
            <label for="new-club-name">Nom del club</label>
            <input type="text" id="new-club-name" placeholder="CF Exemple" required>
          </div>
          <div class="form-group" style="margin-bottom:.6rem;">
            <label for="new-club-email">Email del Team Lead</label>
            <input type="email" id="new-club-email" placeholder="lead@example.com" required>
          </div>
          <div class="form-group" style="margin-bottom:.8rem;">
            <label for="new-club-badge">Escut del club (PNG)</label>
            <input type="file" id="new-club-badge" accept="image/png">
          </div>
          <button class="btn btn-primary" id="btn-create-club">Crear Club</button>
          <div id="create-club-result" style="margin-top:.6rem;" hidden></div>
        </div>
      </div>`;

      html += `
      <div class="card">
        <div class="card-title">Data Management</div>
        <p style="margin-bottom:1rem;color:var(--text-secondary);font-size:.9rem;">Reset all app data to start fresh. This will remove all users and restore sample data.</p>
        <button class="btn btn-danger" id="btn-reset-data">Reset All Data</button>
      </div>`;
    }

    return html;
  }

  // Load and render club list in settings
  async function _loadClubList() {
    const listEl = document.getElementById('club-list');
    if (!listEl) return;
    try {
      const snap = await db.collection('clubs').get();
      if (snap.empty) {
        listEl.innerHTML = '<p style="color:var(--text-secondary);font-size:.9rem;">Cap club creat encara.</p>';
        return;
      }
      let rows = '';
      snap.forEach(d => {
        const c = d.data();
        const badgeImg = c.badgeUrl ? `<img src="${c.badgeUrl}" style="width:28px;height:28px;object-fit:contain;vertical-align:middle;margin-right:.4rem;">` : '';
        rows += `<tr>
          <td>${badgeImg}${sanitize(c.name)}</td>
          <td style="font-family:monospace;letter-spacing:.1em;font-weight:600;">${c.code}</td>
          <td>${sanitize(c.leadEmail)}</td>
          <td><button class="btn btn-small btn-outline btn-copy-code" data-code="${c.code}" title="Copiar codi">📋</button></td>
        </tr>`;
      });
      listEl.innerHTML = `<table class="table" style="font-size:.85rem;">
        <thead><tr><th>Club</th><th>Codi</th><th>Team Lead</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    } catch (e) {
      listEl.innerHTML = '<p style="color:var(--danger);">Error carregant clubs.</p>';
      console.error(e);
    }
  }

  // #endregion Training & Staff Views

  // #region Matchday, Calendar & Convocatòria
  // ---- Custom Mon-Sun date picker ----
  let dpEl = null, dpInput = null, dpYear = 0, dpMonth = 0;
  function openDatePicker(inp) {
    closeDatePicker();
    dpInput = inp;
    const now = new Date();
    const isoVal = inp.dataset.dateIso || inp.value || '';
    const cur = isoVal && !isNaN(new Date(isoVal + 'T12:00:00').getTime()) ? new Date(isoVal + 'T12:00:00') : now;
    dpYear = cur.getFullYear(); dpMonth = cur.getMonth();
    dpEl = document.createElement('div');
    dpEl.className = 'dp-popup';
    document.body.appendChild(dpEl);
    renderDP();
    const rect = inp.getBoundingClientRect();
    dpEl.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    dpEl.style.left = (rect.left + window.scrollX) + 'px';
    setTimeout(() => document.addEventListener('click', dpOutside), 0);
  }
  function closeDatePicker() {
    if (dpEl) { dpEl.remove(); dpEl = null; }
    document.removeEventListener('click', dpOutside);
  }
  function dpOutside(e) { if (dpEl && !dpEl.contains(e.target) && e.target !== dpInput) closeDatePicker(); }
  function renderDP() {
    if (!dpEl) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const selVal = dpInput ? (dpInput.dataset.dateIso || dpInput.value) : '';
    const days = ['Dl','Dt','Dc','Dj','Dv','Ds','Dg'];
    const months = ['Gener','Febrer','Març','Abril','Maig','Juny','Juliol','Agost','Setembre','Octubre','Novembre','Desembre'];
    const first = new Date(dpYear, dpMonth, 1);
    let startDay = first.getDay() - 1; if (startDay < 0) startDay = 6; // Mon=0
    const daysInMonth = new Date(dpYear, dpMonth + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < startDay; i++) cells += '<span class="dp-cell dp-empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = dpYear + '-' + String(dpMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      const allowPast = dpInput && dpInput.hasAttribute('data-allow-past');
      const past = (!allowPast && ds < todayStr) ? ' dp-disabled' : '';
      const sel = ds === selVal ? ' dp-selected' : '';
      const tod = ds === todayStr ? ' dp-today' : '';
      cells += `<span class="dp-cell dp-day${past}${sel}${tod}" data-date="${ds}">${d}</span>`;
    }
    dpEl.innerHTML = `<div class="dp-header"><button class="dp-nav" data-dp="prev">&lsaquo;</button><span class="dp-title">${months[dpMonth]} ${dpYear}</span><button class="dp-nav" data-dp="next">&rsaquo;</button></div><div class="dp-grid">${days.map(d => '<span class="dp-cell dp-head">' + d + '</span>').join('')}${cells}</div>`;
    dpEl.querySelectorAll('.dp-day:not(.dp-disabled)').forEach(c => c.addEventListener('click', () => {
      const iso = c.dataset.date;
      if (dpInput.hasAttribute('data-display-dmy')) {
        const parts = iso.split('-');
        dpInput.value = parts[2] + '/' + parts[1] + '/' + parts[0];
        dpInput.dataset.dateIso = iso;
      } else {
        dpInput.value = iso;
      }
      dpInput.dispatchEvent(new Event('input', {bubbles:true}));
      closeDatePicker();
    }));
    dpEl.querySelector('[data-dp="prev"]').addEventListener('click', (e) => { e.stopPropagation(); dpMonth--; if (dpMonth < 0) { dpMonth = 11; dpYear--; } renderDP(); });
    dpEl.querySelector('[data-dp="next"]').addEventListener('click', (e) => { e.stopPropagation(); dpMonth++; if (dpMonth > 11) { dpMonth = 0; dpYear++; } renderDP(); });
  }

  function getWeekBounds(offset) {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon + offset * 7);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    function pad(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    return { start: pad(mon), end: pad(sun) };
  }

  function renderWeekActivities(weekOffset) {
    const { start, end } = getWeekBounds(weekOffset);
    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const session = getSession();
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const now = new Date();
    const activities = [];
    matches.filter(m => m.date >= start && m.date <= end).filter(m => {
      if (!m.date || !m.time) return true;
      return new Date(m.date + 'T' + m.time + ':00') > now;
    }).forEach(m => {
      const sentEntry = sentData[m.id];
      const sentPlayers = sentEntry ? (Array.isArray(sentEntry) ? sentEntry : (sentEntry.players || [])) : [];
      const convSent = sentPlayers.length > 0;
      const convIncluded = convSent && sentPlayers.some(id => String(id) === String(session.id));
      const sentJersey = sentEntry && !Array.isArray(sentEntry) ? sentEntry.jersey : null;
      const sentSocks = sentEntry && !Array.isArray(sentEntry) ? sentEntry.socks : null;
      const dayName = m.date ? DAYS[new Date(m.date + 'T12:00:00').getDay()] : '';
      activities.push({ type: 'match', id: m.id, date: m.date, time: m.time, label: matchLabel(m), detail: `${dayName} · ${m.time} · ${sanitize(m.location || '')}`, convSent, convIncluded, sentJersey, sentSocks });
    });
    training.filter(t => t.date >= start && t.date <= end).filter(t => {
      if (!t.date || !t.time) return true;
      return new Date(t.date + 'T' + t.time.split(' - ')[0] + ':00').getTime() + 60 * 60 * 1000 > now.getTime();
    }).forEach(t => {
      const dayName = t.date ? DAYS[new Date(t.date + 'T12:00:00').getDay()] : '';
      activities.push({ type: 'training', tDate: t.date, date: t.date, time: t.time, label: sanitize(t.focus || 'Entrenament'), detail: `${dayName} · ${t.time} · ${sanitize(t.location)}` });
    });
    // Birthdays this week (skip self)
    const users = getUsers();
    const allPlayers = users.filter(u => (u.roles || []).includes('player') && u.dob && u.id !== session.id);
    allPlayers.forEach(p => {
      const parts = p.dob.split('-');
      if (parts.length !== 3) return;
      const bMonth = Number(parts[1]), bDay = Number(parts[2]);
      const thisYear = new Date(start + 'T12:00:00').getFullYear();
      let bd = new Date(thisYear, bMonth - 1, bDay);
      const bdStr = bd.getFullYear() + '-' + String(bd.getMonth()+1).padStart(2,'0') + '-' + String(bd.getDate()).padStart(2,'0');
      if (bdStr >= start && bdStr <= end) {
        const age = thisYear - Number(parts[0]);
        const dayName = DAYS[bd.getDay()];
        activities.push({ type: 'birthday', date: bdStr, time: '00:00', label: '🎂 ' + sanitize(p.name), detail: dayName + ' · ' + age + ' anys', pic: p.profilePic || '', initial: sanitize(p.name).charAt(0).toUpperCase() });
      }
    });
    activities.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '').localeCompare(b.time || ''));
    if (!activities.length) return '<p style="color:var(--text-secondary)">No activities this week.</p>';
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    return activities.map(a => {
      const badge = a.type === 'match'
        ? '<span class="badge badge-yellow">Match</span>'
        : '<span class="badge badge-green">Training</span>';
      let convTag = '';
      let uniformIcons = '';
      if (a.convSent) {
        if (a.sentJersey || a.sentSocks) {
          uniformIcons = `<span class="activity-uniform">${jerseySvg(a.sentJersey || 'white')}${sockSvg(a.sentSocks || 'striped')}</span>`;
        }
        convTag = a.convIncluded
          ? '<a href="#" class="conv-available-tag" data-conv-link><span class="conv-blink-dot"></span> Convocatòria disponible</a>'
          : '<span class="conv-not-called-tag"><span class="conv-grey-dot"></span> No convocat</span>';
      }
      // Match availability buttons (only when conv NOT sent)
      let matchAvailHtml = '';
      if (a.type === 'match' && !a.convSent) {
        const maData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
        const maKey = session.id + '_' + a.id;
        const maChosen = maData[maKey] || null;
        if (maChosen) {
          const maLabels = { disponible: 'Disponible', no_disponible: 'No Disponible' };
          const maCls = { disponible: 'mavail-disp', no_disponible: 'mavail-nodisp' };
          matchAvailHtml = `<span class="mavail-chosen ${maCls[maChosen]}" data-mavail-match="${a.id}">${maLabels[maChosen]}</span>`;
        } else {
          matchAvailHtml = `<div class="mavail-btns" data-mavail-match="${a.id}">
            <button class="mavail-btn mavail-disp" data-mavail="disponible">Disponible</button>
            <button class="mavail-btn mavail-nodisp" data-mavail="no_disponible">No Disponible</button>
          </div>`;
        }
      }
      // Training availability buttons
      let availHtml = '';
      if (a.type === 'training') {
        const tObj = training.find(tr => tr.date === a.tDate);
        const tLocked = tObj ? isTrainingLocked(tObj) : false;
        const key = session.id + '_' + a.tDate;
        const chosen = availData[key] || (tLocked ? 'na' : null);
        if (chosen) {
          const labels = { yes: 'Yes', late: 'Late', no: 'No', injured: 'Injured', na: 'N/A' };
          const cls = { yes: 'avail-yes', late: 'avail-late', no: 'avail-no', injured: 'avail-injured', na: 'avail-na' };
          if (tLocked) {
            availHtml = `<span class="avail-chosen ${cls[chosen]}">${labels[chosen]}</span>`;
          } else {
            availHtml = `<span class="avail-chosen ${cls[chosen]}" data-avail-date="${a.tDate}">${labels[chosen]}</span>`;
          }
        } else {
          availHtml = `<div class="avail-btns" data-avail-date="${a.tDate}">
            <button class="avail-btn avail-yes" data-avail="yes">Yes</button>
            <button class="avail-btn avail-late" data-avail="late">Late</button>
            <button class="avail-btn avail-no" data-avail="no">No</button>
            <button class="avail-btn avail-injured" data-avail="injured">Injured</button>
          </div>`;
        }
      }
      if (a.type === 'birthday') {
        const picHtml = a.pic
          ? `<img src="${a.pic}" alt="" class="birthday-avatar">`
          : `<span class="birthday-avatar birthday-avatar-placeholder">${a.initial}</span>`;
        return `<div class="activity-item"><span class="badge badge-birthday">Birthday</span><div class="activity-info"><div class="activity-label">${a.label}</div><div class="activity-detail">${a.detail}</div></div>${picHtml}</div>`;
      }
      const dataAttr = a.type === 'match'
        ? `data-go-match="${a.id}"`
        : `data-go-training="${a.tDate}"`;
      return `<div class="activity-item activity-item-link" ${dataAttr}>${badge}<div class="activity-info"><div class="activity-label">${a.label}</div><div class="activity-detail">${a.detail}</div></div>${convTag}${uniformIcons}${availHtml}${matchAvailHtml}</div>`;
    }).join('');
  }

  // sanitize → utils.js

  function matchLabel(m) {
    const tl = m.team ? ' <span class="conv-team-circle">' + sanitize(m.team) + '</span>' : '';
    const h = isOurTeam(m.home) ? sanitize(m.home) + tl : sanitize(m.home);
    const a = isOurTeam(m.away) ? sanitize(m.away) + tl : sanitize(m.away);
    return h + ' vs ' + a;
  }

  function buildAssistanceCircle(pct) {
    const size = 40;
    const stroke = 5;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;
    const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--accent)' : 'var(--danger)';
    return `<div class="assistance-circle" title="${pct}%">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          style="--circ:${circumference}" stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
      </svg>
      <span class="assistance-pct">${pct}%</span>
    </div>`;
  }

  function buildAvailDonut(trainingDate) {
    const players = getUsers().filter(u => (u.roles || []).includes('player'));
    const total = players.length;
    if (!total) return '<span style="color:var(--text-secondary)">\u2014</span>';
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const tObj = training.find(x => x.date === trainingDate);
    const locked = tObj ? isTrainingLocked(tObj) : false;
    let yes = 0, late = 0, no = 0, injured = 0, na = 0;
    players.forEach(p => {
      const v = getEffectiveAnswer(p.id, trainingDate, locked);
      if (v === 'yes') yes++;
      else if (v === 'late') late++;
      else if (v === 'no') no++;
      else if (v === 'injured') injured++;
      else na++;
    });
    const attending = yes + late;
    const size = 44;
    const stroke = 6;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const segments = [
      { count: yes, color: '#66bb6a', label: 'Yes' },
      { count: late, color: '#ffa726', label: 'Late' },
      { count: no, color: '#78909c', label: 'No' },
      { count: injured, color: '#ef5350', label: 'Injured' },
      { count: na, color: '#d0d0d0', label: 'N/A' }
    ];
    let arcs = '';
    let offset = 0;
    segments.forEach(s => {
      if (s.count > 0) {
        const len = (s.count / total) * circumference;
        const sPct = Math.round((s.count / total) * 100);
        arcs += `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
          stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}"
          style="--circ:${circumference};cursor:pointer;pointer-events:stroke" transform="rotate(-90 ${size/2} ${size/2})" data-tooltip="${s.label}: ${sPct}%"><title>${s.label}: ${sPct}%</title></circle>`;
        offset += len;
      }
    });
    const tooltip = `${attending}/${total} attending (Yes:${yes} Late:${late} No:${no} Injured:${injured})`;
    return `<div class="assistance-circle" title="${tooltip}">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
        ${arcs}
      </svg>
      <span class="assistance-pct">${attending}/${total}</span>
    </div>`;
  }

  // ---------- Matchday bindings ----------
  function bindMatchday() {
    const body = document.getElementById('matchday-body');
    if (!body) return;

    function readGames() {
      const games = [];
      body.querySelectorAll('tr').forEach(tr => {
        const haRadio = tr.querySelector('.md-ha:checked');
        const homeAway = haRadio ? haRadio.value : 'home';
        const activeTeam = tr.querySelector('.md-team-circle.active');
        const team = activeTeam ? activeTeam.dataset.team : '';
        const date = tr.querySelector('.md-date').value;
        const opponent = tr.querySelector('.md-opponent').value.trim();
        const location = tr.querySelector('.md-location').value.trim();
        const mapLink = tr.querySelector('.md-maplink').value.trim();
        const kickoff = tr.querySelector('.md-kickoff').value;
        const category = tr.dataset.category || '';
        games.push({ homeAway, team, date, opponent, location, mapLink, kickoff, category });
      });
      return games;
    }

    function saveGames() {
      localStorage.setItem('fa_matchday', JSON.stringify(readGames()));
    }

    // Auto-fill location, map link, and kick-off time when home is selected
    body.addEventListener('change', e => {
      if (e.target.classList.contains('md-ha')) {
        const tr = e.target.closest('tr');
        const locInput = tr.querySelector('.md-location');
        const mapInput = tr.querySelector('.md-maplink');
        const kickoffInput = tr.querySelector('.md-kickoff');
        if (e.target.value === 'home') {
          // Try to get defaults from club schedule config
          var cat = tr.dataset.category || getCurrentCategory() || '';
          var schedKey = cat;
          var letters = getTeamLetters(cat);
          var activeCircle = tr.querySelector('.md-team-circle.active');
          if (activeCircle && activeCircle.dataset.team) schedKey = cat + '_' + activeCircle.dataset.team;
          else if (letters.length === 1) schedKey = cat + '_' + letters[0];
          var sched = (_clubConfig && _clubConfig.schedules && _clubConfig.schedules[schedKey]) ? _clubConfig.schedules[schedKey] : null;
          var homeGame = sched ? sched.homeGame : null;
          locInput.value = (homeGame && homeGame.location) ? homeGame.location : 'Escola Industrial';
          mapInput.value = (locInput.value === 'Escola Industrial') ? 'https://share.google/pfbMOc661aRSNlynk' : '';
          if (kickoffInput && homeGame && homeGame.time) kickoffInput.value = homeGame.time;
        } else {
          locInput.value = '';
          mapInput.value = '';
          if (kickoffInput) kickoffInput.value = '';
        }
        saveGames();
      }
    });

    // Auto-save on input & change (for selects)
    body.addEventListener('input', saveGames);
    body.addEventListener('change', saveGames);

    // Auto-format HH:MM on kickoff inputs (24h format)
    body.addEventListener('input', function(e) {
      if (!e.target.classList.contains('md-kickoff')) return;
      var v = e.target.value.replace(/[^0-9]/g, '');
      if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
      if (v.length > 5) v = v.slice(0, 5);
      e.target.value = v;
    });

    // Custom Mon-Sun date picker
    body.querySelectorAll('.md-datepicker').forEach(inp => {
      inp.addEventListener('click', () => openDatePicker(inp));
    });

    // Team circle toggle
    body.querySelectorAll('.md-team-circle').forEach(circle => {
      circle.addEventListener('click', () => {
        const td = circle.closest('td');
        td.querySelectorAll('.md-team-circle').forEach(c => c.classList.remove('active'));
        circle.classList.add('active');
        saveGames();
      });
    });

    // Remove row
    body.querySelectorAll('.md-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const games = readGames();
        games.splice(Number(btn.dataset.idx), 1);
        localStorage.setItem('fa_matchday', JSON.stringify(games));
        renderPage(getSession());
      });
    });

    // Add game
    const addBtn = document.getElementById('btn-matchday-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const games = readGames();
        var cat = getCurrentCategory() || '';
        var letters = getTeamLetters(cat);
        var schedKey = (letters.length === 1) ? cat + '_' + letters[0] : cat;
        var sched = (_clubConfig && _clubConfig.schedules && _clubConfig.schedules[schedKey]) ? _clubConfig.schedules[schedKey] : null;
        var homeGame = sched ? sched.homeGame : null;
        var defLoc = (homeGame && homeGame.location) ? homeGame.location : 'Escola Industrial';
        var defMap = (defLoc === 'Escola Industrial') ? 'https://share.google/pfbMOc661aRSNlynk' : '';
        var defKickoff = (homeGame && homeGame.time) ? homeGame.time : '';
        games.push({ homeAway: 'home', team: '', date: '', opponent: '', location: defLoc, mapLink: defMap, kickoff: defKickoff, category: cat });
        localStorage.setItem('fa_matchday', JSON.stringify(games));
        renderPage(getSession());
      });
    }

    // Save button — sync matchday games into fa_matches
    const saveMdBtn = document.getElementById('btn-matchday-save');
    if (saveMdBtn) {
      saveMdBtn.addEventListener('click', () => {
        const games = readGames();
        localStorage.setItem('fa_matchday', JSON.stringify(games));
        const TEAM = (_clubConfig && _clubConfig.name) ? _clubConfig.name : 'Esquerra';
        const today = new Date().toISOString().slice(0, 10);
        const newMatches = games.filter(g => g.opponent && g.date).map((g, i) => ({
          id: Date.now() + i,
          home: g.homeAway === 'home' ? TEAM : g.opponent,
          away: g.homeAway === 'home' ? g.opponent : TEAM,
          date: g.date,
          time: g.kickoff || '00:00',
          score: null,
          status: g.date >= today ? 'upcoming' : 'played',
          location: g.location,
          mapLink: g.mapLink,
          team: g.team || '',
          category: g.category || getCurrentCategory() || ''
        }));
        localStorage.setItem('fa_matches', JSON.stringify(newMatches));
        saveMdBtn.textContent = '✓ Saved';
        saveMdBtn.classList.remove('btn-primary');
        saveMdBtn.classList.add('btn-accent');
        setTimeout(() => {
          saveMdBtn.textContent = 'Save';
          saveMdBtn.classList.add('btn-primary');
          saveMdBtn.classList.remove('btn-accent');
        }, 1200);
      });
    }
  }

  // ---------- Custom Modal ----------
  function showModal(title, message, onConfirm) {
    // Remove existing modal if any
    const existing = document.getElementById('custom-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'custom-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-title">${sanitize(title)}</div>
        <p class="modal-message">${sanitize(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-small btn-outline" id="modal-btn-no">No</button>
          <button class="btn btn-small btn-danger" id="modal-btn-yes">Yes, remove</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    // Trigger fade in
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); };
    overlay.querySelector('#modal-btn-no').addEventListener('click', close);
    overlay.querySelector('#modal-btn-yes').addEventListener('click', () => { close(); onConfirm(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  // ---------- Staff Training bindings ----------
  function bindStaffTraining() {
    const body = document.getElementById('staff-training-body');
    if (!body) return;
    const DEFAULT_LOC = 'Escola Industrial';
    const DEFAULT_MAP = 'https://share.google/pfbMOc661aRSNlynk';
    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    function readTraining() {
      const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
      body.querySelectorAll('tr:not(.st-locked)').forEach(tr => {
        const i = Number(tr.dataset.tidx);
        if (!training[i]) return;
        const dateInput = tr.querySelector('.st-date');
        const timeInput = tr.querySelector('.st-time');
        const focusInput = tr.querySelector('.st-focus');
        const locInput = tr.querySelector('.st-location');
        const linkInput = tr.querySelector('.st-link');
        if (!dateInput) return;
        const dateIso = dateInput.dataset.dateIso || dateInput.value;
        training[i].date = dateIso;
        training[i].day = dateIso ? DAYS[new Date(dateIso + 'T12:00:00').getDay()] : training[i].day;
        if (timeInput.value) training[i].time = timeInput.value;
        training[i].focus = focusInput.value.trim();
        training[i].location = locInput.value.trim();
        training[i].mapLink = linkInput.value.trim();
      });
      return training;
    }

    // Open custom datepicker on click & update day label on input
    body.querySelectorAll('.st-date').forEach(input => {
      input.addEventListener('click', () => openDatePicker(input));
      input.addEventListener('input', () => {
        const iso = input.dataset.dateIso || input.value;
        const dayLabel = input.closest('td').querySelector('.st-day-label');
        if (dayLabel && iso) {
          dayLabel.textContent = DAYS[new Date(iso + 'T12:00:00').getDay()];
        }
      });
    });

    // Escola Industrial <-> link coupling
    body.querySelectorAll('.st-location').forEach(input => {
      input.addEventListener('change', () => {
        const idx = input.dataset.idx;
        const linkInput = body.querySelector(`.st-link[data-idx="${idx}"]`);
        const val = input.value.trim();
        if (val === DEFAULT_LOC) {
          linkInput.value = DEFAULT_MAP;
        } else if (!val) {
          linkInput.value = '';
        }
      });
    });
    body.querySelectorAll('.st-link').forEach(input => {
      input.addEventListener('change', () => {
        const idx = input.dataset.idx;
        const locInput = body.querySelector(`.st-location[data-idx="${idx}"]`);
        if (!input.value.trim() && locInput.value.trim() === DEFAULT_LOC) {
          locInput.value = '';
        }
      });
    });

    // Clear error highlight on focus fields when typing
    body.querySelectorAll('.st-focus').forEach(input => {
      input.addEventListener('input', () => {
        if (input.value.trim()) input.classList.remove('input-error');
      });
    });

    // Auto-save on input/change
    body.addEventListener('input', () => {
      localStorage.setItem('fa_training', JSON.stringify(readTraining()));
    });
    body.addEventListener('change', () => {
      localStorage.setItem('fa_training', JSON.stringify(readTraining()));
    });

    // Remove training
    body.querySelectorAll('.st-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
        training.splice(Number(btn.dataset.idx), 1);
        localStorage.setItem('fa_training', JSON.stringify(training));
        renderPage(getSession());
      });
    });

    // Add training
    function addTraining() {
      const training = readTraining();
      const d = new Date();
      d.setDate(d.getDate() + 1);
      while (d.getDay() !== 2 && d.getDay() !== 4) d.setDate(d.getDate() + 1);
      const dateStr = d.toISOString().slice(0, 10);
      const day = DAYS[d.getDay()];
      const time = d.getDay() === 2 ? '21:00' : '22:00';
      training.push({ day, date: dateStr, time, focus: '', location: DEFAULT_LOC, mapLink: DEFAULT_MAP, status: 'upcoming', category: getCurrentCategory() || '' });
      training.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      localStorage.setItem('fa_training', JSON.stringify(training));
      renderPage(getSession());
    }
    const addBtnTop = document.getElementById('btn-training-add-top');
    if (addBtnTop) addBtnTop.addEventListener('click', addTraining);

    // Click any training row → open staff training detail
    body.querySelectorAll('tr[data-tidx]').forEach(tr => {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (e) => {
        // Don't navigate if clicking inputs, buttons or links
        if (e.target.closest('input, select, button, a, .md-remove-btn, .st-remove')) return;
        const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
        const t = training[Number(tr.dataset.tidx)];
        if (!t || !t.date) return;
        detailTrainingDate = t.date;
        currentPage = 'staff-training-detail';
        renderPage(getSession());
      });
    });
  }

  // Staff training detail: staff override selects + team generation
  function bindStaffTrainingDetail() {
    document.querySelectorAll('.std-staff-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const playerId = sel.dataset.player;
        const date = sel.dataset.date;
        const key = playerId + '_' + date;
        const overrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
        overrides[key] = sel.value;
        localStorage.setItem('fa_training_staff_override', JSON.stringify(overrides));
        renderPage(getSession());
      });
    });

    // ── Auto Generate Teams ──
    const toggleBtn = document.getElementById('btn-tg-toggle');
    const configPanel = document.getElementById('tg-config');
    if (toggleBtn && configPanel) {
      toggleBtn.addEventListener('click', () => {
        configPanel.hidden = !configPanel.hidden;
        toggleBtn.textContent = configPanel.hidden ? '⚙️ Configure' : '⚙️ Hide';
      });
    }

    // Team filter buttons (All / A / B)
    document.querySelectorAll('[data-tg-team]').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.parentElement.querySelectorAll('.tg-btn').forEach(b => b.classList.remove('tg-btn-active'));
        btn.classList.add('tg-btn-active');
      });
    });
    // Distribution mode buttons (Mix / Equal)
    document.querySelectorAll('[data-tg-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.parentElement.querySelectorAll('.tg-btn').forEach(b => b.classList.remove('tg-btn-active'));
        btn.classList.add('tg-btn-active');
      });
    });

    // Include GK toggle label update
    const gkChk = document.getElementById('tg-include-gk');
    if (gkChk) {
      gkChk.addEventListener('change', () => {
        const lbl = gkChk.parentElement.querySelector('.tg-toggle-text');
        if (lbl) lbl.textContent = gkChk.checked ? 'Yes' : 'No';
      });
    }

    // Update perTeam default when numTeams changes
    const numTeamsInput = document.getElementById('tg-num-teams');
    const perTeamInput = document.getElementById('tg-per-team');
    if (numTeamsInput && perTeamInput) {
      numTeamsInput.addEventListener('change', () => {
        const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
        const t = training.find(x => x.date === detailTrainingDate);
        if (!t) return;
        const players = getUsers().filter(u => (u.roles || []).includes('player'));
        const locked = isTrainingLocked(t);
        const teamFilterBtn = document.querySelector('[data-tg-team].tg-btn-active');
        const teamFilter = teamFilterBtn ? teamFilterBtn.dataset.tgTeam : 'all';
        let pool = players.filter(p => {
          const eff = getEffectiveAnswer(p.id, t.date, locked);
          return eff === 'yes' || eff === 'late';
        });
        if (teamFilter && teamFilter !== 'all') pool = pool.filter(p => p.team === teamFilter);
        const n = Math.max(2, parseInt(numTeamsInput.value) || 2);
        perTeamInput.value = Math.floor(pool.length / n) || 1;
      });
    }

    // Generate button
    const genBtn = document.getElementById('btn-tg-generate');
    if (genBtn) {
      genBtn.addEventListener('click', () => {
        const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
        const t = training.find(x => x.date === detailTrainingDate);
        if (!t) return;
        const players = getUsers().filter(u => (u.roles || []).includes('player'));
        const locked = isTrainingLocked(t);
        const numTeams = Math.max(2, parseInt(document.getElementById('tg-num-teams').value) || 2);
        const perTeam = Math.max(1, parseInt(document.getElementById('tg-per-team').value) || 5);
        const includeGK = document.getElementById('tg-include-gk').checked;
        const teamFilterBtn = document.querySelector('[data-tg-team].tg-btn-active');
        const teamFilter = teamFilterBtn ? teamFilterBtn.dataset.tgTeam : 'all';
        const modeBtn = document.querySelector('[data-tg-mode].tg-btn-active');
        const mode = modeBtn ? modeBtn.dataset.tgMode : 'mix';

        _generatedTeams = generateTrainingTeams(players, t.date, locked, numTeams, perTeam, includeGK, teamFilter, mode);
        _generatedTeamsDate = t.date;

        const container = document.getElementById('tg-teams-container');
        if (container) {
          container.innerHTML = renderGeneratedTeams(_generatedTeams, players, t.date, locked);
          bindGeneratedTeamsDnD(players, t.date, locked);
        }
        _refreshStdBoards(t.date);
      });
    }

    // Bind drag-and-drop if teams already rendered
    if (_generatedTeams && _generatedTeamsDate === detailTrainingDate) {
      const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
      const t = training.find(x => x.date === detailTrainingDate);
      if (t) {
        const players = getUsers().filter(u => (u.roles || []).includes('player'));
        const locked = isTrainingLocked(t);
        bindGeneratedTeamsDnD(players, t.date, locked);
      }
    }
  }

  // ── Refresh the Tactical Boards section in staff training detail ──
  function _refreshStdBoards(tdate) {
    const section = document.getElementById('std-boards-section');
    if (!section) return;
    section.innerHTML = renderStdBoardsSection(tdate);
    // Re-init read-only board scaling + animations
    scaleRoBoards();
    bindRoBoardAnimations();
  }

  // ── Drag-and-drop + add/remove for generated teams ──
  function bindGeneratedTeamsDnD(allPlayers, trainingDate, locked) {
    let dragPlayerId = null;
    let dragSourceTeamIdx = null;
    let _droppedOnTeam = false;

    function _rerender() {
      const container = document.getElementById('tg-teams-container');
      if (container) {
        container.innerHTML = renderGeneratedTeams(_generatedTeams, allPlayers, trainingDate, locked);
        bindGeneratedTeamsDnD(allPlayers, trainingDate, locked);
      }
      _refreshStdBoards(trainingDate);
    }

    document.querySelectorAll('.tg-player-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragPlayerId = row.dataset.playerId;
        dragSourceTeamIdx = Number(row.closest('.tg-team-players').dataset.teamIdx);
        _droppedOnTeam = false;
        row.classList.add('tg-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('tg-dragging');
        document.querySelectorAll('.tg-drop-active').forEach(el => el.classList.remove('tg-drop-active'));
        // If not dropped on any team zone, remove player from source team (→ goes to "No inclosos")
        if (!_droppedOnTeam && dragPlayerId != null && dragSourceTeamIdx != null) {
          _generatedTeams[dragSourceTeamIdx] = _generatedTeams[dragSourceTeamIdx].filter(
            p => String(p.id) !== String(dragPlayerId)
          );
          _rerender();
        }
        dragPlayerId = null;
        dragSourceTeamIdx = null;
      });
    });

    document.querySelectorAll('.tg-team-players').forEach(zone => {
      zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('tg-drop-active');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('tg-drop-active');
      });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('tg-drop-active');
        _droppedOnTeam = true;
        const targetIdx = Number(zone.dataset.teamIdx);
        if (dragPlayerId == null) return;
        // If dragged from "No inclosos" (sentinel -1), just add to target
        if (dragSourceTeamIdx === -1) {
          const player = allPlayers.find(p => String(p.id) === String(dragPlayerId));
          if (!player) return;
          const alreadyAssigned = _generatedTeams.some(team => team.some(tp => String(tp.id) === String(player.id)));
          if (!alreadyAssigned) _generatedTeams[targetIdx].push(player);
          _rerender();
          return;
        }
        if (dragSourceTeamIdx === targetIdx) return;
        // Move player between teams
        const sourceTeam = _generatedTeams[dragSourceTeamIdx];
        const targetTeam = _generatedTeams[targetIdx];
        const pIdx = sourceTeam.findIndex(p => String(p.id) === String(dragPlayerId));
        if (pIdx === -1) return;
        const [player] = sourceTeam.splice(pIdx, 1);
        targetTeam.push(player);
        _rerender();
      });
    });

    // Remove player button (player goes to "No inclosos" automatically via re-render)
    document.querySelectorAll('.tg-remove-player').forEach(btn => {
      btn.addEventListener('click', () => {
        const ti = Number(btn.dataset.teamIdx);
        const pid = btn.dataset.playerId;
        _generatedTeams[ti] = _generatedTeams[ti].filter(p => String(p.id) !== String(pid));
        _rerender();
      });
    });

    // Add player — custom searchable dropdown
    document.querySelectorAll('.tg-dd').forEach(dd => {
      const input = dd.querySelector('.tg-dd-input');
      const list = dd.querySelector('.tg-dd-list');
      if (!input || !list) return;

      input.addEventListener('focus', () => {
        list.hidden = false;
        filterDDOptions('');
      });
      input.addEventListener('input', () => {
        list.hidden = false;
        filterDDOptions(input.value);
      });

      function filterDDOptions(q) {
        const term = q.toLowerCase().trim();
        list.querySelectorAll('.tg-dd-option').forEach(opt => {
          const name = (opt.querySelector('.tg-player-name-text') || {}).textContent || '';
          opt.style.display = name.toLowerCase().includes(term) ? '' : 'none';
        });
      }

      function addByName() {
        const val = input.value.trim();
        if (!val) return false;
        const ti = Number(dd.dataset.teamIdx);
        const term = val.toLowerCase();
        // Try exact match first, then startsWith, then includes
        let player = allPlayers.find(p => (p.name || '').toLowerCase() === term);
        if (!player) player = allPlayers.find(p => (p.name || '').toLowerCase().startsWith(term));
        if (!player) player = allPlayers.find(p => (p.name || '').toLowerCase().includes(term));
        // If no match, create an ad-hoc entry so any name can be added
        if (!player) {
          player = { id: 'custom_' + Date.now(), name: val, position: '', team: '', playerNumber: '', roles: [] };
        }
        const alreadyAssigned = _generatedTeams.some(team => team.some(tp => String(tp.id) === String(player.id)));
        if (alreadyAssigned) { input.value = ''; list.hidden = true; return false; }
        _generatedTeams[ti].push(player);
        _rerender();
        return true;
      }

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addByName(); input.value = ''; list.hidden = true; }
        if (e.key === 'Escape') { list.hidden = true; input.blur(); }
      });

      input.addEventListener('blur', () => {
        // Try to add by name on blur, then close dropdown
        setTimeout(() => {
          addByName();
          list.hidden = true;
        }, 150);
      });

      list.querySelectorAll('.tg-dd-option').forEach(opt => {
        opt.addEventListener('mousedown', e => {
          e.preventDefault(); // prevent blur from firing
          const pid = opt.dataset.pid;
          const ti = Number(dd.dataset.teamIdx);
          const player = allPlayers.find(p => String(p.id) === String(pid));
          if (!player) return;
          const alreadyAssigned = _generatedTeams.some(team => team.some(tp => String(tp.id) === String(player.id)));
          if (alreadyAssigned) return;
          _generatedTeams[ti].push(player);
          _rerender();
        });
      });
    });

    // "No inclosos" drag into teams
    document.querySelectorAll('.tg-ni-player[draggable]').forEach(chip => {
      chip.addEventListener('dragstart', e => {
        dragPlayerId = chip.dataset.playerId;
        dragSourceTeamIdx = -1; // sentinel: from "no inclosos"
        _droppedOnTeam = false;
        chip.classList.add('tg-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('tg-dragging');
        document.querySelectorAll('.tg-drop-active').forEach(el => el.classList.remove('tg-drop-active'));
        dragPlayerId = null;
        dragSourceTeamIdx = null;
      });
    });
  }

  // ---------- Convocatòria drag-and-drop ----------
  function bindConvocatoria() {
    const availEl = document.getElementById('conv-available');
    const calledEl = document.getElementById('conv-called');
    if (!availEl || !calledEl) return;

    // Match selector (custom dropdown)
    const toggle = document.getElementById('conv-match-toggle');
    const dropdown = document.getElementById('conv-match-dropdown');
    if (toggle && dropdown) {
      toggle.addEventListener('click', () => {
        dropdown.hidden = !dropdown.hidden;
        toggle.classList.toggle('conv-match-toggle-open', !dropdown.hidden);
      });
      dropdown.querySelectorAll('.conv-match-option').forEach(opt => {
        opt.addEventListener('click', () => {
          convSelectedMatchId = Number(opt.dataset.mid) || null;
          renderPage(getSession());
        });
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#conv-match-selector')) { dropdown.hidden = true; toggle.classList.remove('conv-match-toggle-open'); }
      });
    }

    function getConvKey() { return convSelectedMatchId ? String(convSelectedMatchId) : null; }
    function getConvAll() {
      const raw = JSON.parse(localStorage.getItem('fa_convocatoria') || '{}');
      if (Array.isArray(raw)) { localStorage.setItem('fa_convocatoria', '{}'); return {}; }
      return raw;
    }
    function getSaved() {
      const all = getConvAll();
      const key = getConvKey();
      return key ? (all[key] || []) : [];
    }
    function setSaved(list) {
      const all = getConvAll();
      const key = getConvKey();
      if (!key) return;
      all[key] = list;
      localStorage.setItem('fa_convocatoria', JSON.stringify(all));
    }

    let dragId = null;

    function handleDragStart(e) {
      dragId = e.currentTarget.dataset.id;
      e.currentTarget.classList.add('conv-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    }
    function handleDragEnd(e) {
      e.currentTarget.classList.remove('conv-dragging');
    }

    availEl.querySelectorAll('.conv-player').forEach(el => {
      el.addEventListener('dragstart', handleDragStart);
      el.addEventListener('dragend', handleDragEnd);
    });
    calledEl.querySelectorAll('.conv-player').forEach(el => {
      el.addEventListener('dragstart', handleDragStart);
      el.addEventListener('dragend', handleDragEnd);
    });

    // Tap-to-move for touch devices (drag-and-drop doesn't work on mobile)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      availEl.querySelectorAll('.conv-player:not(.conv-player-unavailable)').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          const saved = getSaved();
          if (!saved.includes(id)) { saved.push(id); setSaved(saved); }
          renderPage(getSession());
        });
      });
      calledEl.querySelectorAll('.conv-player').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.conv-remove')) return; // let × button handle it
          const id = el.dataset.id;
          let saved = getSaved();
          saved = saved.filter(sid => String(sid) !== String(id));
          setSaved(saved);
          renderPage(getSession());
        });
      });
    }

    // Drop on called list → add player
    calledEl.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; calledEl.classList.add('conv-drop-active'); });
    calledEl.addEventListener('dragleave', () => calledEl.classList.remove('conv-drop-active'));
    calledEl.addEventListener('drop', e => {
      e.preventDefault();
      calledEl.classList.remove('conv-drop-active');
      if (!dragId) return;
      const saved = getSaved();
      if (!saved.includes(dragId)) { saved.push(dragId); setSaved(saved); }
      dragId = null;
      renderPage(getSession());
    });

    // Drop on available list → remove player
    availEl.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; availEl.classList.add('conv-drop-active'); });
    availEl.addEventListener('dragleave', () => availEl.classList.remove('conv-drop-active'));
    availEl.addEventListener('drop', e => {
      e.preventDefault();
      availEl.classList.remove('conv-drop-active');
      if (!dragId) return;
      let saved = getSaved();
      saved = saved.filter(id => String(id) !== String(dragId));
      setSaved(saved);
      dragId = null;
      renderPage(getSession());
    });

    // Remove button (×)
    calledEl.querySelectorAll('.conv-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        let saved = getSaved();
        saved = saved.filter(sid => String(sid) !== String(id));
        setSaved(saved);
        renderPage(getSession());
      });
    });

    // Save button
    const saveBtn = document.getElementById('btn-conv-save');
    const clearBtn = document.getElementById('btn-conv-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!convSelectedMatchId) return;
        setSaved([]);
        renderPage(getSession());
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        // If already sent, auto-update the sent data too
        const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
        if (convSelectedMatchId && sentData[convSelectedMatchId]) {
          const calledEls = document.querySelectorAll('#conv-called .conv-player');
          const list = Array.from(calledEls).map(el => el.dataset.id);
          if (list.length) {
            setSaved(list);
            const uniformData = JSON.parse(localStorage.getItem('fa_convocatoria_uniform') || '{}');
            const curU = uniformData[convSelectedMatchId] || { jersey: 'white', socks: 'striped' };
            const vData = JSON.parse(localStorage.getItem('fa_convocatoria_videos') || '{}');
            const videos = vData[convSelectedMatchId] || [];
            sentData[convSelectedMatchId] = { players: list, jersey: curU.jersey, socks: curU.socks, videos: videos };
            localStorage.setItem('fa_convocatoria_sent', JSON.stringify(sentData));
          }
        }
        saveBtn.textContent = '✓ Saved';
        saveBtn.classList.remove('btn-outline');
        saveBtn.classList.add('btn-accent');
        setTimeout(() => {
          saveBtn.textContent = 'Save';
          saveBtn.classList.add('btn-outline');
          saveBtn.classList.remove('btn-accent');
        }, 1200);
      });
    }

    // Send / Unsend toggle button
    const sendBtn = document.getElementById('btn-conv-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        if (!convSelectedMatchId) return;
        const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
        const isUnsend = sendBtn.classList.contains('btn-danger');
        if (isUnsend) {
          // Unsend
          delete sentData[convSelectedMatchId];
          localStorage.setItem('fa_convocatoria_sent', JSON.stringify(sentData));
        } else {
          // Auto-save then send
          const calledEls = document.querySelectorAll('#conv-called .conv-player');
          const list = Array.from(calledEls).map(el => el.dataset.id);
          if (!list.length) return;
          setSaved(list);
          const uniformData = JSON.parse(localStorage.getItem('fa_convocatoria_uniform') || '{}');
          const curU = uniformData[convSelectedMatchId] || { jersey: 'white', socks: 'striped' };
          const vData = JSON.parse(localStorage.getItem('fa_convocatoria_videos') || '{}');
          const videos = vData[convSelectedMatchId] || [];
          sentData[convSelectedMatchId] = { players: list, jersey: curU.jersey, socks: curU.socks, videos: videos };
          localStorage.setItem('fa_convocatoria_sent', JSON.stringify(sentData));

          // Push notification to called-up players
          const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
          const matchObj = matches.find(m => String(m.id) === String(convSelectedMatchId));
          const matchLabel = matchObj ? (matchObj.home + ' vs ' + matchObj.away) : 'Proper partit';
          const teamId = _currentSession && _currentSession.teamId && _currentSession.teamId !== 'none' ? _currentSession.teamId : null;
          if (!teamId) { console.warn('No valid teamId for push'); }
          // Map roster IDs to Firebase UIDs (skip seeded/fake users with numeric IDs)
          const allUsers = getUsers();
          const targetUids = list.map(pid => {
            const u = allUsers.find(x => String(x.id) === String(pid));
            if (!u) return null;
            // Only include real Firebase Auth users (string UIDs, not numeric seed IDs)
            const id = String(u.id);
            return (id && isNaN(Number(id))) ? id : null;
          }).filter(Boolean);
          Push.sendToPlayers(teamId, targetUids, {
            type: 'convocatoria',
            title: '\u26BD Convocatòria publicada!',
            body: matchLabel + (matchObj && matchObj.date ? ' · ' + matchObj.date : ''),
            page: 'convocatoria',
            matchId: String(convSelectedMatchId)
          });
        }
        renderPage(getSession());
      });
    }

    // Uniform toggle bindings
    document.querySelectorAll('.conv-jersey-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.conv-jersey-opt').forEach(b => b.classList.remove('uniform-opt-active'));
        btn.classList.add('uniform-opt-active');
        if (!convSelectedMatchId) return;
        const uniformData = JSON.parse(localStorage.getItem('fa_convocatoria_uniform') || '{}');
        if (!uniformData[convSelectedMatchId]) uniformData[convSelectedMatchId] = {};
        uniformData[convSelectedMatchId].jersey = btn.dataset.val;
        localStorage.setItem('fa_convocatoria_uniform', JSON.stringify(uniformData));
      });
    });
    document.querySelectorAll('.conv-socks-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.conv-socks-opt').forEach(b => b.classList.remove('uniform-opt-active'));
        btn.classList.add('uniform-opt-active');
        if (!convSelectedMatchId) return;
        const uniformData = JSON.parse(localStorage.getItem('fa_convocatoria_uniform') || '{}');
        if (!uniformData[convSelectedMatchId]) uniformData[convSelectedMatchId] = {};
        uniformData[convSelectedMatchId].socks = btn.dataset.val;
        localStorage.setItem('fa_convocatoria_uniform', JSON.stringify(uniformData));
      });
    });

    // Call-up time binding
    const callupSel = document.getElementById('conv-callup-time');
    if (callupSel) {
      callupSel.addEventListener('change', () => {
        if (!convSelectedMatchId) return;
        // Save to dedicated convocatòria callup storage
        const convCallupData = JSON.parse(localStorage.getItem('fa_convocatoria_callup') || '{}');
        convCallupData[convSelectedMatchId] = callupSel.value;
        localStorage.setItem('fa_convocatoria_callup', JSON.stringify(convCallupData));
        // Also update fa_matches for display in match detail
        const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
        const m = matches.find(x => x.id === convSelectedMatchId);
        if (m) {
          m.callupTime = callupSel.value;
          localStorage.setItem('fa_matches', JSON.stringify(matches));
        }
      });
    }

    // Video links bindings
    function saveConvVideos() {
      if (!convSelectedMatchId) return;
      const vData = JSON.parse(localStorage.getItem('fa_convocatoria_videos') || '{}');
      const rows = document.querySelectorAll('.conv-video-row');
      const videos = [];
      rows.forEach((row, i) => {
        const title = row.querySelector('.conv-video-title').value.trim();
        const url = row.querySelector('.conv-video-url').value.trim();
        const commentEl = document.querySelector('.conv-video-comment[data-video-idx="' + i + '"]');
        const comment = commentEl ? commentEl.value.trim() : '';
        if (title || url) videos.push({ title: title || 'Video', url, comment });
      });
      vData[convSelectedMatchId] = videos;
      localStorage.setItem('fa_convocatoria_videos', JSON.stringify(vData));
      // Re-render to show/hide comment textareas when title changes
      renderPage(getSession());
    }
    const addVideoBtn = document.getElementById('btn-conv-add-video');
    if (addVideoBtn) {
      addVideoBtn.addEventListener('click', () => {
        const list = document.getElementById('conv-video-list');
        if (!list) return;
        const idx = list.querySelectorAll('.conv-video-row').length;
        const row = document.createElement('div');
        row.className = 'conv-video-row';
        row.dataset.videoIdx = idx;
        row.innerHTML = '<input type="text" class="reg-input conv-video-title" value="" placeholder="Title" style="flex:1;min-width:80px;">' +
          '<input type="text" class="reg-input conv-video-url" value="" placeholder="Paste URL" style="flex:2;min-width:140px;">' +
          '<button class="btn btn-small conv-video-remove" style="background:#c62828;color:#fff;border:none;padding:.2rem .5rem;">✕</button>';
        list.appendChild(row);
        row.querySelector('.conv-video-title').addEventListener('blur', saveConvVideos);
        row.querySelector('.conv-video-url').addEventListener('blur', saveConvVideos);
        row.querySelector('.conv-video-remove').addEventListener('click', () => { row.remove(); saveConvVideos(); });
      });
    }
    document.querySelectorAll('.conv-video-row').forEach(row => {
      row.querySelector('.conv-video-title')?.addEventListener('blur', saveConvVideos);
      row.querySelector('.conv-video-url')?.addEventListener('blur', saveConvVideos);
      row.querySelector('.conv-video-remove')?.addEventListener('click', () => { row.remove(); saveConvVideos(); });
    });
    // Per-video comment textareas auto-save
    document.querySelectorAll('.conv-video-comment').forEach(ta => {
      ta.addEventListener('blur', () => {
        if (!convSelectedMatchId) return;
        const vData = JSON.parse(localStorage.getItem('fa_convocatoria_videos') || '{}');
        const videos = vData[convSelectedMatchId] || [];
        const idx = Number(ta.dataset.videoIdx);
        if (videos[idx]) { videos[idx].comment = ta.value.trim(); }
        vData[convSelectedMatchId] = videos;
        localStorage.setItem('fa_convocatoria_videos', JSON.stringify(vData));
      });
    });
  }

  // #endregion Matchday, Calendar & Convocatòria

  // #region Notifications & Body Map
  // ---------- Staff Notifications ----------
  // ---------- In-app push toast ----------
  function _showPushToast(title, body) {
    let container = document.getElementById('push-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'push-toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'push-toast';
    toast.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  function getStaffNotifications() {
    return JSON.parse(localStorage.getItem('fa_staff_notifications') || '[]');
  }
  function saveStaffNotifications(list) {
    localStorage.setItem('fa_staff_notifications', JSON.stringify(list));
  }
  function addStaffNotification(notif) {
    const list = getStaffNotifications();
    list.unshift({
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: notif.type,
      playerName: notif.playerName,
      detail: notif.detail,
      activity: notif.activity,
      timestamp: new Date().toISOString(),
      read: false
    });
    // keep max 200 notifications
    if (list.length > 200) list.length = 200;
    saveStaffNotifications(list);
    updateStaffNotifBadge();
  }
  function getUnreadStaffNotifCount() {
    return getStaffNotifications().filter(n => !n.read).length;
  }
  function updateStaffNotifBadge() {
    const nc = getUnreadStaffNotifCount();
    const el = document.querySelector('.sidebar-item[data-page="staff-notifications"] .sidebar-badge');
    if (el) {
      if (nc > 0) { el.textContent = nc; }
      else { el.remove(); }
    } else if (nc > 0) {
      const item = document.querySelector('.sidebar-item[data-page="staff-notifications"]');
      if (item) item.insertAdjacentHTML('beforeend', `<span class="sidebar-badge">${nc}</span>`);
    }
  }

  // ---------- Medical body map popup ----------
  function bindMedicalBodyPopup() {
    let popup = document.getElementById('medical-body-popup');
    if (popup) popup.remove();
    popup = document.createElement('div');
    popup.id = 'medical-body-popup';
    popup.className = 'medical-body-popup';
    // Build image + SVG overlay
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block;line-height:0;';
    var img = document.createElement('img');
    img.src = 'img/cuerpos.png'; img.alt = 'Body map';
    img.style.cssText = 'display:block;width:300px;height:auto;border-radius:8px;';
    wrap.appendChild(img);
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    BODY_ZONES.forEach(function(z) {
      var poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', z.pts);
      poly.style.cssText = 'fill:transparent;stroke:transparent;transition:fill .2s,stroke .2s;';
      // Tag each polygon with its group names for matching
      poly.dataset.groups = z.groups.join('|');
      svg.appendChild(poly);
    });
    wrap.appendChild(svg);
    popup.appendChild(wrap);
    document.body.appendChild(popup);

    const OFFSET = 16;
    const activeInjuries = getActiveInjuries();
    const injZoneByPlayer = {};
    activeInjuries.forEach(inj => { if (inj.bodyZone != null) injZoneByPlayer[inj.playerId] = inj.bodyZone; });
    // Fallback to fa_injury_zone for players without fa_injuries records
    const zoneMapFallback = JSON.parse(localStorage.getItem('fa_injury_zone') || '{}');
    document.querySelectorAll('.medical-injury').forEach(el => {
      el.addEventListener('mouseenter', e => {
        var playerId = el.closest('.medical-row') ? el.closest('.medical-row').dataset.playerId : null;
        var zIdx = playerId != null ? (injZoneByPlayer[playerId] != null ? injZoneByPlayer[playerId] : zoneMapFallback[playerId]) : null;
        // Highlight only the specific zone that was selected
        svg.querySelectorAll('polygon').forEach(function(poly, i) {
          if (zIdx != null && i === zIdx) {
            poly.style.fill = 'rgba(239,83,80,.4)';
            poly.style.stroke = '#ef5350';
            poly.style.strokeWidth = '.6';
          } else {
            poly.style.fill = 'transparent';
            poly.style.stroke = 'transparent';
          }
        });
        popup.classList.add('visible');
        positionPopup(e);
      });
      el.addEventListener('mousemove', positionPopup);
      el.addEventListener('mouseleave', () => {
        popup.classList.remove('visible');
        svg.querySelectorAll('polygon').forEach(function(poly) {
          poly.style.fill = 'transparent';
          poly.style.stroke = 'transparent';
        });
      });
    });
    function positionPopup(e) {
      const pw = popup.offsetWidth || 316;
      const ph = popup.offsetHeight || 420;
      let x = e.clientX + OFFSET;
      let y = e.clientY - ph / 2;
      if (x + pw > window.innerWidth - 8) x = e.clientX - pw - OFFSET;
      if (y < 8) y = 8;
      if (y + ph > window.innerHeight - 8) y = window.innerHeight - ph - 8;
      popup.style.left = x + 'px';
      popup.style.top = y + 'px';
    }
  }

  // ---------- Shared muscle data ----------
  // BODY_REGIONS, GROUP_SUBS → utils.js

  // Shared commit helper for injury pickers
  function commitInjuryNote(date, musclePath, desc, zoneIdx) {
    const session = getSession();
    const injNotes = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
    const note = musclePath + (desc ? ' – ' + desc : '');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const key = session.id + '_' + date;
    availData[key] = 'injured';
    localStorage.setItem('fa_training_availability', JSON.stringify(availData));
    injNotes[session.id] = note;
    localStorage.setItem('fa_injury_notes', JSON.stringify(injNotes));
    // Store which body zone polygon was selected
    if (zoneIdx != null) {
      const zoneMap = JSON.parse(localStorage.getItem('fa_injury_zone') || '{}');
      zoneMap[session.id] = zoneIdx;
      localStorage.setItem('fa_injury_zone', JSON.stringify(zoneMap));
    }
    const users = getUsers();
    const u = users.find(x => x.id === session.id);
    if (u) { u.fitnessStatus = 'injured'; u.injuryNote = note; saveUsers(users); }
    // Also create / update fa_injuries record
    const parenMatch = musclePath.match(/^(.+?)\s*\((.+?)\)$/);
    let mGroup = '', mSub = '';
    if (parenMatch) { mSub = parenMatch[1].trim(); mGroup = parenMatch[2].trim(); }
    else { mGroup = musclePath; }
    const zLabel = zoneIdx != null && BODY_ZONES[zoneIdx] ? BODY_ZONES[zoneIdx].label : '';
    // Check if player already has an active injury
    const injuries = getInjuries();
    const existing = injuries.find(inj => inj.playerId === session.id && inj.status === 'active');
    if (existing) {
      existing.bodyZone = zoneIdx; existing.bodyZoneLabel = zLabel;
      existing.muscleGroup = mGroup || zLabel || 'Injury';
      existing.muscleSub = mSub; existing.description = desc || '';
      saveInjuries(injuries);
    } else {
      addInjury({
        playerId: session.id,
        bodyZone: zoneIdx, bodyZoneLabel: zLabel,
        muscleGroup: mGroup || zLabel || 'Injury',
        muscleSub: mSub, description: desc || '',
        severity: 'moderate', status: 'active',
        startDate: date, expectedReturn: null, endDate: null,
        createdBy: session.id, notes: ''
      });
    }
    const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
    const tObj = training.find(t => t.date === date);
    addStaffNotification({
      type: 'training_avail',
      playerName: session.name || '?',
      detail: 'Injured – ' + note,
      activity: (tObj && tObj.focus ? tObj.focus : 'Training') + ' (' + date + ')'
    });
    renderPage(session);
    updateActionsBadge();
  }

  // ---------- Body zone polygons ----------
  // BODY_ZONES → utils.js

  // ---------- Interactive body map picker ----------
  function showBodyMapPicker(btnsWrap, date) {
    // Build overlay
    var overlay = document.createElement('div');
    overlay.className = 'body-map-overlay';
    var modal = document.createElement('div');
    modal.className = 'body-map-modal';
    modal.innerHTML = '<div class="body-map-header"><span>🏥 Select injured area</span>' +
      '<button class="body-map-close">&times;</button></div>';

    // Image container with SVG polygon overlay
    var container = document.createElement('div');
    container.className = 'body-map-container';
    // Inner wrapper so SVG sits exactly on top of the image
    var imgWrap = document.createElement('div');
    imgWrap.className = 'body-map-img-wrap';
    var img = document.createElement('img');
    img.src = 'img/cuerpos.png'; img.className = 'body-map-img'; img.draggable = false;
    imgWrap.appendChild(img);

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('body-map-svg');

    var tip = document.createElement('div');
    tip.className = 'body-zone-tip';

    BODY_ZONES.forEach(function (z, i) {
      var poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', z.pts);
      poly.dataset.idx = i;
      poly.classList.add('body-zone-poly');
      poly.addEventListener('mouseenter', function () { tip.textContent = z.label; tip.style.display = 'block'; });
      poly.addEventListener('mousemove', function (e) {
        var r = imgWrap.getBoundingClientRect();
        tip.style.left = (e.clientX - r.left + 12) + 'px';
        tip.style.top = (e.clientY - r.top - 28) + 'px';
      });
      poly.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
      svg.appendChild(poly);
    });
    imgWrap.appendChild(svg);
    imgWrap.appendChild(tip);
    container.appendChild(imgWrap);
    modal.appendChild(container);

    // Choice panel (hidden initially)
    var choicePanel = document.createElement('div');
    choicePanel.className = 'body-map-choice';
    choicePanel.style.display = 'none';
    modal.appendChild(choicePanel);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close
    function closeOverlay() { overlay.remove(); btnsWrap.style.display = ''; }
    modal.querySelector('.body-map-close').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
    function onEsc(e) { if (e.key === 'Escape') { closeOverlay(); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);
    btnsWrap.style.display = 'none';

    // Zone interaction (click to select, click again to deselect)
    var activePoly = null;
    svg.querySelectorAll('.body-zone-poly').forEach(function (poly) {
      poly.addEventListener('click', function () {
        if (activePoly === poly) {
          // Deselect
          poly.classList.remove('body-zone-active');
          activePoly = null;
          choicePanel.style.display = 'none';
          choicePanel.innerHTML = '';
          return;
        }
        if (activePoly) activePoly.classList.remove('body-zone-active');
        poly.classList.add('body-zone-active');
        activePoly = poly;
        var z = BODY_ZONES[parseInt(poly.dataset.idx)];
        buildChoicePanel(z.groups);
      });
    });

    function buildChoicePanel(groups) {
      choicePanel.style.display = '';
      var html = '<div class="body-map-choice-row">';
      // Group selector
      if (groups.length > 1) {
        html += '<select class="body-map-group-sel">';
        groups.forEach(function (g) { html += '<option value="' + sanitize(g) + '">' + sanitize(g) + '</option>'; });
        html += '</select>';
      } else {
        html += '<span class="body-map-group-label">' + sanitize(groups[0]) + '</span>';
      }
      // Sub-muscle dropdown
      html += '<select class="body-map-sub-sel"><option value="">— General —</option>';
      (GROUP_SUBS[groups[0]] || []).forEach(function (s) {
        html += '<option value="' + sanitize(s) + '">' + sanitize(s) + '</option>';
      });
      html += '</select>';
      // Description + OK
      html += '<input type="text" class="body-map-desc" placeholder="Describe injury…" maxlength="120">';
      html += '<button class="body-map-ok">OK</button>';
      html += '</div>';
      choicePanel.innerHTML = html;

      // Update sub-muscles when group changes
      var groupSel = choicePanel.querySelector('.body-map-group-sel');
      var subSel = choicePanel.querySelector('.body-map-sub-sel');
      if (groupSel) {
        groupSel.addEventListener('change', function () {
          var g = groupSel.value;
          var opts = '<option value="">— General —</option>';
          (GROUP_SUBS[g] || []).forEach(function (s) {
            opts += '<option value="' + sanitize(s) + '">' + sanitize(s) + '</option>';
          });
          subSel.innerHTML = opts;
        });
      }
      // Commit
      function doCommit() {
        var group = groupSel ? groupSel.value : choicePanel.querySelector('.body-map-group-label').textContent;
        var sub = subSel.value;
        var desc = choicePanel.querySelector('.body-map-desc').value.trim();
        var musclePath = sub ? (sub + ' (' + group + ')') : group;
        var zoneIdx = activePoly ? parseInt(activePoly.dataset.idx) : null;
        overlay.remove();
        commitInjuryNote(date, musclePath, desc, zoneIdx);
      }
      choicePanel.querySelector('.body-map-ok').addEventListener('click', doCommit);
      choicePanel.querySelector('.body-map-desc').addEventListener('keydown', function (e) { if (e.key === 'Enter') doCommit(); });
      choicePanel.querySelector('.body-map-desc').focus();
    }
  }

  // #endregion Notifications & Body Map

  // #region Medical
  // ---------- Medical ----------
  let _medicalFilterState = 'all'; // synced to medicalFilter

  function renderMedical() {
    const users = getUsers();
    const players = users.filter(u => (u.roles || []).includes('player'));
    const injuries = getInjuries();
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const seasonStart = seasonYear + '-08-15';
    const seasonInjuries = injuries.filter(i => i.startDate >= seasonStart);

    const activeInj = seasonInjuries.filter(i => i.status === 'active');
    const recoveringInj = seasonInjuries.filter(i => i.status === 'recovering');
    const resolvedInj = seasonInjuries.filter(i => i.status === 'resolved');

    // Avg recovery time (resolved injuries only)
    let avgRecovery = 0;
    if (resolvedInj.length) {
      const totalDays = resolvedInj.reduce((sum, inj) => {
        const s = new Date(inj.startDate + 'T12:00:00');
        const e = new Date((inj.endDate || todayStr) + 'T12:00:00');
        return sum + Math.max(1, Math.floor((e - s) / 86400000) + 1);
      }, 0);
      avgRecovery = Math.round(totalDays / resolvedInj.length);
    }

    // Build player status map
    const playerStatusMap = {};
    players.forEach(p => {
      const d = deriveFitnessStatus(p.id, false);
      playerStatusMap[p.id] = d.fitnessStatus;
    });

    // Squad grid
    const filter = medicalFilter;
    const filteredPlayers = players.filter(p => {
      if (filter === 'all') return true;
      return playerStatusMap[p.id] === filter || (filter === 'recovering' && playerStatusMap[p.id] === 'doubt');
    }).sort((a, b) => {
      const order = { injured: 0, doubt: 1, fit: 2 };
      const diff = (order[playerStatusMap[a.id]] ?? 2) - (order[playerStatusMap[b.id]] ?? 2);
      return diff !== 0 ? diff : posRankGlobal(a) - posRankGlobal(b);
    });

    const gridHtml = filteredPlayers.map(p => {
      const st = playerStatusMap[p.id];
      const posHtml = posCirclesHtmlGlobal(p);
      const teamCircle = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
      let borderColor = '#43a047'; // fit green
      let statusLabel = 'Fit';
      let statusClass = 'fit';
      let injExcerpt = '';
      if (st === 'injured') {
        borderColor = '#e53935'; statusLabel = 'Injured'; statusClass = 'injured';
        const pInj = activeInj.find(i => i.playerId === p.id);
        if (pInj) {
          const days = Math.max(0, Math.floor((now - new Date(pInj.startDate + 'T12:00:00')) / 86400000));
          injExcerpt = '<div class="med-card-injury">' + sanitize(pInj.muscleGroup || 'Injury') + ' · ' + days + 'd</div>';
        }
      } else if (st === 'doubt') {
        borderColor = '#f9a825'; statusLabel = 'Recovering'; statusClass = 'recovering';
        const pInj = recoveringInj.find(i => i.playerId === p.id);
        if (pInj) injExcerpt = '<div class="med-card-injury" style="color:#f9a825;">' + sanitize(pInj.muscleGroup || 'Recovery') + '</div>';
      }
      return '<div class="med-player-card" data-player-id="' + p.id + '" style="border-left:4px solid ' + borderColor + ';">' +
        '<div class="med-card-top">' +
          '<span class="conv-pos-circles">' + posHtml + '</span>' +
          '<span class="med-card-name">' + sanitize(p.name) + teamCircle + '</span>' +
          '<span class="med-status-dot med-status-' + statusClass + '" title="' + statusLabel + '"></span>' +
        '</div>' +
        injExcerpt +
      '</div>';
    }).join('');

    // Active injuries cards
    let activeHtml = '';
    if (!activeInj.length && !recoveringInj.length) {
      activeHtml = '<div class="empty-state" style="padding:1.5rem;"><div class="empty-icon">💪</div><p>No active injuries</p></div>';
    } else {
      const combined = [...activeInj, ...recoveringInj].sort((a, b) => {
        const da = Math.floor((now - new Date(a.startDate + 'T12:00:00')) / 86400000);
        const db2 = Math.floor((now - new Date(b.startDate + 'T12:00:00')) / 86400000);
        return db2 - da;
      });
      activeHtml = combined.map(inj => {
        const p = players.find(x => x.id === inj.playerId);
        if (!p) return '';
        const posHtml = posCirclesHtmlGlobal(p);
        const teamCircle = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
        const days = Math.max(0, Math.floor((now - new Date(inj.startDate + 'T12:00:00')) / 86400000));
        const durationStr = days === 0 ? 'Today' : days === 1 ? '1 day' : days + ' days';
        const sinceStr = new Date(inj.startDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const sevColors = { minor: '#43a047', moderate: '#f9a825', severe: '#e53935' };
        const sevColor = sevColors[inj.severity] || '#999';
        const sevLabel = inj.severity ? inj.severity.charAt(0).toUpperCase() + inj.severity.slice(1) : 'Unknown';
        let returnHtml = '';
        if (inj.expectedReturn) {
          const retD = new Date(inj.expectedReturn + 'T12:00:00');
          const retDays = Math.max(0, Math.ceil((retD - now) / 86400000));
          returnHtml = '<span class="med-return-badge">' + (retDays <= 0 ? 'Due back' : '~' + retDays + 'd to return') + '</span>';
        }
        const statusBadge = inj.status === 'recovering'
          ? '<span class="med-severity-badge" style="background:#f9a825;color:#333;">Recovering</span>'
          : '<span class="med-severity-badge" style="background:' + sevColor + ';">' + sanitize(sevLabel) + '</span>';
        const zoneLabel = inj.muscleGroup ? sanitize(inj.muscleGroup) + (inj.muscleSub ? ' (' + sanitize(inj.muscleSub) + ')' : '') : 'Unknown area';
        return '<div class="med-injury-card" data-player-id="' + p.id + '" data-injury-id="' + inj.id + '">' +
          '<div class="med-inj-card-top">' +
            '<div class="med-inj-player">' +
              '<span class="conv-pos-circles">' + posHtml + '</span>' +
              '<span class="med-card-name">' + sanitize(p.name) + teamCircle + '</span>' +
            '</div>' +
            statusBadge +
          '</div>' +
          '<div class="med-inj-body">' +
            '<div class="med-inj-zone">' + zoneLabel + '</div>' +
            (inj.description ? '<div class="med-inj-desc">' + sanitize(inj.description) + '</div>' : '') +
          '</div>' +
          '<div class="med-inj-footer">' +
            '<div class="med-inj-duration"><span class="medical-since">Since ' + sinceStr + '</span><span class="medical-days">' + durationStr + '</span></div>' +
            returnHtml +
            '<div class="med-inj-actions">' +
              (inj.status === 'active' ? '<button class="btn btn-small med-btn-recover" data-inj-id="' + inj.id + '">Mark Recovering</button>' : '') +
              '<button class="btn btn-small med-btn-resolve" data-inj-id="' + inj.id + '">Mark Resolved</button>' +
              '<button class="btn btn-small btn-ghost med-btn-edit" data-inj-id="' + inj.id + '">Edit</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // Past injuries
    const pastSorted = resolvedInj.sort((a, b) => (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate));
    let pastHtml = '';
    if (!pastSorted.length) {
      pastHtml = '<div class="empty-state" style="padding:1rem;"><div class="empty-icon">✅</div><p>No past injuries this season</p></div>';
    } else {
      pastHtml = pastSorted.map(inj => {
        const p = players.find(x => x.id === inj.playerId);
        if (!p) return '';
        const posHtml = posCirclesHtmlGlobal(p);
        const teamCircle = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
        const startStr = new Date(inj.startDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const endStr = inj.endDate ? new Date(inj.endDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?';
        const s = new Date(inj.startDate + 'T12:00:00');
        const e = new Date((inj.endDate || todayStr) + 'T12:00:00');
        const days = Math.max(1, Math.floor((e - s) / 86400000) + 1);
        const durationStr = days === 1 ? '1 day' : days + ' days';
        const sevColors = { minor: '#43a047', moderate: '#f9a825', severe: '#e53935' };
        return '<div class="medical-row med-past-row" data-player-id="' + p.id + '">' +
          '<div class="medical-player">' +
            '<span class="conv-pos-circles">' + posHtml + '</span>' +
            '<span class="medical-name">' + sanitize(p.name) + teamCircle + '</span>' +
          '</div>' +
          '<div class="medical-injury"><span class="med-severity-dot" style="background:' + (sevColors[inj.severity] || '#999') + ';"></span>' + sanitize(inj.muscleGroup || 'Injury') + '</div>' +
          '<div class="medical-duration">' +
            '<span class="medical-since">' + startStr + ' – ' + endStr + '</span>' +
            '<span class="medical-days">' + durationStr + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // Analytics
    const analyticsHtml = renderInjuryAnalytics(seasonInjuries, players, todayStr);

    const fitCount = players.filter(p => playerStatusMap[p.id] === 'fit').length;
    const injCount = players.filter(p => playerStatusMap[p.id] === 'injured').length;
    const recCount = players.filter(p => playerStatusMap[p.id] === 'doubt').length;

    return '<div class="med-header"><h2 class="page-title">Medical</h2>' +
      '<button class="btn btn-orange med-log-btn" id="med-log-injury">+ Log Injury</button></div>' +
      '<div class="medical-stats-row">' +
        '<div class="card medical-stat-card med-stat-red"><div class="medical-stat-value">' + injCount + '</div><div class="medical-stat-label">Injured</div></div>' +
        '<div class="card medical-stat-card med-stat-amber"><div class="medical-stat-value">' + recCount + '</div><div class="medical-stat-label">Recovering</div></div>' +
        '<div class="card medical-stat-card"><div class="medical-stat-value">' + seasonInjuries.length + '</div><div class="medical-stat-label">Total This Season</div></div>' +
        '<div class="card medical-stat-card"><div class="medical-stat-value">' + avgRecovery + '<span style="font-size:.9rem;font-weight:400;">d</span></div><div class="medical-stat-label">Avg Recovery</div></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title" style="margin-bottom:.8rem;">Squad Fitness</div>' +
        '<div class="med-filter-row">' +
          '<button class="med-filter-btn' + (filter === 'all' ? ' med-filter-active' : '') + '" data-med-filter="all">All (' + players.length + ')</button>' +
          '<button class="med-filter-btn' + (filter === 'injured' ? ' med-filter-active' : '') + '" data-med-filter="injured">Injured (' + injCount + ')</button>' +
          '<button class="med-filter-btn' + (filter === 'recovering' ? ' med-filter-active' : '') + '" data-med-filter="recovering">Recovering (' + recCount + ')</button>' +
          '<button class="med-filter-btn' + (filter === 'fit' ? ' med-filter-active' : '') + '" data-med-filter="fit">Fit (' + fitCount + ')</button>' +
        '</div>' +
        '<div class="med-player-grid">' + gridHtml + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title" style="margin-bottom:.8rem;">🏥 Active Injuries</div>' +
        activeHtml +
      '</div>' +
      '<div class="card med-past-card">' +
        '<div class="card-title med-past-title" id="med-past-toggle" style="cursor:pointer;margin-bottom:0;">' +
          '📋 Past Injuries (' + resolvedInj.length + ') <span class="med-past-arrow">' + (medicalPastExpanded ? '▲' : '▼') + '</span>' +
        '</div>' +
        '<div class="med-past-body" style="' + (medicalPastExpanded ? '' : 'display:none;') + '">' + pastHtml + '</div>' +
      '</div>' +
      analyticsHtml;
  }

  // ---------- Injury Analytics ----------
  function renderInjuryAnalytics(injuries, players, todayStr) {
    if (!injuries.length) return '';
    const now = new Date();

    // Body zone frequency
    const zoneCounts = {};
    injuries.forEach(inj => {
      const z = inj.bodyZone;
      if (z != null) zoneCounts[z] = (zoneCounts[z] || 0) + 1;
    });
    const maxZoneCount = Math.max(1, ...Object.values(zoneCounts));

    // Build mini body map heatmap SVG
    let heatPolys = '';
    BODY_ZONES.forEach((z, i) => {
      const count = zoneCounts[i] || 0;
      if (!count) {
        heatPolys += '<polygon points="' + z.pts + '" fill="transparent" stroke="transparent"/>';
      } else {
        const intensity = Math.min(1, count / maxZoneCount);
        const r = Math.round(239 * intensity + 67 * (1 - intensity));
        const g = Math.round(83 * intensity + 160 * (1 - intensity));
        const b = Math.round(80 * intensity + 80 * (1 - intensity));
        heatPolys += '<polygon points="' + z.pts + '" fill="rgba(' + r + ',' + g + ',' + b + ',' + (0.15 + 0.45 * intensity) + ')" stroke="rgba(' + r + ',' + g + ',' + b + ',.7)" stroke-width=".4">' +
          '<title>' + sanitize(z.label) + ': ' + count + ' injuries</title></polygon>';
      }
    });

    const heatMapHtml = '<div class="med-analytics-heatmap">' +
      '<div style="position:relative;display:inline-block;line-height:0;width:100%;max-width:320px;">' +
        '<img src="img/cuerpos.png" style="display:block;width:100%;border-radius:8px;pointer-events:none;">' +
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:100%;">' +
        heatPolys + '</svg>' +
      '</div>' +
    '</div>';

    // Monthly bar chart (SVG) — match body image height (220px)
    const monthCounts = new Array(12).fill(0);
    injuries.forEach(inj => {
      const m = parseInt(inj.startDate.slice(5, 7), 10) - 1;
      monthCounts[m]++;
    });
    const maxMonth = Math.max(1, ...monthCounts);
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const barW = 44, gap = 12, chartH = 380, padTop = 32, padBot = 34, padLeft = 38;
    const svgW = padLeft + 12 * (barW + gap) + gap;
    const barArea = chartH - padTop - padBot;
    // Y-axis ticks
    const yTicks = [];
    if (maxMonth <= 5) {
      for (let t = 0; t <= maxMonth; t++) yTicks.push(t);
    } else {
      const step = Math.ceil(maxMonth / 4);
      for (let t = 0; t <= maxMonth; t += step) yTicks.push(t);
      if (yTicks[yTicks.length - 1] < maxMonth) yTicks.push(maxMonth);
    }
    let axisHtml = '';
    yTicks.forEach(t => {
      const y = chartH - padBot - (t / maxMonth) * barArea;
      axisHtml += '<line x1="' + padLeft + '" y1="' + y + '" x2="' + (svgW - gap) + '" y2="' + y + '" stroke="var(--border)" stroke-width=".5" stroke-dasharray="3,3"/>';
      axisHtml += '<text x="' + (padLeft - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="13" fill="var(--text-secondary)">' + t + '</text>';
    });
    let barsHtml = axisHtml;
    monthCounts.forEach((c, i) => {
      const x = padLeft + gap + i * (barW + gap);
      const h = c > 0 ? Math.max(4, (c / maxMonth) * barArea) : 0;
      const y = chartH - padBot - h;
      const color = c === 0 ? 'transparent' : (c >= maxMonth * 0.7 ? '#e53935' : c >= maxMonth * 0.4 ? '#f9a825' : '#43a047');
      barsHtml += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="4" fill="' + color + '"/>';
      if (c > 0) barsHtml += '<text x="' + (x + barW / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">' + c + '</text>';
      barsHtml += '<text x="' + (x + barW / 2) + '" y="' + (chartH - 8) + '" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text-secondary)">' + monthNames[i] + '</text>';
    });
    const monthChartHtml = '<svg viewBox="0 0 ' + svgW + ' ' + chartH + '" preserveAspectRatio="xMidYMid meet" style="width:100%;">' + barsHtml + '</svg>';

    // Injury-prone table
    const playerInjCount = {};
    const playerDaysOut = {};
    const playerTopZone = {};
    injuries.forEach(inj => {
      const pid = inj.playerId;
      playerInjCount[pid] = (playerInjCount[pid] || 0) + 1;
      const s = new Date(inj.startDate + 'T12:00:00');
      const e = new Date((inj.endDate || todayStr) + 'T12:00:00');
      playerDaysOut[pid] = (playerDaysOut[pid] || 0) + Math.max(1, Math.floor((e - s) / 86400000) + 1);
      const zone = inj.muscleGroup || 'Unknown';
      if (!playerTopZone[pid]) playerTopZone[pid] = {};
      playerTopZone[pid][zone] = (playerTopZone[pid][zone] || 0) + 1;
    });
    const proneList = Object.entries(playerInjCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pid, count]) => {
        const p = players.find(x => x.id === pid);
        const name = p ? sanitize(p.name) : 'Unknown';
        const days = playerDaysOut[pid] || 0;
        const zones = playerTopZone[pid] || {};
        const topZone = Object.entries(zones).sort((a, b) => b[1] - a[1])[0];
        return '<tr><td>' + name + '</td><td>' + count + '</td><td>' + days + 'd</td><td>' + (topZone ? sanitize(topZone[0]) : '—') + '</td></tr>';
      }).join('');

    // Most common zone & severity
    const zoneFreq = {};
    const sevFreq = { minor: 0, moderate: 0, severe: 0 };
    injuries.forEach(inj => {
      const z = inj.muscleGroup || 'Unknown';
      zoneFreq[z] = (zoneFreq[z] || 0) + 1;
      if (inj.severity) sevFreq[inj.severity]++;
    });
    const topZoneEntry = Object.entries(zoneFreq).sort((a, b) => b[1] - a[1])[0];
    const topSev = Object.entries(sevFreq).sort((a, b) => b[1] - a[1])[0];

    return '<div class="card"><div class="card-title" style="margin-bottom:.8rem;">📊 Injury Analytics</div>' +
      '<div class="med-analytics-grid">' +
        '<div class="med-analytics-section">' +
          '<div class="med-analytics-subtitle">Body Zone Heatmap</div>' +
          heatMapHtml +
        '</div>' +
        '<div class="med-analytics-section">' +
          '<div class="med-analytics-subtitle">Injuries by Month</div>' +
          monthChartHtml +
        '</div>' +
      '</div>' +
      (proneList ? '<div class="med-analytics-section" style="margin-top:1rem;">' +
        '<div class="med-analytics-subtitle">Injury-Prone Players</div>' +
        '<table class="med-prone-table"><thead><tr><th>Player</th><th>Injuries</th><th>Days Out</th><th>Most Affected</th></tr></thead><tbody>' + proneList + '</tbody></table>' +
      '</div>' : '') +
      '<div class="med-season-summary">' +
        '<div class="med-summary-item"><span class="med-summary-label">Most Common Area</span><span class="med-summary-val">' + (topZoneEntry ? sanitize(topZoneEntry[0]) + ' (' + topZoneEntry[1] + ')' : '—') + '</span></div>' +
        '<div class="med-summary-item"><span class="med-summary-label">Most Common Severity</span><span class="med-summary-val">' + (topSev ? topSev[0].charAt(0).toUpperCase() + topSev[0].slice(1) + ' (' + topSev[1] + ')' : '—') + '</span></div>' +
      '</div>' +
    '</div>';
  }

  // ---------- Medical Detail ----------
  function renderMedicalDetail() {
    const users = getUsers();
    const p = users.find(x => String(x.id) === String(medicalDetailPlayerId));
    if (!p) return '<div class="empty-state"><p>Player not found</p></div>';
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const derived = deriveFitnessStatus(p.id, false);
    const posHtml = posCirclesHtmlGlobal(p);
    const teamCircle = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
    const allInj = getPlayerInjuries(p.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
    const activeInj = allInj.find(i => i.status === 'active');
    const recoveringInj = allInj.find(i => i.status === 'recovering');
    const currentInj = activeInj || recoveringInj;

    // Status badge
    let statusHtml = '';
    if (derived.fitnessStatus === 'injured') statusHtml = '<span class="med-detail-status" style="background:#e53935;">Injured</span>';
    else if (derived.fitnessStatus === 'doubt') statusHtml = '<span class="med-detail-status" style="background:#f9a825;color:#333;">Recovering</span>';
    else statusHtml = '<span class="med-detail-status" style="background:#43a047;">Fit</span>';

    // Current injury card
    let currentInjHtml = '';
    if (currentInj) {
      const days = Math.max(0, Math.floor((now - new Date(currentInj.startDate + 'T12:00:00')) / 86400000));
      const sinceStr = new Date(currentInj.startDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const sevColors = { minor: '#43a047', moderate: '#f9a825', severe: '#e53935' };
      const sevColor = sevColors[currentInj.severity] || '#999';
      let returnHtml = '';
      if (currentInj.expectedReturn) {
        const retD = new Date(currentInj.expectedReturn + 'T12:00:00');
        const retDays = Math.max(0, Math.ceil((retD - now) / 86400000));
        returnHtml = '<div class="med-detail-return">Expected return: ' + new Date(currentInj.expectedReturn + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + (retDays > 0 ? ' (~' + retDays + ' days)' : ' (due)') + '</div>';
      }
      currentInjHtml = '<div class="card med-current-card">' +
        '<div class="card-title" style="margin-bottom:.6rem;">Current Injury</div>' +
        '<div class="med-detail-inj-info">' +
          '<span class="med-severity-badge" style="background:' + sevColor + ';">' + (currentInj.severity || 'Unknown').charAt(0).toUpperCase() + (currentInj.severity || 'unknown').slice(1) + '</span>' +
          '<span class="med-detail-zone">' + sanitize(currentInj.muscleGroup || 'Unknown') + (currentInj.muscleSub ? ' (' + sanitize(currentInj.muscleSub) + ')' : '') + '</span>' +
        '</div>' +
        (currentInj.description ? '<div class="med-detail-desc">' + sanitize(currentInj.description) + '</div>' : '') +
        '<div class="med-detail-timing">Since ' + sinceStr + ' · ' + (days === 0 ? 'Today' : days + ' days') + '</div>' +
        returnHtml +
        (currentInj.notes ? '<div class="med-detail-notes">' + sanitize(currentInj.notes) + '</div>' : '') +
        '<div class="med-inj-actions" style="margin-top:.6rem;">' +
          (currentInj.status === 'active' ? '<button class="btn btn-small med-btn-recover" data-inj-id="' + currentInj.id + '">Mark Recovering</button>' : '') +
          '<button class="btn btn-small med-btn-resolve" data-inj-id="' + currentInj.id + '">Mark Resolved</button>' +
          '<button class="btn btn-small btn-ghost med-btn-edit" data-inj-id="' + currentInj.id + '">Edit</button>' +
        '</div>' +
      '</div>';
    }

    // Body map with history heat
    const zoneCounts = {};
    allInj.forEach(inj => { if (inj.bodyZone != null) zoneCounts[inj.bodyZone] = (zoneCounts[inj.bodyZone] || 0) + 1; });
    const maxZ = Math.max(1, ...Object.values(zoneCounts));
    let bodyPolys = '';
    BODY_ZONES.forEach((z, i) => {
      const count = zoneCounts[i] || 0;
      const isCurrent = currentInj && currentInj.bodyZone === i;
      if (!count && !isCurrent) {
        bodyPolys += '<polygon points="' + z.pts + '" fill="transparent" stroke="transparent"/>';
      } else {
        const intensity = Math.min(1, count / maxZ);
        bodyPolys += '<polygon points="' + z.pts + '" fill="rgba(239,83,80,' + (0.1 + 0.4 * intensity) + ')" stroke="rgba(239,83,80,.7)" stroke-width=".4">' +
          '<title>' + sanitize(z.label) + ': ' + count + ' injuries</title></polygon>';
        if (isCurrent) {
          const pairs = z.pts.split(/\s+/).map(pp => pp.split(',').map(Number));
          let cx = 0, cy = 0;
          pairs.forEach(([x, y]) => { cx += x; cy += y; });
          cx = (cx / pairs.length).toFixed(1);
          cy = (cy / pairs.length).toFixed(1);
          bodyPolys += '<circle cx="' + cx + '" cy="' + cy + '" r="1.8" class="mystats-injury-dot"/>';
        }
      }
    });

    const bodyMapHtml = '<div class="med-detail-body-map">' +
      '<div style="position:relative;display:inline-block;line-height:0;">' +
        '<img src="img/cuerpos.png" style="display:block;height:260px;border-radius:8px;pointer-events:none;">' +
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:100%;">' +
        bodyPolys + '</svg>' +
      '</div>' +
    '</div>';

    // Recurring injury alerts
    let recurringHtml = '';
    const zoneInjCounts = {};
    allInj.forEach(inj => {
      const zone = inj.muscleGroup || 'Unknown';
      zoneInjCounts[zone] = (zoneInjCounts[zone] || 0) + 1;
    });
    const recurring = Object.entries(zoneInjCounts).filter(([, c]) => c >= 2);
    if (recurring.length) {
      recurringHtml = '<div class="med-recurring-alert">' +
        recurring.map(([zone, c]) => '⚠️ Recurring: ' + sanitize(zone) + ' (' + c + ' injuries)').join('<br>') +
      '</div>';
    }

    // Full timeline
    let timelineHtml = '';
    if (!allInj.length) {
      timelineHtml = '<div class="empty-state" style="padding:1rem;"><p>No injury history</p></div>';
    } else {
      timelineHtml = allInj.map(inj => {
        const sevColors = { minor: '#43a047', moderate: '#f9a825', severe: '#e53935' };
        const statusColors = { active: '#e53935', recovering: '#f9a825', resolved: '#43a047' };
        const startStr = new Date(inj.startDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const endStr = inj.endDate ? new Date(inj.endDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Present';
        const s = new Date(inj.startDate + 'T12:00:00');
        const e = inj.endDate ? new Date(inj.endDate + 'T12:00:00') : now;
        const days = Math.max(1, Math.floor((e - s) / 86400000) + 1);
        return '<div class="med-timeline-row">' +
          '<span class="med-severity-dot" style="background:' + (statusColors[inj.status] || '#999') + ';"></span>' +
          '<div class="med-timeline-info">' +
            '<span class="med-timeline-zone">' + sanitize(inj.muscleGroup || 'Injury') + (inj.muscleSub ? ' (' + sanitize(inj.muscleSub) + ')' : '') + '</span>' +
            '<span class="med-severity-badge med-severity-sm" style="background:' + (sevColors[inj.severity] || '#999') + ';">' + (inj.severity || 'unknown') + '</span>' +
          '</div>' +
          '<div class="med-timeline-dates">' + startStr + ' – ' + endStr + ' · ' + days + 'd</div>' +
        '</div>';
      }).join('');
    }

    return '<div class="med-detail-back" id="med-back">← Medical</div>' +
      '<div class="med-detail-header">' +
        '<div class="med-detail-player">' +
          '<span class="conv-pos-circles">' + posHtml + '</span>' +
          '<span class="med-detail-name">' + sanitize(p.name) + teamCircle + '</span>' +
          statusHtml +
        '</div>' +
      '</div>' +
      currentInjHtml +
      recurringHtml +
      '<div class="med-detail-columns">' +
        '<div class="card med-detail-map-card">' +
          '<div class="card-title" style="margin-bottom:.6rem;">Injury Map</div>' +
          bodyMapHtml +
        '</div>' +
        '<div class="card med-detail-timeline-card">' +
          '<div class="card-title" style="margin-bottom:.6rem;">Injury Timeline (' + allInj.length + ')</div>' +
          timelineHtml +
        '</div>' +
      '</div>';
  }

  // ---------- Staff Injury Logger ----------
  function showStaffInjuryLogger(preselectedPlayerId) {
    const users = getUsers();
    const players = users.filter(u => (u.roles || []).includes('player')).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    const overlay = document.createElement('div');
    overlay.className = 'body-map-overlay';
    const modal = document.createElement('div');
    modal.className = 'body-map-modal med-logger-modal';
    modal.innerHTML = '<div class="body-map-header"><span>🏥 Log Injury</span><button class="body-map-close">&times;</button></div>';

    // Scrollable content
    const content = document.createElement('div');
    content.className = 'med-logger-content';

    // Player selector
    const playerSection = document.createElement('div');
    playerSection.className = 'med-logger-field';
    playerSection.innerHTML = '<label>Player</label><select class="med-logger-select" id="med-log-player">' +
      '<option value="">Select player…</option>' +
      players.map(p => '<option value="' + p.id + '"' + (p.id === preselectedPlayerId ? ' selected' : '') + '>' + sanitize(p.name) + '</option>').join('') +
    '</select>';
    content.appendChild(playerSection);

    // Body map
    const mapSection = document.createElement('div');
    mapSection.className = 'med-logger-field';
    mapSection.innerHTML = '<label>Injured Area (tap body map)</label>';
    const imgWrap = document.createElement('div');
    imgWrap.className = 'body-map-img-wrap';
    imgWrap.style.cssText = 'cursor:pointer;';
    const img = document.createElement('img');
    img.src = 'img/cuerpos.png'; img.className = 'body-map-img'; img.draggable = false;
    img.style.height = '50vh';
    imgWrap.appendChild(img);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('body-map-svg');
    const tip = document.createElement('div');
    tip.className = 'body-zone-tip';
    BODY_ZONES.forEach((z, i) => {
      const poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', z.pts);
      poly.dataset.idx = i;
      poly.classList.add('body-zone-poly');
      poly.addEventListener('mouseenter', () => { tip.textContent = z.label; tip.style.display = 'block'; });
      poly.addEventListener('mousemove', e => {
        const r = imgWrap.getBoundingClientRect();
        tip.style.left = (e.clientX - r.left + 12) + 'px';
        tip.style.top = (e.clientY - r.top - 28) + 'px';
      });
      poly.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
      svg.appendChild(poly);
    });
    imgWrap.appendChild(svg);
    imgWrap.appendChild(tip);
    mapSection.appendChild(imgWrap);
    content.appendChild(mapSection);

    // Choice panel (appears after zone click)
    const choicePanel = document.createElement('div');
    choicePanel.className = 'med-logger-field med-logger-choice';
    choicePanel.style.display = 'none';
    content.appendChild(choicePanel);

    // Severity
    const sevSection = document.createElement('div');
    sevSection.className = 'med-logger-field';
    sevSection.innerHTML = '<label>Severity</label>' +
      '<div class="tg-btn-group med-sev-group">' +
        '<button class="tg-btn" data-sev="minor">Minor</button>' +
        '<button class="tg-btn tg-btn-active" data-sev="moderate">Moderate</button>' +
        '<button class="tg-btn" data-sev="severe">Severe</button>' +
      '</div>';
    content.appendChild(sevSection);

    // Dates
    const dateSection = document.createElement('div');
    dateSection.className = 'med-logger-field med-logger-dates';
    const todayDMY = todayStr.split('-').reverse().join('/');
    dateSection.innerHTML = '<div><label>Start Date</label><input type="text" class="med-logger-input md-datepicker" data-display-dmy data-allow-past id="med-log-start" data-date-iso="' + todayStr + '" value="' + todayDMY + '" placeholder="dd/mm/yyyy" readonly></div>' +
      '<div><label>Expected Return</label><input type="text" class="med-logger-input md-datepicker" data-display-dmy data-allow-past id="med-log-return" data-date-iso="" value="" placeholder="dd/mm/yyyy" readonly></div>';
    content.appendChild(dateSection);

    // Notes
    const notesSection = document.createElement('div');
    notesSection.className = 'med-logger-field';
    notesSection.innerHTML = '<label>Notes</label><textarea class="med-logger-textarea" id="med-log-notes" rows="2" placeholder="Additional notes…" maxlength="300"></textarea>';
    content.appendChild(notesSection);

    // Save button
    const saveSection = document.createElement('div');
    saveSection.className = 'med-logger-field';
    saveSection.innerHTML = '<button class="btn btn-orange med-logger-save" id="med-log-save">Save Injury</button>';
    content.appendChild(saveSection);

    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close
    function closeOverlay() { overlay.remove(); closeDatePicker(); }
    modal.querySelector('.body-map-close').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { closeOverlay(); document.removeEventListener('keydown', onEsc); }
    });

    // Bind custom datepicker
    modal.querySelectorAll('.md-datepicker').forEach(inp => {
      inp.addEventListener('click', () => openDatePicker(inp));
    });

    // Zone interaction
    let activePoly = null;
    let selectedGroup = '', selectedSub = '';
    svg.querySelectorAll('.body-zone-poly').forEach(poly => {
      poly.addEventListener('click', () => {
        if (activePoly === poly) {
          poly.classList.remove('body-zone-active');
          activePoly = null;
          choicePanel.style.display = 'none';
          choicePanel.innerHTML = '';
          return;
        }
        if (activePoly) activePoly.classList.remove('body-zone-active');
        poly.classList.add('body-zone-active');
        activePoly = poly;
        const z = BODY_ZONES[parseInt(poly.dataset.idx)];
        buildLoggerChoice(z.groups);
      });
    });

    function buildLoggerChoice(groups) {
      choicePanel.style.display = '';
      let html = '<div class="body-map-choice-row">';
      if (groups.length > 1) {
        html += '<select class="body-map-group-sel">';
        groups.forEach(g => { html += '<option value="' + sanitize(g) + '">' + sanitize(g) + '</option>'; });
        html += '</select>';
      } else {
        html += '<span class="body-map-group-label">' + sanitize(groups[0]) + '</span>';
      }
      html += '<select class="body-map-sub-sel"><option value="">— General —</option>';
      (GROUP_SUBS[groups[0]] || []).forEach(s => { html += '<option value="' + sanitize(s) + '">' + sanitize(s) + '</option>'; });
      html += '</select>';
      html += '<input type="text" class="body-map-desc" placeholder="Describe injury…" maxlength="120">';
      html += '</div>';
      choicePanel.innerHTML = html;
      selectedGroup = groups[0];
      selectedSub = '';
      const groupSel = choicePanel.querySelector('.body-map-group-sel');
      const subSel = choicePanel.querySelector('.body-map-sub-sel');
      if (groupSel) {
        groupSel.addEventListener('change', () => {
          selectedGroup = groupSel.value;
          let opts = '<option value="">— General —</option>';
          (GROUP_SUBS[selectedGroup] || []).forEach(s => { opts += '<option value="' + sanitize(s) + '">' + sanitize(s) + '</option>'; });
          subSel.innerHTML = opts;
        });
      }
      if (subSel) subSel.addEventListener('change', () => { selectedSub = subSel.value; });
    }

    // Severity buttons
    let selectedSeverity = 'moderate';
    sevSection.querySelectorAll('.tg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sevSection.querySelectorAll('.tg-btn').forEach(b => b.classList.remove('tg-btn-active'));
        btn.classList.add('tg-btn-active');
        selectedSeverity = btn.dataset.sev;
      });
    });

    // Save
    document.getElementById('med-log-save').addEventListener('click', () => {
      const playerId = document.getElementById('med-log-player').value;
      if (!playerId) { alert('Please select a player.'); return; }
      const startDate = document.getElementById('med-log-start').dataset.dateIso || todayStr;
      const expectedReturn = document.getElementById('med-log-return').dataset.dateIso || null;
      const notes = document.getElementById('med-log-notes').value.trim();
      const zoneIdx = activePoly ? parseInt(activePoly.dataset.idx) : null;
      const zLabel = zoneIdx != null && BODY_ZONES[zoneIdx] ? BODY_ZONES[zoneIdx].label : '';
      const descEl = choicePanel.querySelector('.body-map-desc');
      const desc = descEl ? descEl.value.trim() : '';
      const groupLabelEl = choicePanel.querySelector('.body-map-group-label');
      const groupSelEl = choicePanel.querySelector('.body-map-group-sel');
      const subSelEl = choicePanel.querySelector('.body-map-sub-sel');
      const mGroup = groupSelEl ? groupSelEl.value : (groupLabelEl ? groupLabelEl.textContent : zLabel || 'Injury');
      const mSub = subSelEl ? subSelEl.value : '';

      // Check if player already has an active injury
      const injuries = getInjuries();
      const existing = injuries.find(inj => inj.playerId === playerId && inj.status === 'active');
      if (existing) {
        if (!confirm('This player already has an active injury. Create a new one?')) return;
      }

      const inj = addInjury({
        playerId, bodyZone: zoneIdx, bodyZoneLabel: zLabel,
        muscleGroup: mGroup || 'Injury', muscleSub: mSub,
        description: desc, severity: selectedSeverity,
        status: 'active', startDate,
        expectedReturn, endDate: null,
        createdBy: getSession().id, notes
      });

      // Update user fitness status
      const usrs = getUsers();
      const u = usrs.find(x => x.id === playerId);
      if (u) { u.fitnessStatus = 'injured'; u.injuryNote = mGroup + (mSub ? ' (' + mSub + ')' : '') + (desc ? ' – ' + desc : ''); saveUsers(usrs); }
      // Also update fa_injury_notes & zone for backwards compat
      const injNotes = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
      injNotes[playerId] = mGroup + (mSub ? ' (' + mSub + ')' : '') + (desc ? ' – ' + desc : '');
      localStorage.setItem('fa_injury_notes', JSON.stringify(injNotes));
      if (zoneIdx != null) {
        const zm = JSON.parse(localStorage.getItem('fa_injury_zone') || '{}');
        zm[playerId] = zoneIdx;
        localStorage.setItem('fa_injury_zone', JSON.stringify(zm));
      }

      addStaffNotification({
        type: 'training_avail',
        playerName: u ? u.name : '?',
        detail: 'Injured – ' + (mGroup || 'Injury'),
        activity: 'Staff logged injury'
      });

      closeOverlay();
      renderPage(getSession());
    });
  }

  // ---------- Edit Injury Modal ----------
  function showEditInjuryModal(injuryId) {
    const injuries = getInjuries();
    const inj = injuries.find(i => i.id === injuryId);
    if (!inj) return;
    const users = getUsers();
    const player = users.find(u => u.id === inj.playerId);

    const overlay = document.createElement('div');
    overlay.className = 'body-map-overlay';
    const modal = document.createElement('div');
    modal.className = 'body-map-modal med-edit-modal';
    modal.innerHTML = '<div class="body-map-header"><span>✏️ Edit Injury' + (player ? ' — ' + sanitize(player.name) : '') + '</span><button class="body-map-close">&times;</button></div>';

    const content = document.createElement('div');
    content.className = 'med-logger-content';

    // Severity
    content.innerHTML = '<div class="med-logger-field"><label>Severity</label>' +
      '<div class="tg-btn-group med-sev-group">' +
        '<button class="tg-btn' + (inj.severity === 'minor' ? ' tg-btn-active' : '') + '" data-sev="minor">Minor</button>' +
        '<button class="tg-btn' + (inj.severity === 'moderate' ? ' tg-btn-active' : '') + '" data-sev="moderate">Moderate</button>' +
        '<button class="tg-btn' + (inj.severity === 'severe' ? ' tg-btn-active' : '') + '" data-sev="severe">Severe</button>' +
      '</div></div>' +
      '<div class="med-logger-field"><label>Status</label>' +
      '<div class="tg-btn-group">' +
        '<button class="tg-btn' + (inj.status === 'active' ? ' tg-btn-active' : '') + '" data-status="active">Active</button>' +
        '<button class="tg-btn' + (inj.status === 'recovering' ? ' tg-btn-active' : '') + '" data-status="recovering">Recovering</button>' +
        '<button class="tg-btn' + (inj.status === 'resolved' ? ' tg-btn-active' : '') + '" data-status="resolved">Resolved</button>' +
      '</div></div>' +
      '<div class="med-logger-field med-logger-dates">' +
        '<div><label>Start Date</label><input type="text" class="med-logger-input md-datepicker" data-display-dmy data-allow-past id="med-edit-start" data-date-iso="' + sanitize(inj.startDate || '') + '" value="' + (inj.startDate ? inj.startDate.split('-').reverse().join('/') : '') + '" placeholder="dd/mm/yyyy" readonly></div>' +
        '<div><label>Expected Return</label><input type="text" class="med-logger-input md-datepicker" data-display-dmy data-allow-past id="med-edit-return" data-date-iso="' + sanitize(inj.expectedReturn || '') + '" value="' + (inj.expectedReturn ? inj.expectedReturn.split('-').reverse().join('/') : '') + '" placeholder="dd/mm/yyyy" readonly></div>' +
        '<div><label>End Date</label><input type="text" class="med-logger-input md-datepicker" data-display-dmy data-allow-past id="med-edit-end" data-date-iso="' + sanitize(inj.endDate || '') + '" value="' + (inj.endDate ? inj.endDate.split('-').reverse().join('/') : '') + '" placeholder="dd/mm/yyyy" readonly></div>' +
      '</div>' +
      '<div class="med-logger-field"><label>Notes</label><textarea class="med-logger-textarea" id="med-edit-notes" rows="2" maxlength="300">' + sanitize(inj.notes || '') + '</textarea></div>' +
      '<div class="med-logger-field"><button class="btn btn-orange med-logger-save" id="med-edit-save">Save Changes</button></div>';

    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function closeOverlay() { overlay.remove(); closeDatePicker(); }
    modal.querySelector('.body-map-close').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); });

    // Bind custom datepicker
    modal.querySelectorAll('.md-datepicker').forEach(inp => {
      inp.addEventListener('click', () => openDatePicker(inp));
    });

    let editSev = inj.severity || 'moderate';
    let editStatus = inj.status || 'active';
    content.querySelectorAll('.med-sev-group .tg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        content.querySelectorAll('.med-sev-group .tg-btn').forEach(b => b.classList.remove('tg-btn-active'));
        btn.classList.add('tg-btn-active');
        editSev = btn.dataset.sev;
      });
    });
    content.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        content.querySelectorAll('[data-status]').forEach(b => b.classList.remove('tg-btn-active'));
        btn.classList.add('tg-btn-active');
        editStatus = btn.dataset.status;
      });
    });

    document.getElementById('med-edit-save').addEventListener('click', () => {
      const now2 = new Date();
      const todayStr2 = now2.getFullYear() + '-' + String(now2.getMonth() + 1).padStart(2, '0') + '-' + String(now2.getDate()).padStart(2, '0');
      const changes = {
        severity: editSev,
        status: editStatus,
        startDate: document.getElementById('med-edit-start').dataset.dateIso || inj.startDate,
        expectedReturn: document.getElementById('med-edit-return').dataset.dateIso || null,
        endDate: editStatus === 'resolved' ? (document.getElementById('med-edit-end').dataset.dateIso || todayStr2) : (document.getElementById('med-edit-end').dataset.dateIso || null),
        notes: document.getElementById('med-edit-notes').value.trim()
      };
      updateInjury(injuryId, changes);
      // Update player fitness status
      if (player) deriveFitnessStatus(player.id, true);
      closeOverlay();
      renderPage(getSession());
    });
  }

  // ---------- Medical Bind ----------
  function bindMedical() {
    bindMedicalBodyPopup();

    // Log injury button
    const logBtn = document.getElementById('med-log-injury');
    if (logBtn) logBtn.addEventListener('click', () => showStaffInjuryLogger());

    // Filter buttons
    document.querySelectorAll('[data-med-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        medicalFilter = btn.dataset.medFilter;
        renderPage(getSession());
      });
    });

    // Player card clicks → medical detail
    document.querySelectorAll('.med-player-card').forEach(card => {
      card.addEventListener('click', () => {
        medicalDetailPlayerId = card.dataset.playerId;
        currentPage = 'medical-detail';
        renderPage(getSession());
      });
    });

    // Injury card player clicks → medical detail
    document.querySelectorAll('.med-injury-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('button')) return; // don't navigate when clicking action buttons
        medicalDetailPlayerId = card.dataset.playerId;
        currentPage = 'medical-detail';
        renderPage(getSession());
      });
    });

    // Mark recovering
    document.querySelectorAll('.med-btn-recover').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.injId;
        updateInjury(id, { status: 'recovering' });
        const inj = getInjuries().find(i => i.id === id);
        if (inj) deriveFitnessStatus(inj.playerId, true);
        renderPage(getSession());
      });
    });

    // Mark resolved
    document.querySelectorAll('.med-btn-resolve').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        resolveInjury(btn.dataset.injId);
        const inj = getInjuries().find(i => i.id === btn.dataset.injId);
        if (inj) deriveFitnessStatus(inj.playerId, true);
        renderPage(getSession());
      });
    });

    // Edit
    document.querySelectorAll('.med-btn-edit').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        showEditInjuryModal(btn.dataset.injId);
      });
    });

    // Past injuries toggle
    const pastToggle = document.getElementById('med-past-toggle');
    if (pastToggle) {
      pastToggle.addEventListener('click', () => {
        medicalPastExpanded = !medicalPastExpanded;
        const body = pastToggle.closest('.med-past-card').querySelector('.med-past-body');
        const arrow = pastToggle.querySelector('.med-past-arrow');
        if (body) body.style.display = medicalPastExpanded ? '' : 'none';
        if (arrow) arrow.textContent = medicalPastExpanded ? '▲' : '▼';
      });
    }
  }

  // ---------- Medical Detail Bind ----------
  function bindMedicalDetail() {
    // Back button
    const backBtn = document.getElementById('med-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        currentPage = 'medical';
        renderPage(getSession());
      });
    }

    // Action buttons
    document.querySelectorAll('.med-btn-recover').forEach(btn => {
      btn.addEventListener('click', () => {
        updateInjury(btn.dataset.injId, { status: 'recovering' });
        const inj = getInjuries().find(i => i.id === btn.dataset.injId);
        if (inj) deriveFitnessStatus(inj.playerId, true);
        renderPage(getSession());
      });
    });
    document.querySelectorAll('.med-btn-resolve').forEach(btn => {
      btn.addEventListener('click', () => {
        resolveInjury(btn.dataset.injId);
        const inj = getInjuries().find(i => i.id === btn.dataset.injId);
        if (inj) deriveFitnessStatus(inj.playerId, true);
        renderPage(getSession());
      });
    });
    document.querySelectorAll('.med-btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        showEditInjuryModal(btn.dataset.injId);
      });
    });
  }

  // ---------- My Stats Injury Hover Popup ----------
  function bindMyStatsInjuryPopup() {
    let popup = document.getElementById('mystats-body-popup');
    if (popup) popup.remove();
    const rows = document.querySelectorAll('.mystats-inj-row');
    if (!rows.length) return;
    popup = document.createElement('div');
    popup.id = 'mystats-body-popup';
    popup.className = 'medical-body-popup';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block;line-height:0;';
    const img = document.createElement('img');
    img.src = 'img/cuerpos.png'; img.alt = 'Body map';
    img.style.cssText = 'display:block;width:300px;height:auto;border-radius:8px;';
    wrap.appendChild(img);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    BODY_ZONES.forEach(z => {
      const poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', z.pts);
      poly.style.cssText = 'fill:transparent;stroke:transparent;transition:fill .2s,stroke .2s;';
      svg.appendChild(poly);
    });
    wrap.appendChild(svg);
    popup.appendChild(wrap);
    document.body.appendChild(popup);

    const OFFSET = 16;
    rows.forEach(row => {
      row.addEventListener('mouseenter', e => {
        const zIdxStr = row.dataset.zoneIdx;
        const zIdx = zIdxStr !== '' && zIdxStr != null ? parseInt(zIdxStr, 10) : null;
        svg.querySelectorAll('polygon').forEach((poly, i) => {
          if (zIdx != null && i === zIdx) {
            poly.style.fill = 'rgba(239,83,80,.4)';
            poly.style.stroke = '#ef5350';
            poly.style.strokeWidth = '.6';
          } else {
            poly.style.fill = 'transparent';
            poly.style.stroke = 'transparent';
          }
        });
        popup.classList.add('visible');
        positionPopup(e);
      });
      row.addEventListener('mousemove', positionPopup);
      row.addEventListener('mouseleave', () => {
        popup.classList.remove('visible');
        svg.querySelectorAll('polygon').forEach(poly => {
          poly.style.fill = 'transparent';
          poly.style.stroke = 'transparent';
        });
      });
    });
    function positionPopup(e) {
      const pw = popup.offsetWidth || 316;
      const ph = popup.offsetHeight || 420;
      // On narrow screens, center the popup
      if (window.innerWidth < 600) {
        popup.style.position = 'fixed';
        popup.style.left = Math.max(8, (window.innerWidth - pw) / 2) + 'px';
        popup.style.top = Math.max(8, (window.innerHeight - ph) / 2) + 'px';
        return;
      }
      let x = e.clientX + OFFSET;
      let y = e.clientY - ph / 2;
      if (x + pw > window.innerWidth - 8) x = e.clientX - pw - OFFSET;
      if (y < 8) y = 8;
      if (y + ph > window.innerHeight - 8) y = window.innerHeight - ph - 8;
      popup.style.left = x + 'px';
      popup.style.top = y + 'px';
    }
  }

  function renderStaffNotifications() {
    const notifs = getStaffNotifications();
    // Track which are unread before marking
    const unreadIds = new Set(notifs.filter(n => !n.read).map(n => n.id));

    function fmtTs(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      const day = DAYS_CA[d.getDay()] + ' ' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
      const time = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      return day + ' ' + time;
    }
    function typeBadge(type) {
      const map = {
        'training_rpe': { label: 'Training RPE', bg: '#43a047' },
        'match_rpe': { label: 'Match RPE', bg: '#f9a825', color: '#333' },
        'extra_training': { label: 'Extra Training', bg: '#78909c' },
        'training_avail': { label: 'Training Avail', bg: '#1e88e5' },
        'match_avail': { label: 'Match Avail', bg: '#e53935' }
      };
      const m = map[type] || { label: type, bg: '#999' };
      return `<span class="notif-type-badge" style="background:${m.bg};${m.color ? 'color:'+m.color : ''}">${sanitize(m.label)}</span>`;
    }

    let rows = '';
    if (!notifs.length) {
      rows = '<p style="color:var(--text-secondary);padding:1rem 0;">No notifications yet.</p>';
    } else {
      notifs.forEach(n => {
        const isNew = unreadIds.has(n.id);
        rows += `<div class="notif-row${isNew ? ' notif-new' : ''}">
          <div class="notif-row-top">
            ${typeBadge(n.type)}
            <span class="notif-player">${sanitize(n.playerName || '?')}</span>
            <span class="notif-time">${fmtTs(n.timestamp)}</span>
          </div>
          <div class="notif-row-detail">${sanitize(n.activity || '')}${n.detail ? ' — ' + sanitize(n.detail) : ''}</div>
        </div>`;
      });
    }

    const html = `<h2 class="page-title">Notifications</h2>
      <div class="card">
        <div class="notif-header">
          <span class="card-title" style="margin-bottom:0;">All Notifications</span>
          ${notifs.length ? '<button class="btn btn-small btn-outline" id="btn-clear-notifs">Clear All</button>' : ''}
        </div>
        ${rows}
      </div>`;

    // Mark all as read after building HTML
    if (unreadIds.size) {
      notifs.forEach(n => { n.read = true; });
      saveStaffNotifications(notifs);
      updateStaffNotifBadge();
    }

    return html;
  }

  // #endregion Medical

  // #region Event Bindings
  // ---------- Dynamic actions ----------
  function bindDynamicActions() {
    // Category bar clicks
    $$('.cat-bar-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _viewCategory = btn.dataset.cat || '';
        renderPage(getSession());
      });
    });

    // Animate percentage counters
    $$('.po-pct-counter').forEach(el => {
      const target = parseInt(el.dataset.target, 10) || 0;
      const duration = 1000;
      const start = performance.now();
      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        el.textContent = Math.round(progress * target) + '%';
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    // Convocatòria drag-and-drop
    bindConvocatoria();

    // Roster player name click → staff player stats
    $$('.roster-player-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        staffViewPlayerId = a.dataset.playerId;
        currentPage = 'staff-player-stats';
        renderPage(getSession());
      });
    });

    // Training detail team filter (multi-select)
    $$('[data-std-team]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.stdTeam;
        if (val === 'all') {
          stdTeamFilter = null;
        } else {
          if (!stdTeamFilter) {
            stdTeamFilter = new Set([val]);
          } else if (stdTeamFilter.has(val)) {
            stdTeamFilter.delete(val);
            if (stdTeamFilter.size === 0) stdTeamFilter = null;
          } else {
            stdTeamFilter.add(val);
          }
        }
        renderPage(getSession());
      });
    });

    // Roster team filter
    $$('[data-roster-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        // Snapshot old chart elements keyed by x-position
        const snapCharts = [];
        $$('.roster-right .rpe-chart-svg').forEach(svg => {
          const dotMap = {};
          svg.querySelectorAll('.rpe-dot').forEach(c => {
            const cx = +c.getAttribute('cx');
            dotMap[cx] = { cx, cy: +c.getAttribute('cy') };
          });
          const lines = [];
          svg.querySelectorAll('.rpe-line').forEach(p => lines.push(p.getAttribute('d')));
          const barMap = {};
          svg.querySelectorAll('.acwr-bar-acute, .acwr-bar-chronic').forEach(r => {
            const x = +r.getAttribute('x');
            barMap[x] = { y: +r.getAttribute('y'), h: +r.getAttribute('height') };
          });
          snapCharts.push({ dotMap, lines, barMap });
        });

        rosterTeamFilter = btn.dataset.rosterFilter;
        $$('.roster-team-btn').forEach(b => b.classList.remove('roster-team-btn-active'));
        btn.classList.add('roster-team-btn-active');
        renderPage(getSession());

        // FLIP-animate dots, lines, and bars to new positions
        const DUR = 350;
        const EASE = 'cubic-bezier(.4,0,.2,1)';
        $$('.roster-right .rpe-chart-svg').forEach((svg, si) => {
          const old = snapCharts[si];
          if (!old) return;
          // Dots – match by cx (same x = same date/week)
          svg.querySelectorAll('.rpe-dot').forEach(c => {
            const cx = +c.getAttribute('cx');
            const prev = old.dotMap[cx];
            if (!prev) return;
            const dy = prev.cy - (+c.getAttribute('cy'));
            if (dy === 0) return;
            c.style.transform = 'translateY(' + dy + 'px)';
            requestAnimationFrame(() => requestAnimationFrame(() => {
              c.style.transition = 'transform ' + DUR + 'ms ' + EASE;
              c.style.transform = '';
              c.addEventListener('transitionend', () => { c.style.transition = ''; c.style.transform = ''; }, { once: true });
            }));
          });
          // Lines – rebuild path each frame from interpolated dot positions
          svg.querySelectorAll('.rpe-line').forEach(p => {
            const newD = p.getAttribute('d');
            // Extract data points: M start + C endpoints
            const pts = [];
            const mMatch = newD.match(/M\s*([\d.\-]+)[,\s]+([\d.\-]+)/);
            if (mMatch) pts.push({ x: +mMatch[1], y: +mMatch[2] });
            const cRe = /C\s*[\d.\-]+[,\s]+[\d.\-]+[,\s]+[\d.\-]+[,\s]+[\d.\-]+[,\s]+([\d.\-]+)[,\s]+([\d.\-]+)/g;
            let cm;
            while ((cm = cRe.exec(newD)) !== null) pts.push({ x: +cm[1], y: +cm[2] });
            if (pts.length < 2) return;
            // Find old Y for each point by matching closest x in dotMap
            const dotXs = Object.keys(old.dotMap).map(Number);
            function closestOldDot(px) {
              let best = null, bestDist = Infinity;
              for (let k = 0; k < dotXs.length; k++) {
                const d = Math.abs(dotXs[k] - px);
                if (d < bestDist) { bestDist = d; best = old.dotMap[dotXs[k]]; }
              }
              return bestDist < 2 ? best : null;
            }
            const deltas = pts.map(pt => {
              const prev = closestOldDot(pt.x);
              return prev ? prev.cy - pt.y : 0;
            });
            if (deltas.every(d => d === 0)) return;
            const t0 = performance.now();
            (function frame() {
              let t = Math.min((performance.now() - t0) / DUR, 1);
              t = 1 - Math.pow(1 - t, 3);
              const interp = pts.map((pt, i) => ({ x: pt.x, y: pt.y + deltas[i] * (1 - t) }));
              p.setAttribute('d', crSplinePath(interp));
              if (t < 1) requestAnimationFrame(frame);
            })();
          });
          // ACWR bars – match by x-position
          svg.querySelectorAll('.acwr-bar-acute, .acwr-bar-chronic').forEach(r => {
            const x = +r.getAttribute('x');
            const prev = old.barMap[x];
            if (!prev) return;
            const dy = prev.y - (+r.getAttribute('y'));
            if (dy === 0) return;
            r.style.transform = 'translateY(' + dy + 'px)';
            requestAnimationFrame(() => requestAnimationFrame(() => {
              r.style.transition = 'transform ' + DUR + 'ms ' + EASE;
              r.style.transform = '';
              r.addEventListener('transitionend', () => { r.style.transition = ''; r.style.transform = ''; }, { once: true });
            }));
          });
        });
      });
    });

    // Matchday
    bindMatchday();

    // Staff Training
    bindStaffTraining();

    // Staff Training Detail
    bindStaffTrainingDetail();

    // Tactical Board
    bindTactics();

    // Read-only board frame animations
    bindRoBoardAnimations();

    // Staff matchday card navigation
    $$('[data-go-staff-match]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        detailMatchId = Number(el.dataset.goStaffMatch);
        detailMatchFrom = 'staff-matchday';
        currentPage = 'match-detail';
        renderPage(getSession());
      });
    });

    // Player actions: clamp Minutes inputs (digits only, max 300)
    $$('.action-minutes').forEach(inp => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/[^0-9]/g, '');
        const v = parseInt(inp.value, 10);
        if (!isNaN(v) && v > 300) inp.value = 300;
      });
    });

    // Player actions: clamp RPE inputs to 0-10
    $$('.action-rpe').forEach(inp => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/[^0-9]/g, '');
        const v = parseInt(inp.value, 10);
        if (!isNaN(v) && v > 10) inp.value = 10;
      });
      inp.addEventListener('blur', () => {
        const v = parseInt(inp.value, 10);
        if (!isNaN(v)) { if (v < 0) inp.value = 0; if (v > 10) inp.value = 10; }
      });
    });

    // Player actions: RPE submit
    $$('.action-submit').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.action-card');
        const rpeInput = card.querySelector('.action-rpe');
        const minInput = card.querySelector('.action-minutes');
        const rpe = parseInt(rpeInput.value, 10);
        const minutes = parseInt(minInput.value, 10);
        if (isNaN(rpe) || rpe < 0 || rpe > 10) { rpeInput.classList.add('input-error'); return; }
        if (isNaN(minutes) || minutes < 0) { minInput.classList.add('input-error'); return; }
        const key = card.dataset.actionKey;
        const tag = card.dataset.actionType;
        const ua = rpe * minutes;
        // Extract the actual activity date from the key or card
        let activityDate;
        if (tag === 'training') {
          activityDate = key.split('_training_')[1] || '';
        } else {
          const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
          const mId = key.split('_match_')[1];
          const mObj = matches.find(m => String(m.id) === mId);
          activityDate = mObj ? mObj.date : '';
        }
        if (!activityDate) { const n = new Date(); activityDate = n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0'); }
        const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
        rpeData[key] = { rpe, minutes, ua, tag, date: activityDate };
        localStorage.setItem('fa_player_rpe', JSON.stringify(rpeData));
        // Staff notification
        const session = getSession();
        const actLabel = card.querySelector('.action-label');
        const actDate = card.querySelector('.action-date');
        const actText = (actLabel ? actLabel.textContent : '') + (actDate ? ' · ' + actDate.textContent : '');
        addStaffNotification({
          type: tag === 'match' ? 'match_rpe' : 'training_rpe',
          playerName: session ? session.name : '?',
          detail: 'RPE ' + rpe + ' · ' + minutes + ' min',
          activity: actText
        });
        renderPage(getSession());
        updateActionsBadge();
      });
    });

    // Player actions: Add extra training
    const addExtraBtn = document.getElementById('btn-add-extra');
    if (addExtraBtn) {
      addExtraBtn.addEventListener('click', () => {
        const list = document.getElementById('extra-training-list');
        if (!list) return;
        const id = Date.now();
        const html = `<div class="action-card" data-extra-id="${id}">
          <div class="action-header"><span class="badge" style="background:#78909c;color:#fff;">Extra</span>
            <select class="reg-input action-extra-tag" style="width:auto;font-size:.82rem;">
              <option value="Running">Running</option>
              <option value="Cycling">Cycling</option>
              <option value="Gym">Gym</option>
              <option value="Swimming">Swimming</option>
            </select>
          </div>
          <div class="action-form">
            <div class="action-field"><label>Date</label><input type="text" class="reg-input action-extra-date md-datepicker" data-display-dmy data-allow-past placeholder="dd/mm/yyyy" readonly style="width:120px;cursor:pointer;"></div>
            <div class="action-field"><label data-tooltip="Rate of Perceived Exertion (0–10)">RPE</label><input type="text" inputmode="numeric" class="reg-input action-rpe" maxlength="2"></div>
            <div class="action-field"><label>Minutes</label><input type="text" inputmode="numeric" class="reg-input action-minutes" maxlength="3"></div>
            <button class="btn btn-primary btn-small action-extra-submit">Submit</button>
          </div>
        </div>`;
        list.insertAdjacentHTML('beforeend', html);
        const card = list.querySelector('[data-extra-id="' + id + '"]');
        // Bind date picker
        card.querySelector('.action-extra-date').addEventListener('click', function() { openDatePicker(this); });
        // Bind tooltip on RPE label
        card.querySelectorAll('[data-tooltip]').forEach(el => {
          el.addEventListener('mouseenter', () => {
            const tip = document.getElementById('roster-tooltip');
            if (!tip) return;
            tip.textContent = el.getAttribute('data-tooltip');
            tip.classList.add('visible');
            const rect = el.getBoundingClientRect();
            tip.style.left = rect.left + rect.width / 2 - tip.offsetWidth / 2 + 'px';
            tip.style.top = rect.top - tip.offsetHeight - 10 + window.scrollY + 'px';
          });
          el.addEventListener('mouseleave', () => {
            const tip = document.getElementById('roster-tooltip');
            if (tip) tip.classList.remove('visible');
          });
        });
        // Clamp RPE 0-10
        const rpeInp = card.querySelector('.action-rpe');
        rpeInp.addEventListener('input', function() {
          this.value = this.value.replace(/[^0-9]/g, '');
          const v = parseInt(this.value, 10);
          if (!isNaN(v) && v > 10) this.value = 10;
        });
        rpeInp.addEventListener('blur', function() {
          const v = parseInt(this.value, 10);
          if (!isNaN(v)) { if (v < 0) this.value = 0; if (v > 10) this.value = 10; }
        });
        // Clamp Minutes (digits only, max 300)
        const minInp = card.querySelector('.action-minutes');
        minInp.addEventListener('input', function() {
          this.value = this.value.replace(/[^0-9]/g, '');
          const v = parseInt(this.value, 10);
          if (!isNaN(v) && v > 300) this.value = 300;
        });
        // Bind submit
        card.querySelector('.action-extra-submit').addEventListener('click', () => {
          const rpeInput = card.querySelector('.action-rpe');
          const minInput = card.querySelector('.action-minutes');
          const dateInput = card.querySelector('.action-extra-date');
          const rpe = parseInt(rpeInput.value, 10);
          const minutes = parseInt(minInput.value, 10);
          const dateVal = dateInput.dataset.dateIso || dateInput.value;
          if (!dateVal) { dateInput.classList.add('input-error'); return; }
          if (isNaN(rpe) || rpe < 0 || rpe > 10) { rpeInput.classList.add('input-error'); return; }
          if (isNaN(minutes) || minutes < 0) { minInput.classList.add('input-error'); return; }
          const tag = card.querySelector('.action-extra-tag').value;
          const session = getSession();
          const key = session.id + '_extra_' + id;
          const ua = rpe * minutes;
          const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
          rpeData[key] = { rpe, minutes, ua, tag, date: dateVal };
          localStorage.setItem('fa_player_rpe', JSON.stringify(rpeData));
          addStaffNotification({
            type: 'extra_training',
            playerName: session ? session.name : '?',
            detail: 'RPE ' + rpe + ' · ' + minutes + ' min',
            activity: tag + ' (' + dateVal + ')'
          });
          renderPage(session);
        });
      });
    }

    // Activity item navigation (player)
    $$('[data-go-match]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-conv-link]')) return;
        if (e.target.closest('.mavail-btns') || e.target.closest('.mavail-chosen')) return;
        detailMatchId = Number(el.dataset.goMatch);
        detailMatchFrom = currentPage || 'player-matchday';
        currentPage = 'match-detail';
        renderPage(getSession());
      });
    });
    // Match availability buttons
    $$('.mavail-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const matchId = btn.closest('.mavail-btns').dataset.mavailMatch;
        const session = getSession();
        const key = session.id + '_' + matchId;
        const maData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
        maData[key] = btn.dataset.mavail;
        localStorage.setItem('fa_match_availability', JSON.stringify(maData));
        // Derive fitness status (injury this week + disponible → doubt)
        deriveFitnessStatus(session.id);
        // Staff notification
        const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
        const matchObj = matches.find(m => String(m.id) === String(matchId));
        addStaffNotification({
          type: 'match_avail',
          playerName: session ? session.name : '?',
          detail: btn.dataset.mavail === 'disponible' ? 'Disponible' : 'No Disponible',
          activity: matchObj ? (matchObj.home + ' vs ' + matchObj.away + (matchObj.date ? ' · ' + matchObj.date : '')) : 'Match'
        });
        renderPage(session);
        updateActionsBadge();
      });
    });
    // Click chosen match availability badge to re-open
    $$('.mavail-chosen').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const matchId = badge.dataset.mavailMatch;
        const session = getSession();
        const key = session.id + '_' + matchId;
        const maData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
        delete maData[key];
        localStorage.setItem('fa_match_availability', JSON.stringify(maData));
        renderPage(session);
      });
    });
    $$('[data-go-training]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-conv-link]')) return;
        if (e.target.closest('.avail-btns') || e.target.closest('.avail-chosen') || e.target.closest('.injury-note-wrap')) return;
        detailTrainingDate = el.dataset.goTraining;
        currentPage = 'training-detail';
        renderPage(getSession());
      });
    });

    // Training availability buttons
    $$('.avail-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = btn.dataset.avail;
        const btnsWrap = btn.closest('.avail-btns');
        const date = btnsWrap.dataset.availDate;
        if (val === 'injured') {
          showBodyMapPicker(btnsWrap, date);
          return;
        }
        const session = getSession();
        const key = session.id + '_' + date;
        const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
        availData[key] = val;
        localStorage.setItem('fa_training_availability', JSON.stringify(availData));
        // If answering non-injured, clear any injury data and re-derive fitness
        const injNotes2 = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
        if (injNotes2[session.id]) {
          delete injNotes2[session.id];
          localStorage.setItem('fa_injury_notes', JSON.stringify(injNotes2));
          const users2 = getUsers();
          const u2 = users2.find(x => x.id === session.id);
          if (u2) { u2.injuryNote = ''; saveUsers(users2); }
        }
        deriveFitnessStatus(session.id);
        // Staff notification
        const training = JSON.parse(localStorage.getItem('fa_training') || '[]');
        const tObj = training.find(t => t.date === date);
        const answerMap = { yes: 'Yes', late: 'Late', no: 'No' };
        addStaffNotification({
          type: 'training_avail',
          playerName: session ? session.name : '?',
          detail: answerMap[val] || val,
          activity: (tObj && tObj.focus ? tObj.focus : 'Training') + ' (' + date + ')'
        });
        renderPage(session);
        updateActionsBadge();
      });
    });
    // Click chosen badge to re-open options
    $$('.avail-chosen').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const date = badge.dataset.availDate;
        const session = getSession();
        const key = session.id + '_' + date;
        const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
        const wasInjured = availData[key] === 'injured';
        delete availData[key];
        localStorage.setItem('fa_training_availability', JSON.stringify(availData));
        // If was injured, clear injury note and re-derive fitness
        if (wasInjured) {
          const injNotes = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
          delete injNotes[session.id];
          localStorage.setItem('fa_injury_notes', JSON.stringify(injNotes));
          const users = getUsers();
          const u = users.find(x => x.id === session.id);
          if (u) { u.fitnessStatus = 'fit'; u.injuryNote = ''; saveUsers(users); }
          deriveFitnessStatus(session.id);
        }
        renderPage(session);
      });
    });

    // Clear all staff notifications
    const clearNotifsBtn = document.getElementById('btn-clear-notifs');
    if (clearNotifsBtn) {
      clearNotifsBtn.addEventListener('click', () => {
        saveStaffNotifications([]);
        updateStaffNotifBadge();
        renderPage(getSession());
      });
    }

    // UA/RPE chart tooltips
    $$('[data-ua-tip]').forEach(el => {
      el.addEventListener('mouseenter', (e) => {
        const tip = el.dataset.uaTip;
        if (!tip) return;
        let tt = document.getElementById('ua-tooltip');
        if (!tt) {
          tt = document.createElement('div');
          tt.id = 'ua-tooltip';
          tt.className = 'ua-tooltip';
          document.body.appendChild(tt);
        }
        tt.innerHTML = tip;
        tt.classList.add('visible');
        const rect = el.getBoundingClientRect();
        tt.style.left = (rect.left + rect.width / 2) + 'px';
        tt.style.top = (rect.top - 8 + window.scrollY) + 'px';
      });
      el.addEventListener('mouseleave', () => {
        const tt = document.getElementById('ua-tooltip');
        if (tt) tt.classList.remove('visible');
      });
    });

    // Detail back button
    $$('.detail-back').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = btn.dataset.back || 'player-home';
        renderPage(getSession());
      });
    });

    // Video link — open in browser popup window
    $$('.detail-video-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.dataset.videoUrl;
        if (!url) return;
        const sw = screen.width, sh = screen.height;
        const pw = Math.round(sw * 0.55), ph = Math.round(sh * 0.65);
        const pl = sw - pw - 30, pt = sh - ph - 80;
        window.open(url, 'videoPlayer', 'width=' + pw + ',height=' + ph + ',left=' + pl + ',top=' + pt + ',resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no');
      });
    });

    // Match score save (staff only)
    const saveScoreBtn = document.getElementById('btn-save-score');
    if (saveScoreBtn) {
      const _sess = getSession();
      const _isStaff = _sess && (_sess.roles || []).includes('staff');
      // Digit-only clamping for score inputs
      ['score-home', 'score-away'].forEach(id => {
        const inp = document.getElementById(id);
        if (inp) inp.addEventListener('input', function() { this.value = this.value.replace(/[^0-9]/g, ''); });
      });
      if (_isStaff) {
        saveScoreBtn.addEventListener('click', () => {
          const h = (document.getElementById('score-home').value || '').trim();
          const a = (document.getElementById('score-away').value || '').trim();
          if (h === '' || a === '') return;
          const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
          const idx = matches.findIndex(x => x.id === detailMatchId);
          if (idx !== -1) {
            matches[idx].score = h + '-' + a;
            localStorage.setItem('fa_matches', JSON.stringify(matches));
          }
          renderPage(getSession());
        });
      }
    }

    // Match goals: add / remove (staff only)
    const addGoalBtn = document.getElementById('btn-add-goal');
    if (addGoalBtn) {
      const _sess2 = getSession();
      const _isStaff2 = _sess2 && (_sess2.roles || []).includes('staff');
      const minInp = document.getElementById('goal-minute');
      if (minInp) minInp.addEventListener('input', function() { this.value = this.value.replace(/[^0-9]/g, ''); });
      if (_isStaff2) {
        addGoalBtn.addEventListener('click', () => {
          const sel = document.getElementById('goal-player-select');
          const minEl = document.getElementById('goal-minute');
          const playerId = sel.value;
          if (!playerId) return;
          const minute = minEl.value.trim() || '';
          const goalsData = JSON.parse(localStorage.getItem('fa_match_goals') || '{}');
          if (!goalsData[detailMatchId]) goalsData[detailMatchId] = [];
          goalsData[detailMatchId].push({ playerId: playerId === 'og' ? 'og' : playerId, minute });
          goalsData[detailMatchId].sort((a, b) => (Number(a.minute) || 999) - (Number(b.minute) || 999));
          localStorage.setItem('fa_match_goals', JSON.stringify(goalsData));
          renderPage(getSession());
        });
      }
    }

    // Match goals: remove (staff only)
    $$('.goal-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const _sess3 = getSession();
        if (!_sess3 || !(_sess3.roles || []).includes('staff')) return;
        const idx = Number(btn.dataset.goalIdx);
        const goalsData = JSON.parse(localStorage.getItem('fa_match_goals') || '{}');
        if (goalsData[detailMatchId]) {
          goalsData[detailMatchId].splice(idx, 1);
          localStorage.setItem('fa_match_goals', JSON.stringify(goalsData));
        }
        renderPage(getSession());
      });
    });

    // Roster tooltips (JS-based)
    let tooltipEl = document.getElementById('roster-tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'roster-tooltip';
      tooltipEl.className = 'roster-tooltip';
      document.body.appendChild(tooltipEl);
    }
    $$('[data-tooltip]').forEach(icon => {
      icon.addEventListener('mouseenter', (e) => {
        tooltipEl.textContent = icon.getAttribute('data-tooltip');
        tooltipEl.classList.add('visible');
        tooltipEl.style.left = e.pageX - tooltipEl.offsetWidth / 2 + 'px';
        tooltipEl.style.top = e.pageY - tooltipEl.offsetHeight - 12 + 'px';
      });
      icon.addEventListener('mousemove', (e) => {
        tooltipEl.style.left = e.pageX - tooltipEl.offsetWidth / 2 + 'px';
        tooltipEl.style.top = e.pageY - tooltipEl.offsetHeight - 12 + 'px';
      });
      icon.addEventListener('mouseleave', () => {
        tooltipEl.classList.remove('visible');
      });
    });

    // Staff: remove player from registrations
    $$('.btn-remove-reg').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.uid;
        showModal(
          'Remove Player',
          'Are you sure you want to remove this player and all his data?',
          () => {
            let users = getUsers();
            users = users.filter(u => u.id !== uid);
            saveUsers(users);
            renderPage(getSession());
          }
        );
      });
    });

    // Admin: toggle role
    $$('.btn-toggle-role').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.uid;
        const role = btn.dataset.role;
        let users = getUsers();
        const user = users.find(u => u.id === uid);
        if (!user) return;
        if (!user.roles) user.roles = [];
        if (user.roles.includes(role)) {
          user.roles = user.roles.filter(r => r !== role);
        } else {
          user.roles.push(role);
        }
        saveUsers(users);
        const session = getSession();
        if (session && session.id === uid) {
          session.roles = user.roles;
          setSession(session);
        }
        renderPage(getSession());
      });
    });

    // Admin: delete user
    $$('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.uid;
        if (!confirm('Delete this user?')) return;
        let users = getUsers();
        users = users.filter(u => u.id !== uid);
        saveUsers(users);
        renderPage(getSession());
      });
    });

    // Admin: reset data
    const resetBtn = $('#btn-reset-data');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!confirm('This will erase ALL data. Are you sure?')) return;
        localStorage.clear();
        sessionStorage.clear();
        seedData();
        navigate();
      });
    }

    // SuperUser: create club
    const createClubBtn = document.getElementById('btn-create-club');
    if (createClubBtn) {
      _loadClubList();
      createClubBtn.addEventListener('click', async () => {
        const nameEl = document.getElementById('new-club-name');
        const emailEl = document.getElementById('new-club-email');
        const badgeEl = document.getElementById('new-club-badge');
        const resultEl = document.getElementById('create-club-result');
        const name = nameEl.value.trim();
        const email = emailEl.value.trim().toLowerCase();
        if (!name || !email) { resultEl.textContent = 'Nom i email obligatoris.'; resultEl.hidden = false; return; }
        createClubBtn.disabled = true;
        createClubBtn.textContent = 'Creant…';
        try {
          const badgeFile = badgeEl.files && badgeEl.files[0] ? badgeEl.files[0] : null;
          const club = await createClub(name, email, badgeFile);
          resultEl.innerHTML = `<span style="color:var(--success);font-weight:600;">Club creat! Codi: <span style="font-family:monospace;font-size:1.1em;letter-spacing:.15em;">${club.code}</span></span>`;
          resultEl.hidden = false;
          nameEl.value = ''; emailEl.value = ''; badgeEl.value = '';
          // If the superuser is also the team lead, auto-join them to this club
          var sess = getSession();
          if (sess && club.leadEmail === (sess.email || '').toLowerCase()) {
            sess.teamId = club.id;
            sess.isTeamLead = true;
            _currentSession = sess;  // update in-memory immediately
            await db.collection('users').doc(sess.id).set({ teamId: club.id, isTeamLead: true }, { merge: true });
            await loadClubConfig(club.id);
            await DB.init(club.id);
          }
          _loadClubList();
          // Re-render settings so "Editar categories" appears
          renderPage(getSession());
        } catch (err) {
          resultEl.textContent = 'Error: ' + err.message;
          resultEl.hidden = false;
          console.error(err);
        }
        createClubBtn.disabled = false;
        createClubBtn.textContent = 'Crear Club';
      });
    }

    // SuperUser / Team Lead / Player: delegated handlers on dashboard-content
    const content = document.getElementById('dashboard-content');
    if (content && !content._settingsBound) {
      content._settingsBound = true;
      content.addEventListener('click', e => {
        // Team Lead: edit categories
        if (e.target.closest('#btn-edit-categories')) {
          showTeamSetup();
          return;
        }
        // SuperUser: copy club code
        const btn = e.target.closest('.btn-copy-code');
        if (btn) {
          const code = btn.dataset.code;
          navigator.clipboard.writeText(code).then(() => {
            btn.textContent = '✓';
            setTimeout(() => { btn.textContent = '📋'; }, 1500);
          }).catch(() => {
            prompt('Copia el codi:', code);
          });
          return;
        }
        // Player: toggle league table visibility
        const toggleBtn = e.target.closest('.league-toggle-btn');
        if (toggleBtn) {
          const lid = toggleBtn.dataset.leagueId;
          var hidden = _getHiddenLeagues();
          var idx = hidden.indexOf(lid);
          if (idx !== -1) hidden.splice(idx, 1);
          else hidden.push(lid);
          _setHiddenLeagues(hidden);
          renderPage(getSession());
        }
      });
    }
  }

  // #endregion Event Bindings

  // #region Init & Bootstrap
  // ---------- Init ----------
  function init() {
    seedData();

    $('#form-login').addEventListener('submit', handleLogin);
    $('#form-register').addEventListener('submit', handleRegister);
    $('#form-profile-setup').addEventListener('submit', handleProfileSetup);
    $('#form-join-club').addEventListener('submit', handleJoinClub);
    $('#btn-join-logout').addEventListener('click', () => auth.signOut());

    // Password eye toggle (hold to show)
    document.querySelectorAll('.pw-eye').forEach(btn => {
      const input = btn.parentElement.querySelector('input');
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); input.type = 'text'; btn.classList.add('pw-eye-active'); });
      btn.addEventListener('mouseup', () => { input.type = 'password'; btn.classList.remove('pw-eye-active'); });
      btn.addEventListener('mouseleave', () => { input.type = 'password'; btn.classList.remove('pw-eye-active'); });
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); input.type = 'text'; btn.classList.add('pw-eye-active'); });
      btn.addEventListener('touchend', () => { input.type = 'password'; btn.classList.remove('pw-eye-active'); });
    });
    $('#profile-pic-input').addEventListener('change', handleProfilePicChange);
    const dobEl = $('#setup-dob');
    dobEl.addEventListener('click', function(e) {
      if (this.selectionStart === this.value.length || !this.value) openDatePicker(this);
    });
    dobEl.addEventListener('input', function() {
      let digits = this.value.replace(/\D/g, '');
      if (digits.length > 8) digits = digits.slice(0, 8);
      let formatted = '';
      if (digits.length > 0) formatted = digits.slice(0, 2);
      if (digits.length >= 3) formatted += '/' + digits.slice(2, 4);
      if (digits.length >= 5) formatted += '/' + digits.slice(4, 8);
      this.value = formatted;
      // Auto-set ISO if complete
      if (digits.length === 8) {
        const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4, 8);
        const iso = yyyy + '-' + mm + '-' + dd;
        const d = new Date(iso + 'T12:00:00');
        if (!isNaN(d.getTime()) && d.getDate() === Number(dd) && d.getMonth() + 1 === Number(mm)) {
          this.dataset.dateIso = iso;
        } else {
          this.dataset.dateIso = '';
        }
      } else {
        this.dataset.dateIso = '';
      }
    });
    dobEl.addEventListener('blur', function() {
      const v = this.value.trim();
      const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) {
        const dd = m[1], mm = m[2], yyyy = m[3];
        const iso = yyyy + '-' + mm + '-' + dd;
        const d = new Date(iso + 'T12:00:00');
        if (!isNaN(d.getTime()) && d.getDate() === Number(dd) && d.getMonth() + 1 === Number(mm)) {
          this.dataset.dateIso = iso;
        }
      }
    });

    $('#go-register').addEventListener('click', (e) => { e.preventDefault(); showView('#view-register'); });
    $('#go-login').addEventListener('click', (e) => { e.preventDefault(); showView('#view-login'); });

    // Regular user: pick one role
    $$('.btn-select-role').forEach(btn => {
      btn.addEventListener('click', () => selectRole(btn.dataset.role));
    });

    // Admin: confirm multi-role selection
    $('#btn-confirm-admin-roles').addEventListener('click', confirmAdminRoles);

    // Nav actions
    $('#btn-logout').addEventListener('click', async () => {
      currentPage = '';
      try { await Push.removeToken(); } catch (e) { console.warn(e); }
      auth.signOut(); // onAuthStateChanged handles cleanup + navigate
    });

    // Logo toggles sidebar on mobile
    const sidebarEl = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const topnavLogo = document.querySelector('.topnav-logo');
    function toggleSidebar() {
      const isOpen = sidebarEl.classList.toggle('open');
      sidebarOverlay.classList.toggle('open', isOpen);
    }
    function closeSidebar() {
      sidebarEl.classList.remove('open');
      sidebarOverlay.classList.remove('open');
    }
    topnavLogo.addEventListener('click', () => {
      if (window.innerWidth <= 600) toggleSidebar();
    });
    sidebarOverlay.addEventListener('click', closeSidebar);

    // ── Registrations: delegated auto-save (survives DOM re-renders) ──
    (function () {
      const content = document.getElementById('dashboard-content');
      if (!content) return;

      function autoSaveFromRow(row) {
        if (!row || !row.dataset.uid) return;
        const uid = row.dataset.uid;
        const statusEl = row.querySelector('.reg-status-select');
        if (!statusEl) return;
        const statusVal = statusEl.value;
        const selPos = Array.from(row.querySelectorAll('.reg-pos-chip.active')).map(c => c.dataset.pos);
        const position = selPos.join(',');
        const numEl = row.querySelector('.reg-number');
        const playerNumber = numEl ? numEl.value.trim() : '';
        const activeTeam = row.querySelector('.reg-team-circle.active');
        const team = activeTeam ? activeTeam.dataset.team : '';
        const catEl = row.querySelector('.reg-cat-select');
        const category = catEl ? catEl.value : '';

        let users = getUsers();
        const user = users.find(u => String(u.id) === String(uid));
        if (!user) return;

        if (statusVal === 'both') user.roles = ['player', 'staff'];
        else if (statusVal === 'player') user.roles = ['player'];
        else if (statusVal === 'staff') user.roles = ['staff'];
        else user.roles = [];

        user.position = position;
        user.playerNumber = playerNumber;
        user.team = team;
        user.category = category;
        saveUsers(users);

        // Sync key fields to Firestore user profile
        if (typeof uid === 'string' && isNaN(Number(uid))) {
          db.collection('users').doc(uid).set({
            roles: user.roles, position: position, playerNumber: playerNumber,
            team: team, category: category
          }, { merge: true }).catch(console.error);
        }

        if (_currentSession && String(_currentSession.id) === String(uid)) {
          _currentSession.roles = user.roles;
          _currentSession.position = position;
          _currentSession.playerNumber = playerNumber;
          _currentSession.team = team;
          _currentSession.category = category;
        }
      }

      // Status select or category select change
      content.addEventListener('change', e => {
        if (e.target.classList.contains('reg-status-select')) {
          autoSaveFromRow(e.target.closest('tr'));
        }
        if (e.target.classList.contains('reg-cat-select')) {
          // Re-render team circles for the new category's letters
          const row = e.target.closest('tr');
          const uid = row.dataset.uid;
          const newCat = e.target.value;
          const teamCell = row.querySelector('.reg-team-cell');
          if (teamCell) {
            teamCell.innerHTML = getTeamLetters(newCat).map(function(l) {
              return '<span class="reg-team-circle" data-uid="' + uid + '" data-team="' + l + '">' + l + '</span>';
            }).join('');
          }
          autoSaveFromRow(row);
        }
      });

      // Player number input
      content.addEventListener('input', e => {
        if (e.target.classList.contains('reg-number')) {
          autoSaveFromRow(e.target.closest('tr'));
        }
      });

      // Team circle + position chip clicks
      content.addEventListener('click', e => {
        const circle = e.target.closest('.reg-team-circle');
        if (circle) {
          const row = circle.closest('tr');
          row.querySelectorAll('.reg-team-circle').forEach(c => c.classList.remove('active'));
          circle.classList.add('active');
          autoSaveFromRow(row);
          return;
        }
        const chip = e.target.closest('.reg-pos-chip');
        if (chip) {
          if (chip.classList.contains('active')) {
            chip.classList.remove('active');
          } else {
            const row = chip.closest('tr');
            if (row.querySelectorAll('.reg-pos-chip.active').length >= 3) {
              const cell = chip.closest('.reg-pos-cell');
              let tip = cell.querySelector('.reg-pos-tip');
              if (!tip) {
                tip = document.createElement('span');
                tip.className = 'reg-pos-tip';
                tip.textContent = 'max. three positions';
                cell.appendChild(tip);
                setTimeout(() => tip.remove(), 1800);
              }
              return;
            }
            chip.classList.add('active');
          }
          autoSaveFromRow(chip.closest('tr'));
        }
      });
    })();

    // ── Tactical board ↔ teams linking (delegated) ──
    (function () {
      const content = document.getElementById('dashboard-content');
      if (!content) return;

      content.addEventListener('click', e => {
        // "Afegir equips" button
        const linkBtn = e.target.closest('.tb-link-teams');
        if (linkBtn) {
          const boardName = linkBtn.dataset.boardName;
          const tdate = linkBtn.dataset.tdate;
          if (!_generatedTeams || !_generatedTeamsDate || _generatedTeamsDate !== tdate) return;
          const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
          const boards = trainingBoards[tdate];
          if (!boards) return;
          const board = boards.find(b => b.name === boardName);
          if (!board) return;
          board.linkedTeams = _generatedTeams.map((team, ti) => ({
            name: 'Equip ' + (ti + 1),
            players: team.map(p => ({ id: p.id, name: p.name, position: p.position || '', team: p.team || '', playerNumber: p.playerNumber || '' }))
          }));
          localStorage.setItem('fa_tactic_training_boards', JSON.stringify(trainingBoards));
          _refreshStdBoards(tdate);
          return;
        }

        // "Remove teams" button
        const unlinkBtn = e.target.closest('.tb-unlink-teams');
        if (unlinkBtn) {
          const boardName = unlinkBtn.dataset.boardName;
          const tdate = unlinkBtn.dataset.tdate;
          const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
          const boards = trainingBoards[tdate];
          if (!boards) return;
          const board = boards.find(b => b.name === boardName);
          if (!board) return;
          delete board.linkedTeams;
          localStorage.setItem('fa_tactic_training_boards', JSON.stringify(trainingBoards));
          _refreshStdBoards(tdate);
          return;
        }
      });
    })();

    // Listen for Firebase Auth state changes (fires on page load + login/logout)
    auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // Only load profile if not already set by handleLogin/handleRegister
        if (!_currentSession || _currentSession.id !== firebaseUser.uid) {
          try {
            const doc = await db.collection('users').doc(firebaseUser.uid).get();
            if (doc.exists) {
              const user = doc.data();
              user.id = firebaseUser.uid;
              user.isAdmin = user.email === ADMIN_EMAIL;
              if (user.isTeamLead === undefined) user.isTeamLead = false;
              if (!user.category) user.category = '';
              _currentSession = user;
              // Auto-match team leads on refresh: if no teamId, check clubs
              if (!user.teamId || user.teamId === 'none' || user.teamId === 'default') {
                try {
                  var leadSnap = await db.collection('clubs').where('leadEmail', '==', (user.email || '').toLowerCase()).limit(1).get();
                  if (!leadSnap.empty) {
                    var leadDoc = leadSnap.docs[0];
                    user.teamId = leadDoc.id;
                    user.isTeamLead = true;
                    _currentSession = user;
                    await db.collection('users').doc(firebaseUser.uid).set({ teamId: leadDoc.id, isTeamLead: true }, { merge: true });
                  }
                } catch (e) { console.error('Auto-match failed:', e); }
              }
              // Update localStorage for compat
              let users = getUsers();
              users = users.filter(u => String(u.id) !== String(user.id) && u.email !== user.email);
              users.push(user);
              saveUsers(users);
            }
          } catch (err) {
            console.error('Failed to load user profile:', err);
          }
        }
        // Sync team data (idempotent if already initialised by form handler)
        if (_currentSession) {
          const tid = _currentSession.teamId;
          if (tid && tid !== 'none' && tid !== 'default') {
            try {
              await loadClubConfig(tid);
              await DB.init(tid);
            } catch (e) { console.error(e); }
          }
          // Initialize push notifications
          Push.init();
          Push.requestPermission().catch(e => console.warn('Push permission:', e));
        }
      } else {
        _currentSession = null;
        _clubConfig = null;
        DB.cleanup();
      }
      navigate();
    });

    // Re-render current page when Firestore pushes remote changes
    // Skip re-render on registrations to avoid losing in-progress edits
    window.addEventListener('firestore-sync', () => {
      if (currentPage === 'registrations') return;
      const s = getSession();
      if (s && s.profileSetupDone && s.roles && s.roles.length) {
        renderPage(s);
      }
    });

    // Handle foreground push notifications — show in-app toast
    window.addEventListener('push-notification', (e) => {
      const { title, body } = e.detail;
      _showPushToast(title, body);
    });

    // Handle push deep-link navigation
    window.addEventListener('push-navigate', (e) => {
      const type = e.detail.type;
      const page = e.detail.page;
      const s = getSession();
      if (!s) return;

      // If the notification includes a specific page, use it directly
      if (page) {
        if (page === 'match-detail' && e.detail.matchId) {
          detailMatchId = Number(e.detail.matchId);
        }
        currentPage = page;
      } else {
        // Fallback: map notification type to page
        if (type === 'convocatoria') {
          const matchId = e.detail.matchId;
          if (matchId) { detailMatchId = Number(matchId); currentPage = 'match-detail'; }
          else { currentPage = 'convocatoria'; }
        } else if (type === 'training_reminder' || type === 'match_avail_reminder') {
          currentPage = 'player-home';
        } else if (type === 'rpe_reminder') {
          currentPage = 'player-actions';
        }
      }
      renderPage(s);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  // #endregion Init & Bootstrap
})();
