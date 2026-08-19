import prisma from "../db.server";

/**
 * Get all permission codes for a user
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId, isActive: true },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return [];

  const permissionCodes = new Set<string>();

  for (const userRole of user.userRoles) {
    const role = userRole.role;
    for (const rolePerm of role.rolePermissions) {
      permissionCodes.add(rolePerm.permission.code);
    }
  }

  return Array.from(permissionCodes);
}

/**
 * Check if a user has a specific permission code
 */
export async function hasPermission(userId: string, permissionCode: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  if (permissions.includes(permissionCode) || permissions.includes("system:all")) {
    return true;
  }
  return false;
}

/**
 * Enforce permission check in Remix Loader/Action.
 * Throws a 403 Forbidden Response if unauthorized.
 */
export async function requirePermission(userId: string, permissionCode: string) {
  const allowed = await hasPermission(userId, permissionCode);
  if (!allowed) {
    throw new Response(
      JSON.stringify({
        error: "Access Denied",
        message: `You do not have permission (${permissionCode}) to perform this action.`,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
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
  userId?: string;
  action: string;
  resource: string;
  payload?: Record<string, any>;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        payload: payload ? JSON.stringify(payload) : null,
        ipAddress,
      },
    });
  } catch (error) {
    console.error("❌ Failed to log audit activity:", error);
  }
}
