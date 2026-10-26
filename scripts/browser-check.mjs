import { chromium } from "@playwright/test";
const base = process.env.ASSAY_BROWSER_URL || "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(base + "/", {
  waitUntil: "networkidle",
  timeout: 90000,
});
await page.waitForTimeout(2000);
await page.screenshot({
  caret: "initial",
  path: ".local/assay-desktop.png",
  fullPage: true,
});
console.log("Home title:", await page.title());
console.log("Main heading:", await page.locator("h1").innerText());
console.log(
  "Desktop horizontal overflow:",
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
);
await page.getByRole("button", { name: "Toggle colour theme" }).click();
console.log(
  "Theme after toggle:",
  await page.locator("html").getAttribute("data-theme"),
);
await page.screenshot({
  caret: "initial",
  path: ".local/assay-dark.png",
  fullPage: true,
});
await page.getByRole("link", { name: "Benchmarks", exact: true }).click();
await page.waitForURL("**/benchmarks");
console.log("Benchmark route:", await page.locator("h1").innerText());
await page
  .getByRole("link", { name: "Publish a benchmark", exact: true })
  .click();
await page.waitForURL("**/benchmarks/publish");
console.log(
  "Publish form fields:",
  await page.locator("input,textarea,select").count(),
);
await page.getByRole("button", { name: "Toggle colour theme" }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + "/", {
  waitUntil: "networkidle",
  timeout: 90000,
});
console.log(
  "Mobile horizontal overflow:",
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
);
await page.screenshot({
  caret: "initial",
  path: ".local/assay-mobile.png",
  fullPage: true,
});
await page
  .getByRole("button", { name: "Sign in with email", exact: true })
  .click();
await page.waitForTimeout(2000);
console.log(
  "Email login dialog visible:",
  await page.getByRole("dialog").count(),
);
await page.screenshot({
  caret: "initial",
  path: ".local/assay-email.png",
  fullPage: true,
});
console.log("Browser runtime errors:", errors);
await browser.close();
