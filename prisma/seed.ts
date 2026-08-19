import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Granular System Permissions List in US English
const PERMISSIONS = [
  // A. System Management
  { module: "system", resource: "users", action: "read", code: "system:users:read", name: "View Team Users", description: "View team staff members and user accounts" },
  { module: "system", resource: "users", action: "create", code: "system:users:create", name: "Create Team User", description: "Create and invite new team members" },
  { module: "system", resource: "users", action: "update", code: "system:users:update", name: "Update Team User", description: "Edit user profile information and assign roles" },
  { module: "system", resource: "users", action: "delete", code: "system:users:delete", name: "Delete / Disable User", description: "Disable or remove team accounts" },
  { module: "system", resource: "roles", action: "read", code: "system:roles:read", name: "View Roles", description: "View list of roles and assigned permissions" },
  { module: "system", resource: "roles", action: "manage", code: "system:roles:manage", name: "Manage Roles & Permissions", description: "Create, edit, delete roles and configure permission matrix" },
  { module: "system", resource: "audit_logs", action: "read", code: "system:audit_logs:read", name: "View Audit Logs", description: "View detailed audit log history of team actions" },
  { module: "system", resource: "settings", action: "read", code: "system:settings:read", name: "View System Settings", description: "View Shopify API keys, Cloud Storage, and S3 settings" },
  { module: "system", resource: "settings", action: "update", code: "system:settings:update", name: "Update System Settings", description: "Modify integration settings and secrets" },

  // B. Personalization & Assets
  { module: "personalization", resource: "templates", action: "read", code: "personalization:templates:read", name: "View Design Templates", description: "View list of product personalization templates" },
  { module: "personalization", resource: "templates", action: "create", code: "personalization:templates:create", name: "Create Design Template", description: "Create canvas layers, print areas, and text/image fields" },
  { module: "personalization", resource: "templates", action: "update", code: "personalization:templates:update", name: "Update Design Template", description: "Modify design layers and canvas rules" },
  { module: "personalization", resource: "templates", action: "delete", code: "personalization:templates:delete", name: "Delete Design Template", description: "Delete product personalization templates" },
  { module: "personalization", resource: "assets", action: "read", code: "personalization:assets:read", name: "View Asset Library", description: "Browse fonts, cliparts, and background assets" },
  { module: "personalization", resource: "assets", action: "upload", code: "personalization:assets:upload", name: "Upload Asset", description: "Upload new font files, cliparts, and vector assets" },
  { module: "personalization", resource: "assets", action: "delete", code: "personalization:assets:delete", name: "Delete Asset", description: "Delete design assets from library" },
  { module: "personalization", resource: "orders", action: "read", code: "personalization:orders:read", name: "View Custom Orders", description: "View orders containing personalized products" },
  { module: "personalization", resource: "orders", action: "render", code: "personalization:orders:render", name: "Re-render Print Files", description: "Trigger re-rendering of high-resolution print files" },
  { module: "personalization", resource: "orders", action: "download", code: "personalization:orders:download", name: "Download Print Files", description: "Download High-DPI PDF/PNG print-ready production files" },

  // C. Reviews & Rating
  { module: "reviews", resource: "items", action: "read", code: "reviews:items:read", name: "View Product Reviews", description: "Browse customer reviews and star ratings" },
  { module: "reviews", resource: "items", action: "moderate", code: "reviews:items:moderate", name: "Moderate Reviews", description: "Approve, hide, or feature product reviews" },
  { module: "reviews", resource: "items", action: "reply", code: "reviews:items:reply", name: "Reply to Reviews", description: "Post official merchant replies to customer reviews" },
  { module: "reviews", resource: "items", action: "import_export", code: "reviews:items:import_export", name: "Import / Export Reviews", description: "Import or export CSV review data" },
  { module: "reviews", resource: "settings", action: "read", code: "reviews:settings:read", name: "View Review Settings", description: "View auto-approval rules and email request templates" },
  { module: "reviews", resource: "settings", action: "update", code: "reviews:settings:update", name: "Update Review Settings", description: "Configure auto-moderation rules and review rewards" },

  // D. Upsell & Cross-sell
  { module: "upsell", resource: "campaigns", action: "read", code: "upsell:campaigns:read", name: "View Upsell Campaigns", description: "View upsell, cross-sell, and bundle campaigns" },
  { module: "upsell", resource: "campaigns", action: "create", code: "upsell:campaigns:create", name: "Create Upsell Campaign", description: "Create frequently bought together and post-purchase offers" },
  { module: "upsell", resource: "campaigns", action: "update", code: "upsell:campaigns:update", name: "Update Upsell Campaign", description: "Edit trigger conditions and toggle active status" },
  { module: "upsell", resource: "campaigns", action: "delete", code: "upsell:campaigns:delete", name: "Delete Upsell Campaign", description: "Remove upsell campaigns" },
  { module: "upsell", resource: "analytics", action: "read", code: "upsell:analytics:read", name: "View Upsell Analytics", description: "Track upsell revenue and conversion rate reports" },
];

// Default Preset Roles in US English
const ROLES = [
  { code: "super_admin", name: "Super Admin", description: "Full access to all system features, settings, and team management", isSystem: true },
  { code: "operations_manager", name: "Operations Manager", description: "Access to all operational modules except system settings and user management", isSystem: false },
  { code: "designer", name: "Designer / Fulfillment", description: "Manages personalization templates, asset library, and print file downloads", isSystem: false },
  { code: "review_moderator", name: "CS & Review Moderator", description: "Moderates product reviews, posts replies, and views custom orders", isSystem: false },
  { code: "marketing_specialist", name: "Marketing Specialist", description: "Manages Upsell & Cross-sell campaigns and views conversion analytics", isSystem: false },
  { code: "auditor", name: "Auditor (Read Only)", description: "Read-only access across all system modules", isSystem: false },
];

async function main() {
  console.log("🌱 Seeding RBAC permissions & default roles in US English...");

  // 1. Create/Update Permissions
  const permissionMap = new Map<string, string>();
  for (const perm of PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { code: perm.code },
      update: perm,
      create: perm,
    });
    permissionMap.set(p.code, p.id);
  }
  console.log(`✅ Created/updated ${PERMISSIONS.length} permissions`);

  // 2. Create/Update Roles & Assign Permissions
  for (const roleData of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: roleData.code },
      update: { name: roleData.name, description: roleData.description, isSystem: roleData.isSystem },
      create: roleData,
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    let assignedCodes: string[] = [];
    if (role.code === "super_admin") {
      assignedCodes = PERMISSIONS.map((p) => p.code);
    } else if (role.code === "operations_manager") {
      assignedCodes = PERMISSIONS.filter((p) => !p.code.startsWith("system:users") && !p.code.startsWith("system:roles")).map((p) => p.code);
    } else if (role.code === "designer") {
      assignedCodes = PERMISSIONS.filter((p) => p.code.startsWith("personalization:")).map((p) => p.code);
    } else if (role.code === "review_moderator") {
      assignedCodes = PERMISSIONS.filter((p) => p.code.startsWith("reviews:") || p.code === "personalization:orders:read").map((p) => p.code);
    } else if (role.code === "marketing_specialist") {
      assignedCodes = PERMISSIONS.filter((p) => p.code.startsWith("upsell:") || p.code === "reviews:items:read").map((p) => p.code);
    } else if (role.code === "auditor") {
      assignedCodes = PERMISSIONS.filter((p) => p.action === "read").map((p) => p.code);
    }

    const rolePerms = assignedCodes.map((code) => ({
      roleId: role.id,
      permissionId: permissionMap.get(code)!,
    }));

    if (rolePerms.length > 0) {
      await prisma.rolePermission.createMany({ data: rolePerms });
    }

    console.log(`✅ Role "${role.name}" (${role.code}): assigned ${rolePerms.length} permissions`);
  }

  // 3. Create Default Super Admin Account
  const adminRole = await prisma.role.findUnique({ where: { code: "super_admin" } });
  if (adminRole) {
    const passwordHash = bcrypt.hashSync("admin123", 10);
    const adminUser = await prisma.user.upsert({
      where: { email: "admin@bridgecustom.com" },
      update: { name: "Super Admin", passwordHash },
      create: {
        email: "admin@bridgecustom.com",
        name: "Super Admin",
        passwordHash,
        isActive: true,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
      update: {},
      create: { userId: adminUser.id, roleId: adminRole.id },
    });

    console.log(`👤 Initialized default Super Admin: admin@bridgecustom.com`);
  }

  console.log("🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
