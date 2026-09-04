import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Page, Layout, Card, Box, Banner } from "@shopify/polaris";
import { ShieldCheck, Edit3, CheckSquare, Square, Trash2 } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import UserManagementTabs from "../components/team/UserManagementTabs";
import prisma from "../db.server";
import { logActivity } from "../services/rbac.server";
import { requestIp, requireTeamPage } from "../services/team.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { currentUser } = await requireTeamPage(request, "system:roles:read");

  const roles = await prisma.role.findMany({
    include: { userRoles: true },
    orderBy: { createdAt: "asc" },
  });

  const rolePerms = await prisma.rolePermission.findMany({
    include: { permission: true },
  });

  const permissions = await prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { action: "asc" }, { name: "asc" }],
  });

  const permsByRole = new Map<string, typeof rolePerms>();
  for (const rp of rolePerms) {
    const list = permsByRole.get(rp.roleId) || [];
    list.push(rp);
    permsByRole.set(rp.roleId, list);
  }

  return json({
    currentUser,
    permissions,
    roles: roles.map((role) => ({
      ...role,
      rolePermissions: permsByRole.get(role.id) || [],
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { userId: actorId } = await requireTeamPage(request, "system:roles:manage");
  const formData = await request.formData();
  const intent = formData.get("intent");
  const ipAddress = requestIp(request);

  if (intent === "SAVE_ROLE") {
    const roleId = String(formData.get("roleId") || "");
    const name = String(formData.get("name") || "").trim();
    const codeRaw = String(formData.get("code") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const permissionIds = formData.getAll("permissionIds").map(String).filter(Boolean);

    if (!name) return json({ error: "Role name is required." }, { status: 400 });

    try {
      if (roleId) {
        const existing = await prisma.role.findUnique({ where: { id: roleId } });
        if (!existing) return json({ error: "Role not found." }, { status: 404 });

        await prisma.role.update({
          where: { id: roleId },
          data: { name, description },
        });
        await prisma.rolePermission.deleteMany({ where: { roleId } });
        if (permissionIds.length > 0) {
          await prisma.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
          });
        }
        await logActivity({
          userId: actorId,
          action: "UPDATE_ROLE",
          resource: `role:${roleId}`,
          payload: { name, permissionCount: permissionIds.length },
          ipAddress,
        });
      } else {
        const code = (codeRaw || name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        if (!code) return json({ error: "Role code is required." }, { status: 400 });
        const clash = await prisma.role.findUnique({ where: { code } });
        if (clash) return json({ error: `Role code "${code}" already exists.` }, { status: 400 });

        const role = await prisma.role.create({
          data: { name, code, description, isSystem: false },
        });
        if (permissionIds.length > 0) {
          await prisma.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          });
        }
        await logActivity({
          userId: actorId,
          action: "CREATE_ROLE",
          resource: `role:${role.id}`,
          payload: { name, code, permissionCount: permissionIds.length },
          ipAddress,
        });
      }
      return json({ success: true });
    } catch (error) {
      console.error("SAVE_ROLE failed", error);
      return json({ error: "Could not save role." }, { status: 400 });
    }
  }

  if (intent === "DELETE_ROLE") {
    const roleId = String(formData.get("roleId") || "");
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { userRoles: true },
    });
    if (!role) return json({ error: "Role not found." }, { status: 404 });
    if (role.isSystem) return json({ error: "System roles cannot be deleted." }, { status: 400 });
    if (role.userRoles.length > 0) {
      return json({ error: "Reassign team members before deleting this role." }, { status: 400 });
    }
    await prisma.role.delete({ where: { id: roleId } });
    await logActivity({
      userId: actorId,
      action: "DELETE_ROLE",
      resource: `role:${roleId}`,
      payload: { name: role.name, code: role.code },
      ipAddress,
    });
    return json({ success: true });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function TeamRolesRoute() {
  const { currentUser, roles, permissions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermIds, setSelectedPermIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (navigation.state !== "idle") return;
    if (actionData && "success" in actionData && actionData.success) {
      setModalOpen(false);
      setFormError(null);
    }
    if (actionData && "error" in actionData && actionData.error) {
      setFormError(actionData.error);
    }
  }, [navigation.state, actionData]);

  const MODULE_ORDER = ["Media", "Artworks", "Clip Art", "Font Library", "Doodle Alphabets", "User Management"];
  const groupedPermissions: Record<string, typeof permissions> = {};
  for (const moduleName of MODULE_ORDER) {
    const perms = permissions.filter((perm) => perm.module === moduleName);
    if (perms.length > 0) groupedPermissions[moduleName] = perms;
  }
  for (const perm of permissions) {
    if (MODULE_ORDER.includes(perm.module)) continue;
    if (!groupedPermissions[perm.module]) groupedPermissions[perm.module] = [];
    groupedPermissions[perm.module].push(perm);
  }

  const canManageRoles =
    Boolean(currentUser.permissions?.includes("system:all")) ||
    Boolean(currentUser.permissions?.includes("system:roles:manage"));

  const handleOpenCreateModal = () => {
    setEditingRoleId(null);
    setName("");
    setCode("");
    setDescription("");
    setSelectedPermIds([]);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (role: (typeof roles)[0]) => {
    setEditingRoleId(role.id);
    setName(role.name);
    setCode(role.code);
    setDescription(role.description || "");
    setSelectedPermIds(role.rolePermissions.map((rp) => rp.permissionId));
    setFormError(null);
    setModalOpen(true);
  };

  const handleTogglePermission = (permId: string) => {
    setSelectedPermIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  };

  const handleToggleModule = (permIdsInModule: string[]) => {
    const allSelected = permIdsInModule.every((id) => selectedPermIds.includes(id));
    setSelectedPermIds((prev) =>
      allSelected ? prev.filter((id) => !permIdsInModule.includes(id)) : Array.from(new Set([...prev, ...permIdsInModule]))
    );
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Role name is required.");
      return;
    }
    const fd = new FormData();
    fd.append("intent", "SAVE_ROLE");
    if (editingRoleId) fd.append("roleId", editingRoleId);
    fd.append("name", name);
    fd.append("code", code);
    fd.append("description", description);
    selectedPermIds.forEach((id) => fd.append("permissionIds", id));
    submit(fd, { method: "post" });
  };

  const handleDeleteRole = (roleId: string) => {
    if (!window.confirm("Delete this role? Team members must be reassigned first.")) return;
    setFormError(null);
    submit({ intent: "DELETE_ROLE", roleId }, { method: "post" });
  };

  return (
    <DashboardLayout currentUser={currentUser}>
      <Page
        fullWidth
        title="User Management"
        subtitle="Manage team members, assign roles, and review account activity"
        primaryAction={canManageRoles ? { content: "Create New Role", onAction: handleOpenCreateModal } : undefined}
      >
        <Layout>
          <Layout.Section>
            {formError && !modalOpen && (
              <Box paddingBlockEnd="400">
                <Banner tone="critical" onDismiss={() => setFormError(null)}>
                  <p>{formError}</p>
                </Banner>
              </Box>
            )}
            <Card padding="0">
              <UserManagementTabs>
                <Box padding="400">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {roles.map((role) => {
                      const permCount = role.rolePermissions.length;
                      const userCount = role.userRoles.length;
                      return (
                        <div
                          key={role.id}
                          className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="font-bold text-slate-900 text-base">{role.name}</h3>
                              {role.isSystem && (
                                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 shrink-0">
                                  System
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-mono text-slate-500">Code: {role.code}</p>
                            <p className="text-xs text-slate-600 min-h-[36px]">
                              {role.description || "No description for this role."}
                            </p>
                          </div>
                          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                            <div className="text-[11px] text-slate-500 font-medium">
                              {permCount} / {permissions.length} permissions · {userCount} users
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {canManageRoles && (
                                <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(role)}
                                className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-md transition cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" /> Edit
                              </button>
                              {!role.isSystem && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRole(role.id)}
                                  disabled={userCount > 0}
                                  title={userCount > 0 ? "Reassign users first" : "Delete role"}
                                  className="flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-md transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Box>
              </UserManagementTabs>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                {editingRoleId ? `Edit role: ${name}` : "Create new role"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSaveRole} className="p-5 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Role Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Designer"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Role Code</label>
                  <input
                    type="text"
                    value={code}
                    disabled={Boolean(editingRoleId)}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="designer"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Describe the responsibilities of this role"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="border-t border-slate-200 pt-3">
                <h4 className="font-bold text-slate-900 text-sm mb-3">Permissions</h4>
                <div className="space-y-4">
                  {Object.entries(groupedPermissions).map(([moduleName, perms]) => {
                    const ids = perms.map((p) => p.id);
                    const allSelected = ids.every((id) => selectedPermIds.includes(id));
                    return (
                      <div key={moduleName} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-bold text-xs text-blue-700 uppercase tracking-wider">{moduleName}</p>
                          <button
                            type="button"
                            onClick={() => handleToggleModule(ids)}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                          >
                            {allSelected ? "Clear module" : "Select module"}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {perms.map((perm) => {
                            const isChecked = selectedPermIds.includes(perm.id);
                            return (
                              <label
                                key={perm.id}
                                className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition ${
                                  isChecked
                                    ? "bg-blue-50/80 border-blue-300 text-blue-900"
                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={isChecked}
                                  onChange={() => handleTogglePermission(perm.id)}
                                />
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                                )}
                                <div>
                                  <p className="text-xs font-semibold">{perm.name}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">{perm.code}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 sticky bottom-0 bg-white py-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? "Saving..." : "Save Role & Permissions"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
