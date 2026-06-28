import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../../components/sidebar";
import { Topbar } from "../../components/topbar";
import adminAvatar from "../../assets/home/home-admin-avatar.png";
import editIcon from "../../assets/user/user-edit-icon.svg";
import filterIcon from "../../assets/user/user-filter-icon.svg";
import paginationNextIcon from "../../assets/user/user-pagination-next.svg";
import paginationPrevIcon from "../../assets/user/user-pagination-prev.svg";
import searchIcon from "../../assets/user/user-search-icon.svg";
import { API_BASE_URL } from "../../lib/api";
import {
  resolveProfilePhotoUrl,
  type ProfilePhotoSource,
} from "../../lib/profilePhoto";
import "../../styles/user/UserManagement.scss";

const AUTH_TOKEN_KEY = "survey_auth_token";
const PER_PAGE_OPTIONS = [5, 10, 25, 50, 100] as const;

type UserManagementProps = {
  accountAvatarSrc?: string;
  accountDescription?: string;
  accountId?: number | string | null;
  accountName?: string;
  isAuthenticated: boolean;
  onAuthAction?: () => void;
  onOpenAccessManagement?: () => void;
  onBackHome?: () => void;
  onOpenManageSurveys?: () => void;
  onOpenProfile?: () => void;
  onOpenSurveyList?: () => void;
  onUnauthorized?: () => void;
};

type UserApiItem = {
  created_at?: string | null;
  email?: string | null;
  full_name?: string | null;
  id: number | string;
  is_active?: boolean | number | string | null;
  nik?: string | null;
  phone?: string | null;
  position?: string | null;
  profile_photo_path?: string | null;
  profile_photo_url?: string | null;
  role?: string | null;
  role_id?: number | string | null;
  updated_at?: string | null;
  username?: string | null;
};

type RoleApiItem = {
  id: number | string;
  name?: string | null;
};

type ApiCollectionResult<T> = {
  data?: T[];
  message?: string;
};

type ManagedUser = ProfilePhotoSource & {
  email?: string | null;
  fullName: string;
  id: number;
  isActive: boolean;
  nik: string;
  phone?: string | null;
  position?: string | null;
  roleId: number;
  roleName: string;
  username: string;
};

type RoleOption = {
  id: number;
  label: string;
  name: string;
};

type EditFormState = {
  isActive: boolean;
  roleId: string;
};

const initialEditForm: EditFormState = {
  isActive: true,
  roleId: "",
};

const getStoredToken = () =>
  localStorage.getItem(AUTH_TOKEN_KEY) ?? sessionStorage.getItem(AUTH_TOKEN_KEY);

const authHeaders = (contentType?: string): HeadersInit => {
  const token = getStoredToken();
  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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

const normalizeBoolean = (value: UserApiItem["is_active"]) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    return value === "1" || value.toLowerCase() === "true";
  }

  return false;
};

const normalizeRoleName = (role?: string | null) =>
  role?.trim().toLowerCase() || "user";

const ROLE_LABELS: Record<string, string> = {
  admin_opd: "Admin OPD",
  superadmin: "Superadmin",
  user: "Warga",
};

const POSITION_LABELS: Record<string, string> = {
  asn: "Pegawai ASN",
  non_asn: "Pegawai Non-ASN",
  public: "Warga",
};

const getRoleLabel = (roleName: string) => {
  const normalizedRole = normalizeRoleName(roleName);

  if (ROLE_LABELS[normalizedRole]) {
    return ROLE_LABELS[normalizedRole];
  }

  return normalizedRole
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
};

const getPositionLabel = (position?: string | null) => {
  const normalizedPosition = position?.trim().toLowerCase() ?? "";
  return POSITION_LABELS[normalizedPosition] ?? "User";
};

const getRoleBadgeText = (roleName: string) => getRoleLabel(roleName).toUpperCase();

const getRoleClassName = (roleName: string) =>
  normalizeRoleName(roleName).replace(/[^a-z0-9_-]/g, "-");

const getInitials = (name: string) => {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  return initials || "US";
};

const normalizeUser = (user: UserApiItem): ManagedUser => ({
  email: user.email,
  fullName: user.full_name?.trim() || "Nama belum tersedia",
  id: Math.max(0, parseNumber(user.id)),
  isActive: normalizeBoolean(user.is_active),
  nik: user.nik?.trim() || "-",
  phone: user.phone,
  position: user.position,
  profile_photo_path: user.profile_photo_path,
  profile_photo_url: user.profile_photo_url,
  roleId: Math.max(0, parseNumber(user.role_id)),
  roleName: normalizeRoleName(user.role),
  username: user.username?.trim() || "-",
});

const normalizeRole = (role: RoleApiItem): RoleOption => {
  const roleName = normalizeRoleName(role.name);
  return {
    id: Math.max(0, parseNumber(role.id)),
    label: getRoleLabel(roleName),
    name: roleName,
  };
};

const mergeUniqueUsers = (...collections: ManagedUser[][]) => {
  const usersById = new Map<number, ManagedUser>();

  collections.flat().forEach((user) => {
    if (user.id > 0) {
      usersById.set(user.id, user);
    }
  });

  return Array.from(usersById.values()).sort((left, right) =>
    left.fullName.localeCompare(right.fullName, "id-ID"),
  );
};

const mergeRoleOptions = (roles: RoleOption[], users: ManagedUser[]) => {
  const rolesById = new Map<number, RoleOption>();

  roles.forEach((role) => {
    if (role.id > 0) {
      rolesById.set(role.id, role);
    }
  });

  users.forEach((user) => {
    if (user.roleId > 0 && !rolesById.has(user.roleId)) {
      rolesById.set(user.roleId, {
        id: user.roleId,
        label: getRoleLabel(user.roleName),
        name: user.roleName,
      });
    }
  });

  return Array.from(rolesById.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "id-ID"),
  );
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

const getVisiblePageNumbers = (currentPage: number, totalPages: number) => {
  const pages = new Set([1, currentPage]);

  if (currentPage > 1) {
    pages.add(currentPage - 1);
  }

  if (currentPage < totalPages) {
    pages.add(currentPage + 1);
  }

  return Array.from(pages)
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    .sort((left, right) => left - right);
};

const UserManagementSkeleton = () => (
  <>
    {Array.from({ length: 5 }, (_, index) => (
      <tr className="user-management-skeleton" key={index}>
        <td>
          <span />
          <small />
        </td>
        <td>
          <span />
        </td>
        <td>
          <span />
        </td>
        <td>
          <span />
        </td>
        <td>
          <span />
        </td>
      </tr>
    ))}
  </>
);

const UserAvatar = ({ user }: { user: ManagedUser }) => {
  const photoSrc = resolveProfilePhotoUrl(user, "");

  return (
    <span
      className={`user-management-avatar user-management-avatar--${getRoleClassName(
        user.roleName,
      )} ${photoSrc ? "has-photo" : ""}`}
    >
      {photoSrc && (
        <img
          alt=""
          aria-hidden="true"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            event.currentTarget.parentElement?.classList.remove("has-photo");
          }}
          src={photoSrc}
        />
      )}
      <span>{getInitials(user.fullName)}</span>
    </span>
  );
};

export const UserManagement = ({
  accountAvatarSrc,
  accountDescription,
  accountId,
  accountName,
  isAuthenticated,
  onAuthAction,
  onOpenAccessManagement,
  onBackHome,
  onOpenManageSurveys,
  onOpenProfile,
  onOpenSurveyList,
  onUnauthorized,
}: UserManagementProps) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<(typeof PER_PAGE_OPTIONS)[number]>(5);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(initialEditForm);
  const avatarSrc = accountAvatarSrc ?? adminAvatar;
  const parsedAccountId = parseNumber(accountId ?? null, -1);

  useEffect(() => {
    if (!feedbackMessage) {
      return;
    }

    const timerId = window.setTimeout(() => setFeedbackMessage(""), 4600);
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

    const fetchUsers = async () => {
      if (!isAuthenticated) {
        setUsers([]);
        setRoleOptions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setFeedbackMessage("");

      try {
        const [managementUsers, promotableUsers, roles] = await Promise.all([
          fetchCollection<UserApiItem>("/users", "Data user belum bisa dimuat."),
          fetchCollection<UserApiItem>(
            "/users/promotable",
            "Data warga belum bisa dimuat.",
          ),
          fetchCollection<RoleApiItem>("/roles", "Data role belum bisa dimuat.")
            .then((items) => items)
            .catch(() => []),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        const nextUsers = mergeUniqueUsers(
          managementUsers.map(normalizeUser),
          promotableUsers.map(normalizeUser),
        );
        const nextRoles = mergeRoleOptions(roles.map(normalizeRole), nextUsers);

        setUsers(nextUsers);
        setRoleOptions(nextRoles);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setUsers([]);
        setRoleOptions([]);
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : "Data user belum bisa dimuat.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void fetchUsers();

    return () => controller.abort();
  }, [isAuthenticated, onUnauthorized]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        normalizedSearch === "" ||
        user.fullName.toLowerCase().includes(normalizedSearch) ||
        user.username.toLowerCase().includes(normalizedSearch) ||
        user.nik.toLowerCase().includes(normalizedSearch) ||
        user.email?.toLowerCase().includes(normalizedSearch) ||
        user.phone?.toLowerCase().includes(normalizedSearch);
      const matchesRole = !roleFilter || user.roleName === roleFilter;
      const matchesStatus =
        !statusFilter ||
        (statusFilter === "active" ? user.isActive : !user.isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, searchQuery, statusFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pageStartIndex = (currentPage - 1) * perPage;
  const visibleUsers = filteredUsers.slice(pageStartIndex, pageStartIndex + perPage);
  const displayStart = filteredUsers.length === 0 ? 0 : pageStartIndex + 1;
  const displayEnd = Math.min(pageStartIndex + perPage, filteredUsers.length);

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

    if (label === "Pengaturan Hak Akses") {
      onOpenAccessManagement?.();
    }
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput);
    setPage(1);
  };

  const handleRoleFilterChange = (nextRole: string) => {
    setRoleFilter(nextRole);
    setPage(1);
  };

  const handleStatusFilterChange = (nextStatus: string) => {
    setStatusFilter(nextStatus);
    setPage(1);
  };

  const handlePerPageChange = (nextPerPage: (typeof PER_PAGE_OPTIONS)[number]) => {
    setPerPage(nextPerPage);
    setPage(1);
  };

  const handleResetFilter = () => {
    setRoleFilter("");
    setStatusFilter("");
    setPerPage(5);
    setPage(1);
    setIsFilterOpen(false);
  };

  const openEditDialog = (user: ManagedUser) => {
    setEditTarget(user);
    setEditForm({
      isActive: user.isActive,
      roleId: String(user.roleId),
    });
    setFeedbackMessage("");
  };

  const closeEditDialog = () => {
    if (isSaving) {
      return;
    }

    setEditTarget(null);
    setEditForm(initialEditForm);
  };

  const selectedRole = roleOptions.find(
    (role) => String(role.id) === editForm.roleId,
  );
  const isEditingOwnAccount = editTarget?.id === parsedAccountId;
  const hasEditChanges =
    editTarget !== null &&
    (String(editTarget.roleId) !== editForm.roleId ||
      editTarget.isActive !== editForm.isActive);

  const handleSaveUser = async () => {
    if (!editTarget || !hasEditChanges) {
      closeEditDialog();
      return;
    }

    const nextRoleId = parseNumber(editForm.roleId);

    if (nextRoleId <= 0) {
      setFeedbackMessage("Role harus dipilih.");
      return;
    }

    setIsSaving(true);
    setFeedbackMessage("");

    try {
      if (String(editTarget.roleId) !== editForm.roleId) {
        const roleResponse = await fetch(
          `${API_BASE_URL}/users/${editTarget.id}/role`,
          {
            body: JSON.stringify({ role_id: nextRoleId }),
            credentials: "include",
            headers: authHeaders("application/json"),
            method: "PUT",
          },
        );

        if (roleResponse.status === 401) {
          onUnauthorized?.();
          return;
        }

        if (!roleResponse.ok) {
          throw new Error(
            await getApiMessage(roleResponse, "Role user belum bisa diperbarui."),
          );
        }
      }

      if (editTarget.isActive !== editForm.isActive) {
        const statusResponse = await fetch(
          `${API_BASE_URL}/users/${editTarget.id}/status`,
          {
            body: JSON.stringify({ is_active: editForm.isActive }),
            credentials: "include",
            headers: authHeaders("application/json"),
            method: "PUT",
          },
        );

        if (statusResponse.status === 401) {
          onUnauthorized?.();
          return;
        }

        if (!statusResponse.ok) {
          throw new Error(
            await getApiMessage(
              statusResponse,
              "Status user belum bisa diperbarui.",
            ),
          );
        }
      }

      const nextRoleName = selectedRole?.name ?? editTarget.roleName;
      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === editTarget.id
            ? {
                ...user,
                isActive: editForm.isActive,
                roleId: nextRoleId,
                roleName: nextRoleName,
              }
            : user,
        ),
      );
      setFeedbackMessage("Data user berhasil diperbarui.");
      closeEditDialog();
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : "Data user belum bisa disimpan.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="user-management-page">
      <Topbar
        avatarSrc={avatarSrc}
        isSidebarOpen={isSidebarOpen}
        onProfileClick={handleProfileClick}
        onToggleSidebar={toggleSidebar}
        sidebarId="user-management-sidebar"
        title="Survey Pemkot Jogja"
      />

      <Sidebar
        accountDescription={accountDescription}
        accountName={accountName}
        activeItem="User Management"
        avatarSrc={avatarSrc}
        id="user-management-sidebar"
        isAuthenticated={isAuthenticated}
        isOpen={isSidebarOpen}
        onAuthAction={handleAuthAction}
        onClose={closeSidebar}
        onNavigate={handleNavigationClick}
      />

      <section className="user-management-shell">
        <div className="user-management-content">
          <header className="user-management-heading">
            <div>
              <h1>Manajemen User</h1>
              <p>Kelola data pengguna dan hak akses portal.</p>
            </div>
          </header>

          <section className="user-management-panel" aria-label="Tabel user">
            <div className="user-management-filters">
              <form
                className="user-management-search-form"
                onSubmit={handleSearchSubmit}
              >
                <label className="user-management-search" htmlFor="user-search">
                  <span>Cari user</span>
                  <img src={searchIcon} alt="" aria-hidden="true" />
                  <input
                    autoComplete="off"
                    id="user-search"
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Cari nama, email, atau instansi..."
                    type="search"
                    value={searchInput}
                  />
                </label>
              </form>

              <div className="user-management-filter">
                <button
                  aria-expanded={isFilterOpen}
                  aria-haspopup="dialog"
                  onClick={() => setIsFilterOpen((current) => !current)}
                  type="button"
                >
                  <img src={filterIcon} alt="" aria-hidden="true" />
                  Filter
                </button>

                {isFilterOpen && (
                  <div className="user-management-filter__menu" role="dialog">
                    <label>
                      <span>Peran</span>
                      <select
                        onChange={(event) =>
                          handleRoleFilterChange(event.target.value)
                        }
                        value={roleFilter}
                      >
                        <option value="">Semua peran</option>
                        {roleOptions.map((role) => (
                          <option key={role.id} value={role.name}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>Status</span>
                      <select
                        onChange={(event) =>
                          handleStatusFilterChange(event.target.value)
                        }
                        value={statusFilter}
                      >
                        <option value="">Semua status</option>
                        <option value="active">Aktif</option>
                        <option value="inactive">Non-Aktif</option>
                      </select>
                    </label>

                    <label>
                      <span>Data per halaman</span>
                      <select
                        onChange={(event) =>
                          handlePerPageChange(
                            Number(event.target.value) as (typeof PER_PAGE_OPTIONS)[number],
                          )
                        }
                        value={perPage}
                      >
                        {PER_PAGE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option} data
                          </option>
                        ))}
                      </select>
                    </label>

                    <button onClick={handleResetFilter} type="button">
                      Reset Filter
                    </button>
                  </div>
                )}
              </div>
            </div>

            {feedbackMessage && (
              <p className="user-management-feedback" role="status">
                {feedbackMessage}
              </p>
            )}

            <div className="user-management-table-wrap">
              <table className="user-management-table" aria-busy={isLoading}>
                <thead>
                  <tr>
                    <th>Nama Dan NIK</th>
                    <th>Username</th>
                    <th>Peran</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <UserManagementSkeleton />
                  ) : visibleUsers.length > 0 ? (
                    visibleUsers.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <div className="user-management-user">
                            <UserAvatar user={user} />
                            <div>
                              <strong>{user.fullName}</strong>
                              <small>{user.nik}</small>
                            </div>
                          </div>
                        </td>
                        <td>{user.username}</td>
                        <td>
                          <span
                            className={`user-management-role user-management-role--${getRoleClassName(
                              user.roleName,
                            )}`}
                          >
                            {getRoleBadgeText(user.roleName)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`user-management-status ${
                              user.isActive ? "is-active" : "is-inactive"
                            }`}
                          >
                            <span aria-hidden="true" />
                            {user.isActive ? "Aktif" : "Non-Aktif"}
                          </span>
                        </td>
                        <td>
                          <button
                            aria-label={`Edit ${user.fullName}`}
                            className="user-management-edit"
                            onClick={() => openEditDialog(user)}
                            type="button"
                          >
                            <img src={editIcon} alt="" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="user-management-empty" colSpan={5}>
                        Tidak ada user yang cocok dengan filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <footer className="user-management-pagination">
              <span>
                Menampilkan {displayStart}-{displayEnd} dari{" "}
                {filteredUsers.length} user
              </span>

              <div>
                <button
                  aria-label="Halaman sebelumnya"
                  disabled={isLoading || currentPage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  type="button"
                >
                  <img src={paginationPrevIcon} alt="" aria-hidden="true" />
                </button>

                {getVisiblePageNumbers(currentPage, totalPages).map(
                  (pageNumber) => (
                    <button
                      aria-current={
                        pageNumber === currentPage ? "page" : undefined
                      }
                      className={pageNumber === currentPage ? "is-current" : ""}
                      key={pageNumber}
                      onClick={() => setPage(pageNumber)}
                      type="button"
                    >
                      {pageNumber}
                    </button>
                  ),
                )}

                <button
                  aria-label="Halaman berikutnya"
                  disabled={isLoading || currentPage >= totalPages}
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                  type="button"
                >
                  <img src={paginationNextIcon} alt="" aria-hidden="true" />
                </button>
              </div>
            </footer>
          </section>
        </div>
      </section>

      {editTarget && (
        <div className="user-management-dialog" role="presentation">
          <button
            aria-label="Tutup edit user"
            className="user-management-dialog__backdrop"
            onClick={closeEditDialog}
            type="button"
          />
          <section
            aria-labelledby="edit-user-title"
            aria-modal="true"
            className="user-management-dialog__panel"
            role="dialog"
          >
            <header>
              <div>
                <h2 id="edit-user-title">Edit User</h2>
                <p>{editTarget.fullName}</p>
              </div>
              <button
                aria-label="Tutup edit user"
                disabled={isSaving}
                onClick={closeEditDialog}
                type="button"
              >
                x
              </button>
            </header>

            <dl className="user-management-dialog__identity">
              <div>
                <dt>NIK</dt>
                <dd>{editTarget.nik}</dd>
              </div>
              <div>
                <dt>Username</dt>
                <dd>{editTarget.username}</dd>
              </div>
              <div>
                <dt>Posisi</dt>
                <dd>{getPositionLabel(editTarget.position)}</dd>
              </div>
            </dl>

            {isEditingOwnAccount && (
              <p className="user-management-dialog__warning">
                Akun sendiri tidak bisa dinonaktifkan atau diubah role-nya.
              </p>
            )}

            <label className="user-management-dialog__field">
              <span>Peran</span>
              <select
                disabled={isSaving || isEditingOwnAccount}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    roleId: event.target.value,
                  }))
                }
                value={editForm.roleId}
              >
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="user-management-dialog__status">
              <legend>Status</legend>
              <label>
                <input
                  checked={editForm.isActive}
                  disabled={isSaving || isEditingOwnAccount}
                  name="user-status"
                  onChange={() =>
                    setEditForm((current) => ({
                      ...current,
                      isActive: true,
                    }))
                  }
                  type="radio"
                />
                Aktif
              </label>
              <label>
                <input
                  checked={!editForm.isActive}
                  disabled={isSaving || isEditingOwnAccount}
                  name="user-status"
                  onChange={() =>
                    setEditForm((current) => ({
                      ...current,
                      isActive: false,
                    }))
                  }
                  type="radio"
                />
                Non-Aktif
              </label>
            </fieldset>

            <div className="user-management-dialog__actions">
              <button disabled={isSaving} onClick={closeEditDialog} type="button">
                Batal
              </button>
              <button
                disabled={isSaving || !hasEditChanges || isEditingOwnAccount}
                onClick={() => void handleSaveUser()}
                type="button"
              >
                {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
