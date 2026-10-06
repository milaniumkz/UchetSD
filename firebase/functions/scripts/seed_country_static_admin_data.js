const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function str(value) {
  return value == null ? '' : String(value).trim();
}

function parseArgs(argv) {
  const options = { projectId: '', serviceAccountPath: '' };
  for (const arg of argv) {
    if (arg.startsWith('--project=')) {
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
  return admin.firestore();
}

const now = () => admin.firestore.FieldValue.serverTimestamp();

const commonCurrencies = [
  { id: 'usd', kod: 'USD', title: 'Доллар США', simvol: '$' },
  { id: 'eur', kod: 'EUR', title: 'Евро', simvol: '€' },
  { id: 'rub', kod: 'RUB', title: 'Российский рубль', simvol: '₽' },
];

const countries = [
  {
    code: 'KZ',
    id: 'kazakhstan',
    title: 'Казахстан',
    baseCurrency: 'KZT',
    symbol: '₸',
    identifierLabel: 'БИН',
    profitTaxLabel: 'КПН',
  },
  {
    code: 'TJ',
    id: 'tajikistan',
    title: 'Таджикистан',
    baseCurrency: 'TJS',
    symbol: 'SM',
    identifierLabel: 'ИНН',
    profitTaxLabel: 'Налог на доходы юрлиц',
  },
];

const oced = {
  KZ: [
    ['kz_41', '41', '41 — Строительство зданий'],
    ['kz_46', '46', '46 — Оптовая торговля, кроме авто и мотоциклов'],
    ['kz_47', '47', '47 — Розничная торговля, кроме авто и мотоциклов'],
    ['kz_52', '52', '52 — Складирование и вспомогательная транспортная деятельность'],
    ['kz_56', '56', '56 — Услуги питания и напитков'],
    ['kz_62', '62', '62 — Разработка ПО и ИТ-консалтинг'],
    ['kz_63', '63', '63 — Информационные услуги'],
    ['kz_68', '68', '68 — Операции с недвижимостью'],
    ['kz_69', '69', '69 — Юридические и бухгалтерские услуги'],
    ['kz_70', '70', '70 — Управление компаниями и консультирование'],
    ['kz_73', '73', '73 — Реклама и исследование рынка'],
  ],
  TJ: [
    ['tj_41', '41', '41 — Строительство зданий'],
    ['tj_46', '46', '46 — Оптовая торговля, кроме авто и мотоциклов'],
    ['tj_47', '47', '47 — Розничная торговля, кроме авто и мотоциклов'],
    ['tj_52', '52', '52 — Складирование и вспомогательная транспортная деятельность'],
    ['tj_56', '56', '56 — Услуги питания и напитков'],
    ['tj_62', '62', '62 — Разработка ПО и ИТ-консалтинг'],
    ['tj_63', '63', '63 — Информационные услуги'],
    ['tj_68', '68', '68 — Операции с недвижимостью'],
    ['tj_69', '69', '69 — Юридические и бухгалтерские услуги'],
    ['tj_70', '70', '70 — Управление компаниями и консультирование'],
    ['tj_73', '73', '73 — Реклама и исследование рынка'],
  ],
};

const countryForms = {
  KZ: [
    ['kz_ip', 'ИП'],
    ['kz_too', 'ТОО'],
    ['kz_ao', 'АО'],
    ['kz_filial', 'Филиал'],
  ],
  TJ: [
    ['tj_ip', 'ИП'],
    ['tj_ooo', 'ООО'],
    ['tj_ao', 'АО'],
    ['tj_filial', 'Филиал'],
  ],
};

const taxes = {
  KZ: [
    ['kz_general', 'Общеустановленный режим', 'GENERAL', '20'],
    ['kz_simplified', 'Упрощенная декларация', 'SIMPLIFIED', '3'],
    ['kz_retail', 'Розничный налог', 'RETAIL', '4'],
    ['kz_vat', 'НДС', 'VAT', '16'],
  ],
  TJ: [
    ['tj_general', 'Общий режим', 'GENERAL', '18'],
    ['tj_vat_2026', 'НДС до 31.12.2026', 'VAT', '14'],
    ['tj_vat_2027', 'НДС с 01.01.2027', 'VAT', '13'],
  ],
};

const industries = [
  ['trade', 'Торговля', ['46', '47']],
  ['it_digital', 'ИТ и цифровые услуги', ['62', '63', '73']],
  ['services', 'Профессиональные услуги', ['69', '70']],
  ['horeca', 'HoReCa', ['56']],
  ['logistics', 'Логистика и склад', ['52']],
  ['construction_realty', 'Строительство и недвижимость', ['41', '68']],
];

function addCountryFields(payload, country) {
  return {
    ...payload,
    country: country.title,
    country_code: country.code,
    countryCode: country.code,
    seed_key: `country_static_${country.code.toLowerCase()}_v1`,
    updatedAt: now(),
  };
}

function buildPayloads() {
  const payloads = {
    appSettings: {
      default_currency: 'KZT',
      timezone: 'Asia/Almaty',
      support_email: 'support@uchetsd.kz',
      nds_rate: 16,
      kpn_rate: 20,
      updated_at: now(),
      seed_key: 'country_static_v1',
    },
    country: [],
    valuta: [],
    nalogi: [],
    forma: [],
    oced: [],
    otrasli: [],
  };

  for (const country of countries) {
    payloads.country.push(addCountryFields({
      id: country.id,
      title: country.title,
      valuta: country.baseCurrency,
      base_currency: country.baseCurrency,
      znak: country.symbol,
      currency_symbol: country.symbol,
      identifier_label: country.identifierLabel,
      profit_tax_label: country.profitTaxLabel,
    }, country));

    payloads.valuta.push(addCountryFields({
      id: country.baseCurrency.toLowerCase(),
      kod: country.baseCurrency,
      title: country.baseCurrency === 'KZT' ? 'Казахстанский тенге' : 'Таджикский сомони',
      simvol: country.symbol,
    }, country));
    for (const currency of commonCurrencies) {
      payloads.valuta.push(addCountryFields({
        id: `${currency.id}_${country.code.toLowerCase()}`,
        ...currency,
      }, country));
    }

    for (const [id, title, kod, procent] of taxes[country.code]) {
      payloads.nalogi.push(addCountryFields({ id, title, kod, procent }, country));
    }
    for (const [id, title] of countryForms[country.code]) {
      payloads.forma.push(addCountryFields({ id, title }, country));
    }
    for (const [id, kod, title] of oced[country.code]) {
      payloads.oced.push(addCountryFields({ id, kod, section: kod.slice(0, 1), title }, country));
    }
    for (const [id, title, codes] of industries) {
      const items = oced[country.code]
        .filter(([, kod]) => codes.includes(kod))
        .map(([, , title]) => title);
      payloads.otrasli.push(addCountryFields({
        id: `${id}_${country.code.toLowerCase()}`,
        title,
        oced: items,
      }, country));
    }
  }

  return payloads;
}

async function upsertDocs(db, collectionName, items) {
  const batch = db.batch();
  for (const item of items) {
    const { id, ...payload } = item;
    batch.set(db.collection(collectionName).doc(id), payload, { merge: true });
  }
  await batch.commit();
  return items.length;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const db = initializeFirestore(options);
  const payloads = buildPayloads();

  await db.collection('app_settings').doc('global').set(payloads.appSettings, {
    merge: true,
  });

  const results = {};
  for (const collectionName of ['country', 'valuta', 'nalogi', 'forma', 'oced', 'otrasli']) {
    results[collectionName] = await upsertDocs(
      db,
      collectionName,
      payloads[collectionName],
    );
  }

  console.log(JSON.stringify({
    ok: true,
    projectId: resolveProjectId(options),
    seeded: { app_settings: 1, ...results },
  }, null, 2));
}

run().catch((error) => {
  console.error('seed_country_static_admin_data failed', error);
  process.exitCode = 1;
});
