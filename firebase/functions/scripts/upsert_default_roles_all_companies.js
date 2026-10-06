const admin = require('firebase-admin');

// Usage:
// export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
// node firebase/functions/scripts/upsert_default_roles_all_companies.js
//
// Syncs the default role templates from the role specification into:
// 1) role_templates - editable global templates for the admin panel.
// 2) roles - company-scoped roles for every company.
// 3) users/positions - linked role fields where a matching role exists.

const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'uchet-9a732';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

const OWNER_PERMISSIONS = [
  'scheta.manage',
  'scheta.view',
  'scheta.add',
  'scheta.edit',
  'scheta.deactivate',
  'scheta.delete',
  'scheta.withdrawal',
  'scheta.blocks.total',
  'scheta.blocks.bank',
  'scheta.blocks.cash',
  'scheta.blocks.owner',
  'scheta.blocks.list',
  'scheta.blocks.transactions',
  'scheta.blocks.filters',
  'uchet.view',
  'uchet.blocks.summary',
  'uchet.blocks.compare',
  'uchet.blocks.chart',
  'uchet.blocks.insights',
  'tranzaction.view',
  'tranzaction.add',
  'tranzaction.edit',
  'tranzaction.delete',
  'tranzaction.filter',
  'tranzaction.export',
  'money.obligations',
  'money.expense_categories',
  'money.view',
  'money.company',
  'money.company_expenses',
  'warehouse.view',
  'warehouse.add',
  'warehouse.move',
  'warehouse.blocks.list',
  'warehouse.blocks.movements',
  'warehouse.blocks.totals',
  'nomenclature.view',
  'nomenclature.add',
  'nomenclature.edit',
  'nomenclature.delete',
  'nomenclature.blocks.list',
  'nomenclature.blocks.filters',
  'services.view',
  'services.add',
  'services.edit',
  'services.delete',
  'suppliers.view',
  'suppliers.add',
  'suppliers.edit',
  'suppliers.delete',
  'sales.view',
  'sales.shops',
  'sales.cashiers',
  'sales.clients',
  'sales.controls',
  'sales.cash',
  'sales.reports',
  'sales.add',
  'sales.edit',
  'sales.delete',
  'sales.income',
  'sales.expenses',
  'sales.profit.shop',
  'sales.profit.cashier',
  'sales.abc',
  'analytics.view',
  'analytics.sales',
  'analytics.fin',
  'analytics.margin',
  'analytics.invest',
  'analytics.models',
  'analytics.abc',
  'analytics.portfolio',
  'audit.view',
  'company.org',
  'company.hr',
  'company.users',
  'company.roles',
  'security.view',
  'security.block',
  'security.restore',
  'security.delete',
  'money.my',
  'money.my_expenses',
  'settings.view',
  'settings.currency',
  'settings.taxes',
  'settings.calculator',
  'settings.rekviziti',
  'settings.roles',
  'settings.users',
  'settings.tariffs',
];

const DEFAULT_ROLE_TEMPLATES = [
  {
    name: 'Владелец / Директор',
    description: 'Полный доступ ко всем блокам компании и настройкам.',
    permissions: OWNER_PERMISSIONS,
  },
  {
    name: 'Главный бухгалтер',
    description: 'Финансовый контур, счета, транзакции, расходы, долги и отчеты.',
    permissions: [
      'scheta.manage',
      'scheta.view',
      'scheta.add',
      'scheta.edit',
      'scheta.deactivate',
      'scheta.blocks.total',
      'scheta.blocks.bank',
      'scheta.blocks.cash',
      'scheta.blocks.list',
      'scheta.blocks.transactions',
      'scheta.blocks.filters',
      'tranzaction.view',
      'tranzaction.add',
      'tranzaction.edit',
      'tranzaction.delete',
      'tranzaction.filter',
      'tranzaction.export',
      'uchet.view',
      'uchet.blocks.summary',
      'uchet.blocks.compare',
      'uchet.blocks.chart',
      'uchet.blocks.insights',
      'money.view',
      'money.company',
      'money.company_expenses',
      'money.obligations',
      'money.expense_categories',
      'warehouse.view',
      'nomenclature.view',
      'analytics.view',
      'analytics.fin',
      'analytics.margin',
      'analytics.invest',
      'analytics.models',
      'audit.view',
      'settings.view',
      'settings.taxes',
      'settings.rekviziti',
    ],
  },
  {
    name: 'Бухгалтер',
    description: 'Операционный финансовый учет без удаления и экспорта.',
    permissions: [
      'scheta.view',
      'scheta.blocks.bank',
      'scheta.blocks.cash',
      'scheta.blocks.list',
      'scheta.blocks.transactions',
      'tranzaction.view',
      'tranzaction.add',
      'tranzaction.edit',
      'tranzaction.filter',
      'uchet.view',
      'uchet.blocks.summary',
      'money.view',
      'money.company',
      'money.company_expenses',
      'money.obligations',
      'money.expense_categories',
      'warehouse.view',
      'warehouse.move',
      'nomenclature.view',
      'analytics.view',
      'analytics.fin',
      'audit.view',
    ],
  },
  {
    name: 'Кассир',
    description: 'Своя касса, смена, прием оплат и кассовые операции.',
    permissions: [
      'scheta.view',
      'scheta.blocks.cash',
      'tranzaction.view',
      'tranzaction.add',
      'tranzaction.filter',
      'sales.view',
      'sales.cash',
      'audit.view',
    ],
  },
  {
    name: 'Кладовщик',
    description: 'Физическое движение товара, склады и остатки.',
    permissions: [
      'warehouse.view',
      'warehouse.add',
      'warehouse.move',
      'warehouse.blocks.list',
      'warehouse.blocks.movements',
      'warehouse.blocks.totals',
      'nomenclature.view',
      'nomenclature.blocks.list',
      'nomenclature.blocks.filters',
      'suppliers.view',
    ],
  },
  {
    name: 'Продавец / Менеджер по продажам',
    description: 'Продажи, клиенты, услуги и просмотр остатков.',
    permissions: [
      'nomenclature.view',
      'nomenclature.blocks.list',
      'services.view',
      'sales.view',
      'sales.shops',
      'sales.clients',
      'sales.add',
      'sales.edit',
      'money.obligations',
    ],
  },
  {
    name: 'Аналитик / Финансовый директор',
    description: 'Только чтение агрегированной аналитики и отчетов.',
    permissions: [
      'sales.reports',
      'analytics.view',
      'analytics.abc',
      'analytics.fin',
      'analytics.invest',
      'analytics.margin',
      'analytics.models',
      'analytics.portfolio',
      'analytics.sales',
    ],
  },
  {
    name: 'HR / Оргструктура',
    description: 'Сотрудники, штатное расписание и оргструктура.',
    permissions: ['company.hr', 'company.org'],
  },
  {
    name: 'Администратор безопасности',
    description: 'Роли, права доступа, блокировка и восстановление доступа.',
    permissions: [
      'settings.view',
      'settings.roles',
      'settings.users',
      'company.users',
      'company.roles',
      'security.view',
      'security.block',
      'security.restore',
      'security.delete',
    ],
  },
  {
    name: 'Закупщик / Категорийный менеджер',
    description:
      'Закупки, категорийное управление, поставщики, цены закупки и кредиторка.',
    permissions: [
      'warehouse.view',
      'warehouse.add',
      'warehouse.move',
      'warehouse.blocks.list',
      'warehouse.blocks.movements',
      'warehouse.blocks.totals',
      'nomenclature.view',
      'nomenclature.add',
      'nomenclature.edit',
      'nomenclature.blocks.list',
      'nomenclature.blocks.filters',
      'suppliers.view',
      'suppliers.add',
      'suppliers.edit',
      'money.obligations',
      'money.company_expenses',
      'analytics.view',
      'analytics.abc',
      'analytics.portfolio',
    ],
  },
  {
    name: 'Директор магазина',
    description: 'Операционное управление одной торговой точкой.',
    permissions: [
      'warehouse.view',
      'warehouse.move',
      'warehouse.blocks.list',
      'warehouse.blocks.movements',
      'warehouse.blocks.totals',
      'nomenclature.view',
      'nomenclature.blocks.list',
      'sales.view',
      'sales.shops',
      'sales.cashiers',
      'sales.cash',
      'sales.reports',
      'sales.profit.shop',
      'money.obligations',
      'money.expense_categories',
      'analytics.view',
      'analytics.sales',
      'company.hr',
    ],
  },
];

const LEGACY_DEFAULT_ROLE_NAMES = [
  'Владелец',
  'Директор',
  'Глав бух',
  'Коммерческий директор',
  'Руководитель отдела продаж',
  'Продавец',
  'Старший продавец магазина',
  'Кассир магазина',
  'Зав складом',
  'Зав складом магазина',
  'Сотрудник склада',
  'Сотрудник центрального склада',
  'Категорийный менеджер',
  'Менеджер по закупу',
  'HR',
  'Юрист',
  'Финансовый аналитик / директор',
];

const ROLE_NAME_ALIASES = new Map([
  ['владелец', 'Владелец / Директор'],
  ['директор', 'Владелец / Директор'],
  ['глав бух', 'Главный бухгалтер'],
  ['продавец', 'Продавец / Менеджер по продажам'],
  ['категорийный менеджер', 'Закупщик / Категорийный менеджер'],
  ['менеджер по закупу', 'Закупщик / Категорийный менеджер'],
  ['закупщик', 'Закупщик / Категорийный менеджер'],
  ['hr', 'HR / Оргструктура'],
  ['финансовый аналитик / директор', 'Аналитик / Финансовый директор'],
]);

function norm(v) {
  return (v || '').toString().trim();
}

function normKey(v) {
  return norm(v).toLowerCase();
}

function isCompanyId(value) {
  const id = norm(value);
  return id && id !== '__all__' && !id.startsWith('+');
}

function templateDocId(name) {
  return `default_role__${encodeURIComponent(normKey(name))}`;
}

function roleDocId(companyId, name) {
  return `default_role__${encodeURIComponent(norm(companyId))}__${encodeURIComponent(
    normKey(name)
  )}`;
}

function canonicalRoleName(name) {
  return ROLE_NAME_ALIASES.get(normKey(name)) || norm(name);
}

function templateByName(name) {
  const canonical = canonicalRoleName(name);
  return DEFAULT_ROLE_TEMPLATES.find((x) => normKey(x.name) === normKey(canonical));
}

async function collectCompanyIds() {
  const ids = new Set();

  const companiesSnap = await db.collection('companies').get();
  for (const doc of companiesSnap.docs) ids.add(doc.id);

  const profilesSnap = await db.collection('company_profile').get();
  for (const doc of profilesSnap.docs) {
    const data = doc.data() || {};
    const idCompany = norm(data.idCompany || data.companyId);
    if (isCompanyId(idCompany)) ids.add(idCompany);
    if (isCompanyId(doc.id)) ids.add(doc.id);
  }

  const usersSnap = await db.collection('users').get();
  for (const doc of usersSnap.docs) {
    const data = doc.data() || {};
    for (const id of [
      norm(data.idCompany),
      norm(data.activeCompanyId),
      ...(Array.isArray(data.companyIds) ? data.companyIds.map(norm) : []),
    ]) {
      if (isCompanyId(id)) ids.add(id);
    }
  }

  return Array.from(ids).filter(Boolean);
}

async function syncRoleTemplates() {
  const now = serverTimestamp();
  const canonicalIds = new Set();
  let upserted = 0;
  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const id = templateDocId(template.name);
    canonicalIds.add(id);
    await db.collection('role_templates').doc(id).set(
      {
        id,
        type: 'default_role',
        name: template.name,
        description: template.description,
        permissions: template.permissions,
        is_active: true,
        source: 'default_company_roles',
        updated_at: now,
      },
      { merge: true }
    );
    upserted += 1;
  }

  let deactivated = 0;
  const templatesSnap = await db.collection('role_templates').get();
  for (const doc of templatesSnap.docs) {
    const data = doc.data() || {};
    if (canonicalIds.has(doc.id)) continue;
    if (data.source === 'default_company_roles') {
      await doc.ref.set({ is_active: false, updated_at: now }, { merge: true });
      deactivated += 1;
    }
  }
  return { upserted, deactivated };
}

async function upsertRolesForCompany(companyId) {
  const rolesSnap = await db.collection('roles').where('idCompany', '==', companyId).get();
  const byCanonicalName = new Map();
  const duplicateRefs = [];
  const legacyRefs = [];
  const legacyNames = new Set(LEGACY_DEFAULT_ROLE_NAMES.map(normKey));

  for (const doc of rolesSnap.docs) {
    const data = doc.data() || {};
    if (norm(data.type || 'role') !== 'role') continue;
    const rawName = norm(data.name);
    const canonicalName = canonicalRoleName(rawName);
    const canonicalTemplate = templateByName(canonicalName);
    const rawKey = normKey(rawName);

    if (!canonicalTemplate && legacyNames.has(rawKey)) {
      legacyRefs.push(doc.ref);
      continue;
    }
    if (!canonicalTemplate) continue;

    const key = normKey(canonicalTemplate.name);
    if (!byCanonicalName.has(key)) {
      byCanonicalName.set(key, doc);
    } else {
      duplicateRefs.push(doc.ref);
    }
  }

  let created = 0;
  let updated = 0;
  let removed = 0;
  const now = serverTimestamp();

  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const key = normKey(template.name);
    const payload = {
      type: 'role',
      name: template.name,
      description: template.description,
      permissions: template.permissions,
      allowed_company_ids: [companyId],
      idCompany: companyId,
      name_key: key,
      source: 'default_company_roles',
      updated_at: now,
    };

    const existing = byCanonicalName.get(key);
    if (existing) {
      await existing.ref.set(payload, { merge: true });
      updated += 1;
      continue;
    }

    await db
      .collection('roles')
      .doc(roleDocId(companyId, template.name))
      .set({ ...payload, created_at: now }, { merge: true });
    created += 1;
  }

  for (const ref of [...duplicateRefs, ...legacyRefs]) {
    await ref.delete();
    removed += 1;
  }

  return { created, updated, removed };
}

async function syncPositionsForCompany(companyId) {
  const rolesSnap = await db.collection('roles').where('idCompany', '==', companyId).get();
  const rolesById = new Map();
  const rolesByName = new Map();
  for (const doc of rolesSnap.docs) {
    const data = doc.data() || {};
    if (norm(data.type || 'role') !== 'role') continue;
    const role = { id: doc.id, ...data };
    rolesById.set(doc.id, role);
    rolesByName.set(normKey(data.name), role);
  }

  let updated = 0;
  for (const doc of rolesSnap.docs) {
    const data = doc.data() || {};
    if (norm(data.type) !== 'position') continue;
    const roleId = norm(data.role_id || data.linked_role_id);
    const roleName = norm(data.role_name || data.name || data.position);
    const role =
      rolesById.get(roleId) ||
      rolesByName.get(normKey(canonicalRoleName(roleName)));
    if (!role) continue;

    await doc.ref.set(
      {
        role_id: role.id,
        role_name: norm(role.name),
        role_permissions: Array.isArray(role.permissions) ? role.permissions : [],
        role_allowed_company_ids: Array.isArray(role.allowed_company_ids)
          ? role.allowed_company_ids
          : [companyId],
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );
    updated += 1;
  }

  return { updated };
}

async function syncUsersForCompany(companyId) {
  const rolesSnap = await db.collection('roles').where('idCompany', '==', companyId).get();
  const usersSnap = await db.collection('users').where('idCompany', '==', companyId).get();

  const rolesByName = new Map();
  for (const doc of rolesSnap.docs) {
    const data = doc.data() || {};
    if (norm(data.type || 'role') !== 'role') continue;
    rolesByName.set(normKey(data.name), { id: doc.id, ...data });
  }

  let updated = 0;
  for (const doc of usersSnap.docs) {
    const data = doc.data() || {};
    const candidateName = norm(data.role_name || data.position);
    if (!candidateName) continue;

    const role = rolesByName.get(normKey(canonicalRoleName(candidateName)));
    if (!role) continue;

    const roleAllowed = Array.isArray(role.allowed_company_ids)
      ? role.allowed_company_ids
      : [companyId];
    const mergedAllowed = Array.from(
      new Set([companyId, ...roleAllowed.map((x) => norm(x)).filter(Boolean)])
    );

    await doc.ref.set(
      {
        role_id: role.id,
        role_name: norm(role.name),
        role_permissions: Array.isArray(role.permissions) ? role.permissions : [],
        role_allowed_company_ids: mergedAllowed,
        companyIds: mergedAllowed,
        activeCompanyId: companyId,
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );
    updated += 1;
  }

  return { updated };
}

async function run() {
  console.log(`Project: ${PROJECT_ID}`);
  const templates = await syncRoleTemplates();
  const companyIds = await collectCompanyIds();
  console.log(`Companies found: ${companyIds.length}`);
  console.log(
    `Role templates: upserted=${templates.upserted}, deactivated=${templates.deactivated}`
  );

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalRemoved = 0;
  let totalPositionsSynced = 0;
  let totalUsersSynced = 0;

  for (const companyId of companyIds) {
    const upsert = await upsertRolesForCompany(companyId);
    const positions = await syncPositionsForCompany(companyId);
    const users = await syncUsersForCompany(companyId);

    totalCreated += upsert.created;
    totalUpdated += upsert.updated;
    totalRemoved += upsert.removed;
    totalPositionsSynced += positions.updated;
    totalUsersSynced += users.updated;

    console.log(
      `[${companyId}] roles created=${upsert.created}, updated=${upsert.updated}, removed=${upsert.removed}, positions synced=${positions.updated}, users synced=${users.updated}`
    );
  }

  console.log('Done.');
  console.log(
    `Summary: roles created=${totalCreated}, roles updated=${totalUpdated}, roles removed=${totalRemoved}, positions synced=${totalPositionsSynced}, users synced=${totalUsersSynced}`
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
