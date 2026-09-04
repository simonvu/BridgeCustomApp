import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Permissions map 1:1 to screens that exist in the app today.
// Do not add Reviews / Upsell / Orders / Settings until those modules ship.
const PERMISSIONS = [
  // Media
  { module: "Media", resource: "files", action: "read", code: "media:files:read", name: "View Media", description: "Browse the media library and folders" },
  { module: "Media", resource: "files", action: "upload", code: "media:files:upload", name: "Upload Media", description: "Upload files and create media folders" },
  { module: "Media", resource: "files", action: "update", code: "media:files:update", name: "Edit Media", description: "Update file details such as alt text" },
  { module: "Media", resource: "files", action: "delete", code: "media:files:delete", name: "Delete Media", description: "Delete media files from the library" },

  // Artworks
  { module: "Artworks", resource: "items", action: "read", code: "artworks:items:read", name: "View Artworks", description: "View the artwork library and open studio in read mode" },
  { module: "Artworks", resource: "items", action: "create", code: "artworks:items:create", name: "Create Artworks", description: "Create and duplicate artworks" },
  { module: "Artworks", resource: "items", action: "update", code: "artworks:items:update", name: "Edit Artworks", description: "Save artwork studio layers, screens, fields, and rules" },
  { module: "Artworks", resource: "items", action: "delete", code: "artworks:items:delete", name: "Delete Artworks", description: "Delete artworks from the library" },

  // Clip Art
  { module: "Clip Art", resource: "items", action: "read", code: "cliparts:items:read", name: "View Clip Art", description: "View the clip art library" },
  { module: "Clip Art", resource: "items", action: "create", code: "cliparts:items:create", name: "Create Clip Art", description: "Create and duplicate clip art objects" },
  { module: "Clip Art", resource: "items", action: "update", code: "cliparts:items:update", name: "Edit Clip Art", description: "Save clip art studio layers and variants" },
  { module: "Clip Art", resource: "items", action: "delete", code: "cliparts:items:delete", name: "Delete Clip Art", description: "Delete clip art objects" },

  // Font Library
  { module: "Font Library", resource: "items", action: "read", code: "fonts:items:read", name: "View Fonts", description: "Browse the font library" },
  { module: "Font Library", resource: "items", action: "create", code: "fonts:items:create", name: "Add Fonts", description: "Add Google fonts or upload custom font files" },
  { module: "Font Library", resource: "items", action: "update", code: "fonts:items:update", name: "Edit Fonts", description: "Set the default font" },
  { module: "Font Library", resource: "items", action: "delete", code: "fonts:items:delete", name: "Delete Fonts", description: "Remove fonts from the library" },

  // Doodle Alphabets
  { module: "Doodle Alphabets", resource: "packs", action: "read", code: "doodles:packs:read", name: "View Doodle Packs", description: "Browse doodle alphabet packs and letter sets" },
  { module: "Doodle Alphabets", resource: "packs", action: "create", code: "doodles:packs:create", name: "Create Doodle Packs", description: "Create packs and styles" },
  { module: "Doodle Alphabets", resource: "packs", action: "update", code: "doodles:packs:update", name: "Edit Doodle Packs", description: "Upload or replace doodle letters" },
  { module: "Doodle Alphabets", resource: "packs", action: "delete", code: "doodles:packs:delete", name: "Delete Doodle Packs", description: "Delete packs, styles, or letter sets" },

  // User Management
  { module: "User Management", resource: "users", action: "read", code: "system:users:read", name: "View Team Members", description: "View team staff members and user accounts" },
  { module: "User Management", resource: "users", action: "create", code: "system:users:create", name: "Create Team Member", description: "Create new team members" },
  { module: "User Management", resource: "users", action: "update", code: "system:users:update", name: "Update Team Member", description: "Edit profile information and assign roles" },
  { module: "User Management", resource: "users", action: "delete", code: "system:users:delete", name: "Disable Team Member", description: "Disable or remove team accounts" },
  { module: "User Management", resource: "roles", action: "read", code: "system:roles:read", name: "View Roles", description: "View roles and assigned permissions" },
  { module: "User Management", resource: "roles", action: "manage", code: "system:roles:manage", name: "Manage Roles", description: "Create, edit, and delete roles and the permission matrix" },
  { module: "User Management", resource: "audit_logs", action: "read", code: "system:audit_logs:read", name: "View Audit Logs", description: "View team action history" },
];

const CONTENT_MODULES = ["Media", "Artworks", "Clip Art", "Font Library", "Doodle Alphabets"];

const ROLES = [
  { code: "super_admin", name: "Super Admin", description: "Full access to every shipped module, including roles and team members", isSystem: true },
  { code: "admin", name: "Admin", description: "Manages content libraries and team members. Cannot edit the permission matrix.", isSystem: false },
  { code: "designer", name: "Designer", description: "Creates and edits artworks, clip art, fonts, doodles, and media", isSystem: false },
  { code: "viewer", name: "Viewer", description: "Read-only access to media and personalization libraries", isSystem: false },
];

async function main() {
  console.log("🌱 Seeding RBAC permissions & default roles in US English...");

  // 1. Create/Update Permissions
  const permissionMap = new Map<string, string>();
  for (const perm of PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { code: perm.code },
      update: {
        code: perm.code,
        name: perm.name,
        module: perm.module,
        resource: perm.resource,
        action: perm.action,
        category: perm.module || "General",
        description: perm.description,
      },
      create: {
        code: perm.code,
        name: perm.name,
        module: perm.module,
        resource: perm.resource,
        action: perm.action,
        category: perm.module || "General",
        description: perm.description,
      },
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
    } else if (role.code === "admin") {
      assignedCodes = PERMISSIONS.filter((p) => p.code !== "system:roles:manage").map((p) => p.code);
    } else if (role.code === "designer") {
      assignedCodes = PERMISSIONS.filter((p) => CONTENT_MODULES.includes(p.module)).map((p) => p.code);
    } else if (role.code === "viewer") {
      assignedCodes = PERMISSIONS.filter((p) => CONTENT_MODULES.includes(p.module) && p.action === "read").map((p) => p.code);
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

  const keepPermissionCodes = PERMISSIONS.map((p) => p.code);
  const stalePerms = await prisma.permission.findMany({
    where: { code: { notIn: keepPermissionCodes } },
    select: { id: true, code: true },
  });
  if (stalePerms.length > 0) {
    await prisma.rolePermission.deleteMany({ where: { permissionId: { in: stalePerms.map((p) => p.id) } } });
    await prisma.permission.deleteMany({ where: { id: { in: stalePerms.map((p) => p.id) } } });
    console.log(`🧹 Removed ${stalePerms.length} permissions for features that are not in the app yet`);
  }

  const keepRoleCodes = ROLES.map((r) => r.code);
  const staleRoles = await prisma.role.findMany({
    where: { code: { notIn: keepRoleCodes } },
    include: { userRoles: true },
  });
  for (const stale of staleRoles) {
    if (stale.userRoles.length > 0) {
      console.log(`⚠️ Kept unused role "${stale.code}" because it still has assigned users`);
      continue;
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: stale.id } });
    await prisma.role.delete({ where: { id: stale.id } });
    console.log(`🧹 Removed unused role "${stale.code}"`);
  }

  // 3. Create Default Super Admin Account
  const adminRole = await prisma.role.findUnique({ where: { code: "super_admin" } });
  if (adminRole) {
    const passwordHash = bcrypt.hashSync("admin123", 10);
    const adminUser = await prisma.user.upsert({
      where: { email: "admin@bridgecustom.com" },
      update: { name: "Super Admin" },
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

  // 4. Seed Initial Sample Artworks Library (Empty by default for fresh user testing)
  const sampleArtworks: any[] = [];
  console.log(`🖼️ Sample artworks library initialized (empty for custom testing)`);

  for (const art of sampleArtworks) {
    const existing = await prisma.artwork.findFirst({ where: { title: art.title } });
    if (!existing) {
      await prisma.artwork.create({
        data: {
          title: art.title,
          niche: art.niche,
          category: art.category,
          thumbnailUrl: (art as any).imageUrl || null,
          previewUrl: (art as any).imageUrl || null,
          widthPx: 1000,
          heightPx: 1000,
          fieldCount: (art as any).layerCount || 0,
          optionCount: art.optionCount || 1,
          createdBy: art.createdBy || "Admin",
        },
      });
    }
  }
  console.log(`🖼️ Seeded sample artworks library`);

  // 5. Seed Initial Sample Media Files
  const sampleMediaFiles = [
    {
      fileName: "logo_bridge_custom_transparent.png",
      fileSize: 342100,
      fileType: "image/png",
      category: "IMAGE",
      url: "https://bridgecustom.com/cdn/shop/files/logo_32560765-de91-4766-9226-9630dcbf7d4a.png",
      key: "media_logo_bridge_custom_transparent",
      dimensions: "1200x400",
      altText: "BridgeCustom Official Brand Logo",
      folder: "general",
      uploadedBy: "Admin",
    },
    {
      fileName: "friend_quote_mug_vector.png",
      fileSize: 512400,
      fileType: "image/png",
      category: "IMAGE",
      url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=60",
      key: "media_friend_quote_mug_vector",
      dimensions: "800x800",
      altText: "Friend quote mug vector mockup",
      folder: "artworks",
      uploadedBy: "Designer",
    },
    {
      fileName: "roboto_bold_custom.ttf",
      fileSize: 184500,
      fileType: "font/ttf",
      category: "FONT",
      url: "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4.woff2",
      key: "media_roboto_bold_custom",
      dimensions: null,
      altText: "Roboto Bold Font Asset",
      folder: "fonts",
      uploadedBy: "Admin",
    },
    {
      fileName: "summer_beach_clipart_set.png",
      fileSize: 1240500,
      fileType: "image/png",
      category: "IMAGE",
      url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=60",
      key: "media_summer_beach_clipart_set",
      dimensions: "1200x1200",
      altText: "Summer beach clipart illustration",
      folder: "cliparts",
      uploadedBy: "Designer",
    },
    {
      fileName: "print_specification_guide.pdf",
      fileSize: 2450800,
      fileType: "application/pdf",
      category: "DOCUMENT",
      url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      key: "media_print_specification_guide",
      dimensions: null,
      altText: "Print production guide standard PDF",
      folder: "general",
      uploadedBy: "Admin",
    },
  ];

  for (const media of sampleMediaFiles) {
    const existing = await prisma.mediaFile.findUnique({ where: { key: media.key } });
    if (!existing) {
      await prisma.mediaFile.create({ data: media });
    }
  }
  console.log(`📁 Seeded sample media files library`);

  // 5. Seed System Fonts (Google Fonts)
  const defaultFonts = [
    { name: "Roboto", family: "Roboto", fontType: "GOOGLE", isDefault: true },
    { name: "Dancing Script", family: "Dancing Script", fontType: "GOOGLE" },
    { name: "Playfair Display", family: "Playfair Display", fontType: "GOOGLE" },
    { name: "Montserrat", family: "Montserrat", fontType: "GOOGLE" },
    { name: "Pacifico", family: "Pacifico", fontType: "GOOGLE" },
    { name: "Caveat", family: "Caveat", fontType: "GOOGLE" },
    { name: "Lobster", family: "Lobster", fontType: "GOOGLE" },
    { name: "Great Vibes", family: "Great Vibes", fontType: "GOOGLE" },
    { name: "Cinzel", family: "Cinzel", fontType: "GOOGLE" },
    { name: "Alex Brush", family: "Alex Brush", fontType: "GOOGLE" },
  ];

  for (const font of defaultFonts) {
    const existing = await (prisma as any).font.findFirst({ where: { family: font.family } });
    if (!existing) {
      await (prisma as any).font.create({ data: font });
    }
  }
  console.log(`🔤 Seeded default font library`);

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
