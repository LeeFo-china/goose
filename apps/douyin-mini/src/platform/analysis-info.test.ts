import { describe, expect, test } from "bun:test";

import type { LaunchContext } from "../models";
import { EntryAttribution, parseAnalysisInfo } from "./analysis-info";

const base: LaunchContext = {
  entry_path: "pages/lead/index", scene: "021001", source_type: "direct",
  campaign_code: "campaign-a", content_id: "tagged-video",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

describe("official entry attribution", () => {
  test("records an entry after official attribution and drops a superseded entry", async () => {
    const first = deferred<ReturnType<typeof parseAnalysisInfo>>();
    const second = deferred<ReturnType<typeof parseAnalysisInfo>>();
    const reads = [first.promise, second.promise];
    const capture = new EntryAttribution(() => reads.shift()!);
    const recorded: LaunchContext[] = [];
    const recordLaunch = (capture as EntryAttribution & {
      recordLaunch?: (version: number, record: (value: LaunchContext) => void)
        => Promise<void>;
    }).recordLaunch;
    capture.start(base);
    const old = recordLaunch?.call(capture, capture.version,
      (value) => recorded.push(value)) ?? Promise.resolve();
    capture.start({ ...base, campaign_code: undefined });
    const current = recordLaunch?.call(capture, capture.version,
      (value) => recorded.push(value)) ?? Promise.resolve();
    first.resolve({ type: 1, video_item_id: "old-video" });
    second.resolve({ type: 1, video_item_id: "current-video" });
    await Promise.all([old, current]);
    expect(recorded).toEqual([{ ...base, campaign_code: undefined,
      source_type: "short_video", analysis_info: {
        type: 1, video_item_id: "current-video",
      } }]);
  });
  test("keeps only bounded official video, live and profile identifiers", () => {
    expect(parseAnalysisInfo({ type: 1, uniqueId: "brand_01", postId: "author-1",
      itemId: "encrypted-video-1", token: "secret" })).toEqual({
      type: 1, unique_id: "brand_01", author_open_id: "author-1",
      video_item_id: "encrypted-video-1",
    });
    expect(parseAnalysisInfo({ type: 2, uniqueId: "anchor_01", roomId: "room-1",
      anchorId: "anchor-1" })).toEqual({ type: 2, unique_id: "anchor_01",
      live_room_id: "room-1", anchor_open_id: "anchor-1" });
    expect(parseAnalysisInfo({ type: 4, uniqueId: "profile_01" })).toEqual({
      type: 4, unique_id: "profile_01",
    });
    expect(parseAnalysisInfo({ type: 99, uniqueId: "bad" })).toBeNull();
    expect(parseAnalysisInfo({ type: 1, uniqueId: "brand", itemId: " " })).toBeNull();
  });

  test("a second external entry clears an earlier video and ignores late callbacks", async () => {
    const first = deferred<ReturnType<typeof parseAnalysisInfo>>();
    const second = deferred<ReturnType<typeof parseAnalysisInfo>>();
    const queue = [first.promise, second.promise];
    const capture = new EntryAttribution(() => queue.shift()!);
    capture.start(base);
    capture.start({ ...base, campaign_code: undefined, content_id: undefined });
    expect(capture.current.analysis_info).toBeUndefined();
    first.resolve({ type: 1, unique_id: "old", video_item_id: "old-video" });
    await first.promise;
    expect(capture.current.analysis_info).toBeUndefined();
    second.resolve(null);
    expect(await capture.ready()).toEqual({ entry_path: "pages/lead/index",
      scene: "021001", source_type: "direct", campaign_code: undefined,
      content_id: undefined });
  });

  test("an early SMS timeout does not discard official attribution for later submission", async () => {
    const late = deferred<ReturnType<typeof parseAnalysisInfo>>();
    const capture = new EntryAttribution(() => late.promise);
    capture.start(base);
    expect(await capture.ready(1)).toEqual(base);
    late.resolve({ type: 1, unique_id: "late", video_item_id: "late-video" });
    await late.promise;
    await Promise.resolve();
    expect(await capture.ready()).toEqual({ ...base, source_type: "short_video",
      analysis_info: { type: 1, unique_id: "late", video_item_id: "late-video" } });
  });
});
