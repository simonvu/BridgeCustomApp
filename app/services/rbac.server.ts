import prisma from "../db.server";

function isSuperAdminRoleCode(code: string) {
  return code.toLowerCase() === "super_admin";
}

/**
 * Get all permission codes for a user
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId, isActive: true },
    include: {
      userRoles: {
        include: { role: true },
      },
    },
  });

  if (!user) return [];

  if (user.userRoles.some((ur) => isSuperAdminRoleCode(ur.role.code))) {
    return ["system:all"];
  }

  const roleIds = user.userRoles.map((ur) => ur.roleId);
  if (roleIds.length === 0) return [];

  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId: { in: roleIds } },
    include: { permission: true },
  });

  return Array.from(new Set(rolePerms.map((rp) => rp.permission.code)));
}

/**
 * Check if a user has a specific permission code
 */
export async function hasPermission(userId: string, permissionCode: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.includes(permissionCode) || permissions.includes("system:all");
}

/**
 * Enforce permission check in Remix Loader/Action.
 * Throws a 403 Forbidden Response if unauthorized.
 */
export async function requirePermission(userId: string, permissionCode: string) {
  const allowed = await hasPermission(userId, permissionCode);
  if (!allowed) {
    throw new Response("You do not have permission to access this page.", {
      status: 403,
      statusText: "Forbidden",
    });
  }
}

export function canAccess(permissions: string[] | undefined, permissionCode: string) {
  if (!permissions?.length) return false;
  return permissions.includes("system:all") || permissions.includes(permissionCode);
}

export async function hasAnyPermission(userId: string, permissionCodes: string[]): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.includes("system:all") || permissionCodes.some((code) => permissions.includes(code));
}

export async function requireAnyPermission(userId: string, permissionCodes: string[]) {
  const allowed = await hasAnyPermission(userId, permissionCodes);
  if (!allowed) {
    throw new Response("You do not have permission to access this page.", {
      status: 403,
      statusText: "Forbidden",
    });
  }
}

export function rethrowHttpResponse(error: unknown) {
  if (error instanceof Response) throw error;
}

/**
 * Record an audit log entry for team user actions
 */
export async function logActivity({
  userId,
  action,
  resource,
  payload,
  ipAddress,
}: {
  userId?: string | null;
  action: string;
  resource: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        resource,
        payload: payload ? JSON.stringify(payload) : null,
        ipAddress: ipAddress || null,
      },
    });
  } catch (error) {
    console.error("Failed to log audit activity:", error);
  }
}
