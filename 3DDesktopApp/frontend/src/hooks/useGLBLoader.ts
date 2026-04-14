import { useState, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { UseGLBLoaderReturn } from '@/types';

type LoadedModel = {
  scene: THREE.Group;
  format: 'gltf' | 'fbx';
  [key: string]: any;
};

const modelCache = new Map<string, LoadedModel>();

/**
 * GLB模型加载Hook
 * 功能：
 * 1. 加载GLB格式3D模型
 * 2. 显示加载进度
 * 3. 错误处理
 * 4. 模型缓存
 * 5. 释放资源
 */
export const useGLBLoader = (): UseGLBLoaderReturn => {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  
  // 使用useRef来跟踪当前加载的URL，避免竞态条件
  const currentUrlRef = useRef<string | null>(null);
  
  /**
   * 加载模型
   */
  const loadModel = useCallback(async (url: string) => {
    // 如果正在加载其他模型，先清理
    if (currentUrlRef.current && currentUrlRef.current !== url) {
      clearModel();
    }
    
    currentUrlRef.current = url;
    
    try {
      // 重置状态
      setLoading(true);
      setError(null);
      setProgress(0);
      
      // 检查缓存
      if (modelCache.has(url)) {
        console.log('Loading model from cache:', url);
        const cachedModel = modelCache.get(url)!;
        setModel(cachedModel);
        setProgress(100);
        setLoading(false);
        return;
      }
      
      const loaderType = url.toLowerCase().endsWith('.fbx') ? 'fbx' : 'gltf';
      console.log('Loading model from URL:', url, 'Format:', loaderType);

      let loadedModel: LoadedModel;

      if (loaderType === 'fbx') {
        const fbxLoader = new FBXLoader();
        const fbx = await new Promise<THREE.Group>((resolve, reject) => {
          fbxLoader.load(
            url,
            (loaded: THREE.Group) => resolve(loaded),
            (evt: ProgressEvent<EventTarget>) => {
              const total = (evt as any).total as number | undefined;
              const loaded = (evt as any).loaded as number | undefined;
              if (typeof total === 'number' && total > 0 && typeof loaded === 'number') {
                const pct = (loaded / total) * 100;
                setProgress(Math.min(99, Math.max(0, pct)));
              }
            },
            (err: unknown) => reject(err)
          );
        });
        loadedModel = { scene: fbx, format: 'fbx' };
      } else {
        const gltfLoader = new GLTFLoader();
        const gltf = await new Promise<LoadedModel>((resolve, reject) => {
          gltfLoader.load(
            url,
            (loaded: unknown) => resolve({ ...(loaded as any), format: 'gltf' as const }),
            (evt: ProgressEvent<EventTarget>) => {
              const total = (evt as any).total as number | undefined;
              const loaded = (evt as any).loaded as number | undefined;
              if (typeof total === 'number' && total > 0 && typeof loaded === 'number') {
                const pct = (loaded / total) * 100;
                setProgress(Math.min(99, Math.max(0, pct)));
              }
            },
            (err: unknown) => reject(err)
          );
        });
        loadedModel = gltf;
      }

      // 检查是否是当前请求的URL
      if (currentUrlRef.current !== url) {
        // 如果不是，释放资源
        loadedModel.scene.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        return;
      }

      // 缓存模型
      modelCache.set(url, loadedModel);

      // 更新状态
      setModel(loadedModel);
      setProgress(100);
      setLoading(false);
      
      console.log('Model loaded successfully:', url);
      
    } catch (err) {
      console.error('Failed to load model:', err);
      
      // 检查是否是当前请求的URL
      if (currentUrlRef.current === url) {
        setError(err instanceof Error ? err.message : '模型加载失败');
        setLoading(false);
        setProgress(0);
      }
    }
  }, []);
  
  /**
   * 清理模型资源
   */
  const clearModel = useCallback(() => {
    if (model) {
      console.log('Disposing model resources');
      
      // 遍历场景中的所有对象并释放资源
      model.scene.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          // 释放几何体
          if (child.geometry) {
            child.geometry.dispose();
          }
          
          // 释放材质
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(material => {
                material.dispose();
                // 释放纹理
                Object.values(material).forEach((value) => {
                  if (value && typeof value === 'object' && 'dispose' in value && typeof (value as any).dispose === 'function') {
                    (value as any).dispose();
                  }
                });
              });
            } else {
              child.material.dispose();
              Object.values(child.material).forEach((value) => {
                if (value && typeof value === 'object' && 'dispose' in value && typeof (value as any).dispose === 'function') {
                  (value as any).dispose();
                }
              });
            }
          }
        }
      });
      
      // 从缓存中移除
      if (currentUrlRef.current) {
        modelCache.delete(currentUrlRef.current);
      }
    }
    
    // 重置状态
    setModel(null);
    setLoading(false);
    setError(null);
    setProgress(0);
    currentUrlRef.current = null;
  }, [model]);
  
  return {
    model,
    loading,
    error,
    progress,
    loadModel,
    clearModel,
  };
};
