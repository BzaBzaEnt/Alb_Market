// DBModule.js
const DBModule = (() => {
    async function openDatabase(config) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(config.INDEXEDDB.DB_NAME, config.INDEXEDDB.DB_VERSION);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.errorCode);
                reject(event.target.errorCode);
            };

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(config.INDEXEDDB.STORE_NAME)) {
                    db.createObjectStore(config.INDEXEDDB.STORE_NAME, { keyPath: "key" });
                }
            };
        });
    }

    async function saveData(config, key, value) {
        try {
            const db = await openDatabase(config);
            const transaction = db.transaction([config.INDEXEDDB.STORE_NAME], "readwrite");
            const store = transaction.objectStore(config.INDEXEDDB.STORE_NAME);
            store.put({ key, value });

            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log(`Data saved for key: ${key}`);
                    resolve();
                };
                transaction.onerror = (event) => {
                    console.error("Transaction error:", event.target.errorCode);
                    reject(event.target.errorCode);
                };
            });
        } catch (error) {
            console.error("saveData error:", error);
        }
    }

    async function loadData(config, key) {
        try {
            const db = await openDatabase(config);
            const transaction = db.transaction([config.INDEXEDDB.STORE_NAME], "readonly");
            const store = transaction.objectStore(config.INDEXEDDB.STORE_NAME);
            const request = store.get(key);

            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    if (request.result) {
                        console.log(`Data loaded for key: ${key}`);
                        resolve(request.result.value);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = (event) => {
                    console.error("Load data error:", event.target.errorCode);
                    reject(event.target.errorCode);
                };
            });
        } catch (error) {
            console.error("loadData error:", error);
            return null;
        }
    }

    async function clearData(config, key) {
        try {
            const db = await openDatabase(config);
            const transaction = db.transaction([config.INDEXEDDB.STORE_NAME], "readwrite");
            const store = transaction.objectStore(config.INDEXEDDB.STORE_NAME);
            store.delete(key);

            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log(`Data cleared for key: ${key}`);
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

    return {
        saveData,
        loadData,
        clearData
    };
})();
