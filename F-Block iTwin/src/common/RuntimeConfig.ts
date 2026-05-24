type RuntimeConfigKey =
  | "IMJS_AUTH_CLIENT_CLIENT_ID"
  | "IMJS_AUTH_CLIENT_REDIRECT_URI"
  | "IMJS_AUTH_CLIENT_LOGOUT_URI"
  | "IMJS_AUTH_CLIENT_SCOPES"
  | "IMJS_AUTH_AUTHORITY"
  | "IMJS_ITWIN_ID"
  | "IMJS_IMODEL_ID"
  | "IMJS_BING_MAPS_KEY"
  | "IMJS_MAP_BOX_KEY"
  | "IMJS_CESIUM_ION_KEY";

type RuntimeConfig = Partial<Record<RuntimeConfigKey, string>>;

declare global {
  interface Window {
    __ITWIN_ENV__?: RuntimeConfig;
  }
}

export function getRuntimeConfigValue(key: RuntimeConfigKey): string {
  if (typeof window !== "undefined") {
    const runtimeValue = window.__ITWIN_ENV__?.[key];
    if (runtimeValue !== undefined && runtimeValue !== "") {
      return runtimeValue;
    }
  }

  return process.env[key] ?? "";
}
