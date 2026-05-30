/** Инициалы для аватара (как у Самописца — одна-две буквы). */
export function userInitials(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const email = user.email?.trim();
  if (email) return email[0].toUpperCase();
  return "?";
}
