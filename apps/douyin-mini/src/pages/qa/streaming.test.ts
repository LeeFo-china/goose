import { describe, expect, test } from "bun:test";

import {
  appendAnswerChunk,
  beginAnswerStream,
  buildAnswerChunks,
  finishAnswerStream,
} from "./streaming";
import type { DouyinQaAnswer } from "../../models";

const answer: DouyinQaAnswer = {
  answer_points: [
    "先确认面积、房屋现状和装修范围。",
    "旧房翻新建议重点看水电和防水。",
  ],
  suggested_questions: ["量房前要准备什么？", "局部装修怎么规划？"],
  disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
};

describe("Douyin Q&A simulated streaming state", () => {
  test("starts with a user bubble and an empty assistant typing bubble", () => {
    const state = beginAnswerStream("旧房翻新要注意什么？");

    expect(state).toEqual({
      messages: [
        {
          id: "user-current",
          role: "user",
          text: "旧房翻新要注意什么？",
        },
        {
          id: "assistant-current",
          role: "assistant",
          text: "",
          typing: true,
        },
      ],
      suggestedQuestions: [],
      disclaimer: "",
      isStreaming: true,
    });
  });

  test("builds bounded answer chunks without exposing suggestions before completion", () => {
    expect(buildAnswerChunks(answer)).toEqual([
      "先确认面积、房屋现状和装修范围。",
      "旧房翻新建议重点看水电和防水。",
    ]);

    const first = appendAnswerChunk(beginAnswerStream("旧房怎么装？"), "先确认面积。");

    expect(first.messages[first.messages.length - 1]).toEqual({
      id: "assistant-current",
      role: "assistant",
      text: "先确认面积。",
      typing: true,
    });
    expect(first.suggestedQuestions).toEqual([]);
    expect(first.disclaimer).toBe("");
  });

  test("finishes by stopping typing and then showing disclaimer and suggested questions", () => {
    const streaming = appendAnswerChunk(
      beginAnswerStream("旧房怎么装？"),
      "先确认面积。",
    );

    expect(finishAnswerStream(streaming, answer)).toEqual({
      messages: [
        {
          id: "user-current",
          role: "user",
          text: "旧房怎么装？",
        },
        {
          id: "assistant-current",
          role: "assistant",
          text: "先确认面积。",
          typing: false,
        },
      ],
      suggestedQuestions: ["量房前要准备什么？", "局部装修怎么规划？"],
      disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
      isStreaming: false,
    });
  });
});
