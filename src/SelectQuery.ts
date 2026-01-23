import { BaseQuery, IPreparedQuery, IQueryParams } from "./BaseQuery";

export type SelectQueryParams = Omit<IQueryParams, "insertColumns">

export class SelectQuery extends BaseQuery {
    constructor(params: SelectQueryParams) {
        params.columns = params.columns?.map((column) => {
            column.tableName = column.tableName ?? params.tableName;
            column.alias = column.alias ? `"${column.alias}"` : (`"${column.tableName}.${column.columnName}"` + (column.aggregateFunction ? `.${column.aggregateFunction}` : ""));
            return column;
        });
        super(params);
    }

    generateQuery(): IPreparedQuery {
        let selectColumns = "*";
        if (this.columns?.length) {
            selectColumns = this.columns.map((column) => {
                let columnName = "";
                if (column.aggregateFunction && Array.isArray(column.aggregateFunction)) {
                    let i = 1;
                    column.aggregateFunction.forEach((aggregateFunction) => {
                        columnName += `${aggregateFunction}(`;
                        i++;
                    });
                    columnName += `${column.tableName}.${column.columnName}`;
                    for (let index = 1; index < i; index++) {
                        columnName += ")";
                    }
                } else if (column.aggregateFunction) {
                    columnName = `${column.aggregateFunction}(${column.tableName}.${column.columnName})`
                } else {
                    columnName = `${column.tableName}.${column.columnName}`
                }
                // const columnName = column.aggregateFunction ? `${column.aggregateFunction}(${column.tableName}.${column.columnName})` : `${column.tableName}.${column.columnName}`;
                return `${columnName} as ${column.alias}`;
            }).join(", ");
        }

        const whereClause = this.getWhereClause();

        let limitClause = "", offsetClause = "", ordersClause = "";
        if (this.limit) {
            limitClause = `\nLIMIT ${this.limit}`;
        }
        if (this.offset) {
            offsetClause = `\nOFFSET ${this.offset}`;
        }
        if (this.orders && this.orders.length > 0) {
            ordersClause = "\nORDER BY " + this.orders.map((order) => {
                return `"${order.columnName}" ${order.direction}`;
            }).join(", ");
        }
        
        return { query: `SELECT\n${selectColumns}\nFROM ${this.tableName}${this.getJoinClause()} ${whereClause.query}${ordersClause}${limitClause}${offsetClause};`, params: whereClause.params };
    }
}