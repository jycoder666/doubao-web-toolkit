// IndexedDB 薄封装 —— 对话导出/备份用
// MVP 占位，待扩展
const DB_NAME = 'doubao-web-toolkit';
const DB_VER = 1;
const STORE = 'conversations';

export default {
  async getDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async saveConversation(conv) {
    const db = await this.getDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(conv);
    return new Promise((resolve) => tx.oncomplete = resolve);
  },
  async getAllConversations() {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
    });
  },
};
