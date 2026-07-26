import React from 'react';
import { LoadingSpinnerProps } from '@/types';

/**
 * 加载动画组件
 * 功能：
 * 1. 三种尺寸：small（16px）、medium（24px）、large（32px）
 * 2. 两种类型：环形旋转动画、进度条动画
 * 3. 可配置颜色
 * 4. 支持文字提示
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  type = 'spinner',
  color = 'text-primary',
  text,
  progress,
}) => {
  // 尺寸映射
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-6 h-6',
    large: 'w-8 h-8',
  };
  
  const sizeClass = sizeClasses[size];
  
  // 环形旋转动画
  const renderSpinner = () => (
    <div className={`${sizeClass} ${color} animate-spin`}>
      <svg
        className="w-full h-full"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
  
  // 进度条动画
  const renderProgress = () => {
    const progressValue = progress !== undefined ? progress : 0;
    
    return (
      <div className="w-full">
        <div className="relative">
          {/* 背景圆环 */}
          <svg
            className={`${sizeClass} transform -rotate-90`}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              className="opacity-20"
            />
            {/* 进度圆环 */}
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 10}`}
              strokeDashoffset={`${2 * Math.PI * 10 * (1 - progressValue / 100)}`}
              className="opacity-100 transition-all duration-300 ease-out"
              style={{
                transition: 'stroke-dashoffset 0.3s ease-out',
              }}
            />
          </svg>
          {/* 进度文本 */}
          {progress !== undefined && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-medium text-current">
                {Math.round(progressValue)}%
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // 脉冲动画
  const renderPulse = () => (
    <div className={`${sizeClass} ${color}`}>
      <div className="w-full h-full bg-current rounded-full animate-pulse"></div>
    </div>
  );
  
  // 点状动画
  const renderDots = () => (
    <div className="flex space-x-1">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={`${size === 'small' ? 'w-1 h-1' : size === 'medium' ? 'w-2 h-2' : 'w-3 h-3'} 
                     ${color} rounded-full animate-bounce`}
          style={{
            animationDelay: `${index * 0.15}s`,
            animationDuration: '1s',
          }}
        />
      ))}
    </div>
  );
  
  // 根据类型渲染不同的动画
  const renderAnimation = () => {
    switch (type) {
      case 'progress':
        return renderProgress();
      case 'pulse':
        return renderPulse();
      case 'dots':
        return renderDots();
      case 'spinner':
      default:
        return renderSpinner();
    }
  };
  
  return (
    <div className="flex flex-col items-center justify-center">
      {renderAnimation()}
      {text && (
        <span className={`text-xs text-gray-400 mt-2 ${color}`}>
          {text}
        </span>
      )}
    </div>
  );
};

// 导出不同类型的加载动画组件
export const LoadingSpinnerRing: React.FC<Omit<LoadingSpinnerProps, 'type'>> = (props) => (
  <LoadingSpinner {...props} type="spinner" />
);

export const LoadingSpinnerProgress: React.FC<LoadingSpinnerProps> = (props) => (
  <LoadingSpinner {...props} type="progress" />
);

export const LoadingSpinnerPulse: React.FC<Omit<LoadingSpinnerProps, 'type'>> = (props) => (
  <LoadingSpinner {...props} type="pulse" />
);

export const LoadingSpinnerDots: React.FC<Omit<LoadingSpinnerProps, 'type'>> = (props) => (
  <LoadingSpinner {...props} type="dots" />
);