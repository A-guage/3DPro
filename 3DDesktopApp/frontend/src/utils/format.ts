/**
 * 格式化函数
 * 提供常用的数据格式化功能
 */

/**
 * 格式化文件大小
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 格式化时间
 */
export const formatTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (remainingSeconds === 0) {
    return `${minutes}分钟`;
  }
  
  return `${minutes}分${remainingSeconds}秒`;
};

/**
 * 格式化日期
 */
export const formatDate = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) {
    return '刚刚';
  }
  
  if (minutes < 60) {
    return `${minutes}分钟前`;
  }
  
  if (hours < 24) {
    return `${hours}小时前`;
  }
  
  if (days < 7) {
    return `${days}天前`;
  }
  
  return date.toLocaleDateString('zh-CN');
};

/**
 * 截断文本
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength) + '...';
};

/**
 * 格式化场景ID
 */
export const formatSceneId = (sceneId: string): string => {
  if (!sceneId) return '';
  
  // 只显示前8个字符
  return sceneId.substring(0, 8);
};

/**
 * 获取质量标签
 */
export const getQualityLabel = (quality: string): string => {
  const labels = {
    low: '快速（低质量）',
    medium: '标准（推荐）',
    high: '高质量（较慢）',
  };
  
  return labels[quality as keyof typeof labels] || quality;
};

/**
 * 获取复杂度标签
 */
export const getComplexityLabel = (complexity: string): string => {
  const labels = {
    simple: '简单（3-5个物体）',
    medium: '中等（5-8个物体）',
    complex: '复杂（8-12个物体）',
  };
  
  return labels[complexity as keyof typeof labels] || complexity;
};

/**
 * 获取状态标签
 */
export const getStatusLabel = (status: string): string => {
  const labels = {
    idle: '就绪',
    generating: '生成中',
    polling: '处理中',
    loading: '加载中',
    ready: '已完成',
    error: '错误',
  };
  
  return labels[status as keyof typeof labels] || status;
};

/**
 * 获取状态颜色
 */
export const getStatusColor = (status: string): string => {
  const colors = {
    idle: 'text-gray-400',
    generating: 'text-blue-400',
    polling: 'text-blue-400',
    loading: 'text-yellow-400',
    ready: 'text-green-400',
    error: 'text-red-400',
  };
  
  return colors[status as keyof typeof colors] || 'text-gray-400';
};

/**
 * 防抖函数
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * 节流函数
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * 生成随机ID
 */
export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

/**
 * 复制到剪贴板
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return false;
  }
};

/**
 * 下载文件
 */
export const downloadFile = (url: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};