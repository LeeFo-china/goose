import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const verificationFileName = "jLSkeG7x43.txt";
const expectedToken = Buffer.from("6925d140a8ba805235b2f820b5d4f55d");

function readRequiredFile(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url) : Buffer.alloc(0);
}

describe("WeChat WebView domain verification", () => {
  test("keeps the exact verification token in both public source trees", () => {
    const h5Artifact = readRequiredFile(`../apps/h5/${verificationFileName}`);
    const webArtifact = readRequiredFile(
      `../apps/web/public/${verificationFileName}`,
    );

    expect(h5Artifact).toEqual(expectedToken);
    expect(webArtifact).toEqual(expectedToken);
  });

  test("copies and deploys the production H5 verification artifact", () => {
    const buildScript = readRequiredFile("../apps/h5/scripts/build.mjs").toString();
    const deployWorkflow = readRequiredFile(
      "../.github/workflows/deploy.yml",
    ).toString();

    expect(buildScript).toContain(
      'resolve(root, "jLSkeG7x43.txt"),\n  resolve(dist, "jLSkeG7x43.txt"),',
    );
    expect(deployWorkflow).toContain(
      'install -m 0644 "$H5_DIST_DIR/jLSkeG7x43.txt" "$H5_TARGET_DIR/jLSkeG7x43.txt"',
    );
  });
});
