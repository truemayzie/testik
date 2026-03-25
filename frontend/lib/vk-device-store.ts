// Временное хранилище device_id от VK ID для передачи в token exchange
// Ключ — state параметр OAuth, значение — device_id
const store = new Map<string, string>();

export function setDeviceId(state: string, deviceId: string) {
  store.set(state, deviceId);
  setTimeout(() => store.delete(state), 5 * 60 * 1000);
}

export function getDeviceId(state: string): string | undefined {
  return store.get(state);
}

export function deleteDeviceId(state: string) {
  store.delete(state);
}
