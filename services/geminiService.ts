
import { GoogleGenAI } from "@google/genai";
import { Language, Article, AISettings, AIModelConfig, AIProvider } from "../types";

// Default System Fallback (Legacy)
const systemApiKey = process.env.API_KEY || '';
const systemAi = new GoogleGenAI({ apiKey: systemApiKey });

// --- Helper: Get Config for Task ---
const getModelForTask = (settings: AISettings | null, task: 'translation' | 'summary' | 'analysis'): { provider: AIProvider, modelId: string } | null => {
  if (!settings) return null;

  // 1. Try Specific Task Config
  const taskConfig = settings.tasks[task];
  if (taskConfig && taskConfig.providerId) {
    const provider = settings.providers.find(p => p.id === taskConfig.providerId);
    if (provider) return { provider, modelId: taskConfig.modelId };
  }

  // 2. Fallback to General Config
  const generalConfig = settings.tasks.general;
  if (generalConfig && generalConfig.providerId) {
    const provider = settings.providers.find(p => p.id === generalConfig.providerId);
    if (provider) return { provider, modelId: generalConfig.modelId };
  }

  return null;
};

// --- Helper: Parse API Error to Chinese ---
const parseApiError = async (response: Response, providerName: string): Promise<string> => {
  let errorBody = "";
  try {
    errorBody = await response.text();
  } catch {
    errorBody = "(无法读取响应内容)";
  }

  let details = "";
  try {
    const json = JSON.parse(errorBody);
    if (json.error) {
       // Gemini often uses error.message, OpenAI uses error.message or just string
       const errObj = json.error;
       if (typeof errObj === 'string') details = errObj;
       else if (errObj.message) details = errObj.message;
       else details = JSON.stringify(errObj);
    } else {
       details = errorBody.substring(0, 300);
    }
  } catch {
    details = errorBody.substring(0, 300);
  }

  const status = response.status;
  let summary = `请求失败 (${status})`;
  
  if (status === 401) summary = "认证失败 (401)：API Key 无效或过期";
  else if (status === 403) summary = "拒绝访问 (403)：权限不足、余额不足或 WAF 拦截";
  else if (status === 404) summary = "未找到 (404)：模型 ID 不存在或接口地址错误";
  else if (status === 429) summary = "请求受限 (429)：触发速率限制或配额已用完";
  else if (status >= 500) summary = `服务器错误 (${status})：API 提供商服务异常`;

  return `${summary}。\n来自 ${providerName} 的反馈：${details}`;
};

// --- Helper: Fetch Models List ---
export const fetchProviderModels = async (provider: AIProvider): Promise<string[]> => {
  const isGemini = provider.type === 'gemini';
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');

  try {
    if (isGemini) {
      // Gemini: GET /v1beta/models
      const url = `${baseUrl}/v1beta/models?key=${provider.apiKey}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(await parseApiError(response, 'Gemini API'));
      }

      const data = await response.json();
      // Gemini returns names like "models/gemini-pro". We usually just want the ID part.
      if (data.models && Array.isArray(data.models)) {
        return data.models.map((m: any) => m.name.replace(/^models\//, ''));
      }
      return [];
    } else {
      // OpenAI: GET /models
      const url = `${baseUrl}/models`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, 'OpenAI API'));
      }

      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((m: any) => m.id);
      }
      return [];
    }
  } catch (error: any) {
    console.error("Fetch Models Error:", error);
    throw new Error(`获取模型列表失败: ${error.message}`);
  }
};

// --- Helper: Call LLM (Generic) ---
const callLLM = async (
  provider: AIProvider,
  modelId: string,
  prompt: string,
  jsonMode: boolean = false
): Promise<string> => {
  const isGemini = provider.type === 'gemini';
  
  // Clean URL: Remove trailing slash
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s Timeout

  try {
    if (isGemini) {
      // GEMINI REST API
      const url = `${baseUrl}/v1beta/models/${modelId}:generateContent?key=${provider.apiKey}`;
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: jsonMode ? { responseMimeType: "application/json" } : undefined
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, 'Gemini REST API'));
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else {
      // OPENAI COMPATIBLE API
      const url = `${baseUrl}/chat/completions`;
      const body = {
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        response_format: jsonMode ? { type: "json_object" } : undefined
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, 'OpenAI API'));
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error(`请求超时：连接 API 服务器超过 60 秒无响应。请检查您的网络连接或代理配置。`);
    }
    // Handle standard fetch network errors (DNS, Connection Refused, CORS)
    if (e instanceof TypeError && e.message === 'Failed to fetch') {
      throw new Error(`网络连接失败：无法连接到 ${baseUrl}。\n可能原因：\n1. 域名解析失败或地址错误\n2. 网络环境无法访问该地址 (需检查 VPN/代理)\n3. 浏览器跨域 (CORS) 限制`);
    }
    console.error("LLM Call Failed:", e);
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const translateContent = async (
  content: string,
  targetLang: Language,
  settings: AISettings | null = null
): Promise<string> => {
  
  const prompt = `
    You are a professional translator and content summarizer.
    Task: Translate the following HTML or text content into ${targetLang}.
    
    Guidelines:
    1. Maintain the original formatting (HTML tags) if present.
    2. Ensure the tone is natural and appropriate for a news article.
    3. If the content is extremely long, provide a detailed translated summary instead, but prioritize full translation if possible.
    4. Do not include any preamble or explanation. Just return the translated content.

    Content to translate:
    ${content}
  `;

  // 1. Try Custom Settings
  const config = getModelForTask(settings, 'translation');
  if (config) {
    // Directly return (or throw) so the UI receives the specific error from the custom provider
    return await callLLM(config.provider, config.modelId, prompt);
  }

  // 2. Fallback to System Default (Gemini SDK)
  if (!systemApiKey) {
    throw new Error("API Key 未配置。请在设置中添加 API 提供商，或配置系统环境变量。");
  }

  try {
    const response = await systemAi.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "翻译结果为空。";
  } catch (error: any) {
    console.error("System Gemini Error:", error);
    let msg = error.message || "未知错误";
    if (msg.includes('fetch failed')) msg = "网络连接失败 (System Gemini SDK)。请检查网络或代理。";
    else if (msg.includes('401') || msg.includes('API key not valid')) msg = "System API Key 无效。";
    throw new Error(`System Model Error: ${msg}`);
  }
};

interface AnalysisResult {
  summary: string;
  classifications: string[];
}

export const analyzeFeedContent = async (
  feedTitle: string,
  date: Date,
  articles: Article[],
  settings: AISettings | null = null
): Promise<AnalysisResult> => {
  if (articles.length === 0) {
    return { summary: "该日期无文章可总结。", classifications: [] };
  }

  const dateStr = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // Context preparation
  const context = articles.map((a, index) => `ID: ${index}\n标题: ${a.title}\n内容摘要: ${a.description?.replace(/<[^>]+>/g, '').substring(0, 300)}`).join('\n\n');

  const prompt = `
    你是一个智能新闻分析师。请仔细阅读以下文章列表，完成两个任务：
    1. 为每一篇文章进行分类。
    2. 为"${feedTitle}"在${dateStr}发布的内容生成一段总结。

    文章列表：
    ${context}

    **任务一：文章分类**
    请将每一篇文章归类为以下四个类别之一（必须严格匹配）：
    - "官方公告与新闻发布"
    - "内容更新与媒体宣发"
    - "线下活动与演出速报"
    - "社区互动与粉丝福利"

    **重要分类规则 (Priority Rule)**:
    - **如果文章标题以 "RT" 开头 (例如 "RT User:", "RT @User", "RT 梦限大..."), 请忽略 "RT" 前缀，根据引用内容的语义进行归类。**
    - 如果文章是转推，请根据其核心内容（被转发的原贴内容或评论内容）判断其所属类别。

    **任务二：每日总结**
    请根据分类结果，生成一份纯文本总结。
    
    **总结格式要求**：
    1. **格式必须为纯文本**：严禁使用任何Markdown格式（禁止使用加粗**，禁止使用列表-，禁止使用标题#）。
    2. **语言**：简体中文。
    3. **排版要求**：**每个分类的内容必须单独成段，段落之间必须使用两个换行符(\\n\\n)分隔**。
    4. **输出结构模版**：

    ${dateStr}，${feedTitle}发布的内容如下。

    官方公告与新闻发布方面，[内容...]。

    内容更新与媒体宣发方面，[内容...]。

    线下活动与演出速报方面，[内容...]。

    社区互动与粉丝福利方面，[内容...]。

    **输出格式**：
    请返回标准的 JSON 格式，不包含任何 Markdown 代码块标记（如 \`\`\`json）。
    JSON 结构如下：
    {
      "summary": "你的总结文本...",
      "classifications": ["分类1", "分类2", ...] // 数组顺序必须与输入的文章顺序一致
    }
  `;

  // 1. Try Custom Settings (Prefer Analysis config)
  const config = getModelForTask(settings, 'analysis');
  if (config) {
    try {
      const text = await callLLM(config.provider, config.modelId, prompt, true);
      const result = JSON.parse(text);
      return {
        summary: result.summary || "总结生成失败。",
        classifications: Array.isArray(result.classifications) ? result.classifications : []
      };
    } catch (e: any) {
      console.warn("Custom analysis provider failed:", e);
      // Return error in summary so user sees it in the dashboard widget
      return {
        summary: `分析失败：${e.message}`,
        classifications: []
      };
    }
  }

  // 2. Fallback to System Default
  if (!systemApiKey) {
    return { summary: "缺少系统 API Key，请在设置中配置。", classifications: [] };
  }

  try {
    const response = await systemAi.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    
    const text = response.text || "{}";
    const result = JSON.parse(text);
    
    return {
      summary: result.summary || "总结生成失败。",
      classifications: Array.isArray(result.classifications) ? result.classifications : []
    };
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    return {
      summary: `System Gemini Error: ${error.message}`,
      classifications: []
    };
  }
};