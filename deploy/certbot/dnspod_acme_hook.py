#!/usr/bin/env python3
from __future__ import annotations

import dataclasses
import datetime as dt
import hashlib
import hmac
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
    return "\n".join(
        ("POST", "/", "", canonical_headers, "content-type;host", sha256_hex(payload))
    )


def hmac_sha256(key: bytes, value: str) -> bytes:
    return hmac.new(key, value.encode("utf-8"), hashlib.sha256).digest()


def build_authorization(
    *,
    secret_id: str,
    secret_key: str,
    service: str,
    host: str,
    content_type: str,
    payload: str,
    timestamp: int,
) -> str:
    date = utc_date(timestamp)
    scope = f"{date}/{service}/tc3_request"
    canonical_request = build_canonical_request(
        host=host,
        content_type=content_type,
        payload=payload,
    )
    string_to_sign = (
        f"TC3-HMAC-SHA256\n{timestamp}\n{scope}\n{sha256_hex(canonical_request)}"
    )
    date_key = hmac_sha256(("TC3" + secret_key).encode("utf-8"), date)
    service_key = hmac_sha256(date_key, service)
    signing_key = hmac_sha256(service_key, "tc3_request")
    signature = hmac_sha256(signing_key, string_to_sign).hex()
    return (
        f"TC3-HMAC-SHA256 Credential={secret_id}/{scope}, "
        f"SignedHeaders=content-type;host, Signature={signature}"
    )


def load_credentials(path: Path) -> Credentials:
    try:
        raw_lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        raise ConfigurationError("unable to read credential file") from None

    values: dict[str, str] = {}
    for raw_line in raw_lines:
        if not raw_line or raw_line.startswith("#"):
            continue
        key, separator, value = raw_line.partition("=")
        if (
            not separator
            or key not in EXPECTED_KEYS
            or key in values
            or not value
        ):
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
