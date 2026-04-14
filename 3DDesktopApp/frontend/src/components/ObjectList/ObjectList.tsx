import React from 'react';
import { Box, Sparkles, Clock, CheckCircle, XCircle, ChevronRight, Download } from 'lucide-react';
import { clsx } from 'clsx';
import './ObjectList.css';

export interface RecommendedObject {
  id: string;
  name: string;
  description: string;
  estimatedSize?: {
    x: number;
    y: number;
    z: number;
  };
  priority: number;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  modelUrl?: string | null;
  category?: 'furniture' | 'building' | 'nature' | 'prop' | 'character';
  tags?: string[];
}

interface ObjectListProps {
  objects: RecommendedObject[];
  onGenerateObject?: (objectId: string) => void;
  onSelectObject?: (object: RecommendedObject) => void;
  onDownloadObject?: (object: RecommendedObject) => void;
  disabled?: boolean;
  showCategories?: boolean;
  compact?: boolean;
}

const CATEGORY_CONFIG = {
  furniture: {
    label: '家具',
    icon: <Box className="w-4 h-4" />,
    color: '#3b82f6',
  },
  building: {
    label: '建筑',
    icon: <Box className="w-4 h-4" />,
    color: '#8b5cf6',
  },
  nature: {
    label: '自然',
    icon: <Sparkles className="w-4 h-4" />,
    color: '#10b981',
  },
  prop: {
    label: '道具',
    icon: <Box className="w-4 h-4" />,
    color: '#f59e0b',
  },
  character: {
    label: '角色',
    icon: <Sparkles className="w-4 h-4" />,
    color: '#ec4899',
  },
};

const STATUS_CONFIG = {
  pending: {
    label: '等待生成',
    icon: <Clock className="w-4 h-4" />,
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    borderColor: 'rgba(107, 114, 128, 0.3)',
  },
  generating: {
    label: '生成中...',
    icon: <Clock className="w-4 h-4 animate-spin" />,
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  ready: {
    label: '已完成',
    icon: <CheckCircle className="w-4 h-4" />,
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  failed: {
    label: '生成失败',
    icon: <XCircle className="w-4 h-4" />,
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
};

interface ObjectCardProps {
  object: RecommendedObject;
  onGenerate?: () => void;
  onSelect?: () => void;
  onDownload?: () => void;
  disabled?: boolean;
  showCategory?: boolean;
  compact?: boolean;
}

const ObjectCard: React.FC<ObjectCardProps> = ({
  object,
  onGenerate,
  onSelect,
  onDownload,
  disabled = false,
  showCategory = false,
  compact = false,
}) => {
  const statusConfig = STATUS_CONFIG[object.status];
  const categoryConfig = object.category
    ? CATEGORY_CONFIG[object.category]
    : null;

  const canGenerate = (object.status === 'pending' || object.status === 'failed') && !disabled;
  const canSelect = object.status === 'ready' && !disabled;
  const canDownload = object.status === 'ready' && !!object.modelUrl && !disabled;

  if (compact) {
    return (
      <div
        className={clsx('object-card compact', object.status)}
        onClick={canSelect ? onSelect : undefined}
        style={{ cursor: canSelect ? 'pointer' : undefined }}
      >
        <div className="compact-header">
          <Box size={14} className="compact-icon" />
          <span className="compact-name" title={object.name}>{object.name}</span>
          <div className="compact-status-dot" style={{ backgroundColor: statusConfig.color }} />
        </div>
        <div className="compact-actions">
          {canSelect && (
            <button className="compact-btn" onClick={(e) => { e.stopPropagation(); onSelect?.(); }} title="预览">
              <ChevronRight size={14} />
            </button>
          )}
          {canDownload && (
            <button className="compact-btn" onClick={(e) => { e.stopPropagation(); onDownload?.(); }} title="下载">
              <Download size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx('object-card', {
        'object-card-generating': object.status === 'generating',
        'object-card-ready': object.status === 'ready',
        'object-card-failed': object.status === 'failed',
      })}
    >
      {/* 头部：名称和优先级 */}
      <div className="object-card-header">
        <div className="object-card-title">
          <h4 className="object-card-name">{object.name}</h4>
          {categoryConfig && showCategory && (
            <span
              className="object-card-category-badge"
              style={{ backgroundColor: `${categoryConfig.color}20` }}
            >
              {categoryConfig.icon}
              <span>{categoryConfig.label}</span>
            </span>
          )}
        </div>
      </div>

      {/* 描述 */}
      <p className="object-card-description">{object.description}</p>

      {/* 状态指示 */}
      <div
        className="object-card-status"
        style={{
          backgroundColor: statusConfig.bgColor,
          borderColor: statusConfig.borderColor,
        }}
      >
        <span style={{ color: statusConfig.color }}>
          {statusConfig.icon}
        </span>
        <span style={{ color: statusConfig.color }}>
          {statusConfig.label}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="object-card-actions">
        {canGenerate && onGenerate && (
          <button
            className="object-card-button object-card-button-generate"
            onClick={onGenerate}
          >
            <Sparkles className="w-4 h-4" />
            生成 3D 模型
          </button>
        )}
        {canSelect && onSelect && (
          <button
            className="object-card-button object-card-button-select"
            onClick={onSelect}
          >
            <Box className="w-4 h-4" />
            查看模型
          </button>
        )}
        {canDownload && onDownload && (
          <button
            className="object-card-button object-card-button-download"
            onClick={onDownload}
          >
            <Download className="w-4 h-4" />
            下载模型
          </button>
        )}
      </div>
    </div>
  );
};

export const ObjectList: React.FC<ObjectListProps> = ({
  objects,
  onGenerateObject,
  onSelectObject,
  onDownloadObject,
  disabled = false,
  showCategories = true,
  compact = false,
}) => {
  if (objects.length === 0) {
    return (
      <div className="object-list-empty">
        <Box className="w-12 h-12" />
        <p>暂无推荐物品</p>
        <p className="text-sm text-text-secondary">
          在聊天中与 AI 对话以获取物品推荐
        </p>
      </div>
    );
  }

  // 按分类分组
  const groupedObjects = showCategories
    ? objects.reduce((acc, obj) => {
        const category = obj.category || 'prop';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(obj);
        return acc;
      }, {} as Record<string, RecommendedObject[]>)
    : null;

  // 统计信息
  const stats = {
    total: objects.length,
    pending: objects.filter((o) => o.status === 'pending').length,
    generating: objects.filter((o) => o.status === 'generating').length,
    ready: objects.filter((o) => o.status === 'ready').length,
    failed: objects.filter((o) => o.status === 'failed').length,
  };

  return (
    <div className={clsx('object-list', compact && 'compact')}>

      {/* 统计信息 */}
      <div className="object-list-stats">
        <div className="object-list-stat">
          <span className="object-list-stat-value">{stats.total}</span>
          <span className="object-list-stat-label">总数</span>
        </div>
        <div className="object-list-stat">
          <span className="object-list-stat-value" style={{ color: '#6b7280' }}>
            {stats.pending}
          </span>
          <span className="object-list-stat-label">等待</span>
        </div>
        <div className="object-list-stat">
          <span className="object-list-stat-value" style={{ color: '#f59e0b' }}>
            {stats.generating}
          </span>
          <span className="object-list-stat-label">生成中</span>
        </div>
        <div className="object-list-stat">
          <span className="object-list-stat-value" style={{ color: '#10b981' }}>
            {stats.ready}
          </span>
          <span className="object-list-stat-label">已完成</span>
        </div>
      </div>

      {/* 物品列表 */}
      {groupedObjects ? (
        // 按分类显示
        Object.entries(groupedObjects).map(([category, categoryObjects]) => {
          const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
          return (
            <div key={category} className="object-list-category">
              <div className="object-list-category-header">
                <span
                  style={{ color: config?.color }}
                  className="object-list-category-icon"
                >
                  {config?.icon}
                </span>
                <h3 className="object-list-category-title">{config?.label}</h3>
                <span className="object-list-category-count">
                  {categoryObjects.length}
                </span>
              </div>
              <div className="object-list-grid">
                {categoryObjects.map((obj) => (
                  <ObjectCard
                    key={obj.id}
                    object={obj}
                    onGenerate={
                      onGenerateObject
                        ? () => onGenerateObject(obj.id)
                        : undefined
                    }
                    onSelect={
                      onSelectObject
                        ? () => onSelectObject(obj)
                        : undefined
                    }
                    onDownload={
                      onDownloadObject
                        ? () => onDownloadObject(obj)
                        : undefined
                    }
                    disabled={disabled}
                    showCategory={showCategories}
                    compact={compact}
                  />
                ))}
              </div>
            </div>
          );
        })
      ) : (
        // 简单列表
        <div className="object-list-grid">
          {objects.map((obj) => (
            <ObjectCard
              key={obj.id}
              object={obj}
              onGenerate={
                onGenerateObject ? () => onGenerateObject(obj.id) : undefined
              }
              onSelect={
                onSelectObject ? () => onSelectObject(obj) : undefined
              }
              onDownload={
                onDownloadObject ? () => onDownloadObject(obj) : undefined
              }
              disabled={disabled}
              showCategory={showCategories}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
};
