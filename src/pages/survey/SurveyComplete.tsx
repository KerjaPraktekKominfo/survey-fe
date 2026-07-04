import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "../../components/sidebar";
import { Topbar } from "../../components/topbar";
import adminAvatar from "../../assets/home/home-admin-avatar.png";
import checkIcon from "../../assets/survey/complete/complete-check.svg";
import homeIcon from "../../assets/survey/complete/complete-home.svg";
import { API_BASE_URL } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import "../../styles/survey/SurveyComplete.scss";

const COMPLETION_STORAGE_PREFIX = "survey_completion_";

type SurveyCompleteProps = {
  accountDescription?: string;
  accountAvatarSrc?: string;
  accountName?: string;
  accountPrivileges?: string[];
  isAuthenticated: boolean;
  onAuthAction?: () => void;
  onOpenAccessManagement?: () => void;
  onBackHome?: () => void;
  onOpenHistory?: () => void;
  onOpenManageSurveys?: () => void;
  onOpenProfile?: () => void;
  onOpenSurveyList?: () => void;
  onOpenUserManagement?: () => void;
  onUnauthorized?: () => void;
  surveyId: number | null;
};

type ApiResult<TData = unknown> = {
  data?: TData;
  message?: string;
  status?: string;
};

type SurveyDetailApi = {
  title?: string | null;
};

type CompletionSummary = {
  submittedAt?: string;
  title?: string;
};

const DEFAULT_TITLE = "Evaluasi Pelayanan Publik 2026";

const getCompletionStorageKey = (surveyId: number | null) =>
  surveyId ? `${COMPLETION_STORAGE_PREFIX}${surveyId}` : "";

const readCompletionSummary = (surveyId: number | null): CompletionSummary => {
  const storageKey = getCompletionStorageKey(surveyId);

  if (!storageKey) {
    return {};
  }

  try {
    const storedSummary = sessionStorage.getItem(storageKey);
    return storedSummary ? (JSON.parse(storedSummary) as CompletionSummary) : {};
  } catch {
    return {};
  }
};

const formatSubmittedAt = (value?: string) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "Baru saja";
  }

  return `${new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date)}, ${new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  })
    .format(date)
    .replace(".", ":")}`;
};

export const SurveyComplete = ({
  accountDescription,
  accountAvatarSrc,
  accountName,
  accountPrivileges,
  isAuthenticated,
  onAuthAction,
  onOpenAccessManagement,
  onBackHome,
  onOpenHistory,
  onOpenManageSurveys,
  onOpenProfile,
  onOpenSurveyList,
  onOpenUserManagement,
  onUnauthorized,
  surveyId,
}: SurveyCompleteProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [summary, setSummary] = useState<CompletionSummary>(() =>
    readCompletionSummary(surveyId),
  );
  const avatarSrc = accountAvatarSrc ?? adminAvatar;

  useEffect(() => {
    if (!surveyId || summary.title) {
      return;
    }

    const controller = new AbortController();

    const fetchSurveyTitle = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/surveys/${surveyId}`, {
          credentials: "include",
          headers: authHeaders(),
          method: "GET",
          signal: controller.signal,
        });

        if (response.status === 401) {
          onUnauthorized?.();
          return;
        }

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as ApiResult<SurveyDetailApi>;
        const title = result.data?.title?.trim();

        if (title) {
          setSummary((current) => ({ ...current, title }));
        }
      } catch {
        setSummary((current) => current);
      }
    };

    void fetchSurveyTitle();

    return () => controller.abort();
  }, [onUnauthorized, summary.title, surveyId]);

  const surveyTitle = summary.title?.trim() || DEFAULT_TITLE;
  const submittedAt = useMemo(
    () => formatSubmittedAt(summary.submittedAt),
    [summary.submittedAt],
  );

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

    if (label === "History") {
      onOpenHistory?.();
    }
  };

  return (
    <main className="survey-complete-page">
      <Topbar
        avatarSrc={avatarSrc}
        isSidebarOpen={isSidebarOpen}
        onProfileClick={() => {
          closeSidebar();
          onOpenProfile?.();
        }}
        onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
        sidebarId="survey-complete-sidebar"
        title="Survey Pemkot Jogja"
      />

      <Sidebar
        accountDescription={accountDescription}
        accountName={accountName}
        activeItem="Daftar Survey"
        avatarSrc={avatarSrc}
        id="survey-complete-sidebar"
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

      <section className="survey-complete-shell">
        <div className="survey-complete-main">
          <section className="survey-complete-card" aria-labelledby="survey-complete-title">
            <div className="survey-complete-hero">
              <span aria-hidden="true">
                <img src={checkIcon} alt="" />
              </span>
              <h1 id="survey-complete-title">
                Terima Kasih! Survey Anda Telah Terkirim
              </h1>
              <p>
                Kontribusi Anda sangat berarti bagi pengembangan Kota Yogyakarta
                yang lebih inklusif dan responsif terhadap kebutuhan masyarakat.
              </p>
            </div>

            <section className="survey-complete-summary" aria-label="Ringkasan pengiriman">
              <h2>Ringkasan Pengiriman</h2>
              <dl>
                <div>
                  <dt>Survey</dt>
                  <dd>{surveyTitle}</dd>
                </div>
                <div>
                  <dt>Tanggal</dt>
                  <dd>{submittedAt}</dd>
                </div>
              </dl>
            </section>

            <div className="survey-complete-actions">
              <button onClick={onBackHome} type="button">
                <img src={homeIcon} alt="" aria-hidden="true" />
                Kembali ke Beranda
              </button>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
};
