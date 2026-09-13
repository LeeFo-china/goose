import type { RenderingSource, RenderingSpace, RenderingStyle } from "../../api/rendering-styles";

export const SPACE_LABELS: Record<RenderingSpace, string> = {
  living_room: "客厅", bedroom: "卧室",
};

export const STYLE_LABELS: Record<RenderingStyle, string> = {
  modern_simple: "现代简约", cream: "奶油风", new_chinese: "新中式",
  nordic: "北欧", light_luxury: "轻奢", natural_wood: "自然原木",
  american: "美式", french: "法式", wabi_sabi: "侘寂风",
};

export const SOURCE_LABELS: Record<RenderingSource, string> = {
  real_case: "实景", design: "设计图", ai_concept: "AI 概念图",
};
