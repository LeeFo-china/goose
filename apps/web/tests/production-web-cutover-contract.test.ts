import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const repoFile = (path: string) => new URL(path, repositoryRoot);
const readRepoFile = (path: string) => readFileSync(repoFile(path), "utf8");

function extractBalancedBlocks(content: string, headerPattern: RegExp): string[] {
  const pattern = new RegExp(
    headerPattern.source,
    headerPattern.flags.includes("g")
      ? headerPattern.flags
      : `${headerPattern.flags}g`,
  );
  const blocks: string[] = [];

  for (const match of content.matchAll(pattern)) {
    const blockStart = match.index;
    const openingBrace = content.indexOf("{", blockStart);
    if (openingBrace < 0 || openingBrace >= blockStart + match[0].length) {
      throw new Error(`Block header has no opening brace: ${match[0]}`);
    }

    let depth = 0;
    let quote: "'" | '"' | null = null;
    let escaped = false;
    let inComment = false;
    let blockEnd = -1;

    for (let index = openingBrace; index < content.length; index += 1) {
      const character = content[index];

      if (inComment) {
        if (character === "\n") {
          inComment = false;
        }
        continue;
      }
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === "#") {
        inComment = true;
      } else if (character === "'" || character === '"') {
        quote = character;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          blockEnd = index + 1;
          break;
        }
      }
    }

    if (blockEnd < 0) {
      throw new Error(`Unbalanced block: ${match[0]}`);
    }
    blocks.push(content.slice(blockStart, blockEnd));
  }

  return blocks;
}

function validatesNginxIngress(content: string): boolean {
  try {
    const servers = extractBalancedBlocks(
      content,
      /^[ \t]*server[ \t]*\{/gm,
    );
    const webServers = servers.filter((server) =>
      hasActiveShellLine(server, "server_name www.goodcms.cn;"),
    );
    const adminServers = servers.filter((server) =>
      hasActiveShellLine(server, "server_name admin.goodcms.cn;"),
    );
    if (webServers.length !== 1 || adminServers.length !== 1) {
      return false;
    }

    const webServer = webServers[0];
    const adminServer = adminServers[0];
    const webCertificateDirectives = [
      "ssl_certificate /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem;",
      "ssl_certificate_key /etc/letsencrypt/live/www.goodcms.cn/privkey.pem;",
      "ssl_trusted_certificate /etc/letsencrypt/live/www.goodcms.cn/chain.pem;",
    ];
    const adminCertificateDirectives = [
      "ssl_certificate /etc/letsencrypt/live/admin.goodcms.cn/fullchain.pem;",
      "ssl_certificate_key /etc/letsencrypt/live/admin.goodcms.cn/privkey.pem;",
      "ssl_trusted_certificate /etc/letsencrypt/live/admin.goodcms.cn/chain.pem;",
    ];
    if (
      !webCertificateDirectives.every((directive) =>
        hasActiveShellLine(webServer, directive),
      ) ||
      !adminCertificateDirectives.every((directive) =>
        hasActiveShellLine(adminServer, directive),
      ) ||
      webServer.includes("/live/admin.goodcms.cn/") ||
      adminServer.includes("/live/www.goodcms.cn/")
    ) {
      return false;
    }

    const exactPartnerLocations = extractBalancedBlocks(
      adminServer,
      /^[ \t]*location[ \t]+=[ \t]+\/partners[ \t]*\{/gm,
    );
    if (exactPartnerLocations.length !== 1) {
      return false;
    }
    const redirect =
      "return 301 https://www.goodcms.cn/partners$is_args$args;";
    const exactPartnerLocation = exactPartnerLocations[0];
    const adminOutsideExactLocation = adminServer.replace(
      exactPartnerLocation,
      "",
    );
    const webLines = activeShellLines(webServer);
    const adminLines = activeShellLines(adminServer);

    return (
      hasActiveShellLine(exactPartnerLocation, redirect) &&
      !hasActiveShellLine(adminOutsideExactLocation, redirect) &&
      !/location\s+\^?~?\s+\/partners\/?\s*\{/.test(adminServer) &&
      webLines.filter(
        (line) => line === "set $gooes_web_upstream http://gooes-web:3020;",
      ).length === 2 &&
      webLines.filter(
        (line) => line === "proxy_pass $gooes_web_upstream;",
      ).length === 2 &&
      !webServer.includes("gooes-admin:3010") &&
      adminLines.filter(
        (line) => line === "set $gooes_admin_upstream http://gooes-admin:3010;",
      ).length === 1 &&
      adminLines.filter(
        (line) => line === "proxy_pass $gooes_admin_upstream;",
      ).length === 1 &&
      !adminServer.includes("gooes-web:3020")
    );
  } catch {
    return false;
  }
}

function activeShellLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function hasActiveShellLine(content: string, expectedLine: string): boolean {
  return activeShellLines(content).includes(expectedLine);
}

function sliceRunbookSection(
  runbook: string,
  heading: string,
  nextHeading: string,
): string {
  const start = runbook.indexOf(heading);
  const end = runbook.indexOf(nextHeading, start + heading.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return runbook.slice(start, end);
}

function extractBashFencedBlocks(content: string): string[] {
  return [...content.matchAll(/```bash\r?\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
}

function validatesExecutableCertificatePreflight(section: string): boolean {
  const lines = activeShellLines(section);
  const orderedLines = [
    "PREPUBLISHED_HOST_TEMPLATE_SHA256=cdc0647c1ea045b8c15c3c555f3865bd9c2fbe2bf362b27b88f9ddefa84059c9",
    "printf '%s  %s\\n' \"${PREPUBLISHED_HOST_TEMPLATE_SHA256}\" \"${HOST_TEMPLATE_PATH}\" | sudo sha256sum -c -",
    "DNS_A_RECORDS=\"$(dig +short A www.goodcms.cn | sort -u)\"",
    'test "${DNS_A_RECORDS}" = 1.13.20.39',
    "DNS_AAAA_RECORDS=\"$(dig +short AAAA www.goodcms.cn | sort -u)\"",
    'test -z "${DNS_AAAA_RECORDS}"',
    "docker exec supabase-nginx sh -eu -c 'for path in /etc/letsencrypt/renewal/www.goodcms.cn*.conf /etc/letsencrypt/live/www.goodcms.cn* /etc/letsencrypt/archive/www.goodcms.cn*; do test ! -e \"$path\"; done'",
    'docker exec supabase-nginx test -d "${ACME_WEBROOT}/.well-known/acme-challenge"',
    "ACME_PROBE_STATUS=\"$(curl --show-error --silent --proto '=http' --connect-timeout 5 --max-time 30 \\",
    'test "${ACME_PROBE_STATUS}" = 200',
    'test "$(cat "${ACME_PROBE_DIR}/body")" = "${ACME_PROBE_BODY}"',
    "docker exec supabase-nginx certbot certonly \\",
    "docker exec supabase-nginx test -s /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem",
    "docker exec supabase-nginx openssl x509 -in /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem -noout -ext subjectAltName | grep -Fq 'DNS:www.goodcms.cn'",
    "docker exec supabase-nginx openssl x509 -in /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem -noout -checkhost www.goodcms.cn",
    "docker exec supabase-nginx openssl x509 -in /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem -noout -checkend 2592000",
    "docker exec supabase-nginx openssl x509 -in /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem -noout -enddate",
  ];
  const requiredLines = [
    "command -v dig >/dev/null",
    "ACME_WEBROOT=/var/www/letsencrypt",
    "--server https://acme-v02.api.letsencrypt.org/directory \\",
    "--webroot --webroot-path /var/www/letsencrypt \\",
    "--preferred-challenges http \\",
    "--key-type ecdsa --elliptic-curve secp256r1 \\",
    "--cert-name www.goodcms.cn \\",
    "--domain www.goodcms.cn \\",
    "--non-interactive --agree-tos \\",
    '[[ "${ACME_ACCOUNT_EMAIL}" =~ ^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$ ]]',
    "--email \"${ACME_ACCOUNT_EMAIL}\"",
    "docker exec supabase-nginx test -s /etc/letsencrypt/live/www.goodcms.cn/privkey.pem",
  ];
  if (!requiredLines.every((line) => lines.includes(line))) {
    return false;
  }

  let previousIndex = -1;
  for (const line of orderedLines) {
    const index = lines.indexOf(line);
    if (index <= previousIndex) {
      return false;
    }
    previousIndex = index;
  }
  return true;
}

function validatesRollbackConcurrencyGuard(runbook: string): boolean {
  const installSection = sliceRunbookSection(
    runbook,
    "## 7. 安装、渲染、校验与 reload",
    "## 8. 安装隔离的证书续期 units",
  );
  const rollbackSection = sliceRunbookSection(
    runbook,
    "## 10. P0/P1 与 Nginx 回滚",
    "## 11. 旧 Admin 公开入口删除门",
  );
  const installScript = extractBashFencedBlocks(installSection)[0];
  const rollbackScript = extractBashFencedBlocks(rollbackSection)[0];
  if (!installScript || !rollbackScript) {
    return false;
  }
  const installLines = activeShellLines(installScript);
  const rollbackLines = activeShellLines(rollbackScript);
  const installedHostRecord =
    'INSTALLED_HOST_TEMPLATE_SHA256="$(sudo sha256sum "${HOST_TEMPLATE_PATH}" | awk \'{print $1}\')"';
  const installedEffectiveRecord =
    'INSTALLED_EFFECTIVE_SHA256="$(docker exec supabase-nginx sha256sum "${EFFECTIVE_PATH}" | awk \'{print $1}\')"';
  const installedHostCheck =
    "printf '%s  %s\\n' \"${INSTALLED_HOST_TEMPLATE_SHA256}\" \"${HOST_TEMPLATE_PATH}\" | sudo sha256sum -c -";
  const installedEffectiveCheckStart =
    "docker exec supabase-nginx sh -eu -c \\";
  const installedEffectiveCheckCommand =
    '"printf \'%s  %s\\\\n\' \'${INSTALLED_EFFECTIVE_SHA256}\' \'${EFFECTIVE_PATH}\' | sha256sum -c -"';
  const expectedGuardedRollbackPrefix = [
    "set -euo pipefail",
    "HOST_TEMPLATE_PATH=/opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl",
    "MOUNTED_TEMPLATE_PATH=/etc/nginx/supabase-nginx.conf.tpl",
    "HOST_TEMPLATE_BACKUP_PATH='<从第 4 节发布记录复制>'",
    "EFFECTIVE_PATH=/etc/nginx/user_conf.d/nginx.conf",
    "EFFECTIVE_BACKUP_PATH='<从第 4 节发布记录复制>'",
    "EXPECTED_BACKUP_SHA256='<从第 4 节发布记录复制 64 位 SHA-256>'",
    "EFFECTIVE_BACKUP_SHA256='<从第 4 节发布记录复制 64 位 SHA-256>'",
    "INSTALLED_HOST_TEMPLATE_SHA256='<从第 7 节发布记录复制 64 位 SHA-256>'",
    "INSTALLED_EFFECTIVE_SHA256='<从第 7 节发布记录复制 64 位 SHA-256>'",
    "printf '%s  %s\\n' \"${EXPECTED_BACKUP_SHA256}\" \"${HOST_TEMPLATE_BACKUP_PATH}\" | sudo sha256sum -c -",
    installedEffectiveCheckStart,
    '"printf \'%s  %s\\\\n\' \'${EFFECTIVE_BACKUP_SHA256}\' \'${EFFECTIVE_BACKUP_PATH}\' | sha256sum -c -"',
    installedHostCheck,
    installedEffectiveCheckStart,
    installedEffectiveCheckCommand,
  ];
  const firstInstallFi = installLines.lastIndexOf("fi");
  const installedHostRecordIndex = installLines.indexOf(installedHostRecord);
  const installedEffectiveRecordIndex = installLines.indexOf(
    installedEffectiveRecord,
  );
  if (
    installedHostRecordIndex <= firstInstallFi ||
    installedEffectiveRecordIndex <= installedHostRecordIndex
  ) {
    return false;
  }

  const hostCheckIndex = rollbackLines.indexOf(installedHostCheck);
  const effectiveCheckCommandIndex = rollbackLines.indexOf(
    installedEffectiveCheckCommand,
  );
  const effectiveCheckStartIndex = effectiveCheckCommandIndex - 1;
  const firstRollbackWriteIndex = rollbackLines.findIndex((line) =>
    line.startsWith('sudo tee "${HOST_TEMPLATE_PATH}"'),
  );
  const hasExactGuardedRollbackPrefix = expectedGuardedRollbackPrefix.every(
    (line, index) => rollbackLines[index] === line,
  );

  return (
    rollbackLines.includes(
      "INSTALLED_HOST_TEMPLATE_SHA256='<从第 7 节发布记录复制 64 位 SHA-256>'",
    ) &&
    rollbackLines.includes(
      "INSTALLED_EFFECTIVE_SHA256='<从第 7 节发布记录复制 64 位 SHA-256>'",
    ) &&
    hostCheckIndex >= 0 &&
    effectiveCheckStartIndex > hostCheckIndex &&
    rollbackLines[effectiveCheckStartIndex] === installedEffectiveCheckStart &&
    hasExactGuardedRollbackPrefix &&
    firstRollbackWriteIndex === expectedGuardedRollbackPrefix.length
  );
}

function validatesStrictProductionSmoke(section: string): boolean {
  const lines = activeShellLines(section);
  const requiredLines = [
    "RELEASE_CANDIDATE_SHA='<从发布记录复制 40 位发布候选 Git SHA>'",
    "EXPECTED_WEB_REVISION='<从发布记录复制 Web revision>'",
    '[[ "${RELEASE_CANDIDATE_SHA}" =~ ^[0-9a-f]{40}$ ]]',
    '[[ "${EXPECTED_WEB_REVISION}" =~ ^[0-9a-f]{40}$ ]]',
    'test "${EXPECTED_WEB_REVISION}" = "${RELEASE_CANDIDATE_SHA}"',
    "get_https web-home https://www.goodcms.cn/",
    'read -r HOME_STATUS HOME_ELAPSED < "${SMOKE_DIR}/web-home.metrics"',
    'test "$(read_header web-home x-gooes-service)" = web',
    'test "$(read_header web-home x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"',
    'test "$(read_header web-partners x-gooes-service)" = web',
    'test "$(read_header web-partners x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"',
    "get_https sitemap https://www.goodcms.cn/sitemap.xml",
    'read -r SITEMAP_STATUS SITEMAP_ELAPSED < "${SMOKE_DIR}/sitemap.metrics"',
    'test "$(read_header sitemap x-gooes-service)" = web',
    'test "$(read_header sitemap x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"',
    'test "$(read_header web-content x-gooes-service)" = web',
    'test "$(read_header web-content x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"',
    'get_https web-static "https://www.goodcms.cn${STATIC_PATH}"',
    'read -r STATIC_STATUS STATIC_ELAPSED < "${SMOKE_DIR}/web-static.metrics"',
    'test "$(read_header web-static x-gooes-service)" = web',
    'test "$(read_header web-static x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"',
    'test "$(read_header web-static cache-control)" = "public, max-age=31536000, immutable"',
    "printf 'smoke name=%s status=%s elapsed_seconds=%s requestId=%s\\n' \\",
  ];
  const curlCommandLines = [
    "curl --fail --show-error --silent \\",
    "--proto '=https' --tlsv1.2 \\",
    "--connect-timeout 5 --max-time 30 \\",
    '--dump-header "${SMOKE_DIR}/${name}.headers" \\',
    '--output "${SMOKE_DIR}/${name}.body" \\',
    "--write-out '%{http_code} %{time_total}\\n' \\",
    '"${url}" > "${SMOKE_DIR}/${name}.metrics"',
  ];
  const curlCommandStart = lines.indexOf(curlCommandLines[0]);
  const hasContiguousFailClosedCurl = curlCommandLines.every(
    (line, index) => lines[curlCommandStart + index] === line,
  );

  return (
    requiredLines.every((line) => lines.includes(line)) &&
    curlCommandStart >= 0 &&
    hasContiguousFailClosedCurl
  );
}

describe("production official website cutover contracts", () => {
  test("keeps the legacy Admin partner surface until the observation gate closes", () => {
    expect(
      existsSync(repoFile("apps/admin/app/(site)/partners/page.tsx")),
    ).toBe(true);
    expect(
      existsSync(
        repoFile("apps/admin/components/official-site/partner-application-form.tsx"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        repoFile("apps/admin/app/api/public/partner-applications/route.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(repoFile("apps/admin/app/(console)/platform/partners/page.tsx")),
    ).toBe(true);
  });

  test("proxies www to Web and redirects only the exact Admin partner path", () => {
    const nginx = readRepoFile("deploy/nginx/gooes-web.conf");
    const servers = extractBalancedBlocks(
      nginx,
      /^[ \t]*server[ \t]*\{/gm,
    );
    const webServer = servers.find((server) =>
      hasActiveShellLine(server, "server_name www.goodcms.cn;"),
    );
    const adminServer = servers.find((server) =>
      hasActiveShellLine(server, "server_name admin.goodcms.cn;"),
    );

    expect(servers).toHaveLength(2);
    expect(webServer).toBeDefined();
    expect(adminServer).toBeDefined();
    expect(validatesNginxIngress(nginx)).toBe(true);
    expect(nginx).toContain(
      "must be merged into /opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl",
    );
    expect(nginx).toContain("uses the template's global Docker resolver");
    expect(nginx.match(/listen 443 ssl;/g)).toHaveLength(2);
    expect(nginx.match(/listen \[::\]:443 ssl;/g)).toHaveLength(2);
    expect(nginx.match(/http2 on;/g)).toHaveLength(2);
    expect(nginx).toContain("server_name www.goodcms.cn;");
    expect(nginx).toContain(
      "ssl_certificate /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem;",
    );
    expect(nginx).toContain(
      "ssl_certificate_key /etc/letsencrypt/live/www.goodcms.cn/privkey.pem;",
    );
    expect(nginx).toContain(
      "ssl_trusted_certificate /etc/letsencrypt/live/www.goodcms.cn/chain.pem;",
    );
    expect(nginx).toContain(
      "ssl_dhparam /etc/letsencrypt/dhparams/dhparam.pem;",
    );
    expect(nginx).toContain("location ^~ /_next/static/ {");
    expect(
      nginx.match(/set \$gooes_web_upstream http:\/\/gooes-web:3020;/g),
    ).toHaveLength(2);
    expect(nginx.match(/proxy_pass \$gooes_web_upstream;/g)).toHaveLength(2);
    expect(nginx).toContain('Cache-Control "public, max-age=31536000, immutable"');
    expect(nginx).toContain("proxy_set_header Host $host;");
    expect(nginx).toContain("proxy_set_header X-Real-IP $remote_addr;");
    expect(nginx).toContain(
      "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    );
    expect(nginx).toContain("proxy_set_header X-Forwarded-Proto $scheme;");
    expect(nginx).toContain("server_name admin.goodcms.cn;");
    expect(nginx).toContain(
      "ssl_certificate /etc/letsencrypt/live/admin.goodcms.cn/fullchain.pem;",
    );
    expect(nginx).toContain(
      "ssl_certificate_key /etc/letsencrypt/live/admin.goodcms.cn/privkey.pem;",
    );
    expect(nginx).toContain(
      "ssl_trusted_certificate /etc/letsencrypt/live/admin.goodcms.cn/chain.pem;",
    );
    expect(nginx).toContain(
      "set $gooes_admin_upstream http://gooes-admin:3010;",
    );
    expect(nginx).toContain("proxy_pass $gooes_admin_upstream;");
    expect(nginx).toContain("location = /partners {");
    expect(nginx).toContain(
      "return 301 https://www.goodcms.cn/partners$is_args$args;",
    );
    expect(nginx).not.toMatch(/location\s+\^?~?\s+\/partners\/?\s*\{/);
    expect(nginx).not.toMatch(
      /return\s+301\s+https:\/\/www\.goodcms\.cn\/(?:login|platform\/partners)/,
    );
    expect(nginx).not.toContain("127.0.0.1:3020");
    expect(nginx).not.toContain("127.0.0.1:3010");
    expect(webServer).toContain("server_name www.goodcms.cn;");
    expect(webServer).toContain("proxy_pass $gooes_web_upstream;");
    expect(webServer).not.toContain("gooes-admin:3010");
    expect(adminServer).toContain("server_name admin.goodcms.cn;");
    expect(adminServer).toContain("proxy_pass $gooes_admin_upstream;");
    expect(adminServer).not.toContain("gooes-web:3020");
    expect(adminServer?.match(/return 301 /g)).toHaveLength(1);

    const swappedCertificates = nginx
      .replaceAll("/live/www.goodcms.cn/", "/live/swap-placeholder.goodcms.cn/")
      .replaceAll("/live/admin.goodcms.cn/", "/live/www.goodcms.cn/")
      .replaceAll(
        "/live/swap-placeholder.goodcms.cn/",
        "/live/admin.goodcms.cn/",
      );
    const serverLevelRedirect = nginx.replace(
      [
        "    location = /partners {",
        "        return 301 https://www.goodcms.cn/partners$is_args$args;",
        "    }",
      ].join("\n"),
      [
        "    location = /partners {",
        "    }",
        "",
        "    return 301 https://www.goodcms.cn/partners$is_args$args;",
      ].join("\n"),
    );
    const commentedRedirect = nginx.replace(
      "        return 301 https://www.goodcms.cn/partners$is_args$args;",
      "        # return 301 https://www.goodcms.cn/partners$is_args$args;",
    );
    const commentedWebUpstreams = nginx.replaceAll(
      "        set $gooes_web_upstream http://gooes-web:3020;",
      "        # set $gooes_web_upstream http://gooes-web:3020;",
    );

    expect(validatesNginxIngress(swappedCertificates)).toBe(false);
    expect(validatesNginxIngress(serverLevelRedirect)).toBe(false);
    expect(validatesNginxIngress(commentedRedirect)).toBe(false);
    expect(validatesNginxIngress(commentedWebUpstreams)).toBe(false);
    expect(validatesNginxIngress(nginx.replace(/}\s*$/, ""))).toBe(false);
  });

  test("schedules multi-certificate DNS-01 renewal through versioned systemd units", () => {
    const servicePath = "deploy/systemd/gooes-www-cert-renew.service";
    const timerPath = "deploy/systemd/gooes-www-cert-renew.timer";

    expect(existsSync(repoFile(servicePath))).toBe(true);
    expect(existsSync(repoFile(timerPath))).toBe(true);

    const service = readRepoFile(servicePath);
    const timer = readRepoFile(timerPath);

    expect(service).toBe(
      [
        "[Unit]",
        "Description=Renew GoodCMS DNS-01 certificates in Supabase Nginx",
        "Requires=docker.service",
        "After=docker.service",
        "",
        "[Service]",
        "Type=oneshot",
        "ExecStartPre=/opt/gooes/cert-renewal/gooes-www-cert-renew prepare",
        "ExecStart=/opt/gooes/cert-renewal/gooes-www-cert-renew renew",
        "ExecStopPost=/opt/gooes/cert-renewal/gooes-www-cert-renew cleanup",
        "TimeoutStartSec=15min",
        "",
      ].join("\n"),
    );
    expect(timer).toBe(
      [
        "[Unit]",
        "Description=Schedule GoodCMS DNS-01 certificate renewal",
        "",
        "[Timer]",
        "OnCalendar=*-*-* 00,12:00:00",
        "Persistent=true",
        "RandomizedDelaySec=1800",
        "Unit=gooes-www-cert-renew.service",
        "",
        "[Install]",
        "WantedBy=timers.target",
        "",
      ].join("\n"),
    );
    expect(service).toContain("Description=Renew GoodCMS DNS-01 certificates");
    expect(service).toContain("Requires=docker.service");
    expect(service).toContain("After=docker.service");
    expect(service).toContain("Type=oneshot");
    expect(service).toContain(
      "ExecStartPre=/opt/gooes/cert-renewal/gooes-www-cert-renew prepare",
    );
    expect(service).toContain(
      "ExecStart=/opt/gooes/cert-renewal/gooes-www-cert-renew renew",
    );
    expect(service).toContain(
      "ExecStopPost=/opt/gooes/cert-renewal/gooes-www-cert-renew cleanup",
    );
    expect(service).toContain("TimeoutStartSec=15min");
    expect(service).not.toMatch(/(?:password|token|secret|private[_-]?key)\s*=/i);

    expect(timer).toContain("OnCalendar=*-*-* 00,12:00:00");
    expect(timer).toContain("Persistent=true");
    expect(timer).toContain("RandomizedDelaySec=1800");
    expect(timer).toContain("Unit=gooes-www-cert-renew.service");
    expect(timer).toContain("WantedBy=timers.target");
  });

  test("deploys Web behind loopback smoke without mutating production Nginx", () => {
    const buildWorkflow = readRepoFile(
      ".github/workflows/build-docker-images.yml",
    );
    const deployWorkflow = readRepoFile(
      ".github/workflows/deploy-docker-services.yml",
    );

    expect(buildWorkflow).toContain("image-manifest-${SERVICE}.json");
    expect(buildWorkflow).not.toContain(
      "uses: ./.github/workflows/deploy-docker-services.yml",
    );
    expect(deployWorkflow).toContain("web_smoke_content_path:");
    expect(deployWorkflow).toContain("WEB_SMOKE_CONTENT_PATH");
    expect(deployWorkflow).toContain("http://127.0.0.1:3020/");
    expect(deployWorkflow).toContain('Host: www.goodcms.cn');
    expect(deployWorkflow).toContain('"http://127.0.0.1:3020${path}"');
    expect(deployWorkflow).toContain('smoke_url "/partners"');
    expect(deployWorkflow).toContain('smoke_url "/sitemap.xml"');
    expect(deployWorkflow).toContain('smoke_url "${WEB_SMOKE_CONTENT_PATH}"');
    expect(deployWorkflow).toContain("http://127.0.0.1:3020/api/preview");
    expect(deployWorkflow).toContain("--connect-timeout 5 --max-time 30");
    expect(deployWorkflow).toContain("tr -d '\\r'");
    const okStatusPattern = "^HTTP/[^ ]+ 200([[:space:]].*)?$";
    const redirectStatusPattern = "^HTTP/[^ ]+ 303([[:space:]].*)?$";
    expect(deployWorkflow).toContain(okStatusPattern);
    expect(deployWorkflow).toContain(redirectStatusPattern);
    expect(deployWorkflow).toContain("^location: /preview-error$");
    expect(deployWorkflow).toContain("^cache-control: no-store$");
    expect(deployWorkflow).toContain("timeout-minutes: 5");
    expect(
      deployWorkflow.match(/--connect-timeout 5 --max-time 30/g),
    ).toHaveLength(4);
    expect(deployWorkflow.split(okStatusPattern)).toHaveLength(3);
    expect(deployWorkflow.split(redirectStatusPattern)).toHaveLength(3);
    expect(deployWorkflow).not.toMatch(/(?:install|cp).*gooes-web\.conf/);
    expect(deployWorkflow).not.toMatch(/(?:systemctl\s+reload|nginx\s+-s)/);
  });

  test("verifies an automatic Web image rollback through loopback before cutover", () => {
    const deployWorkflow = readRepoFile(
      ".github/workflows/deploy-docker-services.yml",
    );
    const rollbackStart = deployWorkflow.indexOf("- name: Roll back production web");
    const rollbackEnd = deployWorkflow.indexOf(
      "- name: Clean up expired production web rollback tags",
    );
    const rollbackStep = deployWorkflow.slice(rollbackStart, rollbackEnd);

    expect(rollbackStart).toBeGreaterThanOrEqual(0);
    expect(rollbackEnd).toBeGreaterThan(rollbackStart);
    expect(rollbackStep).toContain("set -euo pipefail");
    expect(rollbackStep.indexOf("WEB_ROLLBACK_STATUS=rollback_failed")).toBeLessThan(
      rollbackStep.indexOf('smoke_rollback_url "/"'),
    );
    expect(rollbackStep).toContain('smoke_rollback_url "/"');
    expect(rollbackStep).toContain('smoke_rollback_url "/partners"');
    expect(rollbackStep).toContain('smoke_rollback_url "/sitemap.xml"');
    expect(rollbackStep).toContain(
      'smoke_rollback_url "${WEB_SMOKE_CONTENT_PATH}"',
    );
    expect(rollbackStep).toContain('Host: www.goodcms.cn');
    expect(rollbackStep).toContain("http://127.0.0.1:3020/api/preview");
    expect(rollbackStep).toContain("^x-gooes-revision: ${WEB_OLD_REVISION}");
    expect(rollbackStep).toContain(
      'test "${image_id}" = "${WEB_OLD_IMAGE_ID}"',
    );
    expect(rollbackStep).toContain(
      'test "${configured_image}" = "${WEB_ROLLBACK_TAG}"',
    );
    expect(rollbackStep).toContain("^HTTP/[^ ]+ 303([[:space:]].*)?$");
    expect(rollbackStep).toContain("^location: /preview-error$");
    expect(rollbackStep).toContain("^cache-control: no-store$");
    expect(rollbackStep).toContain("--connect-timeout 5 --max-time 30");
    expect(rollbackStep).toContain("tr -d '\\r'");
    expect(rollbackStep).toContain("^HTTP/[^ ]+ 200([[:space:]].*)?$");
    expect(rollbackStep).toContain("timeout-minutes: 10");
    expect(rollbackStep).not.toContain("https://www.goodcms.cn/partners");
    expect(rollbackStep.indexOf("WEB_ROLLBACK_STATUS=success")).toBeGreaterThan(
      rollbackStep.indexOf("^cache-control: no-store$"),
    );
  });

  test("validates a bounded Domain-compatible published content slug", () => {
    const buildWorkflow = readRepoFile(
      ".github/workflows/build-docker-images.yml",
    );
    const deployWorkflow = readRepoFile(
      ".github/workflows/deploy-docker-services.yml",
    );
    const validator = repoFile("scripts/validate-web-smoke-content-path.mjs").pathname;

    expect(buildWorkflow).not.toContain("validate-web-smoke-content-path.mjs");
    expect(deployWorkflow).toContain("validate-web-smoke-content-path.mjs");
    expect(
      Bun.spawnSync(["node", validator, "/articles/valid-slug"]).exitCode,
    ).toBe(0);
    expect(
      Bun.spawnSync(["node", validator, `/articles/${"a".repeat(200)}`]).exitCode,
    ).toBe(0);
    expect(
      Bun.spawnSync(["node", validator, "/articles/invalid--slug"]).exitCode,
    ).toBe(1);
    expect(
      Bun.spawnSync(["node", validator, `/articles/${"a".repeat(201)}`]).exitCode,
    ).toBe(1);
  });

  test("documents a manual, reversible cutover with an observation gate", () => {
    const runbook = readRepoFile(
      "docs/operations/official-website-production-cutover-runbook.md",
    );

    for (const requiredText of [
      "Admin 镜像",
      "Web 镜像",
      "Nginx 配置 SHA-256",
      "DNS TTL",
      "Sitemap URL 数量",
      "supabase-nginx",
      "jonasal/nginx-certbot:6.0.1-nginx1.29.5",
      "/opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl",
      "/etc/nginx/supabase-nginx.conf.tpl",
      "/etc/nginx/user_conf.d/nginx.conf",
      "envsubst '${PROXY_DOMAIN}'",
      "/var/lib/docker/volumes/supabase_nginx_letsencrypt/_data",
      "/etc/letsencrypt",
      "/var/www/letsencrypt",
      "gooes-web:3020",
      "gooes-admin:3010",
      "全局 Docker resolver",
      "先签发 `www.goodcms.cn` 证书",
      "未改动 server block",
      "nginx -t",
      "gooes-www-cert-renew.service",
      "gooes-www-cert-renew.timer",
      "systemd-analyze verify",
      "--no-directory-hooks",
      "/etc/letsencrypt/renewal-hooks/{pre,deploy,post}",
      "30 分钟",
      "0、5、10、15、20、25、30",
      "P0",
      "P1",
      "不回滚 CMS",
      "至少一个完整发布周期",
      "apps/admin/app/(site)/partners/page.tsx",
      "set -euo pipefail",
      "HOST_TEMPLATE_BACKUP_PATH",
      "EFFECTIVE_BACKUP_PATH",
      "EXPECTED_BACKUP_SHA256",
      "sha256sum -c",
      "docker exec supabase-nginx nginx -t",
      "docker exec supabase-nginx nginx -s reload",
    ]) {
      expect(runbook).toContain(requiredText);
    }

    expect(runbook).not.toContain("/etc/nginx/sites-enabled/reverse-proxy");
    expect(runbook).not.toContain("systemctl reload nginx");
  });

  test("uses an executable fail-closed certificate issuance preflight", () => {
    const runbook = readRepoFile(
      "docs/operations/official-website-production-cutover-runbook.md",
    );
    const certificateSection = sliceRunbookSection(
      runbook,
      "## 5. 先签发证书，再加入 TLS block",
      "## 6. 从完整实时模板生成候选",
    );
    const hostTemplateCheck =
      "printf '%s  %s\\n' \"${PREPUBLISHED_HOST_TEMPLATE_SHA256}\" \"${HOST_TEMPLATE_PATH}\" | sudo sha256sum -c -";
    const dnsCheck = 'test "${DNS_A_RECORDS}" = 1.13.20.39';
    const lineageCheck =
      "docker exec supabase-nginx sh -eu -c 'for path in /etc/letsencrypt/renewal/www.goodcms.cn*.conf /etc/letsencrypt/live/www.goodcms.cn* /etc/letsencrypt/archive/www.goodcms.cn*; do test ! -e \"$path\"; done'";
    const productionServer =
      "--server https://acme-v02.api.letsencrypt.org/directory \\";

    expect(validatesExecutableCertificatePreflight(certificateSection)).toBe(
      true,
    );
    expect(
      validatesExecutableCertificatePreflight(
        certificateSection.replace(hostTemplateCheck, `# ${hostTemplateCheck}`),
      ),
    ).toBe(false);
    expect(
      validatesExecutableCertificatePreflight(
        certificateSection
          .replace(dnsCheck, "")
          .replace(
            "docker exec supabase-nginx certbot certonly \\",
            `docker exec supabase-nginx certbot certonly \\\n${dnsCheck}`,
          ),
      ),
    ).toBe(false);
    expect(
      validatesExecutableCertificatePreflight(
        certificateSection.replace(lineageCheck, ""),
      ),
    ).toBe(false);
    expect(
      validatesExecutableCertificatePreflight(
        certificateSection.replace(productionServer, `# ${productionServer}`),
      ),
    ).toBe(false);
    expect(
      validatesExecutableCertificatePreflight(
        certificateSection.replace("-noout -checkhost www.goodcms.cn", ""),
      ),
    ).toBe(false);
  });

  test("preserves the live template inode and verifies the mounted candidate", () => {
    const runbook = readRepoFile(
      "docs/operations/official-website-production-cutover-runbook.md",
    );
    const installSection = runbook.slice(
      runbook.indexOf("## 7. 安装、渲染、校验与 reload"),
      runbook.indexOf("## 8. 安装隔离的证书续期 units"),
    );
    const liveSnapshotCheck =
      "printf '%s  %s\\n' \"${EXPECTED_BACKUP_SHA256}\" \"${HOST_TEMPLATE_PATH}\" | sudo sha256sum -c -";
    const candidateWrite =
      'sudo tee "${HOST_TEMPLATE_PATH}" < "${CANDIDATE_TEMPLATE_PATH}"';
    const validatesLiveSnapshotPrecondition = (content: string): boolean => {
      const guardedCandidateWrite =
        liveSnapshotCheck + "\n\nif " + candidateWrite;
      const guardedCandidateWriteStart = content.indexOf(guardedCandidateWrite);
      const isGuardLineAnchored =
        guardedCandidateWriteStart === 0 ||
        content[guardedCandidateWriteStart - 1] === "\n";
      const candidateWriteOffset = guardedCandidateWrite.indexOf(candidateWrite);
      const liveSnapshotCheckStart = content.indexOf(liveSnapshotCheck);
      const candidateWriteStart = content.indexOf(candidateWrite);

      return (
        guardedCandidateWriteStart >= 0 &&
        isGuardLineAnchored &&
        liveSnapshotCheckStart === guardedCandidateWriteStart &&
        candidateWriteStart ===
          guardedCandidateWriteStart + candidateWriteOffset
      );
    };

    expect(runbook).toContain(
      "MOUNTED_TEMPLATE_PATH=/etc/nginx/supabase-nginx.conf.tpl",
    );
    expect(
      runbook.match(
        /sudo tee "\$\{HOST_TEMPLATE_PATH\}" < "\$\{(?:CANDIDATE_TEMPLATE_PATH|HOST_TEMPLATE_BACKUP_PATH)\}"/g,
      ),
    ).toHaveLength(3);
    expect(runbook).toContain(
      "'${CANDIDATE_SHA256}' '${MOUNTED_TEMPLATE_PATH}' | sha256sum -c -",
    );
    expect(runbook).not.toMatch(
      /sudo install[^\n]*"\$\{HOST_TEMPLATE_PATH\}"[ \t]*\\?[ \t]*$/m,
    );
    expect(validatesLiveSnapshotPrecondition(installSection)).toBe(true);
    expect(
      validatesLiveSnapshotPrecondition(
        installSection.replaceAll(liveSnapshotCheck, ""),
      ),
    ).toBe(false);
    expect(
      validatesLiveSnapshotPrecondition(
        installSection
          .replace(liveSnapshotCheck, "")
          .replace(
            candidateWrite,
            candidateWrite + "\n" + liveSnapshotCheck,
          ),
      ),
    ).toBe(false);
    expect(
      validatesLiveSnapshotPrecondition(
        installSection.replace(
          liveSnapshotCheck,
          "true || " + liveSnapshotCheck,
        ),
      ),
    ).toBe(false);
  });

  test("records installed checksums and guards manual rollback from concurrent writes", () => {
    const runbook = readRepoFile(
      "docs/operations/official-website-production-cutover-runbook.md",
    );
    const installedHostCheck =
      "printf '%s  %s\\n' \"${INSTALLED_HOST_TEMPLATE_SHA256}\" \"${HOST_TEMPLATE_PATH}\" | sudo sha256sum -c -";
    const effectiveGuard = [
      "docker exec supabase-nginx sh -eu -c \\",
      '  "printf \'%s  %s\\\\n\' \'${INSTALLED_EFFECTIVE_SHA256}\' \'${EFFECTIVE_PATH}\' | sha256sum -c -"',
    ].join("\n");
    const rollbackWrite =
      'sudo tee "${HOST_TEMPLATE_PATH}" < "${HOST_TEMPLATE_BACKUP_PATH}" > /dev/null';

    expect(validatesRollbackConcurrencyGuard(runbook)).toBe(true);
    expect(
      validatesRollbackConcurrencyGuard(
        runbook.replace(installedHostCheck, `# ${installedHostCheck}`),
      ),
    ).toBe(false);
    expect(
      validatesRollbackConcurrencyGuard(
        runbook.replace(installedHostCheck, `true || ${installedHostCheck}`),
      ),
    ).toBe(false);
    expect(
      validatesRollbackConcurrencyGuard(
        runbook.replace(
          installedHostCheck,
          'docker exec supabase-nginx cp "${EFFECTIVE_BACKUP_PATH}" "${EFFECTIVE_PATH}"\n' +
            installedHostCheck,
        ),
      ),
    ).toBe(false);
    expect(
      validatesRollbackConcurrencyGuard(
        runbook.replace(
          installedHostCheck,
          "docker exec supabase-nginx sh -c 'cat \"$1\" > \"$2\"' sh \"${EFFECTIVE_BACKUP_PATH}\" \"${EFFECTIVE_PATH}\"\n" +
            installedHostCheck,
        ),
      ),
    ).toBe(false);
    expect(
      validatesRollbackConcurrencyGuard(
        runbook
          .replace(effectiveGuard, "")
          .replace(rollbackWrite, `${rollbackWrite}\n${effectiveGuard}`),
      ),
    ).toBe(false);
    expect(
      validatesRollbackConcurrencyGuard(
        runbook.replace(
          'INSTALLED_EFFECTIVE_SHA256="$(docker exec supabase-nginx sha256sum "${EFFECTIVE_PATH}" | awk \'{print $1}\')"',
          "",
        ),
      ),
    ).toBe(false);
  });

  test("uses executable strict HTTPS assertions for the production smoke", () => {
    const runbook = readRepoFile(
      "docs/operations/official-website-production-cutover-runbook.md",
    );
    const smokeSection = sliceRunbookSection(
      runbook,
      "## 9. 严格 HTTPS smoke 与 30 分钟观察",
      "## 10. P0/P1 与 Nginx 回滚",
    );
    const candidateAssignment =
      "RELEASE_CANDIDATE_SHA='<从发布记录复制 40 位发布候选 Git SHA>'";
    const expectedAssignment =
      "EXPECTED_WEB_REVISION='<从发布记录复制 Web revision>'";
    const revisionGuardLines = [
      candidateAssignment,
      expectedAssignment,
      '[[ "${RELEASE_CANDIDATE_SHA}" =~ ^[0-9a-f]{40}$ ]]',
      '[[ "${EXPECTED_WEB_REVISION}" =~ ^[0-9a-f]{40}$ ]]',
      'test "${EXPECTED_WEB_REVISION}" = "${RELEASE_CANDIDATE_SHA}"',
    ];
    const revisionGuard = revisionGuardLines.join("\n");
    const validRevision = "0123456789abcdef0123456789abcdef01234567";
    const executableRevisionGuard = revisionGuard
      .replace(candidateAssignment, `RELEASE_CANDIDATE_SHA=${validRevision}`)
      .replace(expectedAssignment, `EXPECTED_WEB_REVISION=${validRevision}`);
    const emptyRevisionGuard = executableRevisionGuard.replace(
      `EXPECTED_WEB_REVISION=${validRevision}`,
      "EXPECTED_WEB_REVISION=''",
    );

    expect(validatesStrictProductionSmoke(smokeSection)).toBe(true);
    expect(Bun.spawnSync(["bash", "-c", executableRevisionGuard]).exitCode).toBe(
      0,
    );
    expect(Bun.spawnSync(["bash", "-c", emptyRevisionGuard]).exitCode).not.toBe(
      0,
    );
    expect(
      validatesStrictProductionSmoke(
        smokeSection.replace(
          'test "$(read_header sitemap x-gooes-service)" = web',
          '# test "$(read_header sitemap x-gooes-service)" = web',
        ),
      ),
    ).toBe(false);
    expect(
      validatesStrictProductionSmoke(
        smokeSection.replace(
          "curl --fail --show-error --silent \\",
          "curl --show-error --silent \\",
        ),
      ),
    ).toBe(false);
    expect(
      validatesStrictProductionSmoke(
        smokeSection.replace(
          'test "$(read_header web-static x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"',
          "",
        ),
      ),
    ).toBe(false);
    expect(
      validatesStrictProductionSmoke(
        smokeSection.replace(
          "get_https sitemap https://www.goodcms.cn/sitemap.xml",
          "true || get_https sitemap https://www.goodcms.cn/sitemap.xml",
        ),
      ),
    ).toBe(false);

    for (const requiredText of [
      candidateAssignment,
      expectedAssignment,
      "WEB_SMOKE_CONTENT_PATH='<从发布记录复制已发布内容路径>'",
      "--dump-header",
      "--write-out '%{http_code} %{time_total}\\n'",
      'test "${HOME_STATUS}" = 200',
      'test "$(read_header web-home x-gooes-service)" = web',
      'test "$(read_header web-home x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"',
      'test "${PARTNERS_STATUS}" = 200',
      'test "${SITEMAP_STATUS}" = 200',
      'test "$(read_header sitemap x-gooes-service)" = web',
      'test "$(read_header sitemap x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"',
      'grep -q "<loc>" "${SMOKE_DIR}/sitemap.body"',
      'test "${CONTENT_STATUS}" = 200',
      'test "${ADMIN_PARTNERS_STATUS}" = 301',
      'test "$(read_header admin-partners location)" = "https://www.goodcms.cn/partners?utm_source=cutover-smoke"',
      'test "${ADMIN_LOGIN_STATUS}" = 200',
      "assert_not_www_redirect admin-login",
      "assert_not_www_redirect admin-platform-partners",
      'test "${STATIC_STATUS}" = 200',
      'test "$(read_header web-static x-gooes-service)" = web',
      'test "$(read_header web-static x-gooes-revision)" = "${EXPECTED_WEB_REVISION}"',
      'test "$(read_header web-static cache-control)" = "public, max-age=31536000, immutable"',
    ]) {
      expect(runbook).toContain(requiredText);
    }

    expect(runbook).not.toMatch(/curl[^\n]*--insecure/);
  });
});
