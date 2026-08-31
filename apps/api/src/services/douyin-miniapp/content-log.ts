import type { DouyinContentLog } from "@/repositories/douyin-miniapp-content";
import {
  PROJECT_LOG_STAGE_CONFIG,
  isProjectLogStageCode,
} from "@gooes/domain";

export function mapDouyinContentLog(log: DouyinContentLog, images: string[]) {
  const stageLabel = isProjectLogStageCode(log.stage_code)
    ? PROJECT_LOG_STAGE_CONFIG[log.stage_code].label
    : null;

  return {
    id: log.id,
    stage_code: log.stage_code,
    stage_label: stageLabel,
    node_name: log.node_name,
    images,
    created_at: log.created_at,
  };
}
