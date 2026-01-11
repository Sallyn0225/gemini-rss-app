import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { AISettings, AIProvider, AIModelConfig, AIProviderType, ImageProxyMode } from '../types';
import { addSystemFeed, fetchAllSystemFeeds, deleteSystemFeed, reorderSystemFeeds, FullSystemFeedConfig } from '../services/rssService';
import { fetchProviderModels } from '../services/geminiService';
import { easeStandard, easeDecelerate, easeAccelerate, modalOverlay, modalContent, organicContent } from './animations';


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

// Tree node structure for nested groups
interface GroupNode {
  name: string;
  fullPath: string;
  feeds: FullSystemFeedConfig[];
  children: { [key: string]: GroupNode };
}

// Drag handle icon component
const DragHandleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
  </svg>
);



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
      className="flex items-center gap-4 p-4 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-100 dark:border-stone-800 hover:border-stone-200 dark:hover:border-stone-700 transition-all list-none shadow-soft-sm"
      whileDrag={{ 
        scale: 1.02, 
        rotate: 1,
        boxShadow: "0 20px 40px -10px rgba(0,0,0,0.1)",
        zIndex: 50
      }}
    >
      {/* Drag Handle */}
      <div 
        className="text-stone-300 shrink-0 cursor-grab active:cursor-grabbing touch-none p-1 hover:text-stone-500 transition-colors"
        onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
      >
        <DragHandleIcon />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-black text-sm truncate text-stone-800 dark:text-stone-200" title={feed.customTitle || feed.id}>
          {feed.customTitle || feed.id}
        </p>
        <p className="text-[10px] text-stone-400 font-bold uppercase tracking-tighter truncate opacity-60 mt-0.5">{feed.url}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onEdit(feed)} className="p-2 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-xl dark:hover:bg-stone-700 dark:hover:text-stone-200 transition-all" title="编辑">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg>
        </button>
        <button onClick={() => onDelete(feed.id)} className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl dark:hover:bg-red-900/30 transition-all" title="删除">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg>
        </button>
      </div>
    </Reorder.Item>
  );
});
DraggableNestedFeedItem.displayName = 'DraggableNestedFeedItem';


// Recursive component for rendering nested groups with drag support
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
  
  // Get child order from map or fallback to default
  const childOrder = childOrderMap[node.fullPath] || childKeys;
  
  // Sort children by childOrder
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

  const feedOrder = node.feeds; // Internal feeds are already in the node
  const hasChildren = sortedChildKeys.length > 0;
  const hasFeeds = feedOrder.length > 0;

  const totalCount = useMemo(() => {
    const countInNode = (n: GroupNode): number => 
      n.feeds.length + Object.values(n.children).reduce((s, c) => s + countInNode(c), 0);
    return feedOrder.length + sortedChildKeys.reduce((sum, key) => sum + countInNode(node.children[key]), 0);
  }, [node, sortedChildKeys, feedOrder]);


  return (
    <div className={`border border-stone-100 dark:border-stone-800 rounded-[32px] overflow-hidden ${depth > 0 ? 'ml-6' : ''}`}>
      {/* Group Header */}
      <div
        className={`w-full flex items-center justify-between px-5 py-4 transition-all ${
          depth === 0 
            ? 'bg-stone-50/80 dark:bg-stone-800/80 hover:bg-stone-100 dark:hover:bg-stone-800' 
            : 'bg-stone-50/40 dark:bg-stone-800/40 hover:bg-stone-100/50 dark:hover:bg-stone-800/60'
        }`}
      >
        <div className="flex items-center gap-3 flex-1">
          {/* Drag Handle for Group */}
          {dragControls && (
            <div 
              className="text-stone-300 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
            >
              <DragHandleIcon />
            </div>
          )}
          <button
            onClick={() => toggleGroupCollapse(node.fullPath)}
            className="flex items-center gap-3 flex-1"
          >
            <motion.svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 20 20" 
              fill="currentColor" 
              className="w-4 h-4 text-stone-400"
              animate={{ rotate: isCollapsed ? 0 : 90 }}
              transition={{ duration: 0.2 }}
            >
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </motion.svg>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${depth === 0 ? 'text-stone-700 dark:text-stone-300' : 'text-stone-400'}`}>
              <path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" />
            </svg>
            <span className={`font-black text-sm tracking-tight ${depth === 0 ? 'text-stone-800 dark:text-stone-100' : 'text-stone-600 dark:text-stone-400'}`}>
              {node.name}
            </span>
          </button>
        </div>
        <span className="text-[10px] font-black text-stone-400 dark:text-stone-500 bg-white/60 dark:bg-stone-900/40 px-3 py-1 rounded-full border border-stone-100/50 dark:border-stone-800/50">
          {totalCount}
        </span>
      </div>

      
      {/* Group Content with Animation */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="p-2 space-y-2">
              {/* Render child groups with reorder support */}
              {hasChildren && (
                <Reorder.Group 
                  axis="y" 
                  values={sortedChildKeys} 
                  onReorder={(newOrder) => onChildOrderChange(node.fullPath, newOrder)}
                  className="space-y-2 list-none p-0 m-0"
                >
                  {sortedChildKeys.map(childKey => {
                    const childNode = node.children[childKey];
                    return (
                      <DraggableChildGroup
                        key={childNode.fullPath}
                        childKey={childKey}
                        childNode={childNode}
                        depth={depth}
                        collapsedGroups={collapsedGroups}
                        toggleGroupCollapse={toggleGroupCollapse}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        childOrderMap={childOrderMap}
                        onChildOrderChange={onChildOrderChange}
                        onFeedOrderChange={onFeedOrderChange}
                      />
                    );
                  })}
                </Reorder.Group>

              )}
              
              {/* Render feeds with reorder support */}
              {hasFeeds && (
                <Reorder.Group 
                  axis="y" 
                  values={feedOrder} 
                  onReorder={(newFeeds) => onFeedOrderChange(node.fullPath, newFeeds)}
                  className="space-y-1 list-none p-0 m-0"
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
      whileDrag={{ scale: 1.01, zIndex: 50 }}
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

// Wrapper component for draggable top-level groups
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
      whileDrag={{ scale: 1.01, zIndex: 50 }}
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



const DraggableFeedItem = React.memo<{
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
      className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
    >
      {/* Drag Handle */}
      <div 
        className="text-slate-400 shrink-0 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate text-slate-800 dark:text-slate-200" title={feed.customTitle || feed.id}>{feed.customTitle || feed.id}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {feed.category && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded dark:bg-blue-900/40 dark:text-blue-300 truncate max-w-[150px]" title={feed.category}>
              {feed.category}
            </span>
          )}
          <p className="text-xs text-slate-400 font-mono truncate">{feed.url}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onEdit(feed)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg dark:hover:bg-blue-900/30" title="编辑"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg></button>
        <button onClick={() => onDelete(feed.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg dark:hover:bg-red-900/30" title="删除"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>
      </div>
    </Reorder.Item>
  );
});
DraggableFeedItem.displayName = 'DraggableFeedItem';


export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, imageProxyMode, onImageProxyModeChange }) => {
  const [localSettings, setLocalSettings] = useState<AISettings>(settings || DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'providers' | 'models' | 'feeds' | 'display'>('providers');

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
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [childGroupOrderMap, setChildGroupOrderMap] = useState<Record<string, string[]>>({});

  // Handle top-level group reorder
  const handleTopLevelGroupReorder = (newOrder: string[]) => {
    setGroupOrder(newOrder);
    
    // Also reorder fullFeedList by the new group order
    const ungroupedFeeds = fullFeedList.filter(f => !f.category);
    const groupedFeeds = fullFeedList.filter(f => f.category);
    
    // Sort grouped feeds by new group order
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

  // Handle child group reorder - reorder feeds by their category prefix
  const handleChildOrderChange = (parentPath: string, newOrder: string[]) => {
    // Get all feeds sorted by the new child order
    const feedsInParent = fullFeedList.filter(f => 
      f.category && f.category.startsWith(parentPath + '/')
    );
    const feedsNotInParent = fullFeedList.filter(f => 
      !f.category || !f.category.startsWith(parentPath + '/')
    );
    
    // Sort feedsInParent by newOrder
    const sortedFeeds = [...feedsInParent].sort((a, b) => {
      // Extract the immediate child name from category
      const aChildName = a.category!.slice(parentPath.length + 1).split('/')[0];
      const bChildName = b.category!.slice(parentPath.length + 1).split('/')[0];
      const aIndex = newOrder.indexOf(aChildName);
      const bIndex = newOrder.indexOf(bChildName);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    
    // Find position of first feed in parent group
    const firstIndex = fullFeedList.findIndex(f => 
      f.category && f.category.startsWith(parentPath + '/')
    );
    
    // Rebuild list
    const newList = [...feedsNotInParent];
    newList.splice(firstIndex >= 0 ? firstIndex : newList.length, 0, ...sortedFeeds);
    
    handleDragReorder(newList);
  };

  // Reorder children within a parent group (state only)
  const handleChildOrderUpdate = (parentPath: string, newOrder: string[]) => {
    setChildGroupOrderMap(prev => ({
      ...prev,
      [parentPath]: newOrder
    }));
    handleChildOrderChange(parentPath, newOrder);
  };

  const handleFeedOrderChange = (parentPath: string, newFeeds: FullSystemFeedConfig[]) => {
    // Get all feeds that belong to this exact category path
    const feedsInGroup = fullFeedList.filter(f => f.category === parentPath);
    const feedsNotInGroup = fullFeedList.filter(f => f.category !== parentPath);
    
    // Find position of first feed in this group
    const firstIndex = fullFeedList.findIndex(f => f.category === parentPath);
    
    // Rebuild list with new order
    const newList = [...feedsNotInGroup];
    newList.splice(firstIndex >= 0 ? firstIndex : newList.length, 0, ...newFeeds);
    
    handleDragReorder(newList);
  };

  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [feedStatus, setFeedStatus] = useState<{ msg: string, type: 'success' | 'error' | null }>({ msg: '', type: null });
  const [isSubmittingFeed, setIsSubmittingFeed] = useState(false);

  // Refs for smooth scrolling
  const taskConfigRef = useRef<HTMLDivElement>(null);
  const feedFormRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings || DEFAULT_SETTINGS);
      // Reset feed management state on open
      setVerifiedSecret(null);
      setAdminSecret('');
      setFullFeedList([]);
      setChildGroupOrderMap({});


      // Select first provider for models tab if exists
      if (settings?.providers?.length > 0) {
        setActiveProviderForModels(settings.providers[0].id);
      }
    }
  }, [isOpen, settings]);

  // Extract existing categories from feed list
  const existingCategories = useMemo(() => {
    const categories = new Set<string>();
    fullFeedList.forEach(feed => {
      if (feed.category) {
        // Add the full path and all parent paths
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

  // Build tree structure for nested groups
  const groupTree = useMemo(() => {
    const root: { [key: string]: GroupNode } = {};
    const ungrouped: FullSystemFeedConfig[] = [];
    
    fullFeedList.forEach(feed => {
      if (feed.category) {
        const parts = feed.category.split('/');
        let currentLevel = root;
        let currentPath = '';
        
        // Build nested structure
        parts.forEach((part, index) => {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          
          if (!currentLevel[part]) {
            currentLevel[part] = {
              name: part,
              fullPath: currentPath,
              feeds: [],
              children: {}
            };
          }
          
          // If this is the last part, add the feed here
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

  // Get sorted top-level group names based on groupOrder
  const sortedGroupNames = useMemo(() => {
    const allGroups = Object.keys(groupTree.root);
    // Include groups in order, then any new groups not in the order yet
    const ordered = groupOrder.filter(g => allGroups.includes(g));
    const newGroups = allGroups.filter(g => !groupOrder.includes(g)).sort();
    return [...ordered, ...newGroups];
  }, [groupTree.root, groupOrder]);

  // Update groupOrder when new groups appear
  useEffect(() => {
    const allGroups = Object.keys(groupTree.root);
    if (allGroups.length > 0 && groupOrder.length === 0) {
      setGroupOrder(allGroups.sort());
    } else {
      // Add any new groups that aren't in groupOrder
      const newGroups = allGroups.filter(g => !groupOrder.includes(g));
      if (newGroups.length > 0) {
        setGroupOrder(prev => [...prev, ...newGroups.sort()]);
      }
    }
  }, [groupTree.root]);

  // Toggle group collapse state
  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  // Handle ungrouped feeds reorder
  const handleUngroupedOrderChange = (newFeeds: FullSystemFeedConfig[]) => {
    const groupedFeeds = fullFeedList.filter(f => f.category);
    handleDragReorder([...groupedFeeds, ...newFeeds]);
  };

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  if (!isOpen) return null;

  // --- Provider Handlers ---
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
      alert("必须配置「总模型」作为默认兜底。");
      return;
    }
    onSave(localSettings);
    onClose();
  };

  // --- Feed Handlers ---
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

  const cancelEditFeed = () => {
    setFeedForm({ id: '', url: '', category: '', isSub: false, customTitle: '' });
    setIsEditingFeed(false);
  }

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



  // Drag-and-drop reorder handler
  const handleDragReorder = async (newOrder: FullSystemFeedConfig[]) => {
    if (!verifiedSecret) return;
    
    // Optimistic update
    setFullFeedList(newOrder);

    // Debounce the API call to avoid overloading the backend and causing race conditions
    if (reorderTimeoutRef.current) {
      clearTimeout(reorderTimeoutRef.current);
    }

    reorderTimeoutRef.current = setTimeout(async () => {
      try {
        await reorderSystemFeeds(newOrder.map(f => f.id), verifiedSecret);
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        setFeedStatus({ msg: '排序保存失败: ' + errorMessage, type: 'error' });
        // Revert on failure
        await handleLoadFeeds(verifiedSecret);
      }
    }, 500); // 500ms debounce
  };


  // Category selection handler
  const handleCategorySelect = (category: string) => {
    setFeedForm({ ...feedForm, category });
    setShowCategoryDropdown(false);
    setNewCategoryInput('');
  };

  const handleAddNewCategory = () => {
    if (newCategoryInput.trim()) {
      setFeedForm({ ...feedForm, category: newCategoryInput.trim() });
      setShowCategoryDropdown(false);
      setNewCategoryInput('');
    }
  };

  // Common Styles
  const inputClass = "w-full bg-stone-100/50 text-stone-900 border border-transparent rounded-2xl px-5 py-3 text-sm focus:bg-white focus:ring-4 focus:ring-stone-200/50 outline-none transition-all shadow-inner placeholder:text-stone-400 dark:bg-stone-800/50 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:bg-stone-800";
  const labelClass = "block text-[11px] font-bold text-stone-400 uppercase mb-2 ml-1 tracking-widest dark:text-stone-500";


  return (
    <AnimatePresence>
      <motion.div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        variants={modalOverlay}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={onClose}
      >
        <motion.div 
          className="bg-white/80 backdrop-blur-xl w-full max-w-4xl h-[85vh] rounded-[40px] shadow-soft-2xl overflow-hidden flex flex-col dark:bg-stone-900/90 dark:shadow-black/20 border border-white/40 dark:border-stone-800/50"
          variants={organicContent}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
        >


          {/* Header */}
          <div className="px-8 py-6 flex justify-between items-center shrink-0">
            <motion.h2 
              className="text-2xl font-black text-stone-800 dark:text-stone-100 tracking-tight"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.3, ease: easeDecelerate }}
            >
              Preferences
            </motion.h2>
            <motion.button 
              onClick={onClose} 
              className="p-3 bg-stone-100 hover:bg-stone-200 rounded-full text-stone-500 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-400 transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </motion.button>
          </div>


          {/* Content Container */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

            {/* Navigation Tabs (Top on mobile, Sidebar on desktop) */}
            <div className="w-full md:w-56 p-4 flex flex-row md:flex-col gap-1.5 shrink-0 overflow-x-auto">
              {(['providers', 'models', 'display', 'feeds'] as const).map((tab, index) => (
                <motion.button 
                  key={tab}
                  onClick={() => setActiveTab(tab)} 
                  className={`px-5 py-3.5 rounded-2xl font-bold text-sm flex-1 md:flex-none whitespace-nowrap transition-all ${
                    activeTab === tab 
                      ? 'bg-stone-800 text-stone-100 shadow-lg dark:bg-stone-100 dark:text-stone-900' 
                      : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
                  }`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05, duration: 0.3, ease: easeDecelerate }}
                  whileTap={{ scale: 0.96 }}
                >
                  {tab === 'providers' ? 'API 提供商' : tab === 'models' ? '模型配置' : tab === 'display' ? '显示设置' : '订阅源管理'}
                </motion.button>
              ))}
            </div>


          {/* Main Panel */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">


            {/* --- PROVIDERS TAB --- */}
            {activeTab === 'providers' && (
              <div className="space-y-6 max-w-3xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                  <div>
                    <h3 className="text-xl font-black text-stone-800 dark:text-stone-100">API 提供商</h3>
                    <p className="text-sm text-stone-400 font-medium">配置您的 AI 连接点</p>
                  </div>
                  <button onClick={() => startEditProvider()} className="w-full sm:w-auto px-6 py-3 bg-stone-800 text-stone-100 rounded-2xl text-sm font-bold hover:bg-stone-700 flex justify-center items-center gap-2 shadow-xl shadow-stone-200/50 dark:bg-stone-100 dark:text-stone-900 dark:shadow-none transition-all hover:-translate-y-0.5 active:translate-y-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                    添加提供商
                  </button>
                </div>

                {isEditingProvider && (
                  <div className="bg-white/50 p-8 rounded-[32px] border border-stone-100 shadow-soft-xl mb-10 animate-slide-in dark:bg-stone-800/30 dark:border-stone-700">
                    <h4 className="font-black text-stone-800 mb-8 text-lg dark:text-stone-100">
                      {editingProviderId ? '编辑提供商' : '新建提供商'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                      <div>
                        <label className={labelClass}>名称</label>
                        <input type="text" className={inputClass} placeholder="例如: Official OpenAI" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelClass}>API 格式</label>
                        <div className="relative">
                          <select className={`${inputClass} appearance-none cursor-pointer`} value={editForm.type} onChange={e => handleProviderTypeChange(e.target.value as AIProviderType)}>
                            <option value="openai">OpenAI 兼容</option>
                            <option value="gemini">Gemini API</option>
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-stone-400"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg></div>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className={labelClass}>接入点地址</label>
                        <input type="text" className={`${inputClass} font-mono`} placeholder={editForm.type === 'openai' ? 'https://api.openai.com/v1' : 'https://generativelanguage.googleapis.com'} value={editForm.baseUrl} onChange={e => setEditForm({ ...editForm, baseUrl: e.target.value })} />
                      </div>
                      <div className="md:col-span-2">
                        <label className={labelClass}>API Key</label>
                        <input type="password" className={`${inputClass} font-mono tracking-widest`} placeholder="sk-..." value={editForm.apiKey} onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-4 pt-6">
                      <button onClick={() => setIsEditingProvider(false)} className="px-6 py-3 text-stone-500 hover:bg-stone-100 rounded-2xl text-sm font-bold transition-all dark:hover:bg-stone-800">取消</button>
                      <button onClick={handleSaveProvider} className="px-8 py-3 bg-stone-800 text-white hover:bg-black rounded-2xl text-sm font-bold shadow-xl shadow-stone-200/50 dark:bg-stone-100 dark:text-stone-900 dark:shadow-none transition-all">保存提供商</button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4">
                  {localSettings.providers.length === 0 ? (
                    <div className="text-center py-20 text-stone-400 border-4 border-dashed border-stone-100 rounded-[40px] bg-stone-50/50 dark:bg-stone-800/20 dark:border-stone-800">
                      <p className="font-bold">暂无提供商</p>
                      <p className="text-xs mt-2 opacity-60">添加一个提供商以开始使用 AI 功能</p>
                    </div>
                  ) : (
                    localSettings.providers.map(provider => (
                      <div key={provider.id} className="group flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-white/50 border border-stone-100 rounded-[32px] hover:shadow-soft-lg hover:bg-white transition-all gap-6 dark:bg-stone-800/30 dark:border-stone-700 dark:hover:bg-stone-800/50">
                        <div className="flex items-center gap-5">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xs shadow-xl rotate-3 group-hover:rotate-0 transition-transform ${provider.type === 'gemini' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                            {provider.type === 'gemini' ? 'GEM' : 'GPT'}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-black text-stone-800 text-lg dark:text-stone-100 truncate">{provider.name}</h4>
                            <p className="text-xs text-stone-400 font-bold mt-1 uppercase tracking-tight truncate max-w-[240px]">{provider.baseUrl}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEditProvider(provider)} className="p-3 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-full dark:hover:bg-stone-700 dark:hover:text-stone-100 transition-all"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg></button>
                          <button onClick={() => handleDeleteProvider(provider.id)} className="p-3 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

              </div>
            )}

            {/* --- MODELS TAB --- */}
            {activeTab === 'models' && (
              <div className="space-y-12 max-w-4xl mx-auto pb-10">

                {/* 1. SELECT ENABLED MODELS SECTION */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-black text-stone-800 dark:text-stone-100">模型管理</h3>
                    <p className="text-sm text-stone-400 font-medium">挑选并启用您需要的 AI 模型</p>
                  </div>

                  {localSettings.providers.length === 0 ? (
                    <div className="p-6 bg-stone-100/50 text-stone-500 rounded-[32px] text-sm font-bold dark:bg-stone-800/30">请先在“API 提供商”页面添加提供商。</div>
                  ) : (
                    <div className="bg-white/40 rounded-[40px] border border-stone-100 shadow-soft-xl overflow-hidden dark:bg-stone-800/20 dark:border-stone-800">
                      {/* Provider Tabs */}
                      <div className="flex overflow-x-auto bg-stone-50/50 dark:bg-stone-900/50 p-3 gap-2">
                        {localSettings.providers.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { setActiveProviderForModels(p.id); setAvailableModels([]); setFetchError(null); setModelSearchQuery(''); }}
                            className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-3 ${activeProviderForModels === p.id ? 'bg-white text-stone-800 shadow-soft-md dark:bg-stone-800 dark:text-stone-100' : 'text-stone-400 hover:text-stone-600 dark:text-stone-500'}`}
                          >
                            <span className={`w-2.5 h-2.5 rounded-full ${p.type === 'gemini' ? 'bg-indigo-500' : 'bg-emerald-500'}`}></span>
                            {p.name}
                          </button>
                        ))}
                      </div>

                      {/* Active Provider Config Area */}
                      {activeProviderForModels && (
                        <div className="p-8">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
                            <h4 className="font-black text-stone-700 dark:text-stone-200 flex items-center gap-3">
                              <span className="text-xs px-3 py-1 bg-stone-100 rounded-full text-stone-500 dark:bg-stone-800 dark:text-stone-400 uppercase tracking-widest font-bold">
                                {localSettings.providers.find(p => p.id === activeProviderForModels)?.type === 'gemini' ? 'Gemini API' : 'OpenAI'}
                              </span>
                            </h4>
                            <button
                              onClick={handleFetchModels}
                              disabled={isFetchingModels}
                              className="w-full sm:w-auto px-6 py-3 bg-stone-800 text-stone-100 text-sm font-bold rounded-2xl hover:bg-black transition-all disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 shadow-lg shadow-stone-200/50 dark:shadow-none"
                            >
                              {isFetchingModels ? '正在获取...' : '刷新可用模型'}
                            </button>
                          </div>

                          {/* Search Box */}
                          <div className="relative mb-8">
                            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                            </div>
                            <input
                              type="text"
                              className={`${inputClass} pl-14`}
                              placeholder="搜索模型名称..."
                              value={modelSearchQuery}
                              onChange={(e) => setModelSearchQuery(e.target.value)}
                            />
                          </div>

                          {fetchError && (
                            <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm font-bold rounded-2xl dark:bg-red-900/20 dark:text-red-400">
                              获取失败: {fetchError}
                            </div>
                          )}

                          {/* Render Available Models */}
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto custom-scrollbar p-1">
                              {Array.from(new Set([...availableModels, ...getEnabledModelsForProvider(activeProviderForModels)]))
                                .filter(m => m.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                                .sort()
                                .map(modelId => {
                                  const isEnabled = getEnabledModelsForProvider(activeProviderForModels).includes(modelId);
                                  return (
                                    <label key={modelId} className={`group flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${isEnabled ? 'bg-stone-800 border-stone-800 dark:bg-stone-100 dark:border-stone-100' : 'bg-stone-50/50 border-transparent hover:border-stone-200 dark:bg-stone-800/50 dark:hover:border-stone-700'}`}>
                                      <div className="relative flex items-center justify-center">
                                        <input
                                          type="checkbox"
                                          className="peer hidden"
                                          checked={isEnabled}
                                          onChange={() => toggleEnabledModel(activeProviderForModels, modelId)}
                                        />
                                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isEnabled ? 'bg-white border-white dark:bg-stone-900 dark:border-stone-900' : 'border-stone-200 bg-white dark:bg-stone-800 dark:border-stone-700'}`}>
                                          {isEnabled && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${isEnabled ? 'text-stone-800 dark:text-stone-100' : ''}`}><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                        </div>
                                      </div>
                                      <span className={`text-sm font-bold truncate ${isEnabled ? 'text-white dark:text-stone-900' : 'text-stone-600 dark:text-stone-400'}`} title={modelId}>
                                        {modelId}
                                      </span>
                                    </label>
                                  );
                                })}
                            </div>

                            <div className="mt-8 pt-6 border-t border-stone-100 dark:border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-6">
                              <span className="text-xs font-black text-stone-400 uppercase tracking-widest">
                                已启用 {getEnabledModelsForProvider(activeProviderForModels).length} 个模型
                              </span>
                              <button
                                onClick={() => taskConfigRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                className="px-6 py-3 bg-stone-100 text-stone-800 text-sm font-bold rounded-2xl hover:bg-stone-200 transition-all dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700 flex items-center gap-3"
                              >
                                下一步：配置具体任务
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.59L7.28 9.28a.75.75 0 00-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l3.25-3.25a.75.75 0 10-1.06-1.06l-1.97 1.97V6.75z" clipRule="evenodd" /></svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. TASK CONFIGURATION SECTION */}
                <div className="space-y-8" ref={taskConfigRef}>
                  <div>
                    <h3 className="text-xl font-black text-stone-800 dark:text-stone-100">任务场景配置</h3>
                    <p className="text-sm text-stone-400 font-medium">为不同功能指定最优模型</p>
                  </div>

                  <div className="grid grid-cols-1 gap-8">
                    {/* General Model Config */}
                    <div className="bg-white/60 p-8 rounded-[40px] border border-stone-100 shadow-soft-xl dark:bg-stone-800/20 dark:border-stone-800 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-2 h-full bg-stone-800 dark:bg-stone-100"></div>
                      <div className="flex items-center gap-3 mb-10">
                        <span className="bg-stone-800 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest dark:bg-white dark:text-stone-900">Default</span>
                        <h4 className="font-black text-stone-900 text-xl dark:text-stone-100">核心总模型</h4>
                        <span className="text-[10px] text-red-500 font-black uppercase tracking-widest ml-auto">Required</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div>
                          <label className={labelClass}>提供商</label>
                          <div className="relative">
                            <select className={`${inputClass} appearance-none cursor-pointer`} value={localSettings.tasks.general?.providerId || ''} onChange={e => handleModelChange('general', 'providerId', e.target.value)}>
                              <option value="">请选择...</option>
                              {localSettings.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-stone-400"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg></div>
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>模型 ID</label>
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
                                <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-stone-400"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg></div>
                              </div>
                            ) : (
                              <input type="text" className={inputClass} placeholder="手动输入 ID" value={localSettings.tasks.general.modelId || ''} onChange={e => handleModelChange('general', 'modelId', e.target.value)} />
                            )
                          ) : (
                            <input type="text" className={inputClass} disabled placeholder="先选择提供商" />
                          )}
                        </div>
                        <div>
                          <label className={labelClass}>别名 (选填)</label>
                          <input type="text" className={inputClass} placeholder="例如: 主力模型" value={localSettings.tasks.general?.modelName || ''} onChange={e => handleModelChange('general', 'modelName', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    {/* Specific Task Configs */}
                    {[{ key: 'translation', label: 'AI 翻译', hint: '建议使用响应极快的小型模型' }, { key: 'summary', label: 'AI 总结', hint: '用于每日精华摘要生成' }, { key: 'analysis', label: 'AI 分析', hint: '执行复杂的分类与推理任务' },].map(task => {
                      const taskKey = task.key as keyof AISettings['tasks'];
                      const config = localSettings.tasks[taskKey];
                      const activeProviderId = config?.providerId || '';
                      const enabledModels = activeProviderId ? getEnabledModelsForProvider(activeProviderId) : [];

                      return (
                        <div key={taskKey} className="group bg-white/40 p-8 rounded-[40px] border border-stone-100 hover:shadow-soft-lg transition-all dark:bg-stone-800/10 dark:border-stone-800">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="bg-stone-100 text-stone-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest dark:bg-stone-800 dark:text-stone-500">Optional</span>
                            <h4 className="font-black text-stone-800 text-lg dark:text-stone-100">{task.label}</h4>
                          </div>
                          <p className="text-xs text-stone-400 font-medium mb-8 ml-1">{task.hint}</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div>
                              <label className={labelClass}>提供商</label>
                              <div className="relative">
                                <select className={`${inputClass} appearance-none cursor-pointer`} value={config?.providerId || ''} onChange={e => handleModelChange(taskKey, 'providerId', e.target.value)}>
                                  <option value="">继承总模型</option>
                                  {localSettings.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-stone-400"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg></div>
                              </div>
                            </div>
                            <div>
                              <label className={labelClass}>模型 ID</label>
                              {activeProviderId ? (
                                enabledModels.length > 0 ? (
                                  <div className="relative">
                                    <select
                                      className={`${inputClass} appearance-none cursor-pointer`}
                                      value={config?.modelId || ''}
                                      onChange={e => handleModelChange(taskKey, 'modelId', e.target.value)}
                                    >
                                      <option value="">请选择...</option>
                                      {enabledModels.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                      ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-stone-400"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg></div>
                                  </div>
                                ) : (
                                  <input type="text" className={inputClass} placeholder="手动输入 ID" value={config?.modelId || ''} onChange={e => handleModelChange(taskKey, 'modelId', e.target.value)} />
                                )
                              ) : (
                                <input type="text" className={inputClass} disabled placeholder="继承自总模型" />
                              )}
                            </div>
                            <div>
                              <label className={labelClass}>别名</label>
                              <input type="text" className={inputClass} placeholder="选填" value={config?.modelName || ''} onChange={e => handleModelChange(taskKey, 'modelName', e.target.value)} disabled={!activeProviderId} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}


            {/* --- DISPLAY TAB --- */}
            {activeTab === 'display' && (
              <div className="space-y-10 max-w-3xl mx-auto">
                <div>
                  <h3 className="text-xl font-black text-stone-800 dark:text-stone-100">显示与偏好</h3>
                  <p className="text-sm text-stone-400 font-medium">个性化您的阅读环境</p>
                </div>

                {/* Image Proxy Mode */}
                <div className="bg-white/40 p-8 rounded-[40px] border border-stone-100 shadow-soft-xl dark:bg-stone-800/20 dark:border-stone-800">
                  <h4 className="font-black text-stone-800 dark:text-stone-100 mb-2">媒体代理策略</h4>
                  <p className="text-xs text-stone-400 font-medium mb-8">如何加载受限地区的图片资源</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className={`flex flex-col gap-3 p-6 rounded-[32px] border-2 cursor-pointer transition-all ${imageProxyMode === 'all' ? 'border-stone-800 bg-stone-50 dark:border-stone-100 dark:bg-stone-800' : 'border-transparent bg-stone-100/50 hover:border-stone-200 dark:bg-stone-800/30'}`}>
                      <div className="flex justify-between items-center">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${imageProxyMode === 'all' ? 'bg-stone-800 text-white dark:bg-white dark:text-stone-900' : 'bg-white text-stone-300 dark:bg-stone-700'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
                        </div>
                        <input
                          type="radio"
                          name="imageProxyMode"
                          value="all"
                          checked={imageProxyMode === 'all'}
                          onChange={() => onImageProxyModeChange?.('all')}
                          className="peer hidden"
                        />
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${imageProxyMode === 'all' ? 'border-stone-800 bg-stone-800 dark:border-stone-100 dark:bg-stone-100' : 'border-stone-200'}`}>
                          {imageProxyMode === 'all' && <div className="w-2 h-2 rounded-full bg-white dark:bg-stone-900" />}
                        </div>
                      </div>
                      <div>
                        <div className={`font-black text-sm ${imageProxyMode === 'all' ? 'text-stone-800 dark:text-stone-100' : 'text-stone-500'}`}>全面代理</div>
                        <div className="text-[11px] font-medium text-stone-400 mt-1 leading-relaxed">通过服务器中转所有图片，解决网络连通性问题。</div>
                      </div>
                    </label>
                    <label className={`flex flex-col gap-3 p-6 rounded-[32px] border-2 cursor-pointer transition-all ${imageProxyMode === 'none' ? 'border-stone-800 bg-stone-50 dark:border-stone-100 dark:bg-stone-800' : 'border-transparent bg-stone-100/50 hover:border-stone-200 dark:bg-stone-800/30'}`}>
                      <div className="flex justify-between items-center">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${imageProxyMode === 'none' ? 'bg-stone-800 text-white dark:bg-white dark:text-stone-900' : 'bg-white text-stone-300 dark:bg-stone-700'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M13.5 4.938a7 7 0 11-9.006 1.737c.202-.257.59-.218.793.039.278.351.603.674.97.962.233.183.268.526.048.746l-.74.74c-.218.218-.544.21-.735-.02a5 5 0 106.275-4.417c.098.348.02.694-.228.942l-.741.741c-.22.22-.563.255-.746.048a3.501 3.501 0 01-.962-.97c-.257-.203-.296-.59-.039-.793a7 7 0 011.737-9.006zM10 10a1 1 0 011 1v4a1 1 0 11-2 0v-4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                        </div>
                        <input
                          type="radio"
                          name="imageProxyMode"
                          value="none"
                          checked={imageProxyMode === 'none'}
                          onChange={() => onImageProxyModeChange?.('none')}
                          className="peer hidden"
                        />
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${imageProxyMode === 'none' ? 'border-stone-800 bg-stone-800 dark:border-stone-100 dark:bg-stone-100' : 'border-stone-200'}`}>
                          {imageProxyMode === 'none' && <div className="w-2 h-2 rounded-full bg-white dark:bg-stone-900" />}
                        </div>
                      </div>
                      <div>
                        <div className={`font-black text-sm ${imageProxyMode === 'none' ? 'text-stone-800 dark:text-stone-100' : 'text-stone-500'}`}>直接加载</div>
                        <div className="text-[11px] font-medium text-stone-400 mt-1 leading-relaxed">原图直链，不占用服务器带宽。适合网络环境优良的用户。</div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}


            {/* --- FEEDS TAB --- */}
            {activeTab === 'feeds' && (
              <div className="space-y-10 max-w-3xl mx-auto pb-10">
                <div>
                  <h3 className="text-xl font-black text-stone-800 dark:text-stone-100">订阅源管理</h3>
                  <p className="text-sm text-stone-400 font-medium">配置与排序系统订阅源</p>
                </div>

                {!verifiedSecret ? (
                  <div className="bg-white/40 p-10 rounded-[40px] border border-stone-100 shadow-soft-xl dark:bg-stone-800/20 dark:border-stone-800">
                    <label className={labelClass}>管理员密钥</label>
                    <div className="flex gap-4">
                      <input type="password" className={inputClass} value={adminSecret} onChange={e => setAdminSecret(e.target.value)} placeholder="键入密钥以解锁" onKeyDown={e => e.key === 'Enter' && handleLoadFeeds(adminSecret)} />
                      <button onClick={() => handleLoadFeeds(adminSecret)} disabled={isVerifying || !adminSecret} className="px-8 py-3.5 bg-stone-800 text-white hover:bg-black rounded-2xl text-sm font-black shadow-xl shadow-stone-200/50 disabled:opacity-50 transition-all">{isVerifying ? '验证中...' : '解锁'}</button>
                    </div>
                    {feedStatus.type === 'error' && <p className="text-xs font-bold text-red-500 mt-4 ml-1">{feedStatus.msg}</p>}
                  </div>
                ) : (
                  <>
                    <div className="bg-white/40 p-8 rounded-[40px] border border-stone-100 shadow-soft-xl dark:bg-stone-800/20 dark:border-stone-800">
                      <div className="flex items-center justify-between px-4 mb-8">
                        <h4 className="font-black text-stone-800 dark:text-stone-100">订阅清单</h4>
                        <div className="flex items-center gap-6">
                          <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{fullFeedList.length} Total</span>
                          <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest hidden sm:inline">Drag to sort</span>
                        </div>
                      </div>
                      
                      {fullFeedList.length === 0 ? (
                        <p className="text-center text-stone-300 py-16 font-bold text-sm">空空如也</p>
                      ) : (
                        <Reorder.Group 
                          axis="y" 
                          values={sortedGroupNames} 
                          onReorder={handleTopLevelGroupReorder}
                          className="space-y-6 list-none p-0 m-0"
                        >

                        {/* Grouped Feeds using NestedGroupItem */}
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

                          
                          {/* Ungrouped Feeds */}
                          {groupTree.ungrouped.length > 0 && (
                            <div className="border border-stone-100 dark:border-stone-800 rounded-[32px] overflow-hidden">
                              {/* Ungrouped Header */}
                              <button
                                onClick={() => toggleGroupCollapse('__ungrouped__')}
                                className="w-full flex items-center justify-between px-5 py-4 bg-stone-50/50 dark:bg-stone-800/20 hover:bg-stone-100/50 transition-all"
                              >
                                <div className="flex items-center gap-3">
                                  <motion.svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    viewBox="0 0 20 20" 
                                    fill="currentColor" 
                                    className="w-4 h-4 text-stone-300"
                                    animate={{ rotate: collapsedGroups.has('__ungrouped__') ? 0 : 90 }}
                                    transition={{ duration: 0.2 }}
                                  >
                                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                  </motion.svg>
                                  <span className="font-black text-sm text-stone-400 uppercase tracking-widest">未分组</span>
                                </div>
                                 <span className="text-[10px] font-black text-stone-400 bg-white/60 dark:bg-stone-800/60 px-3 py-1 rounded-full border border-stone-100/50 dark:border-stone-800/50">
                                  {groupTree.ungrouped.length}
                                </span>
                              </button>
                              
                              {/* Ungrouped Content with Animation */}
                              <AnimatePresence initial={false}>
                                {!collapsedGroups.has('__ungrouped__') && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                                    className="overflow-hidden"
                                  >
                                      <Reorder.Group 
                                        axis="y" 
                                        values={groupTree.ungrouped} 
                                        onReorder={handleUngroupedOrderChange}
                                        className="p-4 space-y-2 list-none m-0"
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
                    </div>
                    <div ref={feedFormRef} className="bg-white/60 p-10 rounded-[40px] border border-stone-100 shadow-soft-xl animate-slide-in dark:bg-stone-800/20 dark:border-stone-800">
                      <h4 className="font-black text-stone-800 mb-10 text-xl dark:text-stone-100">{isEditingFeed ? '编辑订阅源' : '添加订阅源'}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                        <div><label className={labelClass}>ID</label><input type="text" className={inputClass} placeholder="例如: bang_dream_mygo" value={feedForm.id} onChange={e => setFeedForm({ ...feedForm, id: e.target.value })} disabled={isEditingFeed} /></div>
                        <div ref={categoryDropdownRef} className="relative">
                          <label className={labelClass}>分类</label>
                          <div className="relative">
                            <input 
                              type="text" 
                              className={inputClass} 
                              placeholder="选择或键入..." 
                              value={feedForm.category} 
                              onChange={e => setFeedForm({ ...feedForm, category: e.target.value })}
                              onFocus={() => setShowCategoryDropdown(true)}
                            />
                            <button 
                              type="button"
                              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                              className="absolute right-5 top-1/2 -translate-y-1/2 p-1 text-stone-300 hover:text-stone-500"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`}>
                                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                          
                          {/* Category Dropdown */}
                          {showCategoryDropdown && (
                            <div className="absolute z-20 mt-3 w-full bg-white/95 backdrop-blur-xl border border-stone-100 rounded-[32px] shadow-soft-2xl dark:bg-stone-800/95 dark:border-stone-700 max-h-72 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                              {/* New Category Input */}
                              <div className="p-4 border-b border-stone-50 dark:border-stone-800">
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    className="flex-1 px-4 py-2 text-sm bg-stone-100/50 border-transparent rounded-xl focus:bg-white transition-all dark:bg-stone-900/50 dark:text-stone-100"
                                    placeholder="新建..."
                                    value={newCategoryInput}
                                    onChange={e => setNewCategoryInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddNewCategory()}
                                  />
                                  <button
                                    type="button"
                                    onClick={handleAddNewCategory}
                                    disabled={!newCategoryInput.trim()}
                                    className="px-4 py-2 text-xs font-black bg-stone-800 text-white rounded-xl hover:bg-black disabled:opacity-30 transition-all"
                                  >
                                    OK
                                  </button>
                                </div>
                              </div>
                              
                              {/* Existing Categories */}
                              <div className="max-h-48 overflow-y-auto p-2 custom-scrollbar">
                                {existingCategories.length > 0 ? (
                                  existingCategories.map(cat => (
                                    <button
                                      key={cat}
                                      type="button"
                                      onClick={() => handleCategorySelect(cat)}
                                      className={`w-full px-4 py-3 text-left text-sm rounded-2xl transition-all flex items-center gap-3 ${feedForm.category === cat ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900' : 'text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-800/50'}`}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 shrink-0 ${feedForm.category === cat ? 'text-stone-400' : 'text-stone-200'}`}>
                                        <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                                      </svg>
                                      <span className="truncate font-bold">{cat}</span>
                                    </button>
                                  ))
                                ) : (
                                  <p className="px-4 py-6 text-center text-xs font-bold text-stone-300 uppercase tracking-widest">No categories</p>
                                )}
                              </div>
                              
                              {/* Clear Button */}
                              {feedForm.category && (
                                <div className="p-3 border-t border-stone-50 dark:border-stone-800">
                                  <button
                                    type="button"
                                    onClick={() => handleCategorySelect('')}
                                    className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-stone-400 hover:text-red-500 transition-all"
                                  >
                                    Clear Selection
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="md:col-span-2"><label className={labelClass}>订阅源 URL</label><input type="text" className={`${inputClass} font-mono`} placeholder="http://.../feed.xml" value={feedForm.url} onChange={e => setFeedForm({ ...feedForm, url: e.target.value })} /></div>
                        <div><label className={labelClass}>自定义标题</label><input type="text" className={inputClass} placeholder="留空则自动抓取" value={feedForm.customTitle} onChange={e => setFeedForm({ ...feedForm, customTitle: e.target.value })} /></div>
                        <div>
                          <label className={labelClass}>配置</label>
                          <label className="flex items-center gap-4 text-sm font-bold text-stone-600 p-4 bg-stone-50/50 rounded-2xl cursor-pointer hover:bg-stone-100 transition-all dark:bg-stone-900/30 dark:text-stone-300">
                            <input type="checkbox" className="w-5 h-5 rounded-lg border-2 border-stone-200 text-stone-800 focus:ring-0" checked={feedForm.isSub} onChange={e => setFeedForm({ ...feedForm, isSub: e.target.checked })} />
                            作为二级子项 (缩进显示)
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end items-center gap-4 pt-6">
                        {feedStatus.msg && <p className={`text-xs font-bold mr-auto ${feedStatus.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>{feedStatus.msg}</p>}
                        {isEditingFeed && <button onClick={cancelEditFeed} className="px-6 py-3 text-stone-500 hover:bg-stone-100 rounded-2xl text-sm font-bold transition-all dark:hover:bg-stone-800">取消</button>}
                        <button onClick={handleUpsertFeed} disabled={isSubmittingFeed} className="px-10 py-3.5 bg-stone-800 text-white hover:bg-black rounded-2xl text-sm font-black shadow-xl shadow-stone-200/50 disabled:opacity-30 transition-all">
                          {isSubmittingFeed ? 'Processing...' : (isEditingFeed ? 'Update Feed' : 'Create Feed')}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}


            </div>
          </div>

          {/* Footer */}
          <div className="px-10 py-8 flex justify-end shrink-0 gap-4">
            <motion.button 
              onClick={onClose} 
              className="px-8 py-3.5 text-stone-500 hover:bg-stone-100 rounded-2xl text-sm font-bold transition-all dark:hover:bg-stone-800"
              whileTap={{ scale: 0.96 }}
            >
              取消
            </motion.button>
            <motion.button 
              onClick={handleSaveAll} 
              className="px-10 py-3.5 bg-stone-800 text-stone-100 hover:bg-black rounded-2xl text-sm font-black shadow-2xl shadow-stone-200/50 dark:bg-stone-100 dark:text-stone-900 dark:shadow-none transition-all"
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              保存所有设置
            </motion.button>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
