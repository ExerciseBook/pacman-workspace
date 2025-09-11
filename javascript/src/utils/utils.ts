export function extractUniqueKeys(calc: any[]): string[] {
    const set = {} as any;
    calc.forEach((item) => {
        set[item.name] = 0;
    });
    return Object.keys(set);
}