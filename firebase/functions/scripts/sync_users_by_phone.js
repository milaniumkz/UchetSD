const admin = require('firebase-admin');

// Usage:
// export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
// node firebase/functions/scripts/sync_users_by_phone.js
//
// Ensures users/{auth.uid} exists by matching auth users to legacy users docs
// keyed by phone number or field uid.

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function findLegacyUserDoc(phoneNumber) {
  if (!phoneNumber) return null;

  const byId = await db.collection('users').doc(phoneNumber).get();
  if (byId.exists) return byId;

  const byUid = await db
    .collection('users')
    .where('uid', '==', phoneNumber)
    .limit(1)
    .get();
  if (!byUid.empty) return byUid.docs[0];

  const byPhone = await db
    .collection('users')
    .where('phone', '==', phoneNumber)
    .limit(1)
    .get();
  if (!byPhone.empty) return byPhone.docs[0];

  return null;
}

async function run() {
  let pageToken = undefined;
  let created = 0;
  let skipped = 0;
  let linked = 0;

  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    for (const user of result.users) {
      const uid = user.uid;
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        skipped += 1;
        continue;
      }

      const phoneNumber = user.phoneNumber || '';
      const legacyDoc = await findLegacyUserDoc(phoneNumber);
      if (!legacyDoc) {
        skipped += 1;
        continue;
      }

      const legacyData = legacyDoc.data() || {};
      await db
        .collection('users')
        .doc(uid)
        .set(
          {
            ...legacyData,
            auth_uid: uid,
            legacy_user_id: legacyDoc.id,
            phone: legacyData.phone || phoneNumber,
          },
          { merge: true }
        );
      created += 1;
      linked += 1;
    }
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`Done. Created: ${created}, linked: ${linked}, skipped: ${skipped}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
