import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { Page, Layout, Card, Tabs, Box } from "@shopify/polaris";
import { History, Search, Clock, Filter } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { requireTeamUserId } from "../services/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUserId = await requireTeamUserId(request);
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: { userRoles: { include: { role: true } } },
  });

  const auditLogs = await prisma.auditLog.findMany({
    include: {
      user: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return json({
    currentUser: {
      email: currentUser?.email || "admin@bridgecustom.com",
      name: currentUser?.name || "Super Admin",
      roleName: currentUser?.userRoles?.[0]?.role?.code?.toUpperCase() || "SUPER_ADMIN",
    },
    auditLogs,
  });
}

export default function AuditLogsRoute() {
  const { currentUser, auditLogs } = useLoaderData<typeof loader>();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("ALL");

  const tabs = [
    { id: "team-users", content: "Team Members", url: "/app/team/users" },
    { id: "team-roles", content: "Roles & Permissions", url: "/app/team/roles" },
    { id: "team-audit-logs", content: "Audit Logs", url: "/app/team/audit-logs" },
  ];

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.user?.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.user?.name || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = filterAction === "ALL" || log.action === filterAction;

    return matchesSearch && matchesAction;
  });

  return (
    <DashboardLayout currentUser={currentUser}>
      <Page
        fullWidth
        title="User Management"
        subtitle="Manage team members, assign access roles, and configure security credentials"
      >
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <Tabs tabs={tabs} selected={2}>
                <Box padding="400">
                  {/* Filter & Search Bar */}
                  <div className="flex flex-col md:flex-row gap-3 items-center justify-between mb-4">
                    <div className="relative flex-1 w-full">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search by user name, email, action, resource..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <Filter className="w-4 h-4 text-slate-400" />
                      <select
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value)}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="ALL">All Actions</option>
                        <option value="CREATE_USER">CREATE_USER</option>
                        <option value="UPDATE_USER">UPDATE_USER</option>
                        <option value="CREATE_ROLE">CREATE_ROLE</option>
                        <option value="UPDATE_ROLE">UPDATE_ROLE</option>
                        <option value="DISABLE_USER">DISABLE_USER</option>
                        <option value="ENABLE_USER">ENABLE_USER</option>
                      </select>
                    </div>
                  </div>

                  {/* Audit Logs Table */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                          <tr>
                            <th className="p-4">Timestamp</th>
                            <th className="p-4">User</th>
                            <th className="p-4">Action</th>
                            <th className="p-4">Resource</th>
                            <th className="p-4">Payload Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredLogs.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-slate-400 text-sm">
                                No matching audit logs found
                              </td>
                            </tr>
                          ) : (
                            filteredLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-slate-50 transition">
                                <td className="p-4 text-xs font-mono text-slate-500 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    {new Date(log.createdAt).toLocaleString("en-US", {
                                      dateStyle: "short",
                                      timeStyle: "medium",
                                    })}
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                                      {log.user?.name?.[0]?.toUpperCase() || "S"}
                                    </div>
                                    <div>
                                      <p className="font-semibold text-slate-900 text-xs">{log.user?.name || "System"}</p>
                                      <p className="text-[10px] text-slate-400">{log.user?.email || "system@internal"}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <span className="bg-blue-100 text-blue-700 font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-blue-200">
                                    {log.action}
                                  </span>
                                </td>
                                <td className="p-4 text-xs font-mono text-slate-700">{log.resource}</td>
                                <td className="p-4 text-xs font-mono text-slate-500 max-w-xs truncate">
                                  {log.payload || "—"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Box>
              </Tabs>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </DashboardLayout>
  );
}
