import { API_BASE_URL } from "./api";

export type ProfilePhotoSource = {
  avatar_path?: string | null;
  avatar_url?: string | null;
  photo_path?: string | null;
  photo_url?: string | null;
  profile_photo_path?: string | null;
  profile_photo_url?: string | null;
};

const appendCacheVersion = (url: string, version: number) => {
  if (version <= 0 || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
};

export const resolveProfilePhotoUrl = (
  profile: ProfilePhotoSource | null | undefined,
  fallbackSrc: string,
  version = 0,
) => {
  const photoPath =
    profile?.profile_photo_url ??
    profile?.profile_photo_path ??
    profile?.photo_url ??
    profile?.photo_path ??
    profile?.avatar_url ??
    profile?.avatar_path;

  if (!photoPath) {
    return fallbackSrc;
  }

  if (/^(https?:)?\/\//i.test(photoPath) || photoPath.startsWith("data:")) {
    return appendCacheVersion(photoPath, version);
  }

  const publicUrl = `${API_BASE_URL}${photoPath.startsWith("/") ? "" : "/"}${photoPath}`;
  return appendCacheVersion(publicUrl, version);
};
