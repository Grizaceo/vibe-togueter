import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applySecurityHeaders,
  frameSrc,
} from "../src/server/security-headers.js";
const root = path.resolve(new URL("..", import.meta.url).pathname);
const catalog = (games) => ({ catalog: () => ({ games }) });
const res = () => {
  const headers = {};
  return {
    headers,
    setHeader: (k, v) => (headers[k.toLowerCase()] = v),
  };
};
test("every response gets CSP, nosniff and no-referrer headers", () => {
  const r = res();
  applySecurityHeaders(r, catalog([]));
  const csp = r.headers["content-security-policy"];
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ])
    assert.ok(csp.includes(directive), directive);
  assert.ok(!csp.includes("unsafe-inline"), "no unsafe-inline");
  assert.ok(!csp.includes("wss:"), "connect-src stays self only");
  assert.equal(r.headers["x-content-type-options"], "nosniff");
  assert.equal(r.headers["referrer-policy"], "no-referrer");
});
test("frame-src is 'none' with no tee games and follows configured tee origins", () => {
  assert.equal(frameSrc(catalog([])), "'none'");
  assert.equal(
    frameSrc(
      catalog([
        { adapter: "tee", baseURL: "https://tee.example.com" },
        { adapter: "t99", baseURL: "https://blocks.example.com" },
      ]),
    ),
    "https://tee.example.com",
  );
});
test("frame-src skips invalid URLs and duplicate origins", () => {
  assert.equal(
    frameSrc(
      catalog([
        { adapter: "tee", baseURL: "not a url" },
        { adapter: "tee", baseURL: "https://a.example.com" },
        { adapter: "tee", baseURL: "https://a.example.com/play" },
      ]),
    ),
    "https://a.example.com",
  );
});
test("public pages contain no inline scripts, styles or style attributes", () => {
  const html = fs
    .readdirSync(path.join(root, "public"), { recursive: true })
    .filter((f) => String(f).endsWith(".html"));
  for (const file of html) {
    const text = fs.readFileSync(
      path.join(root, "public", String(file)),
      "utf8",
    );
    assert.ok(!/<style[\s>]/i.test(text), file + " has a <style> block");
    assert.ok(
      !/<script(?![^>]*\bsrc=)[^>]*>[^<]*\S/i.test(text),
      file + " has an inline <script> body",
    );
    assert.ok(!/\sstyle\s*=/i.test(text), file + " has a style= attribute");
  }
});
