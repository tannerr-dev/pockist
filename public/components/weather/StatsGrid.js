export class StatsGrid extends HTMLElement {
    constructor() {
        super();
        this._humidity = null;
        this._precipitation = null;
        this._windSpeed = null;
        this._compact = false;
    }

    static get observedAttributes() {
        return ['humidity', 'precipitation', 'wind-speed', 'compact'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            switch (name) {
                case 'humidity':
                    this._humidity = parseFloat(newValue);
                    break;
                case 'precipitation':
                    this._precipitation = parseFloat(newValue);
                    break;
                case 'wind-speed':
                    this._windSpeed = parseFloat(newValue);
                    break;
                case 'compact':
                    this._compact = newValue !== null;
                    break;
            }
            this.render();
        }
    }

    connectedCallback() {
        this.classList.add('stats-grid');
        if (this._compact) {
            this.classList.add('compact');
        }
        this.render();
    }

    render() {
        const stats = [
            {
                label: 'Humidity',
                value: this._humidity !== null ? `${this._humidity}%` : '--',
                show: true
            },
            {
                label: 'Rain',
                value: this._precipitation !== null ? `${this._precipitation} mm` : '--',
                show: !this._compact || this._precipitation > 0 // Show rain only if compact and raining
            },
            {
                label: 'Wind',
                value: this._windSpeed !== null ? `${this._windSpeed} m/s` : '--',
                show: true
            }
        ];

        const visibleStats = stats.filter(stat => stat.show);
        
        this.innerHTML = `
            <div class="stats-container">
                ${visibleStats.map(stat => `
                    <div class="stat-item">
                        <span class="stat-label">${stat.label}</span>
                        <span class="stat-value">${stat.value}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Public API for programmatic updates
    setStats(humidity, precipitation, windSpeed) {
        this._humidity = humidity;
        this._precipitation = precipitation;
        this._windSpeed = windSpeed;
        this.render();
    }

    setCompact(compact) {
        this._compact = compact;
        if (compact) {
            this.classList.add('compact');
        } else {
            this.classList.remove('compact');
        }
        this.render();
    }
}

customElements.define('stats-grid', StatsGrid);