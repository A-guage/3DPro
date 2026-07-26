import * as THREE from 'three';
import { SCENE_CONFIG } from '@/services/constants';

/**
 * Three.js工具函数
 * 提供常用的3D场景操作功能
 */

/**
 * 创建基础场景配置
 */
export const createSceneSetup = () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_CONFIG.BACKGROUND_COLOR);
  
  // 创建相机
  const camera = new THREE.PerspectiveCamera(
    SCENE_CONFIG.CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    SCENE_CONFIG.CAMERA_NEAR,
    SCENE_CONFIG.CAMERA_FAR
  );
  camera.position.set(...SCENE_CONFIG.CAMERA_POSITION);
  
  // 创建光照
  const ambientLight = new THREE.AmbientLight(
    0xffffff,
    SCENE_CONFIG.LIGHTS.AMBIENT.intensity
  );
  
  const directionalLight = new THREE.DirectionalLight(
    0xffffff,
    SCENE_CONFIG.LIGHTS.DIRECTIONAL.intensity
  );
  directionalLight.position.set(...SCENE_CONFIG.LIGHTS.DIRECTIONAL.position);
  directionalLight.castShadow = SCENE_CONFIG.LIGHTS.DIRECTIONAL.castShadow;
  
  scene.add(ambientLight);
  scene.add(directionalLight);
  
  return { scene, camera, lights: { ambient: ambientLight, directional: directionalLight } };
};

/**
 * 计算模型的边界框并居中
 */
export const centerModel = (object: THREE.Object3D): THREE.Box3 => {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  
  // 居中模型
  object.position.sub(center);
  
  return box;
};

/**
 * 缩放模型以适应视图
 */
export const fitModelToView = (
  object: THREE.Object3D,
  targetHeight: number = 5
): number => {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  
  if (maxDim === 0) return 1;
  
  const scale = targetHeight / maxDim;
  object.scale.multiplyScalar(scale);
  
  return scale;
};

/**
 * 设置模型材质和阴影
 */
export const setupModelMaterials = (object: THREE.Object3D, castShadow: boolean = true): void => {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      // 启用阴影
      child.castShadow = castShadow;
      child.receiveShadow = true;
      
      // 处理材质
      if (Array.isArray(child.material)) {
        child.material.forEach(material => {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.envMapIntensity = 0.8;
          }
        });
      } else if (child.material instanceof THREE.MeshStandardMaterial) {
        child.material.envMapIntensity = 0.8;
      }
    }
  });
};

/**
 * 创建环境贴图
 */
export const createEnvironmentMap = (scene: THREE.Scene): void => {
  // 这里可以根据需要加载不同的环境贴图
  // 暂时使用基础的环境光
  scene.environment = null;
};

/**
 * 平滑相机动画
 */
export const animateCamera = (
  camera: THREE.PerspectiveCamera,
  targetPosition: THREE.Vector3,
  targetLookAt: THREE.Vector3,
  duration: number = 1000
): Promise<void> => {
  return new Promise((resolve) => {
    const startPosition = camera.position.clone();
    const startQuaternion = camera.quaternion.clone();
    
    // 创建临时相机来计算目标四元数
    const tempCamera = camera.clone();
    tempCamera.position.copy(targetPosition);
    tempCamera.lookAt(targetLookAt);
    const targetQuaternion = tempCamera.quaternion.clone();
    
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // 使用缓动函数
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      // 插值位置
      camera.position.lerpVectors(startPosition, targetPosition, easeProgress);
      
      // 插值旋转
      camera.quaternion.slerpQuaternions(startQuaternion, targetQuaternion, easeProgress);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    };
    
    animate();
  });
};

/**
 * 创建地面网格
 */
export const createGround = (size: number = 20): THREE.Mesh => {
  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.2,
  });
  
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  
  return ground;
};

/**
 * 创建网格辅助线
 */
export const createGridHelper = (size: number = 20, divisions: number = 20): THREE.GridHelper => {
  const gridHelper = new THREE.GridHelper(size, divisions, 0x334155, 0x334155);
  gridHelper.material.opacity = 0.3;
  (gridHelper.material as THREE.Material).transparent = true;
  
  return gridHelper;
};

/**
 * 处理窗口大小变化
 */
export const handleResize = (
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer
): void => {
  const handleResizeEvent = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    
    renderer.setSize(width, height);
  };
  
  window.addEventListener('resize', handleResizeEvent);
  
  // 返回清理函数
  (handleResize as any).cleanup = () => {
    window.removeEventListener('resize', handleResizeEvent);
  };
};

/**
 * 清理Three.js资源
 */
export const disposeThreeResources = (object: THREE.Object3D): void => {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(material => {
            material.dispose();
            disposeMaterialTextures(material);
          });
        } else {
          child.material.dispose();
          disposeMaterialTextures(child.material);
        }
      }
    }
  });
};

/**
 * 清理材质纹理
 */
const disposeMaterialTextures = (material: THREE.Material): void => {
  const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'envMap'];
  
  textureProps.forEach(prop => {
    const texture = (material as any)[prop];
    if (texture && texture.dispose) {
      texture.dispose();
    }
  });
};
