/**
 * Carrega Chart.js uma vez (partilhado entre painéis RH).
 */

let chartJsPromise = null;

export function loadChartJs() {
  if (typeof window !== 'undefined' && window.Chart) {
    return Promise.resolve(window.Chart);
  }
  if (!chartJsPromise) {
    chartJsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-chartjs]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.Chart));
        existing.addEventListener('error', () => reject(new Error('Não foi possível carregar Chart.js')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      script.dataset.chartjs = 'true';
      script.onload = () => resolve(window.Chart);
      script.onerror = () => reject(new Error('Não foi possível carregar Chart.js'));
      document.head.appendChild(script);
    });
  }
  return chartJsPromise;
}
