import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send,
  RefreshCw,
  Lightbulb,
  Code2,
  ChevronDown,
  ChevronUp,
  MessageSquarePlus,
  History,
  Square,
  Settings,
  X,
  FolderOpen,
  Check,
  Wrench,
  Box,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ChatHistorySidebar, HistoryItem } from '../ChatHistorySidebar/ChatHistorySidebar';
import { ThinkingAnimation } from './ThinkingAnimation';
import './ChatPanel.css';

const API_BASE_URL = 'http://localhost:8000';
const AGENT_URL = 'http://localhost:3001';

// ===== 类型 =====

interface ToolInfo {
  name: string;
  label?: string;
  description?: string;
}

// 消息事件类型 - 支持按顺序显示
type MessageEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string; result: string; isComplete: boolean; partialResult?: string };

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string; // 兼容旧格式
  timestamp: Date;
  reasoning?: string;
  events?: MessageEvent[]; // 新格式：按顺序的事件列表
  isLatest?: boolean; // 是否为最新消息（用于样式区分）
}

interface AgentStatus {
  phase: 'idle' | 'thinking' | 'tool_call' | 'generating';
  toolName?: string;
  toolParams?: Record<string, any>;
  message?: string;
}

interface ModelPlan {
  name: string;
  prompt: string;
}

interface ChatPanelProps {
  disabled?: boolean;
  sessionId: string;
  onReset?: () => void;
  history: HistoryItem[];
  onSelectSession: (sessionId: string) => void;
  onRefreshHistory?: () => void;
  agentCwd?: string;
  onCwdChange?: (cwd: string) => void;
  /** 当 Agent 规划出 3D 物品清单时调用 */
  onPlanObjects?: (objects: Array<{ name: string; description: string }>) => void;
  /** 需要发送给 Agent 的系统通知消息（如所有模型生成完成） */
  notifyMessage?: string | null;
  /** 当通知消息被处理后调用，用于清除通知 */
  onNotifyHandled?: () => void;
}

// ===== 选项解析 =====

interface ParsedOption {
  value: string;
  label: string;
}

interface ParsedOptions {
  type: string;
  options: ParsedOption[];
}

/**
 * 解析 <!--OPTIONS:type=xxx-->...<!--/OPTIONS--> 格式的选项
 * 返回: { type, options: [{ value, label }] } 或 null
 * 
 * 支持多种格式变体（容错处理）：
 * - 标准：<!--OPTION:value=xxx-->label<!--/OPTION-->
 * - 变体1：<!--OPTION:value=xxx">label（Agent 可能错误使用 " 代替 -->）
 * - 变体2：<!--OPTION:value=xxx-->label（缺少结束标签）
 */
const parseOptions = (text: string): { options: ParsedOptions; cleanText: string } | null => {
  const optionsMatch = text.match(/<!--OPTIONS:type=(\w+)-->([\s\S]*?)<!--\/OPTIONS-->/);
  if (!optionsMatch) return null;

  const type = optionsMatch[1];
  const optionsText = optionsMatch[2];
  const options: ParsedOption[] = [];

  // 标准格式：<!--OPTION:value=xxx-->label<!--/OPTION-->
  const standardRegex = /<!--OPTION:value=(.*?)-->([\s\S]*?)<!--\/OPTION-->/g;
  // 变体格式1：Agent 错误使用 " 代替 -->（如 <!--OPTION:value=xxx">label）
  const variantRegex1 = /<!--OPTION:value=([^"\s>]+)">([\s\S]*?)(?:<!--\/OPTION-->|$)/g;
  // 变体格式2：缺少结束标签（如 <!--OPTION:value=xxx-->label）
  const variantRegex2 = /<!--OPTION:value=(.*?)-->([\s\S]*?)(?=<!--OPTION:value=|<!--\/OPTIONS-->|$)/g;

  let match;
  
  // 先尝试标准格式
  while ((match = standardRegex.exec(optionsText)) !== null) {
    options.push({
      value: match[1],
      label: match[2].trim(),
    });
  }

  // 如果标准格式匹配失败，尝试变体1
  if (options.length === 0) {
    while ((match = variantRegex1.exec(optionsText)) !== null) {
      options.push({
        value: match[1],
        label: match[2].trim(),
      });
    }
  }

  // 如果仍然失败，尝试变体2
  if (options.length === 0) {
    while ((match = variantRegex2.exec(optionsText)) !== null) {
      options.push({
        value: match[1],
        label: match[2].trim(),
      });
    }
  }

  if (options.length === 0) return null;

  // 移除选项标记后的文本
  const cleanText = text.replace(/<!--OPTIONS:type=\w+-->[\s\S]*?<!--\/OPTIONS-->/, '').trim();

  return { options: { type, options }, cleanText };
};

// ===== Markdown =====

interface SimpleMarkdownProps {
  content: string;
  onOptionClick?: (value: string, type: string) => void;
  disabled?: boolean;
}

const SimpleMarkdown: React.FC<SimpleMarkdownProps> = ({ content, onOptionClick, disabled }) => {
  // 先解析选项
  const parsedResult = parseOptions(content);
  const displayContent = parsedResult?.cleanText ?? content;
  const options = parsedResult?.options;

  const parts = displayContent.split(/(```[\s\S]*?```)/);

  return (
    <div className="markdown-content">
      {parts.map((part, pIdx) => {
        if (part.startsWith('```')) {
          const code = part.replace(/```(\w+)?\n?/, '').replace(/```$/, '');
          return (
            <pre key={pIdx} className="code-block">
              <code>{code}</code>
            </pre>
          );
        }
        const lines = part.split('\n');
        return lines.map((line, idx) => {
          if (!line.trim() && idx > 0) return <div key={`${pIdx}-${idx}`} className="empty-line" />;
          if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            return (
              <li key={`${pIdx}-${idx}`} className="list-item">
                {renderInline(line.trim().substring(2))}
              </li>
            );
          }
          const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
          if (numMatch) {
            return (
              <div key={`${pIdx}-${idx}`} className="list-item numbered">
                <span className="number">{numMatch[1]}.</span>
                {renderInline(numMatch[2])}
              </div>
            );
          }
          return (
            <p key={`${pIdx}-${idx}`} className="paragraph">
              {renderInline(line)}
            </p>
          );
        });
      })}
      {/* 渲染选项按钮 */}
      {options && options.options.length > 0 && (
        <div className="options-container">
          {options.options.map((opt, idx) => (
            <button
              key={idx}
              className="option-button"
              onClick={() => onOptionClick?.(opt.value, options.type)}
              disabled={disabled}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const renderInline = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

// ===== 工具结果美化 =====
const ToolResultDisplay: React.FC<{ result: string }> = ({ result }) => {
  let parsed: unknown = null;
  try { parsed = JSON.parse(result); } catch { /* not json */ }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const tools = (obj.tools as Array<{ name?: string; description?: string }>) || [];
    if (Array.isArray(tools) && tools.length > 0 && tools[0]?.name) {
      return (
        <div className="tool-result-list">
          {tools.map((tool, idx) => (
            <div key={idx} className="tool-result-item">
              <span className="tool-result-name">{tool.name}</span>
              {tool.description && <span className="tool-result-desc">{tool.description}</span>}
            </div>
          ))}
        </div>
      );
    }
    if (obj.files && Array.isArray(obj.files)) {
      return (
        <div className="tool-result-list">
          {(obj.files as string[]).map((file, idx) => (
            <div key={idx} className="tool-result-file">📄 {file}</div>
          ))}
        </div>
      );
    }
    if (obj.directories && Array.isArray(obj.directories)) {
      return (
        <div className="tool-result-list">
          {(obj.directories as string[]).map((dir, idx) => (
            <div key={idx} className="tool-result-dir">📁 {dir}</div>
          ))}
        </div>
      );
    }
    if ('success' in obj) {
      return (
        <div className={obj.success ? 'tool-result-success' : 'tool-result-error'}>
          {obj.success ? '✅ 执行成功' : `❌ ${obj.error || '执行失败'}`}
          {obj.message !== undefined && <div className="tool-result-msg">{String(obj.message)}</div>}
          {obj.path !== undefined && <div className="tool-result-path">📍 {String(obj.path)}</div>}
        </div>
      );
    }
  }

  if (parsed) {
    const jsonStr = JSON.stringify(parsed, null, 2);
    return <pre className="tool-call-result json">{jsonStr.length > 500 ? jsonStr.slice(0, 500) + '\n...' : jsonStr}</pre>;
  }

  return <pre className="tool-call-result">{result.length > 300 ? result.slice(0, 300) + '...' : result}</pre>;
};

// ===== 3D 模型清单确认面板 =====

// ===== 主组件 =====

export const ChatPanel: React.FC<ChatPanelProps> = ({
  disabled = false,
  sessionId,
  onReset,
  history,
  onSelectSession,
  onRefreshHistory: _onRefreshHistory,
  agentCwd,
  onCwdChange,
  onPlanObjects,
  notifyMessage,
  onNotifyHandled,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ phase: 'idle' });
  const [cwd, setCwd] = useState(agentCwd || localStorage.getItem('agent-cwd') || '');
  const [toolInfoMap, setToolInfoMap] = useState<Record<string, ToolInfo>>({});
  const confirmedPlansRef = useRef<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // 用 ref 追踪当前 sessionId，避免 saveSessionToBackend 闭包问题
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // 获取工具列表
  useEffect(() => {
    const fetchTools = async () => {
      try {
        const res = await fetch(`${AGENT_URL}/api/tools`);
        const data = await res.json();
        if (data.tools && Array.isArray(data.tools)) {
          const map: Record<string, ToolInfo> = {};
          data.tools.forEach((t: ToolInfo) => {
            if (t.name) map[t.name] = t;
          });
          setToolInfoMap(map);
        }
      } catch { /* ignore */ }
    };
    fetchTools();
  }, []);

  // 检查 Agent 并自动创建会话
  // 注意：依赖 sessionId，确保每个聊天会话都有独立的 Agent 会话
  useEffect(() => {
    // 清理旧 Agent 会话
    setAgentSessionId(null);

    (async () => {
      try {
        const healthRes = await fetch(`${API_BASE_URL}/api/agent/health`);
        const health = await healthRes.json();
        if (health.status !== 'ok') return;

        const res = await fetch(`${API_BASE_URL}/api/agent/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: `web-${Date.now()}`, cwd: cwd || undefined }),
        });
        const data = await res.json();
        if (data.success) setAgentSessionId(data.sessionId);
      } catch { /* Agent 未启动 */ }
    })();
  }, [cwd, sessionId]);

  // 加载历史消息（优先从后端数据库加载）
  useEffect(() => {
    let cancelled = false;

    // 立即重置状态，防止旧会话数据残留
    setMessages([]);
    setIsProcessing(false);
    setAgentStatus({ phase: 'idle' });
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    (async () => {
      let loaded: Message[] = [];
      let loadedFromBackend = false;

      // 尝试从后端加载
      try {
        const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`);
        if (res.ok) {
          const detail = await res.json();
          if (detail.session?.messages && Array.isArray(detail.session.messages) && detail.session.messages.length > 0) {
            loaded = detail.session.messages.map((m: any) => ({
              ...m,
              timestamp: new Date(m.timestamp),
              isLatest: false,
            }));
            loadedFromBackend = true;
            // 缓存到 localStorage
            localStorage.setItem(`chat-messages-${sessionId}`, JSON.stringify(loaded));
          }
        }
      } catch { /* 后端不可用，降级到 localStorage */ }

      // 降级到 localStorage
      if (!loadedFromBackend) {
        const saved = localStorage.getItem(`chat-messages-${sessionId}`);
        if (saved) {
          try {
            loaded = JSON.parse(saved).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp), isLatest: false }));
            loadedFromBackend = true;
          } catch { /* ignore */ }
        }
      }

      // 如果 sessionId 已切换，丢弃本次加载结果
      if (cancelled) return;

      if (loadedFromBackend && loaded.length > 0) {
        // 标记最后一个 assistant 消息为最新
        const lastAssistantIdx = loaded.map((m: Message) => m.role).lastIndexOf('assistant');
        if (lastAssistantIdx >= 0) {
          loaded[lastAssistantIdx].isLatest = true;
        }
        setMessages(loaded);
      } else {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: `👋 你好！我是 **3DClaw**，By Juaeg。

我可以帮你：
- 🏠 **生成3D场景** - 描述你想要的场景，我来帮你生成3D模型
- 🔧 **编写代码** - 创建、编辑、运行代码
- 📁 **操作文件** - 读写文件、浏览目录
- 🤖 **执行命令** - 运行终端命令

💡 试试告诉我：*帮我创建一个教室场景*`,
          timestamp: new Date(),
          isLatest: true,
        }]);
      }
    })();

    return () => { cancelled = true; };
  }, [sessionId]);

  // 持久化到 localStorage（使用 ref 获取最新 sessionId）
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`chat-messages-${sessionIdRef.current}`, JSON.stringify(messages));
    }
  }, [messages]);

  // 保存会话到后端数据库（含自动生成标题）
  const saveSessionToBackend = useCallback(async (msgs: Message[]) => {
    try {
      // 过滤掉 welcome 消息
      const realMsgs = msgs.filter(m => m.id !== 'welcome' && m.role !== undefined);
      if (realMsgs.length === 0) return;

      // 使用 ref 获取最新的 sessionId，避免闭包过期问题
      const currentSessionId = sessionIdRef.current;

      // 自动生成标题：取第一条用户消息的前20个字符
      const firstUserMsg = realMsgs.find(m => m.role === 'user');
      const autoTitle = firstUserMsg
        ? (firstUserMsg.content || '').slice(0, 20).replace(/\n/g, ' ') || '新对话'
        : '新对话';

      await fetch(`${API_BASE_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          user_id: 'default_user',
          title: autoTitle,
          messages: realMsgs.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
            reasoning: m.reasoning || '',
            events: m.events || [],
          })),
        }),
      });

      // 通知父组件刷新历史列表
      _onRefreshHistory?.();
    } catch (e) {
      console.warn('[ChatPanel] Failed to save session:', e);
    }
  }, [_onRefreshHistory]);

  // 自动滚动
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, isProcessing, scrollToBottom]);

  // 检测 plan_3d_models 工具完成，通知父组件显示物品清单（useEffect 避免渲染期间 setState）
  const notifiedPlansRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!onPlanObjects) return;
    for (const msg of messages) {
      if (!msg.events) continue;
      for (let i = 0; i < msg.events.length; i++) {
        const event = msg.events[i];
        const key = `${msg.id}-${i}`;
        if (event.type === 'tool_call' && event.name === 'plan_3d_models' && event.isComplete && event.result && !notifiedPlansRef.current[key]) {
          notifiedPlansRef.current[key] = true;
          try {
            // 优先从 resultDetails 解析（结构化 JSON，由后端 SSE 发送）
            let details = null;
            const resultDetails = (event as any).resultDetails;
            if (resultDetails) {
              details = JSON.parse(resultDetails);
            } else {
              // 回退：尝试把 result 当 JSON 解析（旧格式兼容）
              const parsed = JSON.parse(event.result);
              details = parsed?.details;
            }
            if (details?.action === 'plan_3d' && Array.isArray(details?.models)) {
              onPlanObjects(details.models.map((m: any) => ({ name: m.name, description: m.prompt })));
            } else {
              // 最终回退：从纯文本 result 中正则提取模型名称和提示词
              const models = [];
              const regex = /^\d+\.\s+(.+?)\n\s+(?:Prompt|提示词)[:：]\s+(.+)$/gm;
              let match;
              while ((match = regex.exec(event.result)) !== null) {
                models.push({ name: match[1].trim(), description: match[2].trim() });
              }
              if (models.length > 0) onPlanObjects(models);
            }
          } catch { /* ignore */ }
        }
      }
    }
  }, [messages, onPlanObjects]);

  // 终止对话
  const handleStop = useCallback(async () => {
    if (!agentSessionId) return;

    // 1. 立即取消 SSE 连接（前端不再接收数据）
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 2. 强制停止 Agent（立即中断 LLM 和工具执行）
    try {
      await fetch(`${API_BASE_URL}/api/agent/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: agentSessionId }),
      });
    } catch { /* ignore */ }

    setIsProcessing(false);
    setAgentStatus({ phase: 'idle' });
  }, [agentSessionId]);

  // 发送消息（SSE 流式）
  const handleSendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    // 没有 session 时自动创建
    let sid = agentSessionId;
    if (!sid) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/agent/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: `web-${Date.now()}`, cwd: cwd || undefined }),
        });
        const data = await res.json();
        if (data.success) {
          sid = data.sessionId;
          setAgentSessionId(sid);
        } else {
          setMessages(prev => [...prev, {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `❌ 无法创建会话: ${data.error}\n\n请确认后端 (8000) 和 PiAgent 服务 (3001) 已启动。`,
            timestamp: new Date(),
          }]);
          return;
        }
      } catch {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: '❌ 无法连接 Agent 服务。\n\n请确认：\n1. 后端已启动: `uvicorn main:app --reload`\n2. PiAgent 已启动: `cd backend/agent_service && node index.mjs`',
          timestamp: new Date(),
        }]);
        return;
      }
    }

    // 标记之前的消息为历史（非最新）
    setMessages(prev => prev.map(m => ({ ...m, isLatest: false })));

    // 添加用户消息
    const userMsg: Message = { id: `msg-${Date.now()}`, role: 'user', content: text, timestamp: new Date(), isLatest: false };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    // 空的 AI 消息（使用新的 events 格式）
    const aiId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiId, role: 'assistant', content: '', timestamp: new Date(), reasoning: '', events: [], isLatest: true }]);

    let thinkingText = '';
    let contentText = '';
    const events: MessageEvent[] = [];

    const updateAi = () => {
      setMessages(prev => prev.map(m =>
        m.id === aiId ? { ...m, content: contentText, reasoning: thinkingText, events: [...events], isLatest: true } : m
      ));
    };

    // 创建 AbortController
    abortControllerRef.current = new AbortController();

    // 添加 SSE 超时检测（60秒无活动则中止）
    let lastActivityTime = Date.now();
    const SSE_TIMEOUT_MS = 300000; // 5分钟（Agent 执行工具如模型导入可能耗时较长）
    const timeoutCheck = setInterval(() => {
      const idleTime = Date.now() - lastActivityTime;
      if (idleTime > SSE_TIMEOUT_MS && abortControllerRef.current) {
        console.warn(`[ChatPanel] SSE timeout after ${idleTime}ms, aborting`);
        abortControllerRef.current.abort();
        clearInterval(timeoutCheck);
      }
    }, 5000); // 每5秒检查一次

    try {
      console.log(`[ChatPanel] Fetching ${API_BASE_URL}/api/agent/chat...`);
      const resp = await fetch(`${API_BASE_URL}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, message: text, cwd: cwd || undefined }),
        signal: abortControllerRef.current.signal,
      });

      console.log(`[ChatPanel] Response received: status=${resp.status}, ok=${resp.ok}`);
      console.log(`[ChatPanel] Response headers: ${JSON.stringify([...resp.headers.entries()])}`);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No body');

      console.log(`[ChatPanel] SSE reader created, starting read loop...`);

      const decoder = new TextDecoder();
      let buf = '';
      let chunkCount = 0;

      while (true) {
        console.log(`[ChatPanel] Reading chunk ${chunkCount}...`);
        const { done, value } = await reader.read();
        chunkCount++;

        if (done) {
          console.log(`[ChatPanel] Read loop complete, total chunks: ${chunkCount}`);
          break;
        }

        console.log(`[ChatPanel] Chunk ${chunkCount} received: ${value?.length || 0} bytes`);
        lastActivityTime = Date.now(); // 重置活动计时
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        console.log(`[ChatPanel] Processing ${lines.length} lines from chunk ${chunkCount}`);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.startsWith('data: ')) {
            if (line.trim()) console.log(`[ChatPanel] Skipping non-data line: ${line}`);
            continue;
          }
          try {
            const ev = JSON.parse(line.slice(6));
            console.log(`[ChatPanel] Event: type=${ev.type}, eventType=${ev.eventType}, toolName=${ev.toolName}`);

            if (ev.type === 'agent_start') {
              setAgentStatus({ phase: 'thinking', message: 'AI 正在思考...' });
            } else if (ev.type === 'message_update') {
              if (ev.eventType === 'text_delta' && ev.delta) {
                contentText += ev.delta;
                const lastEvent = events[events.length - 1];
                if (lastEvent && lastEvent.type === 'text') {
                  lastEvent.content += ev.delta;
                } else {
                  events.push({ type: 'text', content: ev.delta });
                }
                setAgentStatus({ phase: 'generating', message: '正在生成回复...' });
              } else if (ev.eventType === 'thinking_delta' && ev.delta) {
                thinkingText += ev.delta;
                setAgentStatus({ phase: 'thinking', message: '深度思考中...' });
              } else if (ev.eventType === 'toolcall_start') {
                const toolName = ev.toolName || '工具';
                events.push({ type: 'tool_call', name: toolName, result: '', isComplete: false });
                setAgentStatus({ phase: 'tool_call', toolName, message: `调用: ${toolName}` });
              }
              updateAi();
            } else if (ev.type === 'tool_execution_start') {
              const lastTool = events.filter(e => e.type === 'tool_call').pop();
              const toolName = ev.toolName || '工具';
              if (lastTool && lastTool.type === 'tool_call') {
                lastTool.name = toolName;
              }
              setAgentStatus({ phase: 'tool_call', toolName, toolParams: ev.args, message: `执行: ${toolName}` });
              updateAi();
            } else if (ev.type === 'tool_execution_end') {
              const lastTool = events.filter(e => e.type === 'tool_call').pop();
              if (lastTool && lastTool.type === 'tool_call') {
                lastTool.result = ev.result || '';
                if (ev.resultDetails) (lastTool as any).resultDetails = ev.resultDetails;
                lastTool.isComplete = true;
                if (ev.toolName) lastTool.name = ev.toolName;
              }
              setAgentStatus({ phase: 'thinking', message: '处理工具结果...' });
              updateAi();
            } else if (ev.type === 'content_block_delta') {
              // Anthropic 风格事件
              if (ev.eventType === 'text_delta' && ev.delta) {
                contentText += ev.delta;
                const lastEvent = events[events.length - 1];
                if (lastEvent && lastEvent.type === 'text') {
                  lastEvent.content += ev.delta;
                } else {
                  events.push({ type: 'text', content: ev.delta });
                }
                setAgentStatus({ phase: 'generating', message: '正在生成回复...' });
              }
              updateAi();
            } else if (ev.type === 'message_delta') {
              // OpenAI 风格事件
              if (ev.eventType === 'text_delta' && ev.delta) {
                contentText += ev.delta;
                const lastEvent = events[events.length - 1];
                if (lastEvent && lastEvent.type === 'text') {
                  lastEvent.content += ev.delta;
                } else {
                  events.push({ type: 'text', content: ev.delta });
                }
                setAgentStatus({ phase: 'generating', message: '正在生成回复...' });
              } else if (ev.eventType === 'toolcall_start' && ev.toolName) {
                events.push({ type: 'tool_call', name: ev.toolName, result: '', isComplete: false });
                setAgentStatus({ phase: 'tool_call', toolName: ev.toolName, message: `调用: ${ev.toolName}` });
              }
              updateAi();
            } else if (ev.type === 'tool_use_start' || ev.type === 'tool_use_end') {
              if (ev.toolName) {
                if (ev.type === 'tool_use_start') {
                  events.push({ type: 'tool_call', name: ev.toolName, result: '', isComplete: false });
                  setAgentStatus({ phase: 'tool_call', toolName: ev.toolName, message: `调用: ${ev.toolName}` });
                } else {
                  const lastTool = events.filter(e => e.type === 'tool_call').pop();
                  if (lastTool) lastTool.isComplete = true;
                  setAgentStatus({ phase: 'thinking', message: '处理工具结果...' });
                }
                updateAi();
              }
            } else if (ev.type === 'error') {
              contentText += `\n\nError: ${ev.error}`;
              updateAi();
            } else if (ev._raw) {
              // PiAgent 转发了 _raw_ 前缀字段，检查是否有未识别的文本/工具内容
              // 打印所有未知事件类型的 _raw_ 字段，帮助诊断
              const rawKeys = Object.keys(ev).filter(k => k.startsWith('_raw_'));
              if (rawKeys.length > 0) {
                console.log(`[ChatPanel] Raw fields on event ${ev.type}: ${rawKeys.join(', ')}`);
              }
            }
          } catch { /* skip */ }
        }
      }

      updateAi();
      // 只有当既没有文本内容，也没有任何工具调用时，才显示错误提示
      const hasToolCalls = events.length > 0 && events.some(e => e.type === 'tool_call');
      console.log(`[ChatPanel] Final check: contentText=${contentText.length} chars, events=${events.length}, hasToolCalls=${hasToolCalls}`);
      if (!contentText.trim() && !thinkingText.trim() && !hasToolCalls) {
        console.warn(`[ChatPanel] No content and no tool calls, showing error message`);
        setMessages(prev => prev.map(m =>
          m.id === aiId ? { ...m, content: '（Agent 未返回内容，请检查 API Key 配置）' } : m
        ));
      }
      // 注意：有工具调用但无文本时，不再覆盖显示错误，让工具结果自然展示在 events 中
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 用户主动取消
        setMessages(prev => prev.map(m =>
          m.id === aiId ? { ...m, content: contentText || '⏹️ 对话已被用户终止。' } : m
        ));
      } else {
        setMessages(prev => prev.map(m =>
          m.id === aiId ? { ...m, content: `❌ 请求失败: ${err instanceof Error ? err.message : '网络错误'}` } : m
        ));
      }
    } finally {
      clearInterval(timeoutCheck); // 清除超时检测
      
      // 安全检查：确保 isProcessing 被正确重置
      console.log(`[ChatPanel] handleSendMessage finally block - setting isProcessing=false`);
      setIsProcessing(false);
      setAgentStatus({ phase: 'idle' });
      abortControllerRef.current = null;
      // 对话结束后保存到后端数据库
      setMessages(prev => {
        // 使用 setTimeout 避免在 setState 回调中触发另一个 setState
        setTimeout(() => saveSessionToBackend(prev), 100);
        return prev;
      });
    }
  }, [input, isProcessing, agentSessionId, cwd, saveSessionToBackend]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 处理外部通知消息（如所有模型生成完成）
  useEffect(() => {
    if (notifyMessage && agentSessionId && !isProcessing) {
      const text = notifyMessage.trim();
      if (!text) return;

      // 添加用户消息（系统通知）到聊天记录
      const userMsg: Message = {
        id: `sys-${Date.now()}`,
        role: 'user',
        content: '✅ 所有3D模型已生成完成，请继续进行场景规划。',
        timestamp: new Date(),
        isLatest: false,
      };
      setMessages(prev => [...prev, userMsg]);

      // 创建 assistant 消息占位
      const aiId = `ai-${Date.now()}`;
      setMessages(prev => [...prev, { id: aiId, role: 'assistant', content: '', timestamp: new Date(), reasoning: '', events: [], isLatest: true }]);

      setIsProcessing(true);
      setAgentStatus({ phase: 'thinking' });

      // 复用 handleSendMessage 的 SSE 处理逻辑
      let contentText = '';
      let thinkingText = '';
      const events: MessageEvent[] = [];

      const updateAi = () => {
        setMessages(prev => prev.map(m =>
          m.id === aiId ? { ...m, content: contentText, reasoning: thinkingText, events: [...events], isLatest: true } : m
        ));
      };

      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;

      // 添加 SSE 超时检测（5分钟无活动则中止）
      let lastActivityTime = Date.now();
      const SSE_TIMEOUT_MS = 300000; // 5分钟
      const timeoutCheck = setInterval(() => {
        const idleTime = Date.now() - lastActivityTime;
        if (idleTime > SSE_TIMEOUT_MS && abortControllerRef.current) {
          console.warn(`[ChatPanel] SSE timeout after ${idleTime}ms, aborting`);
          abortControllerRef.current.abort();
          clearInterval(timeoutCheck);
        }
      }, 5000);

      fetch(`${API_BASE_URL}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: agentSessionId, message: text, cwd: cwd || undefined }),
        signal: abortCtrl.signal,
      })
        .then(resp => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return resp.body?.getReader();
        })
        .then(reader => {
          if (!reader) return;
          const decoder = new TextDecoder();
          let buf = '';
          const processStream = async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buf += decoder.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop() || '';

              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                  const ev = JSON.parse(line.slice(6));
                  if (ev.type === 'agent_start') {
                    setAgentStatus({ phase: 'thinking', message: 'AI 正在思考...' });
                  } else if (ev.type === 'message_update') {
                    if (ev.eventType === 'text_delta' && ev.delta) {
                      contentText += ev.delta;
                      const lastEvent = events[events.length - 1];
                      if (lastEvent && lastEvent.type === 'text') {
                        lastEvent.content += ev.delta;
                      } else {
                        events.push({ type: 'text', content: ev.delta });
                      }
                      setAgentStatus({ phase: 'generating', message: '正在生成回复...' });
                    } else if (ev.eventType === 'thinking_delta' && ev.delta) {
                      thinkingText += ev.delta;
                      setAgentStatus({ phase: 'thinking', message: '深度思考中...' });
                    } else if (ev.eventType === 'toolcall_start') {
                      const toolName = ev.toolName || '工具';
                      events.push({ type: 'tool_call', name: toolName, result: '', isComplete: false });
                      setAgentStatus({ phase: 'tool_call', toolName: toolName, message: `调用: ${toolName}` });
                    }
                    updateAi();
                  } else if (ev.type === 'tool_execution_start') {
                    const lastTool = events.filter(e => e.type === 'tool_call').pop();
                    const toolName = ev.toolName || '工具';
                    if (lastTool && lastTool.type === 'tool_call') {
                      lastTool.name = toolName;
                    }
                    setAgentStatus({ phase: 'tool_call', toolName: toolName, message: `执行: ${toolName}` });
                    updateAi();
                  } else if (ev.type === 'tool_execution_update') {
                    const lastTool = events.filter(e => e.type === 'tool_call').pop();
                    if (lastTool && lastTool.type === 'tool_call') {
                      lastTool.partialResult = ev.partialResult;
                    }
                    updateAi();
                  } else if (ev.type === 'tool_execution_end') {
                    const lastTool = events.filter(e => e.type === 'tool_call').pop();
                    if (lastTool && lastTool.type === 'tool_call') {
                      lastTool.result = ev.result || '';
                      if (ev.resultDetails) (lastTool as any).resultDetails = ev.resultDetails;
                      lastTool.isComplete = true;
                    }
                    setAgentStatus({ phase: 'thinking', message: '处理工具结果...' });
                    updateAi();
                  } else if (ev.type === 'agent_end') {
                    setAgentStatus({ phase: 'idle' });
                  }
                } catch { /* ignore parse errors */ }
              }
            }
          };
          return processStream();
        })
        .catch(e => {
          if (e.name !== 'AbortError') {
            console.error('[NotifyAgent] Error:', e);
            setMessages(prev => prev.map(m =>
              m.id === aiId ? { ...m, content: `请求失败: ${e instanceof Error ? e.message : '网络错误'}` } : m
            ));
          }
        })
        .finally(() => {
          clearInterval(timeoutCheck); // 清除超时检测
          setIsProcessing(false);
          setAgentStatus({ phase: 'idle' });
          abortControllerRef.current = null;
          setMessages(prev => {
            setTimeout(() => saveSessionToBackend(prev), 100);
            return prev;
          });
        });

      // 清除通知
      onNotifyHandled?.();
    }
  }, [notifyMessage, agentSessionId, isProcessing, cwd, onNotifyHandled, saveSessionToBackend, onPlanObjects]);

  // 解析 plan_3d_models 工具结果
  const parsePlanResult = (result: string, resultDetails?: string): { sceneDescription: string; models: ModelPlan[] } | null => {
    // 优先从 resultDetails（结构化 JSON）解析
    if (resultDetails) {
      try {
        const details = JSON.parse(resultDetails);
        if (details?.action === 'plan_3d' && Array.isArray(details?.models)) {
          return {
            sceneDescription: details.scene_description || '',
            models: details.models,
          };
        }
      } catch {
        // resultDetails 解析失败，继续尝试 result
      }
    }
    // 回退：尝试将 result 当 JSON 解析
    if (result) {
      try {
        const parsed = JSON.parse(result);
        // 尝试旧格式 (details)
        const details = parsed?.details;
        if (details?.action === 'plan_3d' && Array.isArray(details?.models)) {
          return {
            sceneDescription: details.scene_description || '',
            models: details.models,
          };
        }
        // 尝试新格式 (从 content 提取)
        if (parsed?.content) {
          const models: ModelPlan[] = [];
          const regex = /^\d+\.\s+(.+?)\n\s+(?:Prompt|提示词)[:：]\s+(.+)$/gm;
          let match;
          while ((match = regex.exec(parsed.content)) !== null) {
            models.push({ name: match[1].trim(), prompt: match[2].trim() });
          }
          if (models.length > 0) {
            const sceneMatch = parsed.content.match(/Scene:\s*(.+)/);
            return { sceneDescription: sceneMatch?.[1]?.trim() || '', models };
          }
        }
      } catch {
        // result 不是 JSON（纯文本），从文本中正则提取
        const models: ModelPlan[] = [];
        const regex = /^\d+\.\s+(.+?)\n\s+(?:Prompt|提示词)[:：]\s+(.+)$/gm;
        let match;
        while ((match = regex.exec(result)) !== null) {
          models.push({ name: match[1].trim(), prompt: match[2].trim() });
        }
        if (models.length > 0) {
          return { sceneDescription: '', models };
        }
      }
    }
    return null;
  };

  const clearMessages = useCallback(() => {
    if (window.confirm('确定要清除聊天记录？')) {
      setMessages([{ id: 'welcome', role: 'assistant', content: '👋 对话已重置，请发送新消息。', timestamp: new Date(), isLatest: true }]);
      localStorage.removeItem(`chat-messages-${sessionId}`);
      onReset?.();
    }
  }, [sessionId, onReset]);

  // 处理选项按钮点击
  const handleOptionClick = useCallback((value: string, type: string) => {
    if (isProcessing) return;
    console.log(`[ChatPanel] Option clicked: value='${value}', type='${type}'`);

    // 根据类型构造回复消息（添加上下文让 Agent 更好理解）
    let replyText = value;
    if (type === 'style') {
      replyText = `我选择 ${value} 风格，请继续设计方案。`;
    } else if (type === 'plan') {
      replyText = `我选择方案 ${value}，请根据这个方案调用 plan_3d_models 工具列出需要生成的3D物体清单。`;
    }

    console.log(`[ChatPanel] Sending message: '${replyText}'`);

    // 设置输入并自动发送
    setInput(replyText);
    setTimeout(() => {
      // handleSendMessage 会读取 input 状态
    }, 0);

    // 直接调用发送逻辑（避免状态更新延迟）
    (async () => {
      const text = replyText.trim();
      if (!text) return;
      console.log(`[ChatPanel] Starting async send...`);

      let sid = agentSessionId;
      if (!sid) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/agent/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: `web-${Date.now()}`, cwd: cwd || undefined }),
          });
          const data = await res.json();
          if (data.success) {
            sid = data.sessionId;
            setAgentSessionId(sid);
          } else {
            return;
          }
        } catch {
          return;
        }
      }

      setMessages(prev => prev.map(m => ({ ...m, isLatest: false })));
      const userMsg: Message = { id: `msg-${Date.now()}`, role: 'user', content: text, timestamp: new Date(), isLatest: false };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setIsProcessing(true);

      const aiId = `ai-${Date.now()}`;
      setMessages(prev => [...prev, { id: aiId, role: 'assistant', content: '', timestamp: new Date(), reasoning: '', events: [], isLatest: true }]);

      let thinkingText = '';
      let contentText = '';
      const events: MessageEvent[] = [];

      const updateAi = () => {
        setMessages(prev => prev.map(m =>
          m.id === aiId ? { ...m, content: contentText, reasoning: thinkingText, events: [...events], isLatest: true } : m
        ));
      };

      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;

      try {
        console.log(`[ChatPanel] Fetching ${API_BASE_URL}/api/agent/chat...`);
        const resp = await fetch(`${API_BASE_URL}/api/agent/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid, message: text, cwd: cwd || undefined }),
          signal: abortCtrl.signal,
        });

        console.log(`[ChatPanel] Response received: status=${resp.status}, ok=${resp.ok}`);
        console.log(`[ChatPanel] Response headers: ${JSON.stringify([...resp.headers.entries()])}`);

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const reader = resp.body?.getReader();
        if (!reader) throw new Error('No body');

        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === 'agent_start') {
                setAgentStatus({ phase: 'thinking', message: 'AI 正在思考...' });
              } else if (ev.type === 'message_update') {
                if (ev.eventType === 'text_delta' && ev.delta) {
                  contentText += ev.delta;
                  const lastEvent = events[events.length - 1];
                  if (lastEvent && lastEvent.type === 'text') {
                    lastEvent.content += ev.delta;
                  } else {
                    events.push({ type: 'text', content: ev.delta });
                  }
                  setAgentStatus({ phase: 'generating', message: '正在生成回复...' });
                } else if (ev.eventType === 'thinking_delta' && ev.delta) {
                  thinkingText += ev.delta;
                  setAgentStatus({ phase: 'thinking', message: '深度思考中...' });
                } else if (ev.eventType === 'toolcall_start') {
                  const toolName = ev.toolName || '工具';
                  events.push({ type: 'tool_call', name: toolName, result: '', isComplete: false });
                  setAgentStatus({ phase: 'tool_call', toolName, message: `调用: ${toolName}` });
                }
                updateAi();
              } else if (ev.type === 'tool_execution_start') {
                const lastTool = events.filter(e => e.type === 'tool_call').pop();
                const toolName = ev.toolName || '工具';
                if (lastTool && lastTool.type === 'tool_call') lastTool.name = toolName;
                setAgentStatus({ phase: 'tool_call', toolName, toolParams: ev.args, message: `执行: ${toolName}` });
                updateAi();
              } else if (ev.type === 'tool_execution_end') {
                const lastTool = events.filter(e => e.type === 'tool_call').pop();
                if (lastTool && lastTool.type === 'tool_call') {
                  lastTool.result = ev.result || '';
                  if (ev.resultDetails) (lastTool as any).resultDetails = ev.resultDetails;
                  lastTool.isComplete = true;
                  if (ev.toolName) lastTool.name = ev.toolName;
                }
                setAgentStatus({ phase: 'thinking', message: '处理工具结果...' });
                updateAi();
              } else if (ev.type === 'content_block_delta') {
                if (ev.eventType === 'text_delta' && ev.delta) {
                  contentText += ev.delta;
                  const lastEvent = events[events.length - 1];
                  if (lastEvent && lastEvent.type === 'text') {
                    lastEvent.content += ev.delta;
                  } else {
                    events.push({ type: 'text', content: ev.delta });
                  }
                  setAgentStatus({ phase: 'generating', message: '正在生成回复...' });
                }
                updateAi();
              } else if (ev.type === 'message_delta') {
                if (ev.eventType === 'text_delta' && ev.delta) {
                  contentText += ev.delta;
                  const lastEvent = events[events.length - 1];
                  if (lastEvent && lastEvent.type === 'text') {
                    lastEvent.content += ev.delta;
                  } else {
                    events.push({ type: 'text', content: ev.delta });
                  }
                  setAgentStatus({ phase: 'generating', message: '正在生成回复...' });
                } else if (ev.eventType === 'toolcall_start' && ev.toolName) {
                  events.push({ type: 'tool_call', name: ev.toolName, result: '', isComplete: false });
                  setAgentStatus({ phase: 'tool_call', toolName: ev.toolName, message: `调用: ${ev.toolName}` });
                }
                updateAi();
              } else if (ev.type === 'tool_use_start' || ev.type === 'tool_use_end') {
                if (ev.toolName) {
                  if (ev.type === 'tool_use_start') {
                    events.push({ type: 'tool_call', name: ev.toolName, result: '', isComplete: false });
                    setAgentStatus({ phase: 'tool_call', toolName: ev.toolName, message: `调用: ${ev.toolName}` });
                  } else {
                    const lastTool = events.filter(e => e.type === 'tool_call').pop();
                    if (lastTool) lastTool.isComplete = true;
                    setAgentStatus({ phase: 'thinking', message: '处理工具结果...' });
                  }
                  updateAi();
                }
              } else if (ev.type === 'error') {
                contentText += `\n\nError: ${ev.error}`;
              }
            } catch { /* skip */ }
          }
        }

        updateAi();
        const hasToolCalls = events.length > 0 && events.some(e => e.type === 'tool_call');
        if (!contentText.trim() && !thinkingText.trim() && !hasToolCalls) {
          setMessages(prev => prev.map(m =>
            m.id === aiId ? { ...m, content: '（Agent 未返回内容，请检查 API Key 配置）' } : m
          ));
        }
        // 有工具调用但无文本时，不再覆盖，让工具结果自然展示
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setMessages(prev => prev.map(m =>
            m.id === aiId ? { ...m, content: contentText || '对话已被用户终止。' } : m
          ));
        } else {
          setMessages(prev => prev.map(m =>
            m.id === aiId ? { ...m, content: `❌ 请求失败: ${err instanceof Error ? err.message : '网络错误'}` } : m
          ));
        }
      } finally {
        setIsProcessing(false);
        setAgentStatus({ phase: 'idle' });
        abortControllerRef.current = null;
        setMessages(prev => {
          setTimeout(() => saveSessionToBackend(prev), 100);
          return prev;
        });
      }
    })();
  }, [isProcessing, agentSessionId, cwd, saveSessionToBackend]);

  const handleSaveCwd = useCallback(() => {
    localStorage.setItem('agent-cwd', cwd);
    onCwdChange?.(cwd);
    setShowSettings(false);
    // 重新创建 session
    if (agentSessionId) {
      fetch(`${API_BASE_URL}/api/agent/session/${agentSessionId}`, { method: 'DELETE' }).catch(() => {});
      setAgentSessionId(null);
    }
  }, [cwd, agentSessionId, onCwdChange]);

  return (
    <div className="chat-panel-container-wrapper">
      {showHistory && (
        <ChatHistorySidebar
          history={history}
          activeSessionId={sessionId}
          onNewChat={() => { onReset?.(); setShowHistory(false); }}
          onSelectChat={(id) => { onSelectSession(id); setShowHistory(false); }}
        />
      )}

      {/* 设置弹窗 */}
      {showSettings && (
        <div className="settings-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3>⚙️ 设置</h3>
              <button className="close-btn" onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            <div className="settings-modal-body">
              <label className="settings-label">
                <FolderOpen size={16} />
                <span>工作目录 (CWD)</span>
              </label>
              <input
                type="text"
                value={cwd}
                onChange={e => setCwd(e.target.value)}
                placeholder="例如: D:\Projects\MyProject"
                className="settings-input"
              />
              <p className="settings-hint">Agent 将在此目录下执行文件操作和命令</p>
            </div>
            <div className="settings-modal-footer">
              <button className="btn-secondary" onClick={() => setShowSettings(false)}>取消</button>
              <button className="btn-primary" onClick={handleSaveCwd}><Check size={16} /> 保存</button>
            </div>
          </div>
        </div>
      )}

      <div className={clsx('chat-panel', { disabled })}>
        {/* 头部 */}
        <div className="chat-header">
          <div className="chat-title-container">
            <div className="chat-logo"><Code2 size={20} /></div>
            <div className="chat-title">
              <h3>3DClaw</h3>
              <span className="ai-badge">By Juaeg</span>
            </div>
          </div>
          <div className="chat-actions">
            {isProcessing && (
              <button className="icon-button stop-btn" onClick={handleStop} title="终止对话">
                <Square size={16} />
              </button>
            )}
            <button className="icon-button" onClick={() => setShowSettings(true)} title="设置">
              <Settings size={18} />
            </button>
            <button className="icon-button" onClick={() => { onReset?.(); setShowHistory(false); }} title="新对话">
              <MessageSquarePlus size={18} />
            </button>
            <button className="icon-button" onClick={() => setShowHistory(!showHistory)} title="历史">
              <History size={18} />
            </button>
            <button className="icon-button" onClick={clearMessages} title="重置">
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={clsx('message-wrapper', msg.role)}>
              <div className="message-bubble">
                {msg.reasoning && (
                  <div className="reasoning-container">
                    <button className="reasoning-toggle" onClick={() => setExpandedReasoning(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}>
                      <div className="toggle-left"><Lightbulb size={14} /><span>深度思考</span></div>
                      {expandedReasoning[msg.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {expandedReasoning[msg.id] && <div className="reasoning-text">{msg.reasoning}</div>}
                  </div>
                )}
                {/* 按顺序显示 events */}
                {msg.events && msg.events.length > 0 ? (
                  <div className="message-events">
                    {msg.events.map((event, i) => {
                      if (event.type === 'text') {
                        return (
                          <div key={i} className="message-content">
                            <SimpleMarkdown
                              content={event.content}
                              onOptionClick={handleOptionClick}
                              disabled={isProcessing}
                            />
                          </div>
                        );
                      }
                      if (event.type === 'tool_call') {
                        const toolInfo = toolInfoMap[event.name];
                        const displayName = toolInfo?.label || toolInfo?.name || event.name;
                        const description = toolInfo?.description || '';

                        // plan_3d_models 工具：标记待通知（由 useEffect 处理，避免 render 期间 setState）
                        if (event.name === 'plan_3d_models' && event.isComplete && event.result) {
                          const plan = parsePlanResult(event.result, (event as any).resultDetails);
                          if (plan && !confirmedPlansRef.current[`${msg.id}-${i}`]) {
                            // 在聊天区域显示简单提示
                            return (
                              <div key={i} className="plan-notification">
                                <div className="plan-notification-header">
                                  <Box size={14} />
                                  <span>3D 模型清单已生成</span>
                                </div>
                                <div className="plan-notification-content">
                                  共 {plan.models.length} 个物体，请在中间区域查看并生成。
                                </div>
                              </div>
                            );
                          }
                        }

                        return (
                          <div key={i} className="tool-call-item-sequential">
                            <div className="tool-call-header">
                              <Wrench size={12} />
                              <span className="tool-call-name">{displayName}</span>
                              {description && <span className="tool-call-desc">{description}</span>}
                            </div>
                            {event.result && <ToolResultDisplay result={event.result} />}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                ) : (
                  /* 兼容旧格式 */
                  <>
                    {msg.content && (
                      <div className="message-content">
                        <SimpleMarkdown
                          content={msg.content}
                          onOptionClick={handleOptionClick}
                          disabled={isProcessing}
                        />
                      </div>
                    )}
                  </>
                )}
                <div className="message-footer">
                  <span className="message-time">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>
          ))}
          {isProcessing && agentStatus.phase !== 'idle' && (
            <div className="message-wrapper assistant">
              <ThinkingAnimation status={agentStatus.phase} toolName={agentStatus.toolName} toolParams={agentStatus.toolParams} message={agentStatus.message} />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <div className="chat-input-area">
          <div className="input-container">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="输入消息，按 Enter 发送..."
              rows={1}
              disabled={disabled || isProcessing}
            />
            {isProcessing ? (
              <button className="send-button-new stop" onClick={handleStop} title="终止">
                <Square size={18} />
              </button>
            ) : (
              <button className="send-button-new" onClick={handleSendMessage} disabled={!input.trim() || disabled}>
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
