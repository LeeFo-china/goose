import type { DouyinQaAnswer } from "../../models";

export type QaMessage = {
  id: "user-current" | "assistant-current";
  role: "user" | "assistant";
  text: string;
  typing?: boolean;
};

export type QaStreamState = {
  messages: QaMessage[];
  suggestedQuestions: string[];
  disclaimer: string;
  isStreaming: boolean;
};

export function beginAnswerStream(question: string): QaStreamState {
  return {
    messages: [
      {
        id: "user-current",
        role: "user",
        text: question,
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
  };
}

export function buildAnswerChunks(answer: DouyinQaAnswer): string[] {
  return answer.answer_points.map((point) => point.trim()).filter(Boolean);
}

export function appendAnswerChunk(
  state: QaStreamState,
  chunk: string,
): QaStreamState {
  const messages = state.messages.map((message) => {
    if (message.id !== "assistant-current") return message;
    return {
      ...message,
      text: [message.text, chunk].filter(Boolean).join("\n"),
      typing: true,
    };
  });
  return {
    ...state,
    messages,
    suggestedQuestions: [],
    disclaimer: "",
    isStreaming: true,
  };
}

export function finishAnswerStream(
  state: QaStreamState,
  answer: DouyinQaAnswer,
): QaStreamState {
  const messages = state.messages.map((message) => {
    if (message.id !== "assistant-current") return message;
    return {
      ...message,
      typing: false,
    };
  });
  return {
    messages,
    suggestedQuestions: [...answer.suggested_questions],
    disclaimer: answer.disclaimer,
    isStreaming: false,
  };
}
