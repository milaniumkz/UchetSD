const admin = require('firebase-admin');

const projectId = process.argv.find((arg) => arg.startsWith('--project='))?.slice(10) ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'uchet-9a732';
const apply = process.argv.includes('--apply');

const DEFAULT_NDS_RATE = 16;
const DEFAULT_KPN_RATE = 20;

function isMissingOrZero(value) {
  if (value === undefined || value === null || value === '') return true;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed === 0;
}

function shouldBackfill(data) {
  return isMissingOrZero(data.nds_rate) || isMissingOrZero(data.kpn_rate);
}

async function run() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
  const db = admin.firestore();
  const snap = await db.collection('company_profile').get();
  const candidates = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (!shouldBackfill(data)) continue;
    const patch = {
      ...(isMissingOrZero(data.nds_rate) ? {nds_rate: DEFAULT_NDS_RATE} : {}),
      ...(isMissingOrZero(data.kpn_rate) ? {kpn_rate: DEFAULT_KPN_RATE} : {}),
      tax_rates_backfilled_at: admin.firestore.FieldValue.serverTimestamp(),
      tax_rates_backfill_source: 'backfill_company_tax_rates_v1',
    };
    candidates.push({
      id: doc.id,
      name: data.nameCompany || data.name_Company || data.company_name || data.name || '',
      before: {
        nds_rate: data.nds_rate ?? null,
        kpn_rate: data.kpn_rate ?? null,
      },
      after: {
        nds_rate: patch.nds_rate ?? data.nds_rate,
        kpn_rate: patch.kpn_rate ?? data.kpn_rate,
      },
      patch,
      ref: doc.ref,
    });
  }

  if (apply) {
    let batch = db.batch();
    let writes = 0;
    const commits = [];
    for (const item of candidates) {
      batch.set(item.ref, item.patch, {merge: true});
      writes += 1;
      if (writes >= 450) {
        commits.push(batch.commit());
        batch = db.batch();
        writes = 0;
      }
    }
    if (writes > 0) commits.push(batch.commit());
    await Promise.all(commits);
  }

  console.log(JSON.stringify({
    ok: true,
    projectId,
    mode: apply ? 'apply' : 'dry-run',
    scanned: snap.size,
    candidates: candidates.length,
    companies: candidates.map((item) => ({
      id: item.id,
      name: item.name,
      before: item.before,
      after: item.after,
    })),
  }, null, 2));
}

run().catch((error) => {
  console.error('backfill_company_tax_rates failed', error);
  process.exitCode = 1;
});
