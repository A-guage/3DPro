import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { SceneViewerProps } from '@/types';
import { LoadingSpinner } from '@/components/LoadingSpinner/LoadingSpinner';
import { SCENE_CONFIG } from '@/services/constants';
import { centerModel, fitModelToView, setupModelMaterials } from '@/utils/threeHelpers';

const sanitizeUrl = (value: string): string => {
  const trimmed = (value || '').trim();
  if (!trimmed) return trimmed;
  const unquoted = trimmed
    .replace(/^['"`\s]+/, '')
    .replace(/['"`\s]+$/, '');
  return unquoted.trim();
};

type ModelErrorBoundaryProps = {
  onError?: (message: string) => void;
  children: React.ReactNode;
};

type ModelErrorBoundaryState = {
  hasError: boolean;
};

class ModelErrorBoundary extends React.Component<ModelErrorBoundaryProps, ModelErrorBoundaryState> {
  state: ModelErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : '模型加载失败';
    this.props.onError?.(message);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

// 3D场景组件
const Scene3D: React.FC<{
  sceneUrl: string;
  onLoad?: () => void;
  onError?: (error: string) => void;
}> = ({ sceneUrl, onLoad, onError }) => {
  const modelRef = useRef<THREE.Group>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 加载模型（自动检测格式：优先FBX，失败后降级GLTF）
  useEffect(() => {
    if (!sceneUrl) return;

    setLoadError(null);
    setScene(null);

    // 先尝试 FBXLoader
    const fbxLoader = new FBXLoader();
    console.log('Trying FBXLoader for:', sceneUrl);

    fbxLoader.load(
      sceneUrl,
      (loaded) => {
        console.log('FBXLoader succeeded!');
        setScene(loaded as THREE.Group);
      },
      undefined,
      (fbxError) => {
        console.warn('FBXLoader failed, trying GLTFLoader:', fbxError);
        // FBX失败，尝试GLTFLoader
        const gltfLoader = new GLTFLoader();
        gltfLoader.load(
          sceneUrl,
          (loaded) => {
            console.log('GLTFLoader succeeded!');
            setScene((loaded as any).scene as THREE.Group);
          },
          undefined,
          (gltfError) => {
            console.error('Both loaders failed. FBX error:', fbxError, 'GLTF error:', gltfError);
            setLoadError('模型加载失败，请检查文件格式');
            onError?.('模型加载失败');
          }
        );
      }
    );
  }, [sceneUrl, onError]);

  useEffect(() => {
    setIsLoaded(false);
  }, [sceneUrl]);

  useEffect(() => {
    if (scene && modelRef.current && !isLoaded && !loadError) {
      try {
        // 居中模型
        centerModel(modelRef.current);

        // 缩放模型以适配视图
        fitModelToView(modelRef.current);

        // 设置材质和阴影
        setupModelMaterials(modelRef.current, true);

        setIsLoaded(true);
        onLoad?.();
      } catch (error) {
        console.error('Failed to setup model:', error);
        onError?.(error instanceof Error ? error.message : '模型设置失败');
      }
    }
  }, [scene, onLoad, onError, isLoaded, loadError]);

  // 添加旋转动画
  useFrame((_, delta) => {
    if (modelRef.current && !isLoaded && scene) {
      modelRef.current.rotation.y += delta * 0.1;
    }
  });

  // 加载中或错误状态
  if (!scene && !loadError) {
    return null; // Suspense 会处理加载状态
  }

  if (loadError) {
    return null; // ErrorBoundary 会处理错误状态
  }

  return (
    <group ref={modelRef}>
      {scene && <primitive object={scene} />}
    </group>
  );
};

// 空状态组件
const EmptyState: React.FC = () => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-surface rounded-xl border-2 border-dashed border-gray-600">
      <div className="text-center text-text-secondary">
        <div className="mb-4">
          <svg
            className="w-16 h-16 mx-auto text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2">3D场景预览</h3>
        <p className="text-sm mb-4">在右侧输入场景描述，AI将自动生成3D模型</p>
        <div className="text-xs text-gray-500">
          <p>支持鼠标拖拽旋转、滚轮缩放</p>
          <p>例如：一个简约的现代客厅</p>
        </div>
      </div>
    </div>
  );
};

// 加载状态组件
const LoadingState: React.FC<{ progress?: number }> = ({ progress }) => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-surface rounded-xl">
      <div className="text-center">
        <LoadingSpinner
          size="large"
          type="progress"
          progress={progress}
          text="正在加载3D模型..."
        />
        {progress && (
          <p className="text-text-secondary text-sm mt-2">
            加载进度: {Math.round(progress)}%
          </p>
        )}
      </div>
    </div>
  );
};

// 错误状态组件
const ErrorState: React.FC<{ error: string; onRetry?: () => void }> = ({ error, onRetry }) => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-surface rounded-xl border-2 border-dashed border-red-600">
      <div className="text-center text-text-primary">
        <div className="mb-4">
          <svg
            className="w-16 h-16 mx-auto text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2 text-red-400">加载失败</h3>
        <p className="text-sm text-red-300 mb-4">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            重试
          </button>
        )}
      </div>
    </div>
  );
};

// 3D场景容器
const SceneContainer: React.FC<{
  sceneUrl?: string | null;
  onLoad?: () => void;
  onError?: (error: string) => void;
}> = ({ sceneUrl, onLoad, onError }) => {
  return (
    <>
      {/* 光照 */}
      <ambientLight intensity={SCENE_CONFIG.LIGHTS.AMBIENT.intensity} />
      <directionalLight
        position={SCENE_CONFIG.LIGHTS.DIRECTIONAL.position}
        intensity={SCENE_CONFIG.LIGHTS.DIRECTIONAL.intensity}
        castShadow={SCENE_CONFIG.LIGHTS.DIRECTIONAL.castShadow}
      />

      {/* 网格辅助线 */}
      <Grid
        args={[20, 20]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#475569"
        fadeDistance={25}
        fadeStrength={1}
        followCamera={false}
      />

      {/* 3D模型 */}
      {sceneUrl && (
        <ModelErrorBoundary onError={onError}>
          <Suspense fallback={null}>
            <Scene3D sceneUrl={sceneUrl} onLoad={onLoad} onError={onError} />
          </Suspense>
        </ModelErrorBoundary>
      )}

      {/* 相机控制 */}
      <PerspectiveCamera
        makeDefault
        position={SCENE_CONFIG.CAMERA_POSITION}
        fov={SCENE_CONFIG.CAMERA_FOV}
      />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2}
      />
    </>
  );
};

// 主组件
export const SceneViewer: React.FC<SceneViewerProps> = ({
  sceneUrl,
  error,
  onLoad: _onLoad,
  onError: _onError
}) => {
  const [loadProgress, setLoadProgress] = useState(0);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);

  const displayError = error || internalError;
  const cleanedSceneUrl = sceneUrl ? sanitizeUrl(sceneUrl) : null;

  useEffect(() => {
    if (!cleanedSceneUrl) {
      setLoadProgress(0);
      setInternalError(null);
      return;
    }
    setLoadProgress(0);
    const interval = window.setInterval(() => {
      setLoadProgress(prev => {
        if (prev >= 90) {
          window.clearInterval(interval);
          return prev;
        }
        return Math.min(prev + 10, 90);
      });
    }, 200);
    return () => window.clearInterval(interval);
  }, [cleanedSceneUrl]);

  useEffect(() => {
    if (!cleanedSceneUrl) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setLoadProgress(prev => (prev < 100 ? 100 : prev));
    }, 30000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [cleanedSceneUrl]);

  return (
    <div className="w-full h-full bg-dark rounded-xl overflow-hidden relative">
      {!cleanedSceneUrl && !displayError && <EmptyState />}
      {displayError && (
        <ErrorState
          error={displayError}
          onRetry={
            cleanedSceneUrl
              ? () => {
                  setInternalError(null);
                  setLoadProgress(0);
                  setCanvasKey(prev => prev + 1);
                }
              : undefined
          }
        />
      )}
      {cleanedSceneUrl && !displayError && (
        <>
          <Canvas
            key={canvasKey}
            shadows
            gl={{ antialias: true, alpha: false }}
            style={{ background: '#0a0a0a' }}
            onError={(e) => {
              console.error('Canvas error:', e);
              setInternalError('WebGL 渲染错误');
            }}
          >
            <color attach="background" args={['#0a0a0a']} />
            <Suspense fallback={null}>
              <SceneContainer
                sceneUrl={cleanedSceneUrl}
                onLoad={() => {
                  setLoadProgress(100);
                }}
                onError={(err) => {
                  console.error('SceneContainer error:', err);
                  setInternalError(err);
                }}
              />
            </Suspense>
          </Canvas>
          {loadProgress < 100 && <LoadingState progress={loadProgress} />}
        </>
      )}
    </div>
  );
};

export default SceneViewer;
