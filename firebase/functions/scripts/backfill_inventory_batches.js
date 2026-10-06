const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let db = null;
const BATCH_LIMIT = 400;

function num(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(String(value).replace(',', '.')) || 0;
}

function str(value) {
  return value == null ? '' : String(value).trim();
}

function ledgerScopeFromLegacy(raw) {
  const normalized = str(raw).toLowerCase();
  if (normalized === 'up1' || normalized === 'management') return 'MANAGEMENT';
  if (normalized === 'up' || normalized === 'both' || normalized === 'all')
    return 'BOTH';
  return 'ACCOUNTING';
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
    if (arg.startsWith('--service-account=')) {
      options.serviceAccountPath = str(
        arg.slice('--service-account='.length),
      );
      continue;
    }
    if (arg.startsWith('--project=')) {
      options.projectId = str(arg.slice('--project='.length));
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

function buildBackfillPayload({ data, companyId, productId, gapQty, ledgerScope }) {
  const unitCost = num(data.purchase_price || data.cost_price);
  return {
    idCompany: companyId,
    product_id: productId,
    product_name: str(data.name),
    warehouse_id: str(data.warehouse_id || data.warehouse),
    warehouse_name: str(data.warehouse || data.warehouse_name),
    ledger_scope: ledgerScope,
    ledgerScope: ledgerScope,
    typeUchet: str(data.typeUchet || ''),
    qty_initial: gapQty,
    qty_remaining: gapQty,
    unit_cost: unitCost,
    total_cost: gapQty * unitCost,
    received_at: admin.firestore.FieldValue.serverTimestamp(),
    source_document_id: productId,
    source_type: 'legacy_backfill',
    source_doc_type: 'legacy_backfill',
    source_doc_id: productId,
    is_legacy_cache: true,
    is_active: gapQty > 0,
    status: gapQty > 0 ? 'ACTIVE' : 'DEPLETED',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function commitBufferedWrites(buffer) {
  if (buffer.length === 0) return;
  const batch = db.batch();
  for (const item of buffer) {
    batch.set(db.collection('inventory_batches').doc(), item);
  }
  await batch.commit();
  buffer.length = 0;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const db = initializeFirestore(options);
  const query = options.companyId
    ? db.collection('nomenklatura').where('idCompany', '==', options.companyId)
    : db.collection('nomenklatura');
  const products = await query.get();
  const writes = [];
  const touchedCompanies = new Set();
  let created = 0;
  let skipped = 0;
  let processed = 0;

  for (const product of products.docs) {
    if (options.limit > 0 && processed >= options.limit) break;
    processed += 1;
    const data = product.data() || {};
    const companyId = str(data.idCompany);
    const productId = product.id;
    const stock = num(data.stock);
    const purchase = num(data.purchase_price || data.cost_price);
    const warehouseId = str(data.warehouse_id || data.warehouse);
    const warehouseName = str(data.warehouse || data.warehouse_name);
    const ledgerScope = str(data.ledger_scope)
      ? str(data.ledger_scope)
      : ledgerScopeFromLegacy(data.typeUchet || data.accounting_mode);

    if (!companyId || !warehouseId || stock <= 0) {
      skipped += 1;
      continue;
    }

    const existing = await db
      .collection('inventory_batches')
      .where('idCompany', '==', companyId)
      .where('product_id', '==', productId)
      .where('warehouse_id', '==', warehouseId)
      .get();

    const existingQty = existing.docs.reduce(
      (sum, doc) => sum + num((doc.data() || {}).qty_remaining),
      0,
    );

    if (existingQty >= stock - 1e-9) {
      skipped += 1;
      continue;
    }

    const gapQty = stock - existingQty;
    touchedCompanies.add(companyId);
    const payload = buildBackfillPayload({
      data,
      companyId,
      productId,
      gapQty,
      ledgerScope,
    });
    if (!options.dryRun) {
      writes.push(payload);
      if (writes.length >= BATCH_LIMIT) {
        await commitBufferedWrites(writes);
      }
    }
    created += 1;
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
        created,
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
