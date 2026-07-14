import {
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Sidebar } from "../../components/sidebar";
import { Topbar } from "../../components/topbar";
import badgeCheckIcon from "../../assets/profile/profile-badge-check.svg";
import breadcrumbChevronIcon from "../../assets/profile/profile-breadcrumb-chevron.svg";
import cameraIcon from "../../assets/profile/profile-camera.svg";
import chevronRightIcon from "../../assets/profile/profile-chevron-right.svg";
import editIcon from "../../assets/profile/profile-edit.svg";
import lockIcon from "../../assets/profile/profile-lock.svg";
import profileAvatar from "../../assets/profile/profile-avatar.jpg";
import { API_BASE_URL } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import {
  resolveProfilePhotoUrl,
  type ProfilePhotoSource,
} from "../../lib/profilePhoto";
import "../../styles/profile/Profile.scss";

const CONTACT_CODE_COOLDOWN_MS = 60_000;

type ProfileProps = {
  accountDescription?: string;
  accountAvatarSrc?: string;
  accountName?: string;
  accountPrivileges?: string[];
  isAuthenticated: boolean;
  onAuthAction?: () => void;
  onBackHome?: () => void;
  onOpenChangePassword?: () => void;
  onOpenAccessManagement?: () => void;
  onOpenAnalysis?: () => void;
  onOpenHistory?: () => void;
  onOpenManageSurveys?: () => void;
  onOpenSurveyList?: () => void;
  onOpenUserManagement?: () => void;
  onProfileLoaded?: (profile: AccountProfile) => void;
  onUnauthorized?: () => void;
};

type AccountProfile = ProfilePhotoSource & {
  full_name?: string | null;
  privileges?: string[];
  username?: string | null;
};

type ProfileData = ProfilePhotoSource & {
  address: string | null;
  email: string | null;
  email_verified?: boolean;
  email_verified_at?: string | null;
  full_name: string;
  id: number;
  is_active: boolean;
  nik: string;
  phone: string | null;
  phone_verified?: boolean;
  phone_verified_at?: string | null;
  position: "asn" | "non_asn" | "public" | string;
  privileges?: string[];
  role: string;
  role_id: number;
  username: string;
};

type ApiResult<T> = {
  data?: T;
  message?: string;
};

type EditableProfileField = "email" | "phone" | "username";
type ContactChannel = "email" | "phone";

type ProfileField = {
  editable?: EditableProfileField;
  isVerified?: boolean;
  key: string;
  label: string;
  value: string;
  verification?: ContactChannel;
  warning?: string;
};

type ContactVerificationState = {
  channel: ContactChannel | null;
  code: string;
  cooldownUntil: number;
  isOpen: boolean;
  isSending: boolean;
  isVerifying: boolean;
  message: string;
  type: "error" | "info" | "success";
};

type ContactVerificationModalProps = {
  code: string;
  description: string;
  inputId: string;
  isOpen: boolean;
  isSending: boolean;
  isVerifying: boolean;
  message: string;
  remainingSeconds: number;
  title: string;
  titleId: string;
  type: "error" | "info" | "success";
  onClose: () => void;
  onCodeChange: (value: string) => void;
  onResend: () => void;
  onVerify: () => void;
};

type ProfilePhotoCropModalProps = {
  crop: ProfilePhotoCropState;
  isCloseConfirmOpen: boolean;
  onChangeImage: () => void;
  onConfirmClose: () => void;
  onKeepEditing: () => void;
  onRequestClose: () => void;
  onSubmit: () => void;
  onUpdateCrop: (updates: Partial<ProfilePhotoCropTransform>) => void;
};

type ProfilePhotoCropState = {
  cropSize: number;
  file: File | null;
  fileName: string;
  isOpen: boolean;
  isUploading: boolean;
  message: string;
  naturalHeight: number;
  naturalWidth: number;
  objectUrl: string;
  offsetX: number;
  offsetY: number;
  zoom: number;
};

type ProfilePhotoCropTransform = Pick<
  ProfilePhotoCropState,
  "cropSize" | "offsetX" | "offsetY" | "zoom"
>;

type ProfilePhotoCropInteraction =
  | {
      pointerId: number;
      startOffsetX: number;
      startOffsetY: number;
      startX: number;
      startY: number;
      type: "move";
    }
  | {
      pointerId: number;
      type: "resize";
    };

const POSITION_LABELS: Record<string, string> = {
  asn: "Pegawai ASN",
  non_asn: "Pegawai Non-ASN",
  public: "Warga",
};

const ROLE_LABELS: Record<string, string> = {
  admin_opd: "Admin OPD",
  superadmin: "SuperAdmin",
  user: "User",
};

const initialContactVerification: ContactVerificationState = {
  channel: null,
  code: "",
  cooldownUntil: 0,
  isOpen: false,
  isSending: false,
  isVerifying: false,
  message: "",
  type: "info",
};

const initialProfilePhotoCrop: ProfilePhotoCropState = {
  cropSize: 240,
  file: null,
  fileName: "",
  isOpen: false,
  isUploading: false,
  message: "",
  naturalHeight: 0,
  naturalWidth: 0,
  objectUrl: "",
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};

const PROFILE_PHOTO_SIZE = 512;
const PROFILE_PHOTO_EDITOR_SIZE = 320;
const PROFILE_PHOTO_INITIAL_CROP_SIZE = 240;
const PROFILE_PHOTO_MAX_ZOOM = 3;
const PROFILE_PHOTO_MAX_SIZE = 3 * 1024 * 1024;
const PROFILE_PHOTO_MIN_CROP_SIZE = 128;
const PROFILE_PHOTO_MIN_ZOOM = 1;
const PROFILE_PHOTO_ZOOM_STEP = 0.1;
const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const getApiMessage = async (response: Response) => {
  try {
    const result = (await response.json()) as ApiResult<unknown>;
    return result.message ?? "Terjadi kesalahan pada server.";
  } catch {
    return "Terjadi kesalahan pada server.";
  }
};

const displayValue = (value: string | null | undefined) => {
  const trimmedValue = typeof value === "string" ? value.trim() : "";
  return trimmedValue || "-";
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const clampProfilePhotoCropSize = (
  value: number,
  maxSize = PROFILE_PHOTO_EDITOR_SIZE,
) => {
  const resolvedMaxSize = clampNumber(maxSize, 1, PROFILE_PHOTO_EDITOR_SIZE);
  const resolvedMinSize = Math.min(
    PROFILE_PHOTO_MIN_CROP_SIZE,
    resolvedMaxSize,
  );

  return clampNumber(value, resolvedMinSize, resolvedMaxSize);
};

const clampProfilePhotoZoom = (value: number) =>
  clampNumber(value, PROFILE_PHOTO_MIN_ZOOM, PROFILE_PHOTO_MAX_ZOOM);

const getProfilePhotoImageLayout = (
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
) => {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return {
      height: PROFILE_PHOTO_EDITOR_SIZE * zoom,
      width: PROFILE_PHOTO_EDITOR_SIZE * zoom,
    };
  }

  const baseScale = Math.min(
    PROFILE_PHOTO_EDITOR_SIZE / naturalWidth,
    PROFILE_PHOTO_EDITOR_SIZE / naturalHeight,
  );

  return {
    height: naturalHeight * baseScale * zoom,
    width: naturalWidth * baseScale * zoom,
  };
};

const getInitialProfilePhotoCropSize = (
  naturalWidth: number,
  naturalHeight: number,
) => {
  const layout = getProfilePhotoImageLayout(naturalWidth, naturalHeight, 1);

  return clampNumber(
    Math.min(PROFILE_PHOTO_INITIAL_CROP_SIZE, layout.width, layout.height),
    PROFILE_PHOTO_MIN_CROP_SIZE,
    PROFILE_PHOTO_EDITOR_SIZE,
  );
};

const clampProfilePhotoOffset = (
  value: number,
  imageSize: number,
  cropSize: number,
) => {
  const maxOffset = Math.max(0, (imageSize - cropSize) / 2);

  return clampNumber(value, -maxOffset, maxOffset);
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Foto profil gagal dibaca."));
    image.src = src;
  });

const createCroppedProfilePhoto = async (
  imageUrl: string,
  crop: ProfilePhotoCropTransform,
) => {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Browser tidak mendukung crop foto.");
  }

  canvas.width = PROFILE_PHOTO_SIZE;
  canvas.height = PROFILE_PHOTO_SIZE;

  const baseScale = Math.min(
    PROFILE_PHOTO_EDITOR_SIZE / image.naturalWidth,
    PROFILE_PHOTO_EDITOR_SIZE / image.naturalHeight,
  );
  const scale = baseScale * crop.zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX =
    (PROFILE_PHOTO_EDITOR_SIZE - drawWidth) / 2 + crop.offsetX;
  const drawY =
    (PROFILE_PHOTO_EDITOR_SIZE - drawHeight) / 2 + crop.offsetY;
  const cropX = (PROFILE_PHOTO_EDITOR_SIZE - crop.cropSize) / 2;
  const cropY = (PROFILE_PHOTO_EDITOR_SIZE - crop.cropSize) / 2;
  const outputScale = PROFILE_PHOTO_SIZE / crop.cropSize;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE);
  context.drawImage(
    image,
    (drawX - cropX) * outputScale,
    (drawY - cropY) * outputScale,
    drawWidth * outputScale,
    drawHeight * outputScale,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Foto profil gagal diproses."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      0.9,
    );
  });
};

const formatRole = (role: string) => {
  if (ROLE_LABELS[role]) {
    return ROLE_LABELS[role];
  }

  return role
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatPosition = (position: string) =>
  POSITION_LABELS[position] ?? "Warga";

const validateEditableField = (
  field: EditableProfileField,
  value: string,
) => {
  const trimmedValue = value.trim();

  if (field === "username") {
    if (!trimmedValue) {
      return "Username harus diisi.";
    }

    if (trimmedValue.length > 25) {
      return "Username maksimal 25 karakter.";
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedValue)) {
      return "Username hanya boleh huruf, angka, dan underscore.";
    }

    return null;
  }

  if (trimmedValue === "") {
    return null;
  }

  if (field === "email") {
    if (trimmedValue.length > 255) {
      return "Email maksimal 255 karakter.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue)) {
      return "Format email tidak valid.";
    }

    return null;
  }

  const normalizedPhone = trimmedValue.replace(/[\s().-]/g, "");

  if (!/^\+?[0-9]+$/.test(normalizedPhone)) {
    return "Format nomor telepon tidak valid.";
  }

  const isIndonesianPhone =
    normalizedPhone.startsWith("+62") ||
    normalizedPhone.startsWith("62") ||
    normalizedPhone.startsWith("08");

  if (!isIndonesianPhone) {
    return "Nomor telepon harus diawali +62, 62, atau 08.";
  }

  const comparablePhone = normalizedPhone.startsWith("08")
    ? `+62${normalizedPhone.slice(1)}`
    : normalizedPhone.startsWith("62")
      ? `+${normalizedPhone}`
      : normalizedPhone;

  if (!/^\+62[0-9]{8,13}$/.test(comparablePhone)) {
    return "Format nomor telepon tidak valid.";
  }

  return null;
};

const getEditableFieldAutoComplete = (field: EditableProfileField) => {
  if (field === "username") {
    return "username";
  }

  return field === "email" ? "email" : "tel";
};

const getEditableFieldInputMode = (field: EditableProfileField) => {
  if (field === "username") {
    return "text";
  }

  return field === "email" ? "email" : "tel";
};

const getEditableFieldType = (field: EditableProfileField) => {
  if (field === "username") {
    return "text";
  }

  return field === "email" ? "email" : "tel";
};

const ContactVerificationModal = ({
  code,
  description,
  inputId,
  isOpen,
  isSending,
  isVerifying,
  message,
  remainingSeconds,
  title,
  titleId,
  type,
  onClose,
  onCodeChange,
  onResend,
  onVerify,
}: ContactVerificationModalProps) => {
  if (!isOpen) {
    return null;
  }

  const isBusy = isSending || isVerifying;

  return (
    <div className="profile-modal" role="presentation">
      <button
        aria-label="Tutup popup verifikasi"
        className="profile-modal__backdrop"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="profile-modal__panel"
        role="dialog"
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </header>

        <label className="profile-modal__field" htmlFor={inputId}>
          <span>Kode Verifikasi</span>
          <input
            autoComplete="one-time-code"
            id={inputId}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) =>
              onCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="6 digit kode"
            value={code}
          />
        </label>

        {message && (
          <p className={`profile-modal__message profile-modal__message--${type}`}>
            {message}
          </p>
        )}

        <div className="profile-modal__actions">
          <button
            disabled={isBusy || remainingSeconds > 0}
            onClick={onResend}
            type="button"
          >
            {remainingSeconds > 0
              ? `Kirim ulang (${remainingSeconds}s)`
              : "Kirim ulang"}
          </button>
          <button
            className="profile-modal__primary"
            disabled={isBusy || code.length !== 6}
            onClick={onVerify}
            type="button"
          >
            {isVerifying ? "Memeriksa..." : "Verifikasi"}
          </button>
        </div>

        <button className="profile-modal__close" onClick={onClose} type="button">
          Tutup
        </button>
      </section>
    </div>
  );
};

const ProfilePhotoCropModal = ({
  crop,
  isCloseConfirmOpen,
  onChangeImage,
  onConfirmClose,
  onKeepEditing,
  onRequestClose,
  onSubmit,
  onUpdateCrop,
}: ProfilePhotoCropModalProps) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<ProfilePhotoCropInteraction | null>(null);

  useEffect(() => {
    if (!crop.isOpen) {
      return;
    }

    const originalBodyOverflow = document.body.style.overflow;
    const preventModalWheel = (event: WheelEvent) => {
      const target = event.target;

      if (target instanceof Node && modalRef.current?.contains(target)) {
        event.preventDefault();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("wheel", preventModalWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      window.removeEventListener("wheel", preventModalWheel, { capture: true });
    };
  }, [crop.isOpen]);

  if (!crop.isOpen) {
    return null;
  }

  const cropHandles = [
    ["north-west", "Ubah area crop dari kiri atas"],
    ["north", "Ubah area crop dari atas"],
    ["north-east", "Ubah area crop dari kanan atas"],
    ["east", "Ubah area crop dari kanan"],
    ["south-east", "Ubah area crop dari kanan bawah"],
    ["south", "Ubah area crop dari bawah"],
    ["south-west", "Ubah area crop dari kiri bawah"],
    ["west", "Ubah area crop dari kiri"],
  ] as const;

  const imageLayout = getProfilePhotoImageLayout(
    crop.naturalWidth,
    crop.naturalHeight,
    crop.zoom,
  );
  const stageStyle = {
    "--profile-photo-crop-offset": `${crop.cropSize / 2}px`,
    "--profile-photo-crop-size": `${crop.cropSize}px`,
    "--profile-photo-image-height": `${imageLayout.height}px`,
    "--profile-photo-image-width": `${imageLayout.width}px`,
    "--profile-photo-offset-x": `${crop.offsetX}px`,
    "--profile-photo-offset-y": `${crop.offsetY}px`,
    "--profile-photo-zoom": crop.zoom,
  } as CSSProperties;

  const getEditorPoint = (event: ReactPointerEvent<HTMLElement>) => {
    const stage = stageRef.current;

    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();

    if (rect.width === 0) {
      return null;
    }

    const scale = PROFILE_PHOTO_EDITOR_SIZE / rect.width;

    return {
      x: (event.clientX - rect.left) * scale,
      y: (event.clientY - rect.top) * scale,
    };
  };

  const beginMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (crop.isUploading || event.button !== 0) {
      return;
    }

    const point = getEditorPoint(event);

    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      pointerId: event.pointerId,
      startOffsetX: crop.offsetX,
      startOffsetY: crop.offsetY,
      startX: point.x,
      startY: point.y,
      type: "move",
    };
  };

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (crop.isUploading || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    stageRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = {
      pointerId: event.pointerId,
      type: "resize",
    };
  };

  const updateInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;

    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    const point = getEditorPoint(event);

    if (!point) {
      return;
    }

    if (interaction.type === "move") {
      onUpdateCrop({
        offsetX: interaction.startOffsetX + point.x - interaction.startX,
        offsetY: interaction.startOffsetY + point.y - interaction.startY,
      });
      return;
    }

    const center = PROFILE_PHOTO_EDITOR_SIZE / 2;
    const nextCropSize = Math.max(
      Math.abs(point.x - center),
      Math.abs(point.y - center),
    ) * 2;

    onUpdateCrop({
      cropSize: clampProfilePhotoCropSize(nextCropSize),
    });
  };

  const endInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;

    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    interactionRef.current = null;
  };

  const updateZoom = (nextZoom: number) => {
    onUpdateCrop({
      zoom: clampProfilePhotoZoom(nextZoom),
    });
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateZoom(
      crop.zoom + (event.deltaY < 0 ? PROFILE_PHOTO_ZOOM_STEP : -PROFILE_PHOTO_ZOOM_STEP),
    );
  };

  const resetCrop = () => {
    onUpdateCrop({
      cropSize: PROFILE_PHOTO_INITIAL_CROP_SIZE,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
    });
  };

  return (
    <div className="profile-modal profile-photo-modal" ref={modalRef} role="presentation">
      <button
        aria-label="Tutup popup crop foto profil"
        className="profile-modal__backdrop"
        onClick={onRequestClose}
        type="button"
      />
      <section
        aria-labelledby="profile-photo-crop-title"
        aria-modal="true"
        className="profile-modal__panel profile-photo-modal__panel"
        role="dialog"
      >
        <button
          aria-label="Tutup popup crop foto profil"
          className="profile-photo-modal__close"
          disabled={crop.isUploading}
          onClick={onRequestClose}
          type="button"
        >
          X
        </button>
        <header>
          <h2 id="profile-photo-crop-title">Atur Foto Profil</h2>
          <p>
            Sesuaikan posisi foto agar pas dengan frame profil. Foto akan
            dipotong menjadi bentuk kotak seperti tampilan profil.
          </p>
        </header>

        <div
          aria-label="Area crop foto profil"
          className="profile-photo-modal__stage"
          onPointerCancel={endInteraction}
          onPointerDown={beginMove}
          onPointerMove={updateInteraction}
          onPointerUp={endInteraction}
          onWheel={handleWheel}
          ref={stageRef}
          role="application"
          style={stageStyle}
        >
          <img draggable={false} src={crop.objectUrl} alt="Preview foto profil" />
          <div className="profile-photo-modal__crop-box" aria-hidden="true" />
          {cropHandles.map(([position, label]) => (
            <button
              aria-label={label}
              className={`profile-photo-modal__handle profile-photo-modal__handle--${position}`}
              disabled={crop.isUploading}
              key={position}
              onPointerDown={beginResize}
              type="button"
            />
          ))}
        </div>

        <div className="profile-photo-modal__toolbar" aria-label="Kontrol crop">
          <button
            disabled={crop.isUploading || crop.zoom <= PROFILE_PHOTO_MIN_ZOOM}
            onClick={() => updateZoom(crop.zoom - PROFILE_PHOTO_ZOOM_STEP)}
            type="button"
          >
            -
          </button>
          <button
            disabled={crop.isUploading}
            onClick={resetCrop}
            type="button"
          >
            Reset
          </button>
          <button
            disabled={crop.isUploading || crop.zoom >= PROFILE_PHOTO_MAX_ZOOM}
            onClick={() => updateZoom(crop.zoom + PROFILE_PHOTO_ZOOM_STEP)}
            type="button"
          >
            +
          </button>
        </div>

        {crop.message && (
          <p className="profile-modal__message profile-modal__message--error">
            {crop.message}
          </p>
        )}

        <div className="profile-modal__actions">
          <button
            disabled={crop.isUploading}
            onClick={onChangeImage}
            type="button"
          >
            Ganti gambar
          </button>
          <button
            className="profile-modal__primary"
            disabled={crop.isUploading}
            onClick={onSubmit}
            type="button"
          >
            {crop.isUploading ? "Mengupload..." : "Selesai"}
          </button>
        </div>
      </section>

      {isCloseConfirmOpen && (
        <section
          aria-labelledby="profile-photo-close-title"
          aria-modal="true"
          className="profile-modal__panel profile-photo-confirm"
          role="alertdialog"
        >
          <header>
            <h2 id="profile-photo-close-title">Batalkan upload foto?</h2>
            <p>
              Foto yang dipilih belum disimpan. Lanjutkan mengedit atau batalkan
              upload foto profil ini.
            </p>
          </header>
          <div className="profile-modal__actions">
            <button onClick={onConfirmClose} type="button">
              Batalkan upload
            </button>
            <button
              className="profile-modal__primary"
              onClick={onKeepEditing}
              type="button"
            >
              Lanjut edit
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export const Profile = ({
  accountDescription,
  accountAvatarSrc,
  accountName,
  accountPrivileges,
  isAuthenticated,
  onAuthAction,
  onBackHome,
  onOpenChangePassword,
  onOpenAccessManagement,
  onOpenAnalysis,
  onOpenHistory,
  onOpenManageSurveys,
  onOpenSurveyList,
  onOpenUserManagement,
  onProfileLoaded,
  onUnauthorized,
}: ProfileProps) => {
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);
  const [editingField, setEditingField] =
    useState<EditableProfileField | null>(null);
  const [drafts, setDrafts] = useState<Record<EditableProfileField, string>>({
    email: "",
    phone: "",
    username: "",
  });
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<EditableProfileField, string>>
  >({});
  const [savingField, setSavingField] = useState<EditableProfileField | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [contactVerification, setContactVerification] =
    useState<ContactVerificationState>(initialContactVerification);
  const [profilePhotoVersion, setProfilePhotoVersion] = useState(0);
  const [profilePhotoCrop, setProfilePhotoCrop] =
    useState<ProfilePhotoCropState>(initialProfilePhotoCrop);
  const [isPhotoCloseConfirmOpen, setIsPhotoCloseConfirmOpen] =
    useState(false);

  const applyProfile = useCallback(
    (nextProfile: ProfileData) => {
      setProfile(nextProfile);
      setDrafts({
        email: nextProfile.email ?? "",
        phone: nextProfile.phone ?? "",
        username: nextProfile.username ?? "",
      });
      onProfileLoaded?.(nextProfile);
    },
    [onProfileLoaded],
  );

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setProfile(null);
      setIsLoadingProfile(false);
      return;
    }

    setIsLoadingProfile(true);
    setFeedback(null);

    try {
      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        credentials: "include",
        headers: authHeaders(),
        method: "GET",
      });

      if (response.status === 401) {
        setProfilePhotoCrop((current) => ({
          ...current,
          isUploading: false,
        }));
        onUnauthorized?.();
        return;
      }

      if (!response.ok) {
        throw new Error(await getApiMessage(response));
      }

      const result = (await response.json()) as ApiResult<ProfileData>;

      if (!result.data) {
        throw new Error("Data profil tidak ditemukan.");
      }

      applyProfile(result.data);
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : "Profil gagal dimuat. Silakan coba lagi.",
        type: "error",
      });
    } finally {
      setIsLoadingProfile(false);
    }
  }, [applyProfile, isAuthenticated, onUnauthorized]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadProfile]);

  useEffect(() => {
    if (!contactVerification.isOpen || contactVerification.cooldownUntil <= now) {
      return;
    }

    const timerId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [contactVerification.cooldownUntil, contactVerification.isOpen, now]);

  useEffect(
    () => () => {
      if (profilePhotoCrop.objectUrl) {
        URL.revokeObjectURL(profilePhotoCrop.objectUrl);
      }
    },
    [profilePhotoCrop.objectUrl],
  );

  const profileFields = useMemo<ProfileField[]>(
    () => [
      {
        key: "full_name",
        label: "Nama Lengkap",
        value: displayValue(profile?.full_name),
      },
      {
        key: "nik",
        label: "NIK",
        value: displayValue(profile?.nik),
      },
      {
        key: "address",
        label: "Alamat Lengkap",
        value: displayValue(profile?.address),
      },
      {
        editable: "username",
        key: "username",
        label: "Username",
        value: displayValue(profile?.username),
      },
      {
        editable: "email",
        isVerified: Boolean(profile?.email_verified),
        key: "email",
        label: "Alamat Email",
        value: displayValue(profile?.email),
        verification: "email",
        warning:
          profile?.email && !profile.email_verified
            ? "Email belum terverifikasi. Verifikasi agar email bisa dipakai untuk reset password."
            : undefined,
      },
      {
        editable: "phone",
        isVerified: Boolean(profile?.phone_verified),
        key: "phone",
        label: "Nomor Telepon",
        value: displayValue(profile?.phone),
        verification: "phone",
        warning:
          profile?.phone && !profile.phone_verified
            ? "Nomor telepon belum terverifikasi."
            : undefined,
      },
    ],
    [profile],
  );

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((current) => !current);
  };

  const handleBackHome = () => {
    closeSidebar();
    onBackHome?.();
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

  const handleAuthAction = () => {
    closeSidebar();
    onAuthAction?.();
  };

  const openPhotoPicker = () => {
    setFeedback(null);
    photoFileInputRef.current?.click();
  };

  const handlePhotoFileChange = (file: File | null) => {
    if (!file) {
      return;
    }

    if (!PROFILE_PHOTO_TYPES.has(file.type)) {
      setFeedback({
        message: "Format foto profil harus JPG, PNG, atau WEBP.",
        type: "error",
      });
      return;
    }

    if (file.size > PROFILE_PHOTO_MAX_SIZE) {
      setFeedback({
        message: "Ukuran foto profil maksimal 3MB.",
        type: "error",
      });
      return;
    }

    setIsPhotoCloseConfirmOpen(false);
    setFeedback(null);

    const objectUrl = URL.createObjectURL(file);

    void loadImage(objectUrl)
      .then((image) => {
        setProfilePhotoCrop({
          cropSize: getInitialProfilePhotoCropSize(
            image.naturalWidth,
            image.naturalHeight,
          ),
          file,
          fileName: file.name,
          isOpen: true,
          isUploading: false,
          message: "",
          naturalHeight: image.naturalHeight,
          naturalWidth: image.naturalWidth,
          objectUrl,
          offsetX: 0,
          offsetY: 0,
          zoom: 1,
        });
      })
      .catch(() => {
        URL.revokeObjectURL(objectUrl);
        setFeedback({
          message: "Foto profil gagal dibaca.",
          type: "error",
        });
      });
  };

  const updateProfilePhotoCrop = (
    updates: Partial<ProfilePhotoCropTransform>,
  ) => {
    setProfilePhotoCrop((current) => {
      const zoom = clampProfilePhotoZoom(updates.zoom ?? current.zoom);
      const layout = getProfilePhotoImageLayout(
        current.naturalWidth,
        current.naturalHeight,
        zoom,
      );
      const maxCropSize = Math.min(
        PROFILE_PHOTO_EDITOR_SIZE,
        layout.width,
        layout.height,
      );
      const cropSize = clampProfilePhotoCropSize(
        updates.cropSize ?? current.cropSize,
        maxCropSize,
      );

      return {
        ...current,
        cropSize,
        message: "",
        offsetX: clampProfilePhotoOffset(
          updates.offsetX ?? current.offsetX,
          layout.width,
          cropSize,
        ),
        offsetY: clampProfilePhotoOffset(
          updates.offsetY ?? current.offsetY,
          layout.height,
          cropSize,
        ),
        zoom,
      };
    });
  };

  const requestCloseProfilePhotoCrop = () => {
    if (profilePhotoCrop.isUploading) {
      return;
    }

    setIsPhotoCloseConfirmOpen(true);
  };

  const closeProfilePhotoCrop = () => {
    setIsPhotoCloseConfirmOpen(false);
    setProfilePhotoCrop(initialProfilePhotoCrop);
  };

  const uploadProfilePhoto = async () => {
    if (!profilePhotoCrop.file || !profilePhotoCrop.objectUrl) {
      return;
    }

    setProfilePhotoCrop((current) => ({
      ...current,
      isUploading: true,
      message: "",
    }));
    setFeedback(null);

    try {
      const croppedPhoto = await createCroppedProfilePhoto(
        profilePhotoCrop.objectUrl,
        profilePhotoCrop,
      );
      const formData = new FormData();
      const safeName = profilePhotoCrop.fileName.replace(/[^\w.-]+/g, "-");

      formData.append("photo", croppedPhoto, safeName || "profile-photo.jpg");

      const response = await fetch(`${API_BASE_URL}/users/profile/photo`, {
        body: formData,
        credentials: "include",
        headers: authHeaders(),
        method: "POST",
      });

      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }

      if (!response.ok) {
        throw new Error(await getApiMessage(response));
      }

      const result = (await response.json()) as ApiResult<Partial<ProfileData>>;

      if (result.data && profile) {
        applyProfile({ ...profile, ...result.data });
      } else if (result.data?.id) {
        applyProfile(result.data as ProfileData);
      }

      setProfilePhotoVersion((current) => current + 1);
      closeProfilePhotoCrop();
      setFeedback({
        message: result.message ?? "Foto profil berhasil diperbarui.",
        type: "success",
      });
    } catch (error) {
      setProfilePhotoCrop((current) => ({
        ...current,
        isUploading: false,
        message:
          error instanceof Error
            ? error.message
            : "Foto profil gagal diupload. Silakan coba lagi.",
      }));
    }
  };

  const handleStartEdit = (field: EditableProfileField) => {
    setFeedback(null);
    setEditingField(field);
    setDrafts((current) => ({
      ...current,
      [field]: profile?.[field] ?? "",
    }));
    setFieldErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setFieldErrors({});
    setDrafts({
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      username: profile?.username ?? "",
    });
  };

  const handleDraftChange = (field: EditableProfileField, value: string) => {
    setDrafts((current) => ({
      ...current,
      [field]: value,
    }));
    setFeedback(null);
    setFieldErrors((current) => ({
      ...current,
      [field]: validateEditableField(field, value) ?? undefined,
    }));
  };

  const handleSaveField = async (
    event: FormEvent<HTMLFormElement>,
    field: EditableProfileField,
  ) => {
    event.preventDefault();

    const error = validateEditableField(field, drafts[field]);

    if (error) {
      setFieldErrors((current) => ({
        ...current,
        [field]: error,
      }));
      return;
    }

    setSavingField(field);
    setFeedback(null);

    try {
      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        body: JSON.stringify({
          [field]: drafts[field].trim(),
        }),
        credentials: "include",
        headers: authHeaders("application/json"),
        method: "PATCH",
      });

      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }

      if (!response.ok) {
        throw new Error(await getApiMessage(response));
      }

      const result = (await response.json()) as ApiResult<ProfileData>;

      if (result.data) {
        applyProfile(result.data);
      }

      setEditingField(null);
      setFieldErrors({});
      setContactVerification(initialContactVerification);
      setFeedback({
        message: result.message ?? "Profil berhasil diperbarui.",
        type: "success",
      });
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : "Profil gagal diperbarui. Silakan coba lagi.",
        type: "error",
      });
    } finally {
      setSavingField(null);
    }
  };

  const sendContactVerification = async (channel: ContactChannel) => {
    const endpoint =
      channel === "email"
        ? `${API_BASE_URL}/users/profile/email/code`
        : `${API_BASE_URL}/users/profile/phone/otp`;

    setContactVerification((current) => ({
      ...current,
      channel,
      isOpen: true,
      isSending: true,
      message:
        channel === "email"
          ? "Mengirim kode verifikasi email..."
          : "Mengirim OTP nomor telepon...",
      type: "info",
    }));

    try {
      const response = await fetch(endpoint, {
        credentials: "include",
        headers: authHeaders(),
        method: "POST",
      });

      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }

      if (!response.ok) {
        throw new Error(await getApiMessage(response));
      }

      const result = (await response.json()) as ApiResult<unknown>;
      setNow(Date.now());
      setContactVerification((current) => ({
        ...current,
        channel,
        code: "",
        cooldownUntil: Date.now() + CONTACT_CODE_COOLDOWN_MS,
        isOpen: true,
        isSending: false,
        message:
          result.message ??
          (channel === "email"
            ? "Kode verifikasi email sudah dikirim."
            : "OTP nomor telepon sudah dikirim."),
        type: "success",
      }));
    } catch (error) {
      setContactVerification((current) => ({
        ...current,
        channel,
        isOpen: true,
        isSending: false,
        message:
          error instanceof Error
            ? error.message
            : channel === "email"
              ? "Kode verifikasi email gagal dikirim."
              : "OTP nomor telepon gagal dikirim.",
        type: "error",
      }));
    }
  };

  const verifyContact = async () => {
    const channel = contactVerification.channel;

    if (!channel) {
      return;
    }

    const endpoint =
      channel === "email"
        ? `${API_BASE_URL}/users/profile/email/verify`
        : `${API_BASE_URL}/users/profile/phone/verify`;

    setContactVerification((current) => ({
      ...current,
      isVerifying: true,
      message: "",
    }));

    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({
          code: contactVerification.code,
        }),
        credentials: "include",
        headers: authHeaders("application/json"),
        method: "POST",
      });

      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }

      if (!response.ok) {
        throw new Error(await getApiMessage(response));
      }

      const result = (await response.json()) as ApiResult<ProfileData>;

      if (result.data) {
        applyProfile(result.data);
      }

      setContactVerification(initialContactVerification);
      setFeedback({
        message:
          result.message ??
          (channel === "email"
            ? "Email berhasil diverifikasi."
            : "Nomor telepon berhasil diverifikasi."),
        type: "success",
      });
    } catch (error) {
      setContactVerification((current) => ({
        ...current,
        isVerifying: false,
        message:
          error instanceof Error
            ? error.message
            : "Kode verifikasi tidak valid.",
        type: "error",
      }));
    }
  };

  const handleVerificationAction = (channel: ContactChannel) => {
    if (contactVerification.channel === channel && contactVerification.isOpen) {
      return;
    }

    void sendContactVerification(channel);
  };

  const handleOpenChangePassword = () => {
    closeSidebar();
    onOpenChangePassword?.();
  };

  const identityName = displayValue(profile?.full_name);
  const positionLabel = formatPosition(profile?.position ?? "");
  const roleLabel = formatRole(profile?.role ?? "user");
  const profileAvatarSrc = useMemo(
    () =>
      resolveProfilePhotoUrl(
        profile,
        accountAvatarSrc ?? profileAvatar,
        profilePhotoVersion,
      ),
    [accountAvatarSrc, profile, profilePhotoVersion],
  );
  const sidebarName = profile?.full_name?.trim() || accountName || "Pengguna";
  const sidebarDescription =
    profile?.username?.trim() || accountDescription || "Belum login";
  const activeChannel = contactVerification.channel ?? "email";
  const remainingSeconds = Math.max(
    0,
    Math.ceil((contactVerification.cooldownUntil - now) / 1000),
  );

  return (
    <main className="profile-page">
      <Topbar
        avatarSrc={profileAvatarSrc}
        isSidebarOpen={isSidebarOpen}
        onProfileClick={closeSidebar}
        onToggleSidebar={toggleSidebar}
        sidebarId="profile-sidebar"
      />

      <Sidebar
        accountDescription={sidebarDescription}
        accountName={sidebarName}
        avatarSrc={profileAvatarSrc}
        id="profile-sidebar"
        isAuthenticated={isAuthenticated}
        isOpen={isSidebarOpen}
        onAuthAction={handleAuthAction}
        onClose={closeSidebar}
        onNavigate={handleNavigationClick}
        privileges={accountPrivileges}
      />

      <section className="profile-shell">
        <div className="profile-content">
          <div className="profile-main-stack">
            <header className="profile-heading">
              <div>
                <h1>User Profile</h1>
                <p>
                  Manage your personal information, privacy settings, and account
                  security.
                </p>
              </div>

              <nav className="profile-breadcrumb" aria-label="Breadcrumb">
                <button onClick={handleBackHome} type="button">
                  Home
                </button>
                <img src={breadcrumbChevronIcon} alt="" aria-hidden="true" />
                <span>Pengaturan Profil</span>
              </nav>
            </header>

            {feedback && (
              <p className={`profile-feedback profile-feedback--${feedback.type}`}>
                {feedback.message}
              </p>
            )}

            <section className="profile-card profile-overview">
              <div className="profile-overview__inner">
                <div className="profile-overview__avatar-wrap">
                  <img
                    className="profile-overview__avatar"
                    src={profileAvatarSrc}
                    alt=""
                    aria-hidden="true"
                  />
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="profile-photo-input"
                    onChange={(event) => {
                      handlePhotoFileChange(event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                    ref={photoFileInputRef}
                    type="file"
                  />
                  <button
                    aria-label="Ubah foto profil"
                    className="profile-overview__camera"
                    onClick={openPhotoPicker}
                    type="button"
                  >
                    <img src={cameraIcon} alt="" aria-hidden="true" />
                  </button>
                </div>

                <div className="profile-overview__identity">
                  <h2>{isLoadingProfile ? "Memuat profil..." : identityName}</h2>
                  <div className="profile-badges" aria-label="Status akun">
                    <span className="profile-badge profile-badge--citizen">
                      <img src={badgeCheckIcon} alt="" aria-hidden="true" />
                      {positionLabel}
                    </span>
                    <span className="profile-badge profile-badge--role">
                      {roleLabel}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="profile-card profile-info">
              <header>
                <h2>Informasi Pribadi</h2>
              </header>

              {isLoadingProfile ? (
                <p className="profile-empty-state">Memuat data profil...</p>
              ) : (
                <div className="profile-info__grid">
                  {profileFields.map((field) => (
                    <div className="profile-field" key={field.key}>
                      <span>{field.label}</span>
                      {field.editable !== undefined &&
                      editingField === field.editable ? (
                        <form
                          className="profile-field__editor"
                          onSubmit={(event) =>
                            handleSaveField(event, field.editable!)
                          }
                        >
                          <input
                            aria-label={field.label}
                            autoComplete={getEditableFieldAutoComplete(
                              field.editable,
                            )}
                            inputMode={getEditableFieldInputMode(field.editable)}
                            onChange={(event) =>
                              handleDraftChange(field.editable!, event.target.value)
                            }
                            type={getEditableFieldType(field.editable)}
                            value={drafts[field.editable]}
                          />
                          <div className="profile-field__actions">
                            <button
                              disabled={savingField === field.editable}
                              type="submit"
                            >
                              {savingField === field.editable
                                ? "Menyimpan..."
                                : "Simpan"}
                            </button>
                            <button
                              disabled={savingField === field.editable}
                              onClick={handleCancelEdit}
                              type="button"
                            >
                              Batal
                            </button>
                          </div>
                          {fieldErrors[field.editable] && (
                            <p className="profile-field__error">
                              {fieldErrors[field.editable]}
                            </p>
                          )}
                          {field.warning && (
                            <p className="profile-field__warning">{field.warning}</p>
                          )}
                        </form>
                      ) : (
                        <>
                          <div className="profile-field__value">
                            <p>{field.value}</p>
                            {(field.verification || field.editable) && (
                              <div className="profile-field__controls">
                                {field.verification && field.value !== "-" && (
                                  field.isVerified ? (
                                    <span className="profile-field__verified">
                                      Terverifikasi
                                    </span>
                                  ) : (
                                    <button
                                      aria-label={
                                        field.verification === "email"
                                          ? "Verifikasi email"
                                          : "Verifikasi nomor telepon"
                                      }
                                      className="profile-field__verify"
                                      onClick={() =>
                                        handleVerificationAction(
                                          field.verification as ContactChannel,
                                        )
                                      }
                                      type="button"
                                    >
                                      {field.verification === "email"
                                        ? "Verif"
                                        : "OTP"}
                                    </button>
                                  )
                                )}
                                {field.editable && (
                                  <button
                                    aria-label={`Ubah ${field.label}`}
                                    onClick={() => handleStartEdit(field.editable!)}
                                    type="button"
                                  >
                                    <img src={editIcon} alt="" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {field.warning && (
                            <p className="profile-field__warning">{field.warning}</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="profile-card profile-security">
              <h2>Keamanan Akun</h2>
              <button
                className="profile-security__row"
                onClick={handleOpenChangePassword}
                type="button"
              >
                <span className="profile-security__icon" aria-hidden="true">
                  <img src={lockIcon} alt="" />
                </span>
                <span className="profile-security__copy">
                  <strong>Ubah Password</strong>
                  <small>Gunakan password lama untuk membuat password baru</small>
                </span>
                <img
                  className="profile-security__chevron"
                  src={chevronRightIcon}
                  alt=""
                  aria-hidden="true"
                />
              </button>
            </section>
          </div>

          <footer className="profile-footer">
            <p>&copy; 2026 Pemerintah Kota Yogyakarta. Hak Cipta Dilindungi.</p>
            <div>
              <span>Kebijakan Privasi</span>
              <span>Syarat & Ketentuan</span>
              <span>Kontak</span>
            </div>
          </footer>
        </div>
      </section>

      <ProfilePhotoCropModal
        crop={profilePhotoCrop}
        isCloseConfirmOpen={isPhotoCloseConfirmOpen}
        onChangeImage={openPhotoPicker}
        onConfirmClose={closeProfilePhotoCrop}
        onKeepEditing={() => setIsPhotoCloseConfirmOpen(false)}
        onRequestClose={requestCloseProfilePhotoCrop}
        onSubmit={() => void uploadProfilePhoto()}
        onUpdateCrop={updateProfilePhotoCrop}
      />

      <ContactVerificationModal
        code={contactVerification.code}
        description={
          activeChannel === "email"
            ? "Masukkan 6 digit kode yang dikirim ke email akun Anda."
            : "Masukkan 6 digit OTP yang dikirim ke nomor telepon akun Anda."
        }
        inputId={`${activeChannel}-profile-verification-code`}
        isOpen={contactVerification.isOpen}
        isSending={contactVerification.isSending}
        isVerifying={contactVerification.isVerifying}
        message={contactVerification.message}
        onClose={() =>
          setContactVerification((current) => ({ ...current, isOpen: false }))
        }
        onCodeChange={(value) =>
          setContactVerification((current) => ({
            ...current,
            code: value,
            message: "",
          }))
        }
        onResend={() => void sendContactVerification(activeChannel)}
        onVerify={() => void verifyContact()}
        remainingSeconds={remainingSeconds}
        title={
          activeChannel === "email"
            ? "Verifikasi Email"
            : "Verifikasi Nomor Telepon"
        }
        titleId={`${activeChannel}-profile-verification-title`}
        type={contactVerification.type}
      />
    </main>
  );
};
