import { create } from 'zustand';
import { Settings, DEFAULT_SETTINGS, TimerInfo, TimerPhase, TimerState } from '../types';

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
