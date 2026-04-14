import React from 'react';

/**
 * 模型预览组件（可选）
 * 用于显示小型的3D模型预览
 */
export const ModelPreview: React.FC = () => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-surface rounded-xl border border-gray-600">
      <div className="text-center text-text-secondary">
        <p className="text-sm">模型预览</p>
        <p className="text-xs mt-1">功能开发中...</p>
      </div>
    </div>
  );
};