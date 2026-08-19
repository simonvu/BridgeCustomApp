import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
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
  Tabs,
} from "@shopify/polaris";
import bcrypt from "bcryptjs";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { logActivity } from "../services/rbac.server";
import { requireTeamUserId } from "../services/auth.server";

// Loader: Fetch Users & Roles
export async function loader({ request }: LoaderFunctionArgs) {
  const currentUserId = await requireTeamUserId(request);
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: { userRoles: { include: { role: true } } },
  });

  const users = await prisma.user.findMany({
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
  });

  return json({
    currentUser: {
      email: currentUser?.email || "admin@bridgecustom.com",
      name: currentUser?.name || "Super Admin",
      roleName: currentUser?.userRoles?.[0]?.role?.code?.toUpperCase() || "SUPER_ADMIN",
    },
    users,
    roles,
  });
}

// Action: Create / Edit / Toggle User Status
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "SAVE_USER") {
    const userId = formData.get("userId") as string;
    const email = formData.get("email") as string;
    const name = formData.get("name") as string;
    const password = formData.get("password") as string;
    const roleId = formData.get("roleId") as string;

    if (!email || !name) {
      return json({ error: "Email and Full Name are required" }, { status: 400 });
    }

    let user;
    if (userId) {
      // Update User
      const updateData: any = { email, name };
      if (password && password.trim() !== "") {
        updateData.passwordHash = bcrypt.hashSync(password, 10);
      }
      user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      await prisma.userRole.deleteMany({ where: { userId } });
      if (roleId) {
        await prisma.userRole.create({ data: { userId, roleId } });
      }

      await logActivity({
        action: "UPDATE_USER",
        resource: `user:${userId}`,
        payload: { email, name, roleId },
      });
    } else {
      // Create User
      const passwordHash = bcrypt.hashSync(password || "admin123", 10);
      user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          isActive: true,
        },
      });

      if (roleId) {
        await prisma.userRole.create({ data: { userId: user.id, roleId } });
      }

      await logActivity({
        action: "CREATE_USER",
        resource: `user:${user.id}`,
        payload: { email, name, roleId },
      });
    }

    return json({ success: true });
  }

  if (intent === "TOGGLE_ACTIVE") {
    const userId = formData.get("userId") as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (user) {
      await prisma.user.update({
        where: { id: userId },
        data: { isActive: !user.isActive },
      });

      await logActivity({
        action: user.isActive ? "DISABLE_USER" : "ENABLE_USER",
        resource: `user:${userId}`,
      });
    }

    return json({ success: true });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function TeamUsersRoute() {
  const { currentUser, users, roles } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id || "");
  const [queryValue, setQueryValue] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  const isSubmitting = navigation.state === "submitting";

  const handleOpenCreateModal = useCallback(() => {
    setEditingUserId(null);
    setEmail("");
    setName("");
    setPassword("");
    setSelectedRoleId(roles[0]?.id || "");
    setModalOpen(true);
  }, [roles]);

  const handleOpenEditModal = (user: (typeof users)[0]) => {
    setEditingUserId(user.id);
    setEmail(user.email);
    setName(user.name);
    setPassword("");
    setSelectedRoleId(user.userRoles[0]?.roleId || roles[0]?.id || "");
    setModalOpen(true);
  };

  const handleSaveUser = () => {
    const formData = new FormData();
    formData.append("intent", "SAVE_USER");
    if (editingUserId) formData.append("userId", editingUserId);
    formData.append("email", email);
    formData.append("name", name);
    formData.append("password", password);
    formData.append("roleId", selectedRoleId);

    submit(formData, { method: "post" });
    setModalOpen(false);
  };

  const handleToggleActive = (userId: string) => {
    submit({ intent: "TOGGLE_ACTIVE", userId }, { method: "post" });
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(queryValue.toLowerCase()) ||
      u.email.toLowerCase().includes(queryValue.toLowerCase());

    const matchesRole =
      roleFilter === "ALL" || u.userRoles.some((ur) => ur.role.id === roleFilter);

    return matchesSearch && matchesRole;
  });

  const resourceName = {
    singular: "user",
    plural: "users",
  };

  const roleFilterOptions = [
    { label: "All Roles", value: "ALL" },
    ...roles.map((r) => ({ label: r.name, value: r.id })),
  ];

  const roleOptions = roles.map((r) => ({ label: `${r.name} (${r.code})`, value: r.id }));

  const tabs = [
    { id: "team-users", content: "Team Members", url: "/app/team/users" },
    { id: "team-roles", content: "Roles & Permissions", url: "/app/team/roles" },
    { id: "team-audit-logs", content: "Audit Logs", url: "/app/team/audit-logs" },
  ];

  const rowMarkup = filteredUsers.map((user, index) => {
    const assignedRoles = user.userRoles.map((ur) => ur.role);
    return (
      <IndexTable.Row id={user.id} key={user.id} position={index}>
        <IndexTable.Cell>
          <InlineStack gap="300" blockAlign="center">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              {user.name?.[0]?.toUpperCase() || "U"}
            </div>
            <BlockStack gap="050">
              <Text variant="bodyMd" fontWeight="bold" as="span">
                {user.name}
              </Text>
              <Text variant="bodyXs" tone="subdued" as="span">
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
          <Badge tone={user.isActive ? "success" : "critical"}>
            {user.isActive ? "Active" : "Disabled"}
          </Badge>
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
        subtitle="Manage team members, assign access roles, and configure security credentials"
        primaryAction={{
          content: "Add Team Member",
          onAction: handleOpenCreateModal,
        }}
      >
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <Tabs tabs={tabs} selected={0}>
                <Box padding="400">
                  <InlineStack gap="300" align="space-between">
                    <div className="flex-1">
                      <TextField
                        label="Search team members"
                        labelHidden
                        value={queryValue}
                        onChange={setQueryValue}
                        placeholder="Search by user name or email..."
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
                  resourceName={resourceName}
                  itemCount={filteredUsers.length}
                  selectable={false}
                  headings={[
                    { title: "User Member" },
                    { title: "Email" },
                    { title: "Assigned Roles" },
                    { title: "Status" },
                    { title: "Created Date" },
                    { title: "Actions", alignment: "end" },
                  ]}
                >
                  {rowMarkup}
                </IndexTable>
              </Tabs>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Modal Add / Edit User */}
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingUserId ? "Edit Team Member" : "Add New Team Member"}
          primaryAction={{
            content: "Save Member",
            onAction: handleSaveUser,
            loading: isSubmitting,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Full Name"
                value={name}
                onChange={setName}
                autoComplete="off"
                placeholder="e.g. John Doe"
              />
              <TextField
                label="Email Address"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="off"
                placeholder="john@bridgecustom.com"
              />
              <TextField
                label={editingUserId ? "Password (Leave empty to keep existing)" : "Password"}
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <Select
                label="Assign Role"
                options={roleOptions}
                value={selectedRoleId}
                onChange={setSelectedRoleId}
              />
            </FormLayout>
          </Modal.Section>
        </Modal>
      </Page>
    </DashboardLayout>
  );
}
