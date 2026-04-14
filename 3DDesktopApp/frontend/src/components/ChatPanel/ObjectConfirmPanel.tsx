/**
 * 物件确认面板 - 用户手动选择要生成的3D物件
 * 解决 AI 生成 3D 成本高的问题
 */

import React, { useState } from 'react';
import { Box, CheckCircle, Circle, Sparkles, AlertTriangle, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import './ObjectConfirmPanel.css';

export interface ObjectToConfirm {
  id: string;
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedTokens?: number;
  category?: string;
}

interface ObjectConfirmPanelProps {
  objects: ObjectToConfirm[];
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
  onModify?: (objects: ObjectToConfirm[]) => void;
  isLoading?: boolean;
}

export const ObjectConfirmPanel: React.FC<ObjectConfirmPanelProps> = ({
  objects,
  onConfirm,
  onCancel,
  onModify,
  isLoading = false,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(objects.filter(o => o.priority === 'high').map(o => o.id))
  );
  const [selectAll, setSelectAll] = useState(false);

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
    setSelectAll(newSet.size === objects.length);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(objects.map(o => o.id)));
    }
    setSelectAll(!selectAll);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return '高优先';
      case 'medium': return '中优先';
      case 'low': return '低优先';
      default: return '';
    }
  };

  const totalTokens = objects
    .filter(o => selectedIds.has(o.id))
    .reduce((sum, o) => sum + (o.estimatedTokens || 100), 0);

  return (
    <div className="object-confirm-panel">
      <div className="confirm-header">
        <div className="confirm-title">
          <Box size={20} />
          <span>确认生成物件</span>
        </div>
        <div className="confirm-warning">
          <AlertTriangle size={14} />
          <span>3D 生成消耗较高，请确认需要的物件</span>
        </div>
      </div>

      <div className="confirm-toolbar">
        <button 
          className={clsx('select-all-btn', { active: selectAll })}
          onClick={toggleSelectAll}
        >
          {selectAll ? <CheckCircle size={16} /> : <Circle size={16} />}
          <span>全选 ({selectedIds.size}/{objects.length})</span>
        </button>
        <div className="estimated-cost">
          <Zap size={14} />
          <span>预估消耗: ~{totalTokens} tokens</span>
        </div>
      </div>

      <div className="objects-list">
        {objects.map((obj) => {
          const isSelected = selectedIds.has(obj.id);
          return (
            <div 
              key={obj.id}
              className={clsx('object-item', { selected: isSelected })}
              onClick={() => toggleSelect(obj.id)}
            >
              <div className="object-checkbox">
                {isSelected ? (
                  <CheckCircle size={20} className="checked" />
                ) : (
                  <Circle size={20} className="unchecked" />
                )}
              </div>
              <div className="object-info">
                <div className="object-name">
                  <Sparkles size={14} />
                  <span>{obj.name}</span>
                  <span 
                    className="priority-badge"
                    style={{ color: getPriorityColor(obj.priority) }}
                  >
                    {getPriorityLabel(obj.priority)}
                  </span>
                </div>
                <div className="object-description">{obj.description}</div>
                {obj.category && (
                  <div className="object-category">{obj.category}</div>
                )}
              </div>
              <div className="object-cost">
                ~{obj.estimatedTokens || 100} tokens
              </div>
            </div>
          );
        })}
      </div>

      <div className="confirm-actions">
        <button 
          className="cancel-btn" 
          onClick={onCancel}
          disabled={isLoading}
        >
          取消
        </button>
        {onModify && (
          <button 
            className="modify-btn" 
            onClick={() => onModify(objects)}
            disabled={isLoading}
          >
            修改列表
          </button>
        )}
        <button 
          className="confirm-btn" 
          onClick={() => onConfirm(Array.from(selectedIds))}
          disabled={selectedIds.size === 0 || isLoading}
        >
          {isLoading ? (
            <>
              <span className="spinner"></span>
              <span>生成中...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>确认生成 ({selectedIds.size} 个)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ObjectConfirmPanel;
