import { Page, Layout, Card, Text, Badge, Button, InlineStack, BlockStack, Box } from "@shopify/polaris";
import { Link, useLocation } from "@remix-run/react";
import { useState } from "react";
import { Users, ShieldCheck, History, LayoutDashboard, LogOut, Store, ChevronDown, ChevronRight, UserCog } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentUser?: {
    email: string;
    name: string;
    roleName?: string;
  } | null;
}

export default function DashboardLayout({ children, currentUser }: DashboardLayoutProps) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const isTeamRoute = location.pathname.startsWith("/app/team");

  // Collapsible menu groups state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    userManagement: isTeamRoute || true,
  });

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-[#f1f2f4] text-[#303030] antialiased">
      {/* Shopify Admin Style Top Header Bar */}
      <header className="h-14 bg-[#1a1a1a] text-white flex items-center justify-between px-4 z-20 shadow-xs border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <Link to="/app" className="flex items-center gap-2.5 tracking-tight text-white hover:text-gray-200">
            <img
              src="https://bridgecustom.com/cdn/shop/files/logo_32560765-de91-4766-9226-9630dcbf7d4a.png"
              alt="BridgeCustom Logo"
              className="h-7 w-auto object-contain"
            />
          </Link>
        </div>

        {/* Right side user info */}
        <div className="flex items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 bg-[#2c2c2c] border border-neutral-700/60 px-2.5 py-1 rounded-md text-gray-200">
            <Store className="w-3.5 h-3.5 text-gray-400" />
            <span className="font-medium text-[12px]">Store Admin</span>
          </div>

          <div className="flex items-center gap-2 bg-[#2c2c2c] border border-neutral-700/60 px-2.5 py-1 rounded-md text-gray-200">
            <div className="w-5 h-5 rounded-full bg-[#005bd3] text-white flex items-center justify-center font-bold text-[10px]">
              {currentUser?.name?.[0]?.toUpperCase() || "A"}
            </div>
            <span className="font-medium text-[12px]">{currentUser?.name || "Admin"}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-[calc(100vh-3.5rem)]">
        {/* Shopify Admin Navigation Sidebar */}
        <aside className="w-60 bg-[#ebebeb] border-r border-[#d2d5d9] flex flex-col justify-between shrink-0 p-2.5">
          <nav className="space-y-1 text-xs">
            <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#616161]">
              Main Menu
            </div>

            {/* Dashboard */}
            <Link
              to="/app"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition text-xs font-semibold ${
                isActive("/app")
                  ? "bg-white text-[#303030] shadow-xs border border-gray-200/80"
                  : "text-[#303030] hover:bg-[#e3e3e3]"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-[#616161]" />
              <span>Dashboard</span>
            </Link>

            {/* Collapsible User Management Group */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => toggleGroup("userManagement")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-[#303030] hover:bg-[#e3e3e3] transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <UserCog className="w-4 h-4 text-[#616161]" />
                  <span>User Management</span>
                </div>
                {openGroups.userManagement ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#616161]" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[#616161]" />
                )}
              </button>

              {/* Sub-menu Items */}
              {openGroups.userManagement && (
                <div className="pl-6 space-y-1 mt-1">
                  {/* Team Members */}
                  <Link
                    to="/app/team/users"
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-xs font-medium ${
                      isActive("/app/team/users")
                        ? "bg-white text-[#303030] shadow-xs border border-gray-200/80 font-semibold"
                        : "text-[#616161] hover:bg-[#e3e3e3] hover:text-[#303030]"
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-[#616161]" />
                    <span>Team Members</span>
                  </Link>

                  {/* Roles & Permissions */}
                  <Link
                    to="/app/team/roles"
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-xs font-medium ${
                      isActive("/app/team/roles")
                        ? "bg-white text-[#303030] shadow-xs border border-gray-200/80 font-semibold"
                        : "text-[#616161] hover:bg-[#e3e3e3] hover:text-[#303030]"
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#616161]" />
                    <span>Roles & Permissions</span>
                  </Link>

                  {/* Audit Logs */}
                  <Link
                    to="/app/team/audit-logs"
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-xs font-medium ${
                      isActive("/app/team/audit-logs")
                        ? "bg-white text-[#303030] shadow-xs border border-gray-200/80 font-semibold"
                        : "text-[#616161] hover:bg-[#e3e3e3] hover:text-[#303030]"
                    }`}
                  >
                    <History className="w-3.5 h-3.5 text-[#616161]" />
                    <span>Audit Logs</span>
                  </Link>
                </div>
              )}
            </div>
          </nav>

          {/* User Profile Card Footer */}
          <div className="p-3 border border-gray-300/70 bg-white/75 rounded-lg shadow-xs">
            <div className="flex items-center justify-between">
              <div className="truncate">
                <p className="text-xs font-bold text-[#303030] truncate">
                  {currentUser?.email || "admin@bridgecustom.com"}
                </p>
                <span className="inline-block text-[10px] bg-[#eaf3ff] text-[#005bd3] font-bold px-1.5 py-0.5 rounded uppercase mt-0.5">
                  {currentUser?.roleName || "SUPER_ADMIN"}
                </span>
              </div>
              <Link
                to="/logout"
                title="Sign Out"
                className="p-1.5 text-[#616161] hover:text-red-600 rounded-md transition hover:bg-gray-200"
              >
                <LogOut className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </aside>

        {/* Main Content Body - Full Width */}
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="w-full space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
