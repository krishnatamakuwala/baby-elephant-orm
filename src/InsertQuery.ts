import { BaseQuery, IPreparedQuery, IQueryParams } from "./BaseQuery";

export type InsertQueryParams = Pick<IQueryParams, "tableName" | "insertColumns"> & { values: unknown[] | unknown[][] }

export class InsertQuery extends BaseQuery {
    private values: unknown[] | unknown[][];

    constructor(params: InsertQueryParams) {
        super(params);
        if (params.insertColumns && params.values) {
            if (Array.isArray(params.values[0])) {
                const rows = params.values as unknown[][];
                let misMatchColumn: number = 0;
                rows.map((row) => {
                    if (!params.insertColumns || !row || params.insertColumns.length !== row.length) {
                        misMatchColumn++;
                        return;
                    }
                });
                if (misMatchColumn > 0) {
                    throw new Error("INSERT requires columns and matching values.");
                }
            }
            else {
                if (params.insertColumns.length !== params.values.length) {
                    throw new Error("INSERT requires columns and matching values.");
                }
            }
        } else {
            throw new Error("INSERT requires columns and matching values.");
        }
        this.values = params.values;
    }

    generateQuery(): IPreparedQuery {
        const insertColumns = this.insertColumns!.join(", ");
        let insertPlaceholders = "";
        let values: unknown[] = [];
        if (Array.isArray(this.values[0])) {
            const rows = this.values as unknown[][];
            let valueCount = 0;
            insertPlaceholders = rows.map((row) => {
                return "(" + row.map(() => {
                    valueCount++;
                    return `$${valueCount}`
                }).join(", ") + ")";
            }).join(", ");
            values = this.values.flat();
        } else {
            insertPlaceholders = "(" + this.values.map((value, i) => `$${i + 1}`).join(", ") + ")";
            values = this.values;
        }
        return { query: `INSERT INTO ${this.tableName} (${insertColumns}) VALUES ${insertPlaceholders} RETURNING *;`, params: values };
    }
}