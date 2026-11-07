import fs from "node:fs";
import path from "node:path";

export async function createCDP(
  cdp,
  { base, wait, sleep, evidence, runId, errors, requests, violations = [] },
) {
  let id = 0;
  const pending = new Map();
  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const request = ++id;
      pending.set(request, { resolve, reject });
      cdp.send(JSON.stringify({ id: request, method, params }));
    });
  cdp.on("message", (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id) {
      const call = pending.get(msg.id);
      if (call) {
        pending.delete(msg.id);
        msg.error
          ? call.reject(Error(msg.error.message))
          : call.resolve(msg.result);
      }
    } else if (msg.method === "Runtime.exceptionThrown")
      errors.push(msg.params.exceptionDetails.text);
    else if (msg.method === "Network.requestWillBeSent")
      requests.push(msg.params.request.url);
    else if (msg.method === "Log.entryAdded") {
      const entry = msg.params.entry;
      if (/Refused|Content Security Policy|securitypolicyviolation/i.test(entry.text || ""))
        violations.push(entry.text);
    }
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Log.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const evaluate = async (expression) =>
    (
      await command("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result.value;
  const click = async (selector) => {
    const point = await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
    );
    if (!point) throw Error("Missing enabled control: " + selector);
    await command("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await command("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point,
      button: "left",
      clickCount: 1,
    });
  };
  const navigate = async (route) => {
    await command("Page.navigate", { url: base + route });
    await wait(() => evaluate("document.readyState==='complete'"));
    await sleep(500);
  };
  const capture = async (name) => {
    const shot = await command("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(evidence, name.replace("local-ui", runId) + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  };
  return { command, evaluate, click, navigate, capture };
}
