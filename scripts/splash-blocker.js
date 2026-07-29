/**
 * Shadowrocket iOS Splash Ad Blocker
 * Version: 1.0.0
 *
 * Supported apps/endpoints:
 * - AMap: splash_screen, splash_screen_rt, startup/init
 * - Umetrip: native ad placements identified by Rpid, polite ad resource
 * - Air China: queryOpenScreenAd
 * - JD: functionId=start
 * - Taobao: cloudvideo.video.query, wireless.home.splash.awesome.get
 * - DiDi: hd.xiaojukeji.com/d, resapi/activity/(m|xp)get
 *
 * The script deliberately fails open. Unknown URLs, response shapes and invalid
 * JSON are returned unchanged.
 */

const SPLASH_BLOCKER_VERSION = "1.0.0";

(function main() {
  const request = typeof $request === "undefined" ? {} : $request;
  const response = typeof $response === "undefined" ? {} : $response;
  const url = typeof request.url === "string" ? request.url : "";

  try {
    if (isAmapSplash(url)) {
      return finish(replaceJsonWithEmptyObject(response.body, "AMap", url));
    }

    if (isUmetripNative(url)) {
      return finish(handleUmetripNative(request.headers));
    }

    if (isUmetripPoliteAd(url)) {
      return finish(notFoundResponse());
    }

    if (isAirChinaGateway(url)) {
      return finish(handleAirChina(request.headers));
    }

    if (isJdSplash(url)) {
      return finish(handleJd(response.body, url));
    }

    if (isTaobaoVideoSplash(url)) {
      return finish(handleTaobaoVideo(response.body, url));
    }

    if (isTaobaoImageSplash(url)) {
      return finish(handleTaobaoImage(response.body, url));
    }

    if (isDidiSplash(url)) {
      return finish(replaceJsonWithEmptyObject(response.body, "DiDi", url));
    }

    return finish({});
  } catch (error) {
    logPassThrough("unexpected error", url, error);
    return finish({});
  }
})();

function isAmapSplash(url) {
  return /^https?:\/\/(?:amap-aos-info-nogw|m\d+)\.amap\.com\/ws\/(?:aos\/alimama\/splash_screen(?:_rt)?|shield\/dsp\/app\/startup\/init|valueadded\/alimama\/splash_screen)(?:[/?]|$)/i.test(url);
}

function isUmetripNative(url) {
  return /^https?:\/\/(?:umerp\.umetrip\.com(?:\.cn)?|home\.umetrip\.com|bkclient\.umetrip\.com\.cn)\/gateway\/api\/umetrip\/native(?:[/?]|$)/i.test(url);
}

function isUmetripPoliteAd(url) {
  return /^https?:\/\/oss\.umetrip\.com\/fs\/advert\/polite(?:[/?]|$)/i.test(url);
}

function isAirChinaGateway(url) {
  return /^https?:\/\/m\.airchina\.com\.cn\/airchina\/gateway\/v\d+(?:\.\d+)*\/api\/services(?:[/?]|$)/i.test(url);
}

function isJdSplash(url) {
  if (!/^https?:\/\/api\.m\.jd\.com\/client\.action(?:[?#]|$)/i.test(url)) {
    return false;
  }
  return /(?:[?&])functionId=start(?:&|$)/i.test(url);
}

function isTaobaoVideoSplash(url) {
  return /^https?:\/\/guide-acs\.m\.taobao\.com\/gw\/mtop\.taobao\.cloudvideo\.video\.query(?:[/?]|$)/i.test(url);
}

function isTaobaoImageSplash(url) {
  return /^https?:\/\/guide-acs\.m\.taobao\.com\/gw\/mtop\.taobao\.wireless\.home\.splash\.awesome\.get(?:[/?]|$)/i.test(url);
}

function isDidiSplash(url) {
  return /^https?:\/\/hd\.xiaojukeji\.com\/d(?:[/?]|$)/i.test(url) ||
    /^https?:\/\/res\.xiaojukeji\.com\/resapi\/activity\/(?:m|xp)get(?:[/?]|$)/i.test(url);
}

function handleUmetripNative(headers) {
  const blockedRpidValues = ["1000002", "1000019", "1430064", "1120002", "1130016"];
  const rpid = getHeader(headers, "rpid");
  return blockedRpidValues.indexOf(String(rpid || "")) !== -1 ? notFoundResponse() : {};
}

function handleAirChina(headers) {
  const procedure = getHeader(headers, "procedure");
  if (procedure !== "queryOpenScreenAd") {
    return {};
  }
  return jsonBodyResponse({});
}

function handleJd(body, url) {
  const parsed = parseJsonObject(body, "JD", url);
  if (!parsed) {
    return {};
  }

  let recognized = false;
  if (Array.isArray(parsed.images)) {
    parsed.images = [];
    recognized = true;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "countdown")) {
    parsed.countdown = zeroLike(parsed.countdown);
    recognized = true;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "showTimesDaily")) {
    parsed.showTimesDaily = zeroLike(parsed.showTimesDaily);
    recognized = true;
  }

  return recognized ? jsonBodyResponse(parsed) : {};
}

function handleTaobaoVideo(body, url) {
  const parsed = parseJsonObject(body, "Taobao video", url);
  if (!parsed || !isObject(parsed.data)) {
    return {};
  }

  let recognized = false;
  if (Object.prototype.hasOwnProperty.call(parsed.data, "duration")) {
    parsed.data.duration = zeroLike(parsed.data.duration);
    recognized = true;
  }
  if (Array.isArray(parsed.data.resources)) {
    parsed.data.resources = [];
    recognized = true;
  }
  if (Array.isArray(parsed.data.caches)) {
    parsed.data.caches = [];
    recognized = true;
  }

  return recognized ? jsonBodyResponse(parsed) : {};
}

function handleTaobaoImage(body, url) {
  const parsed = parseJsonObject(body, "Taobao image", url);
  const sections = parsed &&
    parsed.data &&
    parsed.data.containers &&
    parsed.data.containers.splash_home_base &&
    parsed.data.containers.splash_home_base.base &&
    parsed.data.containers.splash_home_base.base.sections;

  if (!Array.isArray(sections)) {
    return {};
  }

  let recognized = false;
  sections.forEach(function updateSection(section) {
    const splashData = section &&
      section.bizData &&
      section.bizData["taobao-splash"] &&
      section.bizData["taobao-splash"].data;

    if (!Array.isArray(splashData)) {
      return;
    }

    splashData.forEach(function disableSplashItem(item) {
      if (!isObject(item)) {
        return;
      }
      recognized = true;
      item.waitTime = zeroLike(item.waitTime);
      item.times = zeroLike(item.times);
      item.hotStart = falseLike(item.hotStart);
      item.coldStart = falseLike(item.coldStart);
      item.haveVoice = falseLike(item.haveVoice);
      item.enable4G = falseLike(item.enable4G);
      item.startTime = "3818332800000";
      item.endTime = "3818419199000";
      item.gmtStart = "2090-12-31 00:00:00";
      item.gmtEnd = "2090-12-31 23:59:59";
      item.gmtStartMs = "3818332800000";
      item.gmtEndMs = "3818419199000";
      if (Object.prototype.hasOwnProperty.call(item, "imgUrl")) {
        item.imgUrl = "";
      }
      if (Object.prototype.hasOwnProperty.call(item, "videoUrl")) {
        item.videoUrl = "";
      }
    });
  });

  return recognized ? jsonBodyResponse(parsed) : {};
}

function replaceJsonWithEmptyObject(body, appName, url) {
  return parseJsonObject(body, appName, url) ? jsonBodyResponse({}) : {};
}

function parseJsonObject(body, appName, url) {
  if (typeof body !== "string" || body.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(body);
    if (!isObject(parsed)) {
      return null;
    }
    return parsed;
  } catch (error) {
    logPassThrough(appName + " invalid JSON", url, error);
    return null;
  }
}

function getHeader(headers, targetName) {
  if (!isObject(headers)) {
    return undefined;
  }
  const target = String(targetName).toLowerCase();
  const names = Object.keys(headers);
  for (let index = 0; index < names.length; index += 1) {
    if (names[index].toLowerCase() === target) {
      return headers[names[index]];
    }
  }
  return undefined;
}

function zeroLike(value) {
  return typeof value === "string" ? "0" : 0;
}

function falseLike(value) {
  return typeof value === "string" ? "false" : false;
}

function jsonBodyResponse(value) {
  return { body: JSON.stringify(value) };
}

function notFoundResponse() {
  return {
    status: "HTTP/1.1 404 Not Found",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: ""
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeEndpoint(url) {
  if (typeof url !== "string") {
    return "unknown";
  }
  return url.split("#")[0].split("?")[0];
}

function logPassThrough(reason, url, error) {
  if (typeof console === "undefined" || typeof console.log !== "function") {
    return;
  }
  const errorName = error && error.name ? " (" + error.name + ")" : "";
  console.log("[SplashBlocker " + SPLASH_BLOCKER_VERSION + "] pass-through: " + reason + errorName + " @ " + safeEndpoint(url));
}

function finish(result) {
  if (typeof $done === "function") {
    $done(result || {});
  }
}
