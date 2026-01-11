import { Variants } from 'framer-motion';

// ============================================
// Material Design 缓动函数 (Easing Functions)
// ============================================

// Standard Flat Easing
export const easeStandard: [number, number, number, number] = [0.4, 0, 0.2, 1];

// Quick Decelerate - for enter
export const easeDecelerate: [number, number, number, number] = [0, 0, 0.2, 1];

// Quick Accelerate - for exit
export const easeAccelerate: [number, number, number, number] = [0.4, 0, 1, 1];

// Simplified Flat Easing (replacing OutBack)
export const easeOutBack: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

// ============================================
// Modal Variants (Flat)
// ============================================

export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 }
};

export const modalContent: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { 
      duration: 0.2,
      ease: easeStandard
    }
  },
  exit: {
    opacity: 0,
    y: 10,
    transition: { 
      duration: 0.15, 
      ease: easeAccelerate 
    }
  }
};

export const organicContent: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { 
      duration: 0.2,
      ease: easeStandard
    }
  },
  exit: {
    opacity: 0,
    transition: { 
      duration: 0.15, 
      ease: 'linear' 
    }
  }
};
