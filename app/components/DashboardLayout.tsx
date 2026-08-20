import { Page, Layout, Card, Text, Badge, Button, InlineStack, BlockStack, Box } from "@shopify/polaris";
import { Link, useLocation } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Users,
  ShieldCheck,
  History,
  LayoutDashboard,
  LogOut,
  Store,
  ChevronDown,
  ChevronRight,
  UserCog,
  ChevronsLeft,
  ChevronsRight,
  Palette,
  FolderKanban,
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentUser?: {
    email: string;
    name: string;
    roleName?: string;
    avatarUrl?: string | null;
  } | null;
}

export default function DashboardLayout({ children, currentUser }: DashboardLayoutProps) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const isTeamRoute = location.pathname.startsWith("/app/team");
  const isArtworkRoute = location.pathname.startsWith("/app/artworks");
  const isMediaRoute = location.pathname.startsWith("/app/media");

  // State toggle thu gọn / mở rộng sidebar (khởi tạo đồng bộ tức thì từ localStorage)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar_collapsed") === "true";
    }
    return false;
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const nextState = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("sidebar_collapsed", String(nextState));
      }
      return nextState;
    });
  };

  // Collapsible menu groups state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    userManagement: isTeamRoute || true,
    personalization: isArtworkRoute || true,
  });

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-[#f1f2f4] text-[#303030] antialiased">
      {/* Shopify Admin Style Top Header Bar */}
      <header className="h-14 bg-[#111213] text-white flex items-center justify-between px-4 z-20 shadow-xs border-b border-[#2a2b2d]">
        <div className="flex items-center gap-3">
          <Link to="/app" className="flex items-center gap-2.5 tracking-tight text-white hover:opacity-90 transition">
            <img
              src="https://bridgecustom.com/cdn/shop/files/logo_32560765-de91-4766-9226-9630dcbf7d4a.png"
              alt="BridgeCustom Logo"
              className="h-7 w-auto object-contain"
            />
          </Link>
        </div>

        {/* Right side user info */}
        <div className="flex items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 bg-[#262729] border border-[#383a3e] px-2.5 py-1 rounded-md text-gray-200 shadow-2xs">
            <Store className="w-3.5 h-3.5 text-gray-400" />
            <span className="font-medium text-[12px]">BridgeCustom Store</span>
          </div>

          <div className="flex items-center gap-2 bg-[#262729] border border-[#383a3e] px-2.5 py-1 rounded-md text-gray-200 shadow-2xs">
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="w-5 h-5 rounded-full object-cover shrink-0 border border-gray-600"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-[#005bd3] text-white flex items-center justify-center font-bold text-[10px]">
                {currentUser?.name?.[0]?.toUpperCase() || "A"}
              </div>
            )}
            <span className="font-medium text-[12px]">{currentUser?.name || "Admin"}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-[calc(100vh-3.5rem)]">
        {/* Shopify Admin Navigation Sidebar */}
        <aside
          className={`${
            isCollapsed ? "w-16 p-2 overflow-visible" : "w-60 p-2.5"
          } bg-[#ebebeb] border-r border-[#d2d5d9] flex flex-col justify-between shrink-0 transition-all duration-200 ease-in-out z-30`}
        >
          <nav className="space-y-1 text-xs">
            {/* Top Sleek Collapse Toggle Button */}
            <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"} mb-2 px-1`}>
              {!isCollapsed && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#616161]">
                  Navigation
                </span>
              )}
              <button
                type="button"
                onClick={toggleSidebar}
                className="w-7 h-7 bg-white border border-[#d2d5d9] hover:border-[#b0b4b9] text-[#616161] hover:text-[#1a1a1a] rounded-lg shadow-2xs flex items-center justify-center transition cursor-pointer shrink-0"
                title={isCollapsed ? "Expand menu" : "Collapse menu"}
              >
                {isCollapsed ? (
                  <ChevronsRight className="w-4 h-4 text-[#616161]" />
                ) : (
                  <ChevronsLeft className="w-4 h-4 text-[#616161]" />
                )}
              </button>
            </div>

            {/* Dashboard */}
            <Link
              to="/app"
              title="Dashboard"
              className={`flex items-center ${
                isCollapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2"
              } rounded-lg transition text-xs font-semibold ${
                isActive("/app")
                  ? "bg-white text-[#303030] shadow-xs border border-gray-200/80"
                  : "text-[#303030] hover:bg-[#e3e3e3]"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-[#616161] shrink-0" />
              {!isCollapsed && <span>Dashboard</span>}
            </Link>

            {/* Media Management (Shopify Admin Media Library) */}
            <Link
              to="/app/media"
              title="Media"
              className={`flex items-center ${
                isCollapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2"
              } rounded-lg transition text-xs font-semibold ${
                isMediaRoute
                  ? "bg-white text-[#303030] shadow-xs border border-gray-200/80"
                  : "text-[#303030] hover:bg-[#e3e3e3]"
              }`}
            >
              <FolderKanban className="w-4 h-4 text-[#616161] shrink-0" />
              {!isCollapsed && <span>Media</span>}
            </Link>

            {/* Personalization Group */}
            <div className="pt-1 relative group">
              {isCollapsed ? (
                <>
                  <Link
                    to="/app/artworks"
                    title="Artworks"
                    className={`w-full flex items-center justify-center px-0 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isArtworkRoute
                        ? "bg-white text-[#303030] shadow-xs border border-gray-200/80"
                        : "text-[#303030] hover:bg-[#e3e3e3]"
                    }`}
                  >
                    <Palette className="w-4 h-4 text-[#616161] shrink-0" />
                  </Link>

                  {/* Hover Flyout Popup Menu Container */}
                  <div className="absolute left-full top-0 pl-2 hidden group-hover:block z-50 w-56">
                    <div className="bg-white border border-gray-200 shadow-xl rounded-xl p-2 space-y-1 text-xs">
                      <div className="px-2.5 py-1 text-[11px] font-bold text-[#616161] uppercase border-b border-gray-100 mb-1">
                        Personalization
                      </div>
                      <Link
                        to="/app/artworks"
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition font-medium ${
                          isActive("/app/artworks")
                            ? "bg-[#eaf3ff] text-[#005bd3] font-bold"
                            : "text-[#303030] hover:bg-gray-100"
                        }`}
                      >
                        <Palette className="w-4 h-4 shrink-0" />
                        <span>Artworks</span>
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => toggleGroup("personalization")}
                    title="Personalization"
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-[#303030] hover:bg-[#e3e3e3] transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Palette className="w-4 h-4 text-[#616161] shrink-0" />
                      <span>Personalization</span>
                    </div>
                    {openGroups.personalization ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#616161]" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#616161]" />
                    )}
                  </button>

                  {/* Sub-menu Items when expanded */}
                  {openGroups.personalization && (
                    <div className="pl-6 space-y-1 mt-1">
                      <Link
                        to="/app/artworks"
                        title="Artworks"
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-xs font-medium ${
                          isActive("/app/artworks")
                            ? "bg-white text-[#303030] shadow-xs border border-gray-200/80 font-semibold"
                            : "text-[#616161] hover:bg-[#e3e3e3] hover:text-[#303030]"
                        }`}
                      >
                        <Palette className="w-3.5 h-3.5 text-[#616161] shrink-0" />
                        <span>Artworks</span>
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* User Management Group (Collapsed: Hover Flyout Popup / Expanded: Accordion) */}
            <div className="pt-1 relative group">
              {isCollapsed ? (
                <>
                  <button
                    type="button"
                    className={`w-full flex items-center justify-center px-0 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isTeamRoute
                        ? "bg-white text-[#303030] shadow-xs border border-gray-200/80"
                        : "text-[#303030] hover:bg-[#e3e3e3]"
                    }`}
                  >
                    <UserCog className="w-4 h-4 text-[#616161] shrink-0" />
                  </button>

                  {/* Hover Flyout Popup Menu Container */}
                  <div className="absolute left-full top-0 pl-2 hidden group-hover:block z-50 w-56">
                    <div className="bg-white border border-gray-200 shadow-xl rounded-xl p-2 space-y-1 text-xs">
                      <div className="px-2.5 py-1 text-[11px] font-bold text-[#616161] uppercase border-b border-gray-100 mb-1">
                        User Management
                      </div>
                      <Link
                        to="/app/team/users"
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition font-medium ${
                          isActive("/app/team/users")
                            ? "bg-[#eaf3ff] text-[#005bd3] font-bold"
                            : "text-[#303030] hover:bg-gray-100"
                        }`}
                      >
                        <Users className="w-4 h-4 shrink-0" />
                        <span>Team Members</span>
                      </Link>
                      <Link
                        to="/app/team/roles"
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition font-medium ${
                          isActive("/app/team/roles")
                            ? "bg-[#eaf3ff] text-[#005bd3] font-bold"
                            : "text-[#303030] hover:bg-gray-100"
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>Roles & Permissions</span>
                      </Link>
                      <Link
                        to="/app/team/audit-logs"
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition font-medium ${
                          isActive("/app/team/audit-logs")
                            ? "bg-[#eaf3ff] text-[#005bd3] font-bold"
                            : "text-[#303030] hover:bg-gray-100"
                        }`}
                      >
                        <History className="w-4 h-4 shrink-0" />
                        <span>Audit Logs</span>
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => toggleGroup("userManagement")}
                    title="User Management"
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-[#303030] hover:bg-[#e3e3e3] transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <UserCog className="w-4 h-4 text-[#616161] shrink-0" />
                      <span>User Management</span>
                    </div>
                    {openGroups.userManagement ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#616161]" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#616161]" />
                    )}
                  </button>

                  {/* Sub-menu Items when expanded */}
                  {openGroups.userManagement && (
                    <div className="pl-6 space-y-1 mt-1">
                      <Link
                        to="/app/team/users"
                        title="Team Members"
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-xs font-medium ${
                          isActive("/app/team/users")
                            ? "bg-white text-[#303030] shadow-xs border border-gray-200/80 font-semibold"
                            : "text-[#616161] hover:bg-[#e3e3e3] hover:text-[#303030]"
                        }`}
                      >
                        <Users className="w-3.5 h-3.5 text-[#616161] shrink-0" />
                        <span>Team Members</span>
                      </Link>

                      <Link
                        to="/app/team/roles"
                        title="Roles & Permissions"
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-xs font-medium ${
                          isActive("/app/team/roles")
                            ? "bg-white text-[#303030] shadow-xs border border-gray-200/80 font-semibold"
                            : "text-[#616161] hover:bg-[#e3e3e3] hover:text-[#303030]"
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-[#616161]" />
                        <span>Roles & Permissions</span>
                      </Link>

                      <Link
                        to="/app/team/audit-logs"
                        title="Audit Logs"
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-xs font-medium ${
                          isActive("/app/team/audit-logs")
                            ? "bg-white text-[#303030] shadow-xs border border-gray-200/80 font-semibold"
                            : "text-[#616161] hover:bg-[#e3e3e3] hover:text-[#303030]"
                        }`}
                      >
                        <History className="w-3.5 h-3.5 text-[#616161] shrink-0" />
                        <span>Audit Logs</span>
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          </nav>

          {/* User Profile Card Footer */}
          <div className={`${isCollapsed ? "p-1.5 flex flex-col items-center" : "p-3"} border border-gray-300/70 bg-white/75 rounded-lg shadow-xs`}>
            <div className={`flex items-center ${isCollapsed ? "flex-col gap-2" : "justify-between"}`}>
              <div className="flex items-center gap-2.5 min-w-0" title={currentUser?.email || "admin@bridgecustom.com"}>
                {currentUser?.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.name}
                    className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-200"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#005bd3] text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {currentUser?.name?.[0]?.toUpperCase() || "A"}
                  </div>
                )}
                {!isCollapsed && (
                  <div className="truncate">
                    <p className="text-xs font-bold text-[#303030] truncate">
                      {currentUser?.email || "admin@bridgecustom.com"}
                    </p>
                    <span className="inline-block text-[10px] bg-[#eaf3ff] text-[#005bd3] font-bold px-1.5 py-0.5 rounded uppercase mt-0.5">
                      {currentUser?.roleName || "SUPER_ADMIN"}
                    </span>
                  </div>
                )}
              </div>
              <Link
                to="/logout"
                title="Sign Out"
                className={`p-1.5 text-[#616161] hover:text-red-600 rounded-md transition hover:bg-gray-200 shrink-0 ${isCollapsed ? "" : "ml-1"}`}
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
