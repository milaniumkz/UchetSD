const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

function normalizePhone(value) {
  return String(value || "").trim();
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex");
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value
      .map((item) => String(item || "").trim())
      .filter(Boolean))];
}

const AUDITED_COLLECTIONS = new Set([
  "companies",
  "company_profile",
  "users",
  "sheta",
  "scheta",
  "tranzaction",
  "accounting_entries",
  "balance_manual_values",
  "nomenklatura",
  "items",
  "nomenclature_categories",
  "warehouse_movements",
  "warehouses",
  "inventory_batches",
  "inventory_reservations",
  "batch_consumptions",
  "sale_item_cogs",
  "cogs_register",
  "shops",
  "cashiers",
  "employees",
  "staff_schedule",
  "roles",
  "role_templates",
  "obyaz",
  "statRashod",
  "expense_categories",
  "expense_plans",
  "company_expenses",
  "shop_expenses",
  "ushet",
  "money_wallets",
  "user_wallets",
  "cash_registers",
  "cash_register_incassations",
  "sales",
  "sales_items",
  "sales_orders",
  "customer_orders",
  "customer_order_items",
  "shipments",
  "order_payments",
  "service_categories",
  "service_cost_models",
  "service_executions",
  "services",
  "clients",
  "suppliers",
  "debt_register",
  "debt_payment_links",
  "batches",
  "business_events",
  "taxes",
  "security_settings",
  "security_pins",
  "blocked_apps",
  "devices",
  "device_commands",
  "security_logs",
  "data_restore_requests",
  "data_delete_requests",
  "admin_notifications",
  "support_tickets",
  "billing_invoices",
  "tariffs",
  "app_settings",
  "fin_models",
  "investments",
  "marketing_campaigns",
  "country",
  "valuta",
  "currencies",
  "oced",
  "nalogi",
  "otrasli",
  "forma",
  "audit_1c_sync_settings",
  "audit_1c_runs",
]);

function auditHash(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function auditTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function sanitizeAuditValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof admin.firestore.Timestamp) return value;
  if (value instanceof admin.firestore.DocumentReference) return value.path;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeAuditValue(item));
  }
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("password") ||
        lower.includes("pin") ||
        lower.includes("token") ||
        lower.includes("secret")
      ) {
        continue;
      }
      const clean = sanitizeAuditValue(item);
      if (clean !== undefined) result[key] = clean;
    }
    return result;
  }
  return value;
}

function auditCompanyId(collectionId, documentId, before, after) {
  if (collectionId === "companies") {
    return documentId;
  }
  if (collectionId === "company_profile") {
    return String(
        after.idCompany ||
        before.idCompany ||
        after.companyId ||
        before.companyId ||
        after.company_id ||
        before.company_id ||
        after.id_company ||
        before.id_company ||
        documentId ||
        "",
    ).trim();
  }
  return String(
      after.idCompany ||
      before.idCompany ||
      after.companyId ||
      before.companyId ||
      after.company_id ||
      before.company_id ||
      after.id_company ||
      before.id_company ||
      after.activeCompanyId ||
      before.activeCompanyId ||
      (Array.isArray(after.allowed_company_ids) ? after.allowed_company_ids[0] : "") ||
      (Array.isArray(before.allowed_company_ids) ? before.allowed_company_ids[0] : "") ||
      (Array.isArray(after.companyIds) ? after.companyIds[0] : "") ||
      (Array.isArray(before.companyIds) ? before.companyIds[0] : "") ||
      "",
  ).trim();
}

function auditActor(data) {
  const actor = {
    user_id: String(
        data.user_id ||
        data.userId ||
        data.uid ||
        data.created_by ||
        data.createdBy ||
        data.updated_by ||
        data.updatedBy ||
        data.cashier_id ||
        data.ownerId ||
        "",
    ).trim(),
    user_name: String(
        data.user_name ||
        data.userName ||
        data.display_name ||
        data.nameUser ||
        data.created_by_name ||
        data.updated_by_name ||
        data.cashier_name ||
        "",
    ).trim(),
    user_phone: String(
        data.user_phone ||
        data.phone_number ||
        data.phoneNumber ||
        "",
    ).trim(),
  };
  if (!actor.user_id && !actor.user_name && !actor.user_phone) {
    return {
      user_id: "system",
      user_name: "Системный процесс",
      user_phone: "",
    };
  }
  return actor;
}

function auditTitle(collectionId, data, documentId) {
  return String(
      data.title ||
      data.nameCompany ||
      data.name_Company ||
      data.company_name ||
      data.name ||
      data.display_name ||
      data.category_name ||
      data.product_name ||
      data.counterparty ||
      data.text ||
      data.schetTitle ||
      data.role_name ||
      data.roleName ||
      documentId,
  ).trim();
}

function auditDiff(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diff = {};
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (
      lower.includes("password") ||
      lower.includes("pin") ||
      lower.includes("token") ||
      lower.includes("secret")
    ) {
      continue;
    }
    const oldValue = JSON.stringify(sanitizeAuditValue(before[key]) ?? null);
    const newValue = JSON.stringify(sanitizeAuditValue(after[key]) ?? null);
    if (oldValue !== newValue) {
      diff[key] = {
        before: sanitizeAuditValue(before[key]) ?? null,
        after: sanitizeAuditValue(after[key]) ?? null,
      };
    }
  }
  return diff;
}

const ACCOUNT_RECOMPUTE_FIELDS = new Set([
  "summa",
  "opening_balance",
  "openingBalance",
  "account_type",
  "accountType",
  "debit_turnover",
  "credit_turnover",
  "balance_recomputed_at",
  "balance_recomputed_source",
]);

function affectedKeys(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => {
    const oldValue = JSON.stringify(sanitizeAuditValue((before || {})[key]) ?? null);
    const newValue = JSON.stringify(sanitizeAuditValue((after || {})[key]) ?? null);
    return oldValue !== newValue;
  });
}

function isOnlyAccountRecomputeWrite(before, after) {
  const changed = affectedKeys(before, after);
  return changed.length > 0 && changed.every((key) => ACCOUNT_RECOMPUTE_FIELDS.has(key));
}

function numValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function accountOpeningBalance(account, debit, credit) {
  if (account.opening_balance !== undefined || account.openingBalance !== undefined) {
    return numValue(account.opening_balance ?? account.openingBalance);
  }
  const current = numValue(account.summa ?? account.balance ?? account.total);
  const nature = accountNatureFromAccount(account);
  const net = closingBalanceForNature(nature, 0, debit, credit);
  return current - net;
}

function accountNatureFromAccount(account) {
  const raw = String(account.account_type || account.accountType || "").trim().toLowerCase();
  if (["asset", "liability", "equity", "income", "expense"].includes(raw)) {
    return raw;
  }
  const tip = String(account.tip || "").trim().toLowerCase();
  if (tip === "my") return "equity";
  return "asset";
}

function closingBalanceForNature(nature, opening, debit, credit) {
  if (nature === "liability" || nature === "equity" || nature === "income") {
    return opening - debit + credit;
  }
  return opening + debit - credit;
}

function toJsDate(value) {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isBeforeOpeningBalanceDate(entry, account) {
  const openingDate = toJsDate(account.opening_balance_date || account.openingBalanceDate);
  if (!openingDate) return false;
  const entryDate = toJsDate(entry.entry_date || entry.entryDate || entry.date || entry.created_at);
  if (!entryDate) return false;
  const entryDay = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
  const openingDay = new Date(openingDate.getFullYear(), openingDate.getMonth(), openingDate.getDate());
  return entryDay < openingDay;
}

async function recomputeAccountBalancesForCompany(companyId) {
  const cid = String(companyId || "").trim();
  if (!cid) return null;
  const db = admin.firestore();
  const [accountsSnap, entriesSnap] = await Promise.all([
    db.collection("sheta").where("idCompany", "==", cid).get(),
    db.collection("accounting_entries").where("idCompany", "==", cid).get(),
  ]);
  if (accountsSnap.empty) return null;

  const entries = entriesSnap.docs.map((doc) => doc.data() || {});

  let batch = db.batch();
  let writes = 0;
  const commits = [];
  accountsSnap.forEach((doc) => {
    const account = doc.data() || {};
    let debit = 0;
    let credit = 0;
    for (const entry of entries) {
      const amount = numValue(entry.amount);
      if (amount <= 0 || isBeforeOpeningBalanceDate(entry, account)) continue;
      const debitId = String(entry.debit_account_id || entry.debitAccountId || "").trim();
      const creditId = String(entry.credit_account_id || entry.creditAccountId || "").trim();
      if (debitId === doc.id) debit += amount;
      if (creditId === doc.id) credit += amount;
    }
    const opening = accountOpeningBalance(account, debit, credit);
    const nature = accountNatureFromAccount(account);
    const closing = closingBalanceForNature(nature, opening, debit, credit);
    batch.set(doc.ref, {
      summa: closing,
      opening_balance: opening,
      openingBalance: opening,
      account_type: nature,
      accountType: nature,
      debit_turnover: debit,
      credit_turnover: credit,
      balance_recomputed_at: admin.firestore.FieldValue.serverTimestamp(),
      balance_recomputed_source: "accounting_entries_trigger",
    }, {merge: true});
    writes += 1;
    if (writes >= 450) {
      commits.push(batch.commit());
      batch = db.batch();
      writes = 0;
    }
  });
  if (writes > 0) commits.push(batch.commit());
  await Promise.all(commits);
  return {accounts: accountsSnap.size, entries: entriesSnap.size};
}

async function findUserDocByPhone(phone) {
  if (String(phone || "").includes("@")) {
    const email = String(phone || "").trim().toLowerCase();
    const byEmail = await admin.firestore()
        .collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();
    if (byEmail.docs[0]) {
      return byEmail.docs[0];
    }
    const directEmailRef = admin.firestore().collection("users").doc(email);
    const directEmailSnap = await directEmailRef.get();
    if (directEmailSnap.exists) {
      return directEmailSnap;
    }
  }

  const directRef = admin.firestore().collection("users").doc(phone);
  const directSnap = await directRef.get();
  if (directSnap.exists) {
    return directSnap;
  }

  const byPhone = await admin.firestore()
      .collection("users")
      .where("phone_number", "==", phone)
      .limit(1)
      .get();
  if (byPhone.docs[0]) {
    return byPhone.docs[0];
  }

  const targetDigits = normalizePhoneDigits(phone);
  if (!targetDigits) {
    return null;
  }

  const allUsers = await admin.firestore().collection("users").get();
  for (const doc of allUsers.docs) {
    const data = doc.data() || {};
    const candidates = [
      doc.id,
      data.uid,
      data.phone_number,
      data.phoneNumber,
    ];
    if (candidates.some((candidate) => normalizePhoneDigits(candidate) === targetDigits)) {
      return doc;
    }
  }

  return null;
}

async function resolveCanonicalUid(userDoc, phone) {
  const data = userDoc.data() || {};
  const candidates = [
    String(data.uid || "").trim(),
    String(userDoc.id || "").trim(),
    String(phone || "").trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await admin.auth().getUser(candidate);
      return candidate;
    } catch (error) {
      // Try the next candidate.
    }
  }

  return candidates[0] || "";
}

async function ensureCanonicalUserDoc(userDoc, canonicalUid) {
  if (!canonicalUid) {
    return userDoc.ref;
  }

  const data = userDoc.data() || {};
  if (userDoc.id === canonicalUid) {
    if (String(data.uid || "").trim() !== canonicalUid) {
      await userDoc.ref.set({uid: canonicalUid}, {merge: true});
    }
    return userDoc.ref;
  }

  const canonicalRef = admin.firestore().collection("users").doc(canonicalUid);
  const canonicalSnap = await canonicalRef.get();
  if (!canonicalSnap.exists) {
    await canonicalRef.set({
      ...data,
      uid: canonicalUid,
      legacy_user_doc_id: userDoc.id,
      migrated_from_doc_id: userDoc.id,
      migrated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  } else if (String(canonicalSnap.data()?.uid || "").trim() !== canonicalUid) {
    await canonicalRef.set({uid: canonicalUid}, {merge: true});
  }

  if (String(data.uid || "").trim() !== canonicalUid) {
    await userDoc.ref.set({
      uid: canonicalUid,
      canonical_uid: canonicalUid,
    }, {merge: true});
  }

  return canonicalRef;
}

async function upsertEmployeeRecord({
  companyId,
  userId,
  displayName,
  phone,
  roleId,
  roleName,
  rolePermissions,
  roleAllowedCompanyIds,
  position,
  department,
}) {
  if (!companyId || !userId) {
    return;
  }

  const employeesRef = admin.firestore().collection("employees");
  const existing = await employeesRef
      .where("idCompany", "==", companyId)
      .where("user_id", "==", userId)
      .limit(1)
      .get();

  const payload = {
    idCompany: companyId,
    user_id: userId,
    name: displayName || phone || "Сотрудник",
    phone: phone || "",
    role: roleName || position || "",
    role_id: roleId || "",
    role_name: roleName || "",
    role_permissions: normalizeStringArray(rolePermissions),
    role_allowed_company_ids: normalizeStringArray(roleAllowedCompanyIds),
    position: position || roleName || "",
    department: department || "",
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (existing.empty) {
    await employeesRef.add({
      ...payload,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  await existing.docs[0].ref.set(payload, {merge: true});
}

exports.createToken = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({error: "method_not_allowed"});
    return;
  }

  try {
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || "");
    const mode = String(req.body?.mode || "login").trim().toLowerCase();
    const role = String(req.body?.role || "owner").trim().toLowerCase();
    const companyId = String(req.body?.companyId || "").trim();
    const displayName = String(req.body?.displayName || "").trim();
    const roleId = String(req.body?.roleId || "").trim();
    const roleName = String(req.body?.roleName || "").trim();
    const rolePermissions = normalizeStringArray(req.body?.rolePermissions);
    const roleAllowedCompanyIds = normalizeStringArray(req.body?.roleAllowedCompanyIds);
    const position = String(req.body?.position || "").trim();
    const department = String(req.body?.department || "").trim();
    const forcePasswordChange = req.body?.forcePasswordChange === true;

    if (!phone) {
      res.status(400).json({error: "phone_is_required"});
      return;
    }

    if (mode === "signup") {
      let authUserExists = false;
      try {
        await admin.auth().getUser(phone);
        authUserExists = true;
      } catch (error) {
        authUserExists = false;
      }

      const userDoc = await findUserDocByPhone(phone);
      const existingData = userDoc?.data() || {};
      const hasStoredCredentials =
        String(existingData.password_hash || "").trim().length > 0 ||
        String(existingData.password || "").trim().length > 0;

      if ((authUserExists || userDoc) && hasStoredCredentials) {
        res.status(409).json({error: "account_already_exists"});
        return;
      }

      const roleValue = role === "emp" ? "emp" : "owner";
      if (roleValue === "emp" && !companyId) {
        res.status(400).json({error: "company_id_is_required"});
        return;
      }

      const effectiveCompanyIds = roleValue === "emp" ?
        [...new Set([companyId, ...roleAllowedCompanyIds].filter(Boolean))] :
        [];

      await admin.firestore().collection("users").doc(phone).set({
        uid: phone,
        display_name: displayName || existingData.display_name || existingData.name || "",
        name: displayName || existingData.name || existingData.display_name || "",
        phone_number: phone,
        role: roleValue,
        bloc: false,
        password_hash: hashSecret(password),
        password_migrated_at: admin.firestore.FieldValue.serverTimestamp(),
        force_password_change: forcePasswordChange,
        password_change_required: forcePasswordChange,
        temp_password_set_at: forcePasswordChange ?
          admin.firestore.FieldValue.serverTimestamp() :
          admin.firestore.FieldValue.delete(),
        created_time: existingData.created_time || admin.firestore.FieldValue.serverTimestamp(),
        onboarding_complete: roleValue === "owner" ? false : true,
        ...(roleValue === "emp" ? {
          idCompany: companyId,
          activeCompanyId: companyId,
          companyIds: effectiveCompanyIds,
          companyScope: "single",
          role_id: roleId || "",
          role_name: roleName || "",
          role_permissions: rolePermissions,
          role_allowed_company_ids: effectiveCompanyIds,
          position: position || roleName || "",
          department: department || "",
          onboarding_skipped: {},
          onboarding_steps: {},
        } : {}),
      }, {merge: true});

      if (roleValue === "emp") {
        for (const cid of effectiveCompanyIds) {
          await admin.firestore().collection("companies").doc(cid).set({
            members: admin.firestore.FieldValue.arrayUnion(phone),
          }, {merge: true});
        }

        await upsertEmployeeRecord({
          companyId,
          userId: phone,
          displayName,
          phone,
          roleId,
          roleName,
          rolePermissions,
          roleAllowedCompanyIds: effectiveCompanyIds,
          position,
          department,
        });
      }

      const token = await admin.auth().createCustomToken(phone);
      res.status(200).json({token});
      return;
    }

    if (password.trim().length < 1) {
      res.status(400).json({error: "password_is_required"});
      return;
    }

    const userDoc = await findUserDocByPhone(phone);
    if (!userDoc || !userDoc.exists) {
      res.status(404).json({error: "account_not_found"});
      return;
    }

    const data = userDoc.data() || {};
    const storedHash = String(data.password_hash || "").trim();
    const legacyPassword = String(data.password || "").trim();
    const providedHash = hashSecret(password);

    const matchesHash = storedHash && storedHash === providedHash;
    const matchesLegacy = !matchesHash && legacyPassword && legacyPassword === password.trim();

    if (!matchesHash && !matchesLegacy) {
      res.status(403).json({error: "invalid_credentials"});
      return;
    }

    if (matchesLegacy) {
      await userDoc.ref.update({
        password_hash: providedHash,
        password: admin.firestore.FieldValue.delete(),
        password_migrated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const uid = await resolveCanonicalUid(userDoc, phone);
    if (!uid) {
      res.status(500).json({error: "invalid_user_uid"});
      return;
    }

    await ensureCanonicalUserDoc(userDoc, uid);

    const token = await admin.auth().createCustomToken(uid);
    res.status(200).json({token});
  } catch (error) {
    console.error("createToken failed", error);
    res.status(500).json({error: "token_creation_failed"});
  }
});

exports.onUserDeleted = functions.auth.user().onDelete(async (user) => {
  await admin.firestore().collection("users").doc(user.uid).delete();
});

exports.auditTopLevelWrite = functions.firestore
    .document("{collectionId}/{documentId}")
    .onWrite(async (change, context) => {
      const {collectionId, documentId} = context.params;
      if (collectionId === "activity_log" ||
          !AUDITED_COLLECTIONS.has(collectionId)) {
        return null;
      }

      const before = change.before.exists ? change.before.data() || {} : {};
      const after = change.after.exists ? change.after.data() || {} : {};
      const action = !change.before.exists ?
        "create" :
        (!change.after.exists ? "delete" : "update");
      const companyId = auditCompanyId(collectionId, documentId, before, after);
      if (!companyId) return null;

      const actor = auditActor({...before, ...after});
      const eventId = auditHash(context.eventId);
      const payload = {
        idCompany: companyId,
        action,
        entity: collectionId,
        entity_id: documentId,
        entity_title: auditTitle(collectionId, action === "delete" ? before : after, documentId),
        ...actor,
        before: action === "create" ? {} : sanitizeAuditValue(before),
        after: action === "delete" ? {} : sanitizeAuditValue(after),
        diff: action === "update" ? auditDiff(before, after) : {},
        details: {
          message: "Автоматический системный аудит записи Firestore",
          collection: collectionId,
          document_id: documentId,
          event_id: context.eventId,
        },
        source: "server_trigger",
        created_at: auditTimestamp(),
      };

      return admin.firestore()
          .collection("activity_log")
          .doc(`server_${eventId}`)
          .set(payload, {merge: false});
    });

exports.recomputeAccountBalancesOnEntryWrite = functions.firestore
    .document("accounting_entries/{documentId}")
    .onWrite(async (change) => {
      const before = change.before.exists ? change.before.data() || {} : {};
      const after = change.after.exists ? change.after.data() || {} : {};
      const companyIds = [...new Set([
        String(before.idCompany || before.companyId || before.company_id || "").trim(),
        String(after.idCompany || after.companyId || after.company_id || "").trim(),
      ].filter(Boolean))];
      if (companyIds.length === 0) return null;
      const results = [];
      for (const companyId of companyIds) {
        results.push(await recomputeAccountBalancesForCompany(companyId));
      }
      return results;
    });

exports.recomputeAccountBalancesOnAccountWrite = functions.firestore
    .document("sheta/{documentId}")
    .onWrite(async (change) => {
      const before = change.before.exists ? change.before.data() || {} : {};
      const after = change.after.exists ? change.after.data() || {} : {};
      if (change.before.exists &&
          change.after.exists &&
          isOnlyAccountRecomputeWrite(before, after)) {
        return null;
      }
      const companyIds = [...new Set([
        String(before.idCompany || before.companyId || before.company_id || before.id_company || "").trim(),
        String(after.idCompany || after.companyId || after.company_id || after.id_company || "").trim(),
      ].filter(Boolean))];
      if (companyIds.length === 0) return null;
      const results = [];
      for (const companyId of companyIds) {
        results.push(await recomputeAccountBalancesForCompany(companyId));
      }
      return results;
    });
