import React, { useState, useCallback } from 'react';
import { motion, Variants, Transition } from 'framer-motion';

// ============================================
// Material Design 缓动函数 (Easing Functions)
// ============================================

// 标准缓动 - 用于大多数动画
export const easeStandard: [number, number, number, number] = [0.4, 0, 0.2, 1];

// 减速缓动 - 用于进入动画
export const easeDecelerate: [number, number, number, number] = [0, 0, 0.2, 1];

// 加速缓动 - 用于退出动画
export const easeAccelerate: [number, number, number, number] = [0.4, 0, 1, 1];

// 强调缓动 - 用于需要引起注意的动画
export const easeEmphasized: [number, number, number, number] = [0.2, 0, 0, 1];

// ============================================
// 通用动画变体 (Animation Variants)
// ============================================

// 淡入上移动画
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
};

// 淡入缩放动画
export const fadeInScale: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 }
};

// 弹性缩放动画
export const springScale: Variants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: { 
    scale: 1, 
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 20 }
  },
  exit: { scale: 0.8, opacity: 0 }
};

// 列表项交错动画
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1
    }
  }
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 15 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { ease: easeDecelerate, duration: 0.3 }
  }
};

// 模态框动画
export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 }
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 20 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 30 }
  },
  exit: { 
    opacity: 0, 
    scale: 0.95, 
    y: 20,
    transition: { duration: 0.2, ease: easeAccelerate }
  }
};

// ============================================
// 通用过渡配置 (Transition Configs)
// ============================================

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30
};

export const smoothTransition: Transition = {
  duration: 0.3,
  ease: easeStandard
};

export const quickTransition: Transition = {
  duration: 0.15,
  ease: easeStandard
};

// ============================================
// 波纹效果组件 (Ripple Effect)
// ============================================

interface RippleData {
  id: number;
  x: number;
  y: number;
  size: number;
}

interface RippleButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
  disabled?: boolean;
  rippleColor?: string;
}

export const RippleButton: React.FC<RippleButtonProps> = ({ 
  children, 
  onClick, 
  className = '',
  disabled = false,
  rippleColor = 'rgba(255, 255, 255, 0.4)'
}) => {
  const [ripples, setRipples] = useState<RippleData[]>([]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2;
    
    const newRipple: RippleData = { id: Date.now(), x, y, size };
    setRipples(prev => [...prev, newRipple]);
    
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 600);

    onClick?.(event);
  }, [onClick, disabled]);

  return (
    <div 
      className={`relative overflow-hidden ${className}`} 
      onClick={handleClick}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {children}
      {ripples.map(ripple => (
        <motion.span
          key={ripple.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: ripple.x - ripple.size / 2,
            top: ripple.y - ripple.size / 2,
            width: ripple.size,
            height: ripple.size,
            backgroundColor: rippleColor,
          }}
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 0.6, ease: easeDecelerate }}
        />
      ))}
    </div>
  );
};

// ============================================
// 动画包装组件 (Animation Wrappers)
// ============================================

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  delay?: number;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({ 
  children, 
  className = '', 
  onClick,
  delay = 0 
}) => {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ 
        duration: 0.3, 
        ease: easeDecelerate,
        delay 
      }}
      whileHover={{ 
        y: -4,
        transition: { duration: 0.2, ease: easeStandard }
      }}
      whileTap={{ 
        scale: 0.98,
        transition: { duration: 0.1, ease: easeStandard }
      }}
    >
      {children}
    </motion.div>
  );
};

// 按钮悬停动画组件
interface AnimatedButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({ 
  children, 
  className = '', 
  onClick,
  disabled = false,
  type = 'button'
}) => {
  return (
    <motion.button
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { 
        scale: 1.02,
        transition: { duration: 0.2, ease: easeStandard }
      }}
      whileTap={disabled ? {} : { 
        scale: 0.96,
        transition: { duration: 0.1, ease: easeStandard }
      }}
    >
      {children}
    </motion.button>
  );
};

// 图标按钮动画组件
interface AnimatedIconButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  disabled?: boolean;
}

export const AnimatedIconButton: React.FC<AnimatedIconButtonProps> = ({ 
  children, 
  className = '', 
  onClick,
  title,
  disabled = false
}) => {
  return (
    <motion.button
      className={className}
      onClick={onClick}
      title={title}
      disabled={disabled}
      whileHover={disabled ? {} : { 
        scale: 1.1,
        rotate: 5,
        transition: { type: 'spring', stiffness: 400, damping: 17 }
      }}
      whileTap={disabled ? {} : { 
        scale: 0.9,
        transition: { duration: 0.1 }
      }}
    >
      {children}
    </motion.button>
  );
};

// 列表容器动画
interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
}

export const AnimatedList: React.FC<AnimatedListProps> = ({ children, className = '' }) => {
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {children}
    </motion.div>
  );
};

// 列表项动画
interface AnimatedListItemProps {
  children: React.ReactNode;
  className?: string;
}

export const AnimatedListItem: React.FC<AnimatedListItemProps> = ({ children, className = '' }) => {
  return (
    <motion.div
      className={className}
      variants={staggerItem}
    >
      {children}
    </motion.div>
  );
};

// 标签/徽章动画
interface AnimatedBadgeProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export const AnimatedBadge: React.FC<AnimatedBadgeProps> = ({ 
  children, 
  className = '', 
  onClick,
  isActive = false
}) => {
  return (
    <motion.button
      className={className}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ 
        scale: 1.05,
        transition: { type: 'spring', stiffness: 400, damping: 17 }
      }}
      whileTap={{ 
        scale: 0.95,
        transition: { duration: 0.1 }
      }}
      layout
    >
      {children}
    </motion.button>
  );
};

// 展开/收起动画
interface CollapsibleProps {
  children: React.ReactNode;
  isOpen: boolean;
  className?: string;
}

export const Collapsible: React.FC<CollapsibleProps> = ({ children, isOpen, className = '' }) => {
  return (
    <motion.div
      className={className}
      initial={false}
      animate={{
        height: isOpen ? 'auto' : 0,
        opacity: isOpen ? 1 : 0
      }}
      transition={{ duration: 0.3, ease: easeStandard }}
      style={{ overflow: 'hidden' }}
    >
      {children}
    </motion.div>
  );
};

// 旋转加载动画
interface SpinnerProps {
  size?: number;
  className?: string;
}

export const AnimatedSpinner: React.FC<SpinnerProps> = ({ size = 24, className = '' }) => {
  return (
    <motion.div
      className={className}
      style={{ width: size, height: size }}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <circle 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="currentColor" 
          strokeWidth="3" 
          strokeLinecap="round"
          strokeDasharray="31.4 31.4"
          className="opacity-25"
        />
        <circle 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="currentColor" 
          strokeWidth="3" 
          strokeLinecap="round"
          strokeDasharray="31.4 31.4"
          strokeDashoffset="23.55"
        />
      </svg>
    </motion.div>
  );
};
