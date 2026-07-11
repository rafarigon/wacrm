/**
 * Display helpers for a user profile.
 *
 * `full_name` can be an empty string (Supabase seeds it that way when
 * signup didn't collect a name), which `??` doesn't catch — so a naive
 * `full_name ?? "User"` renders blank. These helpers treat empty /
 * whitespace-only names as absent and fall back to the email local-part,
 * then a generic label.
 */

interface ProfileLike {
  full_name?: string | null;
  email?: string | null;
}

/** Best display name: trimmed full_name → email local-part → "Usuário". */
export function displayName(profile?: ProfileLike | null): string {
  const name = profile?.full_name?.trim();
  if (name) return name;
  const email = profile?.email?.trim();
  if (email) return email.split("@")[0];
  return "Usuário";
}

/** Single uppercase initial for the avatar fallback. */
export function displayInitial(profile?: ProfileLike | null): string {
  return displayName(profile).charAt(0).toUpperCase();
}
