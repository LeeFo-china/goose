import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const runner = readFileSync(join(root, "deploy/certbot/gooes-www-cert-renew.sh"), "utf8");
const service = readFileSync(join(root, "deploy/systemd/gooes-www-cert-renew.service"), "utf8");
const timer = readFileSync(join(root, "deploy/systemd/gooes-www-cert-renew.timer"), "utf8");

describe("DNSPod certificate renewal contract", () => {
  test("runner is strict and uses fixed production paths", () => {
    expect(runner).toContain("set -Eeuo pipefail");
    expect(runner).not.toContain("set -x");
    expect(runner).not.toContain("docker run");
    expect(runner).toContain("supabase-nginx");
    expect(runner).toContain("/opt/gooes/cert-renewal/dnspod_acme_hook.py");
    expect(runner).toContain("/etc/gooes/dnspod-www-cert.env");
    expect(runner).toContain("/run/gooes-dnspod-acme");
    expect(runner).toContain("prepare|renew|reconfigure|dry-run|cleanup");
  });

  test("runner validates root, modes, container and stages runtime files", () => {
    expect(runner).toContain("id -u");
    expect(runner).toContain("stat -c '%a'");
    expect(runner).toContain("docker inspect");
    expect(runner).toContain("docker cp");
    expect(runner).toContain("-m 0700");
    expect(runner).toContain("chmod 600");
    expect(runner).toContain("docker exec");
  });

  test("renew uses certbot hooks and nginx deploy hook", () => {
    expect(runner).toContain("certbot renew");
    expect(runner).toContain("--manual-auth-hook");
    expect(runner).toContain("--manual-cleanup-hook");
    expect(runner).toContain("--deploy-hook");
    expect(runner).toContain("nginx -t && nginx -s reload");
    expect(runner).toContain("--non-interactive");
    expect(runner).toContain("--no-directory-hooks");
    expect(runner).toContain("--no-random-sleep-on-renew");
  });

  test("runner covers existing goodcms DNS-01 certificates and supports override", () => {
    for (const certName of [
      "www.goodcms.cn",
      "admin.goodcms.cn",
      "api.goodcms.cn",
      "h5.goodcms.cn",
      "sock.goodcms.cn",
      "supabase.goodcms.cn",
    ]) {
      expect(runner).toContain(certName);
    }
    expect(runner).toContain("DEFAULT_CERT_NAMES=(");
    expect(runner).toContain("CERT_NAMES");
    expect(runner).toContain('for cert_name in "${cert_names[@]}"');
    expect(runner).toContain('--cert-name "${cert_name}"');
  });

  test("reconfigure does not persist a staging ACME server", () => {
    expect(runner).toContain("certbot reconfigure");
    expect(runner).not.toContain("acme-staging-v02.api.letsencrypt.org");
    expect(runner).not.toMatch(/reconfigure\(\)[\s\S]*--server/);
  });

  test("dry-run remains non-production", () => {
    expect(runner).toContain("--dry-run");
    expect(runner).toContain("--run-deploy-hooks");
  });

  test("prepare preserves runtime for the following certbot command", () => {
    expect(runner).not.toMatch(/^trap cleanup EXIT$/m);
    expect(runner).toContain("prepare) prepare ;;");
  });

  test("certbot commands remove runtime even when command fails", () => {
    expect(runner).toContain("with_cleanup() {");
    expect(runner).toContain("trap cleanup EXIT");
    expect(runner).toContain("renew) with_cleanup renew ;;");
    expect(runner).toContain("reconfigure) with_cleanup reconfigure ;;");
    expect(runner).toContain("dry-run) with_cleanup dry_run ;;");
    expect(runner).toContain("docker exec supabase-nginx rm -rf /run/gooes-dnspod-acme");
  });

  test("credentials are not exposed in script or process arguments", () => {
    expect(runner).not.toMatch(/SECRET_KEY\s*=/);
    expect(runner).not.toMatch(/secret[_-]?key\s*=/i);
    expect(runner).not.toContain("printenv");
  });

  test("systemd owns prepare/renew/cleanup and has bounded timeout", () => {
    expect(service).toContain("Requires=docker.service");
    expect(service).toContain("After=docker.service");
    expect(service).toContain("TimeoutStartSec=15min");
    expect(service).toContain("ExecStartPre=/opt/gooes/cert-renewal/gooes-www-cert-renew prepare");
    expect(service).toContain("ExecStart=/opt/gooes/cert-renewal/gooes-www-cert-renew renew");
    expect(service).toContain("ExecStopPost=/opt/gooes/cert-renewal/gooes-www-cert-renew cleanup");
  });

  test("timer runs twice daily and is installable", () => {
    expect(timer).toContain("OnCalendar=*-*-* 00,12:00:00");
    expect(timer).toContain("Persistent=true");
    expect(timer).toContain("RandomizedDelaySec=1800");
    expect(timer).toContain("[Install]");
    expect(timer).toContain("WantedBy=timers.target");
  });
});
