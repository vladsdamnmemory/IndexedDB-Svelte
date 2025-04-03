/**
 * Request for data
 * @param url request
 * @returns data
 */
export async function fetchData<T>(url: string): Promise<T[]> {
    const res = await fetch(url);

    if (res.ok) {
        return await res.json();
    }

    throw new Error();
}
