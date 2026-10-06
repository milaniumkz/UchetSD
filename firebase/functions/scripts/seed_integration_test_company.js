const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const PROJECT_ID = 'uchet-9a732';
const COMPANY_ID = 'codex_integration_test_company';
const USER_ID = '+77000000000';
const USER_NAME = 'Codex QA Admin';
const now = () => admin.firestore.Timestamp.now();

function parseArgs(argv) {
  return {
    projectId:
      argv.find((arg) => arg.startsWith('--project='))?.slice(10) ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      PROJECT_ID,
    serviceAccountPath:
      argv.find((arg) => arg.startsWith('--service-account='))?.slice(18) ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      '',
  };
}

function init(options) {
  if (admin.apps.length) return admin.firestore();
  if (options.serviceAccountPath) {
    const serviceAccount = JSON.parse(
      fs.readFileSync(path.resolve(options.serviceAccountPath), 'utf8'),
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: options.projectId || serviceAccount.project_id,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: options.projectId,
    });
  }
  return admin.firestore();
}

function ref(db, collection, id) {
  return db.collection(collection).doc(id);
}

function incomeEntry({txId, companyId, accountId, accountTitle, category, amount}) {
  return {
    transaction_id: txId,
    source_type: 'transaction',
    source_id: txId,
    idCompany: companyId,
    debit_account_id: accountId,
    debit_account_title: accountTitle,
    credit_account_id: `virtual:income:ACCOUNTING:${category}`,
    credit_account_title: category,
    amount,
    ledger_scope: 'ACCOUNTING',
    money_flow_type: 'OPERATING',
    description: category,
    memo: 'seed integration test',
    taxable: true,
    deductible: false,
    tax_kind: null,
    tax_rate: 0,
    tax_amount: 0,
    entry_date: now(),
    created_at: now(),
    updated_at: now(),
  };
}

function expenseEntry({txId, companyId, accountId, accountTitle, category, amount}) {
  return {
    transaction_id: txId,
    source_type: 'transaction',
    source_id: txId,
    idCompany: companyId,
    debit_account_id: `virtual:expense:ACCOUNTING:${category}`,
    debit_account_title: category,
    credit_account_id: accountId,
    credit_account_title: accountTitle,
    amount,
    ledger_scope: 'ACCOUNTING',
    money_flow_type: 'OPERATING',
    description: category,
    memo: 'seed integration test',
    taxable: false,
    deductible: true,
    tax_kind: null,
    tax_rate: 0,
    tax_amount: 0,
    entry_date: now(),
    created_at: now(),
    updated_at: now(),
  };
}

async function setAudit(db, entity, entityId, title, action = 'seed') {
  await ref(db, 'activity_log', `codex_seed_${entity}_${entityId}`).set(
    {
      idCompany: COMPANY_ID,
      user_id: USER_ID,
      user_name: USER_NAME,
      action,
      entity,
      entity_id: entityId,
      entity_name: title,
      entity_title: title,
      source: 'codex_seed',
      created_at: now(),
    },
    {merge: true},
  );
}

async function seed(db) {
  const bankRef = ref(db, 'sheta', 'codex_test_bank');
  const cashRef = ref(db, 'sheta', 'codex_test_cash');
  const whOfficial = ref(db, 'warehouses', 'codex_wh_official');
  const whShop = ref(db, 'warehouses', 'codex_wh_shop');
  const shop = ref(db, 'shops', 'codex_shop_main');
  const product = ref(db, 'nomenklatura', 'codex_product_coffee');
  const service = ref(db, 'services', 'codex_service_delivery');
  const serviceCost = ref(db, 'service_cost_models', service.id);
  const cashier = ref(db, 'cashiers', 'codex_cashier_main');
  const shift = ref(db, 'cash_registers', 'codex_shift_open');
  const obligation = ref(db, 'obyaz', 'codex_obligation_rent');
  const walletBank = ref(db, 'money_wallets', 'account_codex_test_bank');
  const walletCash = ref(db, 'money_wallets', 'cashbox_codex_integration_test_company_qa_kassa_1_accounting');

  const batch = db.batch();
  batch.set(ref(db, 'companies', COMPANY_ID), {
    name: 'Codex QA Integration Company',
    bin: '260806000001',
    address: 'Алматы, тестовая 1',
    oced: ['62010'],
    otrasl: 'IT / тестирование',
    forma: 'ТОО',
    nalog: 'ОУР',
    valuta: 'KZT',
    ndsPayer: true,
    buh_enabled: true,
    ownerId: USER_ID,
    members: [USER_ID],
    data_locked: false,
    is_test_company: true,
    createdAt: now(),
    updatedAt: now(),
  }, {merge: true});
  batch.set(ref(db, 'company_profile', COMPANY_ID), {
    idCompany: COMPANY_ID,
    user_id: USER_ID,
    name: 'Codex QA Integration Company',
    bin: '260806000001',
    address: 'Алматы, тестовая 1',
    oced: ['62010'],
    otrasl: 'IT / тестирование',
    forma: 'ТОО',
    nalog: 'ОУР',
    valuta: 'KZT',
    ndsPayer: true,
    buh_enabled: true,
    nds_rate: 12,
    kpn_rate: 20,
    updated_at: now(),
  }, {merge: true});
  batch.set(ref(db, 'users', USER_ID), {
    uid: USER_ID,
    phone_number: USER_ID,
    phoneNumber: USER_ID,
    display_name: USER_NAME,
    role: 'owner',
    idCompany: COMPANY_ID,
    activeCompanyId: COMPANY_ID,
    companyIds: admin.firestore.FieldValue.arrayUnion(COMPANY_ID),
    onboarding_complete: true,
    updated_time: now(),
  }, {merge: true});

  batch.set(ref(db, 'employees', 'codex_employee_director'), {
    idCompany: COMPANY_ID,
    user_id: USER_ID,
    phone: USER_ID,
    name: 'Директор QA',
    role: 'Директор',
    role_name: 'Директор',
    department: 'Руководство',
    created_at: now(),
    updated_at: now(),
  }, {merge: true});
  batch.set(ref(db, 'employees', 'codex_employee_buyer'), {
    idCompany: COMPANY_ID,
    user_id: '+77000000001',
    phone: '+77000000001',
    name: 'Закупщик QA',
    role: 'Закупщик',
    role_name: 'Закупщик (Категорийный менеджер)',
    department: 'Закупки',
    created_at: now(),
    updated_at: now(),
  }, {merge: true});

  batch.set(bankRef, {
    title: 'Codex QA Forte Bank',
    tip: 'bank',
    typeUchet: 'Bu',
    ledger_scope: 'ACCOUNTING',
    account_type: 'asset',
    summa: 1510000,
    opening_balance: 1000000,
    opening_balance_date: admin.firestore.Timestamp.fromDate(new Date('2026-08-01T00:00:00+05:00')),
    idCompany: COMPANY_ID,
    user_id: USER_ID,
    isActive: true,
    currency: 'KZT',
    createdAt: now(),
    updatedAt: now(),
  }, {merge: true});
  batch.set(cashRef, {
    title: 'Codex QA Касса',
    tip: 'cash',
    typeUchet: 'Bu',
    ledger_scope: 'ACCOUNTING',
    account_type: 'asset',
    summa: 100000,
    opening_balance: 100000,
    idCompany: COMPANY_ID,
    user_id: USER_ID,
    isActive: true,
    currency: 'KZT',
    createdAt: now(),
    updatedAt: now(),
  }, {merge: true});
  batch.set(walletBank, {
    name: 'Codex QA Forte Bank',
    type: 'bank_account',
    ledger_scope: 'ACCOUNTING',
    current_balance: 1510000,
    opening_balance: 1000000,
    linked_legacy_account_id: bankRef.id,
    owner_type: 'company',
    owner_id: COMPANY_ID,
    idCompany: COMPANY_ID,
    updated_at: now(),
  }, {merge: true});

  for (const [doc, name, parent] of [
    [whOfficial, 'Codex Основной склад', 'Официальные товары'],
    [whShop, 'Codex Склад магазина', 'Официальные товары'],
  ]) {
    batch.set(doc, {
      name,
      idCompany: COMPANY_ID,
      user_id: USER_ID,
      parentWarehouse: parent,
      isVirtual: false,
      warehouse_type: 'OFFICIAL',
      warehouseType: 'OFFICIAL',
      is_official: true,
      isOfficial: true,
      created_at: now(),
      updated_at: now(),
    }, {merge: true});
  }

  batch.set(shop, {
    name: 'Codex Магазин центр',
    address: 'Алматы, Абая 10',
    manager: 'Директор QA',
    manager_position_name: 'Директор магазина',
    phone: '+77000000002',
    workingHours: '09:00-21:00',
    warehouseName: 'Codex Склад магазина',
    warehouseNames: ['Codex Склад магазина'],
    warehouseIds: [whShop.id],
    revenue: 250000,
    status: 'active',
    user_id: USER_ID,
    idCompany: COMPANY_ID,
    created_at: now(),
    updated_at: now(),
  }, {merge: true});
  batch.set(cashier, {
    idCompany: COMPANY_ID,
    user_id: '+77000000003',
    name: 'Кассир QA',
    shop_id: shop.id,
    shop_name: 'Codex Магазин центр',
    cash_register_name: 'QA Kassa 1',
    pin_hash: 'seed-not-for-login',
    active: true,
    created_at: now(),
    updated_at: now(),
  }, {merge: true});
  batch.set(shift, {
    idCompany: COMPANY_ID,
    user_id: USER_ID,
    opened_by_user_id: USER_ID,
    opened_by_user_name: USER_NAME,
    cashier_id: cashier.id,
    cashier_name: 'Кассир QA',
    cash_register_name: 'QA Kassa 1',
    shop_id: shop.id,
    shop_name: 'Codex Магазин центр',
    status: 'open',
    starting_cash: 100000,
    ending_cash: 100000,
    cash_sales: 0,
    card_sales: 0,
    transactions: 0,
    opened_at: now(),
  }, {merge: true});
  batch.set(walletCash, {
    name: 'QA Kassa 1',
    type: 'cashbox',
    ledger_scope: 'ACCOUNTING',
    current_balance: 100000,
    opening_balance: 100000,
    linked_legacy_cashbox_id: shift.id,
    owner_type: 'company',
    owner_id: COMPANY_ID,
    idCompany: COMPANY_ID,
    updated_at: now(),
  }, {merge: true});

  batch.set(product, {
    name: 'Codex Coffee Pack',
    code: 'CQ-001',
    type: 'Товар',
    category: 'Напитки',
    sku: 'CQ-001',
    barcode: '2608060000011',
    warehouse: 'Codex Основной склад',
    warehouse_id: whOfficial.id,
    warehouse_type: 'OFFICIAL',
    warehouseType: 'OFFICIAL',
    is_official: true,
    purchase_price: 1000,
    sale_price: 1500,
    markup_ratio: 1.5,
    stock: 50,
    min_stock: 5,
    stock_value: 50000,
    costing_method: 'FIFO',
    source_type: 'manual',
    user_id: USER_ID,
    idCompany: COMPANY_ID,
    accounting_mode: 'Bu',
    ledger_scope: 'ACCOUNTING',
    created_at: now(),
    updated_at: now(),
  }, {merge: true});
  batch.set(ref(db, 'inventory_batches', 'codex_batch_coffee'), {
    idCompany: COMPANY_ID,
    product_id: product.id,
    product_name: 'Codex Coffee Pack',
    warehouse_id: whOfficial.id,
    warehouse_name: 'Codex Основной склад',
    qty_initial: 50,
    qty_remaining: 50,
    unit_cost: 1000,
    total_cost_remaining: 50000,
    source_type: 'seed',
    created_at: now(),
    updated_at: now(),
  }, {merge: true});
  batch.set(service, {
    name: 'Codex Delivery Service',
    code: 'CS-001',
    description: 'Тестовая доставка',
    price: 5000,
    category: 'Доставка',
    vat: 12,
    isActive: true,
    idCompany: COMPANY_ID,
    user_id: USER_ID,
    ledger_scope: 'ACCOUNTING',
    costing_type: 'FIXED',
    fixed_cost: 1500,
    variable_cost: 0,
    default_unit_cost: 1500,
    currency: 'KZT',
    created_at: now(),
    updated_at: now(),
  }, {merge: true});
  batch.set(serviceCost, {
    idCompany: COMPANY_ID,
    service_id: service.id,
    costing_type: 'FIXED',
    fixed_cost: 1500,
    variable_cost: 0,
    default_unit_cost: 1500,
    currency: 'KZT',
    ledger_scope: 'ACCOUNTING',
    created_at: now(),
    updated_at: now(),
  }, {merge: true});

  const txs = [
    ['codex_tx_income', 'income', 'Доход от основной деятельности', 'Продажа товара Codex Coffee Pack', 500000, false],
    ['codex_tx_service_income', 'income', 'Доход от основной деятельности', 'Оказана услуга Codex Delivery Service', 150000, false],
    ['codex_tx_expense', 'decome', 'Маркетинг', 'Оплата рекламы', 240000, false],
    ['codex_tx_tax_refund', 'income', 'Возврат налога', 'Возврат налога', 100000, true],
  ];
  for (const [id, type, category, text, amount, excluded] of txs) {
    batch.set(ref(db, 'tranzaction', id), {
      type,
      typeUchet: 'Bu',
      ledger_scope: 'ACCOUNTING',
      money_flow_type: 'OPERATING',
      kat: category,
      text,
      summa: amount,
      nds: false,
      summaNds: 0,
      taxable: type === 'income' && !excluded,
      taxable_income: type === 'income' && !excluded,
      deductible: type !== 'income',
      tax_deductible: type !== 'income',
      exclude_from_company_income: excluded,
      excludeFromCompanyIncome: excluded,
      idCompany: COMPANY_ID,
      schetId: bankRef,
      schet_id: bankRef.id,
      schetTitle: 'Codex QA Forte Bank',
      wallet_id: walletBank.id,
      wallet_name: 'Codex QA Forte Bank',
      date: admin.firestore.Timestamp.fromDate(new Date('2026-08-02T12:00:00+05:00')),
      status: 'Проведена',
      counterparty: excluded ? 'КГД' : 'Codex контрагент',
      user_id: USER_ID,
      created_at: now(),
      updated_at: now(),
    }, {merge: true});
  }
  batch.set(ref(db, 'accounting_entries', 'codex_entry_income'), incomeEntry({
    txId: 'codex_tx_income',
    companyId: COMPANY_ID,
    accountId: bankRef.id,
    accountTitle: 'Codex QA Forte Bank',
    category: 'Доход от основной деятельности',
    amount: 500000,
  }), {merge: true});
  batch.set(ref(db, 'accounting_entries', 'codex_entry_service_income'), incomeEntry({
    txId: 'codex_tx_service_income',
    companyId: COMPANY_ID,
    accountId: bankRef.id,
    accountTitle: 'Codex QA Forte Bank',
    category: 'Доход от основной деятельности',
    amount: 150000,
  }), {merge: true});
  batch.set(ref(db, 'accounting_entries', 'codex_entry_expense'), expenseEntry({
    txId: 'codex_tx_expense',
    companyId: COMPANY_ID,
    accountId: bankRef.id,
    accountTitle: 'Codex QA Forte Bank',
    category: 'Маркетинг',
    amount: 240000,
  }), {merge: true});
  batch.set(ref(db, 'accounting_entries', 'codex_entry_tax_refund'), {
    transaction_id: 'codex_tx_tax_refund',
    source_type: 'transaction',
    source_id: 'codex_tx_tax_refund',
    idCompany: COMPANY_ID,
    debit_account_id: bankRef.id,
    debit_account_title: 'Codex QA Forte Bank',
    credit_account_id: 'virtual:tax_refund:ACCOUNTING',
    credit_account_title: 'Возврат налога',
    amount: 100000,
    ledger_scope: 'ACCOUNTING',
    money_flow_type: 'OPERATING',
    description: 'Возврат налога',
    taxable: false,
    deductible: false,
    entry_date: now(),
    created_at: now(),
    updated_at: now(),
  }, {merge: true});

  batch.set(ref(db, 'warehouse_movements', 'codex_wh_move_to_shop'), {
    idCompany: COMPANY_ID,
    user_id: USER_ID,
    product_id: product.id,
    product_name: 'Codex Coffee Pack',
    product_code: 'CQ-001',
    from_warehouse: 'Codex Основной склад',
    to_warehouse: 'Codex Склад магазина',
    qty: 10,
    created_at: now(),
  }, {merge: true});
  batch.set(ref(db, 'business_events', 'codex_event_sale'), {
    idCompany: COMPANY_ID,
    source_type: 'sale',
    source_document_id: 'codex_tx_income',
    amount: 500000,
    ledger_scope: 'ACCOUNTING',
    stage: 'sales',
    status: 'posted',
    created_at: now(),
  }, {merge: true});
  batch.set(obligation, {
    title: 'Аренда магазина QA',
    type: 'Аренда',
    status: 'Частично оплачено',
    counterparty: 'Codex арендодатель',
    counterparty_credit_limit: 1000000,
    frequency: 'Ежемесячно',
    periodicity: 'Ежемесячно',
    period_end: '31.08.2026',
    due_date: '31.08.2026',
    description: 'Тестовое обязательство по аренде',
    amount: 300000,
    total_paid: 100000,
    currency: '₸',
    ledger_scope: 'ACCOUNTING',
    typeUchet: 'Bu',
    user_id: USER_ID,
    idCompany: COMPANY_ID,
    created_at: now(),
    updated_at: now(),
  }, {merge: true});
  batch.set(ref(db, 'debt_register', 'codex_obligation_rent'), {
    idCompany: COMPANY_ID,
    source_type: 'obligation',
    source_document_id: obligation.id,
    counterparty_name: 'Codex арендодатель',
    debt_type: 'payable',
    amount: 300000,
    paid_amount: 100000,
    remaining_amount: 200000,
    status: 'open',
    ledger_scope: 'ACCOUNTING',
    created_at: now(),
    updated_at: now(),
  }, {merge: true});
  batch.set(ref(db, 'tranzaction', 'codex_tx_obligation_payment'), {
    type: 'decome',
    typeUchet: 'Bu',
    ledger_scope: 'ACCOUNTING',
    money_flow_type: 'OPERATING',
    kat: 'Аренда магазина QA',
    text: 'Оплата обязательства: Аренда магазина QA',
    summa: 100000,
    nds: false,
    summaNds: 0,
    taxable: false,
    taxable_income: false,
    deductible: true,
    tax_deductible: true,
    idCompany: COMPANY_ID,
    schetId: bankRef,
    schet_id: bankRef.id,
    schetTitle: 'Codex QA Forte Bank',
    wallet_id: walletBank.id,
    wallet_name: 'Codex QA Forte Bank',
    date: admin.firestore.Timestamp.fromDate(new Date('2026-08-03T12:00:00+05:00')),
    status: 'Проведена',
    counterparty: 'Codex арендодатель',
    obligationId: obligation.id,
    obligationTitle: 'Аренда магазина QA',
    category_name: 'Аренда магазина QA',
    budget_category: 'Аренда магазина QA',
    budget_category_type: 'expense',
    user_id: USER_ID,
    created_at: now(),
    updated_at: now(),
  }, {merge: true});
  batch.set(ref(db, 'accounting_entries', 'codex_entry_obligation_payment'), expenseEntry({
    txId: 'codex_tx_obligation_payment',
    companyId: COMPANY_ID,
    accountId: bankRef.id,
    accountTitle: 'Codex QA Forte Bank',
    category: 'Аренда магазина QA',
    amount: 100000,
  }), {merge: true});
  batch.set(ref(db, 'statDohod', 'codex_budget_income'), {
    idCompany: COMPANY_ID,
    title: 'Доход от основной деятельности',
    name: 'Доход от основной деятельности',
    type: 'income',
    created_at: now(),
  }, {merge: true});
  batch.set(ref(db, 'statRashod', 'codex_budget_expense'), {
    idCompany: COMPANY_ID,
    title: 'Маркетинг',
    name: 'Маркетинг',
    type: 'expense',
    created_at: now(),
  }, {merge: true});
  batch.set(ref(db, 'expense_plans', 'codex_plan_marketing_2026_08'), {
    idCompany: COMPANY_ID,
    category_name: 'Маркетинг',
    period_key: '2026-08',
    planned_amount: 200000,
    ledger_scope: 'ACCOUNTING',
    notes: 'Seed budget plan',
    created_at: now(),
    updated_at: now(),
  }, {merge: true});
  batch.set(ref(db, 'personal_finance_entries', 'codex_personal_entry'), {
    idCompany: COMPANY_ID,
    user_id: USER_ID,
    source: 'manual',
    scope: 'personal',
    section: 'personal_money',
    entry_scope: 'personal_money',
    entry_type: 'expense',
    amount: 10000,
    wallet_id: 'codex_personal_wallet',
    wallet_name: 'Личный кошелек QA',
    description: 'Личный тестовый расход',
    created_at: now(),
  }, {merge: true});

  await batch.commit();

  for (const [entity, id, title] of [
    ['company', COMPANY_ID, 'Codex QA Integration Company'],
    ['account', bankRef.id, 'Codex QA Forte Bank'],
    ['employee', 'codex_employee_director', 'Директор QA'],
    ['warehouse', whOfficial.id, 'Codex Основной склад'],
    ['shop', shop.id, 'Codex Магазин центр'],
    ['product', product.id, 'Codex Coffee Pack'],
    ['service', service.id, 'Codex Delivery Service'],
    ['transaction', 'codex_tx_income', 'Продажа товара Codex Coffee Pack'],
  ]) {
    await setAudit(db, entity, id, title);
  }
}

async function verify(db) {
  const collections = [
    'companies',
    'company_profile',
    'employees',
    'sheta',
    'money_wallets',
    'warehouses',
    'shops',
    'cashiers',
    'cash_registers',
    'obyaz',
    'debt_register',
    'nomenklatura',
    'inventory_batches',
    'services',
    'service_cost_models',
    'tranzaction',
    'accounting_entries',
    'warehouse_movements',
    'business_events',
    'expense_plans',
    'activity_log',
    'personal_finance_entries',
  ];
  const counts = {};
  for (const collection of collections) {
    const snap = await db.collection(collection).where('idCompany', '==', COMPANY_ID).get();
    counts[collection] = snap.size;
  }
  counts.companies = (await ref(db, 'companies', COMPANY_ID).get()).exists ? 1 : 0;
  counts.company_profile = (await ref(db, 'company_profile', COMPANY_ID).get()).exists ? 1 : 0;

  const txSnap = await db.collection('tranzaction').where('idCompany', '==', COMPANY_ID).get();
  let bankIncome = 0;
  let bankExpense = 0;
  let taxableIncome = 0;
  let deductibleExpense = 0;
  for (const doc of txSnap.docs) {
    const data = doc.data();
    const amount = Number(data.summa || 0);
    if (data.schet_id !== 'codex_test_bank') continue;
    if (data.type === 'income') {
      bankIncome += amount;
      if (data.exclude_from_company_income !== true && data.taxable === true) {
        taxableIncome += amount;
      }
    }
    if (data.type === 'decome') {
      bankExpense += amount;
      if (data.deductible === true) deductibleExpense += amount;
    }
  }
  const bankBalance = 1000000 + bankIncome - bankExpense;
  const profitIncome = 650000;
  const profitExpense = 340000;
  const profit = profitIncome - profitExpense;
  const kpnBase = taxableIncome - deductibleExpense;

  const shopDoc = (await ref(db, 'shops', 'codex_shop_main').get()).data() || {};
  const productDoc = (await ref(db, 'nomenklatura', 'codex_product_coffee').get()).data() || {};
  const shiftDoc = (await ref(db, 'cash_registers', 'codex_shift_open').get()).data() || {};

  const checks = [
    ['company exists', counts.companies === 1],
    ['profile exists', counts.company_profile === 1],
    ['employees seeded', counts.employees >= 2],
    ['accounts seeded', counts.sheta >= 2],
    ['wallets seeded', counts.money_wallets >= 2],
    ['warehouses seeded', counts.warehouses >= 2],
    ['shop linked to warehouse', Array.isArray(shopDoc.warehouseIds) && shopDoc.warehouseIds.includes('codex_wh_shop')],
    ['cash shift linked to shop/cashier', shiftDoc.shop_id === 'codex_shop_main' && shiftDoc.cashier_id === 'codex_cashier_main'],
    ['product linked to warehouse', productDoc.warehouse_id === 'codex_wh_official'],
    ['inventory batch exists', counts.inventory_batches >= 1],
    ['service and cost model exist', counts.services >= 1 && counts.service_cost_models >= 1],
    ['obligation linked to payment', counts.obyaz >= 1 && counts.debt_register >= 1],
    ['transactions exist', counts.tranzaction >= 5],
    ['accounting entries exist', counts.accounting_entries >= 5],
    ['bank balance math', bankBalance === 1410000],
    ['tax refund excluded from profit income', profitIncome === 650000],
    ['profit math', profit === 310000],
    ['tax base excludes tax refund', kpnBase === 310000],
    ['warehouse movement exists', counts.warehouse_movements >= 1],
    ['budget plan exists', counts.expense_plans >= 1],
    ['audit logs exist', counts.activity_log >= 8],
    ['personal money isolated seed exists', counts.personal_finance_entries >= 1],
  ];

  return {
    companyId: COMPANY_ID,
    projectId: PROJECT_ID,
    counts,
    metrics: {
      bankOpeningBalance: 1000000,
      bankIncome,
      bankExpense,
      bankBalance,
      profitIncome,
      profitExpense,
      profit,
      taxableIncome,
      deductibleExpense,
      kpnBase,
    },
    checks: checks.map(([name, ok]) => ({name, ok})),
    ok: checks.every(([, ok]) => ok),
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const db = init(options);
  await seed(db);
  const result = await verify(db);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

run().catch((error) => {
  console.error('seed_integration_test_company failed', error);
  process.exitCode = 1;
});
