import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useMemo, useState } from "react";
import { Page, Layout, Card, Box } from "@shopify/polaris";
import { Search, Clock, Filter } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import UserManagementTabs from "../components/team/UserManagementTabs";
import prisma from "../db.server";
import { requireTeamPage } from "../services/team.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { currentUser } = await requireTeamPage(request, "system:audit_logs:read");

  const auditLogs = await prisma.auditLog.findMany({
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return json({ currentUser, auditLogs });
}

function parsePayload(raw: string | null) {
  if (!raw) return "—";
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

export default function AuditLogsRoute() {
  const { currentUser, auditLogs } = useLoaderData<typeof loader>();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("ALL");

  const actionOptions = useMemo(() => {
    const unique = Array.from(new Set(auditLogs.map((log) => log.action))).sort();
    return unique;
  }, [auditLogs]);

  const filteredLogs = auditLogs.filter((log) => {
    const haystack = `${log.action} ${log.resource} ${log.user?.email || ""} ${log.user?.name || ""}`.toLowerCase();
    const matchesSearch = haystack.includes(searchTerm.toLowerCase());
    const matchesAction = filterAction === "ALL" || log.action === filterAction;
    return matchesSearch && matchesAction;
  });

  return (
    <DashboardLayout currentUser={currentUser}>
      <Page
        fullWidth
        title="User Management"
        subtitle="Manage team members, assign roles, and review account activity"
      >
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <UserManagementTabs>
                <Box padding="400">
                  <div className="flex flex-col md:flex-row gap-3 items-center justify-between mb-4">
                    <div className="relative flex-1 w-full">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search by user, action, or resource..."
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
                        <option value="ALL">All actions</option>
                        {actionOptions.map((action) => (
                          <option key={action} value={action}>
                            {action}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                          <tr>
                            <th className="p-4">Timestamp</th>
                            <th className="p-4">User</th>
                            <th className="p-4">Action</th>
                            <th className="p-4">Resource</th>
                            <th className="p-4">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredLogs.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-slate-400 text-sm">
                                No audit logs yet. Create or edit a team member to generate the first entry.
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
                                    {log.user?.avatarUrl ? (
                                      <img
                                        src={log.user.avatarUrl}
                                        alt=""
                                        className="w-6 h-6 rounded-full object-cover border border-slate-200"
                                      />
                                    ) : (
                                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                                        {log.user?.name?.[0]?.toUpperCase() || "S"}
                                      </div>
                                    )}
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
                                <td className="p-4 text-xs font-mono text-slate-500 max-w-xs truncate" title={parsePayload(log.payload)}>
                                  {parsePayload(log.payload)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Box>
              </UserManagementTabs>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </DashboardLayout>
  );
}
