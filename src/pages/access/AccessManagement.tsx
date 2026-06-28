import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../../components/sidebar";
import { Topbar } from "../../components/topbar";
import adminAvatar from "../../assets/home/home-admin-avatar.png";
import bankIcon from "../../assets/access/access-bank.svg";
import chevronIcon from "../../assets/access/access-chevron.svg";
import configIcon from "../../assets/access/access-config.svg";
import plusIcon from "../../assets/access/access-plus.svg";
import shieldIcon from "../../assets/access/access-role-shield.svg";
import trashIcon from "../../assets/access/access-trash.svg";
import { API_BASE_URL } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import "../../styles/access/AccessManagement.scss";

const ACTIONS = ["read", "create", "update", "delete"] as const;

type AccessManagementProps = {
  accountAvatarSrc?: string;
  accountDescription?: string;
  accountName?: string;
  accountRoleId?: number | string | null;
  isAuthenticated: boolean;
  onAuthAction?: () => void;
  onBackHome?: () => void;
  onOpenManageSurveys?: () => void;
  onOpenProfile?: () => void;
  onOpenSurveyList?: () => void;
  onOpenUserManagement?: () => void;
  onUnauthorized?: () => void;
};

type ActionName = (typeof ACTIONS)[number];

type RoleApiItem = {
  active_user_count?: number | string | null;
  created_at?: string | null;
  id: number | string;
  name?: string | null;
  user_count?: number | string | null;
  updated_at?: string | null;
};

type PrivilegeApiItem = {
  name?: string | null;
};

type RolePrivilegeApiResult = {
  data?: {
    privileges?: string[];
    role?: RoleApiItem;
  };
  message?: string;
};

type ApiCollectionResult<T> = {
  data?: T[];
  message?: string;
};

type Role = {
  activeUserCount: number;
  createdAt: string | null;
  id: number;
  name: string;
  updatedAt: string | null;
  userCount: number;
};

type ModulePrivilege = {
  actions: Partial<Record<ActionName, string>>;
  description: string;
  key: string;
  label: string;
};

type DeleteTarget = {
  activeUserCount: number;
  id: number;
  label: string;
  userCount: number;
};

const MODULE_META: Record<string, { description: string; label: string }> = {
  role: {
    description: "Kelola role dan hak akses sistem",
    label: "Pengaturan Hak Akses",
  },
  survey: {
    description: "Membuat dan mengelola form survey",
    label: "Kelola Survey",
  },
  user: {
    description: "Kelola akun dan data user",
    label: "Manajemen User",
  },
};

const ACTION_LABELS: Record<ActionName, string> = {
  create: "Create",
  delete: "Delete",
  read: "Read",
  update: "Update",
};

const ROLE_LABELS: Record<string, string> = {
  admin_opd: "Admin OPD",
  superadmin: "Superadmin",
  user: "User",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin_opd: "Manajemen Data Dinas",
  superadmin: "Akses Penuh Sistem",
  user: "Akses pengguna dasar",
};

const ROLE_ICONS: Record<string, string> = {
  admin_opd: bankIcon,
  superadmin: shieldIcon,
};

const DEFAULT_ROLE_ICONS = [configIcon, bankIcon, shieldIcon] as const;
const DEFAULT_ROLE_ICON_VARIANTS = ["neutral", "blue", "maroon"] as const;

const ROLE_ICON_VARIANTS: Record<string, string> = {
  admin_opd: "blue",
  superadmin: "maroon",
};

const parseNumber = (
  value: number | string | null | undefined,
  fallback = 0,
) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }

  return fallback;
};

const normalizeRoleName = (name?: string | null) =>
  name?.trim().toLowerCase() ?? "";

const normalizePrivilegeName = (name?: string | null) =>
  name?.trim().toLowerCase() ?? "";

const formatRoleLabel = (name: string) => {
  const normalizedName = normalizeRoleName(name);

  if (ROLE_LABELS[normalizedName]) {
    return ROLE_LABELS[normalizedName];
  }

  return normalizedName
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
};

const getRoleDescription = (name: string) =>
  ROLE_DESCRIPTIONS[normalizeRoleName(name)] ?? "Role custom sistem";

const getStableRoleIndex = (name: string) => {
  const normalizedName = normalizeRoleName(name);

  return Array.from(normalizedName).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
};

const getRoleIcon = (name: string) => {
  const normalizedName = normalizeRoleName(name);

  if (ROLE_ICONS[normalizedName]) {
    return ROLE_ICONS[normalizedName];
  }

  return DEFAULT_ROLE_ICONS[getStableRoleIndex(normalizedName) % DEFAULT_ROLE_ICONS.length];
};

const getRoleIconVariant = (name: string) => {
  const normalizedName = normalizeRoleName(name);

  if (ROLE_ICON_VARIANTS[normalizedName]) {
    return ROLE_ICON_VARIANTS[normalizedName];
  }

  return DEFAULT_ROLE_ICON_VARIANTS[
    getStableRoleIndex(normalizedName) % DEFAULT_ROLE_ICON_VARIANTS.length
  ];
};

const normalizeRole = (role: RoleApiItem): Role => ({
  activeUserCount: Math.max(
    0,
    parseNumber(role.active_user_count ?? role.user_count, 0),
  ),
  createdAt: role.created_at ?? null,
  id: Math.max(0, parseNumber(role.id)),
  name: normalizeRoleName(role.name),
  updatedAt: role.updated_at ?? role.created_at ?? null,
  userCount: Math.max(0, parseNumber(role.user_count, 0)),
});

const normalizeRoleInputForApi = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const formatUpdatedAt = (value?: string | null) => {
  if (!value?.trim()) {
    return "Belum tersedia";
  }

  const normalizedValue = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return "Belum tersedia";
  }

  const formattedDate = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Jakarta",
    year: "numeric",
  })
    .format(date)
    .replace(/\./g, ":");

  return `${formattedDate} WIB`;
};

const getApiMessage = async (
  response: Response,
  fallback = "Permintaan belum bisa diproses.",
) => {
  try {
    const result = (await response.json()) as { message?: string };
    return result.message ?? fallback;
  } catch {
    return fallback;
  }
};

const groupPrivilegesByModule = (privileges: string[]): ModulePrivilege[] => {
  const modules = new Map<string, ModulePrivilege>();

  privileges.forEach((privilege) => {
    const [moduleKey, action] = privilege.split(":");

    if (!moduleKey || !ACTIONS.includes(action as ActionName)) {
      return;
    }

    const normalizedAction = action as ActionName;
    const meta = MODULE_META[moduleKey] ?? {
      description: "Hak akses modul sistem",
      label: formatRoleLabel(moduleKey),
    };
    const currentModule =
      modules.get(moduleKey) ??
      ({
        actions: {},
        description: meta.description,
        key: moduleKey,
        label: meta.label,
      } satisfies ModulePrivilege);

    currentModule.actions[normalizedAction] = privilege;
    modules.set(moduleKey, currentModule);
  });

  return Array.from(modules.values()).sort((left, right) => {
    const leftIndex = Object.keys(MODULE_META).indexOf(left.key);
    const rightIndex = Object.keys(MODULE_META).indexOf(right.key);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.label.localeCompare(right.label, "id-ID");
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
};

const getChangedPrivilegeCount = (
  savedPrivileges: string[],
  draftPrivileges: string[],
) => {
  const savedSet = new Set(savedPrivileges);
  const draftSet = new Set(draftPrivileges);
  const additions = draftPrivileges.filter((privilege) => !savedSet.has(privilege));
  const removals = savedPrivileges.filter((privilege) => !draftSet.has(privilege));

  return additions.length + removals.length;
};

const AccessSkeleton = () => (
  <div className="access-management-skeleton" aria-hidden="true">
    <span />
    <span />
    <span />
  </div>
);

export const AccessManagement = ({
  accountAvatarSrc,
  accountDescription,
  accountName,
  accountRoleId,
  isAuthenticated,
  onAuthAction,
  onBackHome,
  onOpenManageSurveys,
  onOpenProfile,
  onOpenSurveyList,
  onOpenUserManagement,
  onUnauthorized,
}: AccessManagementProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [availablePrivileges, setAvailablePrivileges] = useState<string[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [savedPrivileges, setSavedPrivileges] = useState<string[]>([]);
  const [draftPrivileges, setDraftPrivileges] = useState<string[]>([]);
  const [currentRolePrivileges, setCurrentRolePrivileges] = useState<string[] | null>(
    null,
  );
  const [isLoadingBase, setIsLoadingBase] = useState(true);
  const [isLoadingPrivileges, setIsLoadingPrivileges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const avatarSrc = accountAvatarSrc ?? adminAvatar;
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const selectedRoleLabel = selectedRole ? formatRoleLabel(selectedRole.name) : "-";
  const modules = useMemo(
    () => groupPrivilegesByModule(availablePrivileges),
    [availablePrivileges],
  );
  const visibleActions = useMemo(
    () =>
      ACTIONS.filter((action) =>
        modules.some((module) => Boolean(module.actions[action])),
      ),
    [modules],
  );
  const availablePrivilegeSet = useMemo(
    () => new Set(availablePrivileges),
    [availablePrivileges],
  );
  const currentPrivilegeSet = useMemo(
    () => (currentRolePrivileges ? new Set(currentRolePrivileges) : null),
    [currentRolePrivileges],
  );
  const draftPrivilegeSet = useMemo(
    () => new Set(draftPrivileges),
    [draftPrivileges],
  );
  const hasUnsavedChanges =
    getChangedPrivilegeCount(savedPrivileges, draftPrivileges) > 0;

  const canUsePrivilege = (privilege: string) =>
    availablePrivilegeSet.has(privilege) &&
    (!currentPrivilegeSet || currentPrivilegeSet.has(privilege));

  const canCreateRole = canUsePrivilege("role:create");
  const canUpdateRole = canUsePrivilege("role:update");
  const canDeleteRole = canUsePrivilege("role:delete");

  useEffect(() => {
    if (!feedbackMessage) {
      return;
    }

    const timerId = window.setTimeout(() => setFeedbackMessage(""), 4800);
    return () => window.clearTimeout(timerId);
  }, [feedbackMessage]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchCollection = async <T,>(
      endpoint: string,
      fallbackMessage: string,
    ) => {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        credentials: "include",
        headers: authHeaders(),
        method: "GET",
        signal: controller.signal,
      });

      if (response.status === 401) {
        onUnauthorized?.();
        return [];
      }

      if (!response.ok) {
        throw new Error(await getApiMessage(response, fallbackMessage));
      }

      const result = (await response.json()) as ApiCollectionResult<T>;
      return Array.isArray(result.data) ? result.data : [];
    };

    const loadBaseData = async () => {
      if (!isAuthenticated) {
        setRoles([]);
        setAvailablePrivileges([]);
        setSelectedRoleId(null);
        setIsLoadingBase(false);
        return;
      }

      setIsLoadingBase(true);
      setFeedbackMessage("");

      try {
        const [roleItems, privilegeItems] = await Promise.all([
          fetchCollection<RoleApiItem>("/roles", "Daftar role belum bisa dimuat."),
          fetchCollection<PrivilegeApiItem>(
            "/privileges",
            "Daftar privilege belum bisa dimuat.",
          ),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        const nextRoles = roleItems
          .map(normalizeRole)
          .filter((role) => role.id > 0 && role.name !== "user");
        const nextPrivileges = privilegeItems
          .map((privilege) => normalizePrivilegeName(privilege.name))
          .filter(Boolean);

        setRoles(nextRoles);
        setAvailablePrivileges(nextPrivileges);
        setSelectedRoleId((currentRoleId) => {
          if (currentRoleId && nextRoles.some((role) => role.id === currentRoleId)) {
            return currentRoleId;
          }

          return nextRoles[0]?.id ?? null;
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRoles([]);
        setAvailablePrivileges([]);
        setSelectedRoleId(null);
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : "Pengaturan hak akses belum bisa dimuat.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingBase(false);
        }
      }
    };

    void loadBaseData();

    return () => controller.abort();
  }, [isAuthenticated, onUnauthorized]);

  useEffect(() => {
    const parsedRoleId = parseNumber(accountRoleId ?? null, 0);

    if (!isAuthenticated || parsedRoleId <= 0) {
      const timerId = window.setTimeout(() => setCurrentRolePrivileges(null), 0);
      return () => window.clearTimeout(timerId);
    }

    const controller = new AbortController();

    const loadCurrentRolePrivileges = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/roles/${parsedRoleId}/privileges`,
          {
            credentials: "include",
            headers: authHeaders(),
            method: "GET",
            signal: controller.signal,
          },
        );

        if (response.status === 401) {
          onUnauthorized?.();
          return;
        }

        if (!response.ok) {
          setCurrentRolePrivileges(null);
          return;
        }

        const result = (await response.json()) as RolePrivilegeApiResult;
        setCurrentRolePrivileges(result.data?.privileges ?? null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCurrentRolePrivileges(null);
      }
    };

    void loadCurrentRolePrivileges();

    return () => controller.abort();
  }, [accountRoleId, isAuthenticated, onUnauthorized]);

  useEffect(() => {
    if (!selectedRoleId) {
      const timerId = window.setTimeout(() => {
        setSavedPrivileges([]);
        setDraftPrivileges([]);
      }, 0);

      return () => window.clearTimeout(timerId);
    }

    const controller = new AbortController();

    const loadRolePrivileges = async () => {
      setIsLoadingPrivileges(true);
      setFeedbackMessage("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/roles/${selectedRoleId}/privileges`,
          {
            credentials: "include",
            headers: authHeaders(),
            method: "GET",
            signal: controller.signal,
          },
        );

        if (response.status === 401) {
          onUnauthorized?.();
          return;
        }

        if (!response.ok) {
          throw new Error(
            await getApiMessage(response, "Privilege role belum bisa dimuat."),
          );
        }

        const result = (await response.json()) as RolePrivilegeApiResult;
        const nextPrivileges = result.data?.privileges ?? [];

        setSavedPrivileges(nextPrivileges);
        setDraftPrivileges(nextPrivileges);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSavedPrivileges([]);
        setDraftPrivileges([]);
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : "Privilege role belum bisa dimuat.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingPrivileges(false);
        }
      }
    };

    void loadRolePrivileges();

    return () => controller.abort();
  }, [onUnauthorized, selectedRoleId]);

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((current) => !current);
  };

  const handleProfileClick = () => {
    closeSidebar();
    onOpenProfile?.();
  };

  const handleAuthAction = () => {
    closeSidebar();
    onAuthAction?.();
  };

  const handleNavigationClick = (label: string) => {
    closeSidebar();

    if (label === "Dashboard") {
      onBackHome?.();
    }

    if (label === "Daftar Survey") {
      onOpenSurveyList?.();
    }

    if (label === "Kelola Survey") {
      onOpenManageSurveys?.();
    }

    if (label === "User Management") {
      onOpenUserManagement?.();
    }
  };

  const handlePrivilegeToggle = (privilege: string) => {
    if (!canUpdateRole || isLoadingPrivileges || isSaving) {
      return;
    }

    setDraftPrivileges((currentPrivileges) => {
      if (currentPrivileges.includes(privilege)) {
        return currentPrivileges.filter((item) => item !== privilege);
      }

      return [...currentPrivileges, privilege].sort();
    });
  };

  const handleCancelChanges = () => {
    setDraftPrivileges(savedPrivileges);
    setFeedbackMessage("Perubahan belum disimpan sudah dibatalkan.");
  };

  const handleSaveChanges = async () => {
    if (!selectedRoleId || !canUpdateRole || !hasUnsavedChanges) {
      return;
    }

    setIsSaving(true);
    setFeedbackMessage("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/roles/${selectedRoleId}/privileges`,
        {
          body: JSON.stringify({ privileges: draftPrivileges }),
          credentials: "include",
          headers: authHeaders("application/json"),
          method: "PUT",
        },
      );

      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }

      if (!response.ok) {
        throw new Error(
          await getApiMessage(response, "Privilege role belum bisa disimpan."),
        );
      }

      const updatedAt = new Date().toISOString();
      setSavedPrivileges(draftPrivileges);
      setRoles((currentRoles) =>
        currentRoles.map((role) =>
          role.id === selectedRoleId ? { ...role, updatedAt } : role,
        ),
      );
      setFeedbackMessage("Privilege role berhasil disimpan.");
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error
          ? error.message
          : "Privilege role belum bisa disimpan.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreateRole) {
      return;
    }

    const normalizedRoleName = normalizeRoleInputForApi(newRoleName);

    if (!/^[a-z0-9_]+$/.test(normalizedRoleName)) {
      setFeedbackMessage(
        "Nama role hanya boleh huruf, angka, spasi, dan underscore.",
      );
      return;
    }

    setIsCreating(true);
    setFeedbackMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/roles`, {
        body: JSON.stringify({ name: normalizedRoleName }),
        credentials: "include",
        headers: authHeaders("application/json"),
        method: "POST",
      });

      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }

      if (!response.ok) {
        throw new Error(await getApiMessage(response, "Role belum bisa dibuat."));
      }

      const result = (await response.json()) as { data?: { id?: number | string } };
      const createdRoleId = parseNumber(result.data?.id, 0);

      if (createdRoleId <= 0) {
        throw new Error("Role berhasil dibuat, tetapi id role belum diterima.");
      }

      const createdAt = new Date().toISOString();
      const createdRole = {
        activeUserCount: 0,
        createdAt,
        id: createdRoleId,
        name: normalizedRoleName,
        updatedAt: createdAt,
        userCount: 0,
      };

      setRoles((currentRoles) =>
        [...currentRoles, createdRole].sort((left, right) =>
          formatRoleLabel(left.name).localeCompare(formatRoleLabel(right.name), "id-ID"),
        ),
      );
      setSelectedRoleId(createdRoleId);
      setNewRoleName("");
      setIsCreateOpen(false);
      setFeedbackMessage("Role berhasil dibuat.");
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : "Role belum bisa dibuat.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!deleteTarget || !canDeleteRole) {
      return;
    }

    setIsDeleting(true);
    setFeedbackMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/roles/${deleteTarget.id}`, {
        credentials: "include",
        headers: authHeaders(),
        method: "DELETE",
      });

      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }

      if (!response.ok) {
        throw new Error(await getApiMessage(response, "Role belum bisa dihapus."));
      }

      const nextRoles = roles.filter((role) => role.id !== deleteTarget.id);
      setRoles(nextRoles);
      setSelectedRoleId((currentRoleId) =>
        currentRoleId === deleteTarget.id ? nextRoles[0]?.id ?? null : currentRoleId,
      );
      setDeleteTarget(null);
      setFeedbackMessage("Role berhasil dihapus.");
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : "Role belum bisa dihapus.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="access-management-page">
      <Topbar
        avatarSrc={avatarSrc}
        isSidebarOpen={isSidebarOpen}
        onProfileClick={handleProfileClick}
        onToggleSidebar={toggleSidebar}
        sidebarId="access-management-sidebar"
        title="Survey Pemkot Jogja"
      />

      <Sidebar
        accountDescription={accountDescription}
        accountName={accountName}
        activeItem="Pengaturan Hak Akses"
        avatarSrc={avatarSrc}
        id="access-management-sidebar"
        isAuthenticated={isAuthenticated}
        isOpen={isSidebarOpen}
        onAuthAction={handleAuthAction}
        onClose={closeSidebar}
        onNavigate={handleNavigationClick}
      />

      <section className="access-management-shell">
        <div className="access-management-content">
          <header className="access-management-heading">
            <div>
              <h1>Manajemen Role & Hak Akses</h1>
              <p>
                Kelola peran pengguna dan tentukan hak akses spesifik untuk setiap
                modul sistem.
              </p>
            </div>

            {canCreateRole && (
              <button
                className="access-management-create"
                onClick={() => setIsCreateOpen((current) => !current)}
                type="button"
              >
                <img src={plusIcon} alt="" aria-hidden="true" />
                Tambah Role Baru
              </button>
            )}
          </header>

          {isCreateOpen && canCreateRole && (
            <form className="access-management-create-form" onSubmit={handleCreateRole}>
              <label>
                <span>Nama role</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setNewRoleName(event.target.value)}
                  placeholder="contoh: admin kecamatan"
                  value={newRoleName}
                />
              </label>
              <button disabled={isCreating} type="submit">
                {isCreating ? "Membuat..." : "Buat Role"}
              </button>
            </form>
          )}

          {feedbackMessage && (
            <p className="access-management-feedback" role="status">
              {feedbackMessage}
            </p>
          )}

          <section className="access-management-grid">
            <aside className="access-role-list" aria-label="Daftar role">
              <h2>Daftar Role</h2>

              {isLoadingBase ? (
                <AccessSkeleton />
              ) : roles.length > 0 ? (
                roles.map((role) => {
                  const isActive = role.id === selectedRoleId;
                  const roleLabel = formatRoleLabel(role.name);
                  const roleIconVariant = getRoleIconVariant(role.name);

                  return (
                    <div
                      className={`access-role-item ${isActive ? "is-active" : ""}`}
                      key={role.id}
                    >
                      <button
                        className="access-role-item__button"
                        onClick={() => setSelectedRoleId(role.id)}
                        type="button"
                      >
                        <span
                          className={`access-role-list__icon access-role-list__icon--${roleIconVariant}`}
                        >
                          <img
                            src={getRoleIcon(role.name)}
                            alt=""
                            aria-hidden="true"
                          />
                        </span>
                        <span className="access-role-list__text">
                          <strong>{roleLabel}</strong>
                          <small>{getRoleDescription(role.name)}</small>
                        </span>
                      </button>

                      {canDeleteRole && role.name !== "user" && (
                        <button
                          aria-label={`Hapus ${roleLabel}`}
                          className="access-role-list__delete"
                          onClick={() =>
                            setDeleteTarget({
                              activeUserCount: role.activeUserCount,
                              id: role.id,
                              label: roleLabel,
                              userCount: role.userCount,
                            })
                          }
                          type="button"
                        >
                          <img src={trashIcon} alt="" aria-hidden="true" />
                        </button>
                      )}

                      <button
                        aria-label={`Pilih ${roleLabel}`}
                        className="access-role-list__chevron-button"
                        onClick={() => setSelectedRoleId(role.id)}
                        type="button"
                      >
                        <img
                          className="access-role-list__chevron"
                          src={chevronIcon}
                          alt=""
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="access-role-list__empty">
                  Belum ada role yang bisa dikelola.
                </p>
              )}
            </aside>

            <section className="access-privilege-card" aria-label="Konfigurasi privilege">
              {isLoadingBase || isLoadingPrivileges ? (
                <AccessSkeleton />
              ) : selectedRole ? (
                <>
                  <div className="access-role-impact">
                    <span aria-hidden="true">i</span>
                    <p>
                      Perubahan pada role ini akan berdampak pada{" "}
                      {selectedRole.activeUserCount} user aktif.
                    </p>
                  </div>

                  <header className="access-privilege-card__header">
                    <span
                      className={`access-privilege-card__icon access-privilege-card__icon--${getRoleIconVariant(selectedRole.name)}`}
                    >
                      <img src={getRoleIcon(selectedRole.name)} alt="" aria-hidden="true" />
                    </span>
                    <div>
                      <h2>Konfigurasi Hak Akses: {selectedRoleLabel}</h2>
                      <p>Tentukan izin untuk masing-masing modul sistem.</p>
                    </div>
                  </header>

                  <div className="access-privilege-table-wrap">
                    <table className="access-privilege-table">
                      <thead>
                        <tr>
                          <th>Modul Sistem</th>
                          {visibleActions.map((action) => (
                            <th key={action}>{ACTION_LABELS[action]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {modules.map((module) => (
                          <tr key={module.key}>
                            <td>
                              <strong>{module.label}</strong>
                              <small>{module.description}</small>
                            </td>
                            {visibleActions.map((action) => {
                              const privilege = module.actions[action];

                              if (!privilege) {
                                return (
                                  <td key={action}>
                                    <span className="access-privilege-table__empty" />
                                  </td>
                                );
                              }

                              return (
                                <td key={action}>
                                  <label className="access-checkbox">
                                    <input
                                      checked={draftPrivilegeSet.has(privilege)}
                                      disabled={!canUpdateRole || isSaving}
                                      onChange={() => handlePrivilegeToggle(privilege)}
                                      type="checkbox"
                                    />
                                    <span aria-hidden="true" />
                                  </label>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="access-privilege-card__empty">
                  <h2>Pilih role</h2>
                  <p>Pilih role di sisi kiri untuk mengatur hak aksesnya.</p>
                </div>
              )}
            </section>
          </section>
        </div>
      </section>

      <footer className="access-management-footer">
        <div>
          <span aria-hidden="true">i</span>
          <p>
            {selectedRole
              ? `Terakhir diperbarui: ${formatUpdatedAt(selectedRole.updatedAt)}`
              : "Pilih role untuk melihat tanggal terakhir diperbarui."}
          </p>
        </div>

        <div>
          <button
            disabled={!hasUnsavedChanges || isSaving}
            onClick={handleCancelChanges}
            type="button"
          >
            Batalkan
          </button>
          {canUpdateRole && (
            <button
              disabled={!hasUnsavedChanges || isSaving}
              onClick={() => void handleSaveChanges()}
              type="button"
            >
              {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          )}
        </div>
      </footer>

      {deleteTarget && (
        <div className="access-management-dialog" role="presentation">
          <button
            aria-label="Batalkan hapus role"
            className="access-management-dialog__backdrop"
            onClick={() => setDeleteTarget(null)}
            type="button"
          />
          <section
            aria-labelledby="delete-role-title"
            aria-modal="true"
            className="access-management-dialog__panel"
            role="dialog"
          >
            <h2 id="delete-role-title">Hapus role?</h2>
            <p>
              Role "{deleteTarget.label}" akan dihapus. User yang memakai role ini
              akan dipindahkan ke role user default. Saat ini role berdampak pada{" "}
              {deleteTarget.activeUserCount} user aktif
              {deleteTarget.userCount > deleteTarget.activeUserCount
                ? ` dari ${deleteTarget.userCount} pengguna`
                : ""}
              .
            </p>
            <div>
              <button
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                type="button"
              >
                Batal
              </button>
              <button
                disabled={isDeleting}
                onClick={() => void handleDeleteRole()}
                type="button"
              >
                {isDeleting ? "Menghapus..." : "Hapus Role"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
