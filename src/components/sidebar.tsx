import loginIcon from "../assets/home/home-step-login.svg";
import logoutIcon from "../assets/home/home-logout.svg";
import accessIcon from "../assets/home/home-nav-access.svg";
import analyticsIcon from "../assets/home/home-nav-analytics.svg";
import dashboardIcon from "../assets/home/home-nav-dashboard.svg";
import historyIcon from "../assets/home/home-nav-history.svg";
import listIcon from "../assets/home/home-nav-list.svg";
import manageIcon from "../assets/home/home-nav-manage.svg";
import usersIcon from "../assets/home/home-nav-users.svg";
import "../styles/components/sidebar.scss";

type NavigationItem = {
  icon: string;
  label: string;
  requiredPrivilege?: string;
};

type SidebarProps = {
  accountDescription?: string;
  accountName?: string;
  activeItem?: string;
  avatarSrc: string;
  id: string;
  isAuthenticated: boolean;
  isOpen: boolean;
  onAuthAction: () => void;
  onClose: () => void;
  onNavigate?: (label: string) => void;
  privileges?: string[];
};

const navigationItems: NavigationItem[] = [
  { icon: dashboardIcon, label: "Dashboard" },
  { icon: listIcon, label: "Daftar Survey" },
  { icon: manageIcon, label: "Kelola Survey", requiredPrivilege: "survey:read" },
  { icon: usersIcon, label: "User Management", requiredPrivilege: "user:read" },
  {
    icon: accessIcon,
    label: "Pengaturan Hak Akses",
    requiredPrivilege: "role:read",
  },
  { icon: analyticsIcon, label: "Analytics", requiredPrivilege: "analytics:read" },
  { icon: historyIcon, label: "History", requiredPrivilege: "history:read" },
];

export const Sidebar = ({
  accountDescription = "Belum login",
  accountName = "Pengguna",
  activeItem,
  avatarSrc,
  id,
  isAuthenticated,
  isOpen,
  onAuthAction,
  onClose,
  onNavigate,
  privileges = [],
}: SidebarProps) => {
  const authLabel = isAuthenticated ? "Logout" : "Login";
  const authIcon = isAuthenticated ? logoutIcon : loginIcon;
  const privilegeSet = new Set(privileges);
  const visibleNavigationItems = navigationItems.filter(
    (item) =>
      !item.requiredPrivilege ||
      (isAuthenticated && privilegeSet.has(item.requiredPrivilege)),
  );

  return (
    <>
      <button
        aria-hidden={!isOpen}
        className={`app-sidebar-backdrop ${isOpen ? "is-visible" : ""}`}
        onClick={onClose}
        tabIndex={isOpen ? 0 : -1}
        type="button"
      />

      <aside
        aria-label="Navigasi utama"
        className={`app-sidebar ${isOpen ? "is-open" : ""}`}
        id={id}
      >
        <div>
          <div className="app-sidebar__account">
            <img src={avatarSrc} alt="" aria-hidden="true" />
            <div>
              <strong>{accountName}</strong>
              <small>{accountDescription}</small>
            </div>
          </div>

          <nav className="app-navigation" aria-label="Menu dashboard">
            {visibleNavigationItems.map((item) => (
              <button
                className={item.label === activeItem ? "is-active" : ""}
                key={item.label}
                onClick={() => onNavigate?.(item.label)}
                type="button"
              >
                <img src={item.icon} alt="" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="app-sidebar__footer">
          <button onClick={onAuthAction} type="button">
            <img src={authIcon} alt="" aria-hidden="true" />
            <span>{authLabel}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
