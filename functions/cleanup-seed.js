const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

(async () => {
  const teams = await db.collection('teams').get();
  for (const team of teams.docs) {
    const tid = team.id;
    const dataCol = db.collection('teams').doc(tid).collection('data');

    const [tSnap, mSnap, uSnap] = await Promise.all([
      dataCol.doc('fa_training').get(),
      dataCol.doc('fa_matches').get(),
      dataCol.doc('fa_users').get()
    ]);

    const trainings = tSnap.exists && tSnap.data().v ? JSON.parse(tSnap.data().v) : [];
    const matches   = mSnap.exists && mSnap.data().v ? JSON.parse(mSnap.data().v) : [];
    const users     = uSnap.exists && uSnap.data().v ? JSON.parse(uSnap.data().v) : [];

    const realDates = new Set(trainings.map(t => t.date));
    const realMatchIds = new Set(matches.map(m => m.id));
    const realUserIds = new Set(users.map(u => String(u.id)));

    // Clean fa_training_availability
    const taSnap = await dataCol.doc('fa_training_availability').get();
    if (taSnap.exists) {
      const data = taSnap.data();
      const deletes = {};
      let count = 0;
      for (const key of Object.keys(data)) {
        if (key === '_migrated' || key === 'v') continue;
        const parts = key.split('_');
        const uid = parts[0];
        const date = parts.slice(1).join('_');
        if (realUserIds.has(uid) === false || realDates.has(date) === false) {
          deletes[key] = admin.firestore.FieldValue.delete();
          count++;
        }
      }
      if (count > 0) {
        await dataCol.doc('fa_training_availability').update(deletes);
        console.log(tid + ': deleted ' + count + ' fake training availability entries');
      } else {
        console.log(tid + ': training availability clean');
      }
    }

    // Clean fa_match_availability
    const maSnap = await dataCol.doc('fa_match_availability').get();
    if (maSnap.exists) {
      const data = maSnap.data();
      const deletes = {};
      let count = 0;
      for (const key of Object.keys(data)) {
        if (key === '_migrated' || key === 'v') continue;
        const parts = key.split('_');
        const uid = parts[0];
        const matchId = parts.slice(1).join('_');
        if (realUserIds.has(uid) === false || realMatchIds.has(matchId) === false) {
          deletes[key] = admin.firestore.FieldValue.delete();
          count++;
        }
      }
      if (count > 0) {
        await dataCol.doc('fa_match_availability').update(deletes);
        console.log(tid + ': deleted ' + count + ' fake match availability entries');
      } else {
        console.log(tid + ': match availability clean');
      }
    }
  }
  console.log('Done!');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
