const admin = require('firebase-admin');

// Usage:
// 1) export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
// 2) node firebase/functions/scripts/set_company_claims.js
//
// It reads users/{uid}.idCompany and sets auth custom claim companyId.

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function run() {
  const snap = await db.collection('users').get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const companyId = (data.idCompany || '').toString().trim();
    if (!companyId) {
      skipped += 1;
      continue;
    }

    try {
      await admin.auth().getUser(doc.id);
    } catch (err) {
      skipped += 1;
      continue;
    }

    await admin.auth().setCustomUserClaims(doc.id, { companyId });
    updated += 1;
    if (updated % 50 === 0) {
      console.log(`Updated ${updated} users...`);
    }
  }

  console.log(`Done. Updated: ${updated}, skipped: ${skipped}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
