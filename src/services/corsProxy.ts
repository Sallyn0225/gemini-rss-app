/**
 * 公共 CORS 代理列表 — 用于客户端直接获取跨域资源
 * 按稳定性和速度排序，逐一尝试直到成功
 */
export const CORS_PROXIES = [
  { name: 'AllOriginsRaw', buildUrl: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
  { name: 'CodeTabs', buildUrl: (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` },
  { name: 'CORSProxy', buildUrl: (url: string) => `https://corsproxy.io/?${url}` },
  { name: 'ThingProxy', buildUrl: (url: string) => `https://thingproxy.freeboard.io/fetch/${url}` },
];

interface FetchViaCorsProxyOptions {
  /** 校验函数，如果返回 false 则视为失败继续下一个代理 */
  validate?: (text: string) => boolean;
  /** 请求超时（毫秒），默认 10000 */
  timeout?: number;
}

/**
 * 通过公共 CORS 代理获取目标 URL 的文本内容
 * 逐一尝试代理列表，返回第一个成功的结果
 */
export async function fetchViaCorsProxy(
  targetUrl: string,
  options?: FetchViaCorsProxyOptions
): Promise<string | null> {
  const timeout = options?.timeout ?? 10000;

  for (const proxy of CORS_PROXIES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(proxy.buildUrl(targetUrl), {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) continue;

      const text = await response.text();

      // 验证响应内容
      if (options?.validate && !options.validate(text)) {
        console.warn(`[CORSProxy] ${proxy.name} response failed validation for ${targetUrl}`);
        continue;
      }

      console.log(`[CORSProxy] ${proxy.name} succeeded for ${targetUrl}`);
      return text;
    } catch {
      console.warn(`[CORSProxy] ${proxy.name} failed for ${targetUrl}`);
    }
  }

  return null;
}
