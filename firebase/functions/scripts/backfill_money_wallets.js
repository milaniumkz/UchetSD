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

function walletTypeFromLegacyTip(tip, ownerKind) {
  const normalized = str(tip).toLowerCase();
  if (normalized === 'bank') return 'BANK_ACCOUNT';
  if (normalized === 'nal' || normalized === 'cash') return 'CASHBOX';
  if (normalized === 'card') return 'CARD';
  if (normalized === 'my') {
    const owner = str(ownerKind).toLowerCase();
    if (owner === 'card') return 'CARD';
    if (owner === 'cash') return 'CASHBOX';
  }
  return 'OTHER';
}

function slugify(raw) {
  const normalized = str(raw)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return normalized || 'wallet';
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
  if (process.env.GOOGLE_CLOUD_PROJECT) return str(process.env.GOOGLE_CLOUD_PROJECT);
  try {
    const firebasercPath = path.resolve(__dirname, '../../.firebaserc');
    const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
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
    const serviceAccount = JSON.parse(
      fs.readFileSync(path.resolve(explicitPath), 'utf8'),
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

async function commitBuffer(buffer) {
  if (buffer.length === 0) return;
  const batch = db.batch();
  for (const item of buffer) {
    batch.set(item.ref, item.payload, { merge: true });
  }
  await batch.commit();
  buffer.length = 0;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const db = initializeFirestore(options);
  let processed = 0;
  let created = 0;
  let skipped = 0;
  const buffer = [];

  let shetaQuery = db.collection('sheta');
  if (options.companyId) {
    shetaQuery = shetaQuery.where('idCompany', '==', options.companyId);
  }
  const shetaSnap = await shetaQuery.get();
  for (const doc of shetaSnap.docs) {
    if (options.limit > 0 && processed >= options.limit) break;
    processed += 1;
    const data = doc.data() || {};
    const walletId = `account_${doc.id}`;
    const payload = {
      name: str(data.title) || 'Счет',
      type: walletTypeFromLegacyTip(data.tip, data.ownerKind),
      ledger_scope: str(data.ledger_scope || data.ledgerScope) || ledgerScopeFromLegacy(data.typeUchet),
      ledgerScope: str(data.ledger_scope || data.ledgerScope) || ledgerScopeFromLegacy(data.typeUchet),
      currency: str(data.currency) || 'KZT',
      is_active: data.isActive !== false,
      isActive: data.isActive !== false,
      opening_balance: num(data.opening_balance || data.openingBalance || data.summa),
      openingBalance: num(data.opening_balance || data.openingBalance || data.summa),
      current_balance: num(data.summa),
      currentBalance: num(data.summa),
      owner_type: 'company',
      ownerType: 'company',
      owner_id: str(data.idCompany),
      ownerId: str(data.idCompany),
      linked_legacy_account_id: doc.id,
      linkedLegacyAccountId: doc.id,
      linked_legacy_card_id: walletTypeFromLegacyTip(data.tip, data.ownerKind) === 'CARD' ? doc.id : null,
      linkedLegacyCardId: walletTypeFromLegacyTip(data.tip, data.ownerKind) === 'CARD' ? doc.id : null,
      legacy_source_key: str(data.tip),
      legacySourceKey: str(data.tip),
      description: str(data.coment),
      notes: str(data.coment),
      idCompany: str(data.idCompany),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!options.dryRun) {
      buffer.push({
        ref: db.collection('money_wallets').doc(walletId),
        payload,
      });
      if (buffer.length >= BATCH_LIMIT) {
        await commitBuffer(buffer);
      }
    }
    created += 1;
  }

  let registerQuery = db.collection('cash_registers');
  if (options.companyId) {
    registerQuery = registerQuery.where('idCompany', '==', options.companyId);
  }
  const registerSnap = await registerQuery.get();
  const latestRegisters = new Map();
  for (const doc of registerSnap.docs) {
    const data = doc.data() || {};
    const companyId = str(data.idCompany);
    const name = str(data.cash_register_name) || 'Касса';
    const scope = str(data.ledger_scope || data.ledgerScope) || ledgerScopeFromLegacy(data.typeUchet);
    const walletId = `cashbox_${companyId}_${slugify(name)}_${scope.toLowerCase()}`;
    const current = latestRegisters.get(walletId);
    const currentTs = current?.updated_at?.toMillis ? current.updated_at.toMillis() : 0;
    const nextTs = data.updated_at?.toMillis ? data.updated_at.toMillis() : 0;
    if (!current || nextTs >= currentTs) {
      latestRegisters.set(walletId, { id: doc.id, ...data });
    }
  }
  for (const [walletId, data] of latestRegisters.entries()) {
    if (options.limit > 0 && processed >= options.limit) break;
    processed += 1;
    const payload = {
      name: str(data.cash_register_name) || 'Касса',
      type: 'CASHBOX',
      ledger_scope: str(data.ledger_scope || data.ledgerScope) || ledgerScopeFromLegacy(data.typeUchet),
      ledgerScope: str(data.ledger_scope || data.ledgerScope) || ledgerScopeFromLegacy(data.typeUchet),
      currency: str(data.currency) || 'KZT',
      is_active: !data.closed_at,
      isActive: !data.closed_at,
      opening_balance: num(data.opening_cash),
      openingBalance: num(data.opening_cash),
      current_balance: num(data.ending_cash),
      currentBalance: num(data.ending_cash),
      owner_type: 'company',
      ownerType: 'company',
      owner_id: str(data.idCompany),
      ownerId: str(data.idCompany),
      linked_legacy_cashbox_id: str(data.id),
      linkedLegacyCashboxId: str(data.id),
      legacy_source_key: slugify(data.cash_register_name),
      legacySourceKey: slugify(data.cash_register_name),
      idCompany: str(data.idCompany),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!options.dryRun) {
      buffer.push({
        ref: db.collection('money_wallets').doc(walletId),
        payload,
      });
      if (buffer.length >= BATCH_LIMIT) {
        await commitBuffer(buffer);
      }
    }
    created += 1;
  }

  if (!options.dryRun) {
    await commitBuffer(buffer);
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
