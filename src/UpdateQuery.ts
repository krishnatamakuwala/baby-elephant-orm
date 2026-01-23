import { BaseQuery, IPreparedQuery, IQueryParams, IUpdate } from "./BaseQuery";

export type UpdateQueryParams = Pick<IQueryParams, "tableName" | "conditions"> & { updates: IUpdate[] }

export class UpdateQuery extends BaseQuery {
    private updates: IUpdate[];

    constructor(params: UpdateQueryParams) {
        super(params);
        if (!params.updates || Object.keys(params.updates).length === 0) {
            throw new Error("UPDATE requires at least one column-value pair in updates.");
        }
        this.updates = params.updates.filter((update) => !(update.updateIfNull === false && update.columnValue == null));
    }

    generateQuery(): IPreparedQuery {
        const whereClause: IPreparedQuery = this.getWhereClause();
        let i = whereClause.params.length;
        const updatePairs = this.updates.map((update) => {
                i++;
                whereClause.params.push(update.columnValue);
                return `${update.columnName} = $${i}`;
            }).join(", ");
        return { query: `UPDATE ${this.tableName} SET ${updatePairs} ${whereClause.query} ${this.getJoinClause()} RETURNING *;`, params: whereClause.params };
    }
}