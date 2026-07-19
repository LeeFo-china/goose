# DNSPod `www.goodcms.cn` Certificate Auto-Renewal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `www.goodcms.cn` 建立最小权限 DNSPod API 3.0 DNS-01 自动续期链路，并在不强制替换当前有效证书的情况下启用可验证、可回滚的 systemd timer。

**Architecture:** 宿主机保存 root-only CAM 凭据和版本化 Python hook；systemd 每次运行时把 hook 与凭据复制到 `supabase-nginx` 的 `/run`，由容器内 Certbot manual auth/cleanup hook 调用 DNSPod API 3.0 创建、确认和删除挑战 TXT。首次使用 `certbot reconfigure` 的 staging 测试固化 lineage，再执行 dry-run，只有签发成功且 `nginx -t` 通过才 reload。

**Tech Stack:** Python 3 标准库、腾讯云 API 3.0 TC3-HMAC-SHA256、DNS UDP、Certbot 5.3、Docker、systemd、Bun 契约测试

---

## 文件结构

- Create: `deploy/certbot/dnspod_acme_hook.py`
  - 读取固定格式凭据、生成 TC3 签名、调用 CreateRecord/DeleteRecord、验证权威 TXT、管理 RecordId 状态。
- Create: `deploy/certbot/test_dnspod_acme_hook.py`
  - 使用 `unittest` 覆盖签名、配置、DNS 解析、auth/cleanup 和敏感信息保护。
- Create: `deploy/certbot/gooes-www-cert-renew.sh`
  - 宿主机 prepare/renew/reconfigure/dry-run/cleanup 入口，负责容器临时文件生命周期。
- Modify: `deploy/systemd/gooes-www-cert-renew.service`
  - 调用版本化 runner，并用 `ExecStopPost` 保证失败后清理。
- Modify: `deploy/systemd/gooes-www-cert-renew.timer`
  - 保持每日两次、Persistent 和 30 分钟随机延迟，补充精确依赖与安装语义。
- Create: `scripts/dnspod-cert-renewal-contract.test.ts`
  - 验证 systemd、runner、凭据边界和 Certbot 命令契约。
- Create: `docs/runbooks/dnspod-www-certificate-auto-renewal.md`
  - 记录 CAM、安装、验证、轮换、故障处理和回滚，不包含真实密钥。

## Task 1: TC3 签名、固定配置与域名边界

**Files:**
- Create: `deploy/certbot/test_dnspod_acme_hook.py`
- Create: `deploy/certbot/dnspod_acme_hook.py`

- [ ] **Step 1: 写入签名、凭据解析和域名校验失败测试**

测试使用标准库动态加载 hook，固定官方示例的 canonical request 输入，并覆盖配置白名单：

```python
import importlib.util
import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("dnspod_acme_hook.py")
SPEC = importlib.util.spec_from_file_location("dnspod_acme_hook", MODULE_PATH)
hook = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(hook)


class Tc3SigningTests(unittest.TestCase):
    def test_official_canonical_request_hash(self):
        payload = '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], "Name": "instance-name"}]}'
        canonical = hook.build_canonical_request(
            host="cvm.tencentcloudapi.com",
            content_type="application/json; charset=utf-8",
            payload=payload,
        )
        self.assertEqual(
            hook.sha256_hex(canonical),
            "5ffe6a04c0664d6b969fab9a13bdab201d63ee709638e2749d62a09ca18d7031",
        )

    def test_date_is_derived_in_utc(self):
        self.assertEqual(hook.utc_date(1551113065), "2019-02-25")


class CredentialTests(unittest.TestCase):
    def test_only_expected_keys_are_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "credentials.env"
            path.write_text(
                "TENCENTCLOUD_SECRET_ID=AKID-test\n"
                "TENCENTCLOUD_SECRET_KEY=secret-test\n"
                "DNSPOD_DOMAIN=goodcms.cn\n"
                "DNSPOD_SUBDOMAIN=_acme-challenge.www\n",
                encoding="utf-8",
            )
            credentials = hook.load_credentials(path)
            self.assertEqual(credentials.domain, "goodcms.cn")
            self.assertEqual(credentials.subdomain, "_acme-challenge.www")

    def test_rejects_unknown_keys_and_wrong_domain(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "credentials.env"
            path.write_text(
                "TENCENTCLOUD_SECRET_ID=AKID-test\n"
                "TENCENTCLOUD_SECRET_KEY=secret-test\n"
                "DNSPOD_DOMAIN=example.com\n"
                "DNSPOD_SUBDOMAIN=_acme-challenge.www\n"
                "EXTRA_KEY=forbidden\n",
                encoding="utf-8",
            )
            with self.assertRaises(hook.ConfigurationError):
                hook.load_credentials(path)

    def test_certbot_domain_is_exact(self):
        hook.validate_certbot_domain("www.goodcms.cn")
        for value in ("goodcms.cn", "api.goodcms.cn", "www.goodcms.cn.", "WWW.goodcms.cn"):
            with self.subTest(value=value), self.assertRaises(hook.ConfigurationError):
                hook.validate_certbot_domain(value)
```

- [ ] **Step 2: 运行测试并确认因 hook 缺失失败**

Run: `python3 -m unittest -v deploy/certbot/test_dnspod_acme_hook.py`

Expected: FAIL，错误包含 `No such file or directory` 或无法加载 `dnspod_acme_hook.py`。

- [ ] **Step 3: 实现最小签名与配置层**

实现以下固定接口，不读取 shell、不执行 `source`：

```python
#!/usr/bin/env python3
from __future__ import annotations

import dataclasses
import datetime as dt
import hashlib
import hmac
import json
from pathlib import Path

EXPECTED_DOMAIN = "www.goodcms.cn"
EXPECTED_ROOT_DOMAIN = "goodcms.cn"
EXPECTED_SUBDOMAIN = "_acme-challenge.www"
EXPECTED_KEYS = {
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY",
    "DNSPOD_DOMAIN",
    "DNSPOD_SUBDOMAIN",
}


class ConfigurationError(RuntimeError):
    pass


@dataclasses.dataclass(frozen=True)
class Credentials:
    secret_id: str
    secret_key: str
    domain: str
    subdomain: str


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def utc_date(timestamp: int) -> str:
    return dt.datetime.fromtimestamp(timestamp, tz=dt.timezone.utc).strftime("%Y-%m-%d")


def build_canonical_request(*, host: str, content_type: str, payload: str) -> str:
    canonical_headers = f"content-type:{content_type.lower()}\nhost:{host.lower()}\n"
    return "\n".join(("POST", "/", "", canonical_headers, "content-type;host", sha256_hex(payload)))


def hmac_sha256(key: bytes, value: str) -> bytes:
    return hmac.new(key, value.encode("utf-8"), hashlib.sha256).digest()


def build_authorization(*, secret_id: str, secret_key: str, service: str,
                        host: str, content_type: str, payload: str, timestamp: int) -> str:
    date = utc_date(timestamp)
    scope = f"{date}/{service}/tc3_request"
    canonical_hash = sha256_hex(build_canonical_request(host=host, content_type=content_type, payload=payload))
    string_to_sign = f"TC3-HMAC-SHA256\n{timestamp}\n{scope}\n{canonical_hash}"
    date_key = hmac_sha256(("TC3" + secret_key).encode("utf-8"), date)
    service_key = hmac_sha256(date_key, service)
    signing_key = hmac_sha256(service_key, "tc3_request")
    signature = hmac_sha256(signing_key, string_to_sign).hex()
    return (
        f"TC3-HMAC-SHA256 Credential={secret_id}/{scope}, "
        f"SignedHeaders=content-type;host, Signature={signature}"
    )


def load_credentials(path: Path) -> Credentials:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if not raw_line or raw_line.startswith("#"):
            continue
        key, separator, value = raw_line.partition("=")
        if not separator or key not in EXPECTED_KEYS or not value:
            raise ConfigurationError("invalid credential file")
        values[key] = value
    if set(values) != EXPECTED_KEYS:
        raise ConfigurationError("credential keys do not match the required set")
    if values["DNSPOD_DOMAIN"] != EXPECTED_ROOT_DOMAIN:
        raise ConfigurationError("unexpected DNSPod root domain")
    if values["DNSPOD_SUBDOMAIN"] != EXPECTED_SUBDOMAIN:
        raise ConfigurationError("unexpected DNSPod challenge subdomain")
    return Credentials(
        secret_id=values["TENCENTCLOUD_SECRET_ID"],
        secret_key=values["TENCENTCLOUD_SECRET_KEY"],
        domain=values["DNSPOD_DOMAIN"],
        subdomain=values["DNSPOD_SUBDOMAIN"],
    )


def validate_certbot_domain(value: str) -> None:
    if value != EXPECTED_DOMAIN:
        raise ConfigurationError("unexpected CERTBOT_DOMAIN")
```

- [ ] **Step 4: 运行测试确认签名与配置通过**

Run: `python3 -m unittest -v deploy/certbot/test_dnspod_acme_hook.py`

Expected: PASS；测试输出和异常文本均不包含 `secret-test`。

- [ ] **Step 5: 提交签名与配置层**

```bash
git add deploy/certbot/dnspod_acme_hook.py deploy/certbot/test_dnspod_acme_hook.py
git commit -m "feat(ops): 添加 DNSPod ACME 签名边界"
```

## Task 2: 权威 DNS TXT 查询与传播等待

**Files:**
- Modify: `deploy/certbot/dnspod_acme_hook.py`
- Modify: `deploy/certbot/test_dnspod_acme_hook.py`

- [ ] **Step 1: 为 DNS name 编解码、TXT 响应与超时写失败测试**

新增测试，使用固定 DNS packet bytes，不依赖公网：

```python
class DnsProtocolTests(unittest.TestCase):
    def test_encode_qname(self):
        self.assertEqual(
            hook.encode_qname("_acme-challenge.www.goodcms.cn"),
            b"\x0f_acme-challenge\x03www\x07goodcms\x02cn\x00",
        )

    def test_parse_txt_answer(self):
        packet = hook.build_test_txt_response(
            name="_acme-challenge.www.goodcms.cn",
            values=("challenge-a", "challenge-b"),
        )
        self.assertEqual(hook.parse_txt_answers(packet), {"challenge-a", "challenge-b"})

    def test_wait_present_requires_every_authoritative_server(self):
        answers = {
            "1.1.1.1": [{"token"}],
            "2.2.2.2": [set(), {"token"}],
        }
        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("1.1.1.1", "2.2.2.2"),
            query=lambda address, _name: answers[address].pop(0),
            sleep=lambda _seconds: None,
            monotonic=iter((0, 1, 2, 3)).__next__,
        )
        verifier.wait_present("_acme-challenge.www.goodcms.cn", "token", timeout=3, interval=0)

    def test_wait_present_times_out_without_logging_token(self):
        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("1.1.1.1",),
            query=lambda _address, _name: set(),
            sleep=lambda _seconds: None,
            monotonic=iter((0, 1, 2)).__next__,
        )
        stderr = io.StringIO()
        with redirect_stderr(stderr), self.assertRaises(hook.DnsPropagationError):
            verifier.wait_present("_acme-challenge.www.goodcms.cn", "secret-token", timeout=1, interval=0)
        self.assertNotIn("secret-token", stderr.getvalue())
```

- [ ] **Step 2: 运行测试确认 DNS 接口尚不存在**

Run: `python3 -m unittest -v deploy/certbot/test_dnspod_acme_hook.py`

Expected: FAIL，缺少 `encode_qname`、`parse_txt_answers` 或 `AuthoritativeTxtVerifier`。

- [ ] **Step 3: 实现最小 DNS UDP 客户端和传播验证器**

实现规则固定为：随机 16-bit transaction id；UDP 53；2 秒单次超时；支持压缩 name pointer；只收集
IN/TXT；先从容器 resolver 查询 `goodcms.cn` NS，再用 `socket.getaddrinfo` 解析每个 NS，并直接查询所有
权威地址。响应 transaction id 不一致、截断、格式错误或无权威服务器均抛出 `DnsProtocolError`。

公开接口固定为 `encode_qname(name) -> bytes`、`decode_name(packet, offset) -> (name, next_offset)`、
`parse_txt_answers(packet) -> set[str]`、`query_dns(address, name, qtype, timeout=2.0) -> bytes`、
`discover_authoritative_addresses(domain) -> list[str]`，以及
`AuthoritativeTxtVerifier.wait_present()` / `wait_absent()`。异常类型固定为 `DnsProtocolError` 和
`DnsPropagationError`。

`encode_qname` 拒绝空 label、超过 63 bytes 的 label 和超过 253 bytes 的完整名称；`decode_name` 维护已访问
offset 集合以阻断压缩指针循环；`parse_txt_answers` 依次跳过 question，遍历 answer 中的 name/type/class/ttl/
rdlength，只拼接单条 TXT RDATA 中所有 length-prefixed segment。`query_dns` 验证 response id、QR、TC 和
RCODE，再把响应交给解析器。`discover_authoritative_addresses` 从 `/etc/resolv.conf` 取得 nameserver，查询
`goodcms.cn` 的 NS，使用 `socket.getaddrinfo(ns_name, 53, socket.AF_UNSPEC, socket.SOCK_DGRAM)` 展开去重后的
IPv4/IPv6 地址。

`wait_present` 必须在每个权威地址均返回目标值时成功；`wait_absent` 必须在每个权威地址均不再返回
目标值时成功。日志只能输出权威地址数量、已通过数量和耗时。

- [ ] **Step 4: 运行 DNS 单元测试**

Run: `python3 -m unittest -v deploy/certbot/test_dnspod_acme_hook.py`

Expected: PASS，且无需网络。

- [ ] **Step 5: 提交 DNS 传播验证**

```bash
git add deploy/certbot/dnspod_acme_hook.py deploy/certbot/test_dnspod_acme_hook.py
git commit -m "feat(ops): 验证 ACME TXT 权威传播"
```

## Task 3: DNSPod API、auth/cleanup 状态与 CLI

**Files:**
- Modify: `deploy/certbot/dnspod_acme_hook.py`
- Modify: `deploy/certbot/test_dnspod_acme_hook.py`

- [ ] **Step 1: 为 CreateRecord/DeleteRecord 和 RecordId 所有权写失败测试**

```python
class HookWorkflowTests(unittest.TestCase):
    def test_auth_creates_only_fixed_txt_and_persists_returned_record_id(self):
        client = FakeClient(record_id=731)
        verifier = FakeVerifier()
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            hook.run_auth(
                domain="www.goodcms.cn",
                validation="validation-value",
                client=client,
                verifier=verifier,
                state_dir=state_dir,
            )
            self.assertEqual(client.created, [{
                "Domain": "goodcms.cn",
                "SubDomain": "_acme-challenge.www",
                "RecordType": "TXT",
                "RecordLine": "默认",
                "Value": "validation-value",
                "TTL": 600,
            }])
            state = hook.read_state(state_dir, "www.goodcms.cn", "validation-value")
            self.assertEqual(state.record_id, 731)

    def test_cleanup_deletes_only_record_id_from_matching_state(self):
        client = FakeClient(record_id=731)
        verifier = FakeVerifier()
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            hook.write_state(state_dir, "www.goodcms.cn", "validation-value", 731)
            hook.run_cleanup(
                domain="www.goodcms.cn",
                validation="validation-value",
                client=client,
                verifier=verifier,
                state_dir=state_dir,
            )
            self.assertEqual(client.deleted, [{"Domain": "goodcms.cn", "RecordId": 731}])

    def test_api_error_redacts_credentials_and_validation(self):
        stderr = io.StringIO()
        client = hook.DnsPodClient(
            hook.Credentials("AKID-sensitive", "key-sensitive", "goodcms.cn", "_acme-challenge.www"),
            transport=FakeErrorTransport("validation-sensitive"),
        )
        with redirect_stderr(stderr), self.assertRaises(hook.DnsPodApiError):
            client.create_txt("validation-sensitive")
        output = stderr.getvalue()
        for secret in ("AKID-sensitive", "key-sensitive", "validation-sensitive", "Authorization"):
            self.assertNotIn(secret, output)
```

`FakeClient`、`FakeVerifier` 和 `FakeErrorTransport` 在测试文件内完整实现，只记录调用参数，不访问网络。

- [ ] **Step 2: 运行测试确认工作流接口缺失**

Run: `python3 -m unittest -v deploy/certbot/test_dnspod_acme_hook.py`

Expected: FAIL，缺少 `DnsPodClient`、`run_auth`、`run_cleanup` 或状态接口。

- [ ] **Step 3: 实现 API 与状态机**

实现固定常量与接口：

```python
API_HOST = "dnspod.tencentcloudapi.com"
API_ENDPOINT = "https://dnspod.tencentcloudapi.com/"
API_SERVICE = "dnspod"
API_VERSION = "2021-03-23"
CONTENT_TYPE = "application/json; charset=utf-8"


class DnsPodApiError(RuntimeError):
    pass


@dataclasses.dataclass(frozen=True)
class ChallengeState:
    record_id: int
    validation_hash: str


class DnsPodClient:
    def __init__(self, credentials: Credentials, *, transport=urlopen):
        self.credentials = credentials
        self.transport = transport

    def create_txt(self, value: str) -> int:
        response = self.call("CreateRecord", {
            "Domain": self.credentials.domain,
            "SubDomain": self.credentials.subdomain,
            "RecordType": "TXT",
            "RecordLine": "默认",
            "Value": value,
            "TTL": 600,
        })
        record_id = response.get("RecordId")
        if not isinstance(record_id, int) or record_id <= 0:
            raise DnsPodApiError("CreateRecord returned no valid RecordId")
        return record_id

    def delete_record(self, record_id: int) -> None:
        self.call("DeleteRecord", {
            "Domain": self.credentials.domain,
            "RecordId": record_id,
        })
```

`call` 使用 `json.dumps(payload, separators=(",", ":"), ensure_ascii=False)` 的同一字符串签名和发送；
请求头仅含 Authorization、Content-Type、Host、X-TC-Action、X-TC-Timestamp、X-TC-Version。
HTTP/API Error 只记录 Error.Code 与 RequestId 后 8 位。状态文件名使用 domain 与 validation 的 SHA-256，
正文只含整数 RecordId 与 validation SHA-256，使用
`os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)` 写入临时文件、`fsync` 后 `os.replace` 原子替换。

状态与工作流公开接口固定为 `state_path`、`write_state`、`read_state`、`run_auth` 和 `run_cleanup`。
`run_auth` 的顺序只能是 validate domain → CreateRecord → 写 RecordId state → wait_present；传播失败时先尝试
DeleteRecord，再抛出原始失败。`run_cleanup` 的顺序只能是 validate domain → 读取并核对 validation hash →
DeleteRecord → wait_absent → 删除 state；没有匹配 state 时禁止调用 DeleteRecord。

CLI 只接受：

```text
dnspod_acme_hook.py auth --credentials PATH --state-dir PATH
dnspod_acme_hook.py cleanup --credentials PATH --state-dir PATH
```

它从环境读取 `CERTBOT_DOMAIN` 和 `CERTBOT_VALIDATION`；缺失、空值、额外参数或非固定域名均退出非零。
cleanup 的 DeleteRecord 成功后即使传播等待超时也必须保留明确失败状态，不能静默成功。

- [ ] **Step 4: 运行全部 hook 测试和语法检查**

Run:

```bash
python3 -m unittest -v deploy/certbot/test_dnspod_acme_hook.py
python3 -m py_compile deploy/certbot/dnspod_acme_hook.py
```

Expected: 全部 PASS；`py_compile` 无输出。

- [ ] **Step 5: 提交完整 hook**

```bash
git add deploy/certbot/dnspod_acme_hook.py deploy/certbot/test_dnspod_acme_hook.py
git commit -m "feat(ops): 完成 DNSPod ACME challenge hook"
```

## Task 4: 宿主机 runner 与 systemd 失败清理契约

**Files:**
- Create: `deploy/certbot/gooes-www-cert-renew.sh`
- Modify: `deploy/systemd/gooes-www-cert-renew.service`
- Modify: `deploy/systemd/gooes-www-cert-renew.timer`
- Create: `scripts/dnspod-cert-renewal-contract.test.ts`

- [ ] **Step 1: 写 runner/systemd 失败契约测试**

契约测试读取实际文件并固定以下安全边界：

```typescript
import { describe, expect, test } from "bun:test";

const runner = await Bun.file("deploy/certbot/gooes-www-cert-renew.sh").text();
const service = await Bun.file("deploy/systemd/gooes-www-cert-renew.service").text();
const timer = await Bun.file("deploy/systemd/gooes-www-cert-renew.timer").text();

describe("DNSPod certificate renewal", () => {
  test("keeps credentials out of argv and persistent container state", () => {
    expect(runner).toContain("/etc/gooes/dnspod-www-cert.env");
    expect(runner).toContain("/run/gooes-dnspod-acme");
    expect(runner).not.toContain("TENCENTCLOUD_SECRET_KEY=");
    expect(runner).not.toContain("set -x");
    expect(runner).not.toContain("docker run");
  });

  test("reloads nginx only behind validation", () => {
    expect(runner).toContain("nginx -t && nginx -s reload");
    expect(runner).toContain("--no-directory-hooks");
    expect(runner).toContain("--cert-name www.goodcms.cn");
  });

  test("always attaches cleanup to service shutdown", () => {
    expect(service).toContain("ExecStartPre=/opt/gooes/cert-renewal/gooes-www-cert-renew prepare");
    expect(service).toContain("ExecStart=/opt/gooes/cert-renewal/gooes-www-cert-renew renew");
    expect(service).toContain("ExecStopPost=/opt/gooes/cert-renewal/gooes-www-cert-renew cleanup");
  });

  test("checks twice daily with persistent randomized scheduling", () => {
    expect(timer).toContain("OnCalendar=*-*-* 00,12:00:00");
    expect(timer).toContain("Persistent=true");
    expect(timer).toContain("RandomizedDelaySec=1800");
  });
});
```

- [ ] **Step 2: 运行测试确认 runner 尚不存在**

Run: `bun test scripts/dnspod-cert-renewal-contract.test.ts`

Expected: FAIL，无法读取 `deploy/certbot/gooes-www-cert-renew.sh`。

- [ ] **Step 3: 实现 runner 的四个受控动作**

Runner 使用 `#!/usr/bin/env bash` 与 `set -euo pipefail`，固定以下路径，不接受用户提供的容器名或目录：

```bash
container_name="supabase-nginx"
host_hook="/opt/gooes/cert-renewal/dnspod_acme_hook.py"
host_credentials="/etc/gooes/dnspod-www-cert.env"
runtime_dir="/run/gooes-dnspod-acme"
container_hook="${runtime_dir}/dnspod_acme_hook.py"
container_credentials="${runtime_dir}/credentials.env"
container_state="${runtime_dir}/state"
```

动作必须精确为：

- `prepare`：验证宿主机文件 owner/mode、容器 running，创建容器 `/run`，`docker cp` 两个文件并 chmod。
- `renew`：执行 `certbot renew --cert-name www.goodcms.cn --non-interactive --no-directory-hooks`，传入保存于
  lineage 的 manual hooks，deploy hook 固定为 `nginx -t && nginx -s reload`。
- `reconfigure`：执行 `certbot reconfigure --cert-name www.goodcms.cn --authenticator manual
  --preferred-challenges dns-01 --manual-auth-hook "/usr/bin/python3 /run/gooes-dnspod-acme/dnspod_acme_hook.py
  auth --credentials /run/gooes-dnspod-acme/credentials.env --state-dir /run/gooes-dnspod-acme/state"
  --manual-cleanup-hook "/usr/bin/python3 /run/gooes-dnspod-acme/dnspod_acme_hook.py cleanup --credentials
  /run/gooes-dnspod-acme/credentials.env --state-dir /run/gooes-dnspod-acme/state"
  --deploy-hook "nginx -t && nginx -s reload"
  --run-deploy-hooks --no-directory-hooks`。
- `dry-run`：执行 `certbot renew --cert-name www.goodcms.cn --dry-run --run-deploy-hooks
  --no-directory-hooks`。
- `cleanup`：`docker exec` 精确删除容器 runtime dir；容器已经退出时也不删除宿主机凭据。

除上述五个动作外全部退出 64。权限检查必须要求凭据 UID/GID 为 0/0、mode 600，hook UID/GID 为 0/0、
mode 755；不匹配时在任何 `docker cp` 前失败。

- [ ] **Step 4: 改写 systemd service 并保持 timer 契约**

Service 内容固定为：

```ini
[Unit]
Description=Renew the www.goodcms.cn certificate with DNSPod DNS-01
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
ExecStartPre=/opt/gooes/cert-renewal/gooes-www-cert-renew prepare
ExecStart=/opt/gooes/cert-renewal/gooes-www-cert-renew renew
ExecStopPost=/opt/gooes/cert-renewal/gooes-www-cert-renew cleanup
TimeoutStartSec=15min
```

Timer 保持既有 schedule，并增加：

```ini
[Unit]
Description=Check the www.goodcms.cn certificate twice daily

[Timer]
OnCalendar=*-*-* 00,12:00:00
Persistent=true
RandomizedDelaySec=1800
Unit=gooes-www-cert-renew.service

[Install]
WantedBy=timers.target
```

- [ ] **Step 5: 运行契约、shell 静态检查与现有发布测试**

Run:

```bash
bash -n deploy/certbot/gooes-www-cert-renew.sh
bun test scripts/dnspod-cert-renewal-contract.test.ts
bun test scripts/release-orchestration-contract.test.ts
git diff --check
```

Expected: shell 无输出；新增契约通过；现有 105 项发布契约通过；diff check 无输出。

- [ ] **Step 6: 提交 runner 与 systemd**

```bash
git add deploy/certbot/gooes-www-cert-renew.sh deploy/systemd/gooes-www-cert-renew.service \
  deploy/systemd/gooes-www-cert-renew.timer scripts/dnspod-cert-renewal-contract.test.ts
git commit -m "feat(ops): 编排 DNSPod 证书自动续期"
```

## Task 5: 生产 runbook、全量本地验证与分支发布

**Files:**
- Create: `docs/runbooks/dnspod-www-certificate-auto-renewal.md`

- [ ] **Step 1: 编写不含密钥的生产 runbook**

Runbook 必须给出以下精确章节和命令：

- 前置状态：容器名、Certbot 版本、lineage、证书指纹/有效期、当前 renewal 配置 SHA。
- CAM：子用户 `gooes-www-cert-renewal`、策略 `GooesWwwCertificateDns01`、两项 Action、单域名资源。
- 安装：使用 `install -o root -g root -m 0755` 和 `install -m 0600`，再安装 systemd unit。
- 探针：在固定 `_acme-challenge.www` 主机记录上使用 `openssl rand -hex 16` 生成一次性 TXT 值，必须
  create/query/delete 且无该值遗留。
- Reconfigure：先 prepare，再 reconfigure，最后 cleanup。
- Dry-run：先 prepare，再 dry-run，最后 cleanup。
- 启用：`systemctl daemon-reload`、`enable --now`、`list-timers`。
- 验证：Nginx、HTTPS、证书 SAN/issuer/expiry/fingerprint、journal 敏感词扫描。
- 轮换：创建新 key、替换 root-only 文件、探针与 dry-run、禁用并删除旧 key。
- 回滚：禁用 timer、恢复 renewal 配置备份、移除安装文件、最后撤销 CAM 凭据。

任何凭据示例只使用键名，不出现满足真实 SecretId/SecretKey 形态的值。

- [ ] **Step 2: 运行敏感信息与全量相关验证**

Run:

```bash
python3 -m unittest -v deploy/certbot/test_dnspod_acme_hook.py
python3 -m py_compile deploy/certbot/dnspod_acme_hook.py
bash -n deploy/certbot/gooes-www-cert-renew.sh
bun test scripts/dnspod-cert-renewal-contract.test.ts scripts/release-orchestration-contract.test.ts
rg -n "AKID[A-Za-z0-9]{12,}|TENCENTCLOUD_SECRET_KEY=.+|Authorization: TC3" \
  deploy/certbot deploy/systemd docs/runbooks/dnspod-www-certificate-auto-renewal.md
git diff --check
```

Expected: Python、Bun、shell 全部通过；敏感信息扫描无结果；diff check 无输出。

- [ ] **Step 3: 提交 runbook**

```bash
git add docs/runbooks/dnspod-www-certificate-auto-renewal.md
git commit -m "docs(ops): 添加 DNSPod 续期运行手册"
```

- [ ] **Step 4: 核对分支并推送**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git push -u origin ops/dnspod-auto-renewal-20260719
```

Expected: worktree clean；差异只含设计、计划、hook、测试、systemd 和 runbook；远端分支创建成功。

## Task 6: 创建 CAM 最小权限身份并做受控 DNS 探针

**Files:**
- Runtime create: production `/etc/gooes/dnspod-www-cert.env`
- Runtime evidence only: CAM user/policy/key metadata，不写入仓库

- [ ] **Step 1: 记录生产和 DNS 只读基线**

通过 SSH 记录但不输出任何容器环境变量：

```bash
ssh ubuntu@1.13.20.39 'set -eu
  docker exec supabase-nginx certbot --version
  docker exec supabase-nginx certbot certificates
  docker exec supabase-nginx sha256sum /etc/letsencrypt/renewal/www.goodcms.cn.conf
  docker exec supabase-nginx nginx -t
  systemctl is-active gooes-www-cert-renew.timer || true
  systemctl is-enabled gooes-www-cert-renew.timer || true
  dig +short NS goodcms.cn
  curl -fsS -o /dev/null -w "%{http_code}\n" https://www.goodcms.cn/
'
```

Expected: Certbot 5.3.x；证书有效；Nginx successful；timer 未启用；NS 为 DNSPod；HTTPS 200。

- [ ] **Step 2: 使用现有腾讯云登录会话读取真实 owner UIN 与 DomainId**

按 `chrome:control-chrome` 技能连接现有 Chrome，不输入或请求用户密码。打开 DNSPod `goodcms.cn` 资源详情和
CAM 控制台，把页面显示值分别记为 `owner_uin` 与 `domain_id`；若登录态不存在或要求新的 MFA，停止并让用户完成登录/MFA，
不绕过验证。

- [ ] **Step 3: 创建 CAM 策略和仅编程访问子用户**

在 CAM 控制台创建策略 `GooesWwwCertificateDns01`。策略版本为 `2.0`，effect 为 `allow`，Action 只有
`dnspod:CreateRecord` 与 `dnspod:DeleteRecord`；资源字符串用已读取的两个值拼接为
`"qcs::dnspod::uin/" + owner_uin + ":domain/" + domain_id`。保存前从控制台 JSON 预览反向核对 Action 数量
为 2、resource 数量为 1，且页面资源名称显示 `goodcms.cn`。

创建子用户 `gooes-www-cert-renewal`，只允许编程访问，关联且仅关联上述策略。创建一对 API 密钥；SecretKey
只在创建时处理，不复制到聊天、仓库或命令输出。计划确认即作为本次具体的凭据创建与权限变更授权。

- [ ] **Step 4: 将一次性密钥文件直接安装到生产**

将控制台一次性下载文件置于本机权限 0600 的临时目录，不读取到终端；在本机转换前先验证文件字段名，
生成固定四键 env 文件并通过 stdin 传输到生产 `sudo install -o root -g root -m 0600 /dev/stdin
/etc/gooes/dnspod-www-cert.env`。传输成功后删除本机临时文件，再用生产 `stat` 验证 `0:0 600`，只输出
owner/mode，不输出内容。

- [ ] **Step 5: 安装临时 hook 并执行随机 TXT 探针**

先把当前提交的 hook 安装到 `/opt/gooes/cert-renewal`。以 `www.goodcms.cn` 作为 domain、
`openssl rand -hex 16` 作为 validation 调用同一 `run_auth`，在固定 `_acme-challenge.www` 上创建 TXT；
从所有当前权威 NS 查询到精确随机值后调用 `run_cleanup`，再确认所有权威 NS 均无该值。

Expected: CreateRecord 和 DeleteRecord 成功；其他记录无变化；探针无遗留。失败时立即删除新密钥并停止，
不修改 Certbot lineage。

## Task 7: 安装续期链路、reconfigure 与 dry-run

**Files:**
- Runtime create: `/opt/gooes/cert-renewal/dnspod_acme_hook.py`
- Runtime create: `/opt/gooes/cert-renewal/gooes-www-cert-renew`
- Runtime create: `/etc/systemd/system/gooes-www-cert-renew.service`
- Runtime create: `/etc/systemd/system/gooes-www-cert-renew.timer`
- Runtime modify: Certbot renewal config after successful staging reconfigure

- [ ] **Step 1: 安装版本化文件并记录校验和**

从工作树精确提交通过 SSH stdin 安装 hook、runner 和 unit；不要从根工作区复制。生产端用 `install` 固定
owner/mode，记录仓库文件与生产文件 SHA-256 一致。运行：

```bash
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/gooes-www-cert-renew.service \
  /etc/systemd/system/gooes-www-cert-renew.timer
```

Expected: verify 无 error；timer 仍未启用。

- [ ] **Step 2: 备份 renewal 配置并运行 staging reconfigure**

备份文件名使用 UTC 时间戳，位于 `/etc/letsencrypt/renewal` 同 volume，记录备份与当前 SHA。执行严格清理：

```bash
sudo /opt/gooes/cert-renewal/gooes-www-cert-renew prepare
if sudo /opt/gooes/cert-renewal/gooes-www-cert-renew reconfigure; then
  reconfigure_status=0
else
  reconfigure_status=$?
fi
sudo /opt/gooes/cert-renewal/gooes-www-cert-renew cleanup
test "$reconfigure_status" -eq 0
```

Expected: Certbot staging renewal 成功并保存 manual auth/cleanup hook；当前 live 证书指纹未改变；无挑战 TXT 遗留。

- [ ] **Step 3: 运行完整 dry-run 和 deploy hook**

使用同样 prepare/try/cleanup 结构执行 runner `dry-run`。完成后运行：

```bash
docker exec supabase-nginx nginx -t
curl -fsS -o /dev/null -w '%{http_code}\n' https://www.goodcms.cn/
docker exec supabase-nginx find /run -maxdepth 1 -name 'gooes-dnspod-acme' -print
```

Expected: dry-run success；Nginx successful；HTTPS 200；find 无输出；权威 NS 无挑战 TXT。

- [ ] **Step 4: 失败时恢复 lineage，成功后启用 timer**

若 reconfigure/dry-run 任一失败：保持 timer disabled，恢复备份 renewal 配置，删除容器 `/run`，验证当前证书
与 HTTPS 仍正常后停止。两项均成功才执行：

```bash
sudo systemctl enable --now gooes-www-cert-renew.timer
systemctl is-enabled gooes-www-cert-renew.timer
systemctl is-active gooes-www-cert-renew.timer
systemctl list-timers gooes-www-cert-renew.timer --all
```

Expected: enabled、active，显示下一次触发时间。

## Task 8: 完成生产验收与发布摘要

**Files:**
- No repository changes

- [ ] **Step 1: 验证证书、HTTPS、timer 与容器健康**

记录：证书 issuer、SAN、notBefore/notAfter、SHA-256 fingerprint；`nginx -t`；官网关键 URL 200；
`supabase-nginx` healthy/restart count；timer enabled/active/next run；renewal config authenticator 与 hooks。

- [ ] **Step 2: 扫描 DNS、journal 和进程参数中的敏感信息**

检查 DNS 无本次探针值和挑战值遗留；检查本次 service journal 不包含 SecretId、SecretKey、
Authorization、validation；检查 `docker inspect` 环境中无 DNSPod 凭据；检查容器 `/run` 无临时文件。
扫描只使用敏感字段名和已知 SecretId 的 SHA/受控匹配，不把 SecretKey 作为命令参数。

- [ ] **Step 3: 记录回滚证据和最终 Git 状态**

记录 renewal 备份路径/SHA、生产安装文件 SHA、CAM 用户与策略名、远端分支与 commit、现有证书指纹。
确认 worktree clean，根工作区原有修改未改变。

- [ ] **Step 4: 输出发布摘要**

摘要包含：目标域名、方案、CAM 权限范围、凭据路径/权限、hook/unit commit 与 SHA、probe/reconfigure/dry-run
结果、timer 下次运行时间、证书有效期/指纹、Nginx/HTTPS/容器结果、回滚入口。不得包含 SecretId、
SecretKey、Authorization、挑战值或下载文件名。
