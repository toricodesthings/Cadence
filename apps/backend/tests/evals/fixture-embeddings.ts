export function createFixtureEmbedder(load: (texts: string[]) => Promise<number[][]>) {
    const batches = new Map<string, Promise<number[][]>>();
    return async (texts: string[]): Promise<number[][]> => {
        const vectors: number[][] = [];
        for (let i = 0; i < texts.length; i += 64) {
            const batch = texts.slice(i, i + 64);
            const key = JSON.stringify(batch);
            let pending = batches.get(key);
            if (!pending) {
                pending = load(batch)
                    .then((result) => {
                        if (result.length !== batch.length) throw new Error("Fixture embedding count mismatch");
                        return result;
                    })
                    .catch((error) => {
                        batches.delete(key);
                        throw error;
                    });
                batches.set(key, pending);
            }
            vectors.push(...(await pending).map((vector) => [...vector]));
        }
        return vectors;
    };
}
