import {namesDict, categoryDict, setItemsData, setNamesDict, setCategoryDict} from '../store/global-data.js';
import {UTILSModule} from '../ustils/UTILSModule.js';
import {dataItems} from "../data/items.js";


const  API = {
    ITEMS: "https://raw.githubusercontent.com/broderickhyman/ao-bin-dumps/master/formatted/items.json",
    CHARTS: "https://europe.albion-online-data.com/api/v2/stats/Charts",
    HISTORY: "https://europe.albion-online-data.com/api/v2/stats/History"
}
const CONFIG = {
    LOCATIONS: ["Fort Sterling", "Martlock", "Thetford", "Lymhurst", "Black Market"],
    ITEMS_PER_CHUNK: 100,
    RETRY_DELAY: 60, // seconds
};
export const APIModule = (() => {
        async function fetchItems() {
            try {
                const response = await fetch(API.ITEMS);
                if (!response.ok) {
                    throw new Error(`Items API error: ${response.status}`);
                }
                let data = await response.json();
                data = data.map(it => {
                    const foundItem = dataItems.find(el => el.ItemID === it.UniqueName)
                    if(foundItem) {
                        return {
                            ...it,
                            ...foundItem
                        }
                    } else {
                        return it;
                    }
                });
                setItemsData(data)
                setNamesDict({})

                for (const item of data) {
                    const uid = item.UniqueName;
                    if (!uid) continue;
                    const locNames = item.LocalizedNames || {};
                    const enName = locNames["EN-US"] || item.LocalizationNameVariable || uid;
                    namesDict[uid] = enName;
                }
                console.log("Items data fetched successfully.");
                return true;
            } catch (err) {
                console.error("fetchItems error:", err);
                return false;
            }
        }

        async function fetchChartsDataByChunks(itemIds, dateFrom, dateTo, timeScale, progressEl, chunkIndexRef, totalChunksGlobal) {
            const allResults = [];
            const chunks = UTILSModule.chunkArray(itemIds, CONFIG.ITEMS_PER_CHUNK);

            for (let i = 0; i < chunks.length; i++) {
                const batch = chunks[i];
                const itemsParam = batch.join(",");
                const locParam = CONFIG.LOCATIONS.join(",");
                const url = `${API.CHARTS}/${itemsParam}.json?locations=${locParam}&date=${dateFrom}&end_date=${dateTo}&time-scale=${timeScale}`;

                while (true) {
                    try {
                        chunkIndexRef.current++;
                        progressEl.textContent = `Loading Charts chunk ${chunkIndexRef.current}/${totalChunksGlobal}...`;

                        const response = await fetch(url);
                        if (response.status === 429) {
                            await UTILSModule.countdown(CONFIG.RETRY_DELAY, progressEl, chunkIndexRef.current, totalChunksGlobal, "Rate limit (Charts)");
                            continue;
                        }
                        if (!response.ok) {
                            throw new Error(`Charts API error: ${response.status}`);
                        }

                        let data = await response.json();
                        data = data.map(it => {
                            const foundItem = dataItems.find(el => el.ItemID === it.item_id)
                            if(foundItem) {
                                return {
                                    ...it,
                                    ...foundItem
                                }
                            } else {
                                return it;
                            }
                        });
                        allResults.push(...data);
                        break;
                    } catch (err) {
                        console.error("Charts chunk error:", err);
                        await UTILSModule.countdown(CONFIG.RETRY_DELAY, progressEl, chunkIndexRef.current, totalChunksGlobal, "Error (Charts)");
                    }
                }
            }
            console.log("Charts data fetched successfully.");
            return allResults;
        }

        async function fetchHistoryDataByChunks(itemIds, dateFrom, dateTo, timeScale, progressEl, chunkIndexRef, totalChunksGlobal) {
            const allResults = [];
            const chunks = UTILSModule.chunkArray(itemIds, CONFIG.ITEMS_PER_CHUNK);

            for (let i = 0; i < chunks.length; i++) {
                const batch = chunks[i];
                const itemsParam = batch.join(",");
                const locParam = CONFIG.LOCATIONS.join(",");
                const url = `${API.HISTORY}/${itemsParam}.json?locations=${locParam}&date=${dateFrom}&end_date=${dateTo}&time-scale=${timeScale}`;

                while (true) {
                    try {
                        chunkIndexRef.current++;
                        progressEl.textContent = `Loading History chunk ${chunkIndexRef.current}/${totalChunksGlobal}...`;

                        const response = await fetch(url);
                        if (response.status === 429) {
                            await UTILSModule.countdown(CONFIG.RETRY_DELAY, progressEl, chunkIndexRef.current, totalChunksGlobal, "Rate limit (History)");
                            continue;
                        }
                        if (!response.ok) {
                            throw new Error(`History API error: ${response.status}`);
                        }

                        let data = await response.json();
                        data = data.map(it => {
                            const foundItem = dataItems.find(el => el.ItemID === it.item_id)
                            if(foundItem) {
                                return {
                                    ...it,
                                    ...foundItem
                                }
                            } else {
                                return it;
                            }
                        });

                        allResults.push(...data);
                        break;
                    } catch (err) {
                        console.error("History chunk error:", err);
                        await UTILSModule.countdown(CONFIG.RETRY_DELAY, progressEl, chunkIndexRef.current, totalChunksGlobal, "Error (History)");
                    }
                }
            }
            console.log("History data fetched successfully.");
            return allResults;
        }


    return {
        fetchHistoryDataByChunks,
        fetchChartsDataByChunks,
        fetchItems,
    };
})();
