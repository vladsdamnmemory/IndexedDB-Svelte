/**
 * This worker creates a connection to the database and adds listener to the messages.
 * It can send messages to the main thread and receive messages back from there.
 */

import { type StoreName, WeatherDB } from '../db';
import { fetchData } from '../utils';
import type { DateRange, ItemData, RawDataItem } from '../types';

/**
 * Message sent to worker
 */
export type WorkerCommandMessage = {
  /** Command type */
  type: 'get' | 'terminate';
  /** Data store name */
  store: StoreName;
  /** Optional date range */
  range?: DateRange;
};

/**
 * Message sent from worker
 */
export type ReadableWorkerMessage = {
  type: 'ready' | 'data' | 'error';
  error?: string;
  data?: ItemData[];
  store?: StoreName;
  range?: DateRange;
  dates?: number[];
};

/**
 * Cache of loaded data by stores
 */
type LoadedStores = {
  [key in StoreName]: { range: DateRange, dates: number[] } | null;
};

/**
 * Cache of request counts by stores
 */
type RequestCount = {
  [key in StoreName]: number;
};

class WeatherWorker {
  private db: WeatherDB;
  private readonly loadedStores: LoadedStores;

  constructor() {
    this.db = new WeatherDB();
    this.loadedStores = {
      temperature: null,
      precipitation: null
    };
  }

  /**
   * Initializes the database and adds a message listener
   * @throws {Error} If database initialization failed
   */
  async init() {
    try {
      await this.db.init();

      // Stores the number of requests (in closure)
      const lastRequestIds: RequestCount = {
        temperature: 0,
        precipitation: 0
      };

      let requestAmount = 0;

      /**
       * Listens for messages from the main thread
       * @param e - Message event
       */
      self.addEventListener(
        'message',
        async (e: MessageEvent<WorkerCommandMessage>) => {
          const storeName = e.data.store;
          const eventType = e.data.type;

          // Current request id according to the store
          const requestId = ++lastRequestIds[ storeName ];

          // Current the very latest request amid all
          const absoluteRequestId = ++requestAmount;

          try {
            switch (eventType) {
              // Gets data from database
              case 'get': {
                if (!storeName) throw new Error('Store not specified');

                // Checks if the database is empty
                const isEmpty = await this.isDatabaseEmpty(storeName);

                // If a database is empty, and it's the first request, then load the corresponding file
                if (isEmpty) {
                  if (requestId === 1) {
                    console.log('Need to load the file');

                    // Gets data from a file
                    const fileData = await this.fetchServerData(storeName);

                    // Saves data to database
                    await this.saveToDatabase(storeName, fileData);
                  } else {
                    // If it's not the first request and the store is empty due to a stack occupation, return.
                    console.warn("Data not yet loaded to ", storeName);
                    return;
                  }
                }

                let rawData = [];

                // If the data is not loaded yet and it's the first request
                if (!this.loadedStores[ storeName ] && requestId === 1) {
                  console.log('Going to calculate the range and dates, save them in application');

                  // Gets fresh data from a database
                  rawData = await this.getFromDatabase(storeName);

                  // Calculates the year range
                  const range = this.calculateYearRange(rawData);

                  // Creates an array of dates
                  const dates = Array.from(
                    { length: range.end - range.start + 1 },
                    (_, i) => range.start + i
                  );

                  // Saves range and dates in application for the respective store
                  // It also means that the data is loaded and ready to use
                  this.loadedStores[ storeName ] = { range, dates };
                }

                // Fist store related request always passes through
                if (requestId > 1) {
                  if (requestId !== lastRequestIds[ storeName ]) return;

                  // If the request is not absolutely the last one, then return
                  if (absoluteRequestId !== requestAmount) return;

                  // Gets data from database
                  rawData = await this.getFromDatabase(storeName, e.data.range);
                } else {
                  // First successful request
                }

                // Aggregates data by years
                const data = this.aggregateByYear(rawData);

                // Sends data to the main thread
                self.postMessage({
                  type: 'data',
                  store: storeName,
                  data,
                  range: e.data.range ?? this.loadedStores[ storeName ]?.range,
                  dates: this.loadedStores[ storeName ]?.dates
                } as ReadableWorkerMessage);


                console.log(
                  '%c🔥Worker response: Data for a chart',
                  'color: orange; font-size: 20px; font-weight: bold; text-shadow: 2px 2px black;',
                  {
                    type: 'data',
                    store: storeName,
                    data,
                    range: e.data.range ?? this.loadedStores[ storeName ]?.range,
                    dates: this.loadedStores[ storeName ]?.dates
                  } as ReadableWorkerMessage);

                break;
              }

              // Closes the database and worker
              case 'terminate': {
                this.closeDatabase();
                console.log('Worker is shutting down...');
                self.close();
                break;
              }

              // Handles unknown message types
              default: {
                throw new Error('Unknown message type');
              }
            }
          } catch (error) {
            lastRequestIds[ storeName ] = 0;
            requestAmount = 0;
            self.postMessage({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            } as ReadableWorkerMessage);
          }
        });

      console.log('Database initialized');

      // Sends a message that the worker is ready (database initialized)
      self.postMessage({
        type: 'ready'
      } as ReadableWorkerMessage);

    } catch (error) {
      console.error('Database initialization failed:', error);
    }
  }

  /**
   * Closes the database
   */
  private closeDatabase() {
    this.db.close();
    console.log('Database closed');
  }

  /**
   * Saves data to database
   * @param storeName - Name of the store ('temperature' | 'precipitation')
   * @param data - Array of data to save
   * @returns Promise<void>
   */
  private async saveToDatabase(storeName: StoreName, data: RawDataItem[]): Promise<void> {
    return this.db.saveData(storeName, data);
  }

  /**
   * Gets data from database
   * @param storeName - Name of the store ('temperature' | 'precipitation')
   * @param range - Optional date range for filtering
   * @returns Promise<ItemData[]> Array of data from a database
   */
  private async getFromDatabase(storeName: StoreName, range?: DateRange): Promise<ItemData[]> {
    return this.db.getData(storeName, range);
  }

  /**
   * Loads data from server
   * @param storeName - Name of the store ('temperature' | 'precipitation')
   * @returns Promise<RawDataItem[]> Array of raw data
   */
  private async fetchServerData(storeName: StoreName): Promise<RawDataItem[]> {
    return fetchData<RawDataItem>(`/data/${ storeName }.json`);
  }

  /**
   * Calculates the year range from an array of data
   * @param data - Array of data to analyze
   * @returns DateRange Object with start and end year
   * @throws {Error} If the array of data is empty
   */
  private calculateYearRange(data: ItemData[]): DateRange {
    if (data.length === 0) {
      throw new Error('No data available');
    }

    return data.reduce(
      (acc, item) => {
        const year = parseInt(item.date);

        return {
          start: year < acc.start ? year : acc.start,
          end: year > acc.end ? year : acc.end
        };
      },
      { start: Infinity, end: -Infinity }
    );
  }

  /**
   * Checks if the database is empty
   * @param storeName - Name of the store ('temperature' | 'precipitation')
   * @returns Promise<boolean> True if the database is empty, false otherwise
   */
  private async isDatabaseEmpty(storeName: StoreName): Promise<boolean> {
    return this.db.isDatabaseEmpty(storeName);
  }

  /**
   * Aggregates data by years, calculating the average value
   * @param data - Array of data to aggregate
   * @returns ItemData[] Array with averaged yearly values
   */
  private aggregateByYear(data: ItemData[]): ItemData[] {
    const yearlyData = new Map<number, { sum: number; count: number }>();

    // Groups data by years and accumulates sums
    data.forEach(item => {
      const year = parseInt(item.date);
      const current = yearlyData.get(year) || { sum: 0, count: 0 };
      yearlyData.set(year, {
        sum: current.sum + item.value,
        count: current.count + 1
      });
    });

    // Converts to an array with averaged values
    return Array.from(yearlyData.entries())
      .map(([ year, { sum, count } ]) => ({
        date: `${ year }`,
        value: Math.round(sum / count * 100) / 100
      }));
  }

}

const weatherWorker = new WeatherWorker();
await weatherWorker.init();
