import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState } from "react";
import { Page, Layout, Card, Tabs, Box } from "@shopify/polaris";
import {
  ShieldCheck,
  Plus,
  Edit3,
  CheckSquare,
  Square,
  Users,
  History,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { logActivity } from "../services/rbac.server";
import { requireTeamUserId } from "../services/auth.server";

// Loader: Fetch Roles & Permissions
export async function loader({ request }: LoaderFunctionArgs) {
  const currentUserId = await requireTeamUserId(request);
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: { userRoles: { include: { role: true } } },
  });

  const roles = await prisma.role.findMany({
    include: {
      rolePermissions: {
        include: {
          permission: true,
        },
      },
      userRoles: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const permissions = await prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { action: "asc" }],
  });

  return json({
    currentUser: {
      email: currentUser?.email || "admin@bridgecustom.com",
      name: currentUser?.name || "Super Admin",
      roleName: currentUser?.userRoles?.[0]?.role?.code?.toUpperCase() || "SUPER_ADMIN",
    },
    roles,
    permissions,
  });
}

// Action: Create / Edit Role & Permissions
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "SAVE_ROLE") {
    const roleId = formData.get("roleId") as string;
    const name = formData.get("name") as string;
    const code = formData.get("code") as string;
    const description = formData.get("description") as string;
    const permissionIds = formData.getAll("permissionIds") as string[];

    if (!name) {
      return json({ error: "Role Name is required" }, { status: 400 });
    }

    let role;
    if (roleId) {
      // Update existing role
      role = await prisma.role.update({
        where: { id: roleId },
        data: { name, description },
      });

      // Update role permissions matrix
      await prisma.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissionIds.map((pId) => ({ roleId, permissionId: pId })),
        });
      }

      await logActivity({
        action: "UPDATE_ROLE",
        resource: `role:${roleId}`,
        payload: { name, permissionIds },
      });
    } else {
      // Create new role
      const finalCode = code || name.toLowerCase().replace(/\s+/g, "_");
      role = await prisma.role.create({
        data: {
          name,
          code: finalCode,
          description,
        },
      });

      if (permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissionIds.map((pId) => ({ roleId: role.id, permissionId: pId })),
        });
      }

      await logActivity({
        action: "CREATE_ROLE",
        resource: `role:${role.id}`,
        payload: { name, code: finalCode, permissionIds },
      });
    }

    return json({ success: true });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function TeamRolesRoute() {
  const { currentUser, roles, permissions } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermIds, setSelectedPermIds] = useState<string[]>([]);

  const isSubmitting = navigation.state === "submitting";

  const tabs = [
    { id: "team-users", content: "Team Members", url: "/app/team/users" },
    { id: "team-roles", content: "Roles & Permissions", url: "/app/team/roles" },
    { id: "team-audit-logs", content: "Audit Logs", url: "/app/team/audit-logs" },
  ];

  const handleOpenCreateModal = () => {
    setEditingRoleId(null);
    setName("");
    setCode("");
    setDescription("");
    setSelectedPermIds([]);
    setModalOpen(true);
  };

  const handleOpenEditModal = (role: (typeof roles)[0]) => {
    setEditingRoleId(role.id);
    setName(role.name);
    setCode(role.code);
    setDescription(role.description || "");
    setSelectedPermIds(role.rolePermissions.map((rp) => rp.permissionId));
    setModalOpen(true);
  };

  const handleTogglePermission = (permId: string) => {
    setSelectedPermIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  };

  const handleToggleModule = (permIdsInModule: string[]) => {
    const allSelected = permIdsInModule.every((id) => selectedPermIds.includes(id));
    if (allSelected) {
      setSelectedPermIds((prev) => prev.filter((id) => !permIdsInModule.includes(id)));
    } else {
      setSelectedPermIds((prev) => Array.from(new Set([...prev, ...permIdsInModule])));
    }
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("intent", "SAVE_ROLE");
    if (editingRoleId) formData.append("roleId", editingRoleId);
    formData.append("name", name);
    formData.append("code", code);
    formData.append("description", description);
    selectedPermIds.forEach((id) => formData.append("permissionIds", id));

    submit(formData, { method: "post" });
    setModalOpen(false);
  };

  // Group permissions by Module
  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.module]) acc[perm.module] = [];
    acc[perm.module].push(perm);
    return acc;
  }, {} as Record<string, typeof permissions>);

  return (
    <DashboardLayout currentUser={currentUser}>
      <Page
        fullWidth
        title="User Management"
        subtitle="Manage team members, assign access roles, and configure security credentials"
        primaryAction={{
          content: "Create New Role",
          onAction: handleOpenCreateModal,
        }}
      >
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <Tabs tabs={tabs} selected={1}>
                <Box padding="400">

      {/* Roles Grid */}
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
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-base">{role.name}</h3>
                  {role.isSystem && (
                    <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200">
                      System Preset
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-slate-500">Code: {role.code}</p>
                <p className="text-xs text-slate-600 min-h-[36px]">
                  {role.description || "No description available for this role."}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-[11px] text-slate-500 font-medium space-x-2">
                  <span>{permCount} / {permissions.length} permissions</span>
                  <span>•</span>
                  <span>{userCount} users</span>
                </div>
                <button
                  onClick={() => handleOpenEditModal(role)}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-md transition"
                >
                  <Edit3 className="w-3 h-3" /> Edit Permissions
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Role Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                {editingRoleId ? `Edit Permissions: ${name}` : "Create New Role"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="p-5 space-y-4 overflow-y-auto flex-1">
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
                    placeholder="e.g. Designer / Fulfillment"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {!editingRoleId && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Role Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="designer"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Describe the responsibilities and scope of this role"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="border-t border-slate-200 pt-3">
                <h4 className="font-bold text-slate-900 text-sm mb-3">
                  Permissions Matrix
                </h4>

                <div className="space-y-4">
                  {Object.entries(groupedPermissions).map(([moduleName, perms]) => (
                    <div key={moduleName} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <p className="font-bold text-xs text-blue-700 uppercase tracking-wider mb-2">
                        MODULE: {moduleName}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {perms.map((perm) => {
                          const isChecked = selectedPermIds.includes(perm.id);
                          return (
                            <label
                              key={perm.id}
                              onClick={() => handleTogglePermission(perm.id)}
                              className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition ${
                                isChecked
                                  ? "bg-blue-50/80 border-blue-300 text-blue-900"
                                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                              }`}
                            >
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
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 sticky bottom-0 bg-white py-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm"
                >
                  {isSubmitting ? "Saving..." : "Save Role & Permissions"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
                </Box>
              </Tabs>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </DashboardLayout>
  );
}
