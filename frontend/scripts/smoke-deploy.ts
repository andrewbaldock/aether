// Post-deploy smoke test for the public site. Run: `bun run smoke` (or with a
// URL arg to point at a preview deploy).
//
// WHY THIS EXISTS: the SPA catch-all rewrite in vercel.json answers *every*
// unmatched path with index.html — at 200. So a status-code check proves nothing
// here: a totally broken URL and a working one both return 200. The bug this
// caught in the wild was bare `/storybook` (no trailing slash), where Storybook's
// relative asset refs (`./sb-manager/runtime.js`) resolved against `/` instead of
// `/storybook/`, and the catch-all served the app's HTML with a 200 in place of
// every script. Storybook rendered blank, and curl said everything was fine.
//
// So: assert CONTENT-TYPE, not status. A JS asset that comes back as text/html is
// the signature of the catch-all having swallowed it.

const BASE = (process.argv[2] ?? "https://aether.andrewbaldock.com").replace(
  /\/$/,
  ""
);

interface Check {
  path: string;
  type: RegExp;
  // Expect a 3xx to this location rather than a body.
  redirectsTo?: string;
  contains?: string;
}

const CHECKS: Check[] = [
  { path: "/", type: /text\/html/, contains: '<div id="root">' },
  // Bare path must REDIRECT, not rewrite — a rewrite keeps the URL at
  // /storybook and every relative asset ref then resolves one level too high.
  { path: "/storybook", type: /text\/html/, redirectsTo: "/storybook/" },
  { path: "/storybook/", type: /text\/html/, contains: "sb-manager" },
  // The canary: served as JS, not as the app shell.
  { path: "/storybook/sb-manager/runtime.js", type: /javascript/ },
  { path: "/storybook/iframe.html", type: /text\/html/ },
  { path: "/api/health", type: /json/ },
];

let failed = 0;

for (const check of CHECKS) {
  const url = `${BASE}${check.path}`;
  try {
    const res = await fetch(url, { redirect: "manual" });
    const type = res.headers.get("content-type") ?? "";
    const problems: string[] = [];

    if (check.redirectsTo) {
      const location = res.headers.get("location") ?? "";
      if (res.status < 300 || res.status >= 400) {
        problems.push(`expected a 3xx redirect, got ${res.status}`);
      } else if (!location.endsWith(check.redirectsTo)) {
        problems.push(
          `redirects to "${location}", want "${check.redirectsTo}"`
        );
      }
    } else {
      if (res.status !== 200) problems.push(`status ${res.status}`);
      if (!check.type.test(type)) {
        problems.push(`content-type "${type}" !~ ${check.type}`);
      }
      if (check.contains) {
        const body = await res.text();
        if (!body.includes(check.contains)) {
          problems.push(`body missing ${JSON.stringify(check.contains)}`);
        }
      }
    }

    if (problems.length) {
      failed++;
      console.error(`FAIL ${check.path}\n       ${problems.join("\n       ")}`);
    } else {
      console.log(`ok   ${check.path}`);
    }
  } catch (err) {
    failed++;
    console.error(`FAIL ${check.path}\n       ${(err as Error).message}`);
  }
}

console.log(
  failed
    ? `\n${failed}/${CHECKS.length} checks failed`
    : `\nall ${CHECKS.length} checks passed`
);
process.exit(failed ? 1 : 0);
