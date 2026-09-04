import { Link, useLocation } from "@remix-run/react";
import { useEffect, useState, type ComponentType } from "react";
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
  Type,
  Sparkles,
  Package,
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentUser?: {
    email: string;
    name: string;
    roleName?: string;
    avatarUrl?: string | null;
    permissions?: string[];
  } | null;
  contentPaddingClassName?: string;
}

function canAccess(permissions: string[] | undefined, code: string) {
  if (!permissions?.length) return false;
  return permissions.includes("system:all") || permissions.includes(code);
}

type IconType = ComponentType<{ className?: string }>;

type NavLinkItem = {
  label: string;
  to: string;
  icon: IconType;
  permission: string;
  isActive: (pathname: string) => boolean;
};

type NavGroupDef = {
  key: string;
  label: string;
  icon: IconType;
  items: NavLinkItem[];
};

const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed";

const NAV_GROUPS: NavGroupDef[] = [
  {
    key: "personalization",
    label: "Personalization",
    icon: Palette,
    items: [
      {
        label: "Artworks",
        to: "/app/artworks",
        icon: Palette,
        permission: "artworks:items:read",
        isActive: (p) => p.startsWith("/app/artworks"),
      },
      {
        label: "Clip Art",
        to: "/app/cliparts",
        icon: Package,
        permission: "cliparts:items:read",
        isActive: (p) => p.startsWith("/app/cliparts"),
      },
      {
        label: "Font Library",
        to: "/app/fonts",
        icon: Type,
        permission: "fonts:items:read",
        isActive: (p) => p.startsWith("/app/fonts"),
      },
      {
        label: "Doodle Alphabets",
        to: "/app/doodles",
        icon: Sparkles,
        permission: "doodles:packs:read",
        isActive: (p) => p.startsWith("/app/doodles"),
      },
    ],
  },
  {
    key: "userManagement",
    label: "User Management",
    icon: UserCog,
    items: [
      {
        label: "Team Members",
        to: "/app/team/users",
        icon: Users,
        permission: "system:users:read",
        isActive: (p) => p.startsWith("/app/team/users"),
      },
      {
        label: "Roles & Permissions",
        to: "/app/team/roles",
        icon: ShieldCheck,
        permission: "system:roles:read",
        isActive: (p) => p.startsWith("/app/team/roles"),
      },
      {
        label: "Audit Logs",
        to: "/app/team/audit-logs",
        icon: History,
        permission: "system:audit_logs:read",
        isActive: (p) => p.startsWith("/app/team/audit-logs"),
      },
    ],
  },
];

function groupsForPath(pathname: string): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const group of NAV_GROUPS) {
    next[group.key] = group.items.some((item) => item.isActive(pathname));
  }
  return next;
}

function NavItemLink({
  item,
  pathname,
  collapsed,
  compact,
}: {
  item: NavLinkItem;
  pathname: string;
  collapsed?: boolean;
  compact?: boolean;
}) {
  const active = item.isActive(pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      title={item.label}
      className={
        collapsed
          ? `flex items-center justify-center px-0 py-2.5 rounded-lg text-xs font-semibold transition ${
              active
                ? "bg-white text-[#303030] shadow-xs border border-gray-200/80"
                : "text-[#303030] hover:bg-[#e3e3e3]"
            }`
          : compact
            ? `flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-xs font-medium ${
                active
                  ? "bg-white text-[#303030] shadow-xs border border-gray-200/80 font-semibold"
                  : "text-[#616161] hover:bg-[#e3e3e3] hover:text-[#303030]"
              }`
            : `flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition font-medium ${
                active ? "bg-[#eaf3ff] text-[#005bd3] font-bold" : "text-[#303030] hover:bg-gray-100"
              }`
      }
    >
      <Icon className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} text-[#616161] shrink-0`} />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

function NavGroup({
  group,
  pathname,
  collapsed,
  isOpen,
  onToggle,
}: {
  group: NavGroupDef;
  pathname: string;
  collapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = group.icon;
  const groupActive = group.items.some((item) => item.isActive(pathname));

  if (collapsed) {
    return (
      <div className="pt-1 relative group/nav">
        <button
          type="button"
          title={group.label}
          className={`w-full flex items-center justify-center px-0 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
            groupActive
              ? "bg-white text-[#303030] shadow-xs border border-gray-200/80"
              : "text-[#303030] hover:bg-[#e3e3e3]"
          }`}
        >
          <Icon className="w-4 h-4 text-[#616161] shrink-0" />
        </button>
        <div className="absolute left-full top-0 z-50 w-56 pl-2 opacity-0 invisible pointer-events-none translate-x-0.5 group-hover/nav:opacity-100 group-hover/nav:visible group-hover/nav:pointer-events-auto group-hover/nav:translate-x-0 transition duration-150">
          <div className="bg-white border border-gray-200 shadow-xl rounded-xl p-2 space-y-1 text-xs">
            <div className="px-2.5 py-1 text-[11px] font-bold text-[#616161] uppercase border-b border-gray-100 mb-1">
              {group.label}
            </div>
            {group.items.map((item) => (
              <NavItemLink key={item.to} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={onToggle}
        title={group.label}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-[#303030] hover:bg-[#e3e3e3] transition cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className="w-4 h-4 text-[#616161] shrink-0" />
          <span className="truncate">{group.label}</span>
        </div>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#616161] shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#616161] shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="pl-6 space-y-1 mt-1">
          {group.items.map((item) => (
            <NavItemLink key={item.to} item={item} pathname={pathname} compact />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children, currentUser, contentPaddingClassName }: DashboardLayoutProps) {
  const location = useLocation();
  const pathname = location.pathname;
  const isDashboard = pathname === "/app";
  const isMediaRoute = pathname.startsWith("/app/media");
  const permissions = currentUser?.permissions;
  const canSeeMedia = canAccess(permissions, "media:files:read");
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccess(permissions, item.permission)),
  })).filter((group) => group.items.length > 0);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => groupsForPath(pathname));

  useEffect(() => {
    setIsCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
  }, []);

  useEffect(() => {
    setOpenGroups(groupsForPath(pathname));
  }, [pathname]);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const nextState = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(nextState));
      } catch {
        /* ignore */
      }
      return nextState;
    });
  };

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-[#f1f2f4] text-[#303030] antialiased">
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
        <aside
          className={`${
            isCollapsed ? "w-16 p-2 overflow-visible" : "w-60 p-2.5"
          } bg-[#ebebeb] border-r border-[#d2d5d9] flex flex-col justify-between shrink-0 transition-all duration-200 ease-in-out z-30`}
        >
          <nav className="space-y-1 text-xs">
            <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"} mb-2 px-1`}>
              {!isCollapsed && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#616161]">Navigation</span>
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

            <Link
              to="/app"
              title="Dashboard"
              className={`flex items-center ${
                isCollapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2"
              } rounded-lg transition text-xs font-semibold ${
                isDashboard
                  ? "bg-white text-[#303030] shadow-xs border border-gray-200/80"
                  : "text-[#303030] hover:bg-[#e3e3e3]"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-[#616161] shrink-0" />
              {!isCollapsed && <span>Dashboard</span>}
            </Link>

            {canSeeMedia && (
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
            )}

            {visibleGroups.map((group) => (
              <NavGroup
                key={group.key}
                group={group}
                pathname={pathname}
                collapsed={isCollapsed}
                isOpen={Boolean(openGroups[group.key])}
                onToggle={() => toggleGroup(group.key)}
              />
            ))}
          </nav>

          <div
            className={`${isCollapsed ? "p-1.5 flex flex-col items-center" : "p-3"} border border-gray-300/70 bg-white/75 rounded-lg shadow-xs`}
          >
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

        <main className={`flex-1 overflow-y-auto ${contentPaddingClassName || "p-6"}`}>
          <div className="w-full space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
