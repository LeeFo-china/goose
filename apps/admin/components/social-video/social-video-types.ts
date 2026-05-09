export type SocialVideoScriptStatus = "completed" | "failed";

export type SocialVideoScriptItem = {
  id: string;
  transcription_id: string;
  status: SocialVideoScriptStatus;
  target_platform: "douyin" | "xiaohongshu" | "shipinhao" | "kuaishou";
  style: "practical" | "seeding" | "professional" | "down_to_earth" | "douyin_practical" | "xiaohongshu";
  duration_seconds: number;
  goal: "lead_generation" | "education" | "case_seeding" | "brand_trust";
  title: string;
  rewritten_copy: string;
  hook: string;
  shooting_script: Array<{
    scene: number;
    duration: string;
    shot: string;
    voiceover: string;
    caption: string;
  }>;
  cover_text_options: string[];
  caption_options: string[];
  tips: string[];
  source_text_length: number;
  created_at: string;
  cached?: boolean;
};

export type SocialVideoScriptsData = {
  items: SocialVideoScriptItem[];
  total: number;
  page: number;
  pageSize: number;
};
