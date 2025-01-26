import * as categories from "../data/categories.json"  with { type: "json" };

export let itemsData = [];
export let namesDict = {};
export let categoryDict = categories;

export function setItemsData(val) {
    itemsData = val;
}
export function setNamesDict(val) {
    namesDict = val;
}
export function setCategoryDict(val) {
    categoryDict = val;
}