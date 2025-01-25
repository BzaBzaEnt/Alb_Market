// DBModule.js
const DBModule = (() => {
    async function openDatabase(config) {
        return new Promise((resolve, reject) => {

            const request = indexedDB.open(config.INDEXEDDB.DB_NAME, config.INDEXEDDB.DB_VERSION);

            request.onupgradeneeded = event => {
                const db = event.target.result;
                // Create or open existing store
                if (!db.objectStoreNames.contains(config.INDEXEDDB.STORE_NAME)) {
                    db.createObjectStore(config.INDEXEDDB.STORE_NAME, {keyPath: "id", autoIncrement: true});
                }
            };

            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async function saveData(STORAGE_KEYS, itemsData, globalAllChartsData, globalAllHistoryData, config) {
        try {
            const db = await openDatabase(config, STORAGE_KEYS);
            const transaction = db.transaction(["dataStore"], "readwrite");
            const store = transaction.objectStore("dataStore");

            store.put({key: STORAGE_KEYS.ITEMS_DATA, value: itemsData});
            store.put({key: STORAGE_KEYS.CHARTS_DATA, value: globalAllChartsData});
            store.put({key: STORAGE_KEYS.HISTORY_DATA, value: globalAllHistoryData});

            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log("Дані успішно збережені в IndexedDB.");
                    resolve();
                };
                transaction.onerror = (event) => {
                    console.error("IndexedDB transaction error:", event.target.errorCode);
                    reject(event.target.errorCode);
                };
            });
        } catch (err) {
            console.error("Error saving to IndexedDB:", err);
        }
    }

    async function clearData(config, STORAGE_KEYS) {
        try {
            const db = await openDatabase(config);
            const transaction = db.transaction([config.INDEXEDDB.STORE_NAME], "readwrite");
            const store = transaction.objectStore(config.INDEXEDDB.STORE_NAME);
            store.delete(STORAGE_KEYS.ITEMS_DATA);
            store.delete(STORAGE_KEYS.CHARTS_DATA);
            store.delete(STORAGE_KEYS.HISTORY_DATA);

            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log(`Data cleared for: ${config.INDEXEDDB.STORE_NAME}`);
                    resolve();
                };
                transaction.onerror = (event) => {
                    console.error("Clear data error:", event.target.errorCode);
                    reject(event.target.errorCode);
                };
            });
        } catch (error) {
            console.error("clearData error:", error);
        }
    }

    async function loadData(config, dataKey) {
        // Decide which store to use
        let storeName = config.INDEXEDDB.STORE_NAME;

        const db = await openDatabase(config);
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }


    return {
        saveData,
        clearData,
        openDatabase,
        loadData
    };
})();
