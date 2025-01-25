import {buildPairsWithHistory, calculateProfitMetrics, groupChartsData, groupHistoryData} from './calculation.js';

// Конфігурація
const CONFIG = {
    API: {
        ITEMS: "https://raw.githubusercontent.com/broderickhyman/ao-bin-dumps/master/formatted/items.json",
        CHARTS: "https://europe.albion-online-data.com/api/v2/stats/Charts",
        HISTORY: "https://europe.albion-online-data.com/api/v2/stats/History"
    },
    LOCATIONS: ["Fort Sterling", "Martlock", "Thetford", "Lymhurst", "Black Market"],
    COEFFICIENT: {
        MIN: 0.5,
        MAX: 5.0
    },
    ITEMS_PER_CHUNK: 100,
    RETRY_DELAY: 60, // seconds
    STORAGE_KEYS: {
        ITEMS: "itemsData",
        CHARTS: "chartsData",
        HISTORY: "historyData",
    },
    INDEXEDDB: {
        DB_NAME: "AlbionMarketDB",
        DB_VERSION: 2,  // Increment DB version to trigger onupgradeneeded
        // Existing store, plus add new store name
        STORE_NAME: "dataStore",
    }
};

// Ключі для LocalStorage/IndexedDB
const STORAGE_KEYS = {
    ITEMS_DATA: 'itemsData',
    CHARTS_DATA: 'chartsData',
    HISTORY_DATA: 'historyData'
};

// Глобальні змінні
let itemsData = [];
let namesDict = {};
let categoryDict = {};
let filteredItemIds = [];
let globalAllChartsData = [];
let globalAllHistoryData = [];
let globalRows = [];
let swapBuySell = false;
let sortDirections = {};

// Утиліти
const Utils = {
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async countdown(seconds, progressEl, currentChunk, totalChunks, messagePrefix) {
        for (let s = seconds; s > 0; s--) {
            progressEl.textContent = `${messagePrefix} (chunk ${currentChunk}/${totalChunks}). Retry in ${s} sec...`;
            await this.sleep(1000);
        }
    },

    formatDate(date) {
        return date.toISOString().slice(0, 16);
    },

    isDateString(value) {
        return !isNaN(Date.parse(value));
    },

    formatNumber(value) {
        if (typeof value === 'number') {
            return value.toLocaleString('en-US');
        }
        return value;
    },

    chunkArray(array, size) {
        const result = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }
};

// API функції
const API = {
    async fetchItems() {
        try {
            const response = await fetch(CONFIG.API.ITEMS);
            if (!response.ok) {
                throw new Error(`Items API error: ${response.status}`);
            }
            const data = await response.json();
            itemsData = data;
            namesDict = {};
            categoryDict = {};

            for (const item of data) {
                const uid = item.UniqueName;
                if (!uid) continue;
                const locNames = item.LocalizedNames || {};
                const enName = locNames["EN-US"] || item.LocalizationNameVariable || uid;
                namesDict[uid] = enName;
                const cat = item.ShopCategory || item.ItemCategory || "Uncategorized";
                categoryDict[uid] = cat;
            }
            console.log("Items data fetched successfully.");
            return true;
        } catch (err) {
            console.error("fetchItems error:", err);
            return false;
        }
    },

    async fetchChartsDataByChunks(itemIds, dateFrom, dateTo, timeScale, progressEl, chunkIndexRef, totalChunksGlobal) {
        const allResults = [];
        const chunks = Utils.chunkArray(itemIds, CONFIG.ITEMS_PER_CHUNK);

        for (let i = 0; i < chunks.length; i++) {
            const batch = chunks[i];
            const itemsParam = batch.join(",");
            const locParam = CONFIG.LOCATIONS.join(",");
            const url = `${CONFIG.API.CHARTS}/${itemsParam}.json?locations=${locParam}&date=${dateFrom}&end_date=${dateTo}&time-scale=${timeScale}`;

            while (true) {
                try {
                    chunkIndexRef.current++;
                    progressEl.textContent = `Loading Charts chunk ${chunkIndexRef.current}/${totalChunksGlobal}...`;

                    const response = await fetch(url);
                    if (response.status === 429) {
                        await Utils.countdown(CONFIG.RETRY_DELAY, progressEl, chunkIndexRef.current, totalChunksGlobal, "Rate limit (Charts)");
                        continue;
                    }
                    if (!response.ok) {
                        throw new Error(`Charts API error: ${response.status}`);
                    }

                    const data = await response.json();
                    allResults.push(...data);
                    break;
                } catch (err) {
                    console.error("Charts chunk error:", err);
                    await Utils.countdown(CONFIG.RETRY_DELAY, progressEl, chunkIndexRef.current, totalChunksGlobal, "Error (Charts)");
                }
            }
        }
        console.log("Charts data fetched successfully.");
        return allResults;
    },

    async fetchHistoryDataByChunks(itemIds, dateFrom, dateTo, timeScale, progressEl, chunkIndexRef, totalChunksGlobal) {
        const allResults = [];
        const chunks = Utils.chunkArray(itemIds, CONFIG.ITEMS_PER_CHUNK);

        for (let i = 0; i < chunks.length; i++) {
            const batch = chunks[i];
            const itemsParam = batch.join(",");
            const locParam = CONFIG.LOCATIONS.join(",");
            const url = `${CONFIG.API.HISTORY}/${itemsParam}.json?locations=${locParam}&date=${dateFrom}&end_date=${dateTo}&time-scale=${timeScale}`;

            while (true) {
                try {
                    chunkIndexRef.current++;
                    progressEl.textContent = `Loading History chunk ${chunkIndexRef.current}/${totalChunksGlobal}...`;

                    const response = await fetch(url);
                    if (response.status === 429) {
                        await Utils.countdown(CONFIG.RETRY_DELAY, progressEl, chunkIndexRef.current, totalChunksGlobal, "Rate limit (History)");
                        continue;
                    }
                    if (!response.ok) {
                        throw new Error(`History API error: ${response.status}`);
                    }

                    const data = await response.json();
                    allResults.push(...data);
                    break;
                } catch (err) {
                    console.error("History chunk error:", err);
                    await Utils.countdown(CONFIG.RETRY_DELAY, progressEl, chunkIndexRef.current, totalChunksGlobal, "Error (History)");
                }
            }
        }
        console.log("History data fetched successfully.");
        return allResults;
    }
};

// Обробка даних
const DataProcessor = {
    filterItemIds() {
        return Object.keys(namesDict).filter(item_id => {
            if (item_id.startsWith("T1_") || item_id.startsWith("T2_") || item_id.startsWith("T8_")) return false;
            if (item_id.includes("_TROPHY") || item_id.includes("_BABY")) return false;
            if (item_id.includes("TREASURE_") || item_id.includes("EMOTE")) return false;
            if (item_id.includes("UNLOCK") || item_id.includes("CRYSTALLEAGUE")) return false;
            if (item_id.includes("TEST") || item_id.includes("SKIN")) return false;
            if (item_id.includes("QUESTITEM_") || item_id.includes("SILVERBAG")) return false;
            if (item_id.includes("JOURNAL") || item_id.includes("QUEST")) return false;
            if (item_id.includes("UNIQUE") || item_id.includes("LOOTBAG")) return false;
            if (item_id.includes("CAPEITEM") || item_id.includes("ARENA")) return false;
            if (item_id.includes("KNUCKLES")) return false;
            if (item_id.includes("ARMOR_GATHERER") || item_id.includes("HEAD_GATHERER") || item_id.includes("SHOES_GATHERER")) return false;
            if (item_id.includes("PLAYERISLAND") || item_id.includes("FARM")) return false;
            if (item_id.includes("_SET") || item_id.includes("_SEED")) return false;
            return true;
        });
    },

    analyzeAllData(chartsData, historyData, isSwapped) {
        const chartsGrouped = groupChartsData(chartsData);
        const historyGrouped = groupHistoryData(historyData);
        return buildPairsWithHistory(chartsGrouped, historyGrouped, isSwapped, namesDict);
    }
};

// UI функції
const UI = {
    toggleSwapBuySell() {
        swapBuySell = !swapBuySell;
        console.log("Swap clicked =>", swapBuySell);
        globalRows = DataProcessor.analyzeAllData(globalAllChartsData, globalAllHistoryData, swapBuySell);
        this.renderFilteredRows();
    },

    getFilteredRows() {
        const buyVal = document.getElementById("buyLocationSelect").value;
        const sellVal = document.getElementById("sellLocationSelect").value;
        const fromVal = document.getElementById("dateFromInput").value;
        const toVal = document.getElementById("dateToInput").value;

        let fromTime = new Date(Date.now() - 24 * 3600 * 1000).getTime();
        let toTime = Date.now();

        if (fromVal) fromTime = new Date(fromVal + ":00Z").getTime();
        if (toVal) toTime = new Date(toVal + ":00Z").getTime();

        return globalRows.filter(row => {
            const timestamp = new Date(row.timestamp).getTime();
            if (isNaN(timestamp)) return false;
            if (timestamp < fromTime || timestamp > toTime) return false;
            if (buyVal !== "All" && row.location_buy !== buyVal) return false;
            if (sellVal !== "All" && row.location_sell !== sellVal) return false;
            return true;
        });
    },

    createTableHTML(rows) {
        if (!rows?.length) return "<p>No valid data found.</p>";

        const columns = Object.keys(rows[0]);
        let html = '<table id="myTable"><thead><tr>';

        columns.forEach(col => {
            const title = col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            html += `<th>${title}</th>`;
        });
        html += '</tr></thead><tbody>';

        rows.forEach(row => {
            html += '<tr>';
            columns.forEach(col => {
                let value = row[col];
                let classes = ['cell'];

                if (col === "select") {
                    value = `<button class="select-row-btn">⭐</button><button class="recalculate-row-btn">🔄</button>`;
                } else if (col === "item_quality") {
                    value = (value - 1).toString();
                } else if (col.includes('price') || col === 'potential_profit') {
                    value = Utils.formatNumber(value);
                    classes.push('number-cell');
                } else if (col.includes('coefficient') || col === 'roi') {
                    if (value > 3) classes.push('high-value');
                    else if (value > 2) classes.push('good-value');
                    else if (value < 1.5) classes.push('low-value');
                }

                html += `<td class="${classes.join(' ')}">${value}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        return html;
    },

    renderFilteredRows() {
        const tableContainer = document.getElementById("tableContainer");
        const rows = this.getFilteredRows();

        if (rows.length === 0) {
            tableContainer.innerHTML = "<p>No matches with current filters.</p>";
            return;
        }

        const limitNum = parseInt(document.getElementById("limitInput").value) || 100;
        const limitedRows = rows.slice(0, limitNum);

        const html = this.createTableHTML(limitedRows);
        tableContainer.innerHTML = html;
        this.setupTableInteractivity();
        this.updateStatusInfo(rows.length);
    },

    updateStatusInfo(totalRows) {
        const lastUpdate = new Date().toLocaleString();
        document.getElementById("lastUpdateTime").textContent = lastUpdate;
        document.getElementById("itemsCount").textContent = totalRows;
    },

    setupTableInteractivity() {
        const table = document.getElementById("myTable");
        if (!table) return;

        table.querySelectorAll("thead th").forEach((header, index) => {
            header.addEventListener("click", () => this.sortTable(index));
        });

        table.querySelectorAll(".select-row-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                const row = btn.closest("tr");
                row.classList.toggle("selected-row");
            });
        });

        table.querySelectorAll(".recalculate-row-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                const row = btn.closest("tr");
                this.recalculateRow(row);
            });
        });

        this.makeTableEditable();
    },

    sortTable(colIndex) {
        const table = document.getElementById("myTable");
        if (!table) return;

        sortDirections[colIndex] = !sortDirections[colIndex];
        const direction = sortDirections[colIndex];

        const rows = Array.from(table.querySelectorAll("tbody tr"));

        rows.sort((a, b) => {
            const aVal = a.cells[colIndex].textContent;
            const bVal = b.cells[colIndex].textContent;

            const numA = parseFloat(aVal.replace(/,/g, ''));
            const numB = parseFloat(bVal.replace(/,/g, ''));
            if (!isNaN(numA) && !isNaN(numB)) {
                return direction ? numA - numB : numB - numA;
            }

            const dateA = Utils.isDateString(aVal) ? new Date(aVal) : null;
            const dateB = Utils.isDateString(bVal) ? new Date(bVal) : null;
            if (dateA && dateB) {
                return direction ? dateA - dateB : dateB - dateA;
            }

            return direction
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        });

        const tbody = table.querySelector("tbody");
        rows.forEach(row => tbody.appendChild(row));
    },

    makeTableEditable() {
        const table = document.getElementById("myTable");
        if (!table) return;

        table.querySelectorAll("td").forEach(cell => {
            if (cell.querySelector(".select-row-btn")) return;

            cell.addEventListener("click", () => {
                if (cell.querySelector("input")) return;

                const oldValue = cell.textContent;
                const input = document.createElement("input");
                input.type = "text";
                input.value = oldValue;
                input.className = "cell-edit-input";

                cell.textContent = "";
                cell.appendChild(input);
                input.focus();

                const finishEdit = () => {
                    cell.textContent = input.value;
                    const row = cell.closest("tr");
                    if (row) this.recalculateRow(row);
                };

                input.addEventListener("blur", finishEdit);
                input.addEventListener("keydown", e => {
                    if (e.key === "Enter") {
                        finishEdit();
                        cell.blur();
                    }
                });
            });
        });
    },

    recalculateRow(row) {
        if (!row) return;

        const cells = row.cells;
        const buyPrice = parseFloat(cells[4].textContent.replace(/,/g, ''));
        const sellPrice = parseFloat(cells[6].textContent.replace(/,/g, ''));

        if (isNaN(buyPrice) || isNaN(sellPrice) || buyPrice <= 0 || sellPrice <= 0) {
            console.error("Invalid prices for recalculation");
            return;
        }

        const historyBuyCount = parseInt(cells[10].textContent) || 0;
        const historySellCount = parseInt(cells[11].textContent) || 0;

        const ratio = sellPrice / buyPrice;
        cells[7].textContent = ratio.toFixed(3);

        const profitPerItem = sellPrice - buyPrice;
        const amount5kk = profitPerItem > 0 ? Math.ceil(5000000 / profitPerItem) : "N/A";
        cells[8].textContent = amount5kk;
        let smartCoef = 0;
        if (typeof amount5kk === "number") {
            smartCoef = (ratio * (historyBuyCount + historySellCount)) / (amount5kk + 1);
        }
        cells[14].textContent = smartCoef.toFixed(4);

        const metrics = calculateProfitMetrics(buyPrice, sellPrice, historyBuyCount, historySellCount);
        cells[15].textContent = Utils.formatNumber(metrics.potentialProfit);
        cells[16].textContent = metrics.roi;

        this.updateRowStyles(row);
    },

    updateRowStyles(row) {
        const cells = row.cells;

        const coefCell = cells[7];
        const coefValue = parseFloat(coefCell.textContent);
        coefCell.className = this.getValueClass(coefValue);

        const smartCoefCell = cells[14];
        const smartCoefValue = parseFloat(smartCoefCell.textContent);
        smartCoefCell.className = this.getValueClass(smartCoefValue);

        const roiCell = cells[16];
        const roiValue = parseFloat(roiCell.textContent);
        roiCell.className = this.getValueClass(roiValue);
    },

    getValueClass(value) {
        if (value > 3) return 'high-value';
        if (value > 2) return 'good-value';
        if (value < 1.5) return 'low-value';
        return '';
    }
};

window.addEventListener("load", async () => {
    const progressEl = document.getElementById("progressIndicator");
    progressEl.textContent = "Loading items...";

    try {
        // Навішуємо обробники
        document.getElementById("reloadBtn").addEventListener("click", async () => {
            // Очищуємо IndexedDB перед перезавантаженням даних
            await DBModule.clearData(CONFIG, STORAGE_KEYS);
            await onReloadData();
        });
        document.getElementById("swapBtn").addEventListener("click", () => UI.toggleSwapBuySell());

        ["buyLocationSelect", "sellLocationSelect", "dateFromInput",
            "dateToInput", "limitInput"].forEach(id => {
            document.getElementById(id).addEventListener("change", () => UI.renderFilteredRows());
        });
        document.getElementById("predictionsBtn").addEventListener("click", () => window.location.href = 'predict.html');


        // Перевіряємо наявність даних в IndexedDB
        const hasCachedData = await loadDataFromIndexedDB();
        if (hasCachedData) {
            progressEl.textContent = "Loaded data from IndexedDB.";
            return;
        }

        // Якщо даних немає, завантажуємо з API
        // Завантажуємо базові дані
        const success = await API.fetchItems();
        if (!success) {
            progressEl.textContent = "Failed to load item data.";
            return;
        }

        // Фільтруємо айтеми
        filteredItemIds = DataProcessor.filterItemIds();

        // Заповнюємо категорії
        const categories = new Set();
        filteredItemIds.forEach(id => {
            categories.add(categoryDict[id] || "Uncategorized");
        });

        const categorySelect = document.getElementById("categorySelect");
        categorySelect.innerHTML = '<option value="All">All</option>' +
            Array.from(categories).sort().map(cat =>
                `<option value="${cat}">${cat}</option>`
            ).join('');

        // Встановлюємо дати за замовчуванням
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

        document.getElementById("dateFromInput").value = Utils.formatDate(yesterday);
        document.getElementById("dateToInput").value = Utils.formatDate(now);


        // Перше завантаження
        await onReloadData();

    } catch (error) {
        console.error("Initialization error:", error);
        progressEl.textContent = "Failed to initialize application.";
    }
});

// Ініціалізація і завантаження
async function onReloadData() {
    const progressEl = document.getElementById("progressIndicator");
    const tableContainer = document.getElementById("tableContainer");

    progressEl.textContent = "";
    tableContainer.innerHTML = "<p>Loading...</p>";

    try {
        const dateFromInput = document.getElementById("dateFromInput");
        const dateToInput = document.getElementById("dateToInput");
        const timeScaleInput = document.getElementById("timeScaleInput");
        const categorySelect = document.getElementById("categorySelect");

        let dateFromValue = dateFromInput.value || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        let dateToValue = dateToInput.value || new Date().toISOString();

        if (!dateFromValue.includes("Z")) dateFromValue += ":00Z";
        if (!dateToValue.includes("Z")) dateToValue += ":00Z";

        const timeScale = parseInt(timeScaleInput.value) || 6;
        const selectedCategory = categorySelect.value;

        // Фільтруємо айтеми за категорією
        const itemIdsForRequest = filteredItemIds.filter(id => {
            const category = categoryDict[id] || "Uncategorized";
            return selectedCategory === "All" || category === selectedCategory;
        });

        if (itemIdsForRequest.length === 0) {
            progressEl.textContent = "No items found for category.";
            tableContainer.innerHTML = "<p>Empty result.</p>";
            return;
        }

        // Рахуємо чанки
        const totalChartsChunks = Math.ceil(itemIdsForRequest.length / CONFIG.ITEMS_PER_CHUNK);
        const totalHistoryChunks = totalChartsChunks;
        const totalChunksGlobal = totalChartsChunks + totalHistoryChunks;
        const chunkIndexRef = {current: 0};
        // Завантажуємо дані
        const [chartsData, historyData] = await Promise.all([
            API.fetchChartsDataByChunks(
                itemIdsForRequest,
                dateFromValue,
                dateToValue,
                timeScale,
                progressEl,
                chunkIndexRef,
                totalChunksGlobal
            ),
            API.fetchHistoryDataByChunks(
                itemIdsForRequest,
                dateFromValue,
                dateToValue,
                timeScale,
                progressEl,
                chunkIndexRef,
                totalChunksGlobal
            )
        ]);


        if (!chartsData.length && !historyData.length) {
            tableContainer.innerHTML = "<p>No data from API.</p>";
            return;
        }

        // Зберігаємо дані
        globalAllChartsData = chartsData;
        globalAllHistoryData = historyData;

        // Аналізуємо
        globalRows = DataProcessor.analyzeAllData(chartsData, historyData, swapBuySell);
        if (!globalRows.length) {
            tableContainer.innerHTML = "<p>No valid data found.</p>";
            return;
        }

        // Оновлюємо селекти локацій
        updateLocationSelects();

        // Рендеримо таблицю
        UI.renderFilteredRows();
        // Зберігаємо дані в IndexedDB
        await DBModule.saveData(STORAGE_KEYS, itemsData, globalAllChartsData, globalAllHistoryData, CONFIG);

    } catch (error) {
        console.error("Reload error:", error);
        progressEl.textContent = `Error: ${error.message}`;
        tableContainer.innerHTML = "<p>Error loading data.</p>";
    }
}

function updateLocationSelects() {
    const buyLocs = new Set();
    const sellLocs = new Set();

    globalRows.forEach(row => {
        buyLocs.add(row.location_buy);
        sellLocs.add(row.location_sell);
    });

    const buySelect = document.getElementById("buyLocationSelect");
    const sellSelect = document.getElementById("sellLocationSelect");

    function updateSelect(select, options) {
        const currentValue = select.value;
        select.innerHTML = '<option value="All">All</option>' +
            Array.from(options).sort().map(loc =>
                `<option value="${loc}">${loc}</option>`
            ).join('');
        select.value = currentValue;
    }

    updateSelect(buySelect, buyLocs);
    updateSelect(sellSelect, sellLocs);
}

async function loadDataFromIndexedDB() {
    try {
        const db = await DBModule.openDatabase(CONFIG);

        const transaction = db.transaction(["dataStore"], "readonly");
        const store = transaction.objectStore("dataStore");

        const getItems = store.get(STORAGE_KEYS.ITEMS_DATA);
        const getCharts = store.get(STORAGE_KEYS.CHARTS_DATA);
        const getHistory = store.get(STORAGE_KEYS.HISTORY_DATA);

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                const items = getItems.result?.value;
                const charts = getCharts.result?.value;
                const history = getHistory.result?.value;
                if (items && charts && history) {
                    itemsData = items;
                    globalAllChartsData = charts;
                    globalAllHistoryData = history;

                    console.log("Дані завантажені з IndexedDB.");

                    // Відновлюємо namesDict та categoryDict
                    namesDict = {};
                    categoryDict = {};
                    itemsData.forEach(item => {
                        const uid = item.UniqueName;
                        if (!uid) return;
                        const locNames = item.LocalizedNames || {};
                        const enName = locNames["EN-US"] || item.LocalizationNameVariable || uid;
                        namesDict[uid] = enName;
                        const cat = item.ShopCategory || item.ItemCategory || "Uncategorized";
                        categoryDict[uid] = cat;
                    });

                    // Фільтруємо айтеми
                    filteredItemIds = DataProcessor.filterItemIds();

                    // Аналізуємо дані
                    globalRows = DataProcessor.analyzeAllData(globalAllChartsData, globalAllHistoryData, swapBuySell);
                    if (globalRows.length > 0) {
                        // Оновлюємо селекти локацій
                        updateLocationSelects();
                        // Рендеримо таблицю
                        UI.renderFilteredRows();
                        console.log("Дані успішно проаналізовані та відображені.");
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } else {
                    resolve(false);
                }
            };

            transaction.onerror = (event) => {
                console.error("IndexedDB transaction error:", event.target.errorCode);
                reject(event.target.errorCode);
            };
        });
    } catch (err) {
        console.error("Error loading from IndexedDB:", err);
        return false;
    }
}




