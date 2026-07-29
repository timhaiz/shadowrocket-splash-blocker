"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(projectRoot, "scripts", "splash-blocker.js");
const source = fs.readFileSync(scriptPath, "utf8");

function runScript({ url, body, headers = {} }) {
  let doneValue;
  const logs = [];
  const context = {
    $request: { url, headers },
    $response: body === undefined ? {} : { body },
    $done(value) {
      assert.equal(doneValue, undefined, "$done must only be called once");
      doneValue = value;
    },
    console: {
      log(message) {
        logs.push(String(message));
      }
    }
  };

  vm.runInNewContext(source, context, { filename: scriptPath, timeout: 1000 });
  return { result: plain(doneValue), logs };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function parsedBody(result) {
  assert.equal(typeof result.body, "string");
  return JSON.parse(result.body);
}

test("AMap replaces a recognized JSON splash response", () => {
  const execution = runScript({
    url: "https://m5.amap.com/ws/shield/dsp/app/startup/init?channel=ios",
    body: JSON.stringify({ data: { ads: [{ id: 1 }] } })
  });
  assert.deepEqual(parsedBody(execution.result), {});
});

test("AMap passes invalid JSON through and sanitizes the log URL", () => {
  const execution = runScript({
    url: "https://m5.amap.com/ws/shield/dsp/app/startup/init?token=secret-value",
    body: "not-json"
  });
  assert.deepEqual(execution.result, {});
  assert.equal(execution.logs.length, 1);
  assert.match(execution.logs[0], /startup\/init/);
  assert.doesNotMatch(execution.logs[0], /secret-value|token=/);
});

test("Umetrip blocks only known native ad Rpid values", () => {
  const blocked = runScript({
    url: "https://home.umetrip.com/gateway/api/umetrip/native",
    headers: { Rpid: "1430064" }
  });
  assert.equal(blocked.result.status, "HTTP/1.1 404 Not Found");

  const allowed = runScript({
    url: "https://home.umetrip.com/gateway/api/umetrip/native",
    headers: { rpid: "business-feature" }
  });
  assert.deepEqual(allowed.result, {});
});

test("Umetrip blocks the exact polite ad resource", () => {
  const execution = runScript({
    url: "https://oss.umetrip.com/fs/advert/polite?id=1"
  });
  assert.equal(execution.result.status, "HTTP/1.1 404 Not Found");
});

test("Air China changes only queryOpenScreenAd", () => {
  const blocked = runScript({
    url: "https://m.airchina.com.cn/airchina/gateway/v2.1/api/services",
    headers: { Procedure: "queryOpenScreenAd" }
  });
  assert.deepEqual(parsedBody(blocked.result), {});

  const allowed = runScript({
    url: "https://m.airchina.com.cn/airchina/gateway/v2.1/api/services",
    headers: { procedure: "queryFlightStatus" }
  });
  assert.deepEqual(allowed.result, {});
});

test("JD clears recognized splash fields and preserves unrelated data", () => {
  const execution = runScript({
    url: "https://api.m.jd.com/client.action?client=apple&functionId=start&clientVersion=1",
    body: JSON.stringify({
      images: [[{ showTimes: 2, imageUrl: "https://example.invalid/ad.jpg" }]],
      countdown: "5",
      showTimesDaily: 3,
      requestId: "keep-me"
    })
  });
  const body = parsedBody(execution.result);
  assert.deepEqual(body.images, []);
  assert.equal(body.countdown, "0");
  assert.equal(body.showTimesDaily, 0);
  assert.equal(body.requestId, "keep-me");
});

test("JD passes an unknown response shape through", () => {
  const execution = runScript({
    url: "https://api.m.jd.com/client.action?functionId=start",
    body: JSON.stringify({ requestId: "only" })
  });
  assert.deepEqual(execution.result, {});
});

test("Taobao video splash clears only recognized media fields", () => {
  const execution = runScript({
    url: "https://guide-acs.m.taobao.com/gw/mtop.taobao.cloudvideo.video.query/1.0/",
    body: JSON.stringify({
      data: {
        duration: "5",
        resources: [{ url: "video" }],
        caches: [{ key: "cache" }],
        traceId: "keep-me"
      }
    })
  });
  const body = parsedBody(execution.result);
  assert.equal(body.data.duration, "0");
  assert.deepEqual(body.data.resources, []);
  assert.deepEqual(body.data.caches, []);
  assert.equal(body.data.traceId, "keep-me");
});

test("Taobao image splash disables recognized splash items", () => {
  const execution = runScript({
    url: "https://guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.splash.awesome.get/1.0/",
    body: JSON.stringify({
      data: {
        containers: {
          splash_home_base: {
            base: {
              sections: [{
                bizData: {
                  "taobao-splash": {
                    data: [{
                      waitTime: "5",
                      times: 1,
                      hotStart: "true",
                      coldStart: true,
                      imgUrl: "https://example.invalid/ad.jpg",
                      videoUrl: "https://example.invalid/ad.mp4"
                    }]
                  }
                }
              }]
            }
          }
        }
      }
    })
  });
  const item = parsedBody(execution.result).data.containers.splash_home_base.base.sections[0]
    .bizData["taobao-splash"].data[0];
  assert.equal(item.waitTime, "0");
  assert.equal(item.times, 0);
  assert.equal(item.hotStart, "false");
  assert.equal(item.coldStart, false);
  assert.equal(item.imgUrl, "");
  assert.equal(item.videoUrl, "");
  assert.equal(item.gmtStart, "2090-12-31 00:00:00");
});

test("Taobao passes an unknown response shape through", () => {
  const execution = runScript({
    url: "https://guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.splash.awesome.get/1.0/",
    body: JSON.stringify({ data: { unrelated: true } })
  });
  assert.deepEqual(execution.result, {});
});

test("DiDi clears only recognized JSON startup or activity responses", () => {
  const startup = runScript({
    url: "https://hd.xiaojukeji.com/d?app=didi",
    body: JSON.stringify({ ad: { id: 1 } })
  });
  assert.deepEqual(parsedBody(startup.result), {});

  const activity = runScript({
    url: "https://res.xiaojukeji.com/resapi/activity/xpget",
    body: JSON.stringify({ data: [{ type: "ad" }] })
  });
  assert.deepEqual(parsedBody(activity.result), {});
});

test("unknown URLs and empty responses pass through", () => {
  const unknown = runScript({
    url: "https://api.example.com/business/order",
    body: JSON.stringify({ ad: "must-not-be-recursively-deleted" })
  });
  assert.deepEqual(unknown.result, {});

  const empty = runScript({
    url: "https://api.m.jd.com/client.action?functionId=start"
  });
  assert.deepEqual(empty.result, {});
});

test("modules are independent, use the configured Raw URL and have minimal MITM hosts", () => {
  const expectedHosts = {
    "all-in-one.sgmodule": [
      "amap-aos-info-nogw.amap.com",
      "api.m.jd.com",
      "bkclient.umetrip.com.cn",
      "guide-acs.m.taobao.com",
      "hd.xiaojukeji.com",
      "home.umetrip.com",
      "m*.amap.com",
      "m.airchina.com.cn",
      "oss.umetrip.com",
      "res.xiaojukeji.com",
      "umerp.umetrip.com",
      "umerp.umetrip.com.cn"
    ],
    "airchina.sgmodule": ["m.airchina.com.cn"],
    "amap.sgmodule": ["amap-aos-info-nogw.amap.com", "m*.amap.com"],
    "didi.sgmodule": ["hd.xiaojukeji.com", "res.xiaojukeji.com"],
    "jd.sgmodule": ["api.m.jd.com"],
    "taobao.sgmodule": ["guide-acs.m.taobao.com"],
    "umetrip.sgmodule": [
      "bkclient.umetrip.com.cn",
      "home.umetrip.com",
      "oss.umetrip.com",
      "umerp.umetrip.com",
      "umerp.umetrip.com.cn"
    ]
  };
  const modulesDir = path.join(projectRoot, "modules");
  const moduleNames = fs.readdirSync(modulesDir).filter((name) => name.endsWith(".sgmodule")).sort();
  assert.deepEqual(moduleNames, Object.keys(expectedHosts).sort());

  moduleNames.forEach((moduleName) => {
    const contents = fs.readFileSync(path.join(modulesDir, moduleName), "utf8");
    assert.match(contents, /script-path=https:\/\/raw\.githubusercontent\.com\/timhaiz\/shadowrocket-splash-blocker\/main\/scripts\/splash-blocker\.js/);
    assert.doesNotMatch(contents, /__RAW_BASE_URL__/);
    assert.doesNotMatch(contents, /raw\.githubusercontent\.com\/(?:blackmatrix7|fmz200|zirawell|ddgksf2013)\//);

    const hostnameLine = contents.split("\n").find((line) => line.startsWith("hostname = %APPEND% "));
    assert.ok(hostnameLine, moduleName + " must declare MITM hosts");
    const hosts = hostnameLine
      .slice("hostname = %APPEND% ".length)
      .split(",")
      .map((host) => host.trim())
      .sort();
    assert.deepEqual(hosts, expectedHosts[moduleName].slice().sort(), moduleName + " MITM hosts");
  });
});

test("module URL patterns compile and stay inside the intended endpoint scope", () => {
  const samples = {
    "all-in-one.sgmodule": {
      matches: [
        "https://m5.amap.com/ws/shield/dsp/app/startup/init?channel=ios",
        "https://home.umetrip.com/gateway/api/umetrip/native",
        "https://m.airchina.com.cn/airchina/gateway/v2.1/api/services",
        "https://api.m.jd.com/client.action?functionId=start",
        "https://guide-acs.m.taobao.com/gw/mtop.taobao.cloudvideo.video.query/1.0/",
        "https://res.xiaojukeji.com/resapi/activity/xpget"
      ],
      rejects: [
        "https://m5.amap.com/ws/bus/plan/integrate",
        "https://conf.diditaxi.com.cn/homepage/v1/core"
      ]
    },
    "airchina.sgmodule": {
      matches: ["https://m.airchina.com.cn/airchina/gateway/v2.1/api/services"],
      rejects: ["https://m.airchina.com.cn/ac/rn/product/version"]
    },
    "amap.sgmodule": {
      matches: [
        "https://m5.amap.com/ws/shield/dsp/app/startup/init?channel=ios",
        "https://amap-aos-info-nogw.amap.com/ws/aos/alimama/splash_screen_rt"
      ],
      rejects: ["https://m5.amap.com/ws/bus/plan/integrate"]
    },
    "didi.sgmodule": {
      matches: [
        "https://hd.xiaojukeji.com/d?app=didi",
        "https://res.xiaojukeji.com/resapi/activity/mget"
      ],
      rejects: ["https://conf.diditaxi.com.cn/homepage/v1/core"]
    },
    "jd.sgmodule": {
      matches: ["https://api.m.jd.com/client.action?client=apple&functionId=start&version=1"],
      rejects: ["https://api.m.jd.com/client.action?functionId=myOrderInfo"]
    },
    "taobao.sgmodule": {
      matches: ["https://guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.splash.awesome.get/1.0/"],
      rejects: ["https://guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.feed.get/1.0/"]
    },
    "umetrip.sgmodule": {
      matches: [
        "https://home.umetrip.com/gateway/api/umetrip/native",
        "https://oss.umetrip.com/fs/advert/polite?id=1"
      ],
      rejects: ["https://home.umetrip.com/gateway/api/umetrip/order"]
    }
  };

  Object.entries(samples).forEach(([moduleName, urls]) => {
    const contents = fs.readFileSync(path.join(projectRoot, "modules", moduleName), "utf8");
    const patterns = contents
      .split("\n")
      .filter((line) => line.includes("pattern="))
      .map((line) => {
        const match = line.match(/pattern=(.*?), script-path=/);
        assert.ok(match, moduleName + " pattern must be extractable");
        return new RegExp(match[1]);
      });

    urls.matches.forEach((url) => {
      assert.ok(patterns.some((pattern) => pattern.test(url)), moduleName + " should match " + url);
    });
    urls.rejects.forEach((url) => {
      assert.ok(patterns.every((pattern) => !pattern.test(url)), moduleName + " should reject " + url);
    });
  });
});
