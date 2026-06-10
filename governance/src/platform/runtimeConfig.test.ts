import test from "node:test";
import assert from "node:assert/strict";

import { getRequiredSecret } from "./runtimeConfig";

function withEnv(
  entries: Record<string, string | undefined>,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(entries)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("rejects insecure default secrets unless explicitly allowed", () => {
  withEnv(
    {
      JWT_SECRET: undefined,
      GOVERNANCE_JWT_SECRET: undefined,
      ALLOW_INSECURE_DEFAULT_SECRETS: undefined,
    },
    () => {
      assert.throws(
        () =>
          getRequiredSecret(
            ["JWT_SECRET", "GOVERNANCE_JWT_SECRET"],
            "airlock-enterprise-secret-change-me",
            "Access token secret",
          ),
        /must be set to a non-default secret/,
      );
    },
  );
});

test("allows explicit secure secrets", () => {
  withEnv(
    {
      JWT_SECRET: "super-secure-secret",
      GOVERNANCE_JWT_SECRET: undefined,
      ALLOW_INSECURE_DEFAULT_SECRETS: undefined,
    },
    () => {
      assert.equal(
        getRequiredSecret(
          ["JWT_SECRET", "GOVERNANCE_JWT_SECRET"],
          "airlock-enterprise-secret-change-me",
          "Access token secret",
        ),
        "super-secure-secret",
      );
    },
  );
});

test("allows insecure defaults only in explicit local override mode", () => {
  withEnv(
    {
      INTERNAL_SERVICE_TOKEN: undefined,
      ALLOW_INSECURE_DEFAULT_SECRETS: "true",
    },
    () => {
      assert.equal(
        getRequiredSecret(
          ["INTERNAL_SERVICE_TOKEN"],
          "internal-service-token-change-me",
          "Internal service token",
        ),
        "internal-service-token-change-me",
      );
    },
  );
});
