import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { AISettings, AIProvider, AIModelConfig, AIProviderType, ImageProxyMode } from '../types';
import { addSystemFeed, fetchAllSystemFeeds, deleteSystemFeed, reorderSystemFeeds, FullSystemFeedConfig } from '../services/rssService';
import { fetchProviderModels } from '../services/geminiService';
import { easeStandard, easeDecelerate, easeAccelerate, modalOverlay, modalContent } from './animations';

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
      className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors list-none shadow-sm"
      whileDrag={{ 
        scale: 1.02, 
        boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
        zIndex: 50
      }}
    >
      {/* Drag Handle */}
      <div 
        className="text-slate-400 shrink-0 cursor-grab active:cursor-grabbing touch-none p-1 hover:text-blue-500 transition-colors"
        onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
      >
        <DragHandleIcon />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate text-slate-800 dark:text-slate-200" title={feed.customTitle || feed.id}>
          {feed.customTitle || feed.id}
        </p>
        <p className="text-xs text-slate-400 font-mono truncate">{feed.url}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onEdit(feed)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg dark:hover:bg-blue-900/30" title="编辑">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg>
        </button>
        <button onClick={() => onDelete(feed.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg dark:hover:bg-red-900/30" title="删除">
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
    <div className={`border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden ${depth > 0 ? 'ml-4' : ''}`}>
      {/* Group Header */}
      <div
        className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors ${
          depth === 0 
            ? 'bg-slate-100 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-700' 
            : 'bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
      >
        <div className="flex items-center gap-2 flex-1">
          {/* Drag Handle for Group */}
          {dragControls && (
            <div 
              className="text-slate-400 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
            >
              <DragHandleIcon />
            </div>
          )}
          <button
            onClick={() => toggleGroupCollapse(node.fullPath)}
            className="flex items-center gap-2 flex-1"
          >
            <motion.svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 20 20" 
              fill="currentColor" 
              className="w-4 h-4 text-slate-500"
              animate={{ rotate: isCollapsed ? 0 : 90 }}
              transition={{ duration: 0.2 }}
            >
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </motion.svg>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${depth === 0 ? 'text-blue-500' : 'text-blue-400'}`}>
              <path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" />
            </svg>
            <span className={`font-semibold text-sm ${depth === 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}>
              {node.name}
            </span>
          </button>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded-full">
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
  const inputClass = "w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm placeholder:text-slate-400 dark:bg-slate-700 dark:text-white dark:border-slate-600 dark:placeholder-slate-500";
  const labelClass = "block text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wide dark:text-slate-400";

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
          className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col dark:bg-slate-800 dark:shadow-black/50"
          variants={modalContent}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
        >

          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 dark:bg-slate-900 dark:border-slate-700 shrink-0">
            <motion.h2 
              className="text-xl font-bold text-slate-800 dark:text-white"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.3, ease: easeDecelerate }}
            >
              设置
            </motion.h2>
            <motion.button 
              onClick={onClose} 
              className="p-2 hover:bg-slate-200 rounded-full text-slate-500 dark:hover:bg-slate-700 dark:text-slate-400"
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.2, ease: easeStandard }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </motion.button>
          </div>

          {/* Content Container */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

            {/* Navigation Tabs (Top on mobile, Sidebar on desktop) */}
            <div className="w-full md:w-48 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-2 md:p-4 flex flex-row md:flex-col gap-2 shrink-0 dark:bg-slate-900 dark:border-slate-700 overflow-x-auto">
              {(['providers', 'models', 'display', 'feeds'] as const).map((tab, index) => (
                <motion.button 
                  key={tab}
                  onClick={() => setActiveTab(tab)} 
                  className={`text-center md:text-left px-4 py-3 rounded-lg font-medium text-sm flex-1 md:flex-none whitespace-nowrap ${activeTab === tab ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05, duration: 0.3, ease: easeDecelerate }}
                  whileHover={{ x: 4, backgroundColor: activeTab === tab ? undefined : 'rgba(241, 245, 249, 1)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  {tab === 'providers' ? 'API 提供商' : tab === 'models' ? '模型配置' : tab === 'display' ? '显示设置' : '订阅源管理'}
                </motion.button>
              ))}
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
                        <input type="text" className={inputClass} placeholder="例如: Official OpenAI" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelClass}>API 格式</label>
                        <div className="relative">
                          <select className={`${inputClass} appearance-none cursor-pointer`} value={editForm.type} onChange={e => handleProviderTypeChange(e.target.value as AIProviderType)}>
                            <option value="openai">OpenAI 兼容</option>
                            <option value="gemini">Gemini API</option>
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></div>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className={labelClass}>接入点地址 (Base URL)</label>
                        <input type="text" className={`${inputClass} font-mono`} placeholder={editForm.type === 'openai' ? 'https://api.openai.com/v1' : 'https://generativelanguage.googleapis.com'} value={editForm.baseUrl} onChange={e => setEditForm({ ...editForm, baseUrl: e.target.value })} />
                        <p className="text-[10px] text-slate-400 mt-1.5 ml-1 dark:text-slate-500">{editForm.type === 'openai' ? '通常以 /v1 结尾' : 'Gemini 官方地址通常无需修改，除非使用反代'}</p>
                      </div>
                      <div className="md:col-span-2">
                        <label className={labelClass}>API Key</label>
                        <input type="password" className={`${inputClass} font-mono tracking-widest`} placeholder="sk-..." value={editForm.apiKey} onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })} />
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
                  <h3 className="text-lg font-bold text-slate-800 mb-2 dark:text-white">启用模型管理</h3>
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
                                {localSettings.providers.find(p => p.id === activeProviderForModels)?.type === 'gemini' ? 'Gemini API' : 'OpenAI 兼容'}
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
                              placeholder="搜索模型..."
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
                    <h3 className="text-lg font-bold text-slate-800 mb-2 dark:text-white">模型任务配置</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">为不同的任务指定使用的模型。若特定任务未配置，将默认使用「总模型」。</p>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    {/* General Model Config */}
                    <div className="bg-white p-6 rounded-xl border-l-4 border-blue-500 shadow-md dark:bg-slate-800 dark:shadow-none">
                      <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4 dark:border-slate-700">
                        <span className="bg-blue-100 text-blue-700 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider dark:bg-blue-900 dark:text-blue-300">默认</span>
                        <h4 className="font-bold text-slate-900 text-lg dark:text-white">总模型</h4><span className="text-xs text-red-500 font-medium ml-auto">* 必填</span>
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
                          <input type="text" className={inputClass} placeholder="给个好记的名字（留空则显示模型 ID）" value={localSettings.tasks.general?.modelName || ''} onChange={e => handleModelChange('general', 'modelName', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    {/* Specific Task Configs */}
                    {[{ key: 'translation', label: 'AI 翻译', hint: '建议使用速度快、成本低的小模型 (e.g. gemini-flash, gpt-4o-mini)' }, { key: 'summary', label: 'AI 总结', hint: '用于生成简单的摘要' }, { key: 'analysis', label: 'AI 分析', hint: '用于复杂的分类和深度分析任务' },].map(task => {
                      const taskKey = task.key as keyof AISettings['tasks'];
                      const config = localSettings.tasks[taskKey];
                      const activeProviderId = config?.providerId || '';
                      const enabledModels = activeProviderId ? getEnabledModelsForProvider(activeProviderId) : [];

                      return (
                        <div key={taskKey} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md dark:bg-slate-800 dark:border-slate-700">
                          <div className="flex items-center gap-2 mb-2"><span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider dark:bg-slate-700 dark:text-slate-300">可选</span><h4 className="font-bold text-slate-800 text-lg dark:text-white">{task.label}</h4></div>
                          <p className="text-xs text-slate-400 mb-6 dark:text-slate-500">{task.hint}</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div>
                              <label className={labelClass}>选择提供商</label>
                              <div className="relative">
                                <select className={`${inputClass} appearance-none cursor-pointer`} value={config?.providerId || ''} onChange={e => handleModelChange(taskKey, 'providerId', e.target.value)}>
                                  <option value="">默认（使用总模型）</option>
                                  {localSettings.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></div>
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
                                      <option value="">默认（使用总模型）</option>
                                      {enabledModels.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                      ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></div>
                                  </div>
                                ) : (
                                  <input type="text" className={inputClass} placeholder="未启用模型，请手动输入 ID" value={config?.modelId || ''} onChange={e => handleModelChange(taskKey, 'modelId', e.target.value)} disabled={!activeProviderId} />
                                )
                              ) : (
                                <input type="text" className={inputClass} disabled placeholder="请先选择提供商" />
                              )}
                            </div>
                            <div>
                              <label className={labelClass}>备注名称</label>
                              <input type="text" className={inputClass} placeholder="选填，方便记忆" value={config?.modelName || ''} onChange={e => handleModelChange(taskKey, 'modelName', e.target.value)} disabled={!activeProviderId} />
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
              <div className="space-y-6 max-w-3xl mx-auto">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">显示设置</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">配置图片加载和显示相关选项。</p>

                {/* Image Proxy Mode */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700">
                  <h4 className="font-semibold text-slate-800 dark:text-white mb-2">图片加载模式</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">选择图片的加载方式。代理模式可以帮助访问被限制的图片源，但会增加服务器流量。</p>
                  <div className="space-y-3">
                    <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${imageProxyMode === 'all' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'}`}>
                      <input
                        type="radio"
                        name="imageProxyMode"
                        value="all"
                        checked={imageProxyMode === 'all'}
                        onChange={() => onImageProxyModeChange?.('all')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-white">全部代理</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">所有图片通过服务器代理加载。适合无法直接访问 Twitter 等平台的用户。</div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${imageProxyMode === 'media_only' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'}`}>
                      <input
                        type="radio"
                        name="imageProxyMode"
                        value="media_only"
                        checked={imageProxyMode === 'media_only'}
                        onChange={() => onImageProxyModeChange?.('media_only')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-white">仅代理媒体</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">RSS 内容直连，图片/视频通过服务器代理加载。节省部分服务器流量。</div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${imageProxyMode === 'none' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'}`}>
                      <input
                        type="radio"
                        name="imageProxyMode"
                        value="none"
                        checked={imageProxyMode === 'none'}
                        onChange={() => onImageProxyModeChange?.('none')}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-white">不代理图片</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">所有图片直接加载。适合可以直接访问所有图片源的用户。</div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* --- FEEDS TAB --- */}
            {activeTab === 'feeds' && (
              <div className="space-y-6 max-w-3xl mx-auto">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">订阅源管理</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">管理系统的 RSS 订阅源。此操作需要管理员密钥。</p>

                {!verifiedSecret ? (
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700">
                    <label className={labelClass}>管理员密钥</label>
                    <div className="flex gap-2">
                      <input type="password" className={inputClass} value={adminSecret} onChange={e => setAdminSecret(e.target.value)} placeholder="输入密钥以解锁管理" onKeyDown={e => e.key === 'Enter' && handleLoadFeeds(adminSecret)} />
                      <button onClick={() => handleLoadFeeds(adminSecret)} disabled={isVerifying || !adminSecret} className="px-5 py-2.5 bg-slate-700 text-white hover:bg-slate-800 rounded-lg text-sm font-bold shadow-md disabled:opacity-50">{isVerifying ? '验证中...' : '验证'}</button>
                    </div>
                    {feedStatus.type === 'error' && <p className="text-xs text-red-500 mt-2">{feedStatus.msg}</p>}
                  </div>
                ) : (
                  <>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700">
                      <div className="flex items-center justify-between px-2 mb-3">
                        <h4 className="font-bold text-slate-800 dark:text-white">当前订阅源列表</h4>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">{fullFeedList.length} 个订阅源</span>
                          <span className="text-xs text-slate-400">拖拽排序</span>
                        </div>
                      </div>
                      
                      {fullFeedList.length === 0 ? (
                        <p className="text-center text-slate-400 py-8 text-sm">暂无订阅源</p>
                      ) : (
                        <Reorder.Group 
                          axis="y" 
                          values={sortedGroupNames} 
                          onReorder={handleTopLevelGroupReorder}
                          className="space-y-3 list-none p-0 m-0"
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
                            <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                              {/* Ungrouped Header */}
                              <button
                                onClick={() => toggleGroupCollapse('__ungrouped__')}
                                className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <motion.svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    viewBox="0 0 20 20" 
                                    fill="currentColor" 
                                    className="w-4 h-4 text-slate-500"
                                    animate={{ rotate: collapsedGroups.has('__ungrouped__') ? 0 : 90 }}
                                    transition={{ duration: 0.2 }}
                                  >
                                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                  </motion.svg>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400">
                                    <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                                  </svg>
                                  <span className="font-semibold text-sm text-slate-500 dark:text-slate-400">未分组</span>
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded-full">
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
                                        className="p-2 space-y-1 list-none m-0"
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
                    <div ref={feedFormRef} className="bg-white p-6 rounded-xl border border-slate-200 shadow-md animate-slide-in dark:bg-slate-800 dark:border-slate-700">
                      <h4 className="font-bold text-slate-800 mb-6 border-b border-slate-100 pb-3 dark:text-white dark:border-slate-700">{isEditingFeed ? '编辑订阅源' : '添加订阅源'}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                        <div><label className={labelClass}>ID (唯一标识)</label><input type="text" className={inputClass} placeholder="例如: bang_dream_mygo" value={feedForm.id} onChange={e => setFeedForm({ ...feedForm, id: e.target.value })} disabled={isEditingFeed} /></div>
                        <div ref={categoryDropdownRef} className="relative">
                          <label className={labelClass}>分类路径</label>
                          <div className="relative">
                            <input 
                              type="text" 
                              className={inputClass} 
                              placeholder="选择或输入分类..." 
                              value={feedForm.category} 
                              onChange={e => setFeedForm({ ...feedForm, category: e.target.value })}
                              onFocus={() => setShowCategoryDropdown(true)}
                            />
                            <button 
                              type="button"
                              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`}>
                                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                          
                          {/* Category Dropdown */}
                          {showCategoryDropdown && (
                            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg dark:bg-slate-700 dark:border-slate-600 max-h-60 overflow-hidden">
                              {/* New Category Input */}
                              <div className="p-2 border-b border-slate-100 dark:border-slate-600">
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-md dark:bg-slate-600 dark:border-slate-500 dark:text-white"
                                    placeholder="新建分类..."
                                    value={newCategoryInput}
                                    onChange={e => setNewCategoryInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddNewCategory()}
                                  />
                                  <button
                                    type="button"
                                    onClick={handleAddNewCategory}
                                    disabled={!newCategoryInput.trim()}
                                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    添加
                                  </button>
                                </div>
                              </div>
                              
                              {/* Existing Categories */}
                              <div className="max-h-40 overflow-y-auto">
                                {existingCategories.length > 0 ? (
                                  existingCategories.map(cat => (
                                    <button
                                      key={cat}
                                      type="button"
                                      onClick={() => handleCategorySelect(cat)}
                                      className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-2 ${feedForm.category === cat ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
                                        <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                                      </svg>
                                      <span className="truncate">{cat}</span>
                                      {feedForm.category === cat && (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-600 ml-auto shrink-0">
                                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </button>
                                  ))
                                ) : (
                                  <p className="px-3 py-4 text-center text-sm text-slate-400">暂无已有分类</p>
                                )}
                              </div>
                              
                              {/* Clear Button */}
                              {feedForm.category && (
                                <div className="p-2 border-t border-slate-100 dark:border-slate-600">
                                  <button
                                    type="button"
                                    onClick={() => handleCategorySelect('')}
                                    className="w-full px-3 py-1.5 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md dark:hover:bg-red-900/20"
                                  >
                                    清除分类
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          <p className="text-[11px] text-slate-400 mt-1.5 dark:text-slate-500">使用 <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">/</code> 分隔多级分类</p>
                        </div>
                        <div className="md:col-span-2"><label className={labelClass}>订阅源 URL</label><input type="text" className={`${inputClass} font-mono`} placeholder="http://.../feed.xml" value={feedForm.url} onChange={e => setFeedForm({ ...feedForm, url: e.target.value })} /></div>
                        <div><label className={labelClass}>自定义标题 (可选)</label><input type="text" className={inputClass} placeholder="留空则使用源标题" value={feedForm.customTitle} onChange={e => setFeedForm({ ...feedForm, customTitle: e.target.value })} /></div>
                        <div><label className={labelClass}>选项</label><label className="flex items-center gap-2 text-sm p-2"><input type="checkbox" className="w-4 h-4" checked={feedForm.isSub} onChange={e => setFeedForm({ ...feedForm, isSub: e.target.checked })} />作为子订阅源显示 (缩进样式)</label></div>
                      </div>
                      <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                        {feedStatus.msg && <p className={`text-xs mr-auto ${feedStatus.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{feedStatus.msg}</p>}
                        {isEditingFeed && <button onClick={cancelEditFeed} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium dark:text-slate-300 dark:hover:bg-slate-700">取消编辑</button>}
                        <button onClick={handleUpsertFeed} disabled={isSubmittingFeed} className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-bold shadow-md disabled:opacity-50">
                          {isSubmittingFeed ? '提交中...' : (isEditingFeed ? '更新订阅源' : '添加订阅源')}
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
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0 dark:bg-slate-900 dark:border-slate-700">
            <motion.button 
              onClick={onClose} 
              className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors dark:text-slate-300 dark:hover:bg-slate-700"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              取消
            </motion.button>
            <motion.button 
              onClick={handleSaveAll} 
              className="ml-3 px-8 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-bold shadow-md"
              whileHover={{ scale: 1.02, boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.4)' }}
              whileTap={{ scale: 0.98 }}
            >
              保存设置
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
