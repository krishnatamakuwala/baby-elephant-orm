import { BaseQuery, IPreparedQuery, IQueryParams } from "./BaseQuery";

export type DeleteQueryParams =  Pick<IQueryParams, "tableName" | "conditions">

export class DeleteQuery extends BaseQuery {
    constructor(params: DeleteQueryParams) {
        super(params);
    }
    
    generateQuery(): IPreparedQuery {
        const whereClause: IPreparedQuery = this.getWhereClause();
        return { query: `DELETE FROM ${this.tableName} ${whereClause.query} ${this.getJoinClause()} RETURNING *;`, params: whereClause.params };
    }
}