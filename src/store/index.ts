import { create } from 'zustand';
import { Settings, DEFAULT_SETTINGS, TimerInfo, TimerPhase, TimerState } from '../types';

interface AppStore {
  // Settings
  settings: Settings;
  setSettings: (settings: Partial<Settings>) => void;

  // Timer
  timerInfo: TimerInfo;
  setTimerInfo: (info: Partial<TimerInfo>) => void;

  // UI state
  isReminderWindowOpen: boolean;
  setReminderWindowOpen: (open: boolean) => void;

  isMainWindowVisible: boolean;
  setMainWindowVisible: (visible: boolean) => void;
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

  // UI state
  isReminderWindowOpen: false,
  setReminderWindowOpen: (open) => set({ isReminderWindowOpen: open }),

  isMainWindowVisible: true,
  setMainWindowVisible: (visible) => set({ isMainWindowVisible: visible }),
}));
