function read(name: string, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export const ENV = {
  wpBaseUrl: read("WP_BASE_URL").replace(/\/+$/, ""),
  wpUsername: read("WP_USERNAME"),
  wpAppPassword: read("WP_APP_PASSWORD"),
  anthropicModel: read("ANTHROPIC_MODEL", "claude-opus-5-5"),
  adminPassword: read("ADMIN_PASSWORD"),
  sessionSecret: read("SESSION_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
};

/** 列出缺少的必要設定，啟動時在主控台提示而不是直接當掉。 */
export function missingEnv() {
  const required: Array<[string, string]> = [
    ["WP_BASE_URL", ENV.wpBaseUrl],
    ["WP_USERNAME", ENV.wpUsername],
    ["WP_APP_PASSWORD", ENV.wpAppPassword],
    ["ADMIN_PASSWORD", ENV.adminPassword],
    ["SESSION_SECRET", ENV.sessionSecret],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN)
    missing.push("ANTHROPIC_API_KEY");
  return missing;
}
