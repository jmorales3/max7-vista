import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  router: "artifacts/patient-images/src/router.tsx",
  layout: "artifacts/patient-images/src/components/layout.tsx",
  manual: "artifacts/patient-images/src/i18n/locales/en.json",
  manualEs: "artifacts/patient-images/src/i18n/locales/es.json",
  manualFr: "artifacts/patient-images/src/i18n/locales/fr.json",
  manualPt: "artifacts/patient-images/src/i18n/locales/pt.json",
  mobileSettings: "artifacts/patient-images-mobile/app/(tabs)/settings.tsx",
  patients: "artifacts/api-server/src/routes/patients.ts",
  images: "artifacts/api-server/src/routes/images.ts",
  imports: "artifacts/api-server/src/routes/import.ts",
  ceph: "artifacts/api-server/src/routes/ceph.ts",
  documents: "artifacts/api-server/src/routes/documents.ts",
  patientDocuments:
    "artifacts/patient-images/src/components/patient-documents.tsx",
  library: "artifacts/api-server/src/routes/library.ts",
  tags: "artifacts/api-server/src/routes/tags.ts",
  migration: "artifacts/api-server/src/routes/migration.ts",
  scanDirectory: "artifacts/api-server/src/lib/scanDirectory.ts",
  admin: "artifacts/api-server/src/routes/admin.ts",
  audit: "artifacts/api-server/src/routes/audit.ts",
  chat: "artifacts/api-server/src/routes/chat.ts",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([name, path]) => [
      name,
      await readFile(path, "utf8"),
    ]),
  ),
);

function expectContains(name, pattern, description) {
  assert.match(source[name], pattern, description);
}

const doctorGuard = 'requireRole("admin", "superadmin")';
const superadminGuard = 'requireRole("superadmin")';

expectContains(
  "patients",
  new RegExp(
    `router\\.post\\("/patients", ${doctorGuard.replace(/[()"]/g, "\\$&")}`,
  ),
  "Patient creation must require Doctor or Superadministrator.",
);
expectContains(
  "patients",
  new RegExp(
    `router\\.patch\\("/patients/:id", ${doctorGuard.replace(/[()"]/g, "\\$&")}`,
  ),
  "Patient edits must require Doctor or Superadministrator.",
);
expectContains(
  "patients",
  new RegExp(
    `router\\.delete\\("/patients/:id", ${doctorGuard.replace(/[()"]/g, "\\$&")}`,
  ),
  "Patient deletion must require Doctor or Superadministrator.",
);
expectContains(
  "images",
  new RegExp(
    `router\\.post\\(\\s*"/images/export-zip",\\s*${doctorGuard.replace(/[()"]/g, "\\$&")}`,
  ),
  "Gallery ZIP export must require Doctor or Superadministrator.",
);
expectContains(
  "images",
  new RegExp(
    `"/patients/:id/export-images",\\s*${doctorGuard.replace(/[()"]/g, "\\$&")}`,
  ),
  "Patient ZIP export must require Doctor or Superadministrator.",
);
expectContains(
  "imports",
  /"\/import\/bulk",\s*requireRole\("admin", "superadmin"\)/,
  "Bulk ZIP import must require Doctor or Superadministrator.",
);
expectContains(
  "imports",
  /"\/import\/bulk-upload-url",\s*requireRole\("admin", "superadmin"\)/,
  "Bulk-upload URL creation must require Doctor or Superadministrator.",
);
expectContains(
  "imports",
  /"\/import\/bulk-from-gcs",\s*requireRole\("admin", "superadmin"\)/,
  "GCS bulk import must require Doctor or Superadministrator.",
);
expectContains(
  "imports",
  /"\/import\/folder",\s*requireRole\("admin", "superadmin"\)/,
  "Server-folder import must require Doctor or Superadministrator.",
);
expectContains(
  "ceph",
  /router\.use\(requireRole\("admin", "superadmin"\)\)/,
  "Every cephalometric endpoint must require Doctor or Superadministrator.",
);
expectContains(
  "documents",
  /router\.post\("\/documents", requireRole\("admin", "superadmin"\)/,
  "Document upload must require Doctor or Superadministrator.",
);
expectContains(
  "documents",
  /router\.delete\("\/documents\/:id", requireRole\("admin", "superadmin"\)/,
  "Document deletion must require Doctor or Superadministrator.",
);
expectContains(
  "library",
  /router\.use\("\/library-assets", requireRole\("admin", "superadmin"\)\)/,
  "Image Library endpoints must require Doctor or Superadministrator.",
);
expectContains(
  "library",
  /eq\(imagesTable\.tenantId, tenantId\)/,
  "Image Library queries must be tenant-scoped.",
);
expectContains(
  "images",
  /if \(image\.tenantId !== tenantId\)/,
  "Generic image reads must tenant-scope library assets.",
);
expectContains(
  "images",
  /row\.isLibraryAsset\) \{\s+if \(row\.tenantId === tenantId\)/,
  "Library ZIP exports must tenant-scope library assets.",
);
expectContains(
  "images",
  /\.values\(\{[\s\S]*tenantId,[\s\S]*uploadedBy:/,
  "Every ordinary image upload must persist its tenant.",
);
expectContains(
  "imports",
  /async function saveImage\(\s*tenantId: number/,
  "Bulk image import must receive the owning tenant.",
);
expectContains(
  "imports",
  /\.values\(\{[\s\S]*tenantId,[\s\S]*patientId:/,
  "Bulk image import must persist the owning tenant.",
);
expectContains(
  "migration",
  /\.values\(\{\s*tenantId,/,
  "Migration image import must persist the owning tenant.",
);
expectContains(
  "scanDirectory",
  /tenantId:\s*resolvedPatientId !== null/,
  "Directory indexing must inherit the resolved patient's tenant.",
);
expectContains(
  "tags",
  /router\.post\("\/patients\/:id\/tags", requireRole\("admin", "superadmin"\)/,
  "Patient-tag assignment must require Doctor or Superadministrator.",
);
expectContains(
  "tags",
  /router\.delete\("\/patients\/:id\/tags\/:tagId", requireRole\("admin", "superadmin"\)/,
  "Patient-tag removal must require Doctor or Superadministrator.",
);
expectContains(
  "admin",
  new RegExp(
    `"/admin/retention-policy", ${superadminGuard.replace(/[()"]/g, "\\$&")}`,
  ),
  "Retention policy must require Superadministrator.",
);
expectContains(
  "admin",
  new RegExp(
    `"/admin/patients/:id/legal-hold", ${superadminGuard.replace(/[()"]/g, "\\$&")}`,
  ),
  "Legal holds must require Superadministrator.",
);
expectContains(
  "audit",
  new RegExp(
    `"/patients/:id/disclosure-report", ${superadminGuard.replace(/[()"]/g, "\\$&")}`,
  ),
  "Disclosure reports must require Superadministrator.",
);
expectContains(
  "router",
  /path="\/patients\/new" component=\{isAdmin \? PatientNew : NotAuthorized\}/,
  "User must not reach the patient-create form.",
);
expectContains(
  "router",
  /path="\/templates" component=\{isAdmin \? Templates : NotAuthorized\}/,
  "User must not reach Templates.",
);
expectContains(
  "router",
  /path="\/cephalometrics" component=\{isAdmin \? Cephalometrics : NotAuthorized\}/,
  "User must not reach Cephalometrics.",
);
expectContains(
  "router",
  /path="\/library" component=\{isAdmin \? ImageLibrary : NotAuthorized\}/,
  "User must not reach Image Library.",
);
expectContains(
  "layout",
  /\.\.\.\(isAdmin \? \[/,
  "Clinical-management navigation must be gated for User.",
);
expectContains(
  "patientDocuments",
  /const canManageDocuments =\s*user\?\.role === "admin" \|\|\s*user\?\.role === "superadmin";/,
  "Document controls must be role-aware.",
);
expectContains(
  "manual",
  /"roleAdmin": "Doctor"/,
  "The display name for admin must be Doctor.",
);
expectContains(
  "manual",
  /"roleSuperAdmin": "Superadministrator"/,
  "The display name for superadmin must be Superadministrator.",
);
expectContains(
  "manual",
  /"body": "Max7 Vista supports three roles, all scoped to one organization/,
  "The Manual must contain the approved role policy.",
);
for (const locale of ["manualEs", "manualFr", "manualPt"]) {
  expectContains(
    locale,
    /Superadministrador|Superadministrateur|Superadministrador/,
    "Every Manual translation must describe the Superadministrator policy.",
  );
  assert.doesNotMatch(
    source[locale],
    /puede crear —pero no editar ni eliminar— trazados|peut créer — mais pas modifier ni supprimer — des tracés|pode criar — mas não editar ou excluir — traçados/,
    "Manual translations must not grant cephalometric access to User.",
  );
  assert.doesNotMatch(
    source[locale],
    /Los Doctores y Superadministradores pueden configurar|Les Docteurs et Super Administrateurs peuvent configurer|Médicos e Superadministradores podem configurar/,
    "Manual translations must not grant retention to Doctor.",
  );
  assert.doesNotMatch(
    source[locale],
    /Cualquier usuario puede generar|Tout utilisateur peut générer|Qualquer usuário pode gerar/,
    "Manual translations must not grant disclosure reports to User.",
  );
}
expectContains(
  "chat",
  /Approved role policy: display the role names User, Doctor, and Superadministrator/,
  "The chatbot must contain the approved role policy.",
);
assert.doesNotMatch(
  source.chat,
  /Patient Data Retention & Legal Hold \(Settings, Doctor\/Superadministrator only\)/,
  "The chatbot must not grant retention or legal-hold access to Doctor.",
);
assert.doesNotMatch(
  source.chat,
  /Roles \(redesigned as a permission matrix/,
  "The chatbot must not contain a second, contradictory role policy.",
);
expectContains(
  "mobileSettings",
  /const roleLabel = user\?\.role === "superadmin"/,
  "Mobile must map internal roles to approved display names.",
);

console.log("Role policy source check passed.");
