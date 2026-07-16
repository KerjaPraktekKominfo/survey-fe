import { type FormEvent, useEffect, useState } from "react";
import { Sidebar } from "../../components/sidebar";
import { Topbar } from "../../components/topbar";
import adminAvatar from "../../assets/home/home-admin-avatar.png";
import analyticsIcon from "../../assets/home/home-nav-analytics.svg";
import dashboardIcon from "../../assets/home/home-nav-dashboard.svg";
import listIcon from "../../assets/home/home-nav-list.svg";
import calendarIcon from "../../assets/survey/create/create-calendar.svg";
import searchIcon from "../../assets/survey/manage-search-icon.svg";
import limitIcon from "../../assets/survey/manage-limit-icon.svg";
import eyeIcon from "../../assets/auth/login/login-eye-icon.svg";
import { API_BASE_URL } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import "../../styles/analysis/Analysis.scss";

const PER_PAGE_OPTIONS = [5, 10, 25, 50, 100] as const;

type AnalysisProps = {
  accountDescription?: string;
  accountAvatarSrc?: string;
  accountName?: string;
  accountPrivileges?: string[];
  isAuthenticated: boolean;
  onAuthAction?: () => void;
  onBackHome?: () => void;
  onOpenAccessManagement?: () => void;
  onOpenAnalysisDetail?: (surveyId: number | string) => void;
  onOpenHistory?: () => void;
  onOpenManageSurveys?: () => void;
  onOpenProfile?: () => void;
  onOpenSurveyList?: () => void;
  onOpenUserManagement?: () => void;
  onUnauthorized?: () => void;
};

type ApiMeta = {
  page?: number | string | null;
  per_page?: number | string | null;
  total?: number | string | null;
  total_pages?: number | string | null;
};

type ApiResult<TData = unknown> = {
  data?: TData;
  message?: string;
};

type AnalysisApiSurvey = {
  closes_at?: string | null;
  description?: string | null;
  id: number | string;
  opd_pengampu?: string | null;
  opens_at?: string | null;
  positions?: string[] | null;
  response_count?: number | string | null;
  status?: string | null;
  title?: string | null;
};

type AnalysisApiData = {
  available_years?: Array<number | string>;
  items?: AnalysisApiSurvey[];
  meta?: ApiMeta;
  response_volume?: Array<{
    label?: string | null;
    period?: string | null;
    total?: number | string | null;
  }>;
  summary?: {
    active_surveys?: number | string | null;
    closed_surveys?: number | string | null;
    position_respondents?: {
      asn?: number | string | null;
      non_asn?: number | string | null;
      public?: number | string | null;
    };
    total_respondents?: number | string | null;
    total_surveys?: number | string | null;
  };
  scope?: string | null;
  selected_year?: number | string | null;
};

type AnalysisSurvey = {
  closesAt?: string | null;
  description: string;
  id: number | string;
  opdPengampu: string;
  opensAt?: string | null;
  positions: string[];
  responseCount: number;
  status: string;
  title: string;
};

type PaginationMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

type SummaryCard = {
  icon: string;
  label: string;
  value: string;
};

const initialMeta: PaginationMeta = {
  page: 1,
  perPage: 5,
  total: 0,
  totalPages: 1,
};

const STATUS_LABELS: Record<string, string> = {
  closed: "CLOSED",
  draft: "DRAFT",
  open: "OPEN",
  upcoming: "UPCOMING",
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

const normalizeMeta = (meta?: ApiMeta, fallbackPerPage = 5): PaginationMeta => ({
  page: Math.max(1, parseNumber(meta?.page, 1)),
  perPage: Math.max(1, parseNumber(meta?.per_page, fallbackPerPage)),
  total: Math.max(0, parseNumber(meta?.total, 0)),
  totalPages: Math.max(1, parseNumber(meta?.total_pages, 1)),
});

const normalizeSurvey = (survey: AnalysisApiSurvey): AnalysisSurvey => ({
  closesAt: survey.closes_at,
  description: survey.description?.trim() || "Tidak ada deskripsi survey.",
  id: survey.id,
  opdPengampu: survey.opd_pengampu?.trim() || "OPD belum diatur",
  opensAt: survey.opens_at,
  positions: Array.isArray(survey.positions) ? survey.positions : [],
  responseCount: parseNumber(survey.response_count, 0),
  status: survey.status?.trim().toLowerCase() || "draft",
  title: survey.title?.trim() || "Survey tanpa judul",
});

const formatNumber = (value: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);

const normalizeYearOption = (value: number | string | null | undefined) => {
  const parsedValue = parseNumber(value, 0);
  return parsedValue > 0 ? parsedValue : null;
};

const formatDate = (dateValue?: string | null) => {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(dateValue.replace(" ", "T"));

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

const formatPeriod = (opensAt?: string | null, closesAt?: string | null) => {
  const start = formatDate(opensAt);
  const end = formatDate(closesAt);

  if (start === "-" && end === "-") {
    return "-";
  }

  return `${start} - ${end}`;
};

const getVisiblePageNumbers = (meta: PaginationMeta) => {
  const pages = new Set([1, meta.page]);

  if (meta.page < meta.totalPages) {
    pages.add(meta.page + 1);
  }

  if (meta.totalPages > 1) {
    pages.add(meta.totalPages);
  }

  return Array.from(pages)
    .filter((page) => page >= 1 && page <= meta.totalPages)
    .sort((left, right) => left - right);
};

const getApiMessage = async (
  response: Response,
  fallback = "Data analisis belum bisa dimuat.",
) => {
  try {
    const result = (await response.json()) as ApiResult;
    return result.message ?? fallback;
  } catch {
    return fallback;
  }
};

const buildEndpoint = (
  search: string,
  status: string,
  page: number,
  perPage: number,
  year: number,
) => {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    year: String(year),
  });

  if (search) {
    params.set("search", search);
  }

  if (status) {
    params.set("status", status);
  }

  return `${API_BASE_URL}/surveys/analytics?${params.toString()}`;
};

export const Analysis = ({
  accountDescription,
  accountAvatarSrc,
  accountName,
  accountPrivileges,
  isAuthenticated,
  onAuthAction,
  onBackHome,
  onOpenAccessManagement,
  onOpenAnalysisDetail,
  onOpenHistory,
  onOpenManageSurveys,
  onOpenProfile,
  onOpenSurveyList,
  onOpenUserManagement,
  onUnauthorized,
}: AnalysisProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [perPage, setPerPage] = useState<(typeof PER_PAGE_OPTIONS)[number]>(5);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);
  const [surveys, setSurveys] = useState<AnalysisSurvey[]>([]);
  const [summary, setSummary] = useState({
    activeSurveys: 0,
    closedSurveys: 0,
    positionRespondents: {
      asn: 0,
      nonAsn: 0,
      public: 0,
    },
    totalRespondents: 0,
    totalSurveys: 0,
  });
  const [volume, setVolume] = useState<
    Array<{ label: string; period: string; total: number }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [isLimitOpen, setIsLimitOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [analysisScope, setAnalysisScope] = useState<"all" | "own">("own");
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

    const fetchAnalysis = async () => {
      setIsLoading(true);
      setFeedback("");

      try {
        const response = await fetch(
          buildEndpoint(searchQuery, statusFilter, page, perPage, selectedYear),
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

        const result = (await response.json()) as ApiResult<AnalysisApiData>;
        const data = result.data ?? {};
        const nextMeta = normalizeMeta(data.meta, perPage);

        setSummary({
          activeSurveys: parseNumber(data.summary?.active_surveys, 0),
          closedSurveys: parseNumber(data.summary?.closed_surveys, 0),
          positionRespondents: {
            asn: parseNumber(data.summary?.position_respondents?.asn, 0),
            nonAsn: parseNumber(data.summary?.position_respondents?.non_asn, 0),
            public: parseNumber(data.summary?.position_respondents?.public, 0),
          },
          totalRespondents: parseNumber(data.summary?.total_respondents, 0),
          totalSurveys: parseNumber(data.summary?.total_surveys, 0),
        });
        setAnalysisScope(data.scope === "all" ? "all" : "own");
        setVolume(
          (data.response_volume ?? []).map((item) => ({
            label: item.label?.trim() || "-",
            period: item.period?.trim() || "",
            total: parseNumber(item.total, 0),
          })),
        );
        setSurveys((data.items ?? []).map(normalizeSurvey));
        setMeta(nextMeta);
        setAvailableYears(() => {
          const years = (data.available_years ?? [data.selected_year ?? selectedYear])
            .map(normalizeYearOption)
            .filter((year): year is number => year !== null);
          const normalizedYears = Array.from(new Set([...years, selectedYear])).sort(
            (left, right) => right - left,
          );

          return normalizedYears.length > 0 ? normalizedYears : [selectedYear];
        });

        if (page !== nextMeta.page) {
          setPage(nextMeta.page);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSurveys([]);
        setFeedback(
          error instanceof Error ? error.message : "Data analisis belum bisa dimuat.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void fetchAnalysis();

    return () => controller.abort();
  }, [onUnauthorized, page, perPage, searchQuery, selectedYear, statusFilter]);

  const summaryCards: SummaryCard[] = [
    {
      icon: listIcon,
      label: "Total Surveys",
      value: formatNumber(summary.totalSurveys),
    },
    {
      icon: dashboardIcon,
      label: "Active Surveys",
      value: formatNumber(summary.activeSurveys),
    },
    {
      icon: analyticsIcon,
      label: "Closed Surveys",
      value: formatNumber(summary.closedSurveys),
    },
    {
      icon: analyticsIcon,
      label: "Total Respondents",
      value: formatNumber(summary.totalRespondents),
    },
  ];
  const positionSummary = [
    {
      label: "Pegawai ASN",
      value: summary.positionRespondents.asn,
    },
    {
      label: "Pegawai Non-ASN",
      value: summary.positionRespondents.nonAsn,
    },
    {
      label: "Masyarakat Umum",
      value: summary.positionRespondents.public,
    },
  ];
  const maxVolume = Math.max(1, ...volume.map((item) => item.total));
  const visiblePages = getVisiblePageNumbers(meta);

  const closeSidebar = () => setIsSidebarOpen(false);

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

    if (label === "History") {
      onOpenHistory?.();
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

  const handleYearChange = (nextYear: number) => {
    setSelectedYear(nextYear);
    setPage(1);
    setIsYearOpen(false);
  };

  return (
    <main className="analysis-page">
      <Topbar
        avatarSrc={avatarSrc}
        isSidebarOpen={isSidebarOpen}
        onProfileClick={() => {
          closeSidebar();
          onOpenProfile?.();
        }}
        onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
        sidebarId="analysis-sidebar"
        title="Survey Pemkot Jogja"
      />

      <Sidebar
        accountDescription={accountDescription}
        accountName={accountName}
        activeItem="Analisis"
        avatarSrc={avatarSrc}
        id="analysis-sidebar"
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

      <section className="analysis-shell">
        {feedback && (
          <p className="analysis-toast" role="status">
            {feedback}
          </p>
        )}

        <div className="analysis-content">
          <header className="analysis-heading">
            <div>
              <h1>Overview</h1>
              <p>Analisis Survei: Kinerja &amp; Partisipasi Warga</p>
            </div>
            <div className="analysis-year-filter">
              <button
                aria-expanded={isYearOpen}
                aria-haspopup="listbox"
                onClick={() => setIsYearOpen((current) => !current)}
                type="button"
              >
                <img src={calendarIcon} alt="" aria-hidden="true" />
                <span>{selectedYear}</span>
                <span className="analysis-year-filter__chevron" aria-hidden="true" />
              </button>
              {isYearOpen && (
                <div className="analysis-year-filter__menu" role="listbox">
                  {availableYears.map((year) => (
                    <button
                      aria-selected={year === selectedYear}
                      className={year === selectedYear ? "is-selected" : ""}
                      key={year}
                      onClick={() => handleYearChange(year)}
                      role="option"
                      type="button"
                    >
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </header>

          <section className="analysis-summary" aria-label="Ringkasan analisis">
            {summaryCards.map((card) => (
              <article className="analysis-summary-card" key={card.label}>
                <span aria-hidden="true">
                  <img src={card.icon} alt="" />
                </span>
                <div>
                  <p>{card.label}</p>
                  <strong>{card.value}</strong>
                </div>
              </article>
            ))}
          </section>

          <section
            className="analysis-summary analysis-summary--positions"
            aria-label="Ringkasan responden per posisi"
          >
            {positionSummary.map((item) => (
              <article className="analysis-summary-card" key={item.label}>
                <span aria-hidden="true">
                  <img src={dashboardIcon} alt="" />
                </span>
                <div>
                  <p>{item.label}</p>
                  <strong>{formatNumber(item.value)}</strong>
                </div>
              </article>
            ))}
          </section>

          <section className="analysis-chart-card" aria-label="Volume response">
            <header>
              <h2>Response Volume</h2>
              <strong>Tahun {selectedYear}</strong>
            </header>
            <div className="analysis-chart">
              {volume.map((item) => (
                <div className="analysis-chart__bar" key={item.period || item.label}>
                  <span
                    style={{
                      height: `${Math.max(8, (item.total / maxVolume) * 160)}px`,
                    }}
                    title={`${item.label}: ${formatNumber(item.total)} response`}
                  />
                  <small>{item.label}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="analysis-table-card" aria-busy={isLoading}>
            <header>
              <h2>
                {analysisScope === "all" ? "Daftar Survey" : "Daftar Survey Anda"}
              </h2>
              <div className="analysis-table-tools">
                <form onSubmit={handleSearchSubmit}>
                  <label>
                    <span>Cari survey</span>
                    <img src={searchIcon} alt="" aria-hidden="true" />
                    <input
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Cari judul survei..."
                      type="search"
                      value={searchInput}
                    />
                  </label>
                </form>
                <label className="analysis-select">
                  <span>Status</span>
                  <select
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setPage(1);
                    }}
                    value={statusFilter}
                  >
                    <option value="">Status</option>
                    <option value="open">Open</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="closed">Closed</option>
                    <option value="draft">Draft</option>
                  </select>
                </label>
                <div className="analysis-limit">
                  <button
                    aria-expanded={isLimitOpen}
                    aria-haspopup="listbox"
                    onClick={() => setIsLimitOpen((current) => !current)}
                    type="button"
                  >
                    <img src={limitIcon} alt="" aria-hidden="true" />
                  </button>
                  {isLimitOpen && (
                    <div className="analysis-limit__menu" role="listbox">
                      {PER_PAGE_OPTIONS.map((option) => (
                        <button
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
            </header>

            <div className="analysis-table-wrap">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>Survey Title</th>
                    <th>Periode</th>
                    <th>Responses</th>
                    <th>Status Badge</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 3 }, (_, index) => (
                      <tr className="analysis-table__skeleton" key={index}>
                        <td><span /></td>
                        <td><span /></td>
                        <td><span /></td>
                        <td><span /></td>
                        <td><span /></td>
                      </tr>
                    ))
                  ) : surveys.length > 0 ? (
                    surveys.map((survey) => (
                      <tr key={survey.id}>
                        <td>
                          <strong title={survey.title}>{survey.title}</strong>
                          <small title={survey.opdPengampu}>{survey.opdPengampu}</small>
                        </td>
                        <td>{formatPeriod(survey.opensAt, survey.closesAt)}</td>
                        <td>{formatNumber(survey.responseCount)}</td>
                        <td>
                          <span className={`analysis-status analysis-status--${survey.status}`}>
                            {STATUS_LABELS[survey.status] ?? survey.status}
                          </span>
                        </td>
                        <td>
                          <button
                            aria-label={`Lihat detail analisis ${survey.title}`}
                            className="analysis-eye-button"
                            onClick={() => onOpenAnalysisDetail?.(survey.id)}
                            type="button"
                          >
                            <img src={eyeIcon} alt="" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="analysis-empty" colSpan={5}>
                        <strong>Belum ada data analisis</strong>
                        <span>Survey yang dibuat akan muncul di sini.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <footer>
              <p>
                Menampilkan {surveys.length} dari {meta.total} survey
              </p>
              <nav aria-label="Pagination analisis">
                <button
                  disabled={meta.page === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  {"<"}
                </button>
                {visiblePages.map((pageNumber) => (
                  <button
                    aria-current={pageNumber === meta.page ? "page" : undefined}
                    className={pageNumber === meta.page ? "is-active" : ""}
                    key={pageNumber}
                    onClick={() => setPage(pageNumber)}
                    type="button"
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  disabled={meta.page === meta.totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(meta.totalPages, current + 1))
                  }
                  type="button"
                >
                  {">"}
                </button>
              </nav>
            </footer>
          </section>
        </div>
      </section>
    </main>
  );
};
