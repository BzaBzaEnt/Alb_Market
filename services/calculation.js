// Функція для розрахунку потенційного прибутку і ROI
export function calculateProfitMetrics(buyPrice, sellPrice, buyCount, sellCount) {
    const potentialProfit = (sellPrice - buyPrice) * Math.min(buyCount, sellCount);
    const roi = ((sellPrice - buyPrice) / buyPrice) * 100;
    return {
        potentialProfit: Math.round(potentialProfit),
        roi: roi.toFixed(2)
    };
}

// Функція для групування даних Chart
export function groupChartsData(chartsData) {
    const grouped = {};
    for (const entry of chartsData) {
        const itemId = entry.item_id || "Unknown";
        const qual = entry.quality || 1;
        const loc = entry.location || "Unknown";

        const prices = entry.data?.prices_avg || [];
        const times = entry.data?.timestamps || [];
        if (prices.length === 0) continue;

        const lastPrice = prices[prices.length - 1];
        const lastStamp = times[times.length - 1] || "";

        const key = `${itemId}#q${qual}`;
        if (!grouped[key]) grouped[key] = {};
        grouped[key][loc] = { price: lastPrice, stamp: lastStamp };
    }
    return grouped;
}

// Функція для групування історичних даних
export function groupHistoryData(historyData) {
    const grouped = {};
    for (const entry of historyData) {
        const itemId = entry.item_id || "Unknown";
        const qual = entry.quality || 1;
        const loc = entry.location || "Unknown";

        const arr = entry.data || [];
        if (arr.length === 0) continue;

        const lastObj = arr[arr.length - 1];
        const key = `${itemId}#q${qual}`;
        if (!grouped[key]) grouped[key] = {};
        grouped[key][loc] = {
            itemCount: lastObj.item_count,
            avgPrice: lastObj.avg_price
        };
    }
    return grouped;
}

// Функція для створення рядків таблиці з історії та даних графіків
export function buildPairsWithHistory(chartsGrouped, historyGrouped, isSwapped, namesDict) {
    const keys = Object.keys(chartsGrouped);
    const rows = [];

    for (const k of keys) {
        const chartLocs = chartsGrouped[k];
        const histLocs = historyGrouped[k] || {};
        if (!chartLocs) continue;

        for (const cityA of Object.keys(chartLocs)) {
            for (const cityB of Object.keys(chartLocs)) {
                if (cityA === cityB || cityA === "Caerleon" || cityB === "Caerleon") continue;

                const chartA = chartLocs[cityA];
                const chartB = chartLocs[cityB];
                const histA = histLocs[cityA];
                const histB = histLocs[cityB];

                if (!chartA || !chartB || !histA || !histB) continue;
                if (histA.itemCount === 0 || histB.itemCount === 0) continue;

                let buyPrice = chartA.price;
                let sellPrice = chartB.price;
                let buyLoc = cityA;
                let sellLoc = cityB;

                if (isSwapped) {
                    [buyPrice, sellPrice] = [sellPrice, buyPrice];
                    [buyLoc, sellLoc] = [sellLoc, buyLoc];
                }

                if (buyPrice <= 0 || sellPrice <= 0) continue;

                const ratio = sellPrice / buyPrice;
                if (ratio < 0.5 || ratio > 5.0) continue;

                const [itemId, qualityStr] = k.split("#q");
                const quality = parseInt(qualityStr, 10) || 1;
                const profitPerItem = sellPrice - buyPrice;
                const amount5kk = profitPerItem > 0 ? Math.ceil(5000000 / profitPerItem) : "N/A";

                let smartCoef = 0;
                if (typeof amount5kk === "number") {
                    smartCoef = (ratio * (histA.itemCount + histB.itemCount)) / (amount5kk + 1);
                }

                const metrics = calculateProfitMetrics(buyPrice, sellPrice, histA.itemCount, histB.itemCount);

                rows.push({
                    select: "",
                    itemId: itemId,
                    item_name: namesDict[itemId] || itemId,
                    item_quality: quality,
                    location_buy: buyLoc,
                    buy_price: buyPrice,
                    location_sell: sellLoc,
                    sell_price: sellPrice,
                    coefficient: +ratio.toFixed(3),
                    "5kk_amount": amount5kk,
                    timestamp: chartA.stamp,
                    history_buyCount: histA.itemCount,
                    history_sellCount: histB.itemCount,
                    history_buyAvgPrice: histA.avgPrice,
                    history_sellAvgPrice: histB.avgPrice,
                    smart_coefficient: +smartCoef.toFixed(4),
                    potential_profit: metrics.potentialProfit,
                    roi: metrics.roi
                });
            }
        }
    }
    return rows.sort((a, b) => b.coefficient - a.coefficient);
}
