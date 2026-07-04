import { type FormEvent, useEffect, useState } from "react";
import { Sidebar } from "../../components/sidebar";
import { Topbar } from "../../components/topbar";
import adminAvatar from "../../assets/home/home-admin-avatar.png";
import arrowRightIcon from "../../assets/survey/list/list-arrow-right.svg";
import filterIcon from "../../assets/survey/list/list-filter-icon.svg";
import paginationNextIcon from "../../assets/survey/list/list-pagination-next.svg";
import paginationPrevIcon from "../../assets/survey/list/list-pagination-prev.svg";
import searchIcon from "../../assets/survey/list/list-search-icon.svg";
import eyeIcon from "../../assets/auth/login/login-eye-icon.svg";
import { API_BASE_URL } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import "../../styles/history/History.scss";

const PER_PAGE_OPTIONS = [5, 10, 25, 50, 100] as const;

type HistoryProps = {
  accountDescription?: string;
  accountAvatarSrc?: string;
  accountName?: string;
  accountPosition?: string | null;
  accountPrivileges?: string[];
  isAuthenticated: boolean;
  onAuthAction?: () => void;
  onBackHome?: () => void;
  onOpenAccessManagement?: () => void;
  onOpenManageSurveys?: () => void;
  onOpenProfile?: () => void;
  onOpenSurveyFill?: (surveyId: number | string) => void;
  onOpenSurveyList?: () => void;
  onOpenUserManagement?: () => void;
  onUnauthorized?: () => void;
};

type HistoryApiItem = {
  closes_at?: string | null;
  current_page?: number | string | null;
  description?: string | null;
  estimated_time?: number | string | null;
  opens_at?: string | null;
  positions?: string[] | string | null;
  response_created_at?: string | null;
  response_id: number | string;
  response_status?: string | null;
  response_updated_at?: string | null;
  submitted_at?: string | null;
  survey_id: number | string;
  survey_status?: string | null;
  thumbnail_path?: string | null;
  title?: string | null;
};

type HistoryApiMeta = {
  page?: number | string | null;
  per_page?: number | string | null;
  total?: number | string | null;
  total_pages?: number | string | null;
};

type HistoryApiResult = {
  data?: {
    items?: HistoryApiItem[];
    meta?: HistoryApiMeta;
  };
  message?: string;
};

type HistoryItem = {
  date: string | null;
  id: number | string;
  positions: string[];
  responseId: number | string;
  responseStatus: "draft" | "submitted";
  title: string;
};

type PaginationMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

type SortDirection = "asc" | "desc";
type SortKey = "date" | "positions" | "status" | "title";

type SortConfig = {
  direction: SortDirection;
  key: SortKey;
};

const initialMeta: PaginationMeta = {
  page: 1,
  perPage: 5,
  total: 0,
  totalPages: 1,
};

const POSITION_LABELS: Record<string, string> = {
  asn: "Pegawai ASN",
  non_asn: "Pegawai Non-ASN",
  public: "Masyarakat Umum",
};

const STATUS_LABELS: Record<HistoryItem["responseStatus"], string> = {
  draft: "Belum Selesai",
  submitted: "Terselesaikan",
};

const ACCESS_DENIED_LABELS: Record<string, string> = {
  asn: "Pegawai ASN",
  non_asn: "Pegawai Non-ASN",
  public: "Masyarakat Umum",
};

const parseNumber = (value: number | string | null | undefined, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }

  return fallback;
};

const normalizeMeta = (
  meta: HistoryApiMeta | undefined,
  fallbackPerPage: number,
): PaginationMeta => ({
  page: Math.max(1, parseNumber(meta?.page, 1)),
  perPage: Math.max(1, parseNumber(meta?.per_page, fallbackPerPage)),
  total: Math.max(0, parseNumber(meta?.total, 0)),
  totalPages: Math.max(1, parseNumber(meta?.total_pages, 1)),
});

const normalizePositions = (positions?: string[] | string | null) => {
  if (Array.isArray(positions)) {
    return positions.filter(Boolean);
  }

  if (typeof positions === "string") {
    return positions
      .split(",")
      .map((position) => position.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeHistoryItem = (item: HistoryApiItem): HistoryItem => {
  const responseStatus =
    item.response_status?.trim().toLowerCase() === "submitted"
      ? "submitted"
      : "draft";

  return {
    date: item.submitted_at ?? item.response_updated_at ?? item.response_created_at ?? null,
    id: item.survey_id,
    positions: normalizePositions(item.positions),
    responseId: item.response_id,
    responseStatus,
    title: item.title?.trim() || "Survey tanpa judul",
  };
};

const formatDate = (dateValue?: string | null) => {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(/\./g, "");
};

const getPositionBadges = (positions: string[]) => {
  if (positions.length === 0 || positions.includes("public")) {
    return [{ key: "public", label: "Masyarakat Umum" }];
  }

  return Array.from(new Set(positions)).map((position) => ({
    key: position,
    label: POSITION_LABELS[position] ?? position,
  }));
};

const normalizeAccountPosition = (position?: string | null) => {
  const normalizedPosition = position?.trim().toLowerCase();

  return normalizedPosition === "asn" ||
    normalizedPosition === "non_asn" ||
    normalizedPosition === "public"
    ? normalizedPosition
    : null;
};

const canUseAudienceFilter = (
  selectedPosition: string,
  accountPosition?: string | null,
) => {
  if (selectedPosition === "" || selectedPosition === "public") {
    return true;
  }

  const normalizedAccountPosition = normalizeAccountPosition(accountPosition);

  if (!normalizedAccountPosition) {
    return false;
  }

  return normalizedAccountPosition === selectedPosition;
};

const getVisiblePageNumbers = (currentPage: number, totalPages: number) => {
  const pages = new Set([1, currentPage]);

  if (currentPage > 1) {
    pages.add(currentPage - 1);
  }

  if (currentPage < totalPages) {
    pages.add(currentPage + 1);
  }

  if (totalPages > 1) {
    pages.add(totalPages);
  }

  return Array.from(pages)
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    .sort((left, right) => left - right);
};

const getSortButtonLabel = (
  label: string,
  sortConfig: SortConfig,
  sortKey: SortKey,
) => {
  if (sortConfig.key !== sortKey) {
    return `Urutkan ${label} naik`;
  }

  return sortConfig.direction === "asc"
    ? `Urutkan ${label} turun`
    : `Urutkan ${label} naik`;
};

const SortableHeader = ({
  children,
  onSort,
  sortConfig,
  sortKey,
}: {
  children: string;
  onSort: (key: SortKey) => void;
  sortConfig: SortConfig;
  sortKey: SortKey;
}) => {
  const isActive = sortConfig.key === sortKey;
  const direction = isActive ? sortConfig.direction : null;

  return (
    <button
      aria-label={getSortButtonLabel(children, sortConfig, sortKey)}
      aria-sort={
        isActive
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
      className="history-sort"
      onClick={() => onSort(sortKey)}
      type="button"
    >
      <span>{children}</span>
      <span
        aria-hidden="true"
        className={`history-sort__icons ${direction ? `is-${direction}` : ""}`}
      >
        <span className="history-sort__icon history-sort__icon--up" />
        <span className="history-sort__icon history-sort__icon--down" />
      </span>
    </button>
  );
};

const buildEndpoint = (
  search: string,
  page: number,
  perPage: number,
  status: string,
  position: string,
  sortConfig: SortConfig,
) => {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    sort_by: sortConfig.key,
    sort_direction: sortConfig.direction,
  });

  if (search) {
    params.set("search", search);
  }

  if (status) {
    params.set("status", status);
  }

  if (position) {
    params.set("position", position);
  }

  return `${API_BASE_URL}/users/history?${params.toString()}`;
};

const getApiMessage = async (
  response: Response,
  fallback = "Riwayat survey belum bisa dimuat.",
) => {
  try {
    const result = (await response.json()) as HistoryApiResult;
    return result.message ?? fallback;
  } catch {
    return fallback;
  }
};

const HistorySkeleton = () => (
  <>
    {Array.from({ length: 3 }, (_, index) => (
      <tr className="history-table__skeleton" key={index}>
        <td><span /></td>
        <td><span /></td>
        <td><span /></td>
        <td><span /></td>
        <td><span /></td>
      </tr>
    ))}
  </>
);

export const History = ({
  accountDescription,
  accountAvatarSrc,
  accountName,
  accountPosition,
  accountPrivileges,
  isAuthenticated,
  onAuthAction,
  onBackHome,
  onOpenAccessManagement,
  onOpenManageSurveys,
  onOpenProfile,
  onOpenSurveyFill,
  onOpenSurveyList,
  onOpenUserManagement,
  onUnauthorized,
}: HistoryProps) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    direction: "desc",
    key: "date",
  });
  const [perPage, setPerPage] = useState<(typeof PER_PAGE_OPTIONS)[number]>(5);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);
  const [feedback, setFeedback] = useState("");
  const [isLimitOpen, setIsLimitOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const avatarSrc = accountAvatarSrc ?? adminAvatar;

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timerId = window.setTimeout(() => setFeedback(""), 4200);

    return () => window.clearTimeout(timerId);
  }, [feedback]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchHistory = async () => {
      setIsLoading(true);
      setFeedback("");

      try {
        const response = await fetch(
          buildEndpoint(
            searchQuery,
            page,
            perPage,
            statusFilter,
            positionFilter,
            sortConfig,
          ),
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
          throw new Error(await getApiMessage(response));
        }

        const result = (await response.json()) as HistoryApiResult;
        const nextHistory = (result.data?.items ?? []).map(normalizeHistoryItem);
        const nextMeta = normalizeMeta(result.data?.meta, perPage);

        setHistory(nextHistory);
        setMeta(nextMeta);

        if (page !== nextMeta.page) {
          setPage(nextMeta.page);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setHistory([]);
        setMeta({
          page: 1,
          perPage,
          total: 0,
          totalPages: 1,
        });
        setFeedback(
          error instanceof Error ? error.message : "Riwayat survey belum bisa dimuat.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void fetchHistory();

    return () => controller.abort();
  }, [
    onUnauthorized,
    page,
    perPage,
    positionFilter,
    searchQuery,
    sortConfig,
    statusFilter,
  ]);

  const closeSidebar = () => {
    setIsSidebarOpen(false);
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

    if (label === "Pengaturan Hak Akses") {
      onOpenAccessManagement?.();
    }
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
    setPage(1);
  };

  const handlePerPageChange = (nextPerPage: (typeof PER_PAGE_OPTIONS)[number]) => {
    setPerPage(nextPerPage);
    setPage(1);
    setIsLimitOpen(false);
  };

  const handleAudienceChange = (nextPosition: string) => {
    if (!canUseAudienceFilter(nextPosition, accountPosition)) {
      setFeedback(
        `Akun ${ACCESS_DENIED_LABELS[normalizeAccountPosition(accountPosition) ?? "public"]} tidak dapat melihat filter ${POSITION_LABELS[nextPosition] ?? nextPosition}.`,
      );
      return;
    }

    setPositionFilter(nextPosition);
    setPage(1);
  };

  const handleSortChange = (key: SortKey) => {
    setSortConfig((current) => ({
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
      key,
    }));
    setPage(1);
  };

  const currentPage = meta.page;
  const totalPages = meta.totalPages;
  const visiblePageNumbers = getVisiblePageNumbers(currentPage, totalPages);

  return (
    <main className="history-page">
      <Topbar
        avatarSrc={avatarSrc}
        isSidebarOpen={isSidebarOpen}
        onProfileClick={() => {
          closeSidebar();
          onOpenProfile?.();
        }}
        onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
        sidebarId="history-sidebar"
        title="Survey Pemkot Jogja"
      />

      <Sidebar
        accountDescription={accountDescription}
        accountName={accountName}
        activeItem="History"
        avatarSrc={avatarSrc}
        id="history-sidebar"
        isAuthenticated={isAuthenticated}
        isOpen={isSidebarOpen}
        onAuthAction={() => {
          closeSidebar();
          onAuthAction?.();
        }}
        onClose={closeSidebar}
        onNavigate={handleNavigationClick}
        privileges={accountPrivileges}
      />

      <section className="history-shell">
        {feedback && (
          <p className="history-toast" role="status">
            {feedback}
          </p>
        )}

        <div className="history-content">
          <header className="history-heading">
            <h1>Riwayat Survey</h1>
            <p>
              Kelola dan tinjau kembali data kontribusi survey yang telah Anda
              selesaikan atau sedang dikerjakan.
            </p>
          </header>

          <section className="history-filters" aria-label="Filter riwayat survey">
            <form className="history-search-form" onSubmit={handleSearchSubmit}>
              <label className="history-search" htmlFor="history-search">
                <span>Cari judul survey</span>
                <img src={searchIcon} alt="" aria-hidden="true" />
                <input
                  autoComplete="off"
                  id="history-search"
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Cari judul survey..."
                  type="search"
                  value={searchInput}
                />
              </label>

              <button className="history-search-button" type="submit">
                <img src={searchIcon} alt="" aria-hidden="true" />
                Cari
              </button>
            </form>

            <div className="history-filter-controls">
              <label>
                <span>Audiens</span>
                <select
                  aria-label="Filter audiens"
                  onChange={(event) => handleAudienceChange(event.target.value)}
                  value={positionFilter}
                >
                  <option value="">Audiens</option>
                  <option value="public">Masyarakat Umum</option>
                  <option value="asn">Pegawai ASN</option>
                  <option value="non_asn">Pegawai Non-ASN</option>
                </select>
              </label>

              <label>
                <span>Status</span>
                <select
                  aria-label="Filter status"
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                  value={statusFilter}
                >
                  <option value="">Status</option>
                  <option value="submitted">Terselesaikan</option>
                  <option value="draft">Belum Selesai</option>
                </select>
              </label>

              <div className="history-limit">
                <button
                  aria-expanded={isLimitOpen}
                  aria-haspopup="listbox"
                  aria-label={`Pilih jumlah data per halaman, saat ini ${perPage}`}
                  onClick={() => setIsLimitOpen((current) => !current)}
                  type="button"
                >
                  <img src={filterIcon} alt="" aria-hidden="true" />
                </button>

                {isLimitOpen && (
                  <div className="history-limit__menu" role="listbox">
                    {PER_PAGE_OPTIONS.map((option) => (
                      <button
                        aria-selected={option === perPage}
                        className={option === perPage ? "is-selected" : ""}
                        key={option}
                        onClick={() => handlePerPageChange(option)}
                        role="option"
                        type="button"
                      >
                        {option} data
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="history-table-card" aria-busy={isLoading}>
            <table className="history-table">
              <thead>
                <tr>
                  <th>
                    <SortableHeader
                      onSort={handleSortChange}
                      sortConfig={sortConfig}
                      sortKey="title"
                    >
                      Judul Survey
                    </SortableHeader>
                  </th>
                  <th>
                    <SortableHeader
                      onSort={handleSortChange}
                      sortConfig={sortConfig}
                      sortKey="positions"
                    >
                      Audiens
                    </SortableHeader>
                  </th>
                  <th>
                    <SortableHeader
                      onSort={handleSortChange}
                      sortConfig={sortConfig}
                      sortKey="date"
                    >
                      Tanggal Pengisian
                    </SortableHeader>
                  </th>
                  <th>
                    <SortableHeader
                      onSort={handleSortChange}
                      sortConfig={sortConfig}
                      sortKey="status"
                    >
                      Status
                    </SortableHeader>
                  </th>
                  <th>
                    <span className="history-table__static-head">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <HistorySkeleton />
                ) : history.length > 0 ? (
                  history.map((item) => (
                    <tr key={item.responseId}>
                      <td>
                        <strong title={item.title}>{item.title}</strong>
                      </td>
                      <td>
                        <div className="history-audience">
                          {getPositionBadges(item.positions).map((badge) => (
                            <span
                              className={`history-audience__badge history-audience__badge--${badge.key}`}
                              key={badge.key}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{formatDate(item.date)}</td>
                      <td>
                        <span
                          className={`history-status history-status--${item.responseStatus}`}
                        >
                          <i aria-hidden="true" />
                          {STATUS_LABELS[item.responseStatus]}
                        </span>
                      </td>
                      <td>
                        {item.responseStatus === "submitted" ? (
                          <button
                            aria-label={`Lihat ${item.title}`}
                            className="history-action history-action--icon"
                            onClick={() => onOpenSurveyFill?.(item.id)}
                            type="button"
                          >
                            <img src={eyeIcon} alt="" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            className="history-action history-action--continue"
                            onClick={() => onOpenSurveyFill?.(item.id)}
                            type="button"
                          >
                            Lanjutkan
                            <img src={arrowRightIcon} alt="" aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="history-empty" colSpan={5}>
                      <strong>Belum ada riwayat survey</strong>
                      <span>
                        Survey yang sudah dikirim atau masih menjadi draft akan
                        muncul di sini.
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <footer className="history-pagination-footer">
            <p>
              Menampilkan {history.length} dari {meta.total} survey
            </p>

            <nav aria-label="Pagination riwayat survey">
              <button
                aria-label="Halaman sebelumnya"
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                type="button"
              >
                <img src={paginationPrevIcon} alt="" aria-hidden="true" />
              </button>

              {visiblePageNumbers.map((pageNumber, index) => {
                const previousPageNumber = visiblePageNumbers[index - 1];
                const shouldShowEllipsis =
                  previousPageNumber !== undefined &&
                  pageNumber - previousPageNumber > 1;

                return (
                  <span className="history-pagination-group" key={pageNumber}>
                    {shouldShowEllipsis && <span aria-hidden="true">...</span>}
                    <button
                      aria-current={pageNumber === currentPage ? "page" : undefined}
                      className={pageNumber === currentPage ? "is-active" : ""}
                      onClick={() => setPage(pageNumber)}
                      type="button"
                    >
                      {pageNumber}
                    </button>
                  </span>
                );
              })}

              <button
                aria-label="Halaman berikutnya"
                disabled={currentPage === totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                type="button"
              >
                <img src={paginationNextIcon} alt="" aria-hidden="true" />
              </button>
            </nav>
          </footer>
        </div>
      </section>
    </main>
  );
};
