const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");

const repoRoot = path.resolve(__dirname, "../../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function extractUsedCollections() {
  const output = execFileSync(
      "rg",
      [
        "-o",
        "collection\\('([^']+)'\\)|collection\\(\"([^\"]+)\"\\)",
        "lib",
        "--glob",
        "!build/**",
      ],
      {cwd: repoRoot, encoding: "utf8"},
  );
  const collections = new Set();
  for (const line of output.split(/\n/)) {
    const match = line.match(/collection\(['"]([^'"]+)['"]\)/);
    if (match) collections.add(match[1]);
  }
  return collections;
}

function extractRuleCollections() {
  return new Set(
      [...read("firebase/firestore.rules")
          .matchAll(/match \/([A-Za-z0-9_]+)\/\{document\}/g)]
          .map((match) => match[1]),
  );
}

function extractAuditedCollections() {
  const functionsSource = read("firebase/functions/index.js");
  const match = functionsSource.match(
      /const AUDITED_COLLECTIONS = new Set\(\[([\s\S]*?)\]\);/,
  );
  if (!match) {
    throw new Error("AUDITED_COLLECTIONS not found in functions/index.js");
  }
  return new Set([...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

function verifyAuditCompanyAliases() {
  const functionsSource = read("firebase/functions/index.js");
  const requiredAliases = [
    "idCompany",
    "companyId",
    "company_id",
    "id_company",
  ];
  return requiredAliases.filter((alias) => !functionsSource.includes(alias));
}

function verifyAccountRecomputeGuard() {
  const functionsSource = read("firebase/functions/index.js");
  const requiredSnippets = [
    "recomputeAccountBalancesOnAccountWrite",
    "isOnlyAccountRecomputeWrite",
    "ACCOUNT_RECOMPUTE_FIELDS",
  ];
  return requiredSnippets.filter((snippet) => !functionsSource.includes(snippet));
}

function extractSuperAdminCollections() {
  return new Set(
      [...read("lib/admin/super_admin/super_admin_widget.dart")
          .matchAll(/collection: '([^']+)'/g)]
          .map((match) => match[1]),
  );
}

function difference(source, target, exceptions = []) {
  const ignored = new Set(exceptions);
  return sorted([...source].filter((item) => !target.has(item) && !ignored.has(item)));
}

function report(title, items) {
  if (items.length === 0) return;
  console.error(`\n${title}:`);
  for (const item of items) console.error(`- ${item}`);
}

function main() {
  const used = extractUsedCollections();
  const rules = extractRuleCollections();
  const audited = extractAuditedCollections();
  const superAdmin = extractSuperAdminCollections();

  const missingRules = difference(used, rules, [
    // This is a user subcollection covered by /users/{parent}/scheta/{document}.
    "scheta",
  ]);
  const missingAudit = difference(used, audited, [
    // Auditing the audit log itself would create recursive writes.
    "activity_log",
  ]);
  const missingSuperAdmin = difference(used, superAdmin, [
    // This is not a top-level admin collection.
    "scheta",
  ]);
  const missingAuditAliases = verifyAuditCompanyAliases();
  const missingAccountGuard = verifyAccountRecomputeGuard();

  report("Missing Firestore rules", missingRules);
  report("Missing server audit coverage", missingAudit);
  report("Missing SuperAdmin tabs", missingSuperAdmin);
  report("Missing audit company id aliases", missingAuditAliases);
  report("Missing account recompute recursion guard", missingAccountGuard);

  const failed = missingRules.length ||
    missingAudit.length ||
    missingSuperAdmin.length ||
    missingAuditAliases.length ||
    missingAccountGuard.length;
  if (failed) process.exit(1);

  console.log(JSON.stringify({
    usedCollections: used.size,
    firestoreRulesCovered: rules.size,
    auditedCollections: audited.size,
    superAdminCollections: superAdmin.size,
    status: "ok",
  }, null, 2));
}

main();
