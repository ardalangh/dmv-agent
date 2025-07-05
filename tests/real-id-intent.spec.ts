import { test, expect } from "@playwright/test";

test("should send real ID intent and trigger tool call", async ({ page }) => {
  const logs: any = [];

  // Collect all console messages
  page.on("console", (msg) => {
    logs.push({ text: msg.text(), type: msg.type() });
  });

  await page.goto("http://localhost:3000/");
  await page.getByRole("textbox", { name: "Type your message..." }).click();
  await page
    .getByRole("textbox", { name: "Type your message..." })
    .fill("Hey I want to get my real Id in NC");
  await page.getByRole("button", { name: "Send" }).click();

  
  // Assert that the expected log is present
  const logFound = logs.some(
    (log) => log.type === "log" && log.text.includes("Calling tool: storeUserIntent")
  );
  expect(logFound).toBe(true);
});
