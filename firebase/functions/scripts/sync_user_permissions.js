const admin = require('firebase-admin');

// Usage:
// export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
// node firebase/functions/scripts/sync_user_permissions.js
//
// Syncs users.role_permissions based on roles and
// users.tariff_permissions based on company_profile.tariff_permissions.

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function run() {
  const rolesSnap = await db.collection('roles').get();
  const rolesById = new Map();
  rolesSnap.docs.forEach((d) => {
    rolesById.set(d.id, d.data() || {});
  });

  const companyProfilesSnap = await db.collection('company_profile').get();
  const companyTariffs = new Map();
  companyProfilesSnap.docs.forEach((d) => {
    const data = d.data() || {};
    if (data.idCompany) {
      companyTariffs.set(
        data.idCompany.toString(),
        (data.tariff_permissions || []).map((e) => e.toString())
      );
    }
  });

  const usersSnap = await db.collection('users').get();
  let updated = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data() || {};
    const roleId = (data.role_id || '').toString();
    const companyId = (data.idCompany || '').toString();

    const role = rolesById.get(roleId) || {};
    const rolePerms = (role.permissions || []).map((e) => e.toString());
    const tariffPerms = companyTariffs.get(companyId) || [];

    await doc.ref.update({
      role_permissions: rolePerms,
      tariff_permissions: tariffPerms,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    updated += 1;
  }

  console.log(`Synced users: ${updated}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
