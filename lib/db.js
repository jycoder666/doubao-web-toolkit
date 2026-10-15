// lib/db.js — IndexedDB 薄封装 (传统脚本, 挂 window.dwt)
(function () {
  'use strict';

  const DB_NAME = 'doubao-web-toolkit';
  const DB_VER = 1;
  const STORE = 'conversations';

  function getDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveConversation(conv) {
    const db = await getDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(conv);
    return new Promise((resolve) => { tx.oncomplete = resolve; });
  }

  async function getAllConversations() {
    const db = await getDB();
    return new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
    });
  }

  const dwt = window.dwt = window.dwt || {};
  dwt.db = { getDB, saveConversation, getAllConversations };
})();
