const admin = require('firebase-admin');

// Usage:
// export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
// node firebase/functions/scripts/backfill_user_company_id.js
//
// Backfills users/{uid}.idCompany by looking up docs that have user_id/uid.

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

const sources = [
  'statRashod',
  'obyaz',
  'nomenklatura',
  'services',
  'suppliers',
  'sales',
  'cashiers',
  'shops',
  'warehouse_movements',
  'company_expenses',
  'user_wallets',
  'user_expenses',
  'activity_log',
  'security_pins',
  'blocked_apps',
  'company_accounts',
];

async function findCompanyIdForUser(uid) {
  for (const col of sources) {
    const snap = await db
      .collection(col)
      .where('user_id', '==', uid)
      .limit(1)
      .get();
    if (!snap.empty) {
      const data = snap.docs[0].data() || {};
      if (data.idCompany) return data.idCompany.toString();
    }

    const snapUid = await db
      .collection(col)
      .where('uid', '==', uid)
      .limit(1)
      .get();
    if (!snapUid.empty) {
      const data = snapUid.docs[0].data() || {};
      if (data.idCompany) return data.idCompany.toString();
    }
  }
  return null;
}

async function run() {
  const usersSnap = await db.collection('users').get();
  let updated = 0;
  let skipped = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data() || {};
    const current = (data.idCompany || '').toString().trim();
    if (current) {
      skipped += 1;
      continue;
    }

    const companyId = await findCompanyIdForUser(doc.id);
    if (!companyId) {
      skipped += 1;
      continue;
    }

    await doc.ref.update({ idCompany: companyId });
    updated += 1;
  }

  console.log(`Done. Updated: ${updated}, skipped: ${skipped}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
