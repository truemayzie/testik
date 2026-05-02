/** Клиентский fire-and-forget: не await в UI-потоке */
export function trackWorkActivityClient(payload: {
  action: "DOCX_DOWNLOAD" | "PPTX_DOWNLOAD" | "SPEECH_DOWNLOAD";
  source: "home" | "dashboard" | "preview";
  generationId?: string | null;
  slug?: string | null;
  workType?: string | null;
  meta?: Record<string, unknown>;
}): void {
  try {
    const body = JSON.stringify(payload);
    void fetch("/api/work-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  } catch {}
}
