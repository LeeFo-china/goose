import io
import importlib.util
import itertools
import socket
import struct
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
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
    def __init__(self, *, flags: int, transaction_id_delta: int = 0, error=None):
        self.flags = flags
        self.transaction_id_delta = transaction_id_delta
        self.error = error
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
        response = struct.pack(
            "!HHHHHH",
            (transaction_id + self.transaction_id_delta) & 0xFFFF,
            self.flags,
            0,
            0,
            0,
            0,
        )
        return response, ("192.0.2.53", 53)


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
    def test_exact_certbot_domain_is_accepted(self):
        hook.validate_certbot_domain("www.goodcms.cn")

    def test_domain_variants_are_rejected(self):
        invalid_domains = (
            "goodcms.cn",
            "api.goodcms.cn",
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

    def test_query_ipv4_success_uses_udp_53_and_matching_16_bit_id(self):
        fake_socket = FakeDnsSocket(flags=0x8000)
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
            response = hook.query_dns("192.0.2.53", "www.goodcms.cn", 16)

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
        fake_socket = FakeDnsSocket(flags=0x8000)
        socket_arguments = []

        def socket_factory(family, socket_type):
            socket_arguments.append((family, socket_type))
            return fake_socket

        with mock.patch.object(
            hook.socket,
            "socket",
            side_effect=socket_factory,
        ):
            hook.query_dns("2001:db8::53", "www.goodcms.cn", 16)

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
        ):
            queries.append((address, name, qtype, timeout, recursion_desired))
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
            [("192.0.2.53", "goodcms.cn", 2, 2.0, True)],
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

        def query(address, _name):
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

        def query(address, _name):
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

    def test_wait_present_and_absent_time_out_without_exposing_value(self):
        secret_value = "secret-test-token"
        cases = (
            ("wait_present", lambda _address, _name: set()),
            ("wait_absent", lambda _address, _name: {secret_value}),
        )

        for method_name, query in cases:
            with self.subTest(method=method_name):
                verifier = hook.AuthoritativeTxtVerifier(
                    nameserver_addresses=("192.0.2.1",),
                    query=query,
                    sleep=lambda _seconds: None,
                    monotonic=iter((0, 2)).__next__,
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


if __name__ == "__main__":
    unittest.main()
