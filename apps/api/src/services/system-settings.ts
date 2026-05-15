import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { systemSettingRepository, type SystemSettingRecord } from "@/repositories/system-settings";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type SettingDefinition = {
  key: string;
  groupCode: string;
  name: string;
  description: string;
  valueType: "string" | "number" | "boolean" | "json";
  envNames: string[];
  defaultValue?: string;
  isSecret?: boolean;
};

type SettingSource = "database" | "env" | "default" | "empty";
type SettingScope = "platform" | "tenant";

type EffectiveSetting = SystemSettingRecord & {
  effective_value: string | null;
  stored_value: string | null;
  source: SettingSource;
  is_configured: boolean;
  effective_scope: SettingScope;
  can_override_by_tenant: boolean;
};

const CACHE_TTL_MS = 30 * 1000;
const ENCRYPTED_VALUE_PREFIX = "enc:v1:";

const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: "SMS_PROVIDER",
    groupCode: "sms",
    name: "短信服务商",
    description: "平台短信服务商。mock 为模拟发送，disabled 为禁用，aliyun 为阿里云短信，tencent 为腾讯云短信。",
    valueType: "string",
    envNames: ["SMS_PROVIDER"],
    defaultValue: "mock",
  },
  {
    key: "SMS_CHANNEL_MODE",
    groupCode: "sms",
    name: "租户短信通道模式",
    description: "租户短信通道模式：platform 继承平台，tenant_aliyun 使用租户自有阿里云，tenant_tencent 使用租户自有腾讯云。",
    valueType: "string",
    envNames: ["SMS_CHANNEL_MODE"],
    defaultValue: "platform",
  },
  {
    key: "ALIYUN_SMS_SIGN_NAME",
    groupCode: "sms",
    name: "阿里云短信签名",
    description: "阿里云短信签名名称。",
    valueType: "string",
    envNames: ["ALIYUN_SMS_SIGN_NAME"],
  },
  {
    key: "ALIBABA_CLOUD_ACCESS_KEY_ID",
    groupCode: "sms",
    name: "阿里云 AccessKey ID",
    description: "阿里云短信 AccessKey ID，加密存储。",
    valueType: "string",
    envNames: ["ALIBABA_CLOUD_ACCESS_KEY_ID"],
    isSecret: true,
  },
  {
    key: "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
    groupCode: "sms",
    name: "阿里云 AccessKey Secret",
    description: "阿里云短信 AccessKey Secret，加密存储。",
    valueType: "string",
    envNames: ["ALIBABA_CLOUD_ACCESS_KEY_SECRET"],
    isSecret: true,
  },
  {
    key: "ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER",
    groupCode: "sms",
    name: "客户绑定短信模板",
    description: "客户绑定手机号验证码模板 Code。",
    valueType: "string",
    envNames: ["ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER"],
  },
  {
    key: "ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE",
    groupCode: "sms",
    name: "员工绑定短信模板",
    description: "员工绑定手机号验证码模板 Code。",
    valueType: "string",
    envNames: ["ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE"],
  },
  {
    key: "ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN",
    groupCode: "sms",
    name: "后台登录短信模板",
    description: "后台管理员登录验证码模板 Code；为空时回退员工绑定模板。",
    valueType: "string",
    envNames: ["ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN"],
  },
  {
    key: "ALIYUN_SMS_TEMPLATE_CODE_PROJECT_ACCEPTANCE",
    groupCode: "sms",
    name: "项目验收通知短信模板",
    description: "领导复核通过后发送给客户的项目验收通知模板 Code。模板变量建议包含 stageName、link、expireHours。",
    valueType: "string",
    envNames: ["ALIYUN_SMS_TEMPLATE_CODE_PROJECT_ACCEPTANCE"],
  },
  {
    key: "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
    groupCode: "sms",
    name: "项目验收短信链接有效期",
    description: "项目验收短信 ticket 有效期，单位小时。",
    valueType: "number",
    envNames: ["PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS"],
    defaultValue: "72",
  },
  {
    key: "PROJECT_ACCEPTANCE_SMS_LINK_TYPE",
    groupCode: "sms",
    name: "项目验收短信链接类型",
    description: "支持 scheme 或 url_link；url_link 依赖微信小程序 AppID/Secret。",
    valueType: "string",
    envNames: ["PROJECT_ACCEPTANCE_SMS_LINK_TYPE"],
    defaultValue: "scheme",
  },
  {
    key: "TENCENT_SMS_SECRET_ID",
    groupCode: "sms",
    name: "腾讯云短信 SecretId",
    description: "腾讯云短信 SecretId，加密存储。",
    valueType: "string",
    envNames: ["TENCENT_SMS_SECRET_ID"],
    isSecret: true,
  },
  {
    key: "TENCENT_SMS_SECRET_KEY",
    groupCode: "sms",
    name: "腾讯云短信 SecretKey",
    description: "腾讯云短信 SecretKey，加密存储。",
    valueType: "string",
    envNames: ["TENCENT_SMS_SECRET_KEY"],
    isSecret: true,
  },
  {
    key: "TENCENT_SMS_REGION",
    groupCode: "sms",
    name: "腾讯云短信区域",
    description: "腾讯云短信 API 区域。",
    valueType: "string",
    envNames: ["TENCENT_SMS_REGION"],
    defaultValue: "ap-guangzhou",
  },
  {
    key: "TENCENT_SMS_ENDPOINT",
    groupCode: "sms",
    name: "腾讯云短信 Endpoint",
    description: "腾讯云短信 API 域名。",
    valueType: "string",
    envNames: ["TENCENT_SMS_ENDPOINT"],
    defaultValue: "sms.tencentcloudapi.com",
  },
  {
    key: "TENCENT_SMS_SDK_APP_ID",
    groupCode: "sms",
    name: "腾讯云短信 SdkAppId",
    description: "腾讯云短信应用 SdkAppId。",
    valueType: "string",
    envNames: ["TENCENT_SMS_SDK_APP_ID"],
  },
  {
    key: "TENCENT_SMS_SIGN_NAME",
    groupCode: "sms",
    name: "腾讯云短信签名",
    description: "腾讯云短信签名名称。",
    valueType: "string",
    envNames: ["TENCENT_SMS_SIGN_NAME"],
  },
  {
    key: "TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER",
    groupCode: "sms",
    name: "腾讯云客户绑定模板",
    description: "客户绑定手机号验证码模板 ID。",
    valueType: "string",
    envNames: ["TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER"],
  },
  {
    key: "TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE",
    groupCode: "sms",
    name: "腾讯云员工绑定模板",
    description: "员工绑定手机号验证码模板 ID。",
    valueType: "string",
    envNames: ["TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE"],
  },
  {
    key: "TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN",
    groupCode: "sms",
    name: "腾讯云后台登录模板",
    description: "后台管理员登录验证码模板 ID；为空时回退员工绑定模板。",
    valueType: "string",
    envNames: ["TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN"],
  },
  {
    key: "TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE",
    groupCode: "sms",
    name: "腾讯云项目验收通知模板",
    description: "领导复核通过后发送给客户的项目验收通知模板 ID。",
    valueType: "string",
    envNames: ["TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE"],
  },
  {
    key: "EZVIZ_API_BASE_URL",
    groupCode: "ezviz",
    name: "萤石开放平台地址",
    description: "萤石云开放平台 API 基础地址。",
    valueType: "string",
    envNames: ["EZVIZ_API_BASE_URL"],
    defaultValue: "https://open.ys7.com",
  },
  {
    key: "EZVIZ_APP_KEY",
    groupCode: "ezviz",
    name: "萤石 App Key",
    description: "萤石开放平台 App Key，加密存储。",
    valueType: "string",
    envNames: ["EZVIZ_APP_KEY"],
    isSecret: true,
  },
  {
    key: "EZVIZ_APP_SECRET",
    groupCode: "ezviz",
    name: "萤石 App Secret",
    description: "萤石开放平台 App Secret，加密存储。",
    valueType: "string",
    envNames: ["EZVIZ_APP_SECRET"],
    isSecret: true,
  },
  {
    key: "EZVIZ_TOKEN_REFRESH_AHEAD_MS",
    groupCode: "ezviz",
    name: "萤石 Token 提前刷新时间",
    description: "访问令牌过期前提前刷新的毫秒数。",
    valueType: "number",
    envNames: ["EZVIZ_TOKEN_REFRESH_AHEAD_MS"],
    defaultValue: String(10 * 60 * 1000),
  },
  {
    key: "EZPLAYER_PLUGIN_VERSION",
    groupCode: "ezviz",
    name: "EZPlayer 插件版本",
    description: "前端播放器使用的 EZPlayer 插件版本。",
    valueType: "string",
    envNames: ["EZPLAYER_PLUGIN_VERSION"],
    defaultValue: "1.5.2",
  },
  {
    key: "TENCENTCLOUD_SECRET_ID",
    groupCode: "tencent_iot_video",
    name: "腾讯云 SecretId",
    description: "腾讯云物联网智能视频服务（行业版）SecretId，加密存储。",
    valueType: "string",
    envNames: ["TENCENTCLOUD_SECRET_ID"],
    isSecret: true,
  },
  {
    key: "TENCENTCLOUD_SECRET_KEY",
    groupCode: "tencent_iot_video",
    name: "腾讯云 SecretKey",
    description: "腾讯云物联网智能视频服务（行业版）SecretKey，加密存储。",
    valueType: "string",
    envNames: ["TENCENTCLOUD_SECRET_KEY"],
    isSecret: true,
  },
  {
    key: "TENCENT_IOT_VIDEO_REGION",
    groupCode: "tencent_iot_video",
    name: "腾讯云区域",
    description: "物联网智能视频服务（行业版）API 区域。",
    valueType: "string",
    envNames: ["TENCENT_IOT_VIDEO_REGION"],
    defaultValue: "ap-guangzhou",
  },
  {
    key: "TENCENT_IOT_VIDEO_ENDPOINT",
    groupCode: "tencent_iot_video",
    name: "腾讯云 API Endpoint",
    description: "物联网智能视频服务（行业版）API 域名。",
    valueType: "string",
    envNames: ["TENCENT_IOT_VIDEO_ENDPOINT"],
    defaultValue: "iotvideoindustry.tencentcloudapi.com",
  },
  {
    key: "TENCENT_IOT_VIDEO_DEFAULT_PROTOCOL",
    groupCode: "tencent_iot_video",
    name: "腾讯云默认播放协议",
    description: "小程序播放优先使用协议，建议 flv。",
    valueType: "string",
    envNames: ["TENCENT_IOT_VIDEO_DEFAULT_PROTOCOL"],
    defaultValue: "flv",
  },
  {
    key: "TENCENT_IOT_VIDEO_LIVE_STREAM_ACTION",
    groupCode: "tencent_iot_video",
    name: "腾讯云实时地址接口",
    description: "默认使用新版 DescribeChannelLiveStreamURL；异常时后端会尝试旧接口兜底。",
    valueType: "string",
    envNames: ["TENCENT_IOT_VIDEO_LIVE_STREAM_ACTION"],
    defaultValue: "DescribeChannelLiveStreamURL",
  },
  {
    key: "PLATFORM_STORAGE_PROVIDER",
    groupCode: "storage",
    name: "平台存储提供商",
    description: "平台通用图片和附件上传的存储提供商。supabase_storage 为旧链路，tencent_cos 为腾讯云 COS。",
    valueType: "string",
    envNames: ["PLATFORM_STORAGE_PROVIDER"],
    defaultValue: "supabase_storage",
  },
  {
    key: "TENCENT_COS_SECRET_ID",
    groupCode: "storage",
    name: "腾讯云 COS SecretId",
    description: "腾讯云 COS 专用 SecretId，加密存储。与物联网视频、ASR 等腾讯云密钥解耦。",
    valueType: "string",
    envNames: ["TENCENT_COS_SECRET_ID"],
    isSecret: true,
  },
  {
    key: "TENCENT_COS_SECRET_KEY",
    groupCode: "storage",
    name: "腾讯云 COS SecretKey",
    description: "腾讯云 COS 专用 SecretKey，加密存储。与物联网视频、ASR 等腾讯云密钥解耦。",
    valueType: "string",
    envNames: ["TENCENT_COS_SECRET_KEY"],
    isSecret: true,
  },
  {
    key: "PLATFORM_COS_BUCKET",
    groupCode: "storage",
    name: "平台 COS Bucket",
    description: "平台通用图片和附件存储使用的腾讯云 COS bucket 名称，需包含 APPID 后缀。",
    valueType: "string",
    envNames: ["PLATFORM_COS_BUCKET"],
  },
  {
    key: "PLATFORM_COS_REGION",
    groupCode: "storage",
    name: "平台 COS 区域",
    description: "平台 COS bucket 所在区域，例如 ap-guangzhou。",
    valueType: "string",
    envNames: ["PLATFORM_COS_REGION"],
    defaultValue: "ap-guangzhou",
  },
  {
    key: "PLATFORM_COS_PUBLIC_BASE_URL",
    groupCode: "storage",
    name: "平台 COS/CDN 访问域名",
    description: "平台文件公网或 CDN 访问域名，例如 https://assets.goodcms.cn。为空时后端返回 COS 签名 URL。",
    valueType: "string",
    envNames: ["PLATFORM_COS_PUBLIC_BASE_URL"],
  },
  {
    key: "PLATFORM_COS_SIGNED_URL_TTL_SECONDS",
    groupCode: "storage",
    name: "COS 签名 URL 有效期",
    description: "未配置公网/CDN 域名时，后端生成 COS 签名 URL 的有效期，单位秒。",
    valueType: "number",
    envNames: ["PLATFORM_COS_SIGNED_URL_TTL_SECONDS"],
    defaultValue: "900",
  },
  {
    key: "PLATFORM_COS_UPLOAD_USE_ACCELERATE",
    groupCode: "storage",
    name: "COS 上传使用全球加速",
    description: "开启后直传上传 URL 使用腾讯云 COS 全球加速域名。需先在腾讯云 COS bucket 启用全球加速并配置 CORS。",
    valueType: "boolean",
    envNames: ["PLATFORM_COS_UPLOAD_USE_ACCELERATE"],
    defaultValue: "false",
  },
  {
    key: "PLATFORM_FILE_ACCESS_POLICY",
    groupCode: "storage",
    name: "平台文件访问策略",
    description: "按业务场景控制文件访问模式和签名 URL 有效期。access_mode 支持 public/signed，signed_url_ttl_seconds 单位秒。",
    valueType: "json",
    envNames: ["PLATFORM_FILE_ACCESS_POLICY"],
    defaultValue: JSON.stringify({
      default: {
        access_mode: "signed",
        signed_url_ttl_seconds: 1800,
      },
      scenes: {
        project_log: {
          access_mode: "signed",
          signed_url_ttl_seconds: 1800,
        },
        project_log_comment: {
          access_mode: "signed",
          signed_url_ttl_seconds: 1800,
        },
        project_acceptance: {
          access_mode: "signed",
          signed_url_ttl_seconds: 1800,
        },
        customer_follow_up_comment: {
          access_mode: "signed",
          signed_url_ttl_seconds: 1800,
        },
        customer_douyin_screenshot: {
          access_mode: "signed",
          signed_url_ttl_seconds: 1800,
        },
        expense_request: {
          access_mode: "signed",
          signed_url_ttl_seconds: 600,
        },
        expense_request_settlement: {
          access_mode: "signed",
          signed_url_ttl_seconds: 600,
        },
        referral_payment: {
          access_mode: "signed",
          signed_url_ttl_seconds: 600,
        },
        employee_avatar: {
          access_mode: "signed",
          signed_url_ttl_seconds: 21600,
        },
        customer_avatar: {
          access_mode: "signed",
          signed_url_ttl_seconds: 21600,
        },
        h5_marketing_page: {
          access_mode: "public",
          signed_url_ttl_seconds: 0,
        },
        panorama_tiles: {
          access_mode: "public",
          signed_url_ttl_seconds: 0,
        },
      },
    }, null, 2),
  },
  {
    key: "AI_CHAT_COMPLETIONS_URL",
    groupCode: "ai",
    name: "AI 对话接口地址",
    description: "兼容 Chat Completions 的接口地址。",
    valueType: "string",
    envNames: ["AI_CHAT_COMPLETIONS_URL", "DEEPSEEK_CHAT_COMPLETIONS_URL"],
  },
  {
    key: "AI_API_KEY",
    groupCode: "ai",
    name: "AI API Key",
    description: "OpenAI/OpenRouter 兼容接口 API Key，加密存储。",
    valueType: "string",
    envNames: ["AI_API_KEY"],
    isSecret: true,
  },
  {
    key: "DEEPSEEK_API_KEY",
    groupCode: "ai",
    name: "DeepSeek API Key",
    description: "DeepSeek API Key，加密存储。",
    valueType: "string",
    envNames: ["DEEPSEEK_API_KEY"],
    isSecret: true,
  },
  {
    key: "AI_MODEL",
    groupCode: "ai",
    name: "AI 模型名称",
    description: "默认 AI 模型名称。",
    valueType: "string",
    envNames: ["AI_MODEL", "DEEPSEEK_MODEL"],
  },
  {
    key: "AI_REQUEST_TIMEOUT_MS",
    groupCode: "ai",
    name: "AI 请求超时时间",
    description: "AI 请求超时时间，单位毫秒。",
    valueType: "number",
    envNames: ["AI_REQUEST_TIMEOUT_MS"],
    defaultValue: "60000",
  },
  {
    key: "DECORATION_QA_SYSTEM_PROMPT",
    groupCode: "ai",
    name: "装修问答系统提示词",
    description: "装修问答功能使用的系统提示词。",
    valueType: "string",
    envNames: ["DECORATION_QA_SYSTEM_PROMPT"],
  },
  {
    key: "OPENROUTER_HTTP_REFERER",
    groupCode: "ai",
    name: "OpenRouter Referer",
    description: "OpenRouter 请求头 HTTP-Referer。",
    valueType: "string",
    envNames: ["OPENROUTER_HTTP_REFERER"],
    defaultValue: "https://gooes.local",
  },
  {
    key: "OPENROUTER_APP_NAME",
    groupCode: "ai",
    name: "OpenRouter 应用名",
    description: "OpenRouter 请求头 X-Title。",
    valueType: "string",
    envNames: ["OPENROUTER_APP_NAME"],
    defaultValue: "gooes-decoration-qa",
  },
  {
    key: "SOCIAL_VIDEO_TRANSCRIPTION_ENABLED",
    groupCode: "social_video",
    name: "短视频语音识别开关",
    description: "是否启用小程序抖音链接语音转文本能力。",
    valueType: "boolean",
    envNames: ["SOCIAL_VIDEO_TRANSCRIPTION_ENABLED"],
    defaultValue: "true",
  },
  {
    key: "SOCIAL_VIDEO_TRANSCRIPTION_PROVIDER",
    groupCode: "social_video",
    name: "短视频识别主链路",
    description: "tencent_asr 使用 Apify 解析音视频地址后由腾讯云 ASR 转写；apify 使用 Apify 直接转写。",
    valueType: "string",
    envNames: ["SOCIAL_VIDEO_TRANSCRIPTION_PROVIDER"],
    defaultValue: "tencent_asr",
  },
  {
    key: "APIFY_API_TOKEN",
    groupCode: "social_video",
    name: "Apify API Token",
    description: "Apify API Token，加密存储。",
    valueType: "string",
    envNames: ["APIFY_API_TOKEN"],
    isSecret: true,
  },
  {
    key: "APIFY_TRANSCRIPT_ACTOR_ID",
    groupCode: "social_video",
    name: "Apify 转写 Actor ID",
    description: "用于抖音视频转文本的 Apify Actor ID。默认 apple_yang/douyin-transcripts-scraper。",
    valueType: "string",
    envNames: ["APIFY_TRANSCRIPT_ACTOR_ID"],
    defaultValue: "apple_yang/douyin-transcripts-scraper",
  },
  {
    key: "APIFY_TRANSCRIPT_TIMEOUT_MS",
    groupCode: "social_video",
    name: "Apify 转写超时",
    description: "调用 Apify Actor 的最大等待时间，单位毫秒。",
    valueType: "number",
    envNames: ["APIFY_TRANSCRIPT_TIMEOUT_MS"],
    defaultValue: "60000",
  },
  {
    key: "SOCIAL_VIDEO_CACHE_TTL_HOURS",
    groupCode: "social_video",
    name: "短视频识别缓存时间",
    description: "同一抖音链接识别成功后复用结果的小时数。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_CACHE_TTL_HOURS"],
    defaultValue: "24",
  },
  {
    key: "SOCIAL_VIDEO_DAILY_LIMIT_PER_USER",
    groupCode: "social_video",
    name: "单用户每日识别上限",
    description: "单个登录用户每天最多可创建的短视频识别任务数。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_DAILY_LIMIT_PER_USER"],
    defaultValue: "20",
  },
  {
    key: "SOCIAL_VIDEO_CONCURRENCY_LIMIT",
    groupCode: "social_video",
    name: "短视频识别并发数",
    description: "短视频识别 worker 同时执行下载、ffmpeg 和 ASR 的最大任务数，建议 1-2。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_CONCURRENCY_LIMIT"],
    defaultValue: "1",
  },
  {
    key: "SOCIAL_VIDEO_WORKER_POLL_INTERVAL_MS",
    groupCode: "social_video",
    name: "短视频识别 worker 轮询间隔",
    description: "worker 扫描待处理任务的间隔时间，单位毫秒。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_WORKER_POLL_INTERVAL_MS"],
    defaultValue: "3000",
  },
  {
    key: "SOCIAL_VIDEO_STALE_TASK_TIMEOUT_MS",
    groupCode: "social_video",
    name: "短视频识别任务超时回收",
    description: "worker 重启或崩溃后，处理中任务超过该时间未更新则允许重新领取，单位毫秒。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_STALE_TASK_TIMEOUT_MS"],
    defaultValue: "900000",
  },
  {
    key: "SOCIAL_VIDEO_SCRIPT_DAILY_LIMIT_PER_USER",
    groupCode: "social_video",
    name: "短视频脚本每日生成上限",
    description: "单个登录用户每天最多生成的短视频拍摄脚本数量。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_SCRIPT_DAILY_LIMIT_PER_USER"],
    defaultValue: "20",
  },
  {
    key: "SOCIAL_VIDEO_SCRIPT_CACHE_TTL_HOURS",
    groupCode: "social_video",
    name: "短视频脚本缓存时间",
    description: "同一转写任务、目标平台、风格、时长和目标生成成功后复用结果的小时数。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_SCRIPT_CACHE_TTL_HOURS"],
    defaultValue: "24",
  },
  {
    key: "SOCIAL_VIDEO_SCRIPT_AI_MODEL",
    groupCode: "social_video",
    name: "短视频脚本 AI 模型",
    description: "短视频脚本生成优先使用的 AI 模型；为空时使用 AI_MODEL。",
    valueType: "string",
    envNames: ["SOCIAL_VIDEO_SCRIPT_AI_MODEL"],
  },
  {
    key: "SOCIAL_VIDEO_SCRIPT_AI_TIMEOUT_MS",
    groupCode: "social_video",
    name: "短视频脚本 AI 超时",
    description: "短视频脚本同步生成接口的 AI 请求超时时间，单位毫秒。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_SCRIPT_AI_TIMEOUT_MS"],
    defaultValue: "25000",
  },
  {
    key: "SOCIAL_VIDEO_SCRIPT_SOURCE_MAX_CHARS",
    groupCode: "social_video",
    name: "短视频脚本输入文本上限",
    description: "发送给 AI 的转写文本最大字符数。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_SCRIPT_SOURCE_MAX_CHARS"],
    defaultValue: "4000",
  },
  {
    key: "SOCIAL_VIDEO_MAX_DURATION_SECONDS",
    groupCode: "social_video",
    name: "短视频最大时长",
    description: "短视频语音识别建议最大视频时长，单位秒。Apify 直接转写路径中作为配置和后续兜底限制。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_MAX_DURATION_SECONDS"],
    defaultValue: "600",
  },
  {
    key: "SOCIAL_VIDEO_MAX_DOWNLOAD_BYTES",
    groupCode: "social_video",
    name: "短视频下载大小上限",
    description: "从解析地址下载媒体文件的最大字节数。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_MAX_DOWNLOAD_BYTES"],
    defaultValue: "104857600",
  },
  {
    key: "SOCIAL_VIDEO_DOWNLOAD_TIMEOUT_MS",
    groupCode: "social_video",
    name: "短视频下载超时",
    description: "下载抖音音视频文件的超时时间，单位毫秒。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_DOWNLOAD_TIMEOUT_MS"],
    defaultValue: "180000",
  },
  {
    key: "SOCIAL_VIDEO_FFMPEG_TIMEOUT_MS",
    groupCode: "social_video",
    name: "ffmpeg 提取音频超时",
    description: "ffmpeg 从短视频提取音频的超时时间，单位毫秒。",
    valueType: "number",
    envNames: ["SOCIAL_VIDEO_FFMPEG_TIMEOUT_MS"],
    defaultValue: "120000",
  },
  {
    key: "SOCIAL_VIDEO_AUDIO_BITRATE",
    groupCode: "social_video",
    name: "ASR 音频码率",
    description: "ffmpeg 生成提交腾讯云 ASR 音频的目标码率，建议 32k。",
    valueType: "string",
    envNames: ["SOCIAL_VIDEO_AUDIO_BITRATE"],
    defaultValue: "32k",
  },
  {
    key: "TENCENT_ASR_REGION",
    groupCode: "social_video",
    name: "腾讯云 ASR 区域",
    description: "腾讯云语音识别 API 区域。",
    valueType: "string",
    envNames: ["TENCENT_ASR_REGION"],
    defaultValue: "ap-shanghai",
  },
  {
    key: "TENCENT_ASR_ENDPOINT",
    groupCode: "social_video",
    name: "腾讯云 ASR Endpoint",
    description: "腾讯云语音识别 API 域名。",
    valueType: "string",
    envNames: ["TENCENT_ASR_ENDPOINT"],
    defaultValue: "asr.tencentcloudapi.com",
  },
  {
    key: "TENCENT_ASR_ENGINE_MODEL_TYPE",
    groupCode: "social_video",
    name: "腾讯云 ASR 引擎",
    description: "录音文件识别引擎，中文短视频建议 16k_zh。",
    valueType: "string",
    envNames: ["TENCENT_ASR_ENGINE_MODEL_TYPE"],
    defaultValue: "16k_zh",
  },
  {
    key: "TENCENT_ASR_RES_TEXT_FORMAT",
    groupCode: "social_video",
    name: "腾讯云 ASR 返回格式",
    description: "录音文件识别返回样式，3 为带标点并按标点分段，适合字幕/短视频文案。",
    valueType: "number",
    envNames: ["TENCENT_ASR_RES_TEXT_FORMAT"],
    defaultValue: "3",
  },
  {
    key: "TENCENT_ASR_POLL_TIMEOUT_MS",
    groupCode: "social_video",
    name: "腾讯云 ASR 轮询超时",
    description: "提交录音识别任务后等待结果的最大时间，单位毫秒。",
    valueType: "number",
    envNames: ["TENCENT_ASR_POLL_TIMEOUT_MS"],
    defaultValue: "180000",
  },
  {
    key: "WECHAT_SHARE_CAMPAIGN_PAGE",
    groupCode: "wechat",
    name: "微信助力页路径",
    description: "微信小程序客户日志助力页路径。",
    valueType: "string",
    envNames: ["WECHAT_SHARE_CAMPAIGN_PAGE"],
    defaultValue: "pages/share-campaign/index",
  },
  {
    key: "WECHAT_APPID",
    groupCode: "wechat",
    name: "微信小程序 AppID",
    description: "微信小程序 AppID，加密存储。",
    valueType: "string",
    envNames: ["WECHAT_APPID"],
    isSecret: true,
  },
  {
    key: "WECHAT_SECRET",
    groupCode: "wechat",
    name: "微信小程序 Secret",
    description: "微信小程序 Secret，加密存储。",
    valueType: "string",
    envNames: ["WECHAT_SECRET"],
    isSecret: true,
  },
  {
    key: "WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE",
    groupCode: "wechat",
    name: "微信领券页路径",
    description: "微信小程序领券页路径。",
    valueType: "string",
    envNames: ["WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE"],
    defaultValue: "pages/share-campaign-claim-voucher/index",
  },
  {
    key: "WECHAT_PROJECT_ACCEPTANCE_PAGE",
    groupCode: "wechat",
    name: "微信项目验收详情页路径",
    description: "短信拉起小程序后进入的客户项目验收详情页路径。",
    valueType: "string",
    envNames: ["WECHAT_PROJECT_ACCEPTANCE_PAGE"],
    defaultValue: "packageCustomerPortal/pages/customer-project-acceptance/index",
  },
  {
    key: "WECHAT_MINIPROGRAM_ENV_VERSION",
    groupCode: "wechat",
    name: "微信小程序版本环境",
    description: "release 为正式版，trial 为体验版，develop 为开发版。",
    valueType: "string",
    envNames: ["WECHAT_MINIPROGRAM_ENV_VERSION"],
    defaultValue: "release",
  },
  {
    key: "CUSTOMER_LOG_SHARE_TARGET_ASSIST_COUNT",
    groupCode: "wechat",
    name: "助力目标人数",
    description: "客户日志分享活动目标助力人数。",
    valueType: "number",
    envNames: ["CUSTOMER_LOG_SHARE_TARGET_ASSIST_COUNT"],
    defaultValue: "10",
  },
  {
    key: "DEPLOY_NOTIFY_TO",
    groupCode: "notify",
    name: "部署通知收件人",
    description: "部署通知邮件收件人。",
    valueType: "string",
    envNames: ["DEPLOY_NOTIFY_TO"],
  },
  {
    key: "DEPLOY_NOTIFY_FROM",
    groupCode: "notify",
    name: "部署通知发件人",
    description: "部署通知邮件发件人。",
    valueType: "string",
    envNames: ["DEPLOY_NOTIFY_FROM"],
  },
  {
    key: "SMTP_HOST",
    groupCode: "notify",
    name: "SMTP 主机",
    description: "SMTP 服务器地址。",
    valueType: "string",
    envNames: ["SMTP_HOST"],
  },
  {
    key: "SMTP_USER",
    groupCode: "notify",
    name: "SMTP 用户名",
    description: "SMTP 登录用户名，加密存储。",
    valueType: "string",
    envNames: ["SMTP_USER"],
    isSecret: true,
  },
  {
    key: "SMTP_PASS",
    groupCode: "notify",
    name: "SMTP 密码/授权码",
    description: "SMTP 登录密码或授权码，加密存储。",
    valueType: "string",
    envNames: ["SMTP_PASS"],
    isSecret: true,
  },
  {
    key: "SMTP_PORT",
    groupCode: "notify",
    name: "SMTP 端口",
    description: "SMTP 服务器端口。",
    valueType: "number",
    envNames: ["SMTP_PORT"],
    defaultValue: "465",
  },
  {
    key: "SMTP_SECURE",
    groupCode: "notify",
    name: "SMTP SSL",
    description: "是否使用 SMTP SSL。",
    valueType: "boolean",
    envNames: ["SMTP_SECURE"],
    defaultValue: "true",
  },
  {
    key: "SMTP_FAMILY",
    groupCode: "notify",
    name: "SMTP 网络协议族",
    description: "SMTP 网络协议族，通常为 4 或 6。",
    valueType: "number",
    envNames: ["SMTP_FAMILY"],
  },
];

const definitionByKey = new Map(SETTING_DEFINITIONS.map((item) => [item.key, item]));

const TENANT_SMS_CHANNEL_MODE_KEY = "SMS_CHANNEL_MODE";
const TENANT_SMS_PLATFORM_MODE = "platform";
const TENANT_SMS_ALIYUN_MODE = "tenant_aliyun";
const TENANT_SMS_TENCENT_MODE = "tenant_tencent";

const TENANT_SMS_BASE_SETTING_KEYS = new Set([
  TENANT_SMS_CHANNEL_MODE_KEY,
]);

const TENANT_ALIYUN_SMS_SETTING_KEYS = new Set([
  "ALIBABA_CLOUD_ACCESS_KEY_ID",
  "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
  "ALIYUN_SMS_SIGN_NAME",
  "ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER",
  "ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE",
  "ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN",
  "ALIYUN_SMS_TEMPLATE_CODE_PROJECT_ACCEPTANCE",
  "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
]);

const TENANT_TENCENT_SMS_SETTING_KEYS = new Set([
  "TENCENT_SMS_SECRET_ID",
  "TENCENT_SMS_SECRET_KEY",
  "TENCENT_SMS_REGION",
  "TENCENT_SMS_ENDPOINT",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER",
  "TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE",
  "TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN",
  "TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE",
  "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
]);

const TENANT_OVERRIDABLE_SETTING_KEYS = new Set([
  ...TENANT_SMS_BASE_SETTING_KEYS,
  ...TENANT_ALIYUN_SMS_SETTING_KEYS,
  ...TENANT_TENCENT_SMS_SETTING_KEYS,
]);

const TENANT_SETTING_KEYS_HIDE_PLATFORM_VALUE = new Set([
  ...TENANT_ALIYUN_SMS_SETTING_KEYS,
  ...TENANT_TENCENT_SMS_SETTING_KEYS,
]);

const LEGACY_PARTIAL_TENANT_SMS_SETTING_KEYS = new Set([
  "ALIBABA_CLOUD_ACCESS_KEY_ID",
  "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
  "ALIYUN_SMS_SIGN_NAME",
  "ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER",
  "ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE",
  "ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN",
  "ALIYUN_SMS_TEMPLATE_CODE_PROJECT_ACCEPTANCE",
  "TENCENT_SMS_SECRET_ID",
  "TENCENT_SMS_SECRET_KEY",
  "TENCENT_SMS_REGION",
  "TENCENT_SMS_ENDPOINT",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER",
  "TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE",
  "TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN",
  "TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE",
  "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
]);

function normalizeStoredValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readEnvValue(envNames: string[]) {
  for (const name of envNames) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return null;
}

function getEncryptionKey() {
  const raw = process.env.APP_CONFIG_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw Errors.business(
      503,
      "缺少配置加密密钥 APP_CONFIG_ENCRYPTION_KEY",
      "CONFIG_ENCRYPTION_KEY_MISSING",
    );
  }

  return createHash("sha256").update(raw).digest();
}

function encryptSecretValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_VALUE_PREFIX.slice(0, -1),
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decryptSecretValue(value: string) {
  if (!value.startsWith(ENCRYPTED_VALUE_PREFIX)) {
    return value;
  }

  const [, , ivText, tagText, encryptedText] = value.split(":");
  if (!ivText || !tagText || !encryptedText) {
    throw Errors.business(500, "系统配置密文格式错误", "CONFIG_SECRET_DECRYPT_FAILED");
  }

  try {
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
  } catch (error) {
    throw Errors.business(
      500,
      "系统配置密文解密失败",
      "CONFIG_SECRET_DECRYPT_FAILED",
      error instanceof Error ? { message: error.message } : undefined,
    );
  }
}

function resolveEffectiveValue(record: SystemSettingRecord): {
  value: string | null;
  source: SettingSource;
} {
  const storedValue = normalizeStoredValue(record.value_text);
  if (record.status === "active" && storedValue) {
    return { value: storedValue, source: "database" };
  }

  const definition = definitionByKey.get(record.key);
  const envValue = definition ? readEnvValue(definition.envNames) : readEnvValue([record.key]);
  if (envValue) {
    return { value: envValue, source: "env" };
  }

  if (definition?.defaultValue) {
    return { value: definition.defaultValue, source: "default" };
  }

  return { value: null, source: "empty" };
}

function validateSettingValue(record: SystemSettingRecord, value: string | null) {
  if (!value) return null;

  if (record.key === TENANT_SMS_CHANNEL_MODE_KEY) {
    return normalizeTenantSmsChannelMode(value);
  }

  if (record.value_type === "number" && !Number.isFinite(Number(value))) {
    throw Errors.badRequest("配置值必须是数字");
  }

  if (record.value_type === "boolean" && !["true", "false"].includes(value.toLowerCase())) {
    throw Errors.badRequest("配置值必须是 true 或 false");
  }

  if (record.value_type === "json") {
    try {
      JSON.parse(value);
    } catch {
      throw Errors.badRequest("配置值必须是合法 JSON");
    }
  }

  return value;
}

function normalizeTenantSmsChannelMode(value: string | null | undefined) {
  const normalized = value?.trim();
  if (
    normalized === TENANT_SMS_ALIYUN_MODE ||
    normalized === TENANT_SMS_TENCENT_MODE ||
    normalized === TENANT_SMS_PLATFORM_MODE
  ) {
    return normalized;
  }

  return TENANT_SMS_PLATFORM_MODE;
}

class SystemSettingsService {
  private cache: {
    expiresAt: number;
    records: SystemSettingRecord[];
  } | null = null;

  private async listRecords() {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.records;
    }

    const records = await systemSettingRepository.listAll();
    this.cache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      records,
    };

    return records;
  }

  private clearCache() {
    this.cache = null;
  }

  private isTenantOverridable(key: string) {
    return TENANT_OVERRIDABLE_SETTING_KEYS.has(key);
  }

  private getPlatformRecord(records: SystemSettingRecord[], key: string) {
    return records.find((item) => item.key === key && !item.tenant_id) || null;
  }

  private getTenantRecord(records: SystemSettingRecord[], key: string, tenantId?: string | null) {
    if (!tenantId || !this.isTenantOverridable(key)) {
      return null;
    }

    return records.find((item) => item.key === key && item.tenant_id === tenantId) || null;
  }

  private resolveEffectiveRecord(input: {
    key: string;
    tenantId?: string | null;
    records: SystemSettingRecord[];
  }) {
    const tenantRecord = this.getTenantRecord(input.records, input.key, input.tenantId);
    if (tenantRecord) {
      const tenantStoredValue = normalizeStoredValue(tenantRecord.value_text);
      if (tenantRecord.status === "active" && tenantStoredValue) {
        return {
          record: tenantRecord,
          effective: {
            value: tenantStoredValue,
            source: "database" as const,
          },
          effectiveScope: "tenant" as const,
        };
      }
    }

    const platformRecord = this.getPlatformRecord(input.records, input.key);
    if (platformRecord) {
      return {
        record: platformRecord,
        effective: resolveEffectiveValue(platformRecord),
        effectiveScope: "platform" as const,
      };
    }

    const definition = definitionByKey.get(input.key);
    const fallbackValue = readEnvValue(definition?.envNames || [input.key])
      || definition?.defaultValue
      || null;
    return {
      record: null,
      effective: {
        value: fallbackValue,
        source: fallbackValue
          ? readEnvValue(definition?.envNames || [input.key])
            ? "env" as const
            : "default" as const
          : "empty" as const,
      },
      effectiveScope: "platform" as const,
    };
  }

  private toEffective(
    record: SystemSettingRecord,
    options?: {
      effective?: ReturnType<typeof resolveEffectiveValue>;
      effectiveScope?: SettingScope;
    },
  ): EffectiveSetting {
    const effective = options?.effective || resolveEffectiveValue(record);
    return {
      ...record,
      stored_value: record.is_secret && record.value_text ? "******" : record.value_text,
      effective_value: record.is_secret && effective.value ? "******" : effective.value,
      source: effective.source,
      is_configured: effective.source !== "empty",
      effective_scope: options?.effectiveScope || (record.tenant_id ? "tenant" : "platform"),
      can_override_by_tenant: this.isTenantOverridable(record.key),
    };
  }

  private toTenantEditableEffective(input: {
    platformRecord: SystemSettingRecord;
    tenantRecord: SystemSettingRecord | null;
    tenantId: string;
    effective: ReturnType<typeof resolveEffectiveValue>;
    effectiveScope: SettingScope;
  }) {
    const record: SystemSettingRecord = {
      ...input.platformRecord,
      id: input.tenantRecord?.id ?? input.platformRecord.id,
      tenant_id: input.tenantId,
      value_text: input.tenantRecord?.value_text ?? null,
      updated_by_employee_id: input.tenantRecord?.updated_by_employee_id ?? null,
      created_at: input.tenantRecord?.created_at ?? input.platformRecord.created_at,
      updated_at: input.tenantRecord?.updated_at ?? input.platformRecord.updated_at,
    };

    return this.toEffective(record, {
      effective: input.effective,
      effectiveScope: input.effectiveScope,
    });
  }

  private listTenantSmsSettings(input: {
    tenantId: string;
    records: SystemSettingRecord[];
  }) {
    const platformRecords = input.records.filter((record) => !record.tenant_id);
    const tenantModeRecord = this.getTenantRecord(
      input.records,
      TENANT_SMS_CHANNEL_MODE_KEY,
      input.tenantId,
    );
    const channelMode = normalizeTenantSmsChannelMode(tenantModeRecord?.value_text);
    const visibleKeys = new Set<string>(TENANT_SMS_BASE_SETTING_KEYS);

    for (const key of TENANT_ALIYUN_SMS_SETTING_KEYS) visibleKeys.add(key);
    for (const key of TENANT_TENCENT_SMS_SETTING_KEYS) visibleKeys.add(key);

    return platformRecords
      .filter((platformRecord) => visibleKeys.has(platformRecord.key))
      .map((platformRecord) => {
        const tenantRecord = this.getTenantRecord(
          input.records,
          platformRecord.key,
          input.tenantId,
        );
        const tenantStoredValue = normalizeStoredValue(tenantRecord?.value_text);

        if (platformRecord.key === TENANT_SMS_CHANNEL_MODE_KEY) {
          return this.toTenantEditableEffective({
            platformRecord,
            tenantRecord,
            tenantId: input.tenantId,
            effective: {
              value: channelMode,
              source: tenantStoredValue ? "database" as const : "default" as const,
            },
            effectiveScope: tenantStoredValue ? "tenant" : "platform",
          });
        }

        return this.toTenantEditableEffective({
          platformRecord,
          tenantRecord,
          tenantId: input.tenantId,
          effective: tenantStoredValue
            ? {
              value: tenantStoredValue,
              source: "database" as const,
            }
            : {
              value: null,
              source: "empty" as const,
            },
          effectiveScope: tenantStoredValue ? "tenant" : "platform",
        });
      });
  }

  async listSettings(authContext?: AuthContext) {
    const records = await this.listRecords();
    const isTenantContext = Boolean(authContext && !authContext.isPlatformAdmin);
    const tenantId = authContext?.isPlatformAdmin ? null : authContext?.tenantId || null;
    const list = isTenantContext && tenantId
      ? this.listTenantSmsSettings({
        tenantId,
        records,
      })
      : records
        .filter((record) => !record.tenant_id)
        .map((platformRecord) => {
          const resolved = this.resolveEffectiveRecord({
            key: platformRecord.key,
            tenantId,
            records,
          });
          return this.toEffective(resolved.record || platformRecord, {
            effective: resolved.effective,
            effectiveScope: resolved.effectiveScope,
          });
        });

    const filteredList = isTenantContext
      ? list.filter((setting) => (
        setting.key === TENANT_SMS_CHANNEL_MODE_KEY ||
        !TENANT_SETTING_KEYS_HIDE_PLATFORM_VALUE.has(setting.key) ||
        setting.effective_scope === "tenant" ||
        setting.source === "empty"
      ))
      : list;

    const groups = filteredList.reduce<Record<string, EffectiveSetting[]>>((result, item) => {
      const group = result[item.group_code] || [];
      group.push(item);
      result[item.group_code] = group;
      return result;
    }, {});

    return { list: filteredList, groups };
  }

  private shouldClearLegacyTenantSmsOverrides(input: {
    tenantId: string | null;
    key: string;
    value: string | null;
  }) {
    return Boolean(
      input.tenantId &&
        input.key === TENANT_SMS_CHANNEL_MODE_KEY &&
        normalizeTenantSmsChannelMode(input.value) === TENANT_SMS_PLATFORM_MODE,
    );
  }

  private async clearLegacyTenantSmsOverrides(input: {
    tenantId: string;
    employeeId: string | null;
  }) {
    await Promise.all(
      Array.from(LEGACY_PARTIAL_TENANT_SMS_SETTING_KEYS).map(async (key) => {
        const existing = await systemSettingRepository.findByKey(key, input.tenantId);
        if (!existing) return;
        await systemSettingRepository.updateValue({
          key,
          tenantId: input.tenantId,
          valueText: null,
          employeeId: input.employeeId,
        });
      }),
    );
  }

  async updateSetting(authContext: AuthContext, key: string, value: string | null) {
    const tenantId = authContext.isPlatformAdmin
      ? null
      : accessPolicyService.assertTenantId(authContext);
    if (tenantId && !this.isTenantOverridable(key)) {
      throw Errors.business(
        403,
        "该配置为平台级配置，不支持租户覆盖",
        "SYSTEM_SETTING_PLATFORM_ONLY",
      );
    }

    const platformRecord = await systemSettingRepository.findByKey(key, null);
    const record = tenantId
      ? await systemSettingRepository.findByKey(key, tenantId) || platformRecord
      : platformRecord;
    if (!record) {
      throw Errors.notFound("系统配置不存在");
    }
    const normalizedValue = normalizeStoredValue(value);
    const validatedValue = validateSettingValue(record, normalizedValue);
    const valueText = record.is_secret && validatedValue
      ? encryptSecretValue(validatedValue)
      : validatedValue;
    const existingExact = await systemSettingRepository.findByKey(key, tenantId);
    const updated = existingExact
      ? await systemSettingRepository.updateValue({
        key,
        tenantId,
        valueText,
        employeeId: authContext.employeeId,
      })
      : await systemSettingRepository.createValue({
        key,
        tenantId,
        groupCode: record.group_code,
        name: record.name,
        description: record.description,
        valueType: record.value_type,
        valueText,
        isSecret: record.is_secret,
        status: record.status,
        employeeId: authContext.employeeId,
      });

    if (
      this.shouldClearLegacyTenantSmsOverrides({
        tenantId,
        key,
        value: validatedValue,
      }) &&
      tenantId
    ) {
      await this.clearLegacyTenantSmsOverrides({
        tenantId,
        employeeId: authContext.employeeId,
      });
    }
    this.clearCache();

    return this.toEffective(updated);
  }

  async getString(
    key: string,
    fallbackValue = "",
    options?: { tenantId?: string | null },
  ) {
    const records = await this.listRecords();
    const resolved = this.resolveEffectiveRecord({
      key,
      tenantId: options?.tenantId,
      records,
    });
    const record = resolved.record;
    if (!record) {
      const definition = definitionByKey.get(key);
      return readEnvValue(definition?.envNames || [key]) || definition?.defaultValue || fallbackValue;
    }

    const effective = resolved.effective;
    if (record.is_secret && effective.source === "database" && effective.value) {
      return decryptSecretValue(effective.value) || fallbackValue;
    }

    return effective.value || fallbackValue;
  }

  async getSecretString(
    key: string,
    fallbackValue = "",
    options?: { tenantId?: string | null },
  ) {
    return this.getString(key, fallbackValue, options);
  }

  async getTenantOverrideString(
    key: string,
    tenantId: string | null | undefined,
    fallbackValue = "",
  ) {
    if (!tenantId || !this.isTenantOverridable(key)) {
      return fallbackValue;
    }

    const records = await this.listRecords();
    const record = this.getTenantRecord(records, key, tenantId);
    const value = normalizeStoredValue(record?.value_text);
    if (!record || record.status !== "active" || !value) {
      return fallbackValue;
    }

    if (record.is_secret) {
      return decryptSecretValue(value) || fallbackValue;
    }

    return value;
  }

  async getNumber(
    key: string,
    fallbackValue: number,
    options?: { tenantId?: string | null },
  ) {
    const value = await this.getString(key, String(fallbackValue), options);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }

  async getBoolean(
    key: string,
    fallbackValue: boolean,
    options?: { tenantId?: string | null },
  ) {
    const value = (await this.getString(key, String(fallbackValue), options)).toLowerCase();
    if (value === "true") return true;
    if (value === "false") return false;
    return fallbackValue;
  }
}

export const systemSettingsService = new SystemSettingsService();
