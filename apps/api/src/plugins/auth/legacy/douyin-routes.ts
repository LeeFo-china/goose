export function isDouyinMiniappRoute(url: string) {
  return url === "/douyin-mini" || url.startsWith("/douyin-mini/");
}

export function shouldBypassDouyinAuth(method: string, url: string) {
  if (method !== "POST") return false;

  return url === "/douyin-mini/auth/session"
    || url === "/douyin-thirdparty/events/authorization"
    || url === "/douyin-thirdparty/events/message"
    || /^\/douyin-thirdparty\/events\/message\/[^/]{1,128}\/callback$/.test(url);
}
