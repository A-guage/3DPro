import React, { useCallback } from 'react';
import { 
  ControlPanelProps,
  ScenePhase,
  SceneEvent,
  SceneObjectInfo
} from '@/types';
import { LoadingSpinner } from '@/components/LoadingSpinner/LoadingSpinner';
import { 
  getQualityLabel, 
  getComplexityLabel, 
  formatDate,
  truncateText 
} from '@/utils/format';
import { GENERATION_CONFIG, EXAMPLE_DESCRIPTIONS } from '@/services/constants';
import { 
  Wand2, 
  Download, 
  RotateCcw, 
  AlertCircle,
  CheckCircle,
  Sparkles
} from 'lucide-react';

// 场景描述输入区
const SceneInput: React.FC<{
  description: string;
  onChange: (description: string) => void;
}> = ({ description, onChange }) => {
  const handleExampleClick = (example: string) => {
    onChange(example);
  };
  
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-text-primary">
        场景描述
      </label>
      <div className="relative">
        <textarea
          value={description}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例如：一个简约的现代客厅，有灰色沙发、玻璃茶几和木质电视柜..."
          rows={4}
          className="w-full px-4 py-3 bg-surface border-2 border-gray-600 rounded-xl text-text-primary placeholder:text-text-secondary resize-none focus:outline-none focus:border-primary transition-colors"
          maxLength={GENERATION_CONFIG.MAX_DESCRIPTION_LENGTH}
        />
        <div className="absolute bottom-2 right-3 text-xs text-text-secondary">
          {description.length}/{GENERATION_CONFIG.MAX_DESCRIPTION_LENGTH}
        </div>
      </div>
      
      {/* 示例按钮 */}
      <div className="space-y-2">
        <p className="text-xs text-text-secondary">点击示例快速开始：</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_DESCRIPTIONS.slice(0, 3).map((example, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(example)}
              className="px-3 py-1 text-xs bg-surface hover:bg-gray-700 text-text-secondary rounded-lg transition-colors border border-gray-600"
            >
              {truncateText(example, 20)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// 生成参数选择区
const GenerationParams: React.FC<{
  quality: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'medium' | 'complex';
  onQualityChange: (quality: 'low' | 'medium' | 'high') => void;
  onComplexityChange: (complexity: 'simple' | 'medium' | 'complex') => void;
}> = ({ quality, complexity, onQualityChange, onComplexityChange }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-text-primary">生成参数</h3>
      
      {/* 生成质量 */}
      <div className="space-y-2">
        <label className="block text-xs text-text-secondary">生成质量</label>
        <select
          value={quality}
          onChange={(e) => onQualityChange(e.target.value as 'low' | 'medium' | 'high')}
          className="w-full px-3 py-2 bg-surface border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-primary transition-colors"
        >
          <option value="low">{getQualityLabel('low')}</option>
          <option value="medium">{getQualityLabel('medium')}</option>
          <option value="high">{getQualityLabel('high')}</option>
        </select>
      </div>
      
      {/* 场景复杂度 */}
      <div className="space-y-2">
        <label className="block text-xs text-text-secondary">场景复杂度</label>
        <select
          value={complexity}
          onChange={(e) => onComplexityChange(e.target.value as 'simple' | 'medium' | 'complex')}
          className="w-full px-3 py-2 bg-surface border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-primary transition-colors"
        >
          <option value="simple">{getComplexityLabel('simple')}</option>
          <option value="medium">{getComplexityLabel('medium')}</option>
          <option value="complex">{getComplexityLabel('complex')}</option>
        </select>
      </div>
    </div>
  );
};

// 生成控制区
const ActionButtons: React.FC<{
  isGenerating: boolean;
  status: string;
  description: string;
  onGenerate: () => void;
  onDownload: () => void;
  onReset: () => void;
}> = ({ isGenerating, status, description, onGenerate, onDownload, onReset }) => {
  const canGenerate = !isGenerating && description.trim().length > 0;
  const canDownload = status === 'ready';
  
  return (
    <div className="space-y-3">
      {/* 生成按钮 */}
      <button
        onClick={onGenerate}
        disabled={!canGenerate}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg"
      >
        {isGenerating ? (
          <>
            <LoadingSpinner size="small" />
            <span>生成中...</span>
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4" />
            <span>生成3D场景</span>
          </>
        )}
      </button>
      
      {/* 次要按钮 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onDownload}
          disabled={!canDownload}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-surface hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-text-primary rounded-lg transition-colors border border-gray-600"
        >
          <Download className="w-4 h-4" />
          <span className="text-sm">下载GLB</span>
        </button>
        
        <button
          onClick={onReset}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-surface hover:bg-gray-700 text-text-primary rounded-lg transition-colors border border-gray-600"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="text-sm">重置</span>
        </button>
      </div>
    </div>
  );
};

// 生成状态显示区
const StatusDisplay: React.FC<{
  status: string;
  progress: number;
  sceneId: string | null;
  error: string | null;
  onRetry: () => void;
}> = ({ status, progress, sceneId, error, onRetry }) => {
  if (status === 'idle') {
    return null;
  }
  
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-text-primary">生成状态</h3>
      
      {/* 处理中状态 */}
      {(status === 'generating' || status === 'polling' || status === 'loading') && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <LoadingSpinner size="medium" />
            <div>
              <p className="text-sm font-medium text-text-primary">
                {status === 'generating' && '正在生成场景...'}
                {status === 'polling' && '正在处理场景...'}
                {status === 'loading' && '正在加载3D模型...'}
              </p>
              <p className="text-xs text-text-secondary">
                预计需要1-3分钟
              </p>
            </div>
          </div>
          
          {/* 进度条 */}
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <p className="text-xs text-text-secondary mt-2">
            进度: {Math.round(progress)}%
          </p>
        </div>
      )}
      
      {/* 完成状态 */}
      {status === 'ready' && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-sm font-medium text-text-primary">场景生成完成！</p>
              {sceneId && (
                <p className="text-xs text-text-secondary">
                  场景ID: {sceneId.substring(0, 8)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* 错误状态 */}
      {status === 'error' && error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">生成失败</p>
              <p className="text-xs text-red-300 mt-1">{error}</p>
              <button
                onClick={onRetry}
                className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
              >
                重试
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StageProgressBar: React.FC<{
  sceneStatus: ScenePhase;
  progress: number;
}> = ({ sceneStatus, progress }) => {
  const stages: { key: ScenePhase; label: string }[] = [
    { key: 'planning', label: '规划场景' },
    { key: 'generating_objects', label: '生成物体' },
    { key: 'composing', label: '合成场景' },
    { key: 'ready', label: '完成' },
  ];
  const currentIndex = stages.findIndex(s => s.key === sceneStatus);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-text-secondary">
        {stages.map((stage, index) => {
          const active = index <= currentIndex || (sceneStatus === 'failed' && index === currentIndex);
          return (
            <div key={stage.key} className="flex-1 flex flex-col items-center">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium',
                  active ? 'bg-primary text-white' : 'bg-gray-700 text-gray-400',
                ].join(' ')}
              >
                {index + 1}
              </div>
              <span className="mt-1">{stage.label}</span>
            </div>
          );
        })}
      </div>
      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
        />
      </div>
    </div>
  );
};

const TaskDashboard: React.FC<{
  sceneId: string | null;
  status: ControlPanelProps['status'];
  sceneStatus: ScenePhase;
  progress: number;
  currentStageLabel: string;
  error: string | null;
}> = ({ sceneId, status, sceneStatus, progress, currentStageLabel, error }) => {
  const displayStatus =
    status === 'error'
      ? '失败'
      : sceneStatus === 'ready'
      ? '已完成'
      : sceneStatus === 'planning'
      ? '规划中'
      : sceneStatus === 'generating_objects'
      ? '生成物体中'
      : sceneStatus === 'composing'
      ? '合成场景中'
      : '处理中';
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 bg-surface border border-gray-700 rounded-lg p-3 flex items-center justify-between">
        <div className="text-sm text-text-secondary">场景ID</div>
        <button
          className="text-xs text-primary underline disabled:text-gray-500"
          disabled={!sceneId}
          onClick={() => {
            if (!sceneId) return;
            navigator.clipboard.writeText(sceneId).catch(() => undefined);
          }}
        >
          {sceneId || '尚未生成'}
        </button>
      </div>
      <div className="bg-surface border border-gray-700 rounded-lg p-3 flex flex-col gap-1">
        <div className="text-xs text-text-secondary">整体进度</div>
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold text-text-primary">{Math.round(progress)}%</div>
          <div className="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
            />
          </div>
        </div>
        <div className="text-xs text-text-secondary">
          {currentStageLabel || '等待开始'}
        </div>
      </div>
      <div className="bg-surface border border-gray-700 rounded-lg p-3 flex flex-col gap-1">
        <div className="text-xs text-text-secondary">当前状态</div>
        <div className="flex items-center gap-2">
          <div
            className={[
              'w-2 h-2 rounded-full',
              status === 'error'
                ? 'bg-red-500'
                : sceneStatus === 'ready'
                ? 'bg-green-500'
                : 'bg-yellow-400',
            ].join(' ')}
          />
          <span className="text-sm text-text-primary">{displayStatus}</span>
        </div>
        {error && (
          <div className="text-xs text-red-400 truncate">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

const EventLog: React.FC<{
  events: SceneEvent[];
}> = ({ events }) => {
  if (!events.length) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">事件日志</h3>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
        {events
          .slice()
          .reverse()
          .map(event => (
            <div
              key={event.id}
              className={[
                'px-2 py-1 rounded border',
                event.type === 'error'
                  ? 'border-red-500/60 bg-red-500/10 text-red-200'
                  : 'border-gray-600 bg-gray-800 text-text-secondary',
              ].join(' ')}
            >
              <span className="mr-2 text-[10px] text-gray-400">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span>{event.message}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

const ObjectsPanel: React.FC<{
  objects: SceneObjectInfo[];
  onSelectObject: (object: SceneObjectInfo) => void;
  onViewScene: () => void;
  hasScene: boolean;
}> = ({ objects, onSelectObject, onViewScene, hasScene }) => {
  if (!objects.length) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">物体列表</h3>
        {hasScene && (
          <button
            type="button"
            onClick={onViewScene}
            className="text-[11px] text-primary hover:underline"
          >
            查看场景
          </button>
        )}
      </div>
      <div className="max-h-40 overflow-y-auto grid grid-cols-2 gap-2 text-xs">
        {objects.map(obj => (
          <div
            key={obj.objectId}
            className={[
              'p-2 rounded border',
              obj.status === 'ready'
                ? 'border-green-500/60 bg-green-500/5 cursor-pointer hover:border-primary hover:bg-primary/10'
                : obj.status === 'processing'
                ? 'border-yellow-500/60 bg-yellow-500/5 opacity-60 cursor-not-allowed'
                : obj.status === 'failed'
                ? 'border-red-500/60 bg-red-500/5 opacity-60 cursor-not-allowed'
                : 'border-gray-600 bg-gray-800/40 opacity-60 cursor-not-allowed',
            ].join(' ')}
            onClick={() => {
              if (obj.status === 'ready' && obj.modelUrl) {
                onSelectObject(obj);
              }
            }}
          >
            <div className="truncate text-text-primary mb-1">{obj.objectId}</div>
            <div className="text-[11px] text-text-secondary">
              状态: {obj.status === 'ready' ? '已完成' : obj.status === 'processing' ? '生成中' : obj.status === 'failed' ? '失败' : '等待'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 历史记录组件
const HistoryPanel: React.FC<{
  history: Array<{
    id: string;
    description: string;
    timestamp: Date;
    sceneUrl?: string;
  }>;
  onSelectHistory: (sceneId: string) => void;
}> = ({ history, onSelectHistory }) => {
  if (history.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-text-primary">最近生成</h3>
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {history.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="p-2 bg-surface border border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors"
            onClick={() => onSelectHistory(item.id)}
          >
            <p className="text-xs text-text-primary line-clamp-2">
              {item.description}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {formatDate(new Date(item.timestamp))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

// 主组件
export const ControlPanel: React.FC<ControlPanelProps> = ({
  description,
  quality,
  complexity,
  isGenerating,
  status,
  progress,
  sceneId,
  sceneUrl: _sceneUrl, // 保留接口一致性，但当前未使用
  error,
  sceneStatus,
  currentStageLabel,
  objects,
  events,
  history,
  onSelectObject,
  onViewScene,
  onSelectHistory,
  onDescriptionChange,
  onQualityChange,
  onComplexityChange,
  onGenerate,
  onDownload,
  onReset,
  onRetry,
}) => {
  const handleGenerate = useCallback(() => {
    onGenerate();
  }, [onGenerate]);
  
  const handleRetry = useCallback(() => {
    onRetry();
  }, [onRetry]);
  
  return (
    <div className="w-full h-full bg-surface rounded-xl p-6 overflow-y-auto">
      <div className="space-y-6">
        {/* 标题 */}
        <div className="text-center">
          <h2 className="text-xl font-bold text-text-primary flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            场景控制
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            描述您想要的3D场景
          </p>
        </div>
        
        <StageProgressBar sceneStatus={sceneStatus} progress={progress} />
        
        <TaskDashboard
          sceneId={sceneId}
          status={status}
          sceneStatus={sceneStatus}
          progress={progress}
          currentStageLabel={currentStageLabel}
          error={error}
        />
        
        {/* 场景描述输入 */}
        <SceneInput 
          description={description} 
          onChange={onDescriptionChange} 
        />
        
        {/* 生成参数 */}
        <GenerationParams
          quality={quality}
          complexity={complexity}
          onQualityChange={onQualityChange}
          onComplexityChange={onComplexityChange}
        />
        
        {/* 控制按钮 */}
        <ActionButtons
          isGenerating={isGenerating}
          status={status}
          description={description}
          onGenerate={handleGenerate}
          onDownload={onDownload}
          onReset={onReset}
        />
        
        {/* 状态显示 */}
        <StatusDisplay
          status={status}
          progress={progress}
          sceneId={sceneId}
          error={error}
          onRetry={handleRetry}
        />
        <ObjectsPanel objects={objects} onSelectObject={onSelectObject} onViewScene={onViewScene} hasScene={Boolean(_sceneUrl)} />
        <EventLog events={events} />
        
        {/* 历史记录 */}
        <HistoryPanel history={history} onSelectHistory={onSelectHistory} />
      </div>
    </div>
  );
};
