import { create } from 'zustand';
import {
  Settings,
  DEFAULT_SETTINGS,
  TimerInfo,
  TimerPhase,
  TimerState,
  UpdateManifest,
} from '../types';

const cloneSegments = (segments: Settings['workSegments']) =>
  segments.map((segment) => ({ ...segment }));

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
  isUpdating: boolean;
  updateError: string | null;
  setUpdateManifest: (manifest: UpdateManifest | null) => void;
  setUpdating: (updating: boolean) => void;
  setUpdateError: (message: string | null) => void;

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
      merged.autoSilentUpdateEnabled =
        merged.autoSilentUpdateEnabled ?? DEFAULT_SETTINGS.autoSilentUpdateEnabled;
      merged.segmentedWorkEnabled = merged.segmentedWorkEnabled ?? false;
      merged.workSegments = cloneSegments(
        merged.workSegments?.length ? merged.workSegments : DEFAULT_SETTINGS.workSegments
      );
      return { settings: merged };
    }),

  // Application metadata
  appVersion: null,
  setAppVersion: (version) => set(() => ({ appVersion: version })),
  updateManifest: null,
  isUpdating: false,
  updateError: null,
  setUpdateManifest: (manifest) =>
    set(() => ({ updateManifest: manifest, updateError: null, isUpdating: false })),
  setUpdating: (updating) => set(() => ({ isUpdating: updating })),
  setUpdateError: (message) => set(() => ({ updateError: message })),

  // Timer
  timerInfo: {
    phase: 'idle' as TimerPhase,
    state: 'stopped' as TimerState,
    remainingSeconds: 0,
    totalSeconds: 0,
    nextTransitionTime: null,
  },
  setTimerInfo: (info) =>
    set((state) => ({
      timerInfo: { ...state.timerInfo, ...info },
    })),
}));
