import { BaseQuery, IPreparedQuery, IQueryParams } from "./BaseQuery";

export type SelectQueryParams = Omit<IQueryParams, "insertColumns">

export class SelectQuery extends BaseQuery {
    constructor(params: SelectQueryParams) {
        params.columns = params.columns?.map((column) => {
            column.tableSchema = column.tableSchema ?? params.tableSchema;
            column.alias = column.alias ? `"${column.alias}"` : (`"${column.tableSchema.schemaName ? column.tableSchema.schemaName + "." + column.tableSchema.tableName : column.tableSchema.tableName}.${column.columnName}"` + (column.aggregateFunction ? `.${column.aggregateFunction}` : ""));
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
                    columnName += `"${column.tableSchema?.schemaName ? column.tableSchema.schemaName + "." + column.tableSchema.tableName : column.tableSchema?.tableName}".${column.columnName}`;
                    for (let index = 1; index < i; index++) {
                        columnName += ")";
                    }
                } else if (column.aggregateFunction) {
                    columnName = `${column.aggregateFunction}("${column.tableSchema?.schemaName ? column.tableSchema.schemaName + "." + column.tableSchema.tableName : column.tableSchema?.tableName}".${column.columnName})`
                } else {
                    columnName = `"${column.tableSchema?.schemaName ? column.tableSchema.schemaName + "." + column.tableSchema.tableName : column.tableSchema?.tableName}".${column.columnName}`
                }
                return `${columnName} AS ${column.alias}`;
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
        
        return { query: `SELECT\n${selectColumns}\nFROM ${this.tableSchema.schemaName ? this.tableSchema.schemaName + "." + this.tableSchema.tableName : this.tableSchema.tableName} AS "${this.tableSchema.schemaName ? this.tableSchema.schemaName + "." + this.tableSchema.tableName : this.tableSchema.tableName}" ${this.getJoinClause()} ${whereClause.query}${ordersClause}${limitClause}${offsetClause};`, params: whereClause.params };
    }
}