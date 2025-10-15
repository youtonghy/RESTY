import { create } from 'zustand';
import {
  Settings,
  DEFAULT_SETTINGS,
  TimerInfo,
  TimerPhase,
  TimerState,
  UpdateManifest,
} from '../types';

/**
 * 全局应用状态定义：封装设置与计时器信息，供各 React 组件共享。
 */
interface AppStore {
  // Settings
  settings: Settings;
  setSettings: (settings: Partial<Settings>) => void;

  // Application metadata
  appVersion: string | null;
  setAppVersion: (version: string) => void;
  updateManifest: UpdateManifest | null;
  setUpdateManifest: (manifest: UpdateManifest | null) => void;

  // Timer
  timerInfo: TimerInfo;
  setTimerInfo: (info: Partial<TimerInfo>) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // Settings
  settings: DEFAULT_SETTINGS,
  setSettings: (newSettings) =>
    set((state) => {
      const merged = { ...state.settings, ...newSettings };
      merged.minimizeToTray = true;
      merged.closeToTray = true;
      if (!merged.autostart) {
        merged.silentAutostart = false;
      }
      return { settings: merged };
    }),

  // Application metadata
  appVersion: null,
  setAppVersion: (version) => set(() => ({ appVersion: version })),
  updateManifest: null,
  setUpdateManifest: (manifest) => set(() => ({ updateManifest: manifest })),

  // Timer
  timerInfo: {
    phase: 'idle' as TimerPhase,
    state: 'stopped' as TimerState,
    remainingMinutes: 0,
    totalMinutes: 0,
    nextTransitionTime: null,
  },
  setTimerInfo: (info) =>
    set((state) => ({
      timerInfo: { ...state.timerInfo, ...info },
    })),
}));
