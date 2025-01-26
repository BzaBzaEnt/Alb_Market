import {UTILSModule} from '../../ustils/UTILSModule.js';
import {itemsData, setItemsData} from "../../store/global-data.js";
import {DBModule} from "../../services/DBModule.js";
import {blackMarketCategories} from "../../data/categories.js";

(function (window) {
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
            window.location.href = "../../index.html";
        });
    }

    // Helper to map item_id -> item name
    // Adjust if your itemsData structure differs.
    function getItemNameById(itemId) {
        const item = itemsData.find(item => {
            return item.UniqueName === itemId
        });
        const locNames = item.LocalizedNames || {};

        return  locNames["EN-US"] || item.LocalizationNameVariable || uid;
    }

    window.selectRow = function selectRow(buttonElem) {
        const row = buttonElem.closest('tr');
        row.classList.toggle('selected-row');
    };

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
                    const firstPrice = prices[0] || 0;
                    const diffPercent = firstPrice ? ((trend / firstPrice) * 100).toFixed(2) : 0;

                    trends[itemId] = {
                        trend,
                        direction: trend > 0 ? "upward" : "downward",
                        diffPercent
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
                const maxSellCount = Math.max(...sellCounts, 0);

                predictions[itemId] = {
                    avgSellCount,
                    maxSellCount,
                    highDemand: avgSellCount > 100
                };
            });
            return predictions;
        },

        analyzeCarleonBlackMarket(blackMarketDataArray) {
            const analysisResult = {};
            blackMarketDataArray.forEach(entry => {
                const itemId = entry?.item_id ?? "Unknown";
                const cityAvgPrice = entry?.city_avg_price ?? 0;
                const carleonPrice = entry?.carleon_price ?? 0;
                const priceDifference = cityAvgPrice - carleonPrice;

                analysisResult[itemId] = {
                    cityAvgPrice,
                    carleonPrice,
                    profitable: carleonPrice < cityAvgPrice * 0.9,
                    priceDifference
                };
            });
            return analysisResult;
        },

        identifyPotentialBlackMarketItems() {
            const potentialItems = {};
            for (const [itemId, trendData] of Object.entries(trends)) {
                const prediction = predictions[itemId];
                const blackMarketEntry = blackMarketAnalysis[itemId];
                if (prediction && blackMarketEntry) {
                    if (blackMarketEntry.profitable) {
                        potentialItems[itemId] = {
                            trend: trendData.trend,
                            diffPercent: trendData.diffPercent,
                            direction: trendData.direction,
                            avgSellCount: prediction.avgSellCount,
                            maxSellCount: prediction.maxSellCount,
                            highDemand: prediction.highDemand,
                            profitable: blackMarketEntry.profitable,
                            priceDifference: blackMarketEntry.priceDifference
                        };
                    }
                }
            }
            return potentialItems;
        },

        analyzeExistingData() {
            trends = this.analyzeTrends(globalAllChartsData);
            predictions = this.predictDemand(globalAllHistoryData);
            blackMarketAnalysis = this.analyzeCarleonBlackMarket(carleonBlackMarketData);

            const potentialBlackMarketItems = this.identifyPotentialBlackMarketItems();
            TableRenderer.renderTrendsTable(trends);
            TableRenderer.renderPredictionsTable(predictions);
            TableRenderer.renderBlackMarketAnalysisTable(blackMarketAnalysis);
            TableRenderer.renderPotentialBlackMarketTable(potentialBlackMarketItems);
        }
    };

    const TableRenderer = {
        currentSort: {
            tableId: null,
            columnKey: null,
            direction: 1
        },

        sortTable(tableId, data, columnKey, renderFn) {
            if (
                this.currentSort.tableId === tableId &&
                this.currentSort.columnKey === columnKey
            ) {
                this.currentSort.direction *= -1;
            } else {
                this.currentSort.tableId = tableId;
                this.currentSort.columnKey = columnKey;
                this.currentSort.direction = 1;
            }

            data.sort((a, b) => {
                if (typeof a[1][columnKey] === "string") {
                    return (
                        a[1][columnKey].localeCompare(b[1][columnKey]) *
                        this.currentSort.direction
                    );
                } else {
                    return (a[1][columnKey] - b[1][columnKey]) * this.currentSort.direction;
                }
            });

            renderFn(Object.fromEntries(data));
        },

        renderTrendsTable(trendsObj) {
            const tableContainer = document.getElementById("trendsTableContainer");
            if (!tableContainer) return;

            const trendsArray = Object.entries(trendsObj);

            let html = `
                    <table>
                       <thead>
                          <tr>
                            <th></th>
                            <th class="sortable" data-column="itemName">Item Name</th>
                            <th class="sortable" data-column="trend">Trend</th>
                            <th class="sortable" data-column="direction">Direction</th>
                            <th class="sortable" data-column="diffPercent">% Change</th>
                          </tr>
                        </thead>
                      <tbody>
      `;

            trendsArray.forEach(([itemId, data]) => {
                const itemName = getItemNameById(itemId);
                html += `
          <tr>
            <td>
              <!-- Open link button -->
              <button
                class="open-link-button"
                onclick="window.open('https://albiononline2d.com/en/item/id/${itemId}','_blank')"
                title="Open AlbionOnline2D"
              >
                🔗
              </button>

              <!-- Select (star) button toggles row highlight -->
              <button
                class="select-button"
                onclick="selectRow(this)"
                title="Select Item"
              >
                ⭐
              </button>
            </td>
            <td>${itemName}</td>
            <td>${UTILSModule.formatNumber(data.trend)}</td>
            <td>${data.direction}</td>
            <td>${data.diffPercent ?? "0"}%</td>
          </tr>
        `;
            });

            html += `</tbody></table>`;
            tableContainer.innerHTML = html;

            const tableElem = tableContainer.querySelector("table");
            const headers = tableElem.querySelectorAll(".sortable");
            headers.forEach((header) => {
                const column = header.getAttribute("data-column");
                header.addEventListener("click", () => {
                    this.sortTable(
                        "trends",
                        [...trendsArray],
                        column === "itemId" ? 0 : column,
                        (sortedData) => {
                            this.renderTrendsTable(sortedData);
                        }
                    );
                });
            });
        },

        renderPredictionsTable(predictionsObj) {
            const tableContainer = document.getElementById("predictionsTableContainer");
            if (!tableContainer) return;

            const predictionsArray = Object.entries(predictionsObj);

            let html = `
                <table>
                    <thead>
                        <tr>
                            <th></th>
                            <th class="sortable" data-column="itemName">Item Name</th>
                            <th class="sortable" data-column="avgSellCount">Avg Sell Count</th>
                            <th class="sortable" data-column="maxSellCount">Max Sell Count</th>
                            <th class="sortable" data-column="highDemand">High Demand?</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            predictionsArray.forEach(([itemId, data]) => {
                const itemName = getItemNameById(itemId);
                html += `
                    <tr>
                        <td>
                            <button
                              class="open-link-button"
                              onclick="window.open('https://albiononline2d.com/en/item/id/${itemId}', '_blank')"
                              title="Open AlbionOnline2D"
                            >
                              🔗
                            </button>
                          <button
                            class="select-button"
                            onclick="selectRow(this)"
                            title="Select Item"
                          >
                            ⭐
                          </button>
                        </td>
                        <td>${itemName}</td>
                        <td>${UTILSModule.formatNumber(data.avgSellCount)}</td>
                        <td>${UTILSModule.formatNumber(data.maxSellCount)}</td>
                        <td>${data.highDemand ? "Yes" : "No"}</td>
                    </tr>
                `;
            });

            html += `</tbody></table>`;
            tableContainer.innerHTML = html;

            const tableElem = tableContainer.querySelector("table");
            const headers = tableElem.querySelectorAll(".sortable");
            headers.forEach((header) => {
                const column = header.getAttribute("data-column");
                header.addEventListener("click", () => {
                    this.sortTable(
                        "predictions",
                        [...predictionsArray],
                        column === "itemId" ? 0 : column,
                        (sortedData) => this.renderPredictionsTable(sortedData)
                    );
                });
            });
        },

        renderBlackMarketAnalysisTable(analysisObj) {
            const tableContainer = document.getElementById("carleonAnalysisTableContainer");
            if (!tableContainer) return;

            const analysisArray = Object.entries(analysisObj);

            let html = `
                <table>
                    <thead>
                        <tr>
                            <th></th>
                            <th class="sortable" data-column="itemName">Item Name</th>
                            <th class="sortable" data-column="cityAvgPrice">City Avg Price</th>
                            <th class="sortable" data-column="carleonPrice">Carleon Price</th>
                            <th class="sortable" data-column="profitable">Profitable?</th>
                            <th class="sortable" data-column="priceDifference">Price Diff</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if (analysisArray.length === 0) {
                html += "<tr><td colspan='6'>No Carleon black market data found.</td></tr>";
            } else {
                analysisArray.forEach(([itemId, data]) => {
                    const itemName = getItemNameById(itemId);
                    html += `
                        <tr>
                            <td>
                                <button
                                  class="open-link-button"
                                  onclick="window.open('https://albiononline2d.com/en/item/id/${itemId}', '_blank')"
                                  title="Open AlbionOnline2D"
                                >
                                  🔗
                                </button>
                                  <button
                                    class="select-button"
                                    onclick="selectRow(this)"
                                    title="Select Item"
                                  >
                                    ⭐
                                  </button>
                            </td>
                            <td>${itemName}</td>
                            <td>${UTILSModule.formatNumber(data.cityAvgPrice)}</td>
                            <td>${UTILSModule.formatNumber(data.carleonPrice)}</td>
                            <td>${data.profitable ? "Yes" : "No"}</td>
                            <td>${UTILSModule.formatNumber(data.priceDifference)}</td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table>`;
            tableContainer.innerHTML = html;

            const tableElem = tableContainer.querySelector("table");
            const headers = tableElem.querySelectorAll(".sortable");
            headers.forEach((header) => {
                const column = header.getAttribute("data-column");
                header.addEventListener("click", () => {
                    this.sortTable(
                        "analysis",
                        [...analysisArray],
                        column === "itemId" ? 0 : column,
                        (sortedData) => this.renderBlackMarketAnalysisTable(sortedData)
                    );
                });
            });
        },

        renderPotentialBlackMarketTable(potentialItems) {
            const tableContainer = document.getElementById("blackMarketTableContainer");
            if (!tableContainer) return;

            const potentialArray = Object.entries(potentialItems);

            let html = `
                <table>
                    <thead>
                        <tr>
                            <th></th>
                            <th class="sortable" data-column="itemName">Item Name</th>
                            <th class="sortable" data-column="trend">Trend</th>
                            <th class="sortable" data-column="direction">Direction</th>
                            <th class="sortable" data-column="diffPercent">% Change</th>
                            <th class="sortable" data-column="avgSellCount">Avg Sell Count</th>
                            <th class="sortable" data-column="maxSellCount">Max Sell Count</th>
                            <th class="sortable" data-column="highDemand">High Demand?</th>
                            <th class="sortable" data-column="profitable">Profitable?</th>
                            <th class="sortable" data-column="priceDifference">Price Diff</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if (potentialArray.length === 0) {
                html += "<tr><td colspan='10'>No potential black market items found.</td></tr>";
            } else {
                potentialArray.forEach(([itemId, data]) => {
                    const itemName = getItemNameById(itemId);
                    html += `
                        <tr>
                            <td>
                                <button
                                  class="open-link-button"
                                  onclick="window.open('https://albiononline2d.com/en/item/id/${itemId}', '_blank')"
                                  title="Open AlbionOnline2D"
                                >
                                  🔗
                                </button>
                               <button
                                class="select-button"
                                onclick="selectRow(this)"
                                title="Select Item"
                              >
                                ⭐
                              </button>
                            </td>
                            <td>${itemName}</td>
                            <td>${UTILSModule.formatNumber(data.trend)}</td>
                            <td>${data.direction}</td>
                            <td>${data.diffPercent ?? "0"}%</td>
                            <td>${UTILSModule.formatNumber(data.avgSellCount)}</td>
                            <td>${UTILSModule.formatNumber(data.maxSellCount)}</td>
                            <td>${data.highDemand ? "Yes" : "No"}</td>
                            <td>${data.profitable ? "Yes" : "No"}</td>
                            <td>${UTILSModule.formatNumber(data.priceDifference)}</td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table>`;
            tableContainer.innerHTML = html;

            const tableElem = tableContainer.querySelector("table");
            const headers = tableElem.querySelectorAll(".sortable");
            headers.forEach((header) => {
                const column = header.getAttribute("data-column");
                header.addEventListener("click", () => {
                    this.sortTable(
                        "potentialBlackMarket",
                        [...potentialArray],
                        column === "itemId" ? 0 : column,
                        (sortedData) => this.renderPotentialBlackMarketTable(sortedData)
                    );
                });
            });
        }
    };

    function initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        const activeTab = 'trends';

        tabButtons.forEach(button => {
            const targetTab = button.getAttribute('data-tab');
            if (targetTab === activeTab) {
                button.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            }

            button.addEventListener('click', () => {
                const target = button.getAttribute('data-tab');
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(target).classList.add('active');
                localStorage.setItem('activeTab', target);
            });
        });
    }

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
                setItemsData(getItems.result?.value);
                globalAllChartsData = getCharts.result?.value.filter(el => blackMarketCategories.includes(el.Category));
                globalAllHistoryData = getHistory.result?.value.filter(el => {
                    return blackMarketCategories.includes(el.Category);
                });

                const groupedData = globalAllHistoryData.reduce((acc, item) => {
                    const {item_id, location, data} = item;
                    if (!item_id) {
                        console.warn("Object missing item_id:", item);
                        return acc;
                    }
                    if (!acc[item_id]) {
                        acc[item_id] = {nonBlackMarket: [], blackMarket: []};
                    }
                    if (typeof location === "string" && location.trim().toLowerCase() === "black market") {
                        acc[item_id].blackMarket.push(...data);
                    } else {
                        acc[item_id].nonBlackMarket.push(...data);
                    }
                    return acc;
                }, {});

                const mappedData = Object.keys(groupedData)
                    .filter(item_id => {
                        const {nonBlackMarket, blackMarket} = groupedData[item_id];
                        return blackMarket.length > 0 && nonBlackMarket.length > 0;
                    })
                    .map(item_id => {
                        const {nonBlackMarket, blackMarket} = groupedData[item_id];
                        const cityAvgPrice = calculateWeightedAverage(nonBlackMarket);
                        let carleonPrice = 0;
                        if (blackMarket.length > 0) {
                            const latestRecord = blackMarket[blackMarket.length - 1];
                            carleonPrice = latestRecord.avg_price || 0;
                        }
                        return {
                            item_id,
                            city_avg_price: cityAvgPrice,
                            carleon_price: carleonPrice
                        };
                    });

                carleonBlackMarketData = mappedData;

                if (itemsData && globalAllChartsData && globalAllHistoryData) {
                    console.log("All datasets found in IndexedDB. Proceeding with extended analysis.");
                    PredictionModule.analyzeExistingData();
                } else {
                    console.warn("One or more datasets not found. Cannot perform full predictions.");
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

    window.loadAndAnalyzeData = loadAndAnalyzeData;
})(window);