import { createDecipheriv, createHash } from "node:crypto";

type AdministrativeAreaLevel = "province" | "city" | "district";

type TencentApiNode = {
  id: string;
  fullname: string;
  cidx?: [number, number];
};

type TencentApiResponse = {
  status: number;
  message?: string;
  result?: TencentApiNode[][];
  request_id?: string;
};

type AdministrativeAreaUpsert = {
  adcode: string;
  name: string;
  level: AdministrativeAreaLevel;
  parent_adcode: string | null;
  full_name: string;
  source: string;
  source_version: string;
  sort_order: number;
  status: "active";
  raw_payload: TencentApiNode;
  synced_at: string;
};

const DISTRICT_LIST_PATH = "/ws/district/v1/list";
const DISTRICT_LIST_URL = "https://apis.map.qq.com/ws/district/v1/list";
const SOURCE = "tencent_lbs";
const SOURCE_VERSION = "webservice-district-v1";
const LEVELS = ["province", "city", "district"] as const;
const ENCRYPTED_VALUE_PREFIX = "enc:v1:";

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function getEncryptionKey() {
  return createHash("sha256").update(requireEnv("APP_CONFIG_ENCRYPTION_KEY")).digest();
}

function decryptSecretValue(value: string | null) {
  if (!value) return "";
  if (!value.startsWith(ENCRYPTED_VALUE_PREFIX)) return value;

  const [, , ivText, tagText, encryptedText] = value.split(":");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("系统配置密文格式错误");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Supabase REST 请求失败(${response.status})：${payload || response.statusText}`);
  }

  if (response.status === 204) return null as T;
  return await response.json() as T;
}

function buildSignedGetUrl(input: {
  key: string;
  sk?: string;
}) {
  const params = [
    ["key", input.key],
    ["output", "json"],
  ].sort(([left], [right]) => left.localeCompare(right));
  const rawQuery = params.map(([key, value]) => `${key}=${value}`).join("&");
  const query = new URLSearchParams(params);
  if (input.sk?.trim()) {
    query.set("sig", md5(`${DISTRICT_LIST_PATH}?${rawQuery}${input.sk.trim()}`));
  }

  return `${DISTRICT_LIST_URL}?${query.toString()}`;
}

async function getTencentLbsConfig() {
  const data = await supabaseRest<Array<{
    key: string;
    value_text: string | null;
    is_secret: boolean;
  }>>("system_settings?tenant_id=is.null&key=in.(TENCENT_LBS_WEBSERVICE_KEY,TENCENT_LBS_WEBSERVICE_SK)&select=key,value_text,is_secret");

  const settings = new Map(data.map((item) => [
    item.key,
    item.is_secret ? decryptSecretValue(item.value_text) : item.value_text || "",
  ]));

  return {
    key: process.env.TENCENT_LBS_WEBSERVICE_KEY?.trim() || process.env.TENCENT_LBS_KEY?.trim() || settings.get("TENCENT_LBS_WEBSERVICE_KEY") || "",
    sk: process.env.TENCENT_LBS_WEBSERVICE_SK?.trim() || process.env.TENCENT_LBS_SK?.trim() || settings.get("TENCENT_LBS_WEBSERVICE_SK") || "",
  };
}

async function loadFromTencentApi() {
  const config = await getTencentLbsConfig();
  if (!config.key) {
    throw new Error("缺少腾讯位置服务 WebService Key");
  }

  const response = await fetch(buildSignedGetUrl(config));
  const payload = await response.json() as TencentApiResponse;
  if (!response.ok || payload.status !== 0 || !payload.result) {
    throw new Error(
      `腾讯行政区划接口调用失败：${payload.message || response.statusText || payload.status}`,
    );
  }
  return payload.result;
}

function flattenTencentLevels(levels: TencentApiNode[][]) {
  const syncedAt = new Date().toISOString();
  const rows: AdministrativeAreaUpsert[] = [];
  const build = (
    node: TencentApiNode,
    levelIndex: number,
    parent: AdministrativeAreaUpsert | null,
    sortOrder: number,
  ) => {
    const level = LEVELS[levelIndex];
    if (!level) return;

    const row: AdministrativeAreaUpsert = {
      adcode: node.id,
      name: node.fullname,
      level,
      parent_adcode: parent?.adcode ?? null,
      full_name: parent ? `${parent.full_name} ${node.fullname}` : node.fullname,
      source: SOURCE,
      source_version: SOURCE_VERSION,
      sort_order: sortOrder,
      status: "active",
      raw_payload: node,
      synced_at: syncedAt,
    };
    rows.push(row);

    const childLevel = levels[levelIndex + 1] ?? [];
    if (!node.cidx) return;
    childLevel
      .slice(node.cidx[0], node.cidx[1] + 1)
      .forEach((child, index) => build(child, levelIndex + 1, row, index));
  };

  (levels[0] ?? []).forEach((node, index) => build(node, 0, null, index));
  return rows;
}

async function upsertRows(rows: AdministrativeAreaUpsert[]) {
  const batchSize = 500;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    await supabaseRest("administrative_areas?on_conflict=adcode", {
      method: "POST",
      headers: {
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
  }
}

async function main() {
  const levels = await loadFromTencentApi();
  const rows = flattenTencentLevels(levels);
  await upsertRows(rows);
  console.log(JSON.stringify({
    source: SOURCE,
    source_version: SOURCE_VERSION,
    rows: rows.length,
    provinces: rows.filter((row) => row.level === "province").length,
    cities: rows.filter((row) => row.level === "city").length,
    districts: rows.filter((row) => row.level === "district").length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
