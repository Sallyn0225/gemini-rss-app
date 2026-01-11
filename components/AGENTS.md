## components/

### OVERVIEW
React 19 UI components with Framer Motion animations, specialized for RSS article display and settings management.

### STRUCTURE
- **animations.tsx**: Centralized motion variants and easing functions (Material Design beziers)
- **ArticleCard.tsx**: Reusable article display component with image proxy support
- **SettingsModal.tsx**: Modal-based settings interface with drag-and-drop reordering
- **StatsChart.tsx**: Data visualization component for feed statistics
- **CalendarWidget.tsx**: Date picker for filtering articles by day

### WHERE TO LOOK
- Animation constants: `easeStandard`, `modalOverlay`, `modalContent`, `organicContent` in animations.tsx
- Dual URL handling: Import `selectMediaUrl` from types.ts for image rendering
- Performance optimizations: ArticleCard memoization, debounced reordering in SettingsModal

### CONVENTIONS
- **Animations**: Always import variants from animations.tsx, never hardcode durations or easings
- **Media rendering**: Use `selectMediaUrl(article.thumbnail, proxyMode)` for all images
- **Component style**: Functional components only, no class components

### ANTI-PATTERNS
- ❌ Inline styles - Use Tailwind utility classes exclusively
- ❌ Manual animation durations - Import constants from animations.tsx
- ❌ Raw `<img src="...">` without selectMediaUrl - Breaks proxy mode support
- ❌ Reordering without debouncing - Causes excessive API calls to database