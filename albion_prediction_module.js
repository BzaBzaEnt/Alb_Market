// albion_prediction_module.js

(function(window) {
    // Конфігурація
    const CONFIG = {
        LOCATIONS: ["Fort Sterling", "Martlock", "Thetford", "Lymhurst"],
        STORAGE_KEYS: { // Узгоджені ключі з основним модулем
            ITEMS: "itemsData",
            CHARTS: "chartsData",
            HISTORY: "historyData"
        },
        INDEXEDDB: { // Узгоджена конфігурація з основним модулем
            DB_NAME: "AlbionMarketDB", // Повинно збігатися з основним модулем
            DB_VERSION: 1,
            STORE_NAME: "dataStore"
        }
    };

    // Глобальні змінні
    let itemsData = [];
    let globalAllChartsData = [];
    let globalAllHistoryData = [];
    let trends = {};
    let predictions = {};

    // Утиліти
    const Utils = {
        formatNumber(value) {
            return typeof value === 'number' ? value.toLocaleString('en-US') : value;
        },
        clearLocalStorage() {
            Object.values(CONFIG.STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
        }
    };

    // Модуль прогнозування
    const PredictionModule = {
        analyzeTrends(chartsData) {
            const trends = {};
            if (!Array.isArray(chartsData) || chartsData.length === 0) {
                console.warn("chartsData is not an array or is empty.");
                return trends;
            }

            chartsData.forEach(item => {
                const itemId = item.item_id || "Unknown";
                const prices = item.data?.prices_avg || [];
                if (prices.length > 1) {
                    const trend = prices[prices.length - 1] - prices[0];
                    trends[itemId] = {
                        trend,
                        direction: trend > 0 ? "upward" : "downward",
                    };
                }
            });
            return trends;
        },

        predictDemand(historyData) {
            const predictions = {};
            if (!Array.isArray(historyData) || historyData.length === 0) {
                console.warn("historyData is not an array or is empty.");
                return predictions;
            }

            historyData.forEach(item => {
                const itemId = item.item_id || "Unknown";
                const sellCounts = item.data?.map(entry => entry.item_count) || [];
                const avgSellCount = sellCounts.length > 0 ? sellCounts.reduce((sum, count) => sum + count, 0) / sellCounts.length : 0;
                predictions[itemId] = {
                    avgSellCount,
                    highDemand: avgSellCount > 100, // Можна налаштувати поріг
                };
            });
            return predictions;
        },

        identifyPotentialBlackMarketItems() {
            // Логіка для визначення потенційних айтемів на чорному ринку Карлеону
            // Наприклад, айтеми з високою тенденцією до зростання та високим попитом
            const potentialItems = {};

            for (const [itemId, trendData] of Object.entries(trends)) {
                const prediction = predictions[itemId];
                if (prediction) {
                    // Визначаємо критерії:
                    // 1. Позитивна тенденція зростання більше 10 одиниць
                    // 2. Високий попит (середній продаж > 100)
                    // 3. Напрямок тенденції "upward"
                    if (trendData.trend > 10 && prediction.highDemand && trendData.direction === "upward") {
                        potentialItems[itemId] = {
                            trend: trendData.trend,
                            direction: trendData.direction,
                            avgSellCount: prediction.avgSellCount,
                            highDemand: prediction.highDemand
                        };
                    }
                }
            }

            return potentialItems;
        },

        analyzeExistingData() {
            trends = this.analyzeTrends(globalAllChartsData);
            predictions = this.predictDemand(globalAllHistoryData);
            const potentialBlackMarketItems = this.identifyPotentialBlackMarketItems();
            TableRenderer.renderTrendsTable(trends);
            TableRenderer.renderPredictionsTable(predictions);
            TableRenderer.renderPotentialBlackMarketTable(potentialBlackMarketItems);
            updateLastUpdateTime();
        }
    };

    // Відображення таблиць
    const TableRenderer = {
        renderTrendsTable(trends) {
            const tableContainer = document.getElementById("trendsTableContainer");
            if (!tableContainer) return;

            let html = '<table><thead><tr><th>Item ID</th><th>Trend</th><th>Direction</th></tr></thead><tbody>';
            Object.entries(trends).forEach(([itemId, data]) => {
                html += `<tr><td>${itemId}</td><td>${Utils.formatNumber(data.trend)}</td><td>${data.direction}</td></tr>`;
            });
            html += '</tbody></table>';
            tableContainer.innerHTML = html;
        },

        renderPredictionsTable(predictions) {
            const tableContainer = document.getElementById("predictionsTableContainer");
            if (!tableContainer) return;

            let html = '<table><thead><tr><th>Item ID</th><th>Avg Sell Count</th><th>High Demand</th></tr></thead><tbody>';
            Object.entries(predictions).forEach(([itemId, data]) => {
                html += `<tr><td>${itemId}</td><td>${Utils.formatNumber(data.avgSellCount)}</td><td>${data.highDemand ? "Yes" : "No"}</td></tr>`;
            });
            html += '</tbody></table>';
            tableContainer.innerHTML = html;
        },

        renderPotentialBlackMarketTable(potentialItems) {
            const tableContainer = document.getElementById("blackMarketTableContainer"); // Використовуємо новий контейнер
            if (!tableContainer) return;

            let html = '<table><thead><tr><th>Item ID</th><th>Trend</th><th>Direction</th><th>Avg Sell Count</th><th>High Demand</th></tr></thead><tbody>';
            if (Object.keys(potentialItems).length === 0) {
                html += '<tr><td colspan="5">No potential black market items found.</td></tr>';
            } else {
                Object.entries(potentialItems).forEach(([itemId, data]) => {
                    html += `<tr><td>${itemId}</td><td>${Utils.formatNumber(data.trend)}</td><td>${data.direction}</td><td>${Utils.formatNumber(data.avgSellCount)}</td><td>${data.highDemand ? "Yes" : "No"}</td></tr>`;
                });
            }
            html += '</tbody></table>';
            tableContainer.innerHTML = html;
        }
    };

    // Оновлення часу останнього оновлення
    function updateLastUpdateTime() {
        const lastUpdateEl = document.getElementById("lastUpdateTime");
        if (lastUpdateEl) {
            const now = new Date();
            lastUpdateEl.textContent = now.toLocaleString();
        }
    }

    // Завантаження даних та аналіз
    async function loadAndAnalyzeData() {
        console.log("Starting to load data for Predict module...");
        const items = await DBModule.loadData(CONFIG, CONFIG.STORAGE_KEYS.ITEMS);
        const charts = await DBModule.loadData(CONFIG, CONFIG.STORAGE_KEYS.CHARTS);
        const history = await DBModule.loadData(CONFIG, CONFIG.STORAGE_KEYS.HISTORY);

        if (items && charts && history) {
            console.log("Data successfully loaded from IndexedDB. Proceeding with analysis.");
            itemsData = items;
            globalAllChartsData = charts;
            globalAllHistoryData = history;
            PredictionModule.analyzeExistingData();
        } else {
            console.warn("One or more datasets not found in IndexedDB. Cannot perform predictions.");
            document.getElementById("trendsTableContainer").innerHTML = "<p>No cached trend data available.</p>";
            document.getElementById("predictionsTableContainer").innerHTML = "<p>No cached prediction data available.</p>";
            document.getElementById("blackMarketTableContainer").innerHTML = "<p>No cached black market data available.</p>";
        }
    }

    // Функція для ініціалізації вкладок
    function initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        // Зчитуємо останню активну вкладку з localStorage
        const activeTab = localStorage.getItem('activeTab') || 'trends';

        tabButtons.forEach(button => {
            const targetTab = button.getAttribute('data-tab');
            if (targetTab === activeTab) {
                button.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            }

            button.addEventListener('click', () => {
                const target = button.getAttribute('data-tab');

                // Видаляємо клас active з усіх кнопок
                tabButtons.forEach(btn => btn.classList.remove('active'));
                // Додаємо клас active до натиснутої кнопки
                button.classList.add('active');

                // Приховуємо всі контейнери
                tabContents.forEach(content => content.classList.remove('active'));
                // Показуємо цільовий контейнер
                document.getElementById(target).classList.add('active');

                // Зберігаємо активну вкладку в localStorage
                localStorage.setItem('activeTab', target);
            });
        });
    }

    // Ініціалізація при завантаженні сторінки
    document.addEventListener("DOMContentLoaded", async () => {
        const isPredictPage = document.body.getAttribute("data-page") === "predict";
        console.log(`Page type: ${isPredictPage ? "Predict" : "Other"}`);

        if (isPredictPage) {
            initializeTabs(); // Ініціалізуємо вкладки
            await loadAndAnalyzeData();

            // Додамо слухача для кнопки повернення на головну
            const backToMainBtn = document.getElementById("backToMainBtn");
            if (backToMainBtn) {
                backToMainBtn.addEventListener("click", () => {
                    window.location.href = "index.html"; // Замініть "index.html" на ваш основний файл
                });
            }
        } else {
            // Основний модуль продовжує свою роботу
            // (Ваш основний модуль уже повинен працювати з IndexedDB)
        }
    });

    // Додати слухач для кнопки Оновлення
    document.getElementById("updatePredictDataBtn")?.addEventListener("click", async () => {
        console.log("Update Predictions button clicked.");
        await loadAndAnalyzeData();
    });

    // Експортуємо функції до глобального контексту (за необхідності)
    window.initializeTabs = initializeTabs;
    window.loadAndAnalyzeData = loadAndAnalyzeData;

})(window);
