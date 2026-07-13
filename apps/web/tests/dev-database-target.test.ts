import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";

const script = new URL(
  "../../../scripts/validate-dev-database-target.mjs",
  import.meta.url,
).pathname;
const validUrl =
  "postgresql://dev_user:dev_password@api-dev.goodcms.cn:5432/postgres?sslmode=require";
const devProjectRef = "fclnkyatvfvmzgzdqlba";
const productionProjectRef = "unqhypivjkpwldhufpjc";
const otherProjectRef = "aaaaaaaaaaaaaaaaaaaa";
const validArgs = [
  validUrl,
  devProjectRef,
  "api-dev.goodcms.cn",
  devProjectRef,
  "api.goodcms.cn 1.13.20.39",
  productionProjectRef,
];

function validate(args: readonly string[] = validArgs) {
  return spawnSync("node", [script, ...args], { encoding: "utf8" });
}

type ResolverEnvironment = Partial<
  Record<
    "SUPABASE_PROJECT_REF" | "SUPABASE_DB_DIRECT_URL" | "SUPABASE_DB_URL",
    string
  >
>;

const directUrl = (projectRef: string, protocol = "postgresql"): string =>
  `${protocol}://postgres:direct_password@db.${projectRef}.supabase.co:5432/postgres`;
const databaseUrl = (username: string): string =>
  `postgresql://${username}:database_password@api-dev.goodcms.cn:5432/postgres`;

function resolveProjectRef(values: ResolverEnvironment) {
  const env = { ...process.env };
  for (const name of [
    "SUPABASE_PROJECT_REF",
    "SUPABASE_DB_DIRECT_URL",
    "SUPABASE_DB_URL",
  ]) {
    delete env[name];
  }
  Object.assign(env, values);

  return spawnSync("node", [script, "--resolve-project-ref"], {
    encoding: "utf8",
    env,
  });
}

function expectSafeResolverRejection(
  result: ReturnType<typeof resolveProjectRef>,
) {
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("development database target rejected\n");
  for (const secret of [
    "postgresql://",
    "https://",
    "postgres.",
    "direct_password",
    "database_password",
    devProjectRef,
    productionProjectRef,
    otherProjectRef,
  ]) {
    expect(result.stderr).not.toContain(secret);
  }
}

describe("development database target validator", () => {
  test("accepts the exact development target without requiring the URL to contain its project ref", () => {
    const result = validate();

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test.each([
    ["an invalid URL", ["not-a-url", ...validArgs.slice(1)]],
    ["a non-Postgres protocol", [validUrl.replace("postgresql:", "https:"), ...validArgs.slice(1)]],
    ["a missing username", [validUrl.replace("dev_user", ""), ...validArgs.slice(1)]],
    ["a missing password", [validUrl.replace(":dev_password", ""), ...validArgs.slice(1)]],
    ["a different hostname", [validUrl.replace("api-dev.goodcms.cn", "other.goodcms.cn"), ...validArgs.slice(1)]],
    [
      "a blocked production hostname",
      [
        validUrl.replace("api-dev.goodcms.cn", "api.goodcms.cn"),
        devProjectRef,
        "api.goodcms.cn",
        devProjectRef,
        "api.goodcms.cn 1.13.20.39",
        productionProjectRef,
      ],
    ],
    ["a mismatched actual project ref", [validUrl, "aaaaaaaaaaaaaaaaaaaa", ...validArgs.slice(2)]],
    [
      "an actual blocked project ref",
      [
        validUrl,
        productionProjectRef,
        "api-dev.goodcms.cn",
        productionProjectRef,
        validArgs[4],
        productionProjectRef,
      ],
    ],
    [
      "a blocked project ref embedded in the raw URL",
      [
        validUrl.replace("postgres?", `postgres/${productionProjectRef}?`),
        ...validArgs.slice(1),
      ],
    ],
    ["an empty expected hostname", [validUrl, devProjectRef, "", devProjectRef]],
    ["an expected hostname with a port", [validUrl, devProjectRef, "api-dev.goodcms.cn:5432", devProjectRef]],
    ["an expected hostname with a path", [validUrl, devProjectRef, "api-dev.goodcms.cn/postgres", devProjectRef]],
    ["an empty expected project ref", [validUrl, devProjectRef, "api-dev.goodcms.cn", ""]],
    ["an invalid actual project ref", [validUrl, "short", ...validArgs.slice(2)]],
    ["an uppercase expected project ref", [validUrl, devProjectRef, "api-dev.goodcms.cn", devProjectRef.toUpperCase()]],
  ])("rejects %s without disclosing database credentials", (_case, args) => {
    const result = validate(args);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("development database target rejected\n");
    expect(result.stderr).not.toContain(validUrl);
    expect(result.stderr).not.toContain("dev_user");
    expect(result.stderr).not.toContain("dev_password");
  });

  test.each([
    { args: [] },
    { args: [validUrl] },
    { args: [validUrl, devProjectRef, "api-dev.goodcms.cn"] },
    { args: [...validArgs, "unexpected"] },
  ])("rejects an invalid argument count %#", ({ args }) => {
    const result = validate(args);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("development database target rejected\n");
  });

  test.each([
    {
      name: "matching configured, direct, and database username refs",
      env: {
        SUPABASE_PROJECT_REF: devProjectRef,
        SUPABASE_DB_DIRECT_URL: directUrl(devProjectRef),
        SUPABASE_DB_URL: databaseUrl(`postgres.${devProjectRef}`),
      },
    },
    {
      name: "matching direct and database username refs without a configured ref",
      env: {
        SUPABASE_DB_DIRECT_URL: directUrl(devProjectRef),
        SUPABASE_DB_URL: databaseUrl(`postgres.${devProjectRef}`),
      },
    },
    {
      name: "matching configured and database username refs without a direct URL",
      env: {
        SUPABASE_PROJECT_REF: devProjectRef,
        SUPABASE_DB_URL: databaseUrl(`postgres.${devProjectRef}`),
      },
    },
    {
      name: "a direct database ref with a generic database username",
      env: {
        SUPABASE_DB_DIRECT_URL: directUrl(devProjectRef),
        SUPABASE_DB_URL: databaseUrl("dev_user"),
      },
    },
  ])("resolves $name", ({ env }) => {
    const result = resolveProjectRef(env);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(devProjectRef);
    expect(result.stderr).toBe("");
  });

  test.each([
    {
      name: "a configured ref as the only ref source",
      env: {
        SUPABASE_PROJECT_REF: devProjectRef,
        SUPABASE_DB_URL: databaseUrl("dev_user"),
      },
    },
    {
      name: "a configured and direct ref conflict",
      env: {
        SUPABASE_PROJECT_REF: devProjectRef,
        SUPABASE_DB_DIRECT_URL: directUrl(otherProjectRef),
        SUPABASE_DB_URL: databaseUrl("dev_user"),
      },
    },
    {
      name: "a direct and database username ref conflict",
      env: {
        SUPABASE_DB_DIRECT_URL: directUrl(devProjectRef),
        SUPABASE_DB_URL: databaseUrl(`postgres.${otherProjectRef}`),
      },
    },
    {
      name: "a percent-decoded blocked database username ref conflict",
      env: {
        SUPABASE_PROJECT_REF: devProjectRef,
        SUPABASE_DB_URL: databaseUrl(`postgres%2E${productionProjectRef}`),
      },
    },
    {
      name: "a malformed direct URL",
      env: {
        SUPABASE_DB_DIRECT_URL: "not-a-url",
        SUPABASE_DB_URL: databaseUrl(`postgres.${devProjectRef}`),
      },
    },
    {
      name: "a direct URL with a non-Supabase hostname",
      env: {
        SUPABASE_DB_DIRECT_URL: validUrl,
        SUPABASE_DB_URL: databaseUrl(`postgres.${devProjectRef}`),
      },
    },
    {
      name: "a direct URL with a non-Postgres protocol",
      env: {
        SUPABASE_DB_DIRECT_URL: directUrl(devProjectRef, "https"),
        SUPABASE_DB_URL: databaseUrl(`postgres.${devProjectRef}`),
      },
    },
    {
      name: "an invalid database URL",
      env: {
        SUPABASE_DB_DIRECT_URL: directUrl(devProjectRef),
        SUPABASE_DB_URL: "not-a-url",
      },
    },
    {
      name: "an invalid postgres-prefixed database username",
      env: {
        SUPABASE_DB_DIRECT_URL: directUrl(devProjectRef),
        SUPABASE_DB_URL: databaseUrl("postgres.short"),
      },
    },
  ])("rejects $name without disclosing resolver inputs", ({ env }) => {
    expectSafeResolverRejection(resolveProjectRef(env));
  });

  test("does not execute the CLI when imported", () => {
    const scriptUrl = new URL(
      "../../../scripts/validate-dev-database-target.mjs",
      import.meta.url,
    );
    const result = spawnSync(
      "node",
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(scriptUrl.href)})`,
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});
