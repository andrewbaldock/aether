/**
 * Device-matrix screenshot capture — a DEV-ONLY contact sheet.
 *
 * Run directly by Bun (`bun run screenshots`), NOT as a Playwright test, so it
 * never gates a build. It drives the SAME viewport matrix as the E2E config
 * (e2e/devices.ts) and the SAME `/api` mock (e2e/fixtures/mockApi.ts), so every
 * shot shows real-looking, deterministic populated state — a chat exchange and a
 * rendered table — rather than an empty shell, and stays identical to what the
 * tests exercise.
 *
 * Output: PNGs + a manifest.json under frontend/public/screenshots-out/, which
 * Vite serves in dev. The whole directory is gitignored — a local dev artifact,
 * never committed, never deployed. The /screenshots admin tab (dev-only) reads
 * the manifest and renders the gallery.
 *
 * The app under test must already be running (the dev server on :5174, or a
 * preview build). We don't boot it here — that's the dev server's job.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, webkit } from "@playwright/test";
import { VIEWPORTS } from "./devices";
import { MockApi } from "./fixtures/mockApi";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "public", "screenshots-out");
const BASE_URL = process.env.SCREENSHOTS_BASE_URL ?? "http://localhost:5174";

// One scripted scenario per shot. Kept tiny + deterministic: open an existing
// conversation, send a prompt, let the mocked table turn render, surface the
// Table capability so the canvas isn't empty.
async function driveScenario(
  api: MockApi,
  page: import("@playwright/test").Page
) {
  api.scenario("table");
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  const composer = page.getByPlaceholder(/Type a message/i);
  await composer.waitFor({ state: "visible", timeout: 15_000 });
  await composer.fill("Show me the largest planets");
  await page.getByRole("button", { name: "Send message" }).click();
  // Wait for the streamed reply so the transcript is populated in the shot.
  await page
    .getByText(/rendered in the Table tab/i)
    .waitFor({ state: "visible", timeout: 10_000 })
    .catch(() => {});
  // Bring the Table capability forward (open the canvas overlay first on mobile).
  const openCanvas = page.getByRole("button", { name: "Open canvas" });
  if (await openCanvas.count()) await openCanvas.click().catch(() => {});
  await page
    .getByRole("button", { name: "Table" })
    .first()
    .click()
    .catch(() => {});
  // Let layout settle (drip-in row animation, fonts) before the shot.
  await page.waitForTimeout(600);
}

interface ManifestShot {
  name: string;
  engine: string;
  orientation: "portrait" | "landscape";
  width: number;
  height: number;
  scenario: string;
  file: string;
}

async function main() {
  // Fresh output dir each run so stale shots from a removed viewport don't linger.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  // One browser per engine, reused across its viewports.
  const browsers: Partial<Record<string, Browser>> = {};
  const getBrowser = async (engine: string): Promise<Browser> => {
    const existing = browsers[engine];
    if (existing) return existing;
    const launched = await (engine === "webkit" ? webkit : chromium).launch();
    browsers[engine] = launched;
    return launched;
  };

  const shots: ManifestShot[] = [];

  for (const vp of VIEWPORTS) {
    const browser = await getBrowser(vp.engine);
    const context = await browser.newContext({ ...vp.use });
    const page = await context.newPage();
    const api = new MockApi(page);
    await api.install();

    try {
      await driveScenario(api, page);
      const file = `${vp.name}.png`;
      await page.screenshot({ path: join(OUT_DIR, file), fullPage: true });
      const size = page.viewportSize() ?? { width: 0, height: 0 };
      shots.push({
        name: vp.name,
        engine: vp.engine,
        orientation: size.width > size.height ? "landscape" : "portrait",
        width: size.width,
        height: size.height,
        scenario: "table",
        file,
      });
      console.log(`✓ ${vp.name} (${vp.engine})`);
    } catch (err) {
      console.error(`✗ ${vp.name} (${vp.engine}):`, err);
    } finally {
      await context.close();
    }
  }

  await Promise.all(Object.values(browsers).map((b) => b?.close()));

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    shots,
  };
  await writeFile(
    join(OUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  console.log(
    `\nWrote ${shots.length} shots + manifest.json to public/screenshots-out/`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
