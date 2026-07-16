import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "../../components/sidebar";
import { Topbar } from "../../components/topbar";
import adminAvatar from "../../assets/home/home-admin-avatar.png";
import breadcrumbChevronIcon from "../../assets/profile/profile-breadcrumb-chevron.svg";
import arrowLeftIcon from "../../assets/survey/create/create-arrow-left.svg";
import arrowRightIcon from "../../assets/survey/create/create-arrow-right.svg";
import fillAutosaveIcon from "../../assets/survey/fill/fill-autosave.svg";
import lockIcon from "../../assets/survey/list/list-lock-icon.svg";
import { API_BASE_URL } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import "../../styles/survey/SurveyFill.scss";

type SurveyFillProps = {
  accountDescription?: string;
  accountAvatarSrc?: string;
  accountName?: string;
  accountPrivileges?: string[];
  isAuthenticated: boolean;
  onAuthAction?: () => void;
  onOpenAccessManagement?: () => void;
  onOpenAnalysis?: () => void;
  onBackHome?: () => void;
  onCompleteSurvey?: (summary: { submittedAt: string; surveyId: number; title: string }) => void;
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

type SurveyFormOptionApi = {
  id?: number | string;
  option_order?: number | string | null;
  option_text?: string | null;
};

type SurveyFormQuestionApi = {
  id?: number | string;
  is_required?: boolean | number | string | null;
  options?: SurveyFormOptionApi[];
  page?: number | string | null;
  parent_option_id?: number | string | null;
  question_order?: number | string | null;
  question_text?: string | null;
  question_type?: string | null;
};

type SurveyFormPageApi = {
  page?: number | string | null;
  questions?: SurveyFormQuestionApi[];
  section?: string | null;
};

type SurveyFormApi = {
  pages?: SurveyFormPageApi[];
  survey_id?: number | string;
};

type SurveyResponseAnswerApi = {
  answer_text?: string | null;
  file_path?: string | null;
  option_id?: number | string | null;
  question_id?: number | string | null;
};

type SurveyResponseApi = {
  answers?: SurveyResponseAnswerApi[];
  current_page?: number | string | null;
  status?: string | null;
  submitted_at?: string | null;
};

type SurveyOption = {
  id: number;
  order: number;
  text: string;
};

type SurveyQuestion = {
  id: number;
  isRequired: boolean;
  options: SurveyOption[];
  order: number;
  page: number;
  parentOptionId: number | null;
  text: string;
  type: string;
};

type SurveyPage = {
  page: number;
  questions: SurveyQuestion[];
  section: string;
};

type AnswerValue = number | number[] | string | null;
type ResponseStatus = "draft" | "submitted" | null;

type DraftState = {
  answers?: Record<string, AnswerValue>;
  page?: number;
};

type SubmitAnswer =
  | { answer_text: string; question_id: number }
  | { option_id: number; question_id: number }
  | { option_ids: number[]; question_id: number };

const RIGHT_SIDEBAR_MOBILE_QUERY = "(max-width: 820px)";

const isRightSidebarMobile = () =>
  typeof window !== "undefined" &&
  window.matchMedia(RIGHT_SIDEBAR_MOBILE_QUERY).matches;

type DropdownPlacement = {
  maxHeight: number;
  openUp: boolean;
};

const DEFAULT_TITLE = "Evaluasi Pelayanan Publik 2024";
const DEFAULT_SECTION = "Pertanyaan Survey";
const LOCAL_DRAFT_PREFIX = "survey_response_draft_";

const parsePositiveNumber = (value: unknown) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const normalizeRequired = (value: SurveyFormQuestionApi["is_required"]) =>
  value === true || value === 1 || value === "1" || value === "true";

const normalizeOption = (option: SurveyFormOptionApi, index: number) => {
  const id = parsePositiveNumber(option.id);

  if (!id) {
    return null;
  }

  return {
    id,
    order: parsePositiveNumber(option.option_order) ?? index + 1,
    text: option.option_text?.trim() || `Opsi ${index + 1}`,
  };
};

const normalizeQuestion = (
  question: SurveyFormQuestionApi,
  page: number,
  index: number,
) => {
  const id = parsePositiveNumber(question.id);

  if (!id) {
    return null;
  }

  return {
    id,
    isRequired: normalizeRequired(question.is_required),
    options: (question.options ?? [])
      .map(normalizeOption)
      .filter((option): option is SurveyOption => option !== null)
      .sort((left, right) => left.order - right.order),
    order: parsePositiveNumber(question.question_order) ?? index + 1,
    page,
    parentOptionId: parsePositiveNumber(question.parent_option_id),
    text: question.question_text?.trim() || `Pertanyaan ${index + 1}`,
    type: question.question_type?.trim() || "free_text",
  };
};

const normalizeSurveyForm = (form?: SurveyFormApi): SurveyPage[] =>
  (form?.pages ?? [])
    .map((page, pageIndex) => {
      const pageNumber = parsePositiveNumber(page.page) ?? pageIndex + 1;
      const questions = (page.questions ?? [])
        .map((question, questionIndex) =>
          normalizeQuestion(question, pageNumber, questionIndex),
        )
        .filter((question): question is SurveyQuestion => question !== null)
        .sort((left, right) => left.order - right.order);

      return {
        page: pageNumber,
        questions,
        section: page.section?.trim() || `${DEFAULT_SECTION} ${pageNumber}`,
      };
    })
    .sort((left, right) => left.page - right.page);

const getQuestionTypeLabel = (type: string) => {
  if (type === "free_text") {
    return "Jawaban teks";
  }

  if (type === "radio_button") {
    return "Radio button (pilih salah satu jawaban)";
  }

  if (type === "checkbox") {
    return "Checkbox (pilih satu atau lebih jawaban)";
  }

  if (type === "dropdown") {
    return "Dropdown (pilih satu jawaban dari daftar)";
  }

  return "Pilihan";
};

const isSingleOptionType = (type: string) =>
  type === "radio_button" || type === "dropdown" || type === "rating_scale";

const getAnswerDraftKey = (surveyId: number | null) =>
  surveyId ? `${LOCAL_DRAFT_PREFIX}${surveyId}` : "";

const getSelectedOptionIds = (
  answers: Record<string, AnswerValue>,
  questions: SurveyQuestion[],
  visibleQuestionIds: Set<number>,
) => {
  const selectedOptionIds = new Set<number>();

  questions.forEach((question) => {
    if (!visibleQuestionIds.has(question.id)) {
      return;
    }

    const value = answers[String(question.id)];

    if (typeof value === "number") {
      selectedOptionIds.add(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((optionId) => selectedOptionIds.add(optionId));
    }
  });

  return selectedOptionIds;
};

const getVisibleQuestionIds = (
  pages: SurveyPage[],
  answers: Record<string, AnswerValue>,
) => {
  const questions = pages.flatMap((page) => page.questions);
  const visibleQuestionIds = new Set<number>();
  let hasChanged = true;

  while (hasChanged) {
    hasChanged = false;
    const selectedOptionIds = getSelectedOptionIds(
      answers,
      questions,
      visibleQuestionIds,
    );

    questions.forEach((question) => {
      if (visibleQuestionIds.has(question.id)) {
        return;
      }

      if (question.parentOptionId === null || selectedOptionIds.has(question.parentOptionId)) {
        visibleQuestionIds.add(question.id);
        hasChanged = true;
      }
    });
  }

  return visibleQuestionIds;
};

const isAnswered = (question: SurveyQuestion, value: AnswerValue) => {
  if (question.type === "free_text") {
    return typeof value === "string" && value.trim().length > 0;
  }

  if (question.type === "checkbox") {
    const availableOptionIds = new Set(question.options.map((option) => option.id));
    return (
      Array.isArray(value) &&
      value.some((optionId) => availableOptionIds.has(optionId))
    );
  }

  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    question.options.some((option) => option.id === value)
  );
};

const getPageCompletionStatuses = (
  pages: SurveyPage[],
  answers: Record<string, AnswerValue>,
  visibleQuestionIds: Set<number>,
) =>
  pages.map((page) =>
    page.questions.every((question) => {
      if (!visibleQuestionIds.has(question.id) || !question.isRequired) {
        return true;
      }

      return isAnswered(question, answers[String(question.id)]);
    }),
  );

const getCompletedPageCount = (completedPageIndexes: boolean[]) => {
  const firstIncompletePageIndex = completedPageIndexes.findIndex(
    (isComplete) => !isComplete,
  );

  return firstIncompletePageIndex === -1
    ? completedPageIndexes.length
    : firstIncompletePageIndex;
};

const buildAnswerPayload = (
  pages: SurveyPage[],
  answers: Record<string, AnswerValue>,
  visibleQuestionIds: Set<number>,
) =>
  pages
    .flatMap((page) => page.questions)
    .filter((question) => visibleQuestionIds.has(question.id))
    .reduce<SubmitAnswer[]>((payload, question) => {
      const value = answers[String(question.id)];

      if (!isAnswered(question, value)) {
        return payload;
      }

      if (question.type === "free_text" && typeof value === "string") {
        payload.push({ answer_text: value.trim(), question_id: question.id });
        return payload;
      }

      if (question.type === "checkbox" && Array.isArray(value)) {
        payload.push({ option_ids: value, question_id: question.id });
        return payload;
      }

      if (typeof value === "number") {
        payload.push({ option_id: value, question_id: question.id });
      }

      return payload;
    }, []);

const normalizeResponseStatus = (status?: string | null): ResponseStatus => {
  const normalizedStatus = status?.trim().toLowerCase();

  return normalizedStatus === "draft" || normalizedStatus === "submitted"
    ? normalizedStatus
    : null;
};

const normalizePageIndex = (value: unknown, totalPages: number) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return Math.min(totalPages - 1, Math.floor(parsedValue));
};

const buildAnswerStateFromResponse = (
  pages: SurveyPage[],
  responseAnswers: SurveyResponseAnswerApi[] = [],
) => {
  const questionsById = new Map<number, SurveyQuestion>();

  pages.forEach((page) => {
    page.questions.forEach((question) => {
      questionsById.set(question.id, question);
    });
  });

  const groupedAnswers = new Map<number, SurveyResponseAnswerApi[]>();

  responseAnswers.forEach((answer) => {
    const questionId = parsePositiveNumber(answer.question_id);

    if (!questionId || !questionsById.has(questionId)) {
      return;
    }

    const answersForQuestion = groupedAnswers.get(questionId) ?? [];
    answersForQuestion.push(answer);
    groupedAnswers.set(questionId, answersForQuestion);
  });

  const nextAnswers: Record<string, AnswerValue> = {};

  groupedAnswers.forEach((answersForQuestion, questionId) => {
    const question = questionsById.get(questionId);

    if (!question) {
      return;
    }

    if (question.type === "free_text") {
      const answerText = answersForQuestion.find(
        (answer) => typeof answer.answer_text === "string",
      )?.answer_text;

      nextAnswers[String(questionId)] = answerText?.trim() ?? "";
      return;
    }

    if (question.type === "checkbox") {
      const availableOptionIds = new Set(question.options.map((option) => option.id));
      const optionIds = answersForQuestion
        .map((answer) => parsePositiveNumber(answer.option_id))
        .filter(
          (optionId): optionId is number =>
            optionId !== null && availableOptionIds.has(optionId),
        );

      nextAnswers[String(questionId)] = Array.from(new Set(optionIds));
      return;
    }

    const availableOptionIds = new Set(question.options.map((option) => option.id));
    const optionId =
      answersForQuestion
        .map((answer) => parsePositiveNumber(answer.option_id))
        .find(
          (currentOptionId): currentOptionId is number =>
            currentOptionId !== null && availableOptionIds.has(currentOptionId),
        ) ?? null;

    nextAnswers[String(questionId)] = optionId;
  });

  return nextAnswers;
};

export const SurveyFill = ({
  accountDescription,
  accountAvatarSrc,
  accountName,
  accountPrivileges,
  isAuthenticated,
  onAuthAction,
  onOpenAccessManagement,
  onOpenAnalysis,
  onBackHome,
  onCompleteSurvey,
  onOpenHistory,
  onOpenManageSurveys,
  onOpenProfile,
  onOpenSurveyList,
  onOpenUserManagement,
  onUnauthorized,
  surveyId,
}: SurveyFillProps) => {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(() => Boolean(surveyId));
  const [isProgressSidebarOpen, setIsProgressSidebarOpen] = useState(
    () => !isRightSidebarMobile(),
  );
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const [dropdownPlacement, setDropdownPlacement] = useState<
    Record<number, DropdownPlacement>
  >({});
  const [pages, setPages] = useState<SurveyPage[]>([]);
  const [responseStatus, setResponseStatus] = useState<ResponseStatus>(null);
  const [surveyTitle, setSurveyTitle] = useState(DEFAULT_TITLE);
  const dropdownButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const avatarSrc = accountAvatarSrc ?? adminAvatar;
  const isReadOnly = responseStatus === "submitted";

  const draftKey = getAnswerDraftKey(surveyId);

  useEffect(() => {
    const mediaQuery = window.matchMedia(RIGHT_SIDEBAR_MOBILE_QUERY);
    const syncSidebarState = (matches: boolean) =>
      setIsProgressSidebarOpen(!matches);
    const handleChange = (event: MediaQueryListEvent) =>
      syncSidebarState(event.matches);

    syncSidebarState(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!surveyId) {
      return;
    }

    const controller = new AbortController();

    const fetchSurveyForm = async () => {
      setIsLoading(true);
      setFeedback("");

      try {
        const [formResponse, detailResponse, responseResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/surveys/${surveyId}/form`, {
            credentials: "include",
            headers: authHeaders(),
            method: "GET",
            signal: controller.signal,
          }),
          fetch(`${API_BASE_URL}/surveys/${surveyId}`, {
            credentials: "include",
            headers: authHeaders(),
            method: "GET",
            signal: controller.signal,
          }).catch(() => null),
          fetch(`${API_BASE_URL}/surveys/${surveyId}/responses`, {
            credentials: "include",
            headers: authHeaders(),
            method: "GET",
            signal: controller.signal,
          }),
        ]);

        if (formResponse.status === 401 || responseResponse.status === 401) {
          onUnauthorized?.();
          return;
        }

        if (!formResponse.ok) {
          const result = (await formResponse.json().catch(() => ({}))) as ApiResult;
          throw new Error(result.message ?? "Form survey belum bisa dimuat.");
        }

        const formResult = (await formResponse.json()) as ApiResult<SurveyFormApi>;
        const nextPages = normalizeSurveyForm(formResult.data);

        if (nextPages.length === 0) {
          throw new Error("Form survey belum memiliki pertanyaan.");
        }

        if (detailResponse?.ok) {
          const detailResult = (await detailResponse.json()) as ApiResult<SurveyDetailApi>;
          setSurveyTitle(detailResult.data?.title?.trim() || DEFAULT_TITLE);
        }

        let serverResponseStatus: ResponseStatus = null;
        let serverResponsePage = 0;
        let serverAnswers: Record<string, AnswerValue> = {};

        if (responseResponse.ok) {
          const responseResult =
            (await responseResponse.json()) as ApiResult<SurveyResponseApi>;
          const responseData = responseResult.data;

          serverResponseStatus = normalizeResponseStatus(responseData?.status);
          serverResponsePage = normalizePageIndex(
            responseData?.current_page,
            nextPages.length,
          );
          serverAnswers = buildAnswerStateFromResponse(
            nextPages,
            responseData?.answers ?? [],
          );
        } else {
          const result =
            (await responseResponse.json().catch(() => ({}))) as ApiResult;
          throw new Error(result.message ?? "Status pengisian survey belum bisa dimuat.");
        }

        const hasServerResponse = serverResponseStatus !== null;
        const storedDraft = hasServerResponse
          ? null
          : localStorage.getItem(getAnswerDraftKey(surveyId));
        const draft = storedDraft ? (JSON.parse(storedDraft) as DraftState) : null;
        const nextAnswers = hasServerResponse ? serverAnswers : draft?.answers ?? {};
        const nextPageIndex = hasServerResponse
          ? serverResponsePage
          : draft?.page ?? 0;
        const draftVisibleQuestionIds = getVisibleQuestionIds(nextPages, nextAnswers);
        const draftCompletedPageCount = getCompletedPageCount(
          getPageCompletionStatuses(
            nextPages,
            nextAnswers,
            draftVisibleQuestionIds,
          ),
        );

        setAnswers(nextAnswers);
        setResponseStatus(serverResponseStatus);
        setCurrentPageIndex(
          serverResponseStatus === "submitted"
            ? 0
            : nextPageIndex >= 0 && nextPageIndex < nextPages.length
              ? Math.min(nextPageIndex, draftCompletedPageCount)
            : 0,
        );
        setPages(nextPages);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setFeedback(
          error instanceof Error ? error.message : "Form survey belum bisa dimuat.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void fetchSurveyForm();

    return () => controller.abort();
  }, [onUnauthorized, surveyId]);

  useEffect(() => {
    if (!draftKey || pages.length === 0 || responseStatus !== null) {
      return;
    }

    const timerId = window.setTimeout(() => {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ answers, page: currentPageIndex }),
      );
    }, 300);

    return () => window.clearTimeout(timerId);
  }, [answers, currentPageIndex, draftKey, pages.length, responseStatus]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timerId = window.setTimeout(() => setFeedback(""), 4200);
    return () => window.clearTimeout(timerId);
  }, [feedback]);

  const updateDropdownPlacement = useCallback((questionId: number) => {
    const button = dropdownButtonRefs.current[questionId];

    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const gap = 8;
    const minimumHeight = 160;
    const maximumHeight = 320;
    const availableBelow = window.innerHeight - rect.bottom - gap;
    const availableAbove = rect.top - gap;
    const openUp = availableBelow < minimumHeight && availableAbove > availableBelow;
    const availableSpace = openUp ? availableAbove : availableBelow;

    setDropdownPlacement((current) => ({
      ...current,
      [questionId]: {
        maxHeight: Math.max(
          120,
          Math.min(maximumHeight, Math.floor(availableSpace)),
        ),
        openUp,
      },
    }));
  }, []);

  useEffect(() => {
    if (openDropdownId === null) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest(`[data-survey-fill-dropdown="${openDropdownId}"]`)
      ) {
        return;
      }

      setOpenDropdownId(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDropdownId(null);
      }
    };

    const refreshPlacement = () => updateDropdownPlacement(openDropdownId);

    updateDropdownPlacement(openDropdownId);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", refreshPlacement);
    window.addEventListener("scroll", refreshPlacement, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", refreshPlacement);
      window.removeEventListener("scroll", refreshPlacement, true);
    };
  }, [openDropdownId, updateDropdownPlacement]);

  const currentPage = pages[currentPageIndex];
  const visibleQuestionIds = useMemo(
    () => getVisibleQuestionIds(pages, answers),
    [answers, pages],
  );

  const childrenByParentOptionId = useMemo(() => {
    const children = new Map<number, SurveyQuestion[]>();

    currentPage?.questions.forEach((question) => {
      if (question.parentOptionId === null) {
        return;
      }

      const list = children.get(question.parentOptionId) ?? [];
      list.push(question);
      children.set(question.parentOptionId, list);
    });

    return children;
  }, [currentPage]);

  const completedPageIndexes = useMemo(
    () => getPageCompletionStatuses(pages, answers, visibleQuestionIds),
    [answers, pages, visibleQuestionIds],
  );
  const completedPageCount = useMemo(
    () => getCompletedPageCount(completedPageIndexes),
    [completedPageIndexes],
  );
  const totalPages = pages.length || 1;
  const progressPercent = Math.round((completedPageCount / totalPages) * 100);
  const unlockedPageIndexes = useMemo(() => {
    const nextUnlockedIndexes = new Set<number>();

    pages.forEach((_, pageIndex) => {
      if (pageIndex <= completedPageCount) {
        nextUnlockedIndexes.add(pageIndex);
      }
    });

    return nextUnlockedIndexes;
  }, [completedPageCount, pages]);

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((current) => !current);
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

    if (label === "Analisis") {
      onOpenAnalysis?.();
    }

    if (label === "History") {
      onOpenHistory?.();
    }
  };

  const updateAnswer = (questionId: number, value: AnswerValue) => {
    if (isReadOnly) {
      return;
    }

    setAnswers((current) => ({ ...current, [questionId]: value }));
    setErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors[String(questionId)];
      return nextErrors;
    });
  };

  const validatePages = (pageIndexes: number[]) => {
    const nextErrors: Record<string, string> = {};

    pageIndexes.forEach((pageIndex) => {
      pages[pageIndex]?.questions.forEach((question) => {
        if (!visibleQuestionIds.has(question.id) || !question.isRequired) {
          return;
        }

        if (!isAnswered(question, answers[String(question.id)])) {
          nextErrors[String(question.id)] = "Pertanyaan wajib diisi.";
        }
      });
    });

    setErrors((current) => ({ ...current, ...nextErrors }));
    return nextErrors;
  };

  const focusFirstError = (nextErrors: Record<string, string>) => {
    const firstQuestionId = Number(Object.keys(nextErrors)[0]);
    const pageIndex = pages.findIndex((page) =>
      page.questions.some((question) => question.id === firstQuestionId),
    );

    if (pageIndex >= 0) {
      setCurrentPageIndex(pageIndex);
    }
  };

  const saveDraft = async (targetPageIndex: number) => {
    if (!surveyId || isReadOnly) {
      return true;
    }

    setIsSavingDraft(true);

    try {
      const response = await fetch(`${API_BASE_URL}/surveys/${surveyId}/responses`, {
        body: JSON.stringify({
          answers: buildAnswerPayload(pages, answers, visibleQuestionIds),
          page: targetPageIndex,
        }),
        credentials: "include",
        headers: authHeaders("application/json"),
        method: "PUT",
      });

      if (response.status === 401) {
        onUnauthorized?.();
        return false;
      }

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as ApiResult;
        throw new Error(result.message ?? "Draft jawaban belum bisa disimpan.");
      }

      if (draftKey) {
        localStorage.removeItem(draftKey);
      }

      setResponseStatus("draft");
      return true;
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Draft jawaban belum bisa disimpan.",
      );
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const toggleDropdown = (questionId: number) => {
    if (isReadOnly) {
      return;
    }

    setOpenDropdownId((current) => {
      if (current === questionId) {
        return null;
      }

      window.requestAnimationFrame(() => updateDropdownPlacement(questionId));
      return questionId;
    });
  };

  const handlePrevious = () => {
    setCurrentPageIndex((current) => Math.max(0, current - 1));
  };

  const handleNext = async () => {
    const nextErrors = validatePages([currentPageIndex]);

    if (Object.keys(nextErrors).length > 0) {
      setFeedback("Lengkapi pertanyaan wajib sebelum lanjut.");
      focusFirstError(nextErrors);
      return;
    }

    const nextPageIndex = Math.min(pages.length - 1, currentPageIndex + 1);
    const isDraftSaved = await saveDraft(nextPageIndex);

    if (isDraftSaved) {
      setCurrentPageIndex(nextPageIndex);
    }
  };

  const handleProgressClick = async (targetPageIndex: number) => {
    if (isLoading || targetPageIndex === currentPageIndex) {
      if (targetPageIndex === currentPageIndex && isRightSidebarMobile()) {
        setIsProgressSidebarOpen(false);
      }

      return;
    }

    if (unlockedPageIndexes.has(targetPageIndex)) {
      const shouldSaveDraft = targetPageIndex > currentPageIndex && !isReadOnly;
      const isDraftSaved = shouldSaveDraft
        ? await saveDraft(targetPageIndex)
        : true;

      if (isDraftSaved) {
        setCurrentPageIndex(targetPageIndex);

        if (isRightSidebarMobile()) {
          setIsProgressSidebarOpen(false);
        }
      }
      return;
    }

    const firstBlockedPageIndex = completedPageIndexes.findIndex(
      (isComplete, pageIndex) => pageIndex < targetPageIndex && !isComplete,
    );
    const nextErrors = validatePages([
      firstBlockedPageIndex >= 0 ? firstBlockedPageIndex : currentPageIndex,
    ]);

    setFeedback("Lengkapi pertanyaan wajib sebelum membuka langkah ini.");

    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
    }
  };

  const handleSubmit = async () => {
    if (isReadOnly) {
      setFeedback("Jawaban survey ini sudah terkirim dan tidak bisa diubah.");
      return;
    }

    if (!isAuthenticated) {
      setFeedback("Silakan login terlebih dahulu untuk mengirim survey.");
      onAuthAction?.();
      return;
    }

    const nextErrors = validatePages(pages.map((_, index) => index));

    if (Object.keys(nextErrors).length > 0) {
      setFeedback("Lengkapi seluruh pertanyaan wajib sebelum mengirim survey.");
      focusFirstError(nextErrors);
      return;
    }

    if (!surveyId) {
      setFeedback("Survey tidak ditemukan.");
      return;
    }

    const payload = {
      answers: buildAnswerPayload(pages, answers, visibleQuestionIds),
    };

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/surveys/${surveyId}/responses`, {
        body: JSON.stringify(payload),
        credentials: "include",
        headers: authHeaders("application/json"),
        method: "POST",
      });

      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as ApiResult;
        throw new Error(result.message ?? "Jawaban survey belum bisa dikirim.");
      }

      if (draftKey) {
        localStorage.removeItem(draftKey);
      }

      setResponseStatus("submitted");

      onCompleteSurvey?.({
        submittedAt: new Date().toISOString(),
        surveyId,
        title: surveyTitle,
      });
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Jawaban survey belum bisa dikirim.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleCheckbox = (question: SurveyQuestion, optionId: number) => {
    const currentValue = answers[String(question.id)];
    const currentOptionIds = Array.isArray(currentValue) ? currentValue : [];
    const nextOptionIds = currentOptionIds.includes(optionId)
      ? currentOptionIds.filter((currentOptionId) => currentOptionId !== optionId)
      : [...currentOptionIds, optionId];

    updateAnswer(question.id, nextOptionIds);
  };

  const renderQuestionChildren = (optionId: number, nestingLevel: number) => {
    const children = childrenByParentOptionId.get(optionId) ?? [];

    if (children.length === 0) {
      return null;
    }

    return (
      <div className="survey-fill-children">
        {children
          .filter((question) => visibleQuestionIds.has(question.id))
          .map((question) => renderQuestion(question, nestingLevel + 1))}
      </div>
    );
  };

  const renderOptionList = (question: SurveyQuestion, nestingLevel: number) => {
    const value = answers[String(question.id)];
    const isCheckbox = question.type === "checkbox";

    return (
      <div className="survey-fill-options">
        {question.options.map((option) => {
          const isSelected = isCheckbox
            ? Array.isArray(value) && value.includes(option.id)
            : value === option.id;

          return (
            <div className="survey-fill-option-wrap" key={option.id}>
              <label
                className={[
                  "survey-fill-option",
                  isCheckbox ? "is-checkbox" : "is-radio",
                  isSelected ? "is-selected" : "",
                  nestingLevel > 0 ? "is-compact" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <input
                  checked={isSelected}
                  disabled={isReadOnly}
                  name={`question-${question.id}`}
                  onChange={() => {
                    if (isCheckbox) {
                      toggleCheckbox(question, option.id);
                      return;
                    }

                    updateAnswer(question.id, option.id);
                  }}
                  type={isCheckbox ? "checkbox" : "radio"}
                />
                <span aria-hidden="true" />
                {option.text}
              </label>

              {isSelected && renderQuestionChildren(option.id, nestingLevel)}
            </div>
          );
        })}
      </div>
    );
  };

  const renderQuestionInput = (question: SurveyQuestion, nestingLevel: number) => {
    const value = answers[String(question.id)];

    if (question.type === "free_text") {
      return (
        <textarea
          aria-label={question.text}
          onChange={(event) => updateAnswer(question.id, event.target.value)}
          placeholder="Tuliskan jawaban Anda di sini..."
          readOnly={isReadOnly}
          value={typeof value === "string" ? value : ""}
        />
      );
    }

    if (question.type === "dropdown") {
      const selectedOption =
        typeof value === "number"
          ? question.options.find((option) => option.id === value)
          : null;
      const isOpen = openDropdownId === question.id;
      const placement = dropdownPlacement[question.id];

      return (
        <>
          <div
            className={[
              "survey-fill-dropdown",
              isOpen ? "is-open" : "",
              placement?.openUp ? "is-open-up" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-survey-fill-dropdown={question.id}
          >
            <button
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              className={selectedOption ? "" : "is-placeholder"}
              disabled={isReadOnly}
              onClick={() => toggleDropdown(question.id)}
              ref={(element) => {
                dropdownButtonRefs.current[question.id] = element;
              }}
              type="button"
            >
              <span>{selectedOption?.text ?? "Pilih jawaban"}</span>
              <i aria-hidden="true" />
            </button>

            {isOpen && (
              <div
                className="survey-fill-dropdown__menu"
                role="listbox"
                style={{ maxHeight: `${placement?.maxHeight ?? 280}px` }}
              >
                <button
                  aria-selected={!selectedOption}
                  onClick={() => {
                    updateAnswer(question.id, null);
                    setOpenDropdownId(null);
                  }}
                  role="option"
                  type="button"
                >
                  Pilih jawaban
                </button>
                {question.options.map((option) => (
                  <button
                    aria-selected={selectedOption?.id === option.id}
                    key={option.id}
                    onClick={() => {
                      updateAnswer(question.id, option.id);
                      setOpenDropdownId(null);
                    }}
                    role="option"
                    type="button"
                  >
                    {option.text}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedOption && renderQuestionChildren(selectedOption.id, nestingLevel)}
        </>
      );
    }

    if (isSingleOptionType(question.type) || question.type === "checkbox") {
      return renderOptionList(question, nestingLevel);
    }

    return (
      <p className="survey-fill-unsupported">
        Tipe pertanyaan {getQuestionTypeLabel(question.type)} belum didukung.
      </p>
    );
  };

  const renderQuestion = (question: SurveyQuestion, nestingLevel = 0) => {
    if (!visibleQuestionIds.has(question.id)) {
      return null;
    }

    const hasError = Boolean(errors[String(question.id)]);

    return (
      <section
        className={[
          "survey-fill-question",
          nestingLevel > 0 ? "survey-fill-question--child" : "",
          hasError ? "has-error" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        key={question.id}
      >
        <div className="survey-fill-question__heading">
          {nestingLevel === 0 && (
            <span aria-hidden="true">{question.order}</span>
          )}
          <div>
            <h3>{question.text}</h3>
            <p>{getQuestionTypeLabel(question.type)}</p>
          </div>
          {question.isRequired && <strong>Wajib diisi</strong>}
        </div>

        <div className="survey-fill-question__body">
          {renderQuestionInput(question, nestingLevel)}
          {hasError && <small>{errors[String(question.id)]}</small>}
        </div>
      </section>
    );
  };

  const topLevelQuestions =
    currentPage?.questions.filter((question) => question.parentOptionId === null) ?? [];

  return (
    <main className="survey-fill-page">
      <Topbar
        avatarSrc={avatarSrc}
        isSidebarOpen={isSidebarOpen}
        onProfileClick={() => {
          closeSidebar();
          onOpenProfile?.();
        }}
        onToggleSidebar={toggleSidebar}
        sidebarId="survey-fill-sidebar"
        title="Survey Pemkot Jogja"
      />

      <Sidebar
        accountDescription={accountDescription}
        accountName={accountName}
        activeItem="Daftar Survey"
        avatarSrc={avatarSrc}
        id="survey-fill-sidebar"
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

      <section
        className={`survey-fill-shell ${
          isProgressSidebarOpen ? "has-right-sidebar" : ""
        }`}
      >
        {feedback && (
          <p className="survey-fill-toast" role="status">
            {feedback}
          </p>
        )}

        <div className="survey-fill-content">
          <nav className="survey-fill-breadcrumb" aria-label="Breadcrumb">
            <button onClick={onBackHome} type="button">
              Beranda
            </button>
            <img src={breadcrumbChevronIcon} alt="" aria-hidden="true" />
            <button onClick={onOpenSurveyList} type="button">
              Daftar Survey
            </button>
            <img src={breadcrumbChevronIcon} alt="" aria-hidden="true" />
            <span>Isi Survey</span>
          </nav>

          <header className="survey-fill-header">
            <h1>Isi Survey: {surveyTitle}</h1>
            <p>
              Kontribusi Anda membantu kami mewujudkan pelayanan yang lebih baik
              bagi masyarakat Yogyakarta.
            </p>
          </header>

          <section
            aria-label={`Progress pengisian ${progressPercent}% selesai`}
            className={`survey-fill-progress ${
              isProgressSidebarOpen ? "is-open" : "is-collapsed"
            }`}
          >
            {isProgressSidebarOpen ? (
              <div className="survey-fill-progress__header">
                <strong>Halaman</strong>
                <button
                  aria-expanded={isProgressSidebarOpen}
                  aria-label="Tutup navigasi halaman"
                  className="survey-fill-progress__toggle"
                  onClick={() => setIsProgressSidebarOpen(false)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="survey-fill-progress__chevron"
                  />
                </button>
              </div>
            ) : (
              <button
                aria-expanded={isProgressSidebarOpen}
                className="survey-fill-progress__collapsed-toggle"
                onClick={() => setIsProgressSidebarOpen(true)}
                type="button"
              >
                Halaman
              </button>
            )}
            {isProgressSidebarOpen && (
              <div className="survey-fill-progress__list">
                {pages.map((page, index) => {
                  const isCurrentStep = index === currentPageIndex;
                  const isStepComplete = index < completedPageCount;
                  const isStepUnlocked = unlockedPageIndexes.has(index);

                  return (
                    <button
                      aria-current={isCurrentStep ? "step" : undefined}
                      aria-label={`Buka ${page.section ?? `langkah ${index + 1}`}${
                        isStepUnlocked ? "" : " (terkunci)"
                      }`}
                      className={[
                        isCurrentStep ? "is-current" : "",
                        isStepComplete ? "is-complete" : "",
                        isStepUnlocked ? "is-unlocked" : "is-locked",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={isLoading}
                      key={page.page}
                      onClick={() => void handleProgressClick(index)}
                      type="button"
                    >
                      <strong>{index + 1}</strong>
                      <span>{page.section}</span>
                      {!isStepUnlocked && (
                        <img src={lockIcon} alt="" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="survey-fill-card" aria-busy={isLoading}>
            {isLoading ? (
              <div className="survey-fill-skeleton">
                <i />
                <i />
                <i />
                <i />
              </div>
            ) : currentPage ? (
              <>
                <div className="survey-fill-card__head">
                  <h2>{currentPage.section}</h2>
                </div>

                <div className="survey-fill-card__questions">
                  {topLevelQuestions.map((question) => renderQuestion(question))}
                </div>

                <div className="survey-fill-actions">
                  <div>
                    <button
                      className="survey-fill-actions__back"
                      disabled={currentPageIndex === 0}
                      onClick={handlePrevious}
                      type="button"
                    >
                      <img src={arrowLeftIcon} alt="" aria-hidden="true" />
                      Kembali
                    </button>
                  </div>

                  <p className="survey-fill-autosave">
                    <img src={fillAutosaveIcon} alt="" aria-hidden="true" />
                    {isReadOnly
                      ? "Jawaban sudah terkirim dan hanya bisa dilihat."
                      : "Pastikan jawaban sudah benar. Jawaban tidak dapat diubah setelah survey dikirim."}
                  </p>

                  {isReadOnly ? (
                    <button
                      className="survey-fill-actions__primary"
                      onClick={onOpenSurveyList}
                      type="button"
                    >
                      Kembali ke Daftar Survey
                      <img src={arrowRightIcon} alt="" aria-hidden="true" />
                    </button>
                  ) : currentPageIndex === pages.length - 1 ? (
                    <button
                      className="survey-fill-actions__primary"
                      disabled={isSubmitting}
                      onClick={() => void handleSubmit()}
                      type="button"
                    >
                      {isSubmitting ? "Mengirim..." : "Kirim Survey"}
                      <img src={arrowRightIcon} alt="" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      className="survey-fill-actions__primary"
                      disabled={isSavingDraft}
                      onClick={() => void handleNext()}
                      type="button"
                    >
                      {isSavingDraft ? "Menyimpan..." : "Selanjutnya"}
                      <img src={arrowRightIcon} alt="" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="survey-fill-success">
                <h2>Form survey belum tersedia.</h2>
                <p>Silakan kembali ke daftar survey dan coba lagi nanti.</p>
                <button onClick={onOpenSurveyList} type="button">
                  Kembali ke Daftar Survey
                </button>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
};
