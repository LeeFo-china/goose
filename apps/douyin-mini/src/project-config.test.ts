import { expect, test } from "bun:test";

test("project config declares the Douyin template AppID", async () => {
  const config = await Bun.file(`${__dirname}/../project.config.json`).json();

  expect(config).toMatchObject({
    appid: "tt0d647bd99301341b01",
  });
});
