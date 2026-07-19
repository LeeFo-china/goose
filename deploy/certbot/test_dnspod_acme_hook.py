import io
import importlib.util
import itertools
import json
import os
import socket
import stat
import struct
import sys
import tempfile
import threading
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("dnspod_acme_hook.py")
SPEC = importlib.util.spec_from_file_location("dnspod_acme_hook", MODULE_PATH)
assert SPEC and SPEC.loader
hook = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = hook
SPEC.loader.exec_module(hook)

TEST_SECRET_ID = "AKID-test"
TEST_SECRET_KEY = "test-secret-key-do-not-print"
VALID_VALUES = {
    "TENCENTCLOUD_SECRET_ID": TEST_SECRET_ID,
    "TENCENTCLOUD_SECRET_KEY": TEST_SECRET_KEY,
    "DNSPOD_DOMAIN": "goodcms.cn",
    "DNSPOD_SUBDOMAIN": "_acme-challenge.www",
}


def encode_test_name(name: str) -> bytes:
    return b"".join(
        bytes((len(label),)) + label.encode("ascii") for label in name.split(".")
    ) + b"\x00"


def build_test_record(
    *,
    record_type: int,
    record_class: int,
    rdata: bytes,
    owner: bytes = b"\xc0\x0c",
) -> bytes:
    return owner + struct.pack("!HHIH", record_type, record_class, 60, len(rdata)) + rdata


def build_test_response(
    *,
    name: str = "_acme-challenge.www.goodcms.cn",
    question_type: int = 16,
    answers: tuple[bytes, ...] = (),
    authorities: tuple[bytes, ...] = (),
    transaction_id: int = 0x1234,
    flags: int = 0x8400,
) -> bytes:
    header = struct.pack(
        "!HHHHHH",
        transaction_id,
        flags,
        1,
        len(answers),
        len(authorities),
        0,
    )
    question = encode_test_name(name) + struct.pack("!HH", question_type, 1)
    return header + question + b"".join(answers) + b"".join(authorities)


def build_test_txt_rdata(*segments: bytes) -> bytes:
    return b"".join(bytes((len(segment),)) + segment for segment in segments)


class FakeDnsSocket:
    def __init__(
        self,
        *,
        flags: int,
        transaction_id_delta: int = 0,
        error=None,
        peer=None,
        response_question=None,
        question_count: int = 1,
    ):
        self.flags = flags
        self.transaction_id_delta = transaction_id_delta
        self.error = error
        self.peer = peer
        self.response_question = response_question
        self.question_count = question_count
        self.sent = b""
        self.destination = None
        self.timeout = None
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback):
        self.closed = True
        return False

    def settimeout(self, timeout):
        self.timeout = timeout

    def sendto(self, packet, destination):
        self.sent = packet
        self.destination = destination

    def recvfrom(self, _size):
        if self.error:
            raise self.error
        transaction_id = struct.unpack_from("!H", self.sent)[0]
        question = (
            self.sent[12:]
            if self.response_question is None
            else self.response_question
        )
        response = struct.pack(
            "!HHHHHH",
            (transaction_id + self.transaction_id_delta) & 0xFFFF,
            self.flags,
            self.question_count,
            0,
            0,
            0,
        ) + question
        return response, self.destination if self.peer is None else self.peer


class FakeHttpResponse:
    def __init__(self, body, *, status=200):
        self.body = body if isinstance(body, bytes) else body.encode("utf-8")
        self.status = status
        self.closed = False

    def read(self, _size=-1):
        return self.body

    def close(self):
        self.closed = True


class FakeTransport:
    def __init__(self, body, *, error=None, status=200):
        self.response = FakeHttpResponse(body, status=status)
        self.error = error
        self.calls = []

    def __call__(self, request, *, timeout):
        self.calls.append((request, timeout))
        if self.error is not None:
            raise self.error
        return self.response


class FakeClient:
    def __init__(self, *, record_id=731, create_error=None, delete_errors=()):
        self.record_id = record_id
        self.create_error = create_error
        self.delete_errors = iter(delete_errors)
        self.created = []
        self.deleted = []
        self.events = []

    def create_txt(self, value):
        self.created.append(value)
        self.events.append(("create", value))
        if self.create_error is not None:
            raise self.create_error
        return self.record_id

    def delete_record(self, record_id):
        self.deleted.append(record_id)
        self.events.append(("delete", record_id))
        error = next(self.delete_errors, None)
        if error is not None:
            raise error


class FakeVerifier:
    def __init__(self, *, present_error=None, absent_error=None, events=None):
        self.present_error = present_error
        self.absent_error = absent_error
        self.events = events if events is not None else []

    def wait_present(self, name, value):
        self.events.append(("wait_present", name, value))
        if self.present_error is not None:
            raise self.present_error

    def wait_absent(self, name, value):
        self.events.append(("wait_absent", name, value))
        if self.absent_error is not None:
            raise self.absent_error


class Tc3SigningTests(unittest.TestCase):
    def test_official_canonical_request_hash(self):
        payload = (
            '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], '
            '"Name": "instance-name"}]}'
        )

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

    def test_canonical_headers_strip_whitespace_and_lowercase_values(self):
        canonical = hook.build_canonical_request(
            host="  CvM.TencentCloudAPI.com\t",
            content_type="\tApplication/JSON; Charset=UTF-8 ",
            payload="{}",
        )

        expected_headers = (
            "content-type:application/json; charset=utf-8\n"
            "host:cvm.tencentcloudapi.com\n"
        )
        self.assertEqual(
            canonical,
            "\n".join(
                (
                    "POST",
                    "/",
                    "",
                    expected_headers,
                    "content-type;host",
                    hook.sha256_hex("{}"),
                )
            ),
        )

    def test_authorization_uses_complete_tc3_signature(self):
        payload = (
            '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], '
            '"Name": "instance-name"}]}'
        )

        authorization = hook.build_authorization(
            secret_id=TEST_SECRET_ID,
            secret_key=TEST_SECRET_KEY,
            service="cvm",
            host="cvm.tencentcloudapi.com",
            content_type="application/json; charset=utf-8",
            payload=payload,
            timestamp=1551113065,
        )

        self.assertEqual(
            authorization,
            "TC3-HMAC-SHA256 "
            "Credential=AKID-test/2019-02-25/cvm/tc3_request, "
            "SignedHeaders=content-type;host, "
            "Signature=bb2835e76b689296afd0993dfc43285b45c51df7da4086ec2bc4af33523f60ef",
        )
        self.assertNotIn(TEST_SECRET_KEY, authorization)


class CredentialTests(unittest.TestCase):
    def _write_credentials(self, path: Path, values=None, extra_lines=()):
        credential_values = VALID_VALUES if values is None else values
        lines = ["# DNSPod ACME credentials", ""]
        lines.extend(f"{key}={value}" for key, value in credential_values.items())
        lines.extend(extra_lines)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def _assert_invalid(self, path: Path):
        with self.assertRaises(hook.ConfigurationError) as caught:
            hook.load_credentials(path)
        self.assertNotIn(TEST_SECRET_KEY, str(caught.exception))

    def test_fixed_four_credentials_are_parsed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "credentials.env"
            self._write_credentials(path)

            credentials = hook.load_credentials(path)

        self.assertEqual(credentials.secret_id, TEST_SECRET_ID)
        self.assertEqual(credentials.secret_key, TEST_SECRET_KEY)
        self.assertEqual(credentials.domain, "goodcms.cn")
        self.assertEqual(credentials.subdomain, "_acme-challenge.www")

    def test_credentials_repr_hides_secret_id_and_secret_key(self):
        credentials = hook.Credentials(
            secret_id=TEST_SECRET_ID,
            secret_key=TEST_SECRET_KEY,
            domain="goodcms.cn",
            subdomain="_acme-challenge.www",
        )

        representation = repr(credentials)
        exposes_secret = any(
            secret in representation for secret in (TEST_SECRET_ID, TEST_SECRET_KEY)
        )
        self.assertFalse(exposes_secret, "Credentials repr exposes sensitive fields")

    def test_unknown_key_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "credentials.env"
            self._write_credentials(path, extra_lines=("EXTRA_KEY=forbidden",))

            self._assert_invalid(path)

    def test_each_missing_key_is_rejected(self):
        for missing_key in VALID_VALUES:
            with self.subTest(missing_key=missing_key), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "credentials.env"
                values = {key: value for key, value in VALID_VALUES.items() if key != missing_key}
                self._write_credentials(path, values=values)

                self._assert_invalid(path)

    def test_each_duplicate_key_is_rejected(self):
        for duplicate_key, value in VALID_VALUES.items():
            with self.subTest(duplicate_key=duplicate_key), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "credentials.env"
                self._write_credentials(path, extra_lines=(f"{duplicate_key}={value}",))

                self._assert_invalid(path)

    def test_each_empty_value_is_rejected(self):
        for empty_key in VALID_VALUES:
            with self.subTest(empty_key=empty_key), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "credentials.env"
                values = dict(VALID_VALUES)
                values[empty_key] = ""
                self._write_credentials(path, values=values)

                self._assert_invalid(path)

    def test_malformed_line_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "credentials.env"
            self._write_credentials(path, extra_lines=("not-an-assignment",))

            self._assert_invalid(path)

    def test_wrong_root_domain_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "credentials.env"
            values = dict(VALID_VALUES)
            values["DNSPOD_DOMAIN"] = "example.com"
            self._write_credentials(path, values=values)

            self._assert_invalid(path)

    def test_wrong_challenge_subdomain_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "credentials.env"
            values = dict(VALID_VALUES)
            values["DNSPOD_SUBDOMAIN"] = "_acme-challenge"
            self._write_credentials(path, values=values)

            self._assert_invalid(path)


class DomainValidationTests(unittest.TestCase):
    def test_configured_certbot_domains_are_accepted_and_mapped(self):
        expected = {
            "goodcms.cn": (
                "_acme-challenge",
                "_acme-challenge.goodcms.cn",
            ),
            "www.goodcms.cn": (
                "_acme-challenge.www",
                "_acme-challenge.www.goodcms.cn",
            ),
            "admin.goodcms.cn": (
                "_acme-challenge.admin",
                "_acme-challenge.admin.goodcms.cn",
            ),
            "api.goodcms.cn": (
                "_acme-challenge.api",
                "_acme-challenge.api.goodcms.cn",
            ),
            "h5.goodcms.cn": (
                "_acme-challenge.h5",
                "_acme-challenge.h5.goodcms.cn",
            ),
            "sock.goodcms.cn": (
                "_acme-challenge.sock",
                "_acme-challenge.sock.goodcms.cn",
            ),
            "supabase.goodcms.cn": (
                "_acme-challenge.supabase",
                "_acme-challenge.supabase.goodcms.cn",
            ),
        }
        for domain, (subdomain, fqdn) in expected.items():
            with self.subTest(domain=domain):
                hook.validate_certbot_domain(domain)
                self.assertEqual(hook.challenge_subdomain_for_domain(domain), subdomain)
                self.assertEqual(hook.challenge_fqdn_for_domain(domain), fqdn)

    def test_domain_variants_are_rejected(self):
        invalid_domains = (
            "assets.goodcms.cn",
            "www.goodcms.cn.",
            "WWW.goodcms.cn",
        )
        for value in invalid_domains:
            with self.subTest(value=value), self.assertRaises(hook.ConfigurationError):
                hook.validate_certbot_domain(value)


class DnsProtocolTests(unittest.TestCase):
    def test_encode_qname_matches_dns_wire_format(self):
        self.assertEqual(
            hook.encode_qname("_acme-challenge.www.goodcms.cn"),
            b"\x0f_acme-challenge\x03www\x07goodcms\x02cn\x00",
        )

    def test_encode_qname_accepts_one_trailing_dot(self):
        self.assertEqual(
            hook.encode_qname("www.goodcms.cn."),
            encode_test_name("www.goodcms.cn"),
        )

    def test_encode_qname_rejects_empty_labels(self):
        for value in ("", ".", ".goodcms.cn", "goodcms..cn"):
            with self.subTest(value=value), self.assertRaises(hook.DnsProtocolError):
                hook.encode_qname(value)

    def test_encode_qname_rejects_oversized_label(self):
        value = f"{'a' * 64}.goodcms.cn"

        with self.assertRaises(hook.DnsProtocolError):
            hook.encode_qname(value)

    def test_encode_qname_rejects_name_longer_than_253_bytes(self):
        value = ".".join(("a" * 63, "b" * 63, "c" * 63, "d" * 62))
        self.assertGreater(len(value.encode("ascii")), 253)

        with self.assertRaises(hook.DnsProtocolError):
            hook.encode_qname(value)

    def test_encode_qname_rejects_non_ascii_labels(self):
        with self.assertRaises(hook.DnsProtocolError):
            hook.encode_qname("www.例子.cn")

    def test_decode_name_reads_plain_and_compressed_names(self):
        wire_name = encode_test_name("www.goodcms.cn")
        packet = wire_name + b"\xc0\x00"

        self.assertEqual(
            hook.decode_name(packet, 0),
            ("www.goodcms.cn", len(wire_name)),
        )
        self.assertEqual(
            hook.decode_name(packet, len(wire_name)),
            ("www.goodcms.cn", len(packet)),
        )

    def test_decode_name_rejects_pointer_loop_and_out_of_bounds_pointer(self):
        for packet in (b"\xc0\x00", b"\xc0\x10"):
            with self.subTest(packet=packet), self.assertRaises(hook.DnsProtocolError):
                hook.decode_name(packet, 0)

    def test_parse_txt_answers_collects_only_in_txt_and_joins_segments(self):
        answers = (
            build_test_record(
                record_type=16,
                record_class=1,
                rdata=build_test_txt_rdata(b"challenge-", b"a"),
            ),
            build_test_record(
                record_type=16,
                record_class=1,
                rdata=build_test_txt_rdata(b"challenge-b"),
            ),
            build_test_record(
                record_type=16,
                record_class=3,
                rdata=build_test_txt_rdata(b"wrong-class"),
            ),
            build_test_record(
                record_type=1,
                record_class=1,
                rdata=socket.inet_aton("192.0.2.1"),
            ),
        )

        self.assertEqual(
            hook.parse_txt_answers(build_test_response(answers=answers)),
            {"challenge-a", "challenge-b"},
        )

    def test_parse_txt_answers_rejects_truncated_or_malformed_packets(self):
        valid_answer = build_test_record(
            record_type=16,
            record_class=1,
            rdata=build_test_txt_rdata(b"challenge"),
        )
        valid_packet = build_test_response(answers=(valid_answer,))
        malformed_segment = build_test_record(
            record_type=16,
            record_class=1,
            rdata=b"\x05abc",
        )
        invalid_utf8 = build_test_record(
            record_type=16,
            record_class=1,
            rdata=b"\x01\xff",
        )
        packets = (
            b"\x00" * 11,
            valid_packet[:-1],
            build_test_response(answers=(malformed_segment,)),
            build_test_response(answers=(invalid_utf8,)),
        )

        for packet in packets:
            with self.subTest(packet=packet), self.assertRaises(hook.DnsProtocolError):
                hook.parse_txt_answers(packet)


class DnsQueryTests(unittest.TestCase):
    def _assert_query_rejected(self, fake_socket):
        with mock.patch.object(hook.socket, "socket", return_value=fake_socket):
            with self.assertRaises(hook.DnsProtocolError):
                hook.query_dns("192.0.2.53", "www.goodcms.cn", 16)

    def test_query_rejects_transaction_id_mismatch(self):
        self._assert_query_rejected(
            FakeDnsSocket(flags=0x8000, transaction_id_delta=1)
        )

    def test_query_rejects_response_without_qr_flag(self):
        self._assert_query_rejected(FakeDnsSocket(flags=0x0000))

    def test_query_rejects_truncated_response(self):
        self._assert_query_rejected(FakeDnsSocket(flags=0x8200))

    def test_query_rejects_nonzero_rcode(self):
        self._assert_query_rejected(FakeDnsSocket(flags=0x8003))

    def test_authoritative_txt_query_treats_name_error_as_absent(self):
        fake_socket = FakeDnsSocket(flags=0x8403)
        with mock.patch.object(hook.socket, "socket", return_value=fake_socket):
            self.assertEqual(
                hook._query_authoritative_txt(
                    "192.0.2.53",
                    "_acme-challenge.www.goodcms.cn",
                    2.0,
                ),
                set(),
            )

    def test_query_rejects_wrong_peer(self):
        self._assert_query_rejected(
            FakeDnsSocket(flags=0x8000, peer=("192.0.2.54", 53))
        )

    def test_query_rejects_mismatched_or_non_in_question(self):
        expected_name = encode_test_name("www.goodcms.cn")
        cases = (
            {
                "response_question": encode_test_name("other.goodcms.cn")
                + struct.pack("!HH", 16, 1)
            },
            {"response_question": expected_name + struct.pack("!HH", 2, 1)},
            {"response_question": expected_name + struct.pack("!HH", 16, 3)},
            {"question_count": 2},
        )
        for options in cases:
            with self.subTest(options=options):
                self._assert_query_rejected(FakeDnsSocket(flags=0x8000, **options))

    def test_query_rejects_non_query_opcode(self):
        self._assert_query_rejected(FakeDnsSocket(flags=0x8800))

    def test_direct_query_requires_authoritative_answer_flag(self):
        fake_socket = FakeDnsSocket(flags=0x8000)
        with mock.patch.object(hook.socket, "socket", return_value=fake_socket):
            with self.assertRaises(hook.DnsProtocolError):
                hook.query_dns(
                    "192.0.2.53",
                    "www.goodcms.cn",
                    16,
                    require_authoritative=True,
                )

    def test_query_ipv4_success_uses_udp_53_and_matching_16_bit_id(self):
        fake_socket = FakeDnsSocket(flags=0x8400)
        socket_arguments = []
        requested_bit_counts = []

        def socket_factory(family, socket_type):
            socket_arguments.append((family, socket_type))
            return fake_socket

        def fake_randbits(bit_count):
            requested_bit_counts.append(bit_count)
            return 0xBEEF

        with (
            mock.patch.object(hook.socket, "socket", side_effect=socket_factory),
            mock.patch.object(hook.secrets, "randbits", side_effect=fake_randbits),
        ):
            response = hook.query_dns(
                "192.0.2.53",
                "www.goodcms.cn",
                16,
                require_authoritative=True,
            )

        request_id = struct.unpack_from("!H", fake_socket.sent)[0]
        response_id = struct.unpack_from("!H", response)[0]
        self.assertEqual(request_id, 0xBEEF)
        self.assertEqual(response_id, request_id)
        self.assertEqual(requested_bit_counts, [16])
        self.assertEqual(socket_arguments, [(socket.AF_INET, socket.SOCK_DGRAM)])
        self.assertEqual(fake_socket.destination, ("192.0.2.53", 53))
        self.assertEqual(fake_socket.timeout, 2.0)
        self.assertTrue(fake_socket.closed)

    def test_query_sets_rd_only_when_requested(self):
        for recursion_desired in (False, True):
            with self.subTest(recursion_desired=recursion_desired):
                fake_socket = FakeDnsSocket(flags=0x8000)
                with mock.patch.object(
                    hook.socket,
                    "socket",
                    return_value=fake_socket,
                ):
                    hook.query_dns(
                        "192.0.2.53",
                        "www.goodcms.cn",
                        2,
                        recursion_desired=recursion_desired,
                    )

                request_flags = struct.unpack_from("!H", fake_socket.sent, 2)[0]
                self.assertEqual(
                    bool(request_flags & 0x0100),
                    recursion_desired,
                )

    def test_query_ipv6_success_uses_ipv6_socket_and_destination(self):
        fake_socket = FakeDnsSocket(flags=0x8400)
        socket_arguments = []

        def socket_factory(family, socket_type):
            socket_arguments.append((family, socket_type))
            return fake_socket

        with mock.patch.object(
            hook.socket,
            "socket",
            side_effect=socket_factory,
        ):
            hook.query_dns(
                "2001:db8::53",
                "www.goodcms.cn",
                16,
                require_authoritative=True,
            )

        self.assertEqual(socket_arguments, [(socket.AF_INET6, socket.SOCK_DGRAM)])
        self.assertEqual(fake_socket.destination, ("2001:db8::53", 53, 0, 0))
        self.assertTrue(fake_socket.closed)

    def test_query_closes_socket_on_timeout_and_os_error_without_exposing_name(self):
        query_name = "sensitive-query.goodcms.cn"
        for error in (socket.timeout(), OSError("network failure")):
            with self.subTest(error=type(error).__name__):
                fake_socket = FakeDnsSocket(flags=0x8000, error=error)
                with mock.patch.object(
                    hook.socket,
                    "socket",
                    return_value=fake_socket,
                ):
                    with self.assertRaises(hook.DnsProtocolError) as caught:
                        hook.query_dns("192.0.2.53", query_name, 16)

                self.assertIsInstance(caught.exception, hook.DnsTransportError)
                self.assertTrue(fake_socket.closed)
                self.assertNotIn(query_name, str(caught.exception))


class AuthoritativeDiscoveryTests(unittest.TestCase):
    def test_discovers_deduplicated_ns_and_ipv4_ipv6_addresses(self):
        ns1_rdata = encode_test_name("ns1.goodcms.cn")
        ns2_rdata = encode_test_name("ns2.goodcms.cn")
        response = build_test_response(
            name="goodcms.cn",
            question_type=2,
            answers=(
                build_test_record(record_type=2, record_class=1, rdata=ns1_rdata),
                build_test_record(record_type=2, record_class=1, rdata=ns1_rdata),
            ),
            authorities=(
                build_test_record(record_type=2, record_class=1, rdata=ns2_rdata),
            ),
        )
        calls = {}

        def fake_getaddrinfo(name, _port, _family, _socket_type):
            calls[name] = calls.get(name, 0) + 1
            if name == "ns1.goodcms.cn" and calls[name] == 1:
                return [
                    (socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("192.0.2.1", 53)),
                    (socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("192.0.2.1", 53)),
                    (
                        socket.AF_INET6,
                        socket.SOCK_DGRAM,
                        17,
                        "",
                        ("2001:db8::1", 53, 0, 0),
                    ),
                ]
            if name == "ns2.goodcms.cn":
                return [
                    (socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("192.0.2.1", 53)),
                    (socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("192.0.2.2", 53)),
                ]
            return [
                (socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("198.51.100.99", 53))
            ]

        with (
            mock.patch.object(
                hook.Path,
                "read_text",
                return_value="nameserver 192.0.2.53\n",
            ),
            mock.patch.object(hook, "query_dns", return_value=response),
            mock.patch.object(hook.socket, "getaddrinfo", side_effect=fake_getaddrinfo),
        ):
            addresses = hook.discover_authoritative_addresses("goodcms.cn")

        self.assertEqual(
            addresses,
            ["192.0.2.1", "2001:db8::1", "192.0.2.2"],
        )

    def test_uses_first_valid_resolver_for_recursive_ns_query(self):
        response = build_test_response(
            name="goodcms.cn",
            question_type=2,
            answers=(
                build_test_record(
                    record_type=2,
                    record_class=1,
                    rdata=encode_test_name("ns1.goodcms.cn"),
                ),
            ),
        )
        queries = []

        def fake_query(
            address,
            name,
            qtype,
            timeout=2.0,
            *,
            recursion_desired=False,
            require_authoritative=False,
        ):
            queries.append(
                (
                    address,
                    name,
                    qtype,
                    timeout,
                    recursion_desired,
                    require_authoritative,
                )
            )
            return response

        resolver_config = """\
# nameserver 192.0.2.50
nameserver not-an-address
search goodcms.cn
nameserver 192.0.2.53 # first valid resolver
nameserver 192.0.2.54
"""
        with (
            mock.patch.object(hook.Path, "read_text", return_value=resolver_config),
            mock.patch.object(hook, "query_dns", side_effect=fake_query),
            mock.patch.object(
                hook.socket,
                "getaddrinfo",
                return_value=[
                    (socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("192.0.2.1", 53))
                ],
            ),
        ):
            addresses = hook.discover_authoritative_addresses("goodcms.cn")

        self.assertEqual(addresses, ["192.0.2.1"])
        self.assertEqual(
            queries,
            [("192.0.2.53", "goodcms.cn", 2, 2.0, True, False)],
        )

    def test_discovery_fails_closed_without_ns_or_nameserver_addresses(self):
        no_ns_response = build_test_response(name="goodcms.cn", question_type=2)
        ns_without_addresses_response = build_test_response(
            name="goodcms.cn",
            question_type=2,
            answers=(
                build_test_record(
                    record_type=2,
                    record_class=1,
                    rdata=encode_test_name("ns1.goodcms.cn"),
                ),
            ),
        )
        for response in (no_ns_response, ns_without_addresses_response):
            with self.subTest(has_ns=response is ns_without_addresses_response):
                with (
                    mock.patch.object(
                        hook.Path,
                        "read_text",
                        return_value="nameserver 192.0.2.53\n",
                    ),
                    mock.patch.object(hook, "query_dns", return_value=response),
                    mock.patch.object(hook.socket, "getaddrinfo", return_value=[]),
                ):
                    with self.assertRaises(hook.DnsProtocolError):
                        hook.discover_authoritative_addresses("goodcms.cn")


class AuthoritativeTxtVerifierTests(unittest.TestCase):
    def test_constructor_rejects_empty_addresses_and_deduplicates(self):
        with self.assertRaises(hook.DnsProtocolError):
            hook.AuthoritativeTxtVerifier(nameserver_addresses=())

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1", "192.0.2.1", "192.0.2.2")
        )
        self.assertEqual(
            verifier.nameserver_addresses,
            ("192.0.2.1", "192.0.2.2"),
        )

    def test_wait_present_polls_until_every_address_contains_value(self):
        answers = {
            "192.0.2.1": iter(({"token"}, {"token"})),
            "192.0.2.2": iter((set(), {"token"})),
        }
        queried = []

        def query(address, _name, _timeout):
            queried.append(address)
            return next(answers[address])

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1", "192.0.2.2"),
            query=query,
            sleep=lambda _seconds: None,
            monotonic=itertools.count().__next__,
        )

        verifier.wait_present(
            "_acme-challenge.www.goodcms.cn",
            "token",
            timeout=10,
            interval=0,
        )

        self.assertEqual(
            queried,
            ["192.0.2.1", "192.0.2.2", "192.0.2.1", "192.0.2.2"],
        )

    def test_wait_absent_polls_until_every_address_excludes_value(self):
        answers = {
            "192.0.2.1": iter((set(), set())),
            "192.0.2.2": iter(({"token"}, set())),
        }
        queried = []

        def query(address, _name, _timeout):
            queried.append(address)
            return next(answers[address])

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1", "192.0.2.2"),
            query=query,
            sleep=lambda _seconds: None,
            monotonic=itertools.count().__next__,
        )

        verifier.wait_absent(
            "_acme-challenge.www.goodcms.cn",
            "token",
            timeout=10,
            interval=0,
        )

        self.assertEqual(
            queried,
            ["192.0.2.1", "192.0.2.2", "192.0.2.1", "192.0.2.2"],
        )

    def test_wait_retries_dns_protocol_error_then_succeeds(self):
        query_timeouts = []

        def query(_address, _name, timeout):
            query_timeouts.append(timeout)
            if len(query_timeouts) == 1:
                raise hook.DnsTransportError("temporary DNS timeout")
            return {"token"}

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1",),
            query=query,
            sleep=lambda _seconds: None,
            monotonic=itertools.count(0, 0.1).__next__,
        )

        verifier.wait_present(
            "_acme-challenge.www.goodcms.cn",
            "token",
            timeout=1,
            interval=0,
        )

        self.assertEqual(len(query_timeouts), 2)

    def test_wait_present_accepts_reachable_authorities_when_some_addresses_error(self):
        queried = []

        def query(address, _name, _timeout):
            queried.append(address)
            if address == "192.0.2.2":
                raise hook.DnsTransportError("DNS timeout")
            return {"token"}

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1", "192.0.2.2"),
            query=query,
            sleep=lambda _seconds: None,
            monotonic=itertools.count(0, 0.1).__next__,
        )

        verifier.wait_present(
            "_acme-challenge.www.goodcms.cn",
            "token",
            timeout=1,
            interval=0,
        )

        self.assertEqual(queried, ["192.0.2.1", "192.0.2.2"])

    def test_reachable_authority_without_value_still_blocks_propagation(self):
        def query(address, _name, _timeout):
            if address == "192.0.2.2":
                raise hook.DnsTransportError("DNS timeout")
            return set()

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1", "192.0.2.2"),
            query=query,
            sleep=lambda _seconds: None,
            monotonic=iter((0, 0, 0.5, 0.5, 2)).__next__,
        )

        with self.assertRaises(hook.DnsPropagationError):
            verifier.wait_present(
                "_acme-challenge.www.goodcms.cn",
                "token",
                timeout=1,
                interval=0,
            )

    def test_reachable_mismatch_is_not_forgotten_after_later_timeout(self):
        calls = {"192.0.2.1": 0, "192.0.2.2": 0}

        def query(address, _name, _timeout):
            calls[address] += 1
            if address == "192.0.2.1":
                if calls[address] == 1:
                    return set()
                raise hook.DnsTransportError("DNS timeout")
            return {"token"}

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1", "192.0.2.2"),
            query=query,
            sleep=lambda _seconds: None,
            monotonic=itertools.count(0, 0.1).__next__,
        )

        with self.assertRaises(hook.DnsPropagationError):
            verifier.wait_present(
                "_acme-challenge.www.goodcms.cn",
                "token",
                timeout=1,
                interval=0,
            )

    def test_dns_protocol_response_error_blocks_propagation(self):
        def query(address, _name, _timeout):
            if address == "192.0.2.2":
                raise hook.DnsProtocolError("DNS response returned an error")
            return {"token"}

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1", "192.0.2.2"),
            query=query,
            sleep=lambda _seconds: None,
            monotonic=itertools.count(0, 0.1).__next__,
        )

        with self.assertRaises(hook.DnsPropagationError):
            verifier.wait_present(
                "_acme-challenge.www.goodcms.cn",
                "token",
                timeout=1,
                interval=0,
            )

    def test_continuous_dns_errors_raise_generic_timeout_without_secrets(self):
        secret_value = "secret-test-token"

        def query(_address, _name, _timeout):
            raise hook.DnsProtocolError(f"internal failure: {secret_value}")

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1",),
            query=query,
            sleep=lambda _seconds: None,
            monotonic=itertools.count(0, 0.25).__next__,
        )
        stderr = io.StringIO()

        with redirect_stderr(stderr):
            with self.assertRaises(hook.DnsPropagationError) as caught:
                verifier.wait_present(
                    "_acme-challenge.www.goodcms.cn",
                    secret_value,
                    timeout=1,
                    interval=0,
                )

        self.assertEqual(str(caught.exception), "DNS propagation timed out")
        self.assertNotIn(secret_value, stderr.getvalue())

    def test_deadline_exhaustion_stops_before_later_authority(self):
        queried = []

        def query(address, _name, _timeout):
            queried.append(address)
            return set()

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1", "192.0.2.2"),
            query=query,
            sleep=lambda _seconds: None,
            monotonic=iter((0.0, 0.5, 1.0, 1.0)).__next__,
        )

        with self.assertRaises(hook.DnsPropagationError):
            verifier.wait_present(
                "_acme-challenge.www.goodcms.cn",
                "token",
                timeout=1,
                interval=0,
            )

        self.assertEqual(queried, ["192.0.2.1"])

    def test_query_timeout_is_capped_to_remaining_budget(self):
        query_timeouts = []

        def query(_address, _name, timeout):
            query_timeouts.append(timeout)
            return {"token"}

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1",),
            query=query,
            sleep=lambda _seconds: None,
            monotonic=iter((0.0, 0.75, 0.8)).__next__,
        )

        verifier.wait_present(
            "_acme-challenge.www.goodcms.cn",
            "token",
            timeout=1,
            interval=0,
        )

        self.assertEqual(query_timeouts, [0.25])

    def test_sleep_is_capped_and_does_not_allow_query_after_deadline(self):
        queried = []
        sleeps = []

        def query(address, _name, _timeout):
            queried.append(address)
            return set()

        verifier = hook.AuthoritativeTxtVerifier(
            nameserver_addresses=("192.0.2.1",),
            query=query,
            sleep=sleeps.append,
            monotonic=iter((0.0, 0.25, 0.5, 1.0)).__next__,
        )

        with self.assertRaises(hook.DnsPropagationError):
            verifier.wait_present(
                "_acme-challenge.www.goodcms.cn",
                "token",
                timeout=1,
                interval=5,
            )

        self.assertEqual(queried, ["192.0.2.1"])
        self.assertEqual(sleeps, [0.5])

    def test_wait_present_and_absent_time_out_without_exposing_value(self):
        secret_value = "secret-test-token"
        cases = (
            ("wait_present", lambda _address, _name, _timeout: set()),
            ("wait_absent", lambda _address, _name, _timeout: {secret_value}),
        )

        for method_name, query in cases:
            with self.subTest(method=method_name):
                verifier = hook.AuthoritativeTxtVerifier(
                    nameserver_addresses=("192.0.2.1",),
                    query=query,
                    sleep=lambda _seconds: None,
                    monotonic=iter((0, 0, 2)).__next__,
                )
                stderr = io.StringIO()
                with redirect_stderr(stderr):
                    with self.assertRaises(hook.DnsPropagationError) as caught:
                        getattr(verifier, method_name)(
                            "_acme-challenge.www.goodcms.cn",
                            secret_value,
                            timeout=1,
                            interval=0,
                        )

                self.assertNotIn(secret_value, stderr.getvalue())
                self.assertNotIn(secret_value, str(caught.exception))


class DnsPodClientTests(unittest.TestCase):
    def make_credentials(self, *, subdomain="_acme-challenge.www"):
        return hook.Credentials(
            TEST_SECRET_ID,
            TEST_SECRET_KEY,
            "goodcms.cn",
            subdomain,
        )

    def test_create_txt_signs_and_sends_the_exact_fixed_json_bytes(self):
        validation = "validation-敏感值"
        response = json.dumps(
            {"Response": {"RecordId": 731, "RequestId": "request-12345678"}}
        )
        transport = FakeTransport(response)
        signed = []

        def fake_authorization(**arguments):
            signed.append(arguments)
            return "TC3-HMAC-SHA256 safe-authorization"

        client = hook.DnsPodClient(
            self.make_credentials(),
            transport=transport,
            clock=lambda: 1_700_000_000.9,
            timeout=999,
        )
        with mock.patch.object(
            hook,
            "build_authorization",
            side_effect=fake_authorization,
        ):
            record_id = client.create_txt(validation)

        self.assertEqual(record_id, 731)
        self.assertEqual(len(transport.calls), 1)
        request, timeout = transport.calls[0]
        expected_payload = {
            "Domain": "goodcms.cn",
            "SubDomain": "_acme-challenge.www",
            "RecordType": "TXT",
            "RecordLine": "默认",
            "Value": validation,
            "TTL": 600,
        }
        expected_bytes = json.dumps(
            expected_payload,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        self.assertEqual(request.full_url, "https://dnspod.tencentcloudapi.com/")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.data, expected_bytes)
        self.assertEqual(signed[0]["payload"].encode("utf-8"), request.data)
        self.assertEqual(signed[0]["service"], "dnspod")
        self.assertEqual(signed[0]["timestamp"], 1_700_000_000)
        self.assertEqual(timeout, 10)
        headers = {name.lower(): value for name, value in request.header_items()}
        self.assertEqual(
            set(headers),
            {
                "authorization",
                "content-type",
                "host",
                "x-tc-action",
                "x-tc-timestamp",
                "x-tc-version",
            },
        )
        self.assertEqual(headers["host"], "dnspod.tencentcloudapi.com")
        self.assertEqual(headers["x-tc-action"], "CreateRecord")
        self.assertEqual(headers["x-tc-version"], "2021-03-23")
        self.assertEqual(headers["content-type"], "application/json; charset=utf-8")
        self.assertTrue(transport.response.closed)

    def test_create_txt_uses_the_configured_challenge_subdomain(self):
        response = json.dumps(
            {"Response": {"RecordId": 731, "RequestId": "request-12345678"}}
        )
        transport = FakeTransport(response)
        client = hook.DnsPodClient(
            self.make_credentials(subdomain="_acme-challenge.api"),
            transport=transport,
        )

        client.create_txt("validation-sensitive")

        request, _timeout = transport.calls[0]
        self.assertEqual(json.loads(request.data)["SubDomain"], "_acme-challenge.api")

    def test_delete_record_sends_only_fixed_domain_and_positive_record_id(self):
        response = json.dumps({"Response": {"RequestId": "request-12345678"}})
        transport = FakeTransport(response)
        client = hook.DnsPodClient(self.make_credentials(), transport=transport)

        client.delete_record(731)

        request, _timeout = transport.calls[0]
        self.assertEqual(
            json.loads(request.data),
            {"Domain": "goodcms.cn", "RecordId": 731},
        )
        headers = {name.lower(): value for name, value in request.header_items()}
        self.assertEqual(headers["x-tc-action"], "DeleteRecord")

    def test_delete_record_rejects_non_positive_integer_ids_without_transport(self):
        transport = FakeTransport(
            json.dumps({"Response": {"RequestId": "request-12345678"}})
        )
        client = hook.DnsPodClient(self.make_credentials(), transport=transport)

        for record_id in (True, False, 0, -1, "731", 731.0, None):
            with self.subTest(record_id=record_id), self.assertRaises(
                hook.DnsPodApiError
            ):
                client.delete_record(record_id)

        self.assertEqual(transport.calls, [])

    def test_call_rejects_all_other_api_actions(self):
        transport = FakeTransport("{}")
        client = hook.DnsPodClient(self.make_credentials(), transport=transport)

        with self.assertRaises(hook.DnsPodApiError):
            client.call("DescribeRecordList", {})

        self.assertEqual(transport.calls, [])

    def test_api_response_fails_closed_for_malformed_shapes_and_record_ids(self):
        bodies = (
            b"not-json",
            b"[]",
            b"{}",
            json.dumps({"Response": []}),
            json.dumps({"Response": {"RecordId": 731}}),
            json.dumps(
                {"Response": {"RecordId": 731, "RequestId": 12345678}}
            ),
            json.dumps(
                {"Response": {"RecordId": 731, "RequestId": "unsafe/value"}}
            ),
            json.dumps({"Response": {"RequestId": "request-12345678"}}),
            json.dumps(
                {"Response": {"RecordId": True, "RequestId": "request-12345678"}}
            ),
            json.dumps(
                {"Response": {"RecordId": 0, "RequestId": "request-12345678"}}
            ),
            json.dumps(
                {"Response": {"RecordId": "731", "RequestId": "request-12345678"}}
            ),
        )
        for body in bodies:
            with self.subTest(body=body):
                client = hook.DnsPodClient(
                    self.make_credentials(),
                    transport=FakeTransport(body),
                )
                with self.assertRaises(hook.DnsPodApiError):
                    client.create_txt("validation-sensitive")

    def test_http_transport_and_api_errors_are_redacted(self):
        validation = "validation-sensitive"
        authorization = "Authorization-sensitive"
        secret_values = (
            TEST_SECRET_ID,
            TEST_SECRET_KEY,
            validation,
            authorization,
        )
        api_body = json.dumps(
            {
                "Response": {
                    "Error": {
                        "Code": "AuthFailure.SignatureFailure",
                        "Message": " ".join(secret_values),
                    },
                    "RequestId": "request-prefix-12345678",
                    "Debug": "complete-response-sensitive",
                }
            }
        )
        cases = (
            FakeTransport(api_body),
            FakeTransport(
                b"",
                error=urllib.error.HTTPError(
                    hook.API_ENDPOINT,
                    500,
                    " ".join(secret_values),
                    None,
                    io.BytesIO(b""),
                ),
            ),
            FakeTransport(
                b"",
                error=urllib.error.URLError(" ".join(secret_values)),
            ),
        )
        for transport in cases:
            with self.subTest(error=type(transport.error).__name__):
                try:
                    client = hook.DnsPodClient(
                        self.make_credentials(),
                        transport=transport,
                    )
                    stdout = io.StringIO()
                    stderr = io.StringIO()
                    with redirect_stdout(stdout), redirect_stderr(stderr):
                        with self.assertRaises(hook.DnsPodApiError) as caught:
                            client.create_txt(validation)
                finally:
                    if hasattr(transport.error, "close"):
                        transport.error.close()

                combined = stdout.getvalue() + stderr.getvalue() + str(caught.exception)
                for secret in secret_values:
                    self.assertNotIn(secret, combined)
                self.assertNotIn("complete-response-sensitive", combined)

        with self.assertRaises(hook.DnsPodApiError) as safe_error_context:
            hook.DnsPodClient(
                self.make_credentials(),
                transport=FakeTransport(api_body),
            ).create_txt(validation)
        safe_error = str(safe_error_context.exception)
        self.assertIn("AuthFailure.SignatureFailure", safe_error)
        self.assertIn("12345678", safe_error)
        self.assertNotIn("request-prefix", safe_error)

    def test_error_response_rejects_unsafe_code_or_request_id_without_echoing_it(self):
        unsafe_values = ("unsafe code validation-sensitive", "unsafe/request")
        bodies = (
            {
                "Response": {
                    "Error": {"Code": unsafe_values[0], "Message": "ignored"},
                    "RequestId": "request-12345678",
                }
            },
            {
                "Response": {
                    "Error": {"Code": "InternalError", "Message": "ignored"},
                    "RequestId": unsafe_values[1],
                }
            },
        )
        for body, unsafe_value in zip(bodies, unsafe_values):
            client = hook.DnsPodClient(
                self.make_credentials(),
                transport=FakeTransport(json.dumps(body)),
            )
            with self.assertRaises(hook.DnsPodApiError) as caught:
                client.create_txt("validation-sensitive")
            self.assertNotIn(unsafe_value, str(caught.exception))


class ChallengeStateTests(unittest.TestCase):
    domain = "www.goodcms.cn"
    validation = "validation-sensitive"

    def write_raw_state(self, state_dir, content, *, mode=0o600):
        path = hook.state_path(state_dir, self.domain, self.validation)
        path.write_bytes(content if isinstance(content, bytes) else content.encode("utf-8"))
        path.chmod(mode)
        return path

    def test_state_path_hashes_domain_and_validation_without_exposing_either(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            path = hook.state_path(state_dir, self.domain, self.validation)

        expected_hash = hook.sha256_hex(f"{self.domain}\0{self.validation}")
        self.assertEqual(path.name, f"{expected_hash}.json")
        self.assertNotIn(self.domain, path.name)
        self.assertNotIn(self.validation, path.name)

    def test_write_state_is_0600_and_contains_only_id_and_validation_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            hook.write_state(state_dir, self.domain, self.validation, 731)
            path = hook.state_path(state_dir, self.domain, self.validation)
            document = json.loads(path.read_text(encoding="utf-8"))

            self.assertEqual(
                document,
                {
                    "record_id": 731,
                    "validation_hash": hook.sha256_hex(self.validation),
                },
            )
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertNotIn(self.validation, path.read_text(encoding="utf-8"))

    def test_write_state_rejects_invalid_record_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            for record_id in (True, False, 0, -1, "731", 731.0, None):
                with self.subTest(record_id=record_id), self.assertRaises(
                    hook.StateError
                ):
                    hook.write_state(
                        state_dir,
                        self.domain,
                        self.validation,
                        record_id,
                    )
            self.assertEqual(list(state_dir.iterdir()), [])

    def test_write_state_replace_failure_preserves_old_state_and_removes_temp(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            hook.write_state(state_dir, self.domain, self.validation, 731)

            with mock.patch.object(
                hook.os,
                "replace",
                side_effect=OSError("validation-sensitive"),
            ):
                with self.assertRaises(hook.StateError) as caught:
                    hook.write_state(state_dir, self.domain, self.validation, 999)

            self.assertNotIn(self.validation, str(caught.exception))
            self.assertEqual(
                hook.read_state(state_dir, self.domain, self.validation).record_id,
                731,
            )
            self.assertEqual(
                [path.name for path in state_dir.iterdir()],
                [hook.state_path(state_dir, self.domain, self.validation).name],
            )

        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            hook.write_state(state_dir, self.domain, self.validation, 731)
            real_replace = hook.os.replace
            real_unlink = hook.os.unlink
            replacement_finished = threading.Event()
            writer_errors = []
            writers = []

            def tracking_replace(source, destination):
                real_replace(source, destination)
                replacement_finished.set()

            def replace_state():
                try:
                    hook.write_state(
                        state_dir,
                        self.domain,
                        self.validation,
                        999,
                    )
                except Exception as error:
                    writer_errors.append(error)

            def racing_unlink(path):
                writer = threading.Thread(target=replace_state)
                writers.append(writer)
                writer.start()
                replacement_finished.wait(0.1)
                real_unlink(path)

            with (
                mock.patch.object(hook.os, "replace", side_effect=tracking_replace),
                mock.patch.object(hook.os, "unlink", side_effect=racing_unlink),
            ):
                hook._remove_matching_state(
                    state_dir,
                    self.domain,
                    self.validation,
                    731,
                )
            for writer in writers:
                writer.join(1)

            self.assertEqual(writer_errors, [])
            self.assertEqual(
                hook.read_state(state_dir, self.domain, self.validation).record_id,
                999,
            )

    def test_state_directory_must_be_absolute_regular_owned_and_0700(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wrong_mode = root / "wrong-mode"
            wrong_mode.mkdir(mode=0o700)
            wrong_mode.chmod(0o755)
            file_path = root / "not-directory"
            file_path.write_text("not a directory", encoding="utf-8")
            symlink_path = root / "state-link"
            symlink_path.symlink_to(wrong_mode, target_is_directory=True)

            invalid_dirs = (Path("relative-state"), wrong_mode, file_path, symlink_path)
            for state_dir in invalid_dirs:
                with self.subTest(state_dir=state_dir), self.assertRaises(
                    hook.StateError
                ):
                    hook.write_state(
                        state_dir,
                        self.domain,
                        self.validation,
                        731,
                    )

            secure_dir = root / "secure"
            secure_dir.mkdir(mode=0o700)
            with mock.patch.object(hook.os, "geteuid", return_value=os.geteuid() + 1):
                with self.assertRaises(hook.StateError):
                    hook.write_state(
                        secure_dir,
                        self.domain,
                        self.validation,
                        731,
                    )

    def test_read_state_rejects_symlink_non_regular_and_unsafe_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            target = state_dir / "target"
            target.write_text("{}", encoding="utf-8")
            target.chmod(0o600)
            path = hook.state_path(state_dir, self.domain, self.validation)
            path.symlink_to(target)
            with self.assertRaises(hook.StateError):
                hook.read_state(state_dir, self.domain, self.validation)

        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            path = hook.state_path(state_dir, self.domain, self.validation)
            path.mkdir(mode=0o600)
            with self.assertRaises(hook.StateError):
                hook.read_state(state_dir, self.domain, self.validation)

        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            self.write_raw_state(
                state_dir,
                json.dumps(
                    {
                        "record_id": 731,
                        "validation_hash": hook.sha256_hex(self.validation),
                    }
                ),
                mode=0o644,
            )
            with self.assertRaises(hook.StateError):
                hook.read_state(state_dir, self.domain, self.validation)

        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            self.write_raw_state(
                state_dir,
                json.dumps(
                    {
                        "record_id": 731,
                        "validation_hash": hook.sha256_hex(self.validation),
                    }
                ),
            )
            with mock.patch.object(hook.os, "geteuid", return_value=os.geteuid() + 1):
                with self.assertRaises(hook.StateError):
                    hook.read_state(state_dir, self.domain, self.validation)

    def test_read_state_rejects_malformed_unknown_hash_and_invalid_record_id(self):
        documents = (
            b"not-json",
            b"[]",
            json.dumps({"record_id": 731}),
            json.dumps(
                {
                    "record_id": 731,
                    "validation_hash": hook.sha256_hex(self.validation),
                    "unknown": True,
                }
            ),
            json.dumps({"record_id": 731, "validation_hash": "wrong-hash"}),
            json.dumps(
                {
                    "record_id": True,
                    "validation_hash": hook.sha256_hex(self.validation),
                }
            ),
            json.dumps(
                {
                    "record_id": 0,
                    "validation_hash": hook.sha256_hex(self.validation),
                }
            ),
            json.dumps(
                {
                    "record_id": "731",
                    "validation_hash": hook.sha256_hex(self.validation),
                }
            ),
        )
        for document in documents:
            with self.subTest(document=document), tempfile.TemporaryDirectory() as tmp:
                state_dir = Path(tmp)
                self.write_raw_state(state_dir, document)
                with self.assertRaises(hook.StateError):
                    hook.read_state(state_dir, self.domain, self.validation)


class HookWorkflowTests(unittest.TestCase):
    domain = "www.goodcms.cn"
    validation = "validation-sensitive"
    fqdn = "_acme-challenge.www.goodcms.cn"

    def test_auth_orders_create_state_then_wait_present(self):
        events = []
        client = FakeClient(record_id=731)
        client.events = events

        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)

            class StateCheckingVerifier(FakeVerifier):
                def wait_present(inner_self, name, value):
                    state = hook.read_state(
                        state_dir,
                        self.domain,
                        self.validation,
                    )
                    events.append(("state_visible", state.record_id))
                    super().wait_present(name, value)

            verifier = StateCheckingVerifier(events=events)
            hook.run_auth(
                domain=self.domain,
                validation=self.validation,
                client=client,
                verifier=verifier,
                state_dir=state_dir,
            )

            state = hook.read_state(state_dir, self.domain, self.validation)

        self.assertEqual(state.record_id, 731)
        self.assertEqual(
            events,
            [
                ("create", self.validation),
                ("state_visible", 731),
                ("wait_present", self.fqdn, self.validation),
            ],
        )

    def test_auth_rejects_wrong_domain_before_create(self):
        client = FakeClient()
        verifier = FakeVerifier()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(hook.ConfigurationError):
                hook.run_auth(
                    domain="assets.goodcms.cn",
                    validation=self.validation,
                    client=client,
                    verifier=verifier,
                    state_dir=Path(tmp),
                )
        self.assertEqual(client.created, [])

    def test_auth_uses_domain_specific_challenge_name(self):
        client = FakeClient(record_id=731)
        verifier = FakeVerifier()
        with tempfile.TemporaryDirectory() as tmp:
            hook.run_auth(
                domain="api.goodcms.cn",
                validation=self.validation,
                client=client,
                verifier=verifier,
                state_dir=Path(tmp),
            )

        self.assertEqual(
            verifier.events,
            [
                (
                    "wait_present",
                    "_acme-challenge.api.goodcms.cn",
                    self.validation,
                ),
            ],
        )

    def test_create_failure_does_not_write_state_or_delete_another_record(self):
        failure = hook.DnsPodApiError("safe create failure")
        client = FakeClient(create_error=failure)
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            with self.assertRaises(hook.DnsPodApiError) as caught:
                hook.run_auth(
                    domain=self.domain,
                    validation=self.validation,
                    client=client,
                    verifier=FakeVerifier(),
                    state_dir=state_dir,
                )
            self.assertIs(caught.exception, failure)
            self.assertEqual(list(state_dir.iterdir()), [])
        self.assertEqual(client.deleted, [])

    def test_state_write_failure_best_effort_deletes_only_created_record(self):
        client = FakeClient(record_id=731)
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            state_dir.chmod(0o755)
            with self.assertRaises(hook.StateError):
                hook.run_auth(
                    domain=self.domain,
                    validation=self.validation,
                    client=client,
                    verifier=FakeVerifier(),
                    state_dir=state_dir,
                )
        self.assertEqual(client.created, [self.validation])
        self.assertEqual(client.deleted, [731])

    def test_propagation_failure_removes_state_when_rollback_delete_succeeds(self):
        failure = hook.DnsPropagationError("safe propagation failure")
        client = FakeClient(record_id=731)
        verifier = FakeVerifier(present_error=failure, events=client.events)
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            with self.assertRaises(hook.DnsPropagationError) as caught:
                hook.run_auth(
                    domain=self.domain,
                    validation=self.validation,
                    client=client,
                    verifier=verifier,
                    state_dir=state_dir,
                )
            self.assertIs(caught.exception, failure)
            self.assertFalse(
                hook.state_path(state_dir, self.domain, self.validation).exists()
            )
            with self.assertRaises(hook.StateError):
                hook.run_cleanup(
                    domain=self.domain,
                    validation=self.validation,
                    client=client,
                    verifier=FakeVerifier(),
                    state_dir=state_dir,
                )

        self.assertEqual(client.deleted, [731])
        self.assertEqual(
            client.events,
            [
                ("create", self.validation),
                ("wait_present", self.fqdn, self.validation),
                ("delete", 731),
            ],
        )

    def test_propagation_failure_preserves_state_if_rollback_delete_fails(self):
        propagation_failure = hook.DnsPropagationError("safe propagation failure")
        client = FakeClient(
            record_id=731,
            delete_errors=(hook.DnsPodApiError("safe delete failure"),),
        )
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            with self.assertRaises(hook.DnsPropagationError) as caught:
                hook.run_auth(
                    domain=self.domain,
                    validation=self.validation,
                    client=client,
                    verifier=FakeVerifier(present_error=propagation_failure),
                    state_dir=state_dir,
                )
            self.assertIs(caught.exception, propagation_failure)
            self.assertEqual(
                hook.read_state(
                    state_dir,
                    self.domain,
                    self.validation,
                ).record_id,
                731,
            )

            hook.run_cleanup(
                domain=self.domain,
                validation=self.validation,
                client=client,
                verifier=FakeVerifier(),
                state_dir=state_dir,
            )
            self.assertFalse(
                hook.state_path(state_dir, self.domain, self.validation).exists()
            )

        self.assertEqual(client.deleted, [731, 731])

    def test_cleanup_orders_delete_wait_absent_then_removes_matching_state(self):
        events = []
        client = FakeClient(record_id=999)
        client.events = events
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            hook.write_state(state_dir, self.domain, self.validation, 731)

            class StateCheckingVerifier(FakeVerifier):
                def wait_absent(inner_self, name, value):
                    state = hook.read_state(
                        state_dir,
                        self.domain,
                        self.validation,
                    )
                    events.append(("state_visible", state.record_id))
                    super().wait_absent(name, value)

            hook.run_cleanup(
                domain=self.domain,
                validation=self.validation,
                client=client,
                verifier=StateCheckingVerifier(events=events),
                state_dir=state_dir,
            )

            self.assertFalse(
                hook.state_path(state_dir, self.domain, self.validation).exists()
            )

        self.assertEqual(client.deleted, [731])
        self.assertEqual(
            events,
            [
                ("delete", 731),
                ("state_visible", 731),
                ("wait_absent", self.fqdn, self.validation),
            ],
        )

    def test_cleanup_uses_domain_specific_challenge_name(self):
        client = FakeClient(record_id=999)
        verifier = FakeVerifier()
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            hook.write_state(state_dir, "api.goodcms.cn", self.validation, 731)

            hook.run_cleanup(
                domain="api.goodcms.cn",
                validation=self.validation,
                client=client,
                verifier=verifier,
                state_dir=state_dir,
            )

        self.assertEqual(
            verifier.events,
            [
                (
                    "wait_absent",
                    "_acme-challenge.api.goodcms.cn",
                    self.validation,
                ),
            ],
        )

    def test_cleanup_without_matching_state_never_calls_delete(self):
        cases = ("missing", "hash-mismatch")
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as tmp:
                state_dir = Path(tmp)
                if case == "hash-mismatch":
                    path = hook.state_path(state_dir, self.domain, self.validation)
                    path.write_text(
                        json.dumps(
                            {"record_id": 999, "validation_hash": "wrong"}
                        ),
                        encoding="utf-8",
                    )
                    path.chmod(0o600)
                client = FakeClient(record_id=731)
                with self.assertRaises(hook.StateError):
                    hook.run_cleanup(
                        domain=self.domain,
                        validation=self.validation,
                        client=client,
                        verifier=FakeVerifier(),
                        state_dir=state_dir,
                    )
                self.assertEqual(client.deleted, [])

    def test_cleanup_delete_or_absence_failure_preserves_state_for_retry(self):
        failures = (
            (
                FakeClient(
                    delete_errors=(hook.DnsPodApiError("safe delete failure"),)
                ),
                FakeVerifier(),
                hook.DnsPodApiError,
            ),
            (
                FakeClient(),
                FakeVerifier(
                    absent_error=hook.DnsPropagationError("safe absence failure")
                ),
                hook.DnsPropagationError,
            ),
        )
        for client, verifier, error_type in failures:
            with self.subTest(error=error_type.__name__), tempfile.TemporaryDirectory() as tmp:
                state_dir = Path(tmp)
                hook.write_state(state_dir, self.domain, self.validation, 731)
                with self.assertRaises(error_type):
                    hook.run_cleanup(
                        domain=self.domain,
                        validation=self.validation,
                        client=client,
                        verifier=verifier,
                        state_dir=state_dir,
                    )
                self.assertEqual(
                    hook.read_state(
                        state_dir,
                        self.domain,
                        self.validation,
                    ).record_id,
                    731,
                )
                self.assertEqual(client.deleted, [731])


class CliTests(unittest.TestCase):
    def test_auth_and_cleanup_wire_credentials_authorities_three_arg_query_and_workflow(self):
        credentials = hook.Credentials(
            TEST_SECRET_ID,
            TEST_SECRET_KEY,
            "goodcms.cn",
            "_acme-challenge.www",
        )
        environment = {
            "CERTBOT_DOMAIN": "www.goodcms.cn",
            "CERTBOT_IDENTIFIER": "www.goodcms.cn",
            "CERTBOT_VALIDATION": "validation-sensitive",
        }

        for mode, workflow_name in (("auth", "run_auth"), ("cleanup", "run_cleanup")):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                state_dir = Path(tmp)
                credentials_path = state_dir.parent / "credentials.env"
                client = object()
                verifier = object()
                captured = {}

                def build_verifier(*, nameserver_addresses, query):
                    captured["addresses"] = nameserver_addresses
                    captured["query"] = query
                    return verifier

                stdout = io.StringIO()
                stderr = io.StringIO()
                with (
                    mock.patch.dict(hook.os.environ, environment, clear=True),
                    mock.patch.object(
                        hook,
                        "load_credentials",
                        return_value=credentials,
                    ) as load_credentials,
                    mock.patch.object(
                        hook,
                        "discover_authoritative_addresses",
                        return_value=["192.0.2.1", "2001:db8::1"],
                    ) as discover,
                    mock.patch.object(
                        hook,
                        "DnsPodClient",
                        return_value=client,
                    ) as client_type,
                    mock.patch.object(
                        hook,
                        "AuthoritativeTxtVerifier",
                        side_effect=build_verifier,
                    ),
                    mock.patch.object(hook, workflow_name) as workflow,
                    mock.patch.object(
                        hook,
                        "_query_authoritative_txt",
                        return_value={"answer"},
                    ) as query_txt,
                    redirect_stdout(stdout),
                    redirect_stderr(stderr),
                ):
                    exit_code = hook.main(
                        [
                            mode,
                            "--credentials",
                            str(credentials_path),
                            "--state-dir",
                            str(state_dir),
                        ]
                    )
                    self.assertEqual(
                        captured["query"](
                            "192.0.2.1",
                            "_acme-challenge.www.goodcms.cn",
                            0.75,
                        ),
                        {"answer"},
                    )

                self.assertEqual(exit_code, 0)
                load_credentials.assert_called_once_with(credentials_path)
                discover.assert_called_once_with("goodcms.cn")
                client_type.assert_called_once_with(credentials)
                self.assertEqual(
                    captured["addresses"],
                    ["192.0.2.1", "2001:db8::1"],
                )
                query_txt.assert_called_once_with(
                    "192.0.2.1",
                    "_acme-challenge.www.goodcms.cn",
                    0.75,
                )
                workflow.assert_called_once_with(
                    domain="www.goodcms.cn",
                    validation="validation-sensitive",
                    client=client,
                    verifier=verifier,
                    state_dir=state_dir,
                )
                combined = stdout.getvalue() + stderr.getvalue()
                for secret in (TEST_SECRET_ID, TEST_SECRET_KEY, "validation-sensitive"):
                    self.assertNotIn(secret, combined)

    def test_cli_uses_certbot_domain_to_select_dns_challenge_subdomain(self):
        credentials = hook.Credentials(
            TEST_SECRET_ID,
            TEST_SECRET_KEY,
            "goodcms.cn",
            "_acme-challenge.www",
        )
        environment = {
            "CERTBOT_DOMAIN": "api.goodcms.cn",
            "CERTBOT_IDENTIFIER": "api.goodcms.cn",
            "CERTBOT_VALIDATION": "validation-sensitive",
        }
        captured = {}

        def build_verifier(*, nameserver_addresses, query):
            captured["query"] = query
            return object()

        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            credentials_path = state_dir.parent / "credentials.env"
            with (
                mock.patch.dict(hook.os.environ, environment, clear=True),
                mock.patch.object(
                    hook,
                    "load_credentials",
                    return_value=credentials,
                ),
                mock.patch.object(
                    hook,
                    "discover_authoritative_addresses",
                    return_value=["192.0.2.1"],
                ),
                mock.patch.object(hook, "DnsPodClient") as client_type,
                mock.patch.object(
                    hook,
                    "AuthoritativeTxtVerifier",
                    side_effect=build_verifier,
                ),
                mock.patch.object(hook, "run_auth") as workflow,
                mock.patch.object(
                    hook,
                    "_query_authoritative_txt",
                    return_value={"answer"},
                ) as query_txt,
            ):
                exit_code = hook.main(
                    [
                        "auth",
                        "--credentials",
                        str(credentials_path),
                        "--state-dir",
                        str(state_dir),
                    ]
                )
                query_result = captured["query"](
                    "192.0.2.1",
                    "_acme-challenge.api.goodcms.cn",
                    0.75,
                )

        self.assertEqual(exit_code, 0)
        client_credentials = client_type.call_args.args[0]
        self.assertEqual(client_credentials.domain, "goodcms.cn")
        self.assertEqual(client_credentials.subdomain, "_acme-challenge.api")
        self.assertEqual(query_result, {"answer"})
        query_txt.assert_called_once_with(
            "192.0.2.1",
            "_acme-challenge.api.goodcms.cn",
            0.75,
        )
        workflow.assert_called_once()

    def test_cli_rejects_missing_extra_and_unknown_arguments_without_echoing_them(self):
        sensitive_extra = "validation-sensitive-extra"
        argument_sets = (
            [],
            ["other", "--credentials", "/tmp/c", "--state-dir", "/tmp/s"],
            ["auth"],
            ["auth", "--credentials", "/tmp/c"],
            [
                "auth",
                "--credentials",
                "/tmp/c",
                "--state-dir",
                "/tmp/s",
                sensitive_extra,
            ],
        )
        environment = {
            "CERTBOT_DOMAIN": "www.goodcms.cn",
            "CERTBOT_VALIDATION": "validation-sensitive",
        }
        for arguments in argument_sets:
            with self.subTest(arguments=arguments):
                stdout = io.StringIO()
                stderr = io.StringIO()
                with (
                    mock.patch.dict(hook.os.environ, environment, clear=True),
                    redirect_stdout(stdout),
                    redirect_stderr(stderr),
                ):
                    exit_code = hook.main(arguments)

                self.assertNotEqual(exit_code, 0)
                combined = stdout.getvalue() + stderr.getvalue()
                self.assertNotIn(sensitive_extra, combined)
                self.assertNotIn("validation-sensitive", combined)

        strict_argument_sets = (
            ["auth", "--cred", "/tmp/c", "--state-dir", "/tmp/s"],
            [
                "auth",
                "--credentials",
                "/tmp/first",
                "--credentials",
                "/tmp/second",
                "--state-dir",
                "/tmp/s",
            ],
        )
        for arguments in strict_argument_sets:
            with self.subTest(arguments=arguments), self.assertRaises(
                hook.ConfigurationError
            ):
                hook._argument_parser().parse_args(arguments)

    def test_cli_rejects_missing_empty_or_mismatched_certbot_environment_first(self):
        valid_arguments = [
            "auth",
            "--credentials",
            "/tmp/credentials.env",
            "--state-dir",
            "/tmp/state",
        ]
        environments = (
            {},
            {"CERTBOT_DOMAIN": "", "CERTBOT_VALIDATION": "validation-sensitive"},
            {"CERTBOT_DOMAIN": "www.goodcms.cn", "CERTBOT_VALIDATION": ""},
            {
                "CERTBOT_DOMAIN": "www.goodcms.cn",
                "CERTBOT_VALIDATION": "validation-sensitive",
                "CERTBOT_IDENTIFIER": "api.goodcms.cn",
            },
        )
        for environment in environments:
            with self.subTest(environment=environment):
                stderr = io.StringIO()
                with (
                    mock.patch.dict(hook.os.environ, environment, clear=True),
                    mock.patch.object(hook, "load_credentials") as load_credentials,
                    redirect_stderr(stderr),
                ):
                    exit_code = hook.main(valid_arguments)

                self.assertNotEqual(exit_code, 0)
                load_credentials.assert_not_called()
                self.assertNotIn("validation-sensitive", stderr.getvalue())

    def test_cli_returns_nonzero_for_safe_hook_failures_without_printing_secrets(self):
        environment = {
            "CERTBOT_DOMAIN": "www.goodcms.cn",
            "CERTBOT_VALIDATION": "validation-sensitive",
        }
        credentials = hook.Credentials(
            TEST_SECRET_ID,
            TEST_SECRET_KEY,
            "goodcms.cn",
            "_acme-challenge.www",
        )
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            stderr = io.StringIO()
            with (
                mock.patch.dict(hook.os.environ, environment, clear=True),
                mock.patch.object(
                    hook,
                    "load_credentials",
                    return_value=credentials,
                ),
                mock.patch.object(
                    hook,
                    "discover_authoritative_addresses",
                    return_value=["192.0.2.1"],
                ),
                mock.patch.object(hook, "DnsPodClient", return_value=object()),
                mock.patch.object(
                    hook,
                    "AuthoritativeTxtVerifier",
                    return_value=object(),
                ),
                mock.patch.object(
                    hook,
                    "run_auth",
                    side_effect=hook.DnsPodApiError(
                        "DNSPod API failed: code=InternalError request=12345678"
                    ),
                ),
                redirect_stderr(stderr),
            ):
                exit_code = hook.main(
                    [
                        "auth",
                        "--credentials",
                        "/tmp/credentials.env",
                        "--state-dir",
                        str(state_dir),
                    ]
                )

        self.assertNotEqual(exit_code, 0)
        output = stderr.getvalue()
        self.assertIn("InternalError", output)
        for secret in (TEST_SECRET_ID, TEST_SECRET_KEY, "validation-sensitive"):
            self.assertNotIn(secret, output)

if __name__ == "__main__":
    unittest.main()
