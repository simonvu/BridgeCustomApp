import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { useCallback, useEffect, useState } from "react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  Modal,
  FormLayout,
  TextField,
  Select,
  InlineStack,
  BlockStack,
  Box,
  Banner,
} from "@shopify/polaris";
import bcrypt from "bcryptjs";
import DashboardLayout from "../components/DashboardLayout";
import UserManagementTabs from "../components/team/UserManagementTabs";
import prisma from "../db.server";
import { logActivity } from "../services/rbac.server";
import { isSuperAdminUser, requestIp, requireTeamPage } from "../services/team.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { currentUser, userId: currentUserId } = await requireTeamPage(request, "system:users:read");

  const users = await prisma.user.findMany({
    include: { userRoles: { include: { role: true } } },
    orderBy: { createdAt: "desc" },
  });

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
  });

  return json({ currentUser, currentUserId, users, roles });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const perm =
    intent === "TOGGLE_ACTIVE"
      ? "system:users:delete"
      : formData.get("userId")
        ? "system:users:update"
        : "system:users:create";
  const { userId: actorId } = await requireTeamPage(request, perm);
  const ipAddress = requestIp(request);

  if (intent === "SAVE_USER") {
    const userId = String(formData.get("userId") || "");
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const name = String(formData.get("name") || "").trim();
    const password = String(formData.get("password") || "");
    const roleId = String(formData.get("roleId") || "");
    const avatarUrl = String(formData.get("avatarUrl") || "").trim();

    if (!email || !name) {
      return json({ error: "Email and full name are required." }, { status: 400 });
    }
    if (!userId && password.trim().length < 8) {
      return json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (userId && password.trim() && password.trim().length < 8) {
      return json({ error: "New password must be at least 8 characters." }, { status: 400 });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail && existingEmail.id !== userId) {
      return json({ error: "A team member with this email already exists." }, { status: 400 });
    }

    try {
      let savedId = userId;
      if (userId) {
        const target = await prisma.user.findUnique({
          where: { id: userId },
          include: { userRoles: { include: { role: true } } },
        });
        if (!target) return json({ error: "User not found." }, { status: 404 });

        if (userId === actorId && isSuperAdminUser(target) && roleId) {
          const nextRole = await prisma.role.findUnique({ where: { id: roleId } });
          if (nextRole && nextRole.code.toLowerCase() !== "super_admin") {
            return json({ error: "You cannot remove your own Super Admin role." }, { status: 400 });
          }
        }

        const updateData: { email: string; name: string; avatarUrl: string | null; passwordHash?: string } = {
          email,
          name,
          avatarUrl: avatarUrl || null,
        };
        if (password.trim()) updateData.passwordHash = bcrypt.hashSync(password, 10);

        await prisma.user.update({ where: { id: userId }, data: updateData });
        await prisma.userRole.deleteMany({ where: { userId } });
        if (roleId) await prisma.userRole.create({ data: { userId, roleId } });

        await logActivity({
          userId: actorId,
          action: "UPDATE_USER",
          resource: `user:${userId}`,
          payload: { email, name, roleId },
          ipAddress,
        });
      } else {
        const user = await prisma.user.create({
          data: {
            email,
            name,
            passwordHash: bcrypt.hashSync(password, 10),
            avatarUrl: avatarUrl || null,
            isActive: true,
          },
        });
        savedId = user.id;
        if (roleId) await prisma.userRole.create({ data: { userId: user.id, roleId } });
        await logActivity({
          userId: actorId,
          action: "CREATE_USER",
          resource: `user:${user.id}`,
          payload: { email, name, roleId },
          ipAddress,
        });
      }

      return json({ success: true, savedId });
    } catch (error) {
      console.error("SAVE_USER failed", error);
      return json({ error: "Could not save team member. Check email uniqueness and try again." }, { status: 400 });
    }
  }

  if (intent === "TOGGLE_ACTIVE") {
    const targetId = String(formData.get("userId") || "");
    if (!targetId) return json({ error: "Missing user." }, { status: 400 });
    if (targetId === actorId) {
      return json({ error: "You cannot disable your own account." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) return json({ error: "User not found." }, { status: 404 });

    if (user.isActive && isSuperAdminUser(user)) {
      const otherAdmins = await prisma.userRole.count({
        where: {
          role: { code: "super_admin" },
          user: { isActive: true, id: { not: targetId } },
        },
      });
      if (otherAdmins === 0) {
        return json({ error: "Cannot disable the last Super Admin." }, { status: 400 });
      }
    }

    await prisma.user.update({
      where: { id: targetId },
      data: { isActive: !user.isActive },
    });
    await logActivity({
      userId: actorId,
      action: user.isActive ? "DISABLE_USER" : "ENABLE_USER",
      resource: `user:${targetId}`,
      ipAddress,
    });
    return json({ success: true });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function TeamUsersRoute() {
  const { currentUser, currentUserId, users, roles } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id || "");
  const [queryValue, setQueryValue] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
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

  const handleOpenCreateModal = useCallback(() => {
    setEditingUserId(null);
    setEmail("");
    setName("");
    setPassword("");
    setAvatarUrl("");
    setAvatarPreview("");
    setSelectedRoleId(roles[0]?.id || "");
    setFormError(null);
    setModalOpen(true);
  }, [roles]);

  const handleOpenEditModal = (user: (typeof users)[0]) => {
    setEditingUserId(user.id);
    setEmail(user.email);
    setName(user.name);
    setPassword("");
    setAvatarUrl(user.avatarUrl || "");
    setAvatarPreview(user.avatarUrl || "");
    setSelectedRoleId(user.userRoles[0]?.roleId || roles[0]?.id || "");
    setFormError(null);
    setModalOpen(true);
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localBlobUrl = URL.createObjectURL(file);
    setAvatarPreview(localBlobUrl);
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "avatars");
      const response = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await response.json();
      if (data.success && data.url) {
        setAvatarUrl(data.url);
        setAvatarPreview(data.url);
      } else {
        setFormError(data.error || "Failed to upload image");
      }
    } catch (error) {
      console.error("Upload avatar error:", error);
      setFormError("Error uploading avatar");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveUser = () => {
    setFormError(null);
    if (!name.trim() || !email.trim()) {
      setFormError("Email and full name are required.");
      return;
    }
    if (!editingUserId && password.trim().length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    const fd = new FormData();
    fd.append("intent", "SAVE_USER");
    if (editingUserId) fd.append("userId", editingUserId);
    fd.append("email", email);
    fd.append("name", name);
    fd.append("password", password);
    fd.append("avatarUrl", avatarUrl);
    fd.append("roleId", selectedRoleId);
    submit(fd, { method: "post" });
  };

  const handleToggleActive = (userId: string) => {
    setFormError(null);
    submit({ intent: "TOGGLE_ACTIVE", userId }, { method: "post" });
  };

  const filteredUsers = users.filter((u) => {
    const q = queryValue.toLowerCase();
    const matchesSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchesRole = roleFilter === "ALL" || u.userRoles.some((ur) => ur.role.id === roleFilter);
    return matchesSearch && matchesRole;
  });

  const roleFilterOptions = [
    { label: "All Roles", value: "ALL" },
    ...roles.map((r) => ({ label: r.name, value: r.id })),
  ];
  const roleOptions = roles.map((r) => ({ label: `${r.name} (${r.code})`, value: r.id }));

  const rowMarkup = filteredUsers.map((user, index) => {
    const assignedRoles = user.userRoles.map((ur) => ur.role);
    const isSelf = user.id === currentUserId;
    return (
      <IndexTable.Row id={user.id} key={user.id} position={index}>
        <IndexTable.Cell>
          <InlineStack gap="300" blockAlign="center">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                {user.name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <BlockStack gap="050">
              <Text variant="bodyMd" fontWeight="bold" as="span">
                {user.name}
                {isSelf ? " (you)" : ""}
              </Text>
              <Text variant="bodySm" tone="subdued" as="span">
                ID: {user.id.slice(0, 8)}
              </Text>
            </BlockStack>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>{user.email}</IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="100">
            {assignedRoles.length === 0 ? (
              <Text variant="bodySm" tone="subdued" as="span">
                No roles assigned
              </Text>
            ) : (
              assignedRoles.map((role) => (
                <Badge tone="info" key={role.id}>
                  {role.name}
                </Badge>
              ))
            )}
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={user.isActive ? "success" : "critical"}>{user.isActive ? "Active" : "Disabled"}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {new Date(user.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" align="end">
            <Button size="micro" onClick={() => handleOpenEditModal(user)}>
              Edit
            </Button>
            <Button
              size="micro"
              tone={user.isActive ? "critical" : "success"}
              disabled={isSelf}
              onClick={() => handleToggleActive(user.id)}
            >
              {user.isActive ? "Disable" : "Enable"}
            </Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <DashboardLayout currentUser={currentUser}>
      <Page
        fullWidth
        title="User Management"
        subtitle="Manage team members, assign roles, and review account activity"
        primaryAction={{ content: "Add Team Member", onAction: handleOpenCreateModal }}
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
                  <InlineStack gap="300" align="space-between">
                    <div className="flex-1">
                      <TextField
                        label="Search team members"
                        labelHidden
                        value={queryValue}
                        onChange={setQueryValue}
                        placeholder="Search by name or email..."
                        autoComplete="off"
                      />
                    </div>
                    <div className="w-64">
                      <Select
                        label="Filter by Role"
                        labelHidden
                        options={roleFilterOptions}
                        value={roleFilter}
                        onChange={setRoleFilter}
                      />
                    </div>
                  </InlineStack>
                </Box>
                <IndexTable
                  resourceName={{ singular: "user", plural: "users" }}
                  itemCount={filteredUsers.length}
                  selectable={false}
                  headings={[
                    { title: "Team member" },
                    { title: "Email" },
                    { title: "Role" },
                    { title: "Status" },
                    { title: "Created" },
                    { title: "Actions", alignment: "end" },
                  ]}
                >
                  {rowMarkup}
                </IndexTable>
              </UserManagementTabs>
            </Card>
          </Layout.Section>
        </Layout>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingUserId ? "Edit Team Member" : "Add New Team Member"}
          primaryAction={{
            content: "Save Member",
            onAction: handleSaveUser,
            loading: isSubmitting || isUploading,
          }}
          secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
        >
          <Modal.Section>
            <FormLayout>
              {formError && (
                <Banner tone="critical">
                  <p>{formError}</p>
                </Banner>
              )}
              <div className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                {avatarPreview || avatarUrl ? (
                  <img
                    src={avatarPreview || avatarUrl}
                    alt="Avatar preview"
                    className="w-14 h-14 rounded-full object-cover border-2 border-blue-500 shadow-xs shrink-0 bg-white"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg shrink-0">
                    {name?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
                <div className="space-y-1.5 flex-1">
                  <label className="block text-xs font-semibold text-slate-700">Avatar</label>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-md transition shadow-xs">
                      {isUploading ? "Uploading..." : "Choose Image..."}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarFileChange}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>
                    {(avatarPreview || avatarUrl) && (
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarUrl("");
                          setAvatarPreview("");
                        }}
                        className="text-xs text-red-600 hover:text-red-800 font-medium underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <TextField label="Full Name" value={name} onChange={setName} autoComplete="off" placeholder="e.g. John Doe" />
              <TextField
                label="Email Address"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="off"
                placeholder="john@bridgecustom.com"
              />
              <TextField
                label={editingUserId ? "Password (leave empty to keep current)" : "Password"}
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                helpText={editingUserId ? undefined : "At least 8 characters"}
              />
              <Select label="Assign Role" options={roleOptions} value={selectedRoleId} onChange={setSelectedRoleId} />
            </FormLayout>
          </Modal.Section>
        </Modal>
      </Page>
    </DashboardLayout>
  );
}
