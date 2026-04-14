/**
 * Agent 思考动画组件
 * 显示 AI 正在思考或调用工具的状态
 */

import React, { useState, useEffect } from 'react';
import { Brain, Wrench, Loader2, Zap, Code2, Box, FileCode, Search } from 'lucide-react';
import { clsx } from 'clsx';
import './ThinkingAnimation.css';

interface ThinkingAnimationProps {
  status: 'thinking' | 'tool_call' | 'generating';
  toolName?: string;
  toolParams?: Record<string, any>;
  message?: string;
}

// 工具名称映射
const TOOL_INFO: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  'generate_3d_model': { label: '生成3D模型', icon: <Box size={14} />, color: '#3b82f6' },
  'check_3d_model_status': { label: '查询生成状态', icon: <Search size={14} />, color: '#8b5cf6' },
  'check_ue_console': { label: '检查UE控制台', icon: <Zap size={14} />, color: '#ef4444' },
  'check_unity_console': { label: '检查UE控制台', icon: <Zap size={14} />, color: '#ef4444' },
  'plan_3d_models': { label: '规划3D模型', icon: <Box size={14} />, color: '#10b981' },
  'download_model': { label: '下载模型', icon: <FileCode size={14} />, color: '#f59e0b' },
  'create_scene_layout': { label: '创建场景布局', icon: <FileCode size={14} />, color: '#10b981' },
  'generate_ue_code': { label: '生成UE代码', icon: <Code2 size={14} />, color: '#f59e0b' },
  'generate_unity_code': { label: '生成UE代码', icon: <Code2 size={14} />, color: '#f59e0b' },
  'read': { label: '读取文件', icon: <Search size={14} />, color: '#6366f1' },
  'write': { label: '写入文件', icon: <FileCode size={14} />, color: '#ec4899' },
  'bash': { label: '执行命令', icon: <Zap size={14} />, color: '#f59e0b' },
  'edit': { label: '编辑文件', icon: <Code2 size={14} />, color: '#8b5cf6' },
  'ls': { label: '浏览目录', icon: <Search size={14} />, color: '#64748b' },
  'grep': { label: '搜索内容', icon: <Search size={14} />, color: '#64748b' },
  'find': { label: '查找文件', icon: <Search size={14} />, color: '#64748b' },
  'default': { label: '处理中', icon: <Wrench size={14} />, color: '#64748b' },
};

// 思考中的动画文字
const THINKING_TEXTS = [
  '正在分析你的需求...',
  '思考最佳方案...',
  '规划生成步骤...',
  '准备调用工具...',
];

// 生成中的动画文字
const GENERATING_TEXTS = [
  '正在生成内容...',
  'AI 正在创作...',
  '处理中...',
  '即将完成...',
];

export const ThinkingAnimation: React.FC<ThinkingAnimationProps> = ({
  status,
  toolName,
  toolParams,
  message,
}) => {
  const [dots, setDots] = useState('');
  const [textIndex, setTextIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // 动态点号动画
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // 文字轮播
  useEffect(() => {
    const texts = status === 'thinking' ? THINKING_TEXTS : GENERATING_TEXTS;
    const interval = setInterval(() => {
      setTextIndex(prev => (prev + 1) % texts.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [status]);

  // 进度条动画
  useEffect(() => {
    if (status === 'generating') {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 15;
        });
      }, 500);
      return () => clearInterval(interval);
    } else {
      setProgress(0);
    }
  }, [status]);

  const getToolInfo = () => {
    if (!toolName) return TOOL_INFO['default'];
    return TOOL_INFO[toolName] || { label: toolName, icon: <Wrench size={14} />, color: '#64748b' };
  };

  // 从工具参数中提取关键信息（如文件名）
  const getToolDetail = () => {
    if (!toolParams) return null;
    switch (toolName) {
      case 'write':
      case 'read':
      case 'edit':
        return toolParams.path || toolParams.file_path || null;
      case 'bash':
        const cmd = toolParams.command || toolParams.cmd || '';
        return cmd.slice(0, 40) + (cmd.length > 40 ? '...' : '');
      case 'generate_3d_model':
        return toolParams.name || toolParams.prompt?.slice(0, 30) || null;
      case 'plan_3d_models':
        const scene = toolParams.scene_description || '';
        return scene.slice(0, 40) + (scene.length > 40 ? '...' : '');
      default:
        return null;
    }
  };

  const toolInfo = getToolInfo();
  const toolDetail = getToolDetail();
  const currentTexts = status === 'thinking' ? THINKING_TEXTS : GENERATING_TEXTS;

  return (
    <div className={clsx('thinking-animation', status)}>
      <div className="thinking-visual">
        {/* 中心图标 */}
        <div className="thinking-icon-wrapper">
          {status === 'thinking' && (
            <Brain size={28} className="brain-icon" />
          )}
          {status === 'tool_call' && (
            <div className="tool-icon" style={{ color: toolInfo.color }}>
              {toolInfo.icon}
            </div>
          )}
          {status === 'generating' && (
            <Loader2 size={28} className="loader-icon" />
          )}
          {/* 光环效果 */}
          <div className="pulse-ring"></div>
          <div className="pulse-ring delay-1"></div>
          <div className="pulse-ring delay-2"></div>
        </div>

        {/* 轨道粒子 */}
        <div className="orbit-particles">
          <div className="particle p1"></div>
          <div className="particle p2"></div>
          <div className="particle p3"></div>
        </div>
      </div>

      {/* 状态文字 */}
      <div className="thinking-status">
        {status === 'thinking' && (
          <>
            <span className="status-icon">🤔</span>
            <span className="status-text">{currentTexts[textIndex]}{dots}</span>
          </>
        )}
        {status === 'tool_call' && (
          <>
            <span className="status-icon">🔧</span>
            <span className="status-text" style={{ color: toolInfo.color }}>
              {toolInfo.label}
              {toolDetail && (
                <span className="tool-detail">: {toolDetail}</span>
              )}
            </span>
          </>
        )}
        {status === 'generating' && (
          <>
            <span className="status-icon">✨</span>
            <span className="status-text">{currentTexts[textIndex]}{dots}</span>
          </>
        )}
      </div>

      {/* 自定义消息 */}
      {message && !toolDetail && (
        <div className="custom-message">{message}</div>
      )}

      {/* 进度条 */}
      {status === 'generating' && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {/* 提示 */}
      <div className="thinking-hint">
        <Zap size={12} />
        <span>Agent 正在工作中，请稍候...</span>
      </div>
    </div>
  );
};

export default ThinkingAnimation;
