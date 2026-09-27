// Global window augmentations for the World App bridge (MiniKit).
interface Window {
  WorldApp?: {
    world_app_version: number;
    device_os: 'ios' | 'android';
  };
  MiniKit?: unknown;
}