export const FILTER_FIELDS = ['gender', 'species', 'tags'];
export const filterValue = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export function normalizeRegistrarFilters(value = {}) {
    return Object.fromEntries(FILTER_FIELDS.map(field => [field, [...new Set((Array.isArray(value?.[field]) ? value[field] : []).map(filterValue).filter(Boolean))]]));
}
export function registrarFilterOptions(items, filters) {
    return Object.fromEntries(FILTER_FIELDS.map(field => {
        const values = new Map();
        for (const item of items.filter(item => item.kind === 'character')) {
            for (const raw of field === 'tags' ? (Array.isArray(item.tags) ? item.tags : []) : [item[field]]) {
                const key = filterValue(raw);
                if (key && !values.has(key)) values.set(key, raw.trim());
            }
        }
        for (const key of normalizeRegistrarFilters(filters)[field]) if (!values.has(key)) values.set(key, key);
        return [field, [...values].sort((a, b) => a[1].localeCompare(b[1]))];
    }));
}
export function hiddenByRegistrarFilters(item, filters) {
    if (item.kind !== 'character') return false;
    const normalized = normalizeRegistrarFilters(filters);
    return FILTER_FIELDS.some(field => (field === 'tags' ? (Array.isArray(item.tags) ? item.tags : []) : [item[field]])
        .some(value => normalized[field].includes(filterValue(value))));
}
