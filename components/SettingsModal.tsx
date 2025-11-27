
import React, { useState, useEffect, useRef } from 'react';
import { AISettings, AIProvider, AIModelConfig, AIProviderType } from '../types';
import { addSystemFeed, fetchAllSystemFeeds, deleteSystemFeed, FullSystemFeedConfig } from '../services/rssService';
import { fetchProviderModels } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AISettings;
  onSave: (newSettings: AISettings) => void;
}

const DEFAULT_SETTINGS: AISettings = {
  providers: [],
  tasks: {
    general: null,
    translation: null,
    summary: null,
    analysis: null
  }
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<AISettings>(settings || DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'providers' | 'models' | 'feeds'>('providers');

  // Provider state
  const [isEditingProvider, setIsEditingProvider] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Omit<AIProvider, 'id'>>({
    name: '',
    type: 'openai',
    baseUrl: '',
    apiKey: '',
    enabledModels: []
  });

  // Model Management State
  const [activeProviderForModels, setActiveProviderForModels] = useState<string | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  // Feed Management State
  const [adminSecret, setAdminSecret] = useState('');
  const [verifiedSecret, setVerifiedSecret] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [fullFeedList, setFullFeedList] = useState<FullSystemFeedConfig[]>([]);
  const [isEditingFeed, setIsEditingFeed] = useState(false);
  const [feedForm, setFeedForm] = useState({ id: '', url: '', category: '', isSub: false, customTitle: '' });
  const [feedStatus, setFeedStatus] = useState<{msg: string, type: 'success' | 'error' | null}>({ msg: '', type: null });
  const [isSubmittingFeed, setIsSubmittingFeed] = useState(false);

  // Refs for smooth scrolling
  const taskConfigRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings || DEFAULT_SETTINGS);
      // Reset feed management state on open
      setVerifiedSecret(null);
      setAdminSecret('');
      setFullFeedList([]);
      
      // Select first provider for models tab if exists
      if (settings?.providers?.length > 0) {
        setActiveProviderForModels(settings.providers[0].id);
      }
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  // --- Provider Handlers ---
  const handleSaveProvider = () => {
    if (!editForm.name || !editForm.baseUrl || !editForm.apiKey) {
      alert("请填写完整的提供商信息");
      return;
    }

    if (editingProviderId) {
      setLocalSettings(prev => ({
        ...prev,
        providers: prev.providers.map(p => p.id === editingProviderId ? { ...p, ...editForm } : p)
      }));
    } else {
      const newProvider: AIProvider = {
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        ...editForm
      };
      setLocalSettings(prev => ({
        ...prev,
        providers: [...prev.providers, newProvider]
      }));
    }
    setIsEditingProvider(false);
    setEditingProviderId(null);
    setEditForm({ name: '', type: 'openai', baseUrl: '', apiKey: '', enabledModels: [] });
  };

  const handleDeleteProvider = (id: string) => {
    if (confirm("确定要删除这个提供商吗？所有使用该提供商的任务模型将被重置。")) {
      setLocalSettings(prev => {
        const newTasks = { ...prev.tasks };
        (Object.keys(newTasks) as Array<keyof typeof newTasks>).forEach(key => {
          if (newTasks[key]?.providerId === id) {
            newTasks[key] = null;
          }
        });
        return {
          providers: prev.providers.filter(p => p.id !== id),
          tasks: newTasks
        };
      });
      if (activeProviderForModels === id) setActiveProviderForModels(null);
    }
  };

  const startEditProvider = (provider?: AIProvider) => {
    if (provider) {
      setEditingProviderId(provider.id);
      setEditForm({ 
        name: provider.name, 
        type: provider.type, 
        baseUrl: provider.baseUrl, 
        apiKey: provider.apiKey,
        enabledModels: provider.enabledModels || []
      });
    } else {
      setEditingProviderId(null);
      setEditForm({ name: '', type: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', enabledModels: [] });
    }
    setIsEditingProvider(true);
  };

  // --- Model Library Handlers ---
  const handleFetchModels = async () => {
    if (!activeProviderForModels) return;
    const provider = localSettings.providers.find(p => p.id === activeProviderForModels);
    if (!provider) return;

    setIsFetchingModels(true);
    setFetchError(null);
    try {
      const models = await fetchProviderModels(provider);
      if (models.length === 0) {
        setFetchError("未找到任何可用模型。请检查 API Key 权限或网络连接。");
      } else {
        setAvailableModels(models);
        // Automatically merge new models into available set if strict mode wasn't desired, but here we just list them.
      }
    } catch (e: any) {
      setFetchError(e.message);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const toggleEnabledModel = (providerId: string, modelId: string) => {
    setLocalSettings(prev => ({
      ...prev,
      providers: prev.providers.map(p => {
        if (p.id === providerId) {
          const current = p.enabledModels || [];
          const exists = current.includes(modelId);
          return {
            ...p,
            enabledModels: exists ? current.filter(m => m !== modelId) : [...current, modelId]
          };
        }
        return p;
      })
    }));
  };
  
  const getEnabledModelsForProvider = (providerId: string) => {
    return localSettings.providers.find(p => p.id === providerId)?.enabledModels || [];
  };

  // --- Model Config Handlers ---
  const handleModelChange = (task: keyof AISettings['tasks'], field: keyof AIModelConfig, value: string) => {
    setLocalSettings(prev => {
      const currentConfig = prev.tasks[task] || { providerId: '', modelId: '', modelName: '' };
      
      // If changing provider, clear the model ID unless we want to try to keep it (usually different providers have different models)
      if (field === 'providerId') {
         if (value === '') {
             return { ...prev, tasks: { ...prev.tasks, [task]: null } };
         }
         return { 
           ...prev, 
           tasks: { 
             ...prev.tasks, 
             [task]: { ...currentConfig, providerId: value, modelId: '' } // Reset model ID on provider change
           } 
         };
      }
      
      return { ...prev, tasks: { ...prev.tasks, [task]: { ...currentConfig, [field]: value } } };
    });
  };

  const handleSaveAll = () => {
    if (!localSettings.tasks.general?.providerId || !localSettings.tasks.general?.modelId) {
      alert("必须配置「总模型」（General Model）作为默认兜底。");
      return;
    }
    onSave(localSettings);
    onClose();
  };
  
  // --- Feed Handlers ---
  const handleLoadFeeds = async (secret: string) => {
    setIsVerifying(true);
    setFeedStatus({msg: '', type: null});
    try {
      const feeds = await fetchAllSystemFeeds(secret);
      setFullFeedList(feeds);
      setVerifiedSecret(secret);
    } catch (e: any) {
      setFeedStatus({msg: e.message || 'Failed to load feeds. Is secret correct?', type: 'error'});
      setVerifiedSecret(null);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUpsertFeed = async () => {
    if (!feedForm.id || !feedForm.url || !verifiedSecret) {
      setFeedStatus({ msg: 'ID and URL are required.', type: 'error' });
      return;
    }
    setIsSubmittingFeed(true);
    setFeedStatus({ msg: `${isEditingFeed ? 'Updating' : 'Adding'} feed...`, type: null });
    try {
      await addSystemFeed(feedForm.id, feedForm.url, feedForm.category, feedForm.isSub, feedForm.customTitle, verifiedSecret);
      setFeedStatus({ msg: `Feed ${isEditingFeed ? 'updated' : 'added'} successfully! The list will refresh.`, type: 'success' });
      setFeedForm({ id: '', url: '', category: '', isSub: false, customTitle: '' });
      setIsEditingFeed(false);
      await handleLoadFeeds(verifiedSecret);
    } catch (e: any) {
      setFeedStatus({ msg: e.message || 'Failed to submit feed.', type: 'error' });
    } finally {
      setIsSubmittingFeed(false);
    }
  };

  const startEditFeed = (feed: FullSystemFeedConfig) => {
    setFeedForm({ id: feed.id, url: feed.url, category: feed.category || '', isSub: feed.isSub || false, customTitle: feed.customTitle || '' });
    setIsEditingFeed(true);
    window.scrollTo(0, document.body.scrollHeight);
  };
  
  const cancelEditFeed = () => {
    setFeedForm({ id: '', url: '', category: '', isSub: false, customTitle: '' });
    setIsEditingFeed(false);
  }

  const handleDeleteFeed = async (id: string) => {
    if (verifiedSecret && confirm(`Are you sure you want to delete feed with ID: ${id}? This cannot be undone.`)) {
        setIsSubmittingFeed(true);
        setFeedStatus({msg: 'Deleting feed...', type: null});
        try {
            await deleteSystemFeed(id, verifiedSecret);
            setFeedStatus({msg: 'Feed deleted. The list will refresh.', type: 'success'});
            await handleLoadFeeds(verifiedSecret);
        } catch (e: any) {
            setFeedStatus({msg: e.message || 'Failed to delete feed.', type: 'error'});
        } finally {
            setIsSubmittingFeed(false);
        }
    }
  };


  // Common Styles
  const inputClass = "w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm placeholder:text-slate-400 dark:bg-slate-700 dark:text-white dark:border-slate-600 dark:placeholder-slate-500";
  const labelClass = "block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide dark:text-slate-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col dark:bg-slate-800 dark:shadow-black/50">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 dark:bg-slate-900 dark:border-slate-700 shrink-0">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">设置 (Settings)</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 dark:hover:bg-slate-700 dark:text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content Container */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Navigation Tabs (Top on mobile, Sidebar on desktop) */}
          <div className="w-full md:w-48 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-2 md:p-4 flex flex-row md:flex-col gap-2 shrink-0 dark:bg-slate-900 dark:border-slate-700 overflow-x-auto">
            <button onClick={() => setActiveTab('providers')} className={`text-center md:text-left px-4 py-3 rounded-lg font-medium text-sm transition-colors flex-1 md:flex-none whitespace-nowrap ${activeTab === 'providers' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>API 提供商</button>
            <button onClick={() => setActiveTab('models')} className={`text-center md:text-left px-4 py-3 rounded-lg font-medium text-sm transition-colors flex-1 md:flex-none whitespace-nowrap ${activeTab === 'models' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>模型配置</button>
            <button onClick={() => setActiveTab('feeds')} className={`text-center md:text-left px-4 py-3 rounded-lg font-medium text-sm transition-colors flex-1 md:flex-none whitespace-nowrap ${activeTab === 'feeds' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>Feed 管理</button>
          </div>

          {/* Main Panel */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-slate-50/30 dark:bg-slate-950/30">
            
            {/* --- PROVIDERS TAB --- */}
            {activeTab === 'providers' && (
              <div className="space-y-6 max-w-3xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">API 提供商管理</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">添加 OpenAI 或 Gemini 格式的 API 接入点。</p>
                  </div>
                  <button onClick={() => startEditProvider()} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 flex justify-center items-center gap-2 shadow-md hover:shadow-lg transition-all dark:bg-blue-600 dark:hover:bg-blue-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                    添加提供商
                  </button>
                </div>

                {isEditingProvider && (
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-md mb-6 animate-slide-in dark:bg-slate-800 dark:border-slate-700">
                    <h4 className="font-bold text-slate-800 mb-6 border-b border-slate-100 pb-3 dark:text-white dark:border-slate-700">{editingProviderId ? '编辑提供商' : '新建提供商'}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                      <div>
                        <label className={labelClass}>名称 (备注)</label>
                        <input type="text" className={inputClass} placeholder="例如: Official OpenAI" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                      </div>
                      <div>
                        <label className={labelClass}>API 格式</label>
                        <div className="relative">
                          <select className={`${inputClass} appearance-none cursor-pointer`} value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value as AIProviderType})}>
                            <option value="openai">OpenAI Compatible</option>
                            <option value="gemini">Gemini API</option>
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></div>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className={labelClass}>接入点地址 (Base URL)</label>
                        <input type="text" className={`${inputClass} font-mono`} placeholder={editForm.type === 'openai' ? 'https://api.openai.com/v1' : 'https://generativelanguage.googleapis.com'} value={editForm.baseUrl} onChange={e => setEditForm({...editForm, baseUrl: e.target.value})} />
                        <p className="text-[10px] text-slate-400 mt-1.5 ml-1 dark:text-slate-500">{editForm.type === 'openai' ? '通常以 /v1 结尾' : 'Gemini 官方地址通常无需修改，除非使用反代'}</p>
                      </div>
                      <div className="md:col-span-2">
                        <label className={labelClass}>API Key</label>
                        <input type="password" className={`${inputClass} font-mono tracking-widest`} placeholder="sk-..." value={editForm.apiKey} onChange={e => setEditForm({...editForm, apiKey: e.target.value})} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                      <button onClick={() => setIsEditingProvider(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors dark:text-slate-300 dark:hover:bg-slate-700">取消</button>
                      <button onClick={handleSaveProvider} className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-bold shadow-md">保存</button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3">
                  {localSettings.providers.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 dark:bg-slate-800/50 dark:border-slate-700">
                      <p>暂无提供商</p><p className="text-xs mt-1">请点击右上方按钮添加</p>
                    </div>
                  ) : (
                    localSettings.providers.map(provider => (
                      <div key={provider.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all gap-4 dark:bg-slate-800 dark:border-slate-700">
                        <div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-inner shrink-0 ${provider.type === 'gemini' ? 'bg-gradient-to-br from-purple-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-400 to-teal-600'}`}>{provider.type === 'gemini' ? 'GEM' : 'GPT'}</div>
                          <div className="min-w-0"><h4 className="font-bold text-slate-800 text-base dark:text-white truncate">{provider.name}</h4><p className="text-xs text-slate-400 font-mono truncate max-w-[200px] bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-1 dark:bg-slate-700 dark:text-slate-300">{provider.baseUrl}</p></div>
                        </div>
                        <div className="flex items-center gap-2 justify-end sm:justify-start">
                          <button onClick={() => startEditProvider(provider)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors dark:hover:bg-blue-900/30 dark:hover:text-blue-300" title="编辑"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg></button>
                          <button onClick={() => handleDeleteProvider(provider.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-900/30 dark:hover:text-red-300" title="删除"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* --- MODELS TAB --- */}
            {activeTab === 'models' && (
              <div className="space-y-10 max-w-4xl mx-auto">
                
                {/* 1. SELECT ENABLED MODELS SECTION */}
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2 dark:text-white">选择启用的模型 (Select Enabled Models)</h3>
                  <p className="text-sm text-slate-500 mb-4 dark:text-slate-400">选择提供商并获取可用模型列表，勾选您希望在任务配置中使用的模型。</p>
                  
                  {localSettings.providers.length === 0 ? (
                    <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg text-sm dark:bg-yellow-900/30 dark:text-yellow-400">请先在“API 提供商”页面添加提供商。</div>
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
                      {/* Provider Tabs */}
                      <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 dark:bg-slate-900 dark:border-slate-700 p-2 gap-2">
                         {localSettings.providers.map(p => (
                            <button 
                              key={p.id} 
                              onClick={() => { setActiveProviderForModels(p.id); setAvailableModels([]); setFetchError(null); setModelSearchQuery(''); }}
                              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${activeProviderForModels === p.id ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-400' : 'text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                            >
                               <span className={`w-2 h-2 rounded-full ${p.type === 'gemini' ? 'bg-purple-500' : 'bg-emerald-500'}`}></span>
                               {p.name}
                            </button>
                         ))}
                      </div>
                      
                      {/* Active Provider Config Area */}
                      {activeProviderForModels && (
                        <div className="p-6">
                           {/* Improved Mobile Layout */}
                           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                              <h4 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                <span className="text-sm px-2 py-0.5 bg-slate-100 rounded text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                                   {localSettings.providers.find(p => p.id === activeProviderForModels)?.type === 'gemini' ? 'Gemini API' : 'OpenAI Compatible'}
                                </span>
                              </h4>
                              <button 
                                onClick={handleFetchModels}
                                disabled={isFetchingModels}
                                className="w-full sm:w-auto px-4 py-2 bg-indigo-50 text-indigo-600 text-sm font-bold rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 whitespace-nowrap"
                              >
                                {isFetchingModels ? '获取中...' : '获取所有可用模型'}
                              </button>
                           </div>
                           
                           {/* Search Box */}
                           <div className="relative mb-4">
                             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                 <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                               </svg>
                             </div>
                             <input 
                               type="text" 
                               className={`${inputClass} pl-10`} 
                               placeholder="搜索模型 (Search Models)..."
                               value={modelSearchQuery}
                               onChange={(e) => setModelSearchQuery(e.target.value)}
                             />
                           </div>
                           
                           {fetchError && (
                             <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg dark:bg-red-900/30 dark:text-red-300">
                               <strong>获取失败:</strong> {fetchError}
                             </div>
                           )}

                           {/* Render Available Models (if fetched) OR Currently Enabled Models */}
                           <div className="space-y-2">
                             {(availableModels.length > 0 || getEnabledModelsForProvider(activeProviderForModels).length > 0) && (
                               <div className="mb-2 p-2 bg-blue-50 text-blue-700 text-xs rounded-lg dark:bg-blue-900/30 dark:text-blue-300 flex justify-between items-center">
                                 <span>请勾选您想启用的模型。未列出的模型可手动输入。</span>
                               </div>
                             )}
                             
                             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-60 overflow-y-auto custom-scrollbar p-1">
                               {Array.from(new Set([...availableModels, ...getEnabledModelsForProvider(activeProviderForModels)]))
                                 .filter(m => m.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                                 .sort()
                                 .map(modelId => {
                                 const isEnabled = getEnabledModelsForProvider(activeProviderForModels).includes(modelId);
                                 return (
                                   <label key={modelId} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isEnabled ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-white border-slate-200 hover:border-blue-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                                      <input 
                                        type="checkbox" 
                                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                        checked={isEnabled}
                                        onChange={() => toggleEnabledModel(activeProviderForModels, modelId)}
                                      />
                                      <span className={`text-sm truncate ${isEnabled ? 'font-bold text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`} title={modelId}>
                                        {modelId}
                                      </span>
                                   </label>
                                 );
                               })}
                               {availableModels.length === 0 && getEnabledModelsForProvider(activeProviderForModels).length === 0 && (
                                  <div className="col-span-full text-center py-8 text-slate-400 italic">
                                     暂无模型数据，请点击“获取所有可用模型”按钮。
                                  </div>
                               )}
                               {availableModels.length > 0 && Array.from(new Set([...availableModels, ...getEnabledModelsForProvider(activeProviderForModels)])).filter(m => m.toLowerCase().includes(modelSearchQuery.toLowerCase())).length === 0 && (
                                  <div className="col-span-full text-center py-4 text-slate-400">
                                     未找到匹配的模型。
                                  </div>
                               )}
                             </div>
                             
                             {/* Save/Confirm Selection Guidance Button */}
                             <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                    已启用 {getEnabledModelsForProvider(activeProviderForModels).length} 个模型
                                </span>
                                <button 
                                    onClick={() => taskConfigRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                    className="px-4 py-2 bg-slate-800 text-white text-sm font-bold rounded-lg hover:bg-slate-700 transition-colors dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center gap-2 shadow-sm whitespace-nowrap"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    确认选择并配置任务
                                </button>
                             </div>
                           </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. TASK CONFIGURATION SECTION */}
                <div className="space-y-6" ref={taskConfigRef}>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2 dark:text-white">模型任务配置 (Model Task Configuration)</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">为不同的任务指定使用的模型。若特定任务未配置，将默认使用「总模型」。</p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-6">
                    {/* General Model Config */}
                    <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-md dark:bg-slate-800 dark:shadow-none">
                      <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4 dark:border-slate-700">
                        <span className="bg-blue-100 text-blue-700 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider dark:bg-blue-900 dark:text-blue-300">DEFAULT</span>
                        <h4 className="font-bold text-slate-900 text-lg dark:text-white">总模型 (General Model)</h4><span className="text-xs text-red-500 font-medium ml-auto">* 必填</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div>
                          <label className={labelClass}>选择提供商</label>
                          <div className="relative">
                            <select className={`${inputClass} appearance-none cursor-pointer`} value={localSettings.tasks.general?.providerId || ''} onChange={e => handleModelChange('general', 'providerId', e.target.value)}>
                              <option value="">请选择...</option>
                              {localSettings.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></div>
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>模型 ID</label>
                          {/* Intelligent Dropdown Logic */}
                          {localSettings.tasks.general?.providerId ? (
                             getEnabledModelsForProvider(localSettings.tasks.general.providerId).length > 0 ? (
                               <div className="relative">
                                 <select 
                                   className={`${inputClass} appearance-none cursor-pointer`} 
                                   value={localSettings.tasks.general.modelId || ''} 
                                   onChange={e => handleModelChange('general', 'modelId', e.target.value)}
                                 >
                                    <option value="">请选择模型...</option>
                                    {getEnabledModelsForProvider(localSettings.tasks.general.providerId).map(m => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                 </select>
                                 <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></div>
                               </div>
                             ) : (
                               <input type="text" className={inputClass} placeholder="未启用模型，请手动输入 ID" value={localSettings.tasks.general.modelId || ''} onChange={e => handleModelChange('general', 'modelId', e.target.value)} />
                             )
                          ) : (
                             <input type="text" className={inputClass} disabled placeholder="请先选择提供商" />
                          )}
                        </div>
                        <div>
                          <label className={labelClass}>备注名称</label>
                          <input type="text" className={inputClass} placeholder="给个好记的名字" value={localSettings.tasks.general?.modelName || ''} onChange={e => handleModelChange('general', 'modelName', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    {/* Specific Task Configs */}
                    {[{ key: 'translation', label: 'AI 翻译', hint: '建议使用速度快、成本低的小模型 (e.g. gemini-flash, gpt-4o-mini)' }, { key: 'summary', label: 'AI 总结', hint: '用于生成简单的摘要' }, { key: 'analysis', label: 'AI 分析', hint: '用于复杂的分类和深度分析任务' },].map(task => { const taskKey = task.key as keyof AISettings['tasks']; const config = localSettings.tasks[taskKey]; 
                      const activeProviderId = config?.providerId || '';
                      const enabledModels = activeProviderId ? getEnabledModelsForProvider(activeProviderId) : [];
                      
                      return (
                        <div key={taskKey} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md dark:bg-slate-800 dark:border-slate-700">
                          <div className="flex items-center gap-2 mb-2"><span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider dark:bg-slate-700 dark:text-slate-300">OPTIONAL</span><h4 className="font-bold text-slate-800 text-lg dark:text-white">{task.label}</h4></div>
                          <p className="text-xs text-slate-400 mb-6 dark:text-slate-500">{task.hint}</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div>
                              <label className={labelClass}>选择提供商</label>
                              <div className="relative">
                                <select className={`${inputClass} appearance-none cursor-pointer`} value={config?.providerId || ''} onChange={e => handleModelChange(taskKey, 'providerId', e.target.value)}>
                                  <option value="">默认 (使用总模型)</option>
                                  {localSettings.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></div>
                              </div>
                            </div>
                            
                            {config?.providerId && (
                              <>
                                <div>
                                  <label className={labelClass}>模型 ID</label>
                                  {enabledModels.length > 0 ? (
                                     <div className="relative">
                                       <select 
                                         className={`${inputClass} appearance-none cursor-pointer`} 
                                         value={config.modelId || ''} 
                                         onChange={e => handleModelChange(taskKey, 'modelId', e.target.value)}
                                       >
                                          <option value="">请选择模型...</option>
                                          {enabledModels.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                          ))}
                                       </select>
                                       <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></div>
                                     </div>
                                  ) : (
                                     <input type="text" className={inputClass} placeholder="未启用模型，请手动输入" value={config.modelId || ''} onChange={e => handleModelChange(taskKey, 'modelId', e.target.value)} />
                                  )}
                                </div>
                                <div>
                                  <label className={labelClass}>备注名称</label>
                                  <input type="text" className={inputClass} placeholder="备注" value={config.modelName || ''} onChange={e => handleModelChange(taskKey, 'modelName', e.target.value)} />
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                    );})}
                  </div>
                </div>
              </div>
            )}
            
            {/* --- FEED MANAGEMENT TAB --- */}
            {activeTab === 'feeds' && (
              <div className="space-y-8 max-w-3xl mx-auto">
                <div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Feed Manager</h3><p className="text-sm text-slate-500 dark:text-slate-400">Add, edit, or delete RSS feeds. Changes require closing settings to take effect.</p></div>

                {!verifiedSecret ? (
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700">
                    <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">Admin Access Required</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Enter the admin secret key to manage feeds.</p>
                    {feedStatus.msg && (<div className={`mb-4 px-4 py-3 rounded-lg text-sm font-semibold ${feedStatus.type === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-blue-50 text-blue-700'}`}>{feedStatus.msg}</div>)}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input type="password" className={inputClass} placeholder="Enter Admin Secret" value={adminSecret} onChange={e => setAdminSecret(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLoadFeeds(adminSecret)} />
                      <button onClick={() => handleLoadFeeds(adminSecret)} disabled={isVerifying} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md flex items-center justify-center disabled:bg-indigo-400">
                        {isVerifying && <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                        Unlock & Load
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                        <h4 className="font-bold text-slate-800 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">Subscription List</h4>
                        {fullFeedList.length > 0 ? (
                            <div className="space-y-2">
                                {fullFeedList.map(feed => (
                                    <div key={feed.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700/50">
                                        <div>
                                            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{feed.customTitle || feed.id}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{feed.category} {feed.isSub && '(Sub)'}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => startEditFeed(feed)} className="p-2 text-slate-400 hover:text-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-slate-700"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg></button>
                                            <button onClick={() => handleDeleteFeed(feed.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 dark:hover:bg-slate-700"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-sm text-center text-slate-500 py-4">No feeds found.</p>}
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700">
                        <h4 className="font-bold text-slate-800 dark:text-white mb-4 border-b border-slate-100 dark:border-slate-700 pb-3">{isEditingFeed ? 'Edit Feed' : 'Add New Feed'}</h4>
                         {feedStatus.msg && (<div className={`mb-4 px-4 py-3 rounded-lg text-sm font-semibold ${feedStatus.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : feedStatus.type === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-blue-50 text-blue-700'}`}>{feedStatus.msg}</div>)}
                         <div className="space-y-4">
                            <div><label className={labelClass}>Unique ID (Code)</label><input type="text" className={inputClass} placeholder="e.g., bandori_official_twitter" value={feedForm.id} onChange={e => setFeedForm({...feedForm, id: e.target.value})} disabled={isEditingFeed} /></div>
                            <div><label className={labelClass}>Custom Title (Optional)</label><input type="text" className={inputClass} placeholder="Overrides default title from feed" value={feedForm.customTitle} onChange={e => setFeedForm({...feedForm, customTitle: e.target.value})} /></div>
                            <div><label className={labelClass}>Source URL (Hidden)</label><input type="text" className={inputClass} placeholder="https://your-rss-service.com/..." value={feedForm.url} onChange={e => setFeedForm({...feedForm, url: e.target.value})} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className={labelClass}>Category</label><input type="text" className={inputClass} placeholder="e.g., BanG Dream" value={feedForm.category} onChange={e => setFeedForm({...feedForm, category: e.target.value})} /></div>
                                <div className="flex items-end pb-3"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked={feedForm.isSub} onChange={e => setFeedForm({...feedForm, isSub: e.target.checked})} /><span className="text-sm font-medium text-slate-700 dark:text-slate-300">Is Sub-feed?</span></label></div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                {isEditingFeed && <button onClick={cancelEditFeed} className="w-full py-2.5 bg-slate-200 text-slate-800 rounded-lg font-bold hover:bg-slate-300 transition-colors">Cancel Edit</button>}
                                <button onClick={handleUpsertFeed} disabled={isSubmittingFeed} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md flex items-center justify-center disabled:bg-indigo-400 disabled:cursor-not-allowed">
                                    {isSubmittingFeed && <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                                    {isEditingFeed ? (isSubmittingFeed ? 'Updating...' : 'Update Feed') : (isSubmittingFeed ? 'Adding...' : 'Add Feed')}
                                </button>
                            </div>
                         </div>
                    </div>
                  </>
                )}
              </div>
            )}
            
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0 dark:bg-slate-900 dark:border-slate-700">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors dark:text-slate-300 dark:hover:bg-slate-800">
            关闭
          </button>
          <button onClick={handleSaveAll} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 hover:shadow-xl hover:-translate-y-0.5 transition-all dark:shadow-none dark:hover:bg-blue-500">
            保存配置
          </button>
        </div>

      </div>
    </div>
  );
};
