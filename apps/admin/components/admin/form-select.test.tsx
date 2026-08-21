import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FormSelect } from "./form-select";

test("FormSelect forwards accessible relationship props to its trigger", () => {
  const markup = renderToStaticMarkup(
    <FormSelect
      id="publication-status"
      value="draft"
      options={[{ value: "draft", label: "草稿" }]}
      disabled
      aria-describedby="publication-status-help"
      aria-required="true"
      onChange={() => undefined}
    />,
  );

  expect(markup).toContain('id="publication-status"');
  expect(markup).toContain('aria-describedby="publication-status-help"');
  expect(markup).toContain('aria-required="true"');
  expect(markup).toContain("disabled");
});

test("FormSelect renders the matching controlled option on the server", () => {
  const markup = renderToStaticMarkup(
    <FormSelect
      id="publication-status"
      value="draft"
      options={[{ value: "draft", label: "草稿" }]}
      placeholder="请选择状态"
      onChange={() => undefined}
    />,
  );

  expect(markup).toContain("草稿");
  expect(markup).not.toContain("请选择状态");
});

test("FormSelect falls back to its placeholder for empty or unknown values", () => {
  const render = (value: string) => renderToStaticMarkup(
    <FormSelect
      id="publication-status"
      value={value}
      options={[{ value: "draft", label: "草稿" }]}
      placeholder="请选择状态"
      onChange={() => undefined}
    />,
  );

  expect(render("")).toContain("请选择状态");
  expect(render("archived")).toContain("请选择状态");
});
