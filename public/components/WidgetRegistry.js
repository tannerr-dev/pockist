/**
 * WidgetRegistry - Defines all available homepage widgets.
 *
 * To add a new widget:
 * 1. Create your custom element (e.g., MyWidget.js)
 * 2. Import it somewhere so it registers with customElements.define
 * 3. Add an entry here
 */

export const WIDGET_REGISTRY = [
    {
        id: 'lists',
        tag: 'todo-list-widget',
        name: 'Lists',
        defaultEnabled: true,
        props: {},
    },
    {
        id: 'notes',
        tag: 'local-notes',
        name: 'Notes',
        defaultEnabled: false,
        props: {},
    },
    {
        id: 'weather',
        tag: 'weather-current',
        name: 'Weather',
        defaultEnabled: false,
        props: { clickable: true, 'show-city': true },
    },
];

/** Get default layout as a zone map */
export function getDefaultLayout() {
    const enabled = WIDGET_REGISTRY
        .filter(w => w.defaultEnabled)
        .map(w => w.id);
    return { main: enabled };
}

/** Find widget by ID */
export function getWidgetById(id) {
    return WIDGET_REGISTRY.find(w => w.id === id) || null;
}
