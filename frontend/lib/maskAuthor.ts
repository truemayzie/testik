/** Частичное имя/ник для публичной ленты (остальное — звёздочки). */
export function maskAuthorDisplay(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return parts.map((part) => maskToken(part)).join(" ");
    }
    return maskToken(trimmedName);
  }

  const local = email?.split("@")[0]?.trim();
  if (local) {
    return maskToken(local);
  }

  return "Пользователь";
}

function maskToken(token: string): string {
  const t = token.trim();
  if (!t) return "***";
  if (t.length <= 2) return `${t}***`;
  const visible = t.length <= 4 ? 2 : 3;
  return `${t.slice(0, visible)}${"*".repeat(Math.min(4, Math.max(2, t.length - visible)))}`;
}
