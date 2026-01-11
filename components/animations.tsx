import { Variants } from 'framer-motion';

// ============================================
// Material Design 缓动函数 (Easing Functions)
// ============================================

// 标准缓动 - 用于大多数动画
export const easeStandard: [number, number, number, number] = [0.4, 0, 0.2, 1];

// 减速缓动 - 用于进入动画
export const easeDecelerate: [number, number, number, number] = [0, 0, 0.2, 1];

// 加速缓动 - 用于退出动画
export const easeAccelerate: [number, number, number, number] = [0.4, 0, 1, 1];

// Organic / Bouncy Easing
export const easeOutBack: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

// ============================================
// 模态框动画 (Modal Variants)
// ============================================

export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 }
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.9, y: 30 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { 
      type: 'spring', 
      stiffness: 260, 
      damping: 20,
      mass: 1
    }
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    y: 30,
    transition: { duration: 0.3, ease: easeAccelerate }
  }
};

export const organicContent: Variants = {
  initial: { opacity: 0, scale: 0.8, rotate: -2 },
  animate: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { 
      type: 'spring', 
      stiffness: 300, 
      damping: 15,
      mass: 1
    }
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: { duration: 0.25, ease: 'easeInOut' }
  }
};
