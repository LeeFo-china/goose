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
});
