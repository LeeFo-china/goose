import type { LeadSourceProjection } from "./leads-workbench-contract";

type Attribution = LeadSourceProjection["attribution"];
type Official = NonNullable<Attribution["analysis_info"]>;

export function attributionBasis(attribution: Partial<Attribution>): string {
  if (attribution.analysis_info) return "抖音接口返回（客户端采集）";
  if (attribution.campaign_code || attribution.content_id) return "链接参数（手工标记）";
  return "未识别";
}

export function officialAttributionEntries(info: Official): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (info.unique_id) entries.push(["来源抖音号", info.unique_id]);
  if (info.type === 1) {
    entries.push(["视频标识（加密 ID）", info.video_item_id]);
    if (info.author_open_id) entries.push(["作者 OpenID", info.author_open_id]);
  } else if (info.type === 2) {
    entries.push(["直播间 ID", info.live_room_id]);
    if (info.anchor_open_id) entries.push(["主播 OpenID", info.anchor_open_id]);
  }
  return entries;
}
