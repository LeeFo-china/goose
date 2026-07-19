import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
