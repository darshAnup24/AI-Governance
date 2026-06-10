const INSECURE_SENTINELS = new Set([
  "airlock-enterprise-secret-change-me",
  "airlock-refresh-secret-change-me",
  "internal-service-token-change-me",
]);

function allowInsecureDefaults() {
  return process.env.ALLOW_INSECURE_DEFAULT_SECRETS === "true";
}

export function getRequiredSecret(
  envNames: string[],
  fallback: string,
  label: string,
) {
  const configured = envNames
    .map((name) => process.env[name]?.trim())
    .find((value) => Boolean(value));
  const value = configured || fallback;

  if (INSECURE_SENTINELS.has(value) && !allowInsecureDefaults()) {
    throw new Error(
      `${label} must be set to a non-default secret. Configure ${envNames.join(" or ")}.`,
    );
  }

  return value;
}

export function assertSecureRuntimeConfig() {
  getRequiredSecret(
    ["JWT_SECRET", "GOVERNANCE_JWT_SECRET"],
    "airlock-enterprise-secret-change-me",
    "Access token secret",
  );
  getRequiredSecret(
    ["REFRESH_SECRET", "GOVERNANCE_REFRESH_SECRET"],
    "airlock-refresh-secret-change-me",
    "Refresh token secret",
  );
  getRequiredSecret(
    ["INTERNAL_SERVICE_TOKEN"],
    "internal-service-token-change-me",
    "Internal service token",
  );
}
