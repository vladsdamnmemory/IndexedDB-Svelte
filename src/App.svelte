<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { DateRange, ItemData } from './types';
  import { type StoreName, STORES } from './db';
  import Chart from './components/Chart.svelte';
  import type { ReadableWorkerMessage, WorkerCommandMessage } from './workers/db.worker';

  type StoreFilters = {
    [key in StoreName]: {
      range: DateRange;
      dates: number[];
    }
  }

  const settings: StoreFilters = {};

  const dataForChart: Record<StoreName, ItemData[]> = {};

  STORES.forEach(storeName => {
    dataForChart[ storeName ] = [];
    settings[ storeName ] = {
      range: { start: 0, end: 0 },
      dates: [],
    };
  });

  let worker: Worker;

  let activeTab: StoreName = STORES[ 0 ];

  let isUpdating = false;

  let isInitialLoading = true;

  let errorMessage = '';

  // List of stores that have been already loaded from the worker
  const loadedStores: Set<StoreName> = new Set();

  $: disabled = !areValidDates(settings[ activeTab ].range.start, settings[ activeTab ].range.end);

  onMount(() => {
    initWorker();
  });

  onDestroy(() => {
    if (worker) {
      worker.postMessage({ type: 'terminate' });
    }
  });

  // Create and initialize worker
  function initWorker() {
    worker = new Worker(new URL('./workers/db.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener(
      'message',
      /**
       * Listens for messages from the worker
       * @param e - Message event
       */
      (e: MessageEvent<ReadableWorkerMessage>) => {
        switch (e.data.type) {
          case 'ready':
            extractTableData();
            break;

          // Data received from worker (temperature or precipitation)
          case 'data':
            const { range, dates, data, store } = e.data as ReadableWorkerMessage;

            if (range && dates && data) {
              settings[ store ] = {
                dates,
                data,
                range
              };

              dataForChart[ store ] = data;

              // Adds the store name to the list of loaded stores
              // This is used to indicate that the app is notified that a corresponding store is initially loaded
              loadedStores.add(store);

              isUpdating = false;
              isInitialLoading = !loadedStores.has(activeTab);

              console.warn('Loaded storage in App: ', store);
              console.warn(...loadedStores);
            }

            break;

          case 'error':
            console.error('Worker error:', e.data.error);
            errorMessage = e.data.error;
            break;

          default: {
            throw new Error('Unknown worker message type');
          }
        }
      }
    );
  }

  /**
   * Triggers the worker to get data
   */
  function extractTableData(prevTab?: string) {
    // Don't trigger fetching data when going back to the previously loaded store
    if (prevTab && prevTab !== activeTab && dataForChart[ activeTab ].length > 0) return;

    // Sets the loading flag state
    isUpdating = true;

    isInitialLoading = !loadedStores.has(activeTab);

    // Reset range if it's the same tab
    const start = prevTab === activeTab ? 0 : settings[ activeTab ].range.start;
    const end = prevTab === activeTab ? 0 : settings[ activeTab ].range.end;

    // Creates a range object
    const range: DateRange | undefined = areValidDates(start, end)
      ? { start, end } as DateRange
      : undefined;

    console.log(
      'Message to worker: request data within range',
      start,
      end,
      range
    );

    // Sends a message to the worker to fetch data
    worker.postMessage({
      type: 'get',
      store: activeTab,
      range,
    } as WorkerCommandMessage);
  }

  function areValidDates(...values: any[]): boolean {
    if (values.length === 0) return false;
    return values.every(value => typeof value === 'number' && !isNaN(value) && value > 0);
  }
</script>

<main>
  <header>
    <h1>Weather Service Archive</h1>
  </header>

  <div class="container">
    <aside class="sidebar">
      {#each STORES as store}
        <button
          class:active={activeTab === store}
          on:click={() => {
          const prevTab = activeTab;
          activeTab = store;
          extractTableData(prevTab);
          }}
        >
          {store.charAt(0).toUpperCase() + store.slice(1)}

          <!-- Update to default range -->
          {#if activeTab === store && dataForChart[store].length > 0}
            <div>🔄</div>
          {/if}

        </button>
      {/each}
    </aside>

    <div class="content">
      <div class="year-selector" class:disabled>
        <div class="select-group">
          <label>
            Start year:
            <select
              bind:value={settings[activeTab].range.start}
              {disabled}
              on:change={() => extractTableData()}
            >
              {#each settings[activeTab].dates as year}
                <option
                  value={year}
                  disabled={areValidDates(settings[activeTab].range.end) && year > settings[activeTab].range.end}
                >
                  {year}
                </option>
              {/each}
            </select>
          </label>
          <label>
            End year:
            <select
              bind:value={settings[activeTab].range.end}
              {disabled}
              on:change={() => extractTableData()}
            >
              {#each settings[activeTab].dates as year}
                <option
                  value={year}
                  disabled={areValidDates(settings[activeTab].range.start) && year < settings[activeTab].range.start}
                >
                  {year}
                </option>
              {/each}
            </select>
          </label>
        </div>
      </div>

      {#if errorMessage}
        <p class="error-message">{errorMessage}</p>
      {/if}

      <div class="chart-container">
        {#if isInitialLoading || isUpdating}
          <div class="initial-loading">
            <div class="loading-spinner"></div>
            <p>Reading data<span class="dots"></span></p>
            <p class="loading-description">This may take a few seconds</p>
          </div>
        {/if}

        <Chart data={dataForChart[activeTab]}/>

      </div>
    </div>
  </div>
</main>

<style>
  .error-message {
    background: linear-gradient(135deg, #ff4e50, var(--error-color));
    color: var(--important-text-color);;
    font-weight: bold;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 10px rgba(255, 78, 80, 0.4);
    display: inline-block;
    position: relative;
    animation: shake 0.3s ease-in-out;
  }

  .error-message::before {
    content: "⚠️ ";
    font-size: 1.2em;
  }

  @keyframes shake {
    0%, 100% {
      transform: translateX(0);
    }
    20%, 60% {
      transform: translateX(-5px);
    }
    40%, 80% {
      transform: translateX(5px);
    }
  }

  .container {
    display: flex;
    gap: 30px;
    min-height: 600px;
  }

  .sidebar {
    width: 230px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sidebar button {
    width: 100%;
    padding: 15px;
    text-align: left;
    border: none;
    border-radius: var(--border-radius);
    background: var(--background-light);
    cursor: pointer;
    transition: all var(--transition-normal);
  }

  .sidebar button.active {
    background: var(--primary-color);
    color: var(--background-white);
  }

  .sidebar button:hover:not(.active) {
    background: var(--border-color);
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .year-selector {
    background: var(--background-light);
    padding: var(--spacing-lg);
    border-radius: var(--border-radius);
  }

  .select-group {
    display: flex;
    gap: var(--spacing-lg);
    align-items: center;
  }

  .select-group label {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
    font-size: 14px;
    color: var(--text-muted);
  }

  .chart-container {
    background: var(--background-white);
    /* padding: var(--spacing-lg); */
    border-radius: var(--border-radius);
    box-shadow: var(--shadow-sm);
    /* flex: 1; */
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    transition: opacity var(--transition-fast);
    padding: var(--spacing-lg) 0;
  }

  /* Special styles for sidebar buttons */
  .sidebar button {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--border-radius);
    font-weight: var(--font-weight-normal);
    color: var(--text-muted);
    background: transparent;
    display: flex;
    justify-content: space-between;
  }

  .sidebar button:hover:not(.active) {
    background-color: rgba(33, 150, 243, 0.08);
    color: var(--text-color);
  }

  .sidebar button.active {
    background-color: var(--primary-color);
    color: var(--background-white);
    font-weight: var(--font-weight-medium);
  }

  /* For dark theme */
  @media (prefers-color-scheme: dark) {
    .sidebar button {
      color: var(--text-muted-lightest);
      background: transparent;
    }

    .sidebar button:hover:not(.active) {
      background-color: rgba(33, 150, 243, 0.15);
      color: var(--text-color);
    }

    .sidebar button.active {
      background-color: var(--primary-color);
      color: var(--background-white);
    }
  }

  .sidebar button:disabled,
  select:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .initial-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    padding: var(--spacing-xl);
    text-align: center;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    background-color: var(--background-white);
    opacity: 0.85;
  }

  .initial-loading p {
    margin: 0;
    color: var(--text-muted);
    font-size: 16px;
  }

  .loading-description {
    font-size: 14px !important;
    color: var(--text-muted-lighter) !important;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-light);
    border-top: 3px solid var(--primary-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  /* For dark theme */
  @media (prefers-color-scheme: dark) {
    .initial-loading p {
      color: var(--text-muted-lightest);
    }

    .loading-description {
      color: var(--text-muted-lighter) !important;
    }

    .loading-spinner {
      border-color: var(--border-dark);
      border-top-color: var(--primary-color);
    }
  }

  .year-selector.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .dots {
    display: inline-block;
    width: 24px;
    text-align: left;
  }

  .dots::after {
    content: '...';
    animation: dots 1.5s steps(4, end) infinite;
  }

  @keyframes dots {
    0%,
    20% {
      content: '.';
    }
    40% {
      content: '..';
    }
    60% {
      content: '...';
    }
    80%,
    100% {
      content: '';
    }
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {

    .chart-container,
    .year-selector {
      background-color: var(--dark-background);
    }

    .year-selector label {
      color: var(--text-muted-lightest);
    }
  }
</style>
