import {UTILSModule} from '../../ustils/UTILSModule.js';
import { itemsData, setItemsData} from "../../store/global-data.js";
import {DBModule} from "../../services/DBModule.js";
import {blackMarketCategories} from "../../data/categories.js";

(function(window) {
    // albion_prediction_module_extended.js


    const CONFIG = {
        LOCATIONS: ["Fort Sterling", "Martlock", "Thetford", "Lymhurst", "Black Market"],
        STORAGE_KEYS: {
            ITEMS: "itemsData",
            CHARTS: "chartsData",
            HISTORY: "historyData",
        },
        INDEXEDDB: {
            DB_NAME: "AlbionMarketDB",
            DB_VERSION: 2,
            STORE_NAME: "dataStore",
        }
    };

    let globalAllChartsData = [];
    let globalAllHistoryData = [];
    let carleonBlackMarketData = [];
    let trends = {};
    let predictions = {};
    let blackMarketAnalysis = {};

    document.addEventListener("DOMContentLoaded", async () => {
        const isPredictPage = document.body.getAttribute("data-page") === "predict";
        if (isPredictPage) {
            initializeTabs();
            await loadAndAnalyzeData();
        }
    });

    const backToMainBtn = document.getElementById("backToMainBtn");
    if (backToMainBtn) {
        backToMainBtn.addEventListener("click", () => {
            window.location.href = "index.html";
        });
    }

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
                const avgSellCount = sellCounts.length > 0
                    ? sellCounts.reduce((sum, count) => sum + count, 0) / sellCounts.length
                    : 0;
                predictions[itemId] = {
                    avgSellCount,
                    highDemand: avgSellCount > 100
                };
            });
            return predictions;
        },

        analyzeCarleonBlackMarket(blackMarketDataArray) {
            const analysisResult = {};
            // Simple logic: find items that are priced below the average of other cities (indicating potential profit)
            // console.log(blackMarketDataArray, 'blackMarketDataArray')
            blackMarketDataArray.forEach(entry => {
                const itemId = entry?.item_id ?? "Unknown";
                const cityAvgPrice = entry?.city_avg_price ?? 0;
                const carleonPrice = entry?.carleon_price ?? 0;
                // If Carleon’s black market price is low compared to average city price, mark as opportunity
                analysisResult[itemId] = {
                    cityAvgPrice,
                    carleonPrice,
                    profitable: carleonPrice < cityAvgPrice * 0.9 // 10% cheaper than average
                };
            });

            return analysisResult;
        },

        // Identify potential black market items from combined data
        identifyPotentialBlackMarketItems() {
            const potentialItems = {};
            for (const [itemId, trendData] of Object.entries(trends)) {
                const prediction = predictions[itemId];
                const blackMarketEntry = blackMarketAnalysis[itemId];
                if (prediction && blackMarketEntry) {
                    // Criteria example: upward trend, high demand, and any profitable signal
                    if (
                        blackMarketEntry.profitable
                    ) {
                        potentialItems[itemId] = {
                            trend: trendData.trend,
                            direction: trendData.direction,
                            avgSellCount: prediction.avgSellCount,
                            highDemand: prediction.highDemand,
                            profitable: blackMarketEntry.profitable
                        };
                    }
                }
            }
            return potentialItems;
        },

        analyzeExistingData() {
            trends = this.analyzeTrends(globalAllChartsData);
            predictions = this.predictDemand(globalAllHistoryData);
            // New analysis step for Carleon black market data
            blackMarketAnalysis = this.analyzeCarleonBlackMarket(carleonBlackMarketData);

            const potentialBlackMarketItems = this.identifyPotentialBlackMarketItems();
            TableRenderer.renderTrendsTable(trends);
            TableRenderer.renderPredictionsTable(predictions);
            TableRenderer.renderBlackMarketAnalysisTable(blackMarketAnalysis);
            TableRenderer.renderPotentialBlackMarketTable(potentialBlackMarketItems);
        }
    };

    // Extended renderer to show Carleon black market analysis
    const TableRenderer = {
        renderTrendsTable(trendsObj) {
            const tableContainer = document.getElementById("trendsTableContainer");
            if (!tableContainer) return;

            let html = "<table><thead><tr><th>Item ID</th><th>Trend</th><th>Direction</th></tr></thead><tbody>";
            Object.entries(trendsObj).forEach(([itemId, data]) => {
                html += `<tr><td>${itemId}</td><td>${UTILSModule.formatNumber(data.trend)}</td><td>${data.direction}</td></tr>`;
            });
            html += "</tbody></table>";
            tableContainer.innerHTML = html;
        },

        renderPredictionsTable(predictionsObj) {
            const tableContainer = document.getElementById("predictionsTableContainer");
            if (!tableContainer) return;

            let html = "<table><thead><tr><th>Item ID</th><th>Avg Sell Count</th><th>High Demand</th></tr></thead><tbody>";
            Object.entries(predictionsObj).forEach(([itemId, data]) => {
                html += `<tr><td>${itemId}</td><td>${UTILSModule.formatNumber(data.avgSellCount)}</td><td>${data.highDemand ? "Yes" : "No"}</td></tr>`;
            });
            html += "</tbody></table>";

            tableContainer.innerHTML = html;
        },

        // New table for black market analysis in Carleon
        renderBlackMarketAnalysisTable(analysisObj) {
            const tableContainer = document.getElementById("carleonAnalysisTableContainer");
            if (!tableContainer) return;
            let html = "<table><thead><tr><th>Item ID</th><th>City Avg Price</th><th>Carleon Price</th><th>Profitable?</th></tr></thead><tbody>";
            if (Object.keys(analysisObj).length === 0) {
                html += "<tr><td colspan='4'>No Carleon black market data found.</td></tr>";
            } else {
                Object.entries(analysisObj).forEach(([itemId, data]) => {
                    html += `<tr>
                                <td>${itemId}</td>
                                <td>${UTILSModule.formatNumber(data.cityAvgPrice)}</td>
                                <td>${UTILSModule.formatNumber(data.carleonPrice)}</td>
                                <td>${!data.profitable ? "Yes" : "No"}</td>
                             </tr>`;
                });
            }
            html += "</tbody></table>";
            tableContainer.innerHTML = html;
        },

        renderPotentialBlackMarketTable(potentialItems) {
            const tableContainer = document.getElementById("blackMarketTableContainer");
            if (!tableContainer) return;
            let html = "<table><thead><tr><th>Item ID</th><th>Trend</th><th>Direction</th><th>Avg Sell Count</th><th>High Demand</th><th>Profitable?</th></tr></thead><tbody>";
            if (Object.keys(potentialItems).length === 0) {
                html += "<tr><td colspan='6'>No potential black market items found.</td></tr>";
            } else {
                Object.entries(potentialItems).forEach(([itemId, data]) => {
                    html += `<tr>
                                <td>${itemId}</td>
                                <td>${UTILSModule.formatNumber(data.trend)}</td>
                                <td>${data.direction}</td>
                                <td>${UTILSModule.formatNumber(data.avgSellCount)}</td>
                                <td>${data.highDemand ? "Yes" : "No"}</td>
                                <td>${!data.profitable ? "Yes" : "No"}</td>
                             </tr>`;
                });
            }
            html += "</tbody></table>";
            tableContainer.innerHTML = html;
        }
    };

    // Функція для ініціалізації вкладок
    function initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        // Зчитуємо останню активну вкладку з localStorage
        const activeTab = 'trends';

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


    // Load data and perform extended analysis
    async function loadAndAnalyzeData() {
        console.log("Starting to load data including Carleon black market...");
        const db = await DBModule.openDatabase(CONFIG);

        const transaction = db.transaction(["dataStore"], "readonly");
        const store = transaction.objectStore("dataStore");

        const getItems = store.get(CONFIG.STORAGE_KEYS.ITEMS);
        const getCharts = store.get(CONFIG.STORAGE_KEYS.CHARTS);
        const getHistory = store.get(CONFIG.STORAGE_KEYS.HISTORY);

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                setItemsData(getItems.result?.value)
                globalAllChartsData = getCharts.result?.value.filter(el => blackMarketCategories.includes(el.Category));
                globalAllHistoryData = getHistory.result?.value.filter(el => {
                    console.log(el.Category)
                    return blackMarketCategories.includes(el.Category)
                });

                const groupedData = globalAllHistoryData.reduce((acc, item) => {
                    const { item_id, location, data } = item;

                    if (!item_id) {
                        console.warn("Об'єкт без itemTypeId:", item);
                        return acc;
                    }

                    if (!acc[item_id]) {
                        acc[item_id] = {
                            nonBlackMarket: [],
                            blackMarket: []
                        };
                    }

                    if (typeof location === "string" && location.trim().toLowerCase() === "black market".toLowerCase()) {
                        acc[item_id].blackMarket.push(...data);
                    } else {
                        acc[item_id].nonBlackMarket.push(...data);
                    }

                    return acc;
                }, {});


                const mappedData = Object.keys(groupedData).filter(item_id => {
                    const { nonBlackMarket, blackMarket } = groupedData[item_id];
                    return blackMarket.length > 0 && nonBlackMarket.length > 0;
                }).map(item_id => {
                    const { nonBlackMarket, blackMarket } = groupedData[item_id];

                    // Обчислення city_avg_price як зваженого середнього по всіх не Black Market локаціях
                    const cityAvgPrice = calculateWeightedAverage(nonBlackMarket);
                    // Визначення carleon_price як останнього averagePrice у Black Market
                    let carleonPrice = 0;
                    if (blackMarket.length > 0) {
                        const latestRecord = blackMarket[blackMarket.length - 1];
                        carleonPrice = latestRecord.avg_price || 0;
                    }

                    return {
                        item_id,
                        city_avg_price: cityAvgPrice,
                        carleon_price: carleonPrice,
                    };
                });


                carleonBlackMarketData = mappedData

                if (itemsData && globalAllChartsData && globalAllHistoryData) {
                    console.log("All datasets found in IndexedDB. Proceeding with extended analysis.");
                    PredictionModule.analyzeExistingData();
                } else {
                    console.warn("One or more datasets not found in IndexedDB. Cannot perform full predictions.");
                }
                resolve(true);
            };

            transaction.onerror = (event) => {
                console.error("IndexedDB transaction error:", event.target.errorCode);
                reject(event.target.errorCode);
            };

        });
    }

    function calculateWeightedAverage(arr) {
        let total = 0;
        let count = 0;
        arr.forEach(item => {
            const itemCount = item.item_count || 0;
            const averagePrice = item.avg_price || 0;
            total += averagePrice * itemCount;
            count += itemCount;

        });

        return count > 0 ? total / count : 0;
    }

// Перемапування даних

    window.loadAndAnalyzeData = loadAndAnalyzeData;
})(window);