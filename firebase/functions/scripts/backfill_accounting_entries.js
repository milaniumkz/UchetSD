const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let db = null;
const BATCH_LIMIT = 300;

function str(value) {
  return value == null ? '' : String(value).trim();
}

function num(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(String(value).replace(',', '.')) || 0;
}

function ledgerScopeFromLegacy(raw) {
  const normalized = str(raw).toLowerCase();
  if (normalized === 'up1' || normalized === 'management') return 'MANAGEMENT';
  if (normalized === 'up' || normalized === 'both' || normalized === 'all') {
    return 'BOTH';
  }
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
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--company=')) {
      options.companyId = str(arg.slice('--company='.length));
    } else if (arg.startsWith('--limit=')) {
      options.limit = Math.max(0, Number(arg.slice('--limit='.length)) || 0);
    } else if (arg.startsWith('--project=')) {
      options.projectId = str(arg.slice('--project='.length));
    } else if (arg.startsWith('--service-account=')) {
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

function virtualIncomeAccountId(scope, category) {
  return `virtual:income:${scope}:${str(category) || 'general'}`;
}

function virtualExpenseAccountId(scope, category) {
  return `virtual:expense:${scope}:${str(category) || 'general'}`;
}

function buildEntryPayload(txId, tx) {
  const type = str(tx.type).toLowerCase();
  const companyId = str(tx.idCompany);
  const amount = num(tx.summa || tx.amount);
  const scope = str(tx.ledger_scope || tx.ledgerScope)
    ? str(tx.ledger_scope || tx.ledgerScope)
    : ledgerScopeFromLegacy(tx.typeUchet);
  const accountId = tx.schetId && tx.schetId.id ? tx.schetId.id : str(tx.schet_id);
  const category = str(tx.kat);
  const description = str(tx.text);
  const counterparty = str(tx.counterparty);
  const ndsEnabled = tx.nds === true;
  const taxAmount = num(tx.summaNds);
  const taxRate = amount > 0 && taxAmount > 0 ? taxAmount / amount : 0;

  if (!companyId || !amount || !accountId) return null;

  if (type === 'income' || type === 'доход' || type === 'doxod') {
    return {
      transaction_id: txId,
      source_type: 'transaction',
      source_id: txId,
      entry_date: tx.date || admin.firestore.FieldValue.serverTimestamp(),
      debit_account_id: accountId,
      debit_schet_ref: tx.schetId || null,
      debit_account_title: str(tx.schetTitle),
      credit_account_id: virtualIncomeAccountId(scope, category),
      credit_account_title: category,
      amount,
      currency: 'KZT',
      ledger_scope: scope,
      ledgerScope: scope,
      description,
      memo: counterparty,
      tax_kind: ndsEnabled ? 'vat_output' : null,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      idCompany: companyId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
  }

  if (type === 'decome' || type === 'expense' || type === 'расход' || type === 'rashod') {
    return {
      transaction_id: txId,
      source_type: 'transaction',
      source_id: txId,
      entry_date: tx.date || admin.firestore.FieldValue.serverTimestamp(),
      debit_account_id: virtualExpenseAccountId(scope, category),
      debit_account_title: category,
      credit_account_id: accountId,
      credit_schet_ref: tx.schetId || null,
      credit_account_title: str(tx.schetTitle),
      amount,
      currency: 'KZT',
      ledger_scope: scope,
      ledgerScope: scope,
      description,
      memo: counterparty,
      tax_kind: ndsEnabled ? 'vat_input' : null,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      idCompany: companyId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
  }

  return null;
}

async function commitBufferedWrites(buffer) {
  if (buffer.length === 0) return;
  const batch = db.batch();
  for (const item of buffer) {
    batch.set(item.ref, item.payload);
    batch.update(item.txRef, {
      entry_ids: item.entryIds,
      entries_generated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  buffer.length = 0;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const db = initializeFirestore(options);
  let query = db.collection('tranzaction');
  if (options.companyId) {
    query = query.where('idCompany', '==', options.companyId);
  }
  const snapshot = await query.get();
  const buffer = [];
  let processed = 0;
  let created = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    if (options.limit > 0 && processed >= options.limit) break;
    processed += 1;
    const tx = doc.data() || {};
    const entryIds = Array.isArray(tx.entry_ids) ? tx.entry_ids : [];
    if (entryIds.length > 0) {
      skipped += 1;
      continue;
    }
    const payload = buildEntryPayload(doc.id, tx);
    if (!payload) {
      skipped += 1;
      continue;
    }
    const ref = db.collection('accounting_entries').doc();
    if (!options.dryRun) {
      buffer.push({ ref, payload, txRef: doc.ref, entryIds: [ref.id] });
      if (buffer.length >= BATCH_LIMIT) {
        await commitBufferedWrites(buffer);
      }
    }
    created += 1;
  }

  if (!options.dryRun) {
    await commitBufferedWrites(buffer);
  }

  console.log(
    JSON.stringify(
      {
        mode: options.dryRun ? 'dry-run' : 'write',
        companyId: options.companyId || null,
        processed,
        created,
        skipped,
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
