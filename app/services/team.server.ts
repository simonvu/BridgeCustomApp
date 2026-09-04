import prisma from "../db.server";
import { requireTeamUserId } from "./auth.server";
import { getUserPermissions } from "./rbac.server";

export async function loadTeamActor(request: Request) {
  const userId = await requireTeamUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  const permissions = await getUserPermissions(userId);

  return {
    userId,
    user,
    permissions,
    currentUser: {
      email: user?.email || "admin@bridgecustom.com",
      name: user?.name || "Super Admin",
      roleName: user?.userRoles?.[0]?.role?.code?.toUpperCase() || "SUPER_ADMIN",
      avatarUrl: user?.avatarUrl || null,
      permissions,
    },
  };
}

function assertPermission(permissions: string[], permissionCode: string) {
  if (!permissions.includes(permissionCode) && !permissions.includes("system:all")) {
    throw new Response("You do not have permission to access this page.", {
      status: 403,
      statusText: "Forbidden",
    });
  }
}

export async function requireTeamPage(request: Request, permissionCode: string) {
  const actor = await loadTeamActor(request);
  assertPermission(actor.permissions, permissionCode);
  return actor;
}

export async function requireAnyPage(request: Request, permissionCodes: string[]) {
  const actor = await loadTeamActor(request);
  if (!actor.permissions.includes("system:all") && !permissionCodes.some((code) => actor.permissions.includes(code))) {
    throw new Response("You do not have permission to access this page.", {
      status: 403,
      statusText: "Forbidden",
    });
  }
  return actor;
}

export function requestIp(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

export function isSuperAdminUser(user: {
  userRoles?: { role: { code: string } }[];
} | null): boolean {
  return Boolean(
    user?.userRoles?.some((ur) => ur.role.code.toLowerCase() === "super_admin")
  );
}
