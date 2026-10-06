const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let db = null;
const BATCH_LIMIT = 350;

function num(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(String(value).replace(',', '.')) || 0;
}

function str(value) {
  return value == null ? '' : String(value).trim();
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

function ledgerScopeFields(raw) {
  const normalized = str(raw).toUpperCase();
  const value = normalized || 'ACCOUNTING';
  return {
    ledger_scope: value,
    ledgerScope: value,
    typeUchet:
      value === 'MANAGEMENT'
        ? 'Up1'
        : value === 'BOTH'
            ? 'Up'
            : 'Bu',
  };
}

function costingMethodFields(raw) {
  const normalized = str(raw).toUpperCase();
  const value = normalized || 'FIFO';
  return {
    costing_method: value,
    costingMethod: value,
  };
}

function buildCogsEntryPayload(legacyId, data) {
  const companyId = str(data.idCompany);
  const saleId = str(data.sale_id);
  const saleItemId = str(data.sale_item_id);
  const productId = str(data.product_id);
  const quantity = num(data.qty ?? data.quantity);
  const totalCost = num(data.total_cost ?? data.totalCost);
  if (!companyId || !saleId || !saleItemId || !productId || quantity <= 0 || totalCost <= 0) {
    return null;
  }

  const ledgerScope = str(data.ledger_scope || data.ledgerScope || data.typeUchet);
  const costingMethod = str(data.costing_method || data.costingMethod);
  const unitCost = num(
    data.unit_cost_applied ?? data.cost_basis_unit_cost ?? data.unit_cost,
  );
  const batchId = str(data.source_batch_id || data.batch_id);

  return {
    legacy_source_id: legacyId,
    legacy_source_collection: 'sale_item_cogs',
    idCompany: companyId,
    item_kind: 'product',
    sale_id: saleId,
    sale_item_id: saleItemId,
    product_id: productId,
    product_name: str(data.product_name),
    warehouse_id: str(data.warehouse_id),
    warehouse_name: str(data.warehouse_name),
    ...ledgerScopeFields(ledgerScope),
    ...costingMethodFields(costingMethod),
    quantity,
    qty: quantity,
    unit_cost: unitCost > 0 ? unitCost : totalCost / quantity,
    cost_basis_unit_cost: unitCost > 0 ? unitCost : totalCost / quantity,
    total_cost: totalCost,
    batch_id: batchId || null,
    source_batch_id: batchId || null,
    created_at: data.created_at || admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildBatchConsumptionPayload(legacyId, data) {
  const companyId = str(data.idCompany);
  const saleId = str(data.sale_id);
  const saleItemId = str(data.sale_item_id);
  const batchId = str(data.source_batch_id || data.batch_id);
  const quantity = num(data.qty ?? data.quantity);
  const totalCost = num(data.total_cost ?? data.totalCost);
  if (!companyId || !saleId || !saleItemId || !batchId || quantity <= 0 || totalCost <= 0) {
    return null;
  }

  const ledgerScope = str(data.ledger_scope || data.ledgerScope || data.typeUchet);
  const unitCost = num(data.unit_cost);

  return {
    legacy_source_id: legacyId,
    legacy_source_collection: 'sale_item_cogs',
    idCompany: companyId,
    sale_id: saleId,
    sale_item_id: saleItemId,
    batch_id: batchId,
    source_batch_id: batchId,
    ...ledgerScopeFields(ledgerScope),
    quantity,
    qty: quantity,
    unit_cost: unitCost > 0 ? unitCost : totalCost / quantity,
    total_cost: totalCost,
    created_at: data.created_at || admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function deterministicId(prefix, legacyId) {
  return `${prefix}_${str(legacyId) || 'unknown'}`;
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
  const db = initializeFirestore(options);

  let query = db.collection('sale_item_cogs');
  if (options.companyId) {
    query = query.where('idCompany', '==', options.companyId);
  }
  const snapshot = await query.get();

  const writes = [];
  let processed = 0;
  let skipped = 0;
  let cogsEntriesUpserted = 0;
  let batchConsumptionsUpserted = 0;

  for (const doc of snapshot.docs) {
    if (options.limit > 0 && processed >= options.limit) break;
    processed += 1;
    const data = doc.data() || {};

    const cogsPayload = buildCogsEntryPayload(doc.id, data);
    if (cogsPayload) {
      cogsEntriesUpserted += 1;
      if (!options.dryRun) {
        writes.push({
          ref: db.collection('cogs_register').doc(deterministicId('legacy_cogs', doc.id)),
          data: cogsPayload,
        });
      }
    }

    const batchPayload = buildBatchConsumptionPayload(doc.id, data);
    if (batchPayload) {
      batchConsumptionsUpserted += 1;
      if (!options.dryRun) {
        writes.push({
          ref: db
            .collection('batch_consumptions')
            .doc(deterministicId('legacy_batch', doc.id)),
          data: batchPayload,
        });
      }
    }

    if (!cogsPayload && !batchPayload) {
      skipped += 1;
    }

    if (!options.dryRun && writes.length >= BATCH_LIMIT) {
      await commitBufferedWrites(writes);
    }
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
        skipped,
        cogsEntriesUpserted,
        batchConsumptionsUpserted,
      },
      null,
      2,
    ),
  );
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
