import {allCategories} from "../data/categories.js";

export let itemsData = [];
export let namesDict = {};
export let categoryDict = allCategories;

export function setItemsData(val) {
    itemsData = val;
}
export function setNamesDict(val) {
    namesDict = val;
}
export function setCategoryDict(val) {
    categoryDict = val;
}