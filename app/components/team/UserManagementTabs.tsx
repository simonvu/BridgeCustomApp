import { Tabs } from "@shopify/polaris";
import { useLocation, useNavigate } from "@remix-run/react";
import type { ReactNode } from "react";

export const USER_MGMT_TABS = [
  { id: "team-users", content: "Team Members", path: "/app/team/users" },
  { id: "team-roles", content: "Roles & Permissions", path: "/app/team/roles" },
  { id: "team-audit-logs", content: "Audit Logs", path: "/app/team/audit-logs" },
];

export default function UserManagementTabs({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const selected = Math.max(
    0,
    USER_MGMT_TABS.findIndex((tab) => location.pathname.startsWith(tab.path))
  );

  return (
    <Tabs
      tabs={USER_MGMT_TABS.map((tab) => ({ id: tab.id, content: tab.content }))}
      selected={selected}
      onSelect={(index) => {
        const tab = USER_MGMT_TABS[index];
        if (tab && tab.path !== location.pathname) navigate(tab.path);
      }}
    >
      {children}
    </Tabs>
  );
}
