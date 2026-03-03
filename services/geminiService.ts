import { Language, Article, AISettings, AIProvider } from "../types";

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
       else if (errObj.message) details = errObj.type ? `[${errObj.type}] ${errObj.message}` : errObj.message;
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
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');

  try {
    switch (provider.type) {
      case 'gemini': {
        const url = `${baseUrl}/v1beta/models?key=${provider.apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(await parseApiError(response, 'Gemini API'));
        }
        const data = await response.json() as { models?: { name: string }[] };
        if (data.models && Array.isArray(data.models)) {
          return data.models.map((m) => m.name.replace(/^models\//, ''));
        }
        return [];
      }
      case 'anthropic': {
        const url = `${baseUrl}/v1/models`;
        const response = await fetch(url, {
          headers: {
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01'
          }
        });
        if (!response.ok) {
          throw new Error(await parseApiError(response, 'Anthropic API'));
        }
        const data = await response.json() as { data?: { id: string }[] };
        if (data.data && Array.isArray(data.data)) {
          return data.data.map((m) => m.id);
        }
        return [];
      }
      case 'openai':
      case 'openai-responses': {
        const url = `${baseUrl}/models`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`
          }
        });
        if (!response.ok) {
          throw new Error(await parseApiError(response, 'OpenAI API'));
        }
        const data = await response.json() as { data?: { id: string }[] };
        if (data.data && Array.isArray(data.data)) {
          return data.data.map((m) => m.id);
        }
        return [];
      }
      default:
        throw new Error(`不支持的 API 格式: ${provider.type}`);
    }
  } catch (error: unknown) {
    console.error("Fetch Models Error:", error);
    throw new Error(`获取模型列表失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// --- Helper: Call LLM (Generic) ---
const callLLM = async (
  provider: AIProvider,
  modelId: string,
  prompt: string,
  jsonMode: boolean = false
): Promise<string> => {
  // Clean URL: Remove trailing slash
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s Timeout

  try {
    let response: Response;
    let providerLabel: string;

    switch (provider.type) {
      case 'gemini': {
        providerLabel = 'Gemini REST API';
        const url = `${baseUrl}/v1beta/models/${modelId}:generateContent?key=${provider.apiKey}`;
        const body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: jsonMode ? { responseMimeType: "application/json" } : undefined
        };
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(await parseApiError(response, providerLabel));
        }
        const geminiData = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        return geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }

      case 'openai': {
        providerLabel = 'OpenAI API';
        const url = `${baseUrl}/chat/completions`;
        const body = {
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          response_format: jsonMode ? { type: "json_object" } : undefined
        };
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(await parseApiError(response, providerLabel));
        }
        const openaiData = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        return openaiData.choices?.[0]?.message?.content || '';
      }

      case 'openai-responses': {
        providerLabel = 'OpenAI Responses API';
        const url = `${baseUrl}/responses`;
        const body: Record<string, unknown> = {
          model: modelId,
          input: prompt,
        };
        if (jsonMode) {
          body.text = { format: { type: "json_object" } };
        }
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(await parseApiError(response, providerLabel));
        }
        const respData = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
        return respData.output_text || respData.output?.[0]?.content?.[0]?.text || '';
      }

      case 'anthropic': {
        providerLabel = 'Anthropic Messages API';
        const url = `${baseUrl}/v1/messages`;
        const body = {
          model: modelId,
          max_tokens: 64000,
          messages: [{ role: 'user', content: prompt }]
        };
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(await parseApiError(response, providerLabel));
        }
        const anthropicData = await response.json() as { content?: Array<{ text?: string }> };
        return anthropicData.content?.[0]?.text || '';
      }

      default:
        throw new Error(`不支持的 API 格式: ${provider.type}`);
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
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

  const config = getModelForTask(settings, 'translation');
  if (!config) {
    throw new Error("未配置 AI 提供商。请在设置中添加 API 提供商并配置翻译模型。");
  }
  return await callLLM(config.provider, config.modelId, prompt);
};

/**
 * 快速分类文章（第一步）
 * 仅返回分类结果，Prompt 更短，响应更快
 */
export const classifyArticles = async (
  articles: Article[],
  settings: AISettings | null = null
): Promise<string[]> => {
  if (articles.length === 0) {
    return [];
  }

  // Context preparation - 使用更短的描述以加快响应
  const context = articles.map((a, index) => 
    `${index}. ${a.title}${a.description ? ` - ${a.description.replace(/<[^>]+>/g, '').substring(0, 150)}` : ''}`
  ).join('\n');

  const prompt = `
你是一个新闻分类专家。请将以下文章快速分类。

文章列表：
${context}

分类规则：
- 将每篇文章归类为以下四个类别之一（必须严格匹配）：
  - "官方公告与新闻发布"
  - "内容更新与媒体宣发"
  - "线下活动与演出速报"
  - "社区互动与粉丝福利"

- 如果标题以 "RT" 开头，根据引用内容的语义进行归类。

输出格式：
返回 JSON 数组，顺序与输入文章一致。
例如：["官方公告与新闻发布", "社区互动与粉丝福利", ...]
`;

  const config = getModelForTask(settings, 'analysis');
  if (!config) {
    throw new Error("未配置 AI 提供商。请在设置中添加 API 提供商并配置分析模型。");
  }

  try {
    const text = await callLLM(config.provider, config.modelId, prompt, true);
    const result = JSON.parse(text);
    return Array.isArray(result) ? result : [];
  } catch (e: unknown) {
    console.warn("Classification failed:", e);
    throw new Error(`分类失败：${e instanceof Error ? e.message : String(e)}`);
  }
};

/**
 * 生成每日总结（第二步）
 * 接收分类结果作为输入，生成结构化总结
 */
export const generateDailySummary = async (
  feedTitle: string,
  date: Date,
  articles: Article[],
  classifications: string[],
  settings: AISettings | null = null
): Promise<string> => {
  if (articles.length === 0) {
    return "该日期无文章可总结。";
  }

  const dateStr = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // 按分类组织文章
  const categorizedArticles = articles.map((a, index) => ({
    title: a.title,
    category: classifications[index] || "未分类",
    description: a.description?.replace(/<[^>]+>/g, '').substring(0, 200)
  }));

  const context = categorizedArticles.map(a => 
    `[${a.category}] ${a.title}${a.description ? `: ${a.description}` : ''}`
  ).join('\n');

  const prompt = `
你是一个新闻总结专家。请根据以下已分类的文章列表，生成一份每日总结。

日期：${dateStr}
来源：${feedTitle}

已分类的文章：
${context}

总结格式要求：
1. 格式必须为纯文本：严禁使用任何 Markdown 格式（禁止加粗**、列表-、标题#）
2. 语言：简体中文
3. 每个分类的内容必须单独成段，段落之间使用两个换行符分隔

输出结构模版：
${dateStr}，${feedTitle}发布的内容如下。

官方公告与新闻发布方面，[内容...]。

内容更新与媒体宣发方面，[内容...]。

线下活动与演出速报方面，[内容...]。

社区互动与粉丝福利方面，[内容...]。

注意：如果某个分类没有文章，可以省略该段落或简单说明"无相关内容"。
直接返回总结文本，不要包含任何 JSON 格式。
`;

  // 1. Try Custom Settings (Prefer Summary config, fallback to Analysis)
  let config = getModelForTask(settings, 'summary');
  if (!config) {
    config = getModelForTask(settings, 'analysis');
  }
  
  if (!config) {
    throw new Error("未配置 AI 提供商。请在设置中添加 API 提供商并配置总结或分析模型。");
  }

  try {
    const text = await callLLM(config.provider, config.modelId, prompt, false);
    return text.trim() || "总结生成失败。";
  } catch (e: unknown) {
    console.warn("Summary generation failed:", e);
    throw new Error(`总结生成失败：${e instanceof Error ? e.message : String(e)}`);
  }
};