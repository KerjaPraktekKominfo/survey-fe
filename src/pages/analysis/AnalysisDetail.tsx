import { type FormEvent, useEffect, useState } from "react";
import { Sidebar } from "../../components/sidebar";
import { Topbar } from "../../components/topbar";
import adminAvatar from "../../assets/home/home-admin-avatar.png";
import usersIcon from "../../assets/home/home-nav-users.svg";
import searchIcon from "../../assets/survey/manage-search-icon.svg";
import limitIcon from "../../assets/survey/manage-limit-icon.svg";
import audienceIcon from "../../assets/survey/detail/detail-audience.svg";
import statusIcon from "../../assets/survey/detail/detail-status-check.svg";
import { API_BASE_URL } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import { resolveProfilePhotoUrl, type ProfilePhotoSource } from "../../lib/profilePhoto";
import "../../styles/analysis/Analysis.scss";

const RESPONDENT_PER_PAGE = 5;

type AnalysisDetailProps = {
  accountDescription?: string;
  accountAvatarSrc?: string;
  accountName?: string;
  accountPrivileges?: string[];
  isAuthenticated: boolean;
  onAuthAction?: () => void;
  onBackHome?: () => void;
  onOpenAccessManagement?: () => void;
  onOpenAnalysis?: () => void;
  onOpenHistory?: () => void;
  onOpenManageSurveys?: () => void;
  onOpenProfile?: () => void;
  onOpenSurveyList?: () => void;
  onOpenUserManagement?: () => void;
  onUnauthorized?: () => void;
  surveyId: number | null;
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

type DetailAnswer = {
  question_id?: number | string | null;
  question_text?: string | null;
  question_type?: string | null;
  value?: string | null;
};

type DetailRespondent = ProfilePhotoSource & {
  answers?: DetailAnswer[];
  full_name?: string | null;
  nik?: string | null;
  response_id: number | string;
  status?: string | null;
  submitted_at?: string | null;
};

type DetailQuestionOption = {
  count?: number | string | null;
  id?: number | string | null;
  option_text?: string | null;
  percentage?: number | string | null;
};

type DetailTextAnswer = {
  answer_text?: string | null;
  respondent_name?: string | null;
  submitted_at?: string | null;
};

type DetailQuestion = {
  id: number | string;
  is_required?: boolean | null;
  options?: DetailQuestionOption[];
  parent_option_id?: number | string | null;
  question_text?: string | null;
  question_type?: string | null;
  text_answers?: DetailTextAnswer[];
};

type DetailPage = {
  page?: number | string | null;
  questions?: DetailQuestion[];
  section?: string | null;
};

type AnalysisDetailData = {
  pages?: DetailPage[];
  respondents?: {
    items?: DetailRespondent[];
    meta?: ApiMeta;
  };
  summary?: {
    audience?: string | null;
    status?: string | null;
    total_respondents?: number | string | null;
  };
  survey?: {
    closes_at?: string | null;
    description?: string | null;
    id?: number | string | null;
    opd_pengampu?: string | null;
    opens_at?: string | null;
    positions?: string[] | null;
    status?: string | null;
    title?: string | null;
  };
};

type PaginationMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

const initialMeta: PaginationMeta = {
  page: 1,
  perPage: RESPONDENT_PER_PAGE,
  total: 0,
  totalPages: 1,
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  checkbox: "Kotak Centang",
  dropdown: "Dropdown",
  free_text: "Jawaban Singkat",
  radio_button: "Radio Button",
};

const STATUS_LABELS: Record<string, string> = {
  closed: "Closed",
  draft: "Draft",
  open: "Open",
  submitted: "Selesai",
  upcoming: "Upcoming",
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

const normalizeMeta = (meta?: ApiMeta): PaginationMeta => ({
  page: Math.max(1, parseNumber(meta?.page, 1)),
  perPage: Math.max(1, parseNumber(meta?.per_page, RESPONDENT_PER_PAGE)),
  total: Math.max(0, parseNumber(meta?.total, 0)),
  totalPages: Math.max(1, parseNumber(meta?.total_pages, 1)),
});

const formatNumber = (value: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value.replace(" ", "T"));

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(/\./g, ":");
};

const getInitials = (name?: string | null) =>
  (name ?? "R")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "R";

const getApiMessage = async (
  response: Response,
  fallback = "Detail analisis belum bisa dimuat.",
) => {
  try {
    const result = (await response.json()) as ApiResult;
    return result.message ?? fallback;
  } catch {
    return fallback;
  }
};

export const AnalysisDetail = ({
  accountDescription,
  accountAvatarSrc,
  accountName,
  accountPrivileges,
  isAuthenticated,
  onAuthAction,
  onBackHome,
  onOpenAccessManagement,
  onOpenAnalysis,
  onOpenHistory,
  onOpenManageSurveys,
  onOpenProfile,
  onOpenSurveyList,
  onOpenUserManagement,
  onUnauthorized,
  surveyId,
}: AnalysisDetailProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);
  const [detail, setDetail] = useState<AnalysisDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [selectedPage, setSelectedPage] = useState(1);
  const [selectedRespondentPage, setSelectedRespondentPage] = useState(1);
  const [selectedRespondent, setSelectedRespondent] =
    useState<DetailRespondent | null>(null);
  const avatarSrc = accountAvatarSrc ?? adminAvatar;

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timerId = window.setTimeout(() => setFeedback(""), 4200);
    return () => window.clearTimeout(timerId);
  }, [feedback]);

  useEffect(() => {
    if (!surveyId) {
      const timerId = window.setTimeout(() => {
        setIsLoading(false);
        setFeedback("Survey tidak valid.");
      }, 0);

      return () => window.clearTimeout(timerId);
    }

    const controller = new AbortController();

    const fetchDetail = async () => {
      setIsLoading(true);
      setFeedback("");

      const params = new URLSearchParams({
        page: String(page),
        per_page: String(RESPONDENT_PER_PAGE),
      });

      if (searchQuery) {
        params.set("search", searchQuery);
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/surveys/${surveyId}/analytics?${params.toString()}`,
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

        const result = (await response.json()) as ApiResult<AnalysisDetailData>;
        const nextDetail = result.data ?? null;
        const nextMeta = normalizeMeta(nextDetail?.respondents?.meta);

        setDetail(nextDetail);
        setMeta(nextMeta);

        const availablePages = nextDetail?.pages ?? [];
        if (availablePages.length > 0) {
          setSelectedPage((currentPage) => {
            const hasCurrentPage = availablePages.some(
              (item) => Math.max(1, Number(item.page) || 1) === currentPage,
            );

            return hasCurrentPage
              ? currentPage
              : Math.max(1, Number(availablePages[0]?.page) || 1);
          });
        }

        if (page !== nextMeta.page) {
          setPage(nextMeta.page);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setDetail(null);
        setFeedback(
          error instanceof Error ? error.message : "Detail analisis belum bisa dimuat.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void fetchDetail();

    return () => controller.abort();
  }, [onUnauthorized, page, searchQuery, surveyId]);

  const activePage =
    (detail?.pages ?? []).find(
      (item) => Math.max(1, Number(item.page) || 1) === selectedPage,
    ) ?? detail?.pages?.[0];
  const respondentPages = detail?.pages ?? [];
  const activeRespondentPage =
    respondentPages.find(
      (item) => Math.max(1, Number(item.page) || 1) === selectedRespondentPage,
    ) ?? respondentPages[0];
  const activeRespondentQuestionIds = new Set(
    (activeRespondentPage?.questions ?? []).map((question) => String(question.id)),
  );
  const activeRespondentAnswers = (selectedRespondent?.answers ?? []).filter(
    (answer) => activeRespondentQuestionIds.has(String(answer.question_id)),
  );
  const respondents = detail?.respondents?.items ?? [];
  const surveyTitle = detail?.survey?.title?.trim() || "Detail Analisis";
  const opdPengampu =
    detail?.survey?.opd_pengampu?.trim() || "OPD pengampu belum diatur";
  const status = detail?.summary?.status?.trim().toLowerCase() || "draft";
  const visiblePages = new Set([1, meta.page, meta.totalPages]);

  if (meta.page > 1) {
    visiblePages.add(meta.page - 1);
  }

  if (meta.page < meta.totalPages) {
    visiblePages.add(meta.page + 1);
  }

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

    if (label === "Analisis") {
      onOpenAnalysis?.();
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

  const handleExport = async () => {
    if (!surveyId) {
      return;
    }

    setIsExporting(true);
    setFeedback("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/surveys/${surveyId}/analytics/export`,
        {
          credentials: "include",
          headers: authHeaders(),
          method: "GET",
        },
      );

      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }

      if (!response.ok) {
        throw new Error(await getApiMessage(response, "Export belum bisa dibuat."));
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? "survey-responses.xls";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Export belum bisa dibuat.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="analysis-page analysis-page--detail">
      <Topbar
        avatarSrc={avatarSrc}
        isSidebarOpen={isSidebarOpen}
        onProfileClick={() => {
          closeSidebar();
          onOpenProfile?.();
        }}
        onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
        sidebarId="analysis-detail-sidebar"
        title="Survey Pemkot Jogja"
      />

      <Sidebar
        accountDescription={accountDescription}
        accountName={accountName}
        activeItem="Analisis"
        avatarSrc={avatarSrc}
        id="analysis-detail-sidebar"
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

      <section className="analysis-detail-shell">
        {feedback && (
          <p className="analysis-toast" role="status">
            {feedback}
          </p>
        )}

        <div className="analysis-detail-content">
          <header className="analysis-detail-heading">
            <nav aria-label="Breadcrumb analisis">
              <button onClick={onBackHome} type="button">
                Beranda
              </button>
              <span aria-hidden="true">{">"}</span>
              <button onClick={onOpenAnalysis} type="button">
                Analisis
              </button>
              <span aria-hidden="true">{">"}</span>
              <strong>Detail</strong>
            </nav>
            <div>
              <section>
                <h1>{surveyTitle}</h1>
                <p>{opdPengampu}</p>
              </section>
              <button
                className="analysis-export"
                disabled={isExporting || isLoading}
                onClick={() => void handleExport()}
                type="button"
              >
                {isExporting ? "Mengekspor..." : "Export Data"}
              </button>
            </div>
          </header>

          <section className="analysis-detail-stats" aria-busy={isLoading}>
            <article className="analysis-detail-stats__item analysis-detail-stats__item--respondents">
              <span aria-hidden="true">
                <img src={usersIcon} alt="" />
              </span>
              <div>
                <p>Total Responden</p>
                <strong>{formatNumber(parseNumber(detail?.summary?.total_respondents, 0))}</strong>
              </div>
            </article>
            <article className="analysis-detail-stats__item analysis-detail-stats__item--status">
              <span aria-hidden="true">
                <img src={statusIcon} alt="" />
              </span>
              <div>
                <p>Status</p>
                <strong className={`analysis-status analysis-status--${status}`}>
                  {STATUS_LABELS[status] ?? status}
                </strong>
              </div>
            </article>
            <article className="analysis-detail-stats__item analysis-detail-stats__item--audience">
              <span aria-hidden="true">
                <img src={audienceIcon} alt="" />
              </span>
              <div>
                <p>Survey Audiens</p>
                <strong>{detail?.summary?.audience ?? "-"}</strong>
              </div>
            </article>
          </section>

          <section className="analysis-respondent-card" aria-busy={isLoading}>
            <header>
              <h2>Daftar Responden</h2>
              <form onSubmit={handleSearchSubmit}>
                <label>
                  <span>Cari responden</span>
                  <img src={searchIcon} alt="" aria-hidden="true" />
                  <input
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Cari Responden"
                    type="search"
                    value={searchInput}
                  />
                </label>
                <button type="submit">
                  <img src={limitIcon} alt="" aria-hidden="true" />
                </button>
              </form>
            </header>

            <div className="analysis-table-wrap">
              <table className="analysis-table analysis-table--respondents">
                <thead>
                  <tr>
                    <th>Nama Lengkap / NIK</th>
                    <th>Tanggal Selesai Mengisi</th>
                    <th>Status Pengisian</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 5 }, (_, index) => (
                      <tr className="analysis-table__skeleton" key={index}>
                        <td><span /></td>
                        <td><span /></td>
                        <td><span /></td>
                        <td><span /></td>
                      </tr>
                    ))
                  ) : respondents.length > 0 ? (
                    respondents.map((respondent) => {
                      const photoSrc = resolveProfilePhotoUrl(respondent, "");

                      return (
                        <tr key={respondent.response_id}>
                          <td>
                            <span
                              className={`analysis-avatar ${
                                photoSrc ? "analysis-avatar--photo" : ""
                              }`}
                            >
                              {photoSrc && <img src={photoSrc} alt="" />}
                              <span>{getInitials(respondent.full_name)}</span>
                            </span>
                            <div>
                              <strong>{respondent.full_name ?? "Responden"}</strong>
                              <small>{respondent.nik ?? "-"}</small>
                            </div>
                          </td>
                          <td>{formatDateTime(respondent.submitted_at)}</td>
                          <td>
                            <span className="analysis-status analysis-status--submitted">
                              {STATUS_LABELS[respondent.status ?? "submitted"] ?? "Selesai"}
                            </span>
                          </td>
                          <td>
                          <button
                            className="analysis-detail-button"
                            onClick={() => {
                              setSelectedRespondent(respondent);
                              setSelectedRespondentPage(selectedPage);
                            }}
                            type="button"
                          >
                              View Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="analysis-empty" colSpan={4}>
                        <strong>Belum ada responden</strong>
                        <span>Response submitted akan tampil di tabel ini.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <footer>
              <p>
                Menampilkan {respondents.length} dari {meta.total} responden
              </p>
              <nav aria-label="Pagination responden">
                <button
                  disabled={meta.page === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  {"<"}
                </button>
                {Array.from(visiblePages)
                  .sort((left, right) => left - right)
                  .map((pageNumber) => (
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

          <section className="analysis-recap-card" aria-busy={isLoading}>
            <header>
              <div>
                <h2>Rekapitulasi Jawaban Per Pertanyaan</h2>
                <p>Total data yang diolah dari response submitted.</p>
              </div>
              <div className="analysis-page-tabs" role="tablist">
                {(detail?.pages ?? []).map((pageItem) => {
                  const pageNumber = Math.max(1, Number(pageItem.page) || 1);
                  const sectionName = pageItem.section?.trim() || `Halaman ${pageNumber}`;

                  return (
                    <button
                      aria-selected={pageNumber === selectedPage}
                      className={pageNumber === selectedPage ? "is-active" : ""}
                      key={pageNumber}
                      onClick={() => setSelectedPage(pageNumber)}
                      role="tab"
                      title={sectionName}
                      type="button"
                    >
                      {sectionName}
                    </button>
                  );
                })}
              </div>
            </header>

            <div className="analysis-question-list">
              {(activePage?.questions ?? []).map((question, index) => (
                <article className="analysis-question-card" key={question.id}>
                  <div className="analysis-question-card__head">
                    <span>{index + 1}</span>
                    <div>
                      <h3>{question.question_text || `Pertanyaan ${index + 1}`}</h3>
                      <p>
                        Tipe:{" "}
                        {QUESTION_TYPE_LABELS[question.question_type ?? ""] ??
                          question.question_type ??
                          "-"}
                      </p>
                    </div>
                  </div>

                  {question.question_type === "free_text" ? (
                    <div className="analysis-text-answers">
                      {(question.text_answers ?? []).slice(0, 3).map((answer, answerIndex) => (
                        <div key={`${question.id}-${answerIndex}`}>
                          <p>{answer.answer_text}</p>
                          <small>
                            {answer.respondent_name ?? "Responden"} -{" "}
                            {formatDateTime(answer.submitted_at)}
                          </small>
                        </div>
                      ))}
                      {(question.text_answers ?? []).length === 0 && (
                        <em>Belum ada jawaban teks.</em>
                      )}
                    </div>
                  ) : (
                    <div className="analysis-option-list">
                      {(question.options ?? []).map((option) => (
                        <div key={option.id ?? option.option_text}>
                          <span>{option.option_text}</span>
                          <strong>
                            {formatNumber(parseNumber(option.count, 0))} Responden
                            {` (${parseNumber(option.percentage, 0)}%)`}
                          </strong>
                        </div>
                      ))}
                      {(question.options ?? []).length === 0 && (
                        <em>Belum ada opsi untuk pertanyaan ini.</em>
                      )}
                    </div>
                  )}
                </article>
              ))}
              {!isLoading && (activePage?.questions ?? []).length === 0 && (
                <div className="analysis-empty analysis-empty--block">
                  <strong>Belum ada pertanyaan pada halaman ini</strong>
                  <span>Pilih halaman lain atau lengkapi isi survey.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      {selectedRespondent && (
        <div className="analysis-modal" role="presentation">
          <button
            aria-label="Tutup detail responden"
            className="analysis-modal__backdrop"
            onClick={() => setSelectedRespondent(null)}
            type="button"
          />
          <section
            aria-labelledby="respondent-detail-title"
            aria-modal="true"
            className="analysis-modal__panel"
            role="dialog"
          >
            <header>
              <div>
                <h2 id="respondent-detail-title">
                  {selectedRespondent.full_name ?? "Detail Responden"}
                </h2>
                <p>{selectedRespondent.nik ?? "-"}</p>
              </div>
              <button onClick={() => setSelectedRespondent(null)} type="button">
                Tutup
              </button>
            </header>
            {respondentPages.length > 1 && (
              <nav className="analysis-modal__tabs" aria-label="Halaman jawaban responden">
                {respondentPages.map((pageItem) => {
                  const pageNumber = Math.max(1, Number(pageItem.page) || 1);
                  const sectionName = pageItem.section?.trim() || `Halaman ${pageNumber}`;

                  return (
                    <button
                      aria-current={
                        pageNumber === selectedRespondentPage ? "page" : undefined
                      }
                      className={
                        pageNumber === selectedRespondentPage ? "is-active" : ""
                      }
                      key={pageNumber}
                      onClick={() => setSelectedRespondentPage(pageNumber)}
                      title={sectionName}
                      type="button"
                    >
                      {sectionName}
                    </button>
                  );
                })}
              </nav>
            )}
            <div className="analysis-modal__answers">
              {activeRespondentAnswers.map((answer, index) => (
                <article key={`${answer.question_id}-${index}`}>
                  <h3>{answer.question_text ?? `Pertanyaan ${index + 1}`}</h3>
                  <p>{answer.value ?? "-"}</p>
                </article>
              ))}
              {activeRespondentAnswers.length === 0 && (
                <div className="analysis-empty analysis-empty--block">
                  <strong>Belum ada jawaban di halaman ini</strong>
                  <span>Pilih tab halaman lain untuk melihat jawaban responden.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
