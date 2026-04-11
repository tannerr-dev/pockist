export class TemperatureDisplay extends HTMLElement {
    constructor() {
        super();
        this._temperature = null;
        this._unit = 'C';
        this._size = 'normal'; // normal, large, small
    }

    static get observedAttributes() {
        return ['temperature', 'unit', 'size'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            switch (name) {
                case 'temperature':
                    this._temperature = parseFloat(newValue);
                    break;
                case 'unit':
                    this._unit = newValue || 'C';
                    break;
                case 'size':
                    this._size = newValue || 'normal';
                    break;
            }
            this.render();
        }
    }

    connectedCallback() {
        this.classList.add('temperature-display');
        this.render();
    }

    formatTemp(celsius) {
        if (celsius === null || celsius === undefined) return '--°';
        
        let value;
        if (this._unit === 'F') {
            value = (celsius * 9/5 + 32).toFixed(1);
        } else {
            value = celsius.toFixed(1);
        }
        return `${value}°${this._unit}`;
    }

    render() {
        const temp = this.formatTemp(this._temperature);
        const sizeClass = this._size !== 'normal' ? ` temp-${this._size}` : '';
        
        this.innerHTML = `
            <span class="temperature${sizeClass}">${temp}</span>
        `;
    }

    // Public API for programmatic updates
    setTemperature(celsius) {
        this._temperature = celsius;
        this.render();
    }

    setUnit(unit) {
        this._unit = unit;
        this.render();
    }

    setSize(size) {
        this._size = size;
        this.render();
    }
}

customElements.define('temperature-display', TemperatureDisplay);