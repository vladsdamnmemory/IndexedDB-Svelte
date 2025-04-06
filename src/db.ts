import type { DateRange, ItemData, RawDataItem } from "./types";

// Constants for database operations

const DB_NAME = 'weather_db';

const DB_VERSION = 1;

export const STORES = [ 'temperature', 'precipitation' ] as const;

export type StoreName = typeof STORES[number];

// Class for working with IndexedDB

export class WeatherDB {
  /**
   * The database instance
   */
  private db: IDBDatabase | null = null;

  /**
   * Initializes the database
   * @throws {Error} If the database is not initialized
   * @returns {Promise<void>}
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result as IDBDatabase;
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        STORES.forEach((storeName: StoreName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'date' });
          }
        });
      };
    });
  }

  /**
   * Gets data from the database
   * @param store - The store to get the data from
   * @param range - The range of data to get
   * @throws {Error} If the database is not initialized
   * @returns {Promise<ItemData[]>} The data from the database
   */
  async getData(store: StoreName, range?: DateRange): Promise<ItemData[]> {
    if (!this.db) throw new Error('Database is not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = range
        ? objectStore.getAll(IDBKeyRange.bound(
          `${ range.start }-01-01`,
          `${ range.end }-12-31`
        ))
        : objectStore.getAll();

      request.onsuccess = () => {
        const data = request.result as ItemData[];
        const validData = data.filter((item: ItemData) => !isNaN(item.value));

        resolve(validData);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Saves data to the database
   * @param store - The store to save the data to
   * @param data - The data to save
   * @throws {Error} If the database is not initialized
   * @returns {Promise<void>}
   */
  async saveData(store: StoreName, data: RawDataItem[]): Promise<void> {
    if (!this.db) throw new Error('Database is not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);

      // Save each record separately
      data.forEach(item => {
        if (item && typeof item.v === 'number' && !isNaN(item.v)) {
          objectStore.put({
            date: item.t,  // Save full date
            value: Number(item.v)
          } as ItemData);
        }
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Checks if the database is empty
   * @param store - The store to check
   * @throws {Error} If the database is not initialized
   * @returns {Promise<boolean>} True if the database is empty, false otherwise
   */
  async isDatabaseEmpty(store: StoreName): Promise<boolean> {
    if (!this.db) throw new Error('Database is not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.count();

      request.onsuccess = () => resolve(request.result === 0);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Closes the database
   * @throws {Error} If the database is not initialized
   * @returns {void}
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
} 
