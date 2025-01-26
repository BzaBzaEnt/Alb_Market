export const UTILSModule = (() => {

    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function countdown(seconds, progressEl, currentChunk, totalChunks, messagePrefix) {
        for (let s = seconds; s > 0; s--) {
            progressEl.textContent = `${messagePrefix} (chunk ${currentChunk}/${totalChunks}). Retry in ${s} sec...`;
            await this.sleep(1000);
        }
    }

    function formatDate(date) {
        return date.toISOString().slice(0, 16);
    }

    function isDateString(value) {
        return !isNaN(Date.parse(value));
    }

    function formatNumber(value) {
        if (typeof value === 'number') {
            return value.toLocaleString('en-US');
        }
        return value;
    }

    function chunkArray(array, size) {
        const result = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }

    return {
        sleep,
        countdown,
        formatDate,
        isDateString,
        formatNumber,
        chunkArray,
    };
})();
