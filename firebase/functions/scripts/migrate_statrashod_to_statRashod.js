/* eslint-disable no-console */
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

const SOURCE = 'statrashod';
const TARGET = 'statRashod';
const PAGE_SIZE = 500;
const DELETE_SOURCE = process.argv.includes('--delete-source');

async function migratePage(lastDoc) {
  let query = db.collection(SOURCE).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  const snap = await query.get();
  if (snap.empty) {
    return { done: true, lastDoc: null, moved: 0 };
  }

  const batch = db.batch();
  snap.docs.forEach((doc) => {
    const targetRef = db.collection(TARGET).doc(doc.id);
    batch.set(targetRef, doc.data(), { merge: true });
    if (DELETE_SOURCE) {
      batch.delete(doc.ref);
    }
  });

  await batch.commit();
  return {
    done: snap.size < PAGE_SIZE,
    lastDoc: snap.docs[snap.docs.length - 1],
    moved: snap.size,
  };
}

async function run() {
  console.log(`Migrating ${SOURCE} -> ${TARGET}`);
  console.log(`Delete source: ${DELETE_SOURCE ? 'YES' : 'NO'}`);

  let total = 0;
  let lastDoc = null;
  while (true) {
    const res = await migratePage(lastDoc);
    total += res.moved;
    console.log(`Migrated batch: ${res.moved}, total: ${total}`);
    if (res.done) break;
    lastDoc = res.lastDoc;
  }

  console.log(`Done. Total migrated: ${total}`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
