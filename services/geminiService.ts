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
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${err}`);
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
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} - ${err}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
  } catch (e) {
    console.error("LLM Call Failed:", e);
    throw e;
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
    try {
      return await callLLM(config.provider, config.modelId, prompt);
    } catch (e) {
      console.warn("Custom translation provider failed, falling back to system default.", e);
    }
  }

  // 2. Fallback to System Default (Gemini SDK)
  if (!systemApiKey) {
    throw new Error("API Key is missing. Please configure settings or environment.");
  }

  try {
    const response = await systemAi.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Translation failed.";
  } catch (error) {
    console.error("System Gemini Error:", error);
    return "Error: Could not translate content.";
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
    请将每一篇文章归类为以下五个类别之一（必须严格匹配）：
    - "官方公告与新闻发布"
    - "内容更新与媒体宣发"
    - "线下活动与演出速报"
    - "社区互动与粉丝福利"
    - "转发&引用"

    **重要分类规则 (Priority Rule)**:
    - **如果文章标题以 "RT" 开头 (例如 "RT User:", "RT @User", "RT 梦限大..."), 你必须忽略其语义内容，直接将其归类为 "转发&引用"。**
    - 只有当标题不包含 "RT" 前缀时，才根据内容进行语义分类。

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

    转发&引用方面，[内容...]。

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
        summary: result.summary || "Summary generation failed.",
        classifications: Array.isArray(result.classifications) ? result.classifications : []
      };
    } catch (e) {
      console.warn("Custom analysis provider failed, falling back to system.", e);
    }
  }

  // 2. Fallback to System Default
  if (!systemApiKey) {
    return { summary: "System API Key missing. Please configure settings.", classifications: [] };
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
      summary: result.summary || "Summary generation failed.",
      classifications: Array.isArray(result.classifications) ? result.classifications : []
    };
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      summary: "Error: Could not generate analysis. Please try again later.",
      classifications: []
    };
  }
};