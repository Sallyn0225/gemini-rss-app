import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { AISettings, AIProvider, AIModelConfig, AIProviderType, ImageProxyMode } from '../types';
import { addSystemFeed, fetchAllSystemFeeds, deleteSystemFeed, reorderSystemFeeds, FullSystemFeedConfig } from '../services/rssService';
import { fetchProviderModels } from '../services/geminiService';
import { useToast } from '@/hooks/use-toast';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Settings2, 
  Cpu, 
  Rss, 
  Monitor, 
  Plus, 
  Trash2, 
  Edit2, 
  GripVertical, 
  ChevronRight, 
  Folder, 
  FolderOpen,
  Search,
  RefreshCw,
  Check,
  AlertCircle,
  Lock,
  Unlock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AISettings;
  onSave: (newSettings: AISettings) => void;
  imageProxyMode?: ImageProxyMode;
  onImageProxyModeChange?: (mode: ImageProxyMode) => void;
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

interface GroupNode {
  name: string;
  fullPath: string;
  feeds: FullSystemFeedConfig[];
  children: { [key: string]: GroupNode };
}

const DraggableNestedFeedItem = React.memo<{
  feed: FullSystemFeedConfig;
  onEdit: (feed: FullSystemFeedConfig) => void;
  onDelete: (id: string) => void;
}>(({ feed, onEdit, onDelete }) => {
  const dragControls = useDragControls();
  
  return (
    <Reorder.Item 
      value={feed}
      dragListener={false}
      dragControls={dragControls}
      className="flex items-center gap-3 p-3 rounded-lg bg-card border hover:border-primary/50 transition-all list-none shadow-sm group"
    >
      <div 
        className="text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing touch-none p-1 hover:text-primary transition-colors"
        onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate" title={feed.customTitle || feed.id}>
          {feed.customTitle || feed.id}
        </p>
        <p className="text-[10px] text-muted-foreground font-medium truncate opacity-70">{feed.url}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(feed)}>
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(feed.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Reorder.Item>
  );
});
DraggableNestedFeedItem.displayName = 'DraggableNestedFeedItem';

const NestedGroupItem: React.FC<{
  node: GroupNode;
  depth: number;
  collapsedGroups: Set<string>;
  toggleGroupCollapse: (path: string) => void;
  onEdit: (feed: FullSystemFeedConfig) => void;
  onDelete: (id: string) => void;
  childOrderMap: Record<string, string[]>;
  onChildOrderChange: (parentPath: string, newOrder: string[]) => void;
  onFeedOrderChange: (parentPath: string, newFeeds: FullSystemFeedConfig[]) => void;
  dragControls?: ReturnType<typeof useDragControls>;
}> = ({ node, depth, collapsedGroups, toggleGroupCollapse, onEdit, onDelete, childOrderMap, onChildOrderChange, onFeedOrderChange, dragControls }) => {
  const isCollapsed = collapsedGroups.has(node.fullPath);
  const childKeys = Object.keys(node.children);
  const childOrder = childOrderMap[node.fullPath] || childKeys;
  
  const sortedChildKeys = useMemo(() => {
    const keys = Object.keys(node.children);
    return [...keys].sort((a, b) => {
      const aIndex = childOrder.indexOf(a);
      const bIndex = childOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [node.children, childOrder]);

  const feedOrder = node.feeds;
  const hasChildren = sortedChildKeys.length > 0;
  const hasFeeds = feedOrder.length > 0;

  const totalCount = useMemo(() => {
    const countInNode = (n: GroupNode): number => 
      n.feeds.length + Object.values(n.children).reduce((s, c) => s + countInNode(c), 0);
    return feedOrder.length + sortedChildKeys.reduce((sum, key) => sum + countInNode(node.children[key]), 0);
  }, [node, sortedChildKeys, feedOrder]);

  return (
    <div className={cn("border rounded-xl overflow-hidden bg-muted/20", depth > 0 && "ml-4 mt-2")}>
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors">
        <div className="flex items-center gap-2 flex-1">
          {dragControls && (
            <div 
              className="text-muted-foreground/40 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
            >
              <GripVertical className="w-4 h-4" />
            </div>
          )}
          <button
            onClick={() => toggleGroupCollapse(node.fullPath)}
            className="flex items-center gap-2 flex-1 text-left"
          >
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", !isCollapsed && "rotate-90")} />
            {isCollapsed ? <Folder className="w-4 h-4 text-primary/70" /> : <FolderOpen className="w-4 h-4 text-primary/70" />}
            <span className="font-bold text-sm tracking-tight">
              {node.name}
            </span>
          </button>
        </div>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold">
          {totalCount}
        </Badge>
      </div>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-2 space-y-2">
              {hasChildren && (
                <Reorder.Group 
                  axis="y" 
                  values={sortedChildKeys} 
                  onReorder={(newOrder) => onChildOrderChange(node.fullPath, newOrder)}
                  className="space-y-2"
                >
                  {sortedChildKeys.map(childKey => (
                    <DraggableChildGroup
                      key={node.children[childKey].fullPath}
                      childKey={childKey}
                      childNode={node.children[childKey]}
                      depth={depth}
                      collapsedGroups={collapsedGroups}
                      toggleGroupCollapse={toggleGroupCollapse}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      childOrderMap={childOrderMap}
                      onChildOrderChange={onChildOrderChange}
                      onFeedOrderChange={onFeedOrderChange}
                    />
                  ))}
                </Reorder.Group>
              )}
              
              {hasFeeds && (
                <Reorder.Group 
                  axis="y" 
                  values={feedOrder} 
                  onReorder={(newFeeds) => onFeedOrderChange(node.fullPath, newFeeds)}
                  className="space-y-1"
                >
                  {feedOrder.map((feed) => (
                    <DraggableNestedFeedItem 
                      key={feed.id} 
                      feed={feed}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </Reorder.Group>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DraggableChildGroup = React.memo<{
  childKey: string;
  childNode: GroupNode;
  depth: number;
  collapsedGroups: Set<string>;
  toggleGroupCollapse: (path: string) => void;
  onEdit: (feed: FullSystemFeedConfig) => void;
  onDelete: (id: string) => void;
  childOrderMap: Record<string, string[]>;
  onChildOrderChange: (parentPath: string, newOrder: string[]) => void;
  onFeedOrderChange: (parentPath: string, newFeeds: FullSystemFeedConfig[]) => void;
}>(({ childKey, childNode, depth, collapsedGroups, toggleGroupCollapse, onEdit, onDelete, childOrderMap, onChildOrderChange, onFeedOrderChange }) => {
  const dragControls = useDragControls();
  
  return (
    <Reorder.Item 
      value={childKey}
      dragListener={false}
      dragControls={dragControls}
      className="list-none"
    >
      <NestedGroupItem
        node={childNode}
        depth={depth + 1}
        collapsedGroups={collapsedGroups}
        toggleGroupCollapse={toggleGroupCollapse}
        onEdit={onEdit}
        onDelete={onDelete}
        childOrderMap={childOrderMap}
        onChildOrderChange={onChildOrderChange}
        onFeedOrderChange={onFeedOrderChange}
        dragControls={dragControls}
      />
    </Reorder.Item>
  );
});
DraggableChildGroup.displayName = 'DraggableChildGroup';

const DraggableTopLevelGroup = React.memo<{
  groupName: string;
  node: GroupNode;
  collapsedGroups: Set<string>;
  toggleGroupCollapse: (path: string) => void;
  onEdit: (feed: FullSystemFeedConfig) => void;
  onDelete: (id: string) => void;
  childOrderMap: Record<string, string[]>;
  onChildOrderChange: (parentPath: string, newOrder: string[]) => void;
  onFeedOrderChange: (parentPath: string, newFeeds: FullSystemFeedConfig[]) => void;
}>(({ groupName, node, collapsedGroups, toggleGroupCollapse, onEdit, onDelete, childOrderMap, onChildOrderChange, onFeedOrderChange }) => {
  const dragControls = useDragControls();
  
  return (
    <Reorder.Item 
      value={groupName}
      dragListener={false}
      dragControls={dragControls}
      className="list-none"
    >
      <NestedGroupItem
        node={node}
        depth={0}
        collapsedGroups={collapsedGroups}
        toggleGroupCollapse={toggleGroupCollapse}
        onEdit={onEdit}
        onDelete={onDelete}
        childOrderMap={childOrderMap}
        onChildOrderChange={onChildOrderChange}
        onFeedOrderChange={onFeedOrderChange}
        dragControls={dragControls}
      />
    </Reorder.Item>
  );
});
DraggableTopLevelGroup.displayName = 'DraggableTopLevelGroup';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, imageProxyMode, onImageProxyModeChange }) => {
  const { toast } = useToast();
  const [localSettings, setLocalSettings] = useState<AISettings>(settings || DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState('providers');

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
  const reorderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [fullFeedList, setFullFeedList] = useState<FullSystemFeedConfig[]>([]);

  const [isEditingFeed, setIsEditingFeed] = useState(false);
  const [feedForm, setFeedForm] = useState({ id: '', url: '', category: '', isSub: false, customTitle: '' });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [childGroupOrderMap, setChildGroupOrderMap] = useState<Record<string, string[]>>({});

  const [feedStatus, setFeedStatus] = useState<{ msg: string, type: 'success' | 'error' | null }>({ msg: '', type: null });
  const [isSubmittingFeed, setIsSubmittingFeed] = useState(false);

  const feedFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings || DEFAULT_SETTINGS);
      setVerifiedSecret(null);
      setAdminSecret('');
      setFullFeedList([]);
      setChildGroupOrderMap({});
      if (settings?.providers?.length > 0) {
        setActiveProviderForModels(settings.providers[0].id);
      }
    }
  }, [isOpen, settings]);

  const existingCategories = useMemo(() => {
    const categories = new Set<string>();
    fullFeedList.forEach(feed => {
      if (feed.category) {
        const parts = feed.category.split('/');
        let path = '';
        parts.forEach(part => {
          path = path ? `${path}/${part}` : part;
          categories.add(path);
        });
      }
    });
    return Array.from(categories).sort();
  }, [fullFeedList]);

  const groupTree = useMemo(() => {
    const root: { [key: string]: GroupNode } = {};
    const ungrouped: FullSystemFeedConfig[] = [];
    
    fullFeedList.forEach(feed => {
      if (feed.category) {
        const parts = feed.category.split('/');
        let currentLevel = root;
        let currentPath = '';
        
        parts.forEach((part, index) => {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          if (!currentLevel[part]) {
            currentLevel[part] = { name: part, fullPath: currentPath, feeds: [], children: {} };
          }
          if (index === parts.length - 1) {
            currentLevel[part].feeds.push(feed);
          }
          currentLevel = currentLevel[part].children;
        });
      } else {
        ungrouped.push(feed);
      }
    });
    return { root, ungrouped };
  }, [fullFeedList]);

  const sortedGroupNames = useMemo(() => {
    const allGroups = Object.keys(groupTree.root);
    const ordered = groupOrder.filter(g => allGroups.includes(g));
    const newGroups = allGroups.filter(g => !groupOrder.includes(g)).sort();
    return [...ordered, ...newGroups];
  }, [groupTree.root, groupOrder]);

  useEffect(() => {
    const allGroups = Object.keys(groupTree.root);
    if (allGroups.length > 0 && groupOrder.length === 0) {
      setGroupOrder(allGroups.sort());
    } else {
      const newGroups = allGroups.filter(g => !groupOrder.includes(g));
      if (newGroups.length > 0) {
        setGroupOrder(prev => [...prev, ...newGroups.sort()]);
      }
    }
  }, [groupTree.root]);

  const handleTopLevelGroupReorder = (newOrder: string[]) => {
    setGroupOrder(newOrder);
    const ungroupedFeeds = fullFeedList.filter(f => !f.category);
    const groupedFeeds = fullFeedList.filter(f => f.category);
    const sortedGroupedFeeds = [...groupedFeeds].sort((a, b) => {
      const aTopCategory = a.category!.split('/')[0];
      const bTopCategory = b.category!.split('/')[0];
      const aIndex = newOrder.indexOf(aTopCategory);
      const bIndex = newOrder.indexOf(bTopCategory);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    handleDragReorder([...sortedGroupedFeeds, ...ungroupedFeeds]);
  };

  const handleChildOrderUpdate = (parentPath: string, newOrder: string[]) => {
    setChildGroupOrderMap(prev => ({ ...prev, [parentPath]: newOrder }));
    const feedsInParent = fullFeedList.filter(f => f.category && f.category.startsWith(parentPath + '/'));
    const feedsNotInParent = fullFeedList.filter(f => !f.category || !f.category.startsWith(parentPath + '/'));
    const sortedFeeds = [...feedsInParent].sort((a, b) => {
      const aChildName = a.category!.slice(parentPath.length + 1).split('/')[0];
      const bChildName = b.category!.slice(parentPath.length + 1).split('/')[0];
      const aIndex = newOrder.indexOf(aChildName);
      const bIndex = newOrder.indexOf(bChildName);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    const firstIndex = fullFeedList.findIndex(f => f.category && f.category.startsWith(parentPath + '/'));
    const newList = [...feedsNotInParent];
    newList.splice(firstIndex >= 0 ? firstIndex : newList.length, 0, ...sortedFeeds);
    handleDragReorder(newList);
  };

  const handleFeedOrderChange = (parentPath: string, newFeeds: FullSystemFeedConfig[]) => {
    const feedsNotInGroup = fullFeedList.filter(f => f.category !== parentPath);
    const firstIndex = fullFeedList.findIndex(f => f.category === parentPath);
    const newList = [...feedsNotInGroup];
    newList.splice(firstIndex >= 0 ? firstIndex : newList.length, 0, ...newFeeds);
    handleDragReorder(newList);
  };

  const handleDragReorder = async (newOrder: FullSystemFeedConfig[]) => {
    if (!verifiedSecret) return;
    setFullFeedList(newOrder);
    if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    reorderTimeoutRef.current = setTimeout(async () => {
      try {
        await reorderSystemFeeds(newOrder.map(f => f.id), verifiedSecret);
      } catch (e: any) {
        setFeedStatus({ msg: '排序保存失败: ' + e.message, type: 'error' });
        handleLoadFeeds(verifiedSecret);
      }
    }, 500);
  };

  const handleProviderTypeChange = (newType: AIProviderType) => {
    const baseUrl = newType === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://api.openai.com/v1';
    setEditForm(prev => ({ ...prev, type: newType, baseUrl }));
  };

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
      toast({
        title: "提供商已更新",
        description: `${editForm.name} 的配置已保存`,
      });
    } else {
      const newProvider: AIProvider = {
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        ...editForm
      };
      setLocalSettings(prev => ({ ...prev, providers: [...prev.providers, newProvider] }));
      toast({
        title: "提供商已添加",
        description: `${editForm.name} 已成功添加到配置列表`,
      });
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
          if (newTasks[key]?.providerId === id) newTasks[key] = null;
        });
        return { providers: prev.providers.filter(p => p.id !== id), tasks: newTasks };
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

  const handleFetchModels = async () => {
    if (!activeProviderForModels) return;
    const provider = localSettings.providers.find(p => p.id === activeProviderForModels);
    if (!provider) return;
    setIsFetchingModels(true);
    setFetchError(null);
    try {
      const models = await fetchProviderModels(provider);
      if (models.length === 0) setFetchError("未找到任何可用模型。请检查 API Key 权限或网络连接。");
      else setAvailableModels(models);
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
          return { ...p, enabledModels: exists ? current.filter(m => m !== modelId) : [...current, modelId] };
        }
        return p;
      })
    }));
  };

  const getEnabledModelsForProvider = (providerId: string) => {
    return localSettings.providers.find(p => p.id === providerId)?.enabledModels || [];
  };

  const handleModelChange = (task: keyof AISettings['tasks'], field: keyof AIModelConfig, value: string) => {
    setLocalSettings(prev => {
      const currentConfig = prev.tasks[task] || { providerId: '', modelId: '', modelName: '' };
      if (field === 'providerId') {
        if (value === '') return { ...prev, tasks: { ...prev.tasks, [task]: null } };
        return { ...prev, tasks: { ...prev.tasks, [task]: { ...currentConfig, providerId: value, modelId: '' } } };
      }
      return { ...prev, tasks: { ...prev.tasks, [task]: { ...currentConfig, [field]: value } } };
    });
  };

  const handleSaveAll = () => {
    if (!localSettings.tasks.general?.providerId || !localSettings.tasks.general?.modelId) {
      alert("必须配置「总模型」作为默认兜底。");
      return;
    }
    onSave(localSettings);
    toast({
      title: "✅ 设置已保存",
      description: "您的 API Key 和模型配置已安全保存到本地浏览器",
      variant: "default",
    });
    onClose();
  };

  const handleLoadFeeds = async (secret: string) => {
    setIsVerifying(true);
    setFeedStatus({ msg: '', type: null });
    try {
      const feeds = await fetchAllSystemFeeds(secret);
      setFullFeedList(feeds);
      setVerifiedSecret(secret);
    } catch (e: any) {
      setFeedStatus({ msg: e.message || '加载订阅源失败，请检查密钥是否正确。', type: 'error' });
      setVerifiedSecret(null);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUpsertFeed = async () => {
    if (!feedForm.id || !feedForm.url || !verifiedSecret) {
      setFeedStatus({ msg: 'ID 和 URL 是必填项。', type: 'error' });
      return;
    }
    setIsSubmittingFeed(true);
    setFeedStatus({ msg: `正在${isEditingFeed ? '更新' : '添加'}订阅源...`, type: null });
    try {
      await addSystemFeed(feedForm.id, feedForm.url, feedForm.category, feedForm.isSub, feedForm.customTitle, verifiedSecret);
      setFeedStatus({ msg: `订阅源已${isEditingFeed ? '更新' : '添加'}，列表即将刷新。`, type: 'success' });
      setFeedForm({ id: '', url: '', category: '', isSub: false, customTitle: '' });
      setIsEditingFeed(false);
      await handleLoadFeeds(verifiedSecret);
    } catch (e: any) {
      setFeedStatus({ msg: e.message || '提交订阅源失败。', type: 'error' });
    } finally {
      setIsSubmittingFeed(false);
    }
  };

  const startEditFeed = (feed: FullSystemFeedConfig) => {
    setFeedForm({ id: feed.id, url: feed.url, category: feed.category || '', isSub: feed.isSub || false, customTitle: feed.customTitle || '' });
    setIsEditingFeed(true);
    feedFormRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDeleteFeed = async (id: string) => {
    if (verifiedSecret && confirm(`确定要删除 ID 为 “${id}” 的订阅源吗？此操作无法撤销。`)) {
      setIsSubmittingFeed(true);
      setFeedStatus({ msg: '正在删除订阅源...', type: null });
      try {
        await deleteSystemFeed(id, verifiedSecret);
        setFeedStatus({ msg: '订阅源已删除，列表即将刷新。', type: 'success' });
        await handleLoadFeeds(verifiedSecret);
      } catch (e: any) {
        setFeedStatus({ msg: e.message || '删除订阅源失败。', type: 'error' });
      } finally {
        setIsSubmittingFeed(false);
      }
    }
  };

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) newSet.delete(groupName);
      else newSet.add(groupName);
      return newSet;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] md:w-full h-[90vh] md:h-[85vh] p-0 flex flex-col overflow-hidden rounded-[1.5rem] md:rounded-[2rem]">
        <DialogHeader className="px-4 md:px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            <DialogTitle className="text-xl font-black tracking-tight">偏好设置</DialogTitle>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <TabsList className="w-full md:w-48 h-auto flex flex-row md:flex-col justify-start bg-muted/30 p-2 gap-1 shrink-0 overflow-x-auto custom-scrollbar">
            <TabsTrigger value="providers" className="justify-start gap-2 px-3 md:px-4 py-2 md:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs md:text-sm">
              <Cpu className="w-4 h-4" />
              <span className="hidden md:inline">API 提供商</span>
            </TabsTrigger>
            <TabsTrigger value="models" className="justify-start gap-2 px-4 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Settings2 className="w-4 h-4" />
              <span className="hidden md:inline">模型配置</span>
            </TabsTrigger>
            <TabsTrigger value="feeds" className="justify-start gap-2 px-4 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Rss className="w-4 h-4" />
              <span className="hidden md:inline">订阅源管理</span>
            </TabsTrigger>
            <TabsTrigger value="display" className="justify-start gap-2 px-4 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Monitor className="w-4 h-4" />
              <span className="hidden md:inline">显示设置</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden relative">
            <ScrollArea className="h-full">
              <div className="p-6 md:p-8">
                {/* --- PROVIDERS TAB --- */}
                <TabsContent value="providers" className="m-0 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div>
                      <h3 className="text-lg font-bold">API 提供商</h3>
                      <p className="text-sm text-muted-foreground">配置您的 AI 连接点</p>
                    </div>
                    <Button onClick={() => startEditProvider()} className="gap-2">
                      <Plus className="w-4 h-4" />
                      添加提供商
                    </Button>
                  </div>

                  {isEditingProvider && (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader>
                        <CardTitle className="text-base">{editingProviderId ? '编辑提供商' : '新建提供商'}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>名称</Label>
                            <Input placeholder="例如: Official OpenAI" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>API 格式</Label>
                            <Select value={editForm.type} onValueChange={(v) => handleProviderTypeChange(v as AIProviderType)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="openai">OpenAI 兼容</SelectItem>
                                <SelectItem value="gemini">Gemini API</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="md:col-span-2 space-y-2">
                            <Label>接入点地址</Label>
                            <Input className="font-mono" placeholder={editForm.type === 'openai' ? 'https://api.openai.com/v1' : 'https://generativelanguage.googleapis.com'} value={editForm.baseUrl} onChange={e => setEditForm({ ...editForm, baseUrl: e.target.value })} />
                          </div>
                          <div className="md:col-span-2 space-y-2">
                            <Label>API Key</Label>
                            <Input type="password" className="font-mono" placeholder="sk-..." value={editForm.apiKey} onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })} />
                          </div>
                        </div>
                      </CardContent>
                      <DialogFooter className="p-6 pt-0">
                        <Button variant="ghost" onClick={() => setIsEditingProvider(false)}>取消</Button>
                        <Button onClick={handleSaveProvider}>保存提供商</Button>
                      </DialogFooter>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 gap-3">
                    {localSettings.providers.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/20">
                        <p className="text-sm font-medium text-muted-foreground">暂无提供商</p>
                      </div>
                    ) : (
                      localSettings.providers.map(provider => (
                        <Card key={provider.id} className="group hover:border-primary/50 transition-all">
                          <div className="p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center text-white font-black text-[10px]",
                                provider.type === 'gemini' ? 'bg-indigo-500' : 'bg-emerald-500'
                              )}>
                                {provider.type === 'gemini' ? 'GEM' : 'GPT'}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-bold text-sm truncate">{provider.name}</h4>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{provider.baseUrl}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditProvider(provider)}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteProvider(provider.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>

                {/* --- MODELS TAB --- */}
                <TabsContent value="models" className="m-0 space-y-10">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-bold">模型管理</h3>
                      <p className="text-sm text-muted-foreground">挑选并启用您需要的 AI 模型</p>
                    </div>

                    {localSettings.providers.length === 0 ? (
                      <div className="p-6 bg-muted/30 rounded-xl text-sm font-medium text-muted-foreground">请先在“API 提供商”页面添加提供商。</div>
                    ) : (
                      <Card className="overflow-hidden">
                        <div className="flex overflow-x-auto bg-muted/50 p-1 gap-1">
                          {localSettings.providers.map(p => (
                            <Button
                              key={p.id}
                              variant={activeProviderForModels === p.id ? "secondary" : "ghost"}
                              size="sm"
                              onClick={() => { setActiveProviderForModels(p.id); setAvailableModels([]); setFetchError(null); setModelSearchQuery(''); }}
                              className="rounded-lg gap-2 whitespace-nowrap"
                            >
                              <div className={cn("w-2 h-2 rounded-full", p.type === 'gemini' ? 'bg-indigo-500' : 'bg-emerald-500')} />
                              {p.name}
                            </Button>
                          ))}
                        </div>

                        {activeProviderForModels && (
                          <div className="p-6 space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <Badge variant="outline" className="w-fit">
                                {localSettings.providers.find(p => p.id === activeProviderForModels)?.type === 'gemini' ? 'Gemini API' : 'OpenAI'}
                              </Badge>
                              <Button size="sm" onClick={handleFetchModels} disabled={isFetchingModels} className="gap-2">
                                <RefreshCw className={cn("w-3.5 h-3.5", isFetchingModels && "animate-spin")} />
                                {isFetchingModels ? '正在获取...' : '刷新可用模型'}
                              </Button>
                            </div>

                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                className="pl-9"
                                placeholder="搜索模型名称..."
                                value={modelSearchQuery}
                                onChange={(e) => setModelSearchQuery(e.target.value)}
                              />
                            </div>

                            {fetchError && (
                              <div className="p-3 bg-destructive/10 text-destructive text-xs font-bold rounded-lg flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                获取失败: {fetchError}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                              {Array.from(new Set([...availableModels, ...getEnabledModelsForProvider(activeProviderForModels)]))
                                .filter(m => m.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                                .sort()
                                .map(modelId => {
                                  const isEnabled = getEnabledModelsForProvider(activeProviderForModels).includes(modelId);
                                  return (
                                    <div 
                                      key={modelId} 
                                      onClick={() => toggleEnabledModel(activeProviderForModels, modelId)}
                                      className={cn(
                                        "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all",
                                        isEnabled ? "bg-primary/5 border-primary" : "hover:bg-muted/50"
                                      )}
                                    >
                                      <span className="text-xs font-bold truncate mr-2" title={modelId}>{modelId}</span>
                                      {isEnabled && <Check className="w-4 h-4 text-primary shrink-0" />}
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </Card>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-bold">任务场景配置</h3>
                      <p className="text-sm text-muted-foreground">为不同功能指定最优模型</p>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                      <Card className="border-primary/30 bg-primary/5">
                        <CardHeader className="pb-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Cpu className="w-4 h-4 text-primary" />
                              核心总模型
                            </CardTitle>
                            <Badge className="bg-primary text-primary-foreground">必填</Badge>
                          </div>
                          <CardDescription>作为所有 AI 任务的默认兜底模型</CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase tracking-wider">提供商</Label>
                            <Select value={localSettings.tasks.general?.providerId || ''} onValueChange={v => handleModelChange('general', 'providerId', v)}>
                              <SelectTrigger>
                                <SelectValue placeholder="请选择..." />
                              </SelectTrigger>
                              <SelectContent>
                                {localSettings.providers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase tracking-wider">模型 ID</Label>
                            {localSettings.tasks.general?.providerId ? (
                              <Select value={localSettings.tasks.general.modelId || ''} onValueChange={v => handleModelChange('general', 'modelId', v)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="请选择模型..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {getEnabledModelsForProvider(localSettings.tasks.general.providerId).map(m => (
                                    <SelectItem key={m} value={m}>{m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input disabled placeholder="先选择提供商" />
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase tracking-wider">别名 (选填)</Label>
                            <Input placeholder="例如: 主力模型" value={localSettings.tasks.general?.modelName || ''} onChange={e => handleModelChange('general', 'modelName', e.target.value)} />
                          </div>
                        </CardContent>
                      </Card>

                      {[{ key: 'translation', label: 'AI 翻译', hint: '建议使用响应极快的小型模型' }, { key: 'summary', label: 'AI 总结', hint: '用于每日精华摘要生成' }, { key: 'analysis', label: 'AI 分析', hint: '执行复杂的分类与推理任务' },].map(task => {
                        const taskKey = task.key as keyof AISettings['tasks'];
                        const config = localSettings.tasks[taskKey];
                        const activeProviderId = config?.providerId || '';
                        const enabledModels = activeProviderId ? getEnabledModelsForProvider(activeProviderId) : [];

                        return (
                          <Card key={taskKey} className="hover:border-primary/20 transition-all">
                            <CardHeader className="pb-4">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-base">{task.label}</CardTitle>
                                <Badge variant="outline">可选</Badge>
                              </div>
                              <CardDescription>{task.hint}</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label className="text-[10px] uppercase tracking-wider">提供商</Label>
                                <Select value={config?.providerId || ''} onValueChange={v => handleModelChange(taskKey, 'providerId', v)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="继承总模型" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="inherit">继承总模型</SelectItem>
                                    {localSettings.providers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[10px] uppercase tracking-wider">模型 ID</Label>
                                {activeProviderId && activeProviderId !== 'inherit' ? (
                                  <Select value={config?.modelId || ''} onValueChange={v => handleModelChange(taskKey, 'modelId', v)}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="请选择..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {enabledModels.map(m => (
                                        <SelectItem key={m} value={m}>{m}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input disabled placeholder="继承自总模型" />
                                )}
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[10px] uppercase tracking-wider">别名</Label>
                                <Input placeholder="选填" value={config?.modelName || ''} onChange={e => handleModelChange(taskKey, 'modelName', e.target.value)} disabled={!activeProviderId || activeProviderId === 'inherit'} />
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>

                {/* --- FEEDS TAB --- */}
                <TabsContent value="feeds" className="m-0 space-y-8">
                  <div>
                    <h3 className="text-lg font-bold">订阅源管理</h3>
                    <p className="text-sm text-muted-foreground">配置与排序系统订阅源</p>
                  </div>

                  {!verifiedSecret ? (
                    <Card className="bg-muted/20 border-dashed border-2">
                      <CardContent className="p-10 flex flex-col items-center text-center space-y-6">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Lock className="w-6 h-6 text-primary" />
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-bold">需要管理员权限</h4>
                          <p className="text-sm text-muted-foreground">请输入管理员密钥以管理系统订阅源</p>
                        </div>
                        <div className="flex w-full max-w-sm gap-2">
                          <Input 
                            type="password" 
                            value={adminSecret} 
                            onChange={e => setAdminSecret(e.target.value)} 
                            placeholder="键入密钥以解锁" 
                            onKeyDown={e => e.key === 'Enter' && handleLoadFeeds(adminSecret)} 
                          />
                          <Button onClick={() => handleLoadFeeds(adminSecret)} disabled={isVerifying || !adminSecret}>
                            {isVerifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                          </Button>
                        </div>
                        {feedStatus.type === 'error' && <p className="text-xs font-bold text-destructive">{feedStatus.msg}</p>}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-8">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-4">
                          <CardTitle className="text-base">订阅清单</CardTitle>
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">{fullFeedList.length} Total</Badge>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden sm:inline">拖拽排序</span>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          {fullFeedList.length === 0 ? (
                            <p className="text-center text-muted-foreground py-12 text-sm">空空如也</p>
                          ) : (
                            <Reorder.Group 
                              axis="y" 
                              values={sortedGroupNames} 
                              onReorder={handleTopLevelGroupReorder}
                              className="space-y-4"
                            >
                              {sortedGroupNames.map((groupName) => {
                                const node = groupTree.root[groupName];
                                if (!node) return null;
                                return (
                                  <DraggableTopLevelGroup
                                    key={groupName}
                                    groupName={groupName}
                                    node={node}
                                    collapsedGroups={collapsedGroups}
                                    toggleGroupCollapse={toggleGroupCollapse}
                                    onEdit={startEditFeed}
                                    onDelete={handleDeleteFeed}
                                    childOrderMap={childGroupOrderMap}
                                    onChildOrderChange={handleChildOrderUpdate}
                                    onFeedOrderChange={handleFeedOrderChange}
                                  />
                                );
                              })}

                              {groupTree.ungrouped.length > 0 && (
                                <div className="border rounded-xl overflow-hidden bg-muted/20">
                                  <button
                                    onClick={() => toggleGroupCollapse('__ungrouped__')}
                                    className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", !collapsedGroups.has('__ungrouped__') && "rotate-90")} />
                                      <span className="font-bold text-xs text-muted-foreground uppercase tracking-widest">未分组</span>
                                    </div>
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold">
                                      {groupTree.ungrouped.length}
                                    </Badge>
                                  </button>
                                  
                                  <AnimatePresence initial={false}>
                                    {!collapsedGroups.has('__ungrouped__') && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                      >
                                        <Reorder.Group 
                                          axis="y" 
                                          values={groupTree.ungrouped} 
                                          onReorder={(newFeeds) => {
                                            const groupedFeeds = fullFeedList.filter(f => f.category);
                                            handleDragReorder([...groupedFeeds, ...newFeeds]);
                                          }}
                                          className="p-2 space-y-2"
                                        >
                                          {groupTree.ungrouped.map((feed) => (
                                            <DraggableNestedFeedItem
                                              key={feed.id}
                                              feed={feed}
                                              onEdit={startEditFeed}
                                              onDelete={handleDeleteFeed}
                                            />
                                          ))}
                                        </Reorder.Group>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              )}
                            </Reorder.Group>
                          )}
                        </CardContent>
                      </Card>

                      <Card ref={feedFormRef} className="border-primary/20 bg-primary/5">
                        <CardHeader>
                          <CardTitle className="text-base">{isEditingFeed ? '编辑订阅源' : '添加订阅源'}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>ID</Label>
                              <Input placeholder="例如: bang_dream_mygo" value={feedForm.id} onChange={e => setFeedForm({ ...feedForm, id: e.target.value })} disabled={isEditingFeed} />
                            </div>
                            <div className="space-y-2">
                              <Label>分类</Label>
                              <div className="relative">
                                <Input 
                                  placeholder="选择或键入..." 
                                  value={feedForm.category} 
                                  onChange={e => setFeedForm({ ...feedForm, category: e.target.value })}
                                />
                                {existingCategories.length > 0 && (
                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                    <Select onValueChange={v => setFeedForm({ ...feedForm, category: v })}>
                                      <SelectTrigger className="w-8 h-8 p-0 border-none bg-transparent">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {existingCategories.map(cat => (
                                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="md:col-span-2 space-y-2">
                              <Label>订阅源 URL</Label>
                              <Input className="font-mono" placeholder="http://.../feed.xml" value={feedForm.url} onChange={e => setFeedForm({ ...feedForm, url: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>自定义标题</Label>
                              <Input placeholder="留空则自动抓取" value={feedForm.customTitle} onChange={e => setFeedForm({ ...feedForm, customTitle: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>配置</Label>
                              <div className="flex items-center space-x-2 p-2 rounded-lg border bg-background">
                                <Switch id="is-sub" checked={feedForm.isSub} onCheckedChange={v => setFeedForm({ ...feedForm, isSub: v })} />
                                <Label htmlFor="is-sub" className="text-xs font-bold cursor-pointer">作为二级子项 (缩进显示)</Label>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                        <DialogFooter className="p-6 pt-0 flex items-center justify-between">
                          <div className="flex-1">
                            {feedStatus.msg && <p className={cn("text-xs font-bold", feedStatus.type === 'success' ? 'text-green-500' : 'text-destructive')}>{feedStatus.msg}</p>}
                          </div>
                          <div className="flex gap-2">
                            {isEditingFeed && <Button variant="ghost" onClick={() => { setFeedForm({ id: '', url: '', category: '', isSub: false, customTitle: '' }); setIsEditingFeed(false); }}>取消</Button>}
                            <Button onClick={handleUpsertFeed} disabled={isSubmittingFeed}>
                              {isSubmittingFeed ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                              {isEditingFeed ? '更新订阅源' : '创建订阅源'}
                            </Button>
                          </div>
                        </DialogFooter>
                      </Card>
                    </div>
                  )}
                </TabsContent>

                {/* --- DISPLAY TAB --- */}
                <TabsContent value="display" className="m-0 space-y-8">
                  <div>
                    <h3 className="text-lg font-bold">显示与偏好</h3>
                    <p className="text-sm text-muted-foreground">个性化您的阅读环境</p>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">媒体代理策略</CardTitle>
                      <CardDescription>如何加载受限地区的图片资源</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div 
                        onClick={() => onImageProxyModeChange?.('all')}
                        className={cn(
                          "flex flex-col gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                          imageProxyMode === 'all' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        )}
                      >
                        <div className="flex justify-between items-center">
                          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", imageProxyMode === 'all' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                            <Lock className="w-5 h-5" />
                          </div>
                          {imageProxyMode === 'all' && <Check className="w-5 h-5 text-primary" />}
                        </div>
                        <div>
                          <div className="font-bold text-sm">全面代理</div>
                          <p className="text-xs text-muted-foreground mt-1">通过服务器中转所有图片，解决网络连通性问题。</p>
                        </div>
                      </div>

                      <div 
                        onClick={() => onImageProxyModeChange?.('none')}
                        className={cn(
                          "flex flex-col gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                          imageProxyMode === 'none' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        )}
                      >
                        <div className="flex justify-between items-center">
                          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", imageProxyMode === 'none' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                            <Unlock className="w-5 h-5" />
                          </div>
                          {imageProxyMode === 'none' && <Check className="w-5 h-5 text-primary" />}
                        </div>
                        <div>
                          <div className="font-bold text-sm">直接加载</div>
                          <p className="text-xs text-muted-foreground mt-1">原图直链，不占用服务器带宽。适合网络环境优良的用户。</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </ScrollArea>
          </div>
        </Tabs>

        <DialogFooter className="px-4 md:px-6 py-4 border-t shrink-0 bg-muted/20 flex flex-row gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1 md:flex-none">取消</Button>
          <Button onClick={handleSaveAll} className="flex-1 md:flex-none md:px-8">保存所有设置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
