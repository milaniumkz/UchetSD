const admin = require('firebase-admin');
const crypto = require('crypto');

const projectId = process.argv.find((arg) => arg.startsWith('--project='))?.slice(10) ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'uchet-9a732';

const phone = '+77000000000';
const displayPhone = '+7 700 000 00 00';
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

if (!password) {
  console.error('ADMIN_BOOTSTRAP_PASSWORD is required.');
  process.exit(1);
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value || '').trim()).digest('hex');
}

async function ensureAuthUser() {
  try {
    return await admin.auth().getUser(phone);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    return admin.auth().createUser({
      uid: phone,
      phoneNumber: phone,
      displayName: 'Администратор',
    });
  }
}

async function run() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });

  const db = admin.firestore();
  let authUid = phone;
  let authReady = false;
  try {
    const authUser = await ensureAuthUser();
    authUid = authUser.uid;
    authReady = true;
  } catch (error) {
    console.warn(`Auth user was not updated: ${error.code || error.message}`);
  }
  const now = admin.firestore.FieldValue.serverTimestamp();
  const primaryRef = db.collection('users').doc(phone);
  const aliasRef = db.collection('users').doc(displayPhone);
  const [primarySnap, aliasSnap] = await Promise.all([
    primaryRef.get(),
    aliasRef.get(),
  ]);

  const payload = {
    uid: phone,
    display_name: 'Администратор',
    name: 'Администратор',
    phone_number: phone,
    phoneNumber: phone,
    phone: displayPhone,
    role: 'super_admin',
    role_name: 'Администратор',
    is_admin: true,
    admin: true,
    bloc: false,
    password_hash: hashSecret(password),
    password_migrated_at: now,
    force_password_change: false,
    password_change_required: false,
    onboarding_complete: true,
    companyScope: 'all',
    activeCompanyId: '',
    idCompany: '',
    companyIds: [],
    updated_time: now,
    ...(!primarySnap.exists ? {created_time: now} : {}),
  };

  await primaryRef.set(payload, {merge: true});
  await aliasRef.set({
    ...payload,
    uid: phone,
    canonical_uid: phone,
    phone_number: displayPhone,
    phoneNumber: phone,
    ...(!aliasSnap.exists ? {created_time: now} : {}),
  }, {merge: true});

  console.log(JSON.stringify({
    ok: true,
    projectId,
    uid: authUid,
    authReady,
    docs: [phone, displayPhone],
  }, null, 2));
}

run().catch((error) => {
  console.error('upsert_admin_account failed', error);
  process.exitCode = 1;
});
