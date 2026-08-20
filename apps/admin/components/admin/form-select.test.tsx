import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FormSelect } from "./form-select";

test("FormSelect forwards accessible relationship props to its trigger", () => {
  const markup = renderToStaticMarkup(
    <FormSelect
      id="publication-status"
      value="draft"
      options={[{ value: "draft", label: "草稿" }]}
      aria-describedby="publication-status-help"
      aria-required="true"
      onChange={() => undefined}
    />,
  );

  expect(markup).toContain('id="publication-status"');
  expect(markup).toContain('aria-describedby="publication-status-help"');
  expect(markup).toContain('aria-required="true"');
});
