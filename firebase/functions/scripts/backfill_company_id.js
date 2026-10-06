const admin = require('firebase-admin');

// Usage:
// export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
// node firebase/functions/scripts/backfill_company_id.js
//
// Backfills idCompany for collections using users/{uid}.idCompany

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

const collections = [
  'ushet',
  'sheta',
  'tranzaction',
  'statRashod',
  'obyaz',
  'nomenklatura',
  'services',
  'suppliers',
  'roles',
  'tariffs',
  'sales',
  'sales_items',
  'cashiers',
  'cash_registers',
  'shop_expenses',
  'shops',
  'clients',
  'warehouse_movements',
  'warehouses',
  'batches',
  'company_profile',
  'security_settings',
  'security_pins',
  'blocked_apps',
  'activity_log',
  'data_restore_requests',
  'data_delete_requests',
  'admin_notifications',
  'fin_models',
  'investments',
  'product_portfolio',
  'company_accounts',
  'company_expenses',
  'user_wallets',
  'user_expenses',
  'employees',
  'departments',
];

const userCache = new Map();

async function getCompanyIdByUser(userId) {
  if (!userId) return null;
  if (userCache.has(userId)) return userCache.get(userId);
  const userDoc = await db.collection('users').doc(userId).get();
  const data = userDoc.exists ? userDoc.data() : null;
  const companyId = data && data.idCompany ? data.idCompany.toString() : null;
  userCache.set(userId, companyId);
  return companyId;
}

async function backfillCollection(name) {
  const snap = await db.collection(name).get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.idCompany) {
      skipped += 1;
      continue;
    }

    const userId = (
      data.user_id ||
      data.userId ||
      data.uid ||
      data.ownerId ||
      data.owner_id ||
      data.createdBy ||
      data.created_by ||
      ''
    )
      .toString()
      .trim();
    const companyId = await getCompanyIdByUser(userId);
    if (!companyId) {
      skipped += 1;
      continue;
    }

    await doc.ref.update({ idCompany: companyId });
    updated += 1;
  }

  console.log(`${name}: updated ${updated}, skipped ${skipped}`);
}

async function run() {
  for (const name of collections) {
    await backfillCollection(name);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
