#!/usr/bin/env python3
from __future__ import annotations

import dataclasses
import datetime as dt
import hashlib
import hmac
import secrets
import socket
import struct
import sys
import time
from pathlib import Path
from typing import Callable, Iterable


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


class DnsProtocolError(RuntimeError):
    pass


class DnsPropagationError(RuntimeError):
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
            response, _ = dns_socket.recvfrom(65535)
    except (OSError, TimeoutError):
        raise DnsProtocolError("DNS query failed") from None

    if len(response) < 12:
        raise DnsProtocolError("truncated DNS response header")
    response_id, response_flags = struct.unpack_from("!HH", response)
    if response_id != transaction_id:
        raise DnsProtocolError("DNS response transaction ID mismatch")
    if not response_flags & 0x8000:
        raise DnsProtocolError("DNS response flag is missing")
    if response_flags & 0x0200:
        raise DnsProtocolError("truncated DNS response")
    if response_flags & 0x000F:
        raise DnsProtocolError("DNS response returned an error")
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


def _query_authoritative_txt(address: str, name: str) -> set[str]:
    return parse_txt_answers(query_dns(address, name, 16))


class AuthoritativeTxtVerifier:
    def __init__(
        self,
        *,
        nameserver_addresses: Iterable[str],
        query: Callable[[str, str], set[str]] = _query_authoritative_txt,
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
        total = len(self.nameserver_addresses)
        stage = "present" if present else "absent"
        while True:
            passed = 0
            for address in self.nameserver_addresses:
                answers = self._query(address, name)
                if (value in answers) is present:
                    passed += 1

            elapsed = max(0.0, self._monotonic() - started_at)
            print(
                f"dns-{stage} {passed}/{total} elapsed={elapsed:.1f}s",
                file=sys.stderr,
            )
            if passed == total:
                return
            if elapsed >= timeout:
                raise DnsPropagationError(
                    f"DNS {stage} propagation timed out after {elapsed:.1f}s"
                )
            self._sleep(min(interval, max(0.0, timeout - elapsed)))


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
    if value != EXPECTED_DOMAIN:
        raise ConfigurationError("unexpected CERTBOT_DOMAIN")
