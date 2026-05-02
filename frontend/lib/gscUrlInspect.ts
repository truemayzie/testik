import { GoogleAuth } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

async function getAuth(): Promise<GoogleAuth | null> {
  const jsonRaw = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (jsonRaw) {
    try {
      const credentials = JSON.parse(jsonRaw) as Record<string, unknown>;
      return new GoogleAuth({ credentials, scopes: SCOPES });
    } catch {
      return null;
    }
  }
  if (keyFile) {
    return new GoogleAuth({ keyFile, scopes: SCOPES });
  }
  return null;
}

export type GoogleInspectResult = {
  verdict: string | null;
  coverageState: string | null;
  error?: string;
};

/** URL Inspection API (данные про версию страницы в индексе Google). Лимит ~2000 запросов/день на ресурс в GSC. */
export async function inspectGoogleIndex(inspectionUrl: string, siteUrlGscProperty: string): Promise<GoogleInspectResult> {
  const auth = await getAuth();
  if (!auth) {
    return { verdict: null, coverageState: null, error: "missing_credentials" };
  }

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token =
    typeof tokenResponse === "string"
      ? tokenResponse
      : typeof tokenResponse?.token === "string"
        ? tokenResponse.token
        : null;

  if (!token) {
    return { verdict: null, coverageState: null, error: "no_access_token" };
  }

  const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      inspectionUrl,
      siteUrl: siteUrlGscProperty,
      languageCode: "ru-RU",
    }),
  });

  const raw = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const msg =
      typeof raw?.error === "object" && raw.error !== null && "message" in raw.error
        ? String((raw.error as { message?: string }).message)
        : res.statusText;
    return {
      verdict: null,
      coverageState: null,
      error: `HTTP ${res.status}: ${msg}`,
    };
  }

  const inspectionResult = raw.inspectionResult as Record<string, unknown> | undefined;
  const indexStatus = inspectionResult?.indexStatus as Record<string, unknown> | undefined;

  return {
    verdict: typeof indexStatus?.verdict === "string" ? indexStatus.verdict : null,
    coverageState: typeof indexStatus?.coverageState === "string" ? indexStatus.coverageState : null,
  };
}
