import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import ts from "typescript";

const SRC_ROOT = fileURLToPath(new URL("../", import.meta.url));

const AUDITED_NO_OPTION_CALLS = [
  ["controllers/billing/index.ts", "getPlatformSummary", "platform billing"],
  ["controllers/billing/index.ts", "listPlatformTenants", "platform billing"],
  ["controllers/billing/index.ts", "manualRecharge", "platform billing"],
  ["controllers/billing/index.ts", "listPlatformLedger", "platform billing"],
  ["controllers/billing/index.ts", "listPlatformBillingEvents", "platform billing"],
  ["controllers/billing/index.ts", "getPlatformAiUsageStats", "platform billing"],
  ["controllers/billing/index.ts", "getPlatformAiUsageFilterOptions", "platform billing"],
  ["controllers/billing/index.ts", "runShadowBilling", "platform billing"],
  ["controllers/billing/index.ts", "listPricingRules", "platform billing"],
  ["controllers/billing/index.ts", "createPricingRule", "platform billing"],
  ["controllers/billing/index.ts", "updatePricingRule", "platform billing"],
  ["controllers/social-video/index.ts", "listPlatformScripts", "platform usage"],
  ["controllers/usage/index.ts", "listPlatformTenantUsage", "platform usage"],
  ["controllers/usage/index.ts", "getPlatformOverview", "platform usage"],
  ["controllers/usage/index.ts", "listPlatformAiLogs", "platform usage"],
  ["controllers/usage/index.ts", "listPlatformSmsLogs", "platform usage"],
  ["controllers/usage/index.ts", "listPlatformSocialVideoLogs", "platform usage"],
  [
    "controllers/uploads/platform-service-fulfillment-upload-access.ts",
    "assertPlatformServiceFulfillmentUploadSceneAccess",
    "platform-only upload scene",
  ],
  [
    "controllers/uploads/supplier-license-upload-access.ts",
    "assertSupplierLicenseUploadSceneAccess",
    "platform-only upload scene",
  ],
  [
    "controllers/uploads/virtual-goods-upload-access.ts",
    "assertVirtualGoodsUploadSceneAccess",
    "platform-only upload scene",
  ],
] as const;

describe("tenant service authorization call boundary", () => {
  test("requires explicit route options outside exact platform-only callers", () => {
    const actual = productionTypeScriptFiles(SRC_ROOT)
      .flatMap(findNoOptionCalls)
      .sort(compareCall);
    const expected = AUDITED_NO_OPTION_CALLS
      .map(([path, owner]) => ({ path, owner }))
      .sort(compareCall);

    expect(actual).toEqual(expected);
  });

  test("does not let PlatformBase subclasses call its raw auth-context helper", () => {
    const actual = productionTypeScriptFiles(SRC_ROOT)
      .flatMap(findPlatformBaseSubclassRawCalls)
      .sort(compareCall);

    expect(actual).toEqual([]);
  });

  test("keeps the PlatformBase raw auth-context helper private", () => {
    const path = resolve(SRC_ROOT, "controllers/PlatformBaseController.ts");
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const rawHelper = source.statements
      .filter(ts.isClassDeclaration)
      .flatMap((node) => [...node.members])
      .find((member) =>
        ts.isMethodDeclaration(member) &&
        member.name.getText() === "getRequiredAuthContext"
      );

    expect(rawHelper && ts.canHaveModifiers(rawHelper)
      ? ts.getModifiers(rawHelper)?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword,
      )
      : false).toBe(true);
  });

  test("guards employee decoration suggestions before cache fast paths", () => {
    const source = readFileSync(
      resolve(SRC_ROOT, "services/decoration-qa/legacy/suggestions.ts"),
      "utf8",
    );
    const functionStart = source.indexOf(
      "export async function getDecorationQaSuggestions",
    );
    const body = source.slice(functionStart);
    const guard = body.indexOf(
      "authorizationService.getRequiredAuthContext",
    );
    const memoryCache = body.indexOf("getMemoryCachedSuggestion");

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(memoryCache);
  });
});

type AuthCall = { path: string; owner: string };

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
      return [];
    }
    return [path];
  });
}

function findNoOptionCalls(path: string): AuthCall[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const calls: AuthCall[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "getRequiredAuthContext" &&
      isAuthorizationServiceReceiver(node.expression.expression) &&
      node.arguments.length < 2
    ) {
      calls.push({
        path: relative(SRC_ROOT, path),
        owner: findOwner(node),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return calls.filter((call) => !(
    call.path === "controllers/PlatformBaseController.ts" &&
    call.owner === "getRequiredAuthContext"
  ));
}

function findPlatformBaseSubclassRawCalls(path: string): AuthCall[] {
  if (path.endsWith("/controllers/PlatformBaseController.ts")) return [];

  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const calls: AuthCall[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isClassDeclaration(node) &&
      node.heritageClauses?.some((clause) =>
        clause.token === ts.SyntaxKind.ExtendsKeyword &&
        clause.types.some((type) => type.expression.getText() === "PlatformBaseController")
      )
    ) {
      for (const member of node.members) {
        member.forEachChild(function inspect(descendant) {
          if (
            ts.isCallExpression(descendant) &&
            ts.isPropertyAccessExpression(descendant.expression) &&
            descendant.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
            descendant.expression.name.text === "getRequiredAuthContext"
          ) {
            calls.push({ path: relative(SRC_ROOT, path), owner: findOwner(descendant) });
          }
          descendant.forEachChild(inspect);
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return calls;
}

function isAuthorizationServiceReceiver(node: ts.Expression) {
  return (
    ts.isIdentifier(node) && node.text === "authorizationService"
  ) || (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "authorizationService"
  );
}

function findOwner(node: ts.Node): string {
  for (let current = node.parent; current; current = current.parent) {
    if (
      (ts.isMethodDeclaration(current) ||
        ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current)) &&
      current.name
    ) {
      return current.name.getText();
    }
  }
  return "<anonymous>";
}

function compareCall(left: AuthCall, right: AuthCall) {
  return `${left.path}#${left.owner}`.localeCompare(
    `${right.path}#${right.owner}`,
  );
}
