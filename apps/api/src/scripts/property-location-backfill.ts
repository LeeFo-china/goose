import { createHash } from "node:crypto";
import { decryptSecretValue } from "@/services/system-settings/legacy/crypto";

type CliOptions = {
  apply: boolean;
  limit: number;
  tenantId: string | null;
  minConfidence: number;
};

type PropertyCandidateRow = {
  id: string;
  tenant_id: string | null;
  customer_id: string | null;
  community: string | null;
  building_info: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  latitude: number | null;
  longitude: number | null;
  location_status: string | null;
  location_confirmed_at: string | null;
  project_addresses: string[] | string | null;
  tenant_province: string | null;
  tenant_city: string | null;
  tenant_district: string | null;
  tenant_adcode: string | null;
};

type SystemSettingRow = {
  key: string;
  value_text: string | null;
  is_secret: boolean;
};

type TencentGeocoderResponse = {
  status: number;
  message?: string;
  request_id?: string;
  result?: {
    title?: string;
    location?: {
      lat?: number;
      lng?: number;
    };
    address_components?: {
      province?: string;
      city?: string;
      district?: string;
    };
    ad_info?: {
      adcode?: string;
    };
    reliability?: number;
    level?: string | number;
  };
};

type GeocodeResult = {
  ok: boolean;
  message: string;
  request_id: string | null;
  title: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  level: string | null;
};

type BackfillResult = {
  property_id: string;
  tenant_id: string | null;
  community: string | null;
  address: string | null;
  region: string | null;
  action: "updated" | "would_update" | "skipped";
  reason: string | null;
  geocode: GeocodeResult | null;
};

const GEOCODER_PATH = "/ws/geocoder/v1/";
const GEOCODER_URL = "https://apis.map.qq.com/ws/geocoder/v1/";
const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_CONFIDENCE = 0.7;

const databaseUrl = process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DB_DIRECT_URL;

if (!databaseUrl) {
  console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
  process.exit(1);
}

const db = new Bun.SQL(databaseUrl);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    limit: Number(process.env.PROPERTY_LOCATION_BACKFILL_LIMIT || DEFAULT_LIMIT),
    tenantId: process.env.TENANT_ID || null,
    minConfidence: Number(
      process.env.PROPERTY_LOCATION_BACKFILL_MIN_CONFIDENCE ||
        DEFAULT_MIN_CONFIDENCE,
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.apply = false;
      continue;
    }
    if (arg === "--limit") {
      options.limit = Number(argv[index + 1] || options.limit);
      index += 1;
      continue;
    }
    if (arg === "--tenant-id") {
      options.tenantId = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--min-confidence") {
      options.minConfidence = Number(argv[index + 1] || options.minConfidence);
      index += 1;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit 必须是大于 0 的数字");
  }
  if (
    !Number.isFinite(options.minConfidence) ||
    options.minConfidence < 0 ||
    options.minConfidence > 1
  ) {
    throw new Error("--min-confidence 必须是 0 到 1 之间的数字");
  }

  return options;
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function buildSignedGetUrl(input: {
  url: string;
  path: string;
  params: Record<string, string>;
  sk?: string | null;
}) {
  const sortedParams = Object.entries(input.params)
    .filter(([, value]) => value.trim())
    .sort(([left], [right]) => left.localeCompare(right));
  const rawQuery = sortedParams.map(([key, value]) => `${key}=${value}`).join("&");
  const query = new URLSearchParams(sortedParams);
  if (input.sk?.trim()) {
    query.set("sig", md5(`${input.path}?${rawQuery}${input.sk.trim()}`));
  }

  return `${input.url}?${query.toString()}`;
}

function normalizeText(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeConfidence(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 1) return Math.max(0, value);
  if (value <= 10) return Math.max(0, Math.min(value / 10, 1));
  return Math.max(0, Math.min(value / 100, 1));
}

function normalizeProjectAddresses(value: string[] | string | null) {
  if (!value) return [];
  const list = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAddress(row: PropertyCandidateRow) {
  const scopedAddress = [
    row.province || row.tenant_province,
    row.city || row.tenant_city,
    row.district || row.tenant_district,
    row.community,
    row.building_info,
  ]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .join("");

  if (scopedAddress) return scopedAddress;

  return normalizeProjectAddresses(row.project_addresses)[0] ?? null;
}

function getRegion(row: PropertyCandidateRow) {
  return normalizeText(row.city) ||
    normalizeText(row.district) ||
    normalizeText(row.tenant_city) ||
    normalizeText(row.tenant_district);
}

function isQualified(geocode: GeocodeResult, minConfidence: number) {
  if (!geocode.ok) return false;
  if (!geocode.adcode || geocode.latitude == null || geocode.longitude == null) {
    return false;
  }
  return (geocode.confidence ?? 0) >= minConfidence;
}

async function getTencentConfig() {
  const rows = await db<SystemSettingRow[]>`
    select key, value_text, is_secret
    from public.system_settings
    where tenant_id is null
      and key in (
        'TENCENT_LBS_WEBSERVICE_KEY',
        'TENCENT_LBS_WEBSERVICE_SK'
      )
      and status = 'active'
  `;

  const values = new Map(rows.map((row) => [
    row.key,
    row.is_secret && row.value_text
      ? decryptSecretValue(row.value_text)
      : row.value_text || "",
  ]));
  return {
    key: values.get("TENCENT_LBS_WEBSERVICE_KEY") || "",
    sk: values.get("TENCENT_LBS_WEBSERVICE_SK") || "",
  };
}

async function listCandidates(options: CliOptions) {
  return db<PropertyCandidateRow[]>`
    with default_areas as (
      select distinct on (area.tenant_id)
        area.tenant_id,
        area.province,
        area.city,
        area.district,
        area.adcode
      from public.tenant_service_areas area
      where area.status = 'active'
      order by area.tenant_id, area.priority desc, area.created_at asc
    )
    select
      property.id,
      property.tenant_id,
      property.customer_id,
      property.community,
      property.building_info,
      property.province,
      property.city,
      property.district,
      property.adcode,
      property.latitude,
      property.longitude,
      property.location_status,
      property.location_confirmed_at,
      coalesce(
        jsonb_agg(distinct project.address)
          filter (where project.address is not null and btrim(project.address) <> ''),
        '[]'::jsonb
      ) as project_addresses,
      default_area.province as tenant_province,
      default_area.city as tenant_city,
      default_area.district as tenant_district,
      default_area.adcode as tenant_adcode
    from public.properties property
    left join public.projects project on project.property_id = property.id
    left join default_areas default_area on default_area.tenant_id = property.tenant_id
    where (${options.tenantId}::uuid is null or property.tenant_id = ${options.tenantId}::uuid)
      and coalesce(property.location_status, 'pending') <> 'confirmed'
      and (
        property.city is null
        or btrim(property.city) = ''
        or property.adcode is null
        or btrim(property.adcode) = ''
        or property.latitude is null
        or property.longitude is null
      )
    group by property.id, default_area.province, default_area.city,
      default_area.district, default_area.adcode
    order by property.created_at asc nulls last, property.id asc
    limit ${options.limit}
  `;
}

async function geocodeAddress(input: {
  address: string;
  region: string | null;
  key: string;
  sk: string | null;
}): Promise<GeocodeResult> {
  const params: Record<string, string> = {
    address: input.address,
    key: input.key,
    output: "json",
  };
  if (input.region) {
    params.region = input.region;
  }

  const response = await fetch(buildSignedGetUrl({
    url: GEOCODER_URL,
    path: GEOCODER_PATH,
    params,
    sk: input.sk,
  }), { signal: AbortSignal.timeout(8000) });
  const payload = await response.json().catch(() => ({})) as TencentGeocoderResponse;
  const result = payload.result;
  const latitude = result?.location?.lat;
  const longitude = result?.location?.lng;
  const ok = response.ok &&
    payload.status === 0 &&
    typeof latitude === "number" &&
    typeof longitude === "number";

  return {
    ok,
    message: payload.message || response.statusText || "未知响应",
    request_id: payload.request_id ?? null,
    title: normalizeText(result?.title),
    province: normalizeText(result?.address_components?.province),
    city: normalizeText(result?.address_components?.city),
    district: normalizeText(result?.address_components?.district),
    adcode: normalizeText(result?.ad_info?.adcode),
    latitude: typeof latitude === "number" ? latitude : null,
    longitude: typeof longitude === "number" ? longitude : null,
    confidence: normalizeConfidence(result?.reliability),
    level: result?.level != null ? String(result.level) : null,
  };
}

async function updateProperty(row: PropertyCandidateRow, geocode: GeocodeResult) {
  await db`
    update public.properties
    set
      province = ${geocode.province ?? row.province ?? row.tenant_province},
      city = ${geocode.city ?? row.city ?? row.tenant_city},
      district = ${geocode.district ?? row.district ?? row.tenant_district},
      adcode = ${geocode.adcode ?? row.adcode ?? row.tenant_adcode},
      latitude = ${geocode.latitude},
      longitude = ${geocode.longitude},
      location_status = 'geocoded',
      location_source = 'backfill',
      location_confidence = ${geocode.confidence},
      location_confirmed_at = null
    where id = ${row.id}::uuid
      and coalesce(location_status, 'pending') <> 'confirmed'
  `;
}

async function processCandidate(input: {
  row: PropertyCandidateRow;
  config: Awaited<ReturnType<typeof getTencentConfig>>;
  options: CliOptions;
}): Promise<BackfillResult> {
  const address = buildAddress(input.row);
  const region = getRegion(input.row);

  if (!address) {
    return {
      property_id: input.row.id,
      tenant_id: input.row.tenant_id,
      community: input.row.community,
      address,
      region,
      action: "skipped",
      reason: "地址不足，无法地理编码",
      geocode: null,
    };
  }

  const geocode = await geocodeAddress({
    address,
    region,
    key: input.config.key,
    sk: input.config.sk,
  });
  if (!isQualified(geocode, input.options.minConfidence)) {
    return {
      property_id: input.row.id,
      tenant_id: input.row.tenant_id,
      community: input.row.community,
      address,
      region,
      action: "skipped",
      reason: geocode.ok
        ? `置信度低于 ${input.options.minConfidence}`
        : geocode.message,
      geocode,
    };
  }

  if (input.options.apply) {
    await updateProperty(input.row, geocode);
  }

  return {
    property_id: input.row.id,
    tenant_id: input.row.tenant_id,
    community: input.row.community,
    address,
    region,
    action: input.options.apply ? "updated" : "would_update",
    reason: null,
    geocode,
  };
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  const config = await getTencentConfig();
  if (!config.key) {
    throw new Error("腾讯位置服务 WebService Key 未配置或未启用");
  }

  const candidates = await listCandidates(options);
  const results: BackfillResult[] = [];

  for (const row of candidates) {
    results.push(await processCandidate({ row, config, options }));
  }

  const summary = results.reduce(
    (acc, item) => {
      acc[item.action] += 1;
      return acc;
    },
    { updated: 0, would_update: 0, skipped: 0 },
  );

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    mode: options.apply ? "apply" : "dry-run",
    tenant_id: options.tenantId,
    limit: options.limit,
    min_confidence: options.minConfidence,
    candidate_count: candidates.length,
    summary,
    results,
  }, null, 2));

  await db.close();
}

main().catch(async (error) => {
  await db.close();
  console.error(error instanceof Error ? error.message : "房产位置补齐失败");
  process.exit(1);
});
