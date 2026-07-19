#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import dataclasses
import datetime as dt
import fcntl
import hashlib
import hmac
import json
import os
import secrets
import socket
import stat
import struct
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable, Iterable


EXPECTED_DOMAIN = "www.goodcms.cn"
EXPECTED_ROOT_DOMAIN = "goodcms.cn"
DOMAIN_CHALLENGE_SUBDOMAINS = {
    "www.goodcms.cn": "_acme-challenge.www",
    "admin.goodcms.cn": "_acme-challenge.admin",
    "api.goodcms.cn": "_acme-challenge.api",
    "h5.goodcms.cn": "_acme-challenge.h5",
    "sock.goodcms.cn": "_acme-challenge.sock",
    "supabase.goodcms.cn": "_acme-challenge.supabase",
}
EXPECTED_SUBDOMAIN = DOMAIN_CHALLENGE_SUBDOMAINS[EXPECTED_DOMAIN]
EXPECTED_CHALLENGE_FQDN = f"{EXPECTED_SUBDOMAIN}.{EXPECTED_ROOT_DOMAIN}"
EXPECTED_KEYS = {
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY",
    "DNSPOD_DOMAIN",
    "DNSPOD_SUBDOMAIN",
}
API_HOST = "dnspod.tencentcloudapi.com"
API_ENDPOINT = "https://dnspod.tencentcloudapi.com/"
API_SERVICE = "dnspod"
API_VERSION = "2021-03-23"
CONTENT_TYPE = "application/json; charset=utf-8"
MAX_API_TIMEOUT = 10.0
MAX_API_RESPONSE_BYTES = 64 * 1024
MAX_STATE_BYTES = 4096


class HookError(RuntimeError):
    pass


class ConfigurationError(HookError):
    pass


class DnsProtocolError(HookError):
    pass


class DnsTransportError(DnsProtocolError):
    pass


class DnsPropagationError(HookError):
    pass


@dataclasses.dataclass(frozen=True)
class _DnsRecord:
    record_type: int
    record_class: int
    rdata_offset: int
    rdata_end: int


def encode_qname(name: str) -> bytes:
    normalized = name[:-1] if name.endswith(".") else name
    if not normalized:
        raise DnsProtocolError("invalid DNS name")

    try:
        encoded_name = normalized.encode("ascii")
    except UnicodeEncodeError:
        raise DnsProtocolError("DNS names must use ASCII labels") from None
    if len(encoded_name) > 253:
        raise DnsProtocolError("DNS name is too long")

    encoded_labels = []
    for label in encoded_name.split(b"."):
        if not label:
            raise DnsProtocolError("DNS name contains an empty label")
        if len(label) > 63:
            raise DnsProtocolError("DNS label is too long")
        encoded_labels.append(bytes((len(label),)) + label)

    wire_name = b"".join(encoded_labels) + b"\x00"
    if len(wire_name) > 255:
        raise DnsProtocolError("DNS wire name is too long")
    return wire_name


def decode_name(packet: bytes, offset: int) -> tuple[str, int]:
    if offset < 0 or offset >= len(packet):
        raise DnsProtocolError("DNS name offset is out of bounds")

    labels: list[str] = []
    position = offset
    next_offset = None
    visited_offsets: set[int] = set()
    jumps = 0

    while True:
        if position >= len(packet):
            raise DnsProtocolError("truncated DNS name")
        if position in visited_offsets:
            raise DnsProtocolError("DNS compression pointer loop")
        visited_offsets.add(position)

        length = packet[position]
        if length & 0xC0 == 0xC0:
            if position + 1 >= len(packet):
                raise DnsProtocolError("truncated DNS compression pointer")
            pointer = ((length & 0x3F) << 8) | packet[position + 1]
            if pointer >= len(packet):
                raise DnsProtocolError("DNS compression pointer is out of bounds")
            if next_offset is None:
                next_offset = position + 2
            position = pointer
            jumps += 1
            if jumps > 128:
                raise DnsProtocolError("too many DNS compression pointers")
            continue
        if length & 0xC0:
            raise DnsProtocolError("invalid DNS label length")
        if length == 0:
            if next_offset is None:
                next_offset = position + 1
            return ".".join(labels), next_offset

        label_start = position + 1
        label_end = label_start + length
        if label_end > len(packet):
            raise DnsProtocolError("truncated DNS label")
        try:
            label = packet[label_start:label_end].decode("ascii")
        except UnicodeDecodeError:
            raise DnsProtocolError("DNS name contains a non-ASCII label") from None
        labels.append(label)
        if sum(len(value) for value in labels) + len(labels) - 1 > 253:
            raise DnsProtocolError("decoded DNS name is too long")
        position = label_end


def _parse_dns_message(packet: bytes) -> tuple[list[_DnsRecord], list[_DnsRecord]]:
    if len(packet) < 12:
        raise DnsProtocolError("truncated DNS header")

    _, _, question_count, answer_count, authority_count, additional_count = (
        struct.unpack_from("!HHHHHH", packet)
    )
    offset = 12
    for _ in range(question_count):
        _, offset = decode_name(packet, offset)
        if offset + 4 > len(packet):
            raise DnsProtocolError("truncated DNS question")
        offset += 4

    answers: list[_DnsRecord] = []
    authorities: list[_DnsRecord] = []
    for records, count in (
        (answers, answer_count),
        (authorities, authority_count),
        (None, additional_count),
    ):
        for _ in range(count):
            _, offset = decode_name(packet, offset)
            if offset + 10 > len(packet):
                raise DnsProtocolError("truncated DNS resource record")
            record_type, record_class, _, rdata_length = struct.unpack_from(
                "!HHIH", packet, offset
            )
            rdata_offset = offset + 10
            rdata_end = rdata_offset + rdata_length
            if rdata_end > len(packet):
                raise DnsProtocolError("truncated DNS resource data")
            if records is not None:
                records.append(
                    _DnsRecord(
                        record_type=record_type,
                        record_class=record_class,
                        rdata_offset=rdata_offset,
                        rdata_end=rdata_end,
                    )
                )
            offset = rdata_end

    if offset != len(packet):
        raise DnsProtocolError("unexpected trailing DNS data")
    return answers, authorities


def parse_txt_answers(packet: bytes) -> set[str]:
    answers, _ = _parse_dns_message(packet)
    values: set[str] = set()
    for answer in answers:
        if answer.record_type != 16 or answer.record_class != 1:
            continue
        if answer.rdata_offset == answer.rdata_end:
            raise DnsProtocolError("empty TXT resource data")

        segments: list[bytes] = []
        offset = answer.rdata_offset
        while offset < answer.rdata_end:
            segment_length = packet[offset]
            offset += 1
            segment_end = offset + segment_length
            if segment_end > answer.rdata_end:
                raise DnsProtocolError("truncated TXT segment")
            segments.append(packet[offset:segment_end])
            offset = segment_end
        try:
            values.add(b"".join(segments).decode("utf-8"))
        except UnicodeDecodeError:
            raise DnsProtocolError("TXT resource data is not valid UTF-8") from None
    return values


def _address_family(address: str) -> int:
    for family in (socket.AF_INET, socket.AF_INET6):
        try:
            socket.inet_pton(family, address)
        except OSError:
            continue
        return family
    raise DnsProtocolError("invalid DNS server address")


def query_dns(
    address: str,
    name: str,
    qtype: int,
    timeout: float = 2.0,
    *,
    recursion_desired: bool = False,
    require_authoritative: bool = False,
    allow_name_error: bool = False,
) -> bytes:
    if not 0 <= qtype <= 0xFFFF:
        raise DnsProtocolError("invalid DNS query type")
    transaction_id = secrets.randbits(16)
    flags = 0x0100 if recursion_desired else 0
    packet = (
        struct.pack("!HHHHHH", transaction_id, flags, 1, 0, 0, 0)
        + encode_qname(name)
        + struct.pack("!HH", qtype, 1)
    )
    family = _address_family(address)
    destination = (address, 53) if family == socket.AF_INET else (address, 53, 0, 0)

    try:
        with socket.socket(family, socket.SOCK_DGRAM) as dns_socket:
            dns_socket.settimeout(timeout)
            dns_socket.sendto(packet, destination)
            response, peer = dns_socket.recvfrom(65535)
    except (OSError, TimeoutError):
        raise DnsTransportError("DNS query failed") from None

    try:
        peer_matches = (
            peer[1] == 53
            and socket.inet_pton(family, peer[0])
            == socket.inet_pton(family, address)
        )
    except (IndexError, OSError, TypeError):
        peer_matches = False
    if not peer_matches:
        raise DnsProtocolError("DNS response peer mismatch")
    if len(response) < 12:
        raise DnsProtocolError("truncated DNS response header")
    response_id, response_flags, question_count = struct.unpack_from(
        "!HHH", response
    )
    if response_id != transaction_id:
        raise DnsProtocolError("DNS response transaction ID mismatch")
    if not response_flags & 0x8000:
        raise DnsProtocolError("DNS response flag is missing")
    if response_flags & 0x7800:
        raise DnsProtocolError("DNS response opcode mismatch")
    if response_flags & 0x0200:
        raise DnsProtocolError("truncated DNS response")
    response_code = response_flags & 0x000F
    if response_code and not (allow_name_error and response_code == 3):
        raise DnsProtocolError("DNS response returned an error")
    if require_authoritative and not response_flags & 0x0400:
        raise DnsProtocolError("DNS response is not authoritative")
    if question_count != 1:
        raise DnsProtocolError("DNS response question count mismatch")

    question_name, question_end = decode_name(response, 12)
    if question_end + 4 > len(response):
        raise DnsProtocolError("truncated DNS response question")
    question_type, question_class = struct.unpack_from("!HH", response, question_end)
    expected_name = name[:-1] if name.endswith(".") else name
    if (
        question_name.lower() != expected_name.lower()
        or question_type != qtype
        or question_class != 1
    ):
        raise DnsProtocolError("DNS response question mismatch")
    return response


def _resolver_nameserver() -> str:
    try:
        lines = Path("/etc/resolv.conf").read_text(encoding="ascii").splitlines()
    except (OSError, UnicodeError):
        raise DnsProtocolError("unable to read resolver configuration") from None

    for raw_line in lines:
        line = raw_line.split("#", 1)[0].strip()
        parts = line.split()
        if len(parts) < 2 or parts[0] != "nameserver":
            continue
        try:
            _address_family(parts[1])
        except DnsProtocolError:
            continue
        return parts[1]
    raise DnsProtocolError("no valid resolver nameserver")


def _parse_ns_names(packet: bytes) -> list[str]:
    answers, authorities = _parse_dns_message(packet)
    names: list[str] = []
    seen: set[str] = set()
    for record in (*answers, *authorities):
        if record.record_type != 2 or record.record_class != 1:
            continue
        name, next_offset = decode_name(packet, record.rdata_offset)
        if not name or next_offset != record.rdata_end:
            raise DnsProtocolError("invalid NS resource data")
        deduplication_key = name.lower()
        if deduplication_key not in seen:
            seen.add(deduplication_key)
            names.append(name)
    return names


def discover_authoritative_addresses(domain: str) -> list[str]:
    response = query_dns(
        _resolver_nameserver(),
        domain,
        2,
        recursion_desired=True,
        require_authoritative=False,
    )
    nameservers = _parse_ns_names(response)
    if not nameservers:
        raise DnsProtocolError("no authoritative nameservers")

    addresses: list[str] = []
    seen: set[str] = set()
    for nameserver in nameservers:
        try:
            address_info = socket.getaddrinfo(
                nameserver,
                53,
                socket.AF_UNSPEC,
                socket.SOCK_DGRAM,
            )
        except socket.gaierror:
            raise DnsProtocolError("unable to resolve authoritative nameserver") from None
        nameserver_addresses = [
            info[4][0]
            for info in address_info
            if info[0] in (socket.AF_INET, socket.AF_INET6)
        ]
        if not nameserver_addresses:
            raise DnsProtocolError("authoritative nameserver has no addresses")
        for address in nameserver_addresses:
            if address not in seen:
                seen.add(address)
                addresses.append(address)

    if not addresses:
        raise DnsProtocolError("no authoritative nameserver addresses")
    return addresses


def _query_authoritative_txt(
    address: str,
    name: str,
    timeout: float,
) -> set[str]:
    return parse_txt_answers(
        query_dns(
            address,
            name,
            16,
            timeout=timeout,
            require_authoritative=True,
            allow_name_error=True,
        )
    )


class AuthoritativeTxtVerifier:
    def __init__(
        self,
        *,
        nameserver_addresses: Iterable[str],
        query: Callable[[str, str, float], set[str]] = _query_authoritative_txt,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        addresses = tuple(dict.fromkeys(nameserver_addresses))
        if not addresses or any(not address for address in addresses):
            raise DnsProtocolError("authoritative nameserver addresses are required")
        self.nameserver_addresses = addresses
        self._query = query
        self._sleep = sleep
        self._monotonic = monotonic

    def wait_present(
        self,
        name: str,
        value: str,
        timeout: float = 180,
        interval: float = 5,
    ) -> None:
        self._wait(name, value, present=True, timeout=timeout, interval=interval)

    def wait_absent(
        self,
        name: str,
        value: str,
        timeout: float = 180,
        interval: float = 5,
    ) -> None:
        self._wait(name, value, present=False, timeout=timeout, interval=interval)

    def _wait(
        self,
        name: str,
        value: str,
        *,
        present: bool,
        timeout: float,
        interval: float,
    ) -> None:
        if timeout < 0 or interval < 0:
            raise DnsPropagationError("invalid DNS propagation timing")

        started_at = self._monotonic()
        deadline = started_at + timeout
        stage = "present" if present else "absent"
        last_observed_matches: dict[str, bool] = {}
        while True:
            current_reachable = 0
            total = len(self.nameserver_addresses)
            for address in self.nameserver_addresses:
                remaining = deadline - self._monotonic()
                if remaining <= 0:
                    raise DnsPropagationError("DNS propagation timed out")
                try:
                    answers = self._query(address, name, min(2.0, remaining))
                except DnsTransportError:
                    continue
                except DnsProtocolError:
                    current_reachable += 1
                    last_observed_matches[address] = False
                    continue
                current_reachable += 1
                last_observed_matches[address] = (value in answers) is present

            current_time = self._monotonic()
            elapsed = max(0.0, current_time - started_at)
            observed = len(last_observed_matches)
            matched = sum(
                1 for value_matches in last_observed_matches.values() if value_matches
            )
            print(
                f"dns-{stage} {matched}/{observed} "
                f"reachable={current_reachable}/{total} elapsed={elapsed:.1f}s",
                file=sys.stderr,
            )
            if observed > 0 and matched == observed and current_time <= deadline:
                return
            remaining = deadline - current_time
            if remaining <= 0:
                raise DnsPropagationError("DNS propagation timed out")
            self._sleep(min(interval, remaining))


@dataclasses.dataclass(frozen=True)
class Credentials:
    secret_id: str = dataclasses.field(repr=False)
    secret_key: str = dataclasses.field(repr=False)
    domain: str
    subdomain: str


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def utc_date(timestamp: int) -> str:
    return dt.datetime.fromtimestamp(timestamp, tz=dt.timezone.utc).strftime("%Y-%m-%d")


def build_canonical_request(*, host: str, content_type: str, payload: str) -> str:
    canonical_headers = (
        f"content-type:{content_type.strip().lower()}\n"
        f"host:{host.strip().lower()}\n"
    )
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
    if value not in DOMAIN_CHALLENGE_SUBDOMAINS:
        raise ConfigurationError("unexpected CERTBOT_DOMAIN")


def challenge_subdomain_for_domain(value: str) -> str:
    validate_certbot_domain(value)
    return DOMAIN_CHALLENGE_SUBDOMAINS[value]


def challenge_fqdn_for_domain(value: str) -> str:
    return f"{challenge_subdomain_for_domain(value)}.{EXPECTED_ROOT_DOMAIN}"


class DnsPodApiError(HookError):
    pass


class StateError(HookError):
    pass


@dataclasses.dataclass(frozen=True)
class ChallengeState:
    record_id: int
    validation_hash: str


def _is_positive_record_id(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _is_safe_api_identifier(value: object, *, allow_dot: bool = False) -> bool:
    if not isinstance(value, str) or not 1 <= len(value) <= 128:
        return False
    punctuation = "-_." if allow_dot else "-_"
    return all(
        character.isascii()
        and (character.isalnum() or character in punctuation)
        for character in value
    )


class DnsPodClient:
    def __init__(
        self,
        credentials: Credentials,
        *,
        transport: Callable[..., object] = urllib.request.urlopen,
        clock: Callable[[], float] = time.time,
        timeout: float = 10,
    ) -> None:
        if (
            credentials.domain != EXPECTED_ROOT_DOMAIN
            or credentials.subdomain not in DOMAIN_CHALLENGE_SUBDOMAINS.values()
            or not isinstance(credentials.secret_id, str)
            or not credentials.secret_id
            or not isinstance(credentials.secret_key, str)
            or not credentials.secret_key
        ):
            raise ConfigurationError("invalid DNSPod credentials")
        if (
            isinstance(timeout, bool)
            or not isinstance(timeout, (int, float))
            or timeout <= 0
        ):
            raise ConfigurationError("invalid DNSPod API timeout")
        self._credentials = credentials
        self._transport = transport
        self._clock = clock
        self._timeout = min(float(timeout), MAX_API_TIMEOUT)

    def create_txt(self, value: str) -> int:
        if not isinstance(value, str) or not value:
            raise DnsPodApiError("invalid DNS challenge value")
        response = self.call(
            "CreateRecord",
            {
                "Domain": EXPECTED_ROOT_DOMAIN,
                "SubDomain": self._credentials.subdomain,
                "RecordType": "TXT",
                "RecordLine": "默认",
                "Value": value,
                "TTL": 600,
            },
        )
        record_id = response.get("RecordId")
        if not _is_positive_record_id(record_id):
            raise DnsPodApiError("DNSPod API response was invalid")
        return record_id

    def delete_record(self, record_id: int) -> None:
        if not _is_positive_record_id(record_id):
            raise DnsPodApiError("invalid DNSPod record ID")
        self.call(
            "DeleteRecord",
            {
                "Domain": EXPECTED_ROOT_DOMAIN,
                "RecordId": record_id,
            },
        )

    def call(self, action: str, payload: dict[str, object]) -> dict[str, object]:
        self._validate_call(action, payload)
        payload_text = json.dumps(
            payload,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        payload_bytes = payload_text.encode("utf-8")
        try:
            timestamp = int(self._clock())
            authorization = build_authorization(
                secret_id=self._credentials.secret_id,
                secret_key=self._credentials.secret_key,
                service=API_SERVICE,
                host=API_HOST,
                content_type=CONTENT_TYPE,
                payload=payload_text,
                timestamp=timestamp,
            )
            request = urllib.request.Request(
                API_ENDPOINT,
                data=payload_bytes,
                headers={
                    "Authorization": authorization,
                    "Content-Type": CONTENT_TYPE,
                    "Host": API_HOST,
                    "X-TC-Action": action,
                    "X-TC-Timestamp": str(timestamp),
                    "X-TC-Version": API_VERSION,
                },
                method="POST",
            )
            response = self._transport(request, timeout=self._timeout)
        except Exception:
            raise DnsPodApiError("DNSPod API request failed") from None

        try:
            status = getattr(response, "status", 200)
            if (
                not isinstance(status, int)
                or isinstance(status, bool)
                or not 200 <= status < 300
            ):
                raise DnsPodApiError("DNSPod API request failed")
            body = response.read(MAX_API_RESPONSE_BYTES + 1)
            if not isinstance(body, bytes) or len(body) > MAX_API_RESPONSE_BYTES:
                raise DnsPodApiError("DNSPod API response was invalid")
        except DnsPodApiError:
            raise
        except Exception:
            raise DnsPodApiError("DNSPod API request failed") from None
        finally:
            try:
                response.close()
            except Exception:
                pass

        return self._parse_response(action, body)

    def _validate_call(self, action: str, payload: dict[str, object]) -> None:
        if not isinstance(payload, dict):
            raise DnsPodApiError("invalid DNSPod API request")
        if action == "CreateRecord":
            if (
                set(payload)
                != {
                    "Domain",
                    "SubDomain",
                    "RecordType",
                    "RecordLine",
                    "Value",
                    "TTL",
                }
                or payload.get("Domain") != EXPECTED_ROOT_DOMAIN
                or payload.get("SubDomain") != self._credentials.subdomain
                or payload.get("RecordType") != "TXT"
                or payload.get("RecordLine") != "默认"
                or not isinstance(payload.get("Value"), str)
                or not payload.get("Value")
                or payload.get("TTL") != 600
            ):
                raise DnsPodApiError("invalid DNSPod API request")
            return
        if action == "DeleteRecord":
            if (
                set(payload) != {"Domain", "RecordId"}
                or payload.get("Domain") != EXPECTED_ROOT_DOMAIN
                or not _is_positive_record_id(payload.get("RecordId"))
            ):
                raise DnsPodApiError("invalid DNSPod API request")
            return
        raise DnsPodApiError("unsupported DNSPod API action")

    def _parse_response(
        self,
        action: str,
        body: bytes,
    ) -> dict[str, object]:
        try:
            document = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise DnsPodApiError("DNSPod API response was invalid") from None
        if not isinstance(document, dict):
            raise DnsPodApiError("DNSPod API response was invalid")
        response = document.get("Response")
        if not isinstance(response, dict):
            raise DnsPodApiError("DNSPod API response was invalid")

        request_id = response.get("RequestId")
        if not _is_safe_api_identifier(request_id):
            raise DnsPodApiError("DNSPod API response was invalid")
        if "Error" in response:
            error = response.get("Error")
            if not isinstance(error, dict):
                raise DnsPodApiError("DNSPod API response was invalid")
            code = error.get("Code")
            if not _is_safe_api_identifier(code, allow_dot=True):
                raise DnsPodApiError("DNSPod API response was invalid")
            raise DnsPodApiError(
                f"DNSPod API {action} failed: code={code} "
                f"request={request_id[-8:]}"
            )
        return response


def _trusted_state_uid() -> int:
    # Production invokes the hook as root, while unprivileged local tests must own
    # their own state. In both cases the state owner must equal the effective UID.
    return os.geteuid()


def _validate_state_directory(state_dir: Path) -> Path:
    directory = Path(state_dir)
    if not directory.is_absolute():
        raise StateError("state directory must be absolute")
    try:
        metadata = os.lstat(directory)
    except OSError:
        raise StateError("state directory is unavailable") from None
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or metadata.st_uid != _trusted_state_uid()
        or stat.S_IMODE(metadata.st_mode) != 0o700
    ):
        raise StateError("state directory is unsafe")
    return directory


@contextlib.contextmanager
def _state_directory_lock(
    directory: Path,
    *,
    exclusive: bool,
) -> Iterable[None]:
    flags = (
        os.O_RDONLY
        | getattr(os, "O_DIRECTORY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        file_descriptor = os.open(directory, flags)
        metadata = os.fstat(file_descriptor)
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or metadata.st_uid != _trusted_state_uid()
            or stat.S_IMODE(metadata.st_mode) != 0o700
        ):
            raise StateError("state directory is unsafe")
        fcntl.flock(
            file_descriptor,
            fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH,
        )
    except StateError:
        if "file_descriptor" in locals():
            os.close(file_descriptor)
        raise
    except OSError:
        if "file_descriptor" in locals():
            try:
                os.close(file_descriptor)
            except OSError:
                pass
        raise StateError("unable to lock state directory") from None
    try:
        yield
    finally:
        try:
            fcntl.flock(file_descriptor, fcntl.LOCK_UN)
        finally:
            os.close(file_descriptor)


def state_path(state_dir: Path, domain: str, validation: str) -> Path:
    digest = sha256_hex(f"{domain}\0{validation}")
    return Path(state_dir) / f"{digest}.json"


def write_state(
    state_dir: Path,
    domain: str,
    validation: str,
    record_id: int,
) -> None:
    if not _is_positive_record_id(record_id):
        raise StateError("invalid challenge state record ID")
    directory = _validate_state_directory(state_dir)
    target = state_path(directory, domain, validation)
    body = json.dumps(
        {
            "record_id": record_id,
            "validation_hash": sha256_hex(validation),
        },
        separators=(",", ":"),
    ).encode("utf-8")
    with _state_directory_lock(directory, exclusive=True):
        file_descriptor = -1
        temporary_path: str | None = None
        try:
            file_descriptor, temporary_path = tempfile.mkstemp(
                prefix=".challenge-",
                suffix=".tmp",
                dir=directory,
            )
            os.fchmod(file_descriptor, 0o600)
            with os.fdopen(file_descriptor, "wb") as state_file:
                file_descriptor = -1
                state_file.write(body)
                state_file.flush()
                os.fsync(state_file.fileno())
            os.replace(temporary_path, target)
            temporary_path = None
        except Exception:
            if file_descriptor >= 0:
                try:
                    os.close(file_descriptor)
                except OSError:
                    pass
            if temporary_path is not None:
                try:
                    os.unlink(temporary_path)
                except OSError:
                    pass
            raise StateError("unable to write challenge state") from None


def _validate_state_file_metadata(metadata: os.stat_result) -> None:
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != _trusted_state_uid()
        or stat.S_IMODE(metadata.st_mode) != 0o600
        or metadata.st_nlink != 1
    ):
        raise StateError("challenge state file is unsafe")


def _read_state_unlocked(
    directory: Path,
    domain: str,
    validation: str,
) -> ChallengeState:
    path = state_path(directory, domain, validation)
    try:
        path_metadata = os.lstat(path)
    except OSError:
        raise StateError("challenge state is unavailable") from None
    _validate_state_file_metadata(path_metadata)

    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        file_descriptor = os.open(path, flags)
        try:
            opened_metadata = os.fstat(file_descriptor)
            _validate_state_file_metadata(opened_metadata)
            if (
                opened_metadata.st_dev != path_metadata.st_dev
                or opened_metadata.st_ino != path_metadata.st_ino
            ):
                raise StateError("challenge state changed during read")
            body = os.read(file_descriptor, MAX_STATE_BYTES + 1)
        finally:
            os.close(file_descriptor)
    except StateError:
        raise
    except OSError:
        raise StateError("unable to read challenge state") from None
    if len(body) > MAX_STATE_BYTES:
        raise StateError("challenge state is invalid")

    try:
        document = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise StateError("challenge state is invalid") from None
    if (
        not isinstance(document, dict)
        or set(document) != {"record_id", "validation_hash"}
        or not _is_positive_record_id(document.get("record_id"))
        or not isinstance(document.get("validation_hash"), str)
        or not hmac.compare_digest(
            document["validation_hash"],
            sha256_hex(validation),
        )
    ):
        raise StateError("challenge state is invalid")
    return ChallengeState(
        record_id=document["record_id"],
        validation_hash=document["validation_hash"],
    )


def read_state(
    state_dir: Path,
    domain: str,
    validation: str,
) -> ChallengeState:
    directory = _validate_state_directory(state_dir)
    with _state_directory_lock(directory, exclusive=False):
        return _read_state_unlocked(directory, domain, validation)


def _remove_matching_state(
    state_dir: Path,
    domain: str,
    validation: str,
    record_id: int,
) -> None:
    directory = _validate_state_directory(state_dir)
    with _state_directory_lock(directory, exclusive=True):
        current_state = _read_state_unlocked(directory, domain, validation)
        if current_state.record_id != record_id:
            raise StateError("challenge state record changed")
        try:
            os.unlink(state_path(directory, domain, validation))
        except OSError:
            raise StateError("unable to remove challenge state") from None


def _validate_challenge(domain: str, validation: str) -> None:
    validate_certbot_domain(domain)
    if not isinstance(validation, str) or not validation:
        raise ConfigurationError("missing CERTBOT_VALIDATION")


def run_auth(
    *,
    domain: str,
    validation: str,
    client: DnsPodClient,
    verifier: AuthoritativeTxtVerifier,
    state_dir: Path,
) -> None:
    _validate_challenge(domain, validation)
    record_id = client.create_txt(validation)
    try:
        write_state(state_dir, domain, validation, record_id)
    except StateError:
        try:
            client.delete_record(record_id)
        except HookError:
            pass
        raise

    try:
        verifier.wait_present(challenge_fqdn_for_domain(domain), validation)
    except DnsPropagationError:
        try:
            client.delete_record(record_id)
        except HookError:
            pass
        else:
            try:
                _remove_matching_state(
                    state_dir,
                    domain,
                    validation,
                    record_id,
                )
            except StateError:
                pass
        raise


def run_cleanup(
    *,
    domain: str,
    validation: str,
    client: DnsPodClient,
    verifier: AuthoritativeTxtVerifier,
    state_dir: Path,
) -> None:
    _validate_challenge(domain, validation)
    state = read_state(state_dir, domain, validation)
    client.delete_record(state.record_id)
    verifier.wait_absent(challenge_fqdn_for_domain(domain), validation)
    _remove_matching_state(
        state_dir,
        domain,
        validation,
        state.record_id,
    )


class _SafeArgumentParser(argparse.ArgumentParser):
    def error(self, _message: str) -> None:
        raise ConfigurationError("invalid hook arguments")


class _SinglePathAction(argparse.Action):
    def __call__(
        self,
        _parser: argparse.ArgumentParser,
        namespace: argparse.Namespace,
        values: Path,
        _option_string: str | None = None,
    ) -> None:
        if getattr(namespace, self.dest, None) is not None:
            raise ConfigurationError("invalid hook arguments")
        setattr(namespace, self.dest, values)


def _argument_parser() -> argparse.ArgumentParser:
    parser = _SafeArgumentParser(add_help=False, allow_abbrev=False)
    subparsers = parser.add_subparsers(dest="mode", required=True)
    for mode in ("auth", "cleanup"):
        command = subparsers.add_parser(
            mode,
            add_help=False,
            allow_abbrev=False,
        )
        command.add_argument(
            "--credentials",
            required=True,
            type=Path,
            action=_SinglePathAction,
        )
        command.add_argument(
            "--state-dir",
            required=True,
            type=Path,
            action=_SinglePathAction,
        )
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        arguments = _argument_parser().parse_args(argv)
        domain = os.environ.get("CERTBOT_DOMAIN")
        validation = os.environ.get("CERTBOT_VALIDATION")
        identifier = os.environ.get("CERTBOT_IDENTIFIER")
        if not domain or not validation:
            raise ConfigurationError("missing Certbot challenge environment")
        if identifier is not None and identifier != domain:
            raise ConfigurationError("CERTBOT_IDENTIFIER mismatch")
        _validate_challenge(domain, validation)
        _validate_state_directory(arguments.state_dir)

        credentials = dataclasses.replace(
            load_credentials(arguments.credentials),
            subdomain=challenge_subdomain_for_domain(domain),
        )
        addresses = discover_authoritative_addresses(EXPECTED_ROOT_DOMAIN)
        client = DnsPodClient(credentials)
        verifier = AuthoritativeTxtVerifier(
            nameserver_addresses=addresses,
            query=lambda address, name, timeout: _query_authoritative_txt(
                address,
                name,
                timeout,
            ),
        )
        workflow = run_auth if arguments.mode == "auth" else run_cleanup
        workflow(
            domain=domain,
            validation=validation,
            client=client,
            verifier=verifier,
            state_dir=arguments.state_dir,
        )
        return 0
    except HookError as error:
        print(f"dnspod hook failed: {error}", file=sys.stderr)
        return 1
    except Exception:
        print("dnspod hook failed", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
