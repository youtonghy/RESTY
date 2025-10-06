import { create } from 'zustand';
import { Settings, DEFAULT_SETTINGS, TimerInfo, TimerPhase, TimerState } from '../types';

/**
 * 全局应用状态定义：封装设置与计时器信息，供各 React 组件共享。
 */
interface AppStore {
  // Settings
  settings: Settings;
  setSettings: (settings: Partial<Settings>) => void;

  // Timer
  timerInfo: TimerInfo;
  setTimerInfo: (info: Partial<TimerInfo>) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // Settings
  settings: DEFAULT_SETTINGS,
  setSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),

  // Timer
  timerInfo: {
    phase: 'idle' as TimerPhase,
    state: 'stopped' as TimerState,
    remainingSeconds: 0,
    totalSeconds: 0,
  },
  setTimerInfo: (info) =>
    set((state) => ({
      timerInfo: { ...state.timerInfo, ...info },
    })),
}));
