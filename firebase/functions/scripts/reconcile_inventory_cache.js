const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let db = null;
const BATCH_LIMIT = 400;
const EPS = 1e-9;

function str(value) {
  return value == null ? '' : String(value).trim();
}

function num(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(String(value).replace(',', '.')) || 0;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    companyId: '',
    limit: 0,
    projectId: '',
    serviceAccountPath: '',
  };
  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith('--company=')) {
      options.companyId = str(arg.slice('--company='.length));
      continue;
    }
    if (arg.startsWith('--limit=')) {
      options.limit = Math.max(0, Number(arg.slice('--limit='.length)) || 0);
      continue;
    }
    if (arg.startsWith('--project=')) {
      options.projectId = str(arg.slice('--project='.length));
      continue;
    }
    if (arg.startsWith('--service-account=')) {
      options.serviceAccountPath = str(arg.slice('--service-account='.length));
    }
  }
  return options;
}

function resolveProjectId(options) {
  if (options.projectId) return options.projectId;
  if (process.env.GCLOUD_PROJECT) return str(process.env.GCLOUD_PROJECT);
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    return str(process.env.GOOGLE_CLOUD_PROJECT);
  }
  try {
    const firebasercPath = path.resolve(__dirname, '../../.firebaserc');
    const firebaserc = JSON.parse(
      fs.readFileSync(firebasercPath, { encoding: 'utf8' }),
    );
    return str(firebaserc?.projects?.default);
  } catch (_) {
    return '';
  }
}

function initializeFirestore(options) {
  if (db) return db;

  const projectId = resolveProjectId(options);
  const explicitPath =
    options.serviceAccountPath || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicitPath) {
    const resolvedPath = path.resolve(explicitPath);
    const serviceAccount = JSON.parse(
      fs.readFileSync(resolvedPath, { encoding: 'utf8' }),
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: projectId || serviceAccount.project_id,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: projectId || undefined,
    });
  }

  db = admin.firestore();
  return db;
}

async function commitBufferedWrites(buffer) {
  if (buffer.length === 0) return;
  const batch = db.batch();
  for (const item of buffer) {
    batch.set(item.ref, item.data, { merge: true });
  }
  await batch.commit();
  buffer.length = 0;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const firestore = initializeFirestore(options);
  const productsQuery = options.companyId
    ? firestore.collection('nomenklatura').where('idCompany', '==', options.companyId)
    : firestore.collection('nomenklatura');
  const products = await productsQuery.get();

  const writes = [];
  const touchedCompanies = new Set();
  let processed = 0;
  let updated = 0;
  let skipped = 0;

  for (const product of products.docs) {
    if (options.limit > 0 && processed >= options.limit) break;
    processed += 1;

    const data = product.data() || {};
    const companyId = str(data.idCompany);
    const productId = product.id;
    if (!companyId) {
      skipped += 1;
      continue;
    }

    const batches = await firestore
      .collection('inventory_batches')
      .where('idCompany', '==', companyId)
      .where('product_id', '==', productId)
      .get();

    const qty = batches.docs.reduce(
      (sum, doc) => sum + num((doc.data() || {}).qty_remaining),
      0,
    );
    const value = batches.docs.reduce(
      (sum, doc) =>
        sum +
        num((doc.data() || {}).qty_remaining) *
          num((doc.data() || {}).unit_cost),
      0,
    );
    const averageCost = qty <= EPS ? 0 : value / qty;

    const currentStock = num(data.stock);
    const currentValue = num(data.stock_value);
    const currentPurchase = num(data.purchase_price);

    const stockChanged = Math.abs(currentStock - qty) > EPS;
    const valueChanged = Math.abs(currentValue - value) > EPS;
    const purchaseChanged =
      averageCost > EPS && Math.abs(currentPurchase - averageCost) > EPS;

    if (!stockChanged && !valueChanged && !purchaseChanged) {
      skipped += 1;
      continue;
    }

    touchedCompanies.add(companyId);
    const patch = {
      stock: qty,
      stock_value: value,
      inventory_costing_method: str(
        data.inventory_costing_method || data.costing_method || 'FIFO',
      ) || 'FIFO',
      costing_method:
        str(data.inventory_costing_method || data.costing_method || 'FIFO') ||
        'FIFO',
      updated_time: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (averageCost > EPS) {
      patch.purchase_price = averageCost;
      patch.cost_price = averageCost;
    }

    if (!options.dryRun) {
      writes.push({
        ref: firestore.collection('nomenklatura').doc(productId),
        data: patch,
      });
      if (writes.length >= BATCH_LIMIT) {
        await commitBufferedWrites(writes);
      }
    }
    updated += 1;
  }

  if (!options.dryRun) {
    await commitBufferedWrites(writes);
  }

  console.log(
    JSON.stringify(
      {
        mode: options.dryRun ? 'dry-run' : 'write',
        companyId: options.companyId || null,
        processed,
        updated,
        skipped,
        touchedCompanies: Array.from(touchedCompanies),
      },
      null,
      2,
    ),
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
