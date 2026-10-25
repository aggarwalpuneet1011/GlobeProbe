export const log: string[] = [];
export async function activateKeepAwakeAsync(tag: string) { log.push('on:' + tag); }
export function deactivateKeepAwake(tag: string) { log.push('off:' + tag); return Promise.resolve(); }
