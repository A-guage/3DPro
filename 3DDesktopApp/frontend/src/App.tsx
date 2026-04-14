import { useCallback, useEffect, useState, useRef } from 'react';
import { SceneViewer } from '@/components/SceneViewer/SceneViewer';
import { ObjectList, RecommendedObject } from '@/components/ObjectList/ObjectList';
import { ChatPanel } from '@/components/ChatPanel/ChatPanel';
import { TitleBar } from '@/components/TitleBar/TitleBar';
import { useSceneGenerator } from '@/hooks/useSceneGenerator';
import {
  Github,
  Zap,
  HelpCircle,
  Layers,
  History,
  Trash2,
  MoreHorizontal,
  Edit2,
  Pin,
  Share2,
  ChevronDown,
  ChevronRight,
  Check
} from 'lucide-react';
import { API_BASE_URL } from '@/services/constants';
import { clsx } from 'clsx';
import './App.css';

/**
 * 重构版 App - 三栏布局
 * 左侧资产（按 Session 分类），中间模型展示，右侧 AI 对话
 */
function App() {
  const {
    state,
    reset,
  } = useSceneGenerator();

  // 基础状态
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [_unityPath, _setUnityPath] = useState<string>(() => localStorage.getItem('unity-project-path') || '');
  
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [pinnedSessions, setPinnedSessions] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('pinned-sessions') || '[]'); } catch { return []; }
  });

  const [sessionId, setSessionId] = useState(() => {
    const savedId = localStorage.getItem('chat-session-id');
    if (savedId) return savedId;
    const newId = `session-${Date.now()}`;
    localStorage.setItem('chat-session-id', newId);
    return newId;
  });

  // 分类存储的资产数据
  const [sessionAssets, setSessionAssets] = useState<any[]>([]);
  // 当前对话推荐的物品
  const [recommendedObjects, setRecommendedObjects] = useState<RecommendedObject[]>([]);
  const [isChatGenerating, setIsChatGenerating] = useState(false);
  // 通知 Agent 所有模型已完成的回调
  const [notifyAgentMessage, setNotifyAgentMessage] = useState<string | null>(null);
  const notifiedAllReadyRef = useRef(false);
  const hasGeneratingRef = useRef(false); // 追踪是否有模型曾经处于 generating 状态
  const [collapsedSessionIds, setCollapsedSessionIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('collapsed-sessions') || '[]');
    } catch {
      return [];
    }
  });
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const fireworkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const petalColors = [
    '#ffb7c5', '#ffc0cb', '#ff69b4', '#fff0f5', '#ffe4e1',
    '#dda0dd', '#f8bbd9', '#f48fb1', '#ef9a9a', '#ffffff',
    '#ffccd5', '#ff8fa3', '#ff758f', '#ff4d6d', '#c9184a',
  ];

  const createFireworkParticle = useCallback((x: number, y: number, angle: number, speed: number, color: string, shape: string) => {
    const particle = document.createElement('div');
    particle.className = 'firework-particle';
    
    const size = shape === 'heart' ? 16 : shape === 'star' ? 14 : 8;
    const duration = 2.5 + Math.random() * 1.5;
    
    const radians = (angle * Math.PI) / 180;
    const vx = Math.cos(radians) * speed;
    const vy = Math.sin(radians) * speed;

    let content = '';
    if (shape === 'heart') {
      content = '♥';
      particle.style.fontSize = `${size}px`;
      particle.style.color = color;
      particle.style.background = 'transparent';
    } else if (shape === 'star') {
      content = '✦';
      particle.style.fontSize = `${size}px`;
      particle.style.color = color;
      particle.style.background = 'transparent';
    } else if (shape === 'sparkle') {
      content = '✨';
      particle.style.fontSize = `${size}px`;
      particle.style.color = color;
      particle.style.background = 'transparent';
    }

    particle.style.cssText += `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      background: ${shape === 'petal' ? color : 'transparent'};
      border-radius: ${shape === 'petal' ? '50% 0 50% 50%' : '50%'};
      opacity: 1;
      pointer-events: none;
      z-index: 10001;
      --vx: ${vx}px;
      --vy: ${vy}px;
      --color: ${color};
      animation: fireworkExplode ${duration}s ease-out forwards;
    `;
    
    if (content) particle.textContent = content;

    document.body.appendChild(particle);

    const trailCount = 8;
    for (let i = 1; i <= trailCount; i++) {
      const trail = document.createElement('div');
      trail.className = 'firework-trail';
      const trailDelay = i * 0.03;
      const trailDuration = duration - trailDelay;
      
      trail.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: ${size * (1 - i * 0.08)}px;
        height: ${size * (1 - i * 0.08)}px;
        background: ${shape === 'petal' ? color : 'transparent'};
        border-radius: ${shape === 'petal' ? '50% 0 50% 50%' : '50%'};
        opacity: ${0.6 - i * 0.06};
        pointer-events: none;
        z-index: ${10000 - i};
        --vx: ${vx * (1 - i * 0.05)}px;
        --vy: ${vy * (1 - i * 0.05)}px;
        animation: fireworkTrail ${trailDuration}s ease-out ${trailDelay}s forwards;
      `;
      
      if (content) {
        trail.textContent = content;
        trail.style.fontSize = `${size * (1 - i * 0.08)}px`;
        trail.style.color = color;
        trail.style.background = 'transparent';
      }
      
      document.body.appendChild(trail);
      setTimeout(() => trail.remove(), (trailDuration + trailDelay) * 1000);
    }

    setTimeout(() => particle.remove(), duration * 1000);
  }, []);

  const createFirework = useCallback((x: number, y: number) => {
    const shapes = ['petal', 'heart', 'star', 'sparkle'];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const particleCount = shape === 'petal' ? 40 : 25;
    const baseSpeed = 150 + Math.random() * 100;
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (360 / particleCount) * i + Math.random() * 10;
      const speed = baseSpeed + Math.random() * 80;
      const color = petalColors[Math.floor(Math.random() * petalColors.length)];
      createFireworkParticle(x, y, angle, speed, color, shape);
    }
  }, [createFireworkParticle]);

  const createNameFirework = useCallback((x: number, y: number) => {
    const name = 'Juaeg';
    const letters = name.split('');
    const spread = 140;
    
    letters.forEach((letter, index) => {
      const offsetX = (index - (letters.length - 1) / 2) * spread;
      const particle = document.createElement('div');
      particle.className = 'name-particle';
      particle.textContent = letter;
      
      const duration = 3 + Math.random() * 0.5;
      const color = petalColors[Math.floor(Math.random() * petalColors.length)];
      
      particle.style.cssText = `
        position: fixed;
        left: ${x + offsetX}px;
        top: ${y}px;
        font-size: 40px;
        font-weight: bold;
        color: ${color};
        text-shadow: 0 0 10px ${color}, 0 0 20px ${color}, 0 0 30px ${color};
        opacity: 1;
        pointer-events: none;
        z-index: 10002;
        animation: nameFloat ${duration}s ease-out forwards;
        --offset-y: -200px;
      `;

      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), duration * 1000);
    });
  }, []);

  const startRomanticEffects = useCallback(() => {
    const launchFirework = () => {
      const x = 100 + Math.random() * (window.innerWidth - 200);
      const y = window.innerHeight - 50;
      const targetY = 150 + Math.random() * 200;
      const riseDuration = 2.5;
      
      const rocket = document.createElement('div');
      rocket.className = 'firework-rocket';
      rocket.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 6px;
        height: 6px;
        background: #fff;
        border-radius: 50%;
        box-shadow: 0 0 15px #fff, 0 0 30px #ff69b4, 0 0 45px #ff69b4;
        pointer-events: none;
        z-index: 10001;
        animation: rocketRise ${riseDuration}s linear forwards;
        --target-y: ${targetY}px;
      `;
      document.body.appendChild(rocket);

      const rocketTrailInterval = setInterval(() => {
        const rect = rocket.getBoundingClientRect();
        const trailX = rect.left + rect.width / 2;
        const trailY = rect.top + rect.height / 2;
        
        for (let i = 0; i < 3; i++) {
          const trail = document.createElement('div');
          const trailColor = petalColors[Math.floor(Math.random() * petalColors.length)];
          const trailSize = 3 + Math.random() * 3;
          const offsetX = (Math.random() - 0.5) * 10;
          
          trail.style.cssText = `
            position: fixed;
            left: ${trailX + offsetX}px;
            top: ${trailY}px;
            width: ${trailSize}px;
            height: ${trailSize * 1.5}px;
            background: ${trailColor};
            border-radius: 50% 0 50% 50%;
            opacity: 0.8;
            pointer-events: none;
            z-index: 10000;
            animation: rocketTrailFade 0.6s ease-out forwards;
          `;
          
          document.body.appendChild(trail);
          setTimeout(() => trail.remove(), 600);
        }
      }, 30);

      setTimeout(() => {
        clearInterval(rocketTrailInterval);
        rocket.remove();
        const effectType = Math.random();
        if (effectType < 0.4) {
          createFirework(x, targetY);
        } else if (effectType < 0.7) {
          createNameFirework(x, targetY + 50);
        } else {
          createFirework(x, targetY);
          setTimeout(() => createFirework(x + (Math.random() - 0.5) * 100, targetY + 30), 300);
        }
      }, riseDuration * 1000);
    };

    setTimeout(launchFirework, 500);
    fireworkIntervalRef.current = setInterval(launchFirework, 2500 + Math.random() * 2000);
  }, [createFirework, createNameFirework]);

  const stopRomanticEffects = useCallback(() => {
    if (fireworkIntervalRef.current) {
      clearInterval(fireworkIntervalRef.current);
      fireworkIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (showHelpModal) {
      startRomanticEffects();
    } else {
      stopRomanticEffects();
    }
    return () => stopRomanticEffects();
  }, [showHelpModal, startRomanticEffects, stopRomanticEffects]);

  const createPetal = useCallback((x: number, y: number) => {
    const petal = document.createElement('div');
    petal.className = 'petal';
    const color = petalColors[Math.floor(Math.random() * petalColors.length)];
    const size = 8 + Math.random() * 12;
    const rotateStart = Math.random() * 360;
    const rotateEnd = rotateStart + (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360);
    const xOffset = (Math.random() - 0.5) * 200;
    const duration = 2 + Math.random() * 2;

    petal.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size * 1.3}px;
      background: ${color};
      border-radius: 50% 0 50% 50%;
      opacity: 0.9;
      pointer-events: none;
      z-index: 10000;
      transform: rotate(${rotateStart}deg);
      animation: petalFall ${duration}s ease-out forwards;
      --x-offset: ${xOffset}px;
      --rotate-end: ${rotateEnd}deg;
    `;

    document.body.appendChild(petal);
    setTimeout(() => petal.remove(), duration * 1000);
  }, []);

  const toggleSessionCollapsed = useCallback((id: string) => {
    setCollapsedSessionIds((prev) => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('collapsed-sessions', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleDownloadObject = useCallback((obj: RecommendedObject) => {
    if (!obj.modelUrl) return;
    const url = new URL(obj.modelUrl, window.location.origin);
    url.searchParams.set('download', '1');
    const a = document.createElement('a');
    a.href = url.toString();
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const refreshSessionDetail = useCallback(async (sid: string, baseSession?: any) => {
    try {
      const detailRes = await fetch(`${API_BASE_URL}/api/sessions/${sid}`);
      if (!detailRes.ok) {
        throw new Error(`HTTP ${detailRes.status}`);
      }
      const detail = await detailRes.json();
      if (detail.session) {
        detail.session = { ...(baseSession || {}), ...detail.session };
      } else {
        detail.session = baseSession || { session_id: sid };
      }
      detail.__detailError = null;
      setSessionAssets((prev) => prev.map((x: any) => (x.session?.session_id === sid ? detail : x)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch';
      setSessionAssets((prev) =>
        prev.map((x: any) =>
          x.session?.session_id === sid ? { ...(x || {}), session: baseSession || x.session, objects: x.objects || [], scenes: x.scenes || [], __detailError: message } : x
        )
      );
    }
  }, []);

  // 加载所有历史 Session 及其资产
  const loadAllSessions = useCallback(async () => {
    try {
      console.log('Fetching sessions from:', `${API_BASE_URL}/api/sessions?user_id=default_user`);
      const response = await fetch(`${API_BASE_URL}/api/sessions?user_id=default_user`);
      if (response.ok) {
        const sessions = await response.json();
        console.log('Sessions fetched count:', sessions.length);
        // 获取每个 session 的详细资产（包含 objects），用于左侧资产栏和推荐物品恢复
        const detailedSessions = await Promise.all(
          (sessions || []).map(async (s: any) => {
            try {
              const detailRes = await fetch(`${API_BASE_URL}/api/sessions/${s.session_id}`);
              if (detailRes.ok) {
                const detail = await detailRes.json();
                // 合并列表数据与详情，确保时间等字段完整
                if (detail.session) {
                  detail.session = { ...s, ...detail.session };
                } else {
                  detail.session = s;
                }
                detail.__detailError = null;
                return detail;
              }
              return { session: s, objects: [], scenes: [], __detailError: `HTTP ${detailRes.status}` };
            } catch (err) {
              console.error(`Failed to load details for session ${s.session_id}`, err);
              const message = err instanceof Error ? err.message : 'Failed to fetch';
              return { session: s, objects: [], scenes: [], __detailError: message };
            }
          })
        );
        console.log('Detailed sessions count:', detailedSessions.length);
        setSessionAssets(detailedSessions.filter((s: any) => s !== null));
      } else {
        console.error('Failed to fetch sessions:', response.status);
      }
    } catch (e) {
      console.error('Failed to load session assets:', e);
    }
  }, []);

  useEffect(() => {
    loadAllSessions();
  }, [loadAllSessions, sessionId]);

  const extractDetectedObjects = useCallback((sid: string): RecommendedObject[] => {
    try {
      const raw = localStorage.getItem(`chat-messages-${sid}`);
      if (!raw) return [];
      const messages = JSON.parse(raw) as Array<{ role: string; content: string }>;
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('@@OBJECT_LIST@@')) {
          const match = m.content.match(/@@OBJECT_LIST@@\s*(\{[\s\S]*?\})\s*@@OBJECT_LIST@@/);
          if (!match) break;
          const parsed = JSON.parse(match[1]);
          const items = Array.isArray(parsed.objects) ? parsed.objects : [];
          return items.map((obj: any, idx: number) => ({
            id: `${(obj.name || 'obj').toString()}-${idx}`,
            name: obj.name || `物体${idx + 1}`,
            description: obj.description || '',
            status: 'pending',
            modelUrl: null,
            priority: obj.priority === 'high' ? 1 : (obj.priority === 'low' ? 3 : 2),
          }));
        }
      }
    } catch {
      return [];
    }
    return [];
  }, []);

  useEffect(() => {
    const normalizeName = (s: string) =>
      (s || '')
        .normalize?.('NFKC')
        .toLowerCase()
        .replace(/[\s_\-:：，。.,!！?？]/g, '')
        .trim();

    const current = sessionAssets.find((s: any) => s.session?.session_id === sessionId);
    const fromBackend: RecommendedObject[] = current?.objects
      ? current.objects.map((obj: any) => ({
          id: obj.object_id,
          name: obj.object_name || '3D物体',
          description: '',
          status: (obj.status === 'processing'
            ? 'generating'
            : obj.status === 'ready'
            ? 'ready'
            : obj.status === 'failed'
            ? 'failed'
            : 'pending') as RecommendedObject['status'],
          modelUrl: obj.model_url,
          priority: 2,
        }))
      : [];

    const fromDetected = extractDetectedObjects(sessionId);

    setRecommendedObjects((prev) => {
      const byName = new Map<string, RecommendedObject>();

      // 1. 先保留 prev 中所有物品（包括 pending）
      for (const item of prev) {
        byName.set(normalizeName(item.name), item);
      }

      // 2. 用后端数据更新（已生成完成的物品）
      for (const item of fromBackend) {
        const key = normalizeName(item.name);
        const existing = byName.get(key);
        if (existing) {
          // 合并：保留原有 id，更新状态
          byName.set(key, { ...existing, ...item, name: existing.name || item.name });
        } else {
          byName.set(key, item);
        }
      }

      // 3. 用新检测到的物品补充（但不要覆盖已有的）
      for (const item of fromDetected) {
        const key = normalizeName(item.name);
        if (!byName.has(key)) {
          byName.set(key, item);
        }
      }

      const merged = Array.from(byName.values());
      if (merged.length === 0) {
        return prev;
      }
      const prevKey = prev.map(o => `${normalizeName(o.name)}:${o.status}:${o.modelUrl || ''}`).join('|');
      const nextKey = merged.map(o => `${normalizeName(o.name)}:${o.status}:${o.modelUrl || ''}`).join('|');
      return prevKey === nextKey ? prev : merged;
    });
  }, [sessionAssets, sessionId, extractDetectedObjects]);

  // 检测所有模型是否生成完成，通知 Agent
  useEffect(() => {
    // 没有物品或正在生成中，不处理
    if (recommendedObjects.length === 0) return;
    if (isChatGenerating) return;
    // 已经通知过了
    if (notifiedAllReadyRef.current) return;

    // 检查是否有任何 generating 状态的物品（正在生成中）
    const hasGenerating = recommendedObjects.some(o => o.status === 'generating');
    if (hasGenerating) {
      hasGeneratingRef.current = true; // 标记曾经有模型在生成
      return;
    }

    // 只有曾经生成过模型，且所有物品都 ready 时才通知
    const allReady = recommendedObjects.every(o => o.status === 'ready');
    if (allReady && hasGeneratingRef.current) {
      notifiedAllReadyRef.current = true;
      const readyList = recommendedObjects.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
      setNotifyAgentMessage(`[系统通知] 所有 3D 模型已生成完成！共 ${recommendedObjects.length} 个物体：\n${readyList}\n\n请继续进行场景规划，使用 ls 和 read 工具了解项目结构，然后生成场景布局文件。`);
    }
  }, [recommendedObjects, isChatGenerating]);

  // 切换会话时重置通知标记
  useEffect(() => {
    notifiedAllReadyRef.current = false;
    hasGeneratingRef.current = false;
    setNotifyAgentMessage(null);
  }, [sessionId]);

  // --- Session 操作函数 ---
  const handleDeleteSession = useCallback(async (id: string) => {
    if (!window.confirm("确定要删除此会话吗？")) return;
    try {
      await fetch(`${API_BASE_URL}/api/sessions/${id}`, { method: 'DELETE' });
      if (id === sessionId) {
        localStorage.removeItem('chat-session-id');
        window.location.reload(); 
      } else {
        loadAllSessions();
      }
    } catch (e) { console.error(e); }
    setActiveMenuSessionId(null);
  }, [sessionId, loadAllSessions]);

  const handleRenameSession = useCallback(async (id: string, newTitle: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/sessions/${id}/title`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ new_title: newTitle })
      });
      loadAllSessions();
    } catch (e) { console.error(e); }
    setEditingSessionId(null);
  }, [loadAllSessions]);

  const handleTogglePin = useCallback((id: string) => {
    const newPinned = pinnedSessions.includes(id) 
      ? pinnedSessions.filter(p => p !== id) 
      : [...pinnedSessions, id];
    setPinnedSessions(newPinned);
    localStorage.setItem('pinned-sessions', JSON.stringify(newPinned));
    setActiveMenuSessionId(null);
  }, [pinnedSessions]);

  // 排序会话：置顶优先
  const sortedSessions = [...sessionAssets].sort((a, b) => {
    const isAPinned = pinnedSessions.includes(a.session.session_id);
    const isBPinned = pinnedSessions.includes(b.session.session_id);
    if (isAPinned && !isBPinned) return -1;
    if (!isAPinned && isBPinned) return 1;
    return 0; 
  });

  const handleGenerateObject = useCallback(async (objectId: string) => {
    const obj = recommendedObjects.find(o => o.id === objectId);
    if (!obj) return;

    setRecommendedObjects(prev => prev.map(o => o.id === objectId ? { ...o, status: 'generating' } : o));
    setIsChatGenerating(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate-object`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: obj.name,
          description: obj.description,
          session_id: sessionId,
          user_id: 'default_user'
        })
      });

      if (!response.ok) throw new Error('Failed to start generation');
      const data = await response.json();
      const taskId = data.task_id;

      const pollStatus = async () => {
        try {
          const statusRes = await fetch(`${API_BASE_URL}/api/object-status/${taskId}`);
          const statusData = await statusRes.json();

          if (statusData.status === 'ready') {
            setRecommendedObjects(prev => prev.map(o => 
              o.id === objectId ? { ...o, status: 'ready', modelUrl: statusData.model_url } : o
            ));
            setPreviewUrl(statusData.model_url);
            setIsChatGenerating(false);
            loadAllSessions(); // 刷新左侧资产
          } else if (statusData.status === 'failed') {
            setRecommendedObjects(prev => prev.map(o => o.id === objectId ? { ...o, status: 'failed' } : o));
            setIsChatGenerating(false);
          } else {
            setTimeout(pollStatus, 3000);
          }
        } catch (e) {
          setIsChatGenerating(false);
        }
      };
      pollStatus();
    } catch (error) {
      setIsChatGenerating(false);
    }
  }, [recommendedObjects, sessionId, loadAllSessions]);

  const handleSelectSession = useCallback((selectedSessionId: string) => {
    loadAllSessions();
    if (selectedSessionId === sessionId) return;

    setSessionId(selectedSessionId);
    const detail = sessionAssets.find((s: any) => s.session?.session_id === selectedSessionId);
    const pickLatestReady = (d: any): string | null => {
      if (!d) return null;
      const objects = Array.isArray(d.objects) ? d.objects : [];
      const ready = objects
        .filter((o: any) => o && o.status === 'ready' && o.model_url)
        .sort((a: any, b: any) => {
          const ta = Date.parse(a.created_at || '') || 0;
          const tb = Date.parse(b.created_at || '') || 0;
          return tb - ta;
        });
      if (ready.length > 0) return ready[0].model_url;
      const scenes = Array.isArray(d.scenes) ? d.scenes : [];
      const sceneReady = scenes
        .filter((x: any) => x && x.model_url)
        .sort((a: any, b: any) => {
          const ta = Date.parse(a.updated_at || a.created_at || '') || 0;
          const tb = Date.parse(b.updated_at || b.created_at || '') || 0;
          return tb - ta;
        });
      return sceneReady.length > 0 ? sceneReady[0].model_url : null;
    };
    setPreviewUrl(pickLatestReady(detail));
    localStorage.setItem('chat-session-id', selectedSessionId);
  }, [sessionId, loadAllSessions, sessionAssets]);

  useEffect(() => {
    if (previewUrl) return;
    const detail = sessionAssets.find((s: any) => s.session?.session_id === sessionId);
    if (!detail) return;
    const objects = Array.isArray(detail.objects) ? detail.objects : [];
    const ready = objects
      .filter((o: any) => o && o.status === 'ready' && o.model_url)
      .sort((a: any, b: any) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0));
    if (ready.length > 0) {
      setPreviewUrl(ready[0].model_url);
      return;
    }
    const scenes = Array.isArray(detail.scenes) ? detail.scenes : [];
    const sceneReady = scenes
      .filter((x: any) => x && x.model_url)
      .sort((a: any, b: any) => (Date.parse(b.updated_at || b.created_at || '') || 0) - (Date.parse(a.updated_at || a.created_at || '') || 0));
    if (sceneReady.length > 0) {
      setPreviewUrl(sceneReady[0].model_url);
    }
  }, [previewUrl, sessionAssets, sessionId]);

  const handleReset = useCallback(() => {
    reset();
    const newId = `session-${Date.now()}`;
    localStorage.setItem('chat-session-id', newId);
    
    setSessionId(newId);
    setRecommendedObjects([]);
    setPreviewUrl(null);
  }, [reset]);

  return (
    <div className="app-container">
      {/* Electron 自定义标题栏 */}
      <TitleBar />
      {/* 顶部导航栏 */}
      <header className="app-header">
        <div className="header-brand">
          <h1 className="app-title">
            <Zap className="title-icon" />
            3D 场景工坊
          </h1>
        </div>
        <div className="header-actions">
          <button className="header-btn" onClick={() => setShowHelpModal(true)} title="帮助"><HelpCircle size={20} /></button>
          <button className="header-btn" onClick={() => setShowSourceModal(true)} title="源码"><Github size={20} /></button>
        </div>
      </header>

      {/* 帮助弹窗 */}
      {showHelpModal && (
        <div className="help-modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div 
            className="help-modal-content" 
            onClick={e => {
              e.stopPropagation();
              const x = e.clientX;
              const y = e.clientY;
              for (let i = 0; i < 8; i++) {
                setTimeout(() => {
                  createPetal(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
                }, i * 50);
              }
            }}
          >
            <div className="help-modal-image">
              <img src="./love.jpg" alt="Love" />
            </div>
            <div className="help-modal-text">
              <p>我喜欢你，</p>
              <p>并不是因为你长得好不好看。</p>
              <p>而是你在特殊的时间里，</p>
              <p>给了我别人给不了的感觉。</p>
              <p>也并不是我喜欢的样子你都有，</p>
              <p>而是你的样子我都喜欢。</p>
              <p className="help-modal-author">——宫崎骏</p>
            </div>
            <button className="help-modal-close" onClick={() => setShowHelpModal(false)}>✕</button>
          </div>
        </div>
      )}

      {/* 源码弹窗 */}
      {showSourceModal && (
        <div className="modal-overlay" onClick={() => setShowSourceModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>源码</h3>
            <p>即将开源</p>
            <button className="modal-close-btn" onClick={() => setShowSourceModal(false)}>关闭</button>
          </div>
        </div>
      )}

      {/* 主体三栏布局 */}
      <div className="main-layout">
        {/* 左侧资产栏 (按 Session 分类) */}
        <aside className="assets-sidebar" onClick={() => setActiveMenuSessionId(null)}>
          <div className="assets-title">
            <Layers size={16} />
            <span>我的资产库</span>
          </div>
          
          {sortedSessions.map((sessionDetail: any) => {
            const id = sessionDetail.session?.session_id;
            const isPinned = pinnedSessions.includes(id);
            const isEditing = editingSessionId === id;
            const isCollapsed = collapsedSessionIds.includes(id);

            return (
              <div key={id} className="session-group">
                {isEditing ? (
                  <form 
                    className="session-rename-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRenameSession(id, editTitle);
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    <input 
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={() => handleRenameSession(id, editTitle)}
                      className="session-rename-input"
                    />
                  </form>
                ) : (
                  <div 
                    className={clsx("session-header clickable", isPinned && "pinned")} 
                    title={`切换到: ${sessionDetail.session?.title}`}
                    onClick={() => handleSelectSession(id)}
                  >
                    <div className="session-name">
                      <button
                        className="session-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSessionCollapsed(id);
                        }}
                        title={isCollapsed ? '展开' : '折叠'}
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {isPinned ? <Pin size={12} className="pin-icon" /> : <History size={12} className="history-icon" />}
                      {sessionDetail.session?.title || '新对话'}
                    </div>
                    
                    <div className="session-actions" onClick={e => e.stopPropagation()}>
                      <button 
                        className="session-menu-btn"
                        onClick={() => setActiveMenuSessionId(activeMenuSessionId === id ? null : id)}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      
                      {activeMenuSessionId === id && (
                        <div className="session-menu">
                          <button onClick={() => {
                            setEditingSessionId(id);
                            setEditTitle(sessionDetail.session?.title || "");
                            setActiveMenuSessionId(null);
                          }}>
                            <Edit2 size={12} /> 重命名
                          </button>
                          <button onClick={() => handleTogglePin(id)}>
                            <Pin size={12} /> {isPinned ? "取消置顶" : "置顶"}
                          </button>
                          <button onClick={() => {
                            const url = `${window.location.origin}?session=${id}`;
                            navigator.clipboard.writeText(url).then(() => alert("链接已复制"));
                            setActiveMenuSessionId(null);
                          }}>
                            <Share2 size={12} /> 分享
                          </button>
                          <button className="danger" onClick={() => handleDeleteSession(id)}>
                            <Trash2 size={12} /> 删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {!isCollapsed && sessionDetail.objects && sessionDetail.objects.length > 0 ? (
                  <ObjectList
                    objects={sessionDetail.objects.map((obj: any) => ({
                      id: obj.object_id,
                      name: obj.object_name,
                      description: '',
                      status: (obj.status === 'processing'
                        ? 'generating'
                        : obj.status === 'ready'
                        ? 'ready'
                        : obj.status === 'failed'
                        ? 'failed'
                        : 'pending') as RecommendedObject['status'],
                      modelUrl: obj.model_url,
                      priority: 2
                    }))}
                    onSelectObject={(obj) => obj.modelUrl && setPreviewUrl(obj.modelUrl)}
                    onDownloadObject={handleDownloadObject}
                    compact={true} // 资产栏使用紧凑模式
                  />
                ) : !isCollapsed && sessionDetail.__detailError ? (
                  <div className="session-no-assets">
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>资产加载失败</div>
                    <button
                      className="header-btn"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        refreshSessionDetail(id, sessionDetail.session);
                      }}
                      title={sessionDetail.__detailError}
                    >
                      重试
                    </button>
                  </div>
                ) : !isCollapsed ? (
                  <div className="session-no-assets">暂无资产</div>
                ) : (
                  <div className="session-no-assets" style={{ color: 'var(--text-muted)' }}>已折叠</div>
                )}
              </div>
            );
          })}

          {sortedSessions.length === 0 && (
            <div style={{textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, fontSize: 12}}>
              暂无已生成的资产
            </div>
          )}
        </aside>

        {/* 中间展示区 */}
        <main className="center-display">
          {/* 当前对话推荐的物品：改为始终展示区域，由 ObjectList 自己决定空状态 */}
          <div className="recommended-objects-container">
            <h3 className="recommended-objects-title">需要生成的3D模型清单</h3>
            <ObjectList
              objects={recommendedObjects}
              onGenerateObject={handleGenerateObject}
              onSelectObject={(obj) => obj.modelUrl && setPreviewUrl(obj.modelUrl)}
              onDownloadObject={handleDownloadObject}
              disabled={isChatGenerating}
            />
            {/* 已完成按钮：有已生成的模型时显示 */}
            {recommendedObjects.some(o => o.status === 'ready') && !notifiedAllReadyRef.current && (
              <button
                className="finish-generation-btn"
                onClick={() => {
                  notifiedAllReadyRef.current = true;
                  const readyItems = recommendedObjects.filter(o => o.status === 'ready');
                  const pendingItems = recommendedObjects.filter(o => o.status !== 'ready');
                  const readyList = readyItems.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
                  const pendingInfo = pendingItems.length > 0
                    ? `\n\n未生成的物体（${pendingItems.length}个）：${pendingItems.map(o => o.name).join('、')}，用户选择跳过。`
                    : '';
                  setNotifyAgentMessage(`[系统通知] 用户已完成 3D 模型生成！已生成 ${readyItems.length}/${recommendedObjects.length} 个物体：\n${readyList}${pendingInfo}\n\n请根据已生成的模型继续进行场景规划，使用 ls 和 read 工具了解项目结构，然后生成场景布局文件。`);
                }}
                disabled={isChatGenerating}
              >
                <Check size={16} />
                已完成生成（{recommendedObjects.filter(o => o.status === 'ready').length}/{recommendedObjects.length}）
              </button>
            )}
          </div>

          <div className="scene-preview-wrapper">
            <SceneViewer
              sceneUrl={previewUrl}
              error={state.status === 'error' ? state.error : null}
            />
          </div>
        </main>

        {/* 右侧对话栏 */}
        <aside className="chat-sidebar">
          <ChatPanel
            disabled={isChatGenerating}
            sessionId={sessionId}
            onReset={handleReset}
            history={sessionAssets.map(s => ({
              session_id: s.session?.session_id,
              title: s.session?.title || '新对话',
              updated_at: s.session?.updated_at || s.session?.created_at || new Date().toISOString()
            }))}
            onSelectSession={handleSelectSession}
            onRefreshHistory={loadAllSessions}
            onPlanObjects={(objects) => {
              // Agent 规划出物品清单，更新中间区域显示
              const newObjects: RecommendedObject[] = objects.map((obj, idx) => ({
                id: `plan-${Date.now()}-${idx}`,
                name: obj.name,
                description: obj.description,
                status: 'pending',
                modelUrl: null,
                priority: 2,
              }));
              setRecommendedObjects(prev => {
                // 合并策略：保留所有已有物品 + 只添加新物品（纯增量，不删除）
                const byName = new Map<string, RecommendedObject>();
                // 保留 prev 中所有物品（包括 pending）
                for (const item of prev) {
                  byName.set(item.name, item);
                }
                // 只添加 prev 中不存在的物品
                for (const item of newObjects) {
                  if (!byName.has(item.name)) {
                    byName.set(item.name, item);
                  }
                }
                return Array.from(byName.values());
              });
            }}
            notifyMessage={notifyAgentMessage}
            onNotifyHandled={() => setNotifyAgentMessage(null)}
          />
        </aside>
      </div>
    </div>
  );
}

export default App;
